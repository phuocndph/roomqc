-- A timeout/null lookup is not evidence that a writer cannot commit later.
-- Store terminal outcomes in the exact receipt read by each existing writer.
-- No business state is changed by cancellation, and no permission is widened.
CREATE FUNCTION public.cancel_room_check_command(p_command_id uuid,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_room public.rooms%ROWTYPE; v_check public.room_checks%ROWTYPE;
  v_saved private.workflow_room_check_commands%ROWTYPE; v_room_id uuid; v_check_id uuid; v_result jsonb;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM private.assert_room_transition_session();
  IF p_command_id IS NULL OR p_operation IS NULL OR p_operation NOT IN('quick_check','undo_quick_check')
    OR p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>2097152 THEN
    RAISE EXCEPTION 'INVALID_ROOM_CHECK_COMMAND' USING ERRCODE='22023'; END IF;
  IF p_operation='quick_check' THEN
    IF NOT(p_request ?& ARRAY['room_id','check_type','notes','photos'])
      OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>4
      OR p_request->>'check_type' IS NULL OR p_request->>'check_type' NOT IN('daily','periodic')
      OR jsonb_typeof(p_request->'notes') NOT IN('string','null')
      OR COALESCE(length(p_request->>'notes'),0)>10000
      OR jsonb_typeof(p_request->'photos')<>'array' THEN
      RAISE EXCEPTION 'INVALID_ROOM_CHECK_COMMAND' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_request->'photos')>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'photos') x(value)
      WHERE jsonb_typeof(value)<>'string') THEN
      RAISE EXCEPTION 'INVALID_ROOM_CHECK_COMMAND' USING ERRCODE='22023'; END IF;
    v_room_id:=(p_request->>'room_id')::uuid;
  ELSE
    IF NOT(p_request ?& ARRAY['check_id','reason']) OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>2
      OR jsonb_typeof(p_request->'reason') NOT IN('string','null') OR COALESCE(length(p_request->>'reason'),0)>4000 THEN
      RAISE EXCEPTION 'INVALID_ROOM_CHECK_COMMAND' USING ERRCODE='22023'; END IF;
    v_check_id:=(p_request->>'check_id')::uuid;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||p_command_id::text,0));
  IF p_operation='undo_quick_check' THEN
    SELECT room_id INTO v_room_id FROM public.room_checks WHERE id=v_check_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  END IF;
  v_room:=private.lock_room_check_scope(v_room_id);
  IF p_operation='undo_quick_check' THEN
    SELECT * INTO v_check FROM public.room_checks WHERE id=v_check_id FOR UPDATE;
    IF NOT FOUND OR v_check.room_id IS DISTINCT FROM v_room.id OR v_check.tenant_id IS DISTINCT FROM v_room.tenant_id
      OR v_check.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
      RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    IF v_check.checked_by IS DISTINCT FROM v_actor.id AND v_actor.role::text NOT IN('owner','hotel_manager','department_manager') THEN
      RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501'; END IF;
  END IF;
  PERFORM private.assert_room_transition_session();
  SELECT * INTO v_saved FROM private.workflow_room_check_commands WHERE actor_id=v_actor.id AND command_id=p_command_id;
  IF FOUND THEN
    IF v_saved.operation IS DISTINCT FROM p_operation OR v_saved.request IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'ROOM_CHECK_COMMAND_CONFLICT' USING ERRCODE='PT409'; END IF;
    IF v_saved.tenant_id IS DISTINCT FROM v_room.tenant_id OR v_saved.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
      RAISE EXCEPTION 'ROOM_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    RETURN v_saved.result||jsonb_build_object('replayed',true);
  END IF;
  v_result:=jsonb_build_object('state','cancelled','operation',p_operation,'command_id',p_command_id,
    'tenant_id',v_room.tenant_id,'hotel_id',v_room.hotel_id,'room_id',v_room.id,'check_id',v_check_id,
    'changed',false,'workflow_event_id',NULL,'replayed',false);
  INSERT INTO private.workflow_room_check_commands(actor_id,command_id,operation,tenant_id,hotel_id,room_id,session_id,request,result)
  VALUES(v_actor.id,p_command_id,p_operation,v_room.tenant_id,v_room.hotel_id,v_room.id,(auth.jwt()->>'session_id')::uuid,p_request,v_result);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_room_check_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_room_check_command(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.cancel_booking_room_command(p_command_id uuid,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE;
  v_request jsonb:=p_request; v_result jsonb; v_bookings uuid[]; v_rooms uuid[]; v_item jsonb;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_command_id IS NULL OR p_operation IS NULL OR p_operation NOT IN('transfer','checkin','checkout','group_checkout')
    OR p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>2097152 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  IF p_operation='transfer' THEN
    IF NOT(p_request ?& ARRAY['booking_id','new_room_id','reason']) OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>3
      OR jsonb_typeof(p_request->'reason') NOT IN('string','null') OR COALESCE(length(p_request->>'reason'),0)>4000 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  ELSIF p_operation='checkin' THEN
    IF NOT(p_request ?& ARRAY['booking_id','room_id','early_checkin_charge']) OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>3
      OR jsonb_typeof(p_request->'early_checkin_charge')<>'number' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  ELSIF p_operation='checkout' THEN
    IF NOT(p_request ?& ARRAY['booking_id','room_id','late_checkout_charge','service_charges','subtotal','damage_charges',
      'damage_notes','damage_items','check_out_date']) OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>9
      OR jsonb_typeof(p_request->'late_checkout_charge')<>'number' OR jsonb_typeof(p_request->'service_charges')<>'number'
      OR jsonb_typeof(p_request->'subtotal')<>'number' OR jsonb_typeof(p_request->'damage_charges')<>'number'
      OR jsonb_typeof(p_request->'damage_notes') NOT IN('string','null') OR COALESCE(length(p_request->>'damage_notes'),0)>10000
      OR jsonb_typeof(p_request->'check_out_date') NOT IN('string','null') OR jsonb_typeof(p_request->'damage_items')<>'array' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_request->'damage_items')>1000 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  ELSE
    IF NOT(p_request ? 'checkouts') OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>1
      OR jsonb_typeof(p_request->'checkouts')<>'array' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_request->'checkouts') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_request->'checkouts') LOOP
      IF jsonb_typeof(v_item)<>'object' OR NOT(v_item ?& ARRAY['booking_id','room_id'])
        OR v_item->>'booking_id' IS NULL OR v_item->>'room_id' IS NULL THEN
        RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
      PERFORM (v_item->>'booking_id')::uuid,(v_item->>'room_id')::uuid;
    END LOOP;
    SELECT jsonb_build_object('checkouts',jsonb_agg(value ORDER BY value->>'booking_id')) INTO v_request
      FROM jsonb_array_elements(p_request->'checkouts');
  END IF;
  -- Same actor/key lock, request comparison and live scope as the writers.
  -- A previously committed receipt wins over cancellation, including transfer
  -- whose booking now points at its target room.
  v_result:=private.replay_booking_room_command(p_command_id,p_operation,v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  IF p_operation='group_checkout' THEN
    SELECT array_agg(DISTINCT (value->>'booking_id')::uuid ORDER BY (value->>'booking_id')::uuid),
      array_agg(DISTINCT (value->>'room_id')::uuid ORDER BY (value->>'room_id')::uuid)
      INTO v_bookings,v_rooms FROM jsonb_array_elements(v_request->'checkouts');
  ELSE
    v_bookings:=ARRAY[(v_request->>'booking_id')::uuid];
    IF p_operation='transfer' THEN
      SELECT * INTO v_booking FROM public.room_bookings WHERE id=v_bookings[1] FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
      SELECT array_agg(DISTINCT value ORDER BY value) INTO v_rooms
        FROM unnest(ARRAY[v_booking.room_id,(v_request->>'new_room_id')::uuid]) x(value);
    ELSE v_rooms:=ARRAY[(v_request->>'room_id')::uuid]; END IF;
  END IF;
  PERFORM private.lock_booking_operation_scope(v_bookings,v_rooms);
  IF p_operation='group_checkout' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_request->'checkouts') x(item)
      JOIN public.room_bookings b ON b.id=(item->>'booking_id')::uuid
      JOIN public.rooms r ON r.id=(item->>'room_id')::uuid
      WHERE b.room_id IS DISTINCT FROM r.id OR b.hotel_id IS DISTINCT FROM r.hotel_id) THEN
      RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  ELSIF p_operation='transfer' THEN
    IF NOT EXISTS(SELECT 1 FROM public.rooms r WHERE r.id=(v_request->>'new_room_id')::uuid AND r.hotel_id=v_booking.hotel_id)
      OR NOT EXISTS(SELECT 1 FROM public.rooms r WHERE r.id=v_booking.room_id AND r.hotel_id=v_booking.hotel_id) THEN
      RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.room_bookings b JOIN public.rooms r ON r.id=b.room_id
    WHERE b.id=v_bookings[1] AND r.id=v_rooms[1] AND b.hotel_id=r.hotel_id) THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501';
  END IF;
  RETURN private.save_booking_room_command(p_command_id,p_operation,v_bookings,v_rooms,v_request,
    jsonb_build_object('state','cancelled','success',false,'tenant_id',v_actor.tenant_id,
      'booking_ids',v_bookings,'room_ids',v_rooms,'changed',false,'workflow_event_id',NULL));
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
