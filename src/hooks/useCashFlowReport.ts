/**
 * useCashFlowReport — Gộp toàn bộ dữ liệu Dòng tiền cho /reports/cash-flow.
 *
 * Bao gồm:
 *  - Tiền vào theo ngày (booking_payments.completed) + breakdown theo phương thức/kênh.
 *  - Tiền ra theo ngày (purchase_orders received + laundry stocked + maintenance completed).
 *  - Net cash dồn theo ngày.
 *  - So sánh Δ% với kỳ trước.
 *  - Công nợ phải thu + Aging bucket.
 *  - OTA chưa thanh toán.
 *  - Sắp phải trả (upcoming payables 30N tới).
 *
 * Tenant isolation: mọi query đều `.eq('tenant_id', tenantId)` + lọc `hotel_id`
 * theo HotelContext (null khi All Hotels mode).
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import {
  computeDelta,
  type PeriodRangeWithPrevious,
} from '@/lib/reportPeriods'

// ---------- Types ----------

export interface CashFlowDayPoint {
  date: string // yyyy-MM-dd
  inflow: number
  outflow: number
  net: number
}

export interface CashInBreakdownItem {
  key: string
  label: string
  amount: number
  count: number
}

export interface CashOutBreakdownItem {
  key: 'purchase' | 'laundry' | 'maintenance' | 'inventory_loss'
  label: string
  amount: number
  count: number
}

export interface ReceivableBooking {
  id: string
  guest_name: string | null
  room_number: string | null
  check_out_date: string | null
  total_amount: number
  amount_paid: number
  deposit_amount: number
  debt: number
  age_days: number
  booking_source: string | null
}

export interface AgingBucket {
  key: '0_7' | '8_30' | '31_60' | '60_plus'
  label: string
  count: number
  amount: number
}

export interface OtaPendingItem {
  source: string
  label: string
  bookings: number
  gross: number
  commission: number
  netExpected: number
  alreadyPaid: number
  pending: number
}

export interface UpcomingPayableItem {
  id: string
  kind: 'po' | 'maintenance'
  code: string
  label: string
  due_date: string | null
  amount: number
  days_to_due: number | null
}

export interface CashFlowReport {
  loading: boolean
  // KPI
  cashIn: { value: number; delta: number | null }
  cashOut: { value: number; delta: number | null }
  netCash: { value: number; delta: number | null }
  receivablesTotal: { value: number; delta: number | null }

  // Trend
  daily: CashFlowDayPoint[]

  // Breakdown
  cashInByChannel: CashInBreakdownItem[]
  cashOutByGroup: CashOutBreakdownItem[]

  // Tables
  aging: AgingBucket[]
  topReceivables: ReceivableBooking[]
  otaPending: OtaPendingItem[]
  upcomingPayables: UpcomingPayableItem[]
}

// ---------- Helpers ----------

const OTA_SOURCE_LABELS: Record<string, string> = {
  ota_booking: 'Booking.com',
  ota_agoda: 'Agoda',
  ota_traveloka: 'Traveloka',
  ota_expedia: 'Expedia',
  ota_airbnb: 'Airbnb',
  ota_other: 'OTA khác',
}

function labelChannel(method: string, isOta: boolean): string {
  if (isOta) return 'OTA'
  if (method === 'cash') return 'Tiền mặt'
  if (method === 'bank_transfer') return 'Chuyển khoản'
  return method || 'Khác'
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildDayMap(start: Date, end: Date) {
  const map = new Map<string, CashFlowDayPoint>()
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const last = new Date(end)
  last.setHours(0, 0, 0, 0)
  while (d <= last) {
    map.set(fmtDate(d), { date: fmtDate(d), inflow: 0, outflow: 0, net: 0 })
    d.setDate(d.getDate() + 1)
  }
  return map
}

function ageDays(refIso: string | null | undefined, now: Date): number {
  if (!refIso) return 0
  const ref = new Date(refIso)
  const diff = Math.floor((now.getTime() - ref.getTime()) / 86_400_000)
  return Math.max(0, diff)
}

function agingBucketOf(days: number): AgingBucket['key'] {
  if (days <= 7) return '0_7'
  if (days <= 30) return '8_30'
  if (days <= 60) return '31_60'
  return '60_plus'
}

// ---------- Hook ----------

interface RawPayment {
  amount: number
  paid_at: string
  payment_method: string
  booking_id: string | null
  booking?: { booking_source: string | null } | null
}

interface RawPO {
  id: string
  po_code: string
  total_amount: number
  status: string
  actual_delivery_date: string | null
  expected_delivery_date: string | null
  vendor?: { name: string | null } | null
}

interface RawLaundry {
  id: string
  status: string
  actual_cost: number | null
  estimated_cost: number | null
  actual_return_date: string | null
}

interface RawMaintenance {
  id: string
  status: string
  actual_cost: number | null
  updated_at: string
  expected_completion_date: string | null
  title?: string | null
}

interface RawBookingDebt {
  id: string
  guest_name: string | null
  check_out_date: string | null
  total_amount: number
  amount_paid: number
  deposit_amount: number
  payment_status: string
  booking_source: string | null
  ota_commission_amount: number | null
  ota_paid_amount: number | null
  room?: { room_number: string | null } | null
}

export function useCashFlowReport(period: PeriodRangeWithPrevious) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const hotelKey = isAllHotelsMode ? 'all' : hotelId ?? 'none'

  const q = useQuery({
    queryKey: [
      'cash-flow-report',
      tenantId,
      hotelKey,
      period.current.start.toISOString(),
      period.current.end.toISOString(),
    ],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CashFlowReport> => {
      if (!tenantId) throw new Error('No tenant')

      const startIso = period.current.start.toISOString()
      const endIso = period.current.end.toISOString()
      const prevStartIso = period.previous.start.toISOString()
      const prevEndIso = period.previous.end.toISOString()
      const startDate = period.current.start.toISOString().slice(0, 10)
      const endDate = period.current.end.toISOString().slice(0, 10)
      const now = new Date()
      const upcomingEnd = new Date(now)
      upcomingEnd.setDate(upcomingEnd.getDate() + 30)
      const upcomingEndDate = upcomingEnd.toISOString().slice(0, 10)
      const todayDate = now.toISOString().slice(0, 10)

      // -------- Cash IN (current + previous) ----------
      const payQ = supabase
        .from('booking_payments')
        .select(
          'amount, paid_at, payment_method, booking_id, booking:room_bookings!booking_payments_booking_id_fkey(booking_source)',
        )
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'completed')
        .gte('paid_at', startIso)
        .lte('paid_at', endIso)
      if (hotelId) payQ.eq('hotel_id', hotelId)

      const payPrevQ = supabase
        .from('booking_payments')
        .select('amount')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'completed')
        .gte('paid_at', prevStartIso)
        .lte('paid_at', prevEndIso)
      if (hotelId) payPrevQ.eq('hotel_id', hotelId)

      // -------- Cash OUT — Purchase Orders ----------
      const poQ = supabase
        .from('purchase_orders')
        .select('id, po_code, total_amount, status, actual_delivery_date, expected_delivery_date, vendor:vendors(name)')
        .eq('tenant_id', tenantId)
        .in('status', ['received', 'partial'])
        .gte('actual_delivery_date', startDate)
        .lte('actual_delivery_date', endDate)
      if (hotelId) poQ.eq('hotel_id', hotelId)

      const poPrevQ = supabase
        .from('purchase_orders')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .in('status', ['received', 'partial'])
        .gte('actual_delivery_date', prevStartIso.slice(0, 10))
        .lte('actual_delivery_date', prevEndIso.slice(0, 10))
      if (hotelId) poPrevQ.eq('hotel_id', hotelId)

      // -------- Cash OUT — Laundry ----------
      const laundryQ = supabase
        .from('laundry_batches')
        .select('id, status, actual_cost, estimated_cost, actual_return_date')
        .eq('tenant_id', tenantId)
        .eq('status', 'stocked')
        .gte('actual_return_date', startIso)
        .lte('actual_return_date', endIso)
      if (hotelId) laundryQ.eq('hotel_id', hotelId)

      const laundryPrevQ = supabase
        .from('laundry_batches')
        .select('actual_cost, estimated_cost')
        .eq('tenant_id', tenantId)
        .eq('status', 'stocked')
        .gte('actual_return_date', prevStartIso)
        .lte('actual_return_date', prevEndIso)
      if (hotelId) laundryPrevQ.eq('hotel_id', hotelId)

      // -------- Cash OUT — Maintenance ----------
      const maintQ = supabase
        .from('maintenance_requests')
        .select('id, status, actual_cost, updated_at, expected_completion_date, title')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gt('actual_cost', 0)
        .gte('updated_at', startIso)
        .lte('updated_at', endIso)
      if (hotelId) maintQ.eq('hotel_id', hotelId)

      const maintPrevQ = supabase
        .from('maintenance_requests')
        .select('actual_cost')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gt('actual_cost', 0)
        .gte('updated_at', prevStartIso)
        .lte('updated_at', prevEndIso)
      if (hotelId) maintPrevQ.eq('hotel_id', hotelId)

      // -------- Receivables (all unpaid bookings to-date) ----------
      const debtQ = supabase
        .from('room_bookings')
        .select(
          'id, guest_name, check_out_date, total_amount, amount_paid, deposit_amount, payment_status, booking_source, ota_commission_amount, ota_paid_amount, room:rooms!room_bookings_room_id_fkey(room_number)',
        )
        .eq('tenant_id', tenantId)
        .neq('payment_status', 'paid')
        .lte('check_out_date', todayDate)
        .limit(2000)
      if (hotelId) debtQ.eq('hotel_id', hotelId)

      // -------- Upcoming payables — PO chưa nhận, đến hạn trong 30N ----------
      const upPoQ = supabase
        .from('purchase_orders')
        .select('id, po_code, total_amount, status, expected_delivery_date, vendor:vendors(name)')
        .eq('tenant_id', tenantId)
        .in('status', ['ordered', 'approved', 'submitted', 'partial'])
        .lte('expected_delivery_date', upcomingEndDate)
        .limit(100)
      if (hotelId) upPoQ.eq('hotel_id', hotelId)

      // -------- Upcoming payables — Maintenance đang xử lý, có ước tính chi phí ----------
      const upMaintQ = supabase
        .from('maintenance_requests')
        .select('id, title, status, actual_cost, estimated_cost, expected_completion_date')
        .eq('tenant_id', tenantId)
        .in('status', ['in_progress', 'pending'])
        .or('actual_cost.gt.0,estimated_cost.gt.0')
        .lte('expected_completion_date', upcomingEnd.toISOString())
        .limit(100)
      if (hotelId) upMaintQ.eq('hotel_id', hotelId)

      const [
        payRes,
        payPrevRes,
        poRes,
        poPrevRes,
        laundryRes,
        laundryPrevRes,
        maintRes,
        maintPrevRes,
        debtRes,
        upPoRes,
        upMaintRes,
      ] = await Promise.all([
        payQ,
        payPrevQ,
        poQ,
        poPrevQ,
        laundryQ,
        laundryPrevQ,
        maintQ,
        maintPrevQ,
        debtQ,
        upPoQ,
        upMaintQ,
      ])

      const payments = (payRes.data || []) as unknown as RawPayment[]
      const paymentsPrev = (payPrevRes.data || []) as { amount: number }[]
      const pos = (poRes.data || []) as unknown as RawPO[]
      const posPrev = (poPrevRes.data || []) as { total_amount: number }[]
      const laundries = (laundryRes.data || []) as unknown as RawLaundry[]
      const laundriesPrev = (laundryPrevRes.data || []) as { actual_cost: number | null; estimated_cost: number | null }[]
      const maints = (maintRes.data || []) as unknown as RawMaintenance[]
      const maintsPrev = (maintPrevRes.data || []) as { actual_cost: number | null }[]
      const debts = (debtRes.data || []) as unknown as RawBookingDebt[]
      const upPos = (upPoRes.data || []) as unknown as RawPO[]
      const upMaints = (upMaintRes.data || []) as unknown as RawMaintenance[]

      // ---------- Build daily series ----------
      const dayMap = buildDayMap(period.current.start, period.current.end)
      for (const p of payments) {
        if (!p.paid_at) continue
        const k = p.paid_at.slice(0, 10)
        const row = dayMap.get(k)
        if (row) row.inflow += Number(p.amount) || 0
      }
      for (const po of pos) {
        if (!po.actual_delivery_date) continue
        const row = dayMap.get(po.actual_delivery_date.slice(0, 10))
        if (row) row.outflow += Number(po.total_amount) || 0
      }
      for (const lb of laundries) {
        if (!lb.actual_return_date) continue
        const row = dayMap.get(lb.actual_return_date.slice(0, 10))
        if (row) row.outflow += Number(lb.actual_cost ?? lb.estimated_cost ?? 0) || 0
      }
      for (const mr of maints) {
        const row = dayMap.get((mr.updated_at || '').slice(0, 10))
        if (row) row.outflow += Number(mr.actual_cost ?? 0) || 0
      }
      const daily: CashFlowDayPoint[] = Array.from(dayMap.values()).map((d) => ({
        ...d,
        net: d.inflow - d.outflow,
      }))

      // ---------- Totals ----------
      const cashInCur = daily.reduce((s, d) => s + d.inflow, 0)
      const cashOutCur = daily.reduce((s, d) => s + d.outflow, 0)
      const netCashCur = cashInCur - cashOutCur

      const cashInPrev = paymentsPrev.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const cashOutPrev =
        posPrev.reduce((s, p) => s + (Number(p.total_amount) || 0), 0) +
        laundriesPrev.reduce((s, l) => s + Number(l.actual_cost ?? l.estimated_cost ?? 0), 0) +
        maintsPrev.reduce((s, m) => s + Number(m.actual_cost ?? 0), 0)
      const netCashPrev = cashInPrev - cashOutPrev

      // ---------- Cash IN by channel ----------
      const channelAgg = new Map<string, CashInBreakdownItem>()
      for (const p of payments) {
        const src = p.booking?.booking_source || ''
        const isOta = src.startsWith('ota_')
        const key = isOta ? `ota:${src}` : p.payment_method || 'other'
        const label = isOta ? OTA_SOURCE_LABELS[src] || 'OTA' : labelChannel(p.payment_method, false)
        const row = channelAgg.get(key) || { key, label, amount: 0, count: 0 }
        row.amount += Number(p.amount) || 0
        row.count += 1
        channelAgg.set(key, row)
      }
      const cashInByChannel = Array.from(channelAgg.values()).sort((a, b) => b.amount - a.amount)

      // ---------- Cash OUT by group ----------
      const poTotal = pos.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)
      const laundryTotal = laundries.reduce(
        (s, l) => s + Number(l.actual_cost ?? l.estimated_cost ?? 0),
        0,
      )
      const maintTotal = maints.reduce((s, m) => s + Number(m.actual_cost ?? 0), 0)
      const cashOutByGroup: CashOutBreakdownItem[] = (
        [
          { key: 'purchase', label: 'Mua hàng (PO)', amount: poTotal, count: pos.length },
          { key: 'laundry', label: 'Giặt là', amount: laundryTotal, count: laundries.length },
          { key: 'maintenance', label: 'Bảo trì', amount: maintTotal, count: maints.length },
        ] as CashOutBreakdownItem[]
      )
        .filter((x) => x.amount > 0 || x.count > 0)
        .sort((a, b) => b.amount - a.amount)

      // ---------- Receivables + Aging ----------
      const receivables: ReceivableBooking[] = debts
        .map((b) => {
          const debt = Number(b.total_amount) - (Number(b.amount_paid) + Number(b.deposit_amount))
          return {
            id: b.id,
            guest_name: b.guest_name,
            room_number: b.room?.room_number ?? null,
            check_out_date: b.check_out_date,
            total_amount: Number(b.total_amount) || 0,
            amount_paid: Number(b.amount_paid) || 0,
            deposit_amount: Number(b.deposit_amount) || 0,
            debt: Math.max(0, debt),
            age_days: ageDays(b.check_out_date, now),
            booking_source: b.booking_source,
          }
        })
        .filter((r) => r.debt > 1000) // tolerance 1k
        .sort((a, b) => b.debt - a.debt)

      const buckets: Record<AgingBucket['key'], AgingBucket> = {
        '0_7': { key: '0_7', label: '0–7 ngày', count: 0, amount: 0 },
        '8_30': { key: '8_30', label: '8–30 ngày', count: 0, amount: 0 },
        '31_60': { key: '31_60', label: '31–60 ngày', count: 0, amount: 0 },
        '60_plus': { key: '60_plus', label: 'Trên 60 ngày', count: 0, amount: 0 },
      }
      for (const r of receivables) {
        const b = buckets[agingBucketOf(r.age_days)]
        b.count += 1
        b.amount += r.debt
      }
      const aging = Object.values(buckets)
      const receivablesTotalCur = receivables.reduce((s, r) => s + r.debt, 0)

      // ---------- OTA pending ----------
      const otaAgg = new Map<string, OtaPendingItem>()
      for (const b of debts) {
        const src = b.booking_source || ''
        if (!src.startsWith('ota_')) continue
        const row =
          otaAgg.get(src) || {
            source: src,
            label: OTA_SOURCE_LABELS[src] || 'OTA',
            bookings: 0,
            gross: 0,
            commission: 0,
            netExpected: 0,
            alreadyPaid: 0,
            pending: 0,
          }
        const gross = Number(b.total_amount) || 0
        const commission = Number(b.ota_commission_amount) || 0
        const otaPaid = Number(b.ota_paid_amount) || 0
        const netExpected = Math.max(0, gross - commission)
        row.bookings += 1
        row.gross += gross
        row.commission += commission
        row.netExpected += netExpected
        row.alreadyPaid += otaPaid
        row.pending += Math.max(0, netExpected - otaPaid)
        otaAgg.set(src, row)
      }
      const otaPending = Array.from(otaAgg.values()).sort((a, b) => b.pending - a.pending)

      // ---------- Upcoming payables ----------
      const upcoming: UpcomingPayableItem[] = []
      for (const po of upPos) {
        const due = po.expected_delivery_date
        const daysTo = due
          ? Math.ceil((new Date(due).getTime() - now.getTime()) / 86_400_000)
          : null
        upcoming.push({
          id: po.id,
          kind: 'po',
          code: po.po_code,
          label: `Đặt hàng • ${po.vendor?.name || 'NCC'}`,
          due_date: due,
          amount: Number(po.total_amount) || 0,
          days_to_due: daysTo,
        })
      }
      for (const mr of upMaints) {
        const due = mr.expected_completion_date
        const daysTo = due
          ? Math.ceil((new Date(due).getTime() - now.getTime()) / 86_400_000)
          : null
        const amt = Number(mr.actual_cost ?? 0) || Number((mr as any).estimated_cost ?? 0) || 0
        if (amt <= 0) continue
        upcoming.push({
          id: mr.id,
          kind: 'maintenance',
          code: mr.id.slice(0, 8),
          label: `Bảo trì • ${(mr as any).title || 'Yêu cầu'}`,
          due_date: due,
          amount: amt,
          days_to_due: daysTo,
        })
      }
      upcoming.sort((a, b) => (a.days_to_due ?? 9999) - (b.days_to_due ?? 9999))

      return {
        loading: false,
        cashIn: { value: cashInCur, delta: computeDelta(cashInCur, cashInPrev) },
        cashOut: { value: cashOutCur, delta: computeDelta(cashOutCur, cashOutPrev) },
        netCash: { value: netCashCur, delta: computeDelta(netCashCur, netCashPrev) },
        receivablesTotal: { value: receivablesTotalCur, delta: null },
        daily,
        cashInByChannel,
        cashOutByGroup,
        aging,
        topReceivables: receivables.slice(0, 10),
        otaPending,
        upcomingPayables: upcoming.slice(0, 30),
      }
    },
  })

  return useMemo<CashFlowReport>(() => {
    if (!q.data) {
      return {
        loading: q.isLoading,
        cashIn: { value: 0, delta: null },
        cashOut: { value: 0, delta: null },
        netCash: { value: 0, delta: null },
        receivablesTotal: { value: 0, delta: null },
        daily: [],
        cashInByChannel: [],
        cashOutByGroup: [],
        aging: [],
        topReceivables: [],
        otaPending: [],
        upcomingPayables: [],
      }
    }
    return { ...q.data, loading: q.isLoading }
  }, [q.data, q.isLoading])
}
