import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export type SeasonalApplyTo = 'daily' | 'overnight' | 'hourly' | 'monthly'
export type SeasonalMode = 'add_on' | 'overwrite'
export type SeasonalAdjustType = 'percent' | 'fixed_amount' | 'set_rate'

export interface SeasonalRateOverride {
  id: string
  tenant_id: string
  hotel_id: string | null
  name: string
  from_date: string
  to_date: string
  room_type_ids: string[]
  apply_to: SeasonalApplyTo[]
  mode: SeasonalMode
  adjust_type: SeasonalAdjustType
  adjust_value: number
  priority: number
  active: boolean
  created_at: string
  updated_at: string
}

export const useSeasonalRates = (hotelId?: string | null) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['seasonal-rates', tenantId, hotelId ?? 'all'],
    queryFn: async () => {
      if (!tenantId) return []
      let q = supabase
        .from('seasonal_rate_overrides' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('priority', { ascending: true })
        .order('from_date', { ascending: false })
      if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as SeasonalRateOverride[]
    },
    enabled: !!tenantId,
  })
}

export const useUpsertSeasonalRate = () => {
  const qc = useQueryClient()
  const { tenantId } = useUser()
  return useMutation({
    mutationFn: async (payload: Partial<SeasonalRateOverride> & { id?: string }) => {
      const row = { ...payload, tenant_id: tenantId }
      const { data, error } = await supabase
        .from('seasonal_rate_overrides' as any)
        .upsert(row as any)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonal-rates'] })
      qc.invalidateQueries({ queryKey: ['today-prices-by-hotel'] })
      qc.invalidateQueries({ queryKey: ['resolved-daily-prices'] })
      qc.invalidateQueries({ queryKey: ['pricing-health'] })
      qc.invalidateQueries({ queryKey: ['rate-plans'] })
      qc.invalidateQueries({ queryKey: ['daily-prices'] })
      qc.invalidateQueries({ queryKey: ['available-rooms'] })
      toast.success('Đã lưu quy tắc mùa giá')
    },
    onError: (e: any) => toast.error(e.message || 'Lưu thất bại'),
  })
}

export const useDeleteSeasonalRate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('seasonal_rate_overrides' as any).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasonal-rates'] })
      qc.invalidateQueries({ queryKey: ['today-prices-by-hotel'] })
      qc.invalidateQueries({ queryKey: ['resolved-daily-prices'] })
      qc.invalidateQueries({ queryKey: ['pricing-health'] })
      qc.invalidateQueries({ queryKey: ['rate-plans'] })
      qc.invalidateQueries({ queryKey: ['daily-prices'] })
      qc.invalidateQueries({ queryKey: ['available-rooms'] })
      toast.success('Đã xóa quy tắc')
    },
    onError: (e: any) => toast.error(e.message || 'Xóa thất bại'),
  })
}
