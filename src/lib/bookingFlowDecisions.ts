/**
 * Pure decision helpers for the unified Check-in / Check-out flow.
 *
 * These functions encode the SAME branching rules used by
 * `BookingsPage.handleCheckInClick` and `BookingsPage.handleCheckOutClick`,
 * extracted so they can be unit-tested and reused by any deep-link / dialog
 * trigger (e.g. ReceptionQuickDialog on `/rooms?view=map`).
 *
 * Keep these pure — no React, no Supabase, no toasts.
 */

import { startOfDay, isBefore, isAfter, format } from 'date-fns'
import { calculateEarlyCheckinCharge } from './bookingCalculations'
import {
  canRoomCheckIn,
  isRoomOccupied,
  isRoomBlockedForMaintenance,
} from './roomStatus'

// ---------- Check-out ----------

export type CheckoutAction =
  /** Booking is part of a multi-room group → open GroupCheckoutDialog */
  | 'group'
  /** today > scheduled check_out_date → propose extend (or check out as overdue) */
  | 'extend'
  /** Normal path → compute cost + open CheckoutSummaryDialog */
  | 'summary'

export interface DecideCheckoutInput {
  booking: {
    id: string
    check_out_date: string
    booking_group_id?: string | null
  }
  /** Map of `booking_group_id` → number of bookings in that group */
  groupCounts?: Record<string, number> | null | undefined
  /** Inject "now" to keep tests deterministic */
  now?: Date
  /** False while group-counts query is still loading; defaults to true for backwards compat */
  isGroupCountsReady?: boolean
}

export function decideCheckoutAction(input: DecideCheckoutInput): CheckoutAction {
  const { booking, groupCounts, now = new Date(), isGroupCountsReady = true } = input

  // 1) Group booking (>1 rooms in the group) → GroupCheckoutDialog
  const groupId = booking.booking_group_id
  if (groupId) {
    if (!isGroupCountsReady) {
      // Data not ready — default to group path to avoid incorrectly skipping group checkout
      return 'group'
    }
    if (groupCounts && (groupCounts[groupId] ?? 0) > 1) {
      return 'group'
    }
  }

  // 2) Overdue (today is AFTER the scheduled checkout date) → ExtendBookingDialog
  const today = startOfDay(now)
  const checkOutDate = startOfDay(new Date(booking.check_out_date))
  if (isAfter(today, checkOutDate)) {
    return 'extend'
  }

  // 3) Normal → CheckoutSummaryDialog
  return 'summary'
}

// ---------- Check-in ----------

export type CheckInBlockReason =
  | 'before_checkin_date'
  | 'room_occupied'
  | 'room_blocked_for_maintenance'
  | 'room_not_ready'

export interface DecideCheckInInput {
  booking: {
    id: string
    check_in_date: string
    booking_type?: 'daily' | 'hourly' | 'monthly' | null
    room_price?: number | null
  }
  /** Current `rooms.status` value (e.g. 'available_clean', 'occupied', …) */
  roomStatus: string | null | undefined
  /** Inject "now" to keep tests deterministic */
  now?: Date
}

export type CheckInDecision =
  | { allowed: false; reason: CheckInBlockReason }
  | {
      allowed: true
      /**
       * Suggested early-check-in surcharge (VND). Only computed for `daily`
       * bookings when actual check-in is before the standard 14:00 cut-off.
       * Hourly / monthly always returns 0.
       */
      suggestedEarlyCharge: number
    }

export function decideCheckIn(input: DecideCheckInInput): CheckInDecision {
  const { booking, roomStatus, now = new Date() } = input

  // 1) Block if today is BEFORE scheduled check_in_date
  const today = startOfDay(now)
  const checkInDate = startOfDay(new Date(booking.check_in_date))
  if (isBefore(today, checkInDate)) {
    return { allowed: false, reason: 'before_checkin_date' }
  }

  // 2) Room is occupied by another booking
  if (isRoomOccupied(roomStatus)) {
    return { allowed: false, reason: 'room_occupied' }
  }

  // 3) Room is under maintenance / out of service
  if (isRoomBlockedForMaintenance(roomStatus)) {
    return { allowed: false, reason: 'room_blocked_for_maintenance' }
  }

  // 4) Room not ready (e.g. dirty, needs cleaning)
  if (!canRoomCheckIn(roomStatus) && !isRoomOccupied(roomStatus)) {
    return { allowed: false, reason: 'room_not_ready' }
  }

  // 5) Allowed — compute suggested early-checkin surcharge for daily bookings only
  let suggestedEarlyCharge = 0
  const bookingType = booking.booking_type || 'daily'
  if (bookingType === 'daily') {
    const actualTime = format(now, 'HH:mm')
    const hours = parseInt(actualTime.split(':')[0], 10)
    if (hours < 14) {
      suggestedEarlyCharge = calculateEarlyCheckinCharge(
        actualTime,
        booking.room_price || 0,
      )
    }
  }

  return { allowed: true, suggestedEarlyCharge }
}
