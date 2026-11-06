# RoomQC — Đợt 2a: nền tảng báo giá phía máy chủ

Ngày 17/10/2026. **Đã triển khai/kiểm thử local; chưa thay checkout cũ,
chưa nghiệm thu toàn bộ Đợt 2, chưa triển khai VPS/staging hay thu tiền thật.**

## Phạm vi đã hoàn thành

Migration `20261017043645_subscription_quotes_foundation.sql` bổ sung bảng
`private.subscription_quotes` cùng hai RPC:

- `create_subscription_quote(p_request_id, p_kind, p_rooms, p_duration_days)`:
  `extend` dùng tổng số phòng muốn đăng ký và kỳ 30/90/180/365 ngày;
  `add_rooms` dùng số phòng mua thêm và không nhận kỳ hạn từ client.
- `get_subscription_quote(p_quote_id)`: đọc nguyên bản đã lưu trong tenant
  của owner; ID không tồn tại và ID của tenant khác cùng trả HTTP 404.

Tenant/actor được suy ra từ hồ sơ/role **thật** tại database, không nhận từ
client/user_metadata. Cả hai RPC kiểm tra owner, hồ sơ active/không khóa,
email xác minh, Auth không banned và session chưa bị thu hồi/hết hạn.
Service key riêng lẻ không được đóng vai owner để gọi API này.

Giá phòng/ngày, mô hình giá, kỳ tối thiểu và giới hạn phòng lấy từ paid plan
`standard` đang active. Chiết khấu `room-daily-v1` giữ quy tắc đang hiển thị
ở `src/lib/pricing.ts`: 30/90/180/365 ngày lần lượt 0/5/10/15%; làm tròn
tiền giảm một lần bằng numeric tại DB. Không thêm chính sách giá/ưu đãi mới.
Trường tax_amount=0 chỉ phản ánh bản xem trước hiện hữu, không phải tính thuế
hoặc xác nhận yêu cầu pháp lý của hóa đơn thuế.

Gia hạn bắt đầu từ ngày lớn hơn giữa ngày hết hạn hiện tại và ngày server.
Mua thêm chỉ dành cho gói standard active, còn hạn và không read-only;
số ngày còn lại lấy từ ngày hết hạn trong DB, không từ browser. Đây là ngày
theo `current_date` của database (local hiện UTC), chưa quyết định múi giờ
thanh toán production. Không tạo quote dưới số phòng thực tế hoặc vượt cap;
không tự cắt số phòng xuống cap. Tenant bị admin tạm ngưng không tạo mới.

Snapshot lưu giá/giảm giá/tổng tiền, plan, kỳ dự kiến, số phòng đích, actor,
thời điểm, phiên bản quy tắc và bối cảnh gói/usage lúc báo giá. Bảng private
bật RLS, browser và service_role không có quyền đọc/ghi trực tiếp. Hai RPC
được cấp riêng cho authenticated, kiểm tra quyền lại mỗi lần.

Khóa tenant dùng cùng hàng với guard tạo phòng. Một request ID/tenant chỉ có
một snapshot: 20 retry đồng thời trả cùng kết quả; ID cũ với input khác bị
từ chối. Retry sau thay đổi trạng thái có thể đọc lại **bản cũ**, không định
giá lại hay chứng minh nó còn hợp lệ để mua.

## Hàng rào quan trọng: chưa phải checkout

Mọi snapshot trả `checkout_enabled=false`. Không có đường tạo invoice/payment
từ quote, không cấp thêm phòng, gia hạn, kích hoạt hoặc mở khóa tenant.
Không có expiry/acceptance contract; giá cũ **không được** dùng làm căn cứ thu
tiền. Chưa có UI gọi RPC nên màn hình mua gói hiện không thay đổi.

Luồng cũ (`BankTransferPaymentDialog`, useCreateInvoice/useCreatePayment) vẫn
ghi hóa đơn/pending transaction với giá do browser tính; trusted settlement
vẫn dùng metadata cũ và có nhánh cắt cap. **Các rủi ro này chưa được khắc phục
bởi Đợt 2a và vẫn chặn việc bật thanh toán thật.** Không gắn một quote ID vào
metadata rồi coi đó là bản chụp đã được server đối soát.

Không sửa booking payment QR, SePay, khách cũ, lịch expiry/hủy/xóa dữ liệu.
Không bật directory signup hoặc thay đổi CRM/cổng 8090.

## Kiểm chứng local trong lượt triển khai

Lệnh: `npm run test:subscription-quotes:local` — **55 kiểm tra đạt**.

- Auth/RPC thật với hai owner/tenant riêng; 4 kỳ giá, trial lên paid preview,
  mua thêm theo ngày server, gia hạn gói còn/hết hạn, giới hạn phòng thực tế.
- 20 retry cùng lúc, input conflict, reload, số lượng snapshot và nội dung
  nguyên bản; không tạo hóa đơn/giao dịch hoặc sửa entitlement từ quote API.
- Anonymous, service key, tenant khác, owner bị khóa/bỏ role/đăng xuất đều
  bị chặn theo đúng HTTP/mã lỗi; không coi network failure/5xx là đạt.
- Đổi giá/cap/kỳ tối thiểu trong **transaction rollback** để kiểm tra server
  configuration; không commit thay đổi plan đang dùng. Kiểm tra giảm tiền
  có phần lẻ và cấu hình giá 0 phải fail closed.
- API/DB chỉ loopback, SMTP phải là Mailpit. Fetch/SQL/toàn suite và các bước
  cleanup có giới hạn thời gian; chỉ xóa tenant/account/snapshot/mail fixture
  đã biết ID/email. Sau chạy không còn fixture user/tenant/quote/session.

Hồi quy chạy lại: 16 guard unit; 8 control unit; 532 Vitest đạt và 16 skip
(không tính skip là đạt); TypeScript và ESLint script mới đạt. DB security
advisors mức warn không báo vấn đề; lint public/private không lỗi. Performance
advisors còn 134 cảnh báo multiple_permissive_policies trên các bảng khác,
0 cảnh báo trên đối tượng quote mới; chưa xử lý legacy policy ở phạm vi này.

Đã chạy lại thêm: 55 kiểm tra quyền tenant/plan/payment/read-only và 81 kiểm
tra hành trình khách hàng local (Auth/Mailpit/phòng/lời mời/REST/RPC/Storage/
Realtime), đều đạt và dọn fixture. Đây không phải browser E2E hay tải thử.

Migration được tạo bằng CLI, thử SQL trên local không ghi lịch sử trong lúc
chỉnh sửa, rồi lưu phiên bản đã review. Không dùng db reset/apply_migration,
không tự nâng quyền DB. CLI db query hiện lỗi khi nhận file nhiều statement;
đã dùng psql trong đúng DB container local với ON_ERROR_STOP/single transaction.

## Đợt 2b kế tiếp — phải hoàn thành trước thanh toán thật

1. Thiết kế acceptance: thời hạn quote, thay đổi giá/gói/quota giữa quote và
   checkout, cơ chế chỉ một đơn pending, request idempotency. Không tái định
   giá âm thầm; báo rõ khi cần quote mới.
2. RPC tạo invoice + payment + bản chụp từ dữ liệu private trong **cùng
   transaction**; mã chuyển khoản/bank cũng lấy từ server. Cắt quyền INSERT/
   UPDATE/DELETE invoice/payment từ browser và xử lý đơn cũ có kiểm soát.
3. Chuyển UI sang số tiền server, xác nhận trước tạo đơn; không QR số tiền cũ.
   Kiểm tra hai tab, retry/mất phản hồi, thiếu bank config và rollback toàn bộ.
4. Cùng một atomic settlement cho webhook/sync; xác nhận tiền/currency/tenant/
   invoice/snapshot; không dùng metadata chưa tin cậy hoặc cắt cap. Chính sách
   giảm phòng khi kỳ hiện tại còn hạn và thanh toán đến muộn phải rõ trước khi
   cho kích hoạt. Gói/room changes sau quote phải bị phát hiện, không thu tiền
   xong mới âm thầm đổi quyền khác cam kết.
5. Kiểm thử replay webhook 20 lần, webhook + sync đồng thời, ngày hết hạn và
   khôi phục read-only; sau đó mới đi expiry scheduling/monitoring/hủy/xuất.
   Thời hạn lưu/xóa dữ liệu vẫn cần chủ sản phẩm/pháp lý duyệt.

Đợt 1 vẫn chờ VPS/origin/TLS/staging, runtime control bền vững, email Internet
và browser E2E. Các kết quả local không thay thế cổng nghiệm thu đó.
