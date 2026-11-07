# Trạng thái đăng ký mới và cách chủ RoomQC quản lý máy chủ

Ngày kiểm tra: 31/10/2026. Phạm vi: local; VPS Contabo chỉ dùng thử, không tăng
dung lượng hoặc mở đăng ký production.

## Đã thực hiện

- `/admin/overview` trả trạng thái đăng ký toàn hệ thống cùng sức chứa của các
  cụm đủ điều kiện. Tất cả số đếm và thời điểm dùng một snapshot PostgreSQL;
  không đếm từ trang danh sách đang lọc hoặc phân trang.
- Hạ tầng và Đăng ký mới cùng hiển thị khung Tiếp nhận khách hàng mới.
  Khung phân biệt đóng trong cấu hình, mở nhận khách và chưa có cụm đủ điều kiện.
- Trong lúc tải, lỗi hoặc quan sát quá 30 giây, giao diện không giữ nhãn mở cũ.
  Người vận hành có thể tải lại; mỗi đăng ký vẫn phải kiểm điều kiện tại lúc cấp.
- Hợp đồng public và native route đã bổ sung overview; không đưa endpoint,
  DSN, thông tin kết nối SSH hoặc khóa vào khung trạng thái.
- Cập nhật riêng frontend 8082 và control local; giữ image frontend cũ để quay
  lại. Các container local khác giữ nguyên sau lần cập nhật web.

## Kiểm tra trong lượt này

| Bằng chứng | Kết quả |
|---|---|
| Admin UI/client | 90/90 đạt |
| Admin API contract | 11/11 đạt |
| PostgreSQL/HTTP cô lập | 1/1 đạt: global closure, capacity, full, stale, auth revoke, strict query, no-store |
| TypeScript app | Đạt |
| ESLint các file giao diện thay đổi | Đạt |
| ESLint mã nguồn, bỏ qua cache `.local` | 2.146 file, 0 lỗi, 1.446 cảnh báo |
| Docker build và verify build | Đạt; còn cảnh báo chunk lớn sẵn có |
| HTTP health/control ready | 200 |
| Overview thiếu xác thực | 401/no-store |
| Browser Super Admin thật | Đọc trạng thái đóng, điều hướng hai trang, hết hạn và tải lại đạt |

Bài PostgreSQL từng lộ lỗi fixture: đặt valid_until về quá khứ nhưng chưa đặt
observed_at về trước nó. Đã sửa hai thời điểm cùng nhau và chạy lại đạt, không
nới ràng buộc database.

Lượt lint toàn thư mục ban đầu quét cả mã cache và bản sao thư viện trong
`.local`, nên không dùng kết quả đó để xác nhận chất lượng mã nguồn. Đã chạy
lại với `.local` bị loại: 0 lỗi; còn 1.446 cảnh báo trên mã nguồn hiện có.

## Trạng thái thật trên giao diện

- Đăng ký mới đang đóng.
- Máy chủ VPS chưa có bản ghi trong danh sách đang phục vụ local.
- Cụm local-a đang đóng, 0/20, chưa có số đo.
- Đăng ký mới chưa có bản ghi phù hợp.

Đây là kiểm tra đọc với phiên quản trị hiện có, không phải cấp khách thật hoặc
kiểm thử tải. Không thay dữ liệu nghiệp vụ khách sạn. Không kết luận Contabo đã
được giám sát chỉ vì trang Hạ tầng tải được.

## Người vận hành sẽ quản lý ở đâu

1. Hạ tầng → Máy chủ VPS: xem máy đã ghi nhận, cụm liên kết và điều kiện triển khai.
2. Hạ tầng → Cụm dữ liệu: theo dõi tài nguyên và sức chứa; đóng nhận khách/rút tải
   khi cần. Thao tác này không reboot hoặc xóa dữ liệu khách đang hoạt động.
3. Đăng ký mới: theo dõi khách đang chờ, đang cấp, đã sẵn sàng hoặc cần đối soát.
4. Khách hàng/Gói dịch vụ: quản lý gói và trạng thái từng doanh nghiệp.
5. Cảnh báo/Sao lưu/Triển khai: theo dõi sự cố, bằng chứng sao lưu và các bản cài.

Mua VPS, thanh toán và nâng cấu hình hiện làm tại Contabo. Sau khi chuẩn bị máy,
cần gắn inventory, cụm, worker, số đo và backup trước khi cho nhận khách. Việc
tự mua/tăng VPS qua API nhà cung cấp chưa được nghiệm thu.

## Còn lại trong mục tiêu tổng thể

- Gắn VPS thật và hoàn thiện giám sát/backup ngoài máy.
- Nghiệm thu full stack RoomQC cùng signup trên môi trường đủ tài nguyên.
- Browser signup E2E cô lập đã hoàn tất sau báo cáo này, kèm sửa hai lỗi tạo
  phòng; xem [kết quả mới](roomqc-customer-browser-journey-local-2026-10-31.md).
  Email thật, phục hồi ngoài máy, tải và pilot vẫn chưa nghiệm thu.
- Không bỏ qua DISK_HEADROOM_LOW trên VPS hiện tại để chạy full stack.

[Bằng chứng máy đọc](../../../artifacts/roomqc-signup-status-live-local-2026-10-31.json)
· [Ảnh giao diện](../../../artifacts/roomqc-signup-status-live-local-2026-10-31.jpg)
