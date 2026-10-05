import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from './useUser'
import { toast } from 'sonner'
import type { CreateTransferData } from '@/types/warehouse.types'

export function useCreateWarehouseTransfer() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { user } = useUser()

  return useMutation({
    mutationFn: async (data: CreateTransferData) => {
      if (!tenant?.id || !selectedHotel?.id) {
        throw new Error('Missing tenant or hotel')
      }

      const { data: result, error } = await supabase
        .rpc('create_warehouse_transfer', {
          p_tenant_id: tenant.id,
          p_hotel_id: selectedHotel.id,
          p_from_warehouse_id: data.from_warehouse_id,
          p_to_warehouse_id: data.to_warehouse_id,
          p_items: JSON.parse(JSON.stringify(data.items)),
          p_notes: data.notes || null,
          p_created_by: user?.id || null,
        })

      if (error) throw error
      return result
    },
    onSuccess: (_, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock', variables.from_warehouse_id] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock', variables.to_warehouse_id] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Chuyển kho thành công')
    },
    onError: (error: any) => {
      console.error('Transfer error:', error)
      toast.error(error.message || 'Không thể chuyển kho')
    },
  })
}
