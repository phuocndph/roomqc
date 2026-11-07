# RoomQC: đã triển khai giao diện và kiểm quản trị HTTPS trên VPS

Ngày 01/11/2026, bản sửa lối đăng nhập quản trị đã được triển khai tại
`https://roomqc.com`, thay bản web cũ. Nghiệm thu runtime hoàn thành lúc
06:55:44 UTC; kiểm trình duyệt hoàn thành lúc 06:58:47 UTC.
**Signup công khai vẫn đóng; toàn bộ mục tiêu VPS/signup chưa hoàn tất.**

## Kết quả đã xác minh

- Build mới dùng cấu hình public production của đúng VPS, directory bật,
  demo tắt, Node/Nginx ghim digest. Context chỉ gồm tệp được chọn, không lấy
  `.env` hoặc thư mục private. Quét 388 tài sản web không thấy JWT đặc quyền.
- Image đang phục vụ là
  `sha256:f76d4c0928cb8f204c398d128060562e802b0817c86a82a0a4a18d1c269a8167`.
  Đây là build riêng cho VPS, không phải image của diễn tập phục hồi.
- Approval production epoch 5 được ký bằng issuer hiện hành trên Windows.
  Chỉ `frontendArtifactDigest` thay đổi; artifact backend, migration set và
  schema expectation giữ nguyên. Khóa ký không chuyển lên VPS.
- Manifest nghiệp vụ cập nhật bằng compare-and-swap với digest/schema nguồn.
  Fingerprint schema trước và sau khớp; không chạy migration nghiệp vụ.
- Scoped credential của setup được gắn lại release, cấp và xác minh RPC thật.
  Setup worker và health worker ready. Rotation daemon đang chạy, restart count
  0, quan sát được bốn chu kỳ idle liên tiếp sau cập nhật.
- Năm probe Auth/REST/Storage/Realtime/Functions đều đạt trên mẫu mới sau
  triển khai. Không reset health latch hoặc hạ ngưỡng tài nguyên.
- Đối chiếu 19 container dự án khác giữ nguyên ID, thời điểm khởi động và
  restart count. Số tài khoản Auth, hồ sơ nghiệp vụ và khách sạn giữ nguyên.
- Kiểm 1.634 tệp sản phẩm trong source manifest vẫn khớp sau build. Không chạy
  lại bộ 39 Vitest + 6 Node từ biên bản phục hồi; đó là bằng chứng trước triển
  khai, không cộng thêm lượt test.

## Kiểm trình duyệt trên HTTPS thật

Đi từ liên kết “Quản trị hệ thống RoomQC” tại trang chọn doanh nghiệp tới
`/admin/login`, không bị ép chọn một khách sạn. Dùng tài khoản operator pilot
hiện có, không tạo tài khoản hoặc thay mật khẩu.

Sáu luồng đạt: đăng nhập, mở Hạ tầng bằng menu, xem Sao lưu, reload giữ phiên,
đăng xuất về đúng `/admin/login`, và truy cập trực tiếp trang quản trị khi đã
đăng xuất bị chặn. Console có **0 lỗi** trong tab kiểm thử.

Trang Sao lưu hiển thị ba biên nhận component đã kiểm: database cụm, tệp đính
kèm và danh bạ hệ thống. Các biên nhận này không được đổi thành chứng nhận
full bundle hoặc sao lưu theo lịch. Tab kiểm thử đã đóng sau logout; bản sao
credential tạm trên Windows đã xóa, credential gốc được giữ nguyên.

![Hạ tầng trên VPS thật](../../../artifacts/roomqc-vps-admin-https-2026-11-01.png)

## Sự cố triển khai và cách đối soát

Sau khi bind release mới và commit lệnh issue, publisher từ chối
`SETUP_PUBLICATION_OUTPUT_CONFLICT`: tệp đầu ra còn thuộc binding cũ. Không tạo
lệnh issue mới hoặc sửa receipt. Đã kiểm binding của đúng tệp cũ, giữ nguyên
byte tại thư mục operator private, rồi phát lại **chính lệnh issue ban đầu**.
Publisher xác nhận filePublished và nativeRpcVerified; các worker sau đó được
khởi động lại bằng cấu hình release mới.

Lần tiếp nối đầu tiên còn lỗi indentation trong script operator, trước khi
reseed probe hoặc restart dịch vụ. Đã sửa script tiếp nối và kiểm trạng thái
thật trước khi chạy lại; replay issue vẫn dùng khóa cũ. Các failure receipt
được giữ để đối soát, receipt thành công được ghi riêng.

Bản Compose gốc và install-plan lịch sử được giữ nguyên. Overlay vận hành
`operator/proxy-dns/compose.json` cập nhật image web và nhãn revision
`20261101-v5`; bản trước nằm trong snapshot riêng. Các lệnh khởi chạy management
phải dùng cả Compose gốc và overlay hiện hành. Không chạy lại tiện ích install
cũ như một thao tác nâng cấp hoặc tự chạy lại script deployment đã hoàn tất.

## Điều kiện mở khách vẫn còn

Ổ trống sau triển khai khoảng 22,06 GiB, **23,0%**, dưới điều kiện recovery
trên 25% liên tục 10 phút. Snapshot admission lúc nghiệm thu vẫn có manual
close, latch lỗi backend, window metrics và `BACKUP_UNVERIFIED`; năm probe đạt
không tự xóa các điều kiện này. POST signup đúng Origin tiếp tục trả
`503 SIGNUP_CLOSED`.

Còn phải xử lý capacity/recovery theo policy; backup mã hóa off-host theo
lịch, retention và key escrow độc lập; nghiệm thu full bundle/VPS thay thế;
email thật, public signup E2E, tải/soak và pilot. Browser HTTPS trên **VPS đang
phục vụ** đã đạt, chưa thay cho browser HTTPS của **target phục hồi độc lập**.
Approval epoch 5 vẫn có hạn dưới 24 giờ; chưa có gia hạn issuer liên tục.

[Biên nhận triển khai và trình duyệt](../../../artifacts/roomqc-vps-frontend-deployment-2026-11-01.json).
[Ảnh mục Sao lưu](../../../artifacts/roomqc-vps-backups-https-2026-11-01.png).
