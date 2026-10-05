import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRevenueReport } from './useRevenueReport'
import { useFinancialReport } from './useReports'
import { useLaborCost } from './useLaborCost'
import { useFinancialTargets } from './useFinancialTargets'
import { differenceInDays, subDays, subYears } from 'date-fns'
import {
  computeDerivedKpis,
  runOperationsAdvisor,
  type KpiSnapshot,
  type Finding,
} from '@/lib/operationsAdvisor'

export interface OperationsInsightsData {
  snapshot: KpiSnapshot
  derived: ReturnType<typeof computeDerivedKpis>
  ruleFindings: Finding[]
  dateRange: { start: Date; end: Date }
}

async function fetchRoomNights(
  tenantId: string,
  hotelId: string | null,
  start: Date,
  end: Date,
): Promise<number> {
  let q = supabase
    .from('room_bookings')
    .select('check_in_date, check_out_date, payment_status')
    .eq('tenant_id', tenantId)
    .gte('check_out_date', start.toISOString())
    .lte('check_out_date', end.toISOString())
    .neq('payment_status', 'refunded')
    .limit(10000)
  if (hotelId) q = q.eq('hotel_id', hotelId)
  const { data, error } = await q
  if (error) throw error
  let nights = 0
  for (const b of data || []) {
    if (!b.check_in_date || !b.check_out_date) continue
    const n = Math.max(1, differenceInDays(new Date(b.check_out_date), new Date(b.check_in_date)))
    nights += n
  }
  return nights
}

async function fetchPeriodNetRevenue(
  tenantId: string,
  hotelId: string | null,
  start: Date,
  end: Date,
): Promise<number> {
  let q = supabase
    .from('room_bookings')
    .select('total_amount, payment_status')
    .eq('tenant_id', tenantId)
    .gte('check_out_date', start.toISOString())
    .lte('check_out_date', end.toISOString())
    .neq('payment_status', 'refunded')
    .limit(10000)
  if (hotelId) q = q.eq('hotel_id', hotelId)
  const { data, error } = await q
  if (error) throw error
  let net = 0
  for (const b of (data || []) as Array<{ total_amount: number | null }>) {
    net += b.total_amount || 0
  }
  return net
}

/**
 * Hook chính cho tab "Đánh giá vận hành" v2.
 * Gom revenue + cost + labor + targets + YoY → tính KPI + chạy rule engine.
 */
export function useOperationsInsights(dateRange: { start: Date; end: Date }) {
  const { tenantId } = useUser()
  const { selectedHotel, availableHotels, isAllHotelsMode } = useHotelContext()

  const revenue = useRevenueReport('custom', dateRange)
  const financial = useFinancialReport(dateRange)
  const labor = useLaborCost(dateRange)
  const targets = useFinancialTargets(dateRange.start)

  const periodDays = Math.max(1, differenceInDays(dateRange.end, dateRange.start) + 1)
  const prevEnd = subDays(dateRange.start, 1)
  const prevStart = subDays(prevEnd, periodDays - 1)
  const yoyStart = subYears(dateRange.start, 1)
  const yoyEnd = subYears(dateRange.end, 1)

  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const totalRooms = isAllHotelsMode
    ? availableHotels.reduce((s, h) => s + (h.total_rooms || 0), 0)
    : selectedHotel?.total_rooms || 0

  return useQuery({
    queryKey: [
      'operations-insights',
      tenantId,
      hotelId ?? 'all',
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
      totalRooms,
      revenue.data?.currentPeriod.netRevenue,
      (financial.data as any)?.cost_summary?.total_cost,
      labor.data?.total_labor_cost,
      Object.values(targets.data ?? {}).join(','),
    ],
    enabled:
      !!tenantId &&
      !!revenue.data &&
      !!(financial.data as any)?.cost_summary &&
      totalRooms > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OperationsInsightsData> => {
      const costSummary = (financial.data as any)?.cost_summary
      if (!tenantId || !revenue.data || !costSummary) {
        throw new Error('Thiếu dữ liệu nguồn')
      }

      const [currentNights, prevNights, yoyNights, yoyNet] = await Promise.all([
        fetchRoomNights(tenantId, hotelId, dateRange.start, dateRange.end),
        fetchRoomNights(tenantId, hotelId, prevStart, prevEnd),
        fetchRoomNights(tenantId, hotelId, yoyStart, yoyEnd).catch(() => 0),
        fetchPeriodNetRevenue(tenantId, hotelId, yoyStart, yoyEnd).catch(() => 0),
      ])

      const cur = revenue.data.currentPeriod
      const prev = revenue.data.previousPeriod
      const cost = costSummary
      const laborTotal = labor.data?.total_labor_cost ?? 0
      const laborByDept = labor.data?.by_department ?? {}

      const baseCost = (cost.total_cost || 0) + laborTotal

      const snapshot: KpiSnapshot = {
        periodDays,
        totalRooms,
        netRevenue: cur.netRevenue,
        grossRevenue: cur.totalRevenue,
        extraRevenue: cur.surcharges.serviceCharges + cur.surcharges.extraCharges,
        totalCost: baseCost,
        costBreakdown: {
          purchase: cost.purchase_cost || 0,
          laundry: cost.laundry_cost || 0,
          maintenance: cost.maintenance_cost || 0,
          labor: laborTotal,
        },
        roomNightsSold: currentNights,
        bookingsCount: cur.bookingsCount,
        prevNetRevenue: prev.netRevenue,
        prevBookingsCount: prev.bookingsCount,
        prevRoomNightsSold: prevNights,
        yoyNetRevenue: yoyNet > 0 ? yoyNet : undefined,
        yoyRoomNightsSold: yoyNights > 0 ? yoyNights : undefined,
        laborByDepartment: laborByDept,
        targets: targets.data,
      }

      const derived = computeDerivedKpis(snapshot)
      const ruleFindings = runOperationsAdvisor(snapshot)

      return { snapshot, derived, ruleFindings, dateRange }
    },
  })
}

export interface AiAdvice {
  title: string
  description: string
  action: string
  priority: 'high' | 'medium' | 'low'
  impactVnd?: number
}

/** Gọi edge function operations-advisor để lấy AI advice. */
export function useOperationsAdvice(insights: OperationsInsightsData | undefined) {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: [
      'operations-advice',
      tenantId,
      insights?.snapshot.netRevenue,
      insights?.snapshot.totalCost,
      insights?.ruleFindings.length,
    ],
    enabled: !!insights && !!tenantId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<AiAdvice[]> => {
      if (!insights) return []
      const { data, error } = await supabase.functions.invoke('operations-advisor', {
        body: {
          snapshot: insights.snapshot,
          derived: insights.derived,
          findings: insights.ruleFindings.slice(0, 8),
        },
      })
      if (error) throw error
      const advice = (data?.advice ?? []) as AiAdvice[]
      return advice
    },
  })
}
