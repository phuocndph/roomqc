# Kế hoạch triển khai email RoomQC

Ngày lập: 16/10/2026. MVP đã triển khai và kiểm thử local; gửi production đang chờ tài khoản Resend và DNS cho `roomqc.com`. Xem [runbook](./email-runbook.md) và [báo cáo kiểm thử](./email-validation-2026-10-16.md) để phân biệt phần đã làm và phần còn lại. Các nhận định hiện trạng bên dưới là ghi nhận trước triển khai.

## 1. Mục tiêu và phạm vi

Xây dựng bộ email tự động phục vụ tài khoản và vận hành RoomQC, dùng chung cho web và Android, sẵn sàng đưa lên VPS do RoomQC quản lý. Không xây hộp thư riêng kiểu Gmail hoặc máy chủ nhận thư trong giai đoạn này.

Người dùng cần nhận đúng thông tin, đúng khách sạn, đúng thời điểm; liên kết mở đúng nơi; quản trị viên biết email đã gửi, bị lỗi hay cần xử lý. Email không chứa mật khẩu, khóa API hoặc dữ liệu khách lưu trú không cần thiết.

Ưu tiên:

1. Xác minh đăng ký, khôi phục tài khoản, mời nhân viên, thông báo không gian khách sạn đã sẵn sàng.
2. Sắp hết dùng thử/gói, thanh toán thành công/thất bại và cảnh báo hạn mức.
3. Báo cáo ngày/tuần theo đăng ký nhận tin.

Phân công công việc, bảo trì và thay đổi ca tiếp tục ưu tiên thông báo trong ứng dụng/push. Email marketing và chiến dịch hàng loạt là phạm vi riêng, chưa đưa vào MVP.

## 2. Hiện trạng đã thấy trong mã nguồn

Các nhận định dưới đây dựa trên mã nguồn; chưa xác nhận toàn bộ cấu hình đang chạy trên VPS, DNS, quota nhà cung cấp hoặc cron trong database.

| Phần | Bằng chứng | Việc cần xử lý |
|---|---|---|
| Nhiều dịch vụ gửi cùng tồn tại | Các hàm `send-welcome-email`, `send-password-reset`, `send-notification-email`, `send-invoice-email`, `launch-campaign`, `dead-stock-digest` gọi Resend; `auth-email-hook` và `process-email-queue` dùng Lovable | Chọn một nhà cung cấp chính, phân định rõ email Auth và email nghiệp vụ; tránh hai nơi cùng gửi một sự kiện |
| Hạ tầng hàng đợi đã có | `supabase/migrations/20260510155407_email_infra.sql` tạo PGMQ, log, trạng thái gửi, suppression/unsubscribe | Kiểm tra migration tiếp theo và schema thực tế trước khi bổ sung; tái sử dụng thay vì tạo hệ thống song song |
| Worker đã có retry và hàng đợi lỗi | `supabase/functions/process-email-queue/index.ts` ưu tiên Auth, có TTL, retry và xử lý throttling | Kiểm tra lịch chạy thực tế, quyền gọi, cạnh tranh giữa worker và tình huống provider nhận thư nhưng phản hồi bị mất |
| SMTP trên giao diện chưa khớp luồng gửi | `src/components/super-admin/settings/EmailSettings.tsx` lưu SMTP/password vào `platform_settings`; payload nút thử không khớp `send-notification-email` | Đưa secret về backend; sửa endpoint thử và hiển thị trạng thái cấu hình đúng với dịch vụ đang sử dụng |
| OTP khôi phục do ứng dụng tự quản lý | `send-password-reset` dùng `Math.random()`, OTP băm lưu DB; form phân biệt email không tồn tại | Chuyển dần quyền phát hành/xác minh về Supabase Auth; giữ UX OTP nếu tương thích, trả thông báo trung tính về email tồn tại |
| Email nhân viên chứa mật khẩu tạm | `create-user` truyền `tempPassword` cho welcome template | Thay bằng lời mời có hạn dùng, nhân viên tự đặt mật khẩu; không làm mất phân quyền đã cấp |
| Welcome phụ thuộc frontend | `src/components/auth/RegisterForm.tsx` gọi gửi khi đăng ký có session | Chuyển sang sự kiện backend sau xác minh/provisioning; chống trùng khi tải lại hoặc retry |
| Tên miền gửi bị cố định | `auth-email-hook` chứa `notify.roomqc.com`, `roomqc.com` | Xác minh quyền sở hữu và DNS; dùng cấu hình môi trường, chưa coi các tên miền này là đã sẵn sàng |
| Android có ràng buộc xác thực riêng | `src/lib/native/auth-links.ts` chỉ chấp nhận PKCE code và kiểm tra workspace | Thử nghiệm sớm liên kết/OTP trên cùng và khác thiết bị; giữ nguyên kiểm tra bảo mật |

Ngoài ra, `send-notification-email` kiểm tra tenant cho người nhận đã tồn tại nhưng còn đường gửi tới email chưa có user. Cần chuyển sang người nhận được backend xác định theo sự kiện, không để API trở thành nơi gửi email tùy ý.

## 3. Kiến trúc đề xuất

Chọn Resend làm phương án mặc định cho MVP vì nhiều luồng hiện tại đã tích hợp. Quyết định cuối cùng ở giai đoạn 0 phụ thuộc tài khoản, domain và quota. Đặt lớp tích hợp nhà cung cấp để có thể chuyển sang SES/Brevo sau này.

| Nhóm | Luồng dự kiến | Ai quản lý token/sự kiện |
|---|---|---|
| Xác minh, khôi phục, lời mời | Supabase Auth → SMTP riêng → nhà cung cấp email | Supabase Auth quản lý token, thời hạn và xác minh; ứng dụng quản lý membership/quyền |
| Sẵn sàng sử dụng, thanh toán, hạn gói, báo cáo | Sự kiện backend → outbox/hàng đợi PGMQ → worker → API nhà cung cấp | Backend ghi sự kiện bền vững, worker xử lý và ghi kết quả |
| Kết quả giao thư | Webhook có xác thực → cập nhật log/suppression | Backend xác thực chữ ký, chống xử lý trùng và sự kiện đến sai thứ tự |

Hai luồng dùng chung thương hiệu và cấu hình nhà cung cấp nhưng có cơ chế vận hành riêng. Email Auth không chờ sau báo cáo/chiến dịch. Log email Auth phải dựa trên dữ liệu quan sát thực tế từ Auth/provider; không tự gán trạng thái delivered khi chưa có bằng chứng.

Hook Lovable hiện tại cần kiểm tra tương thích với Supabase tự triển khai. Chỉ tắt/thay sau khi SMTP và template mới qua thử nghiệm. Mỗi loại email Auth chỉ có một đường gửi đang hoạt động.

Hàng đợi xử lý theo nguyên tắc có thể nhận lại cùng một công việc. Dùng mã sự kiện ổn định và khóa chống trùng, kết hợp idempotency của provider nếu được hỗ trợ. Không cam kết gửi đúng một lần tuyệt đối khi mạng bị ngắt giữa lúc provider đã nhận email và worker chưa lưu kết quả.

## 4. Danh mục email

| Mẫu | Thời điểm kích hoạt | Người nhận | Ưu tiên/phạm vi |
|---|---|---|---|
| Xác minh email | Đăng ký hoặc gửi lại theo hạn mức | Chủ tài khoản | MVP, bảo mật |
| Khôi phục tài khoản | Yêu cầu hợp lệ qua Auth | Chủ tài khoản | MVP, bảo mật |
| Mời tham gia khách sạn | Người có quyền tạo lời mời | Nhân viên được mời | MVP, bảo mật |
| Khách sạn đã sẵn sàng | Email đã xác minh và provisioning thành công | Chủ khách sạn | MVP, một lần cho mỗi sự kiện tạo workspace |
| Sắp hết dùng thử/gói | Mốc nhắc hạn đã cấu hình | Chủ/quản trị phụ trách gói | Sau MVP; mốc đề xuất 7/3/1 ngày, không gửi bù dồn các mốc đã qua |
| Thanh toán thành công/thất bại | Sự kiện thanh toán backend đã xác thực | Người phụ trách thanh toán | Sau MVP; chống trùng theo giao dịch/sự kiện |
| Cảnh báo hạn mức | Vượt ngưỡng có ý nghĩa | Quản trị phụ trách | Sau MVP; gộp cảnh báo và có thời gian chờ |
| Tổng hợp ngày/tuần | Lịch theo múi giờ khách sạn và lựa chọn người dùng | Người có quyền xem báo cáo và đã đăng ký | Giai đoạn mở rộng |

Mỗi email có tiêu đề tiếng Việt rõ việc, tên RoomQC/khách sạn khi phù hợp, một hành động chính, thời hạn nếu có, địa chỉ hỗ trợ và bản text thuần. Nút/liên kết không chứa vai trò có thể bị sửa để tự nâng quyền. Không gửi báo cáo chứa dữ liệu khách lưu trú chi tiết qua email mặc định.

Người dùng xác nhận tên miền `roomqc.com`. Đề xuất miền gửi riêng `notify.roomqc.com` và địa chỉ `notifications@notify.roomqc.com`; chưa xác minh DNS. `Reply-To` chỉ bật khi có hộp thư hỗ trợ đang có người quản lý.

## 5. Các giai đoạn triển khai

### Giai đoạn 0 — Chốt cấu hình và kiểm chứng các điểm khó (1–2 ngày công)

1. Lập bản đồ tất cả nơi gửi email, caller, loại sự kiện, môi trường và dữ liệu người nhận; bao gồm campaign/digest để tránh bỏ sót nhưng chưa mở rộng chức năng.
2. Kiểm tra schema/migration thực tế, PGMQ, cron đang hoạt động, cấu hình Auth/SMTP/hook, worker và quota. Không ghi secret ra báo cáo.
3. Chọn provider, domain, sender, Reply-To; xác định nơi quản lý cấu hình cho control plane và từng cụm VPS. Tính cả việc xoay khóa và giới hạn gửi giữa các cụm.
4. Làm thử luồng xác minh/khôi phục/lời mời trên web và Android: cùng trình duyệt, khác trình duyệt, khác thiết bị, ứng dụng đã tắt. Xác minh cách dùng OTP/PKCE được Supabase hỗ trợ trước khi chốt thiết kế.
5. Chốt dùng SMTP chuẩn cho Auth hay cần hook tương thích; ghi rõ đường gửi nào được giữ, chuyển và tắt.

Đầu ra: bảng cấu hình theo môi trường, sơ đồ luồng đã kiểm chứng, checklist chuyển đổi và danh sách schema cần bổ sung. Điều kiện hoàn thành: có đường xác thực thử nghiệm hoạt động với workspace đúng trên web và Android.

### Giai đoạn 1 — Hạ tầng gửi, secret và quan sát (2–3 ngày công)

1. Xây cấu hình backend và lớp provider chung; kiểm tra biến môi trường khi khởi động. Secret chỉ ở hệ thống quản lý secret/env máy chủ, không đưa vào bundle, log hay JSON được frontend đọc.
2. Sau kiểm kê, xử lý credential SMTP cũ trong `platform_settings`: chuyển về nơi lưu an toàn, giới hạn truy cập và xoay khóa khi cần; không sao chép tiếp vào giao diện mới.
3. Cấu hình domain gửi, SPF/DKIM/DMARC; xác minh thực tế với provider. Tránh tạo nhiều bản ghi SPF xung đột. DMARC tăng mức thực thi theo kết quả quan sát.
4. Điều chỉnh worker hiện có sang provider đã chọn; retry có backoff/jitter, tôn trọng 429, phân biệt lỗi tạm thời/vĩnh viễn; có giới hạn batch/concurrency và hàng đợi lỗi.
5. Kiểm tra xác thực scheduler/worker thực sự, không chỉ giải mã JWT. Giữ enqueue/read/delete dành cho backend có quyền.
6. Gắn mã sự kiện, workspace/tenant, template version và provider message ID vào log theo nhu cầu thực tế; phân biệt queued, provider accepted, delivered, bounced, failed, expired.
7. Cấu hình webhook kiểm tra chữ ký, xử lý lặp/sai thứ tự và suppression cho hard bounce/complaint theo chính sách provider.

Đầu ra: gửi thử trong môi trường kiểm thử, có truy vết và xử lý lỗi. Điều kiện hoàn thành: thử retry/429/timeout/worker chạy đồng thời, không tạo thêm thư trùng trong các kịch bản đã kiểm thử; không thấy secret ở frontend/log.

### Giai đoạn 2 — Tài khoản và lời mời nhân viên (3–4 ngày công)

1. Chuẩn hóa mẫu email xác minh/khôi phục/lời mời, nội dung tiếng Việt, liên kết đúng môi trường và workspace. Cấu hình redirect allowlist cụ thể; không mở redirect tùy ý.
2. Chuyển khôi phục tự quản sang Supabase Auth sau khi thử nghiệm: giữ giao diện nhập OTP nếu đáp ứng được; nếu không, ghi quyết định dùng luồng Auth chuẩn trước khi triển khai. Chặn dò tài khoản qua thông báo, giới hạn yêu cầu và xác minh theo khả năng backend/Auth.
3. Ngừng phát hành OTP theo cơ chế cũ tại thời điểm chuyển đổi; để mã cũ hết hạn và hướng dẫn yêu cầu mã mới. Không phát lại OTP/token cũ; loại bỏ endpoint cũ sau cửa sổ chuyển đổi.
4. Thay email mật khẩu tạm bằng lời mời: pending membership gắn tenant/hotel/vai trò ở backend; nhân viên chấp nhận và tự đặt mật khẩu. Kiểm tra quyền người mời lúc tạo và quyền còn hiệu lực khi chấp nhận.
5. Xử lý người đã có tài khoản, gửi lại, hết hạn, thu hồi, lời mời đồng thời và mời sang khách sạn khác. Phân biệt Auth identity với membership; không thay đổi quyền tài khoản cũ ngoài phạm vi lời mời.
6. Phát sự kiện workspace-ready từ backend sau xác minh và provisioning thành công; chống trùng khi job retry hoặc đăng ký lại. Provisioning lỗi không gửi thông báo “đã sẵn sàng”.
7. Giữ các kiểm tra PKCE/workspace hiện có trên native. Không chuyển sang nhận bearer token trên URL để làm liên kết dễ chạy hơn. Cân nhắc OTP hoặc bước xác nhận để tránh máy quét email tiêu thụ liên kết một lần.

Đầu ra: luồng tài khoản hoàn chỉnh và không gửi mật khẩu qua email. Điều kiện hoàn thành: E2E đúng vai trò, đúng khách sạn, từ chối link hết hạn/dùng lại và không có hai hệ thống cùng gửi Auth email.

### Giai đoạn 3 — Quản trị và nghiệm thu MVP (2–3 ngày công)

1. Thay phần SMTP hiện tại bằng trạng thái dịch vụ thực tế: provider, domain, sender, tình trạng đã cấu hình; secret chỉ có thao tác thay mới và hiển thị che.
2. Endpoint gửi thử riêng, hạn mức và quyền quản trị rõ ràng, không nhận HTML tùy ý từ người dùng thường. Local/staging chỉ gửi vào hộp thư kiểm thử/allowlist.
3. Màn hình lịch sử gửi: tìm theo người nhận, khách sạn, loại và trạng thái; xem lỗi đã làm sạch; phân quyền log theo tenant. Hành động thử lại có audit, không gửi lại thông báo đã được provider nhận chỉ vì thiếu delivered webhook.
4. Thêm tùy chọn nhận email nghiệp vụ/báo cáo. Không dùng opt-out marketing để vô hiệu hóa email bảo mật cần thiết; complaint/suppression vẫn phải xử lý theo provider và có hướng dẫn hỗ trợ phù hợp.
5. Chạy ma trận kiểm thử bên dưới; ghi kết quả, lỗi còn mở và quyết định phát hành.
6. Chạy staging và canary nội bộ trước production. Theo dõi hàng đợi, độ trễ, bounce, complaint, quota và chi phí.

Đầu ra: bộ email MVP có thể vận hành, báo cáo nghiệm thu và runbook. Điều kiện hoàn thành: đạt các cổng phát hành ở mục 9.

### Giai đoạn 4 — Gói sử dụng và báo cáo (sau MVP, 2–4 ngày công dự kiến)

1. Chuẩn hóa email hạn gói, thanh toán và hạn mức qua các sự kiện backend đã xác thực, không dựa vào frontend báo thành công.
2. Chuyển các hàm gửi trực tiếp sang dùng dịch vụ/hàng đợi chung từng nhóm; giữ wrapper tương thích trong lúc chuyển caller.
3. Thêm tổng hợp ngày/tuần khi đã chốt thông tin cần gửi, múi giờ, quyền nhận và tùy chọn tắt.
4. Tách chiến dịch marketing khỏi luồng giao dịch về quota/ưu tiên và chính sách nhận tin nếu triển khai sau này.

MVP giai đoạn 0–3 dự trù khoảng 10–15 ngày công của một người triển khai và kiểm thử. Đây là ước lượng ban đầu; chốt lại sau giai đoạn 0. Thời gian đợi DNS, phê duyệt domain/quota và vướng mắc native có thể kéo dài lịch thực tế.

## 6. Phạm vi thay đổi theo mã nguồn

| Khu vực | Công việc dự kiến |
|---|---|
| `supabase/functions/_shared/` | Cấu hình provider, chuẩn dữ liệu email, template/validation dùng chung nếu phù hợp runtime |
| `auth-email-hook`, `process-email-queue` | Tách rõ đường Auth và transactional; chuyển provider và lịch chạy có kiểm soát |
| `send-password-reset`, `verify-otp`, `reset-password-with-otp` | Chuyển đổi sang Auth chuẩn; ngừng/loại bỏ cơ chế cũ sau kiểm thử |
| `create-user`, `send-welcome-email` | Lời mời không có mật khẩu; giữ quyền và tương thích caller |
| `send-notification-email`, `send-invoice-email` | Nhận sự kiện/recipient được phép, dùng đường gửi chung và chống trùng |
| `src/components/auth/`, `src/contexts/AuthContext.tsx` | UX xác minh/khôi phục/lời mời; bỏ việc frontend quyết định gửi welcome |
| `src/lib/native/auth-links.ts` và bridge | Kiểm thử tương thích, chỉ sửa khi cần mà giữ kiểm tra workspace/PKCE |
| `server/control/` | Phát sự kiện workspace-ready bền vững sau provisioning; cấu hình nhiều cụm |
| `src/components/super-admin/settings/EmailSettings.tsx` | Cấu hình đúng với backend, thử gửi và trạng thái dịch vụ |
| `supabase/migrations/` | Migration tối thiểu sau kiểm kê; quyền/RLS, khóa chống trùng, dữ liệu lời mời/log nếu còn thiếu |
| `docs/deploy-vps.md` và tài liệu vận hành | Biến môi trường không chứa giá trị thật, DNS, worker, webhook, xử lý lỗi và rollback |

Không mặc định tạo lại bảng. Đối chiếu schema đang chạy trước khi thêm tenant scope, event/dedupe key, provider ID, attempts, thời điểm thử lại, thời điểm nhận/giao thư hoặc dữ liệu lời mời. Migrations phải tương thích dữ liệu hiện có và có phương án khôi phục.

## 7. Cấu hình môi trường và dữ liệu

- Local: bắt thư qua mail capture, mặc định không gửi Internet; dữ liệu thử và credential riêng.
- Staging: khóa/domain thử riêng khi có thể, recipient allowlist ở backend; không dùng dữ liệu khách thật.
- Production: secret phía máy chủ, domain đã xác minh, webhook công khai qua HTTPS và có kiểm tra chữ ký.
- Mỗi cụm VPS biết workspace thuộc cụm nào; link sinh từ cấu hình đáng tin cậy và directory/routing hiện có, không lấy tùy ý từ header hay dữ liệu client.
- Với 1.000 khách sạn, thử tải theo số sự kiện email và đợt cao điểm, không quy đổi trực tiếp từ số người online. Mô phỏng đợt mời nhân viên và gia hạn đồng thời; đặt rate limit tổng theo tài khoản provider khi nhiều worker/cụm cùng chạy.
- Không lưu token, OTP, mật khẩu hoặc nội dung nhạy cảm trong log. Email người nhận chỉ được xem bởi đúng quyền; đề xuất giữ log vận hành 90 ngày, chốt thời hạn theo nhu cầu hỗ trợ và chính sách dữ liệu.
- Log cần phân biệt “provider đã nhận” với “đã giao đến máy chủ thư”; không đảm bảo đã vào inbox hoặc người dùng đã đọc.

## 8. Ma trận kiểm thử bắt buộc

| Nhóm | Ca kiểm thử chính | Kết quả cần đạt |
|---|---|---|
| Đăng ký | Xác minh đúng/sai/hết hạn/gửi lại, click hai lần, provisioning chậm/lỗi | Không tạo workspace sai/trùng; chỉ báo sẵn sàng sau thành công |
| Khôi phục | Email có/không tồn tại, OTP/link sai/hết hạn/dùng lại, giới hạn thử và gửi lại | Không lộ tài khoản, không đổi mật khẩu trái phép, không dùng lại token |
| Mời nhân viên | Vai trò/vị trí, user mới/cũ, gửi lại/thu hồi/hết hạn, người mời mất quyền | Membership đúng quyền và tenant; không có mật khẩu trong thư/log |
| Cách ly | Đổi workspace/link/ID, người quản trị tenant khác, đọc log hoặc retry trái phép | Backend/RLS từ chối truy cập và nâng quyền chéo |
| Web và Android | Cùng/khác trình duyệt, khác thiết bị, app đã tắt, deep link sai workspace, máy quét mở link | Hoàn tất được luồng hợp lệ, có hướng dẫn khi không hợp lệ, giữ PKCE/workspace checks |
| Độ bền | Submit/callback lặp, queue redelivery, worker crash, provider timeout, nhiều worker | Có truy vết và chống trùng theo thiết kế; không mất sự kiện đã cam kết |
| Provider | 429, 5xx, cấu hình sai, quota hết, domain chưa xác minh | Retry có giới hạn, lỗi rõ, không lặp vô hạn |
| Webhook | Chữ ký sai, trùng/sai thứ tự, hard bounce/complaint | Từ chối giả mạo; trạng thái và suppression nhất quán |
| Nội dung | Gmail/Outlook phổ biến, màn hình mobile, bản text, tiếng Việt, nút/liên kết | Dễ đọc, đúng tên/khách sạn/môi trường, không lộ secret |
| Quản trị | Nút thử, quyền xem, thử lại, opt-out báo cáo, audit | Cấu hình có tác dụng, đúng quyền, không gửi tùy ý/trùng |
| Chuyển đổi | Auth cũ/mới, job cũ hết hạn, rollback, khóa provider thay mới | Không phát lại OTP hoặc dồn email cũ cho người dùng |

Kiểm thử tự động tập trung vào phân quyền, dedupe, retry, state và luồng Auth. Kiểm thử giao diện/nội dung và khả năng giao thư thực hiện trên môi trường thử có kiểm soát. Việc lập kế hoạch này chưa phải kết quả kiểm thử.

## 9. Tiêu chí phát hành và vận hành

Chỉ phát hành MVP khi:

1. Các luồng xác minh, khôi phục, mời và workspace-ready qua E2E web/Android; lỗi bảo mật, sai tenant hoặc mất quyền đều được đóng.
2. Không còn gửi mật khẩu tạm; không còn secret trong cấu hình frontend đọc được; quyền thử gửi/log/retry được kiểm tra.
3. Một sự kiện Auth chỉ có một đường gửi; welcome không phụ thuộc mount/frontend; các ca lặp, crash, retry đã được kiểm chứng.
4. Domain/provider được xác minh; SPF/DKIM/DMARC theo cấu hình được duyệt; redirect và webhook đúng môi trường.
5. Có giám sát backlog, tuổi job lâu nhất, thất bại, quota và cảnh báo worker ngừng chạy. Mục tiêu ban đầu để thử nghiệm: email giao dịch được provider nhận trong 60 giây ở tải dự kiến; đây chưa phải SLA và không bao gồm thời gian đến inbox.
6. Người vận hành có hướng dẫn xử lý lỗi, xoay khóa, thử lại an toàn và rollback; có báo cáo canary trước khi tăng phạm vi.

Theo dõi sau phát hành: độ trễ enqueue→provider accepted, tỷ lệ lỗi/retry, backlog/DLQ, bounce/complaint, quota và chi phí theo cụm. Ngưỡng cảnh báo chốt theo quota và yêu cầu provider sau giai đoạn 0.

## 10. Chuyển đổi và rollback

1. Thêm cấu hình và đường gửi mới trong staging; bật/tắt được theo loại sự kiện và môi trường ở backend.
2. Kiểm kê job cũ: email còn hợp lệ được drain qua đúng một worker; email OTP/lời mời hết hạn được đánh dấu hết hạn hoặc lưu trữ, không replay hàng loạt.
3. Chuyển từng loại email trong cửa sổ có kiểm soát; ghi mốc cutover và dedupe key. Không cho sender cũ/mới cùng xử lý một sự kiện.
4. Nếu lỗi, dừng loại gửi bị ảnh hưởng và giữ job để điều tra; chỉ quay về đường cũ đã kiểm chứng an toàn. Không bật lại cơ chế gửi mật khẩu tạm.
5. Trước khi đổi provider/thử lại job có kết quả không rõ, đối soát provider ID và trạng thái accepted. Không gửi lại chỉ vì chưa có webhook delivered.
6. Backup trước migration. Ưu tiên migration bổ sung/tương thích; không xóa dữ liệu hoặc endpoint còn caller trước khi xác nhận đã chuyển hết.

## 11. Thông tin cần khi bắt đầu triển khai

Không cần chờ các thông tin này để lập kế hoạch, nhưng cần có trước khi gửi email production:

- Tên miền RoomQC thực sự sở hữu và quyền cấu hình DNS.
- Địa chỉ gửi/tên hiển thị và hộp thư hỗ trợ nhận trả lời.
- Nhà cung cấp được chọn, quyền quản trị tài khoản, credential qua kênh cấu hình an toàn và quota đã được duyệt.
- Domain/HTTPS của VPS, sơ đồ cụm hiện hành và người tiếp nhận cảnh báo vận hành.
- Chính sách thời hạn lời mời, lưu log, người nhận thông báo gói và báo cáo.

Bước triển khai đầu tiên: hoàn thành giai đoạn 0, sau đó làm hạ tầng và Auth/lời mời trước. Chưa đưa báo cáo hoặc marketing vào luồng đăng ký ban đầu.

## 12. Tài liệu tham chiếu

- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Auth email templates và OTP](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Kế hoạch tự động tạo môi trường khách hàng](./customer-auto-setup-plan.md)
- [Routing nhiều cụm trên cùng tên miền](./shared-domain-multi-cluster-plan.md)
- [Runbook workspace directory](./workspace-directory-runbook.md)

Lưu ý: giới hạn SMTP mặc định của Supabase hosted không được coi là giới hạn của hệ thống self-hosted RoomQC. Khi triển khai phải kiểm tra phiên bản Auth, cấu hình SMTP và quota provider thực tế.
