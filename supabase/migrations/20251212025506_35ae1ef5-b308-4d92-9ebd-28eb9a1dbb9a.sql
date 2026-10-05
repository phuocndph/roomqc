-- Fix has_user_permission RPC function
-- Add bypass for super_admin and tenant_owner
-- Include SYSTEM roles in permission checks

CREATE OR REPLACE FUNCTION public.has_user_permission(
  p_user_id uuid, 
  p_module text, 
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_level text;
  v_tenant_id uuid;
BEGIN
  -- Get user info
  SELECT user_level_code, tenant_id INTO v_user_level, v_tenant_id
  FROM users WHERE id = p_user_id;
  
  -- If user not found, deny access
  IF v_user_level IS NULL THEN
    RETURN false;
  END IF;
  
  -- Super admin and tenant owner have ALL permissions - bypass all checks
  IF v_user_level IN ('super_admin', 'tenant_owner') THEN
    RETURN true;
  END IF;
  
  -- Check user_permissions table first (custom/direct permissions)
  IF EXISTS (
    SELECT 1 FROM user_permissions up
    WHERE up.user_id = p_user_id
      AND up.module = p_module
      AND (up.action = p_action OR 
           (p_action = 'update' AND up.action = 'edit') OR
           (p_action = 'edit' AND up.action = 'update'))
      AND up.enabled = true
  ) THEN
    RETURN true;
  END IF;
  
  -- Check role_permissions (tenant-specific roles AND SYSTEM roles)
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.code = ur.role::text 
      AND (r.tenant_id = v_tenant_id OR r.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND p.module = p_module
      AND (p.action = p_action OR
           (p_action = 'update' AND p.action = 'edit') OR
           (p_action = 'edit' AND p.action = 'update'))
  );
END;
$$;