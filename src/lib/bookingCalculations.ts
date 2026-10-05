/**
 * Booking Calculations Utility
 * Handles all pricing logic including surcharges, VAT, and service fees
 * Supports Daily, Hourly, and Monthly booking types
 */

import { startOfDay, isBefore, differenceInMinutes } from 'date-fns'

export type BookingType = 'daily' | 'hourly' | 'monthly'

export interface PricingRules {
  // Standard times
  standardCheckinTime: string // "14:00"
  standardCheckoutTime: string // "12:00"
  
  // Early check-in surcharge (% of room price)
  earlyCheckinBefore5: number // 100% (counts as extra night)
  earlyCheckin5_9: number // 50%
  earlyCheckin9_14: number // 30%
  
  // Late check-out surcharge (% of room price)
  lateCheckout12_15: number // 30%
  lateCheckout15_18: number // 50%
  lateCheckoutAfter18: number // 100%
  
  // Special surcharges
  weekendSurcharge: number // % for weekend nights
  highSeasonSurcharge: number // % for high season
  
  // Tax and fees
  vatRate: number // 8%
  serviceFeeRate: number // 5%
}

export const DEFAULT_PRICING_RULES: PricingRules = {
  standardCheckinTime: '14:00',
  standardCheckoutTime: '12:00',
  earlyCheckinBefore5: 100,
  earlyCheckin5_9: 50,
  earlyCheckin9_14: 30,
  lateCheckout12_15: 30,
  lateCheckout15_18: 50,
  lateCheckoutAfter18: 100,
  weekendSurcharge: 0,
  highSeasonSurcharge: 0,
  vatRate: 8,
  serviceFeeRate: 5,
}

export interface BookingCostBreakdown {
  // Booking type
  bookingType: BookingType
  
  // Room charges - Daily
  roomPricePerNight: number
  nights: number
  roomTotal: number
  
  // Room charges - Hourly
  hourlyRate?: number
  hours?: number
  hourlyOvertimeCharge?: number
  
  // Room charges - Monthly
  monthlyRate?: number
  months?: number
  monthlyDiscount?: number
  
  // Surcharges (only for daily)
  earlyCheckinCharge: number
  lateCheckoutCharge: number
  totalSurcharges: number
  
  // Services (from consumables)
  serviceCharges: number
  extraCharges: number
  
  // Damage charges
  damageCharges: number
  damageItems?: DamageChargeItem[]
  
  // VAT base (subtotal excluding damage charges — the taxable portion)
  vatBase: number
  
  // Subtotal (before tax)
  subtotal: number
  
  // Tax and fees
  vatRate: number
  vatAmount: number
  serviceFeeRate: number
  serviceFeeAmount: number
  
  // Grand total
  totalAmount: number
  
  // Payments
  depositAmount: number
  amountPaid: number
  remainingAmount: number
  
  // Status
  paymentStatus: 'pending' | 'partial' | 'paid'
}

export interface DamageChargeItem {
  item_id: string
  item_name: string
  item_type: 'lost' | 'damaged' | 'consumed'
  quantity: number
  charge_amount: number
  damage_type?: 'repairable' | 'replacement_needed'
  notes?: string
}

/**
 * Parse time string to hours (e.g., "14:00" -> 14)
 */
export function parseTimeToHours(timeStr: string): number {
  const [hours] = timeStr.split(':').map(Number)
  return hours
}

/**
 * Calculate early check-in surcharge based on actual check-in time
 */
export function calculateEarlyCheckinCharge(
  actualCheckinTime: string,
  roomPrice: number,
  rules: PricingRules = DEFAULT_PRICING_RULES
): number {
  const hours = parseTimeToHours(actualCheckinTime)
  const standardHours = parseTimeToHours(rules.standardCheckinTime)
  
  // No surcharge if check-in is at or after standard time
  if (hours >= standardHours) {
    return 0
  }
  
  // Check-in before 5h: 100% surcharge (counts as extra night)
  if (hours < 5) {
    return Math.round(roomPrice * rules.earlyCheckinBefore5 / 100)
  }
  
  // Check-in from 5h-9h: 50% surcharge
  if (hours >= 5 && hours < 9) {
    return Math.round(roomPrice * rules.earlyCheckin5_9 / 100)
  }
  
  // Check-in from 9h-14h: 30% surcharge
  if (hours >= 9 && hours < standardHours) {
    return Math.round(roomPrice * rules.earlyCheckin9_14 / 100)
  }
  
  return 0
}

/**
 * Calculate weekend surcharge based on nights falling on Saturday/Sunday
 */
export function calculateWeekendSurcharge(
  checkInDate: Date,
  checkOutDate: Date,
  roomPrice: number,
  rules: PricingRules = DEFAULT_PRICING_RULES
): number {
  if (rules.weekendSurcharge <= 0) return 0
  
  let weekendNights = 0
  const currentDate = new Date(checkInDate)
  
  while (currentDate < checkOutDate) {
    const dayOfWeek = currentDate.getDay()
    // Saturday = 6, Sunday = 0
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendNights++
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  return Math.round(weekendNights * roomPrice * rules.weekendSurcharge / 100)
}

/**
 * Calculate late check-out surcharge based on actual check-out time
 * Only applies if checking out ON or AFTER the scheduled checkout date
 */
export function calculateLateCheckoutCharge(
  actualCheckoutTime: string,
  roomPrice: number,
  actualCheckoutDate?: Date,
  scheduledCheckoutDate?: Date,
  rules: PricingRules = DEFAULT_PRICING_RULES
): number {
  // Early checkout: If checking out BEFORE the scheduled date, no late surcharge
  if (actualCheckoutDate && scheduledCheckoutDate) {
    const actualDay = startOfDay(actualCheckoutDate)
    const scheduledDay = startOfDay(scheduledCheckoutDate)
    if (isBefore(actualDay, scheduledDay)) {
      return 0
    }
  }

  const hours = parseTimeToHours(actualCheckoutTime)
  const standardHours = parseTimeToHours(rules.standardCheckoutTime)
  
  // No surcharge if check-out is at or before standard time
  if (hours <= standardHours) {
    return 0
  }
  
  // Check-out from 12h-15h: 30% surcharge
  if (hours > standardHours && hours <= 15) {
    return Math.round(roomPrice * rules.lateCheckout12_15 / 100)
  }
  
  // Check-out from 15h-18h: 50% surcharge
  if (hours > 15 && hours <= 18) {
    return Math.round(roomPrice * rules.lateCheckout15_18 / 100)
  }
  
  // Check-out after 18h: 100% surcharge (extra night)
  if (hours > 18) {
    return Math.round(roomPrice * rules.lateCheckoutAfter18 / 100)
  }
  
  return 0
}

/**
 * Check if checkout is early (before scheduled date)
 */
export function isEarlyCheckout(actualDate: Date, scheduledDate: Date): boolean {
  return isBefore(startOfDay(actualDate), startOfDay(scheduledDate))
}

/**
 * Calculate hourly overtime charge
 * Only applies to hourly bookings when checkout is after scheduled end time
 */
export function calculateHourlyOvertimeCharge(
  scheduledEndTime: Date,
  actualCheckoutTime: Date,
  hourlyRate: number
): number {
  const overtimeMinutes = differenceInMinutes(actualCheckoutTime, scheduledEndTime)
  if (overtimeMinutes <= 0) return 0
  
  // Round up to full hours
  const overtimeHours = Math.ceil(overtimeMinutes / 60)
  return overtimeHours * hourlyRate
}

// Monthly discount configuration (matching types.ts)
const MONTHLY_DISCOUNTS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 5,
  6: 10,
  12: 15,
}

/**
 * Get monthly discount percentage based on number of months
 */
export function getMonthlyDiscountPercent(months: number): number {
  // Find the highest applicable discount
  const thresholds = Object.keys(MONTHLY_DISCOUNTS).map(Number).sort((a, b) => b - a)
  for (const threshold of thresholds) {
    if (months >= threshold) {
      return MONTHLY_DISCOUNTS[threshold]
    }
  }
  return 0
}

/**
 * Calculate full booking cost breakdown
 * Supports Daily, Hourly, and Monthly booking types
 */
export function calculateBookingCost(params: {
  // Booking type - default to 'daily' for backwards compatibility
  bookingType?: BookingType
  
  // Daily booking
  roomPrice: number
  nights: number
  earlyCheckinCharge?: number
  lateCheckoutCharge?: number
  
  // Hourly booking
  hourlyRate?: number
  hours?: number
  hourlyOvertimeCharge?: number
  
  // Monthly booking
  monthlyRate?: number
  months?: number
  
  // Common
  serviceCharges?: number
  extraCharges?: number
  damageCharges?: number
  damageItems?: DamageChargeItem[]
  vatRate?: number
  serviceFeeRate?: number
  depositAmount?: number
  amountPaid?: number
}): BookingCostBreakdown {
  const {
    bookingType = 'daily',
    roomPrice,
    nights,
    earlyCheckinCharge = 0,
    lateCheckoutCharge = 0,
    hourlyRate = 0,
    hours = 0,
    hourlyOvertimeCharge = 0,
    monthlyRate = 0,
    months = 0,
    serviceCharges = 0,
    extraCharges = 0,
    damageCharges = 0,
    damageItems = [],
    vatRate = DEFAULT_PRICING_RULES.vatRate,
    serviceFeeRate = DEFAULT_PRICING_RULES.serviceFeeRate,
    depositAmount = 0,
    amountPaid = 0,
  } = params
  
  let roomTotal = 0
  let totalSurcharges = 0
  let monthlyDiscount = 0
  
  switch (bookingType) {
    case 'hourly':
      // Hourly: hourlyRate × hours + overtime
      roomTotal = hourlyRate * Math.max(1, hours)
      totalSurcharges = hourlyOvertimeCharge // Overtime is treated as surcharge
      break
      
    case 'monthly': {
      // Monthly: monthlyRate × months - discount
      const baseMonthlyTotal = monthlyRate * Math.max(1, months)
      const discountPercent = getMonthlyDiscountPercent(months)
      monthlyDiscount = Math.round(baseMonthlyTotal * discountPercent / 100)
      roomTotal = baseMonthlyTotal - monthlyDiscount
      totalSurcharges = 0 // No time-based surcharges for monthly
      break
    }
      
    case 'daily':
    default:
      // Daily: roomPrice × nights + early/late charges
      roomTotal = roomPrice * Math.max(1, nights)
      totalSurcharges = earlyCheckinCharge + lateCheckoutCharge
      break
  }
  
  // VAT base excludes damage charges (damage compensation is not a taxable service)
  const vatBase = roomTotal + totalSurcharges + serviceCharges + extraCharges
  // Damage is added to subtotal for grand total purposes but NOT taxed
  const subtotal = vatBase + damageCharges
  
  // Calculate VAT and service fee on vatBase only
  const vatAmount = Math.round(vatBase * vatRate / 100)
  const serviceFeeAmount = Math.round(vatBase * serviceFeeRate / 100)
  
  // Grand total
  const totalAmount = subtotal + vatAmount + serviceFeeAmount
  
  // Remaining to pay (deposit is part of payment)
  const totalPaid = depositAmount + amountPaid
  const remainingAmount = Math.max(0, totalAmount - totalPaid)
  
  // Payment status
  let paymentStatus: 'pending' | 'partial' | 'paid' = 'pending'
  if (totalPaid >= totalAmount) {
    paymentStatus = 'paid'
  } else if (totalPaid > 0) {
    paymentStatus = 'partial'
  }
  
  return {
    bookingType,
    roomPricePerNight: roomPrice,
    nights,
    roomTotal,
    // Hourly specific
    hourlyRate: bookingType === 'hourly' ? hourlyRate : undefined,
    hours: bookingType === 'hourly' ? hours : undefined,
    hourlyOvertimeCharge: bookingType === 'hourly' ? hourlyOvertimeCharge : undefined,
    // Monthly specific
    monthlyRate: bookingType === 'monthly' ? monthlyRate : undefined,
    months: bookingType === 'monthly' ? months : undefined,
    monthlyDiscount: bookingType === 'monthly' ? monthlyDiscount : undefined,
    // Surcharges (only for daily, but kept for hourly overtime)
    earlyCheckinCharge: bookingType === 'daily' ? earlyCheckinCharge : 0,
    lateCheckoutCharge: bookingType === 'daily' ? lateCheckoutCharge : 0,
    totalSurcharges,
    serviceCharges,
    extraCharges,
    damageCharges,
    damageItems,
    vatBase,
    subtotal,
    vatRate,
    vatAmount,
    serviceFeeRate,
    serviceFeeAmount,
    totalAmount,
    depositAmount,
    amountPaid,
    remainingAmount,
    paymentStatus,
  }
}

/**
 * Get early check-in surcharge description
 */
export function getEarlyCheckinDescription(timeStr: string, rules: PricingRules = DEFAULT_PRICING_RULES): string | null {
  const hours = parseTimeToHours(timeStr)
  const standardHours = parseTimeToHours(rules.standardCheckinTime)
  
  if (hours >= standardHours) return null
  
  if (hours < 5) {
    return `Check-in sớm (${timeStr} - ${rules.earlyCheckinBefore5}% = 1 đêm)`
  }
  
  if (hours >= 5 && hours < 9) {
    return `Check-in sớm (${timeStr} - ${rules.earlyCheckin5_9}%)`
  }
  
  if (hours >= 9 && hours < standardHours) {
    return `Check-in sớm (${timeStr} - ${rules.earlyCheckin9_14}%)`
  }
  
  return null
}

/**
 * Get late check-out surcharge description
 */
export function getLateCheckoutDescription(
  timeStr: string, 
  actualDate?: Date,
  scheduledDate?: Date,
  rules: PricingRules = DEFAULT_PRICING_RULES
): string | null {
  // Early checkout - no late surcharge
  if (actualDate && scheduledDate && isEarlyCheckout(actualDate, scheduledDate)) {
    return null
  }

  const hours = parseTimeToHours(timeStr)
  const standardHours = parseTimeToHours(rules.standardCheckoutTime)
  
  if (hours <= standardHours) return null
  
  if (hours > standardHours && hours <= 15) {
    return `Check-out trễ (${timeStr} - ${rules.lateCheckout12_15}%)`
  }
  
  if (hours > 15 && hours <= 18) {
    return `Check-out trễ (${timeStr} - ${rules.lateCheckout15_18}%)`
  }
  
  if (hours > 18) {
    return `Check-out trễ (${timeStr} - ${rules.lateCheckoutAfter18}% = 1 đêm)`
  }
  
  return null
}
