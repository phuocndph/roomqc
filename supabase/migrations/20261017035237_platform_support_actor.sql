-- Canonical-cluster support authorization. An old JWT must not remain a
-- platform credential after logout, role removal or account lock.
CREATE OR REPLACE FUNCTION public.platform_support_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor)
    OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=v_actor
      AND u.status='active' AND NOT COALESCE(u.account_locked,false))
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor
      AND s.id::text=auth.jwt()->>'session_id'
      AND (s.not_after IS NULL OR s.not_after>now())) THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION public.platform_support_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_support_actor() TO authenticated;
