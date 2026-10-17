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

## Cập nhật đã kiểm thử local — 17/10/2026

`expire-pending-payments` đã chuyển sang một RPC service-only
`expire_pending_subscription_payments(p_limit default500,p_tenant_id defaultNULL)`.
Payment/invoice expiry commit nguyên tử, SKIP LOCKED không ghi đè confirmation;
cutoff giữ 24h, trả expired_count/cancelled_invoices/skipped_count/busy.
`busy=true` là sweep khác đang giữ lock, không phải lỗi và không chứng minh
queue đã được xử lý. Cần theo dõi lần chạy cuối thành công và backlog.

**Chưa cài hoặc xác nhận lịch production trong lượt này.** Bảng schedule bên
trên vẫn là tài liệu giả định, không phải bằng chứng cron đang hoạt động.
Không gọi worker global chỉ để smoke-test trên DB có dữ liệu người dùng;
integration local dùng service RPC scope đúng tenant fixture. Xem
[báo cáo](subscription-checkout-drafts-local-validation-2026-10-17.md) và
[các mục khóa/quyền để làm sau](roomqc-deferred-access-and-decisions-2026-10-17.md).
