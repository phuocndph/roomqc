import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import type {
  SubscriptionPlan,
  InvoiceWithRelations,
} from '@/types/subscription.types'

// Fetch all active subscription plans
export const useSubscriptionPlans = () => {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order')

      if (error) throw error
      return data as SubscriptionPlan[]
    },
  })
}

// Fetch current tenant's subscription info
export const useTenantSubscription = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['tenant-subscription', tenantId],
    queryFn: async () => {
      if (!tenantId) return null

      const { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          subscription_plan:subscription_plan_id (*)
        `)
        .eq('id', tenantId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })
}

// Fetch invoices for tenant
export const useInvoices = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['invoices', tenantId],
    queryFn: async () => {
      if (!tenantId) return []

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          subscription_plan:subscription_plan_id (*),
          created_by_user:created_by (id, full_name, email)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as InvoiceWithRelations[]
    },
    enabled: !!tenantId,
  })
}

// Fetch payment transactions for tenant
export const usePaymentTransactions = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['payment-transactions', tenantId],
    queryFn: async () => {
      if (!tenantId) return []

      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          *,
          invoice:invoice_id (*)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })
}
