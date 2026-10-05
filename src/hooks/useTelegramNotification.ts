import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export type TelegramNotificationType = 'booking' | 'checkin' | 'checkout' | 'maintenance' | 'inventory' | 'payment' | 'laundry' | 'system'

export interface TelegramNotificationPayload {
  tenant_id: string
  hotel_id?: string // Filter groups by specific hotel
  user_ids?: string[]
  group_ids?: string[]
  send_to_all_groups?: boolean
  send_to_owner_groups?: boolean
  send_to_management_groups?: boolean
  send_to_staff_groups?: boolean
  title: string
  message: string
  notification_type?: TelegramNotificationType
  action_url?: string
}

export interface TelegramNotificationResult {
  success: boolean
  sent: number
  total: number
  failed?: number
  error?: string
}

export function useTelegramNotification() {
  return useMutation({
    mutationFn: async (payload: TelegramNotificationPayload): Promise<TelegramNotificationResult> => {
      const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
        body: payload
      })
      
      if (error) {
        console.error('Error sending Telegram notification:', error)
        throw error
      }
      
      return data as TelegramNotificationResult
    },
    onError: (error) => {
      console.error('Telegram notification failed:', error)
    }
  })
}

/**
 * Helper function to send Telegram notification without using hook
 */
export async function sendTelegramNotification(
  payload: TelegramNotificationPayload
): Promise<TelegramNotificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
      body: payload
    })
    
    if (error) {
      console.error('Error sending Telegram notification:', error)
      return { success: false, sent: 0, total: 0, error: error.message }
    }
    
    return data as TelegramNotificationResult
  } catch (err) {
    console.error('Telegram notification error:', err)
    return { success: false, sent: 0, total: 0, error: String(err) }
  }
}
