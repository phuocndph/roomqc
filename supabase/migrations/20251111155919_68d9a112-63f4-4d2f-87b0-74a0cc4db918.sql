-- =====================================================
-- CRITICAL FIXES FOR USER MANAGEMENT & SUBSCRIPTIONS
-- =====================================================

-- =====================================================
-- 1. FIX: SUPER ADMIN TENANT
-- =====================================================

-- Create system tenant for Super Admin
INSERT INTO tenants (id, name, email, phone, subscription_plan_id, subscription_status, settings)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'SYSTEM_ADMIN',
  'system@admin.local',
  '',
  (SELECT id FROM subscription_plans WHERE code = 'enterprise' LIMIT 1),
  'active',
  '{"is_system_tenant": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  settings = EXCLUDED.settings;

-- Update users table to link super admins to system tenant
UPDATE users
SET tenant_id = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = users.id 
    AND user_roles.role = 'super_admin'
  );

-- Function: Check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  );
END;
$$;

-- =====================================================
-- 2. FIX: PRIMARY OWNER FLAG
-- =====================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_primary_owner BOOLEAN DEFAULT false;

-- Mark existing primary owners (first tenant_owner per tenant)
UPDATE users u1
SET is_primary_owner = true
WHERE user_level_code = 'tenant_owner'
  AND NOT EXISTS (
    SELECT 1 FROM users u2
    WHERE u2.tenant_id = u1.tenant_id
      AND u2.user_level_code = 'tenant_owner'
      AND u2.is_primary_owner = true
      AND u2.id != u1.id
  )
  AND u1.created_at = (
    SELECT MIN(created_at) 
    FROM users u3 
    WHERE u3.tenant_id = u1.tenant_id 
      AND u3.user_level_code = 'tenant_owner'
  );

-- Function: Mark primary owner on insert
CREATE OR REPLACE FUNCTION mark_primary_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_level_code = 'tenant_owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
      WHERE tenant_id = NEW.tenant_id
        AND user_level_code = 'tenant_owner'
        AND is_primary_owner = true
        AND id != NEW.id
    ) THEN
      NEW.is_primary_owner := true;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_primary_owner ON users;
CREATE TRIGGER trg_mark_primary_owner
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION mark_primary_owner();

-- =====================================================
-- 3. FIX: USER HIERARCHY & OWNERSHIP
-- =====================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
CREATE INDEX IF NOT EXISTS idx_users_reports_to ON users(reports_to);

-- Function: Check if user A can manage user B
CREATE OR REPLACE FUNCTION can_manage_user(p_manager_id UUID, p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager_level INTEGER;
  v_target_level INTEGER;
BEGIN
  -- Get hierarchy levels
  SELECT ul.hierarchy_level INTO v_manager_level
  FROM users u
  JOIN user_levels ul ON u.user_level_code = ul.code
  WHERE u.id = p_manager_id;
  
  SELECT ul.hierarchy_level INTO v_target_level
  FROM users u
  JOIN user_levels ul ON u.user_level_code = ul.code
  WHERE u.id = p_target_user_id;
  
  -- Manager can only manage users with HIGHER hierarchy_level (lower privilege)
  IF v_manager_level >= v_target_level THEN
    RETURN false;
  END IF;
  
  -- Check if target was created by manager
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_target_user_id
      AND created_by = p_manager_id
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if manager is Owner
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = p_manager_id
      AND user_level_code = 'tenant_owner'
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- =====================================================
-- 4. FIX: GRACE PERIOD & AUTO-SUSPEND
-- =====================================================

-- Function: Process expired subscriptions
CREATE OR REPLACE FUNCTION process_expired_subscriptions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN
    SELECT 
      t.id,
      t.name,
      t.subscription_current_period_end,
      t.grace_period_ends_at
    FROM tenants t
    WHERE t.subscription_status = 'active'
      AND t.subscription_current_period_end < now()
  LOOP
    -- Set grace period if not set
    IF v_tenant.grace_period_ends_at IS NULL THEN
      UPDATE tenants
      SET 
        subscription_status = 'past_due',
        grace_period_ends_at = v_tenant.subscription_current_period_end + interval '7 days'
      WHERE id = v_tenant.id;
      
      -- Queue notification
      PERFORM queue_email_notification(
        v_tenant.id,
        NULL,
        (SELECT email FROM users WHERE tenant_id = v_tenant.id AND user_level_code = 'tenant_owner' LIMIT 1),
        'Gói dịch vụ đã hết hạn - Thời gian gia hạn 7 ngày',
        '<h2>Gói dịch vụ đã hết hạn</h2><p>Bạn có 7 ngày để gia hạn trước khi tài khoản bị tạm ngưng.</p>',
        'subscription_expired_grace_period',
        NULL
      );
      
    ELSIF v_tenant.grace_period_ends_at < now() THEN
      UPDATE tenants
      SET subscription_status = 'suspended'
      WHERE id = v_tenant.id;
      
      PERFORM queue_email_notification(
        v_tenant.id,
        NULL,
        (SELECT email FROM users WHERE tenant_id = v_tenant.id AND user_level_code = 'tenant_owner' LIMIT 1),
        'Tài khoản đã bị tạm ngưng',
        '<h2>Tài khoản bị tạm ngưng</h2><p>Tài khoản của bạn đã bị tạm ngưng do chưa thanh toán. Vui lòng gia hạn để khôi phục quyền truy cập.</p>',
        'account_suspended',
        NULL
      );
    END IF;
  END LOOP;
END;
$$;

-- =====================================================
-- 5. FIX: PLAN CHANGE VALIDATION
-- =====================================================

CREATE OR REPLACE FUNCTION validate_plan_change(
  p_tenant_id UUID,
  p_new_plan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_current_usage RECORD;
  v_new_plan RECORD;
  v_warnings JSONB := '[]'::jsonb;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_current_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  SELECT * INTO v_new_plan FROM subscription_plans WHERE id = p_new_plan_id;
  
  -- Check hotels limit
  IF v_new_plan.max_hotels IS NOT NULL AND v_current_usage.current_hotels_count > v_new_plan.max_hotels THEN
    v_blockers := v_blockers || jsonb_build_object(
      'resource', 'hotels',
      'current', v_current_usage.current_hotels_count,
      'limit', v_new_plan.max_hotels,
      'message', format('Bạn có %s khách sạn nhưng gói mới chỉ cho phép %s. Vui lòng xóa %s khách sạn trước.',
        v_current_usage.current_hotels_count,
        v_new_plan.max_hotels,
        v_current_usage.current_hotels_count - v_new_plan.max_hotels
      )
    );
  END IF;
  
  -- Check users limit
  IF v_new_plan.max_users IS NOT NULL AND v_current_usage.current_users_count > v_new_plan.max_users THEN
    v_blockers := v_blockers || jsonb_build_object(
      'resource', 'users',
      'current', v_current_usage.current_users_count,
      'limit', v_new_plan.max_users,
      'message', format('Bạn có %s người dùng nhưng gói mới chỉ cho phép %s. Vui lòng xóa %s người dùng trước.',
        v_current_usage.current_users_count,
        v_new_plan.max_users,
        v_current_usage.current_users_count - v_new_plan.max_users
      )
    );
  END IF;
  
  -- Check storage limit
  IF v_new_plan.max_storage_gb IS NOT NULL AND (v_current_usage.current_storage_bytes / 1073741824.0) > v_new_plan.max_storage_gb THEN
    v_warnings := v_warnings || jsonb_build_object(
      'resource', 'storage',
      'current_gb', ROUND((v_current_usage.current_storage_bytes / 1073741824.0)::numeric, 2),
      'limit_gb', v_new_plan.max_storage_gb,
      'message', format('Bạn đang dùng %.2f GB nhưng gói mới chỉ cho phép %s GB. Vui lòng xóa tệp để tiếp tục.',
        v_current_usage.current_storage_bytes / 1073741824.0,
        v_new_plan.max_storage_gb
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'can_change', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings
  );
END;
$$;

-- =====================================================
-- 6. FIX: PAYMENT GATEWAY INTEGRATION
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  gateway TEXT NOT NULL,
  gateway_payment_method_id TEXT NOT NULL,
  
  type TEXT NOT NULL CHECK (type IN ('card', 'bank_account', 'paypal')),
  
  card_brand TEXT,
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  
  billing_name TEXT,
  billing_email TEXT,
  billing_address JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_gateway_payment_method UNIQUE (gateway, gateway_payment_method_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant_id ON payment_methods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(tenant_id, is_default) WHERE is_default = true;

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant owners can view payment methods" ON payment_methods;
CREATE POLICY "Tenant owners can view payment methods"
ON payment_methods FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_user_level(auth.uid(), 'tenant_owner') 
    OR is_level_higher_or_equal(auth.uid(), 'tenant_owner')
  )
);

DROP POLICY IF EXISTS "Tenant owners can manage payment methods" ON payment_methods;
CREATE POLICY "Tenant owners can manage payment methods"
ON payment_methods FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_user_level(auth.uid(), 'tenant_owner') 
    OR is_level_higher_or_equal(auth.uid(), 'tenant_owner')
  )
);

CREATE TABLE IF NOT EXISTS payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  gateway TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  
  payload JSONB NOT NULL,
  
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_gateway ON payment_webhook_logs(gateway);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON payment_webhook_logs(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON payment_webhook_logs(created_at DESC);

-- Function: Handle successful payment
CREATE OR REPLACE FUNCTION handle_successful_payment(p_transaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_new_period_end TIMESTAMPTZ;
  v_plan_name TEXT;
BEGIN
  SELECT * INTO v_transaction FROM payment_transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  -- Calculate new period end based on billing cycle
  IF v_transaction.metadata->>'billing_cycle' = 'monthly' THEN
    v_new_period_end := now() + interval '1 month';
  ELSIF v_transaction.metadata->>'billing_cycle' = 'yearly' THEN
    v_new_period_end := now() + interval '1 year';
  ELSE
    v_new_period_end := now() + interval '1 month';
  END IF;
  
  -- Get plan name
  SELECT name INTO v_plan_name 
  FROM subscription_plans 
  WHERE id = (v_transaction.metadata->>'plan_id')::uuid;
  
  -- Update tenant subscription
  UPDATE tenants
  SET
    subscription_status = 'active',
    subscription_plan_id = (v_transaction.metadata->>'plan_id')::uuid,
    subscription_current_period_start = now(),
    subscription_current_period_end = v_new_period_end,
    next_billing_date = v_new_period_end,
    grace_period_ends_at = NULL,
    updated_at = now()
  WHERE id = v_transaction.tenant_id;
  
  -- Queue success email
  PERFORM queue_email_notification(
    v_transaction.tenant_id,
    NULL,
    (SELECT email FROM users WHERE tenant_id = v_transaction.tenant_id AND user_level_code = 'tenant_owner' LIMIT 1),
    'Thanh toán thành công - Đã gia hạn gói dịch vụ',
    '<h2>Thanh toán thành công</h2><p>Gói dịch vụ của bạn đã được gia hạn thành công.</p>',
    'payment_successful',
    jsonb_build_object('amount', v_transaction.amount, 'next_billing_date', v_new_period_end)
  );
  
  -- Generate invoice
  INSERT INTO invoices (
    tenant_id,
    subscription_plan_id,
    invoice_date,
    due_date,
    period_start,
    period_end,
    subtotal,
    tax_amount,
    total_amount,
    status,
    paid_at,
    items
  ) VALUES (
    v_transaction.tenant_id,
    (v_transaction.metadata->>'plan_id')::uuid,
    CURRENT_DATE,
    CURRENT_DATE,
    now(),
    v_new_period_end,
    v_transaction.amount,
    0,
    v_transaction.amount,
    'paid',
    now(),
    jsonb_build_array(
      jsonb_build_object(
        'description', v_plan_name || ' - ' || COALESCE(v_transaction.metadata->>'billing_cycle', 'monthly'),
        'amount', v_transaction.amount
      )
    )
  );
END;
$$;

-- =====================================================
-- 7. FIX: AUTO-UPDATE STAFF STATISTICS
-- =====================================================

CREATE OR REPLACE FUNCTION increment_staff_stat(
  p_user_id UUID,
  p_hotel_id UUID,
  p_stat_type TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_period_end DATE := (DATE_TRUNC('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::DATE;
BEGIN
  INSERT INTO staff_statistics (
    user_id,
    hotel_id,
    period_start,
    period_end,
    laundry_batches_processed,
    maintenance_tasks_completed,
    items_checked
  ) VALUES (
    p_user_id,
    p_hotel_id,
    v_period_start,
    v_period_end,
    CASE WHEN p_stat_type = 'laundry' THEN p_increment ELSE 0 END,
    CASE WHEN p_stat_type = 'maintenance' THEN p_increment ELSE 0 END,
    CASE WHEN p_stat_type = 'items' THEN p_increment ELSE 0 END
  )
  ON CONFLICT (user_id, hotel_id, period_start, period_end) DO UPDATE SET
    laundry_batches_processed = staff_statistics.laundry_batches_processed + 
      (CASE WHEN p_stat_type = 'laundry' THEN p_increment ELSE 0 END),
    maintenance_tasks_completed = staff_statistics.maintenance_tasks_completed + 
      (CASE WHEN p_stat_type = 'maintenance' THEN p_increment ELSE 0 END),
    items_checked = staff_statistics.items_checked + 
      (CASE WHEN p_stat_type = 'items' THEN p_increment ELSE 0 END),
    last_calculated_at = now();
END;
$$;

-- Trigger for laundry batches
CREATE OR REPLACE FUNCTION trigger_update_laundry_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS NULL OR OLD.status != 'received') THEN
    IF NEW.delivery_staff_id IS NOT NULL THEN
      PERFORM increment_staff_stat(NEW.delivery_staff_id, NEW.hotel_id, 'laundry', 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_laundry_stats ON laundry_batches;
CREATE TRIGGER trg_update_laundry_stats
  AFTER UPDATE ON laundry_batches
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_laundry_stats();

-- Trigger for maintenance requests
CREATE OR REPLACE FUNCTION trigger_update_maintenance_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM increment_staff_stat(NEW.assigned_to, NEW.hotel_id, 'maintenance', 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_maintenance_stats ON maintenance_requests;
CREATE TRIGGER trg_update_maintenance_stats
  AFTER UPDATE ON maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_maintenance_stats();

-- =====================================================
-- 8. SUPER ADMIN DASHBOARD STATS
-- =====================================================

CREATE OR REPLACE FUNCTION get_super_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_tenants', (
      SELECT COUNT(*) FROM tenants 
      WHERE id != '00000000-0000-0000-0000-000000000000'
    ),
    'active_tenants', (
      SELECT COUNT(*) FROM tenants 
      WHERE subscription_status = 'active'
        AND id != '00000000-0000-0000-0000-000000000000'
    ),
    'trial_tenants', (
      SELECT COUNT(*) FROM tenants 
      WHERE subscription_status = 'trial'
    ),
    'suspended_tenants', (
      SELECT COUNT(*) FROM tenants 
      WHERE subscription_status = 'suspended'
    ),
    'expiring_soon', (
      SELECT COUNT(*) FROM tenants
      WHERE subscription_status = 'active'
        AND subscription_current_period_end BETWEEN now() AND now() + interval '7 days'
    ),
    'total_revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM payment_transactions
      WHERE payment_status = 'completed'
        AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    'total_revenue_last_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM payment_transactions
      WHERE payment_status = 'completed'
        AND payment_date >= DATE_TRUNC('month', CURRENT_DATE - interval '1 month')
        AND payment_date < DATE_TRUNC('month', CURRENT_DATE)
    ),
    'new_signups_this_month', (
      SELECT COUNT(*) FROM tenants
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND id != '00000000-0000-0000-0000-000000000000'
    ),
    'total_users', (
      SELECT COUNT(*) FROM users 
      WHERE tenant_id != '00000000-0000-0000-0000-000000000000'
    ),
    'total_hotels', (
      SELECT COUNT(*) FROM hotels WHERE status = 'active'
    )
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$;

-- =====================================================
-- 9. TENANT BILLING SUMMARY
-- =====================================================

CREATE OR REPLACE FUNCTION get_tenant_billing_summary(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_summary JSONB;
  v_tenant RECORD;
  v_plan RECORD;
  v_usage RECORD;
BEGIN
  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_tenant.subscription_plan_id;
  SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  
  SELECT jsonb_build_object(
    'current_plan', jsonb_build_object(
      'name', v_plan.name,
      'price_monthly', v_plan.price_monthly,
      'price_yearly', v_plan.price_yearly,
      'billing_cycle', v_tenant.billing_cycle
    ),
    'subscription', jsonb_build_object(
      'status', v_tenant.subscription_status,
      'current_period_start', v_tenant.subscription_current_period_start,
      'current_period_end', v_tenant.subscription_current_period_end,
      'next_billing_date', v_tenant.next_billing_date,
      'days_until_renewal', EXTRACT(DAY FROM v_tenant.subscription_current_period_end - now()),
      'auto_renew', v_tenant.auto_renew
    ),
    'usage', jsonb_build_object(
      'hotels', jsonb_build_object('current', v_usage.current_hotels_count, 'limit', v_plan.max_hotels),
      'users', jsonb_build_object('current', v_usage.current_users_count, 'limit', v_plan.max_users),
      'rooms', jsonb_build_object('current', v_usage.current_rooms_count, 'limit', v_plan.max_rooms),
      'items', jsonb_build_object('current', v_usage.current_items_count, 'limit', v_plan.max_items),
      'storage_gb', jsonb_build_object(
        'current', ROUND((v_usage.current_storage_bytes / 1073741824.0)::numeric, 2),
        'limit', v_plan.max_storage_gb
      )
    ),
    'recent_payments', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount', amount,
          'payment_status', payment_status,
          'payment_date', payment_date
        )
        ORDER BY payment_date DESC
      )
      FROM payment_transactions
      WHERE tenant_id = p_tenant_id
      LIMIT 10
    )
  ) INTO v_summary;
  
  RETURN v_summary;
END;
$$;