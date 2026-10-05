import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export type AlertTone = 'danger' | 'warning' | 'info'
export type AlertSource = 'booking_overdue' | 'low_stock' | 'maintenance_urgent' | 'laundry_late'

export interface OverviewAlert {
  id: string
  tone: AlertTone
  source: AlertSource
  title: string
  description: string
  href: string
}

const PER_SOURCE_CAP = 3
const TOTAL_CAP = 8

/**
 * Gom alert "Cần chú ý" cho trang `/reports` Tổng quan.
 * 4 nguồn song song, mỗi nguồn cap PER_SOURCE_CAP, tổng cap TOTAL_CAP.
 */
export function useOverviewAlerts() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const hotelKey = isAllHotelsMode ? 'all' : hotelId ?? 'none'

  return useQuery({
    queryKey: ['overview-alerts', tenantId, hotelKey],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<OverviewAlert[]> => {
      if (!tenantId) return []
      const nowIso = new Date().toISOString()

      // 1. Booking quá hạn checkout
      let bookingQ = supabase
        .from('room_bookings')
        .select('id, guest_name, check_out_date, room:rooms!room_bookings_room_id_fkey(room_number)')
        .eq('tenant_id', tenantId)
        .eq('status', 'checked_in')
        .lt('check_out_date', nowIso)
        .order('check_out_date', { ascending: true })
        .limit(PER_SOURCE_CAP)
      if (hotelId) bookingQ = bookingQ.eq('hotel_id', hotelId)

      // 2. Kho dưới min — reuse RPC
      const lowStockP = supabase.rpc('get_low_stock_items', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_limit: PER_SOURCE_CAP,
      })

      // 3. Maintenance urgent đang mở
      let maintQ = supabase
        .from('maintenance_requests')
        .select('id, request_code, title, location, priority, status')
        .eq('tenant_id', tenantId)
        .eq('priority', 'urgent')
        .in('status', ['waiting', 'pending', 'in_progress'])
        .order('reported_at', { ascending: true })
        .limit(PER_SOURCE_CAP)
      if (hotelId) maintQ = maintQ.eq('hotel_id', hotelId)

      // 4. Laundry batch trễ hẹn
      let laundryQ = supabase
        .from('laundry_batches')
        .select('id, batch_code, expected_return_date, status, total_items')
        .eq('tenant_id', tenantId)
        .lt('expected_return_date', nowIso)
        .not('status', 'in', '(stocked,received)')
        .order('expected_return_date', { ascending: true })
        .limit(PER_SOURCE_CAP)
      if (hotelId) laundryQ = laundryQ.eq('hotel_id', hotelId)

      const [bookingR, lowStockR, maintR, laundryR] = await Promise.all([
        bookingQ,
        lowStockP,
        maintQ,
        laundryQ,
      ])

      const alerts: OverviewAlert[] = []

      for (const b of bookingR.data ?? []) {
        const room = (b as any).room?.room_number ?? '—'
        alerts.push({
          id: `booking-${b.id}`,
          tone: 'danger',
          source: 'booking_overdue',
          title: `Phòng ${room} đã quá hạn trả`,
          description: `${b.guest_name ?? 'Khách'} • ${b.id.slice(0, 8)}`,
          href: `/bookings/${b.id}`,
        })
      }

      for (const it of (lowStockR.data ?? []) as any[]) {
        alerts.push({
          id: `low-${it.item_id ?? it.id}`,
          tone: 'warning',
          source: 'low_stock',
          title: `${it.item_name ?? 'Vật tư'} sắp hết`,
          description: `Còn ${it.quantity_in_stock ?? 0} / tối thiểu ${it.reorder_point ?? '?'}`,
          href: '/inventory',
        })
      }

      for (const m of maintR.data ?? []) {
        alerts.push({
          id: `maint-${m.id}`,
          tone: 'danger',
          source: 'maintenance_urgent',
          title: `Bảo trì khẩn: ${m.title}`,
          description: `${m.location} • mã ${m.request_code}`,
          href: `/maintenance/requests/${m.id}`,
        })
      }

      for (const l of laundryR.data ?? []) {
        const expected = l.expected_return_date ? new Date(l.expected_return_date).toLocaleDateString('vi-VN') : '—'
        alerts.push({
          id: `laundry-${l.id}`,
          tone: 'warning',
          source: 'laundry_late',
          title: `Lô giặt ${l.batch_code} trễ hẹn`,
          description: `${l.total_items ?? 0} món • hẹn trả ${expected}`,
          href: `/laundry/batches/${l.id}`,
        })
      }

      // Sắp xếp danger trước, cap tổng
      alerts.sort((a, b) => (a.tone === 'danger' ? -1 : 1) - (b.tone === 'danger' ? -1 : 1))
      return alerts.slice(0, TOTAL_CAP)
    },
  })
}
