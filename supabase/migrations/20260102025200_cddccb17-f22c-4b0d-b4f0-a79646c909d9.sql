-- Drop and recreate function with correct column names
DROP FUNCTION IF EXISTS get_rooms_report_stats(UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_rooms_report_stats(
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
  v_room_stats JSONB;
  v_utilization_by_type JSONB;
  v_occupancy_stats JSONB;
  v_revenue_by_room JSONB;
BEGIN
  -- Default date range to last 30 days if not provided
  p_start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  p_end_date := COALESCE(p_end_date, CURRENT_DATE);

  -- 1. Room status statistics
  SELECT jsonb_build_object(
    'total', COALESCE(COUNT(*), 0),
    'vacant', COALESCE(COUNT(*) FILTER (WHERE status = 'vacant'), 0),
    'occupied', COALESCE(COUNT(*) FILTER (WHERE status = 'occupied'), 0),
    'cleaning', COALESCE(COUNT(*) FILTER (WHERE status = 'cleaning'), 0),
    'maintenance', COALESCE(COUNT(*) FILTER (WHERE status = 'maintenance'), 0),
    'check_in', COALESCE(COUNT(*) FILTER (WHERE status = 'check_in'), 0),
    'check_out', COALESCE(COUNT(*) FILTER (WHERE status = 'check_out'), 0)
  ) INTO v_room_stats
  FROM rooms r
  WHERE r.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id);

  -- 2. Utilization by room type (using room_type text column)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_utilization_by_type
  FROM (
    SELECT jsonb_build_object(
      'room_type_id', r.room_type,
      'room_type', r.room_type,
      'total', COUNT(*),
      'occupied', COUNT(*) FILTER (WHERE r.status = 'occupied'),
      'vacant', COUNT(*) FILTER (WHERE r.status = 'vacant'),
      'rate', ROUND(
        (COUNT(*) FILTER (WHERE r.status = 'occupied')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 1
      ),
      'base_price', COALESCE(AVG(r.base_price), 0),
      'revenue', COALESCE((
        SELECT SUM(rb.total_amount)
        FROM room_bookings rb
        JOIN rooms r2 ON rb.room_id = r2.id
        WHERE r2.room_type = r.room_type
          AND r2.tenant_id = p_tenant_id
          AND (p_hotel_id IS NULL OR r2.hotel_id = p_hotel_id)
          AND rb.check_in_date >= p_start_date
          AND rb.check_in_date <= p_end_date
          AND rb.status NOT IN ('cancelled')
      ), 0),
      'bookings_count', COALESCE((
        SELECT COUNT(*)
        FROM room_bookings rb
        JOIN rooms r2 ON rb.room_id = r2.id
        WHERE r2.room_type = r.room_type
          AND r2.tenant_id = p_tenant_id
          AND (p_hotel_id IS NULL OR r2.hotel_id = p_hotel_id)
          AND rb.check_in_date >= p_start_date
          AND rb.check_in_date <= p_end_date
          AND rb.status NOT IN ('cancelled')
      ), 0)
    ) AS row_data
    FROM rooms r
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND r.room_type IS NOT NULL
    GROUP BY r.room_type
    ORDER BY COUNT(*) DESC
  ) sub;

  -- 3. Overall occupancy statistics
  WITH booking_days AS (
    SELECT 
      SUM(
        GREATEST(0, LEAST(rb.check_out_date, p_end_date) - GREATEST(rb.check_in_date, p_start_date))
      ) AS total_room_nights,
      SUM(COALESCE(rb.total_amount, 0)) AS total_revenue,
      COUNT(DISTINCT rb.id) AS total_bookings
    FROM room_bookings rb
    JOIN rooms r ON rb.room_id = r.id
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rb.check_in_date <= p_end_date
      AND rb.check_out_date >= p_start_date
      AND rb.status NOT IN ('cancelled')
  ),
  room_count AS (
    SELECT COUNT(*) AS total_rooms
    FROM rooms r
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
  )
  SELECT jsonb_build_object(
    'total_room_nights', COALESCE(bd.total_room_nights, 0),
    'total_revenue', COALESCE(bd.total_revenue, 0),
    'total_bookings', COALESCE(bd.total_bookings, 0),
    'available_room_nights', rc.total_rooms * (p_end_date - p_start_date),
    'occupancy_rate', ROUND(
      (COALESCE(bd.total_room_nights, 0)::NUMERIC / 
       NULLIF(rc.total_rooms * (p_end_date - p_start_date), 0)) * 100, 1
    ),
    'avg_revenue_per_room', ROUND(
      COALESCE(bd.total_revenue, 0)::NUMERIC / NULLIF(rc.total_rooms, 0), 0
    ),
    'avg_revenue_per_booking', ROUND(
      COALESCE(bd.total_revenue, 0)::NUMERIC / NULLIF(bd.total_bookings, 0), 0
    )
  ) INTO v_occupancy_stats
  FROM booking_days bd, room_count rc;

  -- 4. Revenue by room (top 10)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_revenue_by_room
  FROM (
    SELECT jsonb_build_object(
      'room_id', r.id,
      'room_number', r.room_number,
      'room_type', r.room_type,
      'total_bookings', COUNT(rb.id),
      'total_revenue', COALESCE(SUM(rb.total_amount), 0),
      'occupancy_days', COALESCE(SUM(
        GREATEST(0, LEAST(rb.check_out_date, p_end_date) - GREATEST(rb.check_in_date, p_start_date))
      ), 0)
    ) AS row_data
    FROM rooms r
    LEFT JOIN room_bookings rb ON rb.room_id = r.id
      AND rb.check_in_date <= p_end_date
      AND rb.check_out_date >= p_start_date
      AND rb.status NOT IN ('cancelled')
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
    GROUP BY r.id, r.room_number, r.room_type
    ORDER BY COALESCE(SUM(rb.total_amount), 0) DESC
    LIMIT 10
  ) sub;

  -- Build final result
  v_result := jsonb_build_object(
    'room_stats', v_room_stats,
    'utilization_by_type', v_utilization_by_type,
    'occupancy_stats', v_occupancy_stats,
    'revenue_by_room', v_revenue_by_room,
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  RETURN v_result;
END;
$$;

-- Drop and recreate room checks report function
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

  -- 1. Check statistics
  SELECT jsonb_build_object(
    'total_checks', COALESCE(COUNT(*), 0),
    'avg_score', ROUND(COALESCE(AVG(score), 0)::NUMERIC, 1),
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
    AND rc.check_date::DATE >= p_start_date
    AND rc.check_date::DATE <= p_end_date;

  -- 2. Deficiencies by room (using room_type text column)
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
      'last_check_date', MAX(rc.check_date)
    ) AS row_data
    FROM rooms r
    LEFT JOIN room_checks rc ON rc.room_id = r.id
      AND rc.check_date::DATE >= p_start_date
      AND rc.check_date::DATE <= p_end_date
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

  -- 3. Top issues (aggregated from items_missing, items_damaged, items_lost)
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
      AND rc.check_date::DATE >= p_start_date
      AND rc.check_date::DATE <= p_end_date
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
      AND rc.check_date::DATE >= p_start_date
      AND rc.check_date::DATE <= p_end_date
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
      AND rc.check_date::DATE >= p_start_date
      AND rc.check_date::DATE <= p_end_date
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
      'avg_score', ROUND(COALESCE(AVG(rc.score), 0)::NUMERIC, 1),
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
      AND rc.check_date::DATE >= p_start_date
      AND rc.check_date::DATE <= p_end_date
    GROUP BY rc.checked_by, u.full_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) sub;

  -- 5. Checks by type over time (for chart)
  SELECT COALESCE(jsonb_agg(row_data ORDER BY week_start), '[]'::jsonb) INTO v_checks_by_type
  FROM (
    SELECT jsonb_build_object(
      'week_start', DATE_TRUNC('week', rc.check_date)::DATE,
      'daily', COUNT(*) FILTER (WHERE check_type = 'daily'),
      'checkout', COUNT(*) FILTER (WHERE check_type = 'checkout'),
      'checkin', COUNT(*) FILTER (WHERE check_type = 'checkin'),
      'total', COUNT(*)
    ) AS row_data,
    DATE_TRUNC('week', rc.check_date)::DATE AS week_start
    FROM room_checks rc
    JOIN rooms r ON rc.room_id = r.id
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rc.check_date::DATE >= p_start_date
      AND rc.check_date::DATE <= p_end_date
    GROUP BY DATE_TRUNC('week', rc.check_date)::DATE
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