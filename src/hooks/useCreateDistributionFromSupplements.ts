import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

interface CreateFromSupplementsData {
  supplementRequestIds: string[]
  assignedTo?: string
  autoRelease?: boolean
}

interface CreateFromSupplementsResult {
  success: boolean
  order_id: string
  order_code: string
  total_rooms: number
  total_items: number
  status: string
}

export function useCreateDistributionFromSupplements() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (data: CreateFromSupplementsData): Promise<CreateFromSupplementsResult> => {
      if (!tenant?.id || !selectedHotel?.id || !user?.id) {
        throw new Error('Missing required context')
      }

      // Fetch supplement requests to build rooms data
      const { data: supplements, error: fetchError } = await supabase
        .from('supplement_requests')
        .select('id, room_id, items')
        .in('id', data.supplementRequestIds)
        .eq('status', 'pending')

      if (fetchError) throw fetchError
      if (!supplements || supplements.length === 0) {
        throw new Error('Không tìm thấy yêu cầu bổ sung')
      }

      // Group items by room
      const roomMap = new Map<string, { item_id: string; quantity: number }[]>()
      
      supplements.forEach(sup => {
        const items = (sup.items as { item_id: string; quantity: number }[]) || []
        const existing = roomMap.get(sup.room_id) || []
        
        items.forEach(item => {
          const existingItem = existing.find(e => e.item_id === item.item_id)
          if (existingItem) {
            existingItem.quantity += item.quantity
          } else {
            existing.push({ item_id: item.item_id, quantity: item.quantity })
          }
        })
        
        roomMap.set(sup.room_id, existing)
      })

      // Build rooms array
      const rooms = Array.from(roomMap.entries()).map(([room_id, items]) => ({
        room_id,
        items,
      }))

      // Call RPC with auto_release and supplement_request_ids
      const { data: result, error } = await supabase.rpc('create_distribution_order', {
        p_tenant_id: tenant.id,
        p_hotel_id: selectedHotel.id,
        p_created_by: user.id,
        p_assigned_to: data.assignedTo || null,
        p_rooms: rooms,
        p_notes: `Tạo từ ${data.supplementRequestIds.length} yêu cầu bổ sung`,
        p_auto_release: data.autoRelease && !!data.assignedTo,
        p_supplement_request_ids: data.supplementRequestIds,
      })

      if (error) throw error
      return result as unknown as CreateFromSupplementsResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      
      const statusText = result.status === 'released' ? ' (đã giao cho nhân viên)' : ''
      toast.success(`Tạo phiếu ${result.order_code} thành công${statusText}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể tạo phiếu giao hàng')
    },
  })
}
