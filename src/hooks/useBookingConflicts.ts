import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'

export interface ConflictingBooking {
  id: string
  guest_name: string
  guest_phone: string | null
  check_in_date: string
  deposit_amount: number | null
}

export interface BookingConflict {
  currentBooking: {
    id: string
    guest_name: string
    room_id: string
    room_number: string
    check_out_date: string
    nights_overdue: number
  }
  nextBooking: {
    id: string
    guest_name: string
    guest_phone: string | null
    check_in_date: string
    days_waiting: number
    deposit_amount: number | null
  }
  urgency: 'critical' | 'high' | 'medium'
}

export function useBookingConflicts() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['booking-conflicts', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async (): Promise<BookingConflict[]> => {
      const today = format(new Date(), 'yyyy-MM-dd')
      
      // Build base query for overdue checked-in bookings
      let overdueQuery = supabase
        .from('room_bookings')
        .select(`
          id, guest_name, room_id, check_out_date,
          room:rooms(room_number)
        `)
        .eq('status', 'checked_in')
        .lt('check_out_date', today)
        
      if (tenantId) {
        overdueQuery = overdueQuery.eq('tenant_id', tenantId)
      }
      
      if (!isAllHotelsMode && selectedHotel?.id) {
        overdueQuery = overdueQuery.eq('hotel_id', selectedHotel.id)
      }
      
      const { data: overdueBookings, error: overdueError } = await overdueQuery
      
      if (overdueError) {
        console.error('Error fetching overdue bookings:', overdueError)
        return []
      }
      
      // For each overdue booking, check if there's a conflicting confirmed booking
      const conflicts: BookingConflict[] = []
      
      for (const current of overdueBookings || []) {
        const { data: nextBookings } = await supabase
          .from('room_bookings')
          .select('id, guest_name, guest_phone, check_in_date, deposit_amount')
          .eq('room_id', current.room_id)
          .neq('id', current.id)
          .eq('status', 'confirmed')
          .lte('check_in_date', today)
          .order('check_in_date')
          .limit(1)
          
        if (nextBookings && nextBookings.length > 0) {
          const next = nextBookings[0]
          const nightsOverdue = differenceInCalendarDays(
            new Date(), 
            parseISO(current.check_out_date)
          )
          const daysWaiting = differenceInCalendarDays(
            new Date(),
            parseISO(next.check_in_date)
          )
          
          // Determine urgency based on how long the next guest has been waiting
          let urgency: 'critical' | 'high' | 'medium' = 'medium'
          if (daysWaiting > 1) {
            urgency = 'critical'
          } else if (daysWaiting > 0) {
            urgency = 'high'
          }
          
          conflicts.push({
            currentBooking: {
              id: current.id,
              guest_name: current.guest_name,
              room_id: current.room_id,
              room_number: (current.room as any)?.room_number || 'N/A',
              check_out_date: current.check_out_date,
              nights_overdue: nightsOverdue,
            },
            nextBooking: {
              id: next.id,
              guest_name: next.guest_name,
              guest_phone: next.guest_phone,
              check_in_date: next.check_in_date,
              days_waiting: daysWaiting,
              deposit_amount: next.deposit_amount,
            },
            urgency,
          })
        }
      }
      
      // Sort by urgency (critical first) and days waiting
      return conflicts.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2 }
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
        }
        return b.nextBooking.days_waiting - a.nextBooking.days_waiting
      })
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

// Hook to check conflict for a specific booking (used in ExtendBookingDialog)
export function useBookingConflictCheck(roomId: string | undefined, bookingId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['booking-conflict-check', roomId, bookingId],
    queryFn: async (): Promise<ConflictingBooking | null> => {
      if (!roomId || !bookingId) return null
      
      const today = format(new Date(), 'yyyy-MM-dd')
      
      const { data, error } = await supabase
        .from('room_bookings')
        .select('id, guest_name, guest_phone, check_in_date, deposit_amount')
        .eq('room_id', roomId)
        .neq('id', bookingId)
        .eq('status', 'confirmed')
        .lte('check_in_date', today)
        .order('check_in_date')
        .limit(1)
        
      if (error) {
        console.error('Error checking booking conflict:', error)
        return null
      }
      
      return data && data.length > 0 ? data[0] : null
    },
    enabled: enabled && !!roomId && !!bookingId,
    staleTime: 10 * 1000,
  })
}
