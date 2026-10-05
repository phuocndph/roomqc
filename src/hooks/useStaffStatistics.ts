import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface StaffStatistics {
  id: string
  user_id: string
  hotel_id: string
  laundry_batches_processed: number
  maintenance_tasks_completed: number
  items_checked: number
  average_task_completion_time: string | null
  on_time_completion_rate: number | null
  period_start: string
  period_end: string
  last_calculated_at: string
}

// Fetch staff statistics for a specific period
export function useStaffStatistics(userId?: string, periodStart?: Date, periodEnd?: Date) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['staff-statistics', tenant?.id, selectedHotel?.id, isAllHotelsMode, userId, periodStart, periodEnd],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      let query = supabase
        .from('staff_statistics')
        .select('*')
        .order('period_start', { ascending: false })
      
      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }
      
      if (userId) {
        query = query.eq('user_id', userId)
      }
      
      if (periodStart) {
        query = query.gte('period_start', periodStart.toISOString().split('T')[0])
      }
      
      if (periodEnd) {
        query = query.lte('period_end', periodEnd.toISOString().split('T')[0])
      }
      
      const { data, error } = await query
      
      if (error) throw error
      return data as StaffStatistics[]
    },
    enabled: !!tenant?.id,
  })
}

// Calculate staff statistics for a period
export function useCalculateStaffStatistics() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  
  return useMutation({
    mutationFn: async ({
      userId,
      periodStart,
      periodEnd,
    }: {
      userId: string
      periodStart: Date
      periodEnd: Date
    }) => {
      if (!tenant?.id || !selectedHotel?.id) throw new Error('No tenant or hotel')
      
      const { error } = await supabase.rpc('calculate_staff_statistics', {
        p_user_id: userId,
        p_hotel_id: selectedHotel.id,
        p_period_start: periodStart.toISOString().split('T')[0],
        p_period_end: periodEnd.toISOString().split('T')[0],
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-statistics'] })
      toast({
        title: 'Đã cập nhật',
        description: 'Thống kê nhân viên đã được tính toán',
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

// Get top performing staff
export function useTopPerformingStaff(limit = 10) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['top-performing-staff', tenant?.id, selectedHotel?.id, isAllHotelsMode, limit],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      // Get current month statistics
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      let query = supabase
        .from('staff_statistics')
        .select(`
          *,
          users:user_id (
            id,
            full_name,
            avatar_url,
            email
          )
        `)
      
      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }
      
      query = query
        .gte('period_start', periodStart.toISOString().split('T')[0])
        .lte('period_end', periodEnd.toISOString().split('T')[0])
        .order('maintenance_tasks_completed', { ascending: false })
        .limit(limit)
      
      const { data, error } = await query
      
      if (error) throw error
      return data
    },
    enabled: !!tenant?.id,
  })
}
