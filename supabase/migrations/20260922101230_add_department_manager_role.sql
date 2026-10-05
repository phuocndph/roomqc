-- Keep the enum role and the permission-system role registry in sync. Older
-- tenants could assign department_manager in user_roles, but no matching
-- role row existed, which reduced the account to zero module permissions.
INSERT INTO public.roles (tenant_id, code, name, is_system, hierarchy_level, description)
SELECT r.tenant_id,
       'department_manager',
       'Trưởng bộ phận',
       true,
       3,
       'Quản lý vận hành theo bộ phận'
FROM public.roles r
WHERE r.code = 'hotel_manager'
  AND NOT EXISTS (
    SELECT 1
    FROM public.roles existing
    WHERE existing.tenant_id = r.tenant_id
      AND existing.code = 'department_manager'
  );

-- Start with the existing manager baseline so every tenant gets a usable,
-- deterministic permission set. Tenant-specific manager customisations are
-- copied only within the same tenant.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT department_role.id, manager_permission.permission_id
FROM public.roles department_role
JOIN public.roles manager_role
  ON manager_role.tenant_id = department_role.tenant_id
 AND manager_role.code = 'hotel_manager'
JOIN public.role_permissions manager_permission
  ON manager_permission.role_id = manager_role.id
WHERE department_role.code = 'department_manager'
ON CONFLICT DO NOTHING;

-- The position management UI already supports accounting and front desk
-- departments, but the legacy users constraint rejected those values.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_department_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_department_check
  CHECK (
    department IS NULL
    OR department = ANY (ARRAY[
      'housekeeping'::text,
      'laundry'::text,
      'inventory'::text,
      'maintenance'::text,
      'accounting'::text,
      'front_desk'::text,
      'other'::text
    ])
  );
