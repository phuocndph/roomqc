---
name: Inventory Intelligence C2 — Consumption snapshots & dead stock
description: consumption_snapshots table, refresh/dead-stock/trend RPCs, hourly cron, contracts for analytics UI
type: feature
---

# Phase C2 — Consumption Snapshots & Dead Stock

## Schema
- `public.consumption_snapshots(tenant_id, hotel_id, item_id, snapshot_date, qty_consumed_7d/30d/90d, avg_daily_consumption, stock_on_date, stock_days_remaining)`
- UNIQUE `(tenant_id, hotel_id, item_id, snapshot_date)` → cron idempotent.
- Indexes: `(tenant_id, snapshot_date DESC)`, `(item_id, snapshot_date DESC)`, `(tenant_id, hotel_id, snapshot_date DESC)`.
- RLS: SELECT cho owner/manager/super_admin/hotel-assigned staff trong tenant; INSERT/UPDATE chỉ `service_role`.

## RPCs (SECURITY DEFINER, search_path=public)
- `refresh_consumption_snapshots(_tenant_id, _hotel_id?)` → UPSERT snapshot ngày hôm nay. Outbound only (`transaction_type='out'`), bỏ qua `adjust`. `avg_daily = sum_30d / 30`. `stock_days_remaining = stock / avg_daily` (NULL nếu avg=0). Trả `{processed, snapshot_date, tenant_id}`.
- `get_dead_stock_report(_tenant_id, _hotel_id?, _days_threshold default 90)` → items active, stock>0, `last_outbound_at IS NULL OR < now() - threshold`. Sort by total_value DESC.
- `get_consumption_trend(_item_id, _days default 90)` → series ngày-qty_out, gap-fill 0 bằng `generate_series`.

## Cron
- `consumption-snapshots-hourly` — `0 * * * *` UTC, gọi `refresh_consumption_snapshots(tenant_id)` cho mọi tenant `subscription_status='active'`. Đăng ký qua `cron.schedule`, jobid 7.

## Hooks (frontend contracts)
- `src/types/inventory-analytics.types.ts` — `ConsumptionSnapshot`, `DeadStockRow`, `ConsumptionTrendPoint`, `RefreshSnapshotResult`, `InventoryAlertSummary`.
- `useDeadStockReport(days=90)` — All-Hotels mode → `_hotel_id=null`.
- `useLatestConsumptionSnapshots(limit=200)` — query trực tiếp bảng (RLS lo phần phân quyền).
- `useConsumptionTrend(itemId, days=90)`.
- `useRefreshSnapshots()` mutation — manual trigger, invalidate `consumption-snapshots-latest` + `dead-stock-report`.

## Tests (`supabase/tests/inventory_intelligence_c2.sql`)
11/11 assertions pass:
- T1: 7d/30d đúng, `adjust` bị bỏ qua.
- T2: `days_remaining = stock / avg`.
- T3: `days_remaining` NULL khi avg=0.
- T4: idempotent same-day.
- T5: item inactive bị loại khỏi snapshot.
- T6: dead-stock include item ngừng xuất, exclude inactive + recently-moved.
- T7: trend đúng số ngày + tổng đúng.

## Còn thiếu (chuyển sang build kế tiếp)
- UI pages: `/inventory/dead-stock`, `/inventory/analytics`, mobile `RestockAlertSheet`, dashboard widget.
- Auto-reorder opt-in (dùng `avg_daily × lead_time × 1.3` thay `reorder_point` cố định).
- Weekly dead-stock email digest edge function.
- Notification toggles trong `NotificationSettingsPage`.
