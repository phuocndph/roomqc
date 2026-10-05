-- Update get_items_filtered to include warehouse breakdown and support warehouse filtering
CREATE OR REPLACE FUNCTION public.get_items_filtered(
  p_tenant_id uuid, 
  p_hotel_id uuid DEFAULT NULL::uuid, 
  p_category_id uuid DEFAULT NULL::uuid, 
  p_stock_status text DEFAULT NULL::text, 
  p_status text DEFAULT 'active'::text, 
  p_search text DEFAULT NULL::text, 
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 50, 
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, 
  code text, 
  name text, 
  name_en text, 
  category_id uuid, 
  category_name text, 
  category_color text, 
  hotel_id uuid, 
  unit text, 
  unit_price numeric, 
  brand text, 
  model text, 
  quantity_total integer, 
  quantity_in_stock integer, 
  quantity_in_use integer, 
  quantity_in_laundry integer, 
  quantity_damaged integer, 
  quantity_lost integer, 
  minimum_stock integer, 
  reorder_point integer, 
  status text, 
  description text, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  stock_status text, 
  warehouse_breakdown jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
BEGIN
  -- Count total matching items
  SELECT COUNT(*) INTO v_total
  FROM items i
  LEFT JOIN warehouse_stock ws_filter ON ws_filter.item_id = i.id AND p_warehouse_id IS NOT NULL AND ws_filter.warehouse_id = p_warehouse_id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND (p_category_id IS NULL OR i.category_id = p_category_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR 
         i.name ILIKE '%' || p_search || '%' OR 
         i.code ILIKE '%' || p_search || '%' OR
         i.brand ILIKE '%' || p_search || '%')
    AND (p_warehouse_id IS NULL OR ws_filter.warehouse_id = p_warehouse_id)
    AND (p_stock_status IS NULL OR
         CASE 
           WHEN p_warehouse_id IS NOT NULL THEN
             -- When filtering by warehouse, check warehouse_stock quantity
             CASE 
               WHEN COALESCE(ws_filter.quantity, 0) <= 0 THEN 'out_of_stock'
               WHEN COALESCE(ws_filter.quantity, 0) <= COALESCE(ws_filter.minimum_stock, i.minimum_stock, 0) THEN 'low_stock'
               ELSE 'in_stock'
             END
           ELSE
             -- Overall stock status
             CASE 
               WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
               WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
               ELSE 'in_stock'
             END
         END = p_stock_status);

  RETURN QUERY
  SELECT 
    i.id,
    i.code,
    i.name,
    i.name_en,
    i.category_id,
    c.name as category_name,
    c.color as category_color,
    i.hotel_id,
    i.unit,
    i.unit_price,
    i.brand,
    i.model,
    i.quantity_total,
    -- If warehouse filter, show warehouse quantity; else show total
    CASE 
      WHEN p_warehouse_id IS NOT NULL THEN COALESCE(ws_selected.quantity, 0)
      ELSE i.quantity_in_stock
    END as quantity_in_stock,
    i.quantity_in_use,
    i.quantity_in_laundry,
    i.quantity_damaged,
    i.quantity_lost,
    CASE 
      WHEN p_warehouse_id IS NOT NULL THEN COALESCE(ws_selected.minimum_stock, i.minimum_stock)
      ELSE i.minimum_stock
    END as minimum_stock,
    i.reorder_point,
    i.status,
    i.description,
    i.created_at,
    i.updated_at,
    -- Stock status based on context
    CASE 
      WHEN p_warehouse_id IS NOT NULL THEN
        CASE 
          WHEN COALESCE(ws_selected.quantity, 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(ws_selected.quantity, 0) <= COALESCE(ws_selected.minimum_stock, i.minimum_stock, 0) THEN 'low_stock'
          ELSE 'in_stock'
        END
      ELSE
        CASE 
          WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
          ELSE 'in_stock'
        END
    END as stock_status,
    -- Warehouse breakdown (always return this regardless of filter)
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'warehouse_id', ws.warehouse_id,
        'warehouse_name', w.name,
        'warehouse_code', w.code,
        'quantity', ws.quantity
      ) ORDER BY w.sort_order, w.name)
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id AND w.is_active = true
      WHERE ws.item_id = i.id AND ws.quantity > 0
      ), '[]'::jsonb
    ) as warehouse_breakdown,
    v_total as total_count
  FROM items i
  LEFT JOIN item_categories c ON c.id = i.category_id 
    AND c.tenant_id = i.tenant_id 
    AND c.hotel_id = i.hotel_id
  LEFT JOIN warehouse_stock ws_selected ON ws_selected.item_id = i.id 
    AND p_warehouse_id IS NOT NULL 
    AND ws_selected.warehouse_id = p_warehouse_id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND (p_category_id IS NULL OR i.category_id = p_category_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR 
         i.name ILIKE '%' || p_search || '%' OR 
         i.code ILIKE '%' || p_search || '%' OR
         i.brand ILIKE '%' || p_search || '%')
    AND (p_warehouse_id IS NULL OR ws_selected.warehouse_id = p_warehouse_id)
    AND (p_stock_status IS NULL OR
         CASE 
           WHEN p_warehouse_id IS NOT NULL THEN
             CASE 
               WHEN COALESCE(ws_selected.quantity, 0) <= 0 THEN 'out_of_stock'
               WHEN COALESCE(ws_selected.quantity, 0) <= COALESCE(ws_selected.minimum_stock, i.minimum_stock, 0) THEN 'low_stock'
               ELSE 'in_stock'
             END
           ELSE
             CASE 
               WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
               WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
               ELSE 'in_stock'
             END
         END = p_stock_status)
  ORDER BY i.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;