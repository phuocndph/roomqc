// =====================================================
// PUSH NOTIFICATIONS
// =====================================================

export interface PushSubscription {
  id: string;
  tenant_id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  device_name?: string;
  user_agent?: string;
  is_active: boolean;
  failed_count: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PushNotificationPayload {
  user_id?: string;
  user_ids?: string[];
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  action_url?: string;
  data?: Record<string, any>;
}

export type InAppNotificationType = 
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'inventory'
  | 'maintenance'
  | 'laundry'
  | 'system';

export interface InAppNotification {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  body: string;
  type: InAppNotificationType;
  action_url?: string;
  icon?: string;
  is_read: boolean;
  read_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// =====================================================
// EMAIL NOTIFICATIONS
// =====================================================

export type EmailNotificationType =
  | 'subscription_expiring'
  | 'subscription_expired'
  | 'trial_ending'
  | 'trial_ended'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'quota_warning'
  | 'quota_exceeded'
  | 'welcome'
  | 'password_reset'
  | 'account_locked';

export interface EmailNotification {
  id: string;
  tenant_id?: string;
  user_id?: string;
  
  notification_type: EmailNotificationType;
  
  to_email: string;
  to_name?: string;
  
  subject: string;
  
  template_data: Record<string, any>;
  
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'bounced';
  
  sent_at?: string;
  failed_at?: string;
  failure_reason?: string;
  
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  
  provider: 'resend' | 'sendgrid' | 'ses';
  provider_message_id?: string;
  
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  type: EmailNotificationType;
  subject: string;
  previewText: string;
}

// Template data interfaces
export interface SubscriptionExpiringData {
  tenant_name: string;
  plan_name: string;
  expires_at: string;
  days_remaining: number;
  renewal_url: string;
}

export interface PaymentSucceededData {
  tenant_name: string;
  amount: number;
  currency: string;
  plan_name: string;
  next_billing_date: string;
  invoice_url?: string;
  receipt_url?: string;
}

export interface PaymentFailedData {
  tenant_name: string;
  amount: number;
  currency: string;
  plan_name: string;
  failure_reason: string;
  retry_date?: string;
  update_payment_url: string;
}

export interface QuotaWarningData {
  tenant_name: string;
  resource_type: string;
  current_usage: number;
  limit: number;
  percentage: number;
  upgrade_url: string;
}

export interface QuotaExceededData {
  tenant_name: string;
  resource_type: string;
  current_usage: number;
  limit: number;
  action_required: string;
  upgrade_url: string;
}
