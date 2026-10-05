CREATE OR REPLACE FUNCTION public.get_rooms_report_stats(p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_room_stats JSONB;
  v_utilization_by_type JSONB;
  v_occupancy_stats JSONB;
  v_revenue_by_room JSONB;
BEGIN
  p_start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  p_end_date := COALESCE(p_end_date, CURRENT_DATE);

  -- 1. Room status snapshot (current)
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

  -- 2. Utilization by room type — P0 FIX: chỉ tính booking đã/đang lưu trú và đã trả phòng
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
          AND rb.check_out_date >= p_start_date
          AND rb.check_out_date <= p_end_date
          AND rb.status = 'checked_out'
      ), 0),
      'bookings_count', COALESCE((
        SELECT COUNT(*)
        FROM room_bookings rb
        JOIN rooms r2 ON rb.room_id = r2.id
        WHERE r2.room_type = r.room_type
          AND r2.tenant_id = p_tenant_id
          AND (p_hotel_id IS NULL OR r2.hotel_id = p_hotel_id)
          AND rb.check_out_date >= p_start_date
          AND rb.check_out_date <= p_end_date
          AND rb.status = 'checked_out'
      ), 0)
    ) AS row_data
    FROM rooms r
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND r.room_type IS NOT NULL
    GROUP BY r.room_type
    ORDER BY COUNT(*) DESC
  ) sub;

  -- 3. Overall occupancy — P0 FIX: chỉ tính booking checked_in / checked_out (thực sự sử dụng phòng)
  WITH booking_days AS (
    SELECT
      SUM(
        GREATEST(0, LEAST(rb.check_out_date, p_end_date) - GREATEST(rb.check_in_date, p_start_date))
      ) AS total_room_nights,
      SUM(COALESCE(rb.total_amount, 0)) FILTER (WHERE rb.status = 'checked_out') AS total_revenue,
      COUNT(DISTINCT rb.id) FILTER (WHERE rb.status = 'checked_out') AS total_bookings
    FROM room_bookings rb
    JOIN rooms r ON rb.room_id = r.id
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rb.check_in_date <= p_end_date
      AND rb.check_out_date >= p_start_date
      AND rb.status IN ('checked_in', 'checked_out')
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

  -- 4. Revenue by room — P0 FIX: chỉ checked_in/checked_out cho occupancy_days; revenue chỉ checked_out
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_revenue_by_room
  FROM (
    SELECT jsonb_build_object(
      'room_id', r.id,
      'room_number', r.room_number,
      'room_type', r.room_type,
      'total_bookings', COUNT(rb.id) FILTER (WHERE rb.status = 'checked_out'),
      'total_revenue', COALESCE(SUM(rb.total_amount) FILTER (WHERE rb.status = 'checked_out'), 0),
      'occupancy_days', COALESCE(SUM(
        GREATEST(0, LEAST(rb.check_out_date, p_end_date) - GREATEST(rb.check_in_date, p_start_date))
      ) FILTER (WHERE rb.status IN ('checked_in', 'checked_out')), 0)
    ) AS row_data
    FROM rooms r
    LEFT JOIN room_bookings rb ON rb.room_id = r.id
      AND rb.check_in_date <= p_end_date
      AND rb.check_out_date >= p_start_date
      AND rb.status IN ('checked_in', 'checked_out')
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
    GROUP BY r.id, r.room_number, r.room_type
    ORDER BY COALESCE(SUM(rb.total_amount) FILTER (WHERE rb.status = 'checked_out'), 0) DESC
    LIMIT 10
  ) sub;

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
$function$;