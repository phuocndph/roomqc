-- Fix existing manager and staff users without hotel_id
-- Assign them to their tenant's first active hotel if available

UPDATE users u
SET hotel_id = (
  SELECT h.id 
  FROM hotels h 
  WHERE h.tenant_id = u.tenant_id 
  AND h.status = 'active'
  ORDER BY h.created_at ASC
  LIMIT 1
)
WHERE u.user_level_code IN ('manager', 'staff')
  AND u.hotel_id IS NULL
  AND EXISTS (
    SELECT 1 FROM hotels h 
    WHERE h.tenant_id = u.tenant_id 
    AND h.status = 'active'
  );

-- Also create user_hotels records for these users
INSERT INTO user_hotels (user_id, hotel_id, assigned_by, can_create_managers, can_create_staff, can_view_reports, can_export_data, can_approve_requests)
SELECT 
  u.id as user_id,
  u.hotel_id,
  u.created_by as assigned_by,
  CASE 
    WHEN u.user_level_code = 'manager' THEN true
    ELSE false
  END as can_create_managers,
  CASE 
    WHEN u.user_level_code = 'manager' THEN true
    ELSE false
  END as can_create_staff,
  CASE 
    WHEN u.user_level_code = 'manager' THEN true
    ELSE false
  END as can_view_reports,
  CASE 
    WHEN u.user_level_code = 'manager' THEN true
    ELSE false
  END as can_export_data,
  CASE 
    WHEN u.user_level_code = 'manager' THEN true
    ELSE false
  END as can_approve_requests
FROM users u
WHERE u.user_level_code IN ('manager', 'staff')
  AND u.hotel_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_hotels uh 
    WHERE uh.user_id = u.id AND uh.hotel_id = u.hotel_id
  );