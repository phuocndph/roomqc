
-- 1) Latest consumption snapshots (deduped server-side)
CREATE OR REPLACE FUNCTION public.get_latest_consumption_snapshots(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS SETOF public.consumption_snapshots
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (s.item_id) s.*
  FROM public.consumption_snapshots s
  WHERE s.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR s.hotel_id = p_hotel_id)
  ORDER BY s.item_id, s.snapshot_date DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_consumption_snapshots(uuid, uuid, integer) TO authenticated, service_role;

-- 2) Mở rộng pagination cho get_inventory_transactions_filtered (page/page_size)
CREATE OR REPLACE FUNCTION public.get_inventory_transactions_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL::uuid,
  p_transaction_type text DEFAULT NULL::text,
  p_category_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT NULL,
  p_page integer DEFAULT NULL,
  p_page_size integer DEFAULT NULL
)
RETURNS TABLE(
  id uuid, transaction_code text, transaction_type text, transaction_category text,
  item_id uuid, item_name text, item_code text, item_images text[],
  category_name text, quantity integer, unit_price numeric, total_value numeric,
  quantity_before integer, quantity_after integer, from_location text, to_location text,
  created_by uuid, created_by_name text, created_by_avatar text,
  created_at timestamp with time zone, notes text, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_page_size integer;
  v_offset integer;
BEGIN
  -- Resolve pagination: ưu tiên p_page/p_page_size, fallback p_limit/p_offset, default 25/0
  v_page_size := COALESCE(p_page_size, p_limit, 25);
  IF p_page IS NOT NULL THEN
    v_offset := GREATEST(p_page - 1, 0) * v_page_size;
  ELSE
    v_offset := COALESCE(p_offset, 0);
  END IF;

  RETURN QUERY
  WITH filtered_transactions AS (
    SELECT
      t.id,
      t.transaction_code,
      t.transaction_type,
      t.transaction_category,
      t.item_id,
      i.name AS item_name,
      i.code AS item_code,
      array_agg(ii.url ORDER BY ii.display_order) FILTER (WHERE ii.url IS NOT NULL) AS item_images,
      c.name AS category_name,
      t.quantity,
      t.unit_price,
      t.total_value,
      t.quantity_before,
      t.quantity_after,
      t.from_location,
      t.to_location,
      t.created_by,
      u.full_name AS created_by_name,
      u.avatar_url AS created_by_avatar,
      t.created_at,
      t.notes,
      COUNT(*) OVER() AS total_count
    FROM inventory_transactions t
    LEFT JOIN items i ON i.id = t.item_id
    LEFT JOIN item_categories c ON c.id = i.category_id
    LEFT JOIN item_images ii ON ii.item_id = i.id
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR t.hotel_id = p_hotel_id)
      AND (p_transaction_type IS NULL OR t.transaction_type = p_transaction_type)
      AND (p_category_id IS NULL OR i.category_id = p_category_id)
      AND (p_created_by IS NULL OR t.created_by = p_created_by)
      AND (p_date_from IS NULL OR t.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR t.created_at::date <= p_date_to)
      AND (
        p_search IS NULL
        OR t.transaction_code ILIKE '%' || p_search || '%'
        OR i.name ILIKE '%' || p_search || '%'
        OR i.code ILIKE '%' || p_search || '%'
        OR t.notes ILIKE '%' || p_search || '%'
      )
    GROUP BY t.id, i.name, i.code, c.name, u.full_name, u.avatar_url
    ORDER BY t.created_at DESC
    LIMIT v_page_size
    OFFSET v_offset
  )
  SELECT * FROM filtered_transactions;
END;
$function$;
