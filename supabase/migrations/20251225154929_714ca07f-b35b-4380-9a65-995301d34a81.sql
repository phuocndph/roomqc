-- Drop and recreate the function with hotel_id filter
CREATE OR REPLACE FUNCTION get_categories_with_stats(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  name_en text,
  description text,
  icon text,
  color text,
  sort_order integer,
  items_count bigint,
  total_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.name_en,
    c.description,
    c.icon,
    c.color,
    c.sort_order,
    COUNT(i.id)::bigint AS items_count,
    COALESCE(SUM(i.quantity_total * i.unit_price), 0)::numeric AS total_value
  FROM item_categories c
  LEFT JOIN items i ON i.category_id = c.id 
    AND i.status = 'active'
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
  WHERE c.tenant_id = p_tenant_id
  GROUP BY c.id
  ORDER BY c.sort_order, c.name;
END;
$$;