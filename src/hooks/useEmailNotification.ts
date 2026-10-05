import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import type { EmailNotificationType } from '@/types/notification.types'
import { getFriendlyError } from '@/lib/errorMessage'

interface SendEmailParams {
  notification_type: EmailNotificationType
  to_email: string
  to_name?: string
  template_data: Record<string, any>
}

export function useSendEmailNotification() {
  return useMutation({
    mutationFn: async (params: SendEmailParams) => {
      const { data, error } = await supabase.functions.invoke('send-notification-email', {
        body: params,
      })

      if (error) throw error
      return data
    },
    onError: (error: Error) => {
      console.error('Failed to send email notification:', error)
      toast({
        title: 'Lỗi gửi email',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// Helper functions for specific email types
export function useSendSubscriptionExpiringEmail() {
  const sendEmail = useSendEmailNotification()

  return useMutation({
    mutationFn: async (params: {
      to_email: string
      to_name: string
      tenant_name: string
      plan_name: string
      expires_at: string
      days_remaining: number
      renewal_url: string
    }) => {
      return sendEmail.mutateAsync({
        notification_type: 'subscription_expiring',
        to_email: params.to_email,
        to_name: params.to_name,
        template_data: {
          tenant_name: params.tenant_name,
          plan_name: params.plan_name,
          expires_at: params.expires_at,
          days_remaining: params.days_remaining,
          renewal_url: params.renewal_url,
        },
      })
    },
  })
}

export function useSendPaymentSucceededEmail() {
  const sendEmail = useSendEmailNotification()

  return useMutation({
    mutationFn: async (params: {
      to_email: string
      to_name: string
      tenant_name: string
      amount: number
      currency: string
      plan_name: string
      next_billing_date: string
      invoice_url?: string
      receipt_url?: string
    }) => {
      return sendEmail.mutateAsync({
        notification_type: 'payment_succeeded',
        to_email: params.to_email,
        to_name: params.to_name,
        template_data: {
          tenant_name: params.tenant_name,
          amount: params.amount,
          currency: params.currency,
          plan_name: params.plan_name,
          next_billing_date: params.next_billing_date,
          invoice_url: params.invoice_url,
          receipt_url: params.receipt_url,
        },
      })
    },
  })
}

export function useSendPaymentFailedEmail() {
  const sendEmail = useSendEmailNotification()

  return useMutation({
    mutationFn: async (params: {
      to_email: string
      to_name: string
      tenant_name: string
      amount: number
      currency: string
      plan_name: string
      failure_reason: string
      retry_date?: string
      update_payment_url: string
    }) => {
      return sendEmail.mutateAsync({
        notification_type: 'payment_failed',
        to_email: params.to_email,
        to_name: params.to_name,
        template_data: {
          tenant_name: params.tenant_name,
          amount: params.amount,
          currency: params.currency,
          plan_name: params.plan_name,
          failure_reason: params.failure_reason,
          retry_date: params.retry_date,
          update_payment_url: params.update_payment_url,
        },
      })
    },
  })
}

export function useSendQuotaWarningEmail() {
  const sendEmail = useSendEmailNotification()

  return useMutation({
    mutationFn: async (params: {
      to_email: string
      to_name: string
      tenant_name: string
      resource_type: string
      current_usage: number
      limit: number
      percentage: number
      upgrade_url: string
    }) => {
      return sendEmail.mutateAsync({
        notification_type: 'quota_warning',
        to_email: params.to_email,
        to_name: params.to_name,
        template_data: {
          tenant_name: params.tenant_name,
          resource_type: params.resource_type,
          current_usage: params.current_usage,
          limit: params.limit,
          percentage: params.percentage,
          upgrade_url: params.upgrade_url,
        },
      })
    },
  })
}
