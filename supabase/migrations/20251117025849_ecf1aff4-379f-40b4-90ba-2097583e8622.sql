-- Drop ALL versions of get_top_items to fix overloading
DROP FUNCTION IF EXISTS public.get_top_items(uuid, integer);
DROP FUNCTION IF EXISTS public.get_top_items(uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.get_top_items(uuid, uuid, integer);

-- Recreate with clear, consistent signature
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  code text,
  name text,
  thumbnail text,
  category_name text,
  category_color text,
  quantity_in_use integer,
  quantity_total integer,
  utilization_rate numeric,
  stock_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.code,
    i.name,
    (SELECT ii.url FROM item_images ii WHERE ii.item_id = i.id AND ii.is_primary = true LIMIT 1) as thumbnail,
    c.name as category_name,
    c.color as category_color,
    i.quantity_in_use,
    i.quantity_total,
    CASE 
      WHEN i.quantity_total = 0 THEN 0
      ELSE ROUND((i.quantity_in_use::NUMERIC / i.quantity_total::NUMERIC) * 100, 2)
    END as utilization_rate,
    CASE
      WHEN i.quantity_in_stock = 0 THEN 'out_of_stock'
      WHEN i.quantity_in_stock < i.minimum_stock THEN 'low_stock'
      ELSE 'in_stock'
    END::TEXT as stock_status
  FROM items i
  LEFT JOIN item_categories c ON c.id = i.category_id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND i.status = 'active'
    AND i.quantity_in_use > 0
  ORDER BY i.quantity_in_use DESC
  LIMIT p_limit;
END;
$function$;