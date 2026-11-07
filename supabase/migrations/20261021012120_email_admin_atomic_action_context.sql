-- Edge preflight alone cannot fence later service-role work. Context is passed
-- only by the verified email-admin handler, then revalidated and locked here.
-- Preserve profile-based email authority; platform user_roles is NOT its source.
CREATE OR REPLACE FUNCTION private.lock_live_email_administrator(p_actor uuid,p_session uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE; v_session auth.sessions%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_session IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_EMAIL_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  -- Same authority prefix as registration/mutations; no locks across HTTP.
  SELECT * INTO v_auth FROM auth.users WHERE id=p_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'ACTIVE_EMAIL_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=p_actor FOR SHARE;
  IF NOT FOUND OR v_profile.is_super_admin IS DISTINCT FROM true
    OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR COALESCE(v_profile.account_locked,false) THEN
    RAISE EXCEPTION 'ACTIVE_EMAIL_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_session FROM auth.sessions WHERE id=p_session AND user_id=p_actor FOR SHARE;
  IF NOT FOUND OR (v_session.not_after IS NOT NULL AND v_session.not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ACTIVE_EMAIL_ADMIN_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_live_email_administrator(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.execute_email_admin_action(
  p_actor uuid,p_session uuid,p_action text,p_delivery_id uuid DEFAULT NULL,p_recipient text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_logs jsonb; v_state public.email_send_state%ROWTYPE; v_pending bigint; v_id uuid; v_retried boolean;
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN
    RAISE EXCEPTION 'EMAIL_ADMIN_SERVICE_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM private.lock_live_email_administrator(p_actor,p_session);
  IF p_action='status' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC,d.id DESC),'[]'::jsonb) INTO v_logs
    FROM (SELECT id,tenant_id,recipient_email,template_name,status,attempts,error_code,created_at,
      accepted_at,delivered_at,expires_at,provider_id FROM public.email_deliveries
      ORDER BY created_at DESC,id DESC LIMIT 100) d;
    SELECT * INTO v_state FROM public.email_send_state WHERE id=1;
    IF NOT FOUND THEN RAISE EXCEPTION 'EMAIL_STATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;
    SELECT count(*) INTO v_pending FROM public.email_deliveries WHERE status IN ('queued','processing');
    RETURN jsonb_build_object('logs',v_logs,'queue',jsonb_build_object('pending',v_pending,
      'retry_after_until',v_state.retry_after_until,'worker_lease_until',v_state.worker_lease_until));
  ELSIF p_action='retry' THEN
    -- Existing retry rules, queue publication and admin audit remain atomic.
    v_retried:=public.retry_roomqc_email(p_delivery_id,p_actor);
    RETURN jsonb_build_object('success',v_retried,'status','queued');
  ELSIF p_action='test' THEN
    -- The service handler still enforces provider-disabled and recipient
    -- allowlist BEFORE this RPC. No browser grants or arbitrary template/key.
    v_id:=public.enqueue_roomqc_email('test:'||p_actor::text||':'||
      floor(extract(epoch FROM clock_timestamp())/60)::bigint::text,NULL,p_recipient,
      'system_test',jsonb_build_object('name','quản trị viên'));
    RETURN jsonb_build_object('success',true,'id',v_id,'status','queued');
  END IF;
  RAISE EXCEPTION 'INVALID_EMAIL_ADMIN_ACTION' USING ERRCODE='22023';
END;
$fn$;
REVOKE ALL ON FUNCTION public.execute_email_admin_action(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.execute_email_admin_action(uuid,uuid,text,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
