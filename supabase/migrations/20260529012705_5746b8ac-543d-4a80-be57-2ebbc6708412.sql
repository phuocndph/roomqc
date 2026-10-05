
-- 1) Fix privilege escalation bug in users update policy
DROP POLICY IF EXISTS users_update_self_or_managed ON public.users;

CREATE POLICY users_update_self_or_managed ON public.users
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR id = auth.uid()
  OR (tenant_id = get_current_user_tenant_id() AND can_manage_user(auth.uid(), id))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    -- Self update: cannot change tenant, level, role, or escalate to super admin / primary owner
    id = auth.uid()
    AND tenant_id = (SELECT u.tenant_id FROM users u WHERE u.id = auth.uid())
    AND user_level_code = (SELECT u.user_level_code FROM users u WHERE u.id = auth.uid())
    AND COALESCE(role, '') = COALESCE((SELECT u.role FROM users u WHERE u.id = auth.uid()), '')
    AND is_super_admin = false
    AND COALESCE(is_primary_owner, false) = COALESCE((SELECT u.is_primary_owner FROM users u WHERE u.id = auth.uid()), false)
  )
  OR (
    -- Manager updating subordinate: cannot escalate target, cannot change tenant/level/role of target
    tenant_id = get_current_user_tenant_id()
    AND can_manage_user(auth.uid(), id)
    AND is_super_admin = false
    AND COALESCE(is_primary_owner, false) = COALESCE((SELECT u.is_primary_owner FROM users u WHERE u.id = users.id), false)
    AND user_level_code = (SELECT u.user_level_code FROM users u WHERE u.id = users.id)
    AND COALESCE(role, '') = COALESCE((SELECT u.role FROM users u WHERE u.id = users.id), '')
    AND tenant_id = (SELECT u.tenant_id FROM users u WHERE u.id = users.id)
  )
);

-- 2) Explicit SELECT policy for hotel-logos storage bucket (documents intent: public bucket)
DROP POLICY IF EXISTS "hotel_logos_public_read" ON storage.objects;
CREATE POLICY "hotel_logos_public_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'hotel-logos');

-- 3) Explicit deny SELECT on password_reset_otps (only service_role/edge functions read via bypass)
DROP POLICY IF EXISTS "password_reset_otps_deny_select" ON public.password_reset_otps;
CREATE POLICY "password_reset_otps_deny_select" ON public.password_reset_otps
FOR SELECT
USING (false);

-- 4) Explicit deny SELECT on platform_settings for non-super-admin (super_admin covered by ALL policy)
DROP POLICY IF EXISTS "platform_settings_deny_non_superadmin_select" ON public.platform_settings;
CREATE POLICY "platform_settings_deny_non_superadmin_select" ON public.platform_settings
FOR SELECT
USING (is_super_admin(auth.uid()));

-- 5) Restrict user_permissions SELECT: staff sees own; managers/owners see tenant-wide
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view permissions scoped by role" ON public.user_permissions
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_super_admin(auth.uid())
  OR (
    tenant_id = get_current_user_tenant_id()
    AND (
      is_tenant_owner()
      OR has_user_level(auth.uid(), 'manager')
    )
  )
);
