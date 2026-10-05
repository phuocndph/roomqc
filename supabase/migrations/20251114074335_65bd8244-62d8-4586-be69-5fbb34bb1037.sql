-- ====================================
-- COMPREHENSIVE PERMISSION SYSTEM MIGRATION
-- ====================================

-- Step 1: Create user_permissions table
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(user_id, module, action)
);

-- Enable RLS on user_permissions
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own permissions
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR tenant_id IN (
  SELECT tenant_id FROM users WHERE id = auth.uid()
));

-- RLS: Owners can manage user permissions in their tenant
CREATE POLICY "Owners can manage user permissions"
ON public.user_permissions FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'owner'
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant_id ON public.user_permissions(tenant_id);

-- Step 2: Create function to create default tenant roles
CREATE OR REPLACE FUNCTION public.create_default_tenant_roles(p_tenant_id UUID)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner role
  INSERT INTO roles (tenant_id, code, name, is_system, hierarchy_level, description)
  VALUES (p_tenant_id, 'owner', 'Chủ sở hữu', true, 1, 'Quyền quản trị toàn bộ hệ thống')
  ON CONFLICT (tenant_id, code) DO NOTHING;
  
  -- Hotel Manager role  
  INSERT INTO roles (tenant_id, code, name, is_system, hierarchy_level, description)
  VALUES (p_tenant_id, 'hotel_manager', 'Quản lý khách sạn', true, 2, 'Quản lý vận hành khách sạn')
  ON CONFLICT (tenant_id, code) DO NOTHING;
  
  -- Staff role
  INSERT INTO roles (tenant_id, code, name, is_system, hierarchy_level, description)
  VALUES (p_tenant_id, 'staff', 'Nhân viên', true, 3, 'Nhân viên thực hiện công việc')
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$;

-- Step 3: Create function to assign permissions to role
CREATE OR REPLACE FUNCTION public.assign_default_permissions_to_role(
  p_tenant_id UUID,
  p_role_code TEXT,
  p_permission_codes TEXT[]
)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id UUID;
  v_permission_id UUID;
  v_code TEXT;
BEGIN
  -- Get role ID
  SELECT id INTO v_role_id
  FROM roles
  WHERE tenant_id = p_tenant_id AND code = p_role_code;
  
  IF v_role_id IS NULL THEN
    RAISE NOTICE 'Role % not found for tenant %', p_role_code, p_tenant_id;
    RETURN;
  END IF;
  
  -- Delete existing permissions for this role
  DELETE FROM role_permissions WHERE role_id = v_role_id;
  
  -- Insert new permissions
  FOREACH v_code IN ARRAY p_permission_codes
  LOOP
    SELECT id INTO v_permission_id FROM permissions WHERE code = v_code;
    IF v_permission_id IS NOT NULL THEN
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_permission_id)
      ON CONFLICT DO NOTHING;
    ELSE
      RAISE NOTICE 'Permission % not found', v_code;
    END IF;
  END LOOP;
END;
$$;

-- Step 4: Create default roles for all existing tenants
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  FOR v_tenant_id IN SELECT id FROM tenants LOOP
    PERFORM create_default_tenant_roles(v_tenant_id);
  END LOOP;
END $$;

-- Step 5: Assign default permissions to system roles for all tenants
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  FOR v_tenant_id IN SELECT id FROM tenants LOOP
    
    -- Owner: Full access
    PERFORM assign_default_permissions_to_role(
      v_tenant_id,
      'owner',
      ARRAY[
        'dashboard.view',
        'items.view', 'items.create', 'items.edit', 'items.delete', 'items.export',
        'rooms.view', 'rooms.create', 'rooms.edit', 'rooms.delete',
        'laundry.view', 'laundry.create', 'laundry.edit', 'laundry.delete',
        'maintenance.view', 'maintenance.create', 'maintenance.edit', 'maintenance.delete',
        'inventory.view', 'inventory.create', 'inventory.edit',
        'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',
        'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.edit',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'settings.view', 'settings.edit',
        'hotels.view', 'hotels.create', 'hotels.edit'
      ]
    );
    
    -- Hotel Manager: Manage hotel operations
    PERFORM assign_default_permissions_to_role(
      v_tenant_id,
      'hotel_manager',
      ARRAY[
        'dashboard.view',
        'items.view', 'items.create', 'items.edit',
        'rooms.view', 'rooms.create', 'rooms.edit',
        'laundry.view', 'laundry.create', 'laundry.edit',
        'maintenance.view', 'maintenance.create', 'maintenance.edit',
        'inventory.view', 'inventory.create',
        'vendors.view',
        'purchase_orders.view', 'purchase_orders.create',
        'reports.view',
        'users.view'
      ]
    );
    
    -- Staff: View and basic create
    PERFORM assign_default_permissions_to_role(
      v_tenant_id,
      'staff',
      ARRAY[
        'dashboard.view',
        'items.view',
        'rooms.view',
        'laundry.view', 'laundry.create',
        'maintenance.view', 'maintenance.create',
        'inventory.view'
      ]
    );
    
  END LOOP;
END $$;

-- Step 6: Create trigger for auto-creating roles for new tenants
CREATE OR REPLACE FUNCTION public.on_tenant_created()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_default_tenant_roles(NEW.id);
  
  -- Assign default permissions
  PERFORM assign_default_permissions_to_role(
    NEW.id, 'owner',
    ARRAY[
      'dashboard.view',
      'items.view', 'items.create', 'items.edit', 'items.delete', 'items.export',
      'rooms.view', 'rooms.create', 'rooms.edit', 'rooms.delete',
      'laundry.view', 'laundry.create', 'laundry.edit', 'laundry.delete',
      'maintenance.view', 'maintenance.create', 'maintenance.edit', 'maintenance.delete',
      'inventory.view', 'inventory.create', 'inventory.edit',
      'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',
      'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.edit',
      'reports.view', 'reports.export',
      'users.view', 'users.create', 'users.edit', 'users.delete',
      'settings.view', 'settings.edit',
      'hotels.view', 'hotels.create', 'hotels.edit'
    ]
  );
  
  PERFORM assign_default_permissions_to_role(
    NEW.id, 'hotel_manager',
    ARRAY[
      'dashboard.view',
      'items.view', 'items.create', 'items.edit',
      'rooms.view', 'rooms.create', 'rooms.edit',
      'laundry.view', 'laundry.create', 'laundry.edit',
      'maintenance.view', 'maintenance.create', 'maintenance.edit',
      'inventory.view', 'inventory.create',
      'vendors.view',
      'purchase_orders.view', 'purchase_orders.create',
      'reports.view',
      'users.view'
    ]
  );
  
  PERFORM assign_default_permissions_to_role(
    NEW.id, 'staff',
    ARRAY[
      'dashboard.view',
      'items.view',
      'rooms.view',
      'laundry.view', 'laundry.create',
      'maintenance.view', 'maintenance.create',
      'inventory.view'
    ]
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_tenant_insert ON tenants;
CREATE TRIGGER after_tenant_insert
AFTER INSERT ON tenants
FOR EACH ROW
EXECUTE FUNCTION on_tenant_created();

-- Step 7: Create get_user_permissions function (new version)
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TABLE (
  code TEXT,
  name TEXT,
  module TEXT,
  action TEXT,
  source TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Get user-specific permissions (overrides)
  user_perms AS (
    SELECT 
      p.code,
      p.name,
      up.module,
      up.action,
      'user'::TEXT as source
    FROM user_permissions up
    JOIN permissions p ON p.module = up.module AND p.action = up.action
    WHERE up.user_id = _user_id
      AND up.enabled = true
  )
  -- Combine both, user permissions override role permissions
  SELECT * FROM user_perms
  UNION
  SELECT * FROM role_perms
  WHERE NOT EXISTS (
    SELECT 1 FROM user_perms up2 
    WHERE up2.module = role_perms.module 
    AND up2.action = role_perms.action
  )
  ORDER BY module, action
$$;

-- Step 8: Create get_user_permissions_summary function
CREATE OR REPLACE FUNCTION public.get_user_permissions_summary(p_user_id UUID)
RETURNS TABLE (
  module TEXT,
  can_view BOOLEAN,
  can_create BOOLEAN,
  can_update BOOLEAN,
  can_delete BOOLEAN,
  can_export BOOLEAN,
  can_approve BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_perms AS (
    SELECT * FROM get_user_permissions(p_user_id)
  )
  SELECT 
    m.code as module,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.code AND action IN ('view', 'read')) as can_view,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.code AND action IN ('create', 'add')) as can_create,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.code AND action IN ('edit', 'update')) as can_update,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.code AND action = 'delete') as can_delete,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.code AND action = 'export') as can_export,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.code AND action = 'approve') as can_approve
  FROM (
    SELECT DISTINCT module as code FROM permissions
  ) m
  ORDER BY m.code
$$;

-- Step 9: Create user_has_hotel_access helper function
CREATE OR REPLACE FUNCTION public.user_has_hotel_access(
  p_user_id UUID,
  p_hotel_id UUID
)
RETURNS BOOLEAN 
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hotels
    WHERE user_id = p_user_id AND hotel_id = p_hotel_id
  ) OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p_user_id 
    AND ur.role IN ('owner', 'super_admin')
  )
$$;

-- Step 10: Update RLS policies for hotel-level scoping

-- Items table
DROP POLICY IF EXISTS "Users can view items in their tenant" ON items;
DROP POLICY IF EXISTS "Users can view items with hotel access" ON items;

CREATE POLICY "Users can view items with hotel access"
ON items FOR SELECT
TO authenticated
USING (
  -- Owner/Super Admin: see all in tenant
  (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'super_admin')
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND tenant_id = items.tenant_id)
  ))
  OR
  -- Manager/Staff: only their assigned hotel
  (user_has_hotel_access(auth.uid(), hotel_id))
);

-- Rooms table
DROP POLICY IF EXISTS "Users can view rooms in their hotels" ON rooms;
DROP POLICY IF EXISTS "Users can view rooms with hotel access" ON rooms;

CREATE POLICY "Users can view rooms with hotel access"
ON rooms FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    JOIN hotels h ON h.id = rooms.hotel_id
    WHERE ur.user_id = auth.uid()
    AND (
      ur.role IN ('owner', 'super_admin')
      OR user_has_hotel_access(auth.uid(), rooms.hotel_id)
    )
    AND u.tenant_id = h.tenant_id
  )
);

-- Laundry batches table
DROP POLICY IF EXISTS "Users can view laundry batches in their tenant" ON laundry_batches;
DROP POLICY IF EXISTS "Users can view laundry batches with hotel access" ON laundry_batches;

CREATE POLICY "Users can view laundry batches with hotel access"
ON laundry_batches FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
    AND u.tenant_id = laundry_batches.tenant_id
    AND (
      ur.role IN ('owner', 'super_admin')
      OR user_has_hotel_access(auth.uid(), laundry_batches.hotel_id)
    )
  )
);

-- Maintenance requests table
DROP POLICY IF EXISTS "Users can view maintenance requests in their tenant" ON maintenance_requests;
DROP POLICY IF EXISTS "Users can view maintenance requests with hotel access" ON maintenance_requests;

CREATE POLICY "Users can view maintenance requests with hotel access"
ON maintenance_requests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
    AND u.tenant_id = maintenance_requests.tenant_id
    AND (
      ur.role IN ('owner', 'super_admin')
      OR user_has_hotel_access(auth.uid(), maintenance_requests.hotel_id)
    )
  )
);

-- Inventory transactions table
DROP POLICY IF EXISTS "Users can view inventory transactions in their tenant" ON inventory_transactions;
DROP POLICY IF EXISTS "Users can view inventory transactions with hotel access" ON inventory_transactions;

CREATE POLICY "Users can view inventory transactions with hotel access"
ON inventory_transactions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
    AND u.tenant_id = inventory_transactions.tenant_id
    AND (
      ur.role IN ('owner', 'super_admin')
      OR user_has_hotel_access(auth.uid(), inventory_transactions.hotel_id)
    )
  )
);

-- Step 11: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_default_tenant_roles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_default_permissions_to_role(UUID, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_hotel_access(UUID, UUID) TO authenticated;