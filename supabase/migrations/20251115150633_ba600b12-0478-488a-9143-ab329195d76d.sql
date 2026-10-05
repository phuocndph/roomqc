-- ============================================
-- FIX REPORTING FUNCTIONS: Hotel Filter & Status
-- ============================================

-- Fix 1: get_inventory_report - Add NULL-safe hotel_id filter
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
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
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
                     WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)), 0)) * 100,
            2
          )
        )
        ORDER BY SUM(i.quantity_in_stock * i.unit_price) DESC
      )
      FROM item_categories c
      LEFT JOIN items i ON i.category_id = c.id 
        AND i.tenant_id = p_tenant_id 
        AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
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
                     WHERE tenant_id = p_tenant_id AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)), 0)) * 100,
            2
          )
        )
      )
      FROM items i
      JOIN item_categories c ON c.id = i.category_id
      WHERE i.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
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
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND status = 'active'
    ),
    'transaction_summary', (
      SELECT jsonb_build_object(
        'total_transactions', COUNT(*),
        'inbound_count', COUNT(*) FILTER (WHERE transaction_type = 'in'),
        'outbound_count', COUNT(*) FILTER (WHERE transaction_type = 'out'),
        'adjustment_count', COUNT(*) FILTER (WHERE transaction_type = 'adjustment'),
        'total_inbound_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'in'), 0),
        'total_outbound_value', COALESCE(SUM(total_value) FILTER (WHERE transaction_type = 'out'), 0)
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

-- Fix 2: get_financial_report - Add NULL-safe hotel_id filter
DROP FUNCTION IF EXISTS public.get_financial_report(UUID, UUID, DATE, DATE);

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
    'cost_summary', (
      SELECT jsonb_build_object(
        'purchase_cost', COALESCE(
          (SELECT SUM(total_value) FROM inventory_transactions 
           WHERE tenant_id = p_tenant_id 
             AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
             AND transaction_type = 'in' 
             AND transaction_category = 'purchase'
             AND transaction_date BETWEEN p_start_date AND p_end_date), 0
        ),
        'laundry_cost', COALESCE(
          (SELECT SUM(actual_cost) FROM laundry_batches 
           WHERE tenant_id = p_tenant_id 
             AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
             AND status IN ('received', 'stocked')
             AND delivery_date BETWEEN p_start_date AND p_end_date), 0
        ),
        'maintenance_cost', COALESCE(
          (SELECT SUM(actual_cost) FROM maintenance_requests 
           WHERE tenant_id = p_tenant_id 
             AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
             AND status = 'completed'
             AND completed_at BETWEEN p_start_date AND p_end_date), 0
        ),
        'total_cost', COALESCE(
          (SELECT SUM(total_value) FROM inventory_transactions 
           WHERE tenant_id = p_tenant_id 
             AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
             AND transaction_type = 'in' 
             AND transaction_date BETWEEN p_start_date AND p_end_date), 0
        ) + COALESCE(
          (SELECT SUM(actual_cost) FROM laundry_batches 
           WHERE tenant_id = p_tenant_id 
             AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
             AND status IN ('received', 'stocked')
             AND delivery_date BETWEEN p_start_date AND p_end_date), 0
        ) + COALESCE(
          (SELECT SUM(actual_cost) FROM maintenance_requests 
           WHERE tenant_id = p_tenant_id 
             AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
             AND status = 'completed'
             AND completed_at BETWEEN p_start_date AND p_end_date), 0
        )
      )
    ),
    'monthly_trend', (
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', p_start_date),
          date_trunc('month', p_end_date),
          '1 month'::interval
        )::date as month
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'month', to_char(m.month, 'Mon'),
          'purchase', COALESCE(
            (SELECT SUM(total_value) FROM inventory_transactions 
             WHERE tenant_id = p_tenant_id 
               AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
               AND transaction_type = 'in'
               AND transaction_category = 'purchase'
               AND date_trunc('month', transaction_date) = m.month), 0
          ),
          'laundry', COALESCE(
            (SELECT SUM(actual_cost) FROM laundry_batches 
             WHERE tenant_id = p_tenant_id 
               AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
               AND status IN ('received', 'stocked')
               AND date_trunc('month', delivery_date) = m.month), 0
          ),
          'maintenance', COALESCE(
            (SELECT SUM(actual_cost) FROM maintenance_requests 
             WHERE tenant_id = p_tenant_id 
               AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
               AND status = 'completed'
               AND date_trunc('month', completed_at) = m.month), 0
          )
        )
        ORDER BY m.month
      )
      FROM months m
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Fix 3: get_abc_analysis - Add NULL-safe hotel_id filter
DROP FUNCTION IF EXISTS public.get_abc_analysis(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_abc_analysis(
  p_tenant_id UUID,
  p_hotel_id UUID
)
RETURNS TABLE (
  item_id UUID,
  item_code TEXT,
  item_name TEXT,
  category_name TEXT,
  total_value NUMERIC,
  cumulative_value NUMERIC,
  percentage NUMERIC,
  cumulative_percentage NUMERIC,
  abc_class TEXT
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
      c.name as category,
      (i.quantity_in_stock * i.unit_price) as value
    FROM items i
    LEFT JOIN item_categories c ON c.id = i.category_id
    WHERE i.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
      AND i.status = 'active'
      AND i.quantity_in_stock > 0
  ),
  total_value AS (
    SELECT SUM(value) as total FROM item_values
  ),
  ranked_items AS (
    SELECT 
      iv.*,
      SUM(iv.value) OVER (ORDER BY iv.value DESC) as cumulative,
      ROUND((iv.value / tv.total * 100)::NUMERIC, 2) as pct,
      ROUND((SUM(iv.value) OVER (ORDER BY iv.value DESC) / tv.total * 100)::NUMERIC, 2) as cum_pct
    FROM item_values iv, total_value tv
  )
  SELECT 
    ri.id,
    ri.code,
    ri.name,
    ri.category,
    ri.value,
    ri.cumulative,
    ri.pct,
    ri.cum_pct,
    CASE 
      WHEN ri.cum_pct <= 80 THEN 'A'
      WHEN ri.cum_pct <= 95 THEN 'B'
      ELSE 'C'
    END::TEXT
  FROM ranked_items ri
  ORDER BY ri.value DESC;
END;
$$;

-- Fix 4: get_turnover_analysis - Add NULL-safe hotel_id filter
DROP FUNCTION IF EXISTS public.get_turnover_analysis(UUID, UUID, INTEGER);

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
  avg_stock NUMERIC,
  total_usage NUMERIC,
  turnover_rate NUMERIC,
  days_in_stock NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_start_date DATE := CURRENT_DATE - (p_months || ' months')::INTERVAL;
BEGIN
  RETURN QUERY
  WITH item_usage AS (
    SELECT 
      it.item_id,
      AVG(i.quantity_in_stock) as avg_stock,
      SUM(ABS(it.quantity)) FILTER (WHERE it.transaction_type = 'out') as total_out
    FROM inventory_transactions it
    JOIN items i ON i.id = it.item_id
    WHERE it.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR it.hotel_id = p_hotel_id)
      AND it.transaction_date >= v_start_date
    GROUP BY it.item_id
  )
  SELECT 
    i.id,
    i.code,
    i.name,
    c.name as category,
    COALESCE(iu.avg_stock, i.quantity_in_stock::NUMERIC),
    COALESCE(iu.total_out, 0),
    CASE 
      WHEN COALESCE(iu.avg_stock, i.quantity_in_stock) > 0 
      THEN ROUND(COALESCE(iu.total_out, 0) / COALESCE(iu.avg_stock, i.quantity_in_stock), 2)
      ELSE 0 
    END,
    CASE 
      WHEN COALESCE(iu.total_out, 0) > 0 
      THEN ROUND((COALESCE(iu.avg_stock, i.quantity_in_stock) * (p_months * 30)::NUMERIC / COALESCE(iu.total_out, 1)), 2)
      ELSE 999 
    END,
    CASE 
      WHEN COALESCE(iu.total_out, 0) = 0 THEN 'slow'
      WHEN COALESCE(iu.total_out, 0) / NULLIF(COALESCE(iu.avg_stock, i.quantity_in_stock), 0) > 6 THEN 'fast'
      WHEN COALESCE(iu.total_out, 0) / NULLIF(COALESCE(iu.avg_stock, i.quantity_in_stock), 0) > 3 THEN 'medium'
      ELSE 'slow'
    END::TEXT
  FROM items i
  LEFT JOIN item_categories c ON c.id = i.category_id
  LEFT JOIN item_usage iu ON iu.item_id = i.id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND i.status = 'active'
  ORDER BY COALESCE(iu.total_out, 0) / NULLIF(COALESCE(iu.avg_stock, i.quantity_in_stock), 0) DESC NULLS LAST;
END;
$$;

-- Fix 5: get_laundry_report - Add NULL-safe hotel_id filter + Include 'stocked' status
DROP FUNCTION IF EXISTS public.get_laundry_report(UUID, UUID, DATE, DATE);

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
        'avg_cost_per_kg', ROUND(
          COALESCE(SUM(actual_cost) / NULLIF(SUM(total_weight_kg), 0), 0), 2
        ),
        'avg_quality_rating', ROUND(AVG(quality_rating), 2),
        'avg_timeliness_rating', ROUND(AVG(timeliness_rating), 2),
        'items_damaged', COALESCE(SUM(items_damaged), 0),
        'items_lost', COALESCE(SUM(items_lost), 0),
        'total_compensation', COALESCE(SUM(compensation_amount), 0),
        'on_time_rate', ROUND(
          (COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date)::NUMERIC / 
           NULLIF(COUNT(*) FILTER (WHERE actual_return_date IS NOT NULL), 0) * 100), 2
        )
      )
      FROM laundry_batches
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND delivery_date BETWEEN p_start_date AND p_end_date
        AND status IN ('received', 'stocked')
    ),
    'by_vendor', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'vendor_id', v.id,
          'vendor_name', v.name,
          'vendor_code', v.code,
          'batch_count', COUNT(lb.id),
          'total_items', COALESCE(SUM(lb.total_items), 0),
          'total_weight', COALESCE(SUM(lb.total_weight_kg), 0),
          'total_cost', COALESCE(SUM(lb.actual_cost), 0),
          'avg_cost_per_kg', ROUND(
            COALESCE(SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0), 0), 2
          ),
          'avg_quality', ROUND(AVG(lb.quality_rating), 2),
          'avg_timeliness', ROUND(AVG(lb.timeliness_rating), 2),
          'items_damaged', COALESCE(SUM(lb.items_damaged), 0),
          'items_lost', COALESCE(SUM(lb.items_lost), 0),
          'on_time_deliveries', COUNT(*) FILTER (WHERE lb.actual_return_date <= lb.expected_return_date)
        )
        ORDER BY SUM(lb.actual_cost) DESC
      )
      FROM laundry_vendors v
      LEFT JOIN laundry_batches lb ON lb.vendor_id = v.id
        AND lb.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
        AND lb.delivery_date BETWEEN p_start_date AND p_end_date
        AND lb.status IN ('received', 'stocked')
      WHERE v.tenant_id = p_tenant_id
        AND v.status = 'active'
      GROUP BY v.id, v.name, v.code
      HAVING COUNT(lb.id) > 0
    ),
    'monthly_trend', (
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', p_start_date),
          date_trunc('month', p_end_date),
          '1 month'::interval
        )::date as month
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'month', to_char(m.month, 'Mon'),
          'batches', COUNT(lb.id),
          'items', COALESCE(SUM(lb.total_items), 0),
          'cost', COALESCE(SUM(lb.actual_cost), 0),
          'avg_quality', ROUND(AVG(lb.quality_rating), 2),
          'avg_timeliness', ROUND(AVG(lb.timeliness_rating), 2)
        )
        ORDER BY m.month
      )
      FROM months m
      LEFT JOIN laundry_batches lb ON date_trunc('month', lb.delivery_date) = m.month
        AND lb.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
        AND lb.status IN ('received', 'stocked')
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;