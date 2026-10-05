import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { startOfMonth, endOfMonth, subMonths, format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subWeeks, subQuarters, subYears, differenceInDays } from 'date-fns'

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
  const otaCommission = filtered.reduce((s, b) => s + (b.ota_commission_amount || 0), 0)
  const discountAmount = 0 // room_bookings không có cột discount; chờ schema mở rộng
  const vatAmount = filtered.reduce((s, b) => s + (b.vat_amount || 0), 0)

  // Net revenue: ưu tiên DB.net_revenue (đã trừ commission). Fallback: gross − commission.
  // Lưu ý: chưa trừ VAT vì chưa có flag vat_inclusive ở booking — tránh double-discount.
  const netRevenue = filtered.reduce((s, b) => {
    // Một số dữ liệu cũ lưu net_revenue = 0 dù booking có doanh thu. Chỉ coi
    // 0 là giá trị hợp lệ khi booking thực sự không có tổng tiền.
    if (b.net_revenue != null && (b.net_revenue !== 0 || (b.total_amount || 0) === 0)) {
      return s + (b.net_revenue || 0)
    }
    return s + ((b.total_amount || 0) - (b.ota_commission_amount || 0))
  }, 0)

  const earlyCheckin = filtered.reduce((s, b) => s + (b.early_checkin_charge || 0), 0)
  const lateCheckout = filtered.reduce((s, b) => s + (b.late_checkout_charge || 0), 0)
  const damageCharges = filtered.reduce((s, b) => s + (b.damage_charges || 0), 0)
  const serviceCharges = filtered.reduce((s, b) => s + (b.service_charges || 0), 0)
  const extraCharges = filtered.reduce((s, b) => s + (b.extra_charges || 0), 0)

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

function getPeriodRange(period: ReportPeriod, today: Date, customRange?: { start: Date; end: Date }) {
  switch (period) {
    case 'week':
      return {
        currentStart: startOfWeek(today, { weekStartsOn: 1 }),
        currentEnd: endOfWeek(today, { weekStartsOn: 1 }),
        previousStart: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
        previousEnd: endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
      }
    case 'quarter':
      return {
        currentStart: startOfQuarter(today),
        currentEnd: endOfQuarter(today),
        previousStart: startOfQuarter(subQuarters(today, 1)),
        previousEnd: endOfQuarter(subQuarters(today, 1)),
      }
    case 'year':
      return {
        currentStart: startOfYear(today),
        currentEnd: endOfYear(today),
        previousStart: startOfYear(subYears(today, 1)),
        previousEnd: endOfYear(subYears(today, 1)),
      }
    case 'custom': {
      const start = customRange?.start ?? startOfMonth(today)
      const end = customRange?.end ?? endOfMonth(today)
      const days = Math.max(1, differenceInDays(end, start) + 1)
      const prevEnd = new Date(start.getTime() - 1)
      const prevStart = new Date(prevEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
      return {
        currentStart: startOfDay(start),
        currentEnd: endOfDay(end),
        previousStart: startOfDay(prevStart),
        previousEnd: endOfDay(prevEnd),
      }
    }
    default:
      return {
        currentStart: startOfMonth(today),
        currentEnd: endOfMonth(today),
        previousStart: startOfMonth(subMonths(today, 1)),
        previousEnd: endOfMonth(subMonths(today, 1)),
      }
  }
}

const BOOKING_TYPE_LABELS: Record<string, string> = {
  daily: 'Theo ngày',
  hourly: 'Theo giờ',
  monthly: 'Theo tháng',
}

export function useRevenueReport(period: ReportPeriod = 'month', customRange?: { start: Date; end: Date }) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  const customKey = period === 'custom' && customRange
    ? `${customRange.start.toISOString()}_${customRange.end.toISOString()}`
    : ''

  return useQuery({
    queryKey: ['revenue-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, period, customKey],
    queryFn: async (): Promise<RevenueReport> => {
      const today = new Date()
      const startOfTodayISO = startOfDay(today).toISOString()
      const endOfTodayISO = endOfDay(today).toISOString()
      const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodRange(period, today, customRange)

      // Cover ≥6 tháng cho trends + đủ range custom nếu user chọn xa hơn
      const sixMonthsAgo = subMonths(today, 6)
      const fetchFrom = period === 'custom' && customRange && customRange.start < sixMonthsAgo
        ? startOfDay(customRange.start)
        : startOfDay(sixMonthsAgo)
      const fetchFromISO = fetchFrom.toISOString()

      // CRITICAL: refuse to query without tenantId (avoid pulling all tenants)
      if (!tenantId) {
        return {
          today: emptyRevenueData(),
          currentPeriod: emptyRevenueData(),
          previousPeriod: emptyRevenueData(),
          monthlyTrends: [],
          revenueGrowth: 0,
          byType: [],
          bySource: [],
          topRooms: [],
        }
      }

      // Query bookings — bao gồm cả service_charges, extra_charges, VAT
      // P0 FIX: chỉ tính doanh thu từ booking đã hoàn tất (checked_out).
      // Loại pending/cancelled/no_show để tránh overstate.
      let query = supabase.from('room_bookings').select(
        'check_out_date, total_amount, amount_paid, deposit_amount, payment_status, booking_type, booking_source, ota_commission_amount, net_revenue, early_checkin_charge, late_checkout_charge, damage_charges, service_charges, extra_charges, vat_amount, room_id, room:rooms!room_bookings_room_id_fkey(room_number, room_type)',
      )
        .eq('tenant_id', tenantId)
        .eq('status', 'checked_out')
        .gte('check_out_date', fetchFromISO)
        .limit(10000)

      if (!isAllHotelsMode && selectedHotel?.id) query = query.eq('hotel_id', selectedHotel.id)

      const { data: allBookings, error } = await query
      if (error) throw error

      const bookings = (allBookings || []) as unknown as RevenueBookingRow[]

      const filterByDateRange = (start: Date, end: Date) =>
        bookings.filter(b => {
          if (!b.check_out_date) return false
          const d = new Date(b.check_out_date)
          return d >= start && d <= end
        })

      const todayBookings = filterByDateRange(new Date(startOfTodayISO), new Date(endOfTodayISO))
      const currentPeriodBookings = filterByDateRange(currentStart, currentEnd)
      const previousPeriodBookings = filterByDateRange(previousStart, previousEnd)

      // Monthly trends (last 6 months) — revenue = amount_paid + deposit_amount
      const monthlyTrends: RevenueTrend[] = []
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(today, i)
        const mBookings = bookings.filter(b => {
          if (!b.check_out_date) return false
          const d = new Date(b.check_out_date)
          return d >= startOfMonth(m) && d <= endOfMonth(m) && b.payment_status !== 'refunded'
        })
        monthlyTrends.push({
          month: format(m, 'MM/yyyy'),
          revenue: mBookings.reduce((s, b) => s + (b.amount_paid || 0) + (b.deposit_amount || 0), 0),
          bookings: mBookings.length,
        })
      }

      // By booking type
      const typeGroups: Record<string, RevenueBookingRow[]> = {}
      currentPeriodBookings.forEach(b => {
        const t = b.booking_type || 'daily'
        if (!typeGroups[t]) typeGroups[t] = []
        typeGroups[t].push(b)
      })
      const totalCurrentRevenue = currentPeriodBookings.reduce((s, b) => s + (b.total_amount || 0), 0)
      const byType: RevenueByType[] = Object.entries(typeGroups).map(([type, items]) => {
        const rev = items.reduce((s, b) => s + (b.total_amount || 0), 0)
        return {
          type, label: BOOKING_TYPE_LABELS[type] || type,
          bookings: items.length, revenue: rev,
          percentage: totalCurrentRevenue > 0 ? (rev / totalCurrentRevenue) * 100 : 0,
        }
      })

      // By booking source
      const sourceGroups: Record<string, RevenueBookingRow[]> = {}
      currentPeriodBookings.forEach(b => {
        const s = b.booking_source || 'direct'
        if (!sourceGroups[s]) sourceGroups[s] = []
        sourceGroups[s].push(b)
      })
      const bySource: RevenueBySource[] = Object.entries(sourceGroups).map(([source, items]) => {
        const gross = items.reduce((s, b) => s + (b.total_amount || 0), 0)
        const commission = items.reduce((s, b) => s + (b.ota_commission_amount || 0), 0)
        return {
          source, bookings: items.length, grossRevenue: gross,
          otaCommission: commission, netRevenue: gross - commission,
          percentage: totalCurrentRevenue > 0 ? (gross / totalCurrentRevenue) * 100 : 0,
        }
      })

      // Top rooms — include service + extra charges trong surcharges
      const roomGroups: Record<string, { bookings: RevenueBookingRow[]; roomNumber: string; roomType: string }> = {}
      currentPeriodBookings.forEach(b => {
        const rid = b.room_id || 'unknown'
        const room = b.room as { room_number?: string; room_type?: string } | null
        if (!roomGroups[rid]) {
          roomGroups[rid] = { bookings: [], roomNumber: room?.room_number || '?', roomType: room?.room_type || '' }
        }
        roomGroups[rid].bookings.push(b)
      })
      const topRooms: RoomRevenue[] = Object.entries(roomGroups)
        .map(([roomId, { bookings: items, roomNumber, roomType }]) => {
          const revenue = items.reduce((s, b) => s + (b.total_amount || 0), 0)
          const surcharges = items.reduce(
            (s, b) =>
              s +
              (b.early_checkin_charge || 0) +
              (b.late_checkout_charge || 0) +
              (b.damage_charges || 0) +
              (b.service_charges || 0) +
              (b.extra_charges || 0),
            0,
          )
          return { roomId, roomNumber, roomType, bookings: items.length, revenue, surcharges, total: revenue + surcharges }
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)

      const currentData = computeRevenueData(currentPeriodBookings)
      const previousData = computeRevenueData(previousPeriodBookings)
      const revenueGrowth = previousData.paidRevenue > 0
        ? ((currentData.paidRevenue - previousData.paidRevenue) / previousData.paidRevenue) * 100
        : 0

      return {
        today: computeRevenueData(todayBookings),
        currentPeriod: currentData,
        previousPeriod: previousData,
        monthlyTrends, revenueGrowth,
        byType, bySource, topRooms,
      }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
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
