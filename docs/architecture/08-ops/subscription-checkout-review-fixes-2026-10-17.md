# RoomQC — sửa sau review checkout, 17/10/2026

Phạm vi: local, Supabase đang chạy của dự án này. Chưa phát hành VPS,
chưa bật thanh toán thật hoặc signup công khai.

## Bốn điểm review đã xử lý

1. **Giá browser/đơn cũ:** hai form gia hạn/mua thêm chỉ gửi nhu cầu
   (kind, rooms, duration) tới RPC báo giá. Hiển thị đúng snapshot server,
   không dùng hằng giá frontend hoặc chiết khấu mua thêm tự tính để tạo đơn.
   Mở dialog chỉ lấy quote; nhấn Tạo bản nháp mới ghi đơn nguyên tử.
   Request ID giữ nguyên khi retry mất phản hồi; nút chống double-click.
   Không yêu cầu ngân hàng/API key để xem giá và tạo nháp.
2. **Quyền ghi/settlement:** migration
   `20261017063536_subscription_checkout_client_cutover.sql` thu hồi
   INSERT/UPDATE/DELETE invoice/payment của browser (kể cả browser admin).
   Các hook ghi tiền trực tiếp không còn người dùng đã được bỏ.
   Draft không payable; pending legacy chưa có giá server được giữ nguyên
   và trả lỗi cần đối soát khi xác nhận. Chặn cả entry point
   `handle_successful_payment`, không chỉ wrapper webhook.
   Completed replay chỉ xác nhận đã xử lý, không kích hoạt lại.
   Đây là **chặn an toàn**, chưa phải hoàn thành settlement từ payable snapshot.
3. **Hủy:** khóa payment rồi invoice; owner/session hiện hữu hoặc trusted
   service, từ chối nếu invoice paid/paid_at hoặc có sibling completed.
   Hủy một sibling chưa hủy invoice nếu còn pending; hủy cuối mới đóng.
   Retry failed không ghi thêm. Không thay đổi entitlement hoặc xóa chứng từ.
4. **QR/trạng thái:** dialog dùng bank nền tảng thay cho bank hotel.
   Chỉ lưu ID đang chọn, lấy object từ query mới. Đóng dialog ngay khi có
   payment UPDATE/DELETE hoặc invoice event; tạm ẩn thông tin lúc refetch/lỗi.
   Polling 5 giây là fallback khi mất Realtime, không cam kết cập nhật tức thì
   trong thời gian mạng đứt. Guard yêu cầu checkout_enabled=true rõ ràng;
   hiện server không phát capability đó, nên không có QR thu tiền thật.

Danh sách Đang chờ đã bao gồm payment_method=NULL để nháp không bị ẩn:
có nút xem/hủy, nhãn nháp và cảnh báo không chuyển khoản.
Lịch sử thêm expired/refunded. Không thay đổi booking payment của khách lưu trú.

## Kiểm chứng

- Checkout draft/expiry/cancellation integration: **96 ca đạt**, gồm invoice
  đã paid/paid_at/sibling completed, shared invoice hủy tuần tự/đồng thời,
  retry và 20 completed replay, cùng kiểm tra quyền sau cutover.
- Quote foundation: **55 đạt**; quyền tenant: **56 đạt**; customer journey:
  **81 đạt** qua Auth/Mailpit/REST/RPC/Storage/Realtime local.
- Vitest: **606 đạt, 16 skip**; 34 ca mới kiểm tra quote dialog, chọn giao dịch
  theo dữ liệu mới, bank selector và bộ đọc phản hồi/lỗi.
- TypeScript thực tế: `npx tsc --noEmit -p tsconfig.app.json` đạt.
  ESLint phạm vi sửa và kiểm tra cú pháp script đạt.
- DB security advisors warn: không vấn đề; lint public/private: không lỗi.
  Migration đã có lịch sử local. Kiểm tra column grants xác nhận browser
  không còn INSERT/UPDATE invoice hoặc INSERT payment.
- Docker Node22 build và verify:build đạt; bundle vendor vẫn còn cảnh báo lớn
  có sẵn (~14,16MB minified/4,72MB gzip), chưa xử lý trong đợt checkout.
- Đã cập nhật riêng container RoomQC cổng8082 và verify:container đạt;
  không restart CRM hoặc các dịch vụ khác. Guard test16/control unit8 đạt.

Test dùng tài khoản/tenant fixture loopback và Mailpit, dọn theo ID đã biết;
không reset DB, không đối soát/tái tính giá các đơn thật có sẵn,
không gửi email Internet hoặc gọi ngân hàng. Kiểm thử confirmation song song
trong suite là transaction mô phỏng khóa DB, không phải webhook provider thật.
Không tính unit/component test là browser E2E; chưa nghiệm thu trình duyệt
và staging, mất mạng thiết bị thực hoặc tải production.

## Tiếp theo trước khi thu tiền

- Duyệt chính sách capacity trong kỳ, kỳ hạn/múi giờ/giá/late payment.
- Payable order do server phát hành, bank/reference và một settlement kiểm
  tra snapshot/amount/currency/invoice/tenant; không bật lại quyền ghi browser.
- Luồng đối soát đơn legacy có audit/quyền riêng trước khi giải phóng đơn;
  không tự coi chúng hợp lệ, không tự xóa/hủy hàng loạt.
- Cấu hình provider, staging/TLS, cron/monitor, backup restore và browser E2E.

Danh sách khóa/quyền tiếp tục ở
[roomqc-deferred-access-and-decisions-2026-10-17.md](roomqc-deferred-access-and-decisions-2026-10-17.md).
