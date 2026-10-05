import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import type {
  InventoryReportData,
  FinancialReportData,
  LaundryReportData,
  ABCAnalysisItem,
  TurnoverAnalysisItem,
  DateRange,
} from '@/types/reports.types'

export function useInventoryReport(dateRange: DateRange) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['inventory-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, dateRange],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase.rpc('get_inventory_report', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })
      
      if (error) throw error
      return data as unknown as InventoryReportData
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}

export function useFinancialReport(dateRange: DateRange) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['financial-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, dateRange],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase.rpc('get_financial_report', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })
      
      if (error) throw error
      return data as unknown as FinancialReportData
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}

export function useABCAnalysis() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['abc-analysis', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase.rpc('get_abc_analysis', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
      })
      
      if (error) throw error
      return data as ABCAnalysisItem[]
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

export function useTurnoverAnalysis(months: number = 3) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['turnover-analysis', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, months],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase.rpc('get_turnover_analysis', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_months: months,
      })
      
      if (error) throw error
      return data as TurnoverAnalysisItem[]
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 30 * 60 * 1000, // 30 minutes
  })
}

export function useLaundryReport(dateRange: DateRange) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['laundry-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, dateRange],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase.rpc('get_laundry_report', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })
      
      if (error) throw error
      return data as unknown as LaundryReportData
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}

// Quick reports for dashboard
export function useQuickReport(period: 'today' | 'week' | 'month') {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  const dateRange = getDateRangeForPeriod(period)
  
  return useQuery({
    queryKey: ['quick-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, period],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      // Get quick metrics — Supabase builders are immutable, must reassign
      let inventoryQuery = supabase
        .from('inventory_transactions')
        .select('transaction_type, quantity, total_value')
        .eq('tenant_id', tenantId)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())

      let laundryQuery = supabase
        .from('laundry_batches')
        .select('total_items, estimated_cost')
        .eq('tenant_id', tenantId)
        .gte('delivery_date', dateRange.start.toISOString())
        .lte('delivery_date', dateRange.end.toISOString())

      let adjustmentsQuery = supabase
        .from('stock_adjustments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')

      if (!isAllHotelsMode && hotelId) {
        inventoryQuery = inventoryQuery.eq('hotel_id', hotelId)
        laundryQuery = laundryQuery.eq('hotel_id', hotelId)
        adjustmentsQuery = adjustmentsQuery.eq('hotel_id', hotelId)
      }
      
      const [
        inventoryTransactions,
        laundryBatches,
        lowStockItems,
        pendingAdjustments,
      ] = await Promise.all([
        inventoryQuery,
        laundryQuery,
        supabase.rpc('get_low_stock_items', {
          p_tenant_id: tenantId,
          p_hotel_id: hotelId,
          p_limit: 1000
        }).then(res => ({ data: res.data || [], error: res.error })),
        adjustmentsQuery,
      ])
      
      // Calculate metrics
      const inbound = inventoryTransactions.data?.filter(t => t.transaction_type === 'in') || []
      const outbound = inventoryTransactions.data?.filter(t => t.transaction_type === 'out') || []
      
      return {
        inbound: {
          count: inbound.length,
          items: inbound.reduce((sum, t) => sum + t.quantity, 0),
          value: inbound.reduce((sum, t) => sum + (t.total_value || 0), 0),
        },
        outbound: {
          count: outbound.length,
          items: outbound.reduce((sum, t) => sum + Math.abs(t.quantity), 0),
          value: outbound.reduce((sum, t) => sum + (t.total_value || 0), 0),
        },
        laundry: {
          batches: laundryBatches.data?.length || 0,
          items: laundryBatches.data?.reduce((sum, b) => sum + (b.total_items || 0), 0) || 0,
          cost: laundryBatches.data?.reduce((sum, b) => sum + (b.estimated_cost || 0), 0) || 0,
        },
        alerts: {
          lowStock: lowStockItems.data?.length || 0,
          pendingAdjustments: pendingAdjustments.data?.length || 0,
        },
      }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    refetchInterval: 60000, // 1 minute
  })
}

function getDateRangeForPeriod(period: 'today' | 'week' | 'month'): DateRange {
  const end = new Date()
  const start = new Date()
  
  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case 'week':
      start.setDate(start.getDate() - 7)
      break
    case 'month':
      start.setMonth(start.getMonth() - 1)
      break
  }
  
  return { start, end }
}
