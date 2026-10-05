export interface PromotionalCode {
  id: string;
  code: string;
  description?: string;
  discount_type: 'percentage' | 'fixed_amount' | 'free_trial_extension' | 'free_months';
  discount_value: number;
  applicable_plans: string[];
  applicable_billing_cycles: string[];
  max_uses?: number;
  current_uses: number;
  times_used?: number; // For display/tracking
  max_uses_per_tenant: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PromoCodeUsage {
  id: string;
  promo_code_id: string;
  tenant_id: string;
  discount_applied: number;
  original_amount: number;
  final_amount: number;
  payment_transaction_id?: string;
  used_at: string;
  
  // Joined data
  promo_code?: PromotionalCode;
  tenants?: {
    name: string;
  };
  users?: {
    full_name: string;
    email: string;
  };
}

export interface PlanPriceHistory {
  id: string;
  plan_id: string;
  old_price_monthly?: number;
  new_price_monthly?: number;
  old_price_yearly?: number;
  new_price_yearly?: number;
  reason?: string;
  changed_by?: string;
  changed_at: string;
  
  // Joined data
  plan?: {
    id: string;
    name: string;
    code: string;
  };
  changed_by_admin?: {
    id: string;
    full_name: string;
  };
}

export interface RenewalReminder {
  id: string;
  tenant_id: string;
  reminder_type: '7_days' | '3_days' | '1_day' | 'expired' | 'grace_period_ending';
  scheduled_for: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  email_subject?: string;
  email_body?: string;
  error_message?: string;
  created_at: string;
  days_before_expiry?: number;
  
  // Joined data
  tenants?: {
    name: string;
    email?: string;
    subscription_end_date?: string;
  };
}

export interface MarketingCampaign {
  id: string;
  name: string;
  description?: string;
  campaign_type: 'price_promotion' | 'feature_launch' | 'seasonal_offer' | 'win_back' | 'upgrade_incentive';
  target_audience: 'all' | 'active' | 'trial' | 'cancelled' | 'specific_plans';
  target_plan_codes?: string[];
  promotional_code_id?: string;
  email_subject?: string;
  email_template?: string;
  banner_text?: string;
  cta_text?: string;
  cta_link?: string;
  starts_at: string;
  ends_at?: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
  sent_count?: number;
  opened_count?: number;
  clicked_count?: number;
  converted_count?: number;
  sent_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Joined data
  promotional_code?: PromotionalCode;
}

export interface CampaignEngagement {
  id: string;
  campaign_id: string;
  tenant_id: string;
  email_sent_at?: string;
  email_opened_at?: string;
  clicked_at?: string;
  converted_at?: string;
  conversion_value?: number;
  
  // Joined data
  tenant?: {
    id: string;
    name: string;
  };
}

export interface SuperAdminActivity {
  id: string;
  admin_user_id: string;
  action: string;
  entity_type: 'tenant' | 'plan' | 'promo_code' | 'campaign';
  entity_id?: string;
  description: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  created_at: string;
  
  // Joined data
  admin?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export interface SuperAdminDashboardStats {
  // Tenants
  total_tenants: number;
  active_tenants: number;
  trial_tenants: number;
  suspended_tenants: number;
  expiring_7_days: number;
  expiring_today: number;
  in_grace_period: number;
  
  // Revenue
  revenue_today: number;
  revenue_this_month: number;
  revenue_last_month: number;
  mrr: number;
  
  // Growth
  new_signups_today: number;
  new_signups_this_month: number;
  churned_this_month: number;
  
  // Campaigns
  active_campaigns: number;
  active_promo_codes: number;
  
  // Actions
  pending_renewal_reminders: number;
}
