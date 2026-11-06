# RoomQC — kiểm quyền thật khi đổi release, 30/10/2026

**Đạt diagnostic local; chưa nghiệm thu toàn backend hoặc VPS.** [Packet](../../../artifacts/roomqc-managed-release-authority-local-2026-10-30.json).

Nguồn 423 tệp, SHA256 6a6b45b1b2e5f00a9c1396f95c935cb63d0d317a7c4ce613757e257423019e90. Control 647 đạt/0 lỗi/226 bỏ qua; Linux tập trung 29 đạt/0 lỗi/1 bỏ qua (UID1000, chỉ đọc, không mạng, không capabilities). Native run 6c66c7b2d0be trên 590 migration kết thúc exit 0; nguồn/schema được đối chiếu, worker shutdown exit 0 và cleanup độc lập container/network/volume còn 0.

Đã thay actor ngẫu nhiên bằng phiên canonical Auth và supportCommandAuthorizer. Thiếu authorizer hoặc phiên đã xóa bị chặn, không đổi cấu hình hoặc sáu bảng command/journal/result/receipt. Lệnh hợp lệ tiêu thụ receipt khớp actor/cụm/phiên/audience/target/key/payload; phát lại giữ nguyên kết quả/receipt.

Đổi manifest của fixture và signed approval trong khi số liệu Prometheus thật đang bị giữ ở ranh giới HTTP; bản phê duyệt cũ từ chối manifest mới, lệnh validate dùng transport thật, mẫu cũ không ghi đè cấu hình đã commit. Worker giữ catalog cũ bị từ chối ở chu kỳ tiếp. Triển khai Functions bằng đúng một thay đổi release environment, giữ image và Compose override cho các lần restart; installer gắn lại credential theo release mới; khởi động worker từ catalog chỉ đọc mới phục hồi Auth/REST/Storage/Realtime/Functions.

Kiểm environment thực của worker không chứa JWT quản trị, service key hoặc DSN installer nghiệp vụ. Account được tạo và xác nhận riêng qua GoTrue admin; phê duyệt release do fixture ký. Chưa public signup/inbox, production issuer hoặc withdrawal qua nhiều replica. Hai PostgreSQL riêng vẫn ở cùng Docker host. Diagnostic bỏ warmup dài, không dùng làm reference dựng lại độc lập. Lần Linux đầu thất bại trước khi chạy test vì thiếu mountpoint; R2b sửa môi trường gắn thư mục, không thay mã nguồn, rồi đạt.

Nhận tiếp full-default có native advisors, sau đó dựng lại độc lập trên cùng nguồn. BG02/BG03 tổng thể và VPS/DNS/email, offsite restore, E2E web/Android/hai cụm, tải/chi phí và pilot ≥7 ngày còn mở. Không đổi release acceptance/reviewer/signoff từ packet này.
