import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { startOfMonth, format } from 'date-fns'
import { useReportTargets } from './useReportTargets'
import { TargetError } from '@/lib/report-targets'

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
  const monthStr = format(startOfMonth(month ?? new Date()), 'yyyy-MM-dd')
  const query = useReportTargets('monthly', monthStr)
  const review = query.data?.review_required ? new TargetError('review_required', 'Mục tiêu tháng cần chủ khách sạn đối soát.') : null
  return { ...query, error: query.error || review, data: query.data && !review ? { revenue_target: query.data.values.revenue_target ?? null,
    occupancy_target: query.data.values.occupancy_target ?? null } : undefined }
}
