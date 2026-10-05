# Phase 1 — Foundation Hardening: Rollout & Rollback Notes

**Scope:** audit log helper, read-only tenant flag, payment tolerance,
RoomCheck server-side guard, edge rate limiting.
**Risk:** medium — touches RLS triggers on hot tables (bookings, payments).
**Strategy:** 3-stage rollout (already executed L1 + L2 + L3).

---

## What shipped

### Lượt 1 — Schema foundation
- `tenants.is_read_only`, `read_only_reason`, `read_only_since`, `payment_tolerance_vnd`
- `room_checks.check_mode`
- `audit_log` + `log_state_transition()` helper
- `enforce_read_only_mutation` BEFORE INSERT/UPDATE/DELETE on 9 tables
- `auto-apply-read-only-hourly` pg_cron job
- UI: `<ReadOnlyBanner />`, `useReadOnlyMode`, `mapDbError()`

### Lượt 2 — Server validation + permission gates
- `validate_room_check_context(room_id, task_id, check_mode)` RPC
- `useRoomCheckGuard` hook + role gate on `/my-tasks`
- SePay webhook reads `payment_tolerance_vnd` per tenant (in-memory cached)
- Vietnamese error mapping for `TENANT_READ_ONLY`, `ROOM_NOT_FOUND`,
  `TASK_NOT_ASSIGNED_TO_USER`, `TENANT_MISMATCH`

### Lượt 3 — Rate limiting + tests
- `rate_limit_hits` table + `check_rate_limit()` RPC (atomic insert/count)
- Shared helper `supabase/functions/_shared/rateLimit.ts` (fail-open)
- Applied to `send-password-reset` (3/email/10m, 10/IP/10m)
- Applied to `verify-otp` (10/email/10m, 30/IP/10m)
- Manual SQL test suite at `supabase/tests/phase1_foundation.sql`

---

## QA checklist (manual)

- [ ] Đặt `tenants.is_read_only = true` cho 1 tenant test → mọi mutation
      (booking/payment/check-in) trả lỗi `TENANT_READ_ONLY` mapped sang VN.
- [ ] Banner vàng `<ReadOnlyBanner />` hiển thị ở mọi page trong tenant đó.
- [ ] Tắt cờ → mọi flow hoạt động lại bình thường, không cần restart client.
- [ ] Kiểm tra `audit_log`: mỗi lần check-in/checkout/payment status thay đổi
      đều có dòng mới với `from_state`, `to_state`, `actor_user_id`.
- [ ] Mở `/my-tasks` bằng staff không thuộc tenant → bị chặn (redirect hoặc
      thông báo "Không có quyền").
- [ ] Test rate-limit: gọi `send-password-reset` 4 lần liên tiếp cùng email →
      lần thứ 4 nhận HTTP 429 với message tiếng Việt.
- [ ] Sửa `payment_tolerance_vnd` của 1 tenant → SePay webhook tiếp theo
      dùng giá trị mới (kiểm tra logs).
- [ ] Cron `auto-apply-read-only-hourly` chạy đúng giờ (kiểm tra
      `cron.job_run_details`).

---

## Rollback steps

### Toàn phần (nếu cần huỷ Phase 1)
```sql
-- 1. Drop rate limit
DROP FUNCTION IF EXISTS public.cleanup_rate_limit_hits();
DROP FUNCTION IF EXISTS public.check_rate_limit(text, int, int);
DROP TABLE IF EXISTS public.rate_limit_hits;

-- 2. Drop room check guard
DROP FUNCTION IF EXISTS public.validate_room_check_context(uuid, uuid, text);

-- 3. Drop read-only enforcement triggers (lặp cho 9 bảng)
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.bookings;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.payment_transactions;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.room_checks;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.housekeeping_tasks;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.maintenance_requests;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.laundry_batches;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.invoices;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.items;
DROP TRIGGER IF EXISTS enforce_read_only_mutation ON public.rooms;
DROP FUNCTION IF EXISTS public.enforce_read_only_mutation();

-- 4. Drop audit helper (ONLY if no consumer relies on it)
DROP FUNCTION IF EXISTS public.log_state_transition(uuid, text, uuid, text, text, jsonb);

-- 5. Drop pg_cron job
SELECT cron.unschedule('auto-apply-read-only-hourly');

-- 6. Drop columns (last — destructive)
ALTER TABLE public.tenants
  DROP COLUMN IF EXISTS is_read_only,
  DROP COLUMN IF EXISTS read_only_reason,
  DROP COLUMN IF EXISTS read_only_since,
  DROP COLUMN IF EXISTS payment_tolerance_vnd;
ALTER TABLE public.room_checks DROP COLUMN IF EXISTS check_mode;
DROP TABLE IF EXISTS public.audit_log;
```

### Rollback chỉ rate-limit (nếu khoá nhầm user thật)
```sql
DELETE FROM public.rate_limit_hits;          -- xoá toàn bộ counter
-- hoặc xoá theo bucket:
DELETE FROM public.rate_limit_hits WHERE bucket_key LIKE 'pwd-reset:%';
```
Helper `checkRateLimit` đã fail-open → nếu DB lỗi, edge function vẫn phục vụ.

### Rollback chỉ read-only mode
- Tắt cờ thủ công: `UPDATE tenants SET is_read_only = false WHERE id = ...;`
- Tạm vô hiệu cron: `SELECT cron.unschedule('auto-apply-read-only-hourly');`

---

## Files changed in Lượt 3

- **created** `supabase/functions/_shared/rateLimit.ts`
- **created** `supabase/tests/phase1_foundation.sql`
- **created** `docs/phase1-foundation-hardening-rollout.md` (this file)
- **edited** `supabase/functions/send-password-reset/index.ts`
- **edited** `supabase/functions/verify-otp/index.ts`
- **migration** `rate_limit_hits` table + `check_rate_limit()` RPC

## Còn thiếu / theo dõi tiếp

- Áp rate-limit cho `mobile-scan-upload`, `scan-guest-document`,
  `reset-password-with-otp` (cùng pattern, 1-line wire-up).
- Tự động hoá test SQL bằng pgTAP hoặc Vitest+supabase-js (chưa có harness).
- Bổ sung trigger audit cho các transition của `laundry_batches` và
  `maintenance_requests` (Lượt sau hoặc Phase 2).
- Theo dõi metric `cron.job_run_details` cho cron read-only hàng tuần.
