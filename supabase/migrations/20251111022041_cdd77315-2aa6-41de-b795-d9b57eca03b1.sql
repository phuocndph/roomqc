-- =====================================================
-- ROLES & PERMISSIONS MANAGEMENT SYSTEM
-- =====================================================

-- 1. Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL, -- items, rooms, laundry, maintenance, reports, settings, users
  action TEXT NOT NULL, -- view, create, edit, delete, export
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create roles table (different from user_roles which is junction table)
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- system roles cannot be deleted
  hierarchy_level INTEGER NOT NULL DEFAULT 5, -- 1=highest (owner), 5=lowest (staff)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- 3. Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  UNIQUE(role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for permissions (read-only for all authenticated users)
CREATE POLICY "Users can view all permissions"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for roles
CREATE POLICY "Users can view roles from their tenant"
  ON public.roles FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage roles in their tenant"
  ON public.roles FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
    AND has_role(auth.uid(), 'owner'::app_role)
    AND is_system = false
  );

-- RLS Policies for role_permissions
CREATE POLICY "Users can view role permissions from their tenant"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (
    role_id IN (
      SELECT id FROM roles WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage role permissions in their tenant"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (
    role_id IN (
      SELECT id FROM roles 
      WHERE tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
      AND is_system = false
    )
    AND has_role(auth.uid(), 'owner'::app_role)
  );

-- Insert default permissions
INSERT INTO public.permissions (code, name, description, module, action) VALUES
  -- Items Management
  ('items.view', 'Xem tài sản', 'Xem danh sách và chi tiết tài sản', 'items', 'view'),
  ('items.create', 'Tạo tài sản', 'Thêm tài sản mới vào hệ thống', 'items', 'create'),
  ('items.edit', 'Sửa tài sản', 'Chỉnh sửa thông tin tài sản', 'items', 'edit'),
  ('items.delete', 'Xóa tài sản', 'Xóa tài sản khỏi hệ thống', 'items', 'delete'),
  ('items.export', 'Xuất dữ liệu tài sản', 'Xuất danh sách tài sản ra file', 'items', 'export'),
  
  -- Rooms Management
  ('rooms.view', 'Xem phòng', 'Xem danh sách và chi tiết phòng', 'rooms', 'view'),
  ('rooms.create', 'Tạo phòng', 'Thêm phòng mới', 'rooms', 'create'),
  ('rooms.edit', 'Sửa phòng', 'Chỉnh sửa thông tin phòng', 'rooms', 'edit'),
  ('rooms.delete', 'Xóa phòng', 'Xóa phòng', 'rooms', 'delete'),
  
  -- Laundry Management
  ('laundry.view', 'Xem giặt là', 'Xem danh sách lô giặt', 'laundry', 'view'),
  ('laundry.create', 'Tạo lô giặt', 'Tạo lô giặt mới', 'laundry', 'create'),
  ('laundry.edit', 'Sửa lô giặt', 'Chỉnh sửa lô giặt', 'laundry', 'edit'),
  ('laundry.delete', 'Xóa lô giặt', 'Xóa lô giặt', 'laundry', 'delete'),
  
  -- Inventory Management
  ('inventory.view', 'Xem kho', 'Xem giao dịch kho', 'inventory', 'view'),
  ('inventory.create', 'Tạo giao dịch kho', 'Nhập/Xuất kho', 'inventory', 'create'),
  ('inventory.edit', 'Sửa giao dịch kho', 'Chỉnh sửa giao dịch', 'inventory', 'edit'),
  
  -- Maintenance Management
  ('maintenance.view', 'Xem bảo trì', 'Xem yêu cầu bảo trì', 'maintenance', 'view'),
  ('maintenance.create', 'Tạo yêu cầu bảo trì', 'Tạo yêu cầu mới', 'maintenance', 'create'),
  ('maintenance.edit', 'Sửa bảo trì', 'Chỉnh sửa yêu cầu', 'maintenance', 'edit'),
  ('maintenance.delete', 'Xóa bảo trì', 'Xóa yêu cầu bảo trì', 'maintenance', 'delete'),
  
  -- Reports & Analytics
  ('reports.view', 'Xem báo cáo', 'Xem các báo cáo', 'reports', 'view'),
  ('reports.export', 'Xuất báo cáo', 'Xuất báo cáo ra file', 'reports', 'export'),
  
  -- Vendors Management
  ('vendors.view', 'Xem nhà cung cấp', 'Xem danh sách nhà cung cấp', 'vendors', 'view'),
  ('vendors.create', 'Tạo nhà cung cấp', 'Thêm nhà cung cấp mới', 'vendors', 'create'),
  ('vendors.edit', 'Sửa nhà cung cấp', 'Chỉnh sửa thông tin', 'vendors', 'edit'),
  ('vendors.delete', 'Xóa nhà cung cấp', 'Xóa nhà cung cấp', 'vendors', 'delete'),
  
  -- Settings & Configuration
  ('settings.view', 'Xem cài đặt', 'Xem cài đặt hệ thống', 'settings', 'view'),
  ('settings.edit', 'Sửa cài đặt', 'Thay đổi cài đặt', 'settings', 'edit'),
  
  -- Users Management
  ('users.view', 'Xem người dùng', 'Xem danh sách người dùng', 'users', 'view'),
  ('users.create', 'Tạo người dùng', 'Thêm người dùng mới', 'users', 'create'),
  ('users.edit', 'Sửa người dùng', 'Chỉnh sửa thông tin người dùng', 'users', 'edit'),
  ('users.delete', 'Xóa người dùng', 'Xóa người dùng', 'users', 'delete')
ON CONFLICT (code) DO NOTHING;

-- Create function to check if user has permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.code = ur.role::text AND r.tenant_id = (SELECT tenant_id FROM users WHERE id = _user_id)
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id
      AND p.code = _permission_code
  )
$$;

-- Create function to get user permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TABLE (
  permission_code TEXT,
  permission_name TEXT,
  module TEXT,
  action TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.code,
    p.name,
    p.module,
    p.action
  FROM user_roles ur
  JOIN roles r ON r.code = ur.role::text AND r.tenant_id = (SELECT tenant_id FROM users WHERE id = _user_id)
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = _user_id
  ORDER BY p.module, p.action
$$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at
  BEFORE UPDATE ON permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();