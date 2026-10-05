
-- 1) Trigger: tạo notification khi housekeeping_tasks chuyển sang rejected_rework
CREATE OR REPLACE FUNCTION public.notify_task_rejected()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number text;
  v_reviewer_name text;
  v_reason text;
BEGIN
  -- Chỉ chạy khi chuyển sang rejected_rework
  IF NEW.status = 'rejected_rework' AND COALESCE(OLD.status, '') <> 'rejected_rework' THEN
    -- Phải có assignee mới gửi noti
    IF NEW.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    SELECT full_name INTO v_reviewer_name FROM public.users WHERE id = NEW.reviewed_by;
    v_reason := COALESCE(NEW.review_notes, 'Không có lý do cụ thể');

    INSERT INTO public.notifications (
      tenant_id, user_id, type, category,
      title, message, action_url, action_label,
      related_type, related_id
    ) VALUES (
      NEW.tenant_id,
      NEW.assigned_to,
      'warning',
      'room',
      'Công việc cần làm lại',
      'Phòng ' || COALESCE(v_room_number, '?') || ' bị ' || COALESCE(v_reviewer_name, 'quản lý') ||
      ' trả lại. Lý do: ' || v_reason,
      '/my-tasks',
      'Xem công việc',
      'housekeeping_task',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_rejected ON public.housekeeping_tasks;
CREATE TRIGGER trg_notify_task_rejected
AFTER UPDATE OF status ON public.housekeeping_tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_rejected();

-- 2) View thống kê QC: rework rate per staff (30 ngày gần nhất)
CREATE OR REPLACE VIEW public.qc_staff_stats_30d
WITH (security_invoker = true)
AS
SELECT
  t.tenant_id,
  t.hotel_id,
  t.assigned_to AS user_id,
  u.full_name,
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
WHERE t.assigned_to IS NOT NULL
  AND t.created_at >= now() - INTERVAL '30 days'
GROUP BY t.tenant_id, t.hotel_id, t.assigned_to, u.full_name;

-- 3) View thống kê QC theo tầng
CREATE OR REPLACE VIEW public.qc_floor_stats_30d
WITH (security_invoker = true)
AS
SELECT
  t.tenant_id,
  t.hotel_id,
  r.floor,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE COALESCE(t.rework_count, 0) > 0) AS rework_tasks,
  COUNT(*) FILTER (WHERE t.status = 'completed_pending_review') AS pending_tasks,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE COALESCE(t.rework_count, 0) > 0)::numeric
    / NULLIF(COUNT(*), 0),
    1
  ) AS rework_rate_pct
FROM public.housekeeping_tasks t
JOIN public.rooms r ON r.id = t.room_id
WHERE t.created_at >= now() - INTERVAL '30 days'
GROUP BY t.tenant_id, t.hotel_id, r.floor;
