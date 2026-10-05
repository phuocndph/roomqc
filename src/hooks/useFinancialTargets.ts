import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { startOfMonth, format } from 'date-fns'
import { toast } from 'sonner'

export type TargetMetric =
  | 'occupancy'
  | 'revpar'
  | 'adr'
  | 'gop_margin'
  | 'goppar'
  | 'labor_ratio'
  | 'net_revenue'
  | 'gop'

export interface FinancialTarget {
  id: string
  tenant_id: string
  hotel_id: string | null
  period_month: string
  metric: TargetMetric
  target_value: number
  notes: string | null
}

export function useFinancialTargets(periodDate: Date) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const month = format(startOfMonth(periodDate), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['financial-targets', tenantId, hotelId ?? 'all', month],
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Partial<Record<TargetMetric, number>>> => {
      if (!tenantId) return {}
      let q = supabase
        .from('financial_targets')
        .select('metric,target_value,hotel_id')
        .eq('tenant_id', tenantId)
        .eq('period_month', month)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      else q = q.is('hotel_id', null)

      const { data, error } = await q
      if (error) throw error
      const map: Partial<Record<TargetMetric, number>> = {}
      for (const row of data || []) {
        map[row.metric as TargetMetric] = Number(row.target_value)
      }
      return map
    },
  })
}

export function useUpsertFinancialTarget(periodDate: Date) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const month = format(startOfMonth(periodDate), 'yyyy-MM-dd')
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { metric: TargetMetric; target_value: number; notes?: string }) => {
      if (!tenantId) throw new Error('No tenant')
      const { error } = await supabase.from('financial_targets').upsert(
        {
          tenant_id: tenantId,
          hotel_id: hotelId,
          period_month: month,
          metric: input.metric,
          target_value: input.target_value,
          notes: input.notes ?? null,
        },
        { onConflict: 'tenant_id,hotel_id,period_month,metric' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-targets'] })
      qc.invalidateQueries({ queryKey: ['operations-insights'] })
      toast.success('Đã lưu mục tiêu')
    },
    onError: (e: Error) => toast.error(e.message || 'Lưu mục tiêu thất bại'),
  })
}

export function useDeleteFinancialTarget(periodDate: Date) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const month = format(startOfMonth(periodDate), 'yyyy-MM-dd')
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (metric: TargetMetric) => {
      if (!tenantId) throw new Error('No tenant')
      let q = supabase
        .from('financial_targets')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('period_month', month)
        .eq('metric', metric)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      else q = q.is('hotel_id', null)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-targets'] })
      qc.invalidateQueries({ queryKey: ['operations-insights'] })
      toast.success('Đã xóa mục tiêu')
    },
  })
}

export const TARGET_METRIC_LABELS: Record<TargetMetric, string> = {
  occupancy: 'Lấp đầy (%)',
  revpar: 'RevPAR (VNĐ/phòng/ngày)',
  adr: 'ADR (VNĐ/đêm)',
  gop_margin: 'Biên GOP (%)',
  goppar: 'GOPPAR (VNĐ/phòng/ngày)',
  labor_ratio: 'Tỷ lệ chi phí nhân sự (%)',
  net_revenue: 'Doanh thu thuần (VNĐ/tháng)',
  gop: 'GOP (VNĐ/tháng)',
}
