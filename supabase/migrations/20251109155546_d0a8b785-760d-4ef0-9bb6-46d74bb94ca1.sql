-- ============================================
-- LAUNDRY MANAGEMENT FUNCTIONS
-- ============================================

-- Function: Get laundry dashboard stats
CREATE OR REPLACE FUNCTION public.get_laundry_dashboard_stats(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH current_stats AS (
    SELECT 
      COALESCE(SUM(i.quantity_in_laundry), 0) as items_in_laundry,
      COUNT(DISTINCT lb.id) FILTER (
        WHERE lb.status IN ('delivered', 'washing', 'ready')
      ) as active_batches
    FROM items i
    LEFT JOIN laundry_batch_items lbi ON lbi.item_id = i.id
    LEFT JOIN laundry_batches lb ON lb.id = lbi.batch_id
    WHERE i.tenant_id = p_tenant_id
  ),
  monthly_cost AS (
    SELECT 
      COALESCE(SUM(actual_cost), 0) as current_month,
      COALESCE(SUM(actual_cost) FILTER (
        WHERE delivery_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          AND delivery_date < DATE_TRUNC('month', NOW())
      ), 0) as last_month
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND status = 'received'
      AND delivery_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  ),
  quality_stats AS (
    SELECT 
      COALESCE(AVG((quality_rating + timeliness_rating) / 2), 0) as avg_rating
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND status = 'received'
      AND delivery_date >= NOW() - INTERVAL '30 days'
  )
  SELECT jsonb_build_object(
    'items_in_laundry', (SELECT items_in_laundry FROM current_stats),
    'active_batches', (SELECT active_batches FROM current_stats),
    'current_month_cost', (SELECT current_month FROM monthly_cost),
    'last_month_cost', (SELECT last_month FROM monthly_cost),
    'cost_change_percent', 
      CASE 
        WHEN (SELECT last_month FROM monthly_cost) = 0 THEN NULL
        ELSE ROUND(
          (((SELECT current_month FROM monthly_cost) - (SELECT last_month FROM monthly_cost)) * 100.0) / 
          NULLIF((SELECT last_month FROM monthly_cost), 0),
          2
        )
      END,
    'avg_quality_rating', ROUND((SELECT avg_rating FROM quality_stats), 2)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function: Get laundry batches with filters
CREATE OR REPLACE FUNCTION public.get_laundry_batches_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  batch_code text,
  vendor_id uuid,
  vendor_name text,
  vendor_logo text,
  vendor_rating numeric,
  delivery_date timestamp with time zone,
  expected_return_date timestamp with time zone,
  actual_return_date timestamp with time zone,
  total_items integer,
  total_weight_kg numeric,
  estimated_cost numeric,
  actual_cost numeric,
  status text,
  quality_rating numeric,
  timeliness_rating numeric,
  items_lost integer,
  items_damaged integer,
  created_at timestamp with time zone,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_batches AS (
    SELECT 
      lb.*,
      lv.name as vendor_name,
      lv.contract_info->>'logo_url' as vendor_logo,
      lv.rating as vendor_rating
    FROM laundry_batches lb
    JOIN laundry_vendors lv ON lv.id = lb.vendor_id
    WHERE lb.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
      AND (p_vendor_id IS NULL OR lb.vendor_id = p_vendor_id)
      AND (p_status IS NULL OR lb.status = p_status)
      AND (p_from_date IS NULL OR lb.delivery_date::date >= p_from_date)
      AND (p_to_date IS NULL OR lb.delivery_date::date <= p_to_date)
  )
  SELECT 
    fb.id,
    fb.batch_code,
    fb.vendor_id,
    fb.vendor_name,
    fb.vendor_logo,
    fb.vendor_rating,
    fb.delivery_date,
    fb.expected_return_date,
    fb.actual_return_date,
    fb.total_items,
    fb.total_weight_kg,
    fb.estimated_cost,
    fb.actual_cost,
    fb.status,
    fb.quality_rating,
    fb.timeliness_rating,
    fb.items_lost,
    fb.items_damaged,
    fb.created_at,
    COUNT(*) OVER() as total_count
  FROM filtered_batches fb
  ORDER BY fb.delivery_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: Get batch detail with items
CREATE OR REPLACE FUNCTION public.get_laundry_batch_detail(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'batch', row_to_json(lb.*),
    'vendor', row_to_json(lv.*),
    'hotel', row_to_json(h.*),
    'delivery_staff', row_to_json(ds.*),
    'return_staff', row_to_json(rs.*),
    'items', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', lbi.id,
          'item_id', lbi.item_id,
          'item_code', i.code,
          'item_name', i.name,
          'item_thumbnail', i.images[1],
          'category_name', c.name,
          'quantity_delivered', lbi.quantity_delivered,
          'weight_kg', lbi.weight_kg,
          'condition_note', lbi.condition_note,
          'quantity_returned', lbi.quantity_returned,
          'quantity_lost', lbi.quantity_lost,
          'quantity_damaged', lbi.quantity_damaged,
          'return_condition', lbi.return_condition
        )
      )
      FROM laundry_batch_items lbi
      JOIN items i ON i.id = lbi.item_id
      LEFT JOIN item_categories c ON c.id = i.category_id
      WHERE lbi.batch_id = lb.id
    )
  ) INTO v_result
  FROM laundry_batches lb
  JOIN laundry_vendors lv ON lv.id = lb.vendor_id
  JOIN hotels h ON h.id = lb.hotel_id
  LEFT JOIN users ds ON ds.id = lb.delivery_staff_id
  LEFT JOIN users rs ON rs.id = lb.return_staff_id
  WHERE lb.id = p_batch_id;
  
  RETURN v_result;
END;
$$;

-- Function: Get vendor performance stats
CREATE OR REPLACE FUNCTION public.get_vendor_performance(
  p_vendor_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH stats AS (
    SELECT 
      COUNT(*) as total_orders,
      SUM(actual_cost) as total_cost,
      AVG(quality_rating) as avg_quality,
      AVG(timeliness_rating) as avg_timeliness,
      SUM(items_lost) as total_lost,
      SUM(items_damaged) as total_damaged,
      COUNT(*) FILTER (
        WHERE actual_return_date <= expected_return_date
      )::numeric / NULLIF(COUNT(*), 0) * 100 as on_time_rate
    FROM laundry_batches
    WHERE vendor_id = p_vendor_id
      AND status = 'received'
      AND delivery_date >= NOW() - (p_days || ' days')::interval
  )
  SELECT jsonb_build_object(
    'total_orders', COALESCE(total_orders, 0),
    'total_cost', COALESCE(total_cost, 0),
    'avg_quality', ROUND(COALESCE(avg_quality, 0), 2),
    'avg_timeliness', ROUND(COALESCE(avg_timeliness, 0), 2),
    'avg_rating', ROUND(COALESCE((avg_quality + avg_timeliness) / 2, 0), 2),
    'total_lost', COALESCE(total_lost, 0),
    'total_damaged', COALESCE(total_damaged, 0),
    'on_time_rate', ROUND(COALESCE(on_time_rate, 0), 2)
  ) INTO v_result
  FROM stats;
  
  RETURN v_result;
END;
$$;

-- Function: Get monthly laundry expenses
CREATE OR REPLACE FUNCTION public.get_monthly_laundry_expenses(
  p_tenant_id uuid,
  p_year integer DEFAULT EXTRACT(YEAR FROM NOW())::integer
)
RETURNS TABLE (
  month text,
  total_batches bigint,
  total_items bigint,
  estimated_cost bigint,
  actual_cost bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      DATE_TRUNC('year', MAKE_DATE(p_year, 1, 1)),
      DATE_TRUNC('year', MAKE_DATE(p_year, 12, 31)) + INTERVAL '11 months',
      '1 month'::interval
    )::date as month
  )
  SELECT 
    TO_CHAR(m.month, 'Mon') as month,
    COALESCE(COUNT(lb.id), 0) as total_batches,
    COALESCE(SUM(lb.total_items), 0) as total_items,
    COALESCE(SUM(lb.estimated_cost), 0)::bigint as estimated_cost,
    COALESCE(SUM(lb.actual_cost), 0)::bigint as actual_cost
  FROM months m
  LEFT JOIN laundry_batches lb ON 
    DATE_TRUNC('month', lb.delivery_date) = m.month
    AND lb.tenant_id = p_tenant_id
    AND lb.status != 'cancelled'
  GROUP BY m.month
  ORDER BY m.month;
END;
$$;