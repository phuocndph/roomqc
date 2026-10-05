// Hook thống nhất giá cho 1 phòng cụ thể, dùng ở Reception/Table/FloorMap.
// Quy ước nghiệp vụ:
//  - Giá ĐÊM = linh hoạt (Base → Seasonal → Daily Override) qua resolve_today_prices_for_hotel
//  - Giá GIỜ và Giá THÁNG = cố định, đọc thẳng từ room_type_rates
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useTodayPricesByHotel } from './usePricingDaily'

const norm = (s: string | null | undefined) =>
  (s ?? '').toString().toLowerCase().replace(/^phòng\s+/i, '').trim()

export interface RoomTypePricing {
  /** Giá đêm hôm nay (đã áp seasonal/override). null nếu chưa cấu hình. */
  nightly: number | null
  nightlyBase: number | null
  nightlySource: 'base' | 'seasonal' | 'override' | null
  hasSeasonal: boolean
  hasOverride: boolean
  isClosed: boolean

  /** Giá theo giờ (cố định). null nếu chưa cấu hình. */
  hourly: number | null
  hourlyFirstBlock: { hours: number; price: number } | null

  /** Giá theo tháng (cố định). null nếu chưa cấu hình. */
  monthly: number | null

  /** Đã có row trong room_type_rates chưa */
  isConfigured: boolean
  /** Đường dẫn cài đặt giá */
  configureUrl: string
}

/**
 * @param roomTypeKey  Có thể là UUID hoặc text legacy ("deluxe", "Phòng Deluxe", "DLX")
 * @param hotelId      Hotel context để lấy giá đêm hôm nay
 */
export function useRoomTypePricing(
  roomTypeKey: string | null | undefined,
  hotelId: string | null | undefined,
): RoomTypePricing & { isLoading: boolean } {
  const { tenantId } = useUser()
  const { data: todayMap, isLoading: loadingToday } = useTodayPricesByHotel(hotelId ?? null, 'daily')

  // Resolve key → room_type_id (UUID) + lấy hourly/monthly fixed
  const fixed = useQuery({
    queryKey: ['room-type-pricing-fixed', tenantId, hotelId ?? null, roomTypeKey ?? null],
    enabled: !!tenantId && !!roomTypeKey,
    staleTime: 60_000,
    queryFn: async () => {
      if (!tenantId || !roomTypeKey) return null
      // Thử match UUID trước
      const isUuid = /^[0-9a-f-]{36}$/i.test(roomTypeKey)
      let q = supabase
        .from('room_types')
        .select('id, code, name, hotel_id')
        .eq('tenant_id', tenantId)
      if (isUuid) q = q.eq('id', roomTypeKey)
      const { data: rts } = await q
      let rt = rts?.find((x: any) => x.id === roomTypeKey) ?? null
      if (!rt && !isUuid && rts) {
        // Match code rồi name
        const k = norm(roomTypeKey)
        rt = rts.find((x: any) => (x.code ?? '').toLowerCase() === k)
          ?? rts.find((x: any) => norm(x.name) === k)
          ?? null
      }
      if (!rt && !isUuid) {
        // Fallback: select tất cả tenant rồi match
        const { data: all } = await supabase
          .from('room_types')
          .select('id, code, name, hotel_id')
          .eq('tenant_id', tenantId)
        const k = norm(roomTypeKey)
        rt = all?.find((x: any) => (x.code ?? '').toLowerCase() === k)
          ?? all?.find((x: any) => norm(x.name) === k)
          ?? null
      }
      if (!rt) return null

      const { data: rate } = await supabase
        .from('room_type_rates')
        .select('daily_rate, hourly_rate, hourly_first_block_hours, hourly_first_block_price, monthly_rate')
        .eq('tenant_id', tenantId)
        .eq('room_type_id', rt.id)
        .maybeSingle()
      return { rt, rate: rate ?? null }
    },
  })

  const rt = fixed.data?.rt
  const rate = fixed.data?.rate

  // Lookup giá đêm hôm nay từ map (đã index theo name/code/normalized)
  let today: ReturnType<NonNullable<typeof todayMap>['get']> | undefined
  if (todayMap && rt) {
    today = todayMap.get((rt.name ?? '').toLowerCase())
      ?? (rt.code ? todayMap.get(rt.code.toLowerCase()) : undefined)
      ?? todayMap.get(norm(rt.name))
  }
  // Fallback theo roomTypeKey thô (legacy)
  if (!today && todayMap && roomTypeKey) {
    today = todayMap.get(norm(roomTypeKey))
  }

  const nightly = today?.final_price ?? (rate?.daily_rate != null ? Number(rate.daily_rate) : null)
  const nightlyBase = today?.base_price ?? (rate?.daily_rate != null ? Number(rate.daily_rate) : null)
  const hasSeasonal = !!today?.has_seasonal
  const hasOverride = !!today?.has_override
  const isClosed = !!today?.is_closed
  const nightlySource: RoomTypePricing['nightlySource'] = today
    ? (hasOverride ? 'override' : hasSeasonal ? 'seasonal' : 'base')
    : (rate?.daily_rate != null ? 'base' : null)

  const hourly = rate?.hourly_rate != null ? Number(rate.hourly_rate) : null
  const hourlyFirstBlock = rate?.hourly_first_block_price != null && rate?.hourly_first_block_hours != null
    ? { hours: Number(rate.hourly_first_block_hours), price: Number(rate.hourly_first_block_price) }
    : null
  const monthly = rate?.monthly_rate != null ? Number(rate.monthly_rate) : null

  const isConfigured = !!rate
  const configureUrl = '/settings/pricing?tab=default'

  return {
    nightly: nightly != null && nightly > 0 ? nightly : null,
    nightlyBase: nightlyBase != null && nightlyBase > 0 ? nightlyBase : null,
    nightlySource,
    hasSeasonal, hasOverride, isClosed,
    hourly, hourlyFirstBlock, monthly,
    isConfigured, configureUrl,
    isLoading: loadingToday || fixed.isLoading,
  }
}
