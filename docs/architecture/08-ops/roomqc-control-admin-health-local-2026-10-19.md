# Control admin, admission và health — kiểm chứng local 19/10/2026

Phạm vi: triển khai tiếp T02–T04, các phần registry/admission và snapshot health
của [plan thực thi](roomqc-vps-signup-execution-plan-2026-10-19.md). Không đóng toàn
bộ gói P1/P2/P3/P4; còn collector, probes/manifest backend, UI, E2E và môi trường thật.

## Đã thay đổi

- Directory migrations `0004`/`0005`: inventory/manifest/frontend references,
  policy/health generation và quyền hạn. Metrics được chốt cờ yêu cầu admin mở lại,
  nhưng DB trigger từ chối metrics xóa cờ đó hoặc sửa manual_closed.
- Admin API đọc overview/clusters/workspaces/detail/audit, đăng ký cụm draft từ
  inventory và lệnh đóng/mở/draining/serving/policy. Lệnh có command identity,
  expectedVersion, reason, receipt và event cùng transaction. Validation route vẫn
  thiếu RPC manifest backend nên chưa nghiệm thu hoàn chỉnh.
- Reserve/beginProvision dùng gate DB, policy/health/backup/frontend/release và khóa
  thống nhất với admin. Email affinity giữ sau expiry; trạng thái provisioning đã
  bắt đầu không bị dọn theo tuổi hoặc chuyển cụm khi gate đổi.
- Read API cursor giữ microsecond PostgreSQL, filter/cursor ràng buộc, timeline
  phân trang thật; search được workspace/request ID. DTO không trả email hash hoặc
  server credential. Snapshot đã hết hạn được trả status unknown dù stale worker
  chưa chạy, không giữ nhãn healthy từ dữ liệu cũ.
- HTTP transport kiểm tra toàn bộ A/AAAA, ghim IP cho socket, giữ Host/TLS SNI/
  certificate verification, reject redirect/metadata và đích private chưa duyệt,
  giới hạn response/deadline. Ngoại lệ dev loopback/host.docker.internal tách rõ.
- Health evaluator + HealthStore giữ window/recovery qua restart, reject sample
  cũ/sai, snapshot/event/latch nguyên tử. Generation vẫn tăng khi snapshot restore
  có generation lớn hơn sequence. Đây chưa phải exporter/collector thường trực.

## Kết quả kiểm tra

`npm run test:control:db`: **44 đạt, 0 lỗi, 0 skip**. Đây là 44 test của suite hiện
tại, không phải 44/70 case release hoặc phần trăm sẵn sàng production. Suite bao gồm:

1. Sáu bài DB migration/runtime trước đây đã cập nhật fixture cho gate mới; migration
   trống/upgrade/rerun/lock/checksum/rollback/grant thật trong PostgreSQL disposable.
2. Chín bài admin/allocation DB+HTTP: 20 replay tranh khóa chỉ một receipt/event;
   hai actor cùng version một bên thắng; audit failure rollback; retry sau response
   bị cắt *sau commit* trả command cũ; authority adapter được gọi mỗi attempt.
3. Reserve 20 khách tranh suất cuối chỉ một workspace; retry không gia hạn expiry;
   affinity sau expiry; close cùng reserve được tuần tự hóa; first provision bị
   gate đóng nhưng công việc đã bắt đầu vẫn được tiếp tục đối soát.
4. 1.005 workspace có timestamp microsecond sát/trùng; duyệt hết không mất/trùng;
   63 attempt timeline đọc được qua nhiều trang; filter/cursor sai bị chặn.
5. Bảy test thuần evaluator/policy: NaN/âm/units/time/probes, warmup/gap/policy
   change, CPU/RAM/connections sustained windows, disk/inode, probe và recovery.
6. Bốn bài HealthStore qua login metrics thật: restart, hai writer tranh khóa,
   generation khôi phục, stale idempotent, audit failure và DB không cho tự mở lại.
7. Bốn bài HTTP destination: IPv4/IPv6/mapped, mixed DNS answers, endpoint inventory,
   pin kết nối HTTP thật, DNS đổi ở lần gọi kế, redirect/size và DNS deadline.
8. Contract/admin input, health/shutdown và gateway/support hồi quy trong cùng suite.

HTTP admin tests dùng authority adapter kiểm soát để kiểm tra boundary và việc gọi
lại quyền; **không thay thế** test revoke/lock/role/session với Supabase Auth thật.
VPS Linux metrics, SMTP thật, offsite restore và pilot chưa chạy ở suite này.

## Local runtime

Control stack riêng đã build/migrate đến `0005-health-snapshot-guard.sql`, runtime
API least privilege; DB không publish cổng, volume vẫn giữ nguyên. Signup đóng.
Không áp Supabase migration, tạo user/tenant hoặc đổi directory_required ở backend
nghiệp vụ đang dùng. Gateway đã gọi Auth health read-only qua transport mới thành công.

`control:local -- restart-check` được mở rộng fingerprint đủ 16 bảng directory:
schema history, hosts, clusters, policy, health/admission, commands/jobs, affinity/
conflicts, events/alerts/backups, workspaces/attempts/support actions. Khi DB dừng,
livez=200, readyz=503; khởi động lại API/DB giữ fingerprint. Không `down -v`.

Image/schema/source hashes và kết quả final run được lưu riêng trong
[artifact đợt này](../../../artifacts/roomqc-control-admin-health-2026-10-19.json).
Artifact nền cũ không bị sửa để đại diện mã mới. Fingerprint source ghi rõ các
bảng nghiệp vụ đã đối chiếu, không tuyên bố toàn bộ mọi bảng đã được fingerprint.

## Việc còn lại, thứ tự tiếp tục

1. T05–T07: exporter/private monitoring, collector theo template cố định, nhiều
   mount DB/Storage, probes đầy đủ và alert lifecycle; HealthStore mới chưa có
   process thường trực thu thập dữ liệu thật nên không mở admission hiện tại.
2. T08: manifest RPC server-only trong Supabase sandbox và validation đủ năm dịch
   vụ/frontend; test credential rotation/TLS/private inventory trên topology thật.
3. P1-03 còn kiểm thử quyền/session/revoke với Auth thật trên các endpoint liên
   quan, sensitive MFA production, command identity cho support/recheck mới.
4. T11–T17: private setup-status/resume, receipt worker/lease/fencing, abuse/proxy,
   admin login/cache/UX. Support cũ không được coi là worker v3 đã hoàn tất.
5. VPS deploy/offsite backup/restore, hai backend/browser E2E/load/cutover/pilot
   tiếp tục theo plan. Không thiếu khóa nào cản việc làm collector/code/local.
