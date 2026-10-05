# Refactor Roadmap

> 4 sprint × 2 tuần. Sắp xếp theo impact / effort / risk.

## Sprint R1 — Security & Integrity (must)

**Mục tiêu**: bịt các lỗ hổng có thể gây mất tiền / leak data / lệch dữ liệu.

| Task | Findings | Trạng thái |
|---|---|---|
| Bật RLS cho mọi bảng public | F-SEC-01 | ✅ 138/138 bảng vật lý |
| SePay webhook: shared secret fail-close + rate limit + IP allowlist | F-SEC-02, TD-16 | ✅ Code xong; cần cấu hình secret/IP thật khi deploy |
| Payment match secondary criteria (amount + tolerance) + anomaly queue | F-SEC-03 | ✅ |
| Revoke direct UPDATE column `status` ở `rooms`, `room_bookings`, `housekeeping_tasks` | F-FSM-01, F-FSM-02, TD-14 | ✅ |
| Audit log helper RPC `log_state_transition` | audit hardening | ✅ |
| Audit log assign/cancel riêng cho maintenance request | TD-15 | ⏳ Còn lại |

**QA**: regression auth flow, payment flow, room status flow.
**Rollback**: theo migration/GRANT được ghi trong finding tương ứng; không phụ thuộc feature flag chưa tồn tại.

## Sprint R2 — Convention enforcement

**Mục tiêu**: ngăn drift, đảm bảo tenant isolation và performance.

| Task | Findings | Effort |
|---|---|---|
| ESLint custom rule: query phải có `.eq('tenant_id')` | F-CON-01 | 1 |
| Zod transform UUID empty string → null | F-CON-02 | 0.3 |
| Audit query keys, bổ sung `hotelId` toàn bộ | F-CON-04, F-PERF-03 | 1.5 |
| Realtime: thay `event: '*'` bằng cụ thể + filter | F-PERF-02, TD-13 | 1 |
| Move multi-table mutation sang RPC atomic | F-CON-03 | 2 |

**QA**: switch hotel verify cache không leak, mobile + desktop.

## Sprint R3 — Domain consolidation

**Mục tiêu**: giảm trùng lặp, gom domain.

| Task | Findings | Effort |
|---|---|---|
| ~~Xoá `components/Layout.tsx` legacy~~ — hoàn tất | F-DUP-01 | 0 |
| ~~Hợp nhất `/admin/*` ↔ `/super-admin/*`~~ — không có route trùng | F-DUP-02, TD-01 | 0 |
| ~~Hợp nhất `MorePage` desktop/mobile~~ — file legacy đã xóa | F-DUP-03, TD-02 | 0 |
| Audit 194 app-defined RPC chưa có caller frontend | F-DUP-04 | 1 |
| DB view `v_booking_finance` thống nhất tính tài chính | F-DBT-04, TD-03 | 1.5 |
| Hợp nhất `notifications` ↔ `in_app_notifications` | TD-04 | 1.5 |

## Sprint R4 — Hardening

**Mục tiêu**: chống lỗi edge case, tăng observability.

| Task | Findings | Effort |
|---|---|---|
| Outbox: idempotent key `(session_id, side_effect_type, client_issue_id)` unique | F-DBT-01, TD-06 | 1 |
| Group payment metadata: enum + JSON schema validate | F-DBT-02, TD-07 | 0.5 |
| Reference code canonical helper `gen_payment_ref(type, tenant)` | F-DBT-03, TD-05 | 0.5 |
| Quick path: defense in depth ở RPC (assert daily/periodic) | F-FSM-03, TD-18 | 0.2 |
| RLS thắt policy `using (true)` (nếu có) | F-SEC-04, TD-19 | 0.5 |
| ~~`guest-documents` chuyển private + signed URL~~ — hoàn tất | F-SEC-05, TD-17 | 0 |
| Tích hợp Sentry + structured logging | TD-08 | 1.5 |

## Backlog (sau R4)
- Workflow visual builder (TD-09)
- Lost & Found code config per tenant (TD-10)
- String rebrand sweep (TD-11)
- Test coverage đo + nâng (TD-12)
- Migration archive consolidate (TD-20; hiện 491 file)

## Đo lường thành công
- Security: 0 finding 🔴/🟠 còn lại
- Performance: API p95 < 500ms các flow chính
- Quality: test coverage logic chính ≥ 80%
- DX: 0 query thiếu `tenant_id` (lint pass)
