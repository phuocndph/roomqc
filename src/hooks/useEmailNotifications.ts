import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface EmailNotification {
  id: string
  tenant_id: string
  user_id: string | null
  to_email: string
  subject: string
  body_html: string
  body_text: string | null
  notification_type: string
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
  sent_at: string | null
  failed_at: string | null
  failure_reason: string | null
  retry_count: number
  metadata: Record<string, any> | null
  created_at: string
}

// Fetch email notifications
export function useEmailNotifications(status?: string) {
  const { tenant } = useTenant()
  
  return useQuery({
    queryKey: ['email-notifications', tenant?.id, status],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      let query = supabase
        .from('email_notifications')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
      
      if (status) {
        query = query.eq('status', status)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      return data as EmailNotification[]
    },
    enabled: !!tenant?.id,
  })
}

// Queue email notification
export function useQueueEmailNotification() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  
  return useMutation({
    mutationFn: async ({
      userId,
      toEmail,
      subject,
      bodyHtml,
      notificationType,
      metadata,
    }: {
      userId?: string
      toEmail: string
      subject: string
      bodyHtml: string
      notificationType: string
      metadata?: Record<string, any>
    }) => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { data, error } = await supabase.rpc('queue_email_notification', {
        p_tenant_id: tenant.id,
        p_user_id: userId || null,
        p_to_email: toEmail,
        p_subject: subject,
        p_body_html: bodyHtml,
        p_notification_type: notificationType,
        p_metadata: metadata ? JSON.stringify(metadata) : null,
      })
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-notifications', tenant?.id] })
      toast({
        title: 'Email đã được thêm vào hàng đợi',
        description: 'Email sẽ được gửi trong thời gian sớm nhất',
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

// Check expiring subscriptions
export function useCheckExpiringSubscriptions() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('check_expiring_subscriptions')
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-notifications'] })
      toast({
        title: 'Đã kiểm tra',
        description: 'Đã gửi thông báo cho các gói dịch vụ sắp hết hạn',
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

// Get notification statistics
export function useNotificationStatistics() {
  const { tenant } = useTenant()
  
  return useQuery({
    queryKey: ['notification-statistics', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .from('email_notifications')
        .select('status, notification_type')
        .eq('tenant_id', tenant.id)
      
      if (error) throw error
      
      // Calculate statistics
      const stats = {
        total: data.length,
        pending: data.filter(n => n.status === 'pending').length,
        sent: data.filter(n => n.status === 'sent').length,
        failed: data.filter(n => n.status === 'failed').length,
        byType: data.reduce((acc, n) => {
          acc[n.notification_type] = (acc[n.notification_type] || 0) + 1
          return acc
        }, {} as Record<string, number>),
      }
      
      return stats
    },
    enabled: !!tenant?.id,
  })
}
