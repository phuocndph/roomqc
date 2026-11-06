# RoomQC — kiểm quyền thật khi đổi cấu hình, 30/10/2026

**Đạt kiểm thành phần local; chưa nghiệm thu toàn backend hoặc VPS.** [Packet](../../../artifacts/roomqc-managed-configuration-authority-local-2026-10-30.json).

Nguồn 423 tệp, SHA256 `6a6b45b1b2e5f00a9c1396f95c935cb63d0d317a7c4ce613757e257423019e90`. Control trên cùng nguồn: 647 đạt, 0 lỗi, 226 bỏ qua. Lượt native `cee2904fa769` kết thúc exit 0, 590 migration, nguồn/schema được đối chiếu, worker shutdown exit 0 và kiểm độc lập container/network/volume còn 0.

## Thay đổi và bằng chứng

- Hai bài kiểm đổi cấu hình và release đã bỏ actor ngẫu nhiên, dùng `ClusterGateway.supportActor` và `supportCommandAuthorizer`; quyền/receipt do canonical Auth xác nhận. Đợt này mới nghiệm thu phần đổi chính sách và nguồn đo.
- Tài khoản xác nhận được tạo riêng bằng GoTrue admin trong backend thử có ownership. Profile/role được cấp trong bước chuẩn bị ngắn hạn; một phiên bị xóa thật khỏi `auth.sessions` để kiểm thu hồi. Không lấy `user_metadata` làm nguồn quyền.
- Thiếu authorizer hoặc phiên đã thu hồi đều bị chặn; đối chiếu cấu hình và sáu bảng command/journal/acceptance/result trước–sau không có tác dụng phụ.
- Lệnh hợp lệ tạo đúng một command/audit, nhận receipt khớp actor, cụm, phiên, audience, operation, target, key và payload. Gửi lại cùng key giữ nguyên kết quả/receipt, không thêm tác dụng.
- Trong lúc số liệu Prometheus thật đang được giữ ở ranh giới HTTP, đổi chính sách/nguồn đo rồi thả mẫu cũ: worker từ chối mẫu, không ghi đè cấu hình đã commit. Worker dùng nguồn cũ bị từ chối ở chu kỳ tiếp; khởi động lại với cấu hình chỉ đọc đã duyệt phục hồi năm dịch vụ.
- Kiểm actual environment của worker không chứa operator JWT, service key hoặc DSN installer nghiệp vụ. Input của bài kiểm quản trị không được mount vào worker.
- Sửa thiếu khóa mã gọi phòng và báo cáo trong nhánh diagnostic managed; chúng vẫn thực thi trong nhánh này nên phải được gắn đúng nguồn từ đầu. R1 thất bại tại bước này, đã dọn sạch; không tính R1 đạt.

## Giới hạn và nhận tiếp

Tài khoản đã xác nhận và phê duyệt release có chữ ký là thiết lập fixture, chưa phải luồng signup/inbox hoặc issuer sản xuất. Đổi nguồn đo ở đây là đổi ngân sách kết nối đã duyệt, chưa thay exporter vật lý. Diagnostic bỏ thời gian warmup dài và không được dùng làm reference dựng lại độc lập.

[Lượt release riêng](roomqc-managed-release-authority-local-2026-10-30.md) đã kết thúc exit 0, kiểm phục hồi Functions/đủ năm dịch vụ và cleanup độc lập 0. Cùng nguồn, Linux tập trung có 29 đạt/0 lỗi/1 bỏ qua. Nhận tiếp full-default có native advisors và dựng lại độc lập trên cùng nguồn; không cộng hai diagnostic thành full-default. BG02/BG03 tổng thể, VPS/DNS/HTTPS/email, backup ngoài host/phục hồi máy sạch, E2E web/Android/hai cụm, tải/chi phí và pilot ≥7 ngày còn mở. Không đổi release acceptance/reviewer/signoff từ packet này.
