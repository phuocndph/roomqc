import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useToast } from '@/hooks/use-toast'
import { useImageUpload } from './useImageUpload'
import { triggerWorkflow } from '@/lib/triggerWorkflow'
import { 
  createMultipleNotifications, 
  sendMultiplePushNotifications,
  sendTelegramNotification
} from '@/hooks/useNotificationTriggers'
import { getNotificationRecipients } from '@/utils/notificationRecipients'
import type { RoomCheckFormData, LaundryItem, LostItem, ConsumedItem, DamagedItem, RoomStatusV2 } from '@/types/rooms.types'

/**
 * Helper nội bộ: chuyển trạng thái phòng qua RPC `transition_room_status` để
 * đảm bảo audit log + state machine v2. Nuốt lỗi INVALID_TRANSITION khi phòng
 * đã ở đúng trạng thái mong muốn (tương đương filter `.in('status', [...])` cũ).
 */
async function safeTransitionRoomStatus(
  roomId: string,
  toStatus: RoomStatusV2,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('transition_room_status', {
    _room_id: roomId,
    _to_status: toStatus,
    _reason: reason,
  })
  if (error && !/INVALID_TRANSITION|ALREADY_IN_STATUS/i.test(error.message)) {
    console.error('[useRoomChecks] transition_room_status failed:', error.message)
  }
}

export function useRoomChecks(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-checks', roomId],
    queryFn: async () => {
      if (!roomId) throw new Error('No room ID')
      
      const { data, error } = await supabase
        .from('room_checks')
        .select(`
          *,
          checked_by:users!room_checks_checked_by_fkey(
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('room_id', roomId)
        .order('checked_at', { ascending: false })
        .limit(20)
      
      if (error) throw error
      return data
    },
    enabled: !!roomId,
  })
}

// Helper to generate transaction code for inventory tracking
function generateTransactionCode(prefix: string): string {
  const now = new Date()
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const random = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${timestamp}-${random}`
}

// ===== DAILY CHECK LOGIC =====
// Chỉ update room_items (laundry, change), không tạo inventory transaction
// Nếu có đồ gửi giặt → tự động tạo laundry_request
// Nếu có đồ tiêu hao → tự động tạo supplement_request
async function processDailyCheck(params: {
  roomId: string
  data: RoomCheckFormData
  userId?: string
  tenantId?: string
  hotelId: string
  roomNumber: string
  checkId?: string      // Để liên kết với laundry/supplement request
  userName?: string     // Hiển thị người tạo request
}) {
  const { roomId, data, userId, tenantId, hotelId, roomNumber, checkId, userName } = params
  const quantityChanges: Record<string, number> = {}
  
  // 1. Đồ gửi giặt (change action) → Giảm quantity trong room_items
  // Và cập nhật quantity_in_laundry trong items table
  const laundryItems = data.items_sent_to_laundry || []
  for (const item of laundryItems) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) - item.quantity
  }
  
  // Update quantity_in_laundry in items table
  if (laundryItems.length > 0) {
    await updateLaundryQuantities(laundryItems)
  }
  
  // 2. Đồ thay thế (từ action "change") → Tăng quantity (bù lại vào phòng)
  for (const item of data.items_replaced || []) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) + item.quantity
  }
  
  // 3. Đồ tiêu hao (consumed) → Giảm quantity
  const consumedItems = data.items_consumed || []
  for (const item of consumedItems) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) - item.quantity
  }
  
  // Apply quantity changes to room_items
  await applyRoomItemChanges(roomId, quantityChanges, userId)
  
  // 4. Auto-create laundry request nếu có đồ gửi giặt
  const hasLaundry = laundryItems.length > 0
  
  
  if (hasLaundry && tenantId && userId && checkId) {
    try {
      
      await createLaundryRequestFromCheck({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        checkId,
        laundryItems,
      })
      
    } catch (err) {
      console.error('[processDailyCheck] Failed to create laundry request:', err)
      // Không throw - cho phép room check vẫn thành công
    }
  }
  
  // 5. Auto-create supplement request nếu có đồ tiêu hao HOẶC đồ thiếu (shortage)
  const shortageItems = ((data.items_missing || []) as any[])
    .filter(it => it?.reason === 'shortage' && (it.shortage || 0) > 0)
    .map(it => ({
      item_id: it.item_id,
      item_name: it.item_name,
      item_code: it.item_code,
      quantity: Number(it.shortage || 0),
      need_refill: true,
    })) as ConsumedItem[]

  const hasConsumed = consumedItems.length > 0
  const hasShortage = shortageItems.length > 0

  if ((hasConsumed || hasShortage) && tenantId && userId && checkId) {
    try {
      
      // Gộp consumed + shortage thành 1 phiếu yêu cầu bổ sung
      await createSupplementRequestFromCheck({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        checkId,
        consumedItems: [...consumedItems, ...shortageItems],
        lostItems: [],
      })
      
    } catch (err) {
      console.error('[processDailyCheck] Failed to create supplement request:', err)
    }
  }

  // 6. Auto-create maintenance request nếu có đồ hỏng (damaged) trong daily check
  const damagedItems = data.items_damaged || []
  if (damagedItems.length > 0 && tenantId && userId && checkId) {
    try {
      
      await createMaintenanceForDamagedItems({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        checkId,
        damagedItems,
      })
      
    } catch (err) {
      console.error('[processDailyCheck] Failed to create maintenance request:', err)
    }
  }

  // 7. Auto-create cleaning task nếu phòng cần lau dọn (room_condition !== 'clean')
  const roomCondition = (data as any).room_condition || 'clean'
  if (roomCondition !== 'clean' && tenantId && userId && checkId) {
    try {
      const priorityMap: Record<string, string> = {
        'very_dirty': 'high',
        'dirty': 'medium',
      }
      const taskPriority = (data as any).cleaning_priority || priorityMap[roomCondition] || 'medium'
      const conditionLabel = roomCondition === 'very_dirty' ? 'Rất bẩn' : 'Bẩn nhẹ'

      const { error: taskError } = await supabase
        .from('housekeeping_tasks')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: roomId,
          task_type: 'cleaning',
          title: `Lau dọn phòng ${roomNumber}`,
          description: (data as any).cleaning_notes || `Yêu cầu lau dọn từ kiểm tra hằng ngày. Tình trạng: ${conditionLabel}`,
          priority: taskPriority,
          requested_by: userId,
          room_check_id: checkId,
          status: 'pending'
        })

      if (taskError) {
        console.error('[processDailyCheck] Error creating cleaning task:', taskError)
      }
    } catch (err) {
      console.error('[processDailyCheck] Failed to create cleaning task:', err)
    }
  }

  return { quantityChanges }
}

// ===== CHECK-IN VALIDATION =====
// Validate phòng sẵn sàng, block nếu có thiết bị hỏng
interface CheckinValidationResult {
  isReady: boolean
  blockedReason?: string
  damagedEquipment: DamagedItem[]
  missingItems: any[]
}

async function validateCheckinReadiness(params: {
  roomId: string
  data: RoomCheckFormData
  hotelId: string
  roomNumber: string
}): Promise<CheckinValidationResult> {
  const { data } = params
  
  const damagedEquipment = (data.items_damaged || []).filter(item => 
    // Equipment/Furniture có damage_type = 'replacement_needed' thì block
    item.damage_type === 'replacement_needed'
  )
  
  const missingItems = data.items_missing || []
  
  // Block check-in nếu có thiết bị hỏng cần thay thế
  if (damagedEquipment.length > 0) {
    return {
      isReady: false,
      blockedReason: `Có ${damagedEquipment.length} thiết bị hỏng cần thay thế trước khi nhận khách`,
      damagedEquipment,
      missingItems,
    }
  }
  
  // Warning nếu có đồ thiếu nhưng không block
  return {
    isReady: true,
    damagedEquipment: [],
    missingItems,
  }
}

async function processCheckinCheck(params: {
  roomId: string
  data: RoomCheckFormData
  userId?: string
  tenantId?: string
  hotelId: string
  roomNumber: string
}) {
  const { roomId, data, userId, hotelId, roomNumber } = params
  const quantityChanges: Record<string, number> = {}
  
  // Validate trước
  const validation = await validateCheckinReadiness({ 
    roomId, 
    data, 
    hotelId, 
    roomNumber 
  })
  
  // 1. Đồ thêm (add action) → Tăng quantity
  for (const item of data.items_replaced || []) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) + item.quantity
  }
  
  // Apply changes
  await applyRoomItemChanges(roomId, quantityChanges, userId)
  
  // Auto-change room status: vacant_* → occupied_clean (phòng đã có khách)
  // State Machine v2: gọi qua RPC để có audit log; RPC trả INVALID_TRANSITION
  // sẽ bị swallow nếu phòng đã ở trạng thái khác hợp lệ.
  if (validation.isReady) {
    await safeTransitionRoomStatus(roomId, 'occupied_clean', 'Khách check-in (room check)')
  }
  
  return { quantityChanges, validation }
}

// ===== CHECKOUT FULL TRACKING =====
// Tạo inventory transaction cho lost/consumed, complete inspection
// Handle cleaning request and notifications
async function processCheckoutCheck(params: {
  roomId: string
  data: RoomCheckFormData
  userId?: string
  tenantId?: string
  hotelId: string
  roomNumber: string
  checkId: string
  inspectionId?: string
  userName?: string
}) {
  const { roomId, data, userId, tenantId, hotelId, roomNumber, checkId, inspectionId, userName } = params
  const quantityChanges: Record<string, number> = {}
  
  // 1. Đồ gửi giặt → Giảm quantity trong room_items
  const laundryItems = data.items_sent_to_laundry || []
  for (const item of laundryItems) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) - item.quantity
  }
  
  if (laundryItems.length > 0) {
    await updateLaundryQuantities(laundryItems)
  }
  
  // 2. Đồ mất → Giảm quantity, TẠO INVENTORY TRANSACTION (parallel)
  const lostItems = data.items_lost || []
  for (const item of lostItems) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) - item.quantity
  }
  
  // 3. Đồ tiêu hao → Giảm quantity, TẠO INVENTORY TRANSACTION (parallel)
  const consumedItems = data.items_consumed || []
  for (const item of consumedItems) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) - item.quantity
  }
  
  // Create all inventory transactions in parallel
  if (tenantId && userId) {
    await Promise.all([
      // All lost items in parallel
      ...lostItems.map(item => createLostItemTransaction({
        item,
        tenantId,
        hotelId,
        roomNumber,
        checkId,
        userId,
      })),
      // All consumed items in parallel
      ...consumedItems.map(item => createConsumedItemTransaction({
        item,
        tenantId,
        hotelId,
        roomNumber,
        checkId,
        userId,
      })),
    ])
  }
  
  // 4. Đồ thay thế → Tăng quantity
  for (const item of data.items_replaced || []) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) + item.quantity
  }
  
  // Apply changes
  await applyRoomItemChanges(roomId, quantityChanges, userId)
  
  // 5. Complete checkout inspection
  await completeCheckoutInspection(roomId, checkId, inspectionId)
  
  // 6. Handle room status based on cleaning request
  const needsCleaning = data.needs_cleaning ?? false
  const roomCondition = data.room_condition ?? 'clean'
  
  if (needsCleaning || roomCondition !== 'clean') {
    // Phòng cần dọn → vacant_dirty (chờ HK) — qua RPC để có audit log
    await safeTransitionRoomStatus(roomId, 'vacant_dirty', 'Khách checkout, cần dọn (room check)')
    
    // Gửi thông báo cho Manager
    if (tenantId && userId) {
      await sendCleaningRequestNotifications({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        priority: data.cleaning_priority || 'medium',
        notes: data.cleaning_notes,
        roomCondition,
      })
      
      // ✨ AUTO-CREATE CLEANING TASK
      // Tạo housekeeping_task loại 'cleaning' để nhân viên thấy trong task list
      const priorityMap: Record<string, string> = {
        'very_dirty': 'high',
        'dirty': 'medium', 
        'clean': 'low'
      }
      const taskPriority = data.cleaning_priority || priorityMap[roomCondition] || 'medium'
      
      const { error: taskError } = await supabase
        .from('housekeeping_tasks')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: roomId,
          task_type: 'cleaning',
          title: `Dọn dẹp phòng ${roomNumber}`,
          description: data.cleaning_notes || `Yêu cầu dọn phòng sau checkout. Tình trạng: ${roomCondition === 'very_dirty' ? 'Rất bẩn' : roomCondition === 'dirty' ? 'Bẩn' : 'Bình thường'}`,
          priority: taskPriority,
          requested_by: userId,
          room_check_id: checkId,
          status: 'pending'
        })
      
      if (taskError) {
        console.error('[useRoomChecks] Error creating cleaning task:', taskError)
      } else {
        
        
        // Trigger workflow for automation (e.g., notify assigned staff)
        triggerWorkflow({
          triggerType: 'housekeeping_task_created',
          eventData: {
            task_type: 'cleaning',
            task_type_label: 'Dọn phòng',
            priority: taskPriority,
            room_id: roomId,
            room_number: roomNumber,
            hotel_id: hotelId,
            title: `Dọn dẹp phòng ${roomNumber}`,
          },
          tenantId,
          hotelId,
        }).catch(err => console.error('[useRoomChecks] Workflow trigger failed:', err))
      }
    }
  } else {
    // Phòng đã sạch sẵn → vacant_clean (sẵn sàng bán) — qua RPC
    await safeTransitionRoomStatus(roomId, 'vacant_clean', 'Khách checkout, phòng sạch (room check)')
  }
  
  // 7. Create automated requests for supplements, laundry, and maintenance
  const hasConsumedOrLost = (data.items_consumed?.length || 0) > 0 || (data.items_lost?.length || 0) > 0
  const hasLaundry = (data.items_sent_to_laundry?.length || 0) > 0
  const hasDamaged = (data.items_damaged?.length || 0) > 0
  
  if (tenantId && userId) {
    // Create supplement request for consumed/lost items
    if (hasConsumedOrLost) {
      await createSupplementRequestFromCheck({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        checkId,
        consumedItems: data.items_consumed || [],
        lostItems: data.items_lost || [],
      })
    }
    
    // Create laundry request and auto-add to draft batch
    if (hasLaundry) {
      await createLaundryRequestFromCheck({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        checkId,
        laundryItems: data.items_sent_to_laundry || [],
      })
    }
    
    // Create maintenance requests for damaged equipment/furniture
    if (hasDamaged) {
      await createMaintenanceForDamagedItems({
        roomId,
        roomNumber,
        tenantId,
        hotelId,
        userId,
        userName: userName || 'Nhân viên',
        checkId,
        damagedItems: data.items_damaged || [],
      })
    }
  }
  
  return { quantityChanges, needsCleaning }
}

// ===== MAINTENANCE CHECK =====
// Validate sau sửa chữa, chỉ update room_items, chuyển trạng thái maintenance → vacant
async function processMaintenanceCheck(params: {
  roomId: string
  data: RoomCheckFormData
  userId?: string
}) {
  const { roomId, data, userId } = params
  const quantityChanges: Record<string, number> = {}
  
  // Đồ thêm sau bảo trì
  for (const item of data.items_replaced || []) {
    quantityChanges[item.item_id] = (quantityChanges[item.item_id] || 0) + item.quantity
  }
  
  await applyRoomItemChanges(roomId, quantityChanges, userId)
  
  // Auto-change room status: out_of_order/out_of_service → vacant_clean (đã sửa xong)
  await safeTransitionRoomStatus(roomId, 'vacant_clean', 'Hoàn tất bảo trì (room check)')
  
  return { quantityChanges }
}

// ===== HELPER FUNCTIONS =====

async function updateLaundryQuantities(laundryItems: LaundryItem[]) {
  if (laundryItems.length === 0) return
  
  // Use atomic RPC to prevent race conditions
  await Promise.all(laundryItems.map(async (item) => {
    const { error } = await supabase.rpc('atomic_item_to_laundry', {
      p_item_id: item.item_id,
      p_quantity: item.quantity,
    })
    
    if (error) {
      console.error('Error updating quantity_in_laundry:', error)
    }
  }))
}

async function createLostItemTransaction(params: {
  item: LostItem
  tenantId: string
  hotelId: string
  roomNumber: string
  checkId: string
  userId: string
}) {
  const { item, tenantId, hotelId, roomNumber, checkId, userId } = params
  
  // Use atomic RPC to prevent race conditions
  const { data: result, error: rpcError } = await supabase.rpc('atomic_item_lost', {
    p_item_id: item.item_id,
    p_quantity: item.quantity,
  })
  
  if (rpcError) {
    console.error('Error in atomic_item_lost:', rpcError)
    return
  }
  
  const row = Array.isArray(result) ? result[0] : result
  if (row) {
    await supabase.from('inventory_transactions').insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      transaction_code: generateTransactionCode('LOST'),
      transaction_type: 'out',
      transaction_category: 'lost',
      item_id: item.item_id,
      quantity: item.quantity,
      quantity_before: row.quantity_before,
      quantity_after: row.quantity_after,
      unit_price: row.unit_price || 0,
      total_value: (row.unit_price || 0) * item.quantity,
      from_location: `Phòng ${roomNumber}`,
      to_location: 'Mất/Thất lạc',
      related_type: 'room_check',
      related_id: checkId,
      notes: `Mất trong khi kiểm tra checkout phòng ${roomNumber}`,
      created_by: userId,
    })
  }
}

async function createConsumedItemTransaction(params: {
  item: ConsumedItem
  tenantId: string
  hotelId: string
  roomNumber: string
  checkId: string
  userId: string
}) {
  const { item, tenantId, hotelId, roomNumber, checkId, userId } = params
  
  // Use atomic RPC to prevent race conditions
  const { data: result, error: rpcError } = await supabase.rpc('atomic_item_consumed', {
    p_item_id: item.item_id,
    p_quantity: item.quantity,
  })
  
  if (rpcError) {
    console.error('Error in atomic_item_consumed:', rpcError)
    return
  }
  
  const row = Array.isArray(result) ? result[0] : result
  if (row) {
    await supabase.from('inventory_transactions').insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      transaction_code: generateTransactionCode('CONS'),
      transaction_type: 'out',
      transaction_category: 'consumed',
      item_id: item.item_id,
      quantity: item.quantity,
      quantity_before: row.quantity_before,
      quantity_after: row.quantity_after,
      unit_price: row.unit_price || 0,
      total_value: (row.unit_price || 0) * item.quantity,
      from_location: `Phòng ${roomNumber}`,
      to_location: 'Khách sử dụng',
      related_type: 'room_check',
      related_id: checkId,
      notes: `Khách sử dụng trong phòng ${roomNumber}`,
      created_by: userId,
    })
  }
}

async function applyRoomItemChanges(
  roomId: string, 
  quantityChanges: Record<string, number>,
  userId?: string
) {
  if (Object.keys(quantityChanges).length === 0) return
  
  // Get current quantities
  const { data: currentItems } = await supabase
    .from('room_items')
    .select('item_id, quantity, standard_quantity')
    .eq('room_id', roomId)
    .in('item_id', Object.keys(quantityChanges))
  
  const currentQtyMap: Record<string, number> = {}
  const standardQtyMap: Record<string, number> = {}
  for (const item of currentItems || []) {
    currentQtyMap[item.item_id] = item.quantity || 0
    standardQtyMap[item.item_id] = item.standard_quantity || 0
  }
  
  const updates = Object.entries(quantityChanges).map(([itemId, change]) => {
    const currentQty = currentQtyMap[itemId] ?? standardQtyMap[itemId] ?? 0
    const newQty = Math.max(0, currentQty + change)
    
    return {
      room_id: roomId,
      item_id: itemId,
      quantity: newQty,
      last_checked_at: new Date().toISOString(),
      last_checked_by: userId,
    }
  })
  
  if (updates.length > 0) {
    const { error: updateError } = await supabase
      .from('room_items')
      .upsert(updates, { onConflict: 'room_id,item_id' })
    
    if (updateError) throw updateError
  }
}

async function completeCheckoutInspection(
  roomId: string, 
  checkId: string, 
  inspectionId?: string
) {
  let effectiveInspectionId = inspectionId
  
  // Fallback: query for pending/in_progress inspection
  if (!effectiveInspectionId) {
    
    
    const { data: foundInspection } = await supabase
      .from('checkout_inspection_requests')
      .select('id')
      .eq('room_id', roomId)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (foundInspection) {
      
      effectiveInspectionId = foundInspection.id
    }
  }
  
  if (effectiveInspectionId) {
    
    const { error: inspectionError } = await supabase
      .from('checkout_inspection_requests')
      .update({
        status: 'completed',
        room_check_id: checkId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', effectiveInspectionId)
    
    if (inspectionError) {
      console.error('[useRoomChecks] Error completing checkout inspection:', inspectionError)
    }
  }
}

// ===== MAIN MUTATION =====
export function useCreateRoomCheck() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user, tenantId } = useUser()
  const { deleteImage } = useImageUpload()
  
  return useMutation({
    mutationFn: async ({ 
      roomId, 
      data,
      itemQuantities,
      inspectionId
    }: { 
      roomId: string
      data: RoomCheckFormData
      itemQuantities?: Record<string, number>
      inspectionId?: string
    }) => {
      // Get room info first
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('hotel_id, room_number')
        .eq('id', roomId)
        .single()
      
      if (roomError) throw roomError
      
      const hotelId = room.hotel_id
      const roomNumber = room.room_number

      // Enrich items_consumed with unit_price before saving (checkout only)
      // OPTIMIZED: Batch fetch all prices in 1 query instead of N sequential queries
      let consumedItemsWithPrice = data.items_consumed || []
      if (data.check_type === 'checkout' && consumedItemsWithPrice.length > 0) {
        const itemIds = consumedItemsWithPrice.map(i => i.item_id)
        const { data: itemsWithPrices } = await supabase
          .from('items')
          .select('id, unit_price')
          .in('id', itemIds)
        
        const priceMap = Object.fromEntries(
          (itemsWithPrices || []).map(i => [i.id, i.unit_price || 0])
        )
        
        consumedItemsWithPrice = consumedItemsWithPrice.map(item => ({
          ...item,
          unit_price: priceMap[item.item_id] || 0,
        }))
      }

      // Create room check record
      const insertData = {
        room_id: roomId,
        checked_by: user?.id,
        check_type: data.check_type,
        cleanliness_score: data.cleanliness_score,
        items_complete: data.items_complete,
        items_missing: data.items_missing || [],
        items_damaged: data.items_damaged || [],
        items_sent_to_laundry: data.items_sent_to_laundry || [],
        items_consumed: consumedItemsWithPrice,
        items_lost: data.items_lost || [],
        items_replaced: data.items_replaced || [],
        notes: data.notes,
        photos: data.photos || [],
      }
      
      const { data: check, error } = await supabase
        .from('room_checks')
        .insert(insertData as any)
        .select()
        .single()

      if (error) {
        // Handle duplicate check
        const maybeCode = (error as any)?.code
        const maybeMsg = (error as any)?.message as string | undefined
        if (maybeCode === '23505' && maybeMsg?.includes('Duplicate check detected')) {
          const { data: existingCheck, error: fetchError } = await supabase
            .from('room_checks')
            .select('*')
            .eq('room_id', roomId)
            .eq('check_type', data.check_type)
            .order('checked_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (fetchError) throw fetchError
          if (existingCheck) return { ...(existingCheck as any), __duplicate: true }
        }

        throw error
      }

      // Delete old photos from previous checks - FIRE AND FORGET (non-blocking)
      // Wrap in async IIFE to handle properly
      (async () => {
        try {
          const { data: recentChecks } = await supabase
            .from('room_checks')
            .select('id, photos')
            .eq('room_id', roomId)
            .order('checked_at', { ascending: false })
            .limit(10)
          
          if (recentChecks && recentChecks.length > 1) {
            const oldChecks = recentChecks.slice(1)
            for (const oldCheck of oldChecks) {
              if (oldCheck.photos && Array.isArray(oldCheck.photos) && oldCheck.photos.length > 0) {
                // Delete photos in parallel
                await Promise.allSettled(
                  oldCheck.photos.map(async (photoUrl: string) => {
                    const urlParts = photoUrl.split('/item-images/')
                    if (urlParts.length > 1) {
                      await deleteImage(urlParts[1])
                    }
                  })
                )
                // Clear photos array
                await supabase
                  .from('room_checks')
                  .update({ photos: [] })
                  .eq('id', oldCheck.id)
              }
            }
          }
        } catch (err) {
          console.error('Cleanup old photos failed:', err)
        }
      })() // Fire and forget - no await

      // ===== PROCESS BY CHECK TYPE =====
      const baseParams = {
        roomId,
        data,
        userId: user?.id,
        tenantId,
        hotelId,
        roomNumber,
      }

      switch (data.check_type) {
        case 'daily':
          // Daily: Update room_items + auto-create laundry request nếu có
          await processDailyCheck({
            ...baseParams,
            checkId: check.id,
            userName: user?.full_name || 'Nhân viên',
          })
          break

        case 'checkin': {
          // Check-in: Validate + update room_items
          const { validation } = await processCheckinCheck(baseParams)
          if (!validation.isReady) {
            // Store warning in check record
            console.warn('[useRoomChecks] Check-in blocked:', validation.blockedReason)
          }
          break
        }

        case 'checkout':
          // Checkout: Full inventory tracking + complete inspection + cleaning request
          await processCheckoutCheck({
            ...baseParams,
            checkId: check.id,
            inspectionId,
            userName: user?.full_name || user?.email || 'Nhân viên',
          })
          break

        case 'maintenance':
          // Maintenance: Validate + update room_items
          await processMaintenanceCheck(baseParams)
          break
      }

      // Apply manual item quantities if provided
      if (itemQuantities) {
        const manualUpdates = Object.entries(itemQuantities)
          .map(([itemId, quantity]) => ({
            room_id: roomId,
            item_id: itemId,
            quantity: quantity,
            last_checked_at: new Date().toISOString(),
            last_checked_by: user?.id,
          }))
        
        if (manualUpdates.length > 0) {
          const { error: updateError } = await supabase
            .from('room_items')
            .upsert(manualUpdates, { onConflict: 'room_id,item_id' })
          
          if (updateError) throw updateError
        }
      }
      
      // Update last_checked timestamp for all room items
      await supabase
        .from('room_items')
        .update({
          last_checked_at: new Date().toISOString(),
          last_checked_by: user?.id,
        })
        .eq('room_id', roomId)

      // ===== NOTIFICATIONS (checkout only) =====
      if (data.check_type === 'checkout') {
        await sendCheckoutNotifications({
          roomId,
          roomNumber,
          checkId: check.id,
          data,
          tenantId: tenantId!,
          hotelId,
          userId: user?.id,
        })
      }
      
      // Notifications for issues (non-checkout)
      const totalIssues = (data.items_missing?.length || 0) + (data.items_damaged?.length || 0)
      if (totalIssues > 0 && data.check_type !== 'checkout') {
        await sendIssueNotifications({
          roomId,
          roomNumber,
          data,
          tenantId: tenantId!,
          hotelId,
          userId: user?.id,
        })
      }
      
      // Trigger workflow - FIRE AND FORGET (non-blocking)
      if (tenantId) {
        const hasIssues = 
          (data.items_missing?.length || 0) > 0 ||
          (data.items_damaged?.length || 0) > 0 ||
          (data.items_lost?.length || 0) > 0
        
        // Remove await - let it run in background
        triggerWorkflow({
          triggerType: 'room_check_completed',
          eventData: {
            room_id: roomId,
            room_number: roomNumber,
            check_type: data.check_type,
            check_id: check.id,
            has_issues: hasIssues,
            missing_count: data.items_missing?.length || 0,
            damaged_count: data.items_damaged?.length || 0,
            lost_count: data.items_lost?.length || 0,
            laundry_count: data.items_sent_to_laundry?.length || 0,
            consumed_count: data.items_consumed?.length || 0,
            cleanliness_score: data.cleanliness_score,
            staff_name: user?.full_name || 'Nhân viên',
            issue_summary: hasIssues 
              ? `Thiếu ${data.items_missing?.length || 0}, Hỏng ${data.items_damaged?.length || 0}, Mất ${data.items_lost?.length || 0}`
              : 'Không có vấn đề',
          },
          tenantId,
          hotelId,
        }).catch(err => console.error('Workflow trigger failed:', err))
      }
      
      return check
    },
    onSuccess: (check: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room-checks', variables.roomId] })
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['checkout-inspection'] })
      queryClient.invalidateQueries({ queryKey: ['pending-inspection'] })
      queryClient.invalidateQueries({ queryKey: ['room-has-pending-inspection'] })
      
      // Invalidate laundry & supplement requests để UI cập nhật realtime
      queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['draft-laundry-batch'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })

      const isDuplicate = !!check?.__duplicate

      toast({
        title: isDuplicate ? 'Đã có kiểm tra gần đây' : 'Thành công',
        description: isDuplicate
          ? 'Phòng đã được kiểm tra trong 5 phút gần đây. Hệ thống dùng lại kết quả mới nhất.'
          : 'Đã lưu kiểm tra phòng và cập nhật số lượng thực tế',
      })
    },

    onError: (error: Error) => {
      const msg = error.message || ''
      // Map lỗi từ trigger enforce_room_check_photos
      if (msg.includes('photo_required')) {
        const friendly = msg.includes('mọi lần')
          ? 'Khách sạn yêu cầu chụp ảnh bằng chứng cho mọi lần kiểm phòng. Vui lòng thêm ít nhất 1 ảnh.'
          : 'Phòng có sự cố — cần ít nhất 1 ảnh bằng chứng (mất/hỏng/thiếu). Vui lòng chụp và thử lại.'
        toast({
          title: 'Cần ảnh bằng chứng',
          description: friendly,
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Lỗi',
        description: msg,
        variant: 'destructive',
      })
    },
  })
}

// ===== NOTIFICATION HELPERS =====

async function sendCheckoutNotifications(params: {
  roomId: string
  roomNumber: string
  checkId: string
  data: RoomCheckFormData
  tenantId: string
  hotelId: string
  userId?: string
}) {
  const { roomId, roomNumber, checkId, data, tenantId, hotelId, userId } = params
  
  const consumedCount = data.items_consumed?.length || 0
  const lostCount = data.items_lost?.length || 0
  const damagedCount = data.items_damaged?.length || 0
  const hasIssues = lostCount > 0 || damagedCount > 0
  
  const summaryParts = []
  if (consumedCount > 0) summaryParts.push(`Khách dùng ${consumedCount} items`)
  if (lostCount > 0) summaryParts.push(`Mất ${lostCount} items`)
  if (damagedCount > 0) summaryParts.push(`Hỏng ${damagedCount} items`)
  
  const summaryMessage = summaryParts.length > 0 
    ? summaryParts.join(', ')
    : 'Không có vấn đề'
  
  const checkoutRecipients = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager'],
    excludeUserId: userId,
  })
  
  const recipientIds = checkoutRecipients.length > 0 
    ? checkoutRecipients.map(r => r.id)
    : userId ? [userId] : []
  
  if (recipientIds.length > 0) {
    const notificationTitle = `Báo cáo checkout phòng ${roomNumber}`
    const notificationType = hasIssues ? 'warning' : 'success'
    const actionUrl = `/rooms/${roomId}`
    
    await Promise.allSettled([
      createMultipleNotifications({
        recipientIds,
        tenantId,
        title: notificationTitle,
        body: summaryMessage,
        type: notificationType,
        actionUrl,
        metadata: {
          room_id: roomId,
          check_id: checkId,
          check_type: 'checkout',
        },
      }),
      sendMultiplePushNotifications({
        recipientIds,
        tenantId,
        title: notificationTitle,
        body: summaryMessage,
        actionUrl,
        notificationType,
      }),
      sendTelegramNotification({
        tenantId,
        hotelId,
        notificationTypeFilter: 'checkout',
        sendToManagementGroups: true,
        title: notificationTitle,
        message: summaryMessage,
        notificationType: 'checkout',
        actionUrl,
      }),
    ])
  }
}

async function sendIssueNotifications(params: {
  roomId: string
  roomNumber: string
  data: RoomCheckFormData
  tenantId: string
  hotelId: string
  userId?: string
}) {
  const { roomId, roomNumber, data, tenantId, hotelId, userId } = params
  
  const totalIssues = (data.items_missing?.length || 0) + (data.items_damaged?.length || 0)
  
  const issueRecipients = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager'],
    excludeUserId: userId,
  })
  
  const issueRecipientIds = issueRecipients.length > 0 
    ? issueRecipients.map(r => r.id)
    : userId ? [userId] : []
  
  if (issueRecipientIds.length > 0) {
    const issueTitle = `Kiểm tra phòng ${roomNumber} phát hiện vấn đề`
    const issueBody = `Phòng có ${totalIssues} vấn đề cần xử lý`
    
    await Promise.allSettled([
      createMultipleNotifications({
        recipientIds: issueRecipientIds,
        tenantId,
        title: issueTitle,
        body: issueBody,
        type: 'warning',
        actionUrl: `/rooms/${roomId}`,
        metadata: {
          room_id: roomId,
          check_type: data.check_type,
        },
      }),
      sendMultiplePushNotifications({
        recipientIds: issueRecipientIds,
        tenantId,
        title: issueTitle,
        body: issueBody,
        actionUrl: `/rooms/${roomId}`,
        notificationType: 'warning',
      }),
    ])
  }
}

// ===== CLEANING REQUEST NOTIFICATIONS =====

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
}

const CONDITION_LABELS: Record<string, string> = {
  clean: 'Sạch',
  dirty: 'Bẩn nhẹ',
  very_dirty: 'Rất bẩn',
}

async function sendCleaningRequestNotifications(params: {
  roomId: string
  roomNumber: string
  tenantId: string
  hotelId: string
  userId: string
  userName: string
  priority: string
  notes?: string
  roomCondition: string
}) {
  const { roomId, roomNumber, tenantId, hotelId, userId, userName, priority, notes, roomCondition } = params
  
  const priorityLabel = PRIORITY_LABELS[priority] || priority
  const conditionLabel = CONDITION_LABELS[roomCondition] || roomCondition
  
  // Get managers to notify
  const managers = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager'],
    excludeUserId: userId,
  })
  
  const recipientIds = managers.length > 0 
    ? managers.map(m => m.id)
    : userId ? [userId] : []
  
  if (recipientIds.length === 0) return
  
  const notificationTitle = `🧹 Yêu cầu dọn phòng ${roomNumber}`
  const notificationBody = notes 
    ? `${userName} báo cần dọn dẹp. Tình trạng: ${conditionLabel}. Ưu tiên: ${priorityLabel}. Ghi chú: ${notes}`
    : `${userName} báo cần dọn dẹp. Tình trạng: ${conditionLabel}. Ưu tiên: ${priorityLabel}`
  const actionUrl = `/rooms/${roomId}`
  
  await Promise.allSettled([
    // In-app notifications
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title: notificationTitle,
      body: notificationBody,
      type: priority === 'urgent' || priority === 'high' ? 'warning' : 'info',
      actionUrl,
      metadata: {
        room_id: roomId,
        cleaning_priority: priority,
        room_condition: roomCondition,
        requested_by: userId,
      },
    }),
    // Push notifications
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title: notificationTitle,
      body: notificationBody,
      actionUrl,
      notificationType: priority === 'urgent' || priority === 'high' ? 'warning' : 'info',
    }),
    // Telegram notification - use 'system' type for housekeeping
    sendTelegramNotification({
      tenantId,
      hotelId,
      notificationTypeFilter: 'system',
      sendToManagementGroups: true,
      title: notificationTitle,
      message: notificationBody,
      notificationType: 'system',
      actionUrl,
    }),
  ])
  
  
}

// ===== AUTO-CREATE SUPPLEMENT REQUEST (After checkout with consumed/lost items) =====

async function createSupplementRequestFromCheck(params: {
  roomId: string
  roomNumber: string
  tenantId: string
  hotelId: string
  userId: string
  userName: string
  checkId: string
  consumedItems: ConsumedItem[]
  lostItems: LostItem[]
}) {
  const { roomId, roomNumber, tenantId, hotelId, userId, userName, checkId, consumedItems, lostItems } = params
  
  // Combine consumed and lost items
  const allItems: { item_id: string; item_name: string; item_code?: string; quantity: number; unit_price: number; type: string }[] = []
  
  for (const item of consumedItems) {
    allItems.push({
      item_id: item.item_id,
      item_name: item.item_name,
      item_code: item.item_code,
      quantity: item.quantity,
      unit_price: 0, // Will be fetched from items table
      type: 'consumed',
    })
  }
  
  for (const item of lostItems) {
    allItems.push({
      item_id: item.item_id,
      item_name: item.item_name,
      item_code: item.item_code,
      quantity: item.quantity,
      unit_price: 0,
      type: 'lost',
    })
  }
  
  if (allItems.length === 0) return null
  
  // Fetch unit prices for all items
  const itemIds = allItems.map(i => i.item_id)
  const { data: itemPrices } = await supabase
    .from('items')
    .select('id, unit_price')
    .in('id', itemIds)
  
  const priceMap = new Map((itemPrices || []).map(i => [i.id, i.unit_price || 0]))
  
  const itemsWithPrices = allItems.map(item => ({
    item_id: item.item_id,
    item_name: item.item_name,
    item_code: item.item_code,
    quantity: item.quantity,
    unit_price: priceMap.get(item.item_id) || 0,
  }))
  
  // Calculate total value
  const totalValue = itemsWithPrices.reduce(
    (sum, item) => sum + (item.quantity * item.unit_price),
    0
  )
  
  // Determine request type
  const hasConsumed = consumedItems.length > 0
  const hasLost = lostItems.length > 0
  const requestType = hasConsumed && hasLost ? 'mixed' : hasConsumed ? 'consumed' : 'lost'
  
  // Generate request code
  const { data: codeResult, error: codeError } = await supabase
    .rpc('generate_supplement_request_code', { p_tenant_id: tenantId })
  
  if (codeError) {
    console.error('[useRoomChecks] Error generating supplement request code:', codeError)
  }
  
  const requestCode = codeResult || `SUP-${Date.now()}`
  
  // Create supplement request
  const { data: request, error } = await supabase
    .from('supplement_requests')
    .insert([{
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_id: roomId,
      room_check_id: checkId,
      request_code: requestCode,
      request_type: requestType,
      items: itemsWithPrices as any,
      total_value: totalValue,
      requested_by: userId,
      notes: `Tự động tạo từ kiểm tra checkout phòng ${roomNumber}`,
      status: 'pending',
    }])
    .select()
    .single()
  
  if (error) {
    console.error('[useRoomChecks] Error creating supplement request:', error)
    return null
  }
  
  
  
  // Send notification with link to new supplements page
  const managers = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager'],
    excludeUserId: userId,
  })
  
  const recipientIds = managers.length > 0 
    ? managers.map(m => m.id)
    : userId ? [userId] : []
  
  if (recipientIds.length > 0) {
    const itemSummary = itemsWithPrices.slice(0, 3).map(i => `${i.item_name}: ${i.quantity}`).join(', ')
    const notificationTitle = `📦 Yêu cầu bổ sung - Phòng ${roomNumber}`
    const notificationBody = `${userName}: ${itemSummary}${itemsWithPrices.length > 3 ? ` +${itemsWithPrices.length - 3} khác` : ''} | ${new Intl.NumberFormat('vi-VN').format(totalValue)}đ`
    const actionUrl = `/supplements?request=${request?.id}`
    
    await Promise.allSettled([
      createMultipleNotifications({
        recipientIds,
        tenantId,
        title: notificationTitle,
        body: notificationBody,
        type: 'info',
        actionUrl,
        metadata: {
          room_id: roomId,
          request_id: request?.id,
          request_code: requestCode,
          total_value: totalValue,
        },
      }),
      sendMultiplePushNotifications({
        recipientIds,
        tenantId,
        title: notificationTitle,
        body: notificationBody,
        actionUrl,
        notificationType: 'info',
      }),
      sendTelegramNotification({
        tenantId,
        hotelId,
        notificationTypeFilter: 'inventory',
        sendToManagementGroups: true,
        title: notificationTitle,
        message: notificationBody,
        notificationType: 'inventory',
        actionUrl,
      }),
    ])
  }
  
  return request
}

// ===== AUTO-CREATE LAUNDRY REQUEST (After checkout with laundry items) =====

async function createLaundryRequestFromCheck(params: {
  roomId: string
  roomNumber: string
  tenantId: string
  hotelId: string
  userId: string
  userName: string
  checkId: string
  laundryItems: LaundryItem[]
}) {
  const { roomId, roomNumber, tenantId, hotelId, userId, userName, checkId, laundryItems } = params
  
  if (laundryItems.length === 0) return null
  
  const items = laundryItems.map(item => ({
    item_id: item.item_id,
    item_name: item.item_name,
    item_code: item.item_code,
    quantity: item.quantity,
  }))
  
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  
  // Generate request code
  const { data: codeResult, error: codeError } = await supabase
    .rpc('generate_laundry_request_code', { p_tenant_id: tenantId })
  
  if (codeError) {
    console.error('[useRoomChecks] Error generating laundry request code:', codeError)
  }
  
  const requestCode = codeResult || `LRQ-${Date.now()}`
  
  // Create laundry request
  const { data: request, error } = await supabase
    .from('laundry_requests')
    .insert([{
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_id: roomId,
      room_check_id: checkId,
      request_code: requestCode,
      items: items as any,
      total_quantity: totalQuantity,
      requested_by: userId,
      notes: `Tự động tạo từ kiểm tra checkout phòng ${roomNumber}`,
      status: 'pending',
    }])
    .select()
    .single()
  
  if (error) {
    console.error('[useRoomChecks] Error creating laundry request:', error)
    return null
  }
  
  
  
  // Auto-add to draft batch
  try {
    await supabase.rpc('add_laundry_to_draft_batch', {
      p_tenant_id: tenantId,
      p_hotel_id: hotelId,
      p_laundry_request_id: request?.id,
    })
    
  } catch (err) {
    console.error('[useRoomChecks] Error auto-adding to batch:', err)
  }
  
  // Send notification
  const managers = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager'],
    excludeUserId: userId,
  })
  
  const recipientIds = managers.length > 0 
    ? managers.map(m => m.id)
    : userId ? [userId] : []
  
  if (recipientIds.length > 0) {
    const itemSummary = items.slice(0, 3).map(i => `${i.item_name}: ${i.quantity}`).join(', ')
    const notificationTitle = `🧺 Đồ giặt từ phòng ${roomNumber}`
    const notificationBody = `${userName}: ${itemSummary}${items.length > 3 ? ` +${items.length - 3} khác` : ''} | Tổng: ${totalQuantity} món`
    const actionUrl = `/laundry?tab=requests`
    
    await Promise.allSettled([
      createMultipleNotifications({
        recipientIds,
        tenantId,
        title: notificationTitle,
        body: notificationBody,
        type: 'info',
        actionUrl,
        metadata: {
          room_id: roomId,
          request_id: request?.id,
          request_code: requestCode,
          total_quantity: totalQuantity,
        },
      }),
      sendMultiplePushNotifications({
        recipientIds,
        tenantId,
        title: notificationTitle,
        body: notificationBody,
        actionUrl,
        notificationType: 'info',
      }),
      sendTelegramNotification({
        tenantId,
        hotelId,
        notificationTypeFilter: 'laundry',
        sendToManagementGroups: true,
        title: notificationTitle,
        message: notificationBody,
        notificationType: 'laundry',
        actionUrl,
      }),
    ])
  }
  
  return request
}

// ===== AUTO-CREATE MAINTENANCE REQUEST (For damaged equipment/furniture) =====

async function createMaintenanceForDamagedItems(params: {
  roomId: string
  roomNumber: string
  tenantId: string
  hotelId: string
  userId: string
  userName: string
  checkId: string
  damagedItems: DamagedItem[]
}) {
  const { roomId, roomNumber, tenantId, hotelId, userId, userName, checkId, damagedItems } = params
  
  // Only create maintenance for equipment and furniture
  const equipmentTypes = ['equipment', 'furniture']
  const maintenanceItems = damagedItems.filter(item => 
    equipmentTypes.includes(item.item_type || '')
  )
  
  if (maintenanceItems.length === 0) return []
  
  const createdRequests: any[] = []
  
  for (const item of maintenanceItems) {
    // Generate request code
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const random = Math.floor(1000 + Math.random() * 9000)
    const requestCode = `MNT-${dateStr}-${random}`
    
    // Determine priority based on damage level
    const priorityMap: Record<string, string> = {
      'minor': 'low',
      'moderate': 'medium',
      'major': 'high',
      'critical': 'urgent',
    }
    const priority = priorityMap[item.damage_level || 'moderate'] || 'medium'
    
    const { data: request, error } = await supabase
      .from('maintenance_requests')
      .insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        room_id: roomId,
        item_id: item.item_id,
        request_code: requestCode,
        location: `Phòng ${roomNumber}`,
        issue_type: 'repair',
        priority: priority,
        title: `Sửa chữa ${item.item_name} - Phòng ${roomNumber}`,
        description: `${item.item_name} bị hỏng. ${item.notes ? `Ghi chú: ${item.notes}` : ''}`.trim(),
        reported_by: userId,
        reported_at: new Date().toISOString(),
        status: 'waiting',
        notes: `Tự động tạo từ kiểm tra checkout. Room check ID: ${checkId}`,
      })
      .select()
      .single()
    
    if (error) {
      console.error('[useRoomChecks] Error creating maintenance request:', error)
      continue
    }
    
    createdRequests.push(request)
    
  }
  
  // Send summary notification if any requests were created
  if (createdRequests.length > 0) {
    const managers = await getNotificationRecipients({
      tenantId,
      hotelId,
      targetRoles: ['manager'],
      excludeUserId: userId,
    })
    
    const recipientIds = managers.length > 0 
      ? managers.map(m => m.id)
      : userId ? [userId] : []
    
    if (recipientIds.length > 0) {
      const itemNames = maintenanceItems.map(i => i.item_name).join(', ')
      const notificationTitle = `🔧 Yêu cầu bảo trì - Phòng ${roomNumber}`
      const notificationBody = `${createdRequests.length} thiết bị cần sửa: ${itemNames}`
      const actionUrl = `/maintenance`
      
      await Promise.allSettled([
        createMultipleNotifications({
          recipientIds,
          tenantId,
          title: notificationTitle,
          body: notificationBody,
          type: 'warning',
          actionUrl,
          metadata: {
            room_id: roomId,
            request_count: createdRequests.length,
            request_ids: createdRequests.map(r => r.id),
          },
        }),
        sendMultiplePushNotifications({
          recipientIds,
          tenantId,
          title: notificationTitle,
          body: notificationBody,
          actionUrl,
          notificationType: 'warning',
        }),
        sendTelegramNotification({
          tenantId,
          hotelId,
          notificationTypeFilter: 'maintenance',
          sendToManagementGroups: true,
          title: notificationTitle,
          message: notificationBody,
          notificationType: 'maintenance',
          actionUrl,
        }),
      ])
    }
  }
  
  return createdRequests
}
