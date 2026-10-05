
CREATE OR REPLACE FUNCTION public.get_qc_daily_trend(_tenant_id uuid, _hotel_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE (
  day date,
  total_tasks bigint,
  rework_tasks bigint,
  rework_rate_pct numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      (now() - (_days - 1 || ' days')::interval)::date,
      now()::date,
      '1 day'::interval
    )::date AS day
  ),
  per_day AS (
    SELECT
      t.created_at::date AS day,
      COUNT(*) AS total_tasks,
      COUNT(*) FILTER (WHERE COALESCE(t.rework_count, 0) > 0) AS rework_tasks
    FROM public.housekeeping_tasks t
    WHERE t.tenant_id = _tenant_id
      AND t.created_at >= now() - (_days || ' days')::interval
      AND (_hotel_id IS NULL OR t.hotel_id = _hotel_id)
    GROUP BY t.created_at::date
  )
  SELECT
    d.day,
    COALESCE(p.total_tasks, 0) AS total_tasks,
    COALESCE(p.rework_tasks, 0) AS rework_tasks,
    ROUND(100.0 * COALESCE(p.rework_tasks, 0)::numeric / NULLIF(COALESCE(p.total_tasks, 0), 0), 1) AS rework_rate_pct
  FROM days d
  LEFT JOIN per_day p ON p.day = d.day
  ORDER BY d.day;
$$;
