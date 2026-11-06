import { describe, expect, it } from 'vitest'
import { sortLaundryBatches, updateLaundryReceipt } from './laundryPresentation'
import type { LaundryBatchWithVendor } from '@/types/laundry.types'

describe('laundry priorities', () => {
  it('shows ready batches first, then the earliest return date, without mutating cached data', () => {
    const batches = [
      {
        id: 'washing',
        batch_code: '03',
        status: 'washing',
        expected_return_date: '2026-10-01',
      },
      {
        id: 'ready-later',
        batch_code: '02',
        status: 'ready',
        expected_return_date: '2026-10-18',
      },
      {
        id: 'ready-first',
        batch_code: '01',
        status: 'ready',
        expected_return_date: '2026-10-17',
      },
      {
        id: 'no-date',
        batch_code: '04',
        status: 'delivered',
        expected_return_date: null,
      },
    ] as LaundryBatchWithVendor[]
    expect(sortLaundryBatches(batches).map((batch) => batch.id)).toEqual([
      'ready-first',
      'ready-later',
      'washing',
      'no-date',
    ])
    expect(batches[0].id).toBe('washing')
  })
})

describe('laundry receipt quantities', () => {
  const item = {
    item_id: 'towel',
    quantity_returned: 7,
    quantity_lost: 2,
    quantity_damaged: 1,
    return_condition: 'Tốt',
  }
  it('clears lost and damaged quantities when all pieces are returned', () => {
    expect(updateLaundryReceipt(item, 10, 'quantity_returned', 10)).toEqual({
      ...item,
      quantity_returned: 10,
      quantity_lost: 0,
      quantity_damaged: 0,
    })
    expect(item.quantity_lost).toBe(2)
  })
  it('keeps the total equal to delivered pieces when losses or damage change', () => {
    const next = updateLaundryReceipt(item, 10, 'quantity_damaged', 9)
    expect(
      next.quantity_returned + next.quantity_lost + next.quantity_damaged,
    ).toBe(10)
    expect(next.quantity_returned).toBe(0)
    expect(next.quantity_lost).toBe(1)
  })
  it.each([-5, 50, NaN, 2.5])(
    'keeps input %s within valid whole-piece bounds',
    (value) => {
      const next = updateLaundryReceipt(item, 10, 'quantity_lost', value)
      expect(
        next.quantity_returned + next.quantity_lost + next.quantity_damaged,
      ).toBe(10)
      expect(Number.isInteger(next.quantity_lost)).toBe(true)
      expect(next.quantity_lost).toBeGreaterThanOrEqual(0)
      expect(next.quantity_lost).toBeLessThanOrEqual(10)
    },
  )
})
