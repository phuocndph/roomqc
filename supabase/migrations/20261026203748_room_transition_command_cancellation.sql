-- A failed HTTP response is not proof that a same-key concurrent call did not
-- commit. Fence abandonment under the source command's exact key lock.
CREATE FUNCTION public.cancel_room_transition_command(
  _room_id uuid,_to_status text,_command_id uuid,
  _reason text DEFAULT NULL,_dnd_until timestamptz DEFAULT NULL,
  _oos_until timestamptz DEFAULT NULL,_force boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_saved private.workflow_room_transition_commands%ROWTYPE; v_request jsonb; v_result jsonb;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM private.assert_room_transition_session();
  IF _room_id IS NULL OR _command_id IS NULL OR _to_status IS NULL OR _to_status NOT IN (
    'vacant_clean','vacant_inspected','vacant_dirty','occupied_clean','occupied_dirty',
    'dnd','service_refused','sleep_out','skipper','out_of_order','out_of_service')
    OR COALESCE(length(_reason),0)>4000 THEN
    RAISE EXCEPTION 'INVALID_TRANSITION_INPUT' USING ERRCODE='22023';
  END IF;
  v_request:=jsonb_build_object('room_id',_room_id,'to_status',_to_status,'reason',_reason,
    'dnd_until',_dnd_until,'oos_until',_oos_until,'force',COALESCE(_force,false));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||_command_id::text,0));
  SELECT * INTO v_room FROM public.rooms WHERE id=_room_id FOR SHARE;
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
    WHERE actor_id=v_actor.id AND command_id=_command_id;
  IF FOUND THEN
    IF v_saved.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'ROOM_COMMAND_CONFLICT' USING ERRCODE='PT409';
    END IF;
    IF v_saved.tenant_id IS DISTINCT FROM v_room.tenant_id OR v_saved.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
      RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    -- Returning the existing completed result must obey its current role too.
    IF ((v_saved.request->>'force')::boolean AND v_actor.role::text<>'owner')
      OR (NOT (v_saved.request->>'force')::boolean AND v_saved.changed
        AND NOT public.fn_can_user_transition_room(v_actor.id,v_saved.from_status,v_saved.to_status)) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_FOR_TRANSITION' USING ERRCODE='42501';
    END IF;
    RETURN v_saved.result||jsonb_build_object('replayed',true);
  END IF;
  v_result:=jsonb_build_object('state','cancelled','room_id',_room_id,'command_id',_command_id,
    'tenant_id',v_room.tenant_id,'hotel_id',v_room.hotel_id,'changed',false,
    'status_changed',false,'workflow_event_id',NULL,'workflow_dispatch_state','not_required','replayed',false);
  INSERT INTO private.workflow_room_transition_commands(actor_id,command_id,tenant_id,hotel_id,room_id,
    session_id,request,from_status,to_status,changed,event_id,source_snapshot,result,dispatch_state)
  VALUES(v_actor.id,_command_id,v_room.tenant_id,v_room.hotel_id,_room_id,
    (auth.jwt()->>'session_id')::uuid,v_request,v_room.status,_to_status,false,NULL,
    jsonb_build_object('source','rooms','room_id',_room_id,'tenant_id',v_room.tenant_id,
      'hotel_id',v_room.hotel_id,'actor_id',v_actor.id,'cancelled',true,'request',v_request),
    v_result,'not_required');
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_room_transition_command(uuid,text,uuid,text,timestamptz,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_room_transition_command(uuid,text,uuid,text,timestamptz,timestamptz,boolean) TO authenticated;
