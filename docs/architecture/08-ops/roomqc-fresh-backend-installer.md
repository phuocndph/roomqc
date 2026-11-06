# Cài backend mới, giữ đăng ký đóng

Bộ cài dành cho cụm mới có database riêng. Không tiếp nhận database RoomQC cũ,
không sửa migration history cũ và không chuyển frontend hoặc reverse proxy.
Việc cài xong backend chưa cấp quyền mở đăng ký production.

**Cập nhật 01/11/2026:** bundle mới dùng version 2, có overlay REST bất biến
chỉ công bố `roomqc_setup,roomqc_summary` sau khi migration hoàn tất. Cấu hình
khởi động chỉ dùng `public,graphql_public`. Không sửa hash/bundle version 1
đã triển khai để giả lập version 2; dùng công cụ đã ghim của release cũ cho
resource cũ, hoặc lập kế hoạch upgrade riêng. Bản vá operator của pilot hiện tại
không tự trở thành bằng chứng đã chạy toàn bộ CLI version 2 trên VPS.

## Tạo cấu hình và chuyển image

Chạy trong worktree `integration`, dùng đường dẫn tuyệt đối cho các đầu vào.
Lượt nguồn phải đã kết thúc và dọn xong, nguồn không đổi, đủ 93 kiểm tra hành
trình quản trị với gói 42 Edge Functions. Các image phải còn trên Docker local.
Đây là điều kiện tạo ứng viên cài mới đang đóng; không thay điều kiện full-run
của `build-roomqc-backend-image-packet.mjs` hoặc phê duyệt release production.

```text
node scripts/roomqc-backend-bundle.mjs --source-state ABSOLUTE_OWNERSHIP_JSON --control-image roomqc/control@sha256:VERIFIED_DIGEST --cluster-id CLUSTER_ID --release-id RELEASE_ID --public-url HTTPS_ORIGIN --listen-port LOOPBACK_PORT
node scripts/roomqc-backend-images.mjs --bundle ABSOLUTE_PRIVATE_BACKEND_JSON
node scripts/roomqc-backend-upload.mjs --bundle ABSOLUTE_PRIVATE_BACKEND_JSON --host APPROVED_IPV4 --mode plan
node scripts/roomqc-backend-upload.mjs --bundle ABSOLUTE_PRIVATE_BACKEND_JSON --host APPROVED_IPV4 --mode load
```

Bundle và operator logs chứa bí mật, chỉ để trong thư mục riêng được giới hạn
quyền. Không gửi chúng qua chat hoặc commit. Image chỉ chứa mã sản phẩm; archive
được kiểm từng manifest/config/layer, tên repository và platform linux/amd64.
Gói transport cài mới có loại riêng và 9 image (8 core + control), không được
trình bày là gói production đã qua full-run. Trên VPS, stream được kiểm SHA-256,
image identity và filesystem layers. Không giữ thêm một tar trên VPS.

Preflight tính cả blob nén, layer giải nén chưa có, 10% dự phòng layer và dữ liệu
runtime ban đầu; phải còn 15% dung lượng gốc. Không bypass khi thiếu dung lượng.

## Khởi tạo và kiểm tra

```text
node scripts/roomqc-backend-install.mjs --bundle ABSOLUTE_PRIVATE_BACKEND_JSON --host APPROVED_IPV4 --mode plan
node scripts/roomqc-backend-install.mjs --bundle ABSOLUTE_PRIVATE_BACKEND_JSON --host APPROVED_IPV4 --mode initialize
node scripts/roomqc-backend-install.mjs --bundle ABSOLUTE_PRIVATE_BACKEND_JSON --host APPROVED_IPV4 --mode verify
```

`initialize` từ chối root, network, volume hoặc container trùng tên. Cấu hình
nguyên bản lấy từ đúng upstream commit; không sao chép gateway/SMTP fixture từ
lượt kiểm thử. Backend chỉ công bố gateway ở loopback. Signup Auth bị khóa;
không có Resend key thì chưa gửi email ngoài. Không dùng xác minh email tự động.

CLI migration trong image control chạy bằng user không đặc quyền, filesystem
chỉ đọc, nhận DSN qua stdin và file tmpfs riêng, kết nối loopback trong cùng
network namespace với database. Ledger mới chỉ khởi tạo trên schema sản phẩm
rỗng; apply/resume phải khớp chính xác chuỗi migration. Kết quả cuối có receipt
đầy đủ, không chỉ lấy trạng thái container healthy làm bằng chứng đã áp schema.

Nếu mất kết nối, giữ nguyên bundle và chạy `--mode resume`; không tạo bundle
mới rồi tiếp nhận resource cũ. Root phải có đúng marker/hash; file hiện hữu phải
khớp nội dung và mode, file thiếu được tạo nguyên tử. Không ghi đè cấu hình đã
đổi hoặc tự xóa database sau lỗi. `verify` kiểm file, ownership, image, health,
receipt và yêu cầu `/auth/v1/signup` thực tế vẫn bị chặn.

Sau migration, bộ cài tạo `post-migration-rest.json` riêng, khớp hash trong bundle,
rồi recreate riêng REST với cả Compose gốc và overlay. `resume` tiếp tục dùng
overlay nếu đã được tạo; không hạ REST về cấu hình trước migration. `verify`
bắt buộc file overlay đúng nội dung/mode/ownership, container REST healthy và
schema allowlist runtime đúng. Không cấp thêm quyền database hoặc công bố
schema `private`, `auth`, `storage` hay schema quản trị.

Kiểm tra ngày 01/11: 15 kiểm tra bundle/installer và 14 kiểm tra backup đạt;
1 kiểm tra PostgreSQL/PostgREST thật đạt với image đã ghim, profile RPC trước/sau
migration, quyền chéo/anonymous bị chặn, REST được recreate riêng, resume giữ
container database và sentinel. Container/network thử đã dọn. Đây là kiểm thử
tích hợp có phạm vi, chưa phải full CLI version 2 hoặc browser signup trên VPS.
Biên nhận: [REST post-migration](../../../artifacts/roomqc-backend-post-migration-rest-native-2026-11-01.json).

Sau bước này vẫn cần hệ thống quản trị/worker, release authority thật, cấu hình
email, frontend dùng backend mới, reverse proxy/TLS, nghiệm thu browser signup,
backup/restore, tải và pilot trước khi mở cho khách.
