import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import type { InventoryDashboardStats, LowStockItem, InventoryValueData } from '@/types/inventory.types'

export function useInventoryDashboard() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['inventory-dashboard', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')
      
      const { data, error } = await supabase
        .rpc('get_inventory_dashboard_stats', {
          p_tenant_id: tenant.id,
          p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
        })
      
      if (error) throw error
      return data as unknown as InventoryDashboardStats
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useLowStockItems(limit = 50) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['low-stock-items', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id, limit],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Missing tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')
      
      const { data, error } = await supabase
        .rpc('get_low_stock_items', {
          p_tenant_id: tenant.id,
          p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
          p_limit: limit,
        })
      
      if (error) throw error
      return data as LowStockItem[]
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useInventoryValueOverTime(months = 12) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['inventory-value-over-time', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id, months],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Missing tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')
      
      const { data, error } = await supabase
        .rpc('get_inventory_value_over_time', {
          p_tenant_id: tenant.id,
          p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
          p_months: months,
        })
      
      if (error) throw error
      return data as InventoryValueData[]
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
