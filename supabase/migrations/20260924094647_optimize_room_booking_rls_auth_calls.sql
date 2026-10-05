-- Cache auth.uid() once per statement so booking RLS does not re-evaluate
-- authentication functions for every candidate row.
DROP POLICY IF EXISTS "Users with booking create permission can insert room bookings" ON public.room_bookings;
CREATE POLICY "Users with booking create permission can insert room bookings"
ON public.room_bookings FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_current_user_tenant_id()
  AND (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'owner'::public.app_role)
    OR public.has_permission((select auth.uid()), 'bookings.create')
  )
);

DROP POLICY IF EXISTS "Users with booking update permission can update room bookings" ON public.room_bookings;
CREATE POLICY "Users with booking update permission can update room bookings"
ON public.room_bookings FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  AND (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'owner'::public.app_role)
    OR public.has_permission((select auth.uid()), 'bookings.update')
  )
)
WITH CHECK (tenant_id = public.get_current_user_tenant_id());

DROP POLICY IF EXISTS "Users with booking delete permission can delete room bookings" ON public.room_bookings;
CREATE POLICY "Users with booking delete permission can delete room bookings"
ON public.room_bookings FOR DELETE TO authenticated
USING (
  tenant_id = public.get_current_user_tenant_id()
  AND (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'owner'::public.app_role)
    OR public.has_permission((select auth.uid()), 'bookings.delete')
  )
);
