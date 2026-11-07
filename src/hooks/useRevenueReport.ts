import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { format } from 'date-fns'

export type ReportPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom'

export interface RevenueData {
  totalRevenue: number
  paidRevenue: number
  pendingRevenue: number
  refundedRevenue: number
  bookingsCount: number
  paidBookingsCount: number
  averageBookingValue: number
  /** = gross_total − discount − ota_commission − vat_passthrough (theo memory advanced-revenue-analytics-v1) */
  netRevenue: number
  otaCommission: number
  discountAmount: number
  vatAmount: number
  surcharges: {
    earlyCheckin: number
    lateCheckout: number
    damageCharges: number
    /** Phí dịch vụ (spa, đưa đón, ăn uống...) */
    serviceCharges: number
    /** Phí phát sinh khác (minibar, đồ tiêu hao tính tiền...) */
    extraCharges: number
    total: number
  }
}

export interface RevenueTrend {
  month: string
  revenue: number
  bookings: number
}

export interface RevenueByType {
  type: string
  label: string
  bookings: number
  revenue: number
  percentage: number
}

export interface RevenueBySource {
  source: string
  bookings: number
  grossRevenue: number
  otaCommission: number
  netRevenue: number
  percentage: number
}

export interface RoomRevenue {
  roomId: string
  roomNumber: string
  roomType: string
  bookings: number
  revenue: number
  surcharges: number
  total: number
}

export interface RevenueReport {
  today: RevenueData
  currentPeriod: RevenueData
  previousPeriod: RevenueData
  monthlyTrends: RevenueTrend[]
  revenueGrowth: number
  byType: RevenueByType[]
  bySource: RevenueBySource[]
  topRooms: RoomRevenue[]
  recognizedMonthlyTrends: RevenueTrend[]
  noShow: {
    today: NoShowRevenueData
    currentPeriod: NoShowRevenueData
    previousPeriod: NoShowRevenueData
    monthlyTrends: { month: string; retainedAmount: number; refundDueAmount: number }[]
    /** All unresolved no-shows in the allowed hotels, independent of the selected period. */
    review: { unclassifiedBookings: number; unallocatedPrepaymentAmount: number }
  }
  recognitionTimezone: string
  periodStart: string
  periodEnd: string
}

export interface NoShowRevenueData {
  retainedAmount: number
  refundDueAmount: number
  resolutionsCount: number
  /** Classification of an earlier deposit never creates cash. */
  cashMovement: 0
}

export function recognizedRevenue(report: RevenueReport, period: 'today' | 'currentPeriod' | 'previousPeriod') {
  return report[period].netRevenue + report.noShow[period].retainedAmount
}

export function recognizedRevenueGrowth(report: RevenueReport) {
  const previous = recognizedRevenue(report, 'previousPeriod')
  return previous > 0 ? (recognizedRevenue(report, 'currentPeriod') - previous) / previous * 100 : 0
}

/** Shape booking dùng cho tính toán (rút gọn khỏi DB row). */
export interface RevenueBookingRow {
  check_out_date: string | Date | null
  total_amount: number | null
  amount_paid: number | null
  deposit_amount: number | null
  payment_status: string | null
  booking_type: string | null
  booking_source: string | null
  ota_commission_amount: number | null
  net_revenue: number | null
  early_checkin_charge: number | null
  late_checkout_charge: number | null
  damage_charges: number | null
  service_charges: number | null
  extra_charges: number | null
  vat_amount?: number | null
  room_id?: string | null
  room?: { room_number?: string; room_type?: string } | null
}

export function emptyRevenueData(): RevenueData {
  return {
    totalRevenue: 0,
    paidRevenue: 0,
    pendingRevenue: 0,
    refundedRevenue: 0,
    bookingsCount: 0,
    paidBookingsCount: 0,
    averageBookingValue: 0,
    netRevenue: 0,
    otaCommission: 0,
    discountAmount: 0,
    vatAmount: 0,
    surcharges: { earlyCheckin: 0, lateCheckout: 0, damageCharges: 0, serviceCharges: 0, extraCharges: 0, total: 0 },
  }
}

/**
 * Pure function: tính RevenueData từ tập booking đã lọc theo kỳ.
 * Tách ra để dễ unit test.
 *
 * Quy ước:
 * - `paidRevenue` = amount_paid + deposit_amount (cọc cũng là tiền đã thu).
 * - `pendingRevenue` = max(0, total - paid - deposit).
 * - `refundedRevenue` = total của booking có payment_status='refunded'.
 * - `netRevenue` = ưu tiên cột DB `net_revenue`; fallback gross − discount − commission − vat_passthrough.
 *   VAT passthrough chỉ áp dụng khi vat_inclusive = false (giá chưa gồm VAT, VAT là tiền chuyển nhà nước).
 * - `surcharges` gộp 5 thành phần: check-in sớm, checkout trễ, hư hỏng, phí dịch vụ, phí phát sinh.
 */
export function computeRevenueData(filtered: RevenueBookingRow[]): RevenueData {
  const refunded = filtered.filter(b => b.payment_status === 'refunded')
  const nonRefunded = filtered.filter(b => b.payment_status !== 'refunded')

  const paidRevenue = nonRefunded.reduce(
    (s, b) => s + (b.amount_paid || 0) + (b.deposit_amount || 0),
    0,
  )
  const pendingRevenue = nonRefunded.reduce(
    (s, b) => s + Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0) - (b.deposit_amount || 0)),
    0,
  )
  const refundedRevenue = refunded.reduce((s, b) => s + (b.total_amount || 0), 0)
  const totalRevenue = paidRevenue + pendingRevenue
  const paidBookings = nonRefunded.filter(b => b.payment_status === 'paid')
  const otaCommission = nonRefunded.reduce((s, b) => s + (b.ota_commission_amount || 0), 0)
  const discountAmount = 0 // room_bookings không có cột discount; chờ schema mở rộng
  const vatAmount = nonRefunded.reduce((s, b) => s + (b.vat_amount || 0), 0)

  // Net revenue: ưu tiên DB.net_revenue (đã trừ commission). Fallback: gross − commission.
  // Lưu ý: chưa trừ VAT vì chưa có flag vat_inclusive ở booking — tránh double-discount.
  const netRevenue = nonRefunded.reduce((s, b) => {
    // Một số dữ liệu cũ lưu net_revenue = 0 dù booking có doanh thu. Chỉ coi
    // 0 là giá trị hợp lệ khi booking thực sự không có tổng tiền.
    if (b.net_revenue != null && (b.net_revenue !== 0 || (b.total_amount || 0) === 0)) {
      return s + (b.net_revenue || 0)
    }
    return s + ((b.total_amount || 0) - (b.ota_commission_amount || 0))
  }, 0)

  const earlyCheckin = nonRefunded.reduce((s, b) => s + (b.early_checkin_charge || 0), 0)
  const lateCheckout = nonRefunded.reduce((s, b) => s + (b.late_checkout_charge || 0), 0)
  const damageCharges = nonRefunded.reduce((s, b) => s + (b.damage_charges || 0), 0)
  const serviceCharges = nonRefunded.reduce((s, b) => s + (b.service_charges || 0), 0)
  const extraCharges = nonRefunded.reduce((s, b) => s + (b.extra_charges || 0), 0)

  return {
    totalRevenue,
    paidRevenue,
    pendingRevenue,
    refundedRevenue,
    bookingsCount: filtered.length,
    paidBookingsCount: paidBookings.length,
    averageBookingValue: filtered.length > 0 ? totalRevenue / filtered.length : 0,
    netRevenue,
    otaCommission,
    discountAmount,
    vatAmount,
    surcharges: {
      earlyCheckin,
      lateCheckout,
      damageCharges,
      serviceCharges,
      extraCharges,
      total: earlyCheckin + lateCheckout + damageCharges + serviceCharges + extraCharges,
    },
  }
}

export function useRevenueReport(period: ReportPeriod = 'month', customRange?: { start: Date; end: Date }) {
  const { user, tenantId } = useUser()
  const auth = useAuth()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  let sessionId: string | null = null
  try { const session = staffInvitationSession(auth.session); if (session.actorId === auth.user?.id) sessionId = session.sessionId } catch { /* No coherent session. */ }
  const runtime = roomCommandRuntimeScope()
  const identity = JSON.stringify([runtime, auth.user?.id, sessionId, tenantId, user?.updated_at, user?.status, user?.account_locked])
  const latest = useRef({ identity, epoch: 0 })
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch
  const today = format(new Date(), 'yyyy-MM-dd')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh'
  const effectivePeriod = period === 'custom' && !customRange ? 'month' : period
  const customStart = customRange ? format(customRange.start, 'yyyy-MM-dd') : null
  const customEnd = customRange ? format(customRange.end, 'yyyy-MM-dd') : null
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id
  return useQuery({
    queryKey: ['revenue-report', runtime, auth.user?.id, sessionId, tenantId, user?.updated_at, hotelId ?? 'all', effectivePeriod, customStart, customEnd, today, timezone],
    queryFn: async ({ signal }): Promise<RevenueReport> => {
      const { data, error } = await supabase.rpc('get_revenue_report', {
        p_hotel_id: hotelId ?? undefined, p_period: effectivePeriod,
        p_custom_start: customStart ?? undefined, p_custom_end: customEnd ?? undefined,
        p_today: today, p_timezone: timezone,
      }).abortSignal(signal)
      if (error) throw error
      if (signal.aborted || latest.current.epoch !== epoch) throw new Error('Phiên xem báo cáo đã thay đổi. Vui lòng tải lại.')
      if (!data || typeof data !== 'object' || Array.isArray(data) || !('noShow' in data)) {
        throw new Error('Báo cáo chưa sẵn sàng. Vui lòng kiểm tra phiên bản máy chủ.')
      }
      return data as unknown as RevenueReport
    },
    enabled: !!tenantId && user?.id === auth.user?.id && !!sessionId && user?.status === 'active'
      && !user.account_locked && !user.deleted_at && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 1000,
  })
}

export function useOwnerAlerts() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['owner-alerts', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      const today = new Date()
      const todayStr = format(today, 'yyyy-MM-dd')

      let overdueQuery = supabase
        .from('room_bookings')
        .select('id, guest_name, check_out_date, room:rooms(room_number)')
        .eq('status', 'checked_in')
        .lt('check_out_date', todayStr)
        .limit(10)
      if (tenantId) overdueQuery = overdueQuery.eq('tenant_id', tenantId)
      if (!isAllHotelsMode && selectedHotel?.id) overdueQuery = overdueQuery.eq('hotel_id', selectedHotel.id)
      const { data: overdueCheckouts } = await overdueQuery

      let unpaidQuery = supabase
        .from('room_bookings')
        .select('id, guest_name, total_amount, amount_paid, deposit_amount, check_out_date, room:rooms(room_number)')
        .eq('status', 'checked_out')
        .neq('payment_status', 'paid')
        .limit(50)
      if (tenantId) unpaidQuery = unpaidQuery.eq('tenant_id', tenantId)
      if (!isAllHotelsMode && selectedHotel?.id) unpaidQuery = unpaidQuery.eq('hotel_id', selectedHotel.id)
      const { data: rawUnpaidBookings } = await unpaidQuery

      const unpaidBookings = (rawUnpaidBookings || []).filter(b => {
        const remaining = (b.total_amount || 0) - (b.amount_paid || 0) - (b.deposit_amount || 0)
        return remaining > 0
      })

      let damagesQuery = supabase
        .from('room_checks')
        .select('id, room:rooms(room_number), items_damaged, items_lost, checked_at')
        .or('items_damaged.neq.{},items_lost.neq.{}')
        .order('checked_at', { ascending: false })
        .limit(10) as any
      if (tenantId) damagesQuery = damagesQuery.eq('tenant_id', tenantId)
      if (!isAllHotelsMode && selectedHotel?.id) damagesQuery = damagesQuery.eq('hotel_id', selectedHotel.id)
      const { data: unresolvedDamages } = await damagesQuery

      return {
        overdueCheckouts: overdueCheckouts || [],
        unpaidBookings,
        unresolvedDamages: unresolvedDamages || [],
        totalAlerts: (overdueCheckouts?.length || 0) + unpaidBookings.length + (unresolvedDamages?.length || 0),
      }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 2 * 60 * 1000,
  })
}
