# Cài backend qua SSH và nghiệm thu luồng khách hàng — 31/10/2026

Đã cài backend RoomQC bằng bộ triển khai thật qua SSH trên máy Linux thử riêng,
sau đó áp dụng 591 migration và chạy đạt 91/91 kiểm tra luồng khách hàng. Đây là
bằng chứng cài backend local và chức năng trên bản vừa cài; mục tiêu VPS/signup
tổng thể vẫn chưa hoàn tất. VPS Contabo không bị thay đổi, không tăng dung lượng,
không mở đăng ký production.

## Kết quả đã xác nhận

| Phần | Bằng chứng |
|---|---|
| Kết nối SSH | Khóa máy chủ được lấy độc lập; khóa sai bị từ chối, không tự chấp nhận máy lạ |
| Bộ cài | Chạy đủ stage, validate, start, health, commit bằng `releaseRemoteAdapter` của sản phẩm |
| Backend | 8 dịch vụ nền: PostgreSQL, Auth, REST, Realtime, Storage, imgproxy, Functions, API gateway; thêm 10 dịch vụ phục vụ kiểm thử handler |
| Image | Tất cả dịch vụ dùng tham chiếu bất biến; client đóng gói không có Docker socket |
| Cấu hình riêng | 14 env file bất biến, chỉ root đọc; giá trị được gửi qua stdin SSH, không nằm trong Compose hay biên nhận |
| Tệp cấu hình | Đóng gói từ nguồn riêng của lượt thử, chuyển qua SSH và kiểm SHA-256 từng tệp trước khi chạy |
| Quyền và tính toàn vẹn | 7 kiểm tra, gồm cài lại cùng nội dung, mode sai, hardlink, symlink, nội dung bị sửa và giá trị có ký tự đặc biệt |
| Database | Áp dụng đủ 591 migration; schema ổn định qua toàn bộ luồng khách hàng |
| Khách hàng | Hai chủ khách sạn đăng ký, xác minh OTP qua SMTP thử, cấp không gian riêng, tạo phòng, đăng nhập nhân viên mới |
| Cách ly | Chặn REST/RPC, tệp Storage và sự kiện Realtime giữa hai khách sạn; giữ nguyên dữ liệu sau yêu cầu trái quyền |
| Gửi lặp/mất phản hồi | Gửi lại sau mất phản hồi không tạo thêm doanh nghiệp, gói dùng thử hoặc tác động nghiệp vụ |
| Dọn môi trường | Kiểm độc lập container/network/volume còn 0, transport còn 0, thư mục cấu hình trên Linux đã xóa đúng phạm vi |
| Ứng dụng khác | Các container đang chạy trước lượt thử giữ nguyên thời điểm khởi động |

Lượt cuối: `e692dc4283c0`. Nguồn gồm 490 tệp được đối chiếu trước/sau và kiểm lại
với mã hiện tại. Biên nhận công khai không chứa tài khoản, OTP hoặc khóa dịch vụ:
[backend SSH + signup](../../../artifacts/roomqc-backend-ssh-and-signup-local-2026-10-31.json).

## Các lỗi đã xử lý

- Bộ cài trước đây không nhận cấu hình riêng của các dịch vụ nền. Đã thêm env
  file có tên theo nội dung, kiểm quyền/chủ sở hữu/hash trước các bước triển khai
  và trước khi rollback về bản cũ.
- Danh sách địa chỉ VPS bị ghi thành chuỗi có thể khớp IP theo một phần nội dung.
  Đã bắt buộc mảng chuỗi và so sánh đúng từng IP, trước khi đọc/gửi cấu hình riêng.
- Công cụ đóng gói tar trên Windows không mở được đường dẫn tuyệt đối có dấu.
  Đã dùng thư mục làm việc Unicode và đối số tương đối; lượt cuối đã chuyển và
  kiểm đủ tệp qua SSH thành công.

Đã đóng gói image `roomqc/deployment-executor:private-config-20261031`,
ID `sha256:8b8f175321db52eb7eba2f2b8f54722251610297d0b55e7c9eed7648d63bb6e5`.
Chưa thay image executor của hệ thống đang phục vụ. Kiểm CLI trong image thật,
không có mạng, đạt 4/4: đọc tệp riêng, không lộ giá trị, từ chối quyền tệp công
khai/symlink và inventory sai định dạng.
[Biên nhận CLI](../../../artifacts/roomqc-vps-config-packaged-local-2026-10-31.json).

## Hồi quy và rollback

- `npm run test:control`: 988 bài, **731 đạt, 0 lỗi, 257 bỏ qua** vì điều kiện
  kiểm thử riêng chưa bật. Không coi các bài bỏ qua là đã nghiệm thu.
- `node scripts/test-vps-release-docker-local.mjs --run`: **19 ca đạt** trên
  Docker/Linux thật. Bao gồm quyền env file sai chặn trước khi đổi container,
  nâng cấp lỗi trả lại đúng cấu hình riêng của bản trước và giữ dữ liệu volume.
- Bài backend SSH cuối thoát 0, nguồn/schema đã đối chiếu và dọn xong.

[Biên nhận rollback](../../../artifacts/roomqc-vps-release-recovery-docker-local-2026-10-31.json).
[Tổng hợp hồi quy](../../../artifacts/roomqc-private-configuration-regression-2026-10-31.json).

## Cách chạy lại

Chạy từ thư mục gốc của worktree integration, với Docker Desktop đang hoạt động:

```text
node scripts/test-control-backend-sandbox.mjs --run --diagnostic ssh-customer-journey
npm run test:control
node scripts/test-vps-release-docker-local.mjs --run
```

Bài SSH cần image mục tiêu Linux thử riêng được dựng từ
`deploy/executor/Dockerfile.ssh-test`, với tag
`roomqc/ssh-drill-target:local-20261031`. Không dùng image này trên VPS khách hàng.
Chạy riêng bài SSH khi không có bài Docker khác đang dọn tài nguyên để phép so
sánh container trước/sau có ý nghĩa. Mạng runtime nội bộ, không công khai cổng;
các bước dựng dependency trước runtime có truy cập registry chính thức.

## Phần chưa được chứng minh trong lượt này

1. Cùng backend đầy đủ được cài qua yêu cầu từ trang Hạ tầng, hàng đợi và executor.
   Bài này gọi adapter sản phẩm qua SSH; bài hàng đợi trước đó chỉ cài nginx.
2. Frontend, directory/control và các worker cùng được cài qua SSH như một bộ vận hành.
3. Điều kiện nhận khách/health/release approval trên directory production. Luồng
   91 kiểm tra vẫn dùng authority của fixture riêng, được ghi rõ trong biên nhận.
4. Cài trên VPS bên ngoài Docker Desktop, DNS/TLS, gửi email bên ngoài, backup
   ngoài máy, kiểm tải và pilot khách thật.
5. Thao tác nhận lời mời/nhập mật khẩu bằng trình duyệt trong lượt SSH này. Mã
   client gốc đã được biên dịch và chạy với Auth thật; không phải browser E2E.

Các phần trên vẫn nằm trong mục tiêu tổng thể. Không dùng kết quả local này để
mở nhận khách production hoặc bỏ ngưỡng ổ trống 15% trên VPS Contabo.
