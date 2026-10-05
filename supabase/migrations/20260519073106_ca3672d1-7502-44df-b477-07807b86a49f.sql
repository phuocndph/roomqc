-- =========================================================
-- HOTFIX 1.0.21 — Security Nhóm 2
-- =========================================================

-- ------- #3 Storage: chặn listing 4 bucket public -------
-- Bucket vẫn public=true → direct URL /object/public/... vẫn truy cập được
-- (không qua RLS). Việc drop SELECT policy chỉ chặn LIST API enumerate file.
DROP POLICY IF EXISTS "Hotel logos are publicly accessible"   ON storage.objects;
DROP POLICY IF EXISTS "Public read announcement assets"       ON storage.objects;
DROP POLICY IF EXISTS "Public Access to Item Images"          ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- ------- #5 payment_webhook_logs: SELECT cho super admin -------
DROP POLICY IF EXISTS "Super admins read webhook logs" ON public.payment_webhook_logs;
CREATE POLICY "Super admins read webhook logs"
  ON public.payment_webhook_logs
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- ------- #6 platform_settings & super_admin_activity_log: policy minh bạch -------
DROP POLICY IF EXISTS "Super admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Super admins manage platform settings"
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins read activity log" ON public.super_admin_activity_log;
CREATE POLICY "Super admins read activity log"
  ON public.super_admin_activity_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- ------- #8 search_path cho 4 function email queue -------
ALTER FUNCTION public.delete_email      SET search_path = public, pg_temp;
ALTER FUNCTION public.enqueue_email     SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq       SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch  SET search_path = public, pg_temp;

-- ------- #9a Move pgtap ra schema extensions -------
CREATE SCHEMA IF NOT EXISTS extensions;
-- pgtap is available on hosted projects that enable the test extension, but
-- is not installed in every local Supabase stack. Keep schema setup optional.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgtap') THEN
    ALTER EXTENSION pgtap SET SCHEMA extensions;
  END IF;
END
$$;

-- ------- #9b Revoke REST API trên materialized view monthly_expenses -------
REVOKE ALL ON public.monthly_expenses FROM anon, authenticated;
