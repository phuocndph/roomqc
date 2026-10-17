# Kiểm chứng sửa popup chương trình — 16/10/2026

## Thay đổi

- Bỏ `FreeTrialPopup` và điểm gắn vào layout; chỉ `AnnouncementHost` điều phối popup chương trình từ cấu hình quản trị.
- Nhấn Đã hiểu đóng promo và lưu đồng bộ theo backend, workspace/tenant, user, announcement ID. Bỏ checkbox dư thừa ở promo; giữ ở thông báo khác.
- Ghi local trước khi điều hướng/chờ API; giữ bản ghi pending khi mạng lỗi. Thử đồng bộ lại khi mở app, lấy lại focus hoặc online, kể cả sự kiện Capacitor qua React Query managers.
- Đọc dismissals lỗi hoặc chưa xác định được subscription thì không mở popup. Hủy timer theo vòng đời component/điều kiện; đổi user khởi tạo host riêng.
- Chặn chuỗi popup quảng bá trong cùng phiên sau khi đóng một chương trình. Không chặn thông báo hệ thống vì quy tắc promo.
- Không có migration. Không đổi đối tượng chiến dịch, giá hoặc thời hạn dùng thử. Trang Quản lý Đăng ký hiện có trạng thái, ngày hết hạn và thông tin gói để xem lại.
- Đã kiểm tra DB local: chỉ có một promo đang hoạt động mang tên Chương trình hỗ trợ chuyển đổi số; không cần xóa chiến dịch trùng.

## Kết quả đã thực hiện

| Kiểm tra | Kết quả |
| --- | --- |
| Test hồi quy popup/hook/storage | 22 đạt, gồm remount, session mới, đổi user, đọc lỗi, đóng trước CTA, duplicate, native reconnect |
| Toàn bộ Vitest | 324 đạt, 16 bỏ qua, 39 file đạt / 2 file bỏ qua |
| TypeScript app | Đạt |
| ESLint các tệp thay đổi | Đạt |
| Local Auth/API/RLS | 7 kiểm tra đạt qua `node scripts/test-announcement-dismissals-local.mjs` |
| Ghi nhận trên client khác cùng user | Đạt trong kiểm tra API local |
| Đọc/ghi chéo user | Server từ chối đúng; duplicate trả SQLSTATE 23505 |
| Dọn dữ liệu thử | Đã xóa đúng hai tài khoản và các bản ghi dismiss của chúng; không sửa dismiss của user có sẵn |
| Build và verify web Docker | Đạt; container RoomQC đã được cập nhật |
| Web local | Container healthy; `/healthz` và `/` trả HTTP 200 |
| Build bundle Android local | Đạt; đúng backend emulator, không có service worker |
| Biên dịch APK | Đạt, `assembleDebug`, 277 tác vụ |
| Chữ ký APK | `apksigner verify` đạt |
| Đồng bộ bundle vào native | Marker trong Android khớp bundle vừa build |
| Cài đè và mở app | `adb install -r` thành công; giữ nguyên dữ liệu ứng dụng |

## Kiểm tra Android thực tế

Máy ảo `RoomQC_API_36`, `emulator-5556`, ứng dụng `com.roomqc.app`:

1. Tài khoản đang mở là tài khoản dùng thử đã có ghi nhận ẩn promo trên server. Xác nhận qua truy vấn chỉ đọc; không xóa/sửa ghi nhận của người dùng để tạo lại popup.
2. Sau cài đè, trang tổng quan tải được, popup không xuất hiện dù local storage của bản sửa chưa có khóa acknowledgement. Đây là kiểm chứng thực tế cho lỗi trước đây: dismiss trên DB kích hoạt popup dự phòng.
3. Đi tới `/rooms`, quay lại, reload WebView và chờ dữ liệu: popup vẫn không xuất hiện.
4. Force-stop riêng RoomQC, mở lại MainActivity và chờ tải: phiên đăng nhập vẫn còn, trang tổng quan tải được, popup không xuất hiện.
5. Đã gỡ các port forward tạm dùng để kiểm tra WebView; máy ảo và app được để mở cho người dùng.

Thao tác bấm Đã hiểu lần đầu của một tài khoản mới, native offline/reconnect và đổi tài khoản trên Android chưa chạy E2E bằng giao diện trong đợt này. Chúng có test hồi quy; đường ghi nhận server đã được kiểm tra bằng tài khoản thử riêng qua API.

APK hiện tại: `artifacts/mobile/roomqc-debug.apk`, 40.319.049 byte, internal/debug, backend emulator `http://10.0.2.2:54321`.

SHA-256: `89d01394e0119edbb75cbaafe81b1c63c7f7fa37ee24ba2b45fe157520c65dad`.

## Giới hạn

- Thiết bị B chỉ biết thao tác đóng của thiết bị A sau khi A ghi server thành công và B đọc lại trạng thái. Khi A mất mạng, A vẫn ẩn nhờ bản ghi local.
- Nếu storage bị chặn/đầy, fallback bộ nhớ ngăn lặp trong lần chạy hiện tại; không thể cam kết tồn tại qua lần đóng app nếu cả lưu local và server đều thất bại.
- Các test tích hợp được cấu hình bỏ qua trong suite toàn dự án không được tính là đã chạy. Chưa kiểm thử iOS hoặc điện thoại thật trong đợt sửa này.
