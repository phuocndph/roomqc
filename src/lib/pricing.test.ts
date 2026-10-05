/**
 * Unit tests for subscription pricing.
 * Sprint 1.2 — coverage cho công thức giá theo phòng/ngày.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateSubscriptionPrice,
  calculateEndDate,
  calculateRemainingDays,
  isInGracePeriod,
  getGraceDaysRemaining,
  getDurationOption,
  PRICE_PER_ROOM_DAILY,
  MIN_SUBSCRIPTION_DAYS,
} from './pricing'

describe('calculateSubscriptionPrice', () => {
  it('30 ngày × 10 phòng × 1.000đ, không discount', () => {
    const r = calculateSubscriptionPrice(10, 30)
    expect(r.basePrice).toBe(300_000)
    expect(r.discount).toBe(0)
    expect(r.discountPercent).toBe(0)
    expect(r.finalPrice).toBe(300_000)
    expect(r.pricePerDay).toBe(10_000)
  })

  it('90 ngày → discount 5%', () => {
    const r = calculateSubscriptionPrice(10, 90)
    expect(r.basePrice).toBe(900_000)
    expect(r.discountPercent).toBe(5)
    expect(r.discount).toBe(45_000)
    expect(r.finalPrice).toBe(855_000)
  })

  it('180 ngày → discount 10%', () => {
    const r = calculateSubscriptionPrice(20, 180)
    expect(r.basePrice).toBe(3_600_000)
    expect(r.discountPercent).toBe(10)
    expect(r.finalPrice).toBe(3_240_000)
  })

  it('365 ngày → discount 15%', () => {
    const r = calculateSubscriptionPrice(15, 365)
    expect(r.basePrice).toBe(15 * PRICE_PER_ROOM_DAILY * 365)
    expect(r.discountPercent).toBe(15)
    expect(r.finalPrice).toBe(r.basePrice - r.discount)
  })

  it('số ngày <30 bị nâng lên min', () => {
    const r = calculateSubscriptionPrice(5, 10)
    expect(r.days).toBe(MIN_SUBSCRIPTION_DAYS)
    expect(r.basePrice).toBe(5 * PRICE_PER_ROOM_DAILY * 30)
  })

  it('không discount cho duration không có trong bảng (ví dụ 60 ngày)', () => {
    const r = calculateSubscriptionPrice(10, 60)
    expect(r.discountPercent).toBe(0)
    expect(r.finalPrice).toBe(r.basePrice)
  })
})

describe('getDurationOption', () => {
  it('match đúng option theo days', () => {
    expect(getDurationOption(30)?.discount).toBe(0)
    expect(getDurationOption(90)?.discount).toBe(5)
    expect(getDurationOption(180)?.discount).toBe(10)
    expect(getDurationOption(365)?.discount).toBe(15)
    expect(getDurationOption(99)).toBeUndefined()
  })
})

describe('calculateEndDate', () => {
  it('cộng đúng số ngày', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    const end = calculateEndDate(start, 30)
    expect(end.toISOString().slice(0, 10)).toBe('2026-01-31')
  })
})

describe('calculateRemainingDays', () => {
  it('null/undefined → 0', () => {
    expect(calculateRemainingDays(null)).toBe(0)
  })
  it('quá hạn → 0', () => {
    expect(calculateRemainingDays('2020-01-01')).toBe(0)
  })
  it('tương lai → số ngày dương', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    expect(calculateRemainingDays(future.toISOString())).toBeGreaterThan(0)
    expect(calculateRemainingDays(future.toISOString())).toBeLessThanOrEqual(10)
  })
})

describe('isInGracePeriod', () => {
  it('false khi thiếu data', () => {
    expect(isInGracePeriod(null, null)).toBe(false)
    expect(isInGracePeriod('2026-01-01', null)).toBe(false)
  })
  it('true khi đã quá hạn nhưng còn trong grace', () => {
    const past = new Date()
    past.setDate(past.getDate() - 2)
    const future = new Date()
    future.setDate(future.getDate() + 3)
    expect(isInGracePeriod(past.toISOString(), future.toISOString())).toBe(true)
  })
  it('false khi grace cũng đã hết', () => {
    const past = new Date()
    past.setDate(past.getDate() - 10)
    const past2 = new Date()
    past2.setDate(past2.getDate() - 1)
    expect(isInGracePeriod(past.toISOString(), past2.toISOString())).toBe(false)
  })
})

describe('getGraceDaysRemaining', () => {
  it('null → 0', () => {
    expect(getGraceDaysRemaining(null)).toBe(0)
  })
  it('quá hạn → 0', () => {
    const past = new Date()
    past.setDate(past.getDate() - 1)
    expect(getGraceDaysRemaining(past.toISOString())).toBe(0)
  })
})
