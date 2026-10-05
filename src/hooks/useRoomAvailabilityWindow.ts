import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, differenceInDays } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'

export interface BookedRange {
  bookingId: string
  checkIn: string // yyyy-MM-dd
  checkOut: string // yyyy-MM-dd (exclusive)
}

interface Params {
  roomId: string | null | undefined
  fromDate: string // yyyy-MM-dd inclusive
  toDate: string // yyyy-MM-dd inclusive (end of window)
  excludeBookingId?: string
  enabled?: boolean
}

/**
 * Tải lịch booking của một phòng trong cửa sổ [fromDate, toDate],
 * trừ chính booking đang dời. Trả về helpers để render strip & validate range.
 */
export function useRoomAvailabilityWindow({
  roomId,
  fromDate,
  toDate,
  excludeBookingId,
  enabled = true,
}: Params) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id
  const queryClient = useQueryClient()

  const queryKey = ['room-availability', tenantId, roomId, fromDate, toDate, excludeBookingId]

  const q = useQuery({
    queryKey,
    enabled: !!tenantId && !!roomId && enabled,
    queryFn: async (): Promise<BookedRange[]> => {
      if (!tenantId || !roomId) return []
      // Overlap: existing.check_in < window.end AND existing.check_out > window.start
      let query = supabase
        .from('room_bookings')
        .select('id, check_in_date, check_out_date')
        .eq('tenant_id', tenantId)
        .eq('room_id', roomId)
        .in('status', ['confirmed', 'checked_in'])
        .lt('check_in_date', toDate)
        .gt('check_out_date', fromDate)
      if (excludeBookingId) query = query.neq('id', excludeBookingId)
      const { data, error } = await query
      if (error) {
        console.error('useRoomAvailabilityWindow error', error)
        return []
      }
      return (data || []).map((b) => ({
        bookingId: b.id,
        checkIn: b.check_in_date,
        checkOut: b.check_out_date,
      }))
    },
    staleTime: 30_000,
  })

  // Realtime: invalidate khi room_bookings của phòng này đổi
  useEffect(() => {
    if (!roomId || !tenantId) return
    const channel = supabase
      .channel(`room-avail-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_bookings', filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ['room-availability', tenantId, roomId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, tenantId, queryClient])

  const bookedRanges = q.data || []

  /** Một ngày (yyyy-MM-dd) bị tính là bận nếu nằm trong [checkIn, checkOut) của bất kỳ booking */
  const isDateBooked = (date: string): boolean => {
    return bookedRanges.some((r) => date >= r.checkIn && date < r.checkOut)
  }

  /** Range [inDate, outDate) free nếu không overlap booking nào */
  const isRangeFree = (inDate: string, outDate: string): boolean => {
    if (!inDate || !outDate || outDate <= inDate) return false
    return !bookedRanges.some((r) => r.checkIn < outDate && r.checkOut > inDate)
  }

  /** Tìm khoảng trống gần nhất (>= fromDate) đủ `nights` đêm. Quét tối đa tới `toDate`. */
  const findNextFreeWindow = (nights: number, startFrom?: string): { in: string; out: string } | null => {
    const start = startFrom || fromDate
    const end = toDate
    let cursor = start
    while (cursor < end) {
      const out = format(addDays(parseISO(cursor), nights), 'yyyy-MM-dd')
      if (out > end) return null
      if (isRangeFree(cursor, out)) return { in: cursor, out }
      cursor = format(addDays(parseISO(cursor), 1), 'yyyy-MM-dd')
    }
    return null
  }

  const totalDays = Math.max(1, differenceInDays(parseISO(toDate), parseISO(fromDate)) + 1)

  return {
    isLoading: q.isLoading,
    bookedRanges,
    isDateBooked,
    isRangeFree,
    findNextFreeWindow,
    totalDays,
  }
}
