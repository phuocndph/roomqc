import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from '@/hooks/use-toast'
import type {
  SubscriptionPlan,
  PaymentTransaction,
  PaymentTransactionInsert,
  Invoice,
  InvoiceInsert,
  InvoiceWithRelations,
} from '@/types/subscription.types'
import {
  calculateSubscriptionPrice,
  calculateEndDate,
} from '@/lib/pricing'
import { getFriendlyError } from '@/lib/errorMessage'

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

// Create payment transaction
export const useCreatePayment = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (payment: Omit<PaymentTransactionInsert, 'tenant_id'>) => {
      if (!tenantId) throw new Error('Tenant ID not found')

      const { data, error } = await supabase
        .from('payment_transactions')
        .insert({ ...payment, tenant_id: tenantId })
        .select()
        .single()

      if (error) throw error
      return data as PaymentTransaction
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast({
        title: 'Thành công',
        description: 'Thanh toán đã được ghi nhận',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// Create invoice
export const useCreateInvoice = () => {
  const queryClient = useQueryClient()
  const { tenantId, user } = useUser()

  return useMutation({
    mutationFn: async (invoice: Omit<InvoiceInsert, 'tenant_id' | 'created_by'>) => {
      if (!tenantId || !user?.id) throw new Error('Tenant ID or User ID not found')

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          ...invoice,
          tenant_id: tenantId,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error
      return data as Invoice
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast({
        title: 'Thành công',
        description: 'Hóa đơn đã được tạo',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// Update tenant subscription with room-based pricing
export const useUpdateTenantSubscription = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async ({
      rooms,
      durationDays,
      isAddingRooms = false,
    }: {
      rooms: number
      durationDays: number
      isAddingRooms?: boolean
    }) => {
      if (!tenantId) throw new Error('Tenant ID not found')

      // Get current subscription for adding rooms scenario
      const { data: currentTenant } = await supabase
        .from('tenants')
        .select('subscription_end_date, registered_rooms')
        .eq('id', tenantId)
        .single()

      const now = new Date()
      let startDate = now
      let endDate: Date

      if (isAddingRooms && currentTenant?.subscription_end_date) {
        // When adding rooms, keep the current end date
        endDate = new Date(currentTenant.subscription_end_date)
        // Don't change start date for existing subscription
        startDate = now
      } else {
        // New subscription or renewal
        endDate = calculateEndDate(now, durationDays)
      }

      const effectiveDays = isAddingRooms ? durationDays : durationDays
      const pricing = calculateSubscriptionPrice(rooms, effectiveDays)

      // Get standard plan ID
      const { data: standardPlan, error: planError } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('code', 'standard')
        .eq('is_active', true)
        .single()

      if (planError || !standardPlan) {
        throw new Error('Không tìm thấy gói tiêu chuẩn')
      }

      // Update tenant subscription
      const updateData: Record<string, unknown> = {
        subscription_plan_id: standardPlan.id,
        registered_rooms: rooms,
        subscription_status: 'active',
        updated_at: now.toISOString(),
      }

      // Only update dates if not adding rooms (renewal/new subscription)
      if (!isAddingRooms) {
        updateData.subscription_duration_days = durationDays
        updateData.subscription_start_date = startDate.toISOString().split('T')[0]
        updateData.subscription_end_date = endDate.toISOString().split('T')[0]
        updateData.subscription_current_period_start = startDate.toISOString()
        updateData.subscription_current_period_end = endDate.toISOString()
      }

      const { data, error } = await supabase
        .from('tenants')
        .update(updateData)
        .eq('id', tenantId)
        .select()
        .single()

      if (error) throw error

      // Recalculate tenant usage
      const { error: usageError } = await supabase.rpc('update_tenant_usage', {
        p_tenant_id: tenantId,
      })

      if (usageError) console.error('Failed to update usage:', usageError)

      return { data, pricing, isAddingRooms }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-subscription'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-usage'] })
      queryClient.invalidateQueries({ queryKey: ['check-quota'] })
      queryClient.invalidateQueries({ queryKey: ['actual-room-count'] })
      
      const message = result.isAddingRooms
        ? `Đã thêm phòng. Tổng: ${result.pricing.rooms} phòng`
        : `Đã đăng ký ${result.pricing.rooms} phòng trong ${result.pricing.days} ngày`
      
      toast({
        title: 'Thành công',
        description: message,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
