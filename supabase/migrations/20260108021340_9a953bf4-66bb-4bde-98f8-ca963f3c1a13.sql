-- Fix: Restrict users table SELECT policy to authenticated users only
-- Drop existing policy and recreate with proper role restriction

DROP POLICY IF EXISTS "Users can view users in same hotel or with management permissio" ON public.users;

-- Recreate with authenticated role only
CREATE POLICY "Users can view users in same hotel or tenant"
ON public.users
FOR SELECT
TO authenticated
USING (
  is_super_admin() 
  OR (id = auth.uid()) 
  OR (is_tenant_owner() AND (tenant_id = get_current_user_tenant_id())) 
  OR ((tenant_id = get_current_user_tenant_id()) AND works_at_same_hotel(id))
);

-- Also update INSERT policy to authenticated only
DROP POLICY IF EXISTS "Users can create users in tenant" ON public.users;

CREATE POLICY "Users can create users in tenant"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() 
  OR (tenant_id = get_current_user_tenant_id())
);

-- Update DELETE policy to authenticated only
DROP POLICY IF EXISTS "Users can delete subordinates in tenant" ON public.users;

CREATE POLICY "Users can delete subordinates in tenant"
ON public.users
FOR DELETE
TO authenticated
USING (
  is_super_admin() 
  OR (
    (tenant_id = get_current_user_tenant_id()) 
    AND can_manage_user(auth.uid(), id) 
    AND (NOT is_primary_owner)
  )
);

-- Update UPDATE policy to authenticated only
DROP POLICY IF EXISTS "Users can update users in tenant" ON public.users;

CREATE POLICY "Users can update users in tenant"
ON public.users
FOR UPDATE
TO authenticated
USING (
  is_super_admin() 
  OR (id = auth.uid()) 
  OR ((tenant_id = get_current_user_tenant_id()) AND can_manage_user(auth.uid(), id))
)
WITH CHECK (
  is_super_admin() 
  OR (id = auth.uid()) 
  OR ((tenant_id = get_current_user_tenant_id()) AND can_manage_user(auth.uid(), id))
);