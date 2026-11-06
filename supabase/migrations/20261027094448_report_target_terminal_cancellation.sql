-- Store no-future-commit outcomes in the existing actor/key journal. The
-- writer already returns a matching journal result before checking revisions.
-- Never expire/delete these results while an offline client may replay a key.
COMMENT ON TABLE private.report_target_commands IS
  'Durable actor/key completed or cancelled outcomes and prior rows. Retain for offline recovery; no credentials, automatic expiry or destructive cleanup.';

CREATE FUNCTION private.cancel_report_target_command(p_kind text,p_month date,p_hotel uuid,p_values jsonb,
  p_expected text,p_command uuid,p_resolve boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_request jsonb;v_receipt private.report_target_commands%ROWTYPE;
  v_scope text;v_result jsonb;
BEGIN
  v_actor:=private.lock_report_target_scope(p_kind,p_month,p_hotel,true);
  -- Cancellation checks command identity, not the mutable business catalog or
  -- value ranges. A rejected but well-formed command must still be fenceable.
  IF p_command IS NULL OR p_expected IS NULL OR p_expected !~ '^(0|[1-9][0-9]{0,18}):[a-f0-9]{64}$'
    OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_resolve IS NULL THEN
    RAISE EXCEPTION 'INVALID_REPORT_TARGET_COMMAND' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_values))>8 OR octet_length(p_values::text)>16384 THEN
    RAISE EXCEPTION 'INVALID_REPORT_TARGET_COMMAND' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('kind',p_kind,'month',p_month,'hotel',p_hotel,'values',p_values,
    'expected_revision',p_expected,'resolve_legacy',p_resolve);
  PERFORM pg_advisory_xact_lock(hashtextextended('report-target-command:'||v_actor.id::text||':'||p_command::text,0));
  v_scope:=private.report_target_key(v_actor.tenant_id,p_kind,p_month,p_hotel);
  PERFORM pg_advisory_xact_lock(hashtextextended('report-targets:'||v_scope,0));
  PERFORM private.assert_room_transition_session();
  SELECT * INTO v_receipt FROM private.report_target_commands WHERE actor_id=v_actor.id AND command_id=p_command;
  IF FOUND THEN
    IF v_receipt.tenant_id<>v_actor.tenant_id OR v_receipt.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'REPORT_TARGET_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_receipt.result;
  END IF;
  v_result:=jsonb_build_object('state','cancelled','reason','not_applied','command_id',p_command,'request',v_request);
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,action,description,new_values)
    VALUES(v_actor.tenant_id,v_actor.id,v_actor.full_name,v_actor.role,'report_targets',COALESCE(p_hotel,v_actor.tenant_id),
      p_kind||':'||p_month::text,'update','Hủy lần lưu mục tiêu chưa áp dụng',v_result);
  INSERT INTO private.report_target_commands(actor_id,command_id,tenant_id,kind,hotel_id,period_month,request,previous_rows,result)
    VALUES(v_actor.id,p_command,v_actor.tenant_id,p_kind,p_hotel,p_month,v_request,'[]'::jsonb,v_result);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.cancel_report_target_command(text,date,uuid,jsonb,text,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cancel_report_target_command(text,date,uuid,jsonb,text,uuid,boolean) TO authenticated;

CREATE FUNCTION public.cancel_report_target_command(p_kind text,p_period_month date,p_values jsonb,p_expected_revision text,p_command_id uuid,
  p_hotel_id uuid DEFAULT NULL,p_resolve_legacy boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.cancel_report_target_command(p_kind,p_period_month,p_hotel_id,p_values,p_expected_revision,p_command_id,p_resolve_legacy);
$fn$;
REVOKE ALL ON FUNCTION public.cancel_report_target_command(text,date,jsonb,text,uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_report_target_command(text,date,jsonb,text,uuid,uuid,boolean) TO authenticated;
