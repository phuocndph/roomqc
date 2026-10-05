
-- 1) Function tự clear is_read_only khi subscription được gia hạn lại
CREATE OR REPLACE FUNCTION public.auto_clear_read_only_after_renewal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, read_only_reason
    FROM public.tenants
    WHERE is_read_only = true
      AND subscription_status IN ('active','trial')
      AND (
        (grace_period_ends_at IS NOT NULL AND grace_period_ends_at > now())
        OR (subscription_end_date IS NOT NULL AND subscription_end_date > CURRENT_DATE)
      )
  LOOP
    UPDATE public.tenants
       SET is_read_only = false,
           read_only_reason = NULL,
           read_only_since = NULL,
           updated_at = now()
     WHERE id = r.id;

    BEGIN
      INSERT INTO public.state_transition_log
        (entity_type, entity_id, action, from_state, to_state, reason, metadata)
      VALUES
        ('tenant', r.id, 'auto_clear_read_only', 'read_only', 'active',
         'Subscription đã được gia hạn — tự động bỏ chế độ chỉ đọc.',
         jsonb_build_object('source','cron','prev_reason', r.read_only_reason));
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL; -- nếu bảng audit khác tên, bỏ qua không fail cron
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_clear_read_only_after_renewal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_clear_read_only_after_renewal() TO service_role;

-- 2) Schedule cron — chạy ngay sau cron auto-set (03:35 UTC daily)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto-clear-read-only-after-renewal')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-clear-read-only-after-renewal');
    PERFORM cron.schedule(
      'auto-clear-read-only-after-renewal',
      '35 3 * * *',
      $cron$ SELECT public.auto_clear_read_only_after_renewal(); $cron$
    );
  END IF;
END$$;

-- 3) Backfill ngay — clear cho mọi tenant hiện đang kẹt
SELECT public.auto_clear_read_only_after_renewal();
