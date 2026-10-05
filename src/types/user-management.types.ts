// =====================================================
// USER LEVELS & PERMISSIONS
// =====================================================

export type UserLevelCode = 'super_admin' | 'tenant_owner' | 'manager' | 'department_manager' | 'staff';

export interface UserLevel {
  id: string;
  code: UserLevelCode;
  name: string;
  hierarchy_level: number; // 1=Super, 2=Owner, 3=Manager, 4=Staff
  description?: string;
  created_at: string;
}

export interface Permission {
  id: string;
  code: string; // 'items.view', 'rooms.create', etc.
  name: string;
  description?: string;
  module: string; // 'items', 'rooms', 'laundry', 'maintenance'
  category?: string; // 'management', 'operations', 'reporting', 'administration'
  action: 'view' | 'create' | 'update' | 'delete' | 'export' | 'approve' | 'manage';
  is_system: boolean;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  level: 'tenant' | 'hotel';
  created_at: string;
  updated_at: string;
  
  // Joined data
  permissions?: Permission[];
  permission_codes?: string[]; // Array of permission codes for easy checking
}

export interface User {
  id: string;
  tenant_id: string | null; // NULL for super admin
  role_id?: string; // Tenant-level role
  user_level_code: UserLevelCode;
  is_super_admin: boolean;
  is_primary_owner: boolean;
  
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  phone_verified: boolean;
  
  status: 'active' | 'inactive' | 'suspended';
  
  last_login_at?: string;
  last_login_ip?: string;
  login_count: number;
  
  must_change_password: boolean;
  account_locked: boolean;
  locked_reason?: string;
  
  created_by?: string; // User ID who created this user
  reports_to?: string; // Manager this user reports to
  
  created_at: string;
  updated_at: string;
  deactivated_at?: string;
  deleted_at?: string;
  
  notes?: string; // Internal notes (super admin only)
  
  // Joined data
  tenant?: Tenant;
  role?: Role;
  hotel_assignments?: UserHotel[];
  created_by_user?: Pick<User, 'id' | 'full_name' | 'email'>;
  reports_to_user?: Pick<User, 'id' | 'full_name' | 'email'>;
}

export interface UserHotel {
  id: string;
  user_id: string;
  hotel_id: string;
  hotel_role_id?: string;
  
  departments: string[]; // ['housekeeping', 'laundry', 'maintenance']
  
  is_default: boolean;
  is_active: boolean;
  
  // Manager-specific permissions
  can_create_managers: boolean;
  can_create_staff: boolean;
  can_view_reports: boolean;
  can_export_data: boolean;
  can_approve_requests: boolean;
  
  assigned_at: string;
  assigned_by?: string;
  deactivated_at?: string;
  
  // Joined data
  hotel?: Hotel;
  hotel_role?: Role;
  assigned_by_user?: Pick<User, 'id' | 'full_name'>;
}

// =====================================================
// SUBSCRIPTION & BILLING
// =====================================================

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  
  price_monthly: number;
  price_yearly: number;
  
  max_hotels?: number; // NULL = unlimited
  max_users?: number;
  max_rooms?: number;
  max_items?: number;
  max_storage_gb?: number;
  
  features: {
    modules: string[];
    advanced_reports: boolean;
    api_access: boolean;
    priority_support: boolean;
    custom_branding: boolean;
    export_data: boolean;
    multi_hotel: boolean;
    dedicated_support?: boolean;
    sla_guaranteed?: boolean;
  };
  
  display_order: number;
  is_active: boolean;
  is_public: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  
  subscription_plan_id?: string;
  subscription_status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  subscription_started_at: string;
  subscription_current_period_start: string;
  subscription_current_period_end?: string;
  trial_ends_at?: string;
  billing_cycle: 'monthly' | 'yearly';
  next_billing_date?: string;
  grace_period_ends_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  auto_renew: boolean;
  
  created_at: string;
  updated_at: string;
  
  // Joined data
  subscription_plan?: SubscriptionPlan;
  usage?: TenantUsage;
  primary_owner?: User;
}

export interface TenantUsage {
  id: string;
  tenant_id: string;
  
  current_hotels_count: number;
  current_users_count: number;
  current_rooms_count: number;
  current_items_count: number;
  current_storage_bytes: number;
  
  peak_hotels_count: number;
  peak_users_count: number;
  peak_storage_bytes: number;
  
  last_calculated_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  
  amount: number;
  currency: string;
  
  plan_id?: string;
  billing_cycle?: 'monthly' | 'yearly';
  
  payment_method?: string; // 'stripe', 'paypal', 'vnpay'
  payment_gateway_id?: string;
  payment_intent_id?: string;
  
  payment_status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  
  description?: string;
  invoice_number?: string;
  invoice_url?: string;
  receipt_url?: string;
  
  payment_date?: string;
  failed_at?: string;
  failure_reason?: string;
  refunded_at?: string;
  refund_reason?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined data
  plan?: SubscriptionPlan;
  invoice?: Invoice;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  payment_transaction_id?: string;
  
  invoice_number: string;
  
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  
  billing_name?: string;
  billing_email?: string;
  billing_address?: string;
  billing_phone?: string;
  
  line_items?: Array<{
    description: string;
    amount: number;
  }>;
  
  invoice_status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  
  invoice_date: string;
  due_date?: string;
  paid_at?: string;
  
  pdf_url?: string;
  notes?: string;
  
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  tenant_id: string;
  
  gateway: string; // 'stripe', 'paypal', 'vnpay'
  gateway_payment_method_id: string;
  
  type: 'card' | 'bank_account' | 'paypal';
  
  card_brand?: string;
  card_last4?: string;
  card_exp_month?: number;
  card_exp_year?: number;
  
  bank_name?: string;
  bank_last4?: string;
  
  is_default: boolean;
  is_verified: boolean;
  
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// =====================================================
// HOTEL (for reference in User Management)
// =====================================================

export interface Hotel {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: 'hotel' | 'resort' | 'apartment' | 'hostel' | 'other';
  status: 'active' | 'inactive' | 'maintenance';
  city?: string;
  country: string;
  total_rooms: number;
  total_floors: number;
  created_at: string;
  updated_at: string;
}
