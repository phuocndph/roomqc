# RoomQC — bàn giao lịch sử và giám sát tác vụ local

Ngày chốt: 18/10/2026, Asia/Bangkok. Phạm vi: phần bổ sung A1 và panel quản trị
A3 của kế hoạch quản lý khách hàng RoomQC. Các đợt code/kiểm thử bắt đầu ngày
17/10. Báo cáo này thay thế trạng thái “chưa tích hợp/chưa deploy” trong báo
cáo nhánh [A1](a1-durable-history-2026-10-17.md) và
[A3](a3-job-monitor-2026-10-17.md); không thay thế các giới hạn còn lại.

## Kết quả đã đưa vào bản local

- RoomQC tại `http://127.0.0.1:8082` đang chạy image
  `roomqc-local:a1-monitor-e237786`, trạng thái Docker healthy, chỉ bind
  loopback 127.0.0.1:8082. Image ID:
  `sha256:e7c84161eef1a6adb47d023702d621955fd4c8bb98e09c422a22cb190c9f2c67`.
- Source runtime là integration commit `e237786`. Migration
  `20261017155727_subscription_status_job_history.sql` đã áp lên DB local;
  migration history đã đối chiếu. Edge source local đã đồng bộ.
- Worker phải ghi nhận admission bền vững trước thực hiện công việc. Chỉ một
  lượt được nhận; lượt cạnh tranh ghi busy, cùng run ID không chạy lại.
- Kết quả chuyển trạng thái không xác định hoặc quá hạn 15 phút được coi là
  interrupted và tiếp tục chặn lượt mới. Không auto takeover/retry. Deadline
  không hủy được câu lệnh DB đang chạy và không chứng minh chưa commit.
- Lỗi start/finish bền vững trả lỗi thay vì báo thành công. Kết quả subscription
  và staff tách riêng; lỗi staff không làm mất số chuyển trạng thái đã xác nhận.
  Summary chỉ lưu các trường/mã lỗi được cho phép, không lưu SDK error thô,
  token hoặc thông tin cá nhân.
- Panel chỉ đọc tại tổng quan super-admin: lần thành công đầy đủ gần nhất,
  lượt đang chặn, lỗi/gián đoạn gần nhất, tối đa 25 lượt và backlog có thời điểm
  đo. Tải lại không chạy job; tự đọc lại mỗi 60 giây khi màn hình hoạt động.
- Chưa có lịch sử thì hiện chưa ghi nhận; scheduler luôn chưa xác minh.
  Backlog chỉ theo predicate worker cũ, không phải tổng kiểm toán entitlement.
  Mất quyền/phiên hoặc lỗi tải sẽ ẩn bằng chứng cache, không hiển thị thành 0.
- RPC monitor kiểm tra admin, session và tài khoản trực tiếp ở server. Bảng
  private bật RLS và không cho client kể cả service_role truy cập trực tiếp;
  begin/finish chỉ qua RPC service_role, monitor chỉ cho admin hợp lệ.

## Bằng chứng kiểm chứng

| Phạm vi | Kết quả | Giới hạn |
|---|---|---|
| Vitest tổng hợp | 99 file đạt, 2 file skip; 769 test đạt, 16 skip | 785 test tổng; không tính skip là pass hoặc coi là browser E2E |
| DB độc lập | 67/67 đạt | DB UUID riêng, schema phụ thuộc; không sao chép dữ liệu thật |
| Auth HTTP và RPC local | 14/14 đạt | Có Auth thật và mutation lịch sử trong transaction ROLLBACK; không gọi worker/lifecycle |
| Deno handler | 11/11 đạt; entrypoint check đạt | Runtime test deny net/env/write/run/ffi; store fixture, không phải authorized deployed worker run |
| TypeScript/ESLint | Đạt trên source thay đổi | Không che lỗi bằng thay type hoặc ngưỡng kiểm tra |
| Build/container | Docker build và smoke candidate + 8082 đạt | Không phải load test; vendor bundle còn khoảng 14,16 MB minified/4,72 MB gzip |
| DB lint/security advisors | Public/private lint không lỗi; warn/error security không có | Còn 12 informational RLS-enabled-no-policy, gồm private RPC storage cố ý deny và email tables hiện hữu |
| Edge đang chạy | OPTIONS 204, GET 405, POST không xác thực 403 | Không gửi authorized POST vào worker toàn cụm |

DB tests kiểm tra 20 start đồng thời: đúng 1 accepted và 19 busy; replay cùng
run không chạy lại; finish giống nhau an toàn, summary khác bị từ chối; timeout
và unknown outcome tiếp tục chặn; busy/interrupted không đổi last-success.
Grants, RLS, session revoked/expired, role removed, admin locked/inactive/
banned/unconfirmed và quyền owner/staff/anon đều được kiểm tra. Snapshot
tenant/invoice/payment không đổi trong thử nghiệm RPC.

Browser đã kiểm tra trên candidate **cùng image ID với bản 8082 hiện tại**:
đăng nhập fixture admin → mở monitor → tải lại; khóa fixture admin ở server →
tải lại bị từ chối và ẩn cache → mở khóa → đọc lại phục hồi. Không tạo lịch sử
giả để có last-success. Đã đăng xuất fixture và đóng tab thử. Không đổi phiên
đăng nhập của người dùng trên bản chính. Ảnh kiểm chứng:
`artifacts/roomqc-job-monitor-20261017.jpg` trong repo gốc.

## An toàn dữ liệu và triển khai

- Trước DDL có pg_dump custom:
  `/tmp/roomqc-before-a1-history-20261017.dump` trong container DB local,
  4.012.894 byte; pg_restore --list đọc được 5.252 dòng. Đây là snapshot trong
  container, **chưa phải backup độc lập hoặc diễn tập restore thành công**.
- Áp DDL và ghi migration history cùng transaction; lock timeout 5 giây,
  statement timeout 30 giây. Fingerprint toàn dòng tenant/invoice/payment
  không đổi sau DDL.
- Bản rollback ứng dụng giữ ở `roomqc-local:parallel-9886e86`, ID
  `sha256:3a145fb8a65e447471d0116b2db433c84a8a60073387ea99b3c59b2fcbfdabd5`.
  Rollback UI không có nghĩa rollback worker/DB; DB additive, không reset.
- Đã xóa đúng fixture run `d370bb4c`: tài khoản/tenant, chứng từ thử và thư
  local thuộc manifest; script xác nhận không còn và bỏ manifest. Các bản ghi
  thử này là dữ liệu dùng một lần, có thể tạo lại bằng harness.
- Candidate `roomqc-a1-monitor-candidate-20261017` không volume đã được gỡ.
  Kiểm tra cuối: 0 run history thử còn lưu, 0 DB `roomqc_a1_verify_*`,
  0 cron gọi check-subscription-status. Không mở scheduler.
- Source được đồng bộ có kiểm tra baseline vào repo gốc; giữ HEAD main
  `00eab56` và index gốc, không merge/reset/stash, không push remote.
  Không thay CRM, chạy global lifecycle sweep, thanh toán hoặc email Internet.

## Phần còn lại và thứ tự tiếp tục

A1 **chưa hoàn tất**. Durable admission ngăn start đồng thời nhưng chưa làm
transition + audit + notification nguyên tử và chưa ngăn race gia hạn/settlement.

1. **A1 — transition/outbox/scoped harness:** kiểm kê predicate/trigger hiện có;
   thiết kế transaction khóa và recheck cùng hàng tenant với gia hạn, audit
   transition và unique outbox key. Worker có harness chỉ nhận allowlist tenant
   fixture, không có đường fixture fallback thành global. Test renewal/job
   đồng thời, response mất sau commit, replay, lỗi notification, backlog qua
   batch. Giữ chính sách gói hiện tại; phần đổi grace/read-only cần duyệt riêng.
2. **A1 — phục hồi interrupted:** đề xuất quy trình kiểm tra outcome và bằng
   chứng trước release; command có reason/actor/request ID/version, audit cùng
   transaction. Chưa thêm nút “chạy lại” hoặc SQL giải phóng nhanh. Cần xác nhận
   worker cũ đã dừng trước cho lượt mới, không dựa riêng thời gian quá hạn.
3. **A2 — hoàn thiện hồ sơ:** phân công/kết luận/mở lại, tìm lại hồ sơ, history,
   version/retry qua reload; test không thay invoice/payment/entitlement.
4. **A3 — dữ liệu lớn:** pagination/search/count/aggregation tại server rồi đo
   query/bundle; không suy ra sức chứa từ số unit test.
5. **A4 — hồi quy:** browser desktop/mobile, hai tab, mất mạng/phiên, race;
   ghi pass/fail/not-run từng luồng. Chưa coi kiểm thử trên là toàn bộ E2E.

Alert thực, scheduler production, staging/VPS, DNS/TLS, Resend/SMTP, provider
thanh toán và restore độc lập tiếp tục trong
[danh sách deferred](roomqc-deferred-access-and-decisions-2026-10-17.md).
Không cần bật hoặc xin khóa mới để hoàn thiện các bước mã nguồn/test local
ở trên. Không công bố hoàn toàn ổn định hoặc sẵn sàng khách trả phí.
