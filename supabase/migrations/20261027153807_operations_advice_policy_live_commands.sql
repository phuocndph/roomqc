-- Policy administration is a live platform-user command, never a service key
-- configuring an entitlement without an attributable current operator.
-- No policy is created/enabled and no advice charge/fence is rewritten here.
CREATE TABLE private.operations_advice_policy_commands (
  actor_id uuid NOT NULL, command_id uuid NOT NULL, tenant_id uuid NOT NULL,
  expected_version bigint NOT NULL CHECK(expected_version BETWEEN 0 AND 9007199254740991),
  request jsonb NOT NULL, request_hash text NOT NULL CHECK(request_hash~'^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN('succeeded','cancelled')), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,command_id),
  CHECK(result->>'state'=state AND result->>'command_id'=command_id::text AND result->>'tenant_id'=tenant_id::text)
);
-- Fences intentionally survive deletion of a profile/tenant identity. Retention
-- cannot turn an already used command into a new write or provider dispatch.
CREATE INDEX operations_advice_policy_commands_tenant ON private.operations_advice_policy_commands(tenant_id,created_at);
ALTER TABLE private.operations_advice_policy_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operations_advice_policy_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operations_advice_policy_operator()
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE a auth.users%ROWTYPE;u public.users%ROWTYPE;s auth.sessions%ROWTYPE;sid uuid;expiry timestamptz;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR COALESCE(auth.jwt()->>'session_id','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR COALESCE(auth.jwt()->>'exp','')!~'^[0-9]{1,12}$' THEN
    RAISE EXCEPTION 'ADVICE_POLICY_OPERATOR_REQUIRED' USING ERRCODE='42501'; END IF;
  sid:=(auth.jwt()->>'session_id')::uuid;expiry:=to_timestamp((auth.jwt()->>'exp')::double precision);
  SELECT * INTO a FROM auth.users WHERE id=auth.uid() FOR SHARE;
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.email_confirmed_at IS NULL OR a.banned_until>clock_timestamp() THEN
    RAISE EXCEPTION 'ADVICE_POLICY_OPERATOR_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO u FROM public.users WHERE id=a.id FOR SHARE;
  IF NOT FOUND OR u.status IS DISTINCT FROM 'active' OR u.deleted_at IS NOT NULL OR COALESCE(u.account_locked,false) THEN
    RAISE EXCEPTION 'ADVICE_POLICY_OPERATOR_REQUIRED' USING ERRCODE='42501'; END IF;
  -- Canonical platform capability matches platform_support_actor: server-owned
  -- user_roles, not editable metadata, profile flags or caller-supplied actor IDs.
  PERFORM 1 FROM public.user_roles WHERE user_id=u.id ORDER BY role FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u.id AND role::text='super_admin') THEN
    RAISE EXCEPTION 'ADVICE_POLICY_OPERATOR_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM auth.sessions WHERE id=sid AND user_id=u.id FOR SHARE;
  IF NOT FOUND OR s.not_after<=clock_timestamp() OR expiry<=clock_timestamp() THEN
    RAISE EXCEPTION 'ADVICE_POLICY_OPERATOR_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN u;
END;
$fn$;
REVOKE ALL ON FUNCTION private.operations_advice_policy_operator() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operations_advice_policy_command(p_action text,p_tenant uuid,p_command uuid,p_expected bigint,p_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.users%ROWTYPE;c private.operations_advice_policy_commands%ROWTYPE;p private.operations_advice_policy%ROWTYPE;
  enabled boolean;daily integer;budget integer;units integer;until_at timestamptz;reason text;
  body jsonb;request jsonb;digest text;old_value jsonb;result jsonb;
BEGIN
  a:=private.operations_advice_policy_operator();
  IF p_action IS NULL OR p_action NOT IN('read','apply','lookup','cancel') OR p_tenant IS NULL
    OR(p_action<>'read' AND p_command IS NULL) THEN
    RAISE EXCEPTION 'INVALID_ADVICE_POLICY_COMMAND' USING ERRCODE='22023'; END IF;
  IF p_action<>'read' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('operations-advice-policy-command:'||a.id||':'||p_command,0));
  END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ADVICE_POLICY_TENANT' USING ERRCODE='22023'; END IF;
  PERFORM private.operations_advice_policy_operator();
  IF p_action='read' THEN
    SELECT * INTO p FROM private.operations_advice_policy WHERE tenant_id=p_tenant FOR SHARE;
    result:=jsonb_build_object('version',1,'tenant_id',p_tenant,'revision',COALESCE(p.version,0),
      'policy',CASE WHEN p.tenant_id IS NULL THEN NULL ELSE to_jsonb(p) END);
    PERFORM private.operations_advice_policy_operator();RETURN result;
  END IF;
  SELECT * INTO c FROM private.operations_advice_policy_commands WHERE actor_id=a.id AND command_id=p_command FOR UPDATE;
  PERFORM private.operations_advice_policy_operator();
  IF p_action='lookup' THEN
    IF c.actor_id IS NULL THEN RETURN jsonb_build_object('version',1,'tenant_id',p_tenant,'command_id',p_command,'state','not_found'); END IF;
    IF c.tenant_id IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'ADVICE_POLICY_COMMAND_SCOPE' USING ERRCODE='42501'; END IF;
    RETURN c.result;
  END IF;
  IF p_expected IS NULL OR p_expected NOT BETWEEN 0 AND 9007199254740991 OR p_policy IS NULL
    OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object' OR octet_length(p_policy::text)>8192
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_policy) k)
      IS DISTINCT FROM ARRAY['daily_budget_units','daily_limit','enabled','reason','units_per_request','valid_until']::text[]
    OR jsonb_typeof(p_policy->'enabled') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_policy->'daily_limit') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_policy->'daily_budget_units') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_policy->'units_per_request') IS DISTINCT FROM 'number'
    OR COALESCE(p_policy->>'daily_limit','')!~'^[0-9]{1,9}$'
    OR COALESCE(p_policy->>'daily_budget_units','')!~'^[0-9]{1,9}$'
    OR COALESCE(p_policy->>'units_per_request','')!~'^[0-9]{1,9}$'
    OR jsonb_typeof(p_policy->'reason') IS DISTINCT FROM 'string'
    OR length(trim(p_policy->>'reason')) NOT BETWEEN 5 AND 1000
    OR jsonb_typeof(p_policy->'valid_until') IS DISTINCT FROM 'string'
    OR length(p_policy->>'valid_until')>100
    OR(p_policy->>'valid_until')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RAISE EXCEPTION 'INVALID_ADVICE_POLICY' USING ERRCODE='22023'; END IF;
  enabled:=(p_policy->>'enabled')::boolean;daily:=(p_policy->>'daily_limit')::integer;
  budget:=(p_policy->>'daily_budget_units')::integer;units:=(p_policy->>'units_per_request')::integer;reason:=trim(p_policy->>'reason');
  BEGIN until_at:=(p_policy->>'valid_until')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'INVALID_ADVICE_POLICY' USING ERRCODE='22023'; END;
  IF NOT isfinite(until_at) OR daily NOT BETWEEN 1 AND 100000 OR budget NOT BETWEEN 1 AND 100000000
    OR units NOT BETWEEN 1 AND budget THEN RAISE EXCEPTION 'INVALID_ADVICE_POLICY' USING ERRCODE='22023'; END IF;
  body:=jsonb_build_object('enabled',enabled,'daily_limit',daily,'daily_budget_units',budget,'units_per_request',units,
    'valid_until',to_char(until_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'reason',reason);
  request:=jsonb_build_object('tenant_id',p_tenant,'expected_version',p_expected,'policy',body);
  digest:=encode(extensions.digest(request::text,'sha256'),'hex');
  IF c.actor_id IS NOT NULL THEN
    IF c.tenant_id IS DISTINCT FROM p_tenant OR c.request_hash IS DISTINCT FROM digest OR c.request IS DISTINCT FROM request THEN
      RAISE EXCEPTION 'ADVICE_POLICY_COMMAND_CONFLICT' USING ERRCODE='PT409'; END IF;
    PERFORM private.operations_advice_policy_operator();RETURN c.result;
  END IF;
  IF p_action='cancel' THEN
    result:=jsonb_build_object('version',1,'tenant_id',p_tenant,'command_id',p_command,'state','cancelled');
    INSERT INTO private.operations_advice_policy_commands(actor_id,command_id,tenant_id,expected_version,request,request_hash,state,result)
      VALUES(a.id,p_command,p_tenant,p_expected,request,digest,'cancelled',result);
    INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,action,description,new_values)
      VALUES(p_tenant,a.id,a.full_name,'super_admin','operations_advice_policy',p_command,'AI policy command','update',reason,
        jsonb_build_object('command_id',p_command,'state','cancelled','expected_version',p_expected));
    PERFORM private.operations_advice_policy_operator();RETURN result;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('operations-advice-policy:'||p_tenant,0));
  SELECT * INTO p FROM private.operations_advice_policy WHERE tenant_id=p_tenant FOR UPDATE;
  PERFORM private.operations_advice_policy_operator();
  IF COALESCE(p.version,0)<>p_expected THEN RAISE EXCEPTION 'ADVICE_POLICY_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF enabled AND(until_at<=clock_timestamp() OR until_at>clock_timestamp()+interval '366 days') THEN
    RAISE EXCEPTION 'ADVICE_POLICY_EXPIRED' USING ERRCODE='22023'; END IF;
  old_value:=CASE WHEN p.tenant_id IS NULL THEN NULL ELSE to_jsonb(p) END;
  INSERT INTO private.operations_advice_policy(tenant_id,enabled,daily_limit,daily_budget_units,units_per_request,valid_until,reason)
    VALUES(p_tenant,enabled,daily,budget,units,until_at,reason)
    ON CONFLICT(tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled,daily_limit=EXCLUDED.daily_limit,
      daily_budget_units=EXCLUDED.daily_budget_units,units_per_request=EXCLUDED.units_per_request,valid_until=EXCLUDED.valid_until,
      reason=EXCLUDED.reason,version=private.operations_advice_policy.version+1,updated_at=clock_timestamp()
    RETURNING * INTO p;
  result:=jsonb_build_object('version',1,'tenant_id',p_tenant,'command_id',p_command,'state','succeeded',
    'result',jsonb_build_object('tenant_id',p_tenant,'revision',p.version,'policy',to_jsonb(p)));
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,action,description,old_values,new_values)
    VALUES(p_tenant,a.id,a.full_name,'super_admin','operations_advice_policy',p_command,'AI entitlement','update',reason,
      old_value,jsonb_build_object('command_id',p_command,'state','succeeded','policy',to_jsonb(p)));
  INSERT INTO private.operations_advice_policy_commands(actor_id,command_id,tenant_id,expected_version,request,request_hash,state,result)
    VALUES(a.id,p_command,p_tenant,p_expected,request,digest,'succeeded',result);
  -- Audit/receipt insertion may wait. A valid input at entry is insufficient.
  PERFORM private.operations_advice_policy_operator();
  IF enabled AND(until_at<=clock_timestamp() OR until_at>clock_timestamp()+interval '366 days') THEN
    RAISE EXCEPTION 'ADVICE_POLICY_EXPIRED' USING ERRCODE='22023'; END IF;
  RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.operations_advice_policy_command(text,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.operations_advice_policy_command(text,uuid,uuid,bigint,jsonb) TO authenticated;

CREATE FUNCTION public.get_operations_advice_policy(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.operations_advice_policy_command('read',p_tenant_id,NULL,NULL,NULL);
$fn$;
CREATE FUNCTION public.set_operations_advice_policy(p_tenant_id uuid,p_command_id uuid,p_expected_version bigint,p_policy jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.operations_advice_policy_command('apply',p_tenant_id,p_command_id,p_expected_version,p_policy);
$fn$;
CREATE FUNCTION public.get_operations_advice_policy_command(p_tenant_id uuid,p_command_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.operations_advice_policy_command('lookup',p_tenant_id,p_command_id,NULL,NULL);
$fn$;
CREATE FUNCTION public.cancel_operations_advice_policy_command(p_tenant_id uuid,p_command_id uuid,p_expected_version bigint,p_policy jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.operations_advice_policy_command('cancel',p_tenant_id,p_command_id,p_expected_version,p_policy);
$fn$;
REVOKE ALL ON FUNCTION public.get_operations_advice_policy(uuid),public.set_operations_advice_policy(uuid,uuid,bigint,jsonb),
  public.get_operations_advice_policy_command(uuid,uuid),public.cancel_operations_advice_policy_command(uuid,uuid,bigint,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_operations_advice_policy(uuid),public.set_operations_advice_policy(uuid,uuid,bigint,jsonb),
  public.get_operations_advice_policy_command(uuid,uuid),public.cancel_operations_advice_policy_command(uuid,uuid,bigint,jsonb) TO authenticated;

-- A dispatch has already consumed its quota and carries its own immutable
-- fence. A later policy edit may stop an in-flight result while the policy is
-- disabled, but re-enabling must let that original dispatch finish; changing
-- policy_version must never trigger a second provider dispatch or erase the
-- existing charge. Reserved commands are still fenced by dispatch's version
-- check in the preceding migration.
CREATE OR REPLACE FUNCTION public.finish_operations_advice(p_actor_id uuid,p_command_id uuid,p_dispatch_token uuid,p_advice jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.users%ROWTYPE;p private.operations_advice_policy%ROWTYPE;c private.operations_advice_commands%ROWTYPE;ids uuid[];
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ADVICE_WORKER_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id;
  IF NOT FOUND OR c.dispatch_token IS NULL OR c.dispatch_token IS DISTINCT FROM p_dispatch_token THEN
    RAISE EXCEPTION 'ADVICE_DISPATCH_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_advice IS NULL THEN
    SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id FOR UPDATE;
    IF c.dispatch_token IS DISTINCT FROM p_dispatch_token THEN RAISE EXCEPTION 'ADVICE_DISPATCH_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    IF c.state='dispatched' THEN
      UPDATE private.operations_advice_commands SET state='unknown' WHERE actor_id=p_actor_id AND command_id=p_command_id RETURNING * INTO c;
    END IF;
    RETURN jsonb_build_object('version',1,'command_id',c.command_id,'state',CASE WHEN c.closed_at IS NOT NULL THEN 'closed_unknown' WHEN c.state='completed' THEN 'completed' ELSE 'unknown' END);
  END IF;
  IF NOT private.valid_operations_advice(p_advice) THEN RAISE EXCEPTION 'INVALID_ADVICE_OUTPUT' USING ERRCODE='22023'; END IF;
  a:=private.operations_advice_actor(p_actor_id,c.session_id,c.jwt_expires_at);
  IF a.tenant_id IS DISTINCT FROM c.tenant_id THEN RAISE EXCEPTION 'ADVICE_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  p:=private.operations_advice_entitlement(c.tenant_id,false);ids:=private.operations_advice_hotels(a,c.hotel_id);
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id FOR UPDATE;
  IF c.hotel_ids IS DISTINCT FROM ids THEN RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  PERFORM private.operations_advice_actor(p_actor_id,c.session_id,c.jwt_expires_at);
  PERFORM private.assert_operations_advice_tenant_clock(c.tenant_id);
  IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
  IF c.state='completed' THEN
    IF c.advice IS DISTINCT FROM p_advice THEN RAISE EXCEPTION 'ADVICE_RESULT_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN private.operations_advice_receipt(c);
  END IF;
  -- The dispatch fence, deadline and live entitlement still apply. The
  -- policy version is intentionally omitted: a dispatched command is not a
  -- reservation and must be finishable after a disable/re-enable cycle.
  IF c.closed_at IS NOT NULL OR c.state NOT IN('dispatched','unknown') OR c.deadline<=clock_timestamp() OR c.jwt_expires_at<=clock_timestamp()
    OR p.valid_until<=clock_timestamp() OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ADVICE_DISPATCH_EXPIRED' USING ERRCODE='PT409'; END IF;
  UPDATE private.operations_advice_commands SET state='completed',advice=p_advice,completed_at=clock_timestamp()
    WHERE actor_id=p_actor_id AND command_id=p_command_id RETURNING * INTO c;
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description,new_values)
    VALUES(a.tenant_id,a.id,a.full_name,'operations_advice',p_command_id,'Operations advice','update','Lưu kết quả tư vấn',jsonb_build_object('state','completed','context_hash',c.context_hash));
  IF c.deadline<=clock_timestamp() OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_operations_advice_tenant_clock(c.tenant_id);
  RETURN private.operations_advice_receipt(c);
END;
$fn$;
REVOKE ALL ON FUNCTION public.finish_operations_advice(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_operations_advice(uuid,uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.configure_operations_advice_policy(p_tenant_id uuid,p_enabled boolean,p_daily_limit integer,
  p_daily_budget_units integer,p_units_per_request integer,p_valid_until timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RAISE EXCEPTION 'ADVICE_POLICY_COMMAND_REQUIRED' USING ERRCODE='42501'; END;
$fn$;
REVOKE ALL ON FUNCTION public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
