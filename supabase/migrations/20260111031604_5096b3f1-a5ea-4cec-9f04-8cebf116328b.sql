-- 1. Get all warehouse stock summary for a hotel
CREATE OR REPLACE FUNCTION public.get_all_warehouse_stock_summary(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL
)
RETURNS TABLE (
  warehouse_id UUID,
  warehouse_name TEXT,
  warehouse_code TEXT,
  is_default BOOLEAN,
  total_items BIGINT,
  total_quantity BIGINT,
  total_value NUMERIC,
  low_stock_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    w.code AS warehouse_code,
    w.is_default,
    COUNT(DISTINCT ws.item_id)::BIGINT AS total_items,
    COALESCE(SUM(ws.quantity), 0)::BIGINT AS total_quantity,
    COALESCE(SUM(ws.quantity * COALESCE(i.unit_price, 0)), 0)::NUMERIC AS total_value,
    COUNT(DISTINCT CASE WHEN ws.quantity <= ws.minimum_stock THEN ws.item_id END)::BIGINT AS low_stock_count
  FROM warehouses w
  LEFT JOIN warehouse_stock ws ON w.id = ws.warehouse_id
  LEFT JOIN items i ON ws.item_id = i.id
  WHERE w.tenant_id = p_tenant_id
    AND w.is_active = true
    AND (p_hotel_id IS NULL OR w.hotel_id = p_hotel_id)
  GROUP BY w.id, w.name, w.code, w.is_default
  ORDER BY w.is_default DESC, w.name;
END;
$$;

-- 2. Get low stock items grouped by warehouse
CREATE OR REPLACE FUNCTION public.get_low_stock_by_warehouses(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  warehouse_id UUID,
  warehouse_name TEXT,
  warehouse_code TEXT,
  item_id UUID,
  item_name TEXT,
  item_code TEXT,
  category_name TEXT,
  quantity INTEGER,
  minimum_stock INTEGER,
  shortage INTEGER,
  unit_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    w.code AS warehouse_code,
    i.id AS item_id,
    i.name AS item_name,
    i.code AS item_code,
    ic.name AS category_name,
    ws.quantity,
    ws.minimum_stock,
    (ws.minimum_stock - ws.quantity)::INTEGER AS shortage,
    i.unit_price
  FROM warehouse_stock ws
  JOIN warehouses w ON ws.warehouse_id = w.id
  JOIN items i ON ws.item_id = i.id
  LEFT JOIN item_categories ic ON i.category_id = ic.id
  WHERE w.tenant_id = p_tenant_id
    AND w.is_active = true
    AND (p_hotel_id IS NULL OR w.hotel_id = p_hotel_id)
    AND ws.quantity <= ws.minimum_stock
  ORDER BY w.is_default DESC, w.name, (ws.minimum_stock - ws.quantity) DESC
  LIMIT p_limit;
END;
$$;