# M06 — kết quả R1/R2 local, 19/10/2026

Trạng thái: **R1/R2 local_verified theo phạm vi dưới đây; M06/T08 vẫn
in_progress_unverified**. Toàn plan 27 gói/25 bước/70 acceptance còn active.
Không deploy, không sync implementation sang primary, không mở signup.

## Kết quả chính

- Full current-tree control suite: **111/111**, 0 fail, 0 skip,
  121101.8274ms; gồm 10 manifest DB tests và protocol/worker/exporter/race tests.
  Không cộng focused subsets vào 111.
- Hai full upstream builds riêng `1d2e7d793b84` và `7bbeec983dbf`, mỗi
  lượt replay 523 migration, exit 0 tại `permission_controls_verified`.
- Independent initialized hash cùng
  `f3d48c3e1134a8fc142f84f21cfb45b9d556bec3f3c122c34a0236246b9a149d`;
  migration-set `f741f99eedd860953a9b8a220638242225e1c800456f34fc3ce6a28a92c41eac`.
- Janitor vendor thật: child cũ được dọn, child tương lai được tạo lại,
  static hash không đổi, private round-trip sau maintenance đạt cả hai lượt.
- Auth/REST/Storage/Realtime/Functions từng service stop/restart có healthy →
  đúng service fail → recovery. Không sửa expected khi fault/maintenance.
- Negative quyền REST/Storage/Function/Realtime đạt; denial Realtime đúng
  topic/ref/Unauthorized, positive trước/sau đạt. Revoked Auth token bị từ chối;
  re-login cùng identity rồi đủ năm probes hồi phục.
- Dedicated probe effective audit: 0 business table grants, 0 callable business
  SECURITY DEFINER ở phạm vi public/private đã kiểm.
- Hai run cleanup mỗi lượt 13 exact-owned objects; kiểm lại Docker labels cho cả
  container/volume/network đều không còn. Các fixture lỗi trước đó cũng cleanup.

[Artifact nguồn/log/image/schema](../../../artifacts/roomqc-m06-partition-local-2026-10-19.json)
là local evidence, **không phải approved production release artifact**. Expected
artifact/frontend hashes trong runner là synthetic fixture, không dùng deploy.

## Nguyên nhân và sửa

1. Full vendor creator là `supabase_admin`, rồi ALTER OWNER về
   `supabase_realtime_admin`. Validator cũ tính default ACL theo chủ cuối,
   không theo creator và semantics chuyển owner. Catalog đã chứng minh cột và
   inheritance khớp, ACL sai assumption. Sửa phép hợp global/schema defaults và
   rewrite creator grantor/grantee đúng semantics; static default ACL vẫn hash.
2. Regression tối thiểu phát hiện một parent có lịch sử DROP COLUMN và child mới
   có physical attnums/indkey khác nhưng logical layout giống. Helpers nay dùng
   logical live-column order và key/include column names; giữ nguyên các kiểm
   ACL/default/type/index/inheritance/RLS/publication. Catalog run trên không có
   gaps; không gán regression phụ thành nguyên nhân chính của lỗi backend.
3. Controlled maintenance cần installer credential riêng: role postgres đúng là
   không được SET ROLE supabase_admin hoặc DROP vendor table. Harness dùng
   credential có sẵn qua private environment cho đúng owned fixture, không mở
   thêm grants, log password hoặc trao quyền installer cho health worker.
4. Runner reference phải là run completed/không failed và đã cleaned; pre-init
   hoặc failed build không được làm trusted candidate để kiểm repeatability.

[ADR fingerprint v2](../adr/roomqc-realtime-partition-fingerprint-v2.md)
ghi đầy đủ quyết định, nguồn vendor, invariants, migration/compatibility.
Không đổi checksum migration manifest gốc; sửa draft migration v2 mới, chưa deploy.

## Bằng chứng chạy

```powershell
node --test server/control/release-manifest.test.mjs server/control/service-probes.test.mjs server/control/safe-websocket.test.mjs
node scripts/test-control-directory.mjs
```

Full backend chạy bằng `scripts/test-control-backend-sandbox.mjs --run` với
`--advisors-cli` native CLI 2.121.0. Lượt thứ hai thêm
`--expected-build-state` là ownership.json đã cleaned của lượt đầu. Guard chỉ
cho exact-owned fixture, internal network, không public ports/providers, DB cron
jobs tắt để không gửi email/tác vụ nghiệp vụ. Không dùng các lệnh này trên backend
khách sạn; lệnh đầy đủ, run paths và log hashes nằm ở artifact local.

## R4 — mới kiểm một phần, không đóng advisors

Native report lặp lại 679 findings/0 ERROR: 17 INFO no-policy, 8 INFO FK,
501 INFO unused-index, 153 WARN permissive-policy. Read-only catalog audit 17
bảng xác nhận anon/authenticated không có table/column privileges; 14 private,
ba public. Chưa thay proof direct-grants bằng kết luận mọi server function/view
an toàn. [Triage](roomqc-m06-advisor-triage-2026-10-19.md) có danh sách tám FK,
51 bảng policy và bước review từng nhóm; không xóa index hàng loạt.

## Chưa hoàn tất và thứ tự tiếp theo

1. R3: coordinated Auth refresh, secret refs/TTL/rotation/fencing/restart; revoke/
   re-login fixture đã đạt không thay vòng đời production.
2. R4: server callers/views/definers và effective rights; policy semantics/query
   plans, FK/index workload. Source đổi phải tái lập proof liên quan.
3. R5: approved release generator/installer/trust chain và schema compatibility;
   không dùng observed live hash hoặc synthetic artifact để tự duyệt.
4. R6/R7: gateway còn legacy body/quyền; health runtime mặc định unconfigured.
   Cần nối adapter/contract/race rồi current-tree regression và deploy riêng.
5. M05/M10 metrics → probe → snapshot → admission drill, M07/M08 alerts/outbox,
   M09 external heartbeat; sau đó T03/T09–T25 theo kế hoạch, không dừng ở R2.

Không chứng minh scheduled Janitor soak, Linux host metrics, VPS/TLS/email thật,
offsite restore, browser/Android E2E, capacity hoặc pilot. Các gate này chưa mở.
Control/proxy readyz trước đợt đều 200; đợt này chỉ fixture, không thay image/schema/
signup flag đang phục vụ, không migrate/fault business Supabase hoặc CRM.
