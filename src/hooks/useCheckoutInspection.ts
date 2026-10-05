import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useUser } from './useUser'
import { sendTelegramNotification, createInAppNotification, sendPushNotification } from './useNotificationTriggers'
import type { CheckoutInspectionRequest, CheckoutInspectionRequestWithDetails } from '@/types/checkout-inspection.types'

export function useCheckoutInspection(bookingId: string | undefined) {
  const queryClient = useQueryClient()
  const { user } = useUser()
  
  // Fetch current inspection request for this booking
  const { data: inspection, isLoading, refetch } = useQuery({
    queryKey: ['checkout-inspection', bookingId],
    queryFn: async () => {
      if (!bookingId) return null
      
      const { data, error } = await supabase
        .from('checkout_inspection_requests')
        .select(`
          *,
          assigned_user:users!checkout_inspection_requests_assigned_to_fkey(id, full_name, avatar_url),
          requested_user:users!checkout_inspection_requests_requested_by_fkey(id, full_name),
          room:rooms!checkout_inspection_requests_room_id_fkey(id, room_number),
          booking:room_bookings!checkout_inspection_requests_booking_id_fkey(id, guest_name)
        `)
        .eq('booking_id', bookingId)
        .in('status', ['pending', 'in_progress', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (error) {
        console.error('Error fetching checkout inspection:', error)
        return null
      }
      
      return data as CheckoutInspectionRequestWithDetails | null
    },
    enabled: !!bookingId,
  })
  
  // Realtime subscription
  useEffect(() => {
    if (!bookingId) return
    
    const channel = supabase
      .channel(`checkout-inspection-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checkout_inspection_requests',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          
          refetch()
        }
      )
      .subscribe((status) => {
        
      })
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [bookingId, refetch])
  
  // Create inspection request + housekeeping task
  const createInspection = useMutation({
    mutationFn: async ({ 
      tenantId, 
      hotelId, 
      roomId, 
      assignedTo,
      notes,
    }: { 
      tenantId: string
      hotelId: string
      roomId: string
      assignedTo: string
      notes?: string
    }) => {
      if (!bookingId || !user?.id) throw new Error('Missing required data')
      
      // 1. Tạo checkout_inspection_requests
      const { data: inspection, error } = await supabase
        .from('checkout_inspection_requests')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: roomId,
          booking_id: bookingId,
          requested_by: user.id,
          assigned_to: assignedTo,
          status: 'pending',
          notes,
        })
        .select()
        .single()
      
      if (error) throw error
      
      // 2. TẠO housekeeping_tasks để hiển thị trong "Công việc của tôi"
      const { error: taskError } = await supabase
        .from('housekeeping_tasks')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: roomId,
          booking_id: bookingId,
          assigned_to: assignedTo,
          requested_by: user.id,
          task_type: 'checkout_inspection',
          title: 'Kiểm tra checkout',
          priority: 'medium',
          status: 'pending',
          checkout_inspection_id: inspection.id,
          notes,
        })
      
      if (taskError) {
        console.error('Error creating housekeeping task:', taskError)
        // Không throw - vẫn trả về inspection để flow hoàn thành
      }
      
      // 3. Lấy thông tin phòng + booking để build message thông báo
      const [roomRes, bookingRes] = await Promise.all([
        supabase.from('rooms').select('room_number').eq('id', roomId).single(),
        supabase.from('room_bookings').select('guest_name').eq('id', bookingId).single(),
      ])
      const roomNumber = roomRes.data?.room_number || ''
      const guestName = bookingRes.data?.guest_name || 'Khách'

      // 4. Gửi 4 thông báo song song (push + in-app + telegram cá nhân + telegram nhóm)
      await Promise.allSettled([
        sendPushNotification({
          userId: assignedTo,
          tenantId,
          title: `Yêu cầu kiểm tra phòng ${roomNumber}`,
          body: `Khách ${guestName} sắp checkout. Vui lòng kiểm tra phòng.`,
          actionUrl: '/my-tasks',
          notificationType: 'room_checkout',
        }),
        createInAppNotification({
          userId: assignedTo,
          tenantId,
          title: `Yêu cầu kiểm tra phòng ${roomNumber}`,
          body: `Khách ${guestName} sắp checkout. Vui lòng kiểm tra phòng.`,
          type: 'room_checkout',
          actionUrl: '/my-tasks',
        }),
        sendTelegramNotification({
          tenantId,
          hotelId,
          userIds: [assignedTo],
          title: `🔍 Yêu cầu kiểm tra phòng ${roomNumber}`,
          message: `Khách: ${guestName}\nVui lòng kiểm tra phòng trước khi checkout.`,
          notificationType: 'checkout',
          actionUrl: '/my-tasks',
        }),
        sendTelegramNotification({
          tenantId,
          hotelId,
          sendToStaffGroups: true,
          title: `🔍 Yêu cầu kiểm tra phòng ${roomNumber}`,
          message: `Khách: ${guestName}\n👤 Đã giao cho nhân viên kiểm tra.`,
          notificationType: 'checkout',
          actionUrl: '/my-tasks',
        }),
      ])
      
      return inspection
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-inspection', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
      toast.success('Đã gửi yêu cầu kiểm tra phòng')
    },
    onError: (error: Error) => {
      console.error('Error creating inspection:', error)
      toast.error('Lỗi gửi yêu cầu: ' + error.message)
    },
  })
  
  // Cancel inspection request + housekeeping task
  const cancelInspection = useMutation({
    mutationFn: async (inspectionId: string) => {
      // 1. Hủy checkout_inspection_requests
      const { error } = await supabase
        .from('checkout_inspection_requests')
        .update({ status: 'cancelled' })
        .eq('id', inspectionId)
      
      if (error) throw error
      
      // 2. HỦY housekeeping_tasks liên quan — qua RPC để có audit log + validate transition.
      const { data: relatedTasks } = await supabase
        .from('housekeeping_tasks')
        .select('id')
        .eq('checkout_inspection_id', inspectionId)

      for (const t of relatedTasks ?? []) {
        const { error: tErr } = await supabase.rpc('transition_task_status', {
          _task_id: t.id,
          _to_status: 'cancelled',
          _note: 'Hủy do hủy yêu cầu kiểm tra checkout',
        })
        if (tErr) console.error('[cancelInspection] transition_task_status failed:', tErr.message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-inspection', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
      toast.success('Đã hủy yêu cầu kiểm tra')
    },
    onError: (error: Error) => {
      toast.error('Lỗi hủy yêu cầu: ' + error.message)
    },
  })
  
  // Start inspection (change status to in_progress)
  const startInspection = useMutation({
    mutationFn: async (inspectionId: string) => {
      const { error } = await supabase
        .from('checkout_inspection_requests')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', inspectionId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-inspection', bookingId] })
      toast.success('Bắt đầu kiểm tra phòng')
    },
    onError: (error: Error) => {
      toast.error('Lỗi: ' + error.message)
    },
  })
  
  return {
    inspection,
    isLoading,
    createInspection,
    cancelInspection,
    startInspection,
    refetch,
  }
}

// Hook for staff to get pending inspection requests assigned to them
export function usePendingInspections(roomId: string | undefined) {
  const { user } = useUser()
  const queryClient = useQueryClient()
  
  const { data: pendingInspection, isLoading, refetch } = useQuery({
    queryKey: ['pending-inspection', roomId, user?.id],
    queryFn: async () => {
      if (!roomId || !user?.id) return null
      
      const { data, error } = await supabase
        .from('checkout_inspection_requests')
        .select(`
          *,
          requested_user:users!checkout_inspection_requests_requested_by_fkey(id, full_name),
          booking:room_bookings!checkout_inspection_requests_booking_id_fkey(id, guest_name, check_out_date)
        `)
        .eq('room_id', roomId)
        .eq('assigned_to', user.id)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (error) {
        console.error('Error fetching pending inspection:', error)
        return null
      }
      
      return data as CheckoutInspectionRequestWithDetails | null
    },
    enabled: !!roomId && !!user?.id,
  })
  
  // Realtime subscription
  useEffect(() => {
    if (!roomId || !user?.id) return
    
    const channel = supabase
      .channel(`pending-inspection-${roomId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checkout_inspection_requests',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          refetch()
          queryClient.invalidateQueries({ queryKey: ['checkout-inspection'] })
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, user?.id, refetch, queryClient])
  
  // Start inspection - trả về data để xác nhận thành công
  // Sử dụng maybeSingle() để tránh lỗi khi 0 rows (inspection đã started hoặc completed)
  const startInspection = useMutation({
    mutationFn: async (inspectionId: string) => {
      
      
      const { data, error } = await supabase
        .from('checkout_inspection_requests')
        .update({ 
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', inspectionId)
        .eq('status', 'pending') // Chỉ update nếu đang pending (tránh duplicate/race condition)
        .select('id, status, started_at, requested_by, hotel_id, room_id')
        .maybeSingle() // Dùng maybeSingle thay vì single để tránh lỗi khi 0 rows
      
      if (error) {
        console.error('[usePendingInspections.startInspection] Supabase error:', error)
        throw error
      }
      
      if (!data) {
        // Inspection đã được start hoặc completed - không phải lỗi nghiêm trọng
        console.warn('[usePendingInspections.startInspection] No data returned - inspection may already be in_progress or completed')
        return null
      }
      
      
      return data
    },
    onSuccess: async (data) => {
      
      queryClient.invalidateQueries({ queryKey: ['pending-inspection', roomId, user?.id] })
      queryClient.invalidateQueries({ queryKey: ['checkout-inspection'] })
      queryClient.invalidateQueries({ queryKey: ['room-has-pending-inspection', roomId] })
      if (data) {
        toast.success('Đã bắt đầu kiểm tra phòng')
        
        // THÊM: Gửi thông báo ngược cho người yêu cầu (requested_by)
        if (data.requested_by && user?.tenant_id) {
          // Lấy thông tin phòng
          const { data: roomData } = await supabase
            .from('rooms')
            .select('room_number')
            .eq('id', data.room_id)
            .single()
          
          const roomNumber = roomData?.room_number || ''
          const staffName = user?.full_name || 'Nhân viên'
          
          
          
          // Gửi thông báo song song
          await Promise.allSettled([
            // 1. In-app notification
            createInAppNotification({
              userId: data.requested_by,
              tenantId: user.tenant_id,
              title: `Đang kiểm tra phòng ${roomNumber}`,
              body: `${staffName} đã bắt đầu kiểm tra phòng.`,
              type: 'room_checkout',
              actionUrl: '/bookings',
            }),
            // 2. Telegram notification
            sendTelegramNotification({
              tenantId: user.tenant_id,
              hotelId: data.hotel_id,
              userIds: [data.requested_by],
              title: `🔄 Đang kiểm tra phòng ${roomNumber}`,
              message: `${staffName} đã bắt đầu kiểm tra phòng.`,
              notificationType: 'checkout',
              actionUrl: '/bookings',
            }),
          ])
        }
      }
    },
    onError: (error: Error) => {
      console.error('[usePendingInspections.startInspection] onError:', error)
      toast.error('Lỗi cập nhật: ' + error.message)
    },
  })
  
  return {
    pendingInspection,
    isLoading,
    startInspection,
    refetch,
  }
}

// Hook to auto-create checkout inspection when staff selects checkout type
// Used for hybrid approach: auto-create if room has booking, allow free checkout if not
export function useAutoCreateCheckoutInspection() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  
  return useMutation({
    mutationFn: async ({ 
      tenantId, 
      hotelId, 
      roomId, 
      bookingId,
    }: { 
      tenantId: string
      hotelId: string
      roomId: string
      bookingId: string
    }) => {
      if (!user?.id) throw new Error('User not authenticated')
      
      // Check if there's already a pending/in_progress inspection for this room
      const { data: existingInspection } = await supabase
        .from('checkout_inspection_requests')
        .select('id, status, assigned_to')
        .eq('room_id', roomId)
        .in('status', ['pending', 'in_progress'])
        .maybeSingle()
      
      // If exists and assigned to current user, just return it
      if (existingInspection) {
        if (existingInspection.assigned_to === user.id) {
          return { id: existingInspection.id, isNew: false }
        }
        // If assigned to someone else, throw error
        throw new Error('Phòng đã có yêu cầu kiểm tra giao cho nhân viên khác')
      }
      
      // Create new inspection request (self-assigned)
      const { data: inspection, error } = await supabase
        .from('checkout_inspection_requests')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: roomId,
          booking_id: bookingId,
          requested_by: user.id,
          assigned_to: user.id, // Self-assign
          status: 'in_progress', // Start immediately
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      
      if (error) throw error
      
      // Create housekeeping task for tracking
      await supabase
        .from('housekeeping_tasks')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_id: roomId,
          booking_id: bookingId,
          assigned_to: user.id,
          requested_by: user.id,
          task_type: 'checkout_inspection',
          title: 'Kiểm tra checkout',
          priority: 'medium',
          status: 'in_progress',
          started_at: new Date().toISOString(),
          checkout_inspection_id: inspection.id,
        })
      
      return { id: inspection.id, isNew: true }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['checkout-inspection', variables.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['pending-inspection', variables.roomId] })
      queryClient.invalidateQueries({ queryKey: ['room-has-pending-inspection', variables.roomId] })
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
      if (data.isNew) {
        toast.success('Đã tạo yêu cầu kiểm tra checkout')
      }
    },
    onError: (error: Error) => {
      console.error('Error auto-creating inspection:', error)
      toast.error(error.message)
    },
  })
}

// Hook to complete inspection (called when room check is submitted)
export function useCompleteCheckoutInspection() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      bookingId, 
      roomCheckId,
    }: { 
      bookingId: string
      roomCheckId: string
    }) => {
      // Find the pending/in_progress inspection for this booking
      const { data: inspection, error: findError } = await supabase
        .from('checkout_inspection_requests')
        .select('id')
        .eq('booking_id', bookingId)
        .in('status', ['pending', 'in_progress'])
        .maybeSingle()
      
      if (findError) throw findError
      if (!inspection) return null // No pending inspection
      
      // Complete the inspection
      const { error: updateError } = await supabase
        .from('checkout_inspection_requests')
        .update({
          status: 'completed',
          room_check_id: roomCheckId,
          completed_at: new Date().toISOString(),
        })
        .eq('id', inspection.id)
      
      if (updateError) throw updateError
      
      return inspection.id
    },
    onSuccess: (inspectionId, variables) => {
      if (inspectionId) {
        queryClient.invalidateQueries({ queryKey: ['checkout-inspection', variables.bookingId] })
        queryClient.invalidateQueries({ queryKey: ['pending-inspection'] })
      }
    },
  })
}

// Hook để kiểm tra phòng có yêu cầu checkout inspection đang pending/in_progress không
// (bất kể assigned cho ai - dùng để chặn nhân viên khác)
export function useRoomHasPendingInspection(roomId: string | undefined) {
  const { user } = useUser()
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['room-has-pending-inspection', roomId],
    queryFn: async () => {
      if (!roomId) return null
      
      // Query ANY pending/in_progress inspection cho room này (không filter assigned_to)
      const { data, error } = await supabase
        .from('checkout_inspection_requests')
        .select('id, assigned_to, status, assigned_user:users!checkout_inspection_requests_assigned_to_fkey(id, full_name)')
        .eq('room_id', roomId)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (error) {
        console.error('Error checking room inspection:', error)
        return null
      }
      
      if (!data) return null
      
      return {
        inspectionId: data.id,
        assignedTo: data.assigned_to,
        assignedUserName: (data.assigned_user as any)?.full_name || null,
        isAssignedToMe: data.assigned_to === user?.id,
        status: data.status as 'pending' | 'in_progress',
      }
    },
    enabled: !!roomId && !!user?.id,
  })
  
  // Realtime subscription
  useEffect(() => {
    if (!roomId) return
    
    const channel = supabase
      .channel(`room-inspection-check-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checkout_inspection_requests',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          refetch()
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, refetch])
  
  return {
    roomInspection: data,
    isLoading,
    refetch,
  }
}
