-- Drop and recreate room checks report function with correct column names
DROP FUNCTION IF EXISTS get_room_checks_report(UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_room_checks_report(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_check_stats JSONB;
  v_deficiencies JSONB;
  v_top_issues JSONB;
  v_staff_performance JSONB;
  v_checks_by_type JSONB;
BEGIN
  -- Default date range to last 30 days if not provided
  p_start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  p_end_date := COALESCE(p_end_date, CURRENT_DATE);

  -- 1. Check statistics (using cleanliness_score and checked_at)
  SELECT jsonb_build_object(
    'total_checks', COALESCE(COUNT(*), 0),
    'avg_score', ROUND(COALESCE(AVG(cleanliness_score), 0)::NUMERIC, 1),
    'issues_found', COALESCE(SUM(
      COALESCE(jsonb_array_length(items_missing), 0) +
      COALESCE(jsonb_array_length(items_damaged), 0) +
      COALESCE(jsonb_array_length(items_lost), 0)
    ), 0),
    'daily_checks', COALESCE(COUNT(*) FILTER (WHERE check_type = 'daily'), 0),
    'checkout_checks', COALESCE(COUNT(*) FILTER (WHERE check_type = 'checkout'), 0),
    'checkin_checks', COALESCE(COUNT(*) FILTER (WHERE check_type = 'checkin'), 0)
  ) INTO v_check_stats
  FROM room_checks rc
  JOIN rooms r ON rc.room_id = r.id
  WHERE r.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
    AND rc.checked_at::DATE >= p_start_date
    AND rc.checked_at::DATE <= p_end_date;

  -- 2. Deficiencies by room
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_deficiencies
  FROM (
    SELECT jsonb_build_object(
      'room_id', r.id,
      'room_number', r.room_number,
      'room_type', r.room_type,
      'missing_count', COALESCE(SUM(COALESCE(jsonb_array_length(rc.items_missing), 0)), 0),
      'damaged_count', COALESCE(SUM(COALESCE(jsonb_array_length(rc.items_damaged), 0)), 0),
      'lost_count', COALESCE(SUM(COALESCE(jsonb_array_length(rc.items_lost), 0)), 0),
      'total_issues', COALESCE(SUM(
        COALESCE(jsonb_array_length(rc.items_missing), 0) +
        COALESCE(jsonb_array_length(rc.items_damaged), 0) +
        COALESCE(jsonb_array_length(rc.items_lost), 0)
      ), 0),
      'last_check_date', MAX(rc.checked_at)
    ) AS row_data
    FROM rooms r
    LEFT JOIN room_checks rc ON rc.room_id = r.id
      AND rc.checked_at::DATE >= p_start_date
      AND rc.checked_at::DATE <= p_end_date
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
    GROUP BY r.id, r.room_number, r.room_type
    HAVING COALESCE(SUM(
      COALESCE(jsonb_array_length(rc.items_missing), 0) +
      COALESCE(jsonb_array_length(rc.items_damaged), 0) +
      COALESCE(jsonb_array_length(rc.items_lost), 0)
    ), 0) > 0
    ORDER BY COALESCE(SUM(
      COALESCE(jsonb_array_length(rc.items_missing), 0) +
      COALESCE(jsonb_array_length(rc.items_damaged), 0) +
      COALESCE(jsonb_array_length(rc.items_lost), 0)
    ), 0) DESC
    LIMIT 20
  ) sub;

  -- 3. Top issues
  WITH all_issues AS (
    SELECT 
      COALESCE(issue_item->>'item_name', issue_item->>'name', 'Unknown') AS item_name,
      issue_item->>'item_id' AS item_id,
      'missing' AS issue_type
    FROM room_checks rc
    JOIN rooms r ON rc.room_id = r.id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rc.items_missing, '[]'::jsonb)) AS issue_item
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rc.checked_at::DATE >= p_start_date
      AND rc.checked_at::DATE <= p_end_date
    UNION ALL
    SELECT 
      COALESCE(issue_item->>'item_name', issue_item->>'name', 'Unknown') AS item_name,
      issue_item->>'item_id' AS item_id,
      'damaged' AS issue_type
    FROM room_checks rc
    JOIN rooms r ON rc.room_id = r.id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rc.items_damaged, '[]'::jsonb)) AS issue_item
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rc.checked_at::DATE >= p_start_date
      AND rc.checked_at::DATE <= p_end_date
    UNION ALL
    SELECT 
      COALESCE(issue_item->>'item_name', issue_item->>'name', 'Unknown') AS item_name,
      issue_item->>'item_id' AS item_id,
      'lost' AS issue_type
    FROM room_checks rc
    JOIN rooms r ON rc.room_id = r.id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rc.items_lost, '[]'::jsonb)) AS issue_item
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rc.checked_at::DATE >= p_start_date
      AND rc.checked_at::DATE <= p_end_date
  )
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_top_issues
  FROM (
    SELECT jsonb_build_object(
      'item_name', COALESCE(ai.item_name, 'Unknown'),
      'item_id', ai.item_id,
      'issue_type', ai.issue_type,
      'count', COUNT(*),
      'unit_price', COALESCE(i.unit_price, 0),
      'total_value', COUNT(*) * COALESCE(i.unit_price, 0)
    ) AS row_data
    FROM all_issues ai
    LEFT JOIN items i ON i.id::TEXT = ai.item_id
    GROUP BY ai.item_name, ai.item_id, ai.issue_type, i.unit_price
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) sub;

  -- 4. Staff performance
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_staff_performance
  FROM (
    SELECT jsonb_build_object(
      'user_id', rc.checked_by,
      'user_name', COALESCE(u.full_name, 'Không xác định'),
      'checks_count', COUNT(*),
      'avg_score', ROUND(COALESCE(AVG(rc.cleanliness_score), 0)::NUMERIC, 1),
      'issues_found', COALESCE(SUM(
        COALESCE(jsonb_array_length(rc.items_missing), 0) +
        COALESCE(jsonb_array_length(rc.items_damaged), 0) +
        COALESCE(jsonb_array_length(rc.items_lost), 0)
      ), 0)
    ) AS row_data
    FROM room_checks rc
    JOIN rooms r ON rc.room_id = r.id
    LEFT JOIN users u ON rc.checked_by = u.id
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rc.checked_at::DATE >= p_start_date
      AND rc.checked_at::DATE <= p_end_date
    GROUP BY rc.checked_by, u.full_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) sub;

  -- 5. Checks by type over time
  SELECT COALESCE(jsonb_agg(row_data ORDER BY week_start), '[]'::jsonb) INTO v_checks_by_type
  FROM (
    SELECT jsonb_build_object(
      'week_start', DATE_TRUNC('week', rc.checked_at)::DATE,
      'daily', COUNT(*) FILTER (WHERE check_type = 'daily'),
      'checkout', COUNT(*) FILTER (WHERE check_type = 'checkout'),
      'checkin', COUNT(*) FILTER (WHERE check_type = 'checkin'),
      'total', COUNT(*)
    ) AS row_data,
    DATE_TRUNC('week', rc.checked_at)::DATE AS week_start
    FROM room_checks rc
    JOIN rooms r ON rc.room_id = r.id
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rc.checked_at::DATE >= p_start_date
      AND rc.checked_at::DATE <= p_end_date
    GROUP BY DATE_TRUNC('week', rc.checked_at)::DATE
  ) sub;

  -- Build final result
  v_result := jsonb_build_object(
    'check_stats', v_check_stats,
    'deficiencies', v_deficiencies,
    'top_issues', v_top_issues,
    'staff_performance', v_staff_performance,
    'checks_by_type', v_checks_by_type,
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  RETURN v_result;
END;
$$;