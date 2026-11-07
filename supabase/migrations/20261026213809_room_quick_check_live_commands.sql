-- Q02 quick/undo commands: current authority, compound effects and durable replay.
CREATE TABLE private.workflow_room_check_commands (
  actor_id uuid NOT NULL,
  command_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('quick_check','undo_quick_check')),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  room_id uuid NOT NULL,
  session_id uuid NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,command_id)
);
ALTER TABLE private.workflow_room_check_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workflow_room_check_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_room_check_scope(_room_id uuid)
RETURNS public.rooms LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_room public.rooms%ROWTYPE; v_actor public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id=auth.uid();
  SELECT * INTO v_room FROM public.rooms WHERE id=_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.hotels WHERE id=v_room.hotel_id FOR SHARE;
  IF v_room.tenant_id IS DISTINCT FROM v_actor.tenant_id
    OR NOT EXISTS(SELECT 1 FROM public.hotels h WHERE h.id=v_room.hotel_id
      AND h.tenant_id=v_actor.tenant_id AND h.status='active')
    OR NOT(v_actor.role::text='owner' OR EXISTS(SELECT 1 FROM public.user_hotels h
      WHERE h.user_id=v_actor.id AND h.hotel_id=v_room.hotel_id)) THEN
    RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_room;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_room_check_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.perform_quick_room_check(uuid,text,text,text[]) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.perform_quick_room_check(uuid,text,text,text[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.perform_quick_room_check(
  _room_id uuid,_check_type text DEFAULT 'daily',_notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}',_command_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor public.users%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_saved private.workflow_room_check_commands%ROWTYPE;
  v_command uuid:=COALESCE(_command_id,gen_random_uuid());
  v_request jsonb; v_result jsonb; v_transition jsonb;
  v_photo_mode public.photo_evidence_mode; v_quick_enabled boolean;
  v_rate_limit int; v_last_quick timestamptz; v_check_id uuid; v_ok_count int;
  v_new_status text;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM private.assert_room_transition_session();
  IF _room_id IS NULL OR _check_type IS NULL OR _check_type NOT IN('daily','periodic') THEN
    RAISE EXCEPTION 'quick_path_not_allowed' USING ERRCODE='22023';
  END IF;
  IF COALESCE(length(_notes),0)>10000 OR COALESCE(cardinality(_photos),0)>100 THEN
    RAISE EXCEPTION 'INVALID_ROOM_CHECK_INPUT' USING ERRCODE='22023';
  END IF;
  v_request:=jsonb_build_object('room_id',_room_id,'check_type',_check_type,'notes',_notes,'photos',COALESCE(_photos,'{}'::text[]));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||v_command::text,0));
  v_room:=private.lock_room_check_scope(_room_id);
  SELECT * INTO v_saved FROM private.workflow_room_check_commands WHERE actor_id=v_actor.id AND command_id=v_command;
  IF FOUND THEN
    IF v_saved.operation<>'quick_check' OR v_saved.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'ROOM_CHECK_COMMAND_CONFLICT' USING ERRCODE='PT409';
    END IF;
    IF v_saved.tenant_id IS DISTINCT FROM v_room.tenant_id OR v_saved.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
      RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    RETURN v_saved.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT h.photo_evidence_mode,COALESCE((h.settings->'room_check'->>'quick_path_enabled')::boolean,true),
    COALESCE((h.settings->'room_check'->>'quick_path_rate_limit_minutes')::int,30)
    INTO v_photo_mode,v_quick_enabled,v_rate_limit FROM public.hotels h WHERE h.id=v_room.hotel_id;
  IF NOT v_quick_enabled THEN RAISE EXCEPTION 'quick_path_disabled'; END IF;
  SELECT max(checked_at) INTO v_last_quick FROM public.room_checks WHERE room_id=_room_id AND check_mode='quick';
  IF v_last_quick IS NOT NULL AND v_last_quick>clock_timestamp()-make_interval(mins=>GREATEST(v_rate_limit,0)) THEN
    RAISE EXCEPTION 'quick_rate_limited:%',v_rate_limit;
  END IF;
  IF v_photo_mode='always' AND COALESCE(cardinality(_photos),0)=0 THEN RAISE EXCEPTION 'photo_required'; END IF;
  SELECT COALESCE(sum(standard_quantity),0)::int INTO v_ok_count FROM public.room_items WHERE room_id=_room_id;
  INSERT INTO public.room_checks(room_id,tenant_id,hotel_id,checked_by,check_type,check_mode,status,
    cleanliness_score,items_complete,summary_ok_count,summary_issue_count,minibar_count,notes,photos,checked_at)
  VALUES(_room_id,v_room.tenant_id,v_room.hotel_id,v_actor.id,_check_type,'quick','submitted',5,true,
    v_ok_count,0,0,_notes,COALESCE(_photos,'{}'::text[]),clock_timestamp()) RETURNING id INTO v_check_id;
  DELETE FROM public.room_check_sessions WHERE room_id=_room_id;
  v_new_status:=CASE v_room.status WHEN 'vacant_dirty' THEN 'vacant_clean'
    WHEN 'occupied_dirty' THEN 'occupied_clean' ELSE v_room.status END;
  IF v_new_status IS DISTINCT FROM v_room.status THEN
    -- Same transaction; errors in the source/audit/result roll the check back.
    v_transition:=public.transition_room_status(_room_id,v_new_status,'Quick room check OK',NULL,NULL,false,v_command);
    IF v_transition->>'to' IS DISTINCT FROM v_new_status THEN
      RAISE EXCEPTION 'ROOM_CHECK_SOURCE_RESULT_MISMATCH' USING ERRCODE='PT409';
    END IF;
  END IF;
  PERFORM public.log_state_transition(v_room.tenant_id,v_room.hotel_id,'room_checks',v_check_id,
    'quick_submit',v_room.status,v_new_status,NULL,jsonb_build_object('check_type',_check_type,'mode','quick','command_id',v_command));
  v_result:=jsonb_build_object('check_id',v_check_id,'room_id',_room_id,'old_status',v_room.status,'new_status',v_new_status,
    'summary_ok_count',v_ok_count,'command_id',v_command,'operation','quick_check','replayed',false,
    'workflow_event_id',v_transition->'workflow_event_id');
  INSERT INTO private.workflow_room_check_commands(actor_id,command_id,operation,tenant_id,hotel_id,room_id,session_id,request,result)
  VALUES(v_actor.id,v_command,'quick_check',v_room.tenant_id,v_room.hotel_id,_room_id,(auth.jwt()->>'session_id')::uuid,v_request,v_result);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.perform_quick_room_check(uuid,text,text,text[],uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perform_quick_room_check(uuid,text,text,text[],uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.perform_quick_room_check(_room_id uuid,_check_type text DEFAULT 'daily',_notes text DEFAULT NULL,_photos text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.perform_quick_room_check(_room_id,_check_type,_notes,_photos,NULL);
$fn$;

ALTER FUNCTION public.undo_quick_room_check(uuid,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.undo_quick_room_check(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.undo_quick_room_check(_check_id uuid,_reason text DEFAULT NULL,_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor public.users%ROWTYPE; v_room public.rooms%ROWTYPE; v_check public.room_checks%ROWTYPE;
  v_saved private.workflow_room_check_commands%ROWTYPE; v_room_id uuid;
  v_command uuid:=COALESCE(_command_id,gen_random_uuid()); v_request jsonb; v_result jsonb;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor(); PERFORM private.assert_room_transition_session();
  IF _check_id IS NULL OR COALESCE(length(_reason),0)>4000 THEN RAISE EXCEPTION 'INVALID_ROOM_CHECK_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('check_id',_check_id,'reason',_reason);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||v_command::text,0));
  SELECT room_id INTO v_room_id FROM public.room_checks WHERE id=_check_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  v_room:=private.lock_room_check_scope(v_room_id);
  SELECT * INTO v_check FROM public.room_checks WHERE id=_check_id FOR UPDATE;
  IF NOT FOUND OR v_check.room_id IS DISTINCT FROM v_room.id OR v_check.tenant_id IS DISTINCT FROM v_room.tenant_id
    OR v_check.hotel_id IS DISTINCT FROM v_room.hotel_id THEN RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF v_check.checked_by IS DISTINCT FROM v_actor.id AND v_actor.role::text NOT IN('owner','hotel_manager','department_manager') THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;
  PERFORM private.assert_room_transition_session();
  SELECT * INTO v_saved FROM private.workflow_room_check_commands WHERE actor_id=v_actor.id AND command_id=v_command;
  IF FOUND THEN
    IF v_saved.operation<>'undo_quick_check' OR v_saved.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'ROOM_CHECK_COMMAND_CONFLICT' USING ERRCODE='PT409'; END IF;
    IF v_saved.tenant_id IS DISTINCT FROM v_room.tenant_id OR v_saved.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
      RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    RETURN v_saved.result||jsonb_build_object('replayed',true);
  END IF;
  IF v_check.check_mode IS DISTINCT FROM 'quick' THEN RAISE EXCEPTION 'not_quick_check' USING ERRCODE='22023'; END IF;
  IF v_check.status='undone' THEN RAISE EXCEPTION 'ROOM_CHECK_ALREADY_UNDONE' USING ERRCODE='PT409'; END IF;
  IF v_check.status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'INVALID_ROOM_CHECK_STATE' USING ERRCODE='22023'; END IF;
  IF clock_timestamp()-v_check.checked_at>interval '10 minutes' OR v_check.checked_at>clock_timestamp() THEN
    RAISE EXCEPTION 'undo_window_expired:10' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_checks WHERE room_id=v_room.id AND checked_at>v_check.checked_at AND id<>_check_id) THEN
    RAISE EXCEPTION 'newer_check_exists' USING ERRCODE='PT409'; END IF;
  UPDATE public.room_checks SET status='undone',notes=COALESCE(notes,'')||E'\n[Hoàn tác]'||COALESCE(' '||_reason,'') WHERE id=_check_id;
  PERFORM public.log_state_transition(v_room.tenant_id,v_room.hotel_id,'room_checks',_check_id,'undo_quick',v_check.status,'undone',_reason,
    jsonb_build_object('actor',v_actor.id,'room_id',v_room.id,'check_mode','quick','command_id',v_command));
  v_result:=jsonb_build_object('check_id',_check_id,'status','undone','room_id',v_room.id,'command_id',v_command,'operation','undo_quick_check','replayed',false);
  INSERT INTO private.workflow_room_check_commands(actor_id,command_id,operation,tenant_id,hotel_id,room_id,session_id,request,result)
  VALUES(v_actor.id,v_command,'undo_quick_check',v_room.tenant_id,v_room.hotel_id,v_room.id,(auth.jwt()->>'session_id')::uuid,v_request,v_result);
  PERFORM private.assert_room_transition_session(); RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.undo_quick_room_check(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.undo_quick_room_check(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.undo_quick_room_check(_check_id uuid,_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.undo_quick_room_check(_check_id,_reason,NULL);
$fn$;

CREATE FUNCTION public.get_room_check_command_result(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_saved private.workflow_room_check_commands%ROWTYPE; v_room public.rooms%ROWTYPE;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor(); PERFORM private.assert_room_transition_session();
  SELECT * INTO v_saved FROM private.workflow_room_check_commands WHERE actor_id=v_actor.id AND command_id=p_command_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_room:=private.lock_room_check_scope(v_saved.room_id);
  IF v_saved.tenant_id IS DISTINCT FROM v_actor.tenant_id OR v_saved.tenant_id IS DISTINCT FROM v_room.tenant_id
    OR v_saved.hotel_id IS DISTINCT FROM v_room.hotel_id THEN RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF v_saved.operation='undo_quick_check' AND v_actor.role::text NOT IN('owner','hotel_manager','department_manager')
    AND NOT EXISTS(SELECT 1 FROM public.room_checks WHERE id=(v_saved.request->>'check_id')::uuid AND checked_by=v_actor.id) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_room_transition_session(); RETURN v_saved.result||jsonb_build_object('replayed',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_room_check_command_result(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_room_check_command_result(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
