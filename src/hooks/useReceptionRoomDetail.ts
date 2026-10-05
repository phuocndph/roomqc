import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { addDays, format } from 'date-fns'

export interface ReceptionRoomDetail {
  room: {
    id: string
    room_number: string
    room_type: string
    floor: number | null
    bed_type: string | null
    view_type: string | null
    max_guests: number | null
    area_sqm: number | null
    has_balcony: boolean | null
    smoking_allowed: boolean | null
    amenities: string[] | null
    base_price: number | null
    hourly_price: number | null
    monthly_price: number | null
  } | null
  guest: {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    id_type: string | null
    id_number: string | null
    nationality: string | null
    vip_level: string
    total_stays: number
    total_spent: number
    last_stay_date: string | null
    id_image_url: string | null
  } | null
  serviceCharges: Array<{ id: string; service_name: string; quantity: number; unit_price: number; total_price: number }>
  minibar: Array<{ id: string; item_name: string; quantity: number; unit_price: number; total_amount: number | null }>
  openHkTasks: Array<{ id: string; title: string | null; task_type: string; priority: string; status: string; assigned_to: string | null }>
  openMaintenance: Array<{ id: string; title: string; priority: string; status: string; issue_type: string }>
  lastHkTask: { id: string; completed_at: string | null; updated_at: string; assigned_to: string | null } | null
  upcomingBookings: Array<{ id: string; guest_name: string; check_in_date: string; check_out_date: string; status: string }>
  recentStays: Array<{ id: string; check_in_date: string; check_out_date: string; total_amount: number | null }>
}

export function useReceptionRoomDetail(roomId: string | undefined, bookingId: string | undefined | null, enabled = true) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery<ReceptionRoomDetail>({
    queryKey: ['reception-room-detail', roomId, bookingId, tenantId],
    enabled: !!roomId && !!tenantId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!roomId || !tenantId) throw new Error('missing')

      const today = format(new Date(), 'yyyy-MM-dd')
      const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd')

      const [
        roomRes,
        bookingRes,
        scRes,
        ccRes,
        hkOpenRes,
        hkLastRes,
        mtRes,
        upcomingRes,
      ] = await Promise.all([
        supabase.from('rooms')
          .select('id, room_number, room_type, floor, bed_type, view_type, max_guests, area_sqm, has_balcony, smoking_allowed, amenities, base_price, hourly_price, monthly_price')
          .eq('id', roomId).eq('tenant_id', tenantId).maybeSingle(),
        bookingId
          ? supabase.from('room_bookings')
              .select('guest_id, guest_name, guest_phone, guest_email, guest_id_type, guest_id_number, guest_nationality')
              .eq('id', bookingId).eq('tenant_id', tenantId).maybeSingle()
          : Promise.resolve({ data: null, error: null }) as any,
        bookingId
          ? supabase.from('booking_service_charges')
              .select('id, service_name, quantity, unit_price, total_price')
              .eq('booking_id', bookingId).eq('tenant_id', tenantId)
          : Promise.resolve({ data: [], error: null }) as any,
        bookingId
          ? supabase.from('chargeable_consumptions')
              .select('id, item_name, quantity, unit_price, total_amount')
              .eq('booking_id', bookingId).eq('tenant_id', tenantId)
          : Promise.resolve({ data: [], error: null }) as any,
        supabase.from('housekeeping_tasks')
          .select('id, title, task_type, priority, status, assigned_to')
          .eq('room_id', roomId).eq('tenant_id', tenantId)
          .in('status', ['pending', 'in_progress', 'paused'])
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('housekeeping_tasks')
          .select('id, completed_at, updated_at, assigned_to')
          .eq('room_id', roomId).eq('tenant_id', tenantId)
          .eq('status', 'completed')
          .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('maintenance_requests')
          .select('id, title, priority, status, issue_type')
          .eq('room_id', roomId).eq('tenant_id', tenantId)
          .in('status', ['pending', 'waiting', 'in_progress'])
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('room_bookings')
          .select('id, guest_name, check_in_date, check_out_date, status')
          .eq('room_id', roomId).eq('tenant_id', tenantId)
          .gte('check_in_date', today).lte('check_in_date', in7)
          .not('status', 'in', '(cancelled,checked_out)')
          .order('check_in_date', { ascending: true }).limit(7),
      ])

      let guest: ReceptionRoomDetail['guest'] = null
      const bk: any = bookingRes?.data
      if (bk?.guest_id) {
        const { data: g } = await supabase
          .from('guests')
          .select('id, full_name, phone, email, id_type, id_number, nationality, vip_level, total_stays, total_spent, last_stay_date, id_image_url')
          .eq('id', bk.guest_id).eq('tenant_id', tenantId).maybeSingle()
        if (g) guest = g as any
      }
      // Fallback: lấy từ booking nếu không có guest record
      if (!guest && bk) {
        guest = {
          id: '',
          full_name: bk.guest_name,
          phone: bk.guest_phone,
          email: bk.guest_email,
          id_type: bk.guest_id_type,
          id_number: bk.guest_id_number,
          nationality: bk.guest_nationality,
          vip_level: 'normal',
          total_stays: 0,
          total_spent: 0,
          last_stay_date: null,
          id_image_url: null,
        }
      }

      let recentStays: ReceptionRoomDetail['recentStays'] = []
      if (bk?.guest_phone) {
        const { data: rs } = await supabase
          .from('room_bookings')
          .select('id, check_in_date, check_out_date, total_amount')
          .eq('tenant_id', tenantId)
          .eq('guest_phone', bk.guest_phone)
          .eq('status', 'checked_out')
          .order('check_out_date', { ascending: false })
          .limit(3)
        recentStays = (rs || []) as any
      }

      return {
        room: (roomRes.data as any) ?? null,
        guest,
        serviceCharges: (scRes.data as any) || [],
        minibar: (ccRes.data as any) || [],
        openHkTasks: (hkOpenRes.data as any) || [],
        openMaintenance: (mtRes.data as any) || [],
        lastHkTask: (hkLastRes?.data as any) ?? null,
        upcomingBookings: (upcomingRes.data as any) || [],
        recentStays,
      }
    },
  })
}
