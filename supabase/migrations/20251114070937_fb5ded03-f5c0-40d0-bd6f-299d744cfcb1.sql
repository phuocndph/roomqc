-- Fix existing users: Add missing user_hotels records

-- Insert user_hotels records for users who have hotel_id but no user_hotels entry
INSERT INTO user_hotels (user_id, hotel_id, assigned_by, can_create_managers, can_create_staff, can_view_reports, can_export_data, can_approve_requests)
SELECT 
  u.id as user_id,
  u.hotel_id,
  u.created_by as assigned_by,
  CASE 
    WHEN u.user_level_code IN ('tenant_owner', 'manager') THEN true
    ELSE false
  END as can_create_managers,
  CASE 
    WHEN u.user_level_code IN ('tenant_owner', 'manager') THEN true
    ELSE false
  END as can_create_staff,
  CASE 
    WHEN u.user_level_code IN ('tenant_owner', 'manager') THEN true
    ELSE false
  END as can_view_reports,
  CASE 
    WHEN u.user_level_code IN ('tenant_owner', 'manager') THEN true
    ELSE false
  END as can_export_data,
  CASE 
    WHEN u.user_level_code IN ('tenant_owner', 'manager') THEN true
    ELSE false
  END as can_approve_requests
FROM users u
WHERE u.hotel_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_hotels uh 
    WHERE uh.user_id = u.id AND uh.hotel_id = u.hotel_id
  );
