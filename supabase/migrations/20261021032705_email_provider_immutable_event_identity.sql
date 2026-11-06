-- Provider callback identity is immutable. Both entry points use the same order:
-- provider-scoped advisory transaction lock -> delivery row -> event uniqueness.
-- Provider coordination also covers a callback arriving before provider_id binds.
CREATE OR REPLACE FUNCTION public.record_email_provider_event(p_event_id text,p_provider_id text,p_type text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.email_deliveries%ROWTYPE; v_event public.email_provider_events%ROWTYPE; v_status text;
BEGIN
  IF p_type NOT IN ('email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
    OR p_type IS NULL THEN RETURN false; END IF;
  IF p_event_id IS NULL OR p_event_id='' OR p_provider_id IS NULL OR p_provider_id='' THEN
    RAISE EXCEPTION 'Invalid provider event identity' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roomqc-email-provider:'||p_provider_id,0));
  -- Never insert/lock an event first and subsequently wait for a delivery:
  -- finish_email_delivery already owns that delivery when it replays events.
  SELECT * INTO v_row FROM public.email_deliveries WHERE provider_id=p_provider_id FOR UPDATE;
  -- Also retain callbacks arriving before the worker binds provider_id. A later
  -- finish replays this exact stored tuple, not fields from a different request.
  INSERT INTO public.email_provider_events(event_id,provider_id,event_type)
    VALUES(p_event_id,p_provider_id,p_type) ON CONFLICT(event_id) DO NOTHING;
  SELECT * INTO STRICT v_event FROM public.email_provider_events WHERE event_id=p_event_id;
  IF v_event.provider_id IS DISTINCT FROM p_provider_id OR v_event.event_type IS DISTINCT FROM p_type THEN
    RAISE EXCEPTION 'Provider event identity conflict' USING ERRCODE='PT409';
  END IF;
  IF v_row.id IS NULL THEN RETURN true; END IF;
  v_status := CASE v_event.event_type WHEN 'email.delivered' THEN 'delivered' WHEN 'email.delivery_delayed' THEN 'delayed'
    WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained'
    WHEN 'email.suppressed' THEN 'suppressed' ELSE 'failed' END;
  -- Preserve existing terminal precedence; exact replays must not rewrite rows.
  IF v_row.status=v_status THEN RETURN true; END IF;
  IF v_row.status IN ('bounced','complained','suppressed','failed') AND v_status NOT IN ('bounced','complained','suppressed') THEN RETURN true; END IF;
  IF v_row.status='complained' AND v_status<>'complained' THEN RETURN true; END IF;
  IF v_row.status='delivered' AND v_status='delayed' THEN RETURN true; END IF;
  UPDATE public.email_deliveries SET status=v_status,updated_at=now(),
    delivered_at=CASE WHEN v_status='delivered' THEN COALESCE(delivered_at,now()) ELSE delivered_at END WHERE id=v_row.id;
  IF v_status IN ('bounced','complained') THEN
    INSERT INTO public.suppressed_emails(email,reason) VALUES(v_row.recipient_email,CASE WHEN v_status='bounced' THEN 'bounce' ELSE 'complaint' END)
      ON CONFLICT(email) DO UPDATE SET reason=EXCLUDED.reason;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_email_provider_event(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_email_provider_event(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_email_delivery(
  p_id uuid,p_claim uuid,p_queue_id bigint,p_status text,p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL,p_retry_seconds integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.email_deliveries%ROWTYPE; v_event record;
BEGIN
  IF p_status NOT IN ('accepted','queued','failed','expired','suppressed') THEN RAISE EXCEPTION 'Invalid delivery result'; END IF;
  -- Coordinate an early callback before acquiring the delivery lock. Acquiring
  -- this only inside record_email_provider_event would invert the lock order.
  IF p_provider_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('roomqc-email-provider:'||p_provider_id,0));
  END IF;
  SELECT * INTO v_row FROM public.email_deliveries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_row.claim_id IS DISTINCT FROM p_claim OR v_row.status<>'processing' THEN RETURN false; END IF;
  UPDATE public.email_deliveries SET status=p_status,provider_id=COALESCE(p_provider_id,provider_id),
    error_code=p_error,claim_id=NULL,lease_until=NULL,updated_at=now(),
    accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE accepted_at END,
    next_attempt_at=now()+make_interval(secs=>greatest(1,least(p_retry_seconds,3600))) WHERE id=p_id;
  INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,error_message,metadata)
    VALUES(p_id::text,v_row.template_name,v_row.recipient_email,
      CASE WHEN p_status='accepted' THEN 'sent' WHEN p_status='suppressed' THEN 'suppressed' WHEN p_status='queued' THEN 'failed' ELSE 'dlq' END,
      p_error,jsonb_build_object('delivery_id',p_id,'attempt',v_row.attempts,'result',p_status));
  IF p_status='queued' THEN
    PERFORM pgmq.set_vt('transactional_emails',p_queue_id,greatest(1,least(p_retry_seconds,3600)));
  ELSE
    PERFORM pgmq.delete('transactional_emails',p_queue_id);
  END IF;
  IF p_status='accepted' THEN
    FOR v_event IN SELECT * FROM public.email_provider_events WHERE provider_id=p_provider_id ORDER BY created_at LOOP
      PERFORM public.record_email_provider_event(v_event.event_id,v_event.provider_id,v_event.event_type);
    END LOOP;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_email_delivery(uuid,uuid,bigint,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_email_delivery(uuid,uuid,bigint,text,text,text,integer) TO service_role;
