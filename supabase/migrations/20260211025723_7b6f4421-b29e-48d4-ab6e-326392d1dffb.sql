
CREATE OR REPLACE FUNCTION public.get_maintenance_dashboard(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  v_total INT;
  v_in_progress INT;
  v_completed INT;
  v_total_last30 INT;
  v_completed_last30 INT;
  v_cost_last30 NUMERIC;
  v_mttr NUMERIC;
  v_mtbf NUMERIC;
  v_first_time_fix_rate INT;
  v_thirty_days_ago TIMESTAMPTZ := now() - interval '30 days';
  v_active_requests JSONB;
  v_recent_completions JSONB;
BEGIN
  -- Total counts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('waiting', 'pending', 'in_progress')),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE created_at >= v_thirty_days_ago),
    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= v_thirty_days_ago),
    COALESCE(SUM(actual_cost) FILTER (WHERE status = 'completed' AND completed_at >= v_thirty_days_ago), 0)
  INTO v_total, v_in_progress, v_completed, v_total_last30, v_completed_last30, v_cost_last30
  FROM maintenance_requests
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id);

  -- MTTR (Mean Time To Repair) in hours
  SELECT COALESCE(
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - reported_at)) / 3600)::numeric, 1),
    0
  )
  INTO v_mttr
  FROM maintenance_requests
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status = 'completed'
    AND completed_at IS NOT NULL
    AND reported_at IS NOT NULL;

  -- MTBF (Mean Time Between Failures) in days
  SELECT COALESCE(ROUND(AVG(avg_interval)), 0)
  INTO v_mtbf
  FROM (
    SELECT item_id, 
      AVG(EXTRACT(EPOCH FROM (reported_at - prev_reported)) / 86400) as avg_interval
    FROM (
      SELECT item_id, reported_at,
        LAG(reported_at) OVER (PARTITION BY item_id ORDER BY reported_at) as prev_reported
      FROM maintenance_requests
      WHERE tenant_id = p_tenant_id
        AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
        AND item_id IS NOT NULL
    ) sub
    WHERE prev_reported IS NOT NULL
    GROUP BY item_id
  ) intervals;

  -- First Time Fix Rate using NOT EXISTS
  IF v_completed > 0 THEN
    SELECT ROUND(
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM maintenance_requests fu
          WHERE (fu.item_id = mr.item_id OR fu.room_id = mr.room_id)
            AND fu.tenant_id = p_tenant_id
            AND fu.reported_at > mr.completed_at
            AND fu.reported_at <= mr.completed_at + interval '7 days'
            AND fu.id != mr.id
        )
      )::numeric / COUNT(*)::numeric * 100
    )
    INTO v_first_time_fix_rate
    FROM maintenance_requests mr
    WHERE mr.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR mr.hotel_id = p_hotel_id)
      AND mr.status = 'completed'
      AND mr.completed_at IS NOT NULL;
  ELSE
    v_first_time_fix_rate := 0;
  END IF;

  -- Active requests by priority (limit 50)
  SELECT COALESCE(jsonb_agg(row_to_json(ar)::jsonb), '[]'::jsonb)
  INTO v_active_requests
  FROM (
    SELECT mr.*, 
      row_to_json(r) as room,
      row_to_json(i) as item
    FROM maintenance_requests mr
    LEFT JOIN rooms r ON r.id = mr.room_id
    LEFT JOIN items i ON i.id = mr.item_id
    WHERE mr.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR mr.hotel_id = p_hotel_id)
      AND mr.status NOT IN ('completed', 'cancelled')
    ORDER BY 
      CASE mr.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      mr.created_at DESC
    LIMIT 50
  ) ar;

  -- Recent completions (top 10)
  SELECT COALESCE(jsonb_agg(row_to_json(rc)::jsonb), '[]'::jsonb)
  INTO v_recent_completions
  FROM (
    SELECT mr.*,
      row_to_json(r) as room,
      row_to_json(i) as item
    FROM maintenance_requests mr
    LEFT JOIN rooms r ON r.id = mr.room_id
    LEFT JOIN items i ON i.id = mr.item_id
    WHERE mr.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR mr.hotel_id = p_hotel_id)
      AND mr.status = 'completed'
    ORDER BY mr.completed_at DESC
    LIMIT 10
  ) rc;

  result := jsonb_build_object(
    'stats', jsonb_build_object(
      'total', v_total,
      'totalLast30Days', v_total_last30,
      'inProgress', v_in_progress,
      'completed', v_completed,
      'completedLast30Days', v_completed_last30,
      'completionRate', CASE WHEN v_total > 0 THEN ROUND(v_completed::numeric / v_total * 100) ELSE 0 END,
      'avgTime', v_mttr,
      'costLast30Days', v_cost_last30,
      'mttr', v_mttr,
      'mtbf', v_mtbf,
      'firstTimeFixRate', v_first_time_fix_rate
    ),
    'activeRequests', v_active_requests,
    'recentCompletions', v_recent_completions
  );

  RETURN result;
END;
$$;
