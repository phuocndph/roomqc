import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useTenant } from './useTenant'
import { toast } from 'sonner'
import type { SupplementRequestItem } from './useSupplementRequests'
import { getFriendlyError } from '@/lib/errorMessage'

interface CreateDistributionFromSupplementParams {
  supplementRequestId: string
  assignedTo?: string | null
}

export function useCreateDistributionFromSupplement() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()

  return useMutation({
    mutationFn: async ({ supplementRequestId, assignedTo }: CreateDistributionFromSupplementParams) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('Missing required context')
      }

      // 1. Fetch supplement request details
      const { data: request, error: fetchError } = await supabase
        .from('supplement_requests')
        .select('*, room:rooms(id, room_number)')
        .eq('id', supplementRequestId)
        .single()

      if (fetchError) throw fetchError

      const requestItems = (request.items || []) as unknown as SupplementRequestItem[]

      if (requestItems.length === 0) {
        throw new Error('Yêu cầu không có item nào')
      }

      // 2. Create distribution order via RPC
      const { data: result, error: createError } = await supabase.rpc('create_distribution_order', {
        p_tenant_id: tenant.id,
        p_hotel_id: request.hotel_id,
        p_created_by: user.id,
        p_assigned_to: assignedTo || null,
        p_rooms: [{
          room_id: request.room_id,
          items: requestItems.map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
          })),
        }],
        p_notes: `Bổ sung theo yêu cầu ${request.request_code}`,
      p_auto_release: !!assignedTo,
      p_supplement_request_ids: [supplementRequestId],
      })

      if (createError) throw createError

      const orderResult = result as { success: boolean; order_id: string; order_code: string }

      // NOTE: RPC create_distribution_order (v3) đã tự cập nhật
      //   supplement_requests.status = 'approved' + distribution_order_id
      // khi truyền p_supplement_request_ids. KHÔNG update lại ở client để tránh
      // race condition và double-write.

      // Bidirectional link: gắn supplement_request_id vào distribution_orders
      // (RPC chưa làm chiều này — giữ lại bước này).
      const { error: linkError } = await supabase
        .from('distribution_orders')
        .update({
          supplement_request_id: supplementRequestId,
        })
        .eq('id', orderResult.order_id)
        .eq('tenant_id', tenant.id)

      if (linkError) {
        console.error('Failed to link distribution order back to supplement request:', linkError)
      }

      return {
        success: true,
        orderId: orderResult.order_id,
        orderCode: orderResult.order_code,
        requestCode: request.request_code,
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-request'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })

      toast.success('Đã duyệt yêu cầu và tạo phiếu giao hàng', {
        description: `Phiếu giao: ${result.orderCode}`,
        action: {
          label: 'Mở phiếu',
          onClick: () => {
            window.location.href = `/inventory/distributions/${result.orderId}`
          },
        },
      })
    },
    onError: (error: Error) => {
      toast.error('Lỗi tạo phiếu giao hàng', { description: getFriendlyError(error) })
    },
  })
}

// Hook to fetch hotel staff for assignment
export function useHotelStaffForAssignment(hotelId: string | undefined) {
  return useQueryClient().fetchQuery({
    queryKey: ['hotel-staff-assignment', hotelId],
    queryFn: async () => {
      if (!hotelId) return []

      const { data, error } = await supabase
        .from('user_hotels')
        .select(`
          user_id,
          users!user_hotels_user_id_fkey(id, full_name, email, avatar_url)
        `)
        .eq('hotel_id', hotelId)

      if (error) {
        console.error('Error fetching hotel staff:', error)
        return []
      }

      return data
        ?.filter(item => (item.users as any) !== null)
        ?.map(item => ({
          id: (item.users as any).id,
          full_name: (item.users as any).full_name,
          email: (item.users as any).email,
          avatar_url: (item.users as any).avatar_url,
        })) || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
