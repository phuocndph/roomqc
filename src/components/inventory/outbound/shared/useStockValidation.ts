import { useMemo } from 'react'
import type { OutboundItemInput } from './types'

interface Options {
  /** Override available stock per item id (from warehouse-specific query) */
  stockMap?: Record<string, { quantity: number }>
  /** Threshold for low-stock warning (remaining after export) */
  lowStockThreshold?: number
}

/**
 * Shared stock validation used by both QuickOutboundDialog and
 * MobileOutboundForm. Prefers warehouse-specific stockMap when
 * available; falls back to item.available_quantity.
 */
export function useStockValidation(
  items: OutboundItemInput[],
  { stockMap, lowStockThreshold = 10 }: Options = {},
) {
  return useMemo(() => {
    const getAvail = (i: OutboundItemInput) =>
      stockMap?.[i.item_id]?.quantity ?? i.available_quantity ?? 0

    const hasStockError = items.some(i => i.quantity > getAvail(i))
    const lowStockWarnings = items.filter(i => {
      const avail = getAvail(i)
      return (
        avail > 0 &&
        i.quantity <= avail &&
        avail - i.quantity < lowStockThreshold
      )
    })

    return { hasStockError, lowStockWarnings, getAvail }
  }, [items, stockMap, lowStockThreshold])
}
