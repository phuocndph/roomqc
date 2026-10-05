import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export type StayRegistrationStatus =
  | 'pending' | 'submitting' | 'submitted' | 'acked' | 'failed' | 'manual'

export interface StayRegistration {
  id: string
  tenant_id: string
  hotel_id: string
  booking_id: string | null
  guest_id: string
  room_number: string
  check_in_at: string
  check_out_at: string | null
  purpose: string | null
  status: StayRegistrationStatus
  external_ref: string | null
  attempt_count: number
  last_error: string | null
  submitted_at: string | null
  acked_at: string | null
  created_at: string
  updated_at: string
  guests?: { full_name: string; id_number: string | null; nationality: string | null } | null
}

export const useStayRegistrations = (params: {
  hotelId?: string | null
  status?: StayRegistrationStatus | 'all'
}) => {
  const { tenantId } = useUser()
  return useQuery({
    queryKey: ['stay-registrations', tenantId, params.hotelId ?? 'all', params.status ?? 'all'],
    queryFn: async () => {
      if (!tenantId) return []
      let q = supabase
        .from('guest_stay_registrations' as any)
        .select('*, guests(full_name, id_number, nationality)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (params.hotelId) q = q.eq('hotel_id', params.hotelId)
      if (params.status && params.status !== 'all') q = q.eq('status', params.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as StayRegistration[]
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  })
}

export const useRetryStayRegistration = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('retry_stay_registration' as any, { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stay-registrations'] })
      toast.success('Đã đưa vào hàng đợi gửi lại')
    },
    onError: (e: any) => toast.error(e.message || 'Thao tác thất bại'),
  })
}

export const useEnqueueStayRegistration = () => {
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc('enqueue_stay_registration' as any, {
        p_booking_id: bookingId,
      })
      if (error) throw error
      return data as number
    },
  })
}
