CREATE OR REPLACE FUNCTION public.get_floor_plan_live(p_hotel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_result jsonb;
BEGIN
  -- Validate tenant access
  SELECT tenant_id INTO v_tenant FROM public.hotels WHERE id = p_hotel_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Hotel not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_hotels uh
    WHERE uh.user_id = auth.uid() AND uh.hotel_id = p_hotel_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Access denied to hotel';
  END IF;

  WITH room_list AS (
    SELECT r.id, r.room_number, r.room_type, r.status,
           COALESCE(NULLIF(r.floor::text, ''), substring(r.room_number from '^[0-9]')) AS floor_key
    FROM public.rooms r
    WHERE r.hotel_id = p_hotel_id AND r.tenant_id = v_tenant
  ),
  current_bk AS (
    SELECT DISTINCT ON (rb.room_id)
      rb.room_id, rb.id, rb.guest_name, rb.guest_count, rb.guest_phone,
      rb.actual_check_in, rb.check_in_date, rb.check_out_date,
      rb.expected_check_in_time, rb.expected_check_out_time,
      rb.booking_source, rb.booking_group_id, rb.total_amount, rb.amount_paid, rb.deposit_amount,
      rb.status AS bk_status
    FROM public.room_bookings rb
    WHERE rb.hotel_id = p_hotel_id AND rb.tenant_id = v_tenant
      AND rb.status = 'checked_in'
    ORDER BY rb.room_id, rb.actual_check_in DESC NULLS LAST
  ),
  next_bk AS (
    SELECT DISTINCT ON (rb.room_id)
      rb.room_id, rb.id, rb.guest_name, rb.guest_count,
      rb.check_in_date, rb.expected_check_in_time,
      rb.booking_source, rb.booking_group_id, rb.status AS bk_status
    FROM public.room_bookings rb
    WHERE rb.hotel_id = p_hotel_id AND rb.tenant_id = v_tenant
      AND rb.status = 'confirmed'
      AND (rb.check_in_date + COALESCE(rb.expected_check_in_time, '14:00'::time))
          BETWEEN now() - interval '2 hours' AND now() + interval '24 hours'
    ORDER BY rb.room_id, rb.check_in_date, rb.expected_check_in_time
  )
  SELECT jsonb_object_agg(floor_key, rooms_arr)
  INTO v_result
  FROM (
    SELECT rl.floor_key,
      jsonb_agg(
        jsonb_build_object(
          'id', rl.id,
          'room_number', rl.room_number,
          'room_type', rl.room_type,
          'status', rl.status,
          'current_booking', CASE WHEN cb.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', cb.id, 'guest_name', cb.guest_name, 'guest_count', cb.guest_count,
            'guest_phone', cb.guest_phone, 'actual_check_in', cb.actual_check_in,
            'check_in_date', cb.check_in_date, 'check_out_date', cb.check_out_date,
            'expected_check_in_time', cb.expected_check_in_time,
            'expected_check_out_time', cb.expected_check_out_time,
            'booking_source', cb.booking_source, 'booking_group_id', cb.booking_group_id,
            'total_amount', cb.total_amount, 'amount_paid', cb.amount_paid,
            'deposit_amount', cb.deposit_amount, 'status', cb.bk_status
          ) END,
          'next_booking', CASE WHEN nb.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', nb.id, 'guest_name', nb.guest_name, 'guest_count', nb.guest_count,
            'check_in_date', nb.check_in_date, 'expected_check_in_time', nb.expected_check_in_time,
            'booking_source', nb.booking_source, 'booking_group_id', nb.booking_group_id,
            'status', nb.bk_status
          ) END
        ) ORDER BY rl.room_number
      ) AS rooms_arr
    FROM room_list rl
    LEFT JOIN current_bk cb ON cb.room_id = rl.id
    LEFT JOIN next_bk nb ON nb.room_id = rl.id
    GROUP BY rl.floor_key
  ) t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_floor_plan_live(uuid) TO authenticated;