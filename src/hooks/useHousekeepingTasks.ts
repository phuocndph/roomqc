import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { mapDbError } from '@/lib/dbErrors'
import { triggerWorkflow, WorkflowTriggerTypes } from '@/lib/triggerWorkflow'
import { triggerHousekeepingTaskAssignedNotification } from '@/hooks/useNotificationTriggers'
import { 
  TASK_TYPE_LABELS,
  PRIORITY_LABELS
} from '@/types/housekeeping.types'
import type { 
  HousekeepingTask, 
  HousekeepingTaskWithDetails, 
  CreateTaskInput, 
  TaskStatus,
  TaskType
} from '@/types/housekeeping.types'

// Fetch a single task by ID
export function useTaskById(taskId: string | null) {
  return useQuery({
    queryKey: ['housekeeping-task', taskId],
    queryFn: async () => {
      if (!taskId) return null

      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name, avatar_url),
          requested_user:users!housekeeping_tasks_requested_by_fkey(id, full_name, avatar_url),
          booking:room_bookings(id, guest_name, check_out_date),
          checkout_inspection:checkout_inspection_requests(id, status, completed_at)
        `)
        .eq('id', taskId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as HousekeepingTaskWithDetails | null
    },
    enabled: !!taskId
  })
}

// Fetch tasks assigned to current user
export function useMyTasks() {
  const { user } = useUser()
  const userId = user?.id
  const tenantId = user?.tenant_id
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['my-housekeeping-tasks', userId, selectedHotel?.id],
    queryFn: async () => {
      if (!userId) return []

      let q = supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          requested_user:users!housekeeping_tasks_requested_by_fkey(id, full_name, avatar_url),
          booking:room_bookings(id, guest_name, check_out_date)
        `)
        .eq('assigned_to', userId)
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })

      if (selectedHotel?.id) {
        q = q.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await q

      if (error) throw error
      return data as unknown as HousekeepingTaskWithDetails[]
    },
    enabled: !!userId
  })

  // Realtime subscription
  useEffect(() => {
    if (!userId || !tenantId) return

    const channel = supabase
      .channel(`my-tasks-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'housekeeping_tasks',
          filter: `assigned_to=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, tenantId, queryClient])

  return query
}

// Fetch all tasks for a hotel (manager view)
export function useHotelTasks(hotelId?: string) {
  const { tenantId } = useUser()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['hotel-housekeeping-tasks', hotelId],
    queryFn: async () => {
      if (!hotelId) return []

      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name, avatar_url),
          requested_user:users!housekeeping_tasks_requested_by_fkey(id, full_name, avatar_url),
          booking:room_bookings(id, guest_name, check_out_date)
        `)
        .eq('hotel_id', hotelId)
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      return data as unknown as HousekeepingTaskWithDetails[]
    },
    enabled: !!hotelId
  })

  // Realtime subscription
  useEffect(() => {
    if (!hotelId || !tenantId) return

    const channel = supabase
      .channel(`hotel-tasks-${hotelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'housekeeping_tasks',
          filter: `hotel_id=eq.${hotelId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks', hotelId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [hotelId, tenantId, queryClient])

  return query
}

// Create new task
export function useCreateTask() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const userId = user?.id

  return useMutation({
    mutationFn: async (input: CreateTaskInput & { skipDuplicateCheck?: boolean }) => {
      if (!tenantId) throw new Error('Không tìm thấy tenant')

      // Check for duplicate active task (same room + task_type + status pending/in_progress)
      if (!input.skipDuplicateCheck) {
        const { data: existingTask } = await supabase
          .from('housekeeping_tasks')
          .select(`
            id, 
            status, 
            assigned_to,
            assigned_user:users!housekeeping_tasks_assigned_to_fkey(full_name)
          `)
          .eq('room_id', input.room_id)
          .eq('task_type', input.task_type)
          .in('status', ['pending', 'in_progress'])
          .maybeSingle()

        if (existingTask) {
          const assignedName = (existingTask.assigned_user as any)?.full_name || ''
          throw new Error(
            `DUPLICATE_TASK:${existingTask.id}:${existingTask.status}:${assignedName}`
          )
        }
      }

      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .insert({
          ...input,
          tenant_id: tenantId,
          requested_by: userId,
          priority: input.priority || 'medium'
        })
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name)
        `)
        .single()

      if (error) throw error
      return data as HousekeepingTask & { 
        room?: { room_number: string; floor: number }
        assigned_user?: { full_name: string }
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
      queryClient.invalidateQueries({ queryKey: ['unassigned-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
      toast.success('Đã tạo yêu cầu công việc')

      // Send notification to assigned staff if task has an assignee
      if (tenantId && userId && data.assigned_to && data.assigned_to !== userId) {
        triggerHousekeepingTaskAssignedNotification({
          tenantId,
          hotelId: data.hotel_id,
          assignedToUserId: data.assigned_to,
          assignedByUserId: userId,
          taskId: data.id,
          taskType: data.task_type,
          roomNumber: (data as any).room?.room_number || 'N/A',
          priority: data.priority,
          isReassignment: false,
        }).catch(err => console.error('[useCreateTask] Notification failed:', err))
      }

      // Trigger workflow for task created
      if (tenantId) {
        triggerWorkflow({
          triggerType: WorkflowTriggerTypes.HOUSEKEEPING_TASK_CREATED,
          eventData: {
            task_id: data.id,
            task_type: data.task_type,
            task_type_label: TASK_TYPE_LABELS[data.task_type] || data.task_type,
            priority: data.priority,
            priority_label: PRIORITY_LABELS[data.priority] || data.priority,
            room_id: data.room_id,
            room_number: (data as any).room?.room_number,
            floor: (data as any).room?.floor,
            hotel_id: data.hotel_id,
            assigned_to: data.assigned_to,
            assigned_to_name: (data as any).assigned_user?.full_name,
            title: data.title,
            description: data.description,
          },
          tenantId,
          hotelId: data.hotel_id,
        }).catch(err => console.error('Workflow trigger failed:', err))
      }
    },
    onError: (error) => {
      console.error('Create task error:', error)
      toast.error('Không thể tạo yêu cầu')
    }
  })
}

// Update task status
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const tenantId = user?.tenant_id

  return useMutation({
    mutationFn: async ({ 
      taskId, 
      status, 
      roomCheckId,
      notes 
    }: { 
      taskId: string
      status: TaskStatus
      roomCheckId?: string
      notes?: string 
    }) => {
      // ✅ Khi đánh dấu hoàn thành: đi qua RPC complete_task để áp dụng qc_mode
      // (self → completed, peer/strict → completed_pending_review). Backend tự ghi audit.
      if (status === 'completed') {
        const { data, error } = await supabase.rpc('complete_task', {
          _task_id: taskId,
          _note: notes ?? null,
        })
        if (error) throw error

        // Nếu có roomCheckId, lưu kèm (RPC không nhận field này)
        if (roomCheckId) {
          await supabase
            .from('housekeeping_tasks')
            .update({ room_check_id: roomCheckId })
            .eq('id', taskId)
        }
        return data as unknown as HousekeepingTask & {
          room?: { room_number: string; floor: number }
          assigned_user?: { full_name: string }
        }
      }

      const updates: Partial<HousekeepingTask> = { status }
      if (status === 'in_progress') {
        updates.started_at = new Date().toISOString()
      } else if (status === 'cancelled') {
        updates.cancelled_at = new Date().toISOString()
      }
      if (notes) updates.notes = notes

      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .update(updates)
        .eq('id', taskId)
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name)
        `)
        .single()

      if (error) throw error
      return data as HousekeepingTask & {
        room?: { room_number: string; floor: number }
        assigned_user?: { full_name: string }
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
      queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
      
      if (data.status === 'in_progress') {
        toast.success('Đã bắt đầu công việc')
        
        // Trigger workflow for task started
        if (tenantId) {
          triggerWorkflow({
            triggerType: WorkflowTriggerTypes.HOUSEKEEPING_TASK_STARTED,
            eventData: {
              task_id: data.id,
              task_type: data.task_type,
              task_type_label: TASK_TYPE_LABELS[data.task_type] || data.task_type,
              room_id: data.room_id,
              room_number: (data as any).room?.room_number,
              floor: (data as any).room?.floor,
              hotel_id: data.hotel_id,
              started_by_name: user?.full_name,
            },
            tenantId,
            hotelId: data.hotel_id,
          }).catch(err => console.error('Workflow trigger failed:', err))
        }
      } else if (data.status === 'completed' || data.status === 'completed_pending_review') {
        toast.success(
          data.status === 'completed_pending_review'
            ? 'Đã gửi chờ duyệt'
            : 'Đã hoàn thành công việc',
        )
        queryClient.invalidateQueries({ queryKey: ['tasks-pending-review'] })

        // Calculate duration
        const startedAt = data.started_at ? new Date(data.started_at) : null
        const completedAt = data.completed_at ? new Date(data.completed_at) : new Date()
        const durationMinutes = startedAt 
          ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
          : null
        
        // Trigger workflow for task completed (chỉ khi đóng cứng)
        if (tenantId && data.status === 'completed') {
          triggerWorkflow({
            triggerType: WorkflowTriggerTypes.HOUSEKEEPING_TASK_COMPLETED,
            eventData: {
              task_id: data.id,
              task_type: data.task_type,
              task_type_label: TASK_TYPE_LABELS[data.task_type] || data.task_type,
              room_id: data.room_id,
              room_number: (data as any).room?.room_number,
              floor: (data as any).room?.floor,
              hotel_id: data.hotel_id,
              completed_by_name: user?.full_name,
              duration_minutes: durationMinutes,
            },
            tenantId,
            hotelId: data.hotel_id,
          }).catch(err => console.error('Workflow trigger failed:', err))
        }
      }
    },
    onError: (error: any) => {
      console.error('Update task status error:', error)
      toast.error(mapDbError(error?.message ?? error))
    }
  })
}

// Get pending task count for current user
export function usePendingTaskCount() {
  const { user } = useUser()
  const userId = user?.id
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['pending-task-count', userId, selectedHotel?.id],
    queryFn: async () => {
      if (!userId) return 0

      let q = supabase
        .from('housekeeping_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', userId)
        .in('status', ['pending', 'in_progress'])

      if (selectedHotel?.id) {
        q = q.eq('hotel_id', selectedHotel.id)
      }

      const { count, error } = await q

      if (error) throw error
      return count || 0
    },
    enabled: !!userId
  })

  // Realtime subscription
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`task-count-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'housekeeping_tasks',
          filter: `assigned_to=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])

  return query
}

// Cancel task
export function useCancelTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: string) => {
      // F-FSM-02: dùng RPC `transition_task_status` để có audit log + validate
      // transition. RPC tự set `cancelled_at`. Nếu task đã hoàn thành / đã hủy,
      // RPC trả INVALID_TRANSITION → map thành thông điệp tiếng Việt.
      const { error } = await supabase.rpc('transition_task_status', {
        _task_id: taskId,
        _to_status: 'cancelled',
        _note: 'Hủy thủ công từ danh sách công việc',
      })
      if (error) {
        if (/INVALID_TRANSITION/i.test(error.message)) {
          throw new Error('Không thể hủy công việc đã hoàn thành hoặc đã hủy')
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
      queryClient.invalidateQueries({ queryKey: ['unassigned-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
      toast.success('Đã hủy công việc')
    },
    onError: (error) => {
      console.error('Cancel task error:', error)
      toast.error('Không thể hủy công việc')
    }
  })
}

// Fetch unassigned tasks (tasks without assigned_to)
export function useUnassignedTasks() {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['unassigned-housekeeping-tasks', selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) return []

      let q = supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          requested_user:users!housekeeping_tasks_requested_by_fkey(id, full_name, avatar_url),
          booking:room_bookings(id, guest_name, check_out_date)
        `)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .eq('tenant_id', tenantId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })

      if (selectedHotel?.id) {
        q = q.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await q

      if (error) throw error
      return data as unknown as HousekeepingTaskWithDetails[]
    },
    enabled: !!tenantId
  })

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel(`unassigned-tasks-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'housekeeping_tasks'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unassigned-housekeeping-tasks'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])

  return query
}

// Claim an unassigned task
export function useClaimTask() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const userId = user?.id

  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!userId) throw new Error('User not found')

      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .update({ assigned_to: userId })
        .eq('id', taskId)
        .is('assigned_to', null) // Only claim if still unassigned
        .select('*')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unassigned-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
      queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-stats'] })
      toast.success('Đã nhận công việc')
    },
    onError: (error) => {
      console.error('Claim task error:', error)
      toast.error('Không thể nhận công việc. Có thể đã có người khác nhận.')
    }
  })
}

// Reassign task to another user (Manager only)
export function useReassignTask() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const tenantId = user?.tenant_id

  return useMutation({
    mutationFn: async ({ 
      taskId, 
      newAssigneeId, 
      reason 
    }: { 
      taskId: string
      newAssigneeId: string | null
      reason?: string 
    }) => {
      // Build update object
      const updates: Record<string, unknown> = { 
        assigned_to: newAssigneeId
      }

      // Get current task to preserve existing notes
      const { data: currentTask } = await supabase
        .from('housekeeping_tasks')
        .select('notes')
        .eq('id', taskId)
        .single()

      // Append reassignment note
      if (reason) {
        const existingNotes = currentTask?.notes || ''
        const newNote = `[Chuyển việc: ${reason}]`
        updates.notes = existingNotes ? `${existingNotes}\n${newNote}` : newNote
      }

      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .update(updates)
        .eq('id', taskId)
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name)
        `)
        .single()

      if (error) throw error
      return data as HousekeepingTask & {
        room?: { room_number: string; floor: number }
        assigned_user?: { full_name: string }
      }
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['unassigned-housekeeping-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
      queryClient.invalidateQueries({ queryKey: ['task-stats'] })
      
      if (data.assigned_to) {
        toast.success(`Đã giao việc cho ${(data as any).assigned_user?.full_name || 'nhân viên'}`)
        
        // Send detailed notification to assigned staff
        if (tenantId && user) {
          triggerHousekeepingTaskAssignedNotification({
            tenantId,
            hotelId: data.hotel_id,
            assignedToUserId: data.assigned_to,
            assignedByUserId: user.id,
            taskId: data.id,
            taskType: data.task_type,
            roomNumber: (data as any).room?.room_number || 'N/A',
            priority: data.priority,
            reason: variables.reason,
            isReassignment: !!variables.reason, // Has reason = reassignment
          }).catch(err => console.error('[useReassignTask] Notification failed:', err))
        }
      } else {
        toast.success('Đã bỏ giao việc')
      }
    },
    onError: (error) => {
      console.error('Reassign task error:', error)
      toast.error('Không thể chuyển việc')
    }
  })
}

// Get task statistics for a hotel (Manager dashboard)
export function useTaskStats(hotelId?: string) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['task-stats', hotelId],
    queryFn: async () => {
      if (!tenantId) return null

      // Get today's date range
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      // Build base query conditions
      const baseFilter = hotelId 
        ? `hotel_id.eq.${hotelId},tenant_id.eq.${tenantId}`
        : `tenant_id.eq.${tenantId}`

      // Helper to build query with optional hotel filter
      const buildQuery = () => {
        let q = supabase.from('housekeeping_tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        if (hotelId) q = q.eq('hotel_id', hotelId)
        return q
      }

      // Fetch all counts in parallel (single query each)
      const [
        pendingResult,
        inProgressResult,
        completedTodayResult,
        unassignedResult
      ] = await Promise.all([
        buildQuery().eq('status', 'pending').not('assigned_to', 'is', null),
        buildQuery().eq('status', 'in_progress'),
        buildQuery().eq('status', 'completed').gte('completed_at', today.toISOString()).lt('completed_at', tomorrow.toISOString()),
        buildQuery().eq('status', 'pending').is('assigned_to', null),
      ])

      return {
        pending: pendingResult.count || 0,
        inProgress: inProgressResult.count || 0,
        completedToday: completedTodayResult.count || 0,
        unassigned: unassignedResult.count || 0
      }
    },
    enabled: !!tenantId
  })

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel(`task-stats-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'housekeeping_tasks'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['task-stats'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])

  return query
}

// Get all tasks for a hotel with details (for manager view with grouping)
export function useAllHotelTasks(hotelId?: string, statusFilter?: TaskStatus | 'all') {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['all-hotel-tasks', hotelId, statusFilter],
    queryFn: async () => {
      if (!tenantId) return []

      let q = supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name, avatar_url),
          requested_user:users!housekeeping_tasks_requested_by_fkey(id, full_name, avatar_url),
          booking:room_bookings(id, guest_name, check_out_date)
        `)
        .eq('tenant_id', tenantId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })

      if (hotelId) {
        q = q.eq('hotel_id', hotelId)
      }

      if (statusFilter && statusFilter !== 'all') {
        q = q.eq('status', statusFilter)
      } else {
        // Default: show active tasks (pending + in_progress)
        q = q.in('status', ['pending', 'in_progress'])
      }

      const { data, error } = await q

      if (error) throw error
      return data as unknown as HousekeepingTaskWithDetails[]
    },
    enabled: !!tenantId
  })

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return

    const filterStr = hotelId ? `hotel_id=eq.${hotelId}` : undefined

    const channel = supabase
      .channel(`all-hotel-tasks-${hotelId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'housekeeping_tasks',
          filter: filterStr
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['all-hotel-tasks'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [hotelId, tenantId, queryClient])

  return query
}
