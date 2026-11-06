-- Q02 notification source and in-app dispatcher. External channels stay queued
-- until their own delivery/unknown-outcome adapters are installed and verified.
CREATE TABLE private.booking_notification_events (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  command_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  room_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN('checkin','checkout')),
  room_number text NOT NULL,
  recipient_ids uuid[] NOT NULL,
  push_subscription_ids uuid[] NOT NULL,
  telegram_group_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,command_id),
  FOREIGN KEY(actor_id,command_id) REFERENCES private.booking_room_commands(actor_id,command_id)
);
CREATE INDEX booking_notification_events_scope ON private.booking_notification_events(tenant_id,hotel_id,created_at,id);
ALTER TABLE private.booking_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_notification_events FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.booking_notification_outbox (
  event_id uuid NOT NULL REFERENCES private.booking_notification_events(id),
  channel text NOT NULL CHECK(channel IN('in_app','push','telegram')),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered','no_recipients','obsolete')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error_code text CHECK(last_error_code IN('DELIVERY_FAILED')),
  recipient_count integer NOT NULL DEFAULT 0 CHECK(recipient_count>=0),
  completed_at timestamptz,
  PRIMARY KEY(event_id,channel),
  CHECK((state='pending' AND completed_at IS NULL) OR (state<>'pending' AND completed_at IS NOT NULL AND last_error_code IS NULL))
);
CREATE INDEX booking_notification_inapp_due ON private.booking_notification_outbox(available_at,event_id)
  WHERE state='pending' AND channel='in_app';
ALTER TABLE private.booking_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_notification_outbox FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.booking_notification_receipts (
  event_id uuid NOT NULL REFERENCES private.booking_notification_events(id),
  user_id uuid NOT NULL,
  notification_id uuid NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,user_id)
);
ALTER TABLE private.booking_notification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_notification_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.enqueue_booking_notification(p_event_id uuid,p_actor_id uuid,p_command_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_command private.booking_room_commands%ROWTYPE;v_booking public.room_bookings%ROWTYPE;
  v_room public.rooms%ROWTYPE;v_users uuid[];v_push uuid[];v_groups uuid[];
BEGIN
  SELECT * INTO v_command FROM private.booking_room_commands WHERE actor_id=p_actor_id AND command_id=p_command_id;
  IF NOT FOUND OR p_actor_id IS DISTINCT FROM auth.uid() OR v_command.operation NOT IN('checkin','checkout')
    OR v_command.result->>'success' IS DISTINCT FROM 'true' OR v_command.result ? 'state'
    OR v_command.result->>'notification_event_id' IS DISTINCT FROM p_event_id::text
    OR cardinality(v_command.booking_ids)<>1 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_NOTIFICATION_SOURCE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=v_command.booking_ids[1];
  SELECT * INTO v_room FROM public.rooms WHERE id=v_booking.room_id;
  IF v_booking.tenant_id IS DISTINCT FROM v_command.tenant_id OR v_room.tenant_id IS DISTINCT FROM v_command.tenant_id
    OR v_room.hotel_id IS DISTINCT FROM v_booking.hotel_id OR NOT(v_room.id=ANY(v_command.room_ids))
    OR v_booking.status::text IS DISTINCT FROM (CASE WHEN v_command.operation='checkin' THEN 'checked_in' ELSE 'checked_out' END) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_NOTIFICATION_SCOPE' USING ERRCODE='42501'; END IF;
  -- Snapshot candidate IDs without acquiring recipient locks after booking locks.
  -- Delivery rechecks live membership/status before any effect. New staff do not
  -- receive historical queued events merely by joining the hotel later.
  SELECT COALESCE(array_agg(u.id ORDER BY u.id),'{}'::uuid[]) INTO v_users FROM public.users u
    WHERE u.tenant_id=v_booking.tenant_id AND u.status='active' AND NOT COALESCE(u.account_locked,false)
      AND (u.role::text='owner' OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=u.id AND uh.hotel_id=v_booking.hotel_id));
  SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO v_push FROM public.push_subscriptions
    WHERE tenant_id=v_booking.tenant_id AND user_id=ANY(v_users) AND is_active=true;
  SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO v_groups FROM public.telegram_groups
    WHERE tenant_id=v_booking.tenant_id AND is_active=true AND group_type IN('staff','general')
      AND (hotel_id=v_booking.hotel_id OR hotel_id IS NULL)
      AND (notification_types IS NULL OR cardinality(notification_types)=0 OR 'all'=ANY(notification_types)
        OR v_command.operation=ANY(notification_types));
  INSERT INTO private.booking_notification_events(id,actor_id,command_id,tenant_id,hotel_id,booking_id,room_id,operation,
    room_number,recipient_ids,push_subscription_ids,telegram_group_ids)
    VALUES(p_event_id,p_actor_id,p_command_id,v_command.tenant_id,v_booking.hotel_id,v_booking.id,v_room.id,v_command.operation,
      v_room.room_number,v_users,v_push,v_groups);
  INSERT INTO private.booking_notification_outbox(event_id,channel)
    SELECT p_event_id,channel FROM unnest(CASE WHEN v_command.operation='checkout'
      THEN ARRAY['in_app','push','telegram'] ELSE ARRAY['telegram'] END) x(channel);
END;
$fn$;
REVOKE ALL ON FUNCTION private.enqueue_booking_notification(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.deliver_booking_inapp_notification(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_event private.booking_notification_events%ROWTYPE;v_job private.booking_notification_outbox%ROWTYPE;
  v_user uuid;v_notification uuid;v_count integer:=0;v_valid_scope boolean;v_now timestamptz;
BEGIN
  SELECT * INTO v_event FROM private.booking_notification_events WHERE id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOTIFICATION_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  -- Live recipient rows -> memberships -> hotel -> outbox. Never hold an outbox
  -- row while waiting on an upstream profile/membership writer.
  PERFORM 1 FROM public.users WHERE id=ANY(v_event.recipient_ids) ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.user_hotels WHERE user_id=ANY(v_event.recipient_ids) AND hotel_id=v_event.hotel_id ORDER BY user_id,hotel_id FOR SHARE;
  PERFORM 1 FROM public.hotels WHERE id=v_event.hotel_id FOR SHARE;
  SELECT EXISTS(SELECT 1 FROM public.hotels WHERE id=v_event.hotel_id AND tenant_id=v_event.tenant_id AND status='active') INTO v_valid_scope;
  SELECT * INTO v_job FROM private.booking_notification_outbox WHERE event_id=p_event_id AND channel='in_app' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','busy_or_missing'); END IF;
  IF v_job.state<>'pending' THEN RETURN jsonb_build_object('state',v_job.state,'replayed',true); END IF;
  v_now:=clock_timestamp();
  IF v_job.available_at>v_now THEN RETURN jsonb_build_object('state','deferred'); END IF;
  UPDATE private.booking_notification_outbox SET attempts=attempts+1 WHERE event_id=p_event_id AND channel='in_app';
  IF NOT v_valid_scope THEN
    UPDATE private.booking_notification_outbox SET state='obsolete',completed_at=v_now,last_error_code=NULL
      WHERE event_id=p_event_id AND channel='in_app';
    RETURN jsonb_build_object('state','obsolete','replayed',false);
  END IF;
  BEGIN
    FOR v_user IN SELECT u.id FROM public.users u WHERE u.id=ANY(v_event.recipient_ids)
      AND u.tenant_id=v_event.tenant_id AND u.status='active' AND NOT COALESCE(u.account_locked,false)
      AND (u.role::text='owner' OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=u.id AND uh.hotel_id=v_event.hotel_id))
      ORDER BY u.id LOOP
      IF NOT EXISTS(SELECT 1 FROM private.booking_notification_receipts WHERE event_id=p_event_id AND user_id=v_user) THEN
        v_notification:=gen_random_uuid();
        INSERT INTO public.in_app_notifications(id,tenant_id,user_id,title,body,type,action_url,icon,metadata)
          VALUES(v_notification,v_event.tenant_id,v_user,'Phòng '||v_event.room_number||' - Checkout',
            'Khách đã trả phòng. Vui lòng kiểm tra đồ dùng trong phòng.','room_checkout',
            '/rooms/'||v_event.room_id::text||'/check?type=checkout','door-open',
            jsonb_build_object('bookingNotificationEventId',p_event_id,'roomId',v_event.room_id,'hotelId',v_event.hotel_id,'roomNumber',v_event.room_number));
        INSERT INTO private.booking_notification_receipts(event_id,user_id,notification_id) VALUES(p_event_id,v_user,v_notification);
      END IF;
      v_count:=v_count+1;
    END LOOP;
    UPDATE private.booking_notification_outbox SET state=CASE WHEN v_count=0 THEN 'no_recipients' ELSE 'delivered' END,
      recipient_count=v_count,completed_at=clock_timestamp(),last_error_code=NULL WHERE event_id=p_event_id AND channel='in_app';
    RETURN jsonb_build_object('state',CASE WHEN v_count=0 THEN 'no_recipients' ELSE 'delivered' END,'recipients',v_count,'replayed',false);
  EXCEPTION WHEN OTHERS THEN
    -- Only this delivery subtransaction rolls back. Never lose a committed
    -- source event or mark a partial recipient batch delivered.
    UPDATE private.booking_notification_outbox SET available_at=clock_timestamp()+make_interval(secs=>LEAST(3600,5*power(2,LEAST(v_job.attempts,9)))::integer),
      last_error_code='DELIVERY_FAILED' WHERE event_id=p_event_id AND channel='in_app';
    RETURN jsonb_build_object('state','pending','retryable',true);
  END;
END;
$fn$;
REVOKE ALL ON FUNCTION private.deliver_booking_inapp_notification(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.process_booking_notification_batch(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_event uuid;v_result jsonb;v_processed integer:=0;v_delivered integer:=0;v_pending integer:=0;v_external bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_BOOKING_NOTIFICATION_LIMIT' USING ERRCODE='22023'; END IF;
  FOR v_event IN SELECT event_id FROM private.booking_notification_outbox
    WHERE channel='in_app' AND state='pending' AND available_at<=clock_timestamp() ORDER BY available_at,event_id LIMIT p_limit LOOP
    v_result:=private.deliver_booking_inapp_notification(v_event);
    -- Another worker may have completed a candidate after this cursor opened.
    -- Observing its receipt is not a new delivery in this cycle's counters.
    IF COALESCE((v_result->>'replayed')::boolean,false) THEN CONTINUE; END IF;
    IF v_result->>'state'<>'busy_or_missing' THEN v_processed:=v_processed+1; END IF;
    IF v_result->>'state'='delivered' THEN v_delivered:=v_delivered+1; END IF;
    IF v_result->>'state'='pending' THEN v_pending:=v_pending+1; END IF;
  END LOOP;
  SELECT count(*) INTO v_external FROM private.booking_notification_outbox WHERE channel IN('push','telegram') AND state='pending';
  RETURN jsonb_build_object('processed',v_processed,'delivered',v_delivered,'retry_pending',v_pending,'external_pending',v_external,'external_dispatcher_ready',false);
END;
$fn$;
REVOKE ALL ON FUNCTION private.process_booking_notification_batch(integer) FROM PUBLIC,anon,authenticated,service_role;
DO $role$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roomqc_booking_notifier') THEN
    CREATE ROLE roomqc_booking_notifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roomqc_booking_notifier' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'BOOKING_NOTIFIER_ROLE_UNSAFE';
  END IF;
END;
$role$;
GRANT USAGE ON SCHEMA private TO roomqc_booking_notifier;
GRANT EXECUTE ON FUNCTION private.process_booking_notification_batch(integer) TO roomqc_booking_notifier;

CREATE FUNCTION public.get_booking_notification_status(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_events uuid[];v_status jsonb;
BEGIN
  v_result:=public.get_booking_room_command_result(p_command_id);
  IF v_result IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(value::uuid) INTO v_events FROM (
    SELECT v_result->>'notification_event_id' AS value
    UNION ALL SELECT item->>'notification_event_id' FROM jsonb_array_elements(COALESCE(v_result->'results','[]')) item
  ) ids WHERE value IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('event_id',e.id,'booking_id',e.booking_id,'room_id',e.room_id,
    'channels',(SELECT jsonb_agg(jsonb_build_object('channel',j.channel,'state',j.state,'attempts',j.attempts,
      'recipient_count',j.recipient_count,'last_error_code',j.last_error_code) ORDER BY j.channel)
      FROM private.booking_notification_outbox j WHERE j.event_id=e.id)) ORDER BY e.id),'[]') INTO v_status
    FROM private.booking_notification_events e WHERE e.id=ANY(v_events) AND e.actor_id=auth.uid();
  PERFORM private.assert_room_transition_session();
  RETURN jsonb_build_object('command_id',p_command_id,'events',v_status);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_booking_notification_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_booking_notification_status(uuid) TO authenticated;

-- Preserve atomic notes/invoice behavior. Only committed single operations own
-- events; a group receipt refers to its child receipts and queues nothing twice.
CREATE OR REPLACE FUNCTION private.save_booking_room_command(p_command_id uuid,p_operation text,p_booking_ids uuid[],
  p_room_ids uuid[],p_request jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_result jsonb:=p_result||jsonb_build_object('command_id',p_command_id,'operation',p_operation,'replayed',false);
  v_invoice uuid;v_notification uuid;
BEGIN
  IF p_operation IN('checkin','checkout') AND p_result->>'success'='true' AND NOT(p_result ? 'state') THEN
    IF cardinality(p_booking_ids)<>1 THEN RAISE EXCEPTION 'INVALID_BOOKING_ADJUSTMENT_CONTEXT' USING ERRCODE='22023'; END IF;
    IF p_request ? 'adjustment_notes' THEN
      PERFORM private.booking_adjustment_request('{}'::jsonb,p_request->>'adjustment_notes');
      UPDATE public.room_bookings SET notes=concat_ws(E'\n',NULLIF(notes,''),p_request->>'adjustment_notes')
        WHERE id=p_booking_ids[1] AND room_id=ANY(p_room_ids)
          AND tenant_id=(SELECT tenant_id FROM public.users WHERE id=auth.uid());
      IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    END IF;
    v_notification:=gen_random_uuid();
    v_result:=v_result||jsonb_build_object('adjustment_notes_applied',p_request ? 'adjustment_notes',
      'notification_event_id',v_notification,'notification_state','queued');
  END IF;
  IF p_operation='checkout' AND p_result->>'success'='true' AND NOT(p_result ? 'state') THEN
    IF cardinality(p_booking_ids)<>1 THEN RAISE EXCEPTION 'INVALID_CHECKOUT_INVOICE_CONTEXT' USING ERRCODE='22023'; END IF;
    v_invoice:=private.materialize_checkout_invoice(p_booking_ids[1],auth.uid(),p_command_id);
    v_result:=v_result||jsonb_build_object('invoice_id',v_invoice,'invoice_state','issued');
  END IF;
  INSERT INTO private.booking_room_commands(actor_id,command_id,operation,tenant_id,booking_ids,room_ids,session_id,request,result)
  VALUES(auth.uid(),p_command_id,p_operation,(SELECT tenant_id FROM public.users WHERE id=auth.uid()),
    p_booking_ids,p_room_ids,(auth.jwt()->>'session_id')::uuid,p_request,v_result);
  IF v_notification IS NOT NULL THEN
    PERFORM private.enqueue_booking_notification(v_notification,auth.uid(),p_command_id);
  END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.save_booking_room_command(uuid,text,uuid[],uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
