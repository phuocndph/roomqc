-- Drop existing function and recreate with item_type column
DROP FUNCTION IF EXISTS public.get_items_filtered(uuid,uuid,uuid,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION public.get_items_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL::uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_stock_status text DEFAULT NULL::text,
  p_status text DEFAULT 'active'::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  code text,
  name text,
  name_en text,
  description text,
  category_id uuid,
  category_name text,
  category_color text,
  hotel_id uuid,
  tenant_id uuid,
  unit text,
  unit_price numeric,
  brand text,
  model text,
  item_type text,
  quantity_total integer,
  quantity_in_stock integer,
  quantity_in_use integer,
  quantity_in_laundry integer,
  quantity_damaged integer,
  quantity_lost integer,
  minimum_stock integer,
  reorder_point integer,
  expected_lifetime_days integer,
  max_wash_cycles integer,
  current_wash_cycles integer,
  specifications jsonb,
  stock_status text,
  qr_code text,
  status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_items AS (
    SELECT 
      i.id,
      i.code,
      i.name,
      i.name_en,
      i.description,
      i.category_id,
      c.name as category_name,
      c.color as category_color,
      i.hotel_id,
      i.tenant_id,
      i.unit,
      i.unit_price,
      i.brand,
      i.model,
      i.item_type::text as item_type,
      i.quantity_total,
      i.quantity_in_stock,
      i.quantity_in_use,
      i.quantity_in_laundry,
      i.quantity_damaged,
      i.quantity_lost,
      i.minimum_stock,
      i.reorder_point,
      i.expected_lifetime_days,
      i.max_wash_cycles,
      i.current_wash_cycles,
      i.specifications,
      CASE
        WHEN i.quantity_in_stock = 0 THEN 'out_of_stock'
        WHEN i.quantity_in_stock < i.minimum_stock THEN 'low_stock'
        ELSE 'in_stock'
      END as stock_status,
      i.qr_code,
      i.status,
      i.created_at,
      i.updated_at
    FROM items i
    LEFT JOIN item_categories c ON c.id = i.category_id
    WHERE i.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
      AND (p_category_id IS NULL OR i.category_id = p_category_id)
      AND (p_status IS NULL OR i.status = p_status)
      AND (
        p_search IS NULL OR
        i.name ILIKE '%' || p_search || '%' OR
        i.code ILIKE '%' || p_search || '%' OR
        i.name_en ILIKE '%' || p_search || '%'
      )
  )
  SELECT 
    fi.*,
    COUNT(*) OVER() as total_count
  FROM filtered_items fi
  WHERE (
    p_stock_status IS NULL OR
    fi.stock_status = p_stock_status
  )
  ORDER BY fi.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;