CREATE OR REPLACE FUNCTION public.get_user_permissions_summary(p_user_id uuid)
RETURNS TABLE(
  module text,
  can_view boolean,
  can_create boolean,
  can_update boolean,
  can_delete boolean,
  can_export boolean,
  can_approve boolean,
  can_assign boolean,
  can_manage boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_level text;
  v_tenant_id uuid;
BEGIN
  SELECT user_level_code, tenant_id
    INTO v_user_level, v_tenant_id
  FROM users
  WHERE id = p_user_id;

  IF v_user_level IS NULL THEN
    RETURN;
  END IF;

  -- Bypass: Super Admin & Tenant Owner có toàn quyền (đồng bộ với has_user_permission)
  IF v_user_level IN ('super_admin', 'tenant_owner') THEN
    RETURN QUERY
      SELECT DISTINCT
        p.module,
        true AS can_view,
        true AS can_create,
        true AS can_update,
        true AS can_delete,
        true AS can_export,
        true AS can_approve,
        true AS can_assign,
        true AS can_manage
      FROM permissions p
      ORDER BY 1;
    RETURN;
  END IF;

  -- Mặc định: gộp user_permissions + role_permissions
  RETURN QUERY
  WITH all_perms AS (
    SELECT up.module, up.action
      FROM user_permissions up
      WHERE up.user_id = p_user_id
        AND up.enabled = true
    UNION
    SELECT p.module, p.action
      FROM user_roles ur
      JOIN roles r
        ON r.code = ur.role::text
       AND (r.tenant_id = v_tenant_id
            OR r.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = p_user_id
  )
  SELECT
    m.module,
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'view'),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'create'),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action IN ('update', 'edit')),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'delete'),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'export'),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'approve'),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'assign'),
    EXISTS(SELECT 1 FROM all_perms a WHERE a.module = m.module AND a.action = 'manage')
  FROM (SELECT DISTINCT module FROM permissions) m
  ORDER BY m.module;
END;
$function$;