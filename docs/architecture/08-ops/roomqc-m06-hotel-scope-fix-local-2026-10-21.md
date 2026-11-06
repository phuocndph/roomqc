# RoomQC — bản sửa phạm vi năm bảng, A/B local

Ngày 21/10/2026. **Đã kiểm chứng lát local; chờ review độc lập, chưa nghiệm thu toàn bộ quyền hoặc VPS/signup.**

[Artifact chi tiết](../../../artifacts/roomqc-m06-hotel-scope-fix-local-2026-10-21.json) ·
[Baseline trước sửa](roomqc-m06-hotel-scope-baseline-local-2026-10-21.md) ·
[Plan tổng thể](roomqc-vps-signup-preparation-plan-2026-10-21.md) ·
[Protocol](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).

## 1. Kết quả trước–sau

Hai rebuild độc lập A 9e8c5e1d23c9 / B 37cc0f0146a5 đều **exit 0**,
mỗi lượt **280/280 observations đạt** qua actual GoTrue + REST. Đối chiếu tập gốc
theo actorFixture/label/table/scope/method: đủ 180, không missing/unexpected,
không đổi expected; **45 tình huống sai cũ đã đạt và 47 positive giữ nguyên**.

| Nhóm trong mỗi run | Observations đạt | Positive | Negative |
|---|---:|---:|---:|
| Tập baseline gốc | 180/180 | 47 | 133 |
| Owner ghi/đổi hotel, cross-tenant và tenant/hotel không khớp | 52/52 | 28 | 24 |
| Quyền action đối chứng của staff/department | 6/6 | 3 | 3 |
| Gỡ assignment, từ chối rồi gán lại | 22/22 | 5 | 17 |
| Platform SELECT giữ parity với policy cũ | 20/20 | 12 | 8 |
| Tổng | 280/280 | 95 | 185 |

185 negative gồm **184 authorization controls + 1 integrity guard**; không gọi
ca guard toàn vẹn dữ liệu là bằng chứng RLS. 170 GET/110 mutation observations,
snapshots 15 bảng trước/sau mỗi request. SQL chỉ installer/đối soát, không thay
actual API bằng SET ROLE. Data tổng hợp, plan fixture riêng có quota hữu hạn,
không tắt constraint/trigger hoặc sửa gói trial dùng chung.

## 2. Bản sửa hẹp và giới hạn quyền

Migration mới: supabase/migrations/20261021112018_hotel_bound_business_scope.sql,
tạo bằng Supabase CLI migration new sau khi khám phá help.

- Năm restrictive FOR ALL policies trên rooms/items/inventory_transactions/
  laundry_batches/maintenance_requests, cả USING và WITH CHECK.
- Predicate private.business_hotel_scope dùng SECURITY INVOKER, search_path rỗng,
  chỉ authenticated có EXECUTE; không cấp anon/service/probe.
- Business owner chỉ own tenant với hotel thuộc tenant đó; manager/staff cần
  assignment user_hotels. Policy scope chỉ giao với action policies có sẵn.
- Catalog đối chiếu: **359 policy cũ không đổi**, thêm đúng 5 restrictive; helper
  user_has_hotel_access cũ không đổi. Không GRANT action mới, không definer để
  né lỗi, không drop policy hàng loạt hoặc disable RLS.
- Nhánh super_admin của predicate không tự cấp quyền: vẫn phải qua permissive
  policy cũ. Parity SELECT kiểm đúng hiện trạng: items có cross-tenant legacy
  allowance, bốn bảng còn lại không tự được mở global. Mâu thuẫn với mục tiêu
  platform toàn hệ thống cần disposition riêng, chưa được tuyên bố đã giải quyết.
- Cả năm hotel_id thực tế NOT NULL, được assert trong migration và runtime.
  NULL/shared là N/A cho năm bảng này; không suy ra cho catalog nullable khác.
- Gỡ–gán lại assignment được đo sau commit; **chưa chứng minh concurrent revoke
  fencing, trạng thái account/session hoặc task capability toàn ma trận**.

## 3. Giữ lượt fail ban đầu, không hợp thức hóa lỗi hạ tầng

Run c13be7fc326d, session 68905, exit 1, cleaned 18. Source scope khi đó
d17dec0fd9ea684a5a048a96f3dca2c8f5fa0ba3c4193c21dd326ca6cbd18e6e:
280 observations, 279 đạt; tập gốc 180 đều đạt.

Ca mới owner-mismatched-hotel/rooms trả 400/23514, snapshots không đổi.
Catalog/source xác nhận BEFORE trigger trg_check_room_quota gọi
private.enforce_room_capacity, từ chối đúng thông báo “Phòng và khách sạn phải
thuộc cùng doanh nghiệp.” trước WITH CHECK. Đây không phải mutation lọt quyền.

Trước fresh A/B, harness tách denialContract riêng cho **đúng ca PATCH này**:
chỉ chấp nhận 400 + 23514 + exact known message (artifact dùng mã guard
ROOM_HOTEL_TENANT_MISMATCH) + effects unchanged. 23514 quota, 23503 FK, 409,
timeout, 5xx hoặc thiếu guard đều không đạt. Unit regression giữ các negative
đó. Không sửa expected/identities của 180 ca gốc. Failed run không là B reference.
Đã bỏ transaction BEGIN/COMMIT lồng trong migration mới trước final rebuild;
runner chịu trách nhiệm transaction từng migration.

## 4. Candidate, test và repeatability

Source scope **667 files/534 migrations**, SHA256
2713ac1c5fcbecb9ba9826ed330306ccfb9f855fedf7a1f8324392f75cb6d154.
Fingerprint chụp trước final A, không đổi trước B và sau terminal A/B.
Đây không phải full-repo release manifest. Branch codex/roomqc-parallel-integration,
HEAD 5cb583729ce055db64df8b192f10476db1fa99b8, dirty implementation giữ nguyên.

| Run | Session | Exit | Scope | Cleanup |
|---|---:|---:|---:|---:|
| A 9e8c5e1d23c9 | 21534 | 0 | 280/280 | 18 objects |
| B 37cc0f0146a5 | 7684 | 0 | 280/280 | 18 objects |

Ownership file creation → final cleanup save: A 11:34:16.365Z–11:39:31.968Z;
B 11:40:07.527Z–11:45:21.228Z. Đây là mốc file metadata của run, không giả làm
thời gian từng assertion. Commands:

- node --test server/control/backend-hotel-scope.test.mjs: **9/9**, subset của full suite.
- npm run test:control:db: session 59300, **186/186**, exit 0, 0 skip/fail/cancel/todo,
  duration 126464.1358ms. Các lượt 185 trước chỉnh guard giữ lịch sử, không cộng tổng.
- node scripts/test-control-backend-sandbox.mjs --run --advisors-cli
  C:/Users/Lenovo/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe.
  B thêm --expected-build-state với exact-owned ownershipRef A trong artifact.

A/B khớp migration-set
bfdf5a767e49295a9099f376b3d4079a25649c32dfb22b2c829223387dfb8e07,
schema abd86ddc56d2e6af6f47ad20cdffc746ce2bcec46d4ea73b22bfb8371170daa7,
images, compiled Edge/function/lifecycle/email/provider builds, scope harness
và toàn observation results. B có buildRepeatability.matched=true.
Raw Compose hash riêng theo run không là invariant do tên/mount/secret fixture.

Cả hai chạy hết hồi quy provider/hotel-delete/lifecycle/email-admin/access/
registration/mutation/no-policy/parent-boundary và final permission recovery.
Năm service faults đều detected, khôi phục healthy sau từng fault.
Hai rebuild tuần tự **không phải T21 hai backend đồng thời**, không là timed
collector→persisted health→admission pipeline hoặc Linux exporter/OS proof.

## 5. Advisors, cleanup và ranh giới nghiệm thu

Advisors mỗi A/B: **605** = 17 no-policy + 8 FK + 445 unused-index +
135 permissive warnings. Baseline trước 604/444 unused; đây là thống kê workload,
không tự là defect mới hoặc căn cứ drop index. Migration này không tạo index.
135 warnings không mất vì scope restrictive mới; hợp nhất/performance cần review riêng.

Mỗi run dọn đúng 18 objects theo ownership. Post-terminal container/network/
volume queries của ba run đều rỗng. Private env/log/catalog giữ ACL, không đưa
credentials/PII/row data vào artifact. Không deploy runtime, không chạm CRM/
business DB, không gửi email Internet, không mở public signup/billing.
Primary chỉ nhận docs/artifacts đã lọc, implementation giữ trong integration.

## 6. Phần còn mở và việc nhận kế tiếp

- Account/session/task capabilities và direct CRUD/workflow/RPC đầy đủ trên năm
  bảng; concurrent revocation cần lock/effect proof riêng, không suy từ scope.
- Full 17-target indirect disposition; phần còn lại 135-policy allowed-row review;
  8 FK có workload/EXPLAIN/BUFFERS/write-lock decisions.
- Issuer/release trust, revision-atomic health và timed integrated pipeline.
- Alerts/outbox/admission/budget; signup/status/resume/reconcile/abuse/email.
- Hai console, Linux/TLS/offsite clean-host restore/on-call, simultaneous A/B,
  browser/Android E2E, tải/soak/RC và ≥7-day pilot.

Giữ toàn bộ **27 gói/25 task/70 case**, 122 releaseAcceptance unverified,
reviewer/signoff chưa có và gate L/S/P/U/B không đổi. Đây là scoped local proof
của bản sửa, **không đóng R4/T08 hoặc mục tiêu tổng thể**.

