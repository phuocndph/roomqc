---
name: Inventory Intelligence C1 — Reorder Suggestions
description: Reorder suggestion engine — items có reorder_point/max/lead_time/preferred_vendor; bảng reorder_suggestions; trigger realtime sinh suggestion khi outbound; RPC compute/approve (gom theo vendor → PO draft)/ignore; Sidebar badge reorderSuggestions; ReorderSettingsDialog; KHÔNG dùng cron (realtime trigger), KHÔNG feature flag (bật mass).
type: feature
---

# Inventory Intelligence C1

## Backend
- `items` cộng cột: `reorder_max_qty`, `lead_time_days` (default 7), `is_perishable`, `last_outbound_at`, `preferred_vendor_id` (FK vendors).
- Bảng `reorder_suggestions` (tenant_id + hotel_id + item_id, status: pending|approved|ignored|converted). Unique partial index `(tenant_id, hotel_id, item_id) WHERE status='pending'`.
- RLS: SELECT cho user trong tenant; UPDATE cho super_admin/owner/hotel_manager/department_manager; KHÔNG có DELETE policy (giữ audit).
- Trigger `trg_inventory_out_reorder` (AFTER INSERT inventory_transactions kiểu 'out'): cập nhật `last_outbound_at` + gọi `compute_reorder_suggestions(tenant, hotel, item)` realtime — KHÔNG dùng cron daily.

## RPC (SECURITY DEFINER, search_path=public)
- `compute_reorder_suggestions(_tenant_id, _hotel_id?, _item_id?)` → `{created, skipped}`. Idempotent qua INSERT WHERE NOT EXISTS. Tôn trọng `ignored_until >= today`. `suggested_qty = max(reorder_max_qty, reorder_point*2) - effective_stock`.
- `approve_reorder_suggestions(_ids[])` → `{po_ids, converted_count, skipped_no_vendor_count, skipped_no_vendor_ids}`. Gom theo `(hotel_id, preferred_vendor_id)` → mỗi nhóm 1 PO `status='draft'`. **BỎ QUA** suggestion thiếu `preferred_vendor_id` (vì `purchase_orders.vendor_id` NOT NULL) — báo lại trong `skipped_no_vendor_*`. KHÔNG insert `purchase_order_items.total_price` (GENERATED column). Permission: super_admin|owner|hotel_manager. Audit qua `log_state_transition` (best-effort).
- `ignore_reorder_suggestion(_id, _reason, _ignore_days=7)`.
- Backfill `last_outbound_at` từ `inventory_transactions` 1 lần trong migration.

## Frontend
- `useReorderSuggestions(status)` — realtime postgres_changes channel `reorder-suggestions-{tenantId}` invalidate cả `reorder-suggestions` + `reorder-pending-count`.
- `useReorderPendingCount`, `useApproveReorderSuggestions`, `useIgnoreReorderSuggestion`, `useComputeReorderSuggestions` (hook quét thủ công).
- VN error mapping: unauthenticated, forbidden_approve/ignore, no_suggestions, no_pending_suggestions, cross_tenant_not_allowed, not_pending.
- `usePendingCounts` thêm `reorderSuggestions` + cộng vào `inventoryTotal`.
- Page `/inventory/reorder` — table bulk select, filter reason+vendor, nút "Quét lại ngay", button "Cài đặt"/"Bỏ qua" per row. All Hotels mode disable nút Duyệt.
- `ApproveReorderDialog` — preview gom theo vendor, tổng giá trị; cảnh báo item chưa gán vendor.
- `ReorderSettingsDialog` — mở từ row, sửa `reorder_point`, `reorder_max_qty`, `lead_time_days`, `preferred_vendor_id`, `is_perishable` cho item đó (KHÔNG sửa ItemFormPage để tránh rủi ro).
- Sidebar: entry `reorder` (PackageSearch icon) trong group "Xuất nhập kho" với badge `reorderSuggestions`.

## Cố ý KHÔNG làm
- KHÔNG cron daily — realtime trigger đủ.
- KHÔNG feature flag — bật mass mọi tenant.
- KHÔNG sửa ItemFormPage — settings nằm ở dialog riêng.
- KHÔNG cho DELETE suggestion (chỉ ignored/converted).
