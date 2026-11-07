import { describe, expect, it } from 'vitest'
import type { FloorPlanRoom } from '@/hooks/useFloorPlanLive'
import { getOperationalLabel, getOperationalStatus, hasRoomGuest, isRoomReady, matchesOperationalFilter } from './operations'

const room = (status: string, booked = false): FloorPlanRoom => ({
  id: 'room-1', room_number: '101', room_type: 'Deluxe', status,
  current_booking: booked ? { id: 'booking-1', guest_name: 'Khách demo', guest_count: 2, status: 'checked_in', check_in_date: '2026-10-16' } : null,
  next_booking: null,
})

describe('dashboard room status semantics', () => {
  it('only counts known clean vacant rooms as ready to receive guests', () => {
    for (const status of ['vacant', 'vacant_clean', 'vacant_inspected']) expect(isRoomReady(room(status))).toBe(true)
    for (const status of ['vacant_dirty', 'cleaning', 'maintenance', 'out_of_order', 'dnd', 'unknown']) expect(isRoomReady(room(status))).toBe(false)
    expect(isRoomReady(room('vacant_clean', true))).toBe(false)
  })

  it('keeps occupied dirty rooms in both cleaning and occupancy filters', () => {
    const dirtyOccupied = room('occupied_dirty', true)
    expect(matchesOperationalFilter(dirtyOccupied, 'dirty')).toBe(true)
    expect(matchesOperationalFilter(dirtyOccupied, 'occupied')).toBe(true)
    expect(getOperationalStatus(dirtyOccupied)).toBe('dirty')
  })

  it('counts DND, refused service, sleep-out and skipper as occupied, never ready', () => {
    for (const status of ['dnd', 'service_refused', 'sleep_out', 'skipper']) {
      expect(hasRoomGuest(room(status))).toBe(true)
      expect(isRoomReady(room(status))).toBe(false)
    }
  })

  it('handles legacy aliases and unfamiliar states without offering an empty clean room', () => {
    expect(getOperationalStatus(room('cleaning'))).toBe('dirty')
    expect(getOperationalStatus(room('maintenance'))).toBe('blocked')
    expect(getOperationalStatus(room('unknown'))).toBe('blocked')
    expect(getOperationalLabel(room('unknown'))).toBe('Chưa rõ tình trạng')
    expect(getOperationalLabel(room('vacant_clean', true))).toBe('Đang có khách')
  })
})
