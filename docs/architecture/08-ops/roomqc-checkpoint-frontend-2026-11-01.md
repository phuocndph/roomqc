# RoomQC: phục hồi giao diện và đăng nhập quản trị — 01/11/2026

**Cập nhật sau biên bản này:** đã build riêng bằng cấu hình production, triển
khai bản sửa lên VPS và kiểm quản trị qua HTTPS thật tại
`https://roomqc.com`. [Biên bản triển khai](roomqc-vps-frontend-deployment-2026-11-01.md).
Các kết quả và giới hạn của diễn tập phục hồi bên dưới giữ phạm vi lịch sử;
signup vẫn đóng và chưa có full-service recovery acceptance.

Diễn tập `4f438662c2f2` hoàn thành exit 0. Từ checkpoint `24dc36fb-5b67-4204-997d-51fed1536de8`, giao diện dùng khóa công khai mới đã đăng nhập được và đọc quản trị thật cùng core/setup/rotation/health/observer phục hồi. Đây là nghiệm thu cục bộ; **signup production vẫn đóng và chưa công bố full bundle verified**.

## Lỗi sản phẩm đã sửa trong nhánh thử nghiệm

Khi bật directory, `/auth/login` ngoài workspace chuyển sang `/start?mode=login`; người quản trị nền tảng không có lối đăng nhập không gắn khách sạn. Đã thêm `/admin/login`, liên kết “Quản trị hệ thống RoomQC” tại màn hình chọn doanh nghiệp, mặc định quay về `/super-admin` sau đăng nhập, và quay đúng lối quản trị sau đăng xuất. Guard vẫn chặn owner, hồ sơ bị khóa/ngừng hoạt động/xóa, sai người hoặc sai session. Không nới quyền tenant hoặc API.

Bản sửa chưa cập nhật lên VPS. Bản build thử nghiệm chứa khóa/origin riêng cho môi trường phục hồi, không được dùng trực tiếp cho production.

## Bằng chứng đạt

- **39 Vitest + 6 Node tests**, 0 fail/skip. Kiểm tra guard đăng xuất còn xác nhận điều hướng chỉ xảy ra khi sign-out đã hoàn tất.
- Build từ 2.046 tệp nguồn được chọn và recipe pin hai base image; 388 tài sản web. Quét tất cả JS/HTML/JSON, gồm docs-loader, không thấy key nguồn hoặc key riêng được kiểm tra.
- Image/digest giao diện: `sha256:507e67bee567b584004154bed6ce55006c75b607b29058f544b0aa1aae24fc24`. Local approval epoch 5 gắn digest mới trước khi cấp scoped credential, cùng schema target đã đối chiếu 6.928 parts. UPDATE manifest dùng điều kiện digest/schema nguồn, không dùng giá trị mới ở điều kiện so sánh.
- Trình duyệt đã quan sát đủ 6 luồng: vào bằng liên kết quản trị, đăng nhập, mở Hạ tầng, mở Sao lưu, reload giữ phiên, đăng xuất và truy cập trực tiếp admin khi chưa đăng nhập bị đưa về login. Sáu cờ nghiệm thu đều true; console có 0 lỗi. (Mở lối vào là bước trước sáu cờ.)
- HTTPS tại `https://127.0.0.1:18444` được kiểm với chứng thư chỉ định; chứng thư chưa tin cậy bị từ chối. Native negative `e10d05c03ae1` xác nhận thiếu API thì không phát tín hiệu browser ready; exit 0 và dọn sạch.
- Năm probe Auth/REST/Storage/Realtime/Functions vẫn đạt. Setup/rotation và observer cùng run đạt restart, cấp credential mới, overlap thật và dừng sạch. Observer vẫn đo container SSH thay thế, chưa có Docker daemon/VPS thay thế thật.
- Sau diễn tập đã dọn container, volume và network của lượt thành công và bốn lượt native lỗi nêu trong artifact. Image/build cache được giữ như đầu ra build. Tab thử nghiệm đã đóng; cổng 8082 và production không đổi.

Ảnh trước lỗi: [lối đăng nhập trước sửa](../../../artifacts/roomqc-recovery-admin-login-before-2026-11-01.png). Ảnh sau đăng nhập: [Hạ tầng bản phục hồi](../../../artifacts/roomqc-recovery-infrastructure-2026-11-01.png).

## Phạm vi và giới hạn

Browser dùng HTTP loopback `http://127.0.0.1:18443`; HTTPS được kiểm độc lập, **chưa phải browser E2E trên HTTPS tin cậy**. Windows từ chối thêm chứng thư tạm nên đã bỏ cách thay kho tin cậy, giữ xác thực TLS bằng CA chỉ định cho client kiểm thử. Core/directory ở mạng internal; ingress có bridge bổ sung, chỉ publish hai cổng trên 127.0.0.1. Không dùng production signer hoặc liên hệ VPS nguồn trong diễn tập.

Màn hình Sao lưu trong checkpoint hiển thị 0 bản ghi, không báo có full bundle. Các biên nhận component ghi sau thời điểm chụp checkpoint nguồn không tự xuất hiện trong snapshot cũ. Không lấy giao diện trống này làm bằng chứng mất byte backup, cũng không lấy các component làm full-service acceptance.

Đã sửa các lỗi của bộ diễn tập: thiếu shared contract trong gói nguồn; TLS seed sai UID; thư mục tạm Nginx trên filesystem chỉ đọc; port publish trên bridge internal không tới được từ Windows; health Auth thiếu apikey. Các lượt lỗi không có biên nhận thành công. Lượt `09c3455906d2` dừng sau khi trình duyệt chứng minh lỗi lối vào quản trị; ảnh trước sửa được giữ.

## VPS tại lần kiểm tra 2026-11-01T06:36:58.919619+00:00

Đúng `/root/backups/joliefam/joliefam.zip` được duyệt đã không còn, vì vậy không xóa tệp nào trong lượt này. Ổ còn 22.14 GiB (23.1%), dưới ngưỡng recovery 25%; health 200, POST signup đúng Origin trả 503 `SIGNUP_CLOSED`. Không xóa image/dữ liệu dự án khác hoặc đổi ngưỡng.

## Phần còn lại trước khi mở khách thật

1. Nghiệm thu recovery target với browser HTTPS tin cậy và VPS thay thế/capacity đầy đủ.
2. Backup mã hóa off-host theo lịch, retention và key escrow độc lập; full bundle acceptance.
3. Build/deploy bản sửa giao diện bằng cấu hình production, cập nhật release authority và credential binding tương ứng.
4. Capacity/latch recovery thật, email thật, public signup E2E, load/soak và pilot. Các thiếu sót khóa/quyền ngoài hệ thống tiếp tục được để riêng theo yêu cầu.

Biên nhận runtime riêng SHA-256: `3c7fc76ce95cbe5d0d8634216ee99f5568ac8d2c3b50a7d269dce0d15198740b`. [Artifact kiểm tra](../../../artifacts/roomqc-checkpoint-frontend-2026-11-01.json) ghi digest, scope, source bindings, snapshot VPS và các lượt lỗi. Chưa đóng mục tiêu toàn bộ VPS/signup.
