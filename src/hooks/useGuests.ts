import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useToast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface Guest {
  id: string
  tenant_id: string
  full_name: string
  phone: string | null
  email: string | null
  id_type: string | null
  id_number: string | null
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  address: string | null
  id_image_url: string | null
  vip_level: string
  notes: string | null
  total_stays: number
  total_spent: number
  last_stay_date: string | null
  created_at: string
  updated_at: string
}

export type GuestInsert = Omit<Guest, 'id' | 'created_at' | 'updated_at' | 'total_stays' | 'total_spent' | 'last_stay_date'>

export function useGuests(filters?: { search?: string; vipLevel?: string }) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery({
    queryKey: ['guests', tenantId, filters],
    queryFn: async () => {
      if (!tenantId) return []

      let query = supabase
        .from('guests')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
      }

      if (filters?.vipLevel && filters.vipLevel !== 'all') {
        query = query.eq('vip_level', filters.vipLevel)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Guest[]
    },
    enabled: !!tenantId,
  })
}

export function useGuest(guestId: string | undefined) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery({
    queryKey: ['guest', guestId],
    queryFn: async () => {
      if (!guestId || !tenantId) return null

      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('id', guestId)
        .eq('tenant_id', tenantId)
        .single()

      if (error) throw error
      return data as Guest
    },
    enabled: !!guestId && !!tenantId,
  })
}

export function useGuestBookings(guestId: string | undefined) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery({
    queryKey: ['guest-bookings', guestId],
    queryFn: async () => {
      if (!guestId || !tenantId) return []

      const { data, error } = await supabase
        .from('room_bookings')
        .select('*, rooms(room_number, floor)')
        .eq('guest_id', guestId)
        .eq('tenant_id', tenantId)
        .order('check_in_date', { ascending: false })
        .limit(50)

      if (error) throw error
      return data
    },
    enabled: !!guestId && !!tenantId,
  })
}

export function useSearchGuestByPhone() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useMutation({
    mutationFn: async (phone: string) => {
      if (!tenantId || !phone.trim()) return null

      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('phone', phone.trim())
        .maybeSingle()

      if (error) throw error
      return data as Guest | null
    },
  })
}

export function useCreateGuest() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (guest: GuestInsert) => {
      const { data, error } = await supabase
        .from('guests')
        .insert(guest)
        .select()
        .single()

      if (error) throw error
      return data as Guest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      toast({ title: 'Đã thêm khách hàng mới' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Guest> & { id: string }) => {
      const { data, error } = await supabase
        .from('guests')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Guest
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      queryClient.invalidateQueries({ queryKey: ['guest', data.id] })
      toast({ title: 'Đã cập nhật thông tin khách' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useUpsertGuestFromBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      fullName: string
      phone?: string
      email?: string
      idType?: string
      idNumber?: string
      nationality?: string
      gender?: string
      dateOfBirth?: string
      address?: string
      idImageUrl?: string
    }) => {
      if (!params.phone?.trim()) return null

      // Try to find existing guest
      const { data: existing } = await supabase
        .from('guests')
        .select('id')
        .eq('tenant_id', params.tenantId)
        .eq('phone', params.phone.trim())
        .maybeSingle()

      if (existing) {
        // Update existing guest
        const { data, error } = await supabase
          .from('guests')
          .update({
            full_name: params.fullName,
            email: params.email || null,
            id_type: params.idType || null,
            id_number: params.idNumber || null,
            nationality: params.nationality || null,
            gender: params.gender || null,
            date_of_birth: params.dateOfBirth || null,
            address: params.address || null,
            id_image_url: params.idImageUrl || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) throw error
        return data as Guest
      } else {
        // Create new guest
        const { data, error } = await supabase
          .from('guests')
          .insert({
            tenant_id: params.tenantId,
            full_name: params.fullName,
            phone: params.phone.trim(),
            email: params.email || null,
            id_type: params.idType || null,
            id_number: params.idNumber || null,
            nationality: params.nationality || null,
            gender: params.gender || null,
            date_of_birth: params.dateOfBirth || null,
            address: params.address || null,
            id_image_url: params.idImageUrl || null,
            vip_level: 'normal',
          })
          .select()
          .single()

        if (error) throw error
        return data as Guest
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
    },
  })
}
