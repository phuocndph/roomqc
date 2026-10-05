import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import type { RouteFilters, RouteStatus } from '@/types/route-batch.types'

interface DistributionOrderWithFilters {
  id: string
  order_code: string
  status: RouteStatus
  floor: number | null
  shift_date: string | null
  shift_code: string | null
  total_rooms: number
  total_items: number
  rooms_completed: number
  assigned_to: string | null
  assigned_to_name: string | null
  created_by: string
  created_by_name: string
  notes: string | null
  released_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  hotel_id?: string
  hotel_name?: string
}

export function useRoutesWithFilters(
  filters: RouteFilters = {},
  page = 1,
  pageSize = 25
) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: [
      'distribution-routes',
      tenant?.id,
      isAllHotelsMode ? 'all' : selectedHotel?.id,
      filters,
      page,
      pageSize,
    ],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')

      // Use RPC to enforce role-based visibility
      const { data, error } = await supabase.rpc('get_distribution_orders_filtered', {
        p_tenant_id: tenant.id,
        p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
        p_status: filters.status || null,
        p_assigned_to: filters.assigned_to || null,
        p_floor: filters.floor ?? null,
        p_shift_date: filters.shift_date || null,
        p_shift_code: filters.shift_code || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })

      if (error) throw error

      // Get total count for pagination
      const { data: countResult, error: countError } = await supabase.rpc('get_distribution_orders_count', {
        p_tenant_id: tenant.id,
        p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
        p_status: filters.status || null,
        p_assigned_to: filters.assigned_to || null,
        p_floor: filters.floor ?? null,
        p_shift_date: filters.shift_date || null,
        p_shift_code: filters.shift_code || null,
      })

      if (countError) throw countError

      // Transform data to match expected interface
      const orders: DistributionOrderWithFilters[] = (data || []).map((row: any) => ({
        id: row.id,
        order_code: row.order_code,
        status: row.status,
        floor: row.floor,
        shift_date: row.shift_date,
        shift_code: row.shift_code,
        total_rooms: row.total_rooms,
        total_items: row.total_items,
        rooms_completed: row.rooms_completed,
        assigned_to: row.assigned_to,
        assigned_to_name: row.assigned_to_name,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        notes: row.notes,
        released_at: row.released_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        hotel_id: row.hotel_id,
        hotel_name: row.hotel_name,
      }))

      return {
        data: orders,
        totalCount: countResult || 0,
      }
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

export function useAvailableFloors() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['distribution-floors', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      if (!isAllHotelsMode && !selectedHotel?.id) return []

      let query = supabase
        .from('distribution_orders')
        .select('floor')
        .eq('tenant_id', tenant.id)
        .not('floor', 'is', null)

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await query

      if (error) throw error

      // Get unique floors and sort
      const uniqueFloors = [...new Set((data || []).map(d => d.floor as number))]
      return uniqueFloors.sort((a, b) => a - b)
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
  })
}
