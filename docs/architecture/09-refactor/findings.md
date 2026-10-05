# Refactor Findings

> Tổng hợp các điểm cần refactor, sắp xếp theo severity. Mỗi finding có evidence từ code/DB.
>
> Severity: **🔴 Critical** (data loss / security) · **🟠 High** (bug nguy cơ) · **🟡 Medium** (debt / DX) · **🟢 Low** (cleanup).

---

## A. Trùng lặp & dead code

| ID | Sev | Mô tả | Evidence | Đề xuất |
|---|---|---|---|---|
| F-DUP-01 | ✅ | ~~`src/components/Layout.tsx` legacy~~ — **Đã xóa 2026-05-10**. App chỉ còn `MainLayout.tsx`. | – | Đóng. |
| F-DUP-02 | ✅ | ~~Trùng `/admin/*` và `/super-admin/*`~~ — **Sai**. App.tsx chỉ có `/super-admin/*`, folder `pages/admin/` chỉ là vị trí lưu mã. Đã verify `rg "path.*\"/admin" src/App.tsx` → 0 kết quả. | – | Đóng. |
| F-DUP-03 | ✅ | ~~`MorePage.tsx` ở `src/pages/` và `src/pages/mobile/`~~ — **Đã xóa file legacy `src/pages/MorePage.tsx` ngày 2026-05-10** (không có import, chỉ bản `pages/mobile/MorePage.tsx` còn được sử dụng). | git history | Đóng. |
| F-DUP-04 | 🟢 | **194 app-defined RPC chưa có caller trực tiếp từ frontend** (369 app-defined - 175 gọi từ FE). Một số được gọi từ trigger / edge / cron; phần còn lại là ứng viên dead code. | `_generated/summary.json`, `rpc-catalog.md` | Phân loại theo backend caller trước khi xoá |

## B. Lệch convention

| ID | Sev | Mô tả | Evidence | Đề xuất |
|---|---|---|---|---|
| F-CON-01 | 🟠 | Một số query thiếu `.eq('tenant_id', tenantId)` (chỉ dựa RLS) → vi phạm Core rule | `rg "supabase\.from\(" src \| rg -v "tenant_id"` cần audit | Lint rule custom + sửa từng case |
| F-CON-02 | 🟠 | UUID rỗng truyền `''` thay `null` ở vài form | `rg "uuid.*''" src/components` | Chuẩn hoá qua zod transform |
| F-CON-03 | 🟡 | Mutation đa bảng không qua RPC atomic ở vài hook | xem `_generated/hooks.json` các hook có nhiều `.from().insert/update` liên tiếp | Chuyển sang RPC `perform_*` / `transition_*` |
| F-CON-04 | 🟡 | Query keys không nhất quán (thiếu `tenantId` hoặc `hotelId`) → cache leak khi switch hotel | sample từ `_generated/hooks.json` | Áp dụng pattern `[domain, sub, tenantId, hotelId, ...]` toàn bộ |

## C. State machine rò rỉ

| ID | Sev | Mô tả | Evidence | Đề xuất |
|---|---|---|---|---|
| F-FSM-01 | ✅ | ~~~10 chỗ update `rooms.status` trực tiếp~~ — **Đã đóng 2026-05-10**: toàn bộ luồng dùng RPC `transition_room_status`; `useUpdateRoom` loại `status`; ESLint chặn cứng và DB đã revoke quyền ghi trực tiếp cột `status`. | grep + ESLint CI + DB privilege check | Đóng; giữ regression test |
| F-FSM-02 | ✅ | ~~`room_bookings.status` & `housekeeping_tasks.status` trực tiếp~~. **2026-05-10 (đợt cuối)**: refactor xong toàn bộ — `useCheckoutInspection.cancelInspection`, `useHousekeepingTasks.useCancelTask`, `RoomCheckPage` (auto-complete task khi nộp room check) đều dùng `transition_task_status`. **Lint sweep toàn dự án: 0 vi phạm**. ESLint chặn cứng vi phạm mới. | ESLint sweep ✓ | – |
| F-FSM-DEFENSE-01 | ✅ | **DB-side defense-in-depth (2026-05-10)**: `REVOKE UPDATE` table-level rồi `GRANT UPDATE (col,...)` cho tất cả cột **trừ `status`** ở 3 bảng `rooms`, `room_bookings`, `housekeeping_tasks` cho role `authenticated` & `anon`. Mọi direct UPDATE từ client tới cột `status` sẽ bị Postgres từ chối kể cả khi RLS cho phép. Chỉ RPC `transition_*` (SECURITY DEFINER, owner = `postgres`) còn quyền ghi. Verified: `has_column_privilege('authenticated', ..., 'status', 'UPDATE') = false` cho cả 3 bảng. | migration 2026-05-10 + COMMENT trên cột | Rollback: `GRANT UPDATE ON TABLE public.<table> TO authenticated;` |
| F-FSM-03 | 🟡 | Quick path room check chỉ daily/periodic — chặn ở UI; cần defense in depth ở RPC | `perform_quick_room_check` source | Thêm assert ở RPC |

## D. RLS / Security

| ID | Sev | Mô tả | Evidence | Đề xuất |
|---|---|---|---|---|
| F-SEC-01 | ✅ | ~~Bảng RLS OFF~~ — **Đã verify 138/138 bảng vật lý đều RLS ON** (`_generated/db-rls-enabled.tsv`). View được kiểm tra riêng theo `security_invoker`/policy. | `db-rls-enabled.tsv` | Đóng. |
| F-SEC-02 | ✅ | ~~SePay webhook public không auth~~ — shared secret **fail-close**, rate limit 60 request/IP/phút và IP allowlist đã có trong Edge Function. Chỉ còn việc cấu hình secret/IP thật khi triển khai. | `supabase/functions/sepay-webhook/index.ts` | Đóng về mặt code; cấu hình secret production là bước vận hành |
| F-SEC-03 | ✅ | ~~Match payment chỉ dựa ref_code text~~ — webhook và job đồng bộ đều kiểm tra amount theo tolerance của tenant; giao dịch lệch được ghi vào `payment_anomalies` để xử lý thủ công. Job đồng bộ còn yêu cầu user active có quyền, scope payment/account theo tenant (giữ account global legacy), và claim `pending` chống race/double match. | `sepay-webhook`, `sync-sepay-transactions`, `payment_anomalies` | Đóng; tiếp tục theo dõi anomaly |
| F-SEC-04 | 🟡 | Một số policy dùng `using (true)` cho SELECT (nếu có) | xem `rls-policies.md` | Thắt theo tenant + role |
| F-SEC-05 | ✅ | ~~`guest-documents` bucket public~~ — bucket hiện **private**, policy SELECT giới hạn theo tenant và mọi preview dùng signed URL có TTL. | migration `20260211093817...`, `DocumentScanner.tsx`, `mobile-scan-upload` | Đóng. |

## E. Performance

| ID | Sev | Mô tả | Evidence | Đề xuất |
|---|---|---|---|---|
| F-PERF-01 | 🟡 | Query `users` join `tenant + hotel + position` chạy mỗi 5 phút × user → có thể nặng | `src/hooks/useUser.ts` | Cache 5 phút (đã có), thêm select cụ thể |
| F-PERF-02 | 🟡 | Realtime subscribe `*` thay vì cụ thể event/filter | grep `on('postgres_changes', { event: '*'` | Filter `event` + `filter: tenant_id=eq.X` |
| F-PERF-03 | 🟡 | `queryKey` không có hotelId → switch hotel không invalidate | – | Bổ sung |

## F. Tech debt cụ thể (theo memory)

| ID | Sev | Mô tả |
|---|---|---|
| F-DBT-01 | 🟡 | Outbox + reconcile có khả năng double-apply nếu fan-out lỗi giữa chừng. Cần idempotent key đầy đủ ở `room_check_issues × side_effect_type`. |
| F-DBT-02 | 🟡 | Group payment distribution dùng convention metadata chuỗi → dễ vỡ. Nên enum + JSON schema. |
| F-DBT-03 | 🟡 | Reference codes có nhiều convention (memory `qr-payment-system-spec`). Cần 1 hàm canonical. |
| F-DBT-04 | 🟡 | **Quote checkout đã được server lưu authoritative trước payment (2026-09-20)**, nhưng báo cáo/tổng hợp tài chính vẫn còn công thức rải rác ở client và server. Nên tiếp tục gom về DB view duy nhất. |
| F-DBT-05 | 🟢 | `Hotel Asset Manager` còn sót ở vài chỗ string sau rebrand RoomQc. |

## G. RPC overload & contract drift

| ID | Sev | Mô tả | Evidence | Đề xuất |
|---|---|---|---|---|
| F-RPC-OVERLOAD-01 | ✅ | ~~`submit_room_check_lean` 2 overload~~ — **Đã DROP overload cũ (không có `_items_sent_to_laundry`) ngày 2026-05-10**. DB còn đúng 1 bản canonical. Snapshot + `db-functions.tsv` đã đồng bộ. | migration 2026-05-10, `db-functions.tsv` | Đóng. |
| F-RPC-DOC-01 | ✅ | Trước đây docs ghi sai chữ ký `transition_room_status` / `transition_booking_status` / `perform_checkin` / `perform_checkout`. Đã sửa theo `db-functions.tsv` snapshot 2026-05-10. **Đã hardened**: test `src/test/rpc-signature-drift.test.ts` chạy trong CI cho 13 RPC critical. | test ✓ | Giữ snapshot, mở rộng khi thêm RPC mới |
| F-RPC-OVERLOAD-02 | ✅ | ~~18 app RPC overload legacy~~ — đã hợp nhất/drop các overload gây mơ hồ. Chỉ còn 2 nhóm overload có chủ đích cho tương thích nội bộ: `is_super_admin` (RLS cũ) và `log_state_transition` (wrapper audit). Test whitelist ghi rõ lý do và chặn overload mới. | `rpc-signature-drift.test.ts`, migration `20260920002439...` | Đóng; chỉ mở lại khi có signature mới kèm lý do |
| F-FSM-LINT-01 | ✅ | ESLint custom rule `lovable-internal/no-direct-room-status-update` chặn cứng update trực tiếp `rooms.status` / `room_bookings.status` / `housekeeping_tasks.status`; sweep hiện tại không còn allowlist/warn legacy. | `eslint-rules/no-direct-room-status-update.js`, CI ✓ | Đóng |
| F-CI-01 | ✅ | **Mới 2026-05-10**: GitHub Action `.github/workflows/ci.yml` chạy ESLint + Vitest mỗi PR. | `.github/workflows/ci.yml` | – |
| F-SEC-RATE-01 | ✅ | **Mới 2026-05-10**: SePay webhook có rate limit 60 req/IP/phút + IP allowlist qua env `SEPAY_ALLOWED_IPS`. | `sepay-webhook/index.ts` | Đặt `SEPAY_ALLOWED_IPS` ở Cloud Secrets khi có danh sách IP chính thức từ SePay |

---

## Roadmap refactor đề xuất (4 sprint × 2 tuần)

### Sprint R1 — Security & Integrity (đã hoàn tất phần code)
- ✅ F-SEC-01, F-SEC-02, F-SEC-03
- ✅ F-FSM-01, F-FSM-02, F-FSM-DEFENSE-01
- Còn vận hành: cấu hình secret/IP SePay và xác nhận trên môi trường VPS thật.

### Sprint R2 — Convention enforcement
- F-CON-01 (lint), F-CON-02 (zod transform), F-CON-04 (query keys)
- F-PERF-02, F-PERF-03

### Sprint R3 — Domain consolidation
- ✅ F-DUP-01, F-DUP-02, F-DUP-03
- F-DUP-04 (phân loại 194 RPC chưa có caller; chưa xoá tự động)
- F-DBT-04 (DB view tài chính; quote checkout đã được chuẩn hóa trước payment)

### Sprint R4 — Hardening
- F-DBT-01 (outbox idempotent), F-DBT-02 (enum metadata), F-DBT-03 (canonical ref code)
- F-FSM-03 (defense in depth Quick path)
- F-SEC-04

---

## Cách dùng tài liệu này

1. Đọc `_generated/*.json` + `_generated/db-*.tsv` để có sự thật mới nhất → re-run scripts khi schema đổi.
2. Mỗi PR refactor → đính kèm finding ID xử lý.
3. Khi đóng finding → cập nhật bảng (chuyển sang ✅ hoặc xóa).
4. Khi phát hiện finding mới → thêm vào đúng nhóm A-F.
