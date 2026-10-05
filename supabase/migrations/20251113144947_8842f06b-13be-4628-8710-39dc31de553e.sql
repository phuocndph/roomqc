-- =====================================================
-- PHASE 1: FIX DATABASE & SECURITY
-- =====================================================

-- 1. Create function to get user subordinates
CREATE OR REPLACE FUNCTION get_user_subordinates(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  email TEXT,
  user_level_code TEXT,
  created_at TIMESTAMPTZ,
  subordinate_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    -- Direct subordinates
    SELECT 
      u.id,
      u.full_name,
      u.email,
      u.user_level_code,
      u.created_at,
      1 as level
    FROM users u
    WHERE u.created_by = p_user_id
    
    UNION ALL
    
    -- Indirect subordinates
    SELECT 
      u.id,
      u.full_name,
      u.email,
      u.user_level_code,
      u.created_at,
      s.level + 1
    FROM users u
    INNER JOIN subordinates s ON u.created_by = s.id
  )
  SELECT 
    s.id,
    s.full_name,
    s.email,
    s.user_level_code,
    s.created_at,
    COUNT(u2.id) as subordinate_count
  FROM subordinates s
  LEFT JOIN users u2 ON u2.created_by = s.id
  GROUP BY s.id, s.full_name, s.email, s.user_level_code, s.created_at
  ORDER BY s.created_at;
END;
$$;

-- 2. Enhance can_create_user function with better logic
CREATE OR REPLACE FUNCTION can_create_user(p_creator_id UUID, p_new_user_level TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_level TEXT;
  v_tenant_approved BOOLEAN;
  v_is_super_admin BOOLEAN;
  v_primary_owner_exists BOOLEAN;
BEGIN
  -- Check if creator is super admin
  SELECT is_super_admin() INTO v_is_super_admin;
  
  -- Super admin can create anything
  IF v_is_super_admin THEN
    RETURN TRUE;
  END IF;
  
  -- Get creator info and tenant approval status
  SELECT u.user_level_code, t.approval_status = 'approved'
  INTO v_creator_level, v_tenant_approved
  FROM users u
  JOIN tenants t ON u.tenant_id = t.id
  WHERE u.id = p_creator_id AND u.tenant_id = p_tenant_id;
  
  -- If creator not found, deny
  IF v_creator_level IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Tenant must be approved for non-owner creation
  IF NOT v_tenant_approved AND p_new_user_level != 'tenant_owner' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if trying to create another primary owner
  IF p_new_user_level = 'tenant_owner' THEN
    SELECT EXISTS(
      SELECT 1 FROM users 
      WHERE tenant_id = p_tenant_id 
        AND user_level_code = 'tenant_owner'
        AND is_primary_owner = true
    ) INTO v_primary_owner_exists;
    
    IF v_primary_owner_exists THEN
      RETURN FALSE; -- Cannot create another owner if primary owner exists
    END IF;
  END IF;
  
  -- tenant_owner can create manager and staff (but NOT other owners)
  IF v_creator_level = 'tenant_owner' AND p_new_user_level IN ('manager', 'staff') THEN
    RETURN TRUE;
  END IF;
  
  -- manager can create other managers and staff
  IF v_creator_level = 'manager' AND p_new_user_level IN ('manager', 'staff') THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- 3. Add constraint to ensure created_by is set for non-owners
-- Note: We can't use CHECK constraint for this, so we'll use a trigger
CREATE OR REPLACE FUNCTION check_created_by_required()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- created_by is required for manager and staff
  IF NEW.user_level_code IN ('manager', 'staff') AND NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'created_by is required for manager and staff users';
  END IF;
  
  -- created_by should be null for tenant_owner and super_admin
  IF NEW.user_level_code IN ('tenant_owner', 'super_admin') THEN
    NEW.created_by := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_created_by ON users;
CREATE TRIGGER trg_check_created_by
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_created_by_required();

-- 4. Update RLS policies on users table for better security
DROP POLICY IF EXISTS "Users can view users in their tenant" ON users;
DROP POLICY IF EXISTS "Users can update users in their tenant" ON users;
DROP POLICY IF EXISTS "Users can delete users in their tenant" ON users;

-- View policy: Users can view themselves, their subordinates, and users at their level
CREATE POLICY "Users can view users in their hierarchy"
ON users FOR SELECT
USING (
  is_super_admin() OR
  id = auth.uid() OR
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ) AND (
    -- Owners can see everyone in their tenant
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
        AND user_level_code = 'tenant_owner'
        AND tenant_id = users.tenant_id
    ) OR
    -- Managers can see their subordinates and other managers
    (
      created_by = auth.uid() OR
      (
        user_level_code IN ('manager', 'staff') AND
        EXISTS (
          SELECT 1 FROM users 
          WHERE id = auth.uid() 
            AND user_level_code = 'manager'
            AND tenant_id = users.tenant_id
        )
      )
    )
  )
);

-- Update policy: Users can only update their subordinates
CREATE POLICY "Users can update their subordinates"
ON users FOR UPDATE
USING (
  is_super_admin() OR
  (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()) AND
    can_manage_user(auth.uid(), id)
  )
)
WITH CHECK (
  is_super_admin() OR
  (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()) AND
    can_manage_user(auth.uid(), id)
  )
);

-- Delete policy: Users can only delete their subordinates (not primary owner)
CREATE POLICY "Users can delete their subordinates"
ON users FOR DELETE
USING (
  is_super_admin() OR
  (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()) AND
    can_manage_user(auth.uid(), id) AND
    NOT is_primary_owner -- Cannot delete primary owner
  )
);

-- 5. Add function to check if user has subordinates
CREATE OR REPLACE FUNCTION user_has_subordinates(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE created_by = p_user_id
  );
$$;

-- 6. Add function to reassign subordinates
CREATE OR REPLACE FUNCTION reassign_subordinates(
  p_old_manager_id UUID,
  p_new_manager_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE users
  SET 
    created_by = p_new_manager_id,
    updated_at = now()
  WHERE created_by = p_old_manager_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION get_user_subordinates IS 'Get all subordinates (direct and indirect) for a given user';
COMMENT ON FUNCTION user_has_subordinates IS 'Check if a user has any subordinates';
COMMENT ON FUNCTION reassign_subordinates IS 'Reassign subordinates from one manager to another';