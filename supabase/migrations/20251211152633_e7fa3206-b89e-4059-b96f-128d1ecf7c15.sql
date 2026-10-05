
-- Phase 1: Chuẩn hóa action names trong bảng permissions
-- Đổi 'edit' → 'update' để đồng nhất với user_permissions
UPDATE permissions SET action = 'update', code = REPLACE(code, '.edit', '.update') WHERE action = 'edit';

-- Phase 2: Thêm các permissions còn thiếu cho tất cả modules
INSERT INTO permissions (module, action, code, name)
VALUES 
  -- inventory - thêm các action còn thiếu
  ('inventory', 'delete', 'inventory.delete', 'Xóa giao dịch kho'),
  ('inventory', 'export', 'inventory.export', 'Xuất dữ liệu kho'),
  ('inventory', 'approve', 'inventory.approve', 'Phê duyệt giao dịch kho'),
  -- items  
  ('items', 'approve', 'items.approve', 'Phê duyệt tài sản'),
  -- laundry
  ('laundry', 'export', 'laundry.export', 'Xuất dữ liệu giặt là'),
  ('laundry', 'approve', 'laundry.approve', 'Phê duyệt giặt là'),
  -- maintenance
  ('maintenance', 'export', 'maintenance.export', 'Xuất dữ liệu bảo trì'),
  ('maintenance', 'approve', 'maintenance.approve', 'Phê duyệt bảo trì'),
  -- rooms
  ('rooms', 'export', 'rooms.export', 'Xuất dữ liệu phòng'),
  ('rooms', 'approve', 'rooms.approve', 'Phê duyệt phòng'),
  -- vendors
  ('vendors', 'export', 'vendors.export', 'Xuất dữ liệu nhà cung cấp'),
  ('vendors', 'approve', 'vendors.approve', 'Phê duyệt nhà cung cấp'),
  -- users
  ('users', 'export', 'users.export', 'Xuất dữ liệu người dùng'),
  ('users', 'approve', 'users.approve', 'Phê duyệt người dùng'),
  -- settings - thêm đầy đủ
  ('settings', 'create', 'settings.create', 'Tạo cài đặt'),
  ('settings', 'update', 'settings.update', 'Chỉnh sửa cài đặt'),
  ('settings', 'delete', 'settings.delete', 'Xóa cài đặt'),
  ('settings', 'export', 'settings.export', 'Xuất cài đặt'),
  ('settings', 'approve', 'settings.approve', 'Phê duyệt cài đặt'),
  -- reports - thêm đầy đủ
  ('reports', 'create', 'reports.create', 'Tạo báo cáo'),
  ('reports', 'update', 'reports.update', 'Chỉnh sửa báo cáo'),
  ('reports', 'delete', 'reports.delete', 'Xóa báo cáo'),
  ('reports', 'approve', 'reports.approve', 'Phê duyệt báo cáo'),
  -- dashboard - thêm đầy đủ
  ('dashboard', 'create', 'dashboard.create', 'Tạo dashboard'),
  ('dashboard', 'update', 'dashboard.update', 'Chỉnh sửa dashboard'),
  ('dashboard', 'delete', 'dashboard.delete', 'Xóa dashboard'),
  ('dashboard', 'export', 'dashboard.export', 'Xuất dashboard'),
  ('dashboard', 'approve', 'dashboard.approve', 'Phê duyệt dashboard'),
  -- hotels - thêm đầy đủ
  ('hotels', 'view', 'hotels.view', 'Xem khách sạn'),
  ('hotels', 'create', 'hotels.create', 'Tạo khách sạn'),
  ('hotels', 'update', 'hotels.update', 'Chỉnh sửa khách sạn'),
  ('hotels', 'delete', 'hotels.delete', 'Xóa khách sạn'),
  ('hotels', 'export', 'hotels.export', 'Xuất dữ liệu khách sạn'),
  ('hotels', 'approve', 'hotels.approve', 'Phê duyệt khách sạn'),
  -- purchase_orders - thêm đầy đủ
  ('purchase_orders', 'view', 'purchase_orders.view', 'Xem đơn hàng'),
  ('purchase_orders', 'create', 'purchase_orders.create', 'Tạo đơn hàng'),
  ('purchase_orders', 'update', 'purchase_orders.update', 'Chỉnh sửa đơn hàng'),
  ('purchase_orders', 'delete', 'purchase_orders.delete', 'Xóa đơn hàng'),
  ('purchase_orders', 'export', 'purchase_orders.export', 'Xuất đơn hàng'),
  ('purchase_orders', 'approve', 'purchase_orders.approve', 'Phê duyệt đơn hàng')
ON CONFLICT (code) DO NOTHING;

-- Phase 3: Cập nhật function get_user_permissions_summary để handle cả edit và update
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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH user_perms AS (
    SELECT up.module, up.action
    FROM user_permissions up
    WHERE up.user_id = p_user_id AND up.enabled = true
  ),
  all_modules AS (
    SELECT DISTINCT module FROM permissions
  )
  SELECT 
    m.module,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'view') as can_view,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'create') as can_create,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action IN ('update', 'edit')) as can_update,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'delete') as can_delete,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'export') as can_export,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'approve') as can_approve
  FROM all_modules m
  ORDER BY m.module;
$$;

-- Phase 4: Cập nhật function has_user_permission để handle cả edit và update
CREATE OR REPLACE FUNCTION public.has_user_permission(p_user_id uuid, p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Check user_permissions table first (custom permissions)
  SELECT EXISTS (
    SELECT 1
    FROM user_permissions up
    WHERE up.user_id = p_user_id
      AND up.module = p_module
      AND (
        up.action = p_action 
        OR (p_action = 'update' AND up.action = 'edit')
        OR (p_action = 'edit' AND up.action = 'update')
      )
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
      AND (
        p.action = p_action
        OR (p_action = 'update' AND p.action = 'edit')
        OR (p_action = 'edit' AND p.action = 'update')
      )
  )
$$;
