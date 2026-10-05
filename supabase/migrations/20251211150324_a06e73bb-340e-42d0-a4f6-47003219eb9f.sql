-- Create function to check user permissions by module and action
CREATE OR REPLACE FUNCTION public.has_user_permission(
  p_user_id UUID,
  p_module TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Check user_permissions table first (custom permissions)
  SELECT EXISTS (
    SELECT 1
    FROM user_permissions up
    WHERE up.user_id = p_user_id
      AND up.module = p_module
      AND up.action = p_action
      AND up.enabled = true
  )
  OR
  -- Then check role_permissions (role-based permissions)
  EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.code = ur.role::text 
      AND r.tenant_id = (SELECT tenant_id FROM users WHERE id = p_user_id)
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND p.module = p_module
      AND p.action = p_action
  )
$$;

-- Update has_permission function to check both user_permissions and role_permissions
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _permission_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Super admin bypass
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = _user_id 
      AND user_level_code = 'super_admin'
    )
    OR
    -- Tenant owner bypass
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = _user_id 
      AND user_level_code = 'tenant_owner'
    )
    OR
    -- Check user_permissions table (custom permissions)
    EXISTS (
      SELECT 1
      FROM user_permissions up
      JOIN permissions p ON p.module = up.module AND p.action = up.action
      WHERE up.user_id = _user_id
        AND p.code = _permission_code
        AND up.enabled = true
    )
    OR
    -- Check role_permissions (role-based permissions)
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.code = ur.role::text 
        AND r.tenant_id = (SELECT tenant_id FROM users WHERE id = _user_id)
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = _user_id
        AND p.code = _permission_code
    )
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.has_user_permission(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated;