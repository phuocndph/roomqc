-- Fix existing users: Assign roles to users missing them in user_roles table

-- Insert roles for existing users who don't have any roles assigned
INSERT INTO user_roles (user_id, role, created_by)
SELECT 
  u.id as user_id,
  CASE u.user_level_code
    WHEN 'tenant_owner' THEN 'owner'::app_role
    WHEN 'manager' THEN 'hotel_manager'::app_role  
    WHEN 'staff' THEN 'staff'::app_role
  END as role,
  u.created_by
FROM users u
WHERE u.id NOT IN (SELECT user_id FROM user_roles)
  AND u.user_level_code IN ('tenant_owner', 'manager', 'staff')
  AND u.id != '00000000-0000-0000-0000-000000000000'; -- Exclude system admin

-- Log the fix
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % users without roles', affected_count;
END $$;