import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { format, eachMonthOfInterval } from 'date-fns'

export interface OperationsTransactionSummary {
  inbound_count: number
  outbound_count: number
  adjustment_count: number
  total_transactions: number
  inbound_value: number
  outbound_value: number
  net_change_value: number
}

export interface TopMovingItem {
  item_id: string
  item_name: string
  item_code: string
  inbound: number
  outbound: number
  net: number
  turnover: number
}

export interface MonthlyTransactionTrend {
  month: string
  inbound: number
  outbound: number
  adjustment: number
}

export interface StocktakeResult {
  id: string
  adjustment_code: string
  status: string
  created_at: string
  total_items: number
  matched: number
  over: number
  short: number
  adjusted_value: number
}

export interface StocktakeSummary {
  total_checks: number
  items_checked: number
  accuracy_rate: number
  total_adjusted_value: number
  recent: StocktakeResult[]
}

export interface EfficiencyMetrics {
  avg_transactions_per_day: number
  busiest_day: string
  accuracy_rate: number
  adjustment_rate: number
}

export interface OperationsReportData {
  transactions: OperationsTransactionSummary
  monthlyTrend: MonthlyTransactionTrend[]
  topMovingItems: TopMovingItem[]
  stocktake: StocktakeSummary
  efficiency: EfficiencyMetrics
}

interface DateRange {
  start: Date
  end: Date
}

export function useOperationsReport(dateRange: DateRange) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['operations-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async (): Promise<OperationsReportData> => {
      if (!tenantId) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')

      const hotelId = isAllHotelsMode ? null : selectedHotel?.id

      // 1. Fetch all transactions in date range
      let txQuery = supabase
        .from('inventory_transactions')
        .select('id, transaction_type, quantity, total_value, created_at, item_id, items!inner(id, name, code)')
        .eq('tenant_id', tenantId)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())

      if (hotelId) txQuery = txQuery.eq('hotel_id', hotelId)

      // 2. Fetch stock adjustments in date range
      let adjQuery = supabase
        .from('stock_adjustments')
        .select('id, adjustment_code, status, created_at, total_items_checked, total_discrepancies, total_value_difference')
        .eq('tenant_id', tenantId)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false })

      if (hotelId) adjQuery = adjQuery.eq('hotel_id', hotelId)

      const [txRes, adjRes] = await Promise.all([txQuery, adjQuery])
      if (txRes.error) throw txRes.error
      if (adjRes.error) throw adjRes.error

      const transactions = txRes.data || []
      const adjustments = adjRes.data || []

      // Process transactions
      const inbound = transactions.filter(t => t.transaction_type === 'in')
      const outbound = transactions.filter(t => t.transaction_type === 'out')
      const adjustmentTx = transactions.filter(t => t.transaction_type === 'adjustment')

      // Standardise: inbound/outbound values always positive; net = inbound - outbound
      const inboundValue = inbound.reduce((s, t) => s + Math.abs(t.total_value || 0), 0)
      const outboundValue = outbound.reduce((s, t) => s + Math.abs(t.total_value || 0), 0)
      const txSummary: OperationsTransactionSummary = {
        inbound_count: inbound.length,
        outbound_count: outbound.length,
        adjustment_count: adjustmentTx.length,
        total_transactions: transactions.length,
        inbound_value: inboundValue,
        outbound_value: outboundValue,
        net_change_value: inboundValue - outboundValue,
      }

      // Monthly trend
      const monthMap = new Map<string, { inbound: number; outbound: number; adjustment: number }>()
      const months = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end })
      months.forEach(m => {
        monthMap.set(format(m, 'yyyy-MM'), { inbound: 0, outbound: 0, adjustment: 0 })
      })

      transactions.forEach(t => {
        const key = format(new Date(t.created_at), 'yyyy-MM')
        const entry = monthMap.get(key) || { inbound: 0, outbound: 0, adjustment: 0 }
        if (t.transaction_type === 'in') entry.inbound++
        else if (t.transaction_type === 'out') entry.outbound++
        else entry.adjustment++
        monthMap.set(key, entry)
      })

      const monthlyTrend: MonthlyTransactionTrend[] = Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, data]) => ({ month: format(new Date(month + '-01'), 'MM/yyyy'), ...data }))

      // Top moving items
      const itemMap = new Map<string, { item: any; inbound: number; outbound: number }>()
      transactions.forEach(t => {
        const item = t.items as any
        if (!item) return
        const existing = itemMap.get(item.id) || { item, inbound: 0, outbound: 0 }
        if (t.transaction_type === 'in') existing.inbound += Math.abs(t.quantity || 0)
        else if (t.transaction_type === 'out') existing.outbound += Math.abs(t.quantity || 0)
        itemMap.set(item.id, existing)
      })

      const topMovingItems: TopMovingItem[] = Array.from(itemMap.values())
        .map(({ item, inbound, outbound }) => ({
          item_id: item.id,
          item_name: item.name,
          item_code: item.code,
          inbound,
          outbound,
          net: inbound - outbound,
          turnover: inbound + outbound,
        }))
        .sort((a, b) => b.turnover - a.turnover)
        .slice(0, 10)

      // Stocktake summary
      const completedAdj = adjustments.filter(a => a.status === 'completed')
      const totalChecked = completedAdj.reduce((s, a) => s + (a.total_items_checked || 0), 0)
      const totalDiscrepancies = completedAdj.reduce((s, a) => s + (a.total_discrepancies || 0), 0)

      const stocktake: StocktakeSummary = {
        total_checks: completedAdj.length,
        items_checked: totalChecked,
        accuracy_rate: totalChecked > 0 ? Math.round(((totalChecked - totalDiscrepancies) / totalChecked) * 100 * 10) / 10 : 0,
        total_adjusted_value: completedAdj.reduce((s, a) => s + Math.abs(a.total_value_difference || 0), 0),
        recent: adjustments.slice(0, 5).map(a => ({
          id: a.id,
          adjustment_code: a.adjustment_code,
          status: a.status || 'draft',
          created_at: a.created_at || '',
          total_items: a.total_items_checked || 0,
          matched: (a.total_items_checked || 0) - (a.total_discrepancies || 0),
          over: 0,
          short: a.total_discrepancies || 0,
          adjusted_value: a.total_value_difference || 0,
        })),
      }

      // Efficiency metrics
      const dayCount = Math.max(1, Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)))
      const dayMap = new Map<string, number>()
      transactions.forEach(t => {
        const day = format(new Date(t.created_at), 'yyyy-MM-dd')
        dayMap.set(day, (dayMap.get(day) || 0) + 1)
      })
      let busiestDay = ''
      let busiestCount = 0
      dayMap.forEach((count, day) => {
        if (count > busiestCount) { busiestCount = count; busiestDay = day }
      })

      const efficiency: EfficiencyMetrics = {
        avg_transactions_per_day: Math.round((transactions.length / dayCount) * 10) / 10,
        busiest_day: busiestDay ? format(new Date(busiestDay), 'dd/MM/yyyy') : '-',
        accuracy_rate: stocktake.accuracy_rate,
        adjustment_rate: transactions.length > 0 ? Math.round((adjustmentTx.length / transactions.length) * 100 * 10) / 10 : 0,
      }

      return { transactions: txSummary, monthlyTrend, topMovingItems, stocktake, efficiency }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}
