
CREATE OR REPLACE FUNCTION public.get_qc_staff_stats(_tenant_id uuid, _hotel_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  hotel_id uuid,
  total_completed bigint,
  approved_count bigint,
  rework_count bigint,
  pending_count bigint,
  rework_rate_pct numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.assigned_to AS user_id,
    u.full_name,
    t.hotel_id,
    COUNT(*) FILTER (WHERE t.status IN ('completed','approved','completed_pending_review','rejected_rework')) AS total_completed,
    COUNT(*) FILTER (WHERE t.status = 'approved') AS approved_count,
    COUNT(*) FILTER (WHERE t.status = 'rejected_rework' OR COALESCE(t.rework_count, 0) > 0) AS rework_count,
    COUNT(*) FILTER (WHERE t.status = 'completed_pending_review') AS pending_count,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE COALESCE(t.rework_count, 0) > 0)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE t.status IN ('completed','approved','rejected_rework')), 0),
      1
    ) AS rework_rate_pct
  FROM public.housekeeping_tasks t
  LEFT JOIN public.users u ON u.id = t.assigned_to
  WHERE t.tenant_id = _tenant_id
    AND t.assigned_to IS NOT NULL
    AND t.created_at >= now() - (_days || ' days')::interval
    AND (_hotel_id IS NULL OR t.hotel_id = _hotel_id)
  GROUP BY t.assigned_to, u.full_name, t.hotel_id;
$$;

CREATE OR REPLACE FUNCTION public.get_qc_floor_stats(_tenant_id uuid, _hotel_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE (
  hotel_id uuid,
  floor int,
  total_tasks bigint,
  rework_tasks bigint,
  pending_tasks bigint,
  rework_rate_pct numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.hotel_id,
    r.floor,
    COUNT(*) AS total_tasks,
    COUNT(*) FILTER (WHERE COALESCE(t.rework_count, 0) > 0) AS rework_tasks,
    COUNT(*) FILTER (WHERE t.status = 'completed_pending_review') AS pending_tasks,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE COALESCE(t.rework_count, 0) > 0)::numeric / NULLIF(COUNT(*), 0),
      1
    ) AS rework_rate_pct
  FROM public.housekeeping_tasks t
  JOIN public.rooms r ON r.id = t.room_id
  WHERE t.tenant_id = _tenant_id
    AND t.created_at >= now() - (_days || ' days')::interval
    AND (_hotel_id IS NULL OR t.hotel_id = _hotel_id)
  GROUP BY t.hotel_id, r.floor;
$$;
