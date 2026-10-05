import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { isAdminUser } from '@/lib/userAccess'
import { getFriendlyError } from '@/lib/errorMessage'

export interface SupplementRequestItem {
  item_id: string
  item_name: string
  item_code?: string
  quantity: number
  unit_price: number
  total_value?: number
  item_type?: string
}

export interface SupplementRequest {
  id: string
  tenant_id: string
  hotel_id: string
  room_id: string
  room_check_id?: string
  request_code: string
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled'
  request_type: 'lost' | 'consumed' | 'damaged' | 'mixed'
  items: SupplementRequestItem[]
  total_value: number
  requested_by?: string
  approved_by?: string
  approved_at?: string
  completed_at?: string
  transaction_id?: string
  distribution_order_id?: string // Link to distribution order created when approved
  notes?: string
  rejection_reason?: string
  created_at: string
  updated_at: string
  // Joined fields
  room?: { id: string; room_number: string; floor?: number }
  requester?: { id: string; full_name: string; avatar_url?: string }
  approver?: { id: string; full_name: string }
  hotel?: { id: string; name: string }
}

export interface SupplementRequestFilters {
  status?: string
  request_type?: string
  room_id?: string
  from_date?: Date
  to_date?: Date
  search?: string
}

export function useSupplementRequests(filters: SupplementRequestFilters = {}) {
  const { tenantId, user } = useUser()
  const { selectedHotel, isAllHotelsMode, availableHotels } = useHotelContext()

  return useQuery({
    queryKey: ['supplement-requests', tenantId, selectedHotel?.id, isAllHotelsMode, filters],
    queryFn: async () => {
      if (!tenantId) return []

      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)

      let query = supabase
        .from('supplement_requests')
        .select(`
          *,
          room:rooms(id, room_number, floor),
          requester:users!supplement_requests_requested_by_fkey(id, full_name, avatar_url),
          approver:users!supplement_requests_approved_by_fkey(id, full_name),
          hotel:hotels(id, name)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        // Đợt 3: 200 → 100 — đủ cho UI list, giảm 50% payload
        .limit(100)

      if (hotelIdToFilter) {
        query = query.eq('hotel_id', hotelIdToFilter)
      } else if (!isAdminUser(user) && availableHotels.length > 0) {
        query = query.in('hotel_id', availableHotels.map(h => h.id))
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.request_type) {
        query = query.eq('request_type', filters.request_type)
      }

      if (filters.room_id) {
        query = query.eq('room_id', filters.room_id)
      }

      if (filters.from_date) {
        query = query.gte('created_at', filters.from_date.toISOString())
      }

      if (filters.to_date) {
        query = query.lte('created_at', filters.to_date.toISOString())
      }

      if (filters.search) {
        query = query.or(`request_code.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`)
      }

      const { data, error } = await query

      if (error) throw error
      return (data || []).map(d => ({
        ...d,
        items: (d.items || []) as unknown as SupplementRequestItem[],
      })) as SupplementRequest[]
    },
    enabled: !!tenantId,
  })
}

export function useSupplementRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['supplement-request', requestId],
    queryFn: async () => {
      if (!requestId) throw new Error('No request ID')

      const { data, error } = await supabase
        .from('supplement_requests')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type),
          requester:users!supplement_requests_requested_by_fkey(id, full_name, avatar_url),
          approver:users!supplement_requests_approved_by_fkey(id, full_name),
          hotel:hotels(id, name)
        `)
        .eq('id', requestId)
        .single()

      if (error) throw error
      return {
        ...data,
        items: (data.items || []) as unknown as SupplementRequestItem[],
      } as SupplementRequest
    },
    enabled: !!requestId,
  })
}

export function usePendingSupplementCount() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['supplement-requests-pending-count', tenantId, selectedHotel?.id, isAllHotelsMode],
    queryFn: async () => {
      if (!tenantId) return 0

      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)

      let query = supabase
        .from('supplement_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')

      if (hotelIdToFilter) {
        query = query.eq('hotel_id', hotelIdToFilter)
      }

      const { count, error } = await query

      if (error) throw error
      return count || 0
    },
    enabled: !!tenantId,
  })
}

export function useCreateSupplementRequest() {
  const queryClient = useQueryClient()
  const { tenantId, user } = useUser()

  return useMutation({
    mutationFn: async (data: {
      hotel_id: string
      room_id: string
      room_check_id?: string
      request_type: 'lost' | 'consumed' | 'damaged' | 'mixed'
      items: SupplementRequestItem[]
      notes?: string
    }) => {
      if (!tenantId || !user?.id) {
        throw new Error('Missing required context')
      }

      // Generate request code
      const { data: codeResult } = await supabase
        .rpc('generate_supplement_request_code', { p_tenant_id: tenantId })

      const requestCode = codeResult || `SUP-${Date.now()}`

      // Calculate total value
      const totalValue = data.items.reduce(
        (sum, item) => sum + (item.quantity * item.unit_price),
        0
      )

      const { data: request, error } = await supabase
        .from('supplement_requests')
        .insert([{
          tenant_id: tenantId,
          hotel_id: data.hotel_id,
          room_id: data.room_id,
          room_check_id: data.room_check_id,
          request_code: requestCode,
          request_type: data.request_type,
          items: data.items as any,
          total_value: totalValue,
          requested_by: user.id,
          notes: data.notes,
          status: 'pending',
        }])
        .select()
        .single()

      if (error) throw error
      return request
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
    },
  })
}

export function useApproveSupplementRequest() {
  const queryClient = useQueryClient()
  const { tenantId, user } = useUser()
  const { selectedHotel } = useHotelContext()

  return useMutation({
    mutationFn: async (data: {
      requestId: string
      createOutbound?: boolean
    }) => {
      if (!tenantId || !user?.id) {
        throw new Error('Missing required context')
      }

      // Get request details
      const { data: request, error: fetchError } = await supabase
        .from('supplement_requests')
        .select('*, room:rooms(room_number)')
        .eq('id', data.requestId)
        .single()

      if (fetchError) throw fetchError

      // Update request status
      const { error: updateError } = await supabase
        .from('supplement_requests')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', data.requestId)

      if (updateError) throw updateError

      const requestItems = (request.items || []) as unknown as SupplementRequestItem[]
      let transactionCreated = false

      // Optionally create outbound transaction
      if (data.createOutbound && requestItems.length > 0) {
        const rpcItems = requestItems.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        }))

        const { data: txResult, error: txError } = await supabase
          .rpc('create_outbound_transaction', {
            p_tenant_id: tenantId,
            p_hotel_id: request.hotel_id,
             // Room allocation is now represented by the related request;
             // room_assign is intentionally disabled in the RPC.
             p_transaction_category: 'other_out',
            p_from_location: 'Kho',
            p_to_location: `Phòng ${request.room?.room_number || 'N/A'}`,
            p_created_by: user.id,
            p_items: rpcItems as any,
            p_related_type: 'supplement_request',
            p_related_id: data.requestId,
            p_recipient_name: null,
            p_recipient_signature: null,
            p_documents: null,
            p_photos: null,
            p_notes: `Bổ sung đồ theo yêu cầu ${request.request_code}`,
            p_from_warehouse_id: null,
          })

        if (txError) throw txError

        // The outbound RPC may return only a transaction code (one row per
        // item), so mark the request complete after the atomic call succeeds.
        const txResponse = txResult as any
        if (txResponse?.success) {
          const { error: completeError } = await supabase
            .from('supplement_requests')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', data.requestId)
          if (completeError) throw completeError
        }

        transactionCreated = true
      }

      return { request, transactionCreated }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-request'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })

      toast.success('Đã duyệt yêu cầu bổ sung', {
        description: result.transactionCreated ? 'Phiếu xuất kho đã được tạo' : undefined,
      })
    },
    onError: (error: Error) => {
      toast.error('Lỗi duyệt yêu cầu', { description: getFriendlyError(error) })
    },
  })
}

export function useRejectSupplementRequest() {
  const queryClient = useQueryClient()
  const { user } = useUser()

  return useMutation({
    mutationFn: async (data: {
      requestId: string
      reason: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('supplement_requests')
        .update({
          status: 'rejected',
          rejection_reason: data.reason,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', data.requestId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-request'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
      toast.success('Đã từ chối yêu cầu bổ sung')
    },
    onError: (error: Error) => {
      toast.error('Lỗi từ chối yêu cầu', { description: getFriendlyError(error) })
    },
  })
}

export function useCancelSupplementRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('supplement_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
      toast.success('Đã hủy yêu cầu bổ sung')
    },
  })
}
