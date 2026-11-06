-- Keep each newly committed reservation in its current UTC quota bucket.
-- Existing terminal receipts, dispatch fences, closure metadata and charges survive.
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
  -- Source reads and audit insertion may wait across UTC midnight. A stale
  -- reservation must roll back before it can be exposed or dispatched.
  IF p_action='prepare' AND day<>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'ADVICE_DAY_CHANGED' USING ERRCODE='PT409'; END IF;
  RETURN private.operations_advice_receipt(c);
END;
$fn$;

NOTIFY pgrst,'reload schema';

