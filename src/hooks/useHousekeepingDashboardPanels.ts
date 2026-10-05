import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

/* -------------------- Check-out hôm nay -------------------- */
export interface CheckoutTodayItem {
  bookingId: string
  roomId: string
  roomNumber: string
  roomType: string | null
  guestName: string | null
  expectedTime: string | null // HH:MM
  status: 'cleaned' | 'cleaning' | 'dirty' | 'occupied'
}

export function useCheckoutToday(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const query = useQuery<CheckoutTodayItem[]>({
    queryKey: ['hk-checkout-today', tenantId, hotelId, today],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_bookings')
        .select('id, guest_name, expected_check_out_time, status, room:rooms(id, room_number, room_type, status)')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('check_out_date', today)
        .in('status', ['checked_in', 'checked_out'])
        .order('expected_check_out_time', { ascending: true, nullsFirst: false })

      if (error) throw error
      return (data || []).map((b: any) => {
        const rs: string = b.room?.status || ''
        let status: CheckoutTodayItem['status'] = 'dirty'
        if (rs === 'vacant_clean' || rs === 'vacant_inspected') status = 'cleaned'
        else if (rs === 'cleaning') status = 'cleaning'
        else if (rs === 'vacant_dirty' || rs === 'check_out' || rs === 'occupied_dirty') status = 'dirty'
        else if (rs.startsWith('occupied') || rs === 'dnd') status = 'occupied'
        return {
          bookingId: b.id,
          roomId: b.room?.id,
          roomNumber: b.room?.room_number || '—',
          roomType: b.room?.room_type || null,
          guestName: b.guest_name,
          expectedTime: (b.expected_check_out_time || '').slice(0, 5) || null,
          status,
        }
      })
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const ch = supabase
      .channel(`hk-checkout-${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_bookings', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-checkout-today', tenantId, hotelId] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-checkout-today', tenantId, hotelId] }),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, hotelId, qc])

  return query
}

/* -------------------- Tiến độ dọn phòng -------------------- */
export interface CleaningProgress {
  total: number
  completed: number
  inProgress: number
  pending: number
}

export function useCleaningProgressToday(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const query = useQuery<CleaningProgress>({
    queryKey: ['hk-cleaning-progress', tenantId, hotelId, today],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const startIso = `${today}T00:00:00`
      const endIso = `${today}T23:59:59.999`
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('id, status, completed_at, created_at')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('task_type', 'cleaning')
        .or(`and(created_at.gte.${startIso},created_at.lte.${endIso}),and(completed_at.gte.${startIso},completed_at.lte.${endIso}),status.in.(pending,in_progress,assigned,todo)`)

      if (error) throw error
      let completed = 0, inProgress = 0, pending = 0
      for (const t of data || []) {
        const s = (t as any).status
        if (s === 'completed' || s === 'approved') completed++
        else if (s === 'in_progress') inProgress++
        else if (s === 'pending' || s === 'todo' || s === 'assigned' || s === 'rejected') pending++
      }
      return { total: completed + inProgress + pending, completed, inProgress, pending }
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const ch = supabase
      .channel(`hk-cleaning-${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-cleaning-progress', tenantId, hotelId] }),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, hotelId, qc])

  return query
}

/* -------------------- Hiệu suất nhân viên -------------------- */
export interface StaffPerf {
  userId: string
  fullName: string
  avatarUrl: string | null
  completed: number
  total: number
}

export function useStaffPerformanceToday(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const query = useQuery<StaffPerf[]>({
    queryKey: ['hk-staff-perf', tenantId, hotelId, today],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const startIso = `${today}T00:00:00`
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('id, status, assigned_to, completed_at, created_at, assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name, avatar_url)')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .not('assigned_to', 'is', null)
        .or(`created_at.gte.${startIso},completed_at.gte.${startIso}`)

      if (error) throw error
      const map = new Map<string, StaffPerf>()
      for (const t of (data || []) as any[]) {
        const u = t.assigned_user
        if (!u?.id) continue
        const cur = map.get(u.id) || { userId: u.id, fullName: u.full_name || 'Nhân viên', avatarUrl: u.avatar_url, completed: 0, total: 0 }
        cur.total++
        if (t.status === 'completed' || t.status === 'approved') cur.completed++
        map.set(u.id, cur)
      }
      return Array.from(map.values()).sort((a, b) => (b.completed / Math.max(b.total, 1)) - (a.completed / Math.max(a.total, 1))).slice(0, 6)
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const ch = supabase
      .channel(`hk-staff-perf-${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-staff-perf', tenantId, hotelId] }),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, hotelId, qc])

  return query
}
