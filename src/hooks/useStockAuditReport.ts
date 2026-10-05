import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import type { StockAuditReportData } from '@/types/stock-audit-report.types'
import type { DateRange } from '@/types/reports.types'

export function useStockAuditReport(dateRange: DateRange) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['stock-audit-report', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, dateRange],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const hotelId = isAllHotelsMode ? null : selectedHotel?.id
      if (!isAllHotelsMode && !hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase.rpc('get_stock_audit_report', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })
      
      if (error) throw error
      return data as unknown as StockAuditReportData
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}
