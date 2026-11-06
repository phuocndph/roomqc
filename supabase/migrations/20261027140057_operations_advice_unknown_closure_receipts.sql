-- Closing an unknown result never refunds usage or removes its dispatch fence.
-- Roll out this schema with the matching Edge and client contract.
ALTER TABLE private.operations_advice_commands
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid,
  ADD CONSTRAINT operations_advice_closure_valid CHECK(
    (closed_at IS NULL AND closed_by IS NULL)
    OR(closed_at IS NOT NULL AND closed_by IS NOT NULL AND closed_by=actor_id
      AND state='unknown' AND dispatch_token IS NOT NULL AND dispatched_at IS NOT NULL AND deadline IS NOT NULL
      AND closed_at>=deadline AND closed_at>=dispatched_at));

CREATE OR REPLACE FUNCTION private.operations_advice_receipt(c private.operations_advice_commands)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT jsonb_build_object('version',1,'command_id',c.command_id,'request',c.request,
    'state',CASE WHEN c.closed_at IS NOT NULL THEN 'closed_unknown' WHEN c.state='dispatched' THEN 'unknown' ELSE c.state END,
    'context_hash',c.context_hash,'advice',c.advice)
    || CASE WHEN c.closed_at IS NOT NULL THEN jsonb_build_object('closed_at',c.closed_at)
      WHEN c.state IN('dispatched','unknown') THEN jsonb_build_object('can_close',c.deadline IS NOT NULL AND c.deadline<=clock_timestamp())
      ELSE '{}'::jsonb END;
$fn$;

CREATE OR REPLACE FUNCTION private.request_operations_advice(p_action text,p_command uuid,p_start date,p_end date,p_hotel uuid,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a public.users%ROWTYPE;p private.operations_advice_policy%ROWTYPE;c private.operations_advice_commands%ROWTYPE;
  ids uuid[];r jsonb;ctx jsonb;ops jsonb;labor jsonb;targets jsonb:='{}';req jsonb;used_count bigint;used_units bigint;
  expiry timestamptz;v_session_id uuid;day date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'ADVICE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_room_transition_session();v_session_id:=(auth.jwt()->>'session_id')::uuid;expiry:=to_timestamp((auth.jwt()->>'exp')::double precision);
  a:=private.operations_advice_actor(auth.uid(),v_session_id,expiry);
  IF p_action IS NULL OR p_action NOT IN('prepare','lookup','cancel','close') OR p_command IS NULL THEN
    RAISE EXCEPTION 'INVALID_ADVICE_REQUEST' USING ERRCODE='22023'; END IF;
  IF p_action<>'lookup' AND(p_start IS NULL OR p_end IS NULL OR p_start<date '1901-01-01' OR p_end>date '2100-12-31'
    OR p_end<p_start OR p_end-p_start>365 OR p_timezone IS NULL OR length(p_timezone)>100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone)) THEN
    RAISE EXCEPTION 'INVALID_ADVICE_REQUEST' USING ERRCODE='22023'; END IF;
  p:=private.operations_advice_entitlement(a.tenant_id,p_action='prepare');
  PERFORM pg_advisory_xact_lock(hashtextextended('operations-advice:'||a.id||':'||p_command,0));
  SELECT * INTO c FROM private.operations_advice_commands WHERE actor_id=a.id AND command_id=p_command FOR UPDATE;
  -- Clock checks precede even the not_found and idempotent replay returns.
  PERFORM private.assert_room_transition_session();
  PERFORM private.assert_operations_advice_tenant_clock(a.tenant_id);
  IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
  IF p_action='lookup' THEN
    IF c.actor_id IS NULL THEN RETURN jsonb_build_object('version',1,'command_id',p_command,'state','not_found'); END IF;
    IF c.tenant_id IS DISTINCT FROM a.tenant_id THEN RAISE EXCEPTION 'ADVICE_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    ids:=private.operations_advice_hotels(a,c.hotel_id);
    IF c.hotel_ids IS DISTINCT FROM ids THEN RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
    PERFORM private.assert_room_transition_session();
    PERFORM private.assert_operations_advice_tenant_clock(a.tenant_id);
    IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
    RETURN private.operations_advice_receipt(c);
  END IF;
  ids:=private.operations_advice_hotels(a,p_hotel);
  req:=jsonb_build_object('start',p_start,'end',p_end,'hotel',p_hotel,'timezone',p_timezone);
  IF c.actor_id IS NOT NULL THEN
    IF c.tenant_id IS DISTINCT FROM a.tenant_id OR c.request IS DISTINCT FROM req THEN
      RAISE EXCEPTION 'ADVICE_COMMAND_CONFLICT' USING ERRCODE='PT409'; END IF;
    IF c.hotel_ids IS DISTINCT FROM ids THEN RAISE EXCEPTION 'ADVICE_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
    IF p_action='close' AND c.closed_at IS NULL AND c.state NOT IN('completed','cancelled') THEN
      IF c.state NOT IN('dispatched','unknown') OR c.deadline IS NULL THEN
        RAISE EXCEPTION 'ADVICE_NOT_CLOSABLE' USING ERRCODE='PT409'; END IF;
      IF c.deadline>clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_STILL_RUNNING' USING ERRCODE='PT409'; END IF;
      UPDATE private.operations_advice_commands SET state='unknown',closed_at=clock_timestamp(),closed_by=a.id
        WHERE actor_id=a.id AND command_id=p_command RETURNING * INTO c;
      INSERT INTO public.activity_logs(tenant_id,user_id,user_name,entity_type,entity_id,entity_name,action,description,new_values)
        VALUES(a.tenant_id,a.id,a.full_name,'operations_advice',p_command,'Operations advice','update',
          'Đóng yêu cầu chưa xác nhận sau thời hạn; giữ hạn mức đã dùng',
          jsonb_build_object('state','closed_unknown','closed_at',c.closed_at,'units',c.units,'context_hash',c.context_hash));
    END IF;
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
    PERFORM private.assert_operations_advice_tenant_clock(a.tenant_id);
    IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
    RETURN private.operations_advice_receipt(c);
  END IF;
  IF p_action='close' THEN RAISE EXCEPTION 'ADVICE_NOT_CLOSABLE' USING ERRCODE='PT409'; END IF;
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
  PERFORM private.assert_operations_advice_tenant_clock(a.tenant_id);
  IF p.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'ADVICE_NOT_ENABLED' USING ERRCODE='42501'; END IF;
  RETURN private.operations_advice_receipt(c);
END;
$fn$;


CREATE FUNCTION public.close_operations_advice(p_command_id uuid,p_start_date date,p_end_date date,
  p_hotel_id uuid DEFAULT NULL,p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.request_operations_advice('close',p_command_id,p_start_date,p_end_date,p_hotel_id,p_timezone);
$fn$;
REVOKE ALL ON FUNCTION public.close_operations_advice(uuid,date,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.close_operations_advice(uuid,date,date,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_operations_advice(p_actor_id uuid,p_command_id uuid,p_dispatch_token uuid,p_advice jsonb DEFAULT NULL)
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
  IF c.closed_at IS NOT NULL OR c.state NOT IN('dispatched','unknown') OR c.deadline<=clock_timestamp() OR c.jwt_expires_at<=clock_timestamp()
    OR p.valid_until<=clock_timestamp() OR c.policy_version<>p.version
    OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=c.session_id AND not_after<=clock_timestamp()) THEN
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


NOTIFY pgrst,'reload schema';
