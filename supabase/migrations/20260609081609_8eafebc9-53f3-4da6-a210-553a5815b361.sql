
-- Helper expression repeated: owner or manager or super admin
-- Using existing functions: is_super_admin(auth.uid()), is_tenant_owner(),
-- has_user_level(auth.uid(),'manager'), get_current_user_tenant_id()

----------------------------------------------------------------
-- 1. hotel_settings: replace blanket ALL write policy
----------------------------------------------------------------
DROP POLICY IF EXISTS hotel_settings_tenant_write ON public.hotel_settings;

CREATE POLICY hotel_settings_tenant_write_owner_mgr
ON public.hotel_settings
FOR ALL
TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
);

----------------------------------------------------------------
-- 2. room_pricing_rules
----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage pricing rules for their tenant" ON public.room_pricing_rules;

CREATE POLICY room_pricing_rules_owner_mgr_write
ON public.room_pricing_rules
FOR ALL
TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
);

----------------------------------------------------------------
-- 3. hotel_services
----------------------------------------------------------------
DROP POLICY IF EXISTS hotel_services_insert ON public.hotel_services;
DROP POLICY IF EXISTS hotel_services_update ON public.hotel_services;
DROP POLICY IF EXISTS hotel_services_delete ON public.hotel_services;

CREATE POLICY hotel_services_insert_owner_mgr
ON public.hotel_services
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
);

CREATE POLICY hotel_services_update_owner_mgr
ON public.hotel_services
FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
);

CREATE POLICY hotel_services_delete_owner_mgr
ON public.hotel_services
FOR DELETE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    is_super_admin(auth.uid())
    OR is_tenant_owner()
    OR has_user_level(auth.uid(), 'manager')
  )
);

----------------------------------------------------------------
-- 4. Rate tables
----------------------------------------------------------------
DROP POLICY IF EXISTS rtr_tenant_modify ON public.room_type_rates;
CREATE POLICY rtr_tenant_modify
ON public.room_type_rates FOR ALL TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

DROP POLICY IF EXISTS rp_tenant_modify ON public.rate_plans;
CREATE POLICY rp_tenant_modify
ON public.rate_plans FOR ALL TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

DROP POLICY IF EXISTS sro_tenant_modify ON public.seasonal_rate_overrides;
CREATE POLICY sro_tenant_modify
ON public.seasonal_rate_overrides FOR ALL TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

DROP POLICY IF EXISTS rpdp_tenant_modify ON public.rate_plan_daily_prices;
CREATE POLICY rpdp_tenant_modify
ON public.rate_plan_daily_prices FOR ALL TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

----------------------------------------------------------------
-- 5. hotel_fixed_expenses
----------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant members can insert fixed expenses" ON public.hotel_fixed_expenses;
DROP POLICY IF EXISTS "Tenant members can update fixed expenses" ON public.hotel_fixed_expenses;
DROP POLICY IF EXISTS "Tenant members can delete fixed expenses" ON public.hotel_fixed_expenses;

CREATE POLICY hotel_fixed_expenses_insert_owner_mgr
ON public.hotel_fixed_expenses FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

CREATE POLICY hotel_fixed_expenses_update_owner_mgr
ON public.hotel_fixed_expenses FOR UPDATE TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

CREATE POLICY hotel_fixed_expenses_delete_owner_mgr
ON public.hotel_fixed_expenses FOR DELETE TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

----------------------------------------------------------------
-- 6. monthly_targets
----------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant members can insert monthly targets" ON public.monthly_targets;
DROP POLICY IF EXISTS "Tenant members can update monthly targets" ON public.monthly_targets;
DROP POLICY IF EXISTS "Tenant members can delete monthly targets" ON public.monthly_targets;

CREATE POLICY monthly_targets_insert_owner_mgr
ON public.monthly_targets FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

CREATE POLICY monthly_targets_update_owner_mgr
ON public.monthly_targets FOR UPDATE TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
)
WITH CHECK (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

CREATE POLICY monthly_targets_delete_owner_mgr
ON public.monthly_targets FOR DELETE TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);

----------------------------------------------------------------
-- 7. users_insert_in_tenant: prevent privilege escalation on INSERT
----------------------------------------------------------------
DROP POLICY IF EXISTS users_insert_in_tenant ON public.users;

CREATE POLICY users_insert_in_tenant
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    tenant_id = get_current_user_tenant_id()
    AND COALESCE(is_super_admin, false) = false
    AND COALESCE(is_primary_owner, false) = false
    AND user_level_code IN ('manager', 'staff')
    AND (is_tenant_owner() OR has_user_level(auth.uid(), 'manager'))
  )
);

----------------------------------------------------------------
-- 8. supplement_requests: add DELETE policy (manager+)
----------------------------------------------------------------
CREATE POLICY supplement_requests_delete_owner_mgr
ON public.supplement_requests FOR DELETE TO authenticated
USING (
  tenant_id = get_current_user_tenant_id()
  AND (is_super_admin(auth.uid()) OR is_tenant_owner() OR has_user_level(auth.uid(),'manager'))
);
