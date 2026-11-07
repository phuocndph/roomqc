# RoomQC pilot VPS — trạng thái nghiệm thu trực tiếp 31/10/2026

## Đã xác minh

- `https://roomqc.com` đang phục vụ image frontend sạch `roomqc/web@sha256:ff5dfd25808cb0b3b25522b0b9e7c5479a9c1a70a9bf5a5ba6262e0a43e12c7e`.
- Bundle công khai chỉ chứa publishable/anon key; bước build mới từ chối object cấu hình, service-role JWT và chuỗi mật khẩu bị truyền nhầm vào biến public.
- Frontend cũ bị chặn sau chuyển phiên bản; có bản sao Nginx để rollback tại máy chủ.
- Directory, control API, frontend và host observer đều healthy, không restart tại thời điểm nghiệm thu.
- Host `contabo-pilot` được đọc qua SSH cưỡng chế chỉ số liệu; API quản trị trả CPU/RAM/ổ đĩa mới và đánh dấu `fresh=true`.
- Đăng nhập operator thật, API máy chủ, REST business bằng key mới đạt; key cũ bị từ chối.
- Realtime healthy sau khi đồng bộ lại credential; các dịch vụ business pilot healthy.
- POST `/api/control/signup-intents` trả `503 SIGNUP_CLOSED` đúng chính sách an toàn.

## Chưa mở trong pilot

Signup production vẫn đóng. Các hàng rào còn thiếu là health proof/managed probes, backup và thử phục hồi, setup worker cấp tenant, email delivery thật, gia hạn approval ký, và kiểm thử tải. Việc thanh toán hoặc tự tăng cấu hình VPS tại Contabo chưa nằm trong control plane.

Build local phải chạy với `ROOMQC_SKIP_MCP_SYNC=true` vì file MCP trong repository là file do sản phẩm quản lý. Kiểm tra production bằng cấu hình public VPS đạt `npm run verify:build`.

Biên nhận máy không chứa secret: `artifacts/roomqc-vps-pilot-live-2026-10-31.json`.
