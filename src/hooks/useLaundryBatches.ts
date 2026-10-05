import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useTenant } from './useTenant'
import { toast } from './use-toast'
import { isAdminUser } from '@/lib/userAccess'
import { triggerWorkflow, WorkflowTriggerTypes } from '@/lib/triggerWorkflow'
import { useShiftGuardedMutation } from './useGuardedMutation'
import type { 
  LaundryBatchWithVendor, 
  LaundryBatchFilters,
  CreateBatchStep1Data,
  CreateBatchStep2Data,
  CreateBatchStep3Data,
  ReceiveBatchData,
  BatchStatus,
} from '@/types/laundry.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useLaundryBatches(
  filters: LaundryBatchFilters = {},
  page: number = 1,
  pageSize: number = 25
) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['laundry-batches', tenantId, selectedHotel?.id, isAllHotelsMode, filters, page, pageSize],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)
      
      const { data, error } = await supabase.rpc('get_laundry_batches_filtered', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelIdToFilter,
        p_vendor_id: filters.vendorId || null,
        p_status: filters.status || null,
        p_search: null,
        p_from_date: filters.fromDate ? filters.fromDate.toISOString().split('T')[0] : null,
        p_to_date: filters.toDate ? filters.toDate.toISOString().split('T')[0] : null,
        p_page: page,
        p_page_size: pageSize,
      })
      
      if (error) throw error
      
      return {
        batches: data as LaundryBatchWithVendor[],
        total: data?.[0]?.total_count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((data?.[0]?.total_count || 0) / pageSize),
      }
    },
    enabled: !!tenantId,
    placeholderData: (previousData) => previousData,
  })
}

export function useLaundryBatch(batchId: string | undefined) {
  const { user } = useUser()
  const { availableHotels } = useHotelContext()
  
  return useQuery({
    queryKey: ['laundry-batch', batchId],
    queryFn: async () => {
      if (!batchId) throw new Error('No batch ID')
      
      const { data, error } = await supabase
        .rpc('get_laundry_batch_detail', { p_batch_id: batchId })
      
      if (error) throw error
      
      // Hotel access check for non-admin users
      const batchData = data as any
      if (!isAdminUser(user) && availableHotels.length > 0 && batchData?.batch?.hotel_id) {
        const hasAccess = availableHotels.some(h => h.id === batchData.batch.hotel_id)
        if (!hasAccess) {
          throw new Error('Bạn không có quyền truy cập lô giặt này')
        }
      }
      
      return data
    },
    enabled: !!batchId,
  })
}

export function useCreateLaundryBatch() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  
  return useMutation({
    mutationFn: async ({
      step1,
      step2,
      step3,
    }: {
      step1: CreateBatchStep1Data
      step2: CreateBatchStep2Data
      step3: CreateBatchStep3Data
    }) => {
      if (!tenantId || !selectedHotel?.id) {
        throw new Error('Thiếu thông tin tenant hoặc hotel')
      }

      // Sử dụng RPC mới để tạo batch và update inventory atomic
      const { data, error } = await supabase.rpc('create_laundry_batch_with_items', {
        p_tenant_id: tenantId,
        p_hotel_id: selectedHotel.id,
        p_vendor_id: step1.vendor_id,
        p_delivery_date: step1.delivery_date.toISOString().split('T')[0],
        p_expected_return_date: step1.expected_return_date.toISOString().split('T')[0],
        p_delivery_staff_id: step1.delivery_staff_id,
        p_receiver_name: step1.receiver_name,
        p_notes: step1.notes || null,
        p_items: step2.items.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity,
          weight_kg: item.weight_kg,
          condition_note: item.condition_note || null,
        })),
      })

      if (error) throw error

      const result = data as { success: boolean; batch_id: string; batch_code: string; total_items: number; total_weight: number; estimated_cost: number }

      // Create notification
      await supabase
        .from('notifications')
        .insert({
          tenant_id: tenantId,
          role: 'department_manager',
          type: 'info',
          category: 'laundry',
          title: 'Lô giặt mới đã tạo',
          message: `Lô ${result.batch_code} với ${result.total_items} items đã được gửi đi giặt`,
          action_url: `/laundry/batches/${result.batch_id}`,
          related_type: 'laundry_batch',
          related_id: result.batch_id,
        })
      
      return { id: result.batch_id, batch_code: result.batch_code }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast({
        title: 'Thành công',
        description: 'Đã tạo lô giặt mới',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useReceiveLaundryBatch() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const { tenant } = useTenant()
  
  return useShiftGuardedMutation(useMutation({
    mutationFn: async ({
      batchId,
      data,
    }: {
      batchId: string
      data: ReceiveBatchData
    }) => {
      // 0. Validate current status - only 'ready' can transition to 'received'
      const { data: currentBatch, error: fetchError } = await supabase
        .from('laundry_batches')
        .select('status')
        .eq('id', batchId)
        .single()
      
      if (fetchError) throw fetchError
      
      if (currentBatch.status !== 'ready') {
        const statusLabels: Record<string, string> = {
          delivered: 'Đã giao',
          washing: 'Đang giặt',
          ready: 'Sẵn sàng nhận',
          received: 'Đã nhận về',
          stocked: 'Đã nhập kho',
        }
        throw new Error(
          `Chỉ có thể nhận lô giặt ở trạng thái "Sẵn sàng nhận". Trạng thái hiện tại: "${statusLabels[currentBatch.status] || currentBatch.status}"`
        )
      }

      // 1. Update batch
      const { error: batchError } = await supabase
        .from('laundry_batches')
        .update({
          actual_return_date: data.actual_return_date.toISOString(),
          return_staff_id: user?.id,
          delivery_person_name: data.delivery_person_name,
          actual_cost: data.actual_cost,
          quality_rating: data.quality_rating,
          timeliness_rating: data.timeliness_rating,
          items_lost: data.items.reduce((sum, item) => sum + item.quantity_lost, 0),
          items_damaged: data.items.reduce((sum, item) => sum + item.quantity_damaged, 0),
          compensation_amount: data.compensation_amount,
          return_photos: data.return_photos,
          return_notes: data.return_notes,
          status: 'received',
        })
        .eq('id', batchId)
      
      if (batchError) throw batchError
      
      // 2. Update batch items
      for (const item of data.items) {
        const { error: itemError } = await supabase
          .from('laundry_batch_items')
          .update({
            quantity_returned: item.quantity_returned,
            quantity_lost: item.quantity_lost,
            quantity_damaged: item.quantity_damaged,
            return_condition: item.return_condition,
          })
          .eq('batch_id', batchId)
          .eq('item_id', item.item_id)
        
        if (itemError) throw itemError
      }
      
      // 3. Create notifications if issues
      const totalLost = data.items.reduce((sum, item) => sum + item.quantity_lost, 0)
      const totalDamaged = data.items.reduce((sum, item) => sum + item.quantity_damaged, 0)
      
      if (totalLost > 0 || totalDamaged > 0) {
        await supabase
          .from('notifications')
          .insert({
            tenant_id: tenant?.id,
            role: 'hotel_manager',
            type: 'warning',
            category: 'laundry',
            title: 'Có vấn đề với lô giặt',
            message: `Lô giặt có ${totalLost} items mất và ${totalDamaged} items hỏng`,
            action_url: `/laundry/batches/${batchId}`,
            related_type: 'laundry_batch',
            related_id: batchId,
          })
      }
      
      return { totalLost, totalDamaged }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-batch', variables.batchId] })
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-dashboard-stats'] })
      
      if (result.totalLost === 0 && result.totalDamaged === 0) {
        toast({
          title: '🎉 Hoàn tất!',
          description: 'Đã nhận đồ giặt thành công, không có vấn đề gì',
        })
      } else {
        toast({
          title: 'Đã nhận đồ giặt',
          description: `Có ${result.totalLost} items mất và ${result.totalDamaged} items hỏng`,
        })
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  }))
}

export function useUpdateBatchStatus() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    delivered: ['ready'],
    washing: ['ready'],
    ready: ['received'],
    received: ['stocked']
  }
  
  const statusLabels: Record<string, string> = {
    delivered: 'Đã giao',
    washing: 'Đang giặt',
    ready: 'Sẵn sàng nhận',
    received: 'Đã nhận về',
    stocked: 'Đã nhập kho'
  }
  
  return useShiftGuardedMutation(useMutation({
    mutationFn: async ({
      batchId,
      status,
    }: {
      batchId: string
      status: BatchStatus
    }) => {
      // Lấy status hiện tại
      const { data: batch, error: fetchError } = await supabase
        .from('laundry_batches')
        .select('status')
        .eq('id', batchId)
        .single()
      
      if (fetchError) throw fetchError
      
      // Validate transition
      const currentStatus = batch.status
      const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || []
      
      if (!allowedNext.includes(status)) {
        throw new Error(
          `Không thể chuyển từ "${statusLabels[currentStatus] || currentStatus}" sang "${statusLabels[status] || status}". ` +
          `Trạng thái hợp lệ: ${allowedNext.map(s => statusLabels[s] || s).join(', ')}`
        )
      }
      
      const { error } = await supabase
        .from('laundry_batches')
        .update({ status })
        .eq('id', batchId)
      
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-batch', variables.batchId] })
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      
      // Trigger workflow for laundry batch status change
      if (tenant?.id) {
        triggerWorkflow({
          triggerType: WorkflowTriggerTypes.LAUNDRY_BATCH_STATUS_CHANGE,
          eventData: {
            batch_id: variables.batchId,
            new_status: variables.status,
          },
          tenantId: tenant.id,
          hotelId: selectedHotel?.id,
        }).catch(err => console.error('[triggerWorkflow] laundry_batch_status_change error:', err))
      }
      
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật trạng thái lô giặt',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  }))
}

export function useUpdateBatchCost() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  
  return useMutation({
    mutationFn: async ({
      batchId,
      total_weight_kg,
      estimated_cost,
      actual_cost
    }: {
      batchId: string
      total_weight_kg: number
      estimated_cost: number
      actual_cost?: number
    }) => {
      if (!tenant?.id) throw new Error('Tenant không tồn tại')

      const { error } = await supabase
        .from('laundry_batches')
        .update({ 
          total_weight_kg,
          estimated_cost,
          ...(actual_cost !== undefined && { actual_cost })
        })
        .eq('id', batchId)
        .eq('tenant_id', tenant.id)
      
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-batch', variables.batchId] })
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật chi phí',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    }
  })
}

export function useStockInFromLaundry() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { user } = useUser()
  const { selectedHotel } = useHotelContext()
  
  return useShiftGuardedMutation(useMutation({
    mutationFn: async ({
      batchId,
      batchCode,
      items
    }: {
      batchId: string
      batchCode: string
      items: Array<{
        item_id: string
        quantity_returned: number
        quantity_lost?: number
        quantity_damaged?: number
      }>
    }) => {
      if (!tenant?.id || !user?.id || !selectedHotel?.id) {
        throw new Error('Missing required data')
      }
      
      // 1. LẤY THÔNG TIN BATCH
      const { data: batchData, error: batchError } = await supabase
        .from('laundry_batches')
        .select('items_lost, items_damaged, status')
        .eq('id', batchId)
        .single()
      
      if (batchError) throw batchError
      
      // 2. VALIDATE STATUS (phải là 'received')
      if (batchData.status !== 'received') {
        throw new Error('Batch phải ở trạng thái "Đã nhận về" mới có thể nhập kho')
      }
      
      // 3. LẤY GIÁ TỪ DATABASE
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('id, unit_price, name')
        .in('id', items.map(i => i.item_id))
      
      if (itemsError) throw itemsError
      
      // 4. FORMAT ITEMS VỚI GIÁ ĐÚNG - chỉ items OK
      const okItems = items
        .filter(item => item.quantity_returned > 0)
        .map(item => {
          const itemData = itemsData?.find(i => i.id === item.item_id)
          return {
            item_id: item.item_id,
            quantity: item.quantity_returned,
            unit_price: itemData?.unit_price || 0,
            notes: null
          }
        })
      
      // 5. TẠO LAUNDRY RETURN TRANSACTION (items OK)
      // Dùng RPC mới: KHÔNG cộng quantity_total, chỉ +stock, -laundry
      if (okItems.length > 0) {
        const { error: returnError } = await supabase.rpc('create_laundry_return_transaction', {
          p_tenant_id: tenant.id,
          p_hotel_id: selectedHotel.id,
          p_from_location: 'Đơn vị giặt',
          p_to_location: selectedHotel.name,
          p_created_by: user.id,
          p_items: okItems as any,
          p_related_id: batchId,
          p_notes: `Nhập kho từ lô giặt ${batchCode}`,
        })
        
        if (returnError) throw returnError
      }
      
      // 6. XỬ LÝ ITEMS MẤT (nếu có) - Dùng RPC mới
      const lostItems = items
        .filter(item => item.quantity_lost && item.quantity_lost > 0)
        .map(item => ({
          item_id: item.item_id,
          quantity: item.quantity_lost!,
        }))
      
      if (lostItems.length > 0) {
        const { error: lostError } = await supabase.rpc('create_laundry_loss_transaction', {
          p_tenant_id: tenant.id,
          p_hotel_id: selectedHotel.id,
          p_created_by: user.id,
          p_items: lostItems as any,
          p_loss_type: 'lost',
          p_related_id: batchId,
          p_notes: `Items mất từ lô giặt ${batchCode}`,
        })
        
        if (lostError) throw lostError
      }
      
      // 7. XỬ LÝ ITEMS HƯ HỎNG (nếu có) - Dùng RPC mới
      const damagedItems = items
        .filter(item => item.quantity_damaged && item.quantity_damaged > 0)
        .map(item => ({
          item_id: item.item_id,
          quantity: item.quantity_damaged!,
        }))
      
      if (damagedItems.length > 0) {
        const { error: damagedError } = await supabase.rpc('create_laundry_loss_transaction', {
          p_tenant_id: tenant.id,
          p_hotel_id: selectedHotel.id,
          p_created_by: user.id,
          p_items: damagedItems as any,
          p_loss_type: 'damaged',
          p_related_id: batchId,
          p_notes: `Items hư hỏng từ lô giặt ${batchCode}`,
        })
        
        if (damagedError) throw damagedError
      }
      
      // 8. RPC đã xử lý tất cả quantity updates, không cần làm thủ công
      
      // 9. CẬP NHẬT STATUS BATCH
      const { error: updateError } = await supabase
        .from('laundry_batches')
        .update({ status: 'stocked' })
        .eq('id', batchId)
        .eq('tenant_id', tenant.id)
      
      if (updateError) throw updateError
      
      // 10. Get batch info for notification
      const { data: batchInfo } = await supabase
        .from('laundry_batches')
        .select('batch_code, hotel_id, total_items')
        .eq('id', batchId)
        .single()
      
      return { batchInfo, batchCode }
    },
    onSuccess: async (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-batch', variables.batchId] })
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      
      // Trigger laundry completed notification
      if (result.batchInfo && tenant?.id) {
        const { triggerLaundryCompletedNotification } = await import('./useNotificationTriggers')
        await triggerLaundryCompletedNotification({
          tenantId: tenant.id,
          hotelId: result.batchInfo.hotel_id,
          batchCode: result.batchInfo.batch_code,
          totalItems: result.batchInfo.total_items || 0,
          batchId: variables.batchId,
          completedByUserId: user?.id,
        }).catch(err => console.error('Failed to send laundry notification:', err))
      }
      
      toast({
        title: 'Thành công',
        description: 'Đã nhập kho thành công! Tất cả items đã được cập nhật vào kho',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi nhập kho',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    }
  }))
}
