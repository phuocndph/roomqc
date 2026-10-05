-- Update get_dashboard_stats to support optional hotel filtering
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_current_month_start DATE := date_trunc('month', now())::date;
  v_last_month_start DATE := (date_trunc('month', now()) - interval '1 month')::date;
  v_result JSONB;
BEGIN
  WITH current_stats AS (
    SELECT 
      COALESCE(SUM(quantity_total * unit_price), 0) as total_value,
      COALESCE(SUM(quantity_total), 0) as total_items,
      COALESCE(SUM(quantity_in_stock), 0) as in_stock,
      COALESCE(SUM(quantity_in_use), 0) as in_use,
      COALESCE(SUM(quantity_in_laundry), 0) as in_laundry,
      COUNT(*) FILTER (WHERE quantity_in_stock < minimum_stock AND status = 'active') as low_stock_count
    FROM items
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status = 'active'
  ),
  last_month_value AS (
    SELECT COALESCE(SUM(quantity_before * unit_price), 0) as value
    FROM (
      SELECT DISTINCT ON (item_id) 
        item_id,
        quantity_before,
        unit_price
      FROM inventory_transactions it
      JOIN items i ON i.id = it.item_id
      WHERE it.tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR it.hotel_id = p_hotel_id)
        AND it.transaction_date >= v_last_month_start
        AND it.transaction_date < v_current_month_start
      ORDER BY item_id, transaction_date DESC
    ) last_month_items
  ),
  laundry_batches_active AS (
    SELECT COUNT(*) as active_batches
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status IN ('delivered', 'washing', 'ready')
  )
  SELECT jsonb_build_object(
    'total_value', (SELECT total_value FROM current_stats),
    'total_value_last_month', (SELECT value FROM last_month_value),
    'total_value_change_percent', 
      CASE 
        WHEN (SELECT value FROM last_month_value) = 0 THEN NULL
        ELSE ROUND(
          (((SELECT total_value FROM current_stats) - (SELECT value FROM last_month_value)) * 100.0) / 
          NULLIF((SELECT value FROM last_month_value), 0),
          2
        )
      END,
    'total_items', (SELECT total_items FROM current_stats),
    'in_stock', (SELECT in_stock FROM current_stats),
    'in_use', (SELECT in_use FROM current_stats),
    'in_laundry', (SELECT in_laundry FROM current_stats),
    'low_stock_count', (SELECT low_stock_count FROM current_stats),
    'active_laundry_batches', (SELECT active_batches FROM laundry_batches_active)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Update get_monthly_expenses to support optional hotel filtering
CREATE OR REPLACE FUNCTION public.get_monthly_expenses(
  p_tenant_id UUID,
  p_months INTEGER DEFAULT 12,
  p_hotel_id UUID DEFAULT NULL
)
RETURNS TABLE(month TEXT, purchase BIGINT, laundry BIGINT, maintenance BIGINT, total BIGINT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH months_range AS (
    SELECT generate_series(
      date_trunc('month', now() - (p_months || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date as month
  ),
  purchase_expenses AS (
    SELECT 
      date_trunc('month', it.transaction_date)::date as month,
      COALESCE(SUM(it.total_value), 0) as amount
    FROM inventory_transactions it
    WHERE it.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR it.hotel_id = p_hotel_id)
      AND it.transaction_type = 'in'
      AND it.transaction_category = 'purchase'
      AND it.transaction_date >= (date_trunc('month', now() - (p_months || ' months')::interval))
    GROUP BY date_trunc('month', it.transaction_date)::date
  ),
  laundry_expenses AS (
    SELECT 
      date_trunc('month', lb.delivery_date)::date as month,
      COALESCE(SUM(lb.actual_cost), 0) as amount
    FROM laundry_batches lb
    WHERE lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND lb.status = 'received'
      AND lb.delivery_date >= (date_trunc('month', now() - (p_months || ' months')::interval))
    GROUP BY date_trunc('month', lb.delivery_date)::date
  ),
  maintenance_expenses AS (
    SELECT 
      date_trunc('month', mr.completed_at)::date as month,
      COALESCE(SUM(mr.actual_cost), 0) as amount
    FROM maintenance_requests mr
    WHERE mr.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR mr.hotel_id = p_hotel_id)
      AND mr.status = 'completed'
      AND mr.completed_at >= (date_trunc('month', now() - (p_months || ' months')::interval))
    GROUP BY date_trunc('month', mr.completed_at)::date
  )
  SELECT 
    to_char(mr.month, 'Mon') as month,
    COALESCE(pe.amount, 0)::BIGINT as purchase,
    COALESCE(le.amount, 0)::BIGINT as laundry,
    COALESCE(me.amount, 0)::BIGINT as maintenance,
    (COALESCE(pe.amount, 0) + COALESCE(le.amount, 0) + COALESCE(me.amount, 0))::BIGINT as total
  FROM months_range mr
  LEFT JOIN purchase_expenses pe ON pe.month = mr.month
  LEFT JOIN laundry_expenses le ON le.month = mr.month
  LEFT JOIN maintenance_expenses me ON me.month = mr.month
  ORDER BY mr.month ASC;
END;
$$;

-- Update get_top_items to support optional hotel filtering
CREATE OR REPLACE FUNCTION public.get_top_items(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_hotel_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  code TEXT,
  name TEXT,
  thumbnail TEXT,
  category_name TEXT,
  category_color TEXT,
  quantity_in_use INTEGER,
  quantity_total INTEGER,
  utilization_rate NUMERIC,
  stock_status TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
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
$$;

-- Update get_recent_activities to support optional hotel filtering
CREATE OR REPLACE FUNCTION public.get_recent_activities(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_hotel_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  type TEXT,
  description TEXT,
  user_name TEXT,
  user_avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    da.id,
    da.type,
    da.description,
    da.user_name,
    da.user_avatar,
    da.created_at,
    da.metadata
  FROM dashboard_activities da
  WHERE da.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR (da.metadata->>'hotel_id')::UUID = p_hotel_id)
  ORDER BY da.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Create function to get hotel breakdown stats for "All Hotels" mode
CREATE OR REPLACE FUNCTION public.get_hotels_breakdown_stats(
  p_tenant_id UUID
)
RETURNS TABLE(
  hotel_id UUID,
  hotel_name TEXT,
  hotel_code TEXT,
  total_value NUMERIC,
  total_items BIGINT,
  in_stock BIGINT,
  in_use BIGINT,
  in_laundry BIGINT,
  low_stock_count BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id as hotel_id,
    h.name as hotel_name,
    h.code as hotel_code,
    COALESCE(SUM(i.quantity_total * i.unit_price), 0) as total_value,
    COALESCE(SUM(i.quantity_total), 0) as total_items,
    COALESCE(SUM(i.quantity_in_stock), 0) as in_stock,
    COALESCE(SUM(i.quantity_in_use), 0) as in_use,
    COALESCE(SUM(i.quantity_in_laundry), 0) as in_laundry,
    COUNT(*) FILTER (WHERE i.quantity_in_stock < i.minimum_stock AND i.status = 'active') as low_stock_count
  FROM hotels h
  LEFT JOIN items i ON i.hotel_id = h.id AND i.status = 'active'
  WHERE h.tenant_id = p_tenant_id
    AND h.status = 'active'
  GROUP BY h.id, h.name, h.code
  ORDER BY total_value DESC;
END;
$$;