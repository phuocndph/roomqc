-- Keep authorization helpers stable for the planner and prevent search_path
-- hijacking when this trigger function is invoked by table writes.
BEGIN;

ALTER FUNCTION public.check_created_by_required()
  SET search_path = public, pg_temp;

-- These policies were functionally correct, but called auth/authorization
-- helpers once per row.  Wrapping the calls in SELECT evaluates them once per
-- statement (Supabase RLS init-plan recommendation) without changing access.

DROP POLICY IF EXISTS "Room items can be created with room permission" ON public.room_items;
DROP POLICY IF EXISTS "Room items can be deleted with room permission" ON public.room_items;
DROP POLICY IF EXISTS "Room items can be updated with room permission" ON public.room_items;

CREATE POLICY "Room items can be created with room permission"
  ON public.room_items FOR INSERT TO public
  WITH CHECK (
    room_id IN (
      SELECT rooms.id FROM public.rooms
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR rooms.tenant_id = (SELECT get_current_user_tenant_id())
    )
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'rooms.create'::text))
    )
  );

CREATE POLICY "Room items can be deleted with room permission"
  ON public.room_items FOR DELETE TO public
  USING (
    room_id IN (
      SELECT rooms.id FROM public.rooms
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR rooms.tenant_id = (SELECT get_current_user_tenant_id())
    )
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'rooms.delete'::text))
    )
  );

CREATE POLICY "Room items can be updated with room permission"
  ON public.room_items FOR UPDATE TO public
  USING (
    room_id IN (
      SELECT rooms.id FROM public.rooms
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR rooms.tenant_id = (SELECT get_current_user_tenant_id())
    )
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'rooms.update'::text))
    )
  )
  WITH CHECK (
    room_id IN (
      SELECT rooms.id FROM public.rooms
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR rooms.tenant_id = (SELECT get_current_user_tenant_id())
    )
  );

DROP POLICY IF EXISTS "Laundry batch items can be created with laundry permission" ON public.laundry_batch_items;
DROP POLICY IF EXISTS "Laundry batch items can be deleted with laundry permission" ON public.laundry_batch_items;
DROP POLICY IF EXISTS "Laundry batch items can be updated with laundry permission" ON public.laundry_batch_items;

CREATE POLICY "Laundry batch items can be created with laundry permission"
  ON public.laundry_batch_items FOR INSERT TO public
  WITH CHECK (
    batch_id IN (
      SELECT laundry_batches.id FROM public.laundry_batches
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR laundry_batches.tenant_id = (SELECT get_current_user_tenant_id())
    )
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'laundry.create'::text))
    )
  );

CREATE POLICY "Laundry batch items can be deleted with laundry permission"
  ON public.laundry_batch_items FOR DELETE TO public
  USING (
    batch_id IN (
      SELECT laundry_batches.id FROM public.laundry_batches
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR laundry_batches.tenant_id = (SELECT get_current_user_tenant_id())
    )
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'laundry.delete'::text))
    )
  );

CREATE POLICY "Laundry batch items can be updated with laundry permission"
  ON public.laundry_batch_items FOR UPDATE TO public
  USING (
    batch_id IN (
      SELECT laundry_batches.id FROM public.laundry_batches
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR laundry_batches.tenant_id = (SELECT get_current_user_tenant_id())
    )
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'laundry.update'::text))
    )
  )
  WITH CHECK (
    batch_id IN (
      SELECT laundry_batches.id FROM public.laundry_batches
      WHERE (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
         OR laundry_batches.tenant_id = (SELECT get_current_user_tenant_id())
    )
  );

DROP POLICY IF EXISTS "Lost and found can be created with inventory permission" ON public.lost_found_items;
DROP POLICY IF EXISTS "Lost and found can be deleted with inventory permission" ON public.lost_found_items;
DROP POLICY IF EXISTS "Lost and found can be updated with inventory permission" ON public.lost_found_items;
DROP POLICY IF EXISTS "Lost and found is visible to tenant members" ON public.lost_found_items;

CREATE POLICY "Lost and found is visible to tenant members"
  ON public.lost_found_items FOR SELECT TO public
  USING (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

CREATE POLICY "Lost and found can be created with inventory permission"
  ON public.lost_found_items FOR INSERT TO public
  WITH CHECK (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'inventory.create'::text))
    )
  );

CREATE POLICY "Lost and found can be deleted with inventory permission"
  ON public.lost_found_items FOR DELETE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'inventory.delete'::text))
    )
  );

CREATE POLICY "Lost and found can be updated with inventory permission"
  ON public.lost_found_items FOR UPDATE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'inventory.update'::text))
    )
  )
  WITH CHECK (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

DROP POLICY IF EXISTS "VAT claims can be created with report permission" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "VAT claims can be deleted with report permission" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "VAT claims can be updated with report permission" ON public.invoice_vat_claims;
DROP POLICY IF EXISTS "VAT claims remain visible to tenant members" ON public.invoice_vat_claims;

CREATE POLICY "VAT claims remain visible to tenant members"
  ON public.invoice_vat_claims FOR SELECT TO public
  USING (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

CREATE POLICY "VAT claims can be created with report permission"
  ON public.invoice_vat_claims FOR INSERT TO public
  WITH CHECK (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'reports.create'::text))
    )
  );

CREATE POLICY "VAT claims can be deleted with report permission"
  ON public.invoice_vat_claims FOR DELETE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'reports.delete'::text))
    )
  );

CREATE POLICY "VAT claims can be updated with report permission"
  ON public.invoice_vat_claims FOR UPDATE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'reports.update'::text))
    )
  )
  WITH CHECK (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

DROP POLICY IF EXISTS "Guest invoices are visible to tenant members" ON public.guest_invoices;
DROP POLICY IF EXISTS "Guest invoices can be created with report permission" ON public.guest_invoices;
DROP POLICY IF EXISTS "Guest invoices can be deleted with report permission" ON public.guest_invoices;
DROP POLICY IF EXISTS "Guest invoices can be updated with report permission" ON public.guest_invoices;

CREATE POLICY "Guest invoices are visible to tenant members"
  ON public.guest_invoices FOR SELECT TO public
  USING (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

CREATE POLICY "Guest invoices can be created with report permission"
  ON public.guest_invoices FOR INSERT TO public
  WITH CHECK (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'bookings.create'::text))
      OR (SELECT has_permission((SELECT auth.uid()), 'reports.create'::text))
    )
  );

CREATE POLICY "Guest invoices can be deleted with report permission"
  ON public.guest_invoices FOR DELETE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'bookings.delete'::text))
      OR (SELECT has_permission((SELECT auth.uid()), 'reports.delete'::text))
    )
  );

CREATE POLICY "Guest invoices can be updated with report permission"
  ON public.guest_invoices FOR UPDATE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'bookings.update'::text))
      OR (SELECT has_permission((SELECT auth.uid()), 'reports.update'::text))
    )
  )
  WITH CHECK (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

DROP POLICY IF EXISTS "Guests are visible to tenant members" ON public.guests;
DROP POLICY IF EXISTS "Guests can be created with booking permission" ON public.guests;
DROP POLICY IF EXISTS "Guests can be deleted with booking permission" ON public.guests;
DROP POLICY IF EXISTS "Guests can be updated with booking permission" ON public.guests;

CREATE POLICY "Guests are visible to tenant members"
  ON public.guests FOR SELECT TO public
  USING (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

CREATE POLICY "Guests can be created with booking permission"
  ON public.guests FOR INSERT TO public
  WITH CHECK (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'bookings.create'::text))
    )
  );

CREATE POLICY "Guests can be deleted with booking permission"
  ON public.guests FOR DELETE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'bookings.delete'::text))
    )
  );

CREATE POLICY "Guests can be updated with booking permission"
  ON public.guests FOR UPDATE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'bookings.update'::text))
    )
  )
  WITH CHECK (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

DROP POLICY IF EXISTS "Room type availability can be deleted with room permission" ON public.room_type_availability;
DROP POLICY IF EXISTS "Room type availability can be modified with room permission" ON public.room_type_availability;
DROP POLICY IF EXISTS "Room type availability can be updated with room permission" ON public.room_type_availability;

CREATE POLICY "Room type availability can be deleted with room permission"
  ON public.room_type_availability FOR DELETE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'rooms.delete'::text))
    )
  );

CREATE POLICY "Room type availability can be modified with room permission"
  ON public.room_type_availability FOR INSERT TO public
  WITH CHECK (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'rooms.create'::text))
    )
  );

CREATE POLICY "Room type availability can be updated with room permission"
  ON public.room_type_availability FOR UPDATE TO public
  USING (
    ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
      OR tenant_id = (SELECT get_current_user_tenant_id()))
    AND (
      (SELECT has_operational_manager_role((SELECT auth.uid())))
      OR (SELECT has_permission((SELECT auth.uid()), 'rooms.update'::text))
    )
  )
  WITH CHECK (
    (SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role))
    OR tenant_id = (SELECT get_current_user_tenant_id())
  );

COMMIT;
