# RoomQC — các mục để làm sau khi có khóa/quyền hoặc quyết định sản phẩm

Cập nhật 17/10/2026 (Asia/Bangkok). Theo yêu cầu: tiếp tục việc có thể làm
local, không dừng để xin mã khóa/cấp quyền. **Danh sách này không có nghĩa
production đã sẵn sàng. Không gửi bí mật vào chat hoặc commit vào Git.**

## Cần tài khoản, khóa hoặc quyền bên ngoài — chưa thực hiện

| Mục | Cần chuẩn bị sau | Kiểm chứng trước khi bật |
|---|---|---|
| VPS/staging | Xác định máy/IP, quyền triển khai qua SSH hoặc CI, thư mục/volume, tài nguyên và firewall | TLS/reverse proxy, DB directory riêng bền vững, control health, backup; không dùng cổng CRM 8090 |
| Domain roomqc.com | Quyền DNS, origin staging/chính thức và phương thức cấp chứng chỉ | Callback Auth/reset/invitation, CSP/allowlist và link workspace đúng origin |
| Resend/email thật | Tài khoản và trạng thái miền đã verify; API key, webhook signing secret; SMTP Auth cấu hình riêng nếu dùng | SPF/DKIM/DMARC theo cấu hình provider, nhận Gmail/Outlook, bounce/complaint, retry không gửi trùng; Mailpit không chứng minh giao thư Internet |
| SePay/thanh toán thật | Tài khoản nhà cung cấp, tài khoản ngân hàng nhận tiền, API token/webhook secret, sandbox/test arrangement | Đối soát số tiền/currency/tenant/invoice, webhook+sync/replay, tiền đến muộn; chỉ bật sau khi đóng đường giá do browser gửi |
| Scheduler/monitor production | Quyền tạo lịch cron, lưu secret server, kênh nhận cảnh báo và người trực | Chạy job có xác thực, quan sát lần thành công cuối/lỗi/busy/backlog, alert thử; có code không đồng nghĩa lịch đang chạy |
| Backup ngoài máy | Chọn nơi lưu, quyền bucket/kho lưu và khóa mã hóa/phục hồi trong secret store | Backup directory+DB/Auth+Storage, restore độc lập; đo RPO/RTO, không chỉ kiểm tra file backup tồn tại |
| Pilot nhiều cụm | Máy staging thứ hai hoặc môi trường tương đương và quyền cấu hình registry/proxy | Binding/routing, cô lập tenant, retry/mất cụm, draining và restore; không tự đổi route khách cũ |

Không tự tạo tài khoản dịch vụ, thuê VPS, cập nhật DNS, gửi email Internet,
thực hiện giao dịch ngân hàng hay nới quyền để vượt thiếu cấu hình. Khi tới
lượt cấu hình, người quản trị nhập bí mật trực tiếp vào secret store/server;
báo cáo chỉ ghi tên biến, trạng thái kiểm tra và request ID đã loại bí mật.

## Cần chủ sản phẩm/pháp lý quyết định — không tự đoán

1. Đổi số phòng trong kỳ đã trả tiền: áp dụng ngay hay kỳ kế tiếp, tính bù/trừ
   ra sao; xử lý phòng thực tế vượt gói. Đơn nháp hiện chặn thay đổi capacity
   trên nhánh gia hạn khi kỳ đang active; mua thêm dùng nhánh add_rooms riêng.
2. Chính sách quote được chấp nhận để thanh toán: thời hạn giá, khóa giá khi
   đã ra invoice, múi giờ ngày bắt đầu/kết thúc, tiền đến muộn, hủy/hoàn tiền.
   Cửa sổ 15 phút hiện chỉ cho **nháp kỹ thuật không được thanh toán**, không
   phải cam kết thương mại. Expiry pending giữ quy tắc 24h cũ, chưa tự đổi.
3. Hủy thuê bao: ngày hiệu lực, quyền xuất dữ liệu/read-only, thời hạn giữ/xóa,
   cơ chế phục hồi và nghĩa vụ lưu chứng từ. Không triển khai xóa dữ liệu thật
   khi chưa duyệt thời hạn/quy trình.
4. Giấy tờ khách: policy hiện tenant-wide, nhân viên cùng tenant có thể đọc;
   cần duyệt giới hạn theo hotel/vị trí trước dùng giấy tờ thật.

## Không cần khóa nhưng còn việc kỹ thuật — tiếp tục các đợt sau

- Hoàn thiện checkout server: draft → invoice payable có bank/
  reference server → một settlement từ snapshot và đối soát đơn cũ có audit.
  UI quote/draft và đóng legacy invoice/payment INSERT đã làm trên local;
  pending legacy hiện chặn xác nhận, không tự chuyển đổi hay xóa. Đây là công việc
  kỹ thuật còn lại, **không được đổ hết cho thiếu API key**.
- Luồng UI báo giá/nháp đã nối vào gia hạn/mua thêm, nháp hiển thị để xem/hủy.
  Chưa có luồng payable thật; không công bố đã hoàn tất checkout thanh toán.
- Hết hạn trial/active → grace/suspended/read-only và khôi phục có audit/job
  monitor; phiên bản này chỉ sửa expiry **payment pending**, không phải job
  vòng đời toàn bộ thuê bao.
- Lịch sử đã thêm expired/refunded; dialog dùng bank nền tảng và dữ liệu query
  mới. Cần nghiệm thu browser E2E sau khi có payable path/provider thật.
- Chống trùng áp dụng đường draft server; browser không còn tạo/sửa đơn legacy.
  Không tự hợp nhất các chứng từ cũ. Cần luồng đối soát ngoại lệ riêng.
- Đã có tab tra cứu Đối soát chỉ đọc theo từng tenant, lọc/phân trang server,
  kiểm tra phiên quản trị còn hiệu lực; 48 integration + 22 test mới đạt.
  Chưa có ghi quyết định/đính chứng từ/phân công/audit xử lý hoặc giải phóng
  đơn cũ. Xem `subscription-reconciliation-local-validation-2026-10-17.md`.
- Browser E2E staging; tải thử và cảnh báo/backup restore; phân trang console
  và 134 cảnh báo performance multiple_permissive_policies ở các bảng cũ.

## Thứ tự nối lại sau khi có điều kiện

Hoàn thiện checkout/server và quyết định billing → cấu hình staging/TLS/email
→ chạy nghiệm thu signup/nhân viên/thanh toán/expiry → backup restore/monitor
→ pilot nội bộ có kiểm soát. Không mở signup công khai hoặc thu tiền thật
chỉ dựa trên unit test/API local.
