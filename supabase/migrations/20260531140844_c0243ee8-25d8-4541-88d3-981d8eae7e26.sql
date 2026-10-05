
-- =====================================================================
-- Unified Pricing Pipeline — Phase 1
-- Resolver per-date (override → seasonal-applied(default)) + triggers
-- =====================================================================

-- 1) Bulk resolver: per-day price chain for daily-grid + booking engine
CREATE OR REPLACE FUNCTION public.resolve_daily_prices_bulk(
  p_room_type_id uuid,
  p_from date,
  p_to date,
  p_apply_to text DEFAULT 'daily',   -- daily | overnight | hourly | monthly
  p_hotel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  date date,
  base_price numeric,
  override_price numeric,
  final_price numeric,
  is_closed boolean,
  source text,                -- 'override' | 'seasonal' | 'base'
  seasonals jsonb             -- [{id,name,mode,adjust_type,adjust_value,delta}]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_dp record;            -- daily price override row
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
    -- Reset per day
    v_seasons := '[]'::jsonb;
    v_overwrite_done := false;
    v_final := v_base;

    -- Per-day override from default rate_plan (if exists)
    SELECT dp.price, dp.is_closed
    INTO v_dp
    FROM public.rate_plan_daily_prices dp
    JOIN public.rate_plans rp ON rp.id = dp.rate_plan_id
    WHERE rp.tenant_id = v_tenant_id
      AND rp.room_type_id = p_room_type_id
      AND dp.date = v_day
    ORDER BY rp.is_default DESC NULLS LAST
    LIMIT 1;

    IF v_dp IS NOT NULL AND v_dp.is_closed THEN
      date := v_day; base_price := v_base; override_price := v_dp.price;
      final_price := COALESCE(v_dp.price, v_base); is_closed := true;
      source := 'override'; seasonals := '[]'::jsonb;
      RETURN NEXT;
      v_day := v_day + 1;
      CONTINUE;
    END IF;

    IF v_dp IS NOT NULL AND v_dp.price IS NOT NULL THEN
      -- Hard override beats seasonal
      date := v_day; base_price := v_base; override_price := v_dp.price;
      final_price := v_dp.price; is_closed := false;
      source := 'override'; seasonals := '[]'::jsonb;
      RETURN NEXT;
      v_day := v_day + 1;
      CONTINUE;
    END IF;

    -- Apply seasonal rules in priority ASC
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
$$;

GRANT EXECUTE ON FUNCTION public.resolve_daily_prices_bulk(uuid, date, date, text, uuid) TO authenticated;

-- =====================================================================
-- 2) Pricing health summary — for hub banner
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_pricing_health(
  p_hotel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_total int;
  v_with_rate int;
  v_zero_rate int;
  v_active_seasonal int;
  v_conflict int;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.room_types
  WHERE tenant_id = v_tenant_id AND status = 'active'
    AND (p_hotel_id IS NULL OR hotel_id IS NULL OR hotel_id = p_hotel_id);

  SELECT COUNT(DISTINCT rt.id) INTO v_with_rate
  FROM public.room_types rt
  JOIN public.room_type_rates rtr ON rtr.room_type_id = rt.id
  WHERE rt.tenant_id = v_tenant_id AND rt.status = 'active'
    AND COALESCE(rtr.daily_rate, 0) > 0
    AND (p_hotel_id IS NULL OR rt.hotel_id IS NULL OR rt.hotel_id = p_hotel_id);

  SELECT COUNT(DISTINCT rt.id) INTO v_zero_rate
  FROM public.room_types rt
  LEFT JOIN public.room_type_rates rtr ON rtr.room_type_id = rt.id
  WHERE rt.tenant_id = v_tenant_id AND rt.status = 'active'
    AND COALESCE(rtr.daily_rate, 0) = 0
    AND (p_hotel_id IS NULL OR rt.hotel_id IS NULL OR rt.hotel_id = p_hotel_id);

  SELECT COUNT(*) INTO v_active_seasonal
  FROM public.seasonal_rate_overrides
  WHERE tenant_id = v_tenant_id AND active = true
    AND to_date >= CURRENT_DATE
    AND (p_hotel_id IS NULL OR hotel_id IS NULL OR hotel_id = p_hotel_id);

  -- Conflict: cùng priority, cùng apply_to, overlap ngày
  SELECT COUNT(*) INTO v_conflict
  FROM public.seasonal_rate_overrides a
  JOIN public.seasonal_rate_overrides b
    ON a.id < b.id
   AND a.tenant_id = b.tenant_id
   AND a.priority = b.priority
   AND a.active AND b.active
   AND a.from_date <= b.to_date AND b.from_date <= a.to_date
   AND a.apply_to && b.apply_to
  WHERE a.tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'room_types_total', v_total,
    'room_types_with_rate', v_with_rate,
    'room_types_missing_rate', v_zero_rate,
    'seasonal_active', v_active_seasonal,
    'seasonal_conflicts', v_conflict
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pricing_health(uuid) TO authenticated;

-- =====================================================================
-- 3) Soft-delete: chặn xóa room_type còn linked rooms → archive
-- =====================================================================
CREATE OR REPLACE FUNCTION public.guard_room_type_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.rooms
  WHERE LOWER(COALESCE(room_type, '')) = LOWER(OLD.code)
     OR LOWER(COALESCE(room_type, '')) = LOWER(OLD.name);

  IF v_count > 0 THEN
    -- Archive thay vì xóa cứng
    UPDATE public.room_types SET status = 'archived', updated_at = now()
    WHERE id = OLD.id;
    RAISE NOTICE 'Hạng phòng còn % phòng đang dùng — đã chuyển sang archived', v_count;
    RETURN NULL;  -- chặn DELETE
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_room_type_delete ON public.room_types;
CREATE TRIGGER trg_guard_room_type_delete
  BEFORE DELETE ON public.room_types
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_room_type_delete();

-- =====================================================================
-- 4) Auto-sync trigger: tạo phòng mới với room_type text → tạo room_types row
-- =====================================================================
CREATE OR REPLACE FUNCTION public.auto_sync_room_type_on_room_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.room_type IS NULL OR TRIM(NEW.room_type) = '' THEN
    RETURN NEW;
  END IF;
  -- Reuse existing sync function for the affected hotel
  BEGIN
    PERFORM public.sync_room_types_from_rooms(NEW.hotel_id);
  EXCEPTION WHEN OTHERS THEN
    -- Không chặn insert nếu sync lỗi
    RAISE NOTICE 'sync_room_types_from_rooms failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_sync_room_type ON public.rooms;
CREATE TRIGGER trg_auto_sync_room_type
  AFTER INSERT OR UPDATE OF room_type ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_room_type_on_room_change();
