-- Add missing RLS policies for public.tenants
-- Currently RLS is enabled but no policies exist → all SELECT/UPDATE blocked

-- Super Admin: full SELECT
CREATE POLICY "tenants_select_super_admin"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Authenticated user: SELECT own tenant
CREATE POLICY "tenants_select_own"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Super Admin: full UPDATE
CREATE POLICY "tenants_update_super_admin"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Owner: UPDATE own tenant
CREATE POLICY "tenants_update_owner"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND public.has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND public.has_role(auth.uid(), 'owner'::app_role)
  );