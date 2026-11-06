# Đăng ký tự động: kiểm trình duyệt và bản demo để người dùng thử

> Cập nhật: demo `d33c1b6ff115` dưới đây đã hết hạn lúc 15:49 ngày
> 01/11/2026 và bị bộ thử dọn. Đây là nguyên nhân lỗi `Failed to fetch` khi
> người dùng thử sau đó. Các tài khoản/dữ liệu của lượt tạm này không còn.
> Đã thay bằng dịch vụ local có vòng đời riêng, kiểm restart đạt; xem
> `roomqc-signup-demo-recovery-2026-11-01.md` để biết kết quả mới.

Ngày 01/11/2026 đã thực hiện **13 mục kiểm trực tiếp trên giao diện** của bản
RoomQC mới. Phạm vi là bộ thử riêng trên máy local, có Auth/PostgreSQL và SMTP
nội bộ thật; số đo admission được chuẩn bị cho bộ thử. Không mua/thêm VPS,
không thay cấu hình VPS hoặc mở signup production.

## Kết quả

- Máy tính: chọn địa chỉ doanh nghiệp, đăng ký chủ khách sạn, nhận thư, thử
  OTP sai rồi xác nhận bằng OTP đúng, đăng nhập và tự cấp khách sạn thành công.
- Tạo phòng 101 giá 450.000 đồng, để trống diện tích, lưu và mở chi tiết được.
- Mobile mô phỏng 390×844: nhập diện tích âm hiện lỗi, bỏ trống được chấp nhận;
  nút lưu nhận được click và không bị thanh điều hướng che. Tạo phòng 102 giá
  500.000 đồng thành công.
- Đăng xuất rồi đăng nhập lại giữ nguyên khách sạn và hai phòng. Thông báo
  chào mừng không hiện lại trong lần đăng nhập này.
- Chạy tiếp từ đầu trên mobile: chủ sở hữu thứ hai đăng ký, xác nhận email,
  đăng nhập và tự cấp khách sạn riêng, dashboard không chứa phòng của khách
  sạn đầu. Đăng nhập bằng tài khoản thứ hai tại địa chỉ khách sạn đầu bị chặn
  với thông báo “Tài khoản không thuộc doanh nghiệp này”.
- Đối chiếu PostgreSQL: hai workspace active, hai chủ sở hữu đã xác minh,
  hai khách sạn, hai trial, không có tenant binding trùng; phòng 101/102 đúng
  giá, diện tích NULL và trạng thái vacant_clean. Schema không đổi; nguồn
  backend khớp snapshot của run `d33c1b6ff115`.
- Console ghi nhận 0 lỗi trong lần đọc cuối. Đây là 13 mục thao tác browser,
  không cộng thành các bài kiểm tự động của lượt 91/91 trước đó.

Một điểm về nội dung cần thống nhất trước khi dùng với khách thật: popup chào
mừng quảng bá miễn phí 5 tháng, trong khi gói dùng thử trên sidebar của tài
khoản mới hết hạn 01/12/2026, tức khoảng một tháng sau ngày đăng ký. Lượt này
không đổi thời hạn gói hoặc nội dung chương trình khi chưa chốt chính sách.

## Lỗi của công cụ thử đã sửa

Lượt `3bc978f51750` dừng khi build: plugin Lovable MCP cố ghi đè entrypoint
do sản phẩm quản lý. Đã thêm `ROOMQC_SKIP_MCP_SYNC=true` vào build argument
của `scripts/control-backend-browser-journey.mjs`, dùng tùy chọn có sẵn trong
Dockerfile/Vite. Không xóa entrypoint. Lượt sau dựng frontend, verify build
và thao tác browser thành công. Kiểm độc lập lượt lỗi còn 0 container,
network và volume. Không ghi lượt lỗi thành success.

## Bản demo đang giữ để người dùng nghiệm thu

- [Đăng ký mới](http://127.0.0.1:59255/start).
- [Hộp thư lấy mã xác nhận](http://127.0.0.1:59255/__fixture/inbox).
- Đã điền sẵn tên, địa chỉ doanh nghiệp và email thử chưa dùng ở tab đăng ký.
  Người dùng tự chọn mật khẩu ở bước tiếp theo và xem mã trong hộp thư.
  Nếu mở lại trang làm mất dữ liệu đã điền, dùng email có nhãn `browser-staff`
  trong danh sách hộp thư; hai email owner/second đã dùng ở lượt kiểm trên.
- Chỉ nhận ba email giả lập được liệt kê; không nhận email thật và không gửi
  ra ngoài. Bản demo là tạm thời, tự đóng khoảng **15:49 ngày 01/11/2026**,
  giờ Việt Nam. Có thể kết thúc sớm bằng nút **Kết thúc kiểm thử** trong hộp thư.

Runner còn chờ người dùng nên **chưa có terminal exit 0 và chưa dọn run đang
giữ**. Kết quả browser và database được ghi riêng; không tuyên bố parent đã
nghiệm thu/dọn xong. Bộ thử không phải bản cài bền vững hoặc kiểm tải, không
nghiệm thu giao thư Resend hay nhận lời mời nhân viên qua browser trong lượt này.

[Biên nhận browser và đối chiếu database](../../../artifacts/roomqc-signup-browser-demo-2026-11-01.json).
[Ảnh dashboard sau đăng nhập lại](../../../artifacts/roomqc-signup-demo-desktop-2026-11-01.png).
