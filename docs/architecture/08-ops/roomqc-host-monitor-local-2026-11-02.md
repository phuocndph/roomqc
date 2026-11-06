# Khôi phục cập nhật số đo VPS trên Windows local

Ngày: 02/11/2026. Phạm vi: trang quản trị local tại cổng 8082 và bộ giám sát
SSH chỉ đọc đã được cấu hình. Không triển khai dịch vụ mới lên VPS.

## Nguyên nhân và cách sử dụng

Nút tải lại trước đây chỉ đọc lại số đo đã lưu trong directory. Tiến trình
observer local đã dừng nên số đo vẫn ở ngày 31/10; tải lại trang không tạo mẫu mới.

- **Tải lại danh sách** đọc lại danh sách và số đo đã lưu.
- **Kiểm tra số đo mới** giữ thẻ VPS hiển thị và kiểm tra mỗi 5 giây, tối đa
  90 giây, để chờ lượt lấy mẫu tiếp theo. Nút này không chạy SSH trực tiếp.
- Chỉ báo thành công khi thời điểm đo tăng và mẫu mới còn hạn. Khi không có
  mẫu mới hoặc API lỗi, giao diện hiển thị lỗi tương ứng, không báo thành công giả.
- Observer lấy mẫu khoảng 60 giây/lượt cộng thời gian SSH. Trang tự tải lại
  danh sách mỗi 60 giây khi đang hiển thị.

## Tự chạy lại trên máy Windows này

Scheduled Task **RoomQC Local VPS Observer** chạy khi người dùng hiện tại
đăng nhập Windows, với quyền thông thường và cửa sổ ẩn. Task gọi
`scripts/start-host-observer-local.ps1`; script dùng mutex tránh chạy trùng
và khởi động lại observer sau 30 giây nếu tiến trình con dừng.

Script dùng cấu hình hiện có dưới `.local/control`, không sinh thêm khóa
hoặc đổi đích SSH. Cấu hình riêng và thông tin đăng nhập không đưa vào Git.
Giữ nguyên BatchMode, kiểm tra host key nghiêm ngặt và login database riêng
của observer. Cầu nối database local vẫn kiểm nhãn Docker và signup phải tắt.

Kiểm tra trạng thái mà không in cấu hình riêng:

```powershell
Get-ScheduledTask -TaskName 'RoomQC Local VPS Observer' | Select-Object TaskName,State
Get-Content .local/control/host-observer-status.local.json
```

Task cần ở trạng thái `Running`; `ok` cần là `true`, `failed` bằng 0 và
`checkedAt` tiếp tục tăng. Nếu Docker chưa sẵn sàng sau khi đăng nhập, script
sẽ thử lại. Không tự bỏ xác minh SSH, nới quyền database hoặc mở signup để sửa lỗi.

Máy tắt, ngủ hoặc chưa đăng nhập thì không bảo đảm lấy mẫu. Khi vận hành thật,
chuyển observer sang máy quản trị luôn hoạt động theo
[runbook Linux](roomqc-host-observer-service.md).

## Bản frontend local

Image mới: `roomqc/web:host-observer-feedback-20261102`. Chỉ tạo lại service
frontend `roomqc`, giữ nguyên control API và directory. Image trước vẫn còn:
`roomqc/web:customer-access-20261031`.

Overlay `.local/host-observer-feedback-web.compose.json` chọn image mới và
bật build arg `ROOMQC_SKIP_MCP_SYNC=true` đã có trong Dockerfile, để bảo toàn
nguồn MCP đang chỉnh sửa. Muốn quay lại image trước, dùng bộ compose local
cũ với `.local/customer-access-web.compose.json`, bỏ overlay mới và chạy
`up -d --no-deps --no-build roomqc`.

## Xác minh

- 78 kiểm thử frontend/client và 13 kiểm thử host monitor đạt.
- TypeScript ứng dụng, ESLint phần thay đổi, PowerShell parser và build đạt.
- Frontend healthy, `/healthz` trả 200; API hosts vẫn trả 401 khi chưa xác thực.
- Kiểm tra bằng phiên Super Admin thật trên trình duyệt: nút chuyển sang chờ
  và giữ lại thẻ tài nguyên trong lúc tải nền. Sau lượt đo tự động, thời điểm
  đo tăng từ 23:41:37 lên 23:42:41 ngày 02/11/2026; giao diện báo nhận mẫu mới
  và cập nhật CPU. Không ghi nhận lỗi console trong lượt kiểm tra.
- Ảnh xác nhận: `artifacts/host-observer-feedback-20261102.png`.

Các kết quả này xác nhận bản local; không thay nghiệm thu uptime, backup,
khả năng nhận khách hoặc triển khai production.
