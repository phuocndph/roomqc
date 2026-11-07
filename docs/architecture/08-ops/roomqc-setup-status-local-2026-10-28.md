# T11 — tiến độ đăng ký riêng cho chủ tài khoản, kiểm thử local ngày 28/10/2026

## 1. Kết quả và giới hạn

Đã nối GET `/api/control/workspaces/{slug}/setup-status` → typed client →
hook theo phiên/cụm → màn thiết lập khách sạn. Chủ đăng ký xem được bước hiện tại,
thao tác tiếp theo và mã hỗ trợ. Khi lần cấp trước chưa rõ kết quả, form giữ dữ
liệu và chặn gửi lại; receipt đã khớp cho phép mở luồng callback để bootstrap đối soát.

Đây là phần triển khai local của T11. Chưa hoàn thành T11/T12, chưa nghiệm thu
D01–D15 hoặc VPS, chưa mở signup production. Hành trình resume sau F5/thiết bị
mới, live Auth, worker và toàn bộ E2E vẫn cần bằng chứng riêng.

Bằng chứng: [artifact run 93df1cd3bf1e](../../../artifacts/roomqc-setup-status-93df1cd3bf1e-local-2026-10-28.json).
Backend 231 file, SHA256
`57cf6fe5fcc9f47fadc3735cfe9b8159c8d59ce6c0092a4da5da42d23b11d674`;
16 file frontend/config có hash riêng. Source không đổi trong lượt kiểm.

## 2. Hành vi đã triển khai

| Tình huống | Kết quả hiển thị và thao tác |
|---|---|
| Reservation sạch, chưa bắt đầu cấp | Cho nhập và tiếp tục thiết lập |
| Job queued/leased/retry đúng routing version | Hiện đang xử lý, kiểm lại sau 3–60 giây |
| Đã gửi nhưng không có receipt/job đủ kết luận | Cần RoomQC đối soát; không mở lại nút cấp |
| Receipt đã khớp, directory chưa active | Đang xác nhận; có nút Mở khách sạn qua callback/khôi phục bootstrap hiện có |
| Directory active và receipt khớp | Mở khách sạn |
| Cụm không phản hồi | Chờ kiểm lại; không coi là mất dữ liệu hoặc cho tạo lại |
| Receipt/mapping xung đột | Cần hỗ trợ; không lộ diagnostics bên trong |
| Đổi tài khoản, phiên, workspace hoặc cụm khi đang đọc | Hủy lượt cũ; phản hồi muộn không được hiển thị hoặc cho submit |

API không ghi job, activate, provision hoặc audit. Quyền dùng live
`registration_actor` RPC của gateway hiện có, kiểm email đã xác minh và session,
đối chiếu email HMAC + owner ở primary. Sau khi đọc receipt, đọc lại snapshot
mapping/job và kiểm lại phiên. Query tự gán owner/tenant/cluster bị từ chối.

Client kiểm workspace ID, routing version, step/action, khoảng polling và support
ID; chỉ giữ DTO công khai. Onboarding kiểm tiến độ lần nữa trước POST, kiểm lại
phiên trước gửi, giữ nội dung form khi lỗi và chặn kết quả của ngữ cảnh đã cũ.
Native transport chỉ cho GET đúng đường dẫn này, không query hoặc chuyển hướng.

Không lưu mật khẩu hoặc owner JWT trong job. Không thêm migration hoặc thay DB
đang phục vụ. Không thay giao thức provision cũ thành worker trong packet này.

## 3. Kiểm thử đã chạy

Lệnh lặp lại từ integration:

```powershell
node scripts/test-control-setup-status.mjs
```

Lệnh tạo riêng PostgreSQL có label theo run, dùng login thuộc nhóm
`roomqc_control_api`, chạy các kiểm độc lập, kiểm source trước/sau và cleanup.
Artifact ghi chính xác lệnh, thời gian, exit, hash và ranh giới adapter.

| Kiểm | Kết quả |
|---|---|
| Backend quyền/status/HTTP/contract và hồi quy gateway | 21/21, exit 0 |
| PostgreSQL primary + API runtime role; HTTP race/recovery | 2/2, exit 0 |
| Client/hook/onboarding/native transport | 42/42, exit 0 |
| TypeScript toàn src | exit 0 |
| ESLint phần thay đổi, max-warnings=0 | exit 0 |
| Docker có label của run sau kiểm | 0 container / 0 volume / 0 network |

DB kiểm reservation → provisioning → job → receipt → active; 20 lượt đọc giữ
nguyên workspace/job/attempt/support-action. Thay routing hoặc tạo job trong lúc
đọc receipt trả 409 và lượt sau phục hồi được.

Backend HTTP chạy thật trên loopback và PostgreSQL là thật. **Adapter Auth và
receipt của các ca này là giả lập**; không thay bằng chứng Supabase Auth thật.
Giao diện chạy jsdom; Android chỉ mock CapacitorHttp, chưa có thiết bị/emulator
E2E. Chưa có full backend/rebuild của release candidate cuối.

## 4. Nghiệm thu giữ nguyên

70 ca worksheet vẫn `not_run`; 122 mục release vẫn `unverified`. Không đổi
reviewer, signoff, gate hoặc tiêu chí ca gốc. API inventory hiện có 24 operation:
8 foundation, 12 implemented-local, 3 planned, 1 partial-local. Nhãn local không
đồng nghĩa task hay sản phẩm đã nghiệm thu.

## 5. Đầu việc nhận tiếp

| Đầu việc / vai trò | Đầu vào và file | Thao tác và đầu ra cần giao | Nhận khi |
|---|---|---|---|
| T12 giao thức dispatch / BE → QA | `app.mjs`, `store.mjs`, `cluster.mjs`, directory jobs, remote provisioning/receipt RPC | Persist dispatch trước network; xác định commit/unknown và giao thức đóng cửa sổ dispatch; version/key không đổi khi retry | Receipt missing không được hiểu là an toàn tạo lại nếu transaction cũ còn có thể commit; có proof hai tab và response muộn |
| T12 worker / BE+OPS → QA | State machine đã chốt, role grants và resource budget | Worker chỉ đối soát receipt, claim/lease/fencing theo DB clock, bounded retry, routing/owner guards; không impersonate owner để cấp dữ liệu | Kill từng cửa sổ trong phiếu T12; stale lease không ghi active; hai worker không tạo hai kết quả |
| T12 backfill/recheck / BE+FE → QA | Workspace legacy provisioning và command receipt | Dry-run/count, enqueue idempotent có reason/key/version, UI tra tiến độ; không có nút tạo tenant thay chủ | D07–D11/A07 đúng môi trường; replay cùng key một job; payload khác conflict; unknown giữ needs_review |
| T11 resume / BE+FE → QA | Intent/affinity/callback/profile và API đã có | Reload/relogin/thiết bị mới trở lại đúng đăng ký/cụm; draft chỉ tồn tại theo policy dữ liệu đã duyệt | D01–D06/A03 bằng browser/live Auth, một tenant/hotel/trial; email/chủ khác không đọc được |
| T10.b tiếp nối / BE+OPS → QA | Packet vendor source229 và DB/runtime trước đó | Khép vendor unresolved → bind DSN consumer → remaining worker live/rolling overlap; rồi T10.c–f/T23 | Cùng candidate, không vượt ngân sách thực; không suy số user từ connection count |

Giữ dependency của [plan tổng](roomqc-vps-signup-plan-current-2026-10-26.md)
và [phiếu T01–T25](roomqc-vps-signup-detailed-delivery-2026-10-26.md).
Các bước chuẩn bị độc lập có thể làm local; chưa ký đợt phụ thuộc khi T10 chưa đủ.
VPS/DNS/TLS, email inbox, offsite restore/key custody, người trực, A/B, tải/soak,
browser/Android và pilot ≥7 ngày vẫn cần bằng chứng đúng môi trường; phần thiếu
quyền/khóa giữ backlog để xử lý sau theo chỉ dẫn của người dùng.
