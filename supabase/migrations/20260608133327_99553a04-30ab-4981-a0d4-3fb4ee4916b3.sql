CREATE OR REPLACE FUNCTION public.get_daily_occupancy_trend(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   date := COALESCE(p_end_date, CURRENT_DATE);
  v_total_rooms int;
  v_result jsonb;
BEGIN
  SELECT COUNT(*) INTO v_total_rooms
  FROM rooms
  WHERE tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR hotel_id = p_hotel_id)
    AND status != 'maintenance';

  IF v_total_rooms = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'date', d.day::text,
      'occupied_rooms', COALESCE(occ.cnt, 0),
      'total_rooms', v_total_rooms,
      'occupancy_rate', ROUND((COALESCE(occ.cnt, 0)::numeric / v_total_rooms) * 100, 1),
      'revenue', COALESCE(occ.rev, 0),
      'room_nights_sold', COALESCE(occ.cnt, 0)
    )
    ORDER BY d.day
  ) INTO v_result
  FROM generate_series(v_start, v_end, '1 day'::interval) AS d(day)
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT rb.room_id) AS cnt,
      SUM(rb.total_amount / GREATEST(1,
        (rb.check_out_date - rb.check_in_date)
      )) AS rev
    FROM room_bookings rb
    JOIN rooms r ON rb.room_id = r.id
    WHERE r.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
      AND rb.status IN ('checked_in', 'checked_out')
      AND rb.check_in_date <= d.day
      AND rb.check_out_date > d.day
  ) occ ON true;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_occupancy_trend(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_daily_occupancy_trend(uuid, uuid, date, date) TO authenticated;