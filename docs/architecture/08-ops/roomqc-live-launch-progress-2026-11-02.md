# RoomQC: email, gia hạn VPS và nghiệm thu đăng ký — 02/11/2026

Đã xác minh DNS gửi email thật và gia hạn thành công bản phát hành pilot.
**Chưa hoàn thành ba phần launch; đăng ký công khai vẫn đóng.**
Biên nhận này cập nhật tiến độ, không thay kết quả demo local bằng production.

## Đã thực hiện và kiểm trực tiếp

| Phần | Kết quả thực tế |
| --- | --- |
| DNS Resend | Truy cập tài khoản đã đăng nhập, đọc đúng giá trị provider; thêm TXT DKIM `resend._domainkey`, TXT SPF `send`, MX `send` ưu tiên 10 tại cPanel AZDIGI của roomqc.com. TTL 300 giây. Authoritative DNS trả đủ ba bản ghi; Resend hiển thị **Verified** cho domain và cả ba bản ghi lúc khoảng 09:39 giờ Việt Nam |
| Gia hạn VPS | Phê duyệt epoch 5 → 6, cùng host/endpoint/bản phát hành, không đổi schema hoặc frontend. Hết hạn mới **03/11/2026 09:07:25 giờ Việt Nam** (`02:07:25.704Z`). Khóa ký giữ trên máy operator, không tải lên VPS |
| Dịch vụ sau gia hạn | Auth, REST, Storage, Realtime, Functions đạt trên mẫu mới; health worker và setup worker ready; dữ liệu định danh/số khách sạn và setup binding không đổi. 19 container dự án khác giữ nguyên ID, thời gian khởi động và restart count |
| Kiểm thử công cụ | 13/13 Node test đạt; Python compile đạt; chạy preflight kiểm chữ ký/target và gia hạn thật có receipt. Không chạy lại bộ cài hoặc deployment frontend cũ |
| Đăng ký công khai | POST cùng origin đến `/api/control/signup-intents` vẫn **503 `SIGNUP_CLOSED`**. Không mở admission hoặc bỏ xác nhận email |

Ảnh bằng chứng: [Resend Verified](../../../artifacts/roomqc-resend-domain-verified-2026-11-02.png).
Biên nhận: [gia hạn live](../../../artifacts/roomqc-pilot-release-renewal-live-2026-11-02.json),
[trạng thái launch live](../../../artifacts/roomqc-live-launch-status-2026-11-02.json).

Không sửa MX nhận thư hiện có của miền gốc hoặc các bản ghi A/CNAME web.
Chưa thêm DMARC tùy chọn hoặc thay chính sách nhận thư.

## Còn phải hoàn tất trước khi gửi thư và nghiệm thu production

1. **Thông tin gửi email:** VPS chưa có SMTP user/password và Resend API key;
   webhook secret cũng chưa có. Đã chuẩn bị form khóa `roomqc-vps-contabo-pilot`,
   **Sending access**, chỉ miền **roomqc.com**, chưa bấm tạo. Công cụ trình duyệt
   yêu cầu xác nhận ngay trước khi tạo credential mới; đang chờ người dùng duyệt.
   Cần địa chỉ nhận thư kiểm thử cụ thể trước khi gửi. Auth SMTP và API nghiệp vụ
   phải kiểm riêng; DNS Verified chưa chứng minh giao email tới hộp thư.
2. **Ổ đĩa:** mẫu gần 10:00 giờ Việt Nam còn khoảng **22,9%**. Thiếu khoảng
   **2,01 GiB** chỉ để vượt 25%, chưa tính khoảng dự phòng vận hành. Sau đó phải
   giữ tài nguyên khỏe liên tục 600 giây và xử lý latch theo quy trình. Không hạ
   ngưỡng, không mua thêm dung lượng hoặc xóa bản sao dự án khác. File Jolie’Fam
   từng được duyệt xóa không còn ở đúng đường dẫn; các bản khác chưa được duyệt.
3. **Sao lưu ngoài VPS:** Cloudflare R2 là lựa chọn phù hợp đã giải thích cho
   người dùng; chưa có bucket RoomQC hoặc quyền truy cập được xác nhận. Không
   tái sử dụng cấu hình R2 của ứng dụng khác. Còn cần bucket riêng, mã hóa và
   giữ khóa độc lập, lịch/retention, tải xuống/đọc hash và diễn tập khôi phục.
   Hiện chỉ có ba proof component; **không có full bundle verified**. Không dùng
   cron checkpoint dừng 11 writer để giả làm backup online.
4. **Issuer liên tục:** lần gia hạn này là thao tác operator có kiểm tra,
   **không phải dịch vụ gia hạn 24/7**. Cần nơi chạy issuer bền vững ngoài VPS,
   giới hạn đúng inventory/release, journal/receipt khi mất phản hồi và cảnh báo
   trước hạn. Không đưa khóa ký vào VPS hoặc kéo dài approval vượt policy 24 giờ.
5. **E2E roomqc.com:** sau khi đủ các điều kiện trên, kiểm đăng ký → thư xác
   nhận → workspace/khách sạn/trial → đăng nhập lại → phân quyền giữa tenant.
   Khi đó mới đối soát gate/latch và mở giới hạn để pilot. Chưa có bằng chứng
   E2E đăng ký thật trên domain trong lượt này.

## Công cụ gia hạn pilot

`scripts/roomqc-pilot-renewal.mjs` ký trên máy operator và gọi worker
`scripts/lib/roomqc-pilot-renewal.py` qua SSH đã ghim known_hosts. Chỉ hỗ trợ
đúng pilot hiện tại, không phải bộ quản lý mọi VPS. Dùng run directory mới mỗi
lần và đường dẫn private key hiện có; không nhập khóa qua command line.

Trình tự: `--prepare --run-dir ABS --key-file ABS`, `--preflight --run-dir ABS`,
rồi `--apply --run-dir ABS`. Thời hạn tối đa vẫn dưới 24 giờ. Công cụ dừng worker
trong thời gian thay authority/consumer, giữ đăng ký đóng; control có restart.
Không cần thay setup binding khi artifact/schema/endpoint không đổi.

Lượt đầu dừng ở lỗi mount tệp command vào thư mục read-only trước khi cài
authority. Sau sửa, installer từ chối permission 0644 trên approval do SCP;
đã sửa thành 0600, kiểm authority vẫn epoch 5 rồi tiếp tục **cùng command key**.
`--resume-uninstalled` chỉ cho trạng thái `workers_stopped`, authority cũ còn
nguyên và không có authority receipt. Nếu đã cài authority hoặc mất kết quả,
phải tra receipt/reconcile tiến tới; không phát lệnh mới hoặc rollback ngầm.
Lượt hoàn tất có receipt epoch 6 lúc `02:37:22Z`; giữ nguyên chứng cứ lỗi trước.

Không lập lịch tự động công cụ này từ máy Windows rồi công bố là issuer luôn
sẵn sàng. Máy operator có thể tắt/ngủ và phê duyệt ngày mai vẫn sẽ hết hạn.
