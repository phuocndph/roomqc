-- =====================================================
-- PHASE 1: CRITICAL DATABASE FIXES
-- =====================================================

-- =====================================================
-- FIX 1: UPDATE ALL RLS POLICIES WITH SUPER ADMIN BYPASS
-- =====================================================

-- TENANTS TABLE
DROP POLICY IF EXISTS "Users can view their own tenant" ON tenants;
CREATE POLICY "Users can view their own tenant"
ON tenants FOR SELECT
TO authenticated
USING (
  is_super_admin() OR 
  id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Tenant owners can update their tenant" ON tenants;
CREATE POLICY "Tenant owners can update their tenant"
ON tenants FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
)
WITH CHECK (
  is_super_admin() OR
  (id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

-- USERS TABLE
DROP POLICY IF EXISTS "Users can view users in their tenant" ON users;
CREATE POLICY "Users can view users in their tenant"
ON users FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert users in their tenant" ON users;
CREATE POLICY "Users can insert users in their tenant"
ON users FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can manage subordinates" ON users;
CREATE POLICY "Users can manage subordinates"
ON users FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  id = auth.uid() OR
  can_manage_user(auth.uid(), id)
)
WITH CHECK (
  is_super_admin() OR
  id = auth.uid() OR
  can_manage_user(auth.uid(), id)
);

DROP POLICY IF EXISTS "Users can delete subordinates" ON users;
CREATE POLICY "Users can delete subordinates"
ON users FOR DELETE
TO authenticated
USING (
  is_super_admin() OR
  can_manage_user(auth.uid(), id)
);

-- HOTELS TABLE
DROP POLICY IF EXISTS "Users can view hotels in their tenant" ON hotels;
CREATE POLICY "Users can view hotels in their tenant"
ON hotels FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Owners can insert hotels" ON hotels;
CREATE POLICY "Owners can insert hotels"
ON hotels FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

DROP POLICY IF EXISTS "Owners and managers can update hotels" ON hotels;
CREATE POLICY "Owners and managers can update hotels"
ON hotels FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code IN ('tenant_owner', 'hotel_manager')))
)
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code IN ('tenant_owner', 'hotel_manager')))
);

DROP POLICY IF EXISTS "Owners can delete hotels" ON hotels;
CREATE POLICY "Owners can delete hotels"
ON hotels FOR DELETE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

-- ITEMS TABLE
DROP POLICY IF EXISTS "Users can view items in their tenant" ON items;
CREATE POLICY "Users can view items in their tenant"
ON items FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert items in their tenant" ON items;
CREATE POLICY "Users can insert items in their tenant"
ON items FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can update items in their tenant" ON items;
CREATE POLICY "Users can update items in their tenant"
ON items FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
)
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete items in their tenant" ON items;
CREATE POLICY "Users can delete items in their tenant"
ON items FOR DELETE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- ROOMS TABLE
DROP POLICY IF EXISTS "Users can view rooms in their tenant" ON rooms;
CREATE POLICY "Users can view rooms in their tenant"
ON rooms FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can insert rooms in their tenant" ON rooms;
CREATE POLICY "Users can insert rooms in their tenant"
ON rooms FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

DROP POLICY IF EXISTS "Users can update rooms in their tenant" ON rooms;
CREATE POLICY "Users can update rooms in their tenant"
ON rooms FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
)
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

DROP POLICY IF EXISTS "Users can delete rooms in their tenant" ON rooms;
CREATE POLICY "Users can delete rooms in their tenant"
ON rooms FOR DELETE
TO authenticated
USING (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

-- ITEM_CATEGORIES TABLE
DROP POLICY IF EXISTS "Users can view categories in their tenant" ON item_categories;
CREATE POLICY "Users can view categories in their tenant"
ON item_categories FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert categories in their tenant" ON item_categories;
CREATE POLICY "Users can insert categories in their tenant"
ON item_categories FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can update categories in their tenant" ON item_categories;
CREATE POLICY "Users can update categories in their tenant"
ON item_categories FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
)
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete categories in their tenant" ON item_categories;
CREATE POLICY "Users can delete categories in their tenant"
ON item_categories FOR DELETE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- INVENTORY_TRANSACTIONS TABLE
DROP POLICY IF EXISTS "Users can view transactions in their tenant" ON inventory_transactions;
CREATE POLICY "Users can view transactions in their tenant"
ON inventory_transactions FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can insert transactions in their tenant" ON inventory_transactions;
CREATE POLICY "Users can insert transactions in their tenant"
ON inventory_transactions FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

-- LAUNDRY_BATCHES TABLE
DROP POLICY IF EXISTS "Users can view batches in their tenant" ON laundry_batches;
CREATE POLICY "Users can view batches in their tenant"
ON laundry_batches FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can insert batches in their tenant" ON laundry_batches;
CREATE POLICY "Users can insert batches in their tenant"
ON laundry_batches FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

DROP POLICY IF EXISTS "Users can update batches in their tenant" ON laundry_batches;
CREATE POLICY "Users can update batches in their tenant"
ON laundry_batches FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
)
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

-- MAINTENANCE_REQUESTS TABLE
DROP POLICY IF EXISTS "Users can view maintenance in their tenant" ON maintenance_requests;
CREATE POLICY "Users can view maintenance in their tenant"
ON maintenance_requests FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can insert maintenance in their tenant" ON maintenance_requests;
CREATE POLICY "Users can insert maintenance in their tenant"
ON maintenance_requests FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

DROP POLICY IF EXISTS "Users can update maintenance in their tenant" ON maintenance_requests;
CREATE POLICY "Users can update maintenance in their tenant"
ON maintenance_requests FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
)
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

-- VENDORS TABLE
DROP POLICY IF EXISTS "Users can view vendors in their tenant" ON vendors;
CREATE POLICY "Users can view vendors in their tenant"
ON vendors FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert vendors in their tenant" ON vendors;
CREATE POLICY "Users can insert vendors in their tenant"
ON vendors FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can update vendors in their tenant" ON vendors;
CREATE POLICY "Users can update vendors in their tenant"
ON vendors FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
)
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete vendors in their tenant" ON vendors;
CREATE POLICY "Users can delete vendors in their tenant"
ON vendors FOR DELETE
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- PURCHASE_ORDERS TABLE
DROP POLICY IF EXISTS "Users can view purchase orders in their tenant" ON purchase_orders;
CREATE POLICY "Users can view purchase orders in their tenant"
ON purchase_orders FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can insert purchase orders in their tenant" ON purchase_orders;
CREATE POLICY "Users can insert purchase orders in their tenant"
ON purchase_orders FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

DROP POLICY IF EXISTS "Users can update purchase orders in their tenant" ON purchase_orders;
CREATE POLICY "Users can update purchase orders in their tenant"
ON purchase_orders FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
)
WITH CHECK (
  is_super_admin() OR
  (hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

-- ACTIVITY_LOGS TABLE
DROP POLICY IF EXISTS "Users can view activity logs in their tenant" ON activity_logs;
CREATE POLICY "Users can view activity logs in their tenant"
ON activity_logs FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert activity logs in their tenant" ON activity_logs;
CREATE POLICY "Users can insert activity logs in their tenant"
ON activity_logs FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- SUBSCRIPTION_PLANS TABLE (super admin only modify)
DROP POLICY IF EXISTS "Anyone can view subscription plans" ON subscription_plans;
CREATE POLICY "Anyone can view subscription plans"
ON subscription_plans FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Only super admin can modify subscription plans" ON subscription_plans;
CREATE POLICY "Only super admin can modify subscription plans"
ON subscription_plans FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- PAYMENT_TRANSACTIONS TABLE
DROP POLICY IF EXISTS "Users can view their tenant's payment transactions" ON payment_transactions;
CREATE POLICY "Users can view their tenant's payment transactions"
ON payment_transactions FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

DROP POLICY IF EXISTS "System can insert payment transactions" ON payment_transactions;
CREATE POLICY "System can insert payment transactions"
ON payment_transactions FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

-- INVOICES TABLE
DROP POLICY IF EXISTS "Users can view their tenant's invoices" ON invoices;
CREATE POLICY "Users can view their tenant's invoices"
ON invoices FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

-- EMAIL_NOTIFICATIONS TABLE
DROP POLICY IF EXISTS "Users can view their tenant's email notifications" ON email_notifications;
CREATE POLICY "Users can view their tenant's email notifications"
ON email_notifications FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

-- TENANT_USAGE TABLE
DROP POLICY IF EXISTS "Users can view their tenant usage" ON tenant_usage;
CREATE POLICY "Users can view their tenant usage"
ON tenant_usage FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- STAFF_STATISTICS TABLE
DROP POLICY IF EXISTS "Users can view staff statistics in their tenant" ON staff_statistics;
CREATE POLICY "Users can view staff statistics in their tenant"
ON staff_statistics FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  user_id = auth.uid() OR
  hotel_id IN (SELECT id FROM hotels WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- PAYMENT_METHODS TABLE
DROP POLICY IF EXISTS "Users can view their tenant's payment methods" ON payment_methods;
CREATE POLICY "Users can view their tenant's payment methods"
ON payment_methods FOR SELECT
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

DROP POLICY IF EXISTS "Owners can manage payment methods" ON payment_methods;
CREATE POLICY "Owners can manage payment methods"
ON payment_methods FOR ALL
TO authenticated
USING (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
)
WITH CHECK (
  is_super_admin() OR
  (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND user_level_code = 'tenant_owner'))
);

-- PAYMENT_WEBHOOK_LOGS TABLE (super admin only)
DROP POLICY IF EXISTS "Only super admin can view webhook logs" ON payment_webhook_logs;
CREATE POLICY "Only super admin can view webhook logs"
ON payment_webhook_logs FOR SELECT
TO authenticated
USING (is_super_admin());

DROP POLICY IF EXISTS "System can insert webhook logs" ON payment_webhook_logs;
CREATE POLICY "System can insert webhook logs"
ON payment_webhook_logs FOR INSERT
TO authenticated
WITH CHECK (true); -- Allow service role to insert

-- =====================================================
-- FIX 2: UPDATE calculate_tenant_storage() FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tenant_storage(p_tenant_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_total_bytes BIGINT;
BEGIN
  -- Calculate total storage from item_images table
  SELECT COALESCE(SUM(file_size), 0)
  INTO v_total_bytes
  FROM item_images
  WHERE item_id IN (
    SELECT id FROM items WHERE tenant_id = p_tenant_id
  );
  
  RETURN v_total_bytes;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- FIX 3: UPDATE handle_successful_payment() FUNCTION
-- =====================================================

-- First, add dedicated columns to payment_transactions if they don't exist
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id),
ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly'));

-- Update the function to use these columns
CREATE OR REPLACE FUNCTION handle_successful_payment(
  p_transaction_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_transaction RECORD;
  v_new_period_end TIMESTAMPTZ;
BEGIN
  -- Get transaction details
  SELECT * INTO v_transaction FROM payment_transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  -- Validate required fields
  IF v_transaction.plan_id IS NULL THEN
    RAISE EXCEPTION 'Transaction missing plan_id: %', p_transaction_id;
  END IF;
  
  IF v_transaction.billing_cycle IS NULL THEN
    RAISE EXCEPTION 'Transaction missing billing_cycle: %', p_transaction_id;
  END IF;
  
  -- Calculate new period end
  IF v_transaction.billing_cycle = 'monthly' THEN
    v_new_period_end := now() + interval '1 month';
  ELSIF v_transaction.billing_cycle = 'yearly' THEN
    v_new_period_end := now() + interval '1 year';
  ELSE
    RAISE EXCEPTION 'Invalid billing_cycle: %', v_transaction.billing_cycle;
  END IF;
  
  -- Update tenant subscription
  UPDATE tenants
  SET
    subscription_status = 'active',
    subscription_plan_id = v_transaction.plan_id,
    subscription_current_period_start = now(),
    subscription_current_period_end = v_new_period_end,
    next_billing_date = v_new_period_end,
    grace_period_ends_at = NULL, -- Clear grace period
    billing_cycle = v_transaction.billing_cycle,
    updated_at = now()
  WHERE id = v_transaction.tenant_id;
  
  -- Send success email
  PERFORM queue_email_notification(
    v_transaction.tenant_id,
    NULL,
    (SELECT email FROM users WHERE tenant_id = v_transaction.tenant_id AND user_level_code = 'tenant_owner' AND deleted_at IS NULL LIMIT 1),
    'Payment Successful - Subscription Renewed',
    '<h2>Payment Successful</h2><p>Your subscription has been renewed successfully.</p>',
    'payment_successful',
    jsonb_build_object('amount', v_transaction.amount, 'next_billing_date', v_new_period_end)
  );
  
  -- Generate invoice
  INSERT INTO invoices (
    tenant_id,
    payment_transaction_id,
    subtotal,
    total,
    status,
    issue_date,
    due_date,
    paid_at,
    line_items
  ) VALUES (
    v_transaction.tenant_id,
    v_transaction.id,
    v_transaction.amount,
    v_transaction.amount,
    'paid',
    CURRENT_DATE,
    CURRENT_DATE,
    now(),
    jsonb_build_array(
      jsonb_build_object(
        'description', (SELECT name FROM subscription_plans WHERE id = v_transaction.plan_id) || ' - ' || v_transaction.billing_cycle,
        'amount', v_transaction.amount
      )
    )
  );
END;
$$ LANGUAGE plpgsql;