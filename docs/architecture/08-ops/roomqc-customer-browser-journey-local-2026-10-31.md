# Nghiệm thu luồng đăng ký bằng trình duyệt — local 31/10/2026

Đã thao tác trên giao diện RoomQC thật với bộ backend mới, 591 migration,
Auth, REST, Realtime, functions và PostgreSQL riêng. Không dùng tài khoản
hoặc dữ liệu khách sạn đang vận hành. Run `5c2bc5e19b5c`, terminal exit 0.

## Kết quả đã quan sát

| Thao tác | Kết quả |
|---|---|
| Chọn mã doanh nghiệp, đăng ký chủ khách sạn | Đạt |
| Nhận thư trong SMTP nội bộ | Đạt; không gửi ra ngoài |
| Nhập mã sai rồi mã đúng | Mã sai bị từ chối, mã đúng xác minh được |
| Đăng nhập và khai báo khách sạn | Tạo đúng một workspace hoạt động |
| Tạo phòng 101 trên máy tính, bỏ trống diện tích | Đạt sau khi sửa; giá 450.000, trạng thái trống sạch |
| Điện thoại 390×844, diện tích âm | Hiện lý do ngay ở bước Chi tiết, không cho đi tiếp |
| Điện thoại, xóa diện tích rồi tạo phòng 102 | Đạt; giá 500.000; nút Tiếp theo/Tạo phòng không bị menu che |
| Tạo chức vụ buồng phòng, gửi lời mời nhân viên | Đạt; thư được bắt nội bộ, lời mời chờ chấp nhận |
| Đăng xuất, đăng nhập lại | Đạt; dashboard giữ đúng khách sạn và cả hai phòng |

Đối chiếu trực tiếp PostgreSQL: 1 workspace đã cấp, 1 tài khoản owner đã xác
minh, 2 phòng đúng giá với diện tích NULL. Chưa có nhân viên hoạt động vì chưa
chấp nhận lời mời; không coi gửi thư là đã kiểm được quyền nhân viên.

## Hai lỗi đã sửa

1. **Để trống diện tích chặn lưu mà không hiện lý do.** Ô số trống từng biến
   thành NaN. Cả desktop và mobile chuyển ô trống thành dữ liệu không nhập,
   hiện lỗi có liên kết trợ năng khi sai, và gửi NULL khi xóa diện tích cũ.
   Giá trị 0 được giữ đúng khi mở chỉnh sửa.
2. **Menu điện thoại che nút chuyển bước/lưu.** Đưa hàng nút biểu mẫu lên
   trên thanh điều hướng và vùng an toàn. Đã kiểm vị trí, điểm bấm thực tế
   và thao tác chuyển bước rồi lưu thành công bằng trình duyệt.

Kiểm tự động: 20/20 form/schema, 22/22 kiểm luồng và giới hạn fixture;
TypeScript app và lint phần thay đổi đạt. Docker build/verify đạt; còn cảnh
báo chunk lớn sẵn có. Đã cập nhật riêng frontend 8082 và giữ image cũ để quay
lại; container khác giữ nguyên. Không sửa database đang dùng.

## Phạm vi và phần còn lại

- Số đo admission của bộ thử là dữ liệu điều kiện thử tổng hợp, không phải
  số đo tài nguyên VPS thật. Đăng ký chỉ mở trong bộ thử riêng.
- Chưa nghiệm thu email Resend bên ngoài, chấp nhận lời mời và đăng nhập nhân
  viên, cô lập hai khách sạn qua browser, toàn bộ module, tải hoặc pilot.
- Chưa triển khai đầy đủ RoomQC/signup trên Contabo hoặc phục hồi ngoài máy.
  VPS test không đổi, không tăng ổ, không mở đăng ký production.
- Danh sách VPS tại 8082 vẫn chưa có máy được gắn. Cần nối inventory → cụm →
  worker → số đo → backup trước khi quản trị được tài nguyên thật.
- Cần làm rõ nhãn gói ở sidebar: hiện hiện `free_trial · 0 phòng`, lấy từ
  `registered_rooms` của gói, trong khi dashboard có 2 phòng thực tế. Đây là
  hai số khác nhau; chưa thay chính sách quota trong lượt thử này. Nhãn cần
  phân biệt số phòng của gói với số phòng đã tạo để tránh gây hiểu nhầm.

Parent runner kiểm nguồn backend không đổi tới cuối và dọn bộ thử. Đã kiểm
độc lập: container kể cả đã dừng, network và volume mang nhãn lượt thử đều 0.
Các nguồn form trong bản browser đã kiểm có hash trùng mã hiện tại.

[Biên nhận đã lọc](../../../artifacts/roomqc-customer-browser-journey-local-2026-10-31.json)
· [Bản sửa đã chạy tại 8082](../../../artifacts/roomqc-signup-browser-fixes-web-local-deployment-2026-10-31.json)
· [Ảnh sau đăng nhập lại](../../../artifacts/roomqc-signup-browser-relogin-2026-10-31.jpg)
· [Ảnh điện thoại và thông báo lỗi](../../../artifacts/roomqc-signup-browser-mobile-area-error-2026-10-31.jpg)

Chạy lại bằng `npm run test:customer-browser:local`. Mở origin loopback do
runner trả về, thao tác đăng ký từ `/start`, xem mã ở `/__fixture/inbox`, kiểm
nghiệp vụ rồi bấm Kết thúc kiểm thử tại hộp thư. Runner chờ thao tác và kiểm
dữ liệu trước khi dọn; lệnh khởi chạy một mình không chứng minh browser E2E.
