-- Booking permissions must be explicit. Do not broaden the shared `staff`
-- role because finance, housekeeping, inventory and maintenance staff use it.

-- Hotel managers can operate bookings; department managers retain read access.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p
  ON p.code IN (
    'bookings.view',
    'bookings.create',
    'bookings.update',
    'bookings.export'
  )
WHERE r.code = 'hotel_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'bookings.view'
WHERE r.code = 'department_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Front-desk users are staff by hierarchy, so their booking access is a
-- per-user grant. This avoids leaking booking operations to every staff role.
CREATE OR REPLACE FUNCTION public.grant_front_desk_booking_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.department = 'front_desk' THEN
    INSERT INTO public.user_permissions (user_id, tenant_id, module, action, enabled)
    SELECT NEW.id, NEW.tenant_id, 'bookings', p.action, true
    FROM public.permissions p
    WHERE p.code IN (
      'bookings.view',
      'bookings.create',
      'bookings.update',
      'bookings.export'
    )
    ON CONFLICT (user_id, module, action) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_front_desk_booking_permissions() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_grant_front_desk_booking_permissions ON public.users;
CREATE TRIGGER trg_grant_front_desk_booking_permissions
  AFTER INSERT OR UPDATE OF department ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_front_desk_booking_permissions();

-- Backfill existing front-desk users without overwriting explicit overrides.
INSERT INTO public.user_permissions (user_id, tenant_id, module, action, enabled)
SELECT u.id, u.tenant_id, 'bookings', p.action, true
FROM public.users u
CROSS JOIN public.permissions p
WHERE u.department = 'front_desk'
  AND p.code IN (
    'bookings.view',
    'bookings.create',
    'bookings.update',
    'bookings.export'
  )
ON CONFLICT (user_id, module, action) DO NOTHING;

-- Existing policies allowed any `staff` user to write bookings. Replace those
-- policies so the database enforces the same permission matrix as the UI.
DROP POLICY IF EXISTS "Managers can insert room bookings" ON public.room_bookings;
DROP POLICY IF EXISTS "Staff and managers can insert room bookings" ON public.room_bookings;
DROP POLICY IF EXISTS "Managers can update room bookings" ON public.room_bookings;
DROP POLICY IF EXISTS "Staff and managers can update room bookings" ON public.room_bookings;
DROP POLICY IF EXISTS "Managers can delete room bookings" ON public.room_bookings;

CREATE POLICY "Users with booking create permission can insert room bookings"
ON public.room_bookings FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_user_tenant_id()
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_permission(auth.uid(), 'bookings.create')
  )
);

CREATE POLICY "Users with booking update permission can update room bookings"
ON public.room_bookings FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_permission(auth.uid(), 'bookings.update')
  )
)
WITH CHECK (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Users with booking delete permission can delete room bookings"
ON public.room_bookings FOR DELETE TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_permission(auth.uid(), 'bookings.delete')
  )
);

COMMENT ON FUNCTION public.grant_front_desk_booking_permissions() IS
  'Grants the default booking permission template to front-desk users without broadening the staff role.';
