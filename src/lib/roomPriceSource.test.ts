import { describe, expect, it } from 'vitest'
import { resolveBookingUnitPrice, resolveRoomNightPrice } from './roomPriceSource'

const table = (p: Partial<{ final_price: number; has_seasonal: boolean; has_override: boolean; is_closed: boolean }>) =>
  ({ base_price: 500000, final_price: 500000, has_seasonal: false, has_override: false, is_closed: false, ...p })

describe('W1-D1 room price source', () => {
  it('uses the effective room-type table price over the room base price (audit case 500k vs 1.2M)', () => {
    expect(resolveRoomNightPrice(table({}), 1_200_000)).toEqual({ price: 500000, source: 'table', label: 'Bảng giá loại phòng' })
  })
  it('labels per-day overrides before seasonal rules', () => {
    expect(resolveRoomNightPrice(table({ final_price: 700000, has_override: true, has_seasonal: true }), 0).source).toBe('override')
    expect(resolveRoomNightPrice(table({ final_price: 650000, has_seasonal: true }), 0).source).toBe('seasonal')
  })
  it('falls back to the room base price when no table price exists', () => {
    expect(resolveRoomNightPrice(undefined, 1_200_000)).toEqual({ price: 1200000, source: 'room_base', label: 'Giá cơ bản của phòng' })
    expect(resolveRoomNightPrice(table({ final_price: 0 }), 1_200_000).source).toBe('room_base')
  })
  it('keeps closed and unpriced rooms explicit', () => {
    expect(resolveRoomNightPrice(table({ is_closed: true }), 1_200_000)).toMatchObject({ price: 0, source: 'closed' })
    expect(resolveRoomNightPrice(null, null)).toMatchObject({ price: 0, source: 'none' })
  })
  it('booking: rate for the unit first, then the room price for the same unit', () => {
    const room = { rate_daily: null, rate_hourly: 90000, rate_monthly: null, base_price: 1200000, hourly_price: 80000, monthly_price: 0 }
    expect(resolveBookingUnitPrice(room, 'daily')).toEqual({ price: 1200000, source: 'room_base' })
    expect(resolveBookingUnitPrice(room, 'hourly')).toEqual({ price: 90000, source: 'table' })
    expect(resolveBookingUnitPrice(room, 'monthly')).toEqual({ price: 0, source: 'none' })
  })
})
