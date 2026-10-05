
-- =================================================================
-- RPC 1: calculate_booking_price
-- =================================================================
CREATE OR REPLACE FUNCTION public.calculate_booking_price(
  p_room_type_id uuid,
  p_booking_type text,          -- 'daily' | 'overnight' | 'hourly' | 'monthly'
  p_from_ts timestamptz,
  p_to_ts timestamptz,
  p_hotel_id uuid DEFAULT NULL,
  p_apply_early_late boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_rate record;
  v_rules record;
  v_base numeric := 0;
  v_units numeric := 0;
  v_weekend_mult numeric := 1;
  v_dow int;
  v_season_adjust numeric := 0;
  v_season jsonb := '[]'::jsonb;
  v_season_row record;
  v_overwrite_applied boolean := false;
  v_early numeric := 0;
  v_late numeric := 0;
  v_checkin_time time;
  v_checkout_time time;
  v_total numeric;
  v_subtotal numeric;
  v_minutes numeric;
  v_hours numeric;
BEGIN
  IF p_room_type_id IS NULL OR p_from_ts IS NULL OR p_to_ts IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: room_type_id/from/to required';
  END IF;
  IF p_to_ts <= p_from_ts THEN
    RAISE EXCEPTION 'INVALID_RANGE: to_ts must be after from_ts';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.room_types WHERE id = p_room_type_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  SELECT * INTO v_rate FROM public.room_type_rates WHERE room_type_id = p_room_type_id;
  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'RATE_NOT_CONFIGURED';
  END IF;

  -- Tính units & base theo bucket
  IF p_booking_type = 'daily' THEN
    v_units := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_to_ts - p_from_ts)) / 86400.0));
    v_base := COALESCE(v_rate.daily_rate, 0) * v_units;
  ELSIF p_booking_type = 'overnight' THEN
    v_units := 1;
    v_base := COALESCE(v_rate.overnight_rate, v_rate.daily_rate, 0);
  ELSIF p_booking_type = 'hourly' THEN
    v_minutes := EXTRACT(EPOCH FROM (p_to_ts - p_from_ts)) / 60.0;
    v_hours := CEIL(v_minutes / 60.0);
    v_units := v_hours;
    IF v_rate.hourly_first_block_price IS NOT NULL
       AND v_rate.hourly_first_block_hours IS NOT NULL
       AND v_hours > 0 THEN
      v_base := v_rate.hourly_first_block_price
              + GREATEST(0, v_hours - v_rate.hourly_first_block_hours)
                * COALESCE(v_rate.hourly_rate, 0);
    ELSE
      v_base := COALESCE(v_rate.hourly_rate, 0) * v_hours;
    END IF;
  ELSIF p_booking_type = 'monthly' THEN
    v_units := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_to_ts - p_from_ts)) / (86400.0 * 30)));
    v_base := COALESCE(v_rate.monthly_rate, 0) * v_units;
  ELSE
    RAISE EXCEPTION 'INVALID_BOOKING_TYPE: %', p_booking_type;
  END IF;

  -- Hệ số cuối tuần: chỉ áp cho daily/overnight, dựa vào ngày check-in
  IF p_booking_type IN ('daily','overnight') AND v_rate.weekday_multiplier IS NOT NULL THEN
    v_dow := EXTRACT(DOW FROM p_from_ts AT TIME ZONE 'Asia/Ho_Chi_Minh'); -- 0=CN,6=T7
    v_weekend_mult := COALESCE(
      (v_rate.weekday_multiplier ->> CASE v_dow
        WHEN 0 THEN 'sun' WHEN 1 THEN 'mon' WHEN 2 THEN 'tue'
        WHEN 3 THEN 'wed' WHEN 4 THEN 'thu' WHEN 5 THEN 'fri'
        WHEN 6 THEN 'sat' END)::numeric,
      1
    );
  END IF;

  v_subtotal := v_base * v_weekend_mult;

  -- Mùa cao điểm: lặp theo priority desc, overwrite trước thì add_on bỏ qua
  FOR v_season_row IN
    SELECT * FROM public.seasonal_rate_overrides
    WHERE tenant_id = v_tenant_id
      AND active = true
      AND (hotel_id IS NULL OR p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND from_date <= (p_from_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND to_date >= (p_from_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND (room_type_ids = '{}' OR p_room_type_id = ANY(room_type_ids))
      AND p_booking_type = ANY(apply_to)
    ORDER BY priority DESC, created_at ASC
  LOOP
    IF v_season_row.mode = 'overwrite' AND NOT v_overwrite_applied THEN
      IF v_season_row.adjust_type = 'percent' THEN
        v_subtotal := v_base * v_season_row.adjust_value / 100.0 * v_weekend_mult;
      ELSE
        v_subtotal := v_season_row.adjust_value * v_units;
      END IF;
      v_overwrite_applied := true;
      v_season := v_season || jsonb_build_object(
        'id', v_season_row.id, 'name', v_season_row.name,
        'mode','overwrite','adjust_type',v_season_row.adjust_type,
        'adjust_value', v_season_row.adjust_value
      );
    ELSIF v_season_row.mode = 'add_on' AND NOT v_overwrite_applied THEN
      DECLARE v_delta numeric;
      BEGIN
        IF v_season_row.adjust_type = 'percent' THEN
          v_delta := v_subtotal * v_season_row.adjust_value / 100.0;
        ELSE
          v_delta := v_season_row.adjust_value * v_units;
        END IF;
        v_subtotal := v_subtotal + v_delta;
        v_season_adjust := v_season_adjust + v_delta;
        v_season := v_season || jsonb_build_object(
          'id', v_season_row.id, 'name', v_season_row.name,
          'mode','add_on','adjust_type',v_season_row.adjust_type,
          'adjust_value', v_season_row.adjust_value, 'delta', v_delta
        );
      END;
    END IF;
  END LOOP;

  -- Phụ thu sớm/muộn theo room_pricing_rules
  IF p_apply_early_late AND p_booking_type = 'daily' THEN
    SELECT * INTO v_rules FROM public.room_pricing_rules
    WHERE tenant_id = v_tenant_id
      AND (hotel_id IS NULL OR p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    ORDER BY hotel_id NULLS LAST LIMIT 1;

    IF v_rules IS NOT NULL THEN
      v_checkin_time := (p_from_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
      v_checkout_time := (p_to_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;

      -- Early check-in (% của giá daily 1 đêm)
      IF v_checkin_time < v_rules.standard_checkin_time THEN
        IF v_checkin_time < '05:00'::time THEN
          v_early := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.early_checkin_before_5,100) / 100.0;
        ELSIF v_checkin_time < '09:00'::time THEN
          v_early := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.early_checkin_5_9,50) / 100.0;
        ELSE
          v_early := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.early_checkin_9_14,30) / 100.0;
        END IF;
      END IF;

      -- Late check-out
      IF v_checkout_time > v_rules.standard_checkout_time THEN
        IF v_checkout_time <= '15:00'::time THEN
          v_late := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.late_checkout_12_15,30) / 100.0;
        ELSIF v_checkout_time <= '18:00'::time THEN
          v_late := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.late_checkout_15_18,50) / 100.0;
        ELSE
          v_late := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.late_checkout_after_18,100) / 100.0;
        END IF;
      END IF;
    END IF;
  END IF;

  v_total := v_subtotal + v_early + v_late;

  RETURN jsonb_build_object(
    'base', v_base,
    'units', v_units,
    'booking_type', p_booking_type,
    'weekday_multiplier', v_weekend_mult,
    'season_adjust', v_season_adjust,
    'season_breakdown', v_season,
    'early_checkin_charge', v_early,
    'late_checkout_charge', v_late,
    'subtotal', v_subtotal,
    'total', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_booking_price(uuid, text, timestamptz, timestamptz, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_booking_price(uuid, text, timestamptz, timestamptz, uuid, boolean) TO authenticated, service_role;

-- =================================================================
-- RPC 2: duplicate_room_type
-- =================================================================
CREATE OR REPLACE FUNCTION public.duplicate_room_type(
  p_source_id uuid,
  p_new_name text,
  p_new_code text,
  p_copy_rates boolean DEFAULT true,
  p_copy_default_items boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_tenant uuid;
  v_src record;
  v_new_id uuid;
BEGIN
  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  IF v_user_tenant IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_src FROM public.room_types WHERE id = p_source_id;
  IF v_src IS NULL OR v_src.tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'SOURCE_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_types
    WHERE tenant_id = v_user_tenant AND code = p_new_code
  ) THEN
    RAISE EXCEPTION 'CODE_DUPLICATE: mã loại phòng đã tồn tại';
  END IF;

  INSERT INTO public.room_types (
    tenant_id, hotel_id, name, code, description, max_guests, beds_count, bed_type,
    has_balcony, has_kitchen, has_bathtub, square_meters,
    default_items, base_price, display_order, icon, color, status
  )
  VALUES (
    v_src.tenant_id, v_src.hotel_id, p_new_name, p_new_code, v_src.description,
    v_src.max_guests, v_src.beds_count, v_src.bed_type,
    v_src.has_balcony, v_src.has_kitchen, v_src.has_bathtub, v_src.square_meters,
    CASE WHEN p_copy_default_items THEN v_src.default_items ELSE '[]'::jsonb END,
    v_src.base_price, COALESCE(v_src.display_order,0) + 1,
    v_src.icon, v_src.color, 'active'
  )
  RETURNING id INTO v_new_id;

  IF p_copy_rates THEN
    INSERT INTO public.room_type_rates (
      tenant_id, hotel_id, room_type_id,
      daily_rate, overnight_rate, hourly_rate,
      hourly_first_block_hours, hourly_first_block_price,
      monthly_rate, overnight_start_time, overnight_end_time, weekday_multiplier
    )
    SELECT tenant_id, hotel_id, v_new_id,
      daily_rate, overnight_rate, hourly_rate,
      hourly_first_block_hours, hourly_first_block_price,
      monthly_rate, overnight_start_time, overnight_end_time, weekday_multiplier
    FROM public.room_type_rates WHERE room_type_id = p_source_id;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.duplicate_room_type(uuid, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_room_type(uuid, text, text, boolean, boolean) TO authenticated;

-- =================================================================
-- RPC 3: enqueue_stay_registration (gọi sau check-in)
-- =================================================================
CREATE OR REPLACE FUNCTION public.enqueue_stay_registration(p_booking_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_tenant uuid;
  v_booking record;
  v_room_number text;
  v_count int := 0;
BEGIN
  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();

  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF v_user_tenant IS NOT NULL AND v_user_tenant <> v_booking.tenant_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');

  -- Khách chính
  IF v_booking.guest_id IS NOT NULL THEN
    INSERT INTO public.guest_stay_registrations
      (tenant_id, hotel_id, booking_id, guest_id, room_number, check_in_at, check_out_at, status)
    VALUES
      (v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
       v_room_number,
       COALESCE(v_booking.actual_check_in_time, v_booking.check_in_date::timestamptz),
       COALESCE(v_booking.actual_check_out_time, v_booking.check_out_date::timestamptz),
       'pending')
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;

  -- Khách phụ (nếu có bảng booking_guests)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='booking_guests'
  ) THEN
    INSERT INTO public.guest_stay_registrations
      (tenant_id, hotel_id, booking_id, guest_id, room_number, check_in_at, check_out_at, status)
    SELECT v_booking.tenant_id, v_booking.hotel_id, v_booking.id, bg.guest_id,
           v_room_number,
           COALESCE(v_booking.actual_check_in_time, v_booking.check_in_date::timestamptz),
           COALESCE(v_booking.actual_check_out_time, v_booking.check_out_date::timestamptz),
           'pending'
    FROM public.booking_guests bg
    WHERE bg.booking_id = v_booking.id AND bg.guest_id IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_stay_registration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_stay_registration(uuid) TO authenticated, service_role;

-- =================================================================
-- RPC 4: retry_stay_registration
-- =================================================================
CREATE OR REPLACE FUNCTION public.retry_stay_registration(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_tenant uuid; v_rec_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_user_tenant FROM public.users WHERE id = auth.uid();
  SELECT tenant_id INTO v_rec_tenant FROM public.guest_stay_registrations WHERE id = p_id;

  IF v_rec_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_user_tenant <> v_rec_tenant THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  UPDATE public.guest_stay_registrations
  SET status = 'pending', last_error = NULL, attempt_count = 0, updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retry_stay_registration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_stay_registration(uuid) TO authenticated;
