import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

export interface HousekeepingKpi {
  totalRooms: number
  occupied: number          // Đang có khách
  vacantClean: number       // Trống - sạch
  cleaning: number          // Đang dọn
  vacantDirty: number       // Bẩn - chờ dọn
  maintenance: number       // Bảo trì / OOO / OOS
  reserved: number          // Đã đặt trước
  checkoutToday: number
  missingItems: number
}

const OCCUPIED_SET = new Set(['occupied', 'occupied_clean', 'occupied_dirty', 'dnd', 'sleep_out', 'service_refused'])
const VACANT_CLEAN_SET = new Set(['vacant_clean', 'vacant_inspected', 'vacant'])
const CLEANING_SET = new Set(['cleaning'])
const VACANT_DIRTY_SET = new Set(['vacant_dirty', 'check_out', 'occupied_dirty'])
const MAINT_SET = new Set(['out_of_order', 'out_of_service', 'maintenance'])
const RESERVED_SET = new Set(['reserved'])

export function useHousekeepingKpi(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()

  const query = useQuery<HousekeepingKpi>({
    queryKey: ['hk-kpi', tenantId, hotelId],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)

      const [roomsRes, checkoutRes, reservedBookingRes] = await Promise.all([
        supabase.rpc('get_rooms_filtered', {
          p_tenant_id: tenantId!,
          p_hotel_id: hotelId!,
          p_floor: null,
          p_room_type: null,
          p_status: null,
          p_search: null,
          p_missing_items_only: false,
        }),
        supabase
          .from('room_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
          .eq('hotel_id', hotelId!)
          .eq('status', 'checked_in')
          .eq('check_out_date', today),
        supabase
          .from('room_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
          .eq('hotel_id', hotelId!)
          .in('status', ['confirmed', 'pending'])
          .lte('check_in_date', today)
          .gte('check_out_date', today),
      ])

      if (roomsRes.error) throw roomsRes.error

      const rooms = (roomsRes.data || []) as Array<{ id: string; status: string; missing_items: number | null }>

      let occupied = 0, vacantClean = 0, cleaning = 0, vacantDirty = 0, maintenance = 0, reservedRoom = 0, missingItems = 0
      for (const r of rooms) {
        const s = r.status
        const isOccupied = OCCUPIED_SET.has(s)
        if (isOccupied) occupied++
        else if (VACANT_CLEAN_SET.has(s)) vacantClean++
        if (CLEANING_SET.has(s)) cleaning++
        if (VACANT_DIRTY_SET.has(s)) vacantDirty++
        if (MAINT_SET.has(s)) maintenance++
        if (RESERVED_SET.has(s)) reservedRoom++
        if (!isOccupied && (r.missing_items || 0) > 0) missingItems++
      }

      // Reserved = max(room status reserved, active reserved bookings today)
      const reserved = Math.max(reservedRoom, reservedBookingRes.count || 0)

      return {
        totalRooms: rooms.length,
        occupied,
        vacantClean,
        cleaning,
        vacantDirty,
        maintenance,
        reserved,
        checkoutToday: checkoutRes.count || 0,
        missingItems,
      }
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const channel = supabase
      .channel(`hk-kpi-${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-kpi', tenantId, hotelId] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_bookings', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-kpi', tenantId, hotelId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, hotelId, qc])

  return query
}
