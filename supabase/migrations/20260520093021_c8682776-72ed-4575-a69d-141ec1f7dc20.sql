
-- 1. Function: tự đóng ca treo > 16h
CREATE OR REPLACE FUNCTION public.auto_close_stale_shifts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_count int := 0;
  v_now timestamptz := now();
  v_row record;
BEGIN
  FOR v_row IN
    SELECT user_id, tenant_id, shift_start_at
    FROM public.staff_status
    WHERE shift_start_at IS NOT NULL
      AND (shift_end_at IS NULL OR shift_end_at < shift_start_at)
      AND shift_start_at < v_now - interval '16 hours'
  LOOP
    UPDATE public.staff_status
    SET shift_end_at = v_now,
        status = 'offline',
        current_activity = NULL,
        current_activity_type = NULL,
        current_location = NULL,
        updated_at = v_now
    WHERE user_id = v_row.user_id;

    -- Log into audit_log if exists
    BEGIN
      INSERT INTO public.audit_log (
        tenant_id, user_id, action, entity_type, entity_id, metadata, created_at
      ) VALUES (
        v_row.tenant_id,
        v_row.user_id,
        'auto_close_stale_shift',
        'staff_status',
        v_row.user_id::text,
        jsonb_build_object(
          'shift_start_at', v_row.shift_start_at,
          'closed_at', v_now,
          'reason', 'shift_exceeded_16h'
        ),
        v_now
      );
    EXCEPTION WHEN OTHERS THEN
      -- audit_log table may not exist or have different schema; ignore
      NULL;
    END;

    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'closed_count', v_closed_count,
    'ran_at', v_now
  );
END;
$$;

-- 2. Schedule cron mỗi giờ (nếu pg_cron available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Xóa job cũ nếu có
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'auto-close-stale-shifts';

    PERFORM cron.schedule(
      'auto-close-stale-shifts',
      '5 * * * *', -- mỗi giờ phút thứ 5
      $cron$SELECT public.auto_close_stale_shifts();$cron$
    );
  END IF;
END $$;

-- 3. Chạy ngay 1 lần để dọn dữ liệu cũ
SELECT public.auto_close_stale_shifts();
