import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { StaffStatus } from './useStaffStatus'

/**
 * Hook to get the current user's staff status (for shift check-in/out)
 */
export function useMyStaffStatus() {
  const { user, tenantId } = useUser()

  return useQuery({
    queryKey: ['my-staff-status', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_status')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()

      if (error) throw error
      return data as StaffStatus | null
    },
    enabled: !!user?.id && !!tenantId,
  })
}

/**
 * Hook to check-in to a shift
 */
export function useShiftCheckIn() {
  const { user, tenantId } = useUser()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id || !tenantId) throw new Error('Not authenticated')

      const now = new Date().toISOString()

      // Check if there's an existing unclosed shift
      const { data: existingStatus } = await supabase
        .from('staff_status')
        .select('shift_start_at, shift_end_at')
        .eq('user_id', user.id)
        .maybeSingle()

      // If there's an unclosed shift, close it first (trigger will log to history)
      if (existingStatus?.shift_start_at && 
          (!existingStatus.shift_end_at || 
           new Date(existingStatus.shift_start_at) > new Date(existingStatus.shift_end_at))) {
        await supabase
          .from('staff_status')
          .update({ shift_end_at: now })
          .eq('user_id', user.id)
      }

      // Now create the new shift
      const { error } = await supabase
        .from('staff_status')
        .upsert(
          {
            user_id: user.id,
            tenant_id: tenantId,
            shift_start_at: now,
            shift_end_at: null,
            status: 'available',
            last_seen_at: now,
          },
          { onConflict: 'user_id' }
        )

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-staff-status'] })
      queryClient.invalidateQueries({ queryKey: ['staff-status'] })
      toast.success('Đã vào ca làm việc')
    },
    onError: (error) => {
      console.error('Check-in error:', error)
      toast.error('Không thể vào ca. Vui lòng thử lại.')
    },
  })
}

/**
 * Hook to check-out from a shift
 */
export function useShiftCheckOut() {
  const { user } = useUser()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated')

      const now = new Date().toISOString()

      const { error } = await supabase
        .from('staff_status')
        .update({
          shift_end_at: now,
          status: 'offline',
          current_activity: null,
          current_location: null,
          current_activity_type: null,
          last_seen_at: now,
        })
        .eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-staff-status'] })
      queryClient.invalidateQueries({ queryKey: ['staff-status'] })
      queryClient.invalidateQueries({ queryKey: ['shift-history'] })
      toast.success('Đã kết thúc ca làm việc')
    },
    onError: (error) => {
      console.error('Check-out error:', error)
      toast.error('Không thể kết thúc ca. Vui lòng thử lại.')
    },
  })
}

/**
 * Check if a staff member is currently on shift.
 *
 * Delegates to the unified `staffPresence` module (single source of truth).
 * Kept as a re-export for backward compatibility with existing callers.
 */
export { isOnShift as isCurrentlyOnShift } from '@/lib/staffPresence'

/**
 * Calculate how long the current shift has been
 */
export function calculateShiftDuration(startAt: string | null | undefined): string {
  if (!startAt) return ''
  return formatDistanceToNow(new Date(startAt), { locale: vi, addSuffix: false })
}

/**
 * Format shift start time for display
 */
export function formatShiftStartTime(startAt: string | null | undefined): string {
  if (!startAt) return ''
  return format(new Date(startAt), 'HH:mm', { locale: vi })
}
