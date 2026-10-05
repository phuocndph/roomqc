// Hooks cho lịch giá theo ngày (rate plans + daily prices + room_type availability)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { toDateKey, type DailyPrice, type RatePlanLite } from '@/lib/pricing/rate-plan-constants'

// ID quy ước cho gói chuẩn ảo (chưa materialize vào DB)
export const VIRTUAL_DEFAULT_PLAN_ID = '__default__'

// ===== Rate plans =====
export interface RatePlanRow extends RatePlanLite {
  tenant_id: string
  hotel_id: string | null
  room_type_id: string
  is_default?: boolean
  isVirtual?: boolean
}

const ROOM_TYPE_CODE_TO_ROOM_KEYS: Record<string, string[]> = {
  STD: ['standard'],
  SUP: ['superior'],
  DLX: ['deluxe'],
  SUI: ['suite'],
  VIP: ['vip'],
}

const normalizeRoomTypeKey = (value: string | null | undefined) =>
  (value ?? '')
    .toLowerCase()
    .replace(/^phòng\s+/i, '')
    .trim()
    .replace(/\s+/g, '_')

const roomKeysFromRoomType = (roomType: { code?: string | null; name?: string | null } | null) => {
  const keys = ROOM_TYPE_CODE_TO_ROOM_KEYS[(roomType?.code ?? '').toUpperCase()] ?? []
  const fromName = normalizeRoomTypeKey(roomType?.name)
  return Array.from(new Set([...keys, ...(fromName ? [fromName] : [])]))
}

// ===== Default rate (từ room_type_rates) =====
export const useRoomTypeRate = (roomTypeId: string | null) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['room-type-rate', tenantId, roomTypeId],
    queryFn: async () => {
      if (!tenantId || !roomTypeId) return null
      const { data, error } = await supabase
        .from('room_type_rates')
        .select('daily_rate, hotel_id')
        .eq('tenant_id', tenantId)
        .eq('room_type_id', roomTypeId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!tenantId && !!roomTypeId,
  })
}

export const useRatePlans = (roomTypeId: string | null) => {
  const { tenantId } = useUser()
  const { data: defaultRate } = useRoomTypeRate(roomTypeId)
  return useQuery({
    queryKey: ['rate-plans', tenantId, roomTypeId, defaultRate?.daily_rate ?? null],
    queryFn: async () => {
      if (!tenantId || !roomTypeId) return [] as RatePlanRow[]
      const { data, error } = await supabase
        .from('rate_plans' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('room_type_id', roomTypeId)
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      const real = ((data ?? []) as unknown) as RatePlanRow[]
      if (real.length > 0) return real
      const price = Number(defaultRate?.daily_rate ?? 0)
      const virtual: RatePlanRow = {
        id: VIRTUAL_DEFAULT_PLAN_ID,
        tenant_id: tenantId,
        hotel_id: defaultRate?.hotel_id ?? null,
        room_type_id: roomTypeId,
        name: 'Giá tiêu chuẩn',
        price,
        sale_price: null,
        sale_start_date: null,
        sale_end_date: null,
        inclusions: [],
        policies: [],
        is_active: true,
        sort_order: 0,
        is_default: true,
        isVirtual: true,
      } as unknown as RatePlanRow
      return [virtual]
    },
    enabled: !!tenantId && !!roomTypeId,
  })
}

// Materialize gói chuẩn ảo thành row thực
export const ensureDefaultRatePlan = async (roomTypeId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('ensure_default_rate_plan' as any, {
    p_room_type_id: roomTypeId,
  })
  if (error) throw error
  return data as unknown as string
}

export const useSaveRatePlans = () => {
  const qc = useQueryClient()
  const { tenantId } = useUser()
  return useMutation({
    mutationFn: async (args: {
      roomTypeId: string
      hotelId: string | null
      plans: Array<Partial<RatePlanRow> & { name: string; price: number }>
    }) => {
      if (!tenantId) throw new Error('Thiếu tenant')
      // Xoá toàn bộ rồi insert lại (như Deal Hotel Hub) — đơn giản và idempotent
      await supabase
        .from('rate_plans' as any)
        .delete()
        .eq('tenant_id', tenantId)
        .eq('room_type_id', args.roomTypeId)

      if (args.plans.length > 0) {
        const rows = args.plans.map((p, i) => ({
          tenant_id: tenantId,
          hotel_id: args.hotelId,
          room_type_id: args.roomTypeId,
          name: p.name,
          price: p.price,
          sale_price: p.sale_price ?? null,
          sale_start_date: p.sale_start_date ?? null,
          sale_end_date: p.sale_end_date ?? null,
          inclusions: p.inclusions ?? [],
          policies: p.policies ?? [],
          is_active: p.is_active ?? true,
          sort_order: i,
        }))
        const { error } = await supabase.from('rate_plans' as any).insert(rows as any)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-plans'] })
      toast.success('Đã lưu gói giá')
    },
    onError: (e: any) => toast.error(e.message || 'Lưu thất bại'),
  })
}

// ===== Daily prices =====
export const useDailyPrices = (
  roomTypeId: string | null,
  planIds: string[],
  fromDate: Date,
  toDate: Date,
) => {
  const { tenantId } = useUser()
  const realPlanIds = planIds.filter(id => id !== VIRTUAL_DEFAULT_PLAN_ID)
  return useQuery({
    queryKey: ['daily-prices', tenantId, roomTypeId, realPlanIds.join(','), toDateKey(fromDate), toDateKey(toDate)],
    queryFn: async () => {
      if (!tenantId || realPlanIds.length === 0) return new Map<string, DailyPrice>()
      const { data, error } = await supabase
        .from('rate_plan_daily_prices' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .in('rate_plan_id', realPlanIds)
        .gte('date', toDateKey(fromDate))
        .lte('date', toDateKey(toDate))
      if (error) throw error
      const map = new Map<string, DailyPrice>()
      ;(data ?? []).forEach((d: any) => {
        map.set(`${d.rate_plan_id}|${d.date}`, {
          rate_plan_id: d.rate_plan_id,
          date: d.date,
          price: d.price,
          sale_price: d.sale_price,
          is_closed: d.is_closed,
        })
      })
      return map
    },
    enabled: !!tenantId,
  })
}

// ===== Room type availability =====
export const useRoomTypeAvailability = (
  roomTypeId: string | null,
  fromDate: Date,
  toDate: Date,
) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['rt-availability', tenantId, roomTypeId, toDateKey(fromDate), toDateKey(toDate)],
    queryFn: async () => {
      if (!tenantId || !roomTypeId) return new Map<string, { qty: number; isClosed: boolean }>()
      const { data, error } = await supabase
        .from('room_type_availability' as any)
        .select('date, available_qty, is_closed')
        .eq('tenant_id', tenantId)
        .eq('room_type_id', roomTypeId)
        .gte('date', toDateKey(fromDate))
        .lte('date', toDateKey(toDate))
      if (error) throw error
      const map = new Map<string, { qty: number; isClosed: boolean }>()
      ;(data ?? []).forEach((a: any) => map.set(a.date, { qty: a.available_qty, isClosed: !!a.is_closed }))
      return map
    },
    enabled: !!tenantId && !!roomTypeId,
  })
}

// ===== Default qty cho hạng phòng (đếm số phòng vật lý đang active) =====
export const useRoomTypeDefaultQty = (roomTypeId: string | null) => {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  return useQuery({
    queryKey: ['rt-default-qty', tenantId, isAllHotelsMode ? null : selectedHotel?.id ?? null, roomTypeId],
    queryFn: async () => {
      if (!tenantId || !roomTypeId) return 0
      const { data: roomType, error: roomTypeError } = await supabase
        .from('room_types')
        .select('code, name')
        .eq('tenant_id', tenantId)
        .eq('id', roomTypeId)
        .maybeSingle()
      if (roomTypeError) throw roomTypeError

      const roomKeys = roomKeysFromRoomType(roomType as { code?: string | null; name?: string | null } | null)
      if (roomKeys.length === 0) return 0

      let query = supabase
        .from('rooms' as any)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('room_type', roomKeys)

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    },
    enabled: !!tenantId && !!roomTypeId,
  })
}

// ===== Resolved daily prices (Unified Pipeline) =====
export interface ResolvedDailyPrice {
  date: string
  base_price: number
  override_price: number | null
  final_price: number
  is_closed: boolean
  source: 'override' | 'seasonal' | 'base'
  seasonals: Array<{
    id: string
    name: string
    mode: 'add_on' | 'overwrite'
    adjust_type: 'percent' | 'fixed_amount' | 'set_rate'
    adjust_value: number
    delta?: number
    priority: number
  }>
}

export const useResolvedDailyPrices = (
  roomTypeId: string | null,
  fromDate: Date,
  toDate: Date,
  applyTo: 'daily' | 'overnight' | 'hourly' | 'monthly' = 'daily',
  hotelId?: string | null,
) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['resolved-daily-prices', tenantId, roomTypeId, toDateKey(fromDate), toDateKey(toDate), applyTo, hotelId ?? null],
    queryFn: async () => {
      if (!tenantId || !roomTypeId) return new Map<string, ResolvedDailyPrice>()
      const { data, error } = await supabase.rpc('resolve_daily_prices_bulk' as any, {
        p_room_type_id: roomTypeId,
        p_from: toDateKey(fromDate),
        p_to: toDateKey(toDate),
        p_apply_to: applyTo,
        p_hotel_id: hotelId ?? null,
      })
      if (error) throw error
      const map = new Map<string, ResolvedDailyPrice>()
      ;((data ?? []) as any[]).forEach((r) => {
        map.set(r.date, {
          date: r.date,
          base_price: Number(r.base_price ?? 0),
          override_price: r.override_price != null ? Number(r.override_price) : null,
          final_price: Number(r.final_price ?? 0),
          is_closed: !!r.is_closed,
          source: r.source,
          seasonals: Array.isArray(r.seasonals) ? r.seasonals : [],
        })
      })
      return map
    },
    enabled: !!tenantId && !!roomTypeId,
    staleTime: 30_000,
  })
}

// ===== Pricing health summary =====
export interface PricingHealth {
  room_types_total: number
  room_types_with_rate: number
  room_types_missing_rate: number
  seasonal_active: number
  seasonal_conflicts: number
}

export const usePricingHealth = (hotelId?: string | null) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['pricing-health', tenantId, hotelId ?? null],
    queryFn: async (): Promise<PricingHealth> => {
      const { data, error } = await supabase.rpc('get_pricing_health' as any, {
        p_hotel_id: hotelId ?? null,
      })
      if (error) throw error
      return (data ?? {}) as PricingHealth
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })
}

// ===== Today's prices for all room types in a hotel =====
export interface TodayPriceRow {
  room_type_id: string
  room_type_name: string
  room_type_code: string | null
  base_price: number
  final_price: number
  has_seasonal: boolean
  has_override: boolean
  is_closed: boolean
}

const normalizeRoomTypeMatchKey = (s: string | null | undefined) =>
  (s ?? '')
    .toString()
    .toLowerCase()
    .replace(/^phòng\s+/i, '')
    .trim()

export const useTodayPricesByHotel = (hotelId?: string | null, applyTo: 'daily' | 'overnight' = 'daily') => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['today-prices-by-hotel', tenantId, hotelId ?? null, applyTo],
    queryFn: async (): Promise<Map<string, TodayPriceRow>> => {
      if (!tenantId || !hotelId) return new Map()
      const { data, error } = await supabase.rpc('resolve_today_prices_for_hotel' as any, {
        p_hotel_id: hotelId,
        p_apply_to: applyTo,
      })
      if (error) throw error
      const map = new Map<string, TodayPriceRow>()
      ;((data ?? []) as any[]).forEach((r) => {
        const row: TodayPriceRow = {
          room_type_id: r.room_type_id,
          room_type_name: r.room_type_name,
          room_type_code: r.room_type_code ?? null,
          base_price: Number(r.base_price ?? 0),
          final_price: Number(r.final_price ?? 0),
          has_seasonal: !!r.has_seasonal,
          has_override: !!r.has_override,
          is_closed: !!r.is_closed,
        }
        // Index by multiple keys so room.room_type ("deluxe") can match room_types.name ("Phòng Deluxe")
        const keys = new Set<string>()
        keys.add((r.room_type_name ?? '').toLowerCase())
        keys.add(normalizeRoomTypeMatchKey(r.room_type_name))
        if (r.room_type_code) keys.add(String(r.room_type_code).toLowerCase())
        keys.forEach((k) => { if (k && !map.has(k)) map.set(k, row) })
      })
      return map
    },
    enabled: !!tenantId && !!hotelId,
    staleTime: 10_000,
    refetchOnMount: 'always',
  })
}



