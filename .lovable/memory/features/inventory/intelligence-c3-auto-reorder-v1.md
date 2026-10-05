---
name: Inventory Intelligence C3 — Auto-reorder & Dead-stock digest
description: Auto-reorder opt-in trên items (auto_reorder_enabled + safety_factor); RPC compute_auto_reorder_suggestions dùng avg_daily × lead_time × safety_factor; cron auto-reorder-daily 06:00 UTC; edge function dead-stock-digest gửi email weekly thứ 2 01:00 UTC; mobile RestockAlertSheet (3 tile critical/dead/pending); 2 toggles email_dead_stock_digest + email_critical_stock trong NotificationSettings.
type: feature
---

# Inventory Intelligence C3

## Backend
- `items.auto_reorder_enabled` (bool, default false), `items.safety_factor` (numeric, default 1.3).
- `notification_preferences.email_dead_stock_digest`, `email_critical_stock` (bool, default true).
- RPC `compute_auto_reorder_suggestions(_tenant, _hotel?)`: với mỗi item bật auto, đọc `avg_daily_consumption` từ snapshot 30d mới nhất, target = ceil(avg × lead_time × safety_factor), chỉ insert suggestion `reason='auto_predicted'` khi target > effective_stock và không trùng pending/ignored hợp lệ.
- RPC `run_auto_reorder_daily()` lặp tất cả tenant active/trial.
- Cron `auto-reorder-daily` 06:00 UTC, `dead-stock-digest-weekly` 01:00 UTC thứ 2 (≈ 08:00 ICT).

## Edge Function
- `dead-stock-digest`: query `get_dead_stock_report(_,_,90)` cho mọi tenant active, lấy users có `email_dead_stock_digest=true`, gửi qua Resend (HTML table top 50). `?dryRun=1` để test, `?tenant_id=` để chạy 1 tenant.

## Frontend
- `RestockAlertSheet` (mobile bottom sheet 85vh): 3 tile pendingReorder/critical(<7d)/dead(≥90d) → deep link `/inventory/reorder|analytics|dead-stock`; list critical sort theo days remaining; list dead top 10 theo total_value.
- Tích hợp ở `MobileInventoryDashboard` qua nút "Cảnh báo tồn kho" + badge.
- `ReorderSettingsDialog` thêm section "Tự động gợi ý đặt hàng" + input safety_factor (1–3, step 0.1).
- `NotificationSettingsPage` thêm 2 Switch dưới email weekly report.

## Cố ý KHÔNG làm
- KHÔNG auto-approve PO từ auto suggestion (vẫn cần manager duyệt qua flow C1).
- KHÔNG gộp `compute_reorder_suggestions` (below_min) và `compute_auto_reorder` — cùng tận dụng UNIQUE pending per item, ai chạy trước thì giữ.
- KHÔNG track open/click email digest (chỉ Resend logs).
