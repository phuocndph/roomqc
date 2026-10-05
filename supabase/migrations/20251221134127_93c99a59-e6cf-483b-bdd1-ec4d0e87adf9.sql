
-- Drop old restrictive policy
DROP POLICY IF EXISTS "Owners can manage user permissions" ON public.user_permissions;

-- Create new policy that allows owners AND managers to manage user permissions
CREATE POLICY "Owners and managers can manage user permissions" 
ON public.user_permissions 
FOR ALL 
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    -- Owner (tenant_owner or super_admin)
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.user_level_code IN ('tenant_owner', 'super_admin')
    )
    OR
    -- Manager
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.user_level_code = 'manager'
    )
    OR
    -- Legacy: check user_roles table for owner role
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'owner'
    )
  )
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    -- Owner (tenant_owner or super_admin)
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.user_level_code IN ('tenant_owner', 'super_admin')
    )
    OR
    -- Manager
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.user_level_code = 'manager'
    )
    OR
    -- Legacy: check user_roles table for owner role
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'owner'
    )
  )
);
