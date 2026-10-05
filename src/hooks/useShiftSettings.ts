import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface ShiftSettings {
  default_start_time: string
  default_end_time: string
  max_shift_hours: number
  warning_hours: number
  reminder_enabled: boolean
  reminder_channels: ('push' | 'telegram')[]
}

const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  default_start_time: '08:00',
  default_end_time: '18:00',
  max_shift_hours: 12,
  warning_hours: 10,
  reminder_enabled: true,
  reminder_channels: ['push', 'telegram'],
}

export function useShiftSettings() {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['shift-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return DEFAULT_SHIFT_SETTINGS

      const { data, error } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      if (error) throw error

      const settings = data?.settings as Record<string, unknown> | null
      const shiftSettings = settings?.shift_settings as Partial<ShiftSettings> | undefined

      return {
        ...DEFAULT_SHIFT_SETTINGS,
        ...shiftSettings,
      } as ShiftSettings
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpdateShiftSettings() {
  const { tenantId } = useUser()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newSettings: Partial<ShiftSettings>) => {
      if (!tenantId) throw new Error('No tenant')

      // First get current settings
      const { data: tenant, error: fetchError } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      if (fetchError) throw fetchError

      const currentSettings = (tenant?.settings as Record<string, unknown>) || {}
      const currentShiftSettings = (currentSettings.shift_settings as Partial<ShiftSettings>) || {}

      // Merge with new settings
      const updatedSettings = {
        ...currentSettings,
        shift_settings: {
          ...DEFAULT_SHIFT_SETTINGS,
          ...currentShiftSettings,
          ...newSettings,
        },
      }

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ settings: updatedSettings })
        .eq('id', tenantId)

      if (updateError) throw updateError

      return updatedSettings.shift_settings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-settings', tenantId] })
      toast.success('Đã lưu cài đặt ca làm việc')
    },
    onError: (error) => {
      console.error('Error updating shift settings:', error)
      toast.error('Không thể lưu cài đặt')
    },
  })
}
