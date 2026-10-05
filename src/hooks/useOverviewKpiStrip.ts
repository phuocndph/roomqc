import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRevenueReport } from './useRevenueReport'
import { useFinancialReport } from './useReports'
import { computeDelta, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'

export interface OverviewKpi {
  value: number
  previous: number
  delta: number
}

export interface OverviewKpiStrip {
  netRevenue: OverviewKpi
  profit: OverviewKpi
  occupancy: OverviewKpi
  revpar: OverviewKpi
  cost: OverviewKpi
  debt: OverviewKpi
  loading: boolean
}

interface RoomNightAgg {
  current: number
  previous: number
  totalRooms: number
  days: number
  daysPrev: number
}

/**
 * Hook gom 6 KPI cho trang Tổng quan.
 * - Doanh thu/chi phí/debt: reuse useRevenueReport + useFinancialReport.
 * - Occupancy/RevPAR/Profit: tính client-side (B3 sẽ thay bằng RPC `get_operations_kpi`).
 */
export function useOverviewKpiStrip(period: PeriodRangeWithPrevious): OverviewKpiStrip {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const hotelKey = isAllHotelsMode ? 'all' : hotelId ?? 'none'

  const { current, previous } = period

  const revQ = useRevenueReport('custom', { start: current.start, end: current.end })
  const finCurQ = useFinancialReport({ start: current.start, end: current.end })
  const finPrevQ = useFinancialReport({ start: previous.start, end: previous.end })

  // Room-nights + total rooms để tính occupancy / RevPAR
  const roomAggQ = useQuery({
    queryKey: ['overview-room-aggregate', tenantId, hotelKey, current.start.toISOString(), current.end.toISOString()],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RoomNightAgg> => {
      if (!tenantId) return { current: 0, previous: 0, totalRooms: 0, days: 1, daysPrev: 1 }

      // Đếm phòng (chỉ phòng đang active — không filter status để giữ đơn giản, có thể siết sau)
      let roomsCountQ = supabase
        .from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      if (hotelId) roomsCountQ = roomsCountQ.eq('hotel_id', hotelId)
      const { count: totalRooms } = await roomsCountQ

      // Lấy booking checked_out trong cả 2 kỳ để gom room-nights
      const fromIso = previous.start.toISOString()
      const toIso = current.end.toISOString()
      let bkQ = supabase
        .from('room_bookings')
        .select('check_in_date, check_out_date')
        .eq('tenant_id', tenantId)
        .eq('status', 'checked_out')
        .gte('check_out_date', fromIso)
        .lte('check_out_date', toIso)
        .limit(5000)
      if (hotelId) bkQ = bkQ.eq('hotel_id', hotelId)
      const { data: bookings } = await bkQ

      const nightsIn = (start: Date, end: Date) =>
        (bookings ?? []).reduce((s, b: any) => {
          if (!b.check_out_date) return s
          const d = new Date(b.check_out_date)
          if (d < start || d > end) return s
          const checkIn = new Date(b.check_in_date)
          const nights = differenceInCalendarDays(d, checkIn)
          return s + Math.max(1, nights)
        }, 0)

      const days = Math.max(1, differenceInCalendarDays(current.end, current.start) + 1)
      const daysPrev = Math.max(1, differenceInCalendarDays(previous.end, previous.start) + 1)

      return {
        current: nightsIn(current.start, current.end),
        previous: nightsIn(previous.start, previous.end),
        totalRooms: totalRooms ?? 0,
        days,
        daysPrev,
      }
    },
  })

  const loading =
    revQ.isLoading || finCurQ.isLoading || finPrevQ.isLoading || roomAggQ.isLoading

  const rev = revQ.data?.currentPeriod
  const revPrev = revQ.data?.previousPeriod
  const netRevenue = rev?.netRevenue ?? 0
  const netRevenuePrev = revPrev?.netRevenue ?? 0

  const cost = finCurQ.data?.summary?.total_cost ?? 0
  const costPrev = finPrevQ.data?.summary?.total_cost ?? 0
  const profit = netRevenue - cost
  const profitPrev = netRevenuePrev - costPrev

  const debt = rev?.pendingRevenue ?? 0
  const debtPrev = revPrev?.pendingRevenue ?? 0

  const agg = roomAggQ.data
  const capacityCur = (agg?.totalRooms ?? 0) * (agg?.days ?? 1)
  const capacityPrev = (agg?.totalRooms ?? 0) * (agg?.daysPrev ?? 1)
  const occupancy = capacityCur > 0 ? ((agg?.current ?? 0) / capacityCur) * 100 : 0
  const occupancyPrev = capacityPrev > 0 ? ((agg?.previous ?? 0) / capacityPrev) * 100 : 0
  const revpar = capacityCur > 0 ? netRevenue / capacityCur : 0
  const revparPrev = capacityPrev > 0 ? netRevenuePrev / capacityPrev : 0

  return {
    netRevenue: { value: netRevenue, previous: netRevenuePrev, delta: computeDelta(netRevenue, netRevenuePrev) },
    profit: { value: profit, previous: profitPrev, delta: computeDelta(profit, profitPrev) },
    occupancy: { value: occupancy, previous: occupancyPrev, delta: occupancy - occupancyPrev },
    revpar: { value: revpar, previous: revparPrev, delta: computeDelta(revpar, revparPrev) },
    cost: { value: cost, previous: costPrev, delta: computeDelta(cost, costPrev) },
    debt: { value: debt, previous: debtPrev, delta: computeDelta(debt, debtPrev) },
    loading,
  }
}

/**
 * Hook chart 30 ngày: gom doanh thu/ngày + chi phí/ngày.
 * Doanh thu lấy từ checked_out bookings, chi phí từ financial monthly_trend chia trung bình.
 * (Đơn giản trước — B4 có thể tách RPC riêng cho daily exact.)
 */
export function useOverviewChart(days: number = 30) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const hotelKey = isAllHotelsMode ? 'all' : hotelId ?? 'none'

  return useQuery({
    queryKey: ['overview-chart', tenantId, hotelKey, days],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!tenantId) return []
      const end = new Date()
      const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

      let bkQ = supabase
        .from('room_bookings')
        .select('check_out_date, total_amount, ota_commission_amount, net_revenue, amount_paid, deposit_amount')
        .eq('tenant_id', tenantId)
        .eq('status', 'checked_out')
        .gte('check_out_date', start.toISOString())
        .lte('check_out_date', end.toISOString())
        .limit(5000)
      if (hotelId) bkQ = bkQ.eq('hotel_id', hotelId)
      const { data: bookings } = await bkQ

      // gom doanh thu theo ngày
      const dailyRev = new Map<string, number>()
      for (const b of (bookings ?? []) as any[]) {
        if (!b.check_out_date) continue
        const key = new Date(b.check_out_date).toISOString().slice(0, 10)
        const storedNet = b.net_revenue == null ? null : Number(b.net_revenue)
        const net =
          storedNet != null && (storedNet !== 0 || Number(b.total_amount || 0) === 0)
            ? storedNet
            : Number(b.total_amount || 0) - Number(b.ota_commission_amount || 0)
        dailyRev.set(key, (dailyRev.get(key) ?? 0) + net)
      }

      // Chi phí: gom maintenance/laundry/po theo ngày — lấy từ 3 bảng nhỏ
      const [maintR, laundryR] = await Promise.all([
        (() => {
          let q = supabase
            .from('maintenance_requests')
            .select('completed_at, actual_cost')
            .eq('tenant_id', tenantId)
            .not('actual_cost', 'is', null)
            .gte('completed_at', start.toISOString())
            .lte('completed_at', end.toISOString())
            .limit(5000)
          if (hotelId) q = q.eq('hotel_id', hotelId)
          return q
        })(),
        (() => {
          let q = supabase
            .from('laundry_batches')
            .select('actual_return_date, actual_cost, estimated_cost')
            .eq('tenant_id', tenantId)
            .gte('actual_return_date', start.toISOString())
            .lte('actual_return_date', end.toISOString())
            .limit(5000)
          if (hotelId) q = q.eq('hotel_id', hotelId)
          return q
        })(),
      ])

      const dailyCost = new Map<string, number>()
      for (const m of (maintR.data ?? []) as any[]) {
        if (!m.completed_at) continue
        const key = new Date(m.completed_at).toISOString().slice(0, 10)
        dailyCost.set(key, (dailyCost.get(key) ?? 0) + Number(m.actual_cost || 0))
      }
      for (const l of (laundryR.data ?? []) as any[]) {
        if (!l.actual_return_date) continue
        const key = new Date(l.actual_return_date).toISOString().slice(0, 10)
        dailyCost.set(key, (dailyCost.get(key) ?? 0) + Number(l.actual_cost ?? l.estimated_cost ?? 0))
      }

      const keys = new Set([...dailyRev.keys(), ...dailyCost.keys()])
      return Array.from(keys)
        .sort()
        .map((date) => ({
          date,
          revenue: dailyRev.get(date) ?? 0,
          cost: dailyCost.get(date) ?? 0,
        }))
    },
  })
}
