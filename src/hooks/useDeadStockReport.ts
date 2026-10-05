import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import type { DeadStockRow } from '@/types/inventory-analytics.types'

/**
 * Phase C2 — Dead stock report.
 * Items with stock > 0 that have not moved in `days` (default 90).
 * Honors All-Hotels mode: when active, returns rows across all assigned hotels.
 */
export function useDeadStockReport(days: number = 90) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: [
      'dead-stock-report',
      tenant?.id,
      isAllHotelsMode ? 'all' : selectedHotel?.id,
      days,
    ],
    queryFn: async (): Promise<DeadStockRow[]> => {
      if (!tenant?.id) throw new Error('No tenant')

      const { data, error } = await supabase.rpc('get_dead_stock_report', {
        _tenant_id: tenant.id,
        _hotel_id: isAllHotelsMode ? null : selectedHotel?.id ?? null,
        _days_threshold: days,
      })

      if (error) throw error
      return (data ?? []) as unknown as DeadStockRow[]
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}
