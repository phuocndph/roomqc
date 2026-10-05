-- Fix get_user_permissions to properly handle disabled permissions
-- Problem: When user disables a permission (enabled = false), it should override role permissions
-- but current logic only checks enabled = true, so role permissions still show

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
 RETURNS TABLE(code text, name text, module text, action text, source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Get permissions from role
  WITH role_perms AS (
    SELECT DISTINCT
      p.code,
      p.name,
      p.module,
      p.action,
      'role'::TEXT as source
    FROM user_roles ur
    JOIN roles r ON r.code = ur.role::text 
      AND r.tenant_id = (SELECT tenant_id FROM users WHERE id = _user_id)
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id
  ),
  -- Get ALL user-specific permissions (both enabled and disabled)
  user_perms_all AS (
    SELECT 
      p.code,
      p.name,
      up.module,
      up.action,
      up.enabled,
      'user'::TEXT as source
    FROM user_permissions up
    JOIN permissions p ON p.module = up.module AND p.action = up.action
    WHERE up.user_id = _user_id
  ),
  -- Get only enabled user permissions
  user_perms_enabled AS (
    SELECT code, name, module, action, source
    FROM user_perms_all
    WHERE enabled = true
  )
  -- Return enabled user permissions + role permissions that are NOT overridden
  SELECT * FROM user_perms_enabled
  UNION
  SELECT * FROM role_perms
  WHERE NOT EXISTS (
    SELECT 1 FROM user_perms_all upa
    WHERE upa.module = role_perms.module 
    AND upa.action = role_perms.action
  )
  ORDER BY module, action
$function$;