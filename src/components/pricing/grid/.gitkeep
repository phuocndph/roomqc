// Hằng số dịch vụ kèm theo / chính sách + helper tính giá hiệu lực theo ngày.
// Port từ Deal Hotel Hub, giữ nguyên logic.

export interface InclusionMeta { label: string }
export interface PolicyMeta { label: string; tone: 'positive' | 'warning' | 'neutral' }

export const INCLUSION_LABELS: Record<string, InclusionMeta> = {
  breakfast: { label: 'Bữa sáng' },
  half_board: { label: 'Bữa sáng + tối' },
  full_board: { label: '3 bữa' },
  parking: { label: 'Bãi đỗ xe' },
  airport_transfer: { label: 'Đưa đón sân bay' },
  spa_credit: { label: 'Tín dụng spa' },
  minibar: { label: 'Minibar miễn phí' },
  late_checkout: { label: 'Trả phòng muộn' },
}

export const POLICY_LABELS: Record<string, PolicyMeta> = {
  non_refundable: { label: 'Không hoàn tiền', tone: 'warning' },
  free_cancellation: { label: 'Miễn phí hủy', tone: 'positive' },
  prepay: { label: 'Thanh toán trước', tone: 'neutral' },
  pay_at_hotel: { label: 'Thanh toán tại KS', tone: 'positive' },
}

export interface RatePlanLite {
  id: string
  name: string
  price: number | null
  sale_price: number | null
  sale_start_date: string | null
  sale_end_date: string | null
  inclusions: string[]
  policies: string[]
  is_active: boolean
  sort_order: number
}

export interface DailyPrice {
  rate_plan_id: string
  date: string
  price: number | null
  sale_price: number | null
  is_closed: boolean
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getEffectiveRatePlanPrice(plan: RatePlanLite, now: Date = new Date()): number | null {
  if (plan.price == null) return null
  if (plan.sale_price && plan.sale_price > 0) {
    const startOk = !plan.sale_start_date || new Date(plan.sale_start_date + 'T00:00:00') <= now
    const endOk = !plan.sale_end_date || new Date(plan.sale_end_date + 'T23:59:59') >= now
    if (startOk && endOk) return plan.sale_price
  }
  return plan.price
}

export function getEffectivePriceForDate(
  plan: RatePlanLite,
  dailyMap: Map<string, DailyPrice>,
  date: Date | string,
): { price: number | null; isClosed: boolean; isSale: boolean } {
  const key = typeof date === 'string' ? date : toDateKey(date)
  const daily = dailyMap.get(`${plan.id}|${key}`)
  if (daily?.is_closed) return { price: null, isClosed: true, isSale: false }
  if (daily?.sale_price && daily.sale_price > 0) {
    return { price: Number(daily.sale_price), isClosed: false, isSale: true }
  }
  if (daily?.price && daily.price > 0) {
    return { price: Number(daily.price), isClosed: false, isSale: false }
  }
  const fallback = getEffectiveRatePlanPrice(plan, typeof date === 'string' ? new Date(date + 'T12:00:00') : date)
  const isSale = fallback != null && plan.sale_price != null && fallback === Number(plan.sale_price)
  return { price: fallback, isClosed: false, isSale }
}
