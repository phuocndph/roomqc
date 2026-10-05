import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

export interface GroupBookingRoom {
  id: string
  room_id: string
  guest_name: string
  guest_phone: string | null
  check_in_date: string
  check_out_date: string
  actual_check_in: string | null
  actual_check_out: string | null
  status: string
  total_amount: number
  amount_paid: number
  payment_status: string | null
  booking_type: 'daily' | 'hourly' | 'monthly'
  deposit_amount: number
  early_checkin_charge: number
  late_checkout_charge: number
  service_charges: number
  room_price: number
  hourly_rate: number | null
  monthly_rate: number | null
  booking_hours: number | null
  booking_months: number | null
  notes: string | null
  room: {
    room_number: string
    room_type: string
  } | null
}

export interface GroupBookingData {
  bookings: GroupBookingRoom[]
  totalAmount: number
  totalPaid: number
  remainingAmount: number
  roomCount: number
  guestName: string
  allCheckedOut: boolean
  someCheckedIn: boolean
  allPaid: boolean
  bookingGroupId: string
  // NEW fields for checkout
  totalDeposit: number
  roomsCheckedOut: number
  roomsRemaining: number
  roomsCheckedIn: number
}

/**
 * Hook to fetch all bookings in a group with aggregated totals
 */
export function useGroupBooking(bookingGroupId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['group-booking', bookingGroupId],
    queryFn: async (): Promise<GroupBookingData | null> => {
      if (!bookingGroupId) return null

      const { data, error } = await supabase
        .from('room_bookings')
        .select(`
          id,
          room_id,
          guest_name,
          guest_phone,
          check_in_date,
          check_out_date,
          actual_check_in,
          actual_check_out,
          status,
          total_amount,
          amount_paid,
          payment_status,
          booking_type,
          deposit_amount,
          early_checkin_charge,
          late_checkout_charge,
          service_charges,
          room_price,
          hourly_rate,
          monthly_rate,
          booking_hours,
          booking_months,
          notes,
          room:rooms(room_number, room_type)
        `)
        .eq('booking_group_id', bookingGroupId)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!data || data.length === 0) return null

      // Calculate totals
      const totalAmount = data.reduce((sum, b) => sum + (b.total_amount || 0), 0)
      // Deposits are stored separately from amount_paid but are already cash
      // received, so group balances must include both fields.
      const totalPaid = data.reduce(
        (sum, b) => sum + (b.amount_paid || 0) + (b.deposit_amount || 0),
        0,
      )
      const remainingAmount = Math.max(0, totalAmount - totalPaid)
      const totalDeposit = data.reduce((sum, b) => sum + (b.deposit_amount || 0), 0)
      
      const roomsCheckedOut = data.filter(b => b.status === 'checked_out').length
      const roomsCheckedIn = data.filter(b => b.status === 'checked_in').length
      const roomsRemaining = data.length - roomsCheckedOut

      return {
        bookings: data as GroupBookingRoom[],
        totalAmount,
        totalPaid,
        remainingAmount,
        roomCount: data.length,
        guestName: data[0]?.guest_name || '',
        allCheckedOut: data.every(b => b.status === 'checked_out'),
        someCheckedIn: data.some(b => b.status === 'checked_in'),
        allPaid: remainingAmount <= 0,
        bookingGroupId,
        totalDeposit,
        roomsCheckedOut,
        roomsRemaining,
        roomsCheckedIn,
      }
    },
    enabled: !!bookingGroupId,
    staleTime: 30 * 1000, // 30 seconds
  })

  // Realtime subscription for group booking updates
  useEffect(() => {
    if (!bookingGroupId) return

    const channel = supabase
      .channel(`group-booking-${bookingGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_bookings',
          filter: `booking_group_id=eq.${bookingGroupId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['group-booking', bookingGroupId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [bookingGroupId, queryClient])

  return query
}

/**
 * Hook to get group room count for displaying badge
 * Uses efficient query with count aggregation
 */
export function useGroupBookingCounts(bookingGroupIds: (string | null)[]) {
  const validIds = bookingGroupIds.filter((id): id is string => !!id)

  return useQuery({
    queryKey: ['group-booking-counts', validIds.sort().join(',')],
    queryFn: async (): Promise<Record<string, number>> => {
      if (validIds.length === 0) return {}

      // Get counts for each group
      const { data, error } = await supabase
        .from('room_bookings')
        .select('booking_group_id')
        .in('booking_group_id', validIds)

      if (error) throw error

      // Count occurrences
      const counts: Record<string, number> = {}
      data?.forEach(row => {
        const groupId = row.booking_group_id as string
        counts[groupId] = (counts[groupId] || 0) + 1
      })

      return counts
    },
    enabled: validIds.length > 0,
    staleTime: 60 * 1000, // 1 minute
  })
}
