# Báo cáo triển khai và kiểm thử email — 16/10/2026

## Kết luận

MVP email đã được triển khai và chạy với Auth, database, Edge Runtime, scheduler và Mailpit local. Đã xác minh các luồng chính và kiểm tra cách ly tài khoản/khách sạn. Chưa đủ điều kiện công bố email production: miền `roomqc.com` trong Resend hiện chưa xác minh DNS (trạng thái Resend: Failed).

Không gửi email ra Internet trong các bài integration. Không tạo tài khoản dịch vụ trả phí hoặc thay DNS. Dữ liệu thử được tạo với tiền tố riêng và dọn theo ID; dữ liệu đang có của người dùng được giữ lại. Backup trước thay đổi lưu tại `backups/roomqc-before-email-20261016.dump` (3.539.353 byte).

## Phạm vi đã triển khai

- Template tiếng Việt cho xác minh, khôi phục và lời mời qua SMTP Supabase Auth; chuyển form sang OTP do Auth xác minh. Endpoint OTP/welcome tùy chỉnh cũ trả 410 để tránh chạy song song.
- Lời mời nhân viên không chứa mật khẩu; backend giữ tenant/hotel/vị trí/cấp bậc và kiểm tra quyền lúc mời lẫn lúc nhận. Tạo profile, role, assignment, audit trong một giao dịch sau xác minh và đặt mật khẩu.
- Gửi lại trước/sau xác minh, thu hồi/hết hạn, mời lại sau thu hồi, tiếp tục luồng bị ngắt. Không xóa Auth identity có sẵn. Tài khoản đã có profile không được đổi tenant/quyền bằng lời mời.
- Workspace-ready phát từ backend sau provisioning thành công, đường dẫn workspace đúng và dedupe sự kiện.
- Hàng đợi bền vững, worker có xác thực nội bộ, lease, retry/backoff, giới hạn tuổi/lượt gửi và idempotency key provider. Giữ nguyên dữ liệu cũ; payload hàng đợi cũ không được gửi lại tùy tiện.
- Provider Mailpit/Resend có cấu hình server-only; API Resend ngoài production bắt buộc danh sách người nhận thử. Đóng quyền browser với cấu hình SMTP cũ.
- Webhook có HMAC/timestamp/body limit, xử lý trùng/sai thứ tự, suppression bounce/complaint. Trạng thái accepted tách khỏi delivered.
- Super admin xem cấu hình thực, thử gửi, lọc 100 bản ghi gần nhất; thử lại có điều kiện và nhật ký riêng, chống bấm đồng thời.
- Hai hàm email hóa đơn/thông báo cũ dùng provider chung, kiểm quyền và tenant; hóa đơn chỉ đánh dấu gửi sau provider thành công, escape nội dung không đáng tin. Thông báo thanh toán/hạn mức giới hạn ở platform admin/dịch vụ nội bộ.

## Kết quả có bằng chứng

| Kiểm tra | Kết quả |
|---|---|
| `npm run test:email:local` | 58 kiểm tra đạt, chạy Auth/SMTP/Edge/RLS/PGMQ thật ở local |
| `npm test` | 368 đạt, 16 bỏ qua có chủ ý; 44 file đạt, 2 file integration riêng bị skip |
| `npx tsc -p tsconfig.app.json --noEmit` | Đạt |
| `npm run lint -- --quiet` | 0 error; lệnh quiet không khẳng định không có warning cũ |
| Deno check | Các endpoint email mới, worker, staff invitation, invoice và notification đạt |
| Supabase local security advisors, level error | Không có vấn đề ở mức error; không thay thế audit toàn hệ thống |
| `npm run test:room-setup:local` | 36 kiểm tra đạt sau cập nhật luồng Auth/provisioning |
| `npm run test:control` | 4 kiểm tra đạt |
| Docker build + `npm run verify:container` | Đạt; web chạy tại `http://127.0.0.1:8082` |
| Browser | Đã mở màn hình nhận lời mời và kiểm tra bố cục/nhãn; không coi đây là E2E thao tác toàn bộ trên browser |
| Android | Build assets local cho emulator và APK debug thành công; kiểm tra SHA-256 HTML trong APK khớp assets mới. Chưa chạy E2E native; emulator hiện không hoạt động |

58 kiểm tra integration bao gồm: xác minh và OTP một lần; mật khẩu cũ/mới sau recovery; phản hồi trung tính khi email không tồn tại; luồng lời mời không cấp quyền sớm; nhân viên không thể tự onboarding làm chủ; gửi lại trước/sau xác minh; expiry, thu hồi và người mời bị khóa; cấp đúng manager/department manager/staff, chặn tự nâng quyền; cách ly tenant, ngăn đọc log/enqueue/retry giả quyền; invoice khác tenant bị chặn; escape HTML; dedupe 6 enqueue đồng thời, nhiều worker; không gửi lại sau accepted; sự kiện provider sai thứ tự, bounce và manual retry/audit đồng thời.

Các bài unit còn kiểm: 429/403/timeout và làm sạch lỗi provider, allowlist, đường dẫn an toàn/escape, webhook giả mạo/hết thời gian, form giữ trạng thái khi lỗi, và invitation cache không chặn điều hướng sau khi có profile.

Hướng dẫn Supabase và Supabase/Postgres được áp dụng vào kiểm tra Auth/RLS, chỉ mục riêng cho thư đến hạn/lease/webhook và giao dịch ngắn: lời gọi provider nằm ngoài giao dịch DB. APK nội bộ ở `artifacts/mobile/roomqc-debug.apk`, dùng backend local qua Android emulator; không phải bản phát hành Play Store.

## Chưa nghiệm thu / không tuyên bố đã hoàn thành

1. Resend thật, DNS SPF/DKIM/DMARC, Auth SMTP production, webhook Internet, quota/chi phí và thư vào Gmail/Outlook. Runbook đã chuẩn bị tại `email-runbook.md`.
2. E2E đầy đủ trên máy Android thật/iOS, app bị tắt, kết nối gián đoạn, email mở khác ứng dụng. OTP được thiết kế dùng được trên thiết bị khác; điều đó chưa chứng minh mọi tình huống native.
3. Campaign/digest chưa hợp nhất; invoice/notification còn gửi trực tiếp, chưa dùng delivery queue với retry/dedupe bền vững. Chưa bật các lịch marketing mới.
4. Chưa có alert/retention job tự động, tìm toàn bộ lịch sử theo phân trang, opt-in digest và rate limit tổng giữa nhiều cụm. Không suy ra khả năng phục vụ 100.000 user từ kiểm thử email local.
5. Mailpit không cung cấp bảo đảm idempotency giống Resend: nếu capture nhận thư nhưng worker mất phản hồi, local có thể có bản trùng. Provider đã nhận cũng không đồng nghĩa người nhận đã đọc hoặc thư vào inbox.

Trước production: tạo/xác minh Resend, staging canary, kiểm tra cả SMTP Auth và API delivery, rà lịch cũ và quota đa cụm, chạy lại ma trận native và kiểm tra khôi phục backup trên môi trường riêng. Không cần tạo lại database để bật email.
