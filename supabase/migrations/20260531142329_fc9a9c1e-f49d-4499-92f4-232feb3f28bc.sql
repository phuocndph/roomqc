
DROP FUNCTION IF EXISTS public.resolve_today_prices_for_hotel(uuid, text);

CREATE OR REPLACE FUNCTION public.resolve_today_prices_for_hotel(
  p_hotel_id uuid,
  p_apply_to text DEFAULT 'daily'
)
RETURNS TABLE (
  room_type_id uuid,
  room_type_name text,
  room_type_code text,
  base_price numeric,
  final_price numeric,
  has_seasonal boolean,
  has_override boolean,
  is_closed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM hotels WHERE id = p_hotel_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    rt.id AS room_type_id,
    rt.name AS room_type_name,
    rt.code AS room_type_code,
    COALESCE((r.row).base_price, 0)::numeric AS base_price,
    COALESCE((r.row).final_price, 0)::numeric AS final_price,
    COALESCE(jsonb_array_length((r.row).seasonals), 0) > 0 AS has_seasonal,
    (r.row).override_price IS NOT NULL AS has_override,
    COALESCE((r.row).is_closed, false) AS is_closed
  FROM room_types rt
  LEFT JOIN LATERAL (
    SELECT to_jsonb(x) AS row
    FROM resolve_daily_prices_bulk(rt.id, CURRENT_DATE, CURRENT_DATE, p_apply_to, p_hotel_id) x
    LIMIT 1
  ) r ON true
  WHERE rt.tenant_id = v_tenant
    AND (rt.hotel_id IS NULL OR rt.hotel_id = p_hotel_id)
    AND COALESCE(rt.status, 'active') = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_today_prices_for_hotel(uuid, text) TO authenticated;
