-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view users in tenant" ON public.users;

-- Create helper function to check if two users work at the same hotel
CREATE OR REPLACE FUNCTION public.works_at_same_hotel(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Check if current user and target user share any hotel via user_hotels
    SELECT 1 
    FROM user_hotels uh1
    JOIN user_hotels uh2 ON uh1.hotel_id = uh2.hotel_id
    WHERE uh1.user_id = auth.uid() 
      AND uh2.user_id = target_user_id
  )
  OR EXISTS (
    -- Also check users.hotel_id for staff with single hotel assignment
    SELECT 1 
    FROM users u1
    JOIN users u2 ON u1.hotel_id = u2.hotel_id AND u1.hotel_id IS NOT NULL
    WHERE u1.id = auth.uid() 
      AND u2.id = target_user_id
  )
$$;

-- Create new restrictive SELECT policy
-- Users can only view:
-- 1. Themselves
-- 2. Super admins can view all
-- 3. Tenant owners can view all in their tenant
-- 4. Managers can view other managers/staff working at the same hotel(s)
-- 5. Staff can only view users working at the same hotel
CREATE POLICY "Users can view users in same hotel or with management permission" ON public.users
FOR SELECT USING (
  -- Super admin can see all
  is_super_admin()
  -- User can always see themselves
  OR id = auth.uid()
  -- Tenant owner can see all users in their tenant
  OR (is_tenant_owner() AND tenant_id = get_current_user_tenant_id())
  -- Managers/Staff can only see users in same hotel(s)
  OR (
    tenant_id = get_current_user_tenant_id()
    AND works_at_same_hotel(id)
  )
);