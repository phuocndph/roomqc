# RoomQC — T04 đọc lại kết quả lệnh quản trị, scoped local

Ngày22/10/2026, Asia/Bangkok. Đây là lát triển khai T04/A08–A11/E04–E05,
không đóng toàn T04/T03/T14 hoặc gate phát hành.
[Artifact](../../../artifacts/roomqc-t04-command-result-local-2026-10-22.json).

## 1. Kết quả sản phẩm

Đã có handler thực:
`GET /api/control/admin/clusters/{id}/command-result?operation={operation}`.
Header `Idempotency-Key` là UUID client lưu trước POST; giữ nguyên cả casing
vì receipt hiện có dùng TEXT. Giữ nguyên đường replay POST cùng key/payload.

- Mỗi request đi qua live supportActor ở canonical authority và platform-read.
  Lookup primary pool buộc actor + authority cluster + target + operation + key.
- 200 chỉ cho receipt succeeded, có finished_at và snapshot/targetVersion nhất
  quán; requestId mới, no-store. Kết quả là ảnh chụp lúc lệnh commit, không là
  health hiện thời hoặc quyền tự mở admission; lệnh tiếp theo phải refresh.
- 404 COMMAND_RESULT_UNKNOWN không chứng minh lệnh thất bại: original transaction
  có thể chưa commit. Không tạo mã lệnh mới để chữa mất mạng.
- 409 COMMAND_RESULT_UNAVAILABLE cho started/failed/inconsistent. Không biến
  accepted/pending thành succeeded; không tự retry/mutate từ GET.
- Closed DTO projection cả metrics/disks/admission; không trả extra stored body,
  reason, credential refs, device/mountpoint hoặc raw lỗi database.
- Chấp nhận7 operation hiện hành và register_cluster, không phải job-recheck API.
  Không thêm migration/grant/package/vendor change.

## 2. Source và phạm vi

Candidate755 files/546 migrations:
`e5c5debdb3306d380d90d08f52013cd98cc9716cb149d4ef9ece41522de0e4ee`.
Freeze trước/sau bộ hồi quy khớp. Chỉ6 product/test/contract paths:
command-results.mjs (mới), admin.mjs, app.mjs, admin-contract.test.mjs,
admin-cases.mjs và contracts/control-v3.openapi.json trong server/control.

[Current19/sourcef7](roomqc-m06-current19-direct-local-2026-10-22.md) là nền
hồi quy lịch sử754/546. Full-vendor A/B và selected frontend388 của sourcef7
**không được gán sang candidate755**; đợt này không chạy lại hai bộ đó vì delta
directory-only, không đổi Auth/Edge/frontend/schema. Trước gate tích hợp vẫn
cần candidate/evidence phù hợp đủ phạm vi; không dùng scoped proof thay release.

Implementation chỉ ở integration. Primary nhận docs/artifacts đã lọc, không
copy source hoặc restart runtime8082. Không thay DB đang phục vụ/CRM/VPS/DNS/
provider/email Internet; không stage/commit hoặc đổi ledger.

## 3. Bằng chứng thực chạy

| Kiểm tra | Kết quả và scope |
|---|---|
| Red trước handler | Targeted actual directory HTTP fail1/1:404 thay200 khi đọc committed receipt; chứng minh thiếu chức năng |
| Mất response trước headers sau commit | Green1/1; GET giữ commandId/version/result, POST replay vẫn tương thích; restart dùng pool mới vẫn đọc được; revoke chặn read |
| Focused admin/registration |11/11,0 skip/fail; gồm20 actual overlapping replays và audit rollback đã có |
| Full control DB opt-in |237/237,0 skip/fail/cancel, exit0; session30316 terminal;125916.6482ms. Unit6 và focused11 là subset, không cộng dồn |
| ESLint |5 MJS,0 warning/exit0 |
| Syntax |5 MJS, tất cả exit0 |
| Cleanup độc lập |6 test-label families × container/network/volume: tất cả0 sau run |

DB cases dùng pinned PostgreSQL16 disposable, random loopback port, database
riêng và runtime role roomqc_control_api, không dùng serving DB. Full control
có actual monitoring/probe/manifest tests theo scope của chúng; monitoring
Docker Desktop VM không là Linux VPS/five-service healthy admission proof.

Các negative/recovery mới:

- Sai actor/authority/target/operation/key, missing login và staff/owner bị chặn;
  cùng key hai actor chỉ nhìn receipt của mình. Key uppercase đọc nguyên vẹn;
  bản lowercase khác trả unknown như storage hiện hành.
- Invalid/duplicate/unknown query và malformed/missing header trả400.
- Chưa commit đọc không chờ mutation và trả unknown; sau commit started/failed,
  thiếu finished_at, sai status/version/target hoặc malformed snapshot không200.
- Sửa lại fixture hợp lệ đọc thành công. Extra fields ở receipt/cluster/
  admission/metrics/disks không xuất hiện trên HTTP.
- Snapshot hashes clusters/policies/commands/events không đổi trước/sau mỗi GET.
  Không ghi audit hoặc tạo receipt/mutation mới khi đọc.
- HTTP supportActor được stub có kiểm tra mỗi request; **không phải** proof mới
  cho Supabase internal live-session/revocation semantics. Giữ backend regression
  lịch sử; actual user-token browser/live provider còn ở T22.

Trong phát triển,2 assertion ban đầu so object nội bộ với JSON có khác
undefined/Date đã fail; đã sửa fixture/comparison về đúng wire format và rerun.
Không bỏ qua case hoặc nới điều kiện HTTP/success để đạt green.

## 4. Chưa hoàn tất và bước tiếp theo

- Typed client, lưu command context trước POST/F5, cache/logout cancellation,
  command dialog và browser/two-tab/Android network fault thuộc T14–T17/T22.
- Các handler setup-status/tenant-summary/recheck/alerts/backups/ack còn mở;
  spec không là implementation. Không báo hai màn quản trị đã tồn tại.
- Current19 indirect/workflow/recipient/offboarding/EC10–EC15/policy135/FK7;
  issuer/trust/revision-atomic health, alert/outbox, admission/aggregate budget,
  durable signup/resume/reconcile, Linux/TLS/offsite DR/on-call, simultaneous A/B,
  E2E/load/soak/RC/pilot vẫn theo dependency T01–T25.
- 27 packages/25 tasks/70 cases,122 release entries vẫn unverified; L/S/P/U/B,
  assigned owner/reviewer/signoff không đổi. Scope local không là release-ready.

Bàn giao vào [plan16.2](roomqc-vps-signup-preparation-plan-2026-10-21.md#162-phiếu-nhận-việc-ngay--sau-t04sourcee5c5deb)
và [contract checklist12.1](roomqc-vps-signup-launch-checklist-2026-10-21.md#121-đề-xuất-cụ-thể-cho-đọc-kết-quả-lệnh-và-hai-entry-quản-trị).
Giữ toàn mục tiêu VPS + signup; không dừng roadmap ở endpoint này.

## 5. Kiểm tra gói bàn giao

27 tài liệu/421 local links/85 anchors, mapping27/25/70 và DAG hợp lệ,0 lỗi.
7 docs/artifacts đã lọc ở integration/primary byte-equal; primary index và raw
ledger hash giữ nguyên; selected secret/whitespace checks đạt. Đây là kiểm
tính nhất quán tài liệu, không là product release acceptance hay reviewer signoff.

