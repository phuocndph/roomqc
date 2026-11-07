import { describe, expect, it } from 'vitest'
import {
  filterPurchaseOrders,
  isPurchaseOrderOverdue,
} from './purchaseOrderPresentation'
import type { PurchaseOrder } from '@/types/purchase-order.types'

const order = (overrides: Partial<PurchaseOrder>) =>
  ({
    id: 'a',
    po_code: 'PO-01',
    status: 'ordered',
    order_date: '2026-10-16T15:00:00Z',
    expected_delivery_date: '2026-10-16',
    total_amount: 12_000_000,
    requested_by: 'owner',
    vendor: { name: 'Giặt An Thủy', code: 'AT' },
    ...overrides,
  }) as PurchaseOrder

describe('purchase order list filters', () => {
  const orders = [
    order({ id: 'a' }),
    order({
      id: 'b',
      status: 'draft',
      requested_by: 'staff',
      total_amount: 5_000_000,
      order_date: '2026-10-15T10:00:00Z',
      vendor: { name: 'Bình Minh', code: 'BM' } as PurchaseOrder['vendor'],
    }),
  ]
  it('searches vendor name, code and PO code without changing the source order', () => {
    expect(
      filterPurchaseOrders(orders, { search: ' AN THỦY ' }).map((po) => po.id),
    ).toEqual(['a'])
    expect(
      filterPurchaseOrders(orders, { search: 'bm' }).map((po) => po.id),
    ).toEqual(['b'])
    expect(filterPurchaseOrders(orders, { search: 'PO-01' })).toHaveLength(2)
    expect(orders.map((po) => po.id)).toEqual(['a', 'b'])
  })
  it('combines owner, value and status filters', () => {
    expect(
      filterPurchaseOrders(
        orders,
        { created_by: 'me', min_amount: 10_000_000, status: 'ordered' },
        'owner',
      ).map((po) => po.id),
    ).toEqual(['a'])
    expect(filterPurchaseOrders(orders, { created_by: 'me' })).toEqual([])
    expect(filterPurchaseOrders(orders, { status: 'rejected' })).toEqual([])
  })
  it('includes the entire end date and excludes adjacent days', () => {
    expect(
      filterPurchaseOrders(orders, {
        date_from: '2026-10-16',
        date_to: '2026-10-16',
      }).map((po) => po.id),
    ).toEqual(['a'])
  })
  it('sorts by value and delivery date in both directions', () => {
    expect(
      filterPurchaseOrders(orders, {
        sort_by: 'amount',
        sort_order: 'asc',
      }).map((po) => po.id),
    ).toEqual(['b', 'a'])
    expect(
      filterPurchaseOrders(orders, {
        sort_by: 'amount',
        sort_order: 'desc',
      }).map((po) => po.id),
    ).toEqual(['a', 'b'])
    expect(
      filterPurchaseOrders(
        [
          order({ id: 'a', expected_delivery_date: '2026-10-17' }),
          order({ id: 'b', expected_delivery_date: '2026-10-15' }),
        ],
        { sort_by: 'delivery', sort_order: 'asc' },
      ).map((po) => po.id),
    ).toEqual(['b', 'a'])
  })
})

describe('delivery due dates', () => {
  const today = new Date(2026, 9, 16, 18, 30)
  it('allows delivery until the end of today', () => {
    expect(isPurchaseOrderOverdue(order({}), today)).toBe(false)
    expect(
      isPurchaseOrderOverdue(
        order({ expected_delivery_date: '2026-10-15' }),
        today,
      ),
    ).toBe(true)
  })
  it.each(['draft', 'submitted', 'rejected', 'received', 'cancelled'] as const)(
    'does not mark %s orders as overdue',
    (status) => {
      expect(
        isPurchaseOrderOverdue(
          order({ status, expected_delivery_date: '2026-10-01' }),
          today,
        ),
      ).toBe(false)
    },
  )
})
