-- Align tenant-scoped data access with the permission matrix.
-- These policies keep read access tenant-scoped while requiring the matching
-- module permission for writes. Existing permissive policies are removed first
-- so they cannot bypass the stricter policies through PostgreSQL's OR semantics.

CREATE OR REPLACE FUNCTION public.has_operational_manager_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND (
      public.has_role(_user_id, 'super_admin')
      OR public.has_role(_user_id, 'owner')
      OR public.has_role(_user_id, 'hotel_manager')
      OR public.has_role(_user_id, 'department_manager')
    )
$$;

REVOKE ALL ON FUNCTION public.has_operational_manager_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_operational_manager_role(uuid) TO authenticated;

-- Keep this migration safe to re-run while developing the local stack.
DROP POLICY IF EXISTS "Guests are visible to tenant members" ON public.guests;
DROP POLICY IF EXISTS "Guests can be created with booking permission" ON public.guests;
DROP POLICY IF EXISTS "Guests can be updated with booking permission" ON public.guests;
DROP POLICY IF EXISTS "Guests can be deleted with booking permission" ON public.guests;
DROP POLICY IF EXISTS "Guest invoices are visible to tenant members" ON public.guest_invoices;
DROP POLICY IF EXISTS "Guest invoices can be created with report permission" ON public.guest_invoices;
DROP POLICY IF EXISTS "Guest invoices can be updated with report permission" ON public.guest_invoices;
DROP POLICY IF EXISTS "Guest invoices can be deleted with report permission" ON public.guest_invoices;
DROP POLICY IF EXISTS "Lost and found is visible to tenant members" ON public.lost_found_items;
DROP POLICY IF EXISTS "Lost and found can be created with inventory permission" ON public.lost_found_items;
DROP POLICY IF EXISTS "Lost and found can be updated with inventory permission" ON public.lost_found_items;
DROP POLICY IF EXISTS "Lost and found can be deleted with inventory permission" ON public.lost_found_items;
DROP POLICY IF EXISTS "VAT claims remain visible to tenant members" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "VAT claims can be created with report permission" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "VAT claims can be updated with report permission" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "VAT claims can be deleted with report permission" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "Room items can be created with room permission" ON public.room_items;
DROP POLICY IF EXISTS "Room items can be updated with room permission" ON public.room_items;
DROP POLICY IF EXISTS "Room items can be deleted with room permission" ON public.room_items;
DROP POLICY IF EXISTS "Laundry batch items can be created with laundry permission" ON public.laundry_batch_items;
DROP POLICY IF EXISTS "Laundry batch items can be updated with laundry permission" ON public.laundry_batch_items;
DROP POLICY IF EXISTS "Laundry batch items can be deleted with laundry permission" ON public.laundry_batch_items;
DROP POLICY IF EXISTS "Room type availability can be modified with room permission" ON public.room_type_availability;
DROP POLICY IF EXISTS "Room type availability can be updated with room permission" ON public.room_type_availability;
DROP POLICY IF EXISTS "Room type availability can be deleted with room permission" ON public.room_type_availability;

-- Guests are managed through the bookings/front-desk module.
DROP POLICY IF EXISTS "Tenant isolation for guests" ON public.guests;
CREATE POLICY "Guests are visible to tenant members"
  ON public.guests FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Guests can be created with booking permission"
  ON public.guests FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'bookings.create')
    )
  );
CREATE POLICY "Guests can be updated with booking permission"
  ON public.guests FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'bookings.update')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Guests can be deleted with booking permission"
  ON public.guests FOR DELETE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'bookings.delete')
    )
  );

-- Guest invoices follow booking/report permissions; tenant members retain read access.
DROP POLICY IF EXISTS "Tenant isolation for guest_invoices" ON public.guest_invoices;
CREATE POLICY "Guest invoices are visible to tenant members"
  ON public.guest_invoices FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Guest invoices can be created with report permission"
  ON public.guest_invoices FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'bookings.create')
      OR public.has_permission(auth.uid(), 'reports.create')
    )
  );
CREATE POLICY "Guest invoices can be updated with report permission"
  ON public.guest_invoices FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'bookings.update')
      OR public.has_permission(auth.uid(), 'reports.update')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Guest invoices can be deleted with report permission"
  ON public.guest_invoices FOR DELETE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'bookings.delete')
      OR public.has_permission(auth.uid(), 'reports.delete')
    )
  );

-- Lost and found is an inventory/housekeeping operation.
DROP POLICY IF EXISTS "Tenant isolation for lost_found_items" ON public.lost_found_items;
CREATE POLICY "Lost and found is visible to tenant members"
  ON public.lost_found_items FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Lost and found can be created with inventory permission"
  ON public.lost_found_items FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'inventory.create')
    )
  );
CREATE POLICY "Lost and found can be updated with inventory permission"
  ON public.lost_found_items FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'inventory.update')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Lost and found can be deleted with inventory permission"
  ON public.lost_found_items FOR DELETE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'inventory.delete')
    )
  );

-- VAT claims are accounting/reporting data.
DROP POLICY IF EXISTS "tenant members can manage claims" ON public.invoice_vat_claims;
CREATE POLICY "VAT claims remain visible to tenant members"
  ON public.invoice_vat_claims FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "VAT claims can be created with report permission"
  ON public.invoice_vat_claims FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'reports.create')
    )
  );
CREATE POLICY "VAT claims can be updated with report permission"
  ON public.invoice_vat_claims FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'reports.update')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "VAT claims can be deleted with report permission"
  ON public.invoice_vat_claims FOR DELETE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'reports.delete')
    )
  );

-- Room contents are controlled by room/inventory permissions.
DROP POLICY IF EXISTS "Staff can manage room items" ON public.room_items;
CREATE POLICY "Room items can be created with room permission"
  ON public.room_items FOR INSERT
  WITH CHECK (
    room_id IN (
      SELECT id FROM public.rooms
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'rooms.create')
    )
  );
CREATE POLICY "Room items can be updated with room permission"
  ON public.room_items FOR UPDATE
  USING (
    room_id IN (
      SELECT id FROM public.rooms
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'rooms.update')
    )
  )
  WITH CHECK (
    room_id IN (
      SELECT id FROM public.rooms
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
  );
CREATE POLICY "Room items can be deleted with room permission"
  ON public.room_items FOR DELETE
  USING (
    room_id IN (
      SELECT id FROM public.rooms
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'rooms.delete')
    )
  );

-- Laundry batch details require laundry permissions.
DROP POLICY IF EXISTS "Staff can manage laundry batch items" ON public.laundry_batch_items;
CREATE POLICY "Laundry batch items can be created with laundry permission"
  ON public.laundry_batch_items FOR INSERT
  WITH CHECK (
    batch_id IN (
      SELECT id FROM public.laundry_batches
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'laundry.create')
    )
  );
CREATE POLICY "Laundry batch items can be updated with laundry permission"
  ON public.laundry_batch_items FOR UPDATE
  USING (
    batch_id IN (
      SELECT id FROM public.laundry_batches
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'laundry.update')
    )
  )
  WITH CHECK (
    batch_id IN (
      SELECT id FROM public.laundry_batches
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
  );
CREATE POLICY "Laundry batch items can be deleted with laundry permission"
  ON public.laundry_batch_items FOR DELETE
  USING (
    batch_id IN (
      SELECT id FROM public.laundry_batches
      WHERE public.has_role(auth.uid(), 'super_admin')
         OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'laundry.delete')
    )
  );

-- These broad child-table policies bypass the narrower distribution-order policies.
DROP POLICY IF EXISTS "Users can manage distribution order items" ON public.distribution_order_items;
DROP POLICY IF EXISTS "Users can manage distribution order rooms" ON public.distribution_order_rooms;

-- Availability changes are room configuration changes, not general tenant writes.
DROP POLICY IF EXISTS "rta_tenant_modify" ON public.room_type_availability;
CREATE POLICY "Room type availability can be modified with room permission"
  ON public.room_type_availability FOR INSERT
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'rooms.create')
    )
  );
CREATE POLICY "Room type availability can be updated with room permission"
  ON public.room_type_availability FOR UPDATE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'rooms.update')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id = public.get_current_user_tenant_id()
  );
CREATE POLICY "Room type availability can be deleted with room permission"
  ON public.room_type_availability FOR DELETE
  USING (
    (
      public.has_role(auth.uid(), 'super_admin')
      OR tenant_id = public.get_current_user_tenant_id()
    )
    AND (
      public.has_operational_manager_role(auth.uid())
      OR public.has_permission(auth.uid(), 'rooms.delete')
    )
  );
