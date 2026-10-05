/**
 * Unit tests for booking financial calculations.
 * Sprint 1.2 — coverage cho logic tài chính cốt lõi.
 */
import { describe, it, expect } from 'vitest'
import {
  parseTimeToHours,
  calculateEarlyCheckinCharge,
  calculateLateCheckoutCharge,
  calculateWeekendSurcharge,
  calculateHourlyOvertimeCharge,
  isEarlyCheckout,
  getMonthlyDiscountPercent,
  calculateBookingCost,
  DEFAULT_PRICING_RULES,
} from './bookingCalculations'

describe('parseTimeToHours', () => {
  it('parses HH:MM correctly', () => {
    expect(parseTimeToHours('14:00')).toBe(14)
    expect(parseTimeToHours('09:30')).toBe(9)
    expect(parseTimeToHours('00:00')).toBe(0)
    expect(parseTimeToHours('23:59')).toBe(23)
  })
})

describe('calculateEarlyCheckinCharge', () => {
  const room = 1_000_000

  it('không phụ thu khi đến đúng/sau giờ chuẩn', () => {
    expect(calculateEarlyCheckinCharge('14:00', room)).toBe(0)
    expect(calculateEarlyCheckinCharge('16:00', room)).toBe(0)
  })

  it('100% khi check-in trước 5h', () => {
    expect(calculateEarlyCheckinCharge('03:00', room)).toBe(1_000_000)
    expect(calculateEarlyCheckinCharge('04:59', room)).toBe(1_000_000)
  })

  it('50% khi 5h-9h', () => {
    expect(calculateEarlyCheckinCharge('05:00', room)).toBe(500_000)
    expect(calculateEarlyCheckinCharge('08:00', room)).toBe(500_000)
  })

  it('30% khi 9h-14h', () => {
    expect(calculateEarlyCheckinCharge('09:00', room)).toBe(300_000)
    expect(calculateEarlyCheckinCharge('13:00', room)).toBe(300_000)
  })
})

describe('calculateLateCheckoutCharge', () => {
  const room = 1_000_000

  it('không phụ thu khi đúng/trước giờ chuẩn', () => {
    expect(calculateLateCheckoutCharge('11:00', room)).toBe(0)
    expect(calculateLateCheckoutCharge('12:00', room)).toBe(0)
  })

  it('30% khi 12h-15h', () => {
    expect(calculateLateCheckoutCharge('13:00', room)).toBe(300_000)
    expect(calculateLateCheckoutCharge('15:00', room)).toBe(300_000)
  })

  it('50% khi 15h-18h', () => {
    expect(calculateLateCheckoutCharge('16:00', room)).toBe(500_000)
    expect(calculateLateCheckoutCharge('18:00', room)).toBe(500_000)
  })

  it('100% khi sau 18h', () => {
    expect(calculateLateCheckoutCharge('19:00', room)).toBe(1_000_000)
    expect(calculateLateCheckoutCharge('23:00', room)).toBe(1_000_000)
  })

  it('không tính phụ thu nếu khách trả phòng SỚM hơn ngày dự kiến', () => {
    const actual = new Date('2026-05-09T20:00:00')
    const scheduled = new Date('2026-05-10T12:00:00')
    expect(calculateLateCheckoutCharge('20:00', room, actual, scheduled)).toBe(0)
  })

  it('vẫn tính phụ thu khi trả phòng đúng ngày dự kiến', () => {
    const actual = new Date('2026-05-10T20:00:00')
    const scheduled = new Date('2026-05-10T12:00:00')
    expect(calculateLateCheckoutCharge('20:00', room, actual, scheduled)).toBe(1_000_000)
  })
})

describe('calculateWeekendSurcharge', () => {
  it('trả 0 khi rule không cấu hình', () => {
    const checkin = new Date('2026-05-08')
    const checkout = new Date('2026-05-11')
    expect(calculateWeekendSurcharge(checkin, checkout, 1_000_000)).toBe(0)
  })

  it('tính số đêm cuối tuần khi rule >0', () => {
    const checkin = new Date('2026-05-08T14:00:00') // Friday
    const checkout = new Date('2026-05-11T12:00:00') // Monday
    const rules = { ...DEFAULT_PRICING_RULES, weekendSurcharge: 50 }
    // Sat + Sun = 2 weekend nights (Fri night = Fri itself in loop)
    const result = calculateWeekendSurcharge(checkin, checkout, 1_000_000, rules)
    expect(result).toBeGreaterThan(0)
  })
})

describe('calculateHourlyOvertimeCharge', () => {
  it('trả 0 khi trả đúng/sớm hơn giờ', () => {
    const scheduled = new Date('2026-05-10T15:00:00')
    const actual = new Date('2026-05-10T15:00:00')
    expect(calculateHourlyOvertimeCharge(scheduled, actual, 100_000)).toBe(0)
  })

  it('làm tròn lên 1 giờ với mọi phút lẻ', () => {
    const scheduled = new Date('2026-05-10T15:00:00')
    const actual = new Date('2026-05-10T15:10:00')
    expect(calculateHourlyOvertimeCharge(scheduled, actual, 100_000)).toBe(100_000)
  })

  it('tính đúng nhiều giờ overtime', () => {
    const scheduled = new Date('2026-05-10T15:00:00')
    const actual = new Date('2026-05-10T17:30:00') // 2.5h → 3h
    expect(calculateHourlyOvertimeCharge(scheduled, actual, 100_000)).toBe(300_000)
  })
})

describe('isEarlyCheckout', () => {
  it('phát hiện trả phòng sớm', () => {
    expect(
      isEarlyCheckout(new Date('2026-05-09T10:00:00'), new Date('2026-05-10T12:00:00'))
    ).toBe(true)
  })
  it('cùng ngày không tính sớm', () => {
    expect(
      isEarlyCheckout(new Date('2026-05-10T08:00:00'), new Date('2026-05-10T22:00:00'))
    ).toBe(false)
  })
})

describe('getMonthlyDiscountPercent', () => {
  it('discount theo bậc tháng', () => {
    expect(getMonthlyDiscountPercent(1)).toBe(0)
    expect(getMonthlyDiscountPercent(2)).toBe(0)
    expect(getMonthlyDiscountPercent(3)).toBe(5)
    expect(getMonthlyDiscountPercent(5)).toBe(5)
    expect(getMonthlyDiscountPercent(6)).toBe(10)
    expect(getMonthlyDiscountPercent(11)).toBe(10)
    expect(getMonthlyDiscountPercent(12)).toBe(15)
    expect(getMonthlyDiscountPercent(24)).toBe(15)
  })
})

describe('calculateBookingCost — daily', () => {
  it('tính subtotal + VAT + service fee + còn nợ', () => {
    const r = calculateBookingCost({
      bookingType: 'daily',
      roomPrice: 1_000_000,
      nights: 2,
      vatRate: 8,
      serviceFeeRate: 5,
      depositAmount: 500_000,
    })
    expect(r.roomTotal).toBe(2_000_000)
    expect(r.subtotal).toBe(2_000_000)
    expect(r.vatAmount).toBe(160_000)
    expect(r.serviceFeeAmount).toBe(100_000)
    expect(r.totalAmount).toBe(2_260_000)
    expect(r.remainingAmount).toBe(1_760_000)
    expect(r.paymentStatus).toBe('partial')
  })

  it('cộng phụ thu sớm + muộn vào subtotal', () => {
    const r = calculateBookingCost({
      bookingType: 'daily',
      roomPrice: 1_000_000,
      nights: 1,
      earlyCheckinCharge: 300_000,
      lateCheckoutCharge: 500_000,
      vatRate: 0,
      serviceFeeRate: 0,
    })
    expect(r.totalSurcharges).toBe(800_000)
    expect(r.subtotal).toBe(1_800_000)
    expect(r.totalAmount).toBe(1_800_000)
  })

  it('paymentStatus = paid khi đủ tiền', () => {
    const r = calculateBookingCost({
      bookingType: 'daily',
      roomPrice: 1_000_000,
      nights: 1,
      vatRate: 0,
      serviceFeeRate: 0,
      amountPaid: 1_000_000,
    })
    expect(r.paymentStatus).toBe('paid')
    expect(r.remainingAmount).toBe(0)
  })

  it('cộng damageCharges vào subtotal', () => {
    const r = calculateBookingCost({
      bookingType: 'daily',
      roomPrice: 1_000_000,
      nights: 1,
      damageCharges: 200_000,
      vatRate: 0,
      serviceFeeRate: 0,
    })
    expect(r.subtotal).toBe(1_200_000)
  })

  it('nights tối thiểu = 1 ngay cả khi truyền 0', () => {
    const r = calculateBookingCost({
      bookingType: 'daily',
      roomPrice: 500_000,
      nights: 0,
      vatRate: 0,
      serviceFeeRate: 0,
    })
    expect(r.roomTotal).toBe(500_000)
  })
})

describe('calculateBookingCost — hourly', () => {
  it('hourlyRate × hours + overtime', () => {
    const r = calculateBookingCost({
      bookingType: 'hourly',
      roomPrice: 0,
      nights: 0,
      hourlyRate: 100_000,
      hours: 3,
      hourlyOvertimeCharge: 100_000,
      vatRate: 0,
      serviceFeeRate: 0,
    })
    expect(r.roomTotal).toBe(300_000)
    expect(r.totalSurcharges).toBe(100_000)
    expect(r.subtotal).toBe(400_000)
  })

  it('không trả phụ thu daily cho hourly', () => {
    const r = calculateBookingCost({
      bookingType: 'hourly',
      roomPrice: 0,
      nights: 0,
      hourlyRate: 100_000,
      hours: 2,
      earlyCheckinCharge: 999_999, // bị bỏ qua
      lateCheckoutCharge: 999_999, // bị bỏ qua
    })
    expect(r.earlyCheckinCharge).toBe(0)
    expect(r.lateCheckoutCharge).toBe(0)
  })
})

describe('calculateBookingCost — monthly', () => {
  it('áp dụng discount 5% cho 3 tháng', () => {
    const r = calculateBookingCost({
      bookingType: 'monthly',
      roomPrice: 0,
      nights: 0,
      monthlyRate: 10_000_000,
      months: 3,
      vatRate: 0,
      serviceFeeRate: 0,
    })
    expect(r.monthlyDiscount).toBe(1_500_000) // 30M * 5%
    expect(r.roomTotal).toBe(28_500_000)
  })

  it('discount 15% cho 12 tháng', () => {
    const r = calculateBookingCost({
      bookingType: 'monthly',
      roomPrice: 0,
      nights: 0,
      monthlyRate: 10_000_000,
      months: 12,
      vatRate: 0,
      serviceFeeRate: 0,
    })
    expect(r.monthlyDiscount).toBe(18_000_000)
    expect(r.roomTotal).toBe(102_000_000)
  })

  it('không có time-based surcharge với monthly', () => {
    const r = calculateBookingCost({
      bookingType: 'monthly',
      roomPrice: 0,
      nights: 0,
      monthlyRate: 5_000_000,
      months: 1,
      earlyCheckinCharge: 100_000,
      lateCheckoutCharge: 100_000,
    })
    expect(r.totalSurcharges).toBe(0)
  })
})
