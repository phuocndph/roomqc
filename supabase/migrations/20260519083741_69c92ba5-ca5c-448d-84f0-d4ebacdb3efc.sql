-- (1) WITH CHECK defense-in-depth cho users UPDATE
DROP POLICY IF EXISTS users_update_self_or_managed ON public.users;
CREATE POLICY users_update_self_or_managed ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR id = auth.uid()
    OR (tenant_id = public.get_current_user_tenant_id() AND public.can_manage_user(auth.uid(), id))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      id = auth.uid()
      AND tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
      AND user_level_code = (SELECT user_level_code FROM public.users WHERE id = auth.uid())
      AND COALESCE(role::text, '') = COALESCE((SELECT role::text FROM public.users WHERE id = auth.uid()), '')
      AND is_super_admin = false
      AND COALESCE(is_primary_owner, false) = COALESCE((SELECT is_primary_owner FROM public.users WHERE id = auth.uid()), false)
    )
    OR (
      tenant_id = public.get_current_user_tenant_id()
      AND public.can_manage_user(auth.uid(), id)
      AND is_super_admin = false
    )
  );

-- (2) marketing_campaigns: chỉ authenticated
DROP POLICY IF EXISTS "Active campaigns are viewable by authenticated users" ON public.marketing_campaigns;
CREATE POLICY "Active campaigns are viewable by authenticated users"
  ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (status = 'active' AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

-- (3) plan_price_history: chỉ super admin
DROP POLICY IF EXISTS "Authenticated users can view price history" ON public.plan_price_history;
CREATE POLICY "Super admins can view price history"
  ON public.plan_price_history FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- (4) bank_payment_settings: cho tenant_owner CRUD
DROP POLICY IF EXISTS bank_payment_settings_tenant_insert ON public.bank_payment_settings;
CREATE POLICY bank_payment_settings_tenant_insert
  ON public.bank_payment_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (tenant_id = public.get_current_user_tenant_id() AND public.is_tenant_owner())
  );

DROP POLICY IF EXISTS bank_payment_settings_tenant_update ON public.bank_payment_settings;
CREATE POLICY bank_payment_settings_tenant_update
  ON public.bank_payment_settings FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (tenant_id = public.get_current_user_tenant_id() AND public.is_tenant_owner())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (tenant_id = public.get_current_user_tenant_id() AND public.is_tenant_owner())
  );

DROP POLICY IF EXISTS bank_payment_settings_tenant_delete ON public.bank_payment_settings;
CREATE POLICY bank_payment_settings_tenant_delete
  ON public.bank_payment_settings FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (tenant_id = public.get_current_user_tenant_id() AND public.is_tenant_owner())
  );