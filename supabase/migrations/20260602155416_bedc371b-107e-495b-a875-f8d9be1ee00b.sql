CREATE OR REPLACE FUNCTION public.resolve_daily_prices_bulk(
  p_room_type_id uuid,
  p_from date,
  p_to date,
  p_apply_to text DEFAULT 'daily'::text,
  p_hotel_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  date date,
  base_price numeric,
  override_price numeric,
  final_price numeric,
  is_closed boolean,
  source text,
  seasonals jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_base numeric := 0;
  v_rate record;
  v_day date;
  v_seasons jsonb;
  v_final numeric;
  v_overwrite_done boolean;
  v_row record;
  v_delta numeric;
  v_dp record;
  v_effective_override numeric;
BEGIN
  IF p_room_type_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'RANGE_TOO_LARGE';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.room_types WHERE id = p_room_type_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  SELECT * INTO v_rate FROM public.room_type_rates WHERE room_type_id = p_room_type_id LIMIT 1;
  IF v_rate IS NULL THEN
    v_base := 0;
  ELSE
    v_base := CASE p_apply_to
      WHEN 'daily'     THEN COALESCE(v_rate.daily_rate, 0)
      WHEN 'overnight' THEN COALESCE(v_rate.overnight_rate, v_rate.daily_rate, 0)
      WHEN 'hourly'    THEN COALESCE(v_rate.hourly_rate, 0)
      WHEN 'monthly'   THEN COALESCE(v_rate.monthly_rate, 0)
      ELSE COALESCE(v_rate.daily_rate, 0)
    END;
  END IF;

  v_day := p_from;
  WHILE v_day <= p_to LOOP
    v_seasons := '[]'::jsonb;
    v_overwrite_done := false;
    v_final := v_base;
    v_effective_override := NULL;

    SELECT dp.price, dp.sale_price, dp.is_closed
    INTO v_dp
    FROM public.rate_plan_daily_prices dp
    JOIN public.rate_plans rp ON rp.id = dp.rate_plan_id
    WHERE rp.tenant_id = v_tenant_id
      AND rp.room_type_id = p_room_type_id
      AND dp.date = v_day
    ORDER BY rp.is_default DESC NULLS LAST, rp.sort_order ASC NULLS LAST
    LIMIT 1;

    IF v_dp IS NOT NULL THEN
      v_effective_override := COALESCE(v_dp.sale_price, v_dp.price);
    END IF;

    IF v_dp IS NOT NULL AND v_dp.is_closed THEN
      date := v_day;
      base_price := v_base;
      override_price := v_effective_override;
      final_price := COALESCE(v_effective_override, v_base);
      is_closed := true;
      source := 'override';
      seasonals := '[]'::jsonb;
      RETURN NEXT;
      v_day := v_day + 1;
      CONTINUE;
    END IF;

    IF v_effective_override IS NOT NULL THEN
      date := v_day;
      base_price := v_base;
      override_price := v_effective_override;
      final_price := v_effective_override;
      is_closed := false;
      source := 'override';
      seasonals := '[]'::jsonb;
      RETURN NEXT;
      v_day := v_day + 1;
      CONTINUE;
    END IF;

    FOR v_row IN
      SELECT * FROM public.seasonal_rate_overrides
      WHERE tenant_id = v_tenant_id
        AND active = true
        AND (hotel_id IS NULL OR p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND from_date <= v_day AND to_date >= v_day
        AND (room_type_ids = '{}' OR p_room_type_id = ANY(room_type_ids))
        AND p_apply_to = ANY(apply_to)
      ORDER BY priority ASC, created_at ASC
    LOOP
      IF v_row.mode = 'overwrite' AND NOT v_overwrite_done THEN
        IF v_row.adjust_type = 'set_rate' OR v_row.adjust_type = 'fixed_amount' THEN
          v_final := v_row.adjust_value;
        ELSIF v_row.adjust_type = 'percent' THEN
          v_final := v_base * (1 + v_row.adjust_value / 100.0);
        END IF;
        v_overwrite_done := true;
        v_seasons := v_seasons || jsonb_build_object(
          'id', v_row.id, 'name', v_row.name, 'mode','overwrite',
          'adjust_type', v_row.adjust_type, 'adjust_value', v_row.adjust_value,
          'priority', v_row.priority
        );
      ELSIF v_row.mode = 'add_on' AND NOT v_overwrite_done THEN
        IF v_row.adjust_type = 'percent' THEN
          v_delta := v_final * v_row.adjust_value / 100.0;
        ELSE
          v_delta := v_row.adjust_value;
        END IF;
        v_final := v_final + v_delta;
        v_seasons := v_seasons || jsonb_build_object(
          'id', v_row.id, 'name', v_row.name, 'mode','add_on',
          'adjust_type', v_row.adjust_type, 'adjust_value', v_row.adjust_value,
          'delta', v_delta, 'priority', v_row.priority
        );
      END IF;
    END LOOP;

    date := v_day;
    base_price := v_base;
    override_price := NULL;
    final_price := v_final;
    is_closed := false;
    source := CASE WHEN jsonb_array_length(v_seasons) > 0 THEN 'seasonal' ELSE 'base' END;
    seasonals := v_seasons;
    RETURN NEXT;

    v_day := v_day + 1;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_daily_prices_bulk(uuid, date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_daily_prices_bulk(uuid, date, date, text, uuid) TO service_role;