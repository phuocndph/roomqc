import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export interface HotelPerformanceStats {
  hotel: {
    id: string
    name: string
    code: string
    total_rooms: number
  }
  inventory: {
    value: number
    total_items: number
    in_stock: number
    low_stock_count: number
    utilization_rate: number
  }
  transactions: {
    count: number
    inbound_value: number
    outbound_value: number
  }
  laundry: {
    batches: number
    cost: number
    avg_quality: number
    avg_timeliness: number
    cost_per_room: number
  }
  maintenance: {
    total_requests: number
    completed: number
    pending: number
    cost: number
    avg_resolution_hours: number
    completion_rate: number
  }
  purchases: {
    orders: number
    value: number
  }
  total_operating_cost: number
  cost_per_room_per_month: number
}

export interface HotelComparison {
  hotel_id: string
  hotel_name: string
  hotel_code: string
  total_rooms: number
  inventory_value: number
  inventory_turnover_rate: number
  total_operating_cost: number
  cost_per_room: number
  laundry_cost: number
  maintenance_cost: number
  purchase_value: number
  laundry_quality: number
  maintenance_completion_rate: number
  efficiency_score: number
}

export function useHotelPerformanceStats(
  hotelId: string | undefined,
  dateRange: { start: Date; end: Date }
) {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['hotel-performance-stats', tenantId, hotelId, dateRange],
    queryFn: async () => {
      if (!tenantId || !hotelId) throw new Error('No tenant or hotel')

      const { data, error } = await supabase.rpc('get_hotel_performance_stats', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_from_date: dateRange.start.toISOString().split('T')[0],
        p_to_date: dateRange.end.toISOString().split('T')[0],
      })

      if (error) throw error
      return data as unknown as HotelPerformanceStats
    },
    enabled: !!tenantId && !!hotelId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useHotelsPerformanceComparison(dateRange: { start: Date; end: Date }) {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['hotels-performance-comparison', tenantId, dateRange],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase.rpc('get_hotels_performance_comparison', {
        p_tenant_id: tenantId,
        p_from_date: dateRange.start.toISOString().split('T')[0],
        p_to_date: dateRange.end.toISOString().split('T')[0],
      })

      if (error) throw error
      return data as HotelComparison[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}
