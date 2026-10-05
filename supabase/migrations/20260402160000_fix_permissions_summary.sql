-- Fix get_user_permissions_summary: add can_assign and can_manage columns
DROP FUNCTION IF EXISTS public.get_user_permissions_summary(UUID);

CREATE OR REPLACE FUNCTION public.get_user_permissions_summary(p_user_id UUID)
RETURNS TABLE(
  module TEXT,
  can_view BOOLEAN,
  can_create BOOLEAN,
  can_update BOOLEAN,
  can_delete BOOLEAN,
  can_export BOOLEAN,
  can_approve BOOLEAN,
  can_assign BOOLEAN,
  can_manage BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_perms AS (
    SELECT up.module, up.action
    FROM user_permissions up
    WHERE up.user_id = p_user_id AND up.enabled = true
  ),
  all_modules AS (
    SELECT DISTINCT p.module FROM permissions p
  )
  SELECT 
    m.module,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'view') as can_view,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'create') as can_create,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action IN ('update', 'edit')) as can_update,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'delete') as can_delete,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'export') as can_export,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'approve') as can_approve,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'assign') as can_assign,
    EXISTS(SELECT 1 FROM user_perms WHERE module = m.module AND action = 'manage') as can_manage
  FROM all_modules m
  ORDER BY m.module;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions_summary(UUID) TO authenticated;

-- Add missing bookings module to permissions table
INSERT INTO permissions (module, action, name, code, description)
SELECT * FROM (VALUES
  ('bookings', 'view', 'Xem đặt phòng', 'bookings.view', 'Xem danh sách đặt phòng'),
  ('bookings', 'create', 'Tạo đặt phòng', 'bookings.create', 'Tạo đặt phòng mới'),
  ('bookings', 'update', 'Sửa đặt phòng', 'bookings.update', 'Chỉnh sửa đặt phòng'),
  ('bookings', 'delete', 'Xóa đặt phòng', 'bookings.delete', 'Xóa đặt phòng'),
  ('bookings', 'export', 'Xuất đặt phòng', 'bookings.export', 'Xuất dữ liệu đặt phòng')
) AS v(module, action, name, code, description)
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE module = 'bookings');

-- Add missing dashboard.view to permissions table
INSERT INTO permissions (module, action, name, code, description)
SELECT 'dashboard', 'view', 'Xem trang chủ', 'dashboard.view', 'Xem trang chủ'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE module = 'dashboard' AND action = 'view');

-- Add assign and manage actions for modules that need them
INSERT INTO permissions (module, action, name, code, description)
SELECT * FROM (VALUES
  ('maintenance', 'assign', 'Phân công bảo trì', 'maintenance.assign', 'Phân công nhân viên bảo trì'),
  ('settings', 'manage', 'Quản lý cài đặt', 'settings.manage', 'Quản lý toàn bộ cài đặt')
) AS v(module, action, name, code, description)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.module = v.module AND p.action = v.action);
