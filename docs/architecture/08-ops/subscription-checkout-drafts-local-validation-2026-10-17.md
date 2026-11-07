# RoomQC — Đợt 2b1 local: đơn nháp nguyên tử và expiry payment an toàn

**Cập nhật sau review:** xem
[đợt sửa checkout](subscription-checkout-review-fixes-2026-10-17.md).
UI đã dùng quote/nháp server; quyền ghi tiền trực tiếp đã thu hồi trên local,
pending legacy bị giữ để đối soát; QR/bank selector và cancellation đã sửa.
Nội dung bên dưới là biên bản đợt 2b1 trước lần sửa này, không phải trạng thái
mới nhất. Thanh toán thật vẫn chưa bật.

Ngày 17/10/2026. **Hoàn thành phạm vi mô tả bên dưới; chưa hoàn tất Đợt 2,
chưa chuyển checkout/SePay thật, chưa nghiệm thu staging/browser E2E.**

## Đã triển khai

### Đơn nháp có invoice + payment + quote binding trong cùng transaction

Migration `20261017061421_subscription_checkout_drafts.sql`:

- `create_subscription_checkout_draft(p_quote_id,p_request_id)` chỉ nhận hai ID;
  tenant/owner suy ra server, kiểm tra lại hồ sơ/role/session như quote RPC.
- Invoice `draft`, payment `pending` nhưng **không có** payment_method, mã
  chuyển khoản/ngân hàng hoặc gateway ID; metadata type=`quote_draft` bị
  settlement validator hiện tại từ chối. Cả response và quote giữ
  checkout_enabled=false; response có non_payable=true. Không kích hoạt gói.
- Tiền, chiết khấu, kỳ dự kiến, plan và actor lấy từ snapshot private. Invoice
  có subscription_quote_id; browser không sửa/mark-paid/detach/delete bản
  invoice có binding hoặc gắn binding vào invoice tự tạo qua REST.
- Khóa tenant, unique tenant/request và quote; 20 retry tạo đúng một invoice,
  một payment, một binding. Hai quote từ hai tab cạnh tranh chỉ một pending
  draft được commit. Đơn sent/overdue hoặc payment pending legacy cũng chặn
  đường draft. Legacy INSERT không khóa tenant nên đây **chưa là** cam kết
  chống trùng mọi đường cũ.
- Snapshot quá 15 phút không tạo nháp mới; giá/model/cap/min-duration hoặc
  trạng thái/registered_rooms/expiry đổi thì yêu cầu quote mới, không đổi giá
  âm thầm. Room rows được đếm lại. 15 phút là freshness kỹ thuật **chỉ cho
  nháp**, không tạo chính sách thanh toán hay khóa giá thương mại.
- Gia hạn đang active nhưng đổi tổng số phòng được chặn chờ quyết định thời
  điểm áp dụng quyền. Add_rooms vẫn tạo nháp theo giá/ngày server. Read-only
  recovery chưa được triển khai, draft không tạm nới quyền hoặc mở khóa tenant.
- `get_subscription_checkout_draft(p_request_id)` giúp phục hồi sau mất phản
  hồi; retry cùng ID trả trạng thái hiện tại kể cả đã hủy/hết hạn, không tạo
  lại. Cancellation giữ luồng legacy, riêng invoice linked quote yêu cầu
  owner/session còn hiệu lực. Người bị khóa/bỏ role không dùng cancellation
  để vượt kiểm tra draft.

Không có UI tự tạo nháp, không có thanh toán thật, không cắt quyền legacy
invoice/payment để tránh làm hỏng luồng cũ khi chưa cutover hoàn chỉnh. Không
gửi email order tự động; invoice này không phải chứng từ thuế/hóa đơn phát hành.
Ngày due_date kỹ thuật giữ +7 ngày như invoice cũ, chưa phải deadline payable.

### Sửa lỗi expiry payment pending

Migration `20261017061902_atomic_pending_subscription_expiry.sql` và Edge
`expire-pending-payments`:

- Trước đây worker đọc pending, rồi UPDATE theo ID không kiểm tra lại status,
  có thể ghi đè completed khi confirmation chạy xen kẽ. Invoice UPDATE dùng
  status='pending' không thuộc enum invoice, và chạy riêng transaction.
- Nay worker gọi duy nhất RPC `expire_pending_subscription_payments`:
  service-only, batch default500/max1000, DB cutoff 24h giữ hành vi cũ,
  payment FOR UPDATE SKIP LOCKED, cập nhật invoice cùng transaction.
- Global advisory try-lock tránh hai sweep expiry giành nhiều shared legacy
  invoice; busy trả count0, không đợi vô hạn. Payment đang confirmation khóa
  được bỏ qua rồi kiểm tra lại ở sweep sau, không overwrite completed.
- Chỉ hủy invoice draft/sent/overdue chưa paid; không hủy invoice dùng chung
  nếu còn payment pending mới hơn. Parent khác tenant/paid/bất nhất được bỏ
  khỏi queue để đối soát, không sửa chứng từ. Chưa có dashboard/cảnh báo cho
  các anomaly bị loại khỏi queue; skipped_count chỉ đếm thay đổi parent phát
  hiện sau khi khóa, **không phải tổng số anomaly trong database**.
- Có index partial theo created_at/id cho pending. Optional p_tenant_id chỉ
  scope một tenant, giúp integration test không sweep dữ liệu có sẵn. Endpoint
  Edge không nhận tenant/cutoff từ request; truyền limit500 cố định.
- Worker transport kiểm tra shape/count, trả lỗi nếu RPC lỗi thay vì báo
  thành công một nửa. CronAuth hiện hữu giữ nguyên; không cài schedule, tạo
  secret hoặc chạy sweep toàn DB có sẵn trong lượt này.

Đây là expiry **giao dịch pending**, không phải vòng đời trial/active/grace/
suspended của thuê bao. Việc lập lịch và giám sát còn phải làm sau.

### Guard QR phía frontend

SubscriptionPaymentPage và ViewPaymentQRDialog không hiển thị QR cho draft,
expired/refunded/unknown hoặc thiếu payment_method/reference/amount hợp lệ,
invoice đã cancelled/paid. Draft mở bằng URL trực tiếp được giải thích rõ
"chưa được thanh toán". QR legacy pending hợp lệ giữ đường hiện hữu.
Guard hiển thị không thay thế xác minh settlement phía server. Chưa sửa toàn
bộ BillingHistory hoặc selector bank cũ; xem backlog bên dưới.

## Kiểm thử trong lượt này

| Bộ | Kết quả |
|---|---|
| `test:subscription-checkout-drafts:local` | 79 đạt, Auth/REST/RPC/DB local thật |
| Quote foundation | 55 đạt |
| Tenant permissions/plan/settlement | 55 đạt, gồm 20 trusted settlement retry một lần |
| Customer journey local | 81 đạt; Auth/Mailpit/phòng/nhân viên/REST/RPC/Storage/Realtime |
| Vitest | 570 đạt, 16 skip không tính đạt; có 38 ca mới worker/QR/screen |
| Customer journey guard / Control unit | 16 / 8 đạt |
| TypeScript, ESLint phạm vi sửa | Đạt |
| DB security advisors mức warn / DB lint public,private | Không lỗi ở lần chạy này |
| Performance advisors | 134 warning multiple_permissive_policies trên bảng cũ; 0 trên đối tượng mới |
| Docker Node22 build / verify:build / verify:container | Đạt; đã cập nhật RoomQC local cổng8082, không đụng CRM8090 |

Build còn cảnh báo vendor bundle lớn (khoảng14,16MB minified/4,72MB gzip),
chưa tối ưu tải/chunking trong đợt billing này. Container smoke không thay
thế kiểm thử trình duyệt thật. Không khẳng định toàn bộ sản phẩm đã ổn định.

Trong 79 ca mới có lỗi chèn payment sau invoice và lỗi update invoice sau
expiry payment được tiêm bằng trigger **transaction rollback**, chứng minh
không có bản ghi dở dang. Plan config được đổi trong transaction rollback;
chỉ tenant fixture được thay trạng thái. Concurrency confirmation là một
transaction mô phỏng giữ khóa/payment completed + invoice paid, không gọi
ngân hàng thật; HTTP Edge có auth đúng và sweep toàn hệ thống chưa được chạy.

Test chỉ API/DB loopback, Mailpit, thời gian chờ có giới hạn. Tất cả account/
tenant/quote/draft/invoice/payment/session/mail fixture được dọn theo ID/email
đã biết; không reset DB/xóa khách có sẵn. Migration thử SQL không ghi history
khi đang sửa, rồi lưu phiên bản đã review vào lịch sử local.

## Việc còn lại và mục không cần dừng để xin khóa

Các đường cũ vẫn nhận giá browser; trusted settle legacy vẫn theo metadata.
Đợt này bảo vệ **đơn nháp mới**, không tuyên bố đóng lỗ hổng pricing toàn
hệ thống. Chưa nối nút mua gói vào quote/draft, chuyển invoice payable,
đối soát snapshot, thu hồi legacy INSERT hoặc triển khai read-only recovery.

Tiếp theo: hoàn thiện chuyển đổi server/UI và settlement dùng snapshot;
quyết định thời điểm đổi số phòng, quote payable/múi giờ/late payment; sau đó
mới cấu hình provider và nghiệm thu trên staging.

[Danh sách khóa/quyền/quyết định để xử lý sau](roomqc-deferred-access-and-decisions-2026-10-17.md).
