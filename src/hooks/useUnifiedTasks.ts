 import { useQuery, useQueryClient } from '@tanstack/react-query'
 import { useEffect } from 'react'
 import { supabase } from '@/integrations/supabase/client'
 import { useUser } from '@/hooks/useUser'
 import { useHotelContext } from '@/contexts/HotelContext'
 import type { HousekeepingTaskWithDetails } from '@/types/housekeeping.types'
 
 // Unified task source types
 export type TaskSource = 'housekeeping' | 'stock_adjustment'
 
 export interface UnifiedTask {
   id: string
   source: TaskSource
   title: string
   description: string | null
   priority: 'low' | 'medium' | 'high' | 'urgent'
   status: string
   roomNumber?: string
   hotelId: string
   createdAt: string
   dueAt?: string | null
   actionUrl: string
   // Original data for housekeeping tasks
   originalHousekeepingTask?: HousekeepingTaskWithDetails
   // Original data for stock adjustments
   originalStockAdjustment?: {
     id: string
     adjustment_code: string
     adjustment_type: string
     status: string | null
     scheduled_date: string | null
     notes: string | null
     created_at: string | null
     hotel_id: string
    started_at: string | null
   }
 }
 
 // Helper to normalize priority
 function normalizePriority(priority: string | null | undefined): 'low' | 'medium' | 'high' | 'urgent' {
   if (!priority) return 'medium'
   const lower = priority.toLowerCase()
   if (lower === 'urgent') return 'urgent'
   if (lower === 'high') return 'high'
   if (lower === 'low') return 'low'
   return 'medium'
 }
 
 // Hook to fetch unified tasks from multiple sources
 export function useUnifiedTasks() {
   const { user } = useUser()
   const userId = user?.id
   const tenantId = user?.tenant_id
   const { selectedHotel } = useHotelContext()
   const queryClient = useQueryClient()
 
   const query = useQuery({
     queryKey: ['unified-tasks', userId, selectedHotel?.id],
     queryFn: async (): Promise<UnifiedTask[]> => {
       if (!userId || !tenantId) return []
 
       // Build queries
       let housekeepingQuery = supabase
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
 
       let stockAdjustmentQuery = supabase
         .from('stock_adjustments')
         .select('*')
         .contains('assigned_to', [userId])
         .in('status', ['draft', 'in_progress'])
         .eq('tenant_id', tenantId)
         .order('created_at', { ascending: false })
 
       // Apply hotel filter if selected
       if (selectedHotel?.id) {
         housekeepingQuery = housekeepingQuery.eq('hotel_id', selectedHotel.id)
         stockAdjustmentQuery = stockAdjustmentQuery.eq('hotel_id', selectedHotel.id)
       }
 
       // Execute queries in parallel
       const [housekeepingResult, stockAdjustmentResult] = await Promise.all([
         housekeepingQuery,
         stockAdjustmentQuery,
       ])
 
       const tasks: UnifiedTask[] = []
 
       // Transform housekeeping tasks
       if (housekeepingResult.data) {
         for (const task of housekeepingResult.data) {
           const roomNumber = (task as any).room?.room_number
           tasks.push({
             id: task.id,
             source: 'housekeeping',
             title: task.title || getHousekeepingTitle(task.task_type, roomNumber),
             description: task.description,
             priority: normalizePriority(task.priority),
             status: task.status,
             roomNumber,
             hotelId: task.hotel_id,
             createdAt: task.created_at,
             dueAt: task.due_at,
             actionUrl: `/my-tasks?task=${task.id}`,
             originalHousekeepingTask: task as unknown as HousekeepingTaskWithDetails,
           })
         }
       }
 
       // Transform stock adjustments
       if (stockAdjustmentResult.data) {
         for (const adjustment of stockAdjustmentResult.data) {
           tasks.push({
             id: adjustment.id,
             source: 'stock_adjustment',
             title: `Kiểm kê ${adjustment.adjustment_code}`,
             description: adjustment.notes,
             priority: 'medium', // Stock adjustments don't have priority
             status: adjustment.status || 'draft',
             hotelId: adjustment.hotel_id,
             createdAt: adjustment.created_at || new Date().toISOString(),
             dueAt: adjustment.scheduled_date,
             actionUrl: `/inventory/adjustments/${adjustment.id}`,
            originalStockAdjustment: {
              id: adjustment.id,
              adjustment_code: adjustment.adjustment_code,
              adjustment_type: adjustment.adjustment_type,
              status: adjustment.status,
              scheduled_date: adjustment.scheduled_date,
              notes: adjustment.notes,
              created_at: adjustment.created_at,
              hotel_id: adjustment.hotel_id,
              started_at: adjustment.started_at,
            },
           })
         }
       }
 
       // Sort by priority (urgent first) then by created date
       const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
       tasks.sort((a, b) => {
         const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
         if (priorityDiff !== 0) return priorityDiff
         return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
       })
 
       return tasks
     },
     enabled: !!userId && !!tenantId,
   })
 
   // Realtime subscriptions (gộp 1 channel + visibility pause)
   useEffect(() => {
     if (!userId || !tenantId) return

     let channel: ReturnType<typeof supabase.channel> | null = null

     const subscribe = () => {
       if (channel) return
       channel = supabase
         .channel(`unified-tasks-${tenantId}-${userId}`)
         .on(
           'postgres_changes',
           {
             event: '*',
             schema: 'public',
             table: 'housekeeping_tasks',
             filter: `assigned_to=eq.${userId}`,
           },
           () => queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
         )
         .on(
           'postgres_changes',
           {
             event: '*',
             schema: 'public',
             table: 'stock_adjustments',
             filter: `tenant_id=eq.${tenantId}`,
           },
           () => queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
         )
         .subscribe()
     }

     const unsubscribe = () => {
       if (channel) {
         supabase.removeChannel(channel)
         channel = null
       }
     }

     const handleVisibility = () => {
       if (document.visibilityState === 'visible') {
         subscribe()
         queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
       } else {
         unsubscribe()
       }
     }

     if (document.visibilityState === 'visible') subscribe()
     document.addEventListener('visibilitychange', handleVisibility)

     return () => {
       document.removeEventListener('visibilitychange', handleVisibility)
       unsubscribe()
     }
   }, [userId, tenantId, queryClient])
 
   return query
 }
 
 // Hook to get counts per source for filtering
 export function useUnifiedTaskCounts() {
   const { data: tasks } = useUnifiedTasks()
 
   const counts = {
     total: tasks?.length || 0,
     housekeeping: tasks?.filter(t => t.source === 'housekeeping').length || 0,
     stockAdjustment: tasks?.filter(t => t.source === 'stock_adjustment').length || 0,
     pending: tasks?.filter(t => t.status === 'pending' || t.status === 'draft').length || 0,
     inProgress: tasks?.filter(t => t.status === 'in_progress').length || 0,
   }
 
   return counts
 }
 
 // Helper to get task title based on type
 function getHousekeepingTitle(taskType: string, roomNumber?: string): string {
   const roomSuffix = roomNumber ? ` P.${roomNumber}` : ''
   
   switch (taskType) {
     case 'checkout_inspection':
       return `Kiểm tra checkout${roomSuffix}`
     case 'cleaning':
       return `Dọn phòng${roomSuffix}`
     case 'checkin_prep':
       return `Chuẩn bị check-in${roomSuffix}`
     case 'amenity_request':
       return `Bổ sung đồ dùng${roomSuffix}`
     case 'delivery_confirmation':
       return `Xác nhận nhận hàng${roomSuffix}`
     default:
       return `Công việc${roomSuffix}`
   }
 }