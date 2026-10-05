import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { startOfMonth, format } from 'date-fns'

export function useFixedExpenses(month?: Date) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const monthStr = format(startOfMonth(month ?? new Date()), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['fixed-expenses', tenantId, hotelId, monthStr],
    enabled: !!tenantId && !!hotelId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotel_fixed_expenses')
        .select('category, amount')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('month', monthStr)
      if (error) throw error
      return (data || []) as { category: string; amount: number }[]
    },
  })
}

export function useMonthlyTarget(month?: Date) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const monthStr = format(startOfMonth(month ?? new Date()), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['monthly-target', tenantId, hotelId, monthStr],
    enabled: !!tenantId && !!hotelId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_targets')
        .select('revenue_target, occupancy_target')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('month', monthStr)
        .maybeSingle()
      if (error) throw error
      return data as { revenue_target: number | null; occupancy_target: number | null } | null
    },
  })
}
