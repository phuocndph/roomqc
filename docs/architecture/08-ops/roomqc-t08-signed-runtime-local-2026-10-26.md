# RoomQC — nối phê duyệt ký vào validate và cấp phát

Ngày26/10/2026. Tiếp T03/T08, hồi quy T06/T09/T11/T12; không đổi 8 đợt,
27 gói, T01–T25 hoặc70 ca của [kế hoạch](roomqc-vps-signup-execution-ready-2026-10-22.md).
[Artifact nguồn/kết quả](../../../artifacts/roomqc-t08-signed-runtime-local-2026-10-26.json).

## 1. Đã thay đổi

Catalog release chuyển sang version2: mỗi entry có signed approval và credential
canary riêng; version1 không còn hợp lệ. Public trust file và maximum validity
phải cấu hình cùng catalog, đọc từ file absolute/regular/bounded/private; không
lấy trust key, approval hoặc URL từ HTTP. Runtime không có private signing key.
Ba biến cấu hình là ROOMQC_CONTROL_RELEASE_VALIDATION_FILE,
ROOMQC_CONTROL_RELEASE_TRUST_FILE và ROOMQC_CONTROL_RELEASE_APPROVAL_MAX_VALIDITY_MS.
Thiếu toàn bộ cấu hình vẫn có thể mở liveness/readiness hạ tầng; nhận/cấp mới
không có fallback để vượt authority.

ClusterGateway.validateCluster yêu cầu store.authorizeRelease: đọc primary,
lấy lock727001, xác minh chữ ký theo inventory đang cấu hình, so authority và
clock DB, commit rồi mới gọi manifest. Không giữ transaction qua HTTP. Khi ghi
lệnh validate, AdminDirectory đọc lại clock DB và authority trong transaction
cùng lock. Phê duyệt bị thu hồi sau network preflight không thể ghi kết quả.
Replay lệnh đã thành công vẫn trả biên nhận lịch sử, không tái xác minh để ghi lại.

clusterSelect đọc authority và thời gian primary; withCredential kiểm cùng
signed approval/binding, admissionDecision yêu cầu release_authority_current.
Điều kiện này dùng cho open_admission, reserve và beginProvision. Sửa khoảng
trống retry: provisioning và active không được dùng trạng thái cũ để bỏ qua gate
khi định gửi write mới. Phê duyệt hết hạn hoặc bị thu hồi sẽ chặn nhận/cấp mới,
kể cả khi cờ manual/reopen bị mở bằng một thao tác khác.

POST provision ở provisioning/active đọc biên nhận trước. Nếu có receipt đúng
binding, activate phục hồi và trả idempotent=true; không gọi provision RPC nữa.
Active nhưng không tìm được receipt trả unknown để đối soát. Provisioning chưa có
receipt phải qua beginProvision/gate trước mọi lần thử gửi write mới. Không thêm
retry ngầm cho network thất bại; bootstrap/receipt và routing khách cũ giữ nguyên.

Sửa lỗi được phát hiện qua DB test: extract(epoch)*1000 có phần thập phân;
verifier chỉ nhận integer UTC milliseconds. Các query phục vụ verify dùng floor
tại DB, không thay đồng hồ primary bằng thời gian cache hoặc frontend.

## 2. Bằng chứng và giới hạn

Source781, 546business+10directory migrations, digest
1261ed466ffb025a10aa8dad9f584011293caf1f6bf6e5d014d7003ee8c3539c;
runtime/orchestrator150, digest
59e05033d0932a2f24ca35706b5126b88ad4655c702f5350064bd9ba2a916297.
Manifest kế thừa checkpoint779 rồi thêm hai file fixture/cases; các file cũ đã
được sửa, không được suy rằng full326 của779 hay backend343/rebuild380 còn áp dụng.

Lịch sử kiểm thử được giữ: run6b1325ee8276 fail9 do fractional DB clock và kỳ vọng
retry cũ; sau sửa run437da6e56b0d đạt61/61directory. Run e3079f6da4fe fail1 vì lỗi
cú pháp file ca mới khiến directory suite không load; đã sửa, không relabel thành
pass. Run1f9eb0f734d7 chạy đủ ba ca signed-runtime, đạt3/3, không skip/cancel,
exit0, duration4677.0918ms; exact-owned Docker cleanup ba kiểm tra đều0/exit0.
Lượt full control23e678f22a69 đạt330/330, không fail/skip/cancel, native exit0,
duration130580.2057ms; chạy đủ9ca authority và3ca runtime mới. Manifest source và
runtime được đọc trước spawn/sau terminal và khớp. Kiểm Docker độc lập theo exact
label: container/network/volume đều0, ba lệnh exit0. Đây vẫn chưa là full backend
hoặc independent rebuild source781.

Ba ca runtime dùng primary directory PostgreSQL thật, API role ít quyền và
code store/gateway/admin/app thật. Ca response HTTP dùng server loopback thật,
giữ response manifest cho đến khi durable withdrawal commit rồi mới thả; validate
commit bị từ chối và snapshot hash của cluster/health/workspaces/commands/events/
attempts không đổi. Lần gọi sau bị chặn trước network, tổng request vẫn1.
Manifest payload là fixture, không phải bằng chứng năm dịch vụ Supabase thật.

Ca cấp phát xác nhận withdrawal chặn reserve/open_admission/provisioning retry
ngay cả khi cờ manual/reopen bị xóa bằng fixture SQL. Ca receipt gọi HTTP app thật,
Auth/remote receipt adapter là fixture: phục hồi active cùng tenant/hotel/routing,
read1 và provision-write0. Đây không phải E2E Auth hay remote distributed commit.

## 3. Chưa hoàn tất và điểm nhận tiếp

HealthStore.record và managed health catalog vẫn chưa dùng signed authority mới:
một late health response vẫn có thể ghi generation; admission được chặn riêng
nhưng điều này chưa đạt yêu cầu không-effects của toànT08. Cần chuyển managed
metadata sang signed approval, gắn identity vào proof, kiểm authority ở health
commit và so identity khi dùng snapshot. Approval mới cần warmup/proof mới, giữ
critical latch/manual/backup gates; chưa được tuyên bố recovery đạt ở source này.

Managed full-backend harness còn tạo catalog v1 và cần nâng fixture/installer
đúng boundary mới trước khi chạy. Không thêm legacy bypass để harness xanh.
Chưa có full backend/rebuild source781 hoặc chạy Linux/issuer production.

Tiếp đúng thứ tự: health và harness cutover → thu hồi theo key/installer CLI và
readiness → hai worker/API process với held response/expiry/restart/recovery →
freeze candidate, full control/backend/independent rebuild. Phần durable
dispatch/lease/receipt của T11/T12 vẫn phải khép; lần authorize trước withdrawal
có thể đã gửi/commit remote, đóng directory không hủy được nó.

Sau T08 tiếp quyền gián tiếp/workflow/policy/FK, alerts/outbox, admission/budget,
signup/setup-status/resume/reconcile, hai console, Linux/TLS/offsite/on-call,
A/B đồng thời/browser/Android/load/soak/RC và pilot được duyệt. DB restore cần
checkpoint thu hồi ngoài failure domain và gate cách ly theoT19.

70worksheet not_run,122release entries unverified; reviewer/signoff null,
gates L/S/P/U/B không được mở. Các yêu cầu khóa/provider thật giữ pending theo
case; lượt này không tác động serving database, VPS thật, DNS hoặc email Internet.
