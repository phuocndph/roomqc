import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns'

export interface OutboundCategorySummary {
  category: string
  transaction_count: number
  total_quantity: number
  total_value: number
}

export interface TopItem {
  item_id: string
  item_name: string
  item_code: string
  count: number
  quantity: number
  value: number
}

export interface MonthlyTrend {
  month: string
  count: number
  quantity: number
  value: number
}

export interface OutboundReportData {
  summary: OutboundCategorySummary[]
  byCategory: Record<string, {
    transactions: number
    quantity: number
    value: number
    topItems: TopItem[]
    monthlyTrend: MonthlyTrend[]
  }>
  totalTransactions: number
  totalQuantity: number
  totalValue: number
}

interface UseOutboundReportParams {
  startDate: Date
  endDate: Date
  category?: string
}

export function useOutboundReport({ startDate, endDate, category }: UseOutboundReportParams) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: [
      'outbound-report', 
      tenant?.id, 
      isAllHotelsMode ? 'all' : selectedHotel?.id,
      startDate.toISOString(),
      endDate.toISOString(),
      category
    ],
    queryFn: async (): Promise<OutboundReportData> => {
      if (!tenant?.id) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')
      
      // Query all outbound transactions
      let query = supabase
        .from('inventory_transactions')
        .select(`
          id,
          transaction_type,
          transaction_category,
          quantity,
          total_value,
          unit_price,
          created_at,
          item_id,
          items!inner (
            id,
            name,
            code
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('transaction_type', 'out')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
      
      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }
      
      if (category && category !== 'all') {
        query = query.eq('transaction_category', category)
      }
      
      const { data: transactions, error } = await query
      
      if (error) throw error
      
      // Process data
      const categoryGroups: Record<string, typeof transactions> = {}
      const categories = ['room_assign', 'staff_assign', 'laundry', 'maintenance', 'disposal', 'other']
      
      categories.forEach(cat => {
        categoryGroups[cat] = []
      })
      
      transactions?.forEach(tx => {
        const cat = tx.transaction_category || 'other'
        if (!categoryGroups[cat]) categoryGroups[cat] = []
        categoryGroups[cat].push(tx)
      })
      
      // Build summary
      const summary: OutboundCategorySummary[] = categories.map(cat => {
        const txs = categoryGroups[cat] || []
        return {
          category: cat,
          transaction_count: txs.length,
          total_quantity: txs.reduce((sum, tx) => sum + (tx.quantity || 0), 0),
          total_value: txs.reduce((sum, tx) => sum + (tx.total_value || 0), 0)
        }
      })
      
      // Build by category details
      const byCategory: OutboundReportData['byCategory'] = {}
      
      categories.forEach(cat => {
        const txs = categoryGroups[cat] || []
        
        // Top items
        const itemMap = new Map<string, { item: any, count: number, quantity: number, value: number }>()
        txs.forEach(tx => {
          const item = tx.items as any
          if (!item) return
          const existing = itemMap.get(item.id)
          if (existing) {
            existing.count++
            existing.quantity += tx.quantity || 0
            existing.value += tx.total_value || 0
          } else {
            itemMap.set(item.id, {
              item,
              count: 1,
              quantity: tx.quantity || 0,
              value: tx.total_value || 0
            })
          }
        })
        
        const topItems: TopItem[] = Array.from(itemMap.values())
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10)
          .map(i => ({
            item_id: i.item.id,
            item_name: i.item.name,
            item_code: i.item.code,
            count: i.count,
            quantity: i.quantity,
            value: i.value
          }))
        
        // Monthly trend
        const monthMap = new Map<string, { count: number, quantity: number, value: number }>()
        txs.forEach(tx => {
          const month = format(new Date(tx.created_at), 'yyyy-MM')
          const existing = monthMap.get(month)
          if (existing) {
            existing.count++
            existing.quantity += tx.quantity || 0
            existing.value += tx.total_value || 0
          } else {
            monthMap.set(month, {
              count: 1,
              quantity: tx.quantity || 0,
              value: tx.total_value || 0
            })
          }
        })
        
        const monthlyTrend: MonthlyTrend[] = Array.from(monthMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, data]) => ({
            month,
            ...data
          }))
        
        byCategory[cat] = {
          transactions: txs.length,
          quantity: txs.reduce((sum, tx) => sum + (tx.quantity || 0), 0),
          value: txs.reduce((sum, tx) => sum + (tx.total_value || 0), 0),
          topItems,
          monthlyTrend
        }
      })
      
      return {
        summary,
        byCategory,
        totalTransactions: transactions?.length || 0,
        totalQuantity: transactions?.reduce((sum, tx) => sum + (tx.quantity || 0), 0) || 0,
        totalValue: transactions?.reduce((sum, tx) => sum + (tx.total_value || 0), 0) || 0
      }
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
