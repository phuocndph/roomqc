import type { LaundryBatchWithVendor } from '@/types/laundry.types'

export function sortLaundryBatches(batches: LaundryBatchWithVendor[]) {
  return [...batches].sort((a, b) => {
    const ready = Number(b.status === 'ready') - Number(a.status === 'ready')
    if (ready) return ready
    const aDate = a.expected_return_date
      ? new Date(a.expected_return_date).getTime()
      : Infinity
    const bDate = b.expected_return_date
      ? new Date(b.expected_return_date).getTime()
      : Infinity
    return aDate - bDate || a.batch_code.localeCompare(b.batch_code)
  })
}

export type LaundryReceiptItem = {
  item_id: string
  quantity_returned: number
  quantity_lost: number
  quantity_damaged: number
  return_condition: string
}

export function updateLaundryReceipt(
  item: LaundryReceiptItem,
  delivered: number,
  field: 'quantity_returned' | 'quantity_lost' | 'quantity_damaged',
  value: number,
): LaundryReceiptItem {
  const quantity = Number.isFinite(value)
    ? Math.max(0, Math.min(delivered, Math.floor(value)))
    : 0
  const result = { ...item, [field]: quantity }
  if (field === 'quantity_returned') {
    result.quantity_damaged = Math.min(
      result.quantity_damaged,
      delivered - quantity,
    )
    result.quantity_lost = delivered - quantity - result.quantity_damaged
  } else if (field === 'quantity_lost') {
    result.quantity_damaged = Math.min(
      result.quantity_damaged,
      delivered - quantity,
    )
    result.quantity_returned = delivered - quantity - result.quantity_damaged
  } else {
    result.quantity_lost = Math.min(result.quantity_lost, delivered - quantity)
    result.quantity_returned = delivered - quantity - result.quantity_lost
  }
  return result
}
