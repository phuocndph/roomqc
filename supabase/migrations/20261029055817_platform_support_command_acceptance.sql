-- R11 component: a durable, scoped acceptance point in canonical Auth.
-- This does not by itself authorize a directory write. The control runtime
-- must bind and consume the receipt in the original command transaction.
-- There is deliberately no foreign key/cascade to a revocable Auth identity.
CREATE SCHEMA roomqc_support;
REVOKE ALL ON SCHEMA roomqc_support FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA roomqc_support TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA roomqc_support REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE private.platform_support_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,session_id uuid NOT NULL,attempt_id uuid NOT NULL,
  audience uuid NOT NULL,operation text NOT NULL CHECK(operation IN
    ('cluster_command','register_cluster','acknowledge_alert','recheck_workspace','reconcile_workspace')),
  target text NOT NULL CHECK(length(target) BETWEEN 2 AND 48 AND target~'^[a-z0-9][a-z0-9-]*$'),
  request_key text NOT NULL CHECK(request_key~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
  accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
  UNIQUE(actor_id,session_id,attempt_id),
  CHECK(expires_at>accepted_at AND expires_at<=accepted_at+interval '5 seconds')
);
ALTER TABLE private.platform_support_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_support_acceptances FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.platform_support_acceptance_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN RAISE EXCEPTION 'SUPPORT_ACCEPTANCE_IMMUTABLE' USING ERRCODE='42501';END;
$fn$;
REVOKE ALL ON FUNCTION private.platform_support_acceptance_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER platform_support_acceptance_immutable BEFORE UPDATE OR DELETE ON private.platform_support_acceptances
FOR EACH ROW EXECUTE FUNCTION private.platform_support_acceptance_immutable();

CREATE FUNCTION roomqc_support.accept_command(p_attempt_id uuid,p_audience uuid,p_operation text,
  p_target text,p_request_key text,p_payload_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $fn$
DECLARE a auth.users%ROWTYPE;u public.users%ROWTYPE;s auth.sessions%ROWTYPE;
  r private.platform_support_acceptances%ROWTYPE;sid uuid;jwt_until timestamptz;checked_at timestamptz;until_at timestamptz;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR COALESCE(auth.jwt()->>'session_id','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR COALESCE(auth.jwt()->>'exp','')!~'^[0-9]{1,12}$' THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ACCEPTANCE_ACTOR_REQUIRED' USING ERRCODE='42501';END IF;
  IF p_attempt_id IS NULL OR p_audience IS NULL OR p_operation IS NULL OR p_operation NOT IN
    ('cluster_command','register_cluster','acknowledge_alert','recheck_workspace','reconcile_workspace')
    OR p_target IS NULL OR length(p_target) NOT BETWEEN 2 AND 48 OR p_target!~'^[a-z0-9][a-z0-9-]*$'
    OR p_request_key IS NULL OR p_request_key!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR p_payload_sha256 IS NULL OR p_payload_sha256!~'^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_SUPPORT_ACCEPTANCE_CONTEXT' USING ERRCODE='22023';END IF;
  sid:=(auth.jwt()->>'session_id')::uuid;jwt_until:=to_timestamp((auth.jwt()->>'exp')::double precision);
  -- Match the application's lock order: Auth -> profile -> role -> session.
  -- Concurrent lock/ban/delete/role removal/logout must commit either before
  -- these live reads or after this acceptance transaction releases its locks.
  SELECT * INTO a FROM auth.users WHERE id=auth.uid() FOR SHARE;
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.email_confirmed_at IS NULL OR a.banned_until>clock_timestamp() THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ACCEPTANCE_ACTOR_REQUIRED' USING ERRCODE='42501';END IF;
  SELECT * INTO u FROM public.users WHERE id=a.id FOR SHARE;
  IF NOT FOUND OR u.status IS DISTINCT FROM 'active' OR u.deleted_at IS NOT NULL OR COALESCE(u.account_locked,false) THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ACCEPTANCE_ACTOR_REQUIRED' USING ERRCODE='42501';END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=a.id AND role::text='super_admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_SUPPORT_ACCEPTANCE_ACTOR_REQUIRED' USING ERRCODE='42501';END IF;
  SELECT * INTO s FROM auth.sessions WHERE id=sid AND user_id=a.id FOR SHARE;
  IF NOT FOUND OR s.not_after<=clock_timestamp() OR jwt_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ACCEPTANCE_ACTOR_REQUIRED' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('support-acceptance:'||a.id||':'||sid||':'||p_attempt_id,0));
  SELECT * INTO r FROM private.platform_support_acceptances WHERE actor_id=a.id AND session_id=sid AND attempt_id=p_attempt_id;
  IF FOUND THEN
    IF r.audience<>p_audience OR r.operation<>p_operation OR r.target<>p_target OR r.request_key<>p_request_key OR r.payload_sha256<>p_payload_sha256 THEN
      RAISE EXCEPTION 'SUPPORT_ACCEPTANCE_CONTEXT_CONFLICT' USING ERRCODE='22023';END IF;
  ELSE
    checked_at:=clock_timestamp();until_at:=LEAST(checked_at+interval '5 seconds',s.not_after,jwt_until);
    IF until_at<=checked_at THEN RAISE EXCEPTION 'SUPPORT_ACCEPTANCE_EXPIRED' USING ERRCODE='55000';END IF;
    INSERT INTO private.platform_support_acceptances(actor_id,session_id,attempt_id,audience,operation,target,request_key,payload_sha256,accepted_at,expires_at)
      VALUES(a.id,sid,p_attempt_id,p_audience,p_operation,p_target,p_request_key,p_payload_sha256,checked_at,until_at) RETURNING * INTO r;
  END IF;
  -- Recheck wall time after all waits/audit hooks. Replays never renew a lease.
  IF r.expires_at<=clock_timestamp() OR s.not_after<=clock_timestamp() OR jwt_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'SUPPORT_ACCEPTANCE_EXPIRED' USING ERRCODE='55000';END IF;
  RETURN jsonb_build_object('protocolVersion',1,'acceptanceId',r.id,'actorId',r.actor_id,'sessionId',r.session_id,
    'attemptId',r.attempt_id,'audience',r.audience,'operation',r.operation,'target',r.target,'requestKey',r.request_key,
    'payloadSha256',r.payload_sha256,'acceptedAtMs',floor(extract(epoch FROM r.accepted_at)*1000)::bigint,
    'expiresAtMs',floor(extract(epoch FROM r.expires_at)*1000)::bigint);
END;
$fn$;
REVOKE ALL ON FUNCTION roomqc_support.accept_command(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION roomqc_support.accept_command(uuid,uuid,text,text,text,text) TO authenticated;

-- The public API is an invoker wrapper; the narrow definer stays in a schema
-- not exposed by PostgREST. No private-table or generic privileged grants.
CREATE FUNCTION public.accept_platform_support_command(p_attempt_id uuid,p_audience uuid,p_operation text,
  p_target text,p_request_key text,p_payload_sha256 text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT roomqc_support.accept_command(p_attempt_id,p_audience,p_operation,p_target,p_request_key,p_payload_sha256);
$fn$;
REVOKE ALL ON FUNCTION public.accept_platform_support_command(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_platform_support_command(uuid,uuid,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
