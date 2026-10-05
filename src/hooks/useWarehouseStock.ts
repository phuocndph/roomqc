import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useEffect } from 'react'
import type { WarehouseStockWithItem } from '@/types/warehouse.types'

export function useWarehouseStock(warehouseId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['warehouse-stock', warehouseId],
    queryFn: async () => {
      if (!warehouseId) throw new Error('No warehouse ID')

      const { data, error } = await supabase
        .rpc('get_warehouse_stock_summary', { p_warehouse_id: warehouseId })

      if (error) throw error
      return data as WarehouseStockWithItem[]
    },
    enabled: !!warehouseId,
  })

  // Realtime subscription
  useEffect(() => {
    if (!warehouseId) return

    const channel = supabase
      .channel(`warehouse-stock-${warehouseId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'warehouse_stock',
        filter: `warehouse_id=eq.${warehouseId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['warehouse-stock', warehouseId] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [warehouseId, queryClient])

  return query
}

export function useItemWarehouseStock(itemId: string | undefined) {
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['item-warehouse-stock', itemId, selectedHotel?.id],
    queryFn: async () => {
      if (!itemId || !tenant?.id) throw new Error('Missing item ID or tenant')

      let query = supabase
        .from('warehouse_stock')
        .select(`
          *,
          warehouse:warehouse_id (
            id,
            code,
            name,
            location_type,
            is_default
          )
        `)
        .eq('item_id', itemId)
        .eq('tenant_id', tenant.id)

      if (selectedHotel?.id) {
        query = query.eq('warehouse.hotel_id', selectedHotel.id)
      }

      const { data, error } = await query
      if (error) throw error

      // Filter out null warehouses (from different hotels)
      return (data || []).filter(s => s.warehouse !== null)
    },
    enabled: !!itemId && !!tenant?.id,
  })
}

export function useWarehouseStockByItem(warehouseId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: ['warehouse-stock-item', warehouseId, itemId],
    queryFn: async () => {
      if (!warehouseId || !itemId) throw new Error('Missing warehouse or item ID')

      const { data, error } = await supabase
        .from('warehouse_stock')
        .select('quantity, minimum_stock')
        .eq('warehouse_id', warehouseId)
        .eq('item_id', itemId)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data || { quantity: 0, minimum_stock: 0 }
    },
    enabled: !!warehouseId && !!itemId,
  })
}

export function useMultipleWarehouseStock(warehouseId: string | undefined, itemIds: string[]) {
  return useQuery({
    queryKey: ['warehouse-stock-multiple', warehouseId, itemIds],
    queryFn: async () => {
      if (!warehouseId || itemIds.length === 0) return {}

      const { data, error } = await supabase
        .from('warehouse_stock')
        .select('item_id, quantity, minimum_stock')
        .eq('warehouse_id', warehouseId)
        .in('item_id', itemIds)

      if (error) throw error

      // Convert to map for easy lookup
      const stockMap: Record<string, { quantity: number; minimum_stock: number }> = {}
      for (const stock of data || []) {
        stockMap[stock.item_id] = {
          quantity: stock.quantity,
          minimum_stock: stock.minimum_stock || 0,
        }
      }
      return stockMap
    },
    enabled: !!warehouseId && itemIds.length > 0,
  })
}

export function useLowStockByWarehouse(warehouseId: string | undefined) {
  return useQuery({
    queryKey: ['warehouse-low-stock', warehouseId],
    queryFn: async () => {
      if (!warehouseId) throw new Error('No warehouse ID')

      const { data, error } = await supabase
        .from('warehouse_stock')
        .select(`
          *,
          item:item_id (
            id,
            name,
            code,
            unit,
            category:category_id (name)
          )
        `)
        .eq('warehouse_id', warehouseId)

      if (error) throw error

      // Filter client-side: PostgREST doesn't support cross-column comparison
      return (data || [])
        .filter(s => s.quantity <= (s.minimum_stock || 0))
        .sort((a, b) => a.quantity - b.quantity)
    },
    enabled: !!warehouseId,
  })
}
