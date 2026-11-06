# Khôi phục host observer và kiểm tra ghép worker — 01/11/2026

**Observer đã phục hồi native đạt trong cùng run với core/setup/rotation/health.
Chưa đạt khôi phục toàn hệ thống hoặc mở đăng ký production.**

Biên nhận: [host observer acceptance](../../../artifacts/roomqc-checkpoint-host-observer-2026-11-01.json).
Run `57ea07244c0a` hoàn tất lúc `2026-11-01T05:45:54.111Z`, exit 0.
SHA-256 biên nhận riêng:
`43f68733233912925fed58715dac3a6bcf13adfb85deadef91d8e0dd02a1fdf4`.
Checkpoint chung vẫn là `24dc36fb-5b67-4204-997d-51fed1536de8`.

## Đã làm và kiểm chứng

Thêm chế độ target `local` có hai opt-in: CLI `--allow-local-targets` và biến
`ROOMQC_HOST_OBSERVER_ALLOW_LOCAL_TARGETS=true`. Runtime staging/production và
NODE_ENV production từ chối cờ này. Validator mặc định tiếp tục từ chối target
local; SSH public-address/host-key và directory TLS verify-full giữ nguyên.

Image candidate observer được build và đối chiếu nguồn trước khi chạy:
`roomqc/host-observer@sha256:26f9786b47413a28b7bc5cccac286d64887fcc55c774106672cff47d74b922b8`.

| Hạng mục | Bằng chứng native |
| --- | --- |
| Database | Dùng chính directory khôi phục từ checkpoint chung; LOGIN observer được cấp lại mật khẩu và giữ quyền hẹp |
| TLS | CA/server certificate mới; bật SSL bằng reload, giữ dữ liệu tmpfs; kết nối observer có SSL trong pg_stat_ssl |
| SSH | Identity Ed25519 mới, host key mới được ghim, forced command chỉ đọc; không dùng khóa SSH nguồn để kết nối |
| Binding | Giữ host ID, chuyển đúng môi trường local; retire observation nguồn theo fingerprint đã kiểm và ghi sự kiện rebind |
| Số đo | Đọc CPU/RAM/disk thật của target SSH thay thế, không chép số đo Contabo từ snapshot |
| Sai host key | Observer không ready, không ghi đè mẫu cuối; sửa host key và restart nhận mẫu mới |
| Chạy liên tục | Timestamp tiếp tục tăng sau mẫu mới từ restart |
| Runtime | UID1000, rootfs/input volume chỉ đọc, cap-drop ALL, no-new-privileges, một pool max1, không publish cổng |
| Tiến trình đi cùng | Setup worker, rotation daemon và health worker vẫn đạt; Auth/REST/Storage/Realtime/Functions đều đạt sau restart health |
| Kết thúc | Observer và rotation dừng sạch exit0; container/network/volume của run đã kiểm dọn hết |

**10 unit tests đạt, 0 fail/skip.** Ngoài ra, chạy cùng image với cấu hình bảo vệ
production mặc định đạt **17 kiểm tra Docker/SSH/PostgreSQL TLS thật**, run
`14affb447f9c`. NODE_ENV production, resource environment staging, không bật cờ
local target. Kiểm cả database outage/recovery, sai host key, LOGIN thừa quyền,
shutdown và việc giữ nguyên container ngoài phạm vi test.

Kiểm component riêng trên directory checkpoint đạt ở run `1605b387f258` trước
khi chạy ghép toàn chuỗi. Các source hash và hash biên nhận đều nằm trong JSON.

Hai lỗi của bộ diễn tập đã được sửa, không công bố thành công cho lượt lỗi:

- `af418edfafac`: directory chiếm IP tĩnh của SSH target. Gán IP riêng cho hai
  container trong mạng internal.
- `70f653b4dced`: tệp trạng thái trên tmpfs chưa xuất hiện ngay sau restart.
  Coi trạng thái thiếu là chưa ready và đợi mẫu mới; không bỏ kiểm tra readiness.

Đã kiểm lại tài nguyên của cả hai lượt lỗi và hai lượt thành công đều hết.

## Giới hạn bằng chứng

Target SSH là **container thay thế cô lập**, không phải VPS Linux độc lập.
Target này không có Docker daemon; observer báo đúng Docker unavailable. Kết
quả không xác nhận capacity hoặc enrollment của một VPS thay thế thật. Health
worker đo Docker Desktop VM theo device number bằng quy trình độc lập đã có;
không đổi nhãn số đo SSH container thành số đo toàn VM.

Lượt này chỉ build/test candidate local, không thay image observer đang chạy
trên Contabo. Không liên hệ VPS nguồn trong hai diễn tập, không đổi admission
production, không tạo khách hàng hoặc gửi email. Local approval vẫn là proof
thành phần với frontend digest nguồn giữ nguyên.

`fullServiceRecoveryVerified`, `backupBundleVerified`, `productionSignupOpened`
đều vẫn false.

## Bước tiếp theo để khép recovery

1. Build frontend với public key phục hồi mới **trước** khi cấp approval cho
   target. Lấy digest từ image đã build/verify, truyền digest thật vào expected
   release; không giữ digest nguồn cho nghiệm thu giao diện mới.
2. Dùng một public origin HTTPS thống nhất qua core/Auth/control/setup/health.
   Các helper hiện còn ghim HTTP `127.0.0.1:18082`; cần truyền origin chung để
   TLS không làm sai Origin/redirect hoặc endpoint fingerprint.
3. Trong bản phục hồi sở hữu, cập nhật business release manifest với digest
   frontend mới bằng điều kiện so source digest, rồi cấp local approval và
   scoped/probe credentials gắn đúng expected target ngay từ đầu. Tránh đổi
   frontend digest sau khi daemon/health credentials đã được gắn release cũ.
4. Khôi phục TLS ingress, mở frontend phục hồi và kiểm browser login/admin với
   Auth thật. Giữ vòng đời môi trường đủ lâu để browser kiểm xong trước cleanup.
5. Sau đầy đủ recovery/target acceptance mới xét bundle verified. Phần tiếp
   theo của mục tiêu vẫn gồm backup tự động ngoài VPS, retention/key escrow,
   capacity/latch/authority live, email thật, signup E2E/load/soak/pilot. Các mục
   cần khóa hoặc quyền bên ngoài tiếp tục được tổng hợp riêng theo chỉ đạo trước.
