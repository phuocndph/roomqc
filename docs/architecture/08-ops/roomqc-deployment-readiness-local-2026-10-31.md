# Kiểm điều kiện triển khai và thử SSH local — 31/10/2026

Đã triển khai migration `0025-deployment-readiness.sql` vào directory local và
cập nhật frontend `localhost:8082`. Không SSH hoặc thay đổi VPS Contabo; không
mở signup. Các lượt test dùng database và project Docker riêng. Directory đang
phục vụ vẫn có 0 specification, 0 job, 0 run và 0 gate; không chèn kết quả giả.

## Điều kiện trước từng bước

Worker và lệnh vận hành trực tiếp đều kiểm lại directory chính trước stage,
validate, start, health và commit. Kết quả kiểm tra được lưu bất biến, kể cả khi
bị chặn. Trạng thái local ghi rõ `local_test`, không chứng nhận staging/production.

Staging chỉ cho rollout giữ nguyên cấu trúc dữ liệu khi:

- Specification còn hạn, gắn đúng run, cụm, máy, môi trường, release và Compose.
- Máy đang hoạt động, liên kết đúng và đã đóng nhận khách mới.
- Phê duyệt hiện hành đúng epoch/target/inventory/endpoint, chưa hết hạn hoặc bị
  thu hồi; khóa ký chưa bị rút.
- Kiểm tra cấu trúc dữ liệu có hiệu lực trong 5 phút, frontend sẵn sàng và hash
  cấu trúc hiện tại trùng bản được duyệt.
- Image chính và mọi service được ghim bằng digest; image chính có trong bộ
  service và digest backend/frontend khớp phê duyệt.
- Có hồ sơ bundle backup đã xác minh trong 24 giờ, thử restore trong 30 ngày
  và manifest hash hợp lệ.

Gate dùng cùng khóa điều phối với thao tác phê duyệt. Trigger kiểm lại dữ liệu
chính và bằng chứng mới, nên không thể đưa một kết quả ready cũ hoặc tự tạo vào
để vượt qua việc thu hồi. API chỉ đọc gate, không viết specification hoặc cập
nhật job. UI diễn giải lý do chặn bằng tiếng Việt.

Lệnh `vps:deploy --mode execute` cho staging phải có `--spec-id UUID` lấy từ
`vps:executor prepare`. Lệnh đối chiếu hash toàn bộ đầu vào riêng và endpoint
trước khi tạo run. Không có specification khớp thì dừng; không có đường CLI
bỏ qua gate của dashboard. Specification cũ thiếu binding mới không được dùng
cho staging. Không sửa migration 0024 đã áp dụng.

## Kiểm thử đã thực hiện

- Node tập trung: **30/30**; preflight và ghi nhận preflight: **5/5**.
- Postgres/HTTP biệt lập: **19/19**, gồm hai worker tranh việc, chống trùng, mất
  lease, rút phê duyệt, rút khóa thật qua command boundary, đổi endpoint/image,
  số đo quá cũ/tương lai, spec hết hạn, giả mạo gate và CLI qua cùng năm gate.
- Client/component: **90/90**; TypeScript và ESLint phần giao diện thay đổi đạt.
- Hồi quy control: **706 pass, 0 fail, 249 skip**. Lượt này chạy trước khi thêm
  ca DB rút khóa cuối cùng; ca đó có trong lượt Postgres/HTTP 19/19 nêu trên.
- Thử SSH thật: **1/1**, API → Postgres → packaged executor → SSH → Docker/Linux
  → nginx healthy → commit → biên nhận succeeded/deployed. Host key sai bị chặn
  trước lệnh; không hạ kiểm tra địa chỉ hoặc host key. Kết nối DB local trong
  client đi qua SSH tunnel, không nới kiểm tra TLS/loopback của runtime.
- Test SSH dùng network `internal`, khóa ngắn hạn trong container, địa chỉ chỉ
  định tuyến bên trong network test. Executor không có Docker socket. Target
  test có socket local, chỉ thao tác project mang nhãn riêng; các container có
  trước giữ nguyên ID/thời điểm khởi chạy. Container/network test đã dọn sạch.

Lượt SSH đầu đã hoàn thành giao dịch nhưng test đóng pool hai lần ở teardown.
Đã sửa teardown và chạy lại đạt; biên nhận cuối chỉ ứng với lượt sạch.

## Runtime và giới hạn

Web local: `roomqc/web:deployment-readiness-20261031`. Control ready báo schema
0025; health/readiness đạt; admin chưa đăng nhập nhận 401; signup vẫn đóng.
Giữ image rollback riêng cho web và control. Các dịch vụ khác không thay đổi.

Chưa có nghiệm thu browser có xác thực cho bản này: công cụ trình duyệt hiện
không đọc được phiên. Kiểm tra component và HTTP không được coi là browser E2E.

Gate backup dùng hồ sơ trong directory, chưa tự xác minh bản offsite. Gate
schema dùng quan sát gần nhất trong directory, không probe trực tiếp backend ở
mỗi phase và không chạy migration nghiệp vụ. Thử SSH dùng nginx, chưa phải
toàn stack RoomQC hoặc signup E2E. Production tiếp tục bị chặn.

Chưa nối executor vào ngân sách kết nối chung hoặc bộ cấp LOGIN theo replica;
packaged executor hiện có pool một kết nối và vẫn cần cấp tài khoản deployer
riêng theo runbook. Cần hoàn thiện phần đó trước khi chạy worker staging/production
thường trực. Không dùng tài khoản migration cho worker.

Biên nhận: [tổng hợp](../../../artifacts/roomqc-deployment-readiness-local-2026-10-31.json),
[SSH](../../../artifacts/roomqc-deployment-ssh-local-2026-10-31.json),
[web](../../../artifacts/roomqc-deployment-readiness-web-local-deployment-2026-10-31.json).
