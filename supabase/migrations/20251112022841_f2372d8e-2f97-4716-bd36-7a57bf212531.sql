-- =====================================================
-- PROMOTIONAL CODES & DISCOUNTS
-- =====================================================

CREATE TABLE promotional_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  
  -- Discount type
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_trial_extension', 'free_months')),
  discount_value NUMERIC(10,2) NOT NULL,
  
  -- Applicable plans
  applicable_plans TEXT[] DEFAULT ARRAY['all'],
  applicable_billing_cycles TEXT[] DEFAULT ARRAY['monthly', 'yearly'],
  
  -- Usage limits
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  max_uses_per_tenant INTEGER DEFAULT 1,
  
  -- Validity
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_promo_codes_code ON promotional_codes(code) WHERE is_active = true;
CREATE INDEX idx_promo_codes_validity ON promotional_codes(valid_from, valid_until);

-- Enable RLS
ALTER TABLE promotional_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage promo codes"
  ON promotional_codes
  FOR ALL
  USING (is_super_admin());

CREATE POLICY "Authenticated users can view active promo codes"
  ON promotional_codes
  FOR SELECT
  USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));

-- Track promo code usage
CREATE TABLE promo_code_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promotional_codes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  discount_applied NUMERIC(10,2) NOT NULL,
  original_amount NUMERIC(10,2) NOT NULL,
  final_amount NUMERIC(10,2) NOT NULL,
  
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  
  used_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_tenant_promo_usage UNIQUE (promo_code_id, tenant_id)
);

CREATE INDEX idx_promo_usage_tenant ON promo_code_usage(tenant_id);
CREATE INDEX idx_promo_usage_code ON promo_code_usage(promo_code_id);

-- Enable RLS
ALTER TABLE promo_code_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can view all promo usage"
  ON promo_code_usage
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Tenants can view their own promo usage"
  ON promo_code_usage
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "System can insert promo usage"
  ON promo_code_usage
  FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- PRICING PLAN HISTORY
-- =====================================================

CREATE TABLE plan_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  
  old_price_monthly NUMERIC(10,2),
  new_price_monthly NUMERIC(10,2),
  old_price_yearly NUMERIC(10,2),
  new_price_yearly NUMERIC(10,2),
  
  reason TEXT,
  
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_price_history_plan ON plan_price_history(plan_id);

-- Enable RLS
ALTER TABLE plan_price_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage price history"
  ON plan_price_history
  FOR ALL
  USING (is_super_admin());

CREATE POLICY "Authenticated users can view price history"
  ON plan_price_history
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================
-- RENEWAL REMINDERS
-- =====================================================

CREATE TABLE renewal_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('7_days', '3_days', '1_day', 'expired', 'grace_period_ending')),
  
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  
  email_subject TEXT,
  email_body TEXT,
  
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reminders_pending ON renewal_reminders(status, scheduled_for) 
  WHERE status = 'pending';
CREATE INDEX idx_reminders_tenant ON renewal_reminders(tenant_id);

-- Enable RLS
ALTER TABLE renewal_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage renewal reminders"
  ON renewal_reminders
  FOR ALL
  USING (is_super_admin());

CREATE POLICY "Tenant owners can view their reminders"
  ON renewal_reminders
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =====================================================
-- MARKETING CAMPAIGNS
-- =====================================================

CREATE TABLE marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('price_promotion', 'feature_launch', 'seasonal_offer', 'win_back', 'upgrade_incentive')),
  
  -- Targeting
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'active', 'trial', 'cancelled', 'specific_plans')),
  target_plan_codes TEXT[],
  
  -- Campaign details
  promotional_code_id UUID REFERENCES promotional_codes(id),
  
  -- Messaging
  email_subject TEXT,
  email_template TEXT,
  banner_text TEXT,
  cta_text TEXT,
  cta_link TEXT,
  
  -- Scheduling
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
  
  -- Analytics
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX idx_campaigns_dates ON marketing_campaigns(starts_at, ends_at);

-- Enable RLS
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage campaigns"
  ON marketing_campaigns
  FOR ALL
  USING (is_super_admin());

CREATE POLICY "Active campaigns are viewable by authenticated users"
  ON marketing_campaigns
  FOR SELECT
  USING (
    status = 'active' 
    AND starts_at <= now() 
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Track campaign engagement
CREATE TABLE campaign_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  email_sent_at TIMESTAMPTZ,
  email_opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  
  conversion_value NUMERIC(10,2),
  
  CONSTRAINT unique_campaign_tenant UNIQUE (campaign_id, tenant_id)
);

CREATE INDEX idx_engagement_campaign ON campaign_engagement(campaign_id);
CREATE INDEX idx_engagement_converted ON campaign_engagement(campaign_id) 
  WHERE converted_at IS NOT NULL;

-- Enable RLS
ALTER TABLE campaign_engagement ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can view all engagement"
  ON campaign_engagement
  FOR ALL
  USING (is_super_admin());

CREATE POLICY "Tenants can view their own engagement"
  ON campaign_engagement
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =====================================================
-- SUPER ADMIN ACTIVITY LOG
-- =====================================================

CREATE TABLE super_admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id),
  
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  
  description TEXT NOT NULL,
  
  old_values JSONB,
  new_values JSONB,
  
  ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_activity_user ON super_admin_activity_log(admin_user_id);
CREATE INDEX idx_admin_activity_entity ON super_admin_activity_log(entity_type, entity_id);
CREATE INDEX idx_admin_activity_date ON super_admin_activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE super_admin_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage activity log"
  ON super_admin_activity_log
  FOR ALL
  USING (is_super_admin());

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Schedule renewal reminders
CREATE OR REPLACE FUNCTION schedule_renewal_reminders()
RETURNS VOID AS $$
DECLARE
  v_tenant RECORD;
  v_days_until_expiry INTEGER;
BEGIN
  FOR v_tenant IN
    SELECT 
      t.id,
      t.name,
      t.subscription_current_period_end,
      u.email,
      u.full_name
    FROM tenants t
    JOIN users u ON t.id = u.tenant_id 
      AND u.user_level_code = 'tenant_owner' 
      AND u.is_primary_owner = true
    WHERE t.subscription_status IN ('active', 'trial')
      AND t.subscription_current_period_end IS NOT NULL
      AND t.subscription_current_period_end > now()
      AND t.subscription_current_period_end <= now() + interval '7 days'
      AND t.id != '00000000-0000-0000-0000-000000000000'
  LOOP
    v_days_until_expiry := EXTRACT(DAY FROM v_tenant.subscription_current_period_end - now());
    
    IF v_days_until_expiry = 7 THEN
      INSERT INTO renewal_reminders (tenant_id, reminder_type, scheduled_for, email_subject, email_body)
      VALUES (
        v_tenant.id, '7_days', now(),
        'Đăng ký của bạn sẽ hết hạn sau 7 ngày',
        format('Xin chào %s, đăng ký cho %s sẽ hết hạn vào %s.',
          v_tenant.full_name, v_tenant.name,
          TO_CHAR(v_tenant.subscription_current_period_end, 'DD/MM/YYYY'))
      ) ON CONFLICT DO NOTHING;
    ELSIF v_days_until_expiry = 3 THEN
      INSERT INTO renewal_reminders (tenant_id, reminder_type, scheduled_for, email_subject, email_body)
      VALUES (
        v_tenant.id, '3_days', now(),
        'QUAN TRỌNG: Đăng ký hết hạn sau 3 ngày',
        format('Xin chào %s, chỉ còn 3 ngày trước khi đăng ký hết hạn.', v_tenant.full_name)
      ) ON CONFLICT DO NOTHING;
    ELSIF v_days_until_expiry = 1 THEN
      INSERT INTO renewal_reminders (tenant_id, reminder_type, scheduled_for, email_subject, email_body)
      VALUES (
        v_tenant.id, '1_day', now(),
        'THÔNG BÁO CUỐI: Hết hạn vào ngày mai',
        format('Xin chào %s, đây là thông báo cuối. Đăng ký hết hạn vào ngày mai.', v_tenant.full_name)
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function: Apply promotional code
CREATE OR REPLACE FUNCTION apply_promo_code(
  p_tenant_id UUID,
  p_promo_code TEXT,
  p_original_amount NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_promo RECORD;
  v_discount NUMERIC;
  v_final_amount NUMERIC;
  v_usage_count INTEGER;
BEGIN
  SELECT * INTO v_promo
  FROM promotional_codes
  WHERE code = p_promo_code
    AND is_active = true
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now());
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Mã khuyến mãi không hợp lệ hoặc đã hết hạn');
  END IF;
  
  IF v_promo.max_uses IS NOT NULL AND v_promo.current_uses >= v_promo.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Mã khuyến mãi đã hết lượt sử dụng');
  END IF;
  
  SELECT COUNT(*) INTO v_usage_count
  FROM promo_code_usage
  WHERE promo_code_id = v_promo.id AND tenant_id = p_tenant_id;
  
  IF v_usage_count >= v_promo.max_uses_per_tenant THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Bạn đã sử dụng mã này rồi');
  END IF;
  
  IF v_promo.discount_type = 'percentage' THEN
    v_discount := p_original_amount * (v_promo.discount_value / 100.0);
  ELSIF v_promo.discount_type = 'fixed_amount' THEN
    v_discount := v_promo.discount_value;
  ELSE
    v_discount := 0;
  END IF;
  
  v_final_amount := GREATEST(p_original_amount - v_discount, 0);
  
  RETURN jsonb_build_object(
    'valid', true,
    'promo_code_id', v_promo.id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'discount_amount', v_discount,
    'original_amount', p_original_amount,
    'final_amount', v_final_amount
  );
END;
$$ LANGUAGE plpgsql;

-- Update Super Admin dashboard stats
CREATE OR REPLACE FUNCTION get_super_admin_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_tenants', (SELECT COUNT(*) FROM tenants WHERE id != '00000000-0000-0000-0000-000000000000'),
    'active_tenants', (SELECT COUNT(*) FROM tenants WHERE subscription_status = 'active'),
    'trial_tenants', (SELECT COUNT(*) FROM tenants WHERE subscription_status = 'trial'),
    'suspended_tenants', (SELECT COUNT(*) FROM tenants WHERE subscription_status = 'suspended'),
    'expiring_7_days', (
      SELECT COUNT(*) FROM tenants
      WHERE subscription_status = 'active'
        AND subscription_current_period_end BETWEEN now() AND now() + interval '7 days'
    ),
    'expiring_today', (
      SELECT COUNT(*) FROM tenants
      WHERE subscription_status = 'active'
        AND DATE(subscription_current_period_end) = CURRENT_DATE
    ),
    'in_grace_period', (
      SELECT COUNT(*) FROM tenants
      WHERE subscription_status = 'past_due'
        AND grace_period_ends_at > now()
    ),
    'revenue_today', (
      SELECT COALESCE(SUM(amount), 0) FROM payment_transactions
      WHERE status = 'completed' AND DATE(paid_at) = CURRENT_DATE
    ),
    'revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0) FROM payment_transactions
      WHERE status = 'completed'
        AND paid_at >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    'revenue_last_month', (
      SELECT COALESCE(SUM(amount), 0) FROM payment_transactions
      WHERE status = 'completed'
        AND paid_at >= DATE_TRUNC('month', CURRENT_DATE - interval '1 month')
        AND paid_at < DATE_TRUNC('month', CURRENT_DATE)
    ),
    'mrr', (
      SELECT COALESCE(SUM(
        CASE 
          WHEN t.billing_cycle = 'monthly' THEN sp.price_monthly
          WHEN t.billing_cycle = 'yearly' THEN sp.price_yearly / 12.0
          ELSE 0
        END
      ), 0)
      FROM tenants t
      JOIN subscription_plans sp ON t.subscription_plan_id = sp.id
      WHERE t.subscription_status = 'active'
    ),
    'new_signups_today', (
      SELECT COUNT(*) FROM tenants
      WHERE DATE(created_at) = CURRENT_DATE
        AND id != '00000000-0000-0000-0000-000000000000'
    ),
    'new_signups_this_month', (
      SELECT COUNT(*) FROM tenants
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND id != '00000000-0000-0000-0000-000000000000'
    ),
    'churned_this_month', (
      SELECT COUNT(*) FROM tenants
      WHERE cancelled_at >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    'active_campaigns', (
      SELECT COUNT(*) FROM marketing_campaigns
      WHERE status = 'active'
        AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
    ),
    'active_promo_codes', (
      SELECT COUNT(*) FROM promotional_codes
      WHERE is_active = true
        AND (valid_until IS NULL OR valid_until > now())
    ),
    'pending_renewal_reminders', (
      SELECT COUNT(*) FROM renewal_reminders
      WHERE status = 'pending' AND scheduled_for <= now()
    )
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$ LANGUAGE plpgsql STABLE;