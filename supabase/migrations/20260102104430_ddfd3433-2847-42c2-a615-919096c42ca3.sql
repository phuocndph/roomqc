-- Fix the get_super_admin_dashboard_stats function to use correct column names
CREATE OR REPLACE FUNCTION public.get_super_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ),
    'revenue_today', (
      SELECT COALESCE(SUM(amount), 0) FROM payment_transactions
      WHERE payment_status = 'completed' AND DATE(payment_date) = CURRENT_DATE
    ),
    'revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0) FROM payment_transactions
      WHERE payment_status = 'completed'
        AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    'revenue_last_month', (
      SELECT COALESCE(SUM(amount), 0) FROM payment_transactions
      WHERE payment_status = 'completed'
        AND payment_date >= DATE_TRUNC('month', CURRENT_DATE - interval '1 month')
        AND payment_date < DATE_TRUNC('month', CURRENT_DATE)
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
      WHERE subscription_status IN ('cancelled', 'suspended')
        AND updated_at >= DATE_TRUNC('month', CURRENT_DATE)
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
$$;