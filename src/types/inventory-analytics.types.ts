// Phase C2 — Inventory Intelligence Analytics contracts
// All values returned by Supabase RPCs are mapped 1:1 here.

export interface ConsumptionSnapshot {
  id: string
  tenant_id: string
  hotel_id: string
  item_id: string
  snapshot_date: string // ISO date (YYYY-MM-DD)
  qty_consumed_7d: number
  qty_consumed_30d: number
  qty_consumed_90d: number
  avg_daily_consumption: number
  stock_on_date: number
  stock_days_remaining: number | null // NULL when avg_daily=0 (cannot project)
  created_at: string
  item?: {
    id: string
    name: string
    item_code: string
    unit_price: number | null
  } | null
}

export interface DeadStockRow {
  item_id: string
  item_code: string
  item_name: string
  hotel_id: string
  category_id: string | null
  asset_group: string | null
  quantity_in_stock: number
  unit_price: number
  total_value: number
  last_outbound_at: string | null
  days_since_last_out: number | null // NULL = never went out
}

export interface ConsumptionTrendPoint {
  day: string // ISO date
  qty_out: number
}

export interface RefreshSnapshotResult {
  processed: number
  snapshot_date: string
  tenant_id: string
}

// Aggregated dashboard contract used by InventoryAlertsWidget (C2)
export interface InventoryAlertSummary {
  low_stock_count: number
  pending_reorder_count: number
  dead_stock_value: number
  dead_stock_count: number
}
