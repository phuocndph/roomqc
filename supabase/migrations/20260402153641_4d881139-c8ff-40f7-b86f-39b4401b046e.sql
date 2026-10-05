
-- Drop and recreate function with all 8 action columns
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
SET search_path TO 'public'
AS $function$
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
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'view') as can_view,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'create') as can_create,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action IN ('update', 'edit')) as can_update,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'delete') as can_delete,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'export') as can_export,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'approve') as can_approve,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'assign') as can_assign,
    EXISTS(SELECT 1 FROM user_perms up WHERE up.module = m.module AND up.action = 'manage') as can_manage
  FROM all_modules m
  ORDER BY m.module;
$function$;

-- Insert missing module entries into permissions table
INSERT INTO public.permissions (module, action, code, name) VALUES
  ('bookings', 'view', 'bookings.view', 'Xem đặt phòng'),
  ('bookings', 'create', 'bookings.create', 'Tạo đặt phòng'),
  ('bookings', 'update', 'bookings.update', 'Chỉnh sửa đặt phòng'),
  ('bookings', 'delete', 'bookings.delete', 'Xóa đặt phòng'),
  ('bookings', 'export', 'bookings.export', 'Xuất dữ liệu đặt phòng'),
  ('maintenance', 'assign', 'maintenance.assign', 'Phân công bảo trì'),
  ('settings', 'manage', 'settings.manage', 'Quản lý cài đặt')
ON CONFLICT (code) DO NOTHING;
