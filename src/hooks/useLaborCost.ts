import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export interface LaborCostResult {
  total_labor_cost: number
  by_department: Record<string, number>
}

/** Tính chi phí nhân sự từ shift_history × users.wage trong kỳ. */
export function useLaborCost(dateRange: { start: Date; end: Date }) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null

  return useQuery({
    queryKey: [
      'labor-cost',
      tenantId,
      hotelId ?? 'all',
      dateRange.start.toISOString().slice(0, 10),
      dateRange.end.toISOString().slice(0, 10),
    ],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LaborCostResult> => {
      if (!tenantId) throw new Error('No tenant')
      const { data, error } = await supabase.rpc('get_labor_cost', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().slice(0, 10),
        p_end_date: dateRange.end.toISOString().slice(0, 10),
      })
      if (error) throw error
      const result = (data ?? {}) as Partial<LaborCostResult>
      return {
        total_labor_cost: Number(result.total_labor_cost ?? 0),
        by_department: (result.by_department ?? {}) as Record<string, number>,
      }
    },
  })
}
