# Vận hành email RoomQC

**02/11/2026 — đã xác minh miền Resend:** Đã thêm đúng DKIM/SPF/MX `send`
trên AZDIGI; Resend hiển thị **Verified** cho `roomqc.com` và ba bản ghi.
Chưa tạo khóa gửi mới hoặc cấu hình secret SMTP/API/webhook trên VPS; chưa
gửi thư Internet. Form khóa chỉ quyền gửi cho roomqc.com đang chờ duyệt và
chưa có địa chỉ nhận thử được chỉ định. Xem [biên bản live](roomqc-live-launch-progress-2026-11-02.md).
Các quan sát Failed/chưa đăng nhập phía dưới là lịch sử, không còn là trạng
thái xác minh DNS hiện tại.

<!-- provider-observation-20261030 -->
**Kiểm tra bên ngoài ngày 30/10/2026:** Trình duyệt hiện chỉ thấy trang công khai Resend, chưa truy cập tài khoản/domain. DNS công khai chưa có bản ghi tại những tên đã kiểm (domain gốc, `_dmarc`, `resend._domainkey`, TXT/MX `send`); xem [biên nhận DNS](../../../artifacts/roomqc-email-public-dns-preflight-2026-10-30.json). Chưa loại trừ mọi selector/subdomain, chưa lấy giá trị DNS chính xác từ nhà cung cấp, chưa gửi thư thật hoặc đổi DNS. Trạng thái Failed ghi trong các mục cũ là quan sát lịch sử, chưa được xác nhận lại. Cần truy cập Resend và quyền DNS để hoàn tất; không tự đoán DKIM/SPF hoặc thêm SPF thứ hai.
<!-- /provider-observation-20261030 -->

Cập nhật 16/10/2026. Tài khoản Resend đã mở và miền `roomqc.com` đã được tạo trong Resend, nhưng trạng thái hiện là **Failed** vì các bản ghi DNS chưa được thêm/xác minh. Hiện chỉ gửi vào Mailpit local; chưa cấu hình hoặc gửi email Internet.

## Bản đang chạy ở local

| Thành phần | Cách hoạt động |
|---|---|
| Đăng ký, khôi phục, lời mời | Supabase Auth phát/xác minh OTP qua SMTP Mailpit; 6 chữ số, 10 phút, một lần dùng |
| Nhân viên | Quản lý chọn vị trí/cấp bậc/khách sạn; lời mời chờ chưa có quyền. Chỉ cấp profile, role, hotel sau xác minh và đặt mật khẩu |
| Khách sạn sẵn sàng | Sự kiện DB sau provisioning thành công; khóa sự kiện theo tenant, đường dẫn workspace từ control service |
| Worker | PGMQ; cron local 15 giây; lease chống chạy đồng thời; tối đa 4 thư/lần, 5 lần thử, thư hết hạn sau 12 giờ |
| Quản trị | Super admin xem trạng thái thật, gửi thử, lọc 100 thư gần nhất và thử lại có audit |
| Webhook | Kiểm chữ ký raw body/thời gian/event ID; xử lý trùng/sai thứ tự, bounce/complaint và suppression |

Hộp thư thử: <http://127.0.0.1:54324>. Website: <http://127.0.0.1:8082>. Thư ở Mailpit không đến Gmail/Outlook. Auth và thư nghiệp vụ dùng hai đường gửi, cùng môi trường local.

Chạy lại kiểm thử trong thư mục dự án:

```powershell
npm run test:email:local
npm test
npx tsc -p tsconfig.app.json --noEmit
npm run lint -- --quiet
```

Script integration tự tạo và dọn dữ liệu được đánh dấu riêng; không dùng tài khoản người dùng thực tế và không xóa hộp thư chung. Không chạy script này trên VPS/production. Cài lịch local khi tạo lại stack bằng `npm run email:local:scheduler`; lệnh có chặn endpoint ngoài loopback. Không chạy lại stack hoặc reset DB chỉ để áp dụng mã Edge Function.

## Bật gửi thật cho roomqc.com

1. Chủ hệ thống đăng ký tại <https://resend.com/signup>, bật MFA và kiểm tra gói/hạn mức phù hợp. Chưa phát sinh đăng ký dịch vụ hoặc chi phí trong lần triển khai local này.
2. Miền đang có trong Resend là `roomqc.com`. Sau khi xác minh, dùng địa chỉ `RoomQC <notifications@roomqc.com>` (hoặc tạo riêng miền phụ sau này nếu muốn tách miền gửi). Chỉ cấu hình Reply-To khi có hộp thư hỗ trợ thật được theo dõi.
3. Người quản lý DNS của `roomqc.com` thêm **đúng** tên/loại/giá trị bản ghi do Resend cung cấp. Không có giá trị DKIM/SPF cố định dùng chung; không tự đoán hoặc tạo SPF thứ hai ở cùng hostname. Không thay MX nhận thư hiện có của miền gốc. Thiết lập DMARC theo chính sách miền và quan sát kết quả trước khi tăng mức chặn.
4. Đợi Resend xác minh domain. Tạo API key chỉ quyền gửi cho miền cần dùng. Đưa khóa qua secret manager/env của máy chủ; không gửi khóa trong chat, không đặt `VITE_`, không commit hoặc xuất file status chứa secret.
5. Trước production, dùng staging với một danh sách địa chỉ nhận thử chính xác. Kiểm thử riêng cả SMTP Auth và API nghiệp vụ; allowlist của API **không** tự áp dụng cho Auth SMTP. Auth staging cần giới hạn người truy cập/đăng ký và chỉ dùng địa chỉ thử được kiểm soát.

Ví dụ cấu hình **Edge Runtime** (giá trị mẫu, không chứa khóa):

```dotenv
ROOMQC_EMAIL_ENVIRONMENT=production
ROOMQC_EMAIL_PROVIDER=resend
ROOMQC_PUBLIC_URL=https://roomqc.com
ROOMQC_EMAIL_FROM=notifications@roomqc.com
ROOMQC_EMAIL_FROM_NAME=RoomQC
ROOMQC_EMAIL_REPLY_TO=
RESEND_API_KEY=<server-secret>
ROOMQC_EMAIL_WEBHOOK_SECRET=<webhook-signing-secret>
```

`ROOMQC_PUBLIC_URL` phải là origin thật của website đã triển khai; ví dụ trên không xác nhận DNS/web VPS hiện đã trỏ đúng. Môi trường staging dùng `environment=staging` và `ROOMQC_EMAIL_TEST_RECIPIENTS` là các email đầy đủ ngăn bằng dấu phẩy. Các biến mẫu đầy đủ ở `.env.email.example`.

**Auth trên VPS phải cấu hình riêng**: bật xác minh email, `GOTRUE_SITE_URL` là origin web, SMTP host/port/user/password/sender theo hướng dẫn hiện hành của Resend. Dùng cổng TLS được nhà cung cấp hỗ trợ và kiểm tra VPS không chặn outbound. Dùng các template `supabase/templates/{confirmation,recovery,invite}.html`, phục vụ template cho Auth theo cơ chế self-host đang triển khai. File `supabase/config.toml` là cấu hình CLI local, không tự cấu hình Auth của VPS. Giữ SMTP bật và tắt send-email hook Lovable cũ; không cho hai đường cùng xử lý Auth.

Redirect allowlist phải khớp origin web, workspace path và callback native đã được kiểm soát. Giữ PKCE/native workspace checks hiện có. Không đưa access/refresh token vào URL. OTP cho phép nhập trên thiết bị khác và tránh máy quét email tiêu thụ mã khi chỉ mở trang.

## Cài migration, worker và webhook trên VPS

- Sao lưu DB, thử khôi phục trên môi trường riêng trước khi nâng cấp. Local đã lưu snapshot trước thay đổi tại `backups/roomqc-before-email-20261016.dump`; đây không thay thế backup VPS.
- Áp dụng migrations theo thứ tự, gồm `20261016072409_email_delivery_and_staff_invitations.sql` và `20261016080658_email_admin_retry.sql`. Không dùng `migration repair` để thay thế việc thực thi SQL trên VPS.
- Deploy worker, các endpoint email mới, wrapper `create-user`, các endpoint reset/welcome đã nghỉ và web cùng phiên bản. Kiểm tra quyền service-only/RLS sau deploy. Bản app cũ dùng reset tùy chỉnh sẽ nhận 410 và cần cập nhật.
- Cài một scheduler tin cậy cho từng cụm: gọi POST `/functions/v1/process-email-queue` qua URL nội bộ, mỗi 15 giây khi có thư đến hạn. Dùng secret từ Vault/secret manager; không nhúng key literal vào cron SQL, command hoặc log. Mẫu logic ở `scripts/setup-local-email-scheduler.mjs`, nhưng tên mạng/container local không dùng được nguyên xi trên VPS. Xác minh URL nội bộ của cụm trước khi cấu hình.
- Webhook Resend trỏ đến endpoint HTTPS `/functions/v1/email-provider-webhook`; lưu signing secret ở server. Đăng ký delivered/delivery_delayed/bounced/complained/failed/suppressed theo sự kiện provider hỗ trợ. Gateway cho webhook không cần JWT; handler bắt buộc chữ ký và timestamp.
- Canary một khách sạn nội bộ trước, rồi mới tăng dần. Hạn mức SMTP/API dùng chung tài khoản Resend phải được tính tổng giữa các cụm. Giới hạn worker hiện tại là theo cụm, chưa có bộ giới hạn toàn hệ thống cho 1.000 khách sạn.

## Xử lý lỗi

- `queued/processing`: kiểm cron, lease, cooldown, runtime và kết nối provider. Không chạy worker bằng user JWT; chỉ dịch vụ nội bộ được gọi.
- `accepted` nghĩa là provider đã nhận, không phải inbox. Không thử lại chỉ vì thiếu delivered webhook. Kiểm tra provider bằng message ID và chữ ký webhook.
- `failed`: sửa cấu hình/nguyên nhân trước. Chỉ super admin thử lại thư chưa có provider ID/accepted timestamp, còn hạn 12 giờ và tổng attempts dưới 5; thao tác lưu vào `email_admin_actions`, giữ nguyên event/idempotency key. Thư đã được nhận hoặc hết hạn không được hồi sinh.
- OTP sai/hết hạn/dùng rồi: yêu cầu mã mới từ Auth. Nhân viên chưa hoàn tất nhờ quản lý gửi lại; sau xác minh, resend dùng recovery OTP cho cùng identity. Nhân viên vẫn phải hoàn tất lời mời đúng khách sạn. Không gửi hoặc đọc mật khẩu người dùng.
- Thu hồi lời mời chặn membership dù email đã xác minh. Mời lại sau thu hồi giữ Auth identity cũ trong cùng tenant. Email đã có profile ứng dụng không được chuyển tenant hoặc đổi quyền qua lời mời. Việc chuyển khách sạn/tài khoản cũ là quy trình riêng.
- `bounced/complained/suppressed`: điều tra địa chỉ và chính sách provider; không xóa suppression để gửi lại mù quáng. Auth SMTP cũng chịu suppression của provider; log Auth SMTP không nằm trong bảng delivery nghiệp vụ.
- Hàng đợi cũ không có delivery ID được đưa vào DLQ đã loại nội dung; Auth queue cũ không được worker mới phát lại. Nếu còn Auth hook cũ đang bật, cần tắt trước khi chuyển SMTP.

## Giới hạn và phần tiếp theo

MVP local đã có xác minh/khôi phục/lời mời/workspace-ready và quản trị cơ bản. Chưa nghiệm thu giao thư thật, DNS, Gmail/Outlook, iOS hoặc vận hành VPS. Chưa có cảnh báo vận hành tự động, phân trang/tìm toàn bộ lịch sử, dọn log tự động 90 ngày, opt-in digest hoặc bộ điều phối rate limit giữa các cụm.

`send-invoice-email` và `send-notification-email` đã chuyển sang provider chung, bổ sung quyền/cách ly và làm sạch lỗi. Hai luồng này còn gửi trực tiếp, chưa có durable event/retry như workspace-ready; không tự gửi lại khi mất phản hồi. Campaign/digest và hook Lovable là mã cũ chưa hợp nhất trong đợt này; cần kiểm kê/tắt lịch cũ trước khi phát hành đại trà. Không bật campaign chỉ bằng cách thêm Resend key.

Rollback an toàn: dừng scheduler, đặt provider `disabled` cho nghiệp vụ, giữ DB/migration và snapshot; không khôi phục hàm cũ gửi mật khẩu/OTP tùy chỉnh. Giữ Auth SMTP local hoặc SMTP hợp lệ; cấu hình provider nghiệp vụ không tắt SMTP Auth. Thu hồi/đổi khóa ở nhà cung cấp nếu có sự cố, triển khai phiên bản sửa và yêu cầu mã Auth mới. Không reset DB người dùng.
