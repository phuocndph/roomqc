-- ============================================
-- FIX: get_inventory_report - Aggregate function nesting error
-- ============================================

DROP FUNCTION IF EXISTS public.get_inventory_report(UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_inventory_report(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_inventory_value NUMERIC;
BEGIN
  -- Pre-calculate total inventory value to avoid nested aggregates
  SELECT COALESCE(SUM(quantity_in_stock * unit_price), 0)
  INTO v_total_inventory_value
  FROM items
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = 'active';

  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'total_value', COALESCE(SUM(quantity_in_stock * unit_price), 0),
        'total_items', COALESCE(SUM(quantity_in_stock), 0),
        'total_types', COUNT(DISTINCT id),
        'low_stock_count', COUNT(*) FILTER (WHERE quantity_in_stock < minimum_stock),
        'out_of_stock_count', COUNT(*) FILTER (WHERE quantity_in_stock = 0),
        'utilization_rate', ROUND(
          (SUM(quantity_in_use)::NUMERIC / NULLIF(SUM(quantity_in_stock + quantity_in_use), 0)) * 100,
          2
        ),
        'avg_days_in_stock', 45
      )
      FROM items
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND status = 'active'
    ),
    'by_category', (
      SELECT COALESCE(jsonb_agg(cat_data ORDER BY cat_data->>'total_value' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'category_id', c.id,
          'category_name', c.name,
          'category_color', COALESCE(c.color, '#6b7280'),
          'item_count', COUNT(i.id),
          'total_stock', COALESCE(SUM(i.quantity_in_stock), 0),
          'in_use', COALESCE(SUM(i.quantity_in_use), 0),
          'in_laundry', COALESCE(SUM(i.quantity_in_laundry), 0),
          'total_value', COALESCE(SUM(i.quantity_in_stock * i.unit_price), 0),
          'percentage', CASE 
            WHEN v_total_inventory_value > 0 
            THEN ROUND((COALESCE(SUM(i.quantity_in_stock * i.unit_price), 0) / v_total_inventory_value) * 100, 2)
            ELSE 0
          END
        ) as cat_data
        FROM item_categories c
        LEFT JOIN items i ON i.category_id = c.id 
          AND i.tenant_id = p_tenant_id 
          AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
          AND i.status = 'active'
        WHERE c.tenant_id = p_tenant_id
        GROUP BY c.id, c.name, c.color
        HAVING COUNT(i.id) > 0
      ) sub
    ),
    'top_items_by_value', (
      SELECT COALESCE(jsonb_agg(item_data), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'item_id', i.id,
          'item_name', i.name,
          'item_code', i.code,
          'category', COALESCE(c.name, 'Chưa phân loại'),
          'quantity', i.quantity_in_stock,
          'unit_price', i.unit_price,
          'total_value', i.quantity_in_stock * i.unit_price,
          'percentage', CASE 
            WHEN v_total_inventory_value > 0 
            THEN ROUND(((i.quantity_in_stock * i.unit_price) / v_total_inventory_value) * 100, 2)
            ELSE 0
          END
        ) as item_data
        FROM items i
        LEFT JOIN item_categories c ON c.id = i.category_id
        WHERE i.tenant_id = p_tenant_id
          AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
          AND i.status = 'active'
        ORDER BY (i.quantity_in_stock * i.unit_price) DESC
        LIMIT 10
      ) sub
    ),
    'stock_status_distribution', (
      SELECT jsonb_build_object(
        'in_stock', COALESCE(SUM(quantity_in_stock), 0),
        'in_use', COALESCE(SUM(quantity_in_use), 0),
        'in_laundry', COALESCE(SUM(quantity_in_laundry), 0),
        'damaged', COALESCE(SUM(quantity_damaged), 0),
        'lost', COALESCE(SUM(quantity_lost), 0)
      )
      FROM items
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND status = 'active'
    ),
    'transaction_summary', (
      SELECT jsonb_build_object(
        'total_transactions', COUNT(*),
        'inbound_count', COUNT(*) FILTER (WHERE transaction_type = 'in'),
        'outbound_count', COUNT(*) FILTER (WHERE transaction_type = 'out'),
        'adjustment_count', COUNT(*) FILTER (WHERE transaction_type = 'adjustment'),
        'inbound_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'in'), 0),
        'outbound_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'out'), 0),
        'net_change_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'in'), 0) - 
                            COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'out'), 0)
      )
      FROM inventory_transactions
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND transaction_date BETWEEN p_start_date AND p_end_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;