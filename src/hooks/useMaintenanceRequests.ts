import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { isAdminUser } from '@/lib/userAccess'
import { triggerWorkflow, WorkflowTriggerTypes } from '@/lib/triggerWorkflow'
import { useShiftGuardedMutation } from './useGuardedMutation'
import { getFriendlyError } from '@/lib/errorMessage'

export interface MaintenanceRequest {
  id: string
  tenant_id: string
  hotel_id: string
  request_code: string
  room_id?: string
  item_id?: string
  location: string
  issue_type: 'repair' | 'replace' | 'inspection' | 'cleaning' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  description: string
  status: 'waiting' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
  reported_by: string
  assigned_to?: string | null
  reported_at: string
  accepted_at?: string
  started_at?: string
  completed_at?: string
  expected_completion_date?: string
  estimated_cost?: number
  actual_cost?: number
  under_warranty?: boolean
  warranty_info?: string
  solution?: string
  parts_used?: any[]
  photos?: string[]
  documents?: string[]
  completion_photos?: string[]
  completion_notes?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface MaintenanceFilters {
  search?: string
  status?: string
  priority?: string
  issue_type?: string
  room_id?: string
  item_id?: string
  reported_by?: string
  under_warranty?: boolean
  overdue?: boolean
  from_date?: string
  to_date?: string
}

export function useMaintenanceRequests(filters: MaintenanceFilters = {}) {
  const { toast } = useToast()
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['maintenance-requests', tenantId, selectedHotel?.id, isAllHotelsMode, filters],
    staleTime: 30 * 1000, // 30 seconds
    queryFn: async () => {
      if (!tenantId) return []

      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)

      let query: any = supabase
        .from('maintenance_requests')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          item:items(id, code, name),
          reporter:users!maintenance_requests_reported_by_fkey(id, full_name, avatar_url)
        `)
        .eq('tenant_id', tenantId)

      if (hotelIdToFilter) {
        query = query.eq('hotel_id', hotelIdToFilter)
      }

      if (filters.search) {
        query = query.or(`request_code.ilike.%${filters.search}%,title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.priority) {
        query = query.eq('priority', filters.priority)
      }

      if (filters.issue_type) {
        query = query.eq('issue_type', filters.issue_type)
      }

      if (filters.room_id) {
        query = query.eq('room_id', filters.room_id)
      }

      if (filters.item_id) {
        query = query.eq('item_id', filters.item_id)
      }

      if (filters.reported_by) {
        query = query.eq('reported_by', filters.reported_by)
      }

      if (filters.under_warranty !== undefined) {
        query = query.eq('under_warranty', filters.under_warranty)
      }

      if (filters.from_date) {
        query = query.gte('reported_at', filters.from_date)
      }

      if (filters.to_date) {
        query = query.lte('reported_at', filters.to_date)
      }

      // Đợt 3: 200 → 100 — UI list hiển thị có scroll/filter, không cần 200 dòng cùng lúc
      query = query.order('reported_at', { ascending: false }).limit(100)

      const { data, error } = await query

      if (error) throw error

      // Sort priority on client with correct order (urgent > high > medium > low)
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
      return (data as any[]).sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 99
        const pb = priorityOrder[b.priority] ?? 99
        if (pa !== pb) return pa - pb
        return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()
      })
    },
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
  })
}

export function useMaintenanceRequest(id: string) {
  const { toast } = useToast()
  const { user } = useUser()
  const { availableHotels } = useHotelContext()

  return useQuery({
    queryKey: ['maintenance-request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select(`
          *,
          room:rooms(*),
          item:items(*),
          reporter:users!maintenance_requests_reported_by_fkey(*),
          assignee:users!maintenance_requests_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      
      // Hotel access check for non-admin users
      if (!isAdminUser(user) && availableHotels.length > 0 && data?.hotel_id) {
        const hasAccess = availableHotels.some(h => h.id === data.hotel_id)
        if (!hasAccess) {
          throw new Error('Bạn không có quyền truy cập yêu cầu bảo trì này')
        }
      }
      
      return data
    },
    enabled: !!id,
  })
}

export function useCreateMaintenanceRequest() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, tenantId } = useUser()
  const { selectedHotel } = useHotelContext()

  return useMutation({
    mutationFn: async (data: any) => {
      if (!selectedHotel?.id) {
        throw new Error('Vui lòng chọn khách sạn')
      }

      const { data: request, error } = await supabase
        .from('maintenance_requests')
        .insert({
          ...data,
          tenant_id: tenantId,
          hotel_id: selectedHotel.id,
          reported_by: user?.id,
          reported_at: data.reported_at || new Date().toISOString(),
          status: 'waiting',
        })
        .select()
        .single()

      if (error) throw error
      return request
    },
    onSuccess: async (request) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      
      // Trigger workflow for new maintenance request
      if (tenantId && selectedHotel?.id) {
        triggerWorkflow({
          triggerType: WorkflowTriggerTypes.MAINTENANCE_REQUEST_CREATED,
          eventData: {
            request_id: request.id,
            request_code: request.request_code,
            title: request.title,
            description: request.description,
            priority: request.priority,
            issue_type: request.issue_type,
            location: request.location,
          },
          tenantId,
          hotelId: selectedHotel.id,
        }).catch(err => console.error('[triggerWorkflow] maintenance_request_created error:', err))
      }
      
      // Trigger notification for new maintenance request - notify managers
      if (user?.id && tenantId && selectedHotel?.id) {
        const { triggerMaintenanceNewNotification } = await import('./useNotificationTriggers')
        await triggerMaintenanceNewNotification({
          tenantId,
          hotelId: selectedHotel.id,
          requestCode: request.request_code,
          title: request.title,
          location: request.location,
          requestId: request.id,
          createdByUserId: user.id,
        })
      }
      
      toast({
        title: 'Thành công',
        description: 'Đã tạo yêu cầu bảo trì',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateMaintenanceRequest() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: request, error } = await supabase
        .from('maintenance_requests')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return request
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-request'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật yêu cầu',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// Valid status transitions map
const VALID_TRANSITIONS: Record<string, string[]> = {
  waiting: ['pending', 'cancelled'],
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

async function validateStatusTransition(id: string, targetStatus: string): Promise<string> {
  const { data: request, error } = await supabase
    .from('maintenance_requests')
    .select('status')
    .eq('id', id)
    .single()

  if (error || !request) {
    throw new Error('Không tìm thấy yêu cầu bảo trì')
  }

  const currentStatus = request.status as string
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || []

  if (!allowedTransitions.includes(targetStatus)) {
    const statusLabels: Record<string, string> = {
      waiting: 'Chờ tiếp nhận',
      pending: 'Đã tiếp nhận',
      in_progress: 'Đang xử lý',
      completed: 'Hoàn thành',
      cancelled: 'Đã hủy',
    }
    throw new Error(
      `Không thể chuyển từ "${statusLabels[currentStatus]}" sang "${statusLabels[targetStatus]}"`
    )
  }

  return currentStatus
}

export function useAcceptRequest() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useShiftGuardedMutation(useMutation({
    mutationFn: async (id: string) => {
      // Validate: only from 'waiting' -> 'pending'
      await validateStatusTransition(id, 'pending')

      const { data, error } = await supabase
        .from('maintenance_requests')
        .update({
          status: 'pending',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-request'] })
      toast({
        title: 'Thành công',
        description: 'Đã tiếp nhận yêu cầu',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  }))
}

export function useStartRequest() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useShiftGuardedMutation(useMutation({
    mutationFn: async (id: string) => {
      // Validate: only from 'pending' -> 'in_progress'
      await validateStatusTransition(id, 'in_progress')

      const { data, error } = await supabase
        .from('maintenance_requests')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-request'] })
      toast({
        title: 'Thành công',
        description: 'Đã bắt đầu kiểm tra',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  }))
}

export function useCompleteRequest() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, tenantId } = useUser()

  return useShiftGuardedMutation(useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      // Validate: only from 'in_progress' -> 'completed'
      await validateStatusTransition(id, 'completed')

      const { data: request, error } = await supabase
        .from('maintenance_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          solution: data.solution,
          actual_cost: data.actual_cost,
          parts_used: data.parts_used,
          completion_notes: data.completion_notes,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return request
    },
    onSuccess: async (request) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-request'] })
      
      // Notify the original reporter that their request is completed
      if (user?.id && tenantId && request.reported_by) {
        const { triggerMaintenanceCompletedNotification } = await import('./useNotificationTriggers')
        await triggerMaintenanceCompletedNotification({
          tenantId,
          requestCode: request.request_code,
          title: request.title,
          requestId: request.id,
          reportedByUserId: request.reported_by,
          completedByUserId: user.id,
        })
      }
      
      toast({
        title: 'Thành công',
        description: 'Đã hoàn thành yêu cầu',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  }))
}

export function useCancelRequest() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useShiftGuardedMutation(useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // Validate: from 'waiting', 'pending', or 'in_progress' -> 'cancelled'
      await validateStatusTransition(id, 'cancelled')

      const { data, error } = await supabase
        .from('maintenance_requests')
        .update({
          status: 'cancelled',
          notes: reason,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] })
      toast({
        title: 'Thành công',
        description: 'Đã hủy yêu cầu',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  }))
}
