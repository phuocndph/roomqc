import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useUser } from '@/hooks/useUser'

export interface ChargeableConsumption {
  id: string
  tenant_id: string
  booking_id: string
  room_id: string
  item_id: string
  item_code: string | null
  item_name: string
  quantity: number
  unit_price: number
  total_amount: number
  recorded_by: string | null
  recorded_at: string
  is_billed: boolean
  billed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChargeableConsumptionWithItem extends ChargeableConsumption {
  item?: {
    id: string
    name: string
    code: string
    charge_price: number | null
    unit_price: number
  }
  recorded_by_user?: {
    full_name: string
  }
}

export interface CreateChargeableConsumptionInput {
  booking_id: string
  room_id: string
  item_id: string
  item_code?: string
  item_name: string
  quantity: number
  unit_price: number
  notes?: string
}

// Hook to fetch chargeable consumptions for a booking
export function useBookingChargeableConsumptions(bookingId: string | undefined) {
  const { tenantId } = useUser()
  
  return useQuery({
    queryKey: ['chargeable-consumptions', bookingId],
    queryFn: async () => {
      if (!bookingId || !tenantId) return []
      
      const { data, error } = await supabase
        .from('chargeable_consumptions')
        .select(`
          *,
          item:items(id, name, code, charge_price, unit_price),
          recorded_by_user:users!recorded_by(full_name)
        `)
        .eq('booking_id', bookingId)
        .eq('tenant_id', tenantId)
        .order('recorded_at', { ascending: false })
      
      if (error) throw error
      return data as ChargeableConsumptionWithItem[]
    },
    enabled: !!bookingId && !!tenantId,
  })
}

// Hook to create chargeable consumption
export function useCreateChargeableConsumption() {
  const queryClient = useQueryClient()
  const { user, tenantId } = useUser()
  
  return useMutation({
    mutationFn: async (input: CreateChargeableConsumptionInput) => {
      if (!tenantId) throw new Error('Tenant ID required')
      
      const { data, error } = await supabase
        .from('chargeable_consumptions')
        .insert({
          tenant_id: tenantId,
          booking_id: input.booking_id,
          room_id: input.room_id,
          item_id: input.item_id,
          item_code: input.item_code || null,
          item_name: input.item_name,
          quantity: input.quantity,
          unit_price: input.unit_price,
          recorded_by: user?.id,
          notes: input.notes || null,
        })
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chargeable-consumptions', data.booking_id] })
      queryClient.invalidateQueries({ queryKey: ['booking-detail', data.booking_id] })
      toast.success('Đã ghi nhận đồ dùng tính phí')
    },
    onError: (error: any) => {
      toast.error('Lỗi ghi nhận đồ dùng: ' + error.message)
    },
  })
}

// Hook to create multiple chargeable consumptions at once
export function useCreateMultipleChargeableConsumptions() {
  const queryClient = useQueryClient()
  const { user, tenantId } = useUser()
  
  return useMutation({
    mutationFn: async (inputs: CreateChargeableConsumptionInput[]) => {
      if (!tenantId) throw new Error('Tenant ID required')
      if (inputs.length === 0) return []
      
      const records = inputs.map(input => ({
        tenant_id: tenantId,
        booking_id: input.booking_id,
        room_id: input.room_id,
        item_id: input.item_id,
        item_code: input.item_code || null,
        item_name: input.item_name,
        quantity: input.quantity,
        unit_price: input.unit_price,
        recorded_by: user?.id,
        notes: input.notes || null,
      }))
      
      const { data, error } = await supabase
        .from('chargeable_consumptions')
        .insert(records)
        .select()
      
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      if (data && data.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['chargeable-consumptions', data[0].booking_id] })
        queryClient.invalidateQueries({ queryKey: ['booking-detail', data[0].booking_id] })
      }
      toast.success(`Đã ghi nhận ${data?.length || 0} đồ dùng tính phí`)
    },
    onError: (error: any) => {
      toast.error('Lỗi ghi nhận đồ dùng: ' + error.message)
    },
  })
}

// Hook to update billing status
export function useMarkChargeableAsBilled() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ ids, bookingId }: { ids: string[], bookingId: string }) => {
      const { error } = await supabase
        .from('chargeable_consumptions')
        .update({
          is_billed: true,
          billed_at: new Date().toISOString(),
        })
        .in('id', ids)
      
      if (error) throw error
      return { ids, bookingId }
    },
    onSuccess: ({ bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ['chargeable-consumptions', bookingId] })
      toast.success('Đã đánh dấu đã thu tiền')
    },
    onError: (error: any) => {
      toast.error('Lỗi cập nhật: ' + error.message)
    },
  })
}

// Hook to delete chargeable consumption
export function useDeleteChargeableConsumption() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, bookingId }: { id: string, bookingId: string }) => {
      const { error } = await supabase
        .from('chargeable_consumptions')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      return { id, bookingId }
    },
    onSuccess: ({ bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ['chargeable-consumptions', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['booking-detail', bookingId] })
      toast.success('Đã xóa')
    },
    onError: (error: any) => {
      toast.error('Lỗi xóa: ' + error.message)
    },
  })
}

// Hook to get total chargeable amount for a booking
export function useBookingChargeableTotal(bookingId: string | undefined) {
  const { tenantId } = useUser()
  
  return useQuery({
    queryKey: ['chargeable-total', bookingId],
    queryFn: async () => {
      if (!bookingId || !tenantId) return 0
      
      const { data, error } = await supabase
        .rpc('get_booking_chargeable_total', { p_booking_id: bookingId })
      
      if (error) throw error
      return data as number
    },
    enabled: !!bookingId && !!tenantId,
  })
}

// Hook to get chargeable items for a hotel (items where is_chargeable = true)
export function useChargeableItems(hotelId: string | undefined) {
  const { tenantId } = useUser()
  
  return useQuery({
    queryKey: ['chargeable-items', hotelId],
    queryFn: async () => {
      if (!hotelId || !tenantId) return []
      
      const { data, error } = await supabase
        .from('items')
        .select('id, code, name, unit_price, charge_price, item_type, quantity_in_stock')
        .eq('hotel_id', hotelId)
        .eq('tenant_id', tenantId)
        .eq('is_chargeable', true)
        .eq('status', 'active')
        .order('name')
      
      if (error) throw error
      return data
    },
    enabled: !!hotelId && !!tenantId,
  })
}
