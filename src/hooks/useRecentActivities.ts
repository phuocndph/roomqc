import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useToast } from './use-toast'
import type { DashboardActivity } from '@/types/dashboard.types'

export function useRecentActivities(limit: number = 10) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const query = useQuery({
    queryKey: ['recent-activities', tenantId, limit, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .rpc('get_recent_activities', {
          p_tenant_id: tenantId,
          p_limit: limit,
          p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id || null,
        })
      
      if (error) throw error
      return data as DashboardActivity[]
    },
    enabled: !!tenantId,
  })
  
  // Subscribe to real-time updates
  useEffect(() => {
    if (!tenantId) return
    
    const channel = supabase
      .channel(`activity-logs-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          
          // Invalidate and refetch
          queryClient.invalidateQueries({
            queryKey: ['recent-activities', tenantId],
          })
          
          // Optional: Show toast for important activities
          const newActivity = payload.new as any
          if (newActivity.action === 'create' && newActivity.entity_type === 'maintenance_request') {
            toast({
              title: 'Yêu cầu bảo trì mới',
              description: newActivity.description,
            })
          }
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient, toast])
  
  return query
}
