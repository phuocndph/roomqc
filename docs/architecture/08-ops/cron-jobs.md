# Cron Jobs

> ⚠️ Schema `cron` không cấp quyền đọc cho session hiện tại — danh sách dưới đây suy ra từ tên Edge Function. Cần xác nhận lại trong dashboard.

## Edge functions có hành vi định kỳ

- **`check-shift-overtime`** — Get all staff currently on shift with long duration
- **`check-subscription-status`** — * Cron job to check and update subscription statuses * * This function should be called periodically (e.g., every hour) to:
- **`cleanup-sessions`** — Handle CORS preflight
- **`dead-stock-digest`** — Weekly dead-stock email digest
- **`expire-pending-payments`** — Handle CORS preflight requests
- **`laundry-compensation-cron`** — * Cron edge — chạy 6h/lần. * Gọi RPC mark_batches_compensation_needed để chuyển các batch * `partially_received` quá hạn sang `compensation_needed`.
- **`lift-expired-dnd-oos`** — Cron-triggered: gỡ DND/OOS hết hạn bằng cách gọi RPC `lift_expired_dnd_oos`.
- **`process-room-check-outbox`** — esm.sh/@supabase/supabase-js@2.45.0'
- **`reconcile-room-check-side-effects`** — * Cron — chạy mỗi 6h. * So khớp room_check_issues vs room_check_issue_outbox: * - Đếm dead-letter trong cửa sổ N giờ
- **`setup-cron-auth`** — One-shot admin tool to inject x-cron-secret header into pg_cron jobs

## Cần ghi rõ schedule (TODO)

| Function | Schedule (giả định) | Mục đích |
|---|---|---|
| `expire-pending-payments` | `*/5 * * * *` | Hủy QR thanh toán quá hạn |
| `check-subscription-status` | `0 1 * * *` | Đánh dấu suspended/grace |
| `check-shift-overtime` | `*/15 * * * *` | Cảnh báo ca làm quá giờ |
| `cleanup-sessions` | `0 3 * * *` | Xóa session scan cũ |
| `dead-stock-digest` | `0 8 * * 1` | Báo dead stock hàng tuần |
| `laundry-compensation-cron` | `0 9 * * *` | Auto chốt compensation |
| `lift-expired-dnd-oos` | `*/10 * * * *` | Auto lift DND/OOS hết hạn |
| `process-room-check-outbox` | `* * * * *` | Fan-out side effects sau room check |
| `reconcile-room-check-side-effects` | `*/30 * * * *` | Bù trừ side effect lỗi |
