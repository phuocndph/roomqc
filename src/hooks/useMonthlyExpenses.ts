import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import type { ExpenseData } from '@/types/dashboard.types'

export function useMonthlyExpenses(months: number = 12) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['monthly-expenses', tenantId, months, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .rpc('get_monthly_expenses', {
          p_tenant_id: tenantId,
          p_months: months,
          p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id || null,
        })
      
      if (error) throw error
      return data as ExpenseData[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}
