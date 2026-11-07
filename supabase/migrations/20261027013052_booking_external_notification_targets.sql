-- Q02: immutable target snapshots and an attempt journal committed BEFORE I/O.
-- A database transaction retains live authority/config locks during bounded I/O.
-- Its separate journal connection can commit under a NO KEY UPDATE target lock.
ALTER TABLE private.booking_notification_events ADD COLUMN external_plan_version integer NOT NULL DEFAULT 0;
ALTER TABLE private.booking_notification_events ADD COLUMN external_payload jsonb;
ALTER TABLE private.booking_notification_outbox DROP CONSTRAINT booking_notification_outbox_state_check;
ALTER TABLE private.booking_notification_outbox DROP CONSTRAINT booking_notification_outbox_check;
ALTER TABLE private.booking_notification_outbox ADD CONSTRAINT booking_notification_outbox_state_check
  CHECK(state IN('pending','delivered','accepted','no_recipients','obsolete','unknown','blocked','rejected','partial','resolved'));
ALTER TABLE private.booking_notification_outbox ADD CONSTRAINT booking_notification_outbox_completion_check
  CHECK((state='pending' AND completed_at IS NULL) OR (state<>'pending' AND completed_at IS NOT NULL AND last_error_code IS NULL));

CREATE TABLE private.booking_notification_channel_config (
  channel text PRIMARY KEY CHECK(channel IN('push','telegram')),
  enabled boolean NOT NULL DEFAULT false,
  configuration_id text CHECK(configuration_id ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(NOT enabled OR configuration_id IS NOT NULL)
);
INSERT INTO private.booking_notification_channel_config(channel) VALUES('push'),('telegram');
CREATE TABLE private.booking_notification_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES private.booking_notification_events(id),
  channel text NOT NULL CHECK(channel IN('push','telegram')),
  target_ref uuid NOT NULL,
  user_id uuid,
  destination_hash text NOT NULL CHECK(destination_hash ~ '^[a-f0-9]{64}$'),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  configuration_id text,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','accepted','rejected','obsolete','unknown','blocked','resolved')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  prepare_failures integer NOT NULL DEFAULT 0 CHECK(prepare_failures BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  last_error_code text,
  completed_at timestamptz,
  UNIQUE(event_id,channel,destination_hash),
  CHECK((state='leased' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND completed_at IS NULL)
    OR (state='pending' AND lease_id IS NULL AND lease_until IS NULL AND completed_at IS NULL)
    OR (state NOT IN('pending','leased') AND lease_id IS NULL AND lease_until IS NULL AND completed_at IS NOT NULL)),
  CHECK((channel='push' AND user_id IS NOT NULL) OR (channel='telegram' AND user_id IS NULL)),
  CHECK(last_error_code IS NULL OR last_error_code IN('SCOPE_REVOKED','TARGET_CHANGED','CHANNEL_UNCONFIGURED','CONFIG_CHANGED',
    'PROVIDER_REJECTED','PROVIDER_RATE_LIMIT','RETRY_EXHAUSTED','OUTCOME_UNKNOWN','INVALID_TARGET','PREPARE_FAILED','OPERATOR_SUPPRESSED'))
);
CREATE INDEX booking_notification_targets_due ON private.booking_notification_targets(channel,available_at,id) WHERE state='pending';
CREATE INDEX booking_notification_targets_expiry ON private.booking_notification_targets(lease_until,id) WHERE state='leased';
CREATE INDEX booking_notification_targets_operator_state ON private.booking_notification_targets(state,id);
CREATE TABLE private.booking_notification_attempts (
  id uuid PRIMARY KEY,
  target_id uuid NOT NULL REFERENCES private.booking_notification_targets(id),
  lease_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'started' CHECK(outcome IN('started','accepted','rejected','retry','unknown')),
  http_status integer CHECK(http_status BETWEEN 100 AND 599),
  provider_message_id text CHECK(provider_message_id ~ '^[1-9][0-9]{0,19}$'),
  UNIQUE(target_id,lease_id),
  CHECK((outcome='started' AND finished_at IS NULL) OR (outcome<>'started' AND finished_at IS NOT NULL))
);
CREATE TABLE private.booking_notification_operator_commands (
  command_id uuid PRIMARY KEY,
  operator_login name NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.booking_notification_channel_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.booking_notification_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.booking_notification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.booking_notification_operator_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_notification_channel_config,private.booking_notification_targets,
  private.booking_notification_attempts,private.booking_notification_operator_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.booking_external_fingerprint(p_channel text,p_ref uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value::text,'UTF8')),'hex') FROM (
    SELECT jsonb_build_object('id',id,'tenant',tenant_id,'user',user_id,'endpoint',endpoint,'p256dh',p256dh_key,'auth',auth_key,'active',is_active) AS value
      FROM public.push_subscriptions WHERE p_channel='push' AND id=p_ref
    UNION ALL
    SELECT jsonb_build_object('id',id,'tenant',tenant_id,'hotel',hotel_id,'chat',chat_id,'type',group_type,
      'notifications',notification_types,'active',is_active) FROM public.telegram_groups WHERE p_channel='telegram' AND id=p_ref
  ) source;
$fn$;
REVOKE ALL ON FUNCTION private.booking_external_fingerprint(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.refresh_booking_external_channel(p_event uuid,p_channel text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_state text;v_count integer;v_attempts integer;
BEGIN
  PERFORM 1 FROM private.booking_notification_outbox WHERE event_id=p_event AND channel=p_channel FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*)::integer,COALESCE(sum(attempts),0)::integer,
    CASE WHEN count(*)=0 THEN 'no_recipients'
      WHEN bool_or(state IN('pending','leased')) THEN 'pending'
      WHEN bool_or(state='unknown') THEN 'unknown'
      WHEN bool_or(state='blocked') THEN 'blocked'
      WHEN bool_and(state='obsolete') THEN 'obsolete'
      WHEN bool_and(state='resolved') THEN 'resolved'
      WHEN bool_or(state='rejected') THEN CASE WHEN bool_or(state='accepted') THEN 'partial' ELSE 'rejected' END
      WHEN bool_or(state='resolved') THEN 'partial'
      ELSE 'accepted' END INTO v_count,v_attempts,v_state FROM private.booking_notification_targets WHERE event_id=p_event AND channel=p_channel;
  UPDATE private.booking_notification_outbox SET state=v_state,attempts=v_attempts,recipient_count=v_count,last_error_code=NULL,
    completed_at=CASE WHEN v_state='pending' THEN NULL ELSE clock_timestamp() END WHERE event_id=p_event AND channel=p_channel;
END;
$fn$;
REVOKE ALL ON FUNCTION private.refresh_booking_external_channel(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION private.enqueue_booking_notification(uuid,uuid,uuid) RENAME TO enqueue_booking_notification_inapp_v1;
CREATE FUNCTION private.enqueue_booking_notification(p_event_id uuid,p_actor_id uuid,p_command_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_event private.booking_notification_events%ROWTYPE;
BEGIN
  PERFORM private.enqueue_booking_notification_inapp_v1(p_event_id,p_actor_id,p_command_id);
  SELECT * INTO STRICT v_event FROM private.booking_notification_events WHERE id=p_event_id;
  UPDATE private.booking_notification_events SET external_plan_version=1,external_payload=jsonb_build_object(
    'title','Phòng '||room_number||CASE WHEN operation='checkout' THEN ' - Checkout' ELSE ' - Nhận phòng' END,
    'body',CASE WHEN operation='checkout' THEN 'Khách đã trả phòng. Vui lòng kiểm tra đồ dùng trong phòng.' ELSE 'Khách đã nhận phòng.' END,
    'action_url','/rooms/'||room_id::text||CASE WHEN operation='checkout' THEN '/check?type=checkout' ELSE '' END,
    'event_id',id,'notification_type','room_'||operation) WHERE id=p_event_id;
  INSERT INTO private.booking_notification_targets(event_id,channel,target_ref,user_id,destination_hash,fingerprint,configuration_id)
    SELECT p_event_id,'push',s.id,s.user_id,encode(sha256(convert_to(s.endpoint,'UTF8')),'hex'),
      private.booking_external_fingerprint('push',s.id),c.configuration_id
    FROM public.push_subscriptions s CROSS JOIN private.booking_notification_channel_config c
    WHERE c.channel='push' AND s.id=ANY(v_event.push_subscription_ids) AND s.tenant_id=v_event.tenant_id AND s.is_active
      AND s.user_id=ANY(v_event.recipient_ids) AND v_event.operation='checkout' ORDER BY s.id
    ON CONFLICT(event_id,channel,destination_hash) DO NOTHING;
  INSERT INTO private.booking_notification_targets(event_id,channel,target_ref,user_id,destination_hash,fingerprint,configuration_id)
    SELECT p_event_id,'telegram',g.id,NULL,encode(sha256(convert_to(g.chat_id,'UTF8')),'hex'),
      private.booking_external_fingerprint('telegram',g.id),c.configuration_id
    FROM public.telegram_groups g CROSS JOIN private.booking_notification_channel_config c
    WHERE c.channel='telegram' AND g.id=ANY(v_event.telegram_group_ids) AND g.tenant_id=v_event.tenant_id AND g.is_active
      AND g.group_type IN('staff','general') AND (g.hotel_id=v_event.hotel_id OR g.hotel_id IS NULL)
      AND (g.notification_types IS NULL OR cardinality(g.notification_types)=0 OR 'all'=ANY(g.notification_types) OR v_event.operation=ANY(g.notification_types))
    ORDER BY g.id ON CONFLICT(event_id,channel,destination_hash) DO NOTHING;
END;
$fn$;
REVOKE ALL ON FUNCTION private.enqueue_booking_notification(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enqueue_booking_notification_inapp_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.claim_booking_external_target(p_channel text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;v_job record;v_lease uuid:=gen_random_uuid();v_started boolean;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN('push','telegram') THEN RAISE EXCEPTION 'INVALID_BOOKING_CHANNEL' USING ERRCODE='22023'; END IF;
  FOR v_target IN SELECT * FROM private.booking_notification_targets WHERE channel=p_channel AND state='leased'
    AND lease_until<=clock_timestamp() ORDER BY lease_until,id LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
    SELECT EXISTS(SELECT 1 FROM private.booking_notification_attempts WHERE target_id=v_target.id AND lease_id=v_target.lease_id) INTO v_started;
    UPDATE private.booking_notification_attempts SET outcome='unknown',finished_at=clock_timestamp()
      WHERE target_id=v_target.id AND lease_id=v_target.lease_id AND outcome='started';
    UPDATE private.booking_notification_targets SET state=CASE WHEN v_started THEN 'unknown' ELSE 'pending' END,
      last_error_code=CASE WHEN v_started THEN 'OUTCOME_UNKNOWN' ELSE NULL END,lease_id=NULL,lease_until=NULL,
      completed_at=CASE WHEN v_started THEN clock_timestamp() ELSE NULL END,available_at=clock_timestamp(),
      attempts=(SELECT count(*) FROM private.booking_notification_attempts WHERE target_id=v_target.id) WHERE id=v_target.id;
    PERFORM private.refresh_booking_external_channel(v_target.event_id,p_channel);
  END LOOP;
  -- Old sources are retained for explicit reconciliation, never silently planned.
  FOR v_job IN SELECT j.event_id FROM private.booking_notification_outbox j JOIN private.booking_notification_events e ON e.id=j.event_id
    WHERE j.channel=p_channel AND j.state='pending' AND e.external_plan_version=1
      AND NOT EXISTS(SELECT 1 FROM private.booking_notification_targets t WHERE t.event_id=j.event_id AND t.channel=p_channel)
    ORDER BY j.event_id LIMIT 50 FOR UPDATE OF j SKIP LOCKED LOOP
    PERFORM private.refresh_booking_external_channel(v_job.event_id,p_channel);
  END LOOP;
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE channel=p_channel AND state='pending'
    AND available_at<=clock_timestamp() AND attempts<5 ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE private.booking_notification_targets SET state='leased',lease_id=v_lease,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=v_target.id;
  PERFORM private.refresh_booking_external_channel(v_target.event_id,p_channel);
  RETURN jsonb_build_object('target_id',v_target.id,'lease_id',v_lease,'channel',p_channel);
END;
$fn$;
REVOKE ALL ON FUNCTION private.claim_booking_external_target(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.prepare_booking_external_target(p_target uuid,p_lease uuid,p_configuration text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;v_event private.booking_notification_events%ROWTYPE;
  v_config private.booking_notification_channel_config%ROWTYPE;v_push public.push_subscriptions%ROWTYPE;
  v_group public.telegram_groups%ROWTYPE;v_state text;v_code text;v_valid boolean;v_destination jsonb;
BEGIN
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','stale'); END IF;
  SELECT * INTO STRICT v_event FROM private.booking_notification_events WHERE id=v_target.event_id;
  IF v_target.channel='push' THEN
    PERFORM 1 FROM public.users WHERE id=v_target.user_id FOR SHARE;
    PERFORM 1 FROM public.user_hotels WHERE user_id=v_target.user_id AND hotel_id=v_event.hotel_id ORDER BY user_id,hotel_id FOR SHARE;
  END IF;
  PERFORM 1 FROM public.hotels WHERE id=v_event.hotel_id FOR SHARE;
  SELECT * INTO STRICT v_config FROM private.booking_notification_channel_config WHERE channel=v_target.channel FOR SHARE;
  IF v_target.channel='push' THEN SELECT * INTO v_push FROM public.push_subscriptions WHERE id=v_target.target_ref FOR NO KEY UPDATE;
  ELSE SELECT * INTO v_group FROM public.telegram_groups WHERE id=v_target.target_ref FOR SHARE; END IF;
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target FOR NO KEY UPDATE;
  IF NOT FOUND OR v_target.state<>'leased' OR v_target.lease_id IS DISTINCT FROM p_lease OR v_target.lease_until<=clock_timestamp() THEN
    RETURN jsonb_build_object('status','stale'); END IF;
  SELECT EXISTS(SELECT 1 FROM public.hotels WHERE id=v_event.hotel_id AND tenant_id=v_event.tenant_id AND status='active') INTO v_valid;
  IF v_target.channel='push' THEN
    v_valid:=v_valid AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=v_target.user_id AND u.tenant_id=v_event.tenant_id
      AND u.status='active' AND NOT COALESCE(u.account_locked,false) AND (u.role::text='owner'
        OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=u.id AND uh.hotel_id=v_event.hotel_id)))
      AND v_push.tenant_id=v_event.tenant_id AND v_push.user_id=v_target.user_id AND v_push.is_active;
    v_destination:=jsonb_build_object('endpoint',v_push.endpoint,'p256dh',v_push.p256dh_key,'auth',v_push.auth_key);
  ELSE
    v_valid:=v_valid AND v_group.tenant_id=v_event.tenant_id AND v_group.is_active AND v_group.group_type IN('staff','general')
      AND (v_group.hotel_id=v_event.hotel_id OR v_group.hotel_id IS NULL)
      AND (v_group.notification_types IS NULL OR cardinality(v_group.notification_types)=0 OR 'all'=ANY(v_group.notification_types) OR v_event.operation=ANY(v_group.notification_types));
    v_destination:=jsonb_build_object('chat_id',v_group.chat_id);
  END IF;
  IF v_valid IS DISTINCT FROM true THEN v_state:='obsolete';v_code:='SCOPE_REVOKED';
  ELSIF private.booking_external_fingerprint(v_target.channel,v_target.target_ref) IS DISTINCT FROM v_target.fingerprint THEN v_state:='obsolete';v_code:='TARGET_CHANGED';
  ELSIF NOT v_config.enabled THEN v_state:='blocked';v_code:='CHANNEL_UNCONFIGURED';
  ELSIF v_config.configuration_id IS DISTINCT FROM p_configuration OR v_target.configuration_id IS DISTINCT FROM v_config.configuration_id THEN
    v_state:='blocked';v_code:='CONFIG_CHANGED'; END IF;
  IF v_state IS NOT NULL THEN
    UPDATE private.booking_notification_targets SET state=v_state,last_error_code=v_code,lease_id=NULL,lease_until=NULL,completed_at=clock_timestamp() WHERE id=p_target;
    PERFORM private.refresh_booking_external_channel(v_target.event_id,v_target.channel);
    RETURN jsonb_build_object('status',v_state,'code',v_code);
  END IF;
  RETURN jsonb_build_object('status','authorized','channel',v_target.channel,'configuration_id',v_config.configuration_id,
    'target',v_destination,'payload',v_event.external_payload);
END;
$fn$;
REVOKE ALL ON FUNCTION private.prepare_booking_external_target(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.begin_booking_external_attempt(p_target uuid,p_lease uuid,p_attempt uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;v_existing uuid;
BEGIN
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target;
  IF NOT FOUND OR p_attempt IS NULL OR v_target.state<>'leased' OR v_target.lease_id IS DISTINCT FROM p_lease
    OR v_target.lease_until<=clock_timestamp() OR v_target.attempts>=5 THEN
    RAISE EXCEPTION 'BOOKING_ATTEMPT_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_existing FROM private.booking_notification_attempts WHERE target_id=p_target AND lease_id=p_lease;
  IF FOUND THEN
    IF v_existing=p_attempt THEN RETURN v_existing; END IF;
    RAISE EXCEPTION 'BOOKING_ATTEMPT_ALREADY_STARTED' USING ERRCODE='23505'; END IF;
  INSERT INTO private.booking_notification_attempts(id,target_id,lease_id) VALUES(p_attempt,p_target,p_lease);
  RETURN p_attempt;
END;
$fn$;
REVOKE ALL ON FUNCTION private.begin_booking_external_attempt(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.finish_booking_external_attempt(p_target uuid,p_lease uuid,p_attempt uuid,p_outcome text,
  p_http_status integer DEFAULT NULL,p_message_id text DEFAULT NULL,p_retry_seconds integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;v_attempt private.booking_notification_attempts%ROWTYPE;
  v_state text;v_code text;v_count integer;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN('accepted','rejected','retry','unknown') OR p_retry_seconds IS NULL OR p_retry_seconds NOT BETWEEN 0 AND 3600
    OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599) OR (p_message_id IS NOT NULL AND p_message_id !~ '^[1-9][0-9]{0,19}$')
    OR (p_outcome='retry' AND (p_http_status IS DISTINCT FROM 429 OR p_message_id IS NOT NULL))
    OR (p_outcome='rejected' AND ((p_http_status BETWEEN 400 AND 499 AND p_http_status NOT IN(408,429)) IS DISTINCT FROM true OR p_message_id IS NOT NULL))
    OR (p_outcome='unknown' AND p_message_id IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_ATTEMPT_RESULT' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target FOR NO KEY UPDATE;
  IF NOT FOUND OR v_target.state<>'leased' OR v_target.lease_id IS DISTINCT FROM p_lease THEN
    RAISE EXCEPTION 'BOOKING_ATTEMPT_LEASE_LOST' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_attempt FROM private.booking_notification_attempts WHERE id=p_attempt AND target_id=p_target AND lease_id=p_lease FOR UPDATE;
  IF NOT FOUND OR v_attempt.outcome<>'started' THEN RAISE EXCEPTION 'BOOKING_ATTEMPT_NOT_STARTED' USING ERRCODE='42501'; END IF;
  IF p_outcome='accepted' AND ((v_target.channel='push' AND p_http_status=201 AND p_message_id IS NULL)
    OR (v_target.channel='telegram' AND p_http_status=200 AND p_message_id IS NOT NULL)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'INVALID_BOOKING_ACCEPTANCE_RECEIPT' USING ERRCODE='22023'; END IF;
  SELECT count(*)::integer INTO v_count FROM private.booking_notification_attempts WHERE target_id=p_target;
  v_state:=CASE WHEN p_outcome='retry' THEN CASE WHEN v_count>=5 THEN 'rejected' ELSE 'pending' END ELSE p_outcome END;
  v_code:=CASE WHEN p_outcome='unknown' THEN 'OUTCOME_UNKNOWN' WHEN p_outcome='rejected' THEN 'PROVIDER_REJECTED'
    WHEN p_outcome='retry' THEN CASE WHEN v_count>=5 THEN 'RETRY_EXHAUSTED' ELSE 'PROVIDER_RATE_LIMIT' END ELSE NULL END;
  UPDATE private.booking_notification_attempts SET outcome=p_outcome,http_status=p_http_status,provider_message_id=p_message_id,finished_at=clock_timestamp() WHERE id=p_attempt;
  UPDATE private.booking_notification_targets SET state=v_state,attempts=v_count,last_error_code=v_code,lease_id=NULL,lease_until=NULL,
    completed_at=CASE WHEN v_state='pending' THEN NULL ELSE clock_timestamp() END,
    available_at=clock_timestamp()+make_interval(secs=>GREATEST(p_retry_seconds,LEAST(3600,(5*power(2,LEAST(v_count-1,9)))::integer))) WHERE id=p_target;
  IF v_target.channel='push' AND p_outcome='rejected' AND p_http_status=410 THEN
    UPDATE public.push_subscriptions SET is_active=false WHERE id=v_target.target_ref
      AND private.booking_external_fingerprint('push',id)=v_target.fingerprint;
  END IF;
  PERFORM private.refresh_booking_external_channel(v_target.event_id,v_target.channel);
  RETURN jsonb_build_object('state',v_state,'attempts',v_count);
END;
$fn$;
REVOKE ALL ON FUNCTION private.finish_booking_external_attempt(uuid,uuid,uuid,text,integer,text,integer) FROM PUBLIC,anon,authenticated,service_role;

DO $roles$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roomqc_booking_external_notifier') THEN
    CREATE ROLE roomqc_booking_external_notifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='roomqc_booking_notification_operator') THEN
    CREATE ROLE roomqc_booking_notification_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('roomqc_booking_external_notifier','roomqc_booking_notification_operator')
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'BOOKING_NOTIFICATION_ROLE_UNSAFE'; END IF;
END;
$roles$;
GRANT USAGE ON SCHEMA private TO roomqc_booking_external_notifier,roomqc_booking_notification_operator;
GRANT EXECUTE ON FUNCTION private.claim_booking_external_target(text),private.prepare_booking_external_target(uuid,uuid,text),
  private.begin_booking_external_attempt(uuid,uuid,uuid),private.finish_booking_external_attempt(uuid,uuid,uuid,text,integer,text,integer) TO roomqc_booking_external_notifier;

CREATE FUNCTION private.reject_booking_external_target_before_io(p_target uuid,p_lease uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;
BEGIN
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target FOR NO KEY UPDATE;
  IF NOT FOUND OR v_target.state<>'leased' OR v_target.lease_id IS DISTINCT FROM p_lease
    OR EXISTS(SELECT 1 FROM private.booking_notification_attempts WHERE target_id=p_target AND lease_id=p_lease) THEN
    RAISE EXCEPTION 'BOOKING_TARGET_REJECTION_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  UPDATE private.booking_notification_targets SET state='rejected',last_error_code='INVALID_TARGET',lease_id=NULL,lease_until=NULL,completed_at=clock_timestamp() WHERE id=p_target;
  PERFORM private.refresh_booking_external_channel(v_target.event_id,v_target.channel);
END;
$fn$;
REVOKE ALL ON FUNCTION private.reject_booking_external_target_before_io(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.reject_booking_external_target_before_io(uuid,uuid) TO roomqc_booking_external_notifier;

CREATE FUNCTION private.defer_booking_external_target_before_io(p_target uuid,p_lease uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;v_failures integer;
BEGIN
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target FOR NO KEY UPDATE;
  IF NOT FOUND OR v_target.state<>'leased' OR v_target.lease_id IS DISTINCT FROM p_lease
    OR EXISTS(SELECT 1 FROM private.booking_notification_attempts WHERE target_id=p_target AND lease_id=p_lease) THEN
    RAISE EXCEPTION 'BOOKING_TARGET_DEFERRAL_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  v_failures:=LEAST(5,v_target.prepare_failures+1);
  UPDATE private.booking_notification_targets SET state=CASE WHEN v_failures=5 THEN 'rejected' ELSE 'pending' END,
    prepare_failures=v_failures,last_error_code=CASE WHEN v_failures=5 THEN 'RETRY_EXHAUSTED' ELSE 'PREPARE_FAILED' END,
    lease_id=NULL,lease_until=NULL,completed_at=CASE WHEN v_failures=5 THEN clock_timestamp() ELSE NULL END,
    available_at=clock_timestamp()+make_interval(secs=>(5*power(2,v_failures-1))::integer) WHERE id=p_target;
  PERFORM private.refresh_booking_external_channel(v_target.event_id,v_target.channel);
END;
$fn$;
REVOKE ALL ON FUNCTION private.defer_booking_external_target_before_io(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.defer_booking_external_target_before_io(uuid,uuid) TO roomqc_booking_external_notifier;

CREATE FUNCTION private.configure_booking_notification_channel(p_channel text,p_configuration text,p_enabled boolean,p_command uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_request jsonb;v_old private.booking_notification_operator_commands%ROWTYPE;v_result jsonb;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN('push','telegram') OR p_enabled IS NULL OR p_command IS NULL
    OR p_configuration IS NULL OR p_configuration !~ '^[a-f0-9]{64}$' OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_NOTIFICATION_CONFIG' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('booking-notification-operator:'||p_command::text,0));
  v_request:=jsonb_build_object('action','configure','channel',p_channel,'configuration',p_configuration,'enabled',p_enabled,'reason',p_reason);
  SELECT * INTO v_old FROM private.booking_notification_operator_commands WHERE command_id=p_command;
  IF FOUND THEN
    IF v_old.operator_login<>session_user OR v_old.request<>v_request THEN RAISE EXCEPTION 'BOOKING_OPERATOR_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true); END IF;
  UPDATE private.booking_notification_channel_config SET configuration_id=p_configuration,enabled=p_enabled,updated_at=clock_timestamp() WHERE channel=p_channel;
  v_result:=jsonb_build_object('channel',p_channel,'enabled',p_enabled,'replayed',false);
  INSERT INTO private.booking_notification_operator_commands(command_id,operator_login,request,result) VALUES(p_command,session_user,v_request,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.configure_booking_notification_channel(text,text,boolean,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.configure_booking_notification_channel(text,text,boolean,uuid,text) TO roomqc_booking_notification_operator;

CREATE FUNCTION private.resolve_booking_notification_target(p_target uuid,p_command uuid,p_resolution text,p_reason text,p_accept_duplicate_risk boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target private.booking_notification_targets%ROWTYPE;v_old private.booking_notification_operator_commands%ROWTYPE;
  v_request jsonb;v_result jsonb;v_config private.booking_notification_channel_config%ROWTYPE;
BEGIN
  IF p_target IS NULL OR p_command IS NULL OR p_resolution IS NULL OR p_resolution NOT IN('retry','suppress')
    OR p_accept_duplicate_risk IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TARGET_RESOLUTION' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('booking-notification-operator:'||p_command::text,0));
  v_request:=jsonb_build_object('action','resolve','target',p_target,'resolution',p_resolution,'reason',p_reason,'duplicate_risk',p_accept_duplicate_risk);
  SELECT * INTO v_old FROM private.booking_notification_operator_commands WHERE command_id=p_command;
  IF FOUND THEN
    IF v_old.operator_login<>session_user OR v_old.request<>v_request THEN RAISE EXCEPTION 'BOOKING_OPERATOR_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target;
  SELECT * INTO v_config FROM private.booking_notification_channel_config WHERE channel=v_target.channel FOR SHARE;
  SELECT * INTO v_target FROM private.booking_notification_targets WHERE id=p_target FOR NO KEY UPDATE;
  IF NOT FOUND OR v_target.state NOT IN('unknown','blocked','rejected') THEN RAISE EXCEPTION 'BOOKING_TARGET_NOT_RESOLVABLE' USING ERRCODE='42501'; END IF;
  IF p_resolution='retry' AND (v_target.attempts>=5 OR v_target.prepare_failures>=5 OR NOT v_config.enabled OR (v_target.state='unknown' AND NOT p_accept_duplicate_risk)) THEN
    RAISE EXCEPTION 'BOOKING_TARGET_RETRY_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  UPDATE private.booking_notification_targets SET state=CASE WHEN p_resolution='retry' THEN 'pending' ELSE 'resolved' END,
    configuration_id=CASE WHEN p_resolution='retry' THEN v_config.configuration_id ELSE configuration_id END,
    available_at=clock_timestamp(),completed_at=CASE WHEN p_resolution='retry' THEN NULL ELSE clock_timestamp() END,
    last_error_code=CASE WHEN p_resolution='retry' THEN NULL ELSE 'OPERATOR_SUPPRESSED' END WHERE id=p_target;
  PERFORM private.refresh_booking_external_channel(v_target.event_id,v_target.channel);
  v_result:=jsonb_build_object('target_id',p_target,'state',CASE WHEN p_resolution='retry' THEN 'pending' ELSE 'resolved' END,'replayed',false);
  INSERT INTO private.booking_notification_operator_commands(command_id,operator_login,request,result) VALUES(p_command,session_user,v_request,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.resolve_booking_notification_target(uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.resolve_booking_notification_target(uuid,uuid,text,text,boolean) TO roomqc_booking_notification_operator;

CREATE OR REPLACE FUNCTION public.get_booking_notification_status(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_events uuid[];v_status jsonb;
BEGIN
  v_result:=public.get_booking_room_command_result(p_command_id);
  IF v_result IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(value::uuid) INTO v_events FROM (SELECT v_result->>'notification_event_id' AS value
    UNION ALL SELECT item->>'notification_event_id' FROM jsonb_array_elements(COALESCE(v_result->'results','[]')) item) ids WHERE value IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('event_id',e.id,'booking_id',e.booking_id,'room_id',e.room_id,'external_plan_version',e.external_plan_version,
    'channels',(SELECT jsonb_agg(jsonb_build_object('channel',j.channel,'state',j.state,'attempts',j.attempts,'recipient_count',j.recipient_count,
      'last_error_code',j.last_error_code,'targets',(SELECT COALESCE(jsonb_agg(jsonb_build_object('target_id',t.id,'state',t.state,'attempts',t.attempts,
        'prepare_failures',t.prepare_failures,'last_error_code',t.last_error_code) ORDER BY t.id),'[]') FROM private.booking_notification_targets t WHERE t.event_id=e.id AND t.channel=j.channel)) ORDER BY j.channel)
      FROM private.booking_notification_outbox j WHERE j.event_id=e.id)) ORDER BY e.id),'[]') INTO v_status
    FROM private.booking_notification_events e WHERE e.id=ANY(v_events) AND e.actor_id=auth.uid();
  PERFORM private.assert_room_transition_session();
  RETURN jsonb_build_object('command_id',p_command_id,'events',v_status);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_booking_notification_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_booking_notification_status(uuid) TO authenticated;

-- Safe operational metadata only: never return destinations, keys or provider bodies.
CREATE FUNCTION private.inspect_booking_notification_channels()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT jsonb_build_object('schema_version',1,'channels',COALESCE(jsonb_agg(jsonb_build_object(
    'channel',channel,'enabled',enabled,'configuration_id',configuration_id,'updated_at',updated_at) ORDER BY channel),'[]'))
    FROM private.booking_notification_channel_config;
$fn$;
REVOKE ALL ON FUNCTION private.inspect_booking_notification_channels() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.inspect_booking_notification_channels() TO roomqc_booking_external_notifier,roomqc_booking_notification_operator;

CREATE FUNCTION private.list_booking_notification_targets(p_state text DEFAULT NULL,p_event uuid DEFAULT NULL,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET plan_cache_mode='force_custom_plan' AS $fn$
DECLARE v_rows jsonb;v_more boolean;v_after uuid;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_state IS NOT NULL AND p_state NOT IN
    ('pending','leased','accepted','rejected','obsolete','unknown','blocked','resolved')) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TARGET_PAGE' USING ERRCODE='22023'; END IF;
  WITH page AS MATERIALIZED (
    SELECT t.*,e.tenant_id,e.hotel_id,e.created_at FROM private.booking_notification_targets t
      JOIN private.booking_notification_events e ON e.id=t.event_id
      WHERE (p_state IS NULL OR t.state=p_state) AND (p_event IS NULL OR t.event_id=p_event) AND (p_after IS NULL OR t.id>p_after)
      ORDER BY t.id LIMIT p_limit+1
  ), shown AS (SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('target_id',id,'event_id',event_id,'tenant_id',tenant_id,'hotel_id',hotel_id,
    'channel',channel,'state',state,'attempts',attempts,'prepare_failures',prepare_failures,'last_error_code',last_error_code,
    'created_at',created_at,'available_at',available_at,'lease_until',lease_until) ORDER BY id) FROM shown),'[]'),
    (SELECT count(*)>p_limit FROM page),(SELECT id FROM shown ORDER BY id DESC LIMIT 1) INTO v_rows,v_more,v_after;
  RETURN jsonb_build_object('rows',v_rows,'has_more',v_more,'next_after',CASE WHEN v_more THEN v_after ELSE NULL END);
END;
$fn$;
REVOKE ALL ON FUNCTION private.list_booking_notification_targets(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.list_booking_notification_targets(text,uuid,uuid,integer) TO roomqc_booking_notification_operator;

CREATE FUNCTION private.get_booking_notification_operator_result(p_command uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF p_command IS NULL THEN RAISE EXCEPTION 'INVALID_BOOKING_OPERATOR_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT result INTO v_result FROM private.booking_notification_operator_commands WHERE command_id=p_command AND operator_login=session_user;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_booking_notification_operator_result(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_booking_notification_operator_result(uuid) TO roomqc_booking_notification_operator;
NOTIFY pgrst,'reload schema';
