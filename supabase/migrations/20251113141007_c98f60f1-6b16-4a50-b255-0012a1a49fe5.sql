-- Add approval workflow to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create unique constraint: only ONE active tenant_owner per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owner_per_tenant 
ON users (tenant_id) 
WHERE user_level_code = 'tenant_owner' AND status = 'active';

-- Function to check if user can create other users based on hierarchy
CREATE OR REPLACE FUNCTION can_create_user(p_creator_id UUID, p_new_user_level TEXT, p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_creator_level TEXT;
  v_tenant_approved BOOLEAN;
  v_is_super_admin BOOLEAN;
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
  
  -- If creator not found or tenant not found, deny
  IF v_creator_level IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Tenant must be approved for non-owner creation
  IF NOT v_tenant_approved AND p_new_user_level != 'tenant_owner' THEN
    RETURN FALSE;
  END IF;
  
  -- tenant_owner can create manager and staff (but NOT other owners)
  IF v_creator_level = 'tenant_owner' AND p_new_user_level IN ('manager', 'staff') THEN
    RETURN TRUE;
  END IF;
  
  -- manager can create staff only
  IF v_creator_level = 'manager' AND p_new_user_level = 'staff' THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for Super Admin to approve tenant
CREATE OR REPLACE FUNCTION approve_tenant(p_tenant_id UUID, p_admin_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Check if caller is super admin
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can approve tenants');
  END IF;
  
  -- Update tenant approval status
  UPDATE tenants
  SET 
    approval_status = 'approved',
    approved_by = p_admin_id,
    approved_at = NOW()
  WHERE id = p_tenant_id AND approval_status = 'pending';
  
  IF FOUND THEN
    -- Activate the owner user
    UPDATE users
    SET status = 'active'
    WHERE tenant_id = p_tenant_id AND user_level_code = 'tenant_owner';
    
    RETURN jsonb_build_object('success', true, 'message', 'Tenant approved successfully');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Tenant not found or already processed');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for Super Admin to reject tenant
CREATE OR REPLACE FUNCTION reject_tenant(p_tenant_id UUID, p_admin_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
BEGIN
  -- Check if caller is super admin
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can reject tenants');
  END IF;
  
  -- Update tenant approval status
  UPDATE tenants
  SET 
    approval_status = 'rejected',
    approved_by = p_admin_id,
    approved_at = NOW(),
    rejection_reason = p_reason
  WHERE id = p_tenant_id AND approval_status = 'pending';
  
  IF FOUND THEN
    -- Deactivate the owner user
    UPDATE users
    SET status = 'inactive'
    WHERE tenant_id = p_tenant_id AND user_level_code = 'tenant_owner';
    
    RETURN jsonb_build_object('success', true, 'message', 'Tenant rejected');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Tenant not found or already processed');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending tenants for Super Admin approval
CREATE OR REPLACE FUNCTION get_pending_tenants()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  owner_name TEXT,
  owner_email TEXT,
  created_at TIMESTAMPTZ,
  subscription_tier TEXT
) AS $$
BEGIN
  -- Check if caller is super admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only Super Admin can view pending tenants';
  END IF;
  
  RETURN QUERY
  SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    u.full_name as owner_name,
    u.email as owner_email,
    t.created_at,
    t.subscription_tier::TEXT
  FROM tenants t
  JOIN users u ON u.tenant_id = t.id AND u.user_level_code = 'tenant_owner'
  WHERE t.approval_status = 'pending'
  ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;