-- Fix get_laundry_report RPC function - resolve nested aggregate error
CREATE OR REPLACE FUNCTION public.get_laundry_report(
  p_tenant_id uuid,
  p_start_date date DEFAULT (CURRENT_DATE - '30 days'::interval),
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_summary jsonb;
  v_by_vendor jsonb;
  v_monthly_trend jsonb;
  v_avg_cost_per_kg numeric;
BEGIN
  -- Calculate average cost per kg first (avoid nested aggregates)
  SELECT COALESCE(SUM(actual_cost) / NULLIF(SUM(total_weight_kg), 0), 0)
  INTO v_avg_cost_per_kg
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND status IN ('received', 'stocked', 'completed')
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  -- Summary statistics
  SELECT jsonb_build_object(
    'total_batches', COALESCE(COUNT(*), 0),
    'total_items', COALESCE(SUM(total_items), 0),
    'total_weight_kg', COALESCE(ROUND(SUM(total_weight_kg)::numeric, 1), 0),
    'total_cost', COALESCE(SUM(actual_cost), 0),
    'avg_cost_per_kg', COALESCE(ROUND(v_avg_cost_per_kg, 0), 0),
    'avg_quality_rating', COALESCE(ROUND(AVG(quality_rating)::numeric, 1), 0),
    'total_damaged', COALESCE(SUM(items_damaged), 0),
    'total_lost', COALESCE(SUM(items_lost), 0),
    'on_time_rate', COALESCE(
      ROUND(
        (COUNT(*) FILTER (WHERE actual_return_date <= expected_return_date)::numeric / 
         NULLIF(COUNT(*) FILTER (WHERE actual_return_date IS NOT NULL), 0)) * 100, 1
      ), 0
    )
  )
  INTO v_summary
  FROM laundry_batches
  WHERE tenant_id = p_tenant_id
    AND delivery_date BETWEEN p_start_date AND p_end_date;

  -- By vendor statistics
  SELECT COALESCE(jsonb_agg(vendor_data ORDER BY total_cost DESC), '[]'::jsonb)
  INTO v_by_vendor
  FROM (
    SELECT jsonb_build_object(
      'vendor_id', lv.id,
      'vendor_name', lv.name,
      'vendor_code', lv.code,
      'total_batches', COUNT(lb.id),
      'total_items', COALESCE(SUM(lb.total_items), 0),
      'total_weight_kg', COALESCE(ROUND(SUM(lb.total_weight_kg)::numeric, 1), 0),
      'total_cost', COALESCE(SUM(lb.actual_cost), 0),
      'avg_cost_per_kg', COALESCE(
        ROUND((SUM(lb.actual_cost) / NULLIF(SUM(lb.total_weight_kg), 0))::numeric, 0), 0
      ),
      'avg_quality_rating', COALESCE(ROUND(AVG(lb.quality_rating)::numeric, 1), 0),
      'total_damaged', COALESCE(SUM(lb.items_damaged), 0),
      'total_lost', COALESCE(SUM(lb.items_lost), 0),
      'on_time_rate', COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE lb.actual_return_date <= lb.expected_return_date)::numeric / 
           NULLIF(COUNT(*) FILTER (WHERE lb.actual_return_date IS NOT NULL), 0)) * 100, 1
        ), 0
      )
    ) as vendor_data
    FROM laundry_vendors lv
    LEFT JOIN laundry_batches lb ON lb.vendor_id = lv.id
      AND lb.delivery_date BETWEEN p_start_date AND p_end_date
    WHERE lv.tenant_id = p_tenant_id
      AND lv.status = 'active'
    GROUP BY lv.id, lv.name, lv.code
    HAVING COUNT(lb.id) > 0
  ) sub;

  -- Monthly trend
  SELECT COALESCE(jsonb_agg(month_data ORDER BY month_key), '[]'::jsonb)
  INTO v_monthly_trend
  FROM (
    SELECT jsonb_build_object(
      'month', TO_CHAR(delivery_date, 'Mon'),
      'month_key', TO_CHAR(delivery_date, 'YYYY-MM'),
      'total_batches', COUNT(*),
      'total_items', COALESCE(SUM(total_items), 0),
      'total_cost', COALESCE(SUM(actual_cost), 0),
      'avg_quality', COALESCE(ROUND(AVG(quality_rating)::numeric, 1), 0)
    ) as month_data,
    TO_CHAR(delivery_date, 'YYYY-MM') as month_key
    FROM laundry_batches
    WHERE tenant_id = p_tenant_id
      AND delivery_date BETWEEN p_start_date AND p_end_date
    GROUP BY TO_CHAR(delivery_date, 'YYYY-MM'), TO_CHAR(delivery_date, 'Mon')
  ) sub;

  -- Build final result
  result := jsonb_build_object(
    'summary', v_summary,
    'by_vendor', v_by_vendor,
    'monthly_trend', v_monthly_trend,
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  RETURN result;
END;
$$;