import { useMemo } from 'react'
import {
  useLatestConsumptionSnapshots,
} from '@/hooks/useConsumptionAnalytics'
import { useLowStockItems } from '@/hooks/useInventoryDashboard'
import { useOutOfStockCount } from '@/hooks/useOutOfStockCount'
import type { ConsumptionSnapshot } from '@/types/inventory-analytics.types'

/**
 * Centralized stockout selectors for Inventory Hub.
 *
 * Notes:
 * - `useLatestConsumptionSnapshots` đã DISTINCT ON server-side (RPC
 *   `get_latest_consumption_snapshots`) nên rows trả về đã 1-row/item.
 *   Vẫn dedup defensive phòng RPC bug.
 * - `outOfStockCount` ưu tiên `useOutOfStockCount` (head-only count, không
 *   bị giới hạn 200 dòng như `useLowStockItems`).
 */
export interface StockoutData {
  /** Latest snapshot per item_id (deduped). */
  latestById: Map<string, ConsumptionSnapshot>
  /** Latest snapshots as array, sorted by stock_days_remaining ASC (nulls last). */
  latestSorted: ConsumptionSnapshot[]
  /** Count of items running out within 7 days (forecasted). */
  soonOutCount: number
  /** Count of items running out within 14 days (forecasted). */
  forecast14dCount: number
  /** Count of items already fully out of stock (quantity_in_stock === 0). */
  outOfStockCount: number
  /** Top N forecast rows for the 14-day widget (deduped, sorted). */
  forecastTopRows: ConsumptionSnapshot[]
  isLoading: boolean
}

export function useStockoutItems(forecastTopN: number = 8): StockoutData {
  const { data: snapshots, isLoading: snapLoading } =
    useLatestConsumptionSnapshots(500)
  const { data: lowItems, isLoading: lowLoading } = useLowStockItems(200)
  const { data: outOfStockCountAccurate, isLoading: ooLoading } =
    useOutOfStockCount()

  return useMemo<StockoutData>(() => {
    // 1. Dedup snapshots: keep latest row per item_id by snapshot_date.
    const latestById = new Map<string, ConsumptionSnapshot>()
    for (const s of snapshots ?? []) {
      const cur = latestById.get(s.item_id)
      if (!cur || (cur.snapshot_date ?? '') < (s.snapshot_date ?? '')) {
        latestById.set(s.item_id, s)
      }
    }

    const latestSorted = Array.from(latestById.values()).sort((a, b) => {
      const av = a.stock_days_remaining ?? Number.POSITIVE_INFINITY
      const bv = b.stock_days_remaining ?? Number.POSITIVE_INFINITY
      return av - bv
    })

    const soonOutCount = latestSorted.filter(
      (s) =>
        s.stock_days_remaining !== null &&
        s.stock_days_remaining >= 0 &&
        s.stock_days_remaining < 7,
    ).length

    const forecast14d = latestSorted.filter(
      (s) =>
        s.stock_days_remaining !== null &&
        s.stock_days_remaining >= 0 &&
        s.stock_days_remaining < 14,
    )

    // "Đã hết" — ưu tiên count chuẩn từ DB; fallback về lowItems nếu chưa load.
    const fallbackOutOfStock = (lowItems ?? []).filter(
      (it: any) => Number(it.quantity_in_stock ?? 0) === 0,
    ).length
    const outOfStockCount =
      typeof outOfStockCountAccurate === 'number'
        ? outOfStockCountAccurate
        : fallbackOutOfStock

    return {
      latestById,
      latestSorted,
      soonOutCount,
      forecast14dCount: forecast14d.length,
      outOfStockCount,
      forecastTopRows: forecast14d.slice(0, forecastTopN),
      isLoading: snapLoading || lowLoading || ooLoading,
    }
  }, [snapshots, lowItems, outOfStockCountAccurate, snapLoading, lowLoading, ooLoading, forecastTopN])
}

