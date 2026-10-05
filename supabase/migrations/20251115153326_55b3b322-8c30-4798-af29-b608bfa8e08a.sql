-- Fix get_laundry_dashboard_stats: Add hotel_id parameter and fix status filtering
DROP FUNCTION IF EXISTS public.get_laundry_dashboard_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_laundry_dashboard_stats(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
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
      AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
      AND (lb.id IS NULL OR (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id))
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
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status IN ('received', 'stocked')
      AND delivery_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  ),
  quality_stats AS (
    SELECT 
      COALESCE(AVG((quality_rating + timeliness_rating) / 2), 0) as avg_rating
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND status IN ('received', 'stocked')
      AND delivery_date >= NOW() - INTERVAL '30 days'
  )
  SELECT jsonb_build_object(
    'items_in_laundry', cs.items_in_laundry,
    'active_batches', cs.active_batches,
    'current_month_cost', mc.current_month,
    'last_month_cost', mc.last_month,
    'cost_change_percent', 
      CASE 
        WHEN mc.last_month > 0 THEN
          ROUND(((mc.current_month - mc.last_month)::NUMERIC / mc.last_month * 100), 2)
        ELSE NULL
      END,
    'avg_quality_rating', ROUND(qs.avg_rating::NUMERIC, 2)
  )
  INTO v_result
  FROM current_stats cs, monthly_cost mc, quality_stats qs;
  
  RETURN v_result;
END;
$function$;

-- Fix get_monthly_laundry_expenses: Add hotel_id parameter
DROP FUNCTION IF EXISTS public.get_monthly_laundry_expenses(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_monthly_laundry_expenses(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_year integer DEFAULT EXTRACT(YEAR FROM NOW())::integer
)
RETURNS TABLE(
  month text,
  total_batches bigint,
  total_items bigint,
  estimated_cost bigint,
  actual_cost bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      DATE_TRUNC('month', (p_year || '-01-01')::date),
      DATE_TRUNC('month', (p_year || '-12-01')::date),
      '1 month'::interval
    ) as month
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
    AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
    AND lb.status != 'cancelled'
  GROUP BY m.month
  ORDER BY m.month;
END;
$function$;