-- Legacy read compatibility must use the same additive module/action semantics
-- as enforcement, and must never expose another tenant's authority metadata.
-- Genuine privileged reads stay private; public entry points are invokers.
CREATE FUNCTION private.lock_permission_read_target(p_target_id uuid)
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_auth auth.users%ROWTYPE;
  v_session auth.sessions%ROWTYPE; v_target public.users%ROWTYPE;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'PERMISSION_READ_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  -- Match the authority lock order: Auth -> actor -> roles -> session.
  SELECT * INTO v_auth FROM auth.users WHERE id=(SELECT auth.uid()) FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'PERMISSION_READ_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id=v_auth.id FOR SHARE;
  IF NOT FOUND OR v_actor.tenant_id IS NULL OR v_actor.status IS DISTINCT FROM 'active'
    OR v_actor.deleted_at IS NOT NULL OR COALESCE(v_actor.account_locked,false) THEN
    RAISE EXCEPTION 'PERMISSION_READ_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor.id ORDER BY role FOR SHARE;
  SELECT * INTO v_session FROM auth.sessions
    WHERE user_id=v_actor.id AND id::text=auth.jwt()->>'session_id' FOR SHARE;
  IF NOT FOUND OR (v_session.not_after IS NOT NULL AND v_session.not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'PERMISSION_READ_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  -- Staff/owner/platform self-read compatibility is intentional. Foreign reads
  -- require the same live capability, target hierarchy and hotel scope as the
  -- new shared editor; arbitrary supplied user IDs confer no authority.
  IF p_target_id=v_actor.id THEN RETURN v_actor; END IF;
  PERFORM private.lock_employee_authority_actor();
  v_target:=private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  RETURN v_target;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_permission_read_target(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.get_user_permission_detail(p_target_id uuid)
RETURNS TABLE(code text,name text,module text,action text,source text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM private.lock_permission_read_target(p_target_id);
  RETURN QUERY
    WITH catalog AS (
      SELECT DISTINCT ON (p.module,CASE p.action WHEN 'edit' THEN 'update' ELSE p.action END)
        p.code,p.name,p.module,CASE p.action WHEN 'edit' THEN 'update' ELSE p.action END AS action
      FROM public.permissions p
      ORDER BY p.module,CASE p.action WHEN 'edit' THEN 'update' ELSE p.action END,
        (p.action='update') DESC,p.code,p.id
    )
    SELECT c.code,c.name,c.module,c.action,
      CASE WHEN EXISTS(SELECT 1 FROM public.user_permissions up WHERE up.user_id=p_target_id
        AND up.module=c.module AND up.enabled AND (up.action=c.action
          OR (c.action='update' AND up.action='edit'))) THEN 'user' ELSE 'role' END::text
    FROM catalog c
    WHERE public.has_user_permission(p_target_id,c.module,c.action)
    ORDER BY c.module,c.action;
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_user_permission_detail(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_user_permission_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE(code text,name text,module text,action text,source text)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT * FROM private.get_user_permission_detail(_user_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated;

CREATE FUNCTION private.get_user_permission_summary(p_target_id uuid)
RETURNS TABLE(module text,can_view boolean,can_create boolean,can_update boolean,
  can_delete boolean,can_export boolean,can_approve boolean,can_assign boolean,can_manage boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM private.lock_permission_read_target(p_target_id);
  RETURN QUERY SELECT c.module,
    public.has_user_permission(p_target_id,c.module,'view'),
    public.has_user_permission(p_target_id,c.module,'create'),
    public.has_user_permission(p_target_id,c.module,'update'),
    public.has_user_permission(p_target_id,c.module,'delete'),
    public.has_user_permission(p_target_id,c.module,'export'),
    public.has_user_permission(p_target_id,c.module,'approve'),
    public.has_user_permission(p_target_id,c.module,'assign'),
    public.has_user_permission(p_target_id,c.module,'manage')
    FROM (SELECT DISTINCT p.module FROM public.permissions p) c ORDER BY c.module;
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_user_permission_summary(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_user_permission_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_permissions_summary(p_user_id uuid)
RETURNS TABLE(module text,can_view boolean,can_create boolean,can_update boolean,
  can_delete boolean,can_export boolean,can_approve boolean,can_assign boolean,can_manage boolean)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT * FROM private.get_user_permission_summary(p_user_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_user_permissions_summary(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions_summary(uuid) TO authenticated;
COMMENT ON FUNCTION private.lock_permission_read_target(uuid) IS
  'Live caller-bound permission metadata read: self, or editor-authorized same-tenant target only. Auth/profile/roles/session locks fence committed revocation; no data writes.';
COMMENT ON FUNCTION public.get_user_permissions(uuid) IS
  'Legacy DTO compatibility: one canonical row per effective catalog module/action, additive role+custom semantics, edit/update alias. Invoker wrapper over a private scoped implementation.';
NOTIFY pgrst,'reload schema';
