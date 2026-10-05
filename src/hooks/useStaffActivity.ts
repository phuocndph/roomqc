import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export interface StaffActivity {
  id: string
  user_id: string
  user_name: string
  action: string
  description: string
  entity_type: string
  entity_name: string | null
  created_at: string
}

export function useStaffActivities(userId?: string, limit: number = 20) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['staff-activities', tenantId, userId, limit, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      let query = supabase
        .from('activity_logs')
        .select('id, user_id, user_name, action, description, entity_type, entity_name, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (userId) {
        query = query.eq('user_id', userId)
      }

      const { data, error } = await query

      if (error) throw error
      return data as StaffActivity[]
    },
    enabled: !!tenantId,
  })
}

export function useRecentStaffActivities(limit: number = 50) {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['recent-staff-activities', tenantId, limit],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, user_id, user_name, action, description, entity_type, entity_name, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Group by user_id for latest activity per user
      const latestByUser = new Map<string, StaffActivity>()
      data?.forEach(activity => {
        if (activity.user_id && !latestByUser.has(activity.user_id)) {
          latestByUser.set(activity.user_id, activity as StaffActivity)
        }
      })

      return {
        all: data as StaffActivity[],
        latestByUser: Object.fromEntries(latestByUser),
      }
    },
    enabled: !!tenantId,
  })
}
