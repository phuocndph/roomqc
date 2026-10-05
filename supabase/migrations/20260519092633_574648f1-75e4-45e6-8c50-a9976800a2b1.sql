CREATE OR REPLACE FUNCTION public.reschedule_booking_checkin(
  _booking_id uuid,
  _new_check_in_date date,
  _new_check_out_date date,
  _reason text DEFAULT NULL
)
RETURNS public.room_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _b public.room_bookings;
  _uid uuid := auth.uid();
  _can_manage boolean;
  _conflict_id uuid;
  _old_in date;
  _old_out date;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF _new_check_out_date <= _new_check_in_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE';
  END IF;

  SELECT * INTO _b FROM public.room_bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  IF _b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_STATUS_FOR_RESCHEDULE';
  END IF;

  _can_manage := EXISTS(
    SELECT 1 FROM public.users
    WHERE id = _uid
      AND (tenant_id = _b.tenant_id OR user_level_code = 'super_admin')
      AND (user_level_code IN ('super_admin','tenant_owner')
           OR public.has_permission(_uid, 'manage_bookings'))
  );
  IF NOT _can_manage THEN RAISE EXCEPTION 'NO_PERMISSION_BOOKING_FLAG'; END IF;

  SELECT id INTO _conflict_id
  FROM public.room_bookings
  WHERE room_id = _b.room_id
    AND id <> _booking_id
    AND status IN ('confirmed','checked_in','sleep_out','skipper')
    AND booking_type = 'daily'
    AND NOT (_new_check_out_date <= check_in_date OR _new_check_in_date >= check_out_date)
  LIMIT 1;
  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_CONFLICT';
  END IF;

  _old_in  := _b.check_in_date;
  _old_out := _b.check_out_date;

  UPDATE public.room_bookings SET
    check_in_date  = _new_check_in_date,
    check_out_date = _new_check_out_date,
    notes = COALESCE(notes,'') ||
            CASE WHEN _reason IS NOT NULL
                 THEN E'\n[Dời lịch ' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI') || ']: ' || _reason
                 ELSE '' END,
    updated_at = now()
  WHERE id = _booking_id
  RETURNING * INTO _b;

  PERFORM public.log_state_transition(
    p_tenant_id  => _b.tenant_id,
    p_hotel_id   => _b.hotel_id,
    p_table_name => 'room_bookings',
    p_record_id  => _booking_id,
    p_action     => 'reschedule_checkin',
    p_from_state => 'confirmed',
    p_to_state   => 'confirmed',
    p_reason     => _reason,
    p_context    => jsonb_build_object(
      'new_check_in_date',  _new_check_in_date,
      'new_check_out_date', _new_check_out_date,
      'old_check_in_date',  _old_in,
      'old_check_out_date', _old_out
    )
  );

  RETURN _b;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_checkin(uuid, date, date, text) TO authenticated;
