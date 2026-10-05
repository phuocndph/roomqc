-- =====================================================
-- v1.0.25 — No-Show Check-in Handling
-- =====================================================

-- 1) View: overdue check-ins (security_invoker để dùng RLS của room_bookings)
CREATE OR REPLACE VIEW public.v_overdue_checkins
WITH (security_invoker = true) AS
SELECT
  b.*,
  GREATEST(
    EXTRACT(EPOCH FROM (
      now()
      - ((b.check_in_date::timestamp + COALESCE(b.expected_check_in_time, TIME '14:00')) AT TIME ZONE 'Asia/Ho_Chi_Minh')
    )) / 3600.0,
    0
  )::numeric(10,2) AS hours_overdue
FROM public.room_bookings b
WHERE b.status = 'confirmed'
  AND b.actual_check_in IS NULL
  AND (
    b.check_in_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR (
      b.check_in_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND b.expected_check_in_time IS NOT NULL
      AND now() > ((b.check_in_date::timestamp + b.expected_check_in_time) AT TIME ZONE 'Asia/Ho_Chi_Minh')
    )
  );

COMMENT ON VIEW public.v_overdue_checkins IS
  'Booking confirmed quá giờ check-in (qua ngày hoặc qua expected_check_in_time). hours_overdue = số giờ trễ.';

GRANT SELECT ON public.v_overdue_checkins TO authenticated;

-- 2) RPC: mark_booking_no_show
CREATE OR REPLACE FUNCTION public.mark_booking_no_show(
  _booking_id uuid,
  _reason text DEFAULT NULL,
  _refund_deposit boolean DEFAULT true
) RETURNS public.room_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.room_bookings;
  _uid uuid := auth.uid();
  _can_manage boolean;
  _hours_overdue numeric;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO _b FROM public.room_bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  IF _b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_STATUS_FOR_NO_SHOW';
  END IF;

  -- Tenant + permission
  _can_manage := EXISTS(
    SELECT 1 FROM public.users
    WHERE id = _uid
      AND (tenant_id = _b.tenant_id OR user_level_code = 'super_admin')
      AND (user_level_code IN ('super_admin','tenant_owner')
           OR public.has_permission(_uid, 'manage_bookings'))
  );
  IF NOT _can_manage THEN RAISE EXCEPTION 'NO_PERMISSION_BOOKING_FLAG'; END IF;

  -- Verify thực sự overdue
  SELECT hours_overdue INTO _hours_overdue
  FROM public.v_overdue_checkins WHERE id = _booking_id;
  IF _hours_overdue IS NULL OR _hours_overdue <= 0 THEN
    RAISE EXCEPTION 'NOT_OVERDUE';
  END IF;

  -- Nếu giữ cọc → ghi nhận phí no-show vào booking_payments (metadata.type=no_show_fee)
  IF NOT _refund_deposit AND COALESCE(_b.deposit_amount, 0) > 0 THEN
    INSERT INTO public.booking_payments(
      tenant_id, hotel_id, booking_id, amount,
      payment_method, payment_status, paid_at,
      created_by, metadata, notes
    ) VALUES (
      _b.tenant_id, _b.hotel_id, _b.id, _b.deposit_amount,
      'deposit', 'completed', COALESCE(_b.paid_at, now()),
      _uid,
      jsonb_build_object('type','no_show_fee','reason', _reason),
      'Giữ cọc làm phí No-Show'
    );
  END IF;

  -- Transition (RPC này tự ghi audit + log_state_transition)
  RETURN public.transition_booking_status(
    _booking_id := _booking_id,
    _to_status  := 'no_show',
    _reason     := COALESCE(_reason, format('Quá giờ check-in %.1f giờ', _hours_overdue))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(uuid, text, boolean) TO authenticated;

-- 3) RPC: reschedule_booking_checkin
CREATE OR REPLACE FUNCTION public.reschedule_booking_checkin(
  _booking_id uuid,
  _new_check_in_date date,
  _new_check_out_date date,
  _reason text DEFAULT NULL
) RETURNS public.room_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.room_bookings;
  _uid uuid := auth.uid();
  _can_manage boolean;
  _conflict_id uuid;
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

  -- Check conflict (cùng phòng, daily, overlap, khác booking, status active)
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

  -- Audit
  PERFORM public.log_state_transition(
    _entity_type := 'booking',
    _entity_id   := _booking_id,
    _from_state  := 'confirmed',
    _to_state    := 'confirmed',
    _action      := 'reschedule_checkin',
    _reason      := _reason,
    _metadata    := jsonb_build_object(
      'new_check_in_date',  _new_check_in_date,
      'new_check_out_date', _new_check_out_date
    )
  );

  RETURN _b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_checkin(uuid, date, date, text) TO authenticated;