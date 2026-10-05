-- ====================================
-- Function: Auto-cleanup stale sessions
-- Xóa sessions quá 2 giờ, reset inspections quá 4 giờ
-- ====================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_check_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_sessions_count INTEGER;
  reset_inspections_count INTEGER;
BEGIN
  -- Xóa room_check_sessions quá 2 giờ
  WITH deleted AS (
    DELETE FROM room_check_sessions
    WHERE started_at < NOW() - INTERVAL '2 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_sessions_count FROM deleted;
  
  -- Cập nhật checkout_inspection_requests quá 4 giờ về pending
  WITH updated AS (
    UPDATE checkout_inspection_requests
    SET status = 'pending', started_at = NULL
    WHERE status = 'in_progress'
      AND started_at < NOW() - INTERVAL '4 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO reset_inspections_count FROM updated;
  
  -- Log để debug
  RAISE NOTICE 'Cleanup: Deleted % stale sessions, Reset % stale inspections', 
    deleted_sessions_count, reset_inspections_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.cleanup_stale_check_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_check_sessions() TO service_role;

-- ====================================
-- Function: Get sessions requiring reminder (40+ minutes)
-- ====================================

CREATE OR REPLACE FUNCTION public.get_stale_sessions_for_reminder()
RETURNS TABLE(
  session_id uuid,
  room_id uuid,
  user_id uuid,
  user_name text,
  check_type text,
  started_at timestamptz,
  room_number text,
  hotel_id uuid,
  tenant_id uuid,
  duration_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    rcs.id as session_id,
    rcs.room_id,
    rcs.user_id,
    rcs.user_name,
    rcs.check_type,
    rcs.started_at,
    r.room_number,
    r.hotel_id,
    rcs.tenant_id,
    EXTRACT(EPOCH FROM (NOW() - rcs.started_at) / 60)::integer as duration_minutes
  FROM room_check_sessions rcs
  JOIN rooms r ON r.id = rcs.room_id
  WHERE rcs.started_at < NOW() - INTERVAL '40 minutes'
    AND rcs.started_at >= NOW() - INTERVAL '2 hours'; -- Chỉ lấy sessions chưa bị cleanup
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_stale_sessions_for_reminder() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stale_sessions_for_reminder() TO service_role;