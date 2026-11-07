// W1-D1 (07/11/2026): the effective price table (room-type rate, seasonal rule
// or per-day override) wins; when no table price exists, fall back to the
// room's own base price. The source is always shown so staff know which
// number they are selling.

export type RoomPriceSource = 'override' | 'seasonal' | 'table' | 'room_base' | 'none' | 'closed'

export interface TodayTablePrice {
  base_price: number
  final_price: number
  has_seasonal: boolean
  has_override: boolean
  is_closed: boolean
}

export interface ResolvedRoomPrice {
  price: number
  source: RoomPriceSource
  label: string
}

export const ROOM_PRICE_SOURCE_LABEL: Record<RoomPriceSource, string> = {
  override: 'Giá theo ngày',
  seasonal: 'Giá theo mùa',
  table: 'Bảng giá loại phòng',
  room_base: 'Giá cơ bản của phòng',
  none: 'Chưa có giá',
  closed: 'Đóng bán',
}

const positive = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function resolveRoomNightPrice(
  table: TodayTablePrice | null | undefined,
  roomBasePrice: number | null | undefined,
): ResolvedRoomPrice {
  const pick = (price: number, source: RoomPriceSource): ResolvedRoomPrice =>
    ({ price, source, label: ROOM_PRICE_SOURCE_LABEL[source] })

  if (table?.is_closed) return pick(0, 'closed')
  const tablePrice = positive(table?.final_price)
  if (table && tablePrice > 0) {
    if (table.has_override) return pick(tablePrice, 'override')
    if (table.has_seasonal) return pick(tablePrice, 'seasonal')
    return pick(tablePrice, 'table')
  }
  const base = positive(roomBasePrice)
  if (base > 0) return pick(base, 'room_base')
  return pick(0, 'none')
}

export type BookingUnit = 'daily' | 'hourly' | 'monthly'

/** Booking wizard: room-type rate for the booking unit first, then the room's
 * own price for the same unit. Returns 0 when neither exists. */
export function resolveBookingUnitPrice(
  room: {
    rate_daily?: number | null; rate_hourly?: number | null; rate_monthly?: number | null
    base_price?: number | null; hourly_price?: number | null; monthly_price?: number | null
  },
  unit: BookingUnit,
): { price: number; source: 'table' | 'room_base' | 'none' } {
  const [rate, own] = unit === 'daily'
    ? [room.rate_daily, room.base_price]
    : unit === 'hourly'
      ? [room.rate_hourly, room.hourly_price]
      : [room.rate_monthly, room.monthly_price]
  if (positive(rate) > 0) return { price: positive(rate), source: 'table' }
  if (positive(own) > 0) return { price: positive(own), source: 'room_base' }
  return { price: 0, source: 'none' }
}
