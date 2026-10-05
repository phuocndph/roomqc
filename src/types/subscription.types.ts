import { Database } from '@/integrations/supabase/types'

// Table types
export type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']
export type SubscriptionPlanInsert = Database['public']['Tables']['subscription_plans']['Insert']
export type SubscriptionPlanUpdate = Database['public']['Tables']['subscription_plans']['Update']

export type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row']
export type PaymentTransactionInsert = Database['public']['Tables']['payment_transactions']['Insert']
export type PaymentTransactionUpdate = Database['public']['Tables']['payment_transactions']['Update']

export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']

// Extended types with relations
export type InvoiceWithRelations = Invoice & {
  subscription_plan?: SubscriptionPlan
  created_by_user?: {
    id: string
    full_name: string
    email: string
  }
  payments?: PaymentTransaction[]
}

export type PaymentTransactionWithRelations = PaymentTransaction & {
  invoice?: Invoice
}

// Enums
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled'
export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'e_wallet' | 'cash'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

// Invoice line item structure
export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}
