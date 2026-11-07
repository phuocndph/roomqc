-- Guard the real room mutation before enabling configured workflow dispatch.
-- A source/result is committed with the room, never minted from browser labels.
CREATE TABLE private.workflow_room_transition_commands (
  actor_id uuid NOT NULL,
  command_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  room_id uuid NOT NULL,
  session_id uuid NOT NULL,
  request jsonb NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed boolean NOT NULL,
  event_id uuid UNIQUE,
  source_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  dispatch_state text NOT NULL CHECK(dispatch_state IN ('pending','not_required')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,command_id),
  CHECK((event_id IS NOT NULL)=(dispatch_state='pending'))
);
ALTER TABLE private.workflow_room_transition_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workflow_room_transition_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.assert_room_transition_session()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'exp' IS NULL
    OR (auth.jwt()->>'exp')::double precision<=extract(epoch FROM clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=auth.uid()
      AND s.id::text=auth.jwt()->>'session_id'
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION private.assert_room_transition_session() FROM PUBLIC,anon,authenticated,service_role;

-- Move the old signature out of the Data API so default arguments are not
-- ambiguous. Its retained OID is also replaced with a guarded forwarding body.
ALTER FUNCTION public.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.transition_room_status(
  _room_id uuid,_to_status text,_reason text DEFAULT NULL,
  _dnd_until timestamptz DEFAULT NULL,_oos_until timestamptz DEFAULT NULL,
  _force boolean DEFAULT false,_command_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor public.users%ROWTYPE; v_room public.rooms%ROWTYPE; v_after public.rooms%ROWTYPE;
  v_saved private.workflow_room_transition_commands%ROWTYPE;
  v_command uuid:=COALESCE(_command_id,gen_random_uuid());
  v_request jsonb; v_result jsonb; v_event uuid;
  v_dnd_until timestamptz; v_dnd_reason text; v_oos_until timestamptz; v_oos_reason text;
  v_changed boolean; v_status_changed boolean; v_context jsonb;
BEGIN
  -- The live guard locks Auth -> profile -> roles -> session -> memberships.
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM private.assert_room_transition_session();
  IF _room_id IS NULL OR _to_status IS NULL OR _to_status NOT IN (
    'vacant_clean','vacant_inspected','vacant_dirty','occupied_clean','occupied_dirty',
    'dnd','service_refused','sleep_out','skipper','out_of_order','out_of_service')
    OR COALESCE(length(_reason),0)>4000 THEN
    RAISE EXCEPTION 'INVALID_TRANSITION_INPUT' USING ERRCODE='22023';
  END IF;
  v_request:=jsonb_build_object('room_id',_room_id,'to_status',_to_status,'reason',_reason,
    'dnd_until',_dnd_until,'oos_until',_oos_until,'force',COALESCE(_force,false));
  -- Serialize a command before the business row; hash collisions only wait.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||v_command::text,0));
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
  SELECT * INTO v_saved FROM private.workflow_room_transition_commands
    WHERE actor_id=v_actor.id AND command_id=v_command;
  IF FOUND THEN
    IF v_saved.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'ROOM_COMMAND_CONFLICT' USING ERRCODE='PT409';
    END IF;
    IF v_saved.tenant_id IS DISTINCT FROM v_room.tenant_id OR v_saved.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
      RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    IF (COALESCE(_force,false) AND v_actor.role::text<>'owner')
      OR (NOT COALESCE(_force,false) AND v_saved.changed
        AND NOT public.fn_can_user_transition_room(v_actor.id,v_saved.from_status,v_saved.to_status)) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_FOR_TRANSITION' USING ERRCODE='42501';
    END IF;
    RETURN v_saved.result||jsonb_build_object('replayed',true);
  END IF;
  IF NOT COALESCE(_force,false) AND NOT public.fn_is_valid_room_transition(v_room.status,_to_status) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;
  IF COALESCE(_force,false) AND v_actor.role::text<>'owner' THEN
    RAISE EXCEPTION 'FORCE_REQUIRES_OWNER' USING ERRCODE='42501';
  END IF;
  IF _to_status='dnd' AND _dnd_until IS NOT NULL AND _dnd_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'DND_UNTIL_MUST_BE_FUTURE' USING ERRCODE='22023';
  END IF;
  IF _to_status='out_of_service' AND _oos_until IS NOT NULL AND _oos_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'OOS_UNTIL_MUST_BE_FUTURE' USING ERRCODE='22023';
  END IF;
  -- A repeated legacy request with no explicit deadline does not extend DND.
  v_dnd_until:=CASE WHEN _to_status='dnd' THEN COALESCE(_dnd_until,
    CASE WHEN v_room.status='dnd' THEN v_room.dnd_until END,clock_timestamp()+interval '4 hours') END;
  v_dnd_reason:=CASE WHEN _to_status='dnd' THEN _reason END;
  v_oos_until:=CASE WHEN _to_status='out_of_service' THEN _oos_until END;
  v_oos_reason:=CASE WHEN _to_status IN ('out_of_service','out_of_order') THEN _reason ELSE v_room.oos_reason END;
  v_status_changed:=v_room.status IS DISTINCT FROM _to_status;
  v_changed:=v_status_changed OR v_room.dnd_until IS DISTINCT FROM v_dnd_until
    OR v_room.dnd_reason IS DISTINCT FROM v_dnd_reason OR v_room.oos_until IS DISTINCT FROM v_oos_until
    OR v_room.oos_reason IS DISTINCT FROM v_oos_reason;
  IF v_changed AND NOT COALESCE(_force,false)
    AND NOT public.fn_can_user_transition_room(v_actor.id,v_room.status,_to_status) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_FOR_TRANSITION' USING ERRCODE='42501';
  END IF;
  v_context:=jsonb_build_object('reason',_reason,'force',COALESCE(_force,false),
    'dnd_until',_dnd_until,'oos_until',_oos_until,'command_id',v_command);
  IF v_changed THEN
    UPDATE public.rooms SET status=_to_status,dnd_until=v_dnd_until,dnd_reason=v_dnd_reason,
      oos_until=v_oos_until,oos_reason=v_oos_reason,
      last_deep_clean_at=CASE WHEN v_room.status='out_of_service' AND _to_status='vacant_clean'
        THEN clock_timestamp() ELSE last_deep_clean_at END
    WHERE id=_room_id RETURNING * INTO v_after;
    -- Status-change audit already comes from trg_audit_rooms. Deadline-only
    -- changes have their own correctly named update audit, never state_change.
    IF NOT v_status_changed THEN
      INSERT INTO public.audit_log(tenant_id,hotel_id,table_name,record_id,action,actor_id,
        actor_role,old_data,new_data,context)
      VALUES(v_room.tenant_id,v_room.hotel_id,'rooms',_room_id,'update',v_actor.id,
        v_actor.user_level_code,to_jsonb(v_room),to_jsonb(v_after),v_context);
    END IF;
  ELSE v_after:=v_room;
  END IF;
  PERFORM private.assert_room_transition_session();
  v_event:=CASE WHEN v_status_changed THEN gen_random_uuid() END;
  v_result:=jsonb_build_object('room_id',_room_id,'tenant_id',v_room.tenant_id,'hotel_id',v_room.hotel_id,
    'from',v_room.status,'to',v_after.status,'legacy_status',public.fn_room_status_alias(v_after.status),
    'command_id',v_command,'changed',v_changed,'status_changed',v_status_changed,
    'workflow_event_id',v_event,'workflow_dispatch_state',CASE WHEN v_event IS NULL THEN 'not_required' ELSE 'pending' END,
    'replayed',false);
  INSERT INTO private.workflow_room_transition_commands(actor_id,command_id,tenant_id,hotel_id,room_id,
    session_id,request,from_status,to_status,changed,event_id,source_snapshot,result,dispatch_state)
  VALUES(v_actor.id,v_command,v_room.tenant_id,v_room.hotel_id,_room_id,
    (auth.jwt()->>'session_id')::uuid,v_request,v_room.status,v_after.status,v_changed,v_event,
    jsonb_build_object('source','rooms','room_id',_room_id,'room_number',v_room.room_number,
      'tenant_id',v_room.tenant_id,'hotel_id',v_room.hotel_id,'actor_id',v_actor.id,
      'old_status',v_room.status,'new_status',v_after.status,'context',v_context,
      'before',to_jsonb(v_room),'after',to_jsonb(v_after)),v_result,
    CASE WHEN v_event IS NULL THEN 'not_required' ELSE 'pending' END);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.transition_room_status(
  _room_id uuid,_to_status text,_reason text DEFAULT NULL,
  _dnd_until timestamptz DEFAULT NULL,_oos_until timestamptz DEFAULT NULL,_force boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT public.transition_room_status(_room_id,_to_status,_reason,_dnd_until,_oos_until,_force,NULL::uuid);
$fn$;
REVOKE ALL ON FUNCTION private.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_room_transition_result(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_saved private.workflow_room_transition_commands%ROWTYPE;
  v_room public.rooms%ROWTYPE;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM private.assert_room_transition_session();
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||p_command_id::text,0));
  SELECT * INTO v_saved FROM private.workflow_room_transition_commands
    WHERE actor_id=v_actor.id AND command_id=p_command_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id=v_saved.room_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.hotels WHERE id=v_saved.hotel_id FOR SHARE;
  IF v_room.tenant_id IS DISTINCT FROM v_actor.tenant_id OR v_room.tenant_id IS DISTINCT FROM v_saved.tenant_id
    OR v_room.hotel_id IS DISTINCT FROM v_saved.hotel_id
    OR NOT EXISTS(SELECT 1 FROM public.hotels h WHERE h.id=v_saved.hotel_id
      AND h.tenant_id=v_actor.tenant_id AND h.status='active')
    OR NOT(v_actor.role::text='owner' OR EXISTS(SELECT 1 FROM public.user_hotels h
      WHERE h.user_id=v_actor.id AND h.hotel_id=v_saved.hotel_id))
    OR ((v_saved.request->>'force')::boolean AND v_actor.role::text<>'owner')
    OR (NOT (v_saved.request->>'force')::boolean AND v_saved.changed
      AND NOT public.fn_can_user_transition_room(v_actor.id,v_saved.from_status,v_saved.to_status)) THEN
    RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_saved.result||jsonb_build_object('replayed',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_room_transition_result(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_room_transition_result(uuid) TO authenticated;
