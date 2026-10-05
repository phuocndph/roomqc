CREATE OR REPLACE FUNCTION public.transfer_booking_room(
  p_booking_id uuid,
  p_new_room_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking RECORD;
  v_new_room RECORD;
  v_user_tenant uuid;
  v_now timestamptz := now();
  v_conflict_count int;
  v_existing_notes text;
  v_new_notes text;
  v_suffix text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();

  SELECT id, tenant_id, hotel_id, room_id, status, check_in_date, check_out_date,
         booking_type, hourly_start_time, hourly_end_time, notes
    INTO v_booking
  FROM public.room_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;
  IF v_booking.status NOT IN ('confirmed','checked_in') THEN
    RAISE EXCEPTION 'INVALID_BOOKING_STATUS: %', v_booking.status;
  END IF;
  IF p_new_room_id = v_booking.room_id THEN
    RAISE EXCEPTION 'SAME_ROOM';
  END IF;

  SELECT id, tenant_id, hotel_id, status INTO v_new_room
  FROM public.rooms WHERE id = p_new_room_id;
  IF v_new_room.id IS NULL THEN RAISE EXCEPTION 'NEW_ROOM_NOT_FOUND'; END IF;
  IF v_new_room.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'TENANT_MISMATCH'; END IF;
  IF v_new_room.hotel_id <> v_booking.hotel_id THEN RAISE EXCEPTION 'CROSS_HOTEL_TRANSFER'; END IF;
  IF v_new_room.status IN ('out_of_order','maintenance') THEN
    RAISE EXCEPTION 'NEW_ROOM_UNAVAILABLE: %', v_new_room.status;
  END IF;

  -- Conflict check on new room
  IF COALESCE(v_booking.booking_type,'daily') = 'hourly' THEN
    SELECT count(*) INTO v_conflict_count
    FROM public.room_bookings
    WHERE room_id = p_new_room_id
      AND id <> p_booking_id
      AND status IN ('confirmed','checked_in')
      AND booking_type = 'hourly'
      AND hourly_start_time < v_booking.hourly_end_time
      AND hourly_end_time   > v_booking.hourly_start_time;
  ELSE
    SELECT count(*) INTO v_conflict_count
    FROM public.room_bookings
    WHERE room_id = p_new_room_id
      AND id <> p_booking_id
      AND status IN ('confirmed','checked_in')
      AND check_in_date  < v_booking.check_out_date
      AND check_out_date > v_booking.check_in_date;
  END IF;
  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'NEW_ROOM_HAS_CONFLICT';
  END IF;

  -- Append note
  v_existing_notes := v_booking.notes;
  IF p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN
    v_suffix := '[Chuyển phòng: ' || trim(p_reason) || ']';
  ELSE
    v_suffix := '[Chuyển phòng]';
  END IF;
  v_new_notes := CASE
    WHEN v_existing_notes IS NULL OR length(v_existing_notes) = 0 THEN v_suffix
    ELSE v_existing_notes || E'\n' || v_suffix
  END;

  -- Update booking (room_id + notes; status not changed → no FSM gateway needed)
  UPDATE public.room_bookings
  SET room_id = p_new_room_id,
      notes   = v_new_notes,
      updated_at = v_now
  WHERE id = p_booking_id;

  -- If booking is checked_in, swap room occupancy via FSM gateway (force=true to bypass strict transitions)
  IF v_booking.status = 'checked_in' THEN
    PERFORM public.transition_room_status(
      v_booking.room_id, 'vacant_dirty',
      'Chuyển khách sang phòng khác', NULL, NULL, true
    );
    PERFORM public.transition_room_status(
      p_new_room_id, 'occupied_clean',
      'Tiếp nhận khách chuyển sang', NULL, NULL, true
    );
  END IF;

  -- Audit log if helper exists
  BEGIN
    PERFORM public.log_state_transition(
      'booking'::text, p_booking_id,
      'room_transfer'::text,
      jsonb_build_object('from_room', v_booking.room_id, 'to_room', p_new_room_id, 'reason', p_reason)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'from_room_id', v_booking.room_id,
    'to_room_id', p_new_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_booking_room(uuid, uuid, text) TO authenticated;