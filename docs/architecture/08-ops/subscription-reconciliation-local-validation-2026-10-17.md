# RoomQC — tra cứu đối soát thuê bao, 17/10/2026

Đã triển khai phần **chỉ đọc trên local** tiếp nối Đợt 2. Không bật thu tiền
thật, tự xác nhận đơn cũ, sửa chứng từ, đổi gói hoặc xóa dữ liệu khách hàng.

## Cách sử dụng

Trong cổng quản trị nền tảng: **Khách hàng → menu thao tác của khách hàng →
Xem hóa đơn → Đối soát** (`/super-admin/tenants`). Đây là tab mặc định khi khởi tạo cửa sổ;
vẫn có thể mở lại từ thanh tab. Không thêm menu phụ hoặc giấu tab cũ.

1. Chọn Tất cả / Cần kiểm tra / Đơn cũ chưa xác thực / Chờ quá 24 giờ.
2. Ghi lại ID giao dịch và ID/số hóa đơn để tra chứng từ gốc. Số tiền đang
   hiển thị là số đã ghi trong DB, **không phải giá đã được chứng nhận**.
3. Các nhãn là dấu hiệu cần kiểm tra, không phải kết luận khách đã trả tiền
   hoặc có gian lận. Khoản thanh toán chia nhỏ có thể khác tổng hóa đơn;
   không tự hợp nhất hoặc sửa số tiền chỉ để làm hết cảnh báo.
4. Tải lại từ đầu sau khi có xử lý được phê duyệt ở một quy trình khác.
   Không có nút settle, hủy, cấp gói, QR hoặc yêu cầu chuyển khoản ở tab này.

Không dùng `admin_manage_tenant(change_plan)` để làm biến mất đơn cần đối
soát: điều chỉnh gói và đối soát chứng từ là hai việc khác nhau.

## Phạm vi và quyền

- Migration `20261017065205_subscription_reconciliation_readonly.sql` thêm
  RPC `admin_subscription_reconciliation` và hai index cho tenant/cursor,
  invoice/status. Không nới quyền ghi browser hoặc sửa RLS hiện hữu.
- Definer chỉ dùng để support đọc qua các tenant: trước mọi kiểm tra tham
  số/dữ liệu phải qua `platform_support_actor`, role nền tảng trong DB,
  profile active/không khóa, Auth đã xác thực email/không bị ban và session
  còn tồn tại/chưa hết hạn. Anon, owner/staff và service key đứng riêng bị chặn.
- Kết quả luôn thuộc tenant yêu cầu; khi phát hiện invoice khác tenant chỉ
  trả dấu hiệu và ID liên kết, không chiếu nội dung/số/trạng thái invoice đó.
  Không trả metadata, ghi chú tự do, thông tin ngân hàng hay payload provider.
- Chỉ đọc đơn pending và completed có dấu hiệu lệch: nháp không payable,
  giá legacy chưa xác thực, tuổi pending >24h, thiếu hóa đơn/thời điểm tạo,
  liên kết khác tenant, parent đã paid/paid_at/có completed sibling, parent
  đã hủy, completed nhưng invoice chưa paid, nháp completed, lệch số tiền,
  số tiền/currency bất thường và nhiều pending chung hóa đơn.
- Nháp mới bình thường không nằm trong bộ lọc Cần kiểm tra. Mốc 24h không
  phải hạn bảo đảm giá hoặc hạn thanh toán thương mại. Timestamp thiếu dùng
  epoch cho cursor nhưng giao diện ghi rõ thiếu thời điểm, không giả ngày tạo.
- Server lọc và phân trang keyset `(created_at,id)`, 25 dòng UI, tối đa 100
  dòng/RPC; kiểm tra đủ cả hai trường cursor. Không dùng OFFSET hoặc tải toàn
  bộ hàng đợi để lọc phía trình duyệt. Không khẳng định O(1) cho phép tính
  dấu hiệu: DB vẫn cần xét bản ghi phù hợp của tenant và sibling liên quan.
- Giao diện không giữ dòng của tenant trước, ẩn dữ liệu khi refetch/lỗi,
  có lỗi khác biệt với kết quả rỗng. Poll 30 giây khi tab đang hoạt động;
  không cam kết thu hồi dữ liệu đã hiển thị tức thời khi offline/quyền vừa đổi.
- Các query lịch sử cũ không chạy khi dialog đóng hoặc tab không dùng tới.
  Đã sửa CI TypeScript dùng `tsconfig.app.json`; root config có `files: []`
  không đủ để chứng minh mã ứng dụng đã được type-check.

## Kiểm chứng

- `npm run test:subscription-reconciliation:local`: **48 kiểm tra đạt** qua
  Auth thật và REST/RPC local, gồm quyền/session/ban, bộ lọc, cursor trùng
  timestamp, thiếu timestamp, che dữ liệu invoice khác tenant, tham số lỗi,
  và đối chiếu toàn bộ tenant/payment/invoice trước-sau không thay đổi.
- **22 test mới**: đọc response fail-closed, phân trang/bộ lọc/đổi tenant,
  refresh/lỗi quyền, thiếu session, điểm vào tab và không query lịch sử dư.
- Vitest toàn bộ: **628 đạt, 16 skip** trong 2 file integration; không tính
  các ca skip là đạt. Security advisors warn không vấn đề; DB lint
  public/private không lỗi. Migration đã đối chiếu lịch sử local.
- Hồi quy checkout/expiry/cancellation **96 đạt**, quyền tenant **56 đạt**.
  TypeScript `npx tsc --noEmit -p tsconfig.app.json` đạt; ESLint phần sửa không
  error, còn 3 cảnh báo `any` ở mã dialog lịch sử cũ; script syntax đạt.
- Docker Node22 build, verify:build và verify:container đạt. Đã cập nhật
  riêng RoomQC tại `http://127.0.0.1:8082`, container running/healthy. Bundle
  vendor vẫn có cảnh báo lớn hiện hữu (~14,16 MB minified / 4,72 MB gzip);
  chưa giải quyết bằng đợt đối soát này. Không restart các dịch vụ khác.
- Fixture sử dụng email `example.invalid`, kiểm tra worker/Auth chỉ gửi
  Mailpit loopback; dọn tenant/tài khoản/mail theo ID/email đã tạo. Không reset
  DB, chạy global expiry, gửi Internet hoặc tác động CRM.

## Giới hạn còn lại

Đây **chưa phải luồng xử lý hồ sơ đối soát có audit**: chưa nhận/gắn chứng từ,
phân công người xử lý, ghi quyết định hoặc settlement. Chưa có hàng đợi toàn
nền tảng, job monitor, thống kê đầy đủ, phát hiện invoice không có payment,
toàn bộ sai lệch refunded/failed/expired hoặc đối chiếu ngân hàng thật.

Ba tab lịch sử cũ vẫn có query chưa phân trang/tổng hợp toàn bộ ở server và
một số thao tác placeholder; không coi chúng đã được nghiệm thu ở đợt này.
Chưa browser E2E, staging, tải lớn hoặc mở signup công khai. Những mục cần
khóa/quyền/chính sách vẫn ở danh sách deferred, không được mặc nhiên bật.

**Tiếp theo:** quy trình hồ sơ đối soát có reason/audit/idempotency nhưng
không tự cấp gói; monitor lịch expiry/backlog local; sau đó luồng payable
server theo chính sách billing được duyệt. Không bật lại settlement legacy.
