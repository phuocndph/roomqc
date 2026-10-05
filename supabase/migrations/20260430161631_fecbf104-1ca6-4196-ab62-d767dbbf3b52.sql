
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
  IF NEW.status = 'rejected_rework' AND COALESCE(OLD.status, '') <> 'rejected_rework' THEN
    IF NEW.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    SELECT full_name INTO v_reviewer_name FROM public.users WHERE id = NEW.rejected_by;
    v_reason := COALESCE(NEW.rejection_reason, 'Không có lý do cụ thể');

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
