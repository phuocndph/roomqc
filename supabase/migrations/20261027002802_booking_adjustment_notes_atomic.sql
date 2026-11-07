-- Q02: adjustments are part of the same booking/room/invoice/audit/receipt
-- transaction. Omitted notes keep the exact legacy canonical request. New
-- text is command-bound and appends to the currently locked booking row.
CREATE FUNCTION private.booking_adjustment_request(p_request jsonb,p_notes text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF p_notes IS NULL THEN RETURN p_request; END IF;
  IF length(p_notes)>10000 OR p_notes !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_ADJUSTMENT_NOTES' USING ERRCODE='22023'; END IF;
  RETURN p_request||jsonb_build_object('adjustment_notes',p_notes);
END;
$fn$;
REVOKE ALL ON FUNCTION private.booking_adjustment_request(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.validate_booking_adjustment_item(p_item jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF p_item ? 'adjustment_notes' THEN
    IF jsonb_typeof(p_item->'adjustment_notes') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ADJUSTMENT_NOTES' USING ERRCODE='22023'; END IF;
    PERFORM private.booking_adjustment_request('{}'::jsonb,p_item->>'adjustment_notes');
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION private.validate_booking_adjustment_item(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- One public signature per RPC avoids ambiguous PostgREST overloads. Keep the
-- former bodies private and revoked for catalog/compatibility disposition.
ALTER FUNCTION public.perform_checkin(uuid,uuid,numeric,uuid) SET SCHEMA private;
ALTER FUNCTION private.perform_checkin(uuid,uuid,numeric,uuid) RENAME TO perform_checkin_without_notes_v1;
REVOKE ALL ON FUNCTION private.perform_checkin_without_notes_v1(uuid,uuid,numeric,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid) SET SCHEMA private;
ALTER FUNCTION private.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid) RENAME TO perform_checkout_without_notes_v1;
REVOKE ALL ON FUNCTION private.perform_checkout_without_notes_v1(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.perform_checkin(p_booking_id uuid,p_room_id uuid,p_early_checkin_charge numeric DEFAULT 0,p_command_id uuid DEFAULT NULL,p_adjustment_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_command uuid:=COALESCE(p_command_id,gen_random_uuid()); v_request jsonb; v_result jsonb; v_source jsonb; v_now timestamptz;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_room_id IS NULL OR p_early_checkin_charge IS NULL OR p_early_checkin_charge<0
    OR p_early_checkin_charge::text IN('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'INVALID_CHECKIN_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('booking_id',p_booking_id,'room_id',p_room_id,'early_checkin_charge',p_early_checkin_charge);
  v_request:=private.booking_adjustment_request(v_request,p_adjustment_notes);
  v_result:=private.replay_booking_room_command(v_command,'checkin',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[p_room_id]);
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id;
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id;
  IF v_booking.room_id IS DISTINCT FROM p_room_id OR v_booking.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF v_booking.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'BOOKING_NOT_VALID' USING ERRCODE='PT409'; END IF;
  -- Legacy aliases/reserved are excluded by the current rooms_status_check.
  IF v_room.status NOT IN('vacant_clean','vacant_inspected') THEN
    RAISE EXCEPTION 'ROOM_NOT_READY_FOR_CHECKIN' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_bookings WHERE room_id=p_room_id AND id<>p_booking_id AND status='checked_in') THEN
    RAISE EXCEPTION 'ROOM_OCCUPIED' USING ERRCODE='PT409'; END IF;
  v_now:=clock_timestamp();
  -- The existing pricing trigger is UPDATE OF amount_paid,total_amount. Include
  -- its totals column when changing the quote; the trigger owns the final value.
  UPDATE public.room_bookings SET status='checked_in',actual_check_in=v_now,
    subtotal=CASE WHEN COALESCE(subtotal,0)>0
      THEN subtotal-COALESCE(early_checkin_charge,0)+p_early_checkin_charge ELSE subtotal END,
    early_checkin_charge=p_early_checkin_charge,total_amount=total_amount WHERE id=p_booking_id;
  v_source:=public.transition_room_status(p_room_id,'occupied_clean','Nhận phòng',NULL,NULL,false,v_command);
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'checkin',v_booking.status,'checked_in',NULL,jsonb_build_object('command_id',v_command,'room_id',p_room_id));
  RETURN private.save_booking_room_command(v_command,'checkin',ARRAY[p_booking_id],ARRAY[p_room_id],v_request,
    jsonb_build_object('success',true,'booking_id',p_booking_id,'room_id',p_room_id,'checked_in_at',v_now,
      'workflow_event_id',v_source->'workflow_event_id','room_transition',v_source));
END;
$fn$;

REVOKE ALL ON FUNCTION public.perform_checkin(uuid,uuid,numeric,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.perform_checkin(uuid,uuid,numeric,uuid,text) TO authenticated;

CREATE FUNCTION public.perform_checkout(p_booking_id uuid,p_room_id uuid,p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,p_subtotal numeric DEFAULT 0,p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,p_damage_items jsonb DEFAULT '[]',p_new_amount_paid numeric DEFAULT NULL,
  p_check_out_date date DEFAULT NULL,p_command_id uuid DEFAULT NULL,p_adjustment_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE; v_after public.room_bookings%ROWTYPE;
  v_room public.rooms%ROWTYPE; v_command uuid:=COALESCE(p_command_id,gen_random_uuid());
  v_request jsonb; v_result jsonb; v_source jsonb; v_amount numeric;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_room_id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_new_amount_paid IS NOT NULL THEN RAISE EXCEPTION 'DIRECT_AMOUNT_PAID_UPDATE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  FOREACH v_amount IN ARRAY ARRAY[p_late_checkout_charge,p_service_charges,p_subtotal,p_damage_charges] LOOP
    IF v_amount IS NULL OR v_amount<0 OR v_amount::text IN('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'INVALID_CHECKOUT_AMOUNT' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_damage_charges>p_subtotal THEN RAISE EXCEPTION 'DAMAGE_EXCEEDS_SUBTOTAL' USING ERRCODE='22023'; END IF;
  IF p_damage_items IS NULL OR jsonb_typeof(p_damage_items)<>'array' OR jsonb_array_length(p_damage_items)>1000 THEN
    RAISE EXCEPTION 'INVALID_DAMAGE_ITEMS' USING ERRCODE='22023'; END IF;
  IF COALESCE(length(p_damage_notes),0)>10000 THEN RAISE EXCEPTION 'DAMAGE_NOTES_TOO_LONG' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('booking_id',p_booking_id,'room_id',p_room_id,'late_checkout_charge',p_late_checkout_charge,
    'service_charges',p_service_charges,'subtotal',p_subtotal,'damage_charges',p_damage_charges,
    'damage_notes',p_damage_notes,'damage_items',p_damage_items,'check_out_date',p_check_out_date);
  v_request:=private.booking_adjustment_request(v_request,p_adjustment_notes);
  v_result:=private.replay_booking_room_command(v_command,'checkout',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[p_room_id]);
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id;
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id;
  IF v_booking.room_id IS DISTINCT FROM p_room_id OR v_booking.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF v_booking.status IS DISTINCT FROM 'checked_in' THEN RAISE EXCEPTION 'BOOKING_NOT_CHECKED_IN' USING ERRCODE='PT409'; END IF;
  IF v_room.status NOT IN('occupied_clean','occupied_dirty','dnd','service_refused','sleep_out','skipper') THEN
    RAISE EXCEPTION 'ROOM_NOT_OCCUPIED' USING ERRCODE='PT409'; END IF;
  IF p_check_out_date IS NOT NULL AND (p_check_out_date<v_booking.check_in_date OR p_check_out_date>current_date) THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_DATE' USING ERRCODE='22023'; END IF;
  IF COALESCE(v_booking.vat_rate,8) NOT BETWEEN 0 AND 100 OR COALESCE(v_booking.service_fee_rate,5) NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FEE_RATE' USING ERRCODE='22023'; END IF;
  UPDATE public.room_bookings SET status='checked_out',actual_check_out=clock_timestamp(),
    check_out_date=COALESCE(p_check_out_date,check_out_date),late_checkout_charge=p_late_checkout_charge,
    service_charges=p_service_charges,subtotal=p_subtotal,damage_charges=p_damage_charges,
    damage_notes=p_damage_notes,damage_items=p_damage_items,total_amount=total_amount
    WHERE id=p_booking_id RETURNING * INTO v_after;
  v_source:=public.transition_room_status(p_room_id,'vacant_dirty','Trả phòng',NULL,NULL,false,v_command);
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'checkout',v_booking.status,'checked_out',NULL,jsonb_build_object('command_id',v_command,'room_id',p_room_id));
  -- Read values produced by calculate_payment_status, including zero-subtotal
  -- derivation. Do not return a different financial quote from the persisted row.
  RETURN private.save_booking_room_command(v_command,'checkout',ARRAY[p_booking_id],ARRAY[p_room_id],v_request,
    jsonb_build_object('success',true,'booking_id',p_booking_id,'room_id',p_room_id,
      'payment_status',v_after.payment_status,'subtotal',v_after.subtotal,
      'vat_base',GREATEST(COALESCE(v_after.subtotal,0)-COALESCE(v_after.damage_charges,0),0),
      'vat_amount',v_after.vat_amount,'service_fee_amount',v_after.service_fee_amount,
      'total_amount',v_after.total_amount,'damage_charges',v_after.damage_charges,
      'workflow_event_id',v_source->'workflow_event_id','room_transition',v_source));
END;
$fn$;

REVOKE ALL ON FUNCTION public.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.perform_group_checkout(p_checkouts jsonb,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_command uuid:=COALESCE(p_command_id,gen_random_uuid());
  v_item jsonb; v_request jsonb; v_result jsonb; v_results jsonb:='[]'; v_bookings uuid[]; v_rooms uuid[];
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_checkouts IS NULL OR jsonb_typeof(p_checkouts)<>'array' THEN
    RAISE EXCEPTION 'CHECKOUT_ITEMS_REQUIRED' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_checkouts) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_ITEMS' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_checkouts) LOOP
    PERFORM private.validate_checkout_item(v_item,true);
    PERFORM private.validate_booking_adjustment_item(v_item);
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_checkouts) x(item)
    GROUP BY (item->>'booking_id')::uuid HAVING count(*)>1) THEN
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_BOOKING' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('checkouts',jsonb_agg(item ORDER BY item->>'booking_id')),
    array_agg((item->>'booking_id')::uuid ORDER BY item->>'booking_id'),
    array_agg(DISTINCT (item->>'room_id')::uuid ORDER BY (item->>'room_id')::uuid)
    INTO v_request,v_bookings,v_rooms FROM jsonb_array_elements(p_checkouts) x(item);
  v_result:=private.replay_booking_room_command(v_command,'group_checkout',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(v_bookings,v_rooms);
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_request->'checkouts') LOOP
    v_results:=v_results||jsonb_build_array(public.perform_checkout((v_item->>'booking_id')::uuid,(v_item->>'room_id')::uuid,
      COALESCE(NULLIF(v_item->>'late_checkout_charge',''),'0')::numeric,COALESCE(NULLIF(v_item->>'service_charges',''),'0')::numeric,
      (v_item->>'subtotal')::numeric,(v_item->>'damage_charges')::numeric,NULLIF(v_item->>'damage_notes',''),
      COALESCE(v_item->'damage_items','[]'),NULL,NULLIF(v_item->>'check_out_date','')::date,gen_random_uuid(),v_item->>'adjustment_notes'));
  END LOOP;
  RETURN private.save_booking_room_command(v_command,'group_checkout',v_bookings,v_rooms,v_request,
    jsonb_build_object('success',true,'booking_count',cardinality(v_bookings),'results',v_results));
END;
$fn$;

REVOKE ALL ON FUNCTION public.perform_group_checkout(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.perform_group_checkout(jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking_room_command(p_command_id uuid,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE;
  v_request jsonb:=p_request; v_result jsonb; v_bookings uuid[]; v_rooms uuid[]; v_item jsonb;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_command_id IS NULL OR p_operation IS NULL OR p_operation NOT IN('transfer','checkin','checkout','group_checkout')
    OR p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>2097152 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  IF p_request ? 'adjustment_notes' THEN
    IF p_operation NOT IN('checkin','checkout') OR jsonb_typeof(p_request->'adjustment_notes') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    PERFORM private.booking_adjustment_request('{}'::jsonb,p_request->>'adjustment_notes');
  END IF;
  IF p_operation='transfer' THEN
    IF NOT(p_request ?& ARRAY['booking_id','new_room_id','reason']) OR (SELECT count(*) FROM jsonb_object_keys(p_request-'adjustment_notes'))<>3
      OR jsonb_typeof(p_request->'reason') NOT IN('string','null') OR COALESCE(length(p_request->>'reason'),0)>4000 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  ELSIF p_operation='checkin' THEN
    IF NOT(p_request ?& ARRAY['booking_id','room_id','early_checkin_charge']) OR (SELECT count(*) FROM jsonb_object_keys(p_request-'adjustment_notes'))<>3
      OR jsonb_typeof(p_request->'early_checkin_charge')<>'number' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  ELSIF p_operation='checkout' THEN
    IF NOT(p_request ?& ARRAY['booking_id','room_id','late_checkout_charge','service_charges','subtotal','damage_charges',
      'damage_notes','damage_items','check_out_date']) OR (SELECT count(*) FROM jsonb_object_keys(p_request-'adjustment_notes'))<>9
      OR jsonb_typeof(p_request->'late_checkout_charge')<>'number' OR jsonb_typeof(p_request->'service_charges')<>'number'
      OR jsonb_typeof(p_request->'subtotal')<>'number' OR jsonb_typeof(p_request->'damage_charges')<>'number'
      OR jsonb_typeof(p_request->'damage_notes') NOT IN('string','null') OR COALESCE(length(p_request->>'damage_notes'),0)>10000
      OR jsonb_typeof(p_request->'check_out_date') NOT IN('string','null') OR jsonb_typeof(p_request->'damage_items')<>'array' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_request->'damage_items')>1000 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
  ELSE
    IF NOT(p_request ? 'checkouts') OR (SELECT count(*) FROM jsonb_object_keys(p_request-'adjustment_notes'))<>1
      OR jsonb_typeof(p_request->'checkouts')<>'array' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_request->'checkouts') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_request->'checkouts') LOOP
      IF jsonb_typeof(v_item)<>'object' OR NOT(v_item ?& ARRAY['booking_id','room_id'])
        OR v_item->>'booking_id' IS NULL OR v_item->>'room_id' IS NULL THEN
        RAISE EXCEPTION 'INVALID_BOOKING_ROOM_COMMAND' USING ERRCODE='22023'; END IF;
      PERFORM private.validate_booking_adjustment_item(v_item);
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

CREATE OR REPLACE FUNCTION private.save_booking_room_command(p_command_id uuid,p_operation text,p_booking_ids uuid[],
  p_room_ids uuid[],p_request jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_result jsonb:=p_result||jsonb_build_object('command_id',p_command_id,'operation',p_operation,'replayed',false);
  v_invoice uuid;
BEGIN
  IF p_operation IN('checkin','checkout') AND p_result->>'success'='true' AND NOT(p_result ? 'state') THEN
    IF cardinality(p_booking_ids)<>1 THEN RAISE EXCEPTION 'INVALID_BOOKING_ADJUSTMENT_CONTEXT' USING ERRCODE='22023'; END IF;
    IF p_request ? 'adjustment_notes' THEN
      PERFORM private.booking_adjustment_request('{}'::jsonb,p_request->>'adjustment_notes');
      UPDATE public.room_bookings SET notes=concat_ws(E'\n',NULLIF(notes,''),p_request->>'adjustment_notes')
        WHERE id=p_booking_ids[1] AND room_id=ANY(p_room_ids)
          AND tenant_id=(SELECT tenant_id FROM public.users WHERE id=auth.uid());
      IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    END IF;
    v_result:=v_result||jsonb_build_object('adjustment_notes_applied',p_request ? 'adjustment_notes');
  END IF;
  IF p_operation='checkout' AND p_result->>'success'='true' AND NOT(p_result ? 'state') THEN
    IF cardinality(p_booking_ids)<>1 THEN RAISE EXCEPTION 'INVALID_CHECKOUT_INVOICE_CONTEXT' USING ERRCODE='22023'; END IF;
    v_invoice:=private.materialize_checkout_invoice(p_booking_ids[1],auth.uid(),p_command_id);
    v_result:=v_result||jsonb_build_object('invoice_id',v_invoice,'invoice_state','issued');
  END IF;
  INSERT INTO private.booking_room_commands(actor_id,command_id,operation,tenant_id,booking_ids,room_ids,session_id,request,result)
  VALUES(auth.uid(),p_command_id,p_operation,(SELECT tenant_id FROM public.users WHERE id=auth.uid()),
    p_booking_ids,p_room_ids,(auth.jwt()->>'session_id')::uuid,p_request,v_result);
  -- Includes any time spent waiting in invoice triggers/index/foreign keys.
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION private.save_booking_room_command(uuid,text,uuid[],uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
