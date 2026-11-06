-- Live Auth deletion is separate from the public profile's soft-delete flag.
-- Forward-only: preserve authority models, trusted worker behavior and grants.
CREATE OR REPLACE FUNCTION private.room_setup_owner(p_hotel_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;
BEGIN
  SELECT h.tenant_id INTO v_tenant FROM public.hotels h
  JOIN public.users u ON u.tenant_id=h.tenant_id AND u.id=auth.uid()
  JOIN auth.users au ON au.id=u.id
  WHERE h.id=p_hotel_id AND h.status='active' AND u.status='active'
    AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
    AND au.deleted_at IS NULL AND au.email_confirmed_at IS NOT NULL
    AND (au.banned_until IS NULL OR au.banned_until<=now())
    AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=u.id AND ur.role='owner')
    AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
      AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()));
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Chỉ chủ sở hữu đang hoạt động được thiết lập khách sạn này.' USING ERRCODE='42501';
  END IF;
  RETURN v_tenant;
END;
$fn$;
REVOKE ALL ON FUNCTION private.room_setup_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.subscription_quote_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;
BEGIN
  SELECT u.tenant_id INTO v_tenant FROM public.users u JOIN auth.users au ON au.id=u.id
    WHERE u.id=auth.uid() AND u.status='active' AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
      AND au.deleted_at IS NULL AND au.email_confirmed_at IS NOT NULL AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='owner')
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
        AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN v_tenant;
END;
$fn$;
REVOKE ALL ON FUNCTION private.subscription_quote_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_support_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor)
    OR NOT EXISTS(SELECT 1 FROM public.users u JOIN auth.users au ON au.id=u.id
      WHERE u.id=v_actor AND u.status='active' AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
        AND au.deleted_at IS NULL AND au.email_confirmed_at IS NOT NULL AND (au.banned_until IS NULL OR au.banned_until<=now()))
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor
      AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now())) THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION public.platform_support_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_support_actor() TO authenticated;

CREATE OR REPLACE FUNCTION private.distribution_active_actor(p_tenant_id uuid,p_hotel_id uuid,p_actor_id uuid,p_manage boolean)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  v_actor:=public.assert_rpc_actor(p_tenant_id,p_hotel_id,p_actor_id,p_manage);
  IF NOT public.rpc_request_is_trusted() AND NOT EXISTS(
    SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
    WHERE u.id=v_actor AND u.status='active' AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
      AND a.deleted_at IS NULL AND a.email_confirmed_at IS NOT NULL AND (a.banned_until IS NULL OR a.banned_until<=now())
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id AND s.id::text=auth.jwt()->>'session_id'
        AND (s.not_after IS NULL OR s.not_after>now()))) THEN
    RAISE EXCEPTION 'DISTRIBUTION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.distribution_active_actor(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.email_admin_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.users u JOIN auth.users au ON au.id=u.id
    WHERE u.id=v_actor AND u.is_super_admin IS TRUE AND u.status='active'
      AND u.deleted_at IS NULL AND NOT COALESCE(u.account_locked,false)
      AND au.deleted_at IS NULL AND au.email_confirmed_at IS NOT NULL
      AND (au.banned_until IS NULL OR au.banned_until<=now())
      AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=u.id
        AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now()))
  ) THEN RAISE EXCEPTION 'ACTIVE_EMAIL_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION public.email_admin_actor() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.email_admin_actor() TO authenticated;
NOTIFY pgrst,'reload schema';
