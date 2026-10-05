
CREATE OR REPLACE FUNCTION public.get_maintenance_report(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_start_date date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost_by_type jsonb;
  v_monthly_trend jsonb;
  v_recurring_issues jsonb;
  v_summary jsonb;
  v_total_cost numeric;
BEGIN
  -- Total cost (used for percentage)
  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0)
  INTO v_total_cost
  FROM maintenance_requests
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  -- Cost by issue type
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO v_cost_by_type
  FROM (
    SELECT jsonb_build_object(
      'type', COALESCE(issue_type, 'other'),
      'cost', SUM(COALESCE(actual_cost, estimated_cost, 0))::numeric,
      'count', COUNT(*)::int,
      'percentage', CASE
        WHEN v_total_cost > 0
        THEN ROUND((SUM(COALESCE(actual_cost, estimated_cost, 0)) / v_total_cost * 100)::numeric, 1)
        ELSE 0
      END
    ) AS row
    FROM maintenance_requests
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY issue_type
    ORDER BY SUM(COALESCE(actual_cost, estimated_cost, 0)) DESC
  ) t;

  -- Monthly trend (over the requested range)
  SELECT COALESCE(jsonb_agg(row ORDER BY month_key), '[]'::jsonb)
  INTO v_monthly_trend
  FROM (
    SELECT
      to_char(date_trunc('month', created_at), 'MM/YYYY') AS month_key,
      jsonb_build_object(
        'month', to_char(date_trunc('month', created_at), 'MM/YYYY'),
        'requests', COUNT(*)::int,
        'completed', COUNT(*) FILTER (WHERE status = 'completed')::int,
        'cost', SUM(COALESCE(actual_cost, estimated_cost, 0))::numeric
      ) AS row
    FROM maintenance_requests
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY date_trunc('month', created_at)
  ) t;

  -- Recurring issues — group by title (or issue_type) showing repeat counts
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO v_recurring_issues
  FROM (
    SELECT jsonb_build_object(
      'issue', COALESCE(NULLIF(title, ''), issue_type, 'Khác'),
      'count', COUNT(*)::int,
      'avg_time', COALESCE(ROUND(
        AVG(
          CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600
          ELSE NULL END
        )::numeric, 1
      ), 0),
      'total_cost', SUM(COALESCE(actual_cost, estimated_cost, 0))::numeric
    ) AS row
    FROM maintenance_requests
    WHERE tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
      AND created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY COALESCE(NULLIF(title, ''), issue_type, 'Khác')
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) t;

  -- Summary
  SELECT jsonb_build_object(
    'total_requests', COUNT(*)::int,
    'completed', COUNT(*) FILTER (WHERE status = 'completed')::int,
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress')::int,
    'pending', COUNT(*) FILTER (WHERE status IN ('pending','waiting'))::int,
    'total_cost', COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)), 0)::numeric,
    'avg_cost', COALESCE(ROUND(AVG(COALESCE(actual_cost, estimated_cost, 0))::numeric, 0), 0)
  )
  INTO v_summary
  FROM maintenance_requests
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'cost_by_type', v_cost_by_type,
    'monthly_trend', v_monthly_trend,
    'recurring_issues', v_recurring_issues
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_report(uuid, uuid, date, date) TO authenticated;
