-- Patch calculate_booking_price: seasonal only applies to 'daily'/'overnight' bookings
-- Hourly and monthly use fixed rates from room_type_rates

CREATE OR REPLACE FUNCTION public.calculate_booking_price(
  p_room_type_id uuid,
  p_booking_type text,
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

  -- Units & base by bucket
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

  -- Weekend multiplier only for daily/overnight
  IF p_booking_type IN ('daily','overnight') AND v_rate.weekday_multiplier IS NOT NULL THEN
    v_dow := EXTRACT(DOW FROM p_from_ts AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_weekend_mult := COALESCE(
      (v_rate.weekday_multiplier ->> CASE v_dow
        WHEN 0 THEN 'sun' WHEN 1 THEN 'mon' WHEN 2 THEN 'tue'
        WHEN 3 THEN 'wed' WHEN 4 THEN 'thu' WHEN 5 THEN 'fri'
        WHEN 6 THEN 'sat' END)::numeric,
      1
    );
  END IF;

  v_subtotal := v_base * v_weekend_mult;

  -- Seasonal ONLY for daily/overnight (hourly + monthly are fixed)
  IF p_booking_type IN ('daily','overnight') THEN
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
  END IF;

  -- Early/late only for daily
  IF p_apply_early_late AND p_booking_type = 'daily' THEN
    SELECT * INTO v_rules FROM public.room_pricing_rules
    WHERE tenant_id = v_tenant_id
      AND (hotel_id IS NULL OR p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    ORDER BY hotel_id NULLS LAST LIMIT 1;

    IF v_rules IS NOT NULL THEN
      v_checkin_time := (p_from_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
      v_checkout_time := (p_to_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;

      IF v_checkin_time < v_rules.standard_checkin_time THEN
        IF v_checkin_time < '05:00'::time THEN
          v_early := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.early_checkin_before_5,100) / 100.0;
        ELSIF v_checkin_time < '09:00'::time THEN
          v_early := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.early_checkin_5_9,50) / 100.0;
        ELSE
          v_early := COALESCE(v_rate.daily_rate,0) * COALESCE(v_rules.early_checkin_9_14,30) / 100.0;
        END IF;
      END IF;

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