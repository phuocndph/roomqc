# Cấu hình riêng cho bản cài RoomQC

Mỗi dịch vụ nhận một env file riêng. Tệp có tên theo SHA-256 nội dung, được giữ
ngoài Compose, specification và lịch sử triển khai. Đổi cấu hình tạo tệp mới;
không ghi đè tệp của bản đang chạy hoặc bản cần dùng để rollback.

## Chuẩn bị và xem kế hoạch

Người vận hành lưu JSON các biến môi trường trong thư mục riêng được bảo vệ,
ngoài Git; các giá trị phải là chuỗi một dòng. Không đưa mật khẩu hoặc API key
vào đối số lệnh. Inventory do server giữ phải ghi đúng cluster và IP đã duyệt;
khóa SSH/known_hosts được chuẩn bị riêng như runbook triển khai.

Chạy tại thư mục gốc dự án:

```text
npm run vps:config -- --inventory-file ABSOLUTE_PRIVATE_INVENTORY --cluster-id CLUSTER_ID --input-file ABSOLUTE_PRIVATE_ENV_JSON --host APPROVED_IP --user root --identity-file ABSOLUTE_PRIVATE_KEY --mode plan
```

Plan chỉ đọc tệp và in descriptor/hash; không kết nối SSH. Linux từ chối tệp
riêng có quyền đọc công khai, symlink hoặc hardlink. Không gửi nội dung tệp vào
chat hay log để xử lý lỗi.

## Cài tệp riêng

Sau khi xem plan, dùng cùng đối số và đổi `--mode plan` thành `--mode execute`.
Lệnh kiểm tra đúng IP inventory, SSH host key, Docker và ổ trống trước khi gửi
nội dung qua stdin SSH. VPS không đủ ngưỡng 15% ổ trống bị chặn; không có tùy
chọn bỏ qua. Tệp đích bắt buộc root sở hữu, mode0600, không liên kết; các thư mục
cha không là symlink và không cho group/other ghi.

Descriptor trả về có dạng:

```json
{
  "path": "/opt/RoomQC/clusters/CLUSTER_ID/config/env/SHA256.env",
  "required": true,
  "format": "raw"
}
```

Đặt đúng descriptor thật vào mảng `env_file` của dịch vụ tương ứng rồi chuẩn bị
specification/bản cài theo runbook hàng đợi. Không chép giá trị trở lại
`environment`. Tệp được kiểm hash/quyền trước validate, start, health, commit;
rollback cũng kiểm lại tệp của bản trước. Chỉ xóa các cấu hình cũ sau khi đã hết
nhu cầu rollback theo chính sách vận hành, hiện chưa có lệnh tự dọn.

Lệnh này chỉ cài tệp riêng, không cài dịch vụ, không mở nhận khách, không thay
DNS/TLS và không thay thế bản sao lưu. Các tệp SQL/template/config khác vẫn phải
được chuẩn bị trong phạm vi config của đúng cụm trước khi triển khai.

[Nghiệm thu SSH/backend và giới hạn](roomqc-backend-ssh-and-signup-local-2026-10-31.md).
