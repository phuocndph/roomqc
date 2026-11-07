# Kiểm tra chức năng đăng ký tự động RoomQC

**Kết luận: cơ chế đăng ký tự động hoạt động trong môi trường thử riêng.**
Ngày 01/11/2026 đã chạy lại bằng `npm run test:customer-journey:local` trên
mã hiện tại: **91/91 kiểm tra đạt, tiến trình thoát 0**. Lượt thử
`3c23fa30efe8`, dùng backend mới với 591 migration. Không cần thêm VPS cho
phạm vi kiểm tra chức năng này.

| Luồng được thực thi | Kết quả |
| --- | --- |
| Hai chủ khách sạn tự đăng ký qua Auth public | Đạt; tài khoản chưa xác nhận không đăng nhập được |
| Nhận email SMTP, nhập mã sai/đúng và dùng lại mã | Mã đúng xác nhận được; mã sai và mã đã dùng bị chặn |
| Khai báo thông tin, tự cấp doanh nghiệp/khách sạn/quyền chủ sở hữu | Đạt; workspace chuyển active, có gói trial và bản ghi email chào mừng |
| Gửi lại đồng thời 10 yêu cầu cấp cho mỗi khách; mất phản hồi sau commit | Trả lại đúng kết quả đã cấp, không tạo thêm khách sạn/trial/email |
| Khai báo và tạo phòng; mở phiên đăng nhập mới | Đạt; lưu và đọc lại đúng khách sạn/phòng |
| Mời nhân viên, xác nhận lời mời, đặt mật khẩu, đăng nhập mới | Đạt; có quyền tại khách sạn được giao, không tự nâng lên quyền quản lý |
| Cách ly hai khách sạn | REST/RPC, tệp Storage và sự kiện Realtime đều đạt các kiểm tra cách ly của bộ thử |

Backend Auth, PostgreSQL, REST, Storage, Realtime và các handler nghiệp vụ
chạy thật trong Docker local. Control API chạy trong tiến trình fixture;
điều kiện admission/health/release được chuẩn bị riêng cho bộ thử. Email
được nhận tại SMTP nội bộ, không gửi đến người ngoài. Bản ghi welcome được
kiểm trong hàng đợi, không coi đó là đã giao thư ra ngoài.

Lượt này là kiểm tự động qua API và các client sản phẩm đã biên dịch,
**không chạy lại trình duyệt và không nghiệm thu Resend bên ngoài**.
Không suy ra kết quả tải lớn từ hai khách sạn thử.

Mã nguồn đã đối chiếu không đổi, schema nghiệp vụ không đổi. Runner dọn 14
tài nguyên; kiểm độc lập sau đó còn 0 container, 0 network và 0 volume mang
nhãn của đúng lượt thử. Không sửa dữ liệu đang phục vụ hoặc cấu hình VPS.

Kiểm riêng `https://roomqc.com` cùng lượt ghi nhận vẫn trả 503
`SIGNUP_CLOSED`. **Chức năng đã kiểm đạt; đăng ký công khai chưa mở.**
Phần tăng/thêm VPS được để lại sau theo phạm vi người dùng vừa xác định.

[Biên nhận và từng kiểm tra](../../../artifacts/roomqc-auto-signup-functional-check-2026-11-01.json).
