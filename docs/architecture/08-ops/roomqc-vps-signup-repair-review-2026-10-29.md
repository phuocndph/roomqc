# RoomQC — cập nhật kế hoạch và kết quả kiểm local ngày 29/10/2026

Phạm vi khách đã chọn: toàn bộ VPS + signup; đầu ra là plan + nghiệm thu. Kế hoạch chi tiết và các phiếu BG01–BG11 ở [blueprint](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#9-phiếu-thực-hiện-bg01bg11-từ-bản-301); [bộ nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md) giữ riêng expected, actual, reviewer và signoff.

## Bản nguồn được kiểm

Backend 301 tệp, SHA256 8e88e86c637c3d262562c409617822088bf68e629ca8b6b5bd07bb4505b13cfc. Các lượt bên dưới dùng source/hash riêng được kiểm đầu–cuối; tài nguyên thử có ownership và cleanup. DB đang phục vụ, credential vận hành và cờ signup không đổi.

| Lượt kiểm | Actual | Kết luận theo phạm vi |
|---|---|---|
|[Control regression](../../../artifacts/roomqc-workspace-recheck-dc0aadc5cde8-local-2026-10-29.json)|677 tổng, 675 pass, 0 fail, 2 skip|Terminal0; source unchanged; fixture PostgreSQL riêng. Skip theo OS được ghi trong packet|
|[Room writers và production config](../../../artifacts/roomqc-backend-repair-room-writers-c75256a3cd96-local-2026-10-29.json)|539 kiểm luồng đạt; kiểm ACL 41 bảng|Native Auth/REST/CLI, schema trước–sau khớp. Chỉ scoped diagnostic|
|[Filesystem volume tập trung](../../../artifacts/roomqc-backend-repair-setup-installer-volume-2f095701ef5f-local-2026-10-29.json)|Chưa đạt: SANDBOX_PHASE_FAILED|Giữ lỗi mở, chưa dùng để nhận IF15|
|Thu dọn|Các run trên còn 0 container, 0 volume, 0 network theo ownership|Không kết luận về tài nguyên của dự án khác|

## Các vấn đề vừa sửa và ảnh hưởng

1. Booking worker chặn thiếu ngân sách production nhưng báo mã chung. Nay trả bốn mã cấu hình resource trong allowlist; vẫn lọc đường dẫn/DSN/private logs. Ca native tách missing budget, DB không TLS, local provider và environment downgrade; từng ca giữ không gửi thêm thông báo/không thêm business effects.
2. Bảng private.workspace_setup_dispatches chưa có trong inventory direct-ACL. Danh mục nay khóa 41 bảng: 492 browser/probe denial, 152 service denial, 85 positive read/snapshot; riêng dispatch 12+4 denial. Test thêm grant SELECT/UPDATE(column)/DELETE rồi xác nhận bộ kiểm phát hiện và hồi phục. Không thay grant hoặc policy của sản phẩm.
3. Thêm diagnostic setup-installer-volume có source snapshot chỉ đọc và witness UID riêng; lỗi positive chỉ kèm mã an toàn. Chế độ này không thay ma trận filesystem đầy đủ, control regression hoặc full-default. Lượt đầu vướng allowlist mount đã được giữ làm bằng chứng lỗi harness.

## Lỗi volume còn mở

Lượt filesystem đầy đủ trước đó đã hoàn thành 166 controls rồi dừng ở positive đầu tiên của volume; chưa chạy 11 fault của IF15. Lượt tập trung mới dừng sớm hơn tại issue khởi tạo trước ma trận volume, terminal1; không timeout và cleanup0. Đây là hai lỗi khác thời điểm, chưa có bằng chứng cùng nguyên nhân. Cần đưa mã CLI an toàn vào assertion khởi tạo, xác minh positive trên output thường, rồi output FUSE; sau khi hiểu nguyên nhân mới chạy lại toàn bộ. Không đổi quyền sản phẩm hoặc hạ expected để đi qua fixture.

## Phiếu công việc tiếp theo

| Thứ tự | Việc cụ thể | Điều kiện kết thúc |
|---|---|---|
| BG01.1 | Khép volume ENOSPC/EACCES/EROFS/fsync/rename, positive→fault→replay cùng receipt; giữ ID/iat/exp và canary | Đúng syscall/errno, không ready giả, không thêm command/audit/credential; chưa có thì giữ open |
| BG01.2 | Chạy setup-installer-filesystem đầy đủ trên source cuối, control cùng nguồn, review IF01–IF17 | Terminal/source/schema/cleanup xác nhận. Không cộng bằng chứng từ nhiều source thành một run |
| BG02 | Viết scheduler thay khóa thật; hai rotator tranh version/receipt; expiry khi daemon chết; mount credential directory read-only và reload worker; protocol revoke Auth→directory | Khóa cũ mất hiệu lực đúng mốc, worker không thấy signer/DSN, không thêm credential ngoài policy |
| BG03–BG05 | Inventory/budget/admission/quota; nối signup→verify→hotel→rooms→staff và console trợ giúp | Một workspace/trial theo request, affinity ổn định, F5/hai tab/mất reply không tạo trùng, quyền đúng và mọi chức năng có chỗ bấm |
| BG06 | Full-default trên source cuối rồi dựng lại độc lập theo ownership.json của full run | Hai run cùng source/image/schema, không dùng scoped packet thay full run; review gate L |
| BG07–BG10 | Linux VPS/TLS/network, offsite restore + on-call, A/B và web/Android E2E, tải và RC | Actual theo đúng môi trường và SLO; nguồn lực thật cần Q01–Q10; chưa cam kết 1.000 khách sạn/100.000 người đồng thời |
| BG11 | Pilot ít nhất 7 ngày, tổng hợp incident/capacity/cost/feedback | Reviewer nhận và quyết định rollout; thời gian pilot không rút bằng số test |

## Cách dùng hồ sơ nghiệm thu

Dùng [checklist r2](../../../artifacts/roomqc-vps-signup-execution-checklist-r2-2026-10-29.json) để giao việc. Giữ 8 đợt, 25 task, 27 gói, 70 ca và 124 lượt (54 local, 69 staging, 1 pilot). Mỗi lượt điền source/image/schema/config, dataset sở hữu, expected, actual, UI/API/DB/receipt, cleanup, defect và review. Kết quả hỗ trợ local ở trên không tự điền pass vào 70 ca release.

Đầu vào chờ được giữ thành danh sách: VPS/SSH và inventory, roomqc.com DNS/TLS/origins, Resend/sender/webhook/inbox, offsite store/key/restore host, kênh ngoài host/người trực, policy gói và cohort/reviewer. Dùng ref an toàn, không gửi khóa trong chat; tiếp tục phần local không phụ thuộc.

Chưa nghiệm thu sản phẩm hoặc mở signup công khai. Full integrated/rebuild, daemon rotation, Linux VPS, DR, tải và pilot còn cần bằng chứng riêng. Reviewer/signoff/gates chưa thay đổi.
