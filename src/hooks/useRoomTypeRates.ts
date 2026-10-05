import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface RoomTypeRate {
  id: string
  tenant_id: string
  hotel_id: string | null
  room_type_id: string
  daily_rate: number
  overnight_rate: number | null
  hourly_rate: number | null
  hourly_first_block_hours: number | null
  hourly_first_block_price: number | null
  monthly_rate: number | null
  overnight_start_time: string | null
  overnight_end_time: string | null
  weekday_multiplier: Record<string, number>
}

export const useRoomTypeRates = (hotelId?: string | null) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['room-type-rates', tenantId, hotelId ?? 'all'],
    queryFn: async () => {
      if (!tenantId) return []
      let q = supabase
        .from('room_type_rates' as any)
        .select('*')
        .eq('tenant_id', tenantId)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RoomTypeRate[]
    },
    enabled: !!tenantId,
  })
}

export const useUpsertRoomTypeRate = () => {
  const qc = useQueryClient()
  const { tenantId } = useUser()
  return useMutation({
    mutationFn: async (payload: Partial<RoomTypeRate> & { room_type_id: string; hotel_id?: string | null }) => {
      const { data, error } = await supabase
        .from('room_type_rates' as any)
        .upsert({ ...payload, tenant_id: tenantId }, { onConflict: 'room_type_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-type-rates'] })
      qc.invalidateQueries({ queryKey: ['room-type-rate'] })
      qc.invalidateQueries({ queryKey: ['rate-plans'] })
      qc.invalidateQueries({ queryKey: ['resolved-daily-prices'] })
      qc.invalidateQueries({ queryKey: ['today-prices-by-hotel'] })
      qc.invalidateQueries({ queryKey: ['pricing-health'] })
      toast.success('Đã lưu bảng giá')
    },
    onError: (e: any) => toast.error(e.message || 'Lưu thất bại'),
  })
}

export const useDuplicateRoomType = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      source_id: string
      new_name: string
      new_code: string
      copy_rates?: boolean
      copy_default_items?: boolean
    }) => {
      const { data, error } = await supabase.rpc('duplicate_room_type' as any, {
        p_source_id: args.source_id,
        p_new_name: args.new_name,
        p_new_code: args.new_code,
        p_copy_rates: args.copy_rates ?? true,
        p_copy_default_items: args.copy_default_items ?? true,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-types'] })
      qc.invalidateQueries({ queryKey: ['room-type-rates'] })
      toast.success('Đã sao chép loại phòng')
    },
    onError: (e: any) => {
      const msg = (e.message || '').includes('CODE_DUPLICATE')
        ? 'Mã loại phòng đã tồn tại'
        : e.message || 'Sao chép thất bại'
      toast.error(msg)
    },
  })
}

export interface PriceBreakdown {
  base: number
  units: number
  booking_type: string
  weekday_multiplier: number
  season_adjust: number
  season_breakdown: Array<{ id: string; name: string; mode: string; adjust_value: number; delta?: number }>
  early_checkin_charge: number
  late_checkout_charge: number
  subtotal: number
  total: number
}

export const useCalculateBookingPrice = () => {
  return useMutation({
    mutationFn: async (args: {
      room_type_id: string
      booking_type: 'daily' | 'overnight' | 'hourly' | 'monthly'
      from_ts: string
      to_ts: string
      hotel_id?: string | null
      apply_early_late?: boolean
    }) => {
      const { data, error } = await supabase.rpc('calculate_booking_price' as any, {
        p_room_type_id: args.room_type_id,
        p_booking_type: args.booking_type,
        p_from_ts: args.from_ts,
        p_to_ts: args.to_ts,
        p_hotel_id: args.hotel_id ?? null,
        p_apply_early_late: args.apply_early_late ?? true,
      })
      if (error) throw error
      return data as PriceBreakdown
    },
  })
}
