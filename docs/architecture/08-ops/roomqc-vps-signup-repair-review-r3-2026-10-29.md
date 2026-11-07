# RoomQC — cập nhật kế hoạch và kết quả kiểm local ngày 29/10/2026

Phạm vi khách đã chọn: toàn bộ VPS + signup; đầu ra là plan + nghiệm thu. Kế hoạch chi tiết và các phiếu BG01–BG11 ở [blueprint](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#9-phiếu-thực-hiện-bg01bg11-từ-bản-301); [bộ nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md) giữ riêng expected, actual, reviewer và signoff.

## Bản nguồn được kiểm

Backend 301 tệp, SHA256 ede96ea6b5bf568785209ffd5d87ddbb06674d87cbfd2322c5015f342e98bca7. Các lượt bên dưới dùng source/hash riêng được kiểm đầu–cuối; tài nguyên thử có ownership và cleanup. DB đang phục vụ, credential vận hành và cờ signup không đổi.

| Lượt kiểm | Actual | Kết luận theo phạm vi |
|---|---|---|
|[Control regression](../../../artifacts/roomqc-workspace-recheck-838f5f251a47-local-2026-10-29.json)|678 tổng, 676 pass, 0 fail, 2 skip|Terminal0; source unchanged; fixture PostgreSQL riêng. Skip theo OS được ghi trong packet|
|[Room writers và production config](../../../artifacts/roomqc-backend-repair-room-writers-e0eb3b4a96aa-local-2026-10-29.json)|539 kiểm luồng đạt; kiểm ACL 41 bảng|Native Auth/REST/CLI, schema trước–sau khớp. Chỉ scoped diagnostic|
|[Filesystem volume tập trung](../../../artifacts/roomqc-backend-repair-setup-installer-volume-10c735c387c0-local-2026-10-29.json)|11 ca / 33 cleanup|Actual CLI UID10001/CapEff0; đây là volume-only, chưa chạy lại toàn IF01–IF17|
|Thu dọn|Các run trên còn 0 container, 0 volume, 0 network theo ownership|Không kết luận về tài nguyên của dự án khác|

## Các vấn đề vừa sửa và ảnh hưởng

1. Booking worker chặn thiếu ngân sách production nhưng báo mã chung. Nay trả bốn mã cấu hình resource trong allowlist; vẫn lọc đường dẫn/DSN/private logs. Ca native tách missing budget, DB không TLS, local provider và environment downgrade; từng ca giữ không gửi thêm thông báo/không thêm business effects.
2. Bảng private.workspace_setup_dispatches chưa có trong inventory direct-ACL. Danh mục nay khóa 41 bảng: 492 browser/probe denial, 152 service denial, 85 positive read/snapshot; riêng dispatch 12+4 denial. Test thêm grant SELECT/UPDATE(column)/DELETE rồi xác nhận bộ kiểm phát hiện và hồi phục. Không thay grant hoặc policy của sản phẩm.
3. Diagnostic volume bị thiếu cấu hình expose schema roomqc_setup và rehearsal upgrade; thêm vào đúng hai nhánh. [Run lỗi trước sửa](../../../artifacts/roomqc-backend-repair-setup-installer-volume-e19900ce2529-local-2026-10-29.json) dừng ngay ở issue seed. Sau sửa, seed/REST trên output thường đã chạy qua; không hạ quyền hoặc bỏ native RPC.
4. Lỗi sản phẩm ở recovery sau ENOSPC intent: exclusive create đã để lại tệp intent 0 byte, nhưng reader mặc định từ chối tệp rỗng. Publisher nay cho phép đúng empty prefix của intent do nó quản lý sau private-file/inode checks; signer, DSN, config và token reader giữ mặc định nonempty. Bài hồi quy bổ sung kiểm empty input mặc định bị từ chối, opt-in phục hồi, hardlink bị chặn và giới hạn kích thước vẫn giữ. [Run lỗi trước sửa](../../../artifacts/roomqc-backend-repair-setup-installer-volume-11a42337563e-local-2026-10-29.json) được giữ; lượt quan sát nguyên nhân có sửa tạm thời không dùng làm proof nghiệm thu.

## Trạng thái kiểm volume

Lượt IF15 tập trung hiện hành đạt đủ 11 ca positive→fault→recovery, 33 lần cleanup. Lỗi ENOSPC không còn làm kẹt tệp intent rỗng. Mỗi ca giữ credential ID/iat/exp, canary và single command/audit/credential; lỗi sync sau rename không báo ready giả. Đây là volume-only. Rebuild độc lập full trên source cuối đã hoàn tất ở run `afe3e00ebfa2` và có packet riêng; không gán bằng chứng cũ hoặc cộng nhiều source thành một run.

## Phiếu công việc tiếp theo

| Thứ tự | Việc cụ thể | Điều kiện kết thúc |
|---|---|---|
| BG01.1 | Khép volume ENOSPC/EACCES/EROFS/fsync/rename, positive→fault→replay cùng receipt; giữ ID/iat/exp và canary | Đúng syscall/errno, không ready giả, không thêm command/audit/credential; chưa có thì giữ open |
| BG01.2 | Chạy setup-installer-filesystem đầy đủ trên source cuối, control cùng nguồn, review IF01–IF17 | Terminal/source/schema/cleanup xác nhận. Không cộng bằng chứng từ nhiều source thành một run |
| BG02 | Viết scheduler thay khóa thật; hai rotator tranh version/receipt; expiry khi daemon chết; mount credential directory read-only và reload worker; protocol revoke Auth→directory | Khóa cũ mất hiệu lực đúng mốc, worker không thấy signer/DSN, không thêm credential ngoài policy |
| BG03–BG05 | Inventory/budget/admission/quota; nối signup→verify→hotel→rooms→staff và console trợ giúp | Một workspace/trial theo request, affinity ổn định, F5/hai tab/mất reply không tạo trùng, quyền đúng và mọi chức năng có chỗ bấm |
| BG06 | Đã chạy full integrated rebuild độc lập trên source cuối; đối chiếu ownership, source/image/schema và cleanup | Run `afe3e00ebfa2` đạt exit 0, phase `permission_controls_verified`, schema trước–sau khớp; gate L vẫn mở cho Linux VPS |
| BG07–BG10 | Linux VPS/TLS/network, offsite restore + on-call, A/B và web/Android E2E, tải và RC | Actual theo đúng môi trường và SLO; nguồn lực thật cần Q01–Q10; chưa cam kết 1.000 khách sạn/100.000 người đồng thời |
| BG11 | Pilot ít nhất 7 ngày, tổng hợp incident/capacity/cost/feedback | Reviewer nhận và quyết định rollout; thời gian pilot không rút bằng số test |

## Cách dùng hồ sơ nghiệm thu

Dùng [checklist r3](../../../artifacts/roomqc-vps-signup-execution-checklist-r3-2026-10-29.json) để giao việc. Giữ 8 đợt, 25 task, 27 gói, 70 ca và 124 lượt (54 local, 69 staging, 1 pilot). Mỗi lượt điền source/image/schema/config, dataset sở hữu, expected, actual, UI/API/DB/receipt, cleanup, defect và review. Kết quả hỗ trợ local ở trên không tự điền pass vào 70 ca release.

Đầu vào chờ được giữ thành danh sách: VPS/SSH và inventory, roomqc.com DNS/TLS/origins, Resend/sender/webhook/inbox, offsite store/key/restore host, kênh ngoài host/người trực, policy gói và cohort/reviewer. Dùng ref an toàn, không gửi khóa trong chat; tiếp tục phần local không phụ thuộc.

Chưa nghiệm thu sản phẩm hoặc mở signup công khai. Rebuild local đã có bằng chứng riêng; daemon rotation, Linux VPS, DR, tải, browser/Android E2E, pilot và reviewer/signoff vẫn cần bằng chứng riêng. Reviewer/signoff/gates chưa thay đổi.

## Kết quả rebuild độc lập sau cùng

- Packet: [roomqc-backend-independent-rebuild-afe3e00ebfa2-local-2026-10-29.json](../../../artifacts/roomqc-backend-independent-rebuild-afe3e00ebfa2-local-2026-10-29.json).
- Run `afe3e00ebfa2` trả exit code 0; ownership cuối là `cleaned=true`, phase `permission_controls_verified`, `diagnosticOnly=false`, `fullIntegratedRun=true`.
- 301 tệp backend giữ nguyên SHA256 `ede96ea6b5bf568785209ffd5d87ddbb06674d87cbfd2322c5015f342e98bca7`; 584 migration replay; schema trước và sau cùng là `7320920934f9174109066019e5da60bb1709aa599936c2d587e9959928034a96`.
- Các nhóm kiểm tenant/parent boundary, registration, employee/profile, password/recovery, email, workflow, room writers, permissions và managed health đều đạt; cleanup là 0 container, 0 volume, 0 network.
- Kết quả này chỉ xác nhận rebuild local độc lập. `productAccepted=false`, `goalComplete=false`, không mở gate và không bật signup production.
## Kết quả diagnostic filesystem installer

- Packet: [roomqc-backend-installer-filesystem-f9b57c8fb3f6-local-2026-10-29.json](../../../artifacts/roomqc-backend-installer-filesystem-f9b57c8fb3f6-local-2026-10-29.json).
- Run `f9b57c8fb3f6` trả exit code 0, ownership `cleaned=true`, phase `setup_installer_filesystem_diagnostic_verified`, source hash vẫn là `ede96ea6b5bf568785209ffd5d87ddbb06674d87cbfd2322c5015f342e98bca7`.
- 181 kiểm native đạt; IF01–IF17 đều có kết quả, gồm IF12 với 4 điểm SIGKILL/syscall, IF14 với 49 ca quyền non-root và IF15 với 11 ca lỗi volume/FUSE. Các ca giữ cùng command key/credential expiry, không false-ready và cleanup đúng ownership.
- Đây là diagnostic local có fixture release authority. `rotationDaemonVerified=false`, `runtimeMountReloadVerified=false`, `hardwareDiskDurabilityVerified=false`; không dùng packet này để mở gate Linux VPS hoặc product acceptance.
## Kết quả rehearsal backup/restore local

- Packet: [roomqc-backup-restore-rehearsal-9f03b89d7f0f-local-2026-10-29.json](../../../artifacts/roomqc-backup-restore-rehearsal-9f03b89d7f0f-local-2026-10-29.json).
- Snapshot nhất quán từ PostgreSQL local được khôi phục vào container mới, mạng `none`, không publish port; inventory khớp toàn bộ 203 bảng dữ liệu, 385 policy, 903 constraint và 460 function.
- Bốn artifact backup được kiểm SHA256; roles export không chứa password; restore mất 4,6 giây và container tạm đã được xoá sau khi đối chiếu.
- Đây mới là local rehearsal. Offsite storage, object bytes, Auth/provider và clean Linux VPS restore chưa có bằng chứng; `offsiteRestoreProof=false`, product acceptance và gate vẫn giữ nguyên.