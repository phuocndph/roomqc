-- =============================================
-- FIX INFINITE RECURSION IN USERS TABLE RLS
-- =============================================

-- Step 1: Create security definer function to get current user's tenant_id
-- This prevents infinite recursion by avoiding querying users table in policies
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$;

-- Step 2: Create security definer function to check if user is tenant owner
CREATE OR REPLACE FUNCTION public.is_tenant_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND user_level_code = 'tenant_owner'
  )
$$;

-- Step 3: Create security definer function to check if user is manager
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND user_level_code = 'manager'
  )
$$;

-- Step 4: Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can delete subordinates" ON users;
DROP POLICY IF EXISTS "Users can delete their subordinates" ON users;
DROP POLICY IF EXISTS "Users can insert users in their tenant" ON users;
DROP POLICY IF EXISTS "Users can manage subordinates" ON users;
DROP POLICY IF EXISTS "Users can update their subordinates" ON users;
DROP POLICY IF EXISTS "Users can view their profile with level" ON users;
DROP POLICY IF EXISTS "Users can view users in their hierarchy" ON users;

-- Step 5: Create new simplified policies without infinite recursion

-- SELECT: Users can view themselves, or users in their tenant (owners see all, managers see their level and below)
CREATE POLICY "Users can view users in tenant"
ON users FOR SELECT
USING (
  is_super_admin()
  OR id = auth.uid()
  OR (
    tenant_id = get_current_user_tenant_id()
    AND (
      is_tenant_owner()
      OR (is_manager() AND user_level_code IN ('manager', 'staff'))
      OR created_by = auth.uid()
    )
  )
);

-- INSERT: Only authorized users can create users in their tenant
CREATE POLICY "Users can create users in tenant"
ON users FOR INSERT
WITH CHECK (
  is_super_admin()
  OR tenant_id = get_current_user_tenant_id()
);

-- UPDATE: Users can update themselves or their subordinates
CREATE POLICY "Users can update users in tenant"
ON users FOR UPDATE
USING (
  is_super_admin()
  OR id = auth.uid()
  OR (
    tenant_id = get_current_user_tenant_id()
    AND can_manage_user(auth.uid(), id)
  )
)
WITH CHECK (
  is_super_admin()
  OR id = auth.uid()
  OR (
    tenant_id = get_current_user_tenant_id()
    AND can_manage_user(auth.uid(), id)
  )
);

-- DELETE: Managers can delete their subordinates, but not primary owners
CREATE POLICY "Users can delete subordinates in tenant"
ON users FOR DELETE
USING (
  is_super_admin()
  OR (
    tenant_id = get_current_user_tenant_id()
    AND can_manage_user(auth.uid(), id)
    AND NOT is_primary_owner
  )
);

-- Step 6: Add comments for documentation
COMMENT ON FUNCTION public.get_current_user_tenant_id() IS 'Security definer function to get current user tenant_id - prevents infinite recursion in RLS';
COMMENT ON FUNCTION public.is_tenant_owner() IS 'Security definer function to check if user is tenant owner - prevents infinite recursion in RLS';
COMMENT ON FUNCTION public.is_manager() IS 'Security definer function to check if user is manager - prevents infinite recursion in RLS';