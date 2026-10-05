import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { isAdminUser } from '@/lib/userAccess'
import { getFriendlyError } from '@/lib/errorMessage'

export interface LaundryRequestItem {
  item_id: string
  item_name: string
  item_code?: string
  quantity: number
}

export interface LaundryRequest {
  id: string
  tenant_id: string
  hotel_id: string
  room_id: string
  room_check_id?: string
  request_code: string
  status: 'pending' | 'added_to_batch' | 'cancelled'
  items: LaundryRequestItem[]
  total_quantity: number
  laundry_batch_id?: string
  requested_by?: string
  added_at?: string
  notes?: string
  created_at: string
  updated_at: string
  // Joined fields
  room?: { id: string; room_number: string; floor?: number }
  requester?: { id: string; full_name: string; avatar_url?: string }
  hotel?: { id: string; name: string }
  batch?: { id: string; batch_code: string; status: string }
}

export interface LaundryRequestFilters {
  status?: string
  room_id?: string
  from_date?: Date
  to_date?: Date
  search?: string
}

export function useLaundryRequests(filters: LaundryRequestFilters = {}) {
  const { tenantId, user } = useUser()
  const { selectedHotel, isAllHotelsMode, availableHotels } = useHotelContext()

  return useQuery({
    queryKey: ['laundry-requests', tenantId, selectedHotel?.id, isAllHotelsMode, filters],
    queryFn: async () => {
      if (!tenantId) return []

      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)

      let query = supabase
        .from('laundry_requests')
        .select(`
          *,
          room:rooms(id, room_number, floor),
          requester:users!laundry_requests_requested_by_fkey(id, full_name, avatar_url),
          hotel:hotels(id, name),
          batch:laundry_batches(id, batch_code, status)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (hotelIdToFilter) {
        query = query.eq('hotel_id', hotelIdToFilter)
      } else if (!isAdminUser(user) && availableHotels.length > 0) {
        query = query.in('hotel_id', availableHotels.map(h => h.id))
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
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
        items: (d.items || []) as unknown as LaundryRequestItem[],
      })) as LaundryRequest[]
    },
    enabled: !!tenantId,
  })
}

export function usePendingLaundryRequestsCount() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['laundry-requests-pending-count', tenantId, selectedHotel?.id, isAllHotelsMode],
    queryFn: async () => {
      if (!tenantId) return 0

      const hotelIdToFilter = isAllHotelsMode ? null : (selectedHotel?.id || null)

      let query = supabase
        .from('laundry_requests')
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

export function useCreateLaundryRequest() {
  const queryClient = useQueryClient()
  const { tenantId, user } = useUser()

  return useMutation({
    mutationFn: async (data: {
      hotel_id: string
      room_id: string
      room_check_id?: string
      items: LaundryRequestItem[]
      notes?: string
      auto_add_to_batch?: boolean
    }) => {
      if (!tenantId || !user?.id) {
        throw new Error('Missing required context')
      }

      // Generate request code
      const { data: codeResult } = await supabase
        .rpc('generate_laundry_request_code', { p_tenant_id: tenantId })

      const requestCode = codeResult || `LRQ-${Date.now()}`

      // Calculate total quantity
      const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0)

      const { data: request, error } = await supabase
        .from('laundry_requests')
        .insert([{
          tenant_id: tenantId,
          hotel_id: data.hotel_id,
          room_id: data.room_id,
          room_check_id: data.room_check_id,
          request_code: requestCode,
          items: data.items as any,
          total_quantity: totalQuantity,
          requested_by: user.id,
          notes: data.notes,
          status: 'pending',
        }])
        .select()
        .single()

      if (error) throw error

      // Auto add to draft batch if requested
      if (data.auto_add_to_batch && request) {
        try {
          await supabase.rpc('add_laundry_to_draft_batch', {
            p_tenant_id: tenantId,
            p_hotel_id: data.hotel_id,
            p_laundry_request_id: request.id,
          })
        } catch (err) {
          console.error('Error auto-adding to batch:', err)
          // Don't throw - request was still created
        }
      }

      return request
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
    },
  })
}

export function useAddToDraftBatch() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (data: {
      requestId: string
      hotelId: string
    }) => {
      if (!tenantId) throw new Error('No tenant')

      const { data: batchId, error } = await supabase.rpc('add_laundry_to_draft_batch', {
        p_tenant_id: tenantId,
        p_hotel_id: data.hotelId,
        p_laundry_request_id: data.requestId,
      })

      if (error) throw error
      return batchId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
      queryClient.invalidateQueries({ queryKey: ['draft-laundry-batch'] })
      toast.success('Đã thêm vào lô giặt')
    },
    onError: (error: Error) => {
      toast.error('Lỗi thêm vào lô giặt', { description: getFriendlyError(error) })
    },
  })
}

export function useCancelLaundryRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('laundry_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-requests'] })
      queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
      toast.success('Đã hủy yêu cầu giặt')
    },
  })
}

// Helper to get draft batch for a hotel
export function useDraftLaundryBatch() {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['draft-laundry-batch', tenantId, selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId || !selectedHotel?.id) return null

      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('laundry_batches')
        .select(`
          *,
          items:laundry_batch_items(
            id,
            item_id,
            quantity_delivered,
            item:items(id, code, name)
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('hotel_id', selectedHotel.id)
        .eq('status', 'draft')
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!tenantId && !!selectedHotel?.id,
  })
}
