import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import type { DashboardStats } from '@/types/dashboard.types'

export function useDashboardStats() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['dashboard-stats', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .rpc('get_dashboard_stats', {
          p_tenant_id: tenantId,
          p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id || null,
        })
      
      if (error) throw error
      return data as unknown as DashboardStats
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export interface HotelBreakdownStats {
  hotel_id: string
  hotel_name: string
  hotel_code: string
  total_value: number
  total_items: number
  in_stock: number
  in_use: number
  in_laundry: number
  low_stock_count: number
}

export function useHotelsBreakdownStats() {
  const { tenantId } = useUser()
  
  return useQuery({
    queryKey: ['hotels-breakdown-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .rpc('get_hotels_breakdown_stats', {
          p_tenant_id: tenantId,
        })
      
      if (error) throw error
      return data as HotelBreakdownStats[]
    },
    enabled: !!tenantId,
    staleTime: 60000,
  })
}
