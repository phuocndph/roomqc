import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { triggerRoomCheckoutNotification, triggerRoomCheckinNotification } from '@/hooks/useNotificationTriggers'
import { triggerWorkflow, WorkflowTriggerTypes } from '@/lib/triggerWorkflow'
import type { RoomWithStats, RoomFilters } from '@/types/rooms.types'
import { isAdminUser } from '@/lib/userAccess'

export function useRooms(filters: RoomFilters = {}) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()
  
  const query = useQuery({
    queryKey: ['rooms', tenantId, selectedHotel?.id, isAllHotelsMode, filters],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)
      
      const { data, error } = await supabase.rpc('get_rooms_filtered', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelIdToFilter,
        p_floor: filters.floor || null,
        p_room_type: filters.roomType || null,
        p_status: filters.status || null,
        p_search: filters.search || null,
        p_missing_items_only: filters.missingItemsOnly || false,
      })
      
      if (error) throw error
      // Add default values for new pricing fields not returned by RPC
      return (data || []).map(room => ({
        ...room,
        hourly_price: (room as any).hourly_price ?? null,
        monthly_price: (room as any).monthly_price ?? null,
        min_hours: (room as any).min_hours ?? null,
        max_hours: (room as any).max_hours ?? null,
      })) as RoomWithStats[]
    },
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  // Realtime subscription for room_items changes
  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel(`room_items_${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_items',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Invalidate rooms query to refetch with updated stats
          queryClient.invalidateQueries({ queryKey: ['rooms'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])

  return query
}

export function useRoom(roomId: string | undefined) {
  const { user } = useUser()
  const { availableHotels } = useHotelContext()
  
  return useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      if (!roomId) throw new Error('No room ID')
      
      // Fetch room basic data
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select(`
          *,
          hotels(id, name, code, city)
        `)
        .eq('id', roomId)
        .single()
      
      if (roomError) throw roomError
      
      // Hotel access check for non-admin users
      if (!isAdminUser(user) && availableHotels.length > 0) {
        const hasAccess = availableHotels.some(h => h.id === room.hotel_id)
        if (!hasAccess) {
          throw new Error('Bạn không có quyền truy cập phòng này')
        }
      }
      
      // Fetch room items with standards comparison
      const { data: itemsWithStandards, error: itemsError } = await supabase
        .rpc('get_room_items_with_standards', { p_room_id: roomId })
      
      if (itemsError) {
        console.error('Error fetching room items:', itemsError)
      }
      
      // Fetch recent checks
      const { data: recentChecks, error: checksError } = await supabase
        .from('room_checks')
        .select(
          `
          id,
          check_type,
          cleanliness_score,
          items_complete,
          items_missing,
          items_damaged,
          items_sent_to_laundry,
          items_consumed,
          items_lost,
          items_replaced,
          notes,
          photos,
          checked_at,
          users!room_checks_checked_by_fkey(full_name, avatar_url)
        `
        )
        .eq('room_id', roomId)
        .order('checked_at', { ascending: false })
        .limit(20)

      
      if (checksError) {
        console.error('Error fetching room checks:', checksError)
      }
      
      // Transform items data — RPC trả về sẵn is_chargeable / unit_price /
      // asset_group / default_item_type (Sprint 4 #33) nên client không cần
      // truy vấn `items` lần 2 để enrich.
      const items = (itemsWithStandards || []).map((item: any) => ({
        item_id: item.item_id,
        item_code: item.item_code,
        item_name: item.item_name,
        item_type: item.item_type,
        item_thumbnail: item.item_thumbnail,
        category_id: item.category_id ?? null,
        category_name: item.category_name,
        standard_quantity: item.standard_quantity || 0,
        current_quantity: item.quantity || 0,
        missing_quantity: Math.max(0, (item.standard_quantity || 0) - (item.quantity || 0)),
        condition: item.condition || 'good',
        is_verified: item.is_verified || false,
        verified_at: item.verified_at,
        verified_by: item.verified_by,
        room_item_id: item.id || null,
        has_standard: (item.standard_quantity || 0) > 0,
        // Enrichment fields cho Lean (sprint 4 #33)
        is_chargeable: !!item.is_chargeable,
        unit_price: item.unit_price ?? null,
        asset_group: item.asset_group ?? null,
        default_item_type: item.default_item_type ?? null,
        unit: item.unit ?? null,
      }))
      
      // Transform checks data
      const recent_checks = (recentChecks || []).map((check: any) => ({
        id: check.id,
        check_type: check.check_type,
        cleanliness_score: check.cleanliness_score,
        items_complete: check.items_complete,
        items_missing: check.items_missing,
        items_damaged: check.items_damaged,
        items_sent_to_laundry: check.items_sent_to_laundry,
        items_consumed: check.items_consumed,
        items_lost: check.items_lost,
        items_replaced: check.items_replaced,
        notes: check.notes,
        photos: check.photos,
        checked_at: check.checked_at,
        checked_by_name: check.users?.full_name || 'Unknown',
        checked_by_avatar: check.users?.avatar_url,
      }))

      
      return {
        room,
        hotel: room.hotels,
        items,
        recent_checks,
      }
    },
    enabled: !!roomId,
    // Sprint 4 #32: chia sẻ cache qua các bước wizard Lean (Overview → Inspection
    // → Review → Success) thay vì refetch full 3 query mỗi lần điều hướng.
    // Realtime channels trên rooms/room_items/room_checks vẫn invalidate khi data thay đổi.
    staleTime: 30_000,
    refetchOnMount: true,
  })
}

export function useRoomStats(tenantId: string | undefined, hotelId: string | undefined) {
  return useQuery({
    queryKey: ['room-stats', tenantId, hotelId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      const { data, error } = await supabase.rpc('get_rooms_filtered', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId || null,
        p_floor: null,
        p_room_type: null,
        p_status: null,
        p_search: null,
        p_missing_items_only: false,
      })
      
      if (error) throw error
      
      // Add default values for new pricing fields
      const rooms = (data || []).map(room => ({
        ...room,
        hourly_price: (room as any).hourly_price ?? null,
        monthly_price: (room as any).monthly_price ?? null,
        min_hours: (room as any).min_hours ?? null,
        max_hours: (room as any).max_hours ?? null,
      })) as RoomWithStats[]
      
      // Đếm theo nhóm trạng thái v2 (group) — bao gồm cả legacy nhờ normalize
      const groups = rooms.reduce((acc: Record<string, number>, r) => {
        const g = (r.status as string) || ''
        acc[g] = (acc[g] ?? 0) + 1
        return acc
      }, {})
      // Helper count theo set status v2
      const countIn = (set: string[]) => rooms.filter(r => set.includes(r.status as string)).length
      return {
        // Nhóm tổng hợp (UI dùng)
        ready: countIn(['vacant_clean', 'vacant_inspected', 'vacant', 'reserved']),
        occupied: countIn(['occupied_clean', 'occupied_dirty', 'dnd', 'service_refused', 'sleep_out', 'occupied']),
        dirty: countIn(['vacant_dirty', 'cleaning', 'check_out']),
        unavailable: countIn(['out_of_order', 'out_of_service', 'maintenance']),
        special: countIn(['skipper']),
        total: rooms.length,
        // Legacy keys giữ cho UI cũ chưa migrate
        vacant: countIn(['vacant_clean', 'vacant_inspected', 'vacant']),
        cleaning: countIn(['vacant_dirty', 'cleaning']),
        maintenance: countIn(['out_of_service', 'maintenance']),
        check_in: 0,
        check_out: countIn(['check_out']),
        raw: groups,
      }
    },
    enabled: !!tenantId,
  })
}


export function useCreateRoom() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: any) => {
      const { data: room, error } = await supabase
        .from('rooms')
        .insert(data)
        .select()
        .single()
      
      if (error) throw error
      return room
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      toast.success('Đã thêm phòng mới')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateRoom() {
  const queryClient = useQueryClient()
  const { tenantId, user } = useUser()
  
  return useMutation({
    mutationFn: async ({ id, data, previousStatus }: { 
      id: string
      data: any
      previousStatus?: string 
    }) => {
      // B6: Loại bỏ `status` khỏi data — phải đi qua `useRoomTransition` (RPC transition_room_status)
      // để có audit log + kiểm transition hợp lệ. Ai truyền status vào đây sẽ bị strip + log.
      const { status: _strippedStatus, ...safeData } = data ?? {}
      if (_strippedStatus !== undefined) {
        console.warn('[useUpdateRoom] Bỏ qua trường `status` — vui lòng dùng useRoomTransition()')
      }

      const { data: room, error } = await supabase
        .from('rooms')
        .update(safeData)
        .eq('id', id)
        .select('*, room_number, hotel_id')
        .single()
      
      if (error) throw error
      
      // Trigger workflow for room status change
      if (previousStatus && data.status !== previousStatus && tenantId) {
        triggerWorkflow({
          triggerType: WorkflowTriggerTypes.ROOM_STATUS_CHANGE,
          eventData: {
            room_id: id,
            room_number: room.room_number,
            old_status: previousStatus,
            new_status: data.status,
          },
          tenantId,
          hotelId: room.hotel_id,
        }).catch(err => console.error('[triggerWorkflow] room_status_change error:', err))
      }
      
      // Send notification when status changes to check_out
      if (data.status === 'check_out' && previousStatus !== 'check_out' && tenantId && room.hotel_id) {
        triggerRoomCheckoutNotification({
          tenantId,
          hotelId: room.hotel_id,
          roomId: id,
          roomNumber: room.room_number,
          changedByUserId: user?.id,
        }).catch(err => console.error('Failed to send checkout notification:', err))
      }
      
      // Send notification when status changes to check_in or occupied
      if ((data.status === 'check_in' || data.status === 'occupied') && 
          previousStatus !== 'check_in' && 
          previousStatus !== 'occupied' && 
          tenantId && room.hotel_id) {
        triggerRoomCheckinNotification({
          tenantId,
          hotelId: room.hotel_id,
          roomId: id,
          roomNumber: room.room_number,
          changedByUserId: user?.id,
        }).catch(err => console.error('Failed to send check-in notification:', err))
      }
      
      return room
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      toast.success('Đã cập nhật phòng')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteRoom() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (roomId: string) => {
      // Check if room has room_items
      const { count: itemsCount } = await supabase
        .from('room_items')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
      
      if (itemsCount && itemsCount > 0) {
        throw new Error('Không thể xóa phòng có đồ dùng. Vui lòng xóa đồ dùng trước.')
      }
      
      // Check if room has checks
      const { count: checksCount } = await supabase
        .from('room_checks')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
      
      if (checksCount && checksCount > 0) {
        throw new Error('Không thể xóa phòng có lịch sử kiểm tra')
      }
      
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      toast.success('Đã xóa phòng')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Mark a room as ready (cleaning → vacant)
 * Used when housekeeping finishes cleaning a room
 * Also auto-completes any pending/in_progress cleaning tasks for this room
 */
export function useMarkRoomReady() {
  const queryClient = useQueryClient()
  const { tenantId, user } = useUser()
  
  return useMutation({
    mutationFn: async ({ 
      roomId, 
      skipCheck = false 
    }: { 
      roomId: string
      skipCheck?: boolean 
    }) => {
      // First verify room is in cleaning status
      const { data: room, error: checkError } = await supabase
        .from('rooms')
        .select('id, room_number, hotel_id, status')
        .eq('id', roomId)
        .single()
      
      if (checkError) throw checkError
      // State Machine v2: phòng "đang dọn" = vacant_dirty
      if (room.status !== 'vacant_dirty' && room.status !== 'cleaning') {
        throw new Error(`Phòng không ở trạng thái "Đang dọn" (hiện tại: ${room.status})`)
      }
      
      // F-FSM-01: gọi qua RPC để có audit log + validate transition (state machine v2).
      const { error: transErr } = await supabase.rpc('transition_room_status', {
        _room_id: roomId,
        _to_status: 'vacant_clean',
        _reason: 'Housekeeping hoàn tất dọn phòng',
      })
      if (transErr) throw new Error(transErr.message)

      // Lấy lại thông tin phòng sau khi chuyển trạng thái (cho workflow trigger).
      const { data: updated, error: fetchErr } = await supabase
        .from('rooms')
        .select('*, room_number, hotel_id')
        .eq('id', roomId)
        .single()
      if (fetchErr) throw fetchErr

      // Auto-complete cleaning tasks: lấy danh sách rồi gọi transition_task_status từng cái.
      const { data: openTasks } = await supabase
        .from('housekeeping_tasks')
        .select('id')
        .eq('room_id', roomId)
        .eq('task_type', 'cleaning')
        .in('status', ['pending', 'in_progress'])

      for (const t of openTasks ?? []) {
        const { error: tErr } = await supabase.rpc('transition_task_status', {
          _task_id: t.id,
          _to_status: 'completed',
          _note: 'Tự động hoàn tất khi phòng chuyển sang sạch',
        })
        if (tErr) console.error('[useMarkRoomReady] transition_task_status failed:', tErr.message)
      }
      
      // Trigger workflow for room status change
      if (tenantId) {
        triggerWorkflow({
          triggerType: WorkflowTriggerTypes.ROOM_STATUS_CHANGE,
          eventData: {
            room_id: roomId,
            room_number: updated.room_number,
            old_status: 'vacant_dirty',
            new_status: 'vacant_clean',
          },
          tenantId,
          hotelId: updated.hotel_id,
        }).catch(err => console.error('[triggerWorkflow] room_status_change error:', err))
      }
      
      return { room: updated, skipCheck }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room', variables.roomId] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      toast.success('Phòng đã sẵn sàng nhận khách')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
