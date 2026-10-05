import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useToast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface LostFoundItem {
  id: string
  tenant_id: string
  hotel_id: string
  item_code: string | null
  item_name: string
  description: string | null
  category: string
  found_location: string | null
  room_id: string | null
  found_date: string
  found_by: string | null
  photo_urls: string[]
  status: string
  claimed_by_name: string | null
  claimed_by_phone: string | null
  claimed_date: string | null
  storage_location: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  rooms?: { room_number: string } | null
  found_by_user?: { full_name: string } | null
}

export function useLostFoundItems(filters?: { status?: string; search?: string }) {
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const tenantId = tenant?.id
  const hotelId = selectedHotel?.id

  return useQuery({
    queryKey: ['lost-found', tenantId, hotelId, filters],
    queryFn: async () => {
      if (!tenantId) return []

      let query = supabase
        .from('lost_found_items')
        .select('*, rooms(room_number)')
        .eq('tenant_id', tenantId)
        .order('found_date', { ascending: false })

      if (hotelId) {
        query = query.eq('hotel_id', hotelId)
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.search) {
        query = query.or(`item_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,claimed_by_name.ilike.%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as LostFoundItem[]
    },
    enabled: !!tenantId,
  })
}

export function useCreateLostFoundItem() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (item: {
      tenant_id: string
      hotel_id: string
      item_name: string
      description?: string
      category: string
      found_location?: string
      room_id?: string | null
      found_date: string
      found_by?: string | null
      storage_location?: string
      notes?: string
    }) => {
      const { data, error } = await supabase
        .from('lost_found_items')
        .insert(item)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-found'] })
      toast({ title: 'Đã đăng ký đồ thất lạc' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useUpdateLostFoundItem() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => {
      const { data, error } = await supabase
        .from('lost_found_items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-found'] })
      toast({ title: 'Đã cập nhật' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useClaimLostFoundItem() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (params: {
      id: string
      claimed_by_name: string
      claimed_by_phone?: string
    }) => {
      const { data, error } = await supabase
        .from('lost_found_items')
        .update({
          status: 'claimed',
          claimed_by_name: params.claimed_by_name,
          claimed_by_phone: params.claimed_by_phone || null,
          claimed_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-found'] })
      toast({ title: 'Đã trả đồ cho người nhận' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}
