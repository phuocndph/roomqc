-- AI usage is a server entitlement, separate from editable tenant settings.
-- No existing tenant is enabled or charged by this forward migration.
CREATE TABLE private.operations_advice_policy (
  tenant_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 1 AND 100000),
  daily_budget_units integer NOT NULL CHECK(daily_budget_units BETWEEN 1 AND 100000000),
  units_per_request integer NOT NULL CHECK(units_per_request BETWEEN 1 AND daily_budget_units),
  valid_until timestamptz NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.operations_advice_commands (
  actor_id uuid NOT NULL, command_id uuid NOT NULL, tenant_id uuid NOT NULL,
  hotel_id uuid, request jsonb NOT NULL, session_id uuid NOT NULL,
  jwt_expires_at timestamptz NOT NULL, hotel_ids uuid[] NOT NULL,
  policy_version bigint NOT NULL, quota_day date NOT NULL,
  units integer NOT NULL CHECK(units>=0),
  state text NOT NULL CHECK(state IN('reserved','dispatched','unknown','completed','cancelled')),
  context jsonb, context_hash text, reserved_until timestamptz NOT NULL,
  dispatch_token uuid, dispatched_at timestamptz, deadline timestamptz,
  advice jsonb, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,command_id),
  CHECK((context IS NULL)=(context_hash IS NULL)),
  CHECK(context_hash IS NULL OR context_hash~'^[a-f0-9]{64}$'),
  CHECK((state IN('dispatched','unknown','completed'))=(dispatch_token IS NOT NULL)),
  CHECK((state='completed')=(advice IS NOT NULL)),
  CHECK((state IN('completed','cancelled'))=(completed_at IS NOT NULL))
);
CREATE INDEX operations_advice_quota ON private.operations_advice_commands(tenant_id,quota_day,state);
ALTER TABLE private.operations_advice_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operations_advice_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operations_advice_policy,private.operations_advice_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operations_advice_actor(p_actor uuid,p_session uuid,p_expiry timestamptz)
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE a auth.users%ROWTYPE;u public.users%ROWTYPE;s auth.sessions%ROWTYPE;v_role text;
BEGIN
  IF p_actor IS NULL OR p_session IS NULL OR p_expiry IS NULL OR p_expiry<=clock_timestamp() THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM auth.users WHERE id=p_actor FOR SHARE;
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.email_confirmed_at IS NULL
    OR a.banned_until>clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
  IF NOT FOUND OR u.tenant_id IS NULL OR u.status IS DISTINCT FROM 'active' OR u.deleted_at IS NOT NULL
    OR COALESCE(u.account_locked,false) OR COALESCE(u.is_super_admin,false) THEN
    RAISE EXCEPTION 'ADVICE_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=p_actor ORDER BY role FOR SHARE;
  v_role:=CASE u.user_level_code WHEN 'tenant_owner' THEN 'owner' WHEN 'manager' THEN 'hotel_manager'
    WHEN 'hotel_manager' THEN 'hotel_manager' WHEN 'department_manager' THEN 'department_manager' WHEN 'staff' THEN 'staff' END;
  IF v_role IS NULL OR u.role::text IS DISTINCT FROM v_role
    OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text=v_role)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text='super_admin') THEN
    RAISE EXCEPTION 'ADVICE_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM auth.sessions WHERE user_id=p_actor AND id=p_session FOR SHARE;
  IF NOT FOUND OR s.not_after<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.user_hotels WHERE user_id=p_actor ORDER BY hotel_id FOR SHARE;
  PERFORM 1 FROM public.user_permissions WHERE user_id=p_actor ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code IN(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id=p_actor)
      AND r.tenant_id IN(u.tenant_id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND p.module='reports' AND p.action='view' ORDER BY r.id,p.id FOR SHARE OF r,rp,p;
  IF NOT public.has_user_permission(p_actor,'reports','view') THEN
    RAISE EXCEPTION 'ADVICE_REPORT_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_expiry<=clock_timestamp() OR s.not_after<=clock_timestamp() THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN u;
END;
$fn$;
REVOKE ALL ON FUNCTION private.operations_advice_actor(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operations_advice_hotels(p_actor public.users,p_hotel uuid)
RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE ids uuid[];
BEGIN
  PERFORM 1 FROM public.hotels h WHERE h.tenant_id=p_actor.tenant_id AND h.status='active'
    AND (p_hotel IS NULL OR h.id=p_hotel) AND (p_actor.user_level_code='tenant_owner'
      OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=p_actor.id AND uh.hotel_id=h.id)) ORDER BY h.id FOR SHARE;
  SELECT COALESCE(array_agg(h.id ORDER BY h.id),'{}') INTO ids FROM public.hotels h WHERE h.tenant_id=p_actor.tenant_id AND h.status='active'
    AND (p_hotel IS NULL OR h.id=p_hotel) AND (p_actor.user_level_code='tenant_owner'
      OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=p_actor.id AND uh.hotel_id=h.id));
  IF cardinality(ids)=0 OR(p_hotel IS NOT NULL AND NOT p_hotel=ANY(ids)) THEN
    RAISE EXCEPTION 'ADVICE_HOTEL_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  RETURN ids;
END;
$fn$;
REVOKE ALL ON FUNCTION private.operations_advice_hotels(public.users,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operations_advice_entitlement(p_tenant uuid,p_reserve boolean)
RETURNS private.operations_advice_policy LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE t public.tenants%ROWTYPE;p private.operations_advice_policy%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tenants WHERE id=p_tenant FOR SHARE;
  IF NOT FOUND OR t.is_read_only IS DISTINCT FROM false OR COALESCE(t.subscription_status,'') NOT IN('active','trial')
    OR(t.subscription_status='trial' AND(t.trial_ends_at IS NULL OR t.trial_ends_at<=clock_timestamp()))
    OR(t.subscription_status='active' AND(t.subscription_end_date IS NULL OR t.subscription_end_date<(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) THEN
    RAISE EXCEPTION 'ADVICE_TENANT_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_reserve THEN SELECT * INTO p FROM private.operations_advice_policy WHERE tenant_id=p_tenant FOR UPDATE;
  ELSE SELECT * INTO p FROM private.operations_advice_policy WHERE tenant_id=p_tenant FOR SHARE; END IF;
  IF p.tenant_id IS NULL OR NOT p.enabled OR p.valid_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
  RETURN p;
END;
$fn$;
REVOKE ALL ON FUNCTION private.operations_advice_entitlement(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.configure_operations_advice_policy(p_tenant_id uuid,p_enabled boolean,p_daily_limit integer,
  p_daily_budget_units integer,p_units_per_request integer,p_valid_until timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE old_value jsonb;new_value jsonb;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ADVICE_OPERATOR_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR p_enabled IS NULL OR p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 100000
    OR p_daily_budget_units IS NULL OR p_daily_budget_units NOT BETWEEN 1 AND 100000000
    OR p_units_per_request IS NULL OR p_units_per_request NOT BETWEEN 1 AND p_daily_budget_units
    OR p_valid_until IS NULL OR p_valid_until<=clock_timestamp() OR p_valid_until>clock_timestamp()+interval '366 days'
    OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_ADVICE_POLICY' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ADVICE_POLICY' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('operations-advice-policy:'||p_tenant_id,0));
  SELECT to_jsonb(p) INTO old_value FROM private.operations_advice_policy p WHERE tenant_id=p_tenant_id FOR UPDATE;
  INSERT INTO private.operations_advice_policy(tenant_id,enabled,daily_limit,daily_budget_units,units_per_request,valid_until,reason)
    VALUES(p_tenant_id,p_enabled,p_daily_limit,p_daily_budget_units,p_units_per_request,p_valid_until,trim(p_reason))
    ON CONFLICT(tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled,daily_limit=EXCLUDED.daily_limit,
      daily_budget_units=EXCLUDED.daily_budget_units,units_per_request=EXCLUDED.units_per_request,valid_until=EXCLUDED.valid_until,
      reason=EXCLUDED.reason,version=private.operations_advice_policy.version+1,updated_at=clock_timestamp();
  SELECT to_jsonb(p) INTO new_value FROM private.operations_advice_policy p WHERE tenant_id=p_tenant_id;
  INSERT INTO public.activity_logs(tenant_id,user_name,entity_type,entity_id,entity_name,action,description,old_values,new_values)
    VALUES(p_tenant_id,'RoomQC Control','operations_advice_policy',p_tenant_id,'AI entitlement','update',trim(p_reason),old_value,new_value);
  RETURN new_value;
END;
$fn$;
REVOKE ALL ON FUNCTION public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text) TO service_role;

CREATE FUNCTION private.operations_advice_receipt(c private.operations_advice_commands)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT jsonb_build_object('version',1,'command_id',c.command_id,'request',c.request,
    'state',CASE WHEN c.state='dispatched' THEN 'unknown' ELSE c.state END,
    'context_hash',c.context_hash,'advice',c.advice);
$fn$;
REVOKE ALL ON FUNCTION private.operations_advice_receipt(private.operations_advice_commands) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.request_operations_advice(p_action text,p_command uuid,p_start date,p_end date,p_hotel uuid,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.users%ROWTYPE;p private.operations_advice_policy%ROWTYPE;c private.operations_advice_commands%ROWTYPE;
  ids uuid[];r jsonb;ctx jsonb;ops jsonb;labor jsonb;targets jsonb:='{}';req jsonb;used_count bigint;used_units bigint;
  expiry timestamptz;v_session_id uuid;day date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_room_transition_session();v_session_id:=(auth.jwt()->>'session_id')::uuid;expiry:=to_timestamp((auth.jwt()->>'exp')::double precision);
  a:=private.operations_advice_actor(auth.uid(),v_session_id,expiry);
  IF p_action IS NULL OR p_action NOT IN('prepare','lookup','cancel') OR p_command IS NULL THEN
    RAISE EXCEPTION 'INVALID_ADVICE_REQUEST' USING ERRCODE='22023'; END IF;
  IF p_action<>'lookup' AND(p_start IS NULL OR p_end IS NULL OR p_start<date '1901-01-01' OR p_end>date '2100-12-31'
    OR p_end<p_start OR p_end-p_start>365 OR p_timezone IS NULL OR length(p_timezone)>100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone)) THEN
    RAISE EXCEPTION 'INVALID_ADVICE_REQUEST' USING ERRCODE='22023'; END IF;
  p:=private.operations_advice_entitlement(a.tenant_id,p_action='prepare');
  PERFORM pg_advisory_xact_lock(hashtextextended('operations-advice:'||a.id||':'||p_command,0));
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=a.id AND command_id=p_command FOR UPDATE;
  IF p_action='lookup' THEN
    IF c.actor_id IS NULL THEN RETURN jsonb_build_object('version',1,'command_id',p_command,'state','not_found'); END IF;
    IF c.tenant_id IS DISTINCT FROM a.tenant_id THEN RAISE EXCEPTION 'ADVICE_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    ids:=private.operations_advice_hotels(a,c.hotel_id);
    IF c.hotel_ids IS DISTINCT FROM ids THEN RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
    PERFORM private.assert_room_transition_session();
    IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
    RETURN private.operations_advice_receipt(c);
  END IF;
  ids:=private.operations_advice_hotels(a,p_hotel);
  req:=jsonb_build_object('start',p_start,'end',p_end,'hotel',p_hotel,'timezone',p_timezone);
  IF c.actor_id IS NOT NULL THEN
    IF c.tenant_id IS DISTINCT FROM a.tenant_id OR c.request IS DISTINCT FROM req THEN
      RAISE EXCEPTION 'ADVICE_COMMAND_CONFLICT' USING ERRCODE='PT409'; END IF;
    IF c.hotel_ids IS DISTINCT FROM ids THEN RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
    IF p_action='cancel' AND c.state='reserved' THEN
      UPDATE private.operations_advice_commands SET state='cancelled',completed_at=clock_timestamp() WHERE actor_id=a.id AND command_id=p_command RETURNING * INTO c;
      INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description,new_values)
        VALUES(a.tenant_id,a.id,a.full_name,'operations_advice',p_command,'Operations advice','update','Hủy yêu cầu chưa gửi',jsonb_build_object('state','cancelled'));
    END IF;
    -- Refresh/relogin may resume a reservation, never reopen a dispatch.
    IF p_action='prepare' AND c.state='reserved' AND c.reserved_until>clock_timestamp() THEN
      UPDATE private.operations_advice_commands SET session_id=v_session_id,jwt_expires_at=expiry WHERE actor_id=a.id AND command_id=p_command RETURNING * INTO c;
    END IF;
    PERFORM private.assert_room_transition_session();
    IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
    RETURN private.operations_advice_receipt(c);
  END IF;
  IF p_action='cancel' THEN
    INSERT INTO private.operations_advice_commands(actor_id,command_id,tenant_id,hotel_id,request,session_id,jwt_expires_at,
      hotel_ids,policy_version,quota_day,units,state,reserved_until,completed_at)
      VALUES(a.id,p_command,a.tenant_id,p_hotel,req,v_session_id,expiry,ids,p.version,day,0,'cancelled',clock_timestamp(),clock_timestamp()) RETURNING * INTO c;
  ELSE
    day:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
    SELECT count(*),COALESCE(sum(units),0) INTO used_count,used_units FROM private.operations_advice_commands
      WHERE tenant_id=a.tenant_id AND quota_day=day AND(state IN('dispatched','unknown','completed') OR(state='reserved' AND reserved_until>clock_timestamp()));
    IF used_count>=p.daily_limit OR used_units+p.units_per_request>p.daily_budget_units THEN
      RAISE EXCEPTION 'ADVICE_QUOTA_EXCEEDED' USING ERRCODE='PT429'; END IF;
    -- Source selected only by live actor, assigned hotel and bounded period.
    ops:=private.read_operations_report(p_hotel,p_start,p_end,NULL,NULL,p_timezone);
    labor:=private.read_labor_cost_report(NULL,p_hotel,p_start,p_end,p_timezone);
    IF p_start=date_trunc('month',p_start)::date AND date_trunc('month',p_start)=date_trunc('month',p_end)
      AND(p_hotel IS NOT NULL OR a.user_level_code='tenant_owner') THEN
      targets:=private.get_report_targets('financial',p_start,p_hotel);
      IF(targets->>'review_required')::boolean THEN RAISE EXCEPTION 'ADVICE_TARGET_REVIEW_REQUIRED' USING ERRCODE='PT409'; END IF;
      targets:=targets->'values';
    END IF;
    ctx:=jsonb_build_object('version',1,'period',req,'capacity',ops->'capacity','methods',ops->'methods',
      'current',ops->'current','previous',ops->'previous','year_ago',ops->'year_ago',
      'labor_estimate',labor->'total_labor_cost','labor_is_estimate',true,'targets',targets,
      'targets_applicable',p_start=date_trunc('month',p_start)::date AND date_trunc('month',p_start)=date_trunc('month',p_end)
        AND(p_hotel IS NOT NULL OR a.user_level_code='tenant_owner'),'recognition_timezone',p_timezone);
    IF octet_length(ctx::text)>32768 THEN RAISE EXCEPTION 'ADVICE_CONTEXT_TOO_LARGE' USING ERRCODE='22023'; END IF;
    INSERT INTO private.operations_advice_commands(actor_id,command_id,tenant_id,hotel_id,request,session_id,jwt_expires_at,
      hotel_ids,policy_version,quota_day,units,state,context,context_hash,reserved_until)
      VALUES(a.id,p_command,a.tenant_id,p_hotel,req,v_session_id,expiry,ids,p.version,day,p.units_per_request,'reserved',
        ctx,encode(extensions.digest(ctx::text,'sha256'),'hex'),clock_timestamp()+interval '120 seconds') RETURNING * INTO c;
  END IF;
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,action,description,new_values)
    VALUES(a.tenant_id,a.id,a.full_name,a.role,'operations_advice',p_command,'Operations advice','update','Ghi nhận yêu cầu tư vấn',
      jsonb_build_object('state',c.state,'units',c.units,'context_hash',c.context_hash));
  PERFORM private.assert_room_transition_session();
  IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
  RETURN private.operations_advice_receipt(c);
END;
$fn$;
REVOKE ALL ON FUNCTION private.request_operations_advice(text,uuid,date,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_operations_advice(text,uuid,date,date,uuid,text) TO authenticated;
CREATE FUNCTION public.prepare_operations_advice(p_command_id uuid,p_start_date date,p_end_date date,p_hotel_id uuid DEFAULT NULL,p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.request_operations_advice('prepare',p_command_id,p_start_date,p_end_date,p_hotel_id,p_timezone);
$fn$;
CREATE FUNCTION public.get_operations_advice_command(p_command_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.request_operations_advice('lookup',p_command_id,NULL,NULL,NULL,NULL);
$fn$;
CREATE FUNCTION public.cancel_operations_advice(p_command_id uuid,p_start_date date,p_end_date date,p_hotel_id uuid DEFAULT NULL,p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.request_operations_advice('cancel',p_command_id,p_start_date,p_end_date,p_hotel_id,p_timezone);
$fn$;
REVOKE ALL ON FUNCTION public.prepare_operations_advice(uuid,date,date,uuid,text),public.get_operations_advice_command(uuid),public.cancel_operations_advice(uuid,date,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_operations_advice(uuid,date,date,uuid,text),public.get_operations_advice_command(uuid),public.cancel_operations_advice(uuid,date,date,uuid,text) TO authenticated;

CREATE FUNCTION private.valid_operations_advice(p_advice jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE e jsonb;k text;
BEGIN
  IF p_advice IS NULL OR jsonb_typeof(p_advice)<>'array' OR jsonb_array_length(p_advice) NOT BETWEEN 3 AND 5 OR octet_length(p_advice::text)>16384 THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_advice) LOOP
    IF jsonb_typeof(e)<>'object' OR NOT e ?& ARRAY['title','description','action','priority']
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) x WHERE x NOT IN('title','description','action','priority','impactVnd'))
      OR e->>'priority' NOT IN('high','medium','low') THEN RETURN false; END IF;
    FOREACH k IN ARRAY ARRAY['title','description','action','priority'] LOOP
      IF jsonb_typeof(e->k)<>'string' OR length(trim(e->>k))<1 OR length(e->>k)>1000 THEN RETURN false; END IF;
    END LOOP;
    IF length(e->>'title')>120 THEN RETURN false; END IF;
    IF e ? 'impactVnd' THEN
      IF jsonb_typeof(e->'impactVnd')<>'number' THEN RETURN false; END IF;
      IF(e->>'impactVnd')::numeric<0 OR(e->>'impactVnd')::numeric>999999999999.99 THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION private.valid_operations_advice(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.dispatch_operations_advice(p_actor_id uuid,p_command_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.users%ROWTYPE;p private.operations_advice_policy%ROWTYPE;c private.operations_advice_commands%ROWTYPE;ids uuid[];
  day date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;used_count bigint;used_units bigint;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ADVICE_WORKER_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id;
  IF NOT FOUND OR c.session_id IS DISTINCT FROM p_session_id THEN RAISE EXCEPTION 'ADVICE_COMMAND_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  a:=private.operations_advice_actor(p_actor_id,c.session_id,c.jwt_expires_at);
  IF a.tenant_id IS DISTINCT FROM c.tenant_id THEN RAISE EXCEPTION 'ADVICE_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  p:=private.operations_advice_entitlement(c.tenant_id,true);ids:=private.operations_advice_hotels(a,c.hotel_id);
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id FOR UPDATE;
  IF c.session_id IS DISTINCT FROM p_session_id OR c.hotel_ids IS DISTINCT FROM ids THEN
    RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF c.state<>'reserved' THEN RETURN private.operations_advice_receipt(c); END IF;
  IF c.reserved_until<=clock_timestamp() OR c.policy_version<>p.version THEN
    UPDATE private.operations_advice_commands SET state='cancelled',completed_at=clock_timestamp() WHERE actor_id=p_actor_id AND command_id=p_command_id RETURNING * INTO c;
    INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description,new_values)
      VALUES(a.tenant_id,a.id,a.full_name,'operations_advice',p_command_id,'Operations advice','update','Hủy lần giữ hạn mức đã hết hiệu lực',jsonb_build_object('state','cancelled'));
    RETURN private.operations_advice_receipt(c);
  END IF;
  IF c.jwt_expires_at<=clock_timestamp() OR p.valid_until<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  day:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
  IF c.quota_day<>day THEN
    SELECT count(*),COALESCE(sum(units),0) INTO used_count,used_units FROM private.operations_advice_commands
      WHERE tenant_id=c.tenant_id AND quota_day=day AND(state IN('dispatched','unknown','completed') OR(state='reserved' AND reserved_until>clock_timestamp()));
    IF used_count>=p.daily_limit OR used_units+c.units>p.daily_budget_units THEN
      RAISE EXCEPTION 'ADVICE_QUOTA_EXCEEDED' USING ERRCODE='PT429'; END IF;
  END IF;
  UPDATE private.operations_advice_commands SET state='dispatched',dispatch_token=gen_random_uuid(),dispatched_at=clock_timestamp(),
    quota_day=day,deadline=least(clock_timestamp()+interval '60 seconds',jwt_expires_at,p.valid_until)
    WHERE actor_id=p_actor_id AND command_id=p_command_id RETURNING * INTO c;
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description,new_values)
    VALUES(a.tenant_id,a.id,a.full_name,'operations_advice',p_command_id,'Operations advice','update','Bắt đầu lần tư vấn đã giữ hạn mức',jsonb_build_object('state','dispatched','units',c.units));
  IF day<>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'ADVICE_DAY_CHANGED' USING ERRCODE='PT409'; END IF;
  IF c.deadline<=clock_timestamp() OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version',1,'state','dispatch','command_id',c.command_id,'dispatch_token',c.dispatch_token,
    'context',c.context,'context_hash',c.context_hash,'deadline',c.deadline);
END;
$fn$;
REVOKE ALL ON FUNCTION public.dispatch_operations_advice(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_operations_advice(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.finish_operations_advice(p_actor_id uuid,p_command_id uuid,p_dispatch_token uuid,p_advice jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.users%ROWTYPE;p private.operations_advice_policy%ROWTYPE;c private.operations_advice_commands%ROWTYPE;ids uuid[];
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ADVICE_WORKER_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id;
  IF NOT FOUND OR c.dispatch_token IS NULL OR c.dispatch_token IS DISTINCT FROM p_dispatch_token THEN
    RAISE EXCEPTION 'ADVICE_DISPATCH_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  -- Unknown is a machine observation, never authority to resend or refund quota.
  IF p_advice IS NULL THEN
    SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id FOR UPDATE;
    IF c.dispatch_token IS DISTINCT FROM p_dispatch_token THEN RAISE EXCEPTION 'ADVICE_DISPATCH_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    IF c.state='dispatched' THEN
      UPDATE private.operations_advice_commands SET state='unknown' WHERE actor_id=p_actor_id AND command_id=p_command_id RETURNING * INTO c;
    END IF;
    RETURN jsonb_build_object('version',1,'command_id',c.command_id,'state',CASE WHEN c.state='completed' THEN 'completed' ELSE 'unknown' END);
  END IF;
  IF NOT private.valid_operations_advice(p_advice) THEN RAISE EXCEPTION 'INVALID_ADVICE_OUTPUT' USING ERRCODE='22023'; END IF;
  a:=private.operations_advice_actor(p_actor_id,c.session_id,c.jwt_expires_at);
  IF a.tenant_id IS DISTINCT FROM c.tenant_id THEN RAISE EXCEPTION 'ADVICE_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  p:=private.operations_advice_entitlement(c.tenant_id,false);ids:=private.operations_advice_hotels(a,c.hotel_id);
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=p_actor_id AND command_id=p_command_id FOR UPDATE;
  IF c.hotel_ids IS DISTINCT FROM ids THEN RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF c.state='completed' THEN
    IF c.advice IS DISTINCT FROM p_advice THEN RAISE EXCEPTION 'ADVICE_RESULT_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN private.operations_advice_receipt(c);
  END IF;
  IF c.state NOT IN('dispatched','unknown') OR c.deadline<=clock_timestamp() OR c.jwt_expires_at<=clock_timestamp()
    OR p.valid_until<=clock_timestamp() OR c.policy_version<>p.version
    OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ADVICE_DISPATCH_EXPIRED' USING ERRCODE='PT409'; END IF;
  UPDATE private.operations_advice_commands SET state='completed',advice=p_advice,completed_at=clock_timestamp()
    WHERE actor_id=p_actor_id AND command_id=p_command_id RETURNING * INTO c;
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description,new_values)
    VALUES(a.tenant_id,a.id,a.full_name,'operations_advice',p_command_id,'Operations advice','update','Lưu kết quả tư vấn',jsonb_build_object('state','completed','context_hash',c.context_hash));
  IF c.deadline<=clock_timestamp() OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN private.operations_advice_receipt(c);
END;
$fn$;
REVOKE ALL ON FUNCTION public.finish_operations_advice(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_operations_advice(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
