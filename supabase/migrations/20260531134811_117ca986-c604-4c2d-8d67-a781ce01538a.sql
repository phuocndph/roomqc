CREATE OR REPLACE FUNCTION public.room_type_pricing_code(p_room_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(coalesce(p_room_type, '')))
    WHEN 'standard' THEN 'STD'
    WHEN 'superior' THEN 'SUP'
    WHEN 'deluxe' THEN 'DLX'
    WHEN 'suite' THEN 'SUI'
    WHEN 'vip' THEN 'VIP'
    ELSE COALESCE(NULLIF(upper(left(regexp_replace(coalesce(p_room_type, ''), '[^a-zA-Z0-9]+', '', 'g'), 12)), ''), 'TYPE')
  END
$$;

WITH room_type_source AS (
  SELECT
    r.tenant_id,
    lower(btrim(r.room_type)) AS room_type_key,
    public.room_type_pricing_code(r.room_type) AS code,
    COALESCE(
      max(NULLIF(initcap(replace(r.room_type, '_', ' ')), '')),
      'Loại phòng'
    ) AS label,
    COALESCE(avg(NULLIF(r.base_price, 0)), 0) AS base_price,
    row_number() OVER (PARTITION BY r.tenant_id ORDER BY min(r.room_type)) AS display_order
  FROM public.rooms r
  WHERE r.room_type IS NOT NULL
    AND btrim(r.room_type) <> ''
  GROUP BY r.tenant_id, lower(btrim(r.room_type)), public.room_type_pricing_code(r.room_type)
)
INSERT INTO public.room_types (
  tenant_id,
  hotel_id,
  name,
  code,
  base_price,
  max_guests,
  beds_count,
  status,
  display_order
)
SELECT
  tenant_id,
  NULL,
  'Phòng ' || label,
  code,
  base_price,
  2,
  1,
  'active',
  display_order
FROM room_type_source
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.room_type_rates (tenant_id, hotel_id, room_type_id, daily_rate)
SELECT
  rt.tenant_id,
  rt.hotel_id,
  rt.id,
  COALESCE(rt.base_price, 0)
FROM public.room_types rt
WHERE NOT EXISTS (
  SELECT 1 FROM public.room_type_rates rtr WHERE rtr.room_type_id = rt.id
);

CREATE OR REPLACE FUNCTION public.sync_room_types_from_rooms(p_hotel_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_created integer := 0;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.users
  WHERE id = auth.uid();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Không xác định được tenant của người dùng';
  END IF;

  IF p_hotel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hotels h
    WHERE h.id = p_hotel_id AND h.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Khách sạn không hợp lệ';
  END IF;

  WITH room_type_source AS (
    SELECT
      r.tenant_id,
      lower(btrim(r.room_type)) AS room_type_key,
      public.room_type_pricing_code(r.room_type) AS code,
      COALESCE(
        max(NULLIF(initcap(replace(r.room_type, '_', ' ')), '')),
        'Loại phòng'
      ) AS label,
      COALESCE(avg(NULLIF(r.base_price, 0)), 0) AS base_price,
      row_number() OVER (PARTITION BY r.tenant_id ORDER BY min(r.room_type)) AS display_order
    FROM public.rooms r
    WHERE r.tenant_id = v_tenant
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND r.room_type IS NOT NULL
      AND btrim(r.room_type) <> ''
    GROUP BY r.tenant_id, lower(btrim(r.room_type)), public.room_type_pricing_code(r.room_type)
  ), inserted AS (
    INSERT INTO public.room_types (
      tenant_id,
      hotel_id,
      name,
      code,
      base_price,
      max_guests,
      beds_count,
      status,
      display_order
    )
    SELECT
      tenant_id,
      NULL,
      'Phòng ' || label,
      code,
      base_price,
      2,
      1,
      'active',
      display_order
    FROM room_type_source
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM inserted;

  INSERT INTO public.room_type_rates (tenant_id, hotel_id, room_type_id, daily_rate)
  SELECT
    rt.tenant_id,
    rt.hotel_id,
    rt.id,
    COALESCE(rt.base_price, 0)
  FROM public.room_types rt
  WHERE rt.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.room_type_rates rtr WHERE rtr.room_type_id = rt.id
    );

  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_room_types_from_rooms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_pricing_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_pricing_code(text) TO service_role;

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
  SELECT tenant_id INTO v_tenant
  FROM public.users
  WHERE id = auth.uid();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Không xác định được tenant của người dùng';
  END IF;

  SELECT hotel_id INTO v_hotel
  FROM public.room_types
  WHERE id = p_room_type_id
    AND tenant_id = v_tenant;

  IF v_hotel IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_types WHERE id = p_room_type_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Hạng phòng không hợp lệ';
  END IF;

  SELECT id INTO v_existing
  FROM public.rate_plans
  WHERE tenant_id = v_tenant
    AND room_type_id = p_room_type_id
    AND is_default = true
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT COALESCE(daily_rate, 0) INTO v_price
  FROM public.room_type_rates
  WHERE room_type_id = p_room_type_id
    AND tenant_id = v_tenant
  LIMIT 1;

  v_price := COALESCE(v_price, 0);

  INSERT INTO public.rate_plans (
    tenant_id,
    hotel_id,
    room_type_id,
    name,
    price,
    is_default,
    is_active,
    sort_order,
    inclusions,
    policies
  ) VALUES (
    v_tenant,
    v_hotel,
    p_room_type_id,
    'Giá tiêu chuẩn',
    v_price,
    true,
    true,
    0,
    ARRAY[]::text[],
    ARRAY[]::text[]
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_default_rate_plan(uuid) TO authenticated;