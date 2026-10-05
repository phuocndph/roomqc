-- Add full permissions for the legacy owner role when it exists.
-- The role belonged to one historical tenant and is absent in a clean install.
-- Joining the roles table keeps fresh database creation free of FK violations.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.id = '043746e5-704c-47b3-b612-c78ab5e8ef40'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
  )
ON CONFLICT DO NOTHING;
