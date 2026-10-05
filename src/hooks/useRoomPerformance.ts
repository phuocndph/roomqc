import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export interface RoomPerformance {
  totalRevenue: number
  occupancyRate: number       // 0..1
  adr: number                 // average daily rate
  guestCount: number
  avgStayNights: number
  dailyRevenue: { date: string; revenue: number }[]
  bookingCount: number
  windowDays: number
}

/** Hiệu suất phòng trong N ngày gần nhất (mặc định 30). */
export function useRoomPerformance(roomId: string | undefined, days = 30) {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['room-performance', roomId, tenantId, days],
    enabled: !!roomId && !!tenantId,
    queryFn: async (): Promise<RoomPerformance> => {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceISO = since.toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from('room_bookings')
        .select('id, check_in_date, check_out_date, actual_check_in, actual_check_out, total_amount, room_price, guest_count, status')
        .eq('tenant_id', tenantId!)
        .eq('room_id', roomId!)
        .gte('check_in_date', sinceISO)
        .order('check_in_date', { ascending: true })

      if (error) throw error
      const rows = data || []

      // Initialise daily buckets
      const buckets: Record<string, number> = {}
      for (let i = 0; i < days; i++) {
        const d = new Date()
        d.setDate(d.getDate() - (days - 1 - i))
        buckets[d.toISOString().slice(0, 10)] = 0
      }

      let totalRevenue = 0
      let totalNights = 0
      let guestCount = 0
      let cancelled = 0

      rows.forEach((r: any) => {
        if (r.status === 'cancelled') { cancelled++; return }
        const ci = new Date(r.check_in_date)
        const co = new Date(r.check_out_date)
        const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86_400_000))
        const revenue = Number(r.total_amount ?? r.room_price ?? 0)
        totalRevenue += revenue
        totalNights += nights
        guestCount += r.guest_count || 1

        // distribute revenue evenly across nights inside window
        const perNight = revenue / nights
        for (let i = 0; i < nights; i++) {
          const d = new Date(ci)
          d.setDate(ci.getDate() + i)
          const key = d.toISOString().slice(0, 10)
          if (key in buckets) buckets[key] += perNight
        }
      })

      const validBookings = rows.length - cancelled
      const occupancyRate = Math.min(1, totalNights / days)
      const adr = totalNights > 0 ? totalRevenue / totalNights : 0
      const avgStayNights = validBookings > 0 ? totalNights / validBookings : 0

      return {
        totalRevenue,
        occupancyRate,
        adr,
        guestCount,
        avgStayNights,
        dailyRevenue: Object.entries(buckets).map(([date, revenue]) => ({ date, revenue })),
        bookingCount: validBookings,
        windowDays: days,
      }
    },
    staleTime: 60_000,
  })
}
