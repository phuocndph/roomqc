import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildRoomFormSchema, roomFormSchema } from './roomFormSchema'

describe('roomFormSchema', () => {
  const validBase = {
    room_number: '101',
    room_type: 'standard',
    floor: 1,
    max_guests: 2,
    base_price: 300000,
    has_window: true,
    has_balcony: false,
    smoking_allowed: false,
  }

  it('accepts a minimally valid payload', () => {
    expect(roomFormSchema.safeParse(validBase).success).toBe(true)
  })

  it('rejects empty room_number with Vietnamese message', () => {
    const r = roomFormSchema.safeParse({ ...validBase, room_number: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Số phòng là bắt buộc')
    }
  })

  it('rejects floor < 1', () => {
    const r = roomFormSchema.safeParse({ ...validBase, floor: 0 })
    expect(r.success).toBe(false)
  })

  it('rejects max_guests < 1', () => {
    const r = roomFormSchema.safeParse({ ...validBase, max_guests: 0 })
    expect(r.success).toBe(false)
  })

  it('rejects negative base_price', () => {
    const r = roomFormSchema.safeParse({ ...validBase, base_price: -1 })
    expect(r.success).toBe(false)
  })

  it('allows optional area_sqm, bed_type, view_type, notes to be omitted', () => {
    const r = roomFormSchema.safeParse(validBase)
    expect(r.success).toBe(true)
  })

  it('buildRoomFormSchema uses the provided message resolver', () => {
    const schema = buildRoomFormSchema((k) => `MSG:${k}`)
    const r = schema.safeParse({ ...validBase, room_number: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('MSG:roomNumberRequired')
    }
  })

  it('keeps the same field shape as the inferred type', () => {
    // Smoke check that the schema is a ZodObject with expected keys
    const shape = (roomFormSchema as unknown as z.ZodObject<any>).shape
    const keys = Object.keys(shape).sort()
    expect(keys).toEqual(
      [
        'area_sqm',
        'base_price',
        'bed_type',
        'floor',
        'has_balcony',
        'has_window',
        'max_guests',
        'notes',
        'room_number',
        'room_type',
        'smoking_allowed',
        'view_type',
      ].sort(),
    )
  })
})
