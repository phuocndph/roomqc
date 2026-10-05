
-- Function to auto-offline inactive staff (called by cron)
CREATE OR REPLACE FUNCTION public.auto_offline_inactive_staff()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE staff_status
  SET status = 'offline', updated_at = now()
  WHERE status != 'offline'
    AND last_seen_at < now() - interval '30 minutes';
$$;

-- Trigger function to create staff_status record for new users
CREATE OR REPLACE FUNCTION public.create_staff_status_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.staff_status (user_id, tenant_id, status, last_seen_at)
  VALUES (NEW.id, NEW.tenant_id, 'offline', now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Attach trigger to users table
DROP TRIGGER IF EXISTS trg_create_staff_status_for_new_user ON public.users;
CREATE TRIGGER trg_create_staff_status_for_new_user
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_staff_status_for_new_user();
