# M06/T08 R3 — credential/session lifecycle local

Ngày 19/10/2026. Source base `5cb583729ce055db64df8b192f10476db1fa99b8`, branch
`codex/roomqc-parallel-integration`. Implementation còn uncommitted tại worktree
integration, không sync code sang primary hoặc deploy. Toàn bộ 27 gói / 25 bước /
70 acceptance vẫn là mục tiêu; báo cáo này không thu hẹp scope thành R3.

## Kết quả thực hiện

Đã xây encrypted credential store trong directory riêng, AES-256-GCM/AAD theo
cluster/ref/endpoint-release/revision, keyring file riêng, lease/CAS và revision
fencing. Worker không giữ mật khẩu canary/service_role, không tự tạo user hoặc
password-login khi token lỗi. Các vai trò API/provision-worker/metrics-only không
đọc/ghi bảng ciphertext. Audit thay đổi cùng transaction, chỉ metadata an toàn.

Auth refresh chỉ một request; gần hết hạn thì một worker claim, các worker khác
bị busy. Mất phản hồi hoặc crash không steal lease/không retry refresh token cũ;
chuyển needs_recovery. Installer recovery explicit có expected revision, giữ cùng
canary user; có thể cấp phiên mới hoặc re-encrypt dưới KEK mới. Kết quả probe cũ
bị từ chối nếu revision/binding đổi trước khi trả kết quả.

[ADR](../adr/roomqc-probe-credential-lifecycle.md) ghi ranh giới quyền, định dạng/
binding, chính sách thời gian, trạng thái và hạn chế; các giá trị local không tự
thành policy production. [Artifact](../../../artifacts/roomqc-m06-session-local-2026-10-19.json)
ghi nguồn/log checksum; không chứa token, key, DSN, email hay payload Auth.

## Kiểm thử đã thực hiện

| Nhóm | Bằng chứng hành vi |
|---|---|
| Mã hóa | Ciphertext khác nhau cho cùng input, decrypt đúng; tamper tag/nonce/body, đổi cluster/ref/revision/hash/key ID bị chặn; mất key không fallback |
| Secret input | Absolute file/shape/size; Unix permission + symlink nhánh có test khi chạy Unix; Windows ACL chưa được nghiệm thu bằng mode |
| Grants/audit | Login runtime/installer thật, API/worker/metrics không bảng/cột secret; runtime bị DB chặn DDL/binding/workspace/delete/audit sửa; audit lỗi rollback cả rotation |
| Race | Một worker đang giữ HTTP, tám worker khác tranh slot đều busy; chỉ một refresh; connection khác vẫn lấy được cùng advisory lock trong thời gian HTTP |
| Restart/fence | Process reconstruction đọc token pair đã lưu; lease hết hạn vào recovery, không steal; stale completion/failure/result sau installer rotation không ghi đè |
| Recovery/key rotation | Cùng user, session mới chỉ do installer explicit; đổi KEK giữ cùng bundle/identity, runtime cũ không giải mã được |
| Cancel/deadline | Abort sau committed claim không gọi HTTP/probe, quarantine; DB lock kéo dài bị đóng connection/rollback, không late commit |
| Auth thật | GoTrue v2.197.0 pin digest refresh nhiều lần, giữ user/session, live `/user`, token pair quay vòng và lưu bền vững; logout bị chặn, installer login phục hồi cùng user; count auth.users vẫn một |
| Mất phản hồi thật | Prefix adapter đợi GoTrue trả HTTP 200 và drain xong body mới hủy response xuống coordinator; needs_recovery, lần chạy sau không gửi thêm refresh request |

Auth fixture dùng PostgreSQL 16 pin digest, database `auth_fixture` và
`directory_fixture` riêng, group runtime/installer riêng, cổng host loopback ngẫu
nhiên. Tạo đúng một user synthetic domain `.invalid`; không SMTP/provider/email.
Prefix adapter chỉ forward tới một port owned, không nhận destination tùy ý.
Nó **không** chứng minh gateway upstream thật hoặc auth schema của full application.

Fixture khởi tạo từng gặp lỗi: Docker Desktop không nối được cổng publish của
internal network; thiếu schema auth; search_path role mặc định không thấy
identities. Đã sửa đúng fixture thành loopback-published network/schema owner/
role search_path. Không mở quyền hoặc sửa role/schema backend nghiệp vụ. Những
lượt thất bại không được tính pass; exact-label cleanup chạy sau từng lượt.

Full-suite đầu có một lỗi assertion cũ hardcode `0006` dù migration mới `0007`
đã apply; test readiness đã đổi sang version cuối của manifest, không bỏ kiểm
readiness. Không cộng các lượt 111/122 hoặc focused subset để tăng tổng số test.

Current tree: **123/123 tests đạt, 0 fail/skip/cancel**, exit 0, thời gian
128904,4421 ms. Command `node scripts/test-control-directory.mjs`; log
`.local/roomqc-r3-control-suite-2026-10-19-current.log`, checksum và 16 source
file hashes trong artifact. Bao gồm 7 credential DB cases, 4 unit/transport cases,
1 pinned Auth lifecycle case; các tests cũ vẫn chạy trong cùng suite. Không cộng
focused 10 hoặc các suite cũ vào 123; không quy đổi thành 123/70 acceptance.

Log lịch
sử `.local/roomqc-r3-control-suite-2026-10-19.log` (121/122) và
`...-final.log` (122/122 trước bổ sung lost-response/cancel assertions) không thay
current proof.

## Trạng thái và phần chưa hoàn tất

R3: implemented/local lifecycle verified, **chưa đóng ticket tổng thể**. M06/T08
vẫn `in_progress_unverified`. Phải làm tiếp:

1. R4: server-caller/view/definer/permissive-policy/FK triage theo báo cáo advisors.
   Không xóa index hoặc thêm allow-all policy chỉ để giảm finding.
2. R5: trusted release artifact + installer/recovery CLI, identity binding,
   issuer/TTL/rotation calendar, KEK mount/ACL/overlap/backup/restore. Class API và
   fixture installer không thay runbook/tool đã phát hành.
3. R6: health runtime config/probes và gateway dùng đúng dedicated credentials;
   health/admission snapshot transaction recheck credential revision/binding.
   Guard cuối `ProbeSessionManager.run()` chỉ bảo vệ trước return, chưa bảo vệ
   khoảng trống tới transaction ghi health khác. Không nối bằng boolean fallback.
4. R7: full five-service vendor pipeline với lifecycle coordinator mới, two-backend
   routing/isolation, fault/time/restart và current release proof; scheduled soak
   staging riêng. R1/R2 proof 523 migrations vẫn là lịch sử đúng của mã tương ứng,
   không bị thay bằng Auth-only fixture này.
5. Tiếp tục M05/M10 pipeline, M07–M09 alerts/outbox/heartbeat, P3–P8 signup/admin/
   deploy/backup/E2E/load/pilot theo dependency của plan.

## Bảo toàn và runtime

Không migrate/fault/reset project nghiệp vụ `ehjtoajnlnuvuiwkpmbp`, không tác động
CRM, không đổi DNS/TLS/email, không mở signup hoặc triển khai monitor thường trực.
Source directory mới có `0007`, runtime đang phục vụ còn `0005`; hai trạng thái
khác nhau có chủ ý, chưa triển khai code mới vào runtime. Ready direct/proxy đều
200 ở lần kiểm read-only 19/10 16:00 UTC; signup env false. Image control/frontend
giữ nguyên. Primary index SHA256 giữ
`72CAD3BA4118DE5B36523B9C9F57FAE0F7166FEAAE37A225C8481419E001F79F`.

Test tự xóa các container/network owned sau kiểm label chính xác, dữ liệu fixture
tmpfs không giữ lại; đây là dữ liệu synthetic có thể tạo lại, không backup khách.
Không lấy cleanup label của fixture áp dụng vào container/volume production.
