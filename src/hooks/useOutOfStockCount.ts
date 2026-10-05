import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'

/**
 * Accurate "out of stock" count (items.quantity_in_stock = 0).
 *
 * Uses head-only `count: 'exact'` so we don't pay row payload even for large
 * tenants. Avoids the 200-row cap that `useLowStockItems` imposes on
 * derived stockout counters.
 *
 * Realtime: subscribes to `items` UPDATE on tenant to invalidate.
 */
export function useOutOfStockCount() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const tenantId = tenant?.id
  const hotelId = !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null
  const qc = useQueryClient()

  useEffect(() => {
    if (!tenantId) return
    const ch = supabase
      .channel(`out-of-stock-count-${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `tenant_id=eq.${tenantId}` },
        () => qc.invalidateQueries({ queryKey: ['out-of-stock-count', tenantId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [tenantId, qc])

  return useQuery({
    queryKey: ['out-of-stock-count', tenantId, hotelId, isAllHotelsMode],
    queryFn: async (): Promise<number> => {
      if (!tenantId) return 0
      let q = supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('quantity_in_stock', 0)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
