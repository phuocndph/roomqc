import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useHotelContext } from '@/contexts/HotelContext'
import { useTenant } from '@/hooks/useTenant'

export interface AvailableRoom {
  id: string
  room_number: string
  floor: number
  room_type: string
  status: string
  hotel_id: string
  hotel_name?: string
  // Legacy (kept for backward compat, not used to price bookings anymore)
  base_price?: number
  hourly_price?: number | null
  monthly_price?: number | null
  min_hours?: number | null
  max_hours?: number | null
  currentStatus: string

  // New unified pricing from room_type_rates
  room_type_id: string | null
  rate_daily: number | null
  rate_hourly: number | null
  rate_hourly_first_block_hours: number | null
  rate_hourly_first_block_price: number | null
  rate_monthly: number | null
  pricing_configured: boolean
}

const normalizeRoomTypeKey = (s: string | null | undefined) =>
  (s ?? '').toString().toLowerCase().replace(/^phòng\s+/i, '').trim()

export function useAvailableRooms(checkInDate?: Date, checkOutDate?: Date) {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { tenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = tenant?.id
  const hotelId = selectedHotel?.id

  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`available-rooms-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['available-rooms'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_bookings', filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['available-rooms'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_type_rates', filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['available-rooms'] }) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenantId, queryClient])

  return useQuery({
    queryKey: ['available-rooms', tenantId, hotelId, checkInDate?.toISOString(), checkOutDate?.toISOString()],
    queryFn: async (): Promise<AvailableRoom[]> => {
      if (!tenantId) return []

      let query = supabase
        .from('rooms')
        .select(`
          id, room_number, floor, room_type, status, hotel_id,
          base_price, hourly_price, monthly_price, min_hours, max_hours,
          hotels(name)
        `)
        .eq('tenant_id', tenantId)
        .neq('status', 'out_of_order')
        .order('floor', { ascending: true })
        .order('room_number', { ascending: true })

      if (!isAllHotelsMode && hotelId) query = query.eq('hotel_id', hotelId)

      const { data: rooms, error } = await query
      if (error) { console.error('Error fetching available rooms:', error); return [] }
      if (!rooms || rooms.length === 0) return []

      // Load room_types + room_type_rates for this tenant (and hotel scope when relevant)
      const [rtRes, rateRes] = await Promise.all([
        supabase
          .from('room_types')
          .select('id, code, name, hotel_id')
          .eq('tenant_id', tenantId),
        supabase
          .from('room_type_rates' as any)
          .select('room_type_id, daily_rate, hourly_rate, hourly_first_block_hours, hourly_first_block_price, monthly_rate')
          .eq('tenant_id', tenantId),
      ])
      const roomTypes = ((rtRes.data ?? []) as unknown) as Array<{ id: string; code: string | null; name: string | null; hotel_id: string | null }>
      const rates = ((rateRes.data ?? []) as unknown) as Array<{
        room_type_id: string; daily_rate: number | null; hourly_rate: number | null;
        hourly_first_block_hours: number | null; hourly_first_block_price: number | null; monthly_rate: number | null;
      }>
      const rateByRtId = new Map(rates.map(r => [r.room_type_id, r]))

      // Build lookup: (hotelId, normalizedKey) -> room_type. Fallback to tenant-wide if hotel-scoped not found.
      const byHotelKey = new Map<string, typeof roomTypes[number]>()
      const byKey = new Map<string, typeof roomTypes[number]>()
      for (const rt of roomTypes) {
        const keys = [normalizeRoomTypeKey(rt.code), normalizeRoomTypeKey(rt.name)].filter(Boolean)
        for (const k of keys) {
          if (rt.hotel_id) byHotelKey.set(`${rt.hotel_id}|${k}`, rt)
          if (!byKey.has(k)) byKey.set(k, rt)
        }
      }

      const resolveRate = (room: { hotel_id: string; room_type: string }) => {
        const k = normalizeRoomTypeKey(room.room_type)
        const rt = byHotelKey.get(`${room.hotel_id}|${k}`) ?? byKey.get(k) ?? null
        const rate = rt ? rateByRtId.get(rt.id) ?? null : null
        return { rt, rate }
      }

      let filteredRooms = rooms
      if (checkInDate && checkOutDate) {
        const roomIds = rooms.map(r => r.id)
        const checkIn = checkInDate.toISOString().split('T')[0]
        const checkOut = checkOutDate.toISOString().split('T')[0]
        const { data: conflictingBookings } = await supabase
          .from('room_bookings')
          .select('room_id')
          .in('room_id', roomIds)
          .in('status', ['confirmed', 'checked_in'])
          .lt('check_in_date', checkOut)
          .gt('check_out_date', checkIn)
        const bookedRoomIds = new Set(conflictingBookings?.map(b => b.room_id) || [])
        filteredRooms = rooms.filter(r => !bookedRoomIds.has(r.id))
      }

      return filteredRooms.map(room => {
        const { rt, rate } = resolveRate(room as any)
        return {
          ...room,
          hotel_name: (room.hotels as any)?.name,
          base_price: room.base_price ?? 0,
          hourly_price: room.hourly_price ?? null,
          monthly_price: room.monthly_price ?? null,
          min_hours: room.min_hours ?? null,
          max_hours: room.max_hours ?? null,
          currentStatus: room.status,
          room_type_id: rt?.id ?? null,
          rate_daily: rate?.daily_rate != null ? Number(rate.daily_rate) : null,
          rate_hourly: rate?.hourly_rate != null ? Number(rate.hourly_rate) : null,
          rate_hourly_first_block_hours: rate?.hourly_first_block_hours != null ? Number(rate.hourly_first_block_hours) : null,
          rate_hourly_first_block_price: rate?.hourly_first_block_price != null ? Number(rate.hourly_first_block_price) : null,
          rate_monthly: rate?.monthly_rate != null ? Number(rate.monthly_rate) : null,
          pricing_configured: !!rate,
        } as AvailableRoom
      })
    },
    enabled: !!tenantId,
  })
}
