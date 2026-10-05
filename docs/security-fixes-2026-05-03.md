# Security Fixes — 2026-05-03

Tài liệu ghi nhận các vấn đề bảo mật phát hiện qua security scan và trạng thái xử lý.
Đã verify lại bằng `run_security_scan` ngày 2026-05-03.

> **Historical snapshot.** Bảng dưới đây được lập ngày 2026-05-03. Trạng thái hiện tại
> phải đối chiếu với migration/schema local và `docs/architecture/09-refactor/findings.md`;
> các mục từng ghi Pending/Ignore bên dưới đã được cập nhật lại để không gây hiểu nhầm.

---

## 1. Tổng quan trạng thái

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `booking_payments` cho phép đọc công khai | **error** | ✅ Fixed |
| 2 | View `user_with_levels` có thể bypass RLS | **warn** | ✅ Fixed |
| 3 | Bucket `guest-documents` public | **error** | ✅ Fixed — bucket private + signed URL |
| 4 | Realtime `realtime.messages` chưa có RLS | **error** | ✅ Fixed trong migration local; cần verify khi deploy hosted |
| 5 | SePay webhook chưa bắt buộc signature | **warn** | ✅ Fixed về mặt code — fail-close; cần set secret/IP thật |
| 6 | Supabase linter long-tail (≈460 warning/info) | **warn/info** | 🟡 Backlog |

---

## 2. Đã sửa

### 2.1 `booking_payments` — Lộ dữ liệu thanh toán công khai

**Vấn đề**
- Policy `Allow public read booking_payments by id` áp dụng cho role `public` với `USING (true)`.
- Bất kỳ ai (chưa đăng nhập) cũng có thể đọc toàn bộ payment records: số tiền, tên khách, số phòng, transaction reference, dữ liệu tài chính của mọi tenant.

**Fix**
```sql
DROP POLICY IF EXISTS "Allow public read booking_payments by id"
  ON public.booking_payments;
```

**Sau khi fix**
- Chỉ còn policy `booking_payments_select` (authenticated, scoped theo `tenant_id = users.tenant_id`).
- Insert/Update đã có policy tenant-scoped sẵn.
- Verify: scan ngày 2026-05-03 không còn flag finding này.

> ⚠️ Quy tắc: Không bao giờ tái lập policy `USING (true)` cho `booking_payments` hay bất kỳ bảng tài chính/PII nào.

---

### 2.2 View `user_with_levels` — Bypass RLS

**Vấn đề**
- View chứa PII: `email`, `phone`, `full_name`, `status`, `tenant_id`...
- Mặc định view chạy với quyền của owner → bỏ qua RLS của bảng `users` → có thể lộ dữ liệu xuyên tenant.

**Fix**
```sql
DROP VIEW IF EXISTS public.user_with_levels;
CREATE VIEW public.user_with_levels
WITH (security_invoker = true)
AS
SELECT u.id, u.email, u.full_name, u.phone, u.avatar_url,
       u.tenant_id, u.hotel_id, u.user_level_code, u.is_super_admin,
       ul.name AS user_level_name, ul.hierarchy_level,
       u.status, u.last_login_at, u.login_count, u.account_locked, u.created_at
FROM users u
LEFT JOIN user_levels ul ON ul.code = u.user_level_code
WHERE u.deleted_at IS NULL;
```

> ⚠️ Quy tắc: Mọi view đụng tới bảng nhạy cảm bắt buộc `WITH (security_invoker = true)`.

---

## 3. Đã xử lý sau snapshot

### 3.1 Bucket `guest-documents` — đã chuyển private

Bucket hiện có `public = false`; preview dùng signed URL TTL 1 giờ.

**Mitigation hiện có**
- Policy `guest_documents_tenant_select/insert/delete` giới hạn theo folder tenant.
- `DocumentScanner.tsx` và `mobile-scan-upload` dùng `createSignedUrl`.
- Edge function `mobile-scan-upload` validate session token trước khi proxy upload.

**Verify local**: query `storage.buckets` trả `guest-documents.public = false`.

---

## 4. Còn việc vận hành / hosted

### 4.1 Realtime channel — đã khóa local

Migration `20260519073010_...` bật RLS trên `realtime.messages` và chỉ cho phép
`authenticated` đọc extension `postgres_changes`; dữ liệu nguồn vẫn chịu RLS từng bảng.

**Khi deploy hosted/VPS**
1. Xác nhận migration này đã chạy trên project đích.
2. Kiểm tra subscription dùng filter `tenant_id`/`hotel_id` phù hợp.
3. Không mở lại policy đọc `realtime.messages` với `USING (true)`.

---

### 4.2 SePay webhook — fail-close đã bật

**Trạng thái hiện tại**
- `SEPAY_API_KEY` là bắt buộc; thiếu secret trả `503` (không còn fallback unauthenticated).
- Có rate limit 60 request/IP/phút và allowlist tùy chọn qua `SEPAY_ALLOWED_IPS`.
- `sync-sepay-transactions` cũng từ chối chạy nếu thiếu API key; chỉ user active
  có quyền owner/super-admin được gọi, payment và tài khoản ngân hàng được scope
  theo tenant, đồng thời hỗ trợ nhiều tài khoản mà không dùng `.single()`.

**Hành động cho production**
1. Tạo secret `SEPAY_API_KEY` trong Lovable Cloud → Secrets.
2. Vào SePay dashboard → bật **"Có chứng thực"** và nhập đúng API key.
3. Verify log `payment_webhook_logs`: event mới có `gateway = 'sepay'`, `event_type` và `processed/error` đúng trạng thái.

---

### 4.3 Supabase linter long-tail

Tổng ≈460 warning/info từ scan, gồm:
- `function_search_path_mutable` — function chưa `SET search_path = public`.
- `materialized_view_in_api` — MV expose qua Data API.
- `extension_in_public` — extension cài ở schema `public`.
- `rls_enabled_no_policy` — bảng bật RLS nhưng chưa có policy nào.
- Leaked password protection (HIBP) chưa bật.

**Kế hoạch**: xử lý theo từng module, không regress. Bật HIBP qua `configure_auth` khi có cửa sổ release.

---

## 5. Quy tắc bảo mật cần nhớ

(đã được lưu vào `@security-memory` để guide các scan tương lai)

- **Không bao giờ**:
  - Policy `USING (true)` cho bảng tài chính/PII.
  - Lưu role ở `users`/`profiles` (phải để ở `user_roles`).
  - Sửa `src/integrations/supabase/{client,types}.ts` hay `.env`.
  - Client-side-only authorization (luôn re-check qua RLS / `has_user_permission` RPC).
- **Mọi view nhạy cảm** phải `WITH (security_invoker = true)`.
- **Mọi function mới** phải `SET search_path = public` và `SECURITY INVOKER` mặc định (trừ khi có lý do escalation rõ ràng).
- **Mutation đa bảng** đi qua RPC atomic + audit log (`log_state_transition`).
- **Bucket `guest-documents`** là private; preview chỉ dùng signed URL.
- **Edge functions `verify_jwt = false`** (sepay-webhook, telegram-webhook, mobile-scan-upload, OTP flows...) là cố ý — mỗi function tự verify (signature/OTP/session token).

---

## 6. File & migration liên quan

- Migration: `supabase/migrations/<timestamp>_drop_public_booking_payments_and_invoker_view.sql`
- Memory: `mem://~security-memory` (đã cập nhật)
- Tài liệu: `docs/security-fixes-2026-05-03.md` (file này)

---

## 7. Verify checklist

- [x] Re-run `security--run_security_scan` → `booking_payments_public_read` không còn xuất hiện.
- [x] Re-run scan → `user_with_levels_no_rls_check` không còn xuất hiện.
- [x] `guest-documents` chuyển private + signed URL.
- [x] Realtime `realtime.messages` có RLS policy giới hạn authenticated postgres_changes ở local.
- [ ] `SEPAY_API_KEY`/`SEPAY_ALLOWED_IPS` được set với giá trị production và đã test webhook thật.
- [ ] Bật Leaked Password Protection (HIBP) khi có cửa sổ release.
