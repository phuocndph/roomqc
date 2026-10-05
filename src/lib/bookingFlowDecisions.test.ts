/**
 * Unit tests for the unified Check-in / Check-out decision helpers.
 *
 * Covers the 4 canonical scenarios that the sơ đồ phòng (ReceptionQuickDialog)
 * and the bookings table must agree on:
 *   1. Single booking checkout       → 'summary'
 *   2. Group booking checkout        → 'group'
 *   3. Overdue checkout              → 'extend'
 *   4. Check-in for a pending booking → allowed + suggested surcharge
 *
 * Plus the negative branches that protect data integrity (room occupied,
 * room not ready, before check-in date, maintenance, hourly/monthly).
 */

import { describe, it, expect } from 'vitest'
import {
  decideCheckoutAction,
  decideCheckIn,
} from './bookingFlowDecisions'

// 2026-05-31 10:30 (a Sunday)
const NOW = new Date('2026-05-31T10:30:00')

const baseBooking = {
  id: 'b-1',
  check_out_date: '2026-05-31', // today
  check_in_date: '2026-05-31',
  booking_group_id: null,
  booking_type: 'daily' as const,
  room_price: 1_000_000,
}

describe('decideCheckoutAction', () => {
  it('Case 1 — single booking on schedule → summary', () => {
    const action = decideCheckoutAction({
      booking: { ...baseBooking },
      groupCounts: {},
      now: NOW,
    })
    expect(action).toBe('summary')
  })

  it('Case 2 — booking belongs to a group of >1 → group', () => {
    const action = decideCheckoutAction({
      booking: { ...baseBooking, booking_group_id: 'grp-1' },
      groupCounts: { 'grp-1': 3 },
      now: NOW,
    })
    expect(action).toBe('group')
  })

  it('booking with a group_id but group has only 1 room → summary (not group)', () => {
    const action = decideCheckoutAction({
      booking: { ...baseBooking, booking_group_id: 'grp-solo' },
      groupCounts: { 'grp-solo': 1 },
      now: NOW,
    })
    expect(action).toBe('summary')
  })

  it('Case 3 — today is AFTER scheduled checkout date → extend', () => {
    const action = decideCheckoutAction({
      booking: { ...baseBooking, check_out_date: '2026-05-30' }, // yesterday
      groupCounts: {},
      now: NOW,
    })
    expect(action).toBe('extend')
  })

  it('group + overdue → group takes precedence (matches BookingsPage handler order)', () => {
    const action = decideCheckoutAction({
      booking: {
        ...baseBooking,
        check_out_date: '2026-05-30',
        booking_group_id: 'grp-1',
      },
      groupCounts: { 'grp-1': 2 },
      now: NOW,
    })
    expect(action).toBe('group')
  })

  it('checkout date in the future → summary (early checkout)', () => {
    const action = decideCheckoutAction({
      booking: { ...baseBooking, check_out_date: '2026-06-05' },
      groupCounts: {},
      now: NOW,
    })
    expect(action).toBe('summary')
  })
})

describe('decideCheckIn', () => {
  it('Case 4 — pending booking, room clean, today is check-in date → allowed + surcharge for early hour', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking },
      roomStatus: 'vacant_clean',
      now: NOW, // 10:30 → < 14:00 → daily surcharge applies
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      // 10:30 falls in the 9-14h bracket (30% by default rules)
      expect(decision.suggestedEarlyCharge).toBeGreaterThan(0)
      expect(decision.suggestedEarlyCharge).toBe(Math.round(1_000_000 * 0.3))
    }
  })

  it('check-in at or after 14:00 → no early surcharge', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking },
      roomStatus: 'vacant_clean',
      now: new Date('2026-05-31T15:00:00'),
    })
    expect(decision).toEqual({ allowed: true, suggestedEarlyCharge: 0 })
  })

  it('hourly booking → never charges an early-checkin surcharge', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking, booking_type: 'hourly' },
      roomStatus: 'vacant_clean',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: true, suggestedEarlyCharge: 0 })
  })

  it('monthly booking → never charges an early-checkin surcharge', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking, booking_type: 'monthly' },
      roomStatus: 'vacant_clean',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: true, suggestedEarlyCharge: 0 })
  })

  it('today is BEFORE scheduled check-in date → blocked', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking, check_in_date: '2026-06-02' },
      roomStatus: 'vacant_clean',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: false, reason: 'before_checkin_date' })
  })

  it('room currently occupied → blocked', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking },
      roomStatus: 'occupied',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: false, reason: 'room_occupied' })
  })

  it('room in maintenance → blocked', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking },
      roomStatus: 'maintenance',
      now: NOW,
    })
    expect(decision).toEqual({
      allowed: false,
      reason: 'room_blocked_for_maintenance',
    })
  })

  it('room dirty (needs cleaning) → blocked as not ready', () => {
    const decision = decideCheckIn({
      booking: { ...baseBooking },
      roomStatus: 'vacant_dirty',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: false, reason: 'room_not_ready' })
  })
})
