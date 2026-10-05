CREATE OR REPLACE FUNCTION public.get_laundry_batches_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, tenant_id uuid, hotel_id uuid, vendor_id uuid, batch_code text, status text,
  delivery_date timestamptz, expected_return_date timestamptz, actual_return_date timestamptz,
  total_items integer, total_weight_kg numeric, estimated_cost numeric, actual_cost numeric,
  notes text, created_at timestamptz, updated_at timestamptz,
  vendor_name text, vendor_logo text, vendor_rating numeric, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM laundry_batches lb
  LEFT JOIN laundry_vendors lv ON lv.id = lb.vendor_id
  WHERE lb.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
    AND (p_vendor_id IS NULL OR lb.vendor_id = p_vendor_id)
    AND (p_status IS NULL OR lb.status = p_status)
    AND (p_from_date IS NULL OR lb.delivery_date::date >= p_from_date OR lb.delivery_date IS NULL)
    AND (p_to_date IS NULL OR lb.delivery_date::date <= p_to_date OR lb.delivery_date IS NULL)
    AND (
      p_search IS NULL
      OR lb.batch_code ILIKE '%' || p_search || '%'
      OR lv.name ILIKE '%' || p_search || '%'
    );

  RETURN QUERY
  SELECT
    lb.id, lb.tenant_id, lb.hotel_id, lb.vendor_id, lb.batch_code, lb.status,
    lb.delivery_date, lb.expected_return_date, lb.actual_return_date,
    lb.total_items, lb.total_weight_kg, lb.estimated_cost, lb.actual_cost,
    lb.notes, lb.created_at, lb.updated_at,
    COALESCE(lv.name, 'Chưa chọn vendor') AS vendor_name,
    (lv.contract_info->>'logo_url') AS vendor_logo,
    COALESCE(lv.rating, 0) AS vendor_rating,
    v_total AS total_count
  FROM laundry_batches lb
  LEFT JOIN laundry_vendors lv ON lv.id = lb.vendor_id
  WHERE lb.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
    AND (p_vendor_id IS NULL OR lb.vendor_id = p_vendor_id)
    AND (p_status IS NULL OR lb.status = p_status)
    AND (p_from_date IS NULL OR lb.delivery_date::date >= p_from_date OR lb.delivery_date IS NULL)
    AND (p_to_date IS NULL OR lb.delivery_date::date <= p_to_date OR lb.delivery_date IS NULL)
    AND (
      p_search IS NULL
      OR lb.batch_code ILIKE '%' || p_search || '%'
      OR lv.name ILIKE '%' || p_search || '%'
    )
  ORDER BY
    CASE WHEN lb.status = 'draft' THEN 0 ELSE 1 END,
    lb.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$function$;