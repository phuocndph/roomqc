import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface BookingConsumable {
  id: string
  booking_id: string
  item_id: string
  room_id: string
  initial_quantity: number
  supplemented_quantity: number
  remaining_quantity: number | null
  consumed_quantity: number | null
  unit_price: number
  notes: string | null
  item?: {
    id: string
    name: string
    code: string
    unit_price: number
  }
}

export interface BookingConsumableWithItem extends BookingConsumable {
  item_name: string
  item_code: string
  total_available: number // initial + supplemented
}

// Fetch booking consumables for a specific booking
export function useBookingConsumables(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['booking-consumables', bookingId],
    queryFn: async () => {
      if (!bookingId) return []

      const { data, error } = await supabase
        .from('booking_consumables')
        .select(`
          *,
          item:items(id, name, code, unit_price)
        `)
        .eq('booking_id', bookingId)

      if (error) {
        console.error('Error fetching booking consumables:', error)
        return []
      }

      return data.map(bc => ({
        ...bc,
        item_name: bc.item?.name || '',
        item_code: bc.item?.code || '',
        total_available: bc.initial_quantity + bc.supplemented_quantity,
      })) as BookingConsumableWithItem[]
    },
    enabled: !!bookingId,
  })
}

// Initialize booking consumables from room_items when check-in
export function useInitializeBookingConsumables() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bookingId,
      roomId,
      tenantId,
    }: {
      bookingId: string
      roomId: string
      tenantId: string
    }) => {
      // First check if already initialized
      const { data: existing } = await supabase
        .from('booking_consumables')
        .select('id')
        .eq('booking_id', bookingId)
        .limit(1)

      if (existing && existing.length > 0) {
        return existing
      }

      // Get room items that are consumables
      const { data: roomItems, error: roomItemsError } = await supabase
        .from('room_items')
        .select(`
          id,
          item_id,
          quantity,
          items!inner(id, item_type, name, code, unit_price)
        `)
        .eq('room_id', roomId)

      if (roomItemsError) throw roomItemsError

      // Filter consumable items
      const consumableItems = roomItems?.filter(
        (ri: any) => ri.items?.item_type === 'consumable'
      ) || []

      if (consumableItems.length === 0) {
        return []
      }

      // Create booking_consumables records
      const consumablesData = consumableItems.map((ri: any) => ({
        tenant_id: tenantId,
        booking_id: bookingId,
        room_id: roomId,
        item_id: ri.item_id,
        initial_quantity: ri.quantity || 0,
        supplemented_quantity: 0,
        unit_price: ri.items?.unit_price || 0,
      }))

      const { data, error } = await supabase
        .from('booking_consumables')
        .insert(consumablesData)
        .select()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['booking-consumables', variables.bookingId] })
    },
    onError: (error) => {
      console.error('Error initializing booking consumables:', error)
      toast.error('Không thể khởi tạo dữ liệu tiêu hao')
    },
  })
}

// Update remaining quantity for a consumable (during checkout)
export function useUpdateConsumableRemaining() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bookingConsumableId,
      remainingQuantity,
      notes,
    }: {
      bookingConsumableId: string
      remainingQuantity: number
      notes?: string
    }) => {
      const { data, error } = await supabase
        .from('booking_consumables')
        .update({
          remaining_quantity: remainingQuantity,
          notes: notes || null,
        })
        .eq('id', bookingConsumableId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking-consumables', data.booking_id] })
    },
    onError: (error) => {
      console.error('Error updating consumable remaining:', error)
      toast.error('Không thể cập nhật số lượng còn lại')
    },
  })
}

// Update supplemented quantity (when distribution order is confirmed)
export function useUpdateConsumableSupplemented() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bookingId,
      itemId,
      additionalQuantity,
    }: {
      bookingId: string
      itemId: string
      additionalQuantity: number
    }) => {
      // First get current supplemented quantity
      const { data: current, error: fetchError } = await supabase
        .from('booking_consumables')
        .select('id, supplemented_quantity')
        .eq('booking_id', bookingId)
        .eq('item_id', itemId)
        .single()

      if (fetchError) throw fetchError

      // Update with new total
      const { data, error } = await supabase
        .from('booking_consumables')
        .update({
          supplemented_quantity: (current.supplemented_quantity || 0) + additionalQuantity,
        })
        .eq('id', current.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking-consumables', data.booking_id] })
    },
    onError: (error) => {
      console.error('Error updating supplemented quantity:', error)
    },
  })
}

// Bulk update remaining quantities for multiple consumables
export function useBulkUpdateConsumableRemaining() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: {
      bookingConsumableId: string
      remainingQuantity: number
      bookingId: string
    }[]) => {
      const results = await Promise.all(
        updates.map(async (update) => {
          const { data, error } = await supabase
            .from('booking_consumables')
            .update({ remaining_quantity: update.remainingQuantity })
            .eq('id', update.bookingConsumableId)
            .select()
            .single()

          if (error) throw error
          return data
        })
      )

      return results
    },
    onSuccess: (_, variables) => {
      const bookingIds = [...new Set(variables.map(v => v.bookingId))]
      bookingIds.forEach(bookingId => {
        queryClient.invalidateQueries({ queryKey: ['booking-consumables', bookingId] })
      })
    },
    onError: (error) => {
      console.error('Error bulk updating consumables:', error)
      toast.error('Không thể cập nhật số lượng còn lại')
    },
  })
}

// Fetch issues during a booking period
export function useBookingIssues(roomId: string | undefined, checkInDate: string | undefined, checkOutDate: string | undefined) {
  return useQuery({
    queryKey: ['booking-issues', roomId, checkInDate, checkOutDate],
    queryFn: async () => {
      if (!roomId || !checkInDate) return []

      let query = supabase
        .from('room_checks')
        .select('*')
        .eq('room_id', roomId)
        .gte('checked_at', checkInDate)
        .order('checked_at', { ascending: false })

      if (checkOutDate) {
        query = query.lte('checked_at', checkOutDate)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching booking issues:', error)
        return []
      }

      // Lọc các check có item hỏng/mất (JSONB array length > 0)
      const filtered = (data || []).filter((rc: any) => {
        const damaged = Array.isArray(rc.items_damaged) ? rc.items_damaged : []
        const lost = Array.isArray(rc.items_lost) ? rc.items_lost : []
        return damaged.length > 0 || lost.length > 0
      })

      // Lấy thêm tên người báo cáo
      const userIds = [...new Set(filtered.map((rc: any) => rc.checked_by).filter(Boolean))]
      let userMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds)
        userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u.full_name]))
      }

      return filtered.map((rc: any) => ({
        ...rc,
        checked_by_name: userMap[rc.checked_by] || null,
      }))
    },
    enabled: !!roomId && !!checkInDate,
  })
}
