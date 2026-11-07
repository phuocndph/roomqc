# Checkpoint và phục hồi dữ liệu Contabo — 01/11/2026

Đã sao lưu hai database, Storage và cấu hình trong cùng khoảng dừng các dịch vụ
ghi dữ liệu; mã hóa ngoài VPS và phục hồi dữ liệu thành công trong Docker cô lập.
Đã ghi ba bản backup thành phần và kiểm bằng API quản trị thật. Signup vẫn đóng.
Đây chưa phải nghiệm thu phục hồi toàn bộ ứng dụng hoặc mở đăng ký production.

Biên nhận đã lọc: [checkpoint offline](../../../artifacts/roomqc-contabo-application-checkpoint-offline-2026-11-01.json).

## Bằng chứng thực tế

- Checkpoint `24dc36fb-5b67-4204-997d-51fed1536de8`, bắt đầu dừng ghi lúc
  `03:38:29Z`, chụp xong `03:38:38Z`, xác nhận dịch vụ chạy lại `03:41:40Z`.
  Mốc này lấy từ journal thật; khoảng bảo trì sau khi các writer đã dừng là
  191 giây, còn thời gian dừng từng nhóm trước đó không nằm trong con số này.
- 11 dịch vụ đã dừng theo phụ thuộc. Giữ database chạy; cron business đã tắt.
  Kiểm inventory trước/sau không đổi, không có client database ngoài danh sách
  cho phép. Đây là hàng rào vận hành; không chặn root ghi ngoài quy trình.
- Hai packet AES-256-GCM gồm 6 và 9 file, tổng 5.421.231 byte. Khóa giữ riêng
  trên máy operator, không đưa lên VPS hoặc artifact. Giải mã xác thực và đọc
  lại hash đều đạt. Máy operator chưa thay thế kho offsite có retention.
- Business PostgreSQL 17: 230 bảng/hash dữ liệu, 414 policy, 1.054 constraint,
  645 function, 183 trigger, 46 role và 37 membership khớp inventory nguồn.
- Directory PostgreSQL 16: 42 bảng/hash dữ liệu, 411 cột, 300 constraint,
  120 index, 33 function, 37 trigger, 39 role, 11 membership, 27 migration khớp.
- Đọc lại 1 file Storage/256 byte và 191 file cấu hình/275.866 byte đều khớp.
  Cấu hình có overlay DNS mới của management web. Không gồm reverse proxy
  `/etc/nginx` và chứng chỉ TLS của host; dựng lại ingress là bước riêng.
- Hai sandbox dùng mạng `none`, không host port, không truy cập VPS nguồn,
  không mount dữ liệu nguồn; container phục hồi đã dọn.
- Kiểm tra source: **41 Node + 4 Python đạt, không fail/skip**. Bao gồm kiểm
  packet hỏng/sai khóa, thay descriptor, sai checkpoint, xung đột lịch sử và
  trình tự restart. Kiểm orchestration Windows dùng shim `fcntl`, không thay
  bằng chứng POSIX lock đã chạy trên VPS.

## Lịch sử backup trên trang quản trị

`roomqc-checkpoint-history.mjs` chỉ nhận biên nhận restore/envelope được ghim
SHA-256 và tạo đúng ba scope `cluster`, `directory`, `objects`. Không tạo scope
`bundle`, không đổi admission policy. Đây là thao tác operator trên pilot,
không phải service tự động với quyền tối thiểu.

Transaction thật đã kiểm ROLLBACK trước khi ghi, commit ba hàng/ba audit event,
chạy lại không nhân bản và từ chối hash xung đột. Lần đầu dùng ID chứa `/` bị
API ẩn theo quy tắc public identifier. Đã đổi đúng ba ID sang dấu chấm trong
transaction có ba audit correction; giữ nguyên hash, proof và audit gốc.
Regression so trực tiếp với `backupView` của API để ngăn lặp lỗi.

API đăng nhập operator và `/api/control/admin/backups` đã trả đủ ba bản ghi.
`BACKUP_UNVERIFIED` vẫn còn vì chưa có bằng chứng phục hồi đầy đủ `bundle`.

## Lỗi restart đã xử lý

Nginx trong web giữ IP Docker cũ của gateway sau khi restart, gây 502 Auth/REST.
Đã kiểm `nginx -t` bằng đúng image web, tạo overlay tường minh dùng resolver
Docker `127.0.0.11 valid=5s` và biến upstream cho gateway/control. Gateway đổi
IP trong lần restart tiếp theo, request phục hồi mà không reload web thủ công.
Template `deploy/control/management-nginx.conf` cũng dùng resolver cho control.

Trên pilot, mọi lệnh dựng lại management web phải dùng **cả hai** file:

```sh
docker compose -p roomqc-management-contabo-pilot-mgmt \
  -f /opt/RoomQC/management/contabo-pilot-mgmt/output/management.compose.json \
  -f /opt/RoomQC/management/contabo-pilot-mgmt/operator/proxy-dns/compose.json \
  up -d --no-deps --no-build --pull never roomqc-web
```

Chạy base Compose đơn lẻ sẽ bỏ overlay DNS. Không sửa ngầm bundle/metadata
bất biến hoặc coi bản vá pilot là full-run của bộ cài release mới.

Lần restart lỗi làm refresh canary không rõ kết quả; credential bị đưa về
`needs_recovery` đúng thiết kế. Sau sửa ingress, operator đăng nhập đúng canary
để tạo session mới, cài bằng expected revision 5, lên revision 6 `ready`.
Không gán state thủ công hoặc tái dùng session có kết quả refresh không rõ.
Chưa dùng checkpoint này làm bằng chứng lần tự refresh kế tiếp đã thành công.

Đã chuyển hai bản cấu hình cũ `roomqc.com.before-pilot-api-20261031` và
`roomqc.com.before-clean-frontend-20261031` ra khỏi `sites-enabled` vào
`/etc/nginx/roomqc-history/20261101-1bac9b7d7e844009ae5981d27489cd65`.
Kiểm nội dung chỉ thuộc domain RoomQC, giữ hash file active, `nginx -t` đạt,
reload đạt, hết cảnh báo trùng server RoomQC; không xóa file hay sửa site khác.

## Chạy lại checkpoint có bảo trì

`scripts/roomqc-contabo-checkpoint.py` là công cụ operator chỉ dành cho pilot đã
duyệt; `--plan` đọc-only, `--collect` có downtime. Không lập cron công cụ này.
Nó cần component collector `roomqc-contabo-control-storage.py`, hai inventory
SQL đã đóng gói trên VPS, đúng image/container/project và signup/dispatch đóng.

Trình tự: worker/rotation/observer → ingress/control → backend; khởi động ngược
lại, chờ backend healthy rồi public Auth/control 200 rồi mới chạy worker.
Watchdog 4 phút và resume journal giúp chạy lại idempotent. Khi khôi phục cần
kiểm đúng ID/nhãn container; không dùng fallback `docker compose up` toàn host.

Lịch sử diễn tập giữ nguyên: lượt đầu chụp được nhưng lộ lỗi DNS; lượt thứ hai
exit 1 ở health deadline 75 giây, lần resume sau đạt. Không sửa hai biên nhận
đó thành pass. Lượt thứ ba tăng thời gian chờ lên 120 giây, exit 0 và kiểm
khỏe đầy đủ trước khi trả kết quả; packet được nghiệm thu trong tài liệu này.

## Các điều kiện còn lại

**Cập nhật sau mốc dưới:** Auth/REST/Storage/Functions/Realtime và API quản trị
đã chạy từ checkpoint với database/JWT/API key mới, kiểm phân quyền và cleanup
đạt. [Biên bản runtime](roomqc-checkpoint-core-runtime-2026-11-01.md) thay phần
chưa có bằng chứng dịch vụ lõi ở danh sách lịch sử dưới; worker/web/TLS/approval
mới và offsite schedule vẫn chưa được nghiệm thu.

Kiểm live `03:52:18Z`: 14 container đang chạy; 13 có Docker healthcheck đều
healthy, daemon rotation không khai báo Docker healthcheck. Năm probe đều true,
Auth/control/healthz đều 200. Latch cũ `BACKEND_UNREACHABLE` và
`METRICS_UNAVAILABLE` vẫn hiện trên admission. Disk còn 25.111 GB/102.888 GB
(khoảng 24,4%); chưa đạt điều kiện phục hồi >25% liên tục cùng các tài nguyên
khác trong 10 phút. Không reset latch hoặc hạ ngưỡng để làm xanh.

Trước khi mở signup còn cần:

1. Phục hồi cô lập cả Auth/API/worker/web, cấu hình ingress/TLS, cấp lại LOGIN,
   JWT/session và credential quyền hẹp; đối chiếu thu hồi/quyền tenant.
2. Review độc lập delta fingerprint target và ký release phù hợp. Hash target
   raw `ecdc246d4aa338b95e5a63f88cdf2922008114da25f2d112f7b9a83043213ada`
   khác source. Kết luận ban đầu gắn toàn bộ lệch hash cho CHECK chưa đủ: review
   đầy đủ sau đó xác định thêm 54 ordinal cột bị compact và hai biểu diễn ACL
   sequence. Xem [review fingerprint độc lập](roomqc-recovery-schema-review-2026-11-01.md).
   Không sao chép approval nguồn.
3. Backup có lịch, retention ngoài host, cảnh báo thất bại và key escrow độc lập.
4. Gia hạn approval/probe, giải quyết capacity và đủ cửa sổ recovery thực tế.
5. SMTP/email thật, browser signup E2E trên domain, load test và pilot khách sạn.

File `/root/backups/joliefam/joliefam.zip` đã không tồn tại khi kiểm. Dù người
dùng đã duyệt xóa đúng file đó, lượt này **không thực hiện xóa** và không đụng
các bản sao lưu Jolie’Fam khác.
