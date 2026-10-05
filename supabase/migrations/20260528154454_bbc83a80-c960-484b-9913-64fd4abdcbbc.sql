CREATE OR REPLACE FUNCTION public.get_tape_chart(
  p_hotel_id uuid,
  p_start_date date,
  p_days int DEFAULT 14
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_tenant uuid := public.get_current_user_tenant_id();
  v_hotel_tenant uuid;
  v_end date;
  v_rooms jsonb;
  v_bookings jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days < 1 THEN p_days := 14; END IF;
  IF p_days > 60 THEN p_days := 60; END IF;
  v_end := p_start_date + p_days;

  SELECT tenant_id INTO v_hotel_tenant FROM public.hotels WHERE id = p_hotel_id;
  IF v_hotel_tenant IS NULL OR v_hotel_tenant <> v_user_tenant THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'floor' DESC, r->>'room_number'), '[]'::jsonb)
  INTO v_rooms
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'room_number', room_number,
      'floor', floor,
      'room_type', room_type,
      'status', status,
      'base_price', base_price,
      'max_guests', max_guests,
      'bed_type', bed_type
    ) AS r
    FROM public.rooms
    WHERE hotel_id = p_hotel_id AND tenant_id = v_user_tenant
  ) sub;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'room_id', b.room_id,
    'guest_name', b.guest_name,
    'guest_phone', b.guest_phone,
    'guest_count', b.guest_count,
    'check_in_date', b.check_in_date,
    'check_out_date', b.check_out_date,
    'expected_check_in_time', b.expected_check_in_time,
    'expected_check_out_time', b.expected_check_out_time,
    'actual_check_in', b.actual_check_in,
    'actual_check_out', b.actual_check_out,
    'status', b.status,
    'payment_status', b.payment_status,
    'booking_source', b.booking_source,
    'booking_group_id', b.booking_group_id,
    'total_amount', b.total_amount,
    'amount_paid', b.amount_paid,
    'deposit_amount', b.deposit_amount,
    'notes', b.notes
  )), '[]'::jsonb)
  INTO v_bookings
  FROM public.room_bookings b
  WHERE b.hotel_id = p_hotel_id
    AND b.tenant_id = v_user_tenant
    AND b.status IN ('confirmed','checked_in','checked_out')
    AND b.check_in_date < v_end
    AND b.check_out_date > p_start_date;

  RETURN jsonb_build_object(
    'start_date', p_start_date,
    'days', p_days,
    'rooms', v_rooms,
    'bookings', v_bookings
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tape_chart(uuid, date, int) TO authenticated;