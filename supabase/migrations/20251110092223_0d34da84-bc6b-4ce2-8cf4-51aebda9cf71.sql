-- ============================================
-- REPORTING FUNCTIONS & VIEWS
-- ============================================

-- Function: Get comprehensive inventory report
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
BEGIN
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
        AND hotel_id = p_hotel_id
        AND status = 'active'
    ),
    'by_category', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'category_id', c.id,
          'category_name', c.name,
          'category_color', c.color,
          'item_count', COUNT(i.id),
          'total_stock', COALESCE(SUM(i.quantity_in_stock), 0),
          'in_use', COALESCE(SUM(i.quantity_in_use), 0),
          'in_laundry', COALESCE(SUM(i.quantity_in_laundry), 0),
          'total_value', COALESCE(SUM(i.quantity_in_stock * i.unit_price), 0),
          'percentage', ROUND(
            (SUM(i.quantity_in_stock * i.unit_price)::NUMERIC / 
             NULLIF((SELECT SUM(quantity_in_stock * unit_price) FROM items 
                     WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id), 0)) * 100,
            2
          )
        )
        ORDER BY SUM(i.quantity_in_stock * i.unit_price) DESC
      )
      FROM item_categories c
      LEFT JOIN items i ON i.category_id = c.id 
        AND i.tenant_id = p_tenant_id 
        AND i.hotel_id = p_hotel_id
        AND i.status = 'active'
      WHERE c.tenant_id = p_tenant_id
      GROUP BY c.id, c.name, c.color
      HAVING COUNT(i.id) > 0
    ),
    'top_items_by_value', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'item_id', i.id,
          'item_name', i.name,
          'item_code', i.code,
          'category', c.name,
          'quantity', i.quantity_in_stock,
          'unit_price', i.unit_price,
          'total_value', i.quantity_in_stock * i.unit_price,
          'percentage', ROUND(
            ((i.quantity_in_stock * i.unit_price)::NUMERIC / 
             NULLIF((SELECT SUM(quantity_in_stock * unit_price) FROM items 
                     WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id), 0)) * 100,
            2
          )
        )
      )
      FROM items i
      JOIN item_categories c ON c.id = i.category_id
      WHERE i.tenant_id = p_tenant_id
        AND i.hotel_id = p_hotel_id
        AND i.status = 'active'
      ORDER BY (i.quantity_in_stock * i.unit_price) DESC
      LIMIT 10
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
        AND hotel_id = p_hotel_id
        AND status = 'active'
    ),
    'transaction_summary', (
      SELECT jsonb_build_object(
        'total_transactions', COUNT(*),
        'inbound_count', COUNT(*) FILTER (WHERE transaction_type = 'in'),
        'outbound_count', COUNT(*) FILTER (WHERE transaction_type = 'out'),
        'inbound_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'in'), 0),
        'outbound_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'out'), 0),
        'net_change_value', COALESCE(
          SUM(CASE WHEN transaction_type = 'in' THEN total_value ELSE -total_value END),
          0
        )
      )
      FROM inventory_transactions
      WHERE tenant_id = p_tenant_id
        AND hotel_id = p_hotel_id
        AND created_at::DATE BETWEEN p_start_date AND p_end_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function: Get financial report
CREATE OR REPLACE FUNCTION public.get_financial_report(
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
BEGIN
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'total_cost', COALESCE(
          (SELECT SUM(total_amount) FROM purchase_orders 
           WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
           AND order_date BETWEEN p_start_date AND p_end_date),
          0
        ) + COALESCE(
          (SELECT SUM(actual_cost) FROM laundry_batches 
           WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
           AND delivery_date BETWEEN p_start_date AND p_end_date),
          0
        ) + COALESCE(
          (SELECT SUM(actual_cost) FROM maintenance_requests 
           WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
           AND created_at::DATE BETWEEN p_start_date AND p_end_date),
          0
        ),
        'purchase_cost', COALESCE(
          (SELECT SUM(total_amount) FROM purchase_orders 
           WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
           AND order_date BETWEEN p_start_date AND p_end_date),
          0
        ),
        'laundry_cost', COALESCE(
          (SELECT SUM(actual_cost) FROM laundry_batches 
           WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
           AND delivery_date BETWEEN p_start_date AND p_end_date),
          0
        ),
        'maintenance_cost', COALESCE(
          (SELECT SUM(actual_cost) FROM maintenance_requests 
           WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
           AND created_at::DATE BETWEEN p_start_date AND p_end_date),
          0
        )
      )
    ),
    'monthly_trend', (
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', p_start_date),
          date_trunc('month', p_end_date),
          '1 month'::INTERVAL
        )::DATE AS month
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'month', TO_CHAR(m.month, 'Mon YYYY'),
          'purchase', COALESCE(
            (SELECT SUM(total_amount) FROM purchase_orders 
             WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
             AND date_trunc('month', order_date) = m.month),
            0
          ),
          'laundry', COALESCE(
            (SELECT SUM(actual_cost) FROM laundry_batches 
             WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
             AND date_trunc('month', delivery_date) = m.month),
            0
          ),
          'maintenance', COALESCE(
            (SELECT SUM(actual_cost) FROM maintenance_requests 
             WHERE tenant_id = p_tenant_id AND hotel_id = p_hotel_id 
             AND date_trunc('month', created_at) = m.month),
            0
          )
        )
        ORDER BY m.month
      )
      FROM months m
    ),
    'cost_by_category', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', c.name,
          'cost', COALESCE(SUM(poi.quantity_ordered * poi.unit_price), 0)
        )
      )
      FROM item_categories c
      LEFT JOIN items i ON i.category_id = c.id
      LEFT JOIN purchase_order_items poi ON poi.item_id = i.id
      LEFT JOIN purchase_orders po ON po.id = poi.po_id
        AND po.tenant_id = p_tenant_id
        AND po.hotel_id = p_hotel_id
        AND po.order_date BETWEEN p_start_date AND p_end_date
      WHERE c.tenant_id = p_tenant_id
      GROUP BY c.name
      HAVING SUM(poi.quantity_ordered * poi.unit_price) > 0
      ORDER BY SUM(poi.quantity_ordered * poi.unit_price) DESC
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function: Get ABC analysis
CREATE OR REPLACE FUNCTION public.get_abc_analysis(
  p_tenant_id UUID,
  p_hotel_id UUID
)
RETURNS TABLE (
  item_id UUID,
  item_code TEXT,
  item_name TEXT,
  category_name TEXT,
  quantity_in_stock INTEGER,
  unit_price NUMERIC,
  total_value NUMERIC,
  cumulative_value NUMERIC,
  cumulative_percentage NUMERIC,
  abc_class TEXT,
  recommendation TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH item_values AS (
    SELECT 
      i.id,
      i.code,
      i.name,
      c.name AS category,
      i.quantity_in_stock,
      i.unit_price,
      (i.quantity_in_stock * i.unit_price) AS value
    FROM items i
    JOIN item_categories c ON c.id = i.category_id
    WHERE i.tenant_id = p_tenant_id
      AND i.hotel_id = p_hotel_id
      AND i.status = 'active'
    ORDER BY (i.quantity_in_stock * i.unit_price) DESC
  ),
  with_cumulative AS (
    SELECT 
      *,
      SUM(value) OVER (ORDER BY value DESC) AS cum_value,
      SUM(value) OVER () AS total_value
    FROM item_values
  ),
  with_percentage AS (
    SELECT 
      *,
      (cum_value / total_value * 100) AS cum_pct
    FROM with_cumulative
  )
  SELECT 
    id,
    code,
    name,
    category,
    quantity_in_stock,
    unit_price,
    value,
    cum_value,
    ROUND(cum_pct, 2),
    CASE 
      WHEN cum_pct <= 70 THEN 'A'
      WHEN cum_pct <= 90 THEN 'B'
      ELSE 'C'
    END AS class,
    CASE 
      WHEN cum_pct <= 70 THEN 'Kiểm kê hàng tuần, theo dõi sát sao'
      WHEN cum_pct <= 90 THEN 'Kiểm kê 2 tuần/lần, giám sát định kỳ'
      ELSE 'Kiểm kê hàng tháng, quản lý đơn giản'
    END AS recommendation
  FROM with_percentage;
END;
$$;

-- Function: Get turnover analysis
CREATE OR REPLACE FUNCTION public.get_turnover_analysis(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_months INTEGER DEFAULT 3
)
RETURNS TABLE (
  item_id UUID,
  item_code TEXT,
  item_name TEXT,
  category_name TEXT,
  quantity_in INTEGER,
  quantity_out INTEGER,
  avg_stock NUMERIC,
  turnover_rate NUMERIC,
  classification TEXT,
  recommendation TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH period_transactions AS (
    SELECT 
      item_id,
      SUM(quantity) FILTER (WHERE transaction_type = 'in') AS qty_in,
      SUM(ABS(quantity)) FILTER (WHERE transaction_type = 'out') AS qty_out
    FROM inventory_transactions
    WHERE tenant_id = p_tenant_id
      AND hotel_id = p_hotel_id
      AND created_at >= NOW() - (p_months || ' months')::INTERVAL
    GROUP BY item_id
  )
  SELECT 
    i.id,
    i.code,
    i.name,
    c.name,
    COALESCE(t.qty_in, 0)::INTEGER,
    COALESCE(t.qty_out, 0)::INTEGER,
    i.quantity_in_stock::NUMERIC,
    CASE 
      WHEN i.quantity_in_stock > 0 
      THEN ROUND((COALESCE(t.qty_out, 0) / p_months) / i.quantity_in_stock, 2)
      ELSE 0
    END AS turnover,
    CASE 
      WHEN i.quantity_in_stock = 0 OR t.qty_out IS NULL THEN 'Dead'
      WHEN (COALESCE(t.qty_out, 0) / p_months) / NULLIF(i.quantity_in_stock, 0) >= 2 THEN 'Fast'
      WHEN (COALESCE(t.qty_out, 0) / p_months) / NULLIF(i.quantity_in_stock, 0) >= 1 THEN 'Medium'
      ELSE 'Slow'
    END AS class,
    CASE 
      WHEN i.quantity_in_stock = 0 OR t.qty_out IS NULL THEN 'Không sử dụng - Xem xét thanh lý'
      WHEN (COALESCE(t.qty_out, 0) / p_months) / NULLIF(i.quantity_in_stock, 0) >= 2 THEN 'Cần bổ sung thường xuyên'
      WHEN (COALESCE(t.qty_out, 0) / p_months) / NULLIF(i.quantity_in_stock, 0) >= 1 THEN 'Bình thường'
      ELSE 'Xem xét giảm tồn kho'
    END AS recommendation
  FROM items i
  JOIN item_categories c ON c.id = i.category_id
  LEFT JOIN period_transactions t ON t.item_id = i.id
  WHERE i.tenant_id = p_tenant_id
    AND i.hotel_id = p_hotel_id
    AND i.status = 'active'
  ORDER BY turnover DESC NULLS LAST;
END;
$$;

-- Function: Get laundry report
CREATE OR REPLACE FUNCTION public.get_laundry_report(
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
BEGIN
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'total_batches', COUNT(*),
        'total_items', COALESCE(SUM(total_items), 0),
        'total_weight', COALESCE(SUM(total_weight_kg), 0),
        'total_cost', COALESCE(SUM(actual_cost), 0),
        'avg_cost_per_batch', COALESCE(AVG(actual_cost), 0),
        'avg_cost_per_kg', COALESCE(
          SUM(actual_cost) / NULLIF(SUM(total_weight_kg), 0),
          0
        ),
        'avg_quality', ROUND(COALESCE(AVG(quality_rating), 0), 2),
        'avg_timeliness', ROUND(COALESCE(AVG(timeliness_rating), 0), 2),
        'on_time_rate', ROUND(
          (COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date)::NUMERIC / 
           NULLIF(COUNT(*), 0)) * 100,
          2
        )
      )
      FROM laundry_batches
      WHERE tenant_id = p_tenant_id
        AND hotel_id = p_hotel_id
        AND delivery_date BETWEEN p_start_date AND p_end_date
        AND status = 'received'
    ),
    'by_vendor', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'vendor_id', v.id,
          'vendor_name', v.name,
          'batches', COUNT(lb.id),
          'items', COALESCE(SUM(lb.total_items), 0),
          'weight', COALESCE(SUM(lb.total_weight_kg), 0),
          'cost', COALESCE(SUM(lb.actual_cost), 0),
          'cost_per_kg', COALESCE(
            SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0),
            0
          ),
          'quality', ROUND(COALESCE(AVG(lb.quality_rating), 0), 2),
          'on_time_rate', ROUND(
            (COUNT(*) FILTER (WHERE lb.actual_return_date <= lb.expected_return_date)::NUMERIC / 
             NULLIF(COUNT(*), 0)) * 100,
            2
          ),
          'issues', COUNT(*) FILTER (WHERE lb.items_lost > 0 OR lb.items_damaged > 0)
        )
        ORDER BY SUM(lb.actual_cost) DESC
      )
      FROM laundry_vendors v
      LEFT JOIN laundry_batches lb ON lb.vendor_id = v.id
        AND lb.tenant_id = p_tenant_id
        AND lb.hotel_id = p_hotel_id
        AND lb.delivery_date BETWEEN p_start_date AND p_end_date
        AND lb.status = 'received'
      WHERE v.tenant_id = p_tenant_id
        AND v.status = 'active'
      GROUP BY v.id, v.name
      HAVING COUNT(lb.id) > 0
    ),
    'monthly_trend', (
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', p_start_date),
          date_trunc('month', p_end_date),
          '1 month'::INTERVAL
        )::DATE AS month
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'month', TO_CHAR(m.month, 'Mon YYYY'),
          'batches', COUNT(lb.id),
          'items', COALESCE(SUM(lb.total_items), 0),
          'cost', COALESCE(SUM(lb.actual_cost), 0)
        )
        ORDER BY m.month
      )
      FROM months m
      LEFT JOIN laundry_batches lb ON date_trunc('month', lb.delivery_date) = m.month
        AND lb.tenant_id = p_tenant_id
        AND lb.hotel_id = p_hotel_id
        AND lb.status = 'received'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;