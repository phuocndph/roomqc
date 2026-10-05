import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'

/**
 * Hook Đợt B — quản lý các batch đang ở trạng thái cần đền bù.
 */
export function useCompensationBatches() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['laundry-compensation', tenantId, selectedHotel?.id, isAllHotelsMode],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return []
      let q = supabase
        .from('laundry_batches')
        .select(
          'id, batch_code, status, hotel_id, vendor_id, partially_received_at, compensation_amount, items_lost, items_damaged, policy_snapshot, delivery_date, expected_return_date, total_items'
        )
        .eq('tenant_id', tenantId)
        .in('status', ['partially_received', 'compensation_needed'])
        .order('partially_received_at', { ascending: true, nullsFirst: false })

      if (!isAllHotelsMode && selectedHotel?.id) {
        q = q.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

export function useMarkBatchPartiallyReceived() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      itemsReceived: { item_id: string; quantity: number }[]
      notes?: string
    }) => {
      const { data, error } = await supabase.rpc('mark_batch_partially_received', {
        _batch_id: params.batchId,
        _items: params.itemsReceived as any,
      } as any)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã ghi nhận nhận hàng thiếu. Hệ thống sẽ theo dõi đền bù.')
      qc.invalidateQueries({ queryKey: ['laundry-batches'] })
      qc.invalidateQueries({ queryKey: ['laundry-batch'] })
      qc.invalidateQueries({ queryKey: ['laundry-compensation'] })
    },
    onError: (e: any) => toast.error(e?.message || 'Không thể ghi nhận'),
  })
}

export function useSettleBatchCompensation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      compensationAmount: number
      notes?: string
    }) => {
      const { data, error } = await supabase.rpc('settle_batch_compensation', {
        _batch_id: params.batchId,
        _compensation_amount: params.compensationAmount,
        _notes: params.notes ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã chốt đền bù — lô giặt được đóng.')
      qc.invalidateQueries({ queryKey: ['laundry-batches'] })
      qc.invalidateQueries({ queryKey: ['laundry-compensation'] })
    },
    onError: (e: any) => toast.error(e?.message || 'Không thể chốt đền bù'),
  })
}

/**
 * Hook tạo lô khăn linen mới (FIFO batch_inventory).
 */
export function useCreateLinenBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      itemId: string
      quantity: number
      batchCode: string
      receivedAt?: string
      hotelId: string
    }) => {
      const { data, error } = await supabase.rpc('create_new_linen_batch', {
        _item_id: params.itemId,
        _quantity: params.quantity,
        _batch_code: params.batchCode,
      } as any)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Đã nhập lô khăn mới.')
      qc.invalidateQueries({ queryKey: ['linen-batches'] })
      qc.invalidateQueries({ queryKey: ['items'] })
    },
    onError: (e: any) => toast.error(e?.message || 'Không thể nhập lô mới'),
  })
}

export function useLinenBatches(itemId?: string | null) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  return useQuery({
    queryKey: ['linen-batches', tenantId, selectedHotel?.id, isAllHotelsMode, itemId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return []
      let q = supabase
        .from('batch_inventory')
        .select(
          'id, batch_code, item_id, quantity_initial, quantity_available, wash_cycles, received_at, retired_at, hotel_id'
        )
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: true })
      if (itemId) q = q.eq('item_id', itemId)
      if (!isAllHotelsMode && selectedHotel?.id) q = q.eq('hotel_id', selectedHotel.id)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}
