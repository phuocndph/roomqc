// Bulk apply helpers — adapt: rate_plan_daily_prices/room_type_availability + tenant_id
import { supabase } from '@/integrations/supabase/client'
import { toDateKey } from '@/lib/pricing/rate-plan-constants'

export type PriceCellPayload = {
  price?: number | null
  salePrice?: number | null
  isClosed?: boolean
}

export type AvailCellPayload = {
  qty?: number
  isClosed?: boolean
}

export async function applyPriceRange(
  ratePlanId: string,
  tenantId: string,
  dates: Date[],
  payload: PriceCellPayload,
) {
  if (!dates.length) return { error: null as any }
  const rows = dates.map((d) => ({
    tenant_id: tenantId,
    rate_plan_id: ratePlanId,
    date: toDateKey(d),
    ...(payload.price !== undefined ? { price: payload.price } : {}),
    ...(payload.salePrice !== undefined ? { sale_price: payload.salePrice } : {}),
    ...(payload.isClosed !== undefined ? { is_closed: payload.isClosed } : {}),
  }))
  const { error } = await supabase
    .from('rate_plan_daily_prices' as any)
    .upsert(rows as any, { onConflict: 'rate_plan_id,date' })
  return { error }
}

export async function resetPriceRange(ratePlanId: string, dates: Date[]) {
  if (!dates.length) return { error: null as any }
  const keys = dates.map((d) => toDateKey(d))
  const { error } = await supabase
    .from('rate_plan_daily_prices' as any)
    .delete()
    .eq('rate_plan_id', ratePlanId)
    .in('date', keys)
  return { error }
}

export async function applyAvailabilityRangeSmart(
  roomTypeId: string,
  tenantId: string,
  hotelId: string | null,
  dates: Date[],
  defaultQty: number,
  payload: AvailCellPayload,
  existing: Map<string, { qty: number; isClosed: boolean }>,
) {
  if (!dates.length) return { error: null as any }
  const rows = dates.map((d) => {
    const key = toDateKey(d)
    const cur = existing.get(key)
    const qty = payload.qty !== undefined ? payload.qty : cur?.qty ?? defaultQty
    const isClosed = payload.isClosed !== undefined ? payload.isClosed : cur?.isClosed ?? false
    return {
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      date: key,
      available_qty: Math.max(0, Math.floor(qty)),
      is_closed: isClosed,
    }
  })
  const { error } = await supabase
    .from('room_type_availability' as any)
    .upsert(rows as any, { onConflict: 'room_type_id,date' })
  return { error }
}
