import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { getFriendlyError } from '@/lib/errorMessage'

interface SendDraftBatchParams {
  batchId: string
  vendorId: string
  deliveryDate: Date
  expectedReturnDate: Date
  deliveryStaffId: string
  receiverName: string
  notes?: string
}

export function useSendDraftBatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: SendDraftBatchParams) => {
      const { data, error } = await supabase.rpc('send_draft_batch', {
        p_batch_id: params.batchId,
        p_vendor_id: params.vendorId,
        p_delivery_date: params.deliveryDate.toISOString().split('T')[0],
        p_expected_return_date: params.expectedReturnDate.toISOString().split('T')[0],
        p_delivery_staff_id: params.deliveryStaffId,
        p_receiver_name: params.receiverName,
        p_notes: params.notes || null,
      })

      if (error) throw error
      return data as { success: boolean; batch_id: string; status: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['draft-laundry-batch'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-vendors'] })
      toast.success('Đã gửi lô giặt đi')
    },
    onError: (error: Error) => {
      toast.error('Lỗi gửi lô giặt', { description: getFriendlyError(error) })
    },
  })
}
