import type {
  POFilters,
  POStatus,
  PurchaseOrder,
} from '@/types/purchase-order.types'

export const PO_STATUS: Record<POStatus, { label: string; className: string }> =
  {
    draft: {
      label: 'Nháp',
      className:
        'border-transparent bg-slate-600 text-white hover:bg-slate-600',
    },
    submitted: {
      label: 'Chờ duyệt',
      className:
        'border-transparent bg-amber-700 text-white hover:bg-amber-700',
    },
    approved: {
      label: 'Đã duyệt',
      className: 'border-transparent bg-blue-700 text-white hover:bg-blue-700',
    },
    ordered: {
      label: 'Đã đặt hàng',
      className: 'border-transparent bg-blue-700 text-white hover:bg-blue-700',
    },
    partial: {
      label: 'Nhận một phần',
      className:
        'border-transparent bg-amber-700 text-white hover:bg-amber-700',
    },
    received: {
      label: 'Đã nhận đủ',
      className:
        'border-transparent bg-green-700 text-white hover:bg-green-700',
    },
    rejected: {
      label: 'Từ chối',
      className: 'border-transparent bg-red-700 text-white hover:bg-red-700',
    },
    cancelled: {
      label: 'Đã hủy',
      className:
        'border-transparent bg-slate-600 text-white hover:bg-slate-600',
    },
  }

export function filterPurchaseOrders(
  orders: PurchaseOrder[],
  filters: POFilters,
  userId?: string,
) {
  const search = filters.search?.trim().toLocaleLowerCase('vi') || ''
  const result = orders.filter((po) => {
    if (
      filters.status &&
      filters.status !== 'all' &&
      po.status !== filters.status
    )
      return false
    if (
      search &&
      ![po.po_code, po.vendor?.name, po.vendor?.code].some((value) =>
        value?.toLocaleLowerCase('vi').includes(search),
      )
    )
      return false
    if (filters.created_by === 'me' && po.requested_by !== userId) return false
    if (filters.min_amount != null && po.total_amount < filters.min_amount)
      return false
    if (filters.max_amount != null && po.total_amount > filters.max_amount)
      return false
    if (
      filters.date_from &&
      po.order_date.slice(0, 10) < filters.date_from.slice(0, 10)
    )
      return false
    if (
      filters.date_to &&
      po.order_date.slice(0, 10) > filters.date_to.slice(0, 10)
    )
      return false
    return true
  })
  const direction = filters.sort_order === 'asc' ? 1 : -1
  return result.sort((a, b) => {
    const value =
      filters.sort_by === 'amount'
        ? a.total_amount - b.total_amount
        : new Date(
            filters.sort_by === 'delivery'
              ? a.expected_delivery_date
              : a.order_date,
          ).getTime() -
          new Date(
            filters.sort_by === 'delivery'
              ? b.expected_delivery_date
              : b.order_date,
          ).getTime()
    return (Number.isFinite(value) ? value : 0) * direction
  })
}

export function isPurchaseOrderOverdue(po: PurchaseOrder, now = new Date()) {
  if (
    !['approved', 'ordered', 'partial'].includes(po.status) ||
    !po.expected_delivery_date
  )
    return false
  return (
    po.expected_delivery_date.slice(0, 10) <
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  )
}
