
ALTER TABLE public.rate_plans ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_plans_default_unique
  ON public.rate_plans (tenant_id, room_type_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.ensure_default_rate_plan(p_room_type_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_hotel uuid;
  v_price numeric;
  v_existing uuid;
  v_new_id uuid;
BEGIN
  -- Lấy tenant_id của user hiện tại
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Không xác định được tenant của người dùng';
  END IF;

  -- Validate room_type thuộc tenant
  SELECT hotel_id INTO v_hotel
    FROM public.room_types
   WHERE id = p_room_type_id AND tenant_id = v_tenant;
  IF v_hotel IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_types WHERE id = p_room_type_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Hạng phòng không hợp lệ';
  END IF;

  -- Đã có default plan?
  SELECT id INTO v_existing
    FROM public.rate_plans
   WHERE tenant_id = v_tenant
     AND room_type_id = p_room_type_id
     AND is_default = true
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Lấy giá mặc định từ room_type_rates
  SELECT COALESCE(daily_rate, 0) INTO v_price
    FROM public.room_type_rates
   WHERE room_type_id = p_room_type_id AND tenant_id = v_tenant
   LIMIT 1;
  v_price := COALESCE(v_price, 0);

  INSERT INTO public.rate_plans (
    tenant_id, hotel_id, room_type_id, name, price, is_default, is_active, sort_order, inclusions, policies
  ) VALUES (
    v_tenant, v_hotel, p_room_type_id, 'Giá tiêu chuẩn', v_price, true, true, 0, '[]'::jsonb, '[]'::jsonb
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_default_rate_plan(uuid) TO authenticated;
