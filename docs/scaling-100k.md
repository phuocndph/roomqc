# Kế hoạch mở rộng RoomQC lên 100.000 người dùng đồng thời

## Kết luận kỹ thuật

Mục tiêu 100.000 người dùng đồng thời không đạt được chỉ bằng cách tăng VPS
hoặc tăng `max_connections`. RoomQC hiện là frontend tĩnh chạy bằng Nginx,
trình duyệt gọi trực tiếp Supabase Data API, Auth, Storage và Realtime. Vì vậy
giới hạn thực tế nằm ở Supabase, số lượng kết nối Realtime, tải truy vấn, tốc độ
ghi và hạ tầng mạng.

100.000 người dùng mở ứng dụng nhưng chỉ đọc dữ liệu khác hoàn toàn với 100.000
người cùng lúc ghi dữ liệu hoặc nhận sự kiện realtime. Trước khi chốt cấu hình,
cần chốt một trong hai chỉ tiêu:

- **100.000 phiên online**, với phần lớn người dùng đọc dữ liệu và chỉ một phần
  nhận realtime.
- **100.000 người hoạt động cao**, có thao tác ghi và cập nhật realtime thường
  xuyên. Mục tiêu này cần phân vùng tải và hạ tầng lớn hơn đáng kể.

## Hiện trạng đã phát hiện

- Frontend được phục vụ bởi một container Nginx; không có giới hạn user cứng ở
  lớp web.
- Client dùng Supabase Data API trực tiếp từ trình duyệt.
- Mã nguồn có khoảng 49 điểm tạo Realtime channel. Nếu mỗi màn hình mở nhiều
  channel theo tenant, hotel, booking hoặc user, số kết nối và số sự kiện tăng
  theo phiên người dùng.
- Môi trường local hiện dùng PostgreSQL `max_connections=100`; đây là giới hạn
  của môi trường phát triển, không phải cấu hình production cho 100.000 user.
- React Query đã có cache mặc định 5 phút và tắt refetch khi focus, nhưng nhiều
  hook vẫn có subscription riêng và một số luồng còn polling.

## Kiến trúc mục tiêu

1. **Edge/CDN**
   - Đưa bundle tĩnh lên CDN (Cloudflare hoặc tương đương), bật Brotli, HTTP/2
     hoặc HTTP/3, cache dài hạn cho `/assets`.
   - VPS chỉ giữ reverse proxy, health check và các endpoint nội bộ; không dùng
     VPS làm nơi xử lý 100.000 phiên ứng dụng.

2. **Supabase production**
   - Dùng project production riêng, không dùng Supabase local.
   - Chọn compute dedicated và gói có giới hạn Realtime/API phù hợp; yêu cầu
     Supabase xác nhận nâng giới hạn Realtime lên mức cần thiết cho 100.000
     phiên.
   - Bật connection pooling/Supavisor cho mọi backend hoặc Edge Function có
     kết nối Postgres.
   - Dùng read replica cho báo cáo và các truy vấn đọc nặng; database chính chỉ
     xử lý nghiệp vụ ghi và đọc giao dịch.

3. **Realtime theo tầng**
   - Không tạo channel riêng cho từng widget nếu có thể gom theo tenant/hotel.
   - Tách sự kiện bắt buộc realtime (trạng thái phòng, nhiệm vụ đang giao,
     thông báo) khỏi dữ liệu có thể cập nhật theo chu kỳ.
   - Chỉ subscribe khi màn hình cần dữ liệu; hủy ngay khi rời màn hình hoặc tab
     bị ẩn.
   - Với thông báo diện rộng, dùng broadcast/fan-out có kiểm soát hoặc hàng đợi,
     không phát một thay đổi database tới toàn bộ client.

4. **Cache và API**
   - Cache dữ liệu tham chiếu ít thay đổi (danh mục, quyền, cấu hình khách sạn)
     ở browser và edge.
   - Đưa dashboard/report nặng sang RPC đã tối ưu hoặc job tổng hợp định kỳ;
     không để mỗi client tự chạy nhiều truy vấn `count`/join đồng thời.
   - Mọi danh sách phải phân trang, giới hạn trường trả về và có index phù hợp.
   - Các thao tác ghi quan trọng tiếp tục đi qua RPC idempotent để tránh ghi
     trùng khi client retry.

## Các giai đoạn triển khai

### Giai đoạn 1 — Đo chuẩn và khóa mục tiêu

- Chốt định nghĩa “đồng thời” và tỷ lệ người dùng có Realtime.
- Thêm đo p50/p95/p99 cho Data API, RPC, Auth và Realtime.
- Ghi nhận số request/phút, số channel/phiên, bytes realtime và lỗi 429/5xx.
- Tạo staging có dữ liệu tương đương production.

### Giai đoạn 2 — Tối ưu ứng dụng

- Xây một realtime coordinator dùng chung thay cho các subscription trùng
  nhau.
- Chuyển polling còn lại sang sự kiện hoặc khoảng thời gian phù hợp.
- Rà soát toàn bộ hook có query rộng, thiếu phân trang hoặc trả dư cột.
- Thêm virtualisation cho bảng lớn và giới hạn kích thước payload.

### Giai đoạn 3 — Tối ưu database

- Chạy `EXPLAIN (ANALYZE, BUFFERS)` cho các RPC và truy vấn nằm trong top tải.
- Bổ sung index theo tenant/hotel và cột lọc/sắp xếp thực tế.
- Tách báo cáo khỏi đường giao dịch bằng read replica hoặc bảng tổng hợp.
- Chạy Supabase Advisors và kiểm tra RLS không tạo truy vấn lặp theo từng dòng.

### Giai đoạn 4 — Hạ tầng production

- CDN cho frontend, reverse proxy có rate limit theo IP/user và timeout rõ ràng.
- Supabase compute dedicated, pooling và Realtime quota được Supabase xác nhận
  bằng văn bản.
- Thiết lập backup, point-in-time recovery, cảnh báo CPU/RAM/IOPS/connections,
  API latency, Realtime connections và error rate.

### Giai đoạn 5 — Kiểm thử tải và nghiệm thu

- Chạy kịch bản 25k, 50k, 75k và 100k phiên trên staging.
- Tách kịch bản đọc, ghi nghiệp vụ, đăng nhập, upload và Realtime.
- Chỉ nghiệm thu khi p95 thao tác đọc/ghi trong ngưỡng đã chốt, không có lỗi
  connection exhaustion, không vượt giới hạn Realtime/API và dữ liệu nghiệp vụ
  vẫn idempotent dưới retry.

## Điều kiện cần từ hạ tầng

Để triển khai production thật, cần các thông tin sau:

- Gói Supabase và khu vực triển khai.
- VPS/reverse proxy hoặc CDN dự kiến, gồm vCPU, RAM, băng thông và khu vực.
- Tỷ lệ người dùng cần Realtime và số thao tác ghi trung bình mỗi phút.
- Kích thước dữ liệu production dự kiến và các báo cáo cần chạy đồng thời.

Không nên công bố RoomQC đã hỗ trợ 100.000 user cho tới khi vượt qua bài load
test staging tương đương và có số liệu p95/error rate chứng minh.
