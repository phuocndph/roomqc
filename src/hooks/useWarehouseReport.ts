import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'

export interface WarehouseStockSummary {
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  is_default: boolean
  total_items: number
  total_quantity: number
  total_value: number
  low_stock_count: number
}

export interface LowStockByWarehouse {
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  item_id: string
  item_name: string
  item_code: string
  category_name: string | null
  quantity: number
  minimum_stock: number
  shortage: number
  unit_price: number | null
}

export function useWarehouseStockReport() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['warehouse-stock-report', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')

      const { data, error } = await supabase.rpc('get_all_warehouse_stock_summary', {
        p_tenant_id: tenant.id,
        p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
      })

      if (error) throw error
      return data as WarehouseStockSummary[]
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
  })
}

export function useLowStockByWarehouses(limit = 50) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['low-stock-by-warehouses', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id, limit],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')

      const { data, error } = await supabase.rpc('get_low_stock_by_warehouses', {
        p_tenant_id: tenant.id,
        p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
        p_limit: limit,
      })

      if (error) throw error
      return data as LowStockByWarehouse[]
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
  })
}

// Group low stock items by warehouse
export function useGroupedLowStockByWarehouses(limit = 50) {
  const { data, ...rest } = useLowStockByWarehouses(limit)

  const grouped = data?.reduce((acc, item) => {
    if (!acc[item.warehouse_id]) {
      acc[item.warehouse_id] = {
        warehouse_id: item.warehouse_id,
        warehouse_name: item.warehouse_name,
        warehouse_code: item.warehouse_code,
        items: [],
      }
    }
    acc[item.warehouse_id].items.push(item)
    return acc
  }, {} as Record<string, { warehouse_id: string; warehouse_name: string; warehouse_code: string; items: LowStockByWarehouse[] }>)

  return {
    data: grouped ? Object.values(grouped) : undefined,
    ...rest,
  }
}
