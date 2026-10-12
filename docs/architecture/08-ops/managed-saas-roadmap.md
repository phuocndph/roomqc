# RoomQC SaaS do RoomQC vận hành

## Mục tiêu đã thống nhất

Khách hàng đăng ký và nhập thông tin khách sạn trên một website RoomQC. RoomQC
quản lý máy chủ, Supabase, Docker, cập nhật và sao lưu. Khách không cần mua VPS
hay cài đặt phần mềm máy chủ.

Các khách sạn ban đầu chạy trên cụm máy chủ chung. Mỗi công ty có `tenant_id`
riêng, mỗi chi nhánh có `hotel_id` riêng; RLS và kiểm tra quyền trong RPC giới hạn
truy cập. Đăng ký tạo dữ liệu nghiệp vụ trong cụm có sẵn, không cần gọi API nhà
cung cấp VPS cho mỗi khách hàng.

Một tài khoản chủ sở hữu có thể quản lý nhiều khách sạn. Nhân viên do chủ sở hữu
hoặc quản lý tạo và gán vị trí/quyền, không tự tạo tenant qua onboarding.

## Các giai đoạn

| Giai đoạn | Kết quả cần đạt | Điều kiện hoàn thành |
|---|---|---|
| 1. Tự thiết lập khách sạn | Đăng ký → xác thực → onboarding → owner, tenant, khách sạn và trial | Test cấp phát, gửi đồng thời, điều hướng và quyền đều qua |
| 2. Vận hành VPS | Supabase self-host và frontend dùng domain HTTPS do RoomQC quản lý | Đăng ký thử qua domain; email, storage, realtime và các Edge Function được dùng hoạt động |
| 3. Sao lưu và giám sát | Backup ngoài VPS; khôi phục được; cảnh báo khi API/database/dung lượng lỗi | Khôi phục bản sao vào môi trường riêng, đối chiếu dữ liệu và tệp |
| 4. Quản lý gói | Trial/hết hạn/gia hạn/quota hoạt động thống nhất ở server và giao diện | Test giới hạn, hết hạn, thanh toán lặp, gia hạn và quyền chỉ đọc |
| 5. Mở rộng cụm | Điều phối khách mới sang cụm còn tài nguyên; chuyển tenant khi cần | Load test đạt mục tiêu đã đo; có quy trình chuyển và khôi phục |

Mục tiêu 1.000 khách sạn không đồng nghĩa một VPS phục vụ đủ ngay. Đo số người
hoạt động thực tế, request, kết nối realtime, dung lượng và độ trễ để quyết định
thêm cụm. Không suy ra khả năng 100.000 người đồng thời từ unit test hay build.

## Ranh giới trách nhiệm

- Giao diện khách hàng: đăng ký, thông tin khách sạn, sử dụng module, xem gói.
- Database: cấp phát nguyên tử, quyền truy cập, quota và trạng thái gói.
- Vận hành RoomQC: cấu hình cụm, DNS/HTTPS, email, backup, giám sát và cập nhật.
- Hệ thống điều phối nhiều cụm: bổ sung khi có nhu cầu, tách khỏi các bảng nghiệp vụ
  và khóa frontend; không đưa quyền quản lý hạ tầng vào tài khoản chủ khách sạn.

Chi tiết hiện trạng và công việc giai đoạn đầu nằm trong
[managed-saas-phase-1.md](./managed-saas-phase-1.md).
