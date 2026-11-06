# A0 — kiểm thử trình duyệt và gia cố đối soát cũ

Ngày: 17/10/2026. Tiếp nối [plan](roomqc-next-delivery-plan-2026-10-17.md).
Phạm vi thực thi: RoomQC local 127.0.0.1:8082, Supabase loopback, Mailpit.
**Baseline A0 đã có kết quả thực nhưng chưa đóng toàn bộ A0. A1 chưa bắt đầu.**
Không dùng số test để công bố độ ổn định production hoặc sức chứa đồng thời.

## Kết quả và lỗi đã sửa

1. Form đăng nhập bọc FormControl quanh div trang trí, nhãn không trỏ tới
   input; ID thủ công cũng không khớp nhãn sinh tự động. Đã đặt FormControl
   trực tiếp trên input, liên kết checkbox ghi nhớ, đặt tên/trạng thái cho
   nút hiện/ẩn mật khẩu. Giữ autocomplete username/current-password.
2. DB thực tế cấp ALL cho anon/authenticated trên payment_anomalies, có
   policy UPDATE owner không giới hạn cột. Không chỉ sửa nút: thu hồi quyền
   ghi, xóa, TRUNCATE, REFERENCES, TRIGGER; browser chỉ còn SELECT qua RLS.
   Không thử TRUNCATE thật. Backend service_role vẫn có quyền ingestion.
3. Quyền đọc legacy trước chỉ dựa user_level_code, chưa kiểm tra phiên.
   Policy mới dùng helper trong schema private: profile active/unlocked,
   Auth đã xác minh/không ban, session còn tồn tại và role DB hiện hành;
   owner chỉ đọc tenant mình, support đủ quyền được đọc. Không dùng user_metadata.
4. /finance/reconciliation đã thành lịch sử thuê bao chỉ đọc, phân biệt với
   khoản thu khách lưu trú. Bỏ nút gọi sync provider và thao tác kết luận
   trực tiếp chưa audit; giữ tab lịch sử và nút xem chi tiết. Lỗi tải có
   retry, không hiện thành “không có bất thường”; empty không xác nhận
   toàn bộ tiền đã khớp. Hồ sơ xử lý thay thế vẫn thuộc A2.
5. Script kiểm thử dùng sai DELETE /api/v1/message/:id của Mailpit (405).
   Sửa sang DELETE /api/v1/messages với danh sách IDs cụ thể, chỉ gọi khi
   đã có message khớp đúng email fixture. Đã dọn hai email test còn lại
   từ lượt lỗi, kiểm tra lại; không xóa hộp thư chung.
6. BillingHistory còn nút gọi đồng bộ SePay cũ. Đã gỡ lời gọi provider khỏi
   màn lịch sử; giữ làm mới, chứng từ và chi tiết hóa đơn. Lỗi một trong hai
   query hiện thông báo thử lại, không hiển thị dữ liệu cache/empty success;
   khi đang xác thực lại dữ liệu cũng không giữ chứng từ cũ trên màn hình.
   Realtime có filter tenant, đổi tenant gỡ channel cũ và không giữ hóa đơn
   đang chọn của tenant trước. Bộ lọc realtime không thay thế RLS.
7. Đơn hủy đang lưu payment_status=failed theo RPC hiện hành, nhưng hóa đơn
   đã cancelled. Lịch sử trước đây chỉ hiện “Thất bại”; nay hiện “Đã hủy”
   khi có chứng từ hủy tương ứng. Failed không có hóa đơn hủy vẫn là thất bại;
   đây chỉ là sửa nhãn, không đổi dữ liệu tài chính hoặc chính sách hủy.

Migration additive đã áp local và khớp history:

- 20261017072020_legacy_anomalies_readonly.sql
- 20261017073549_legacy_anomaly_live_read_scope.sql

## Ma trận bằng chứng

Không gộp browser, component và API thành một loại E2E.

| Kịch bản | Kết quả | Bằng chứng / giới hạn |
|---|---|---|
| Admin đăng nhập thật → khách hàng → menu Xem hóa đơn → Đối soát | PASS browser | Tài khoản tạm, không inject session |
| Phân trang đối soát 27 dòng | PASS browser | 25 dòng trang 1, 2 dòng trang 2; cuối trang không Next |
| Filter stale từ trang 2 | PASS browser | Reset trang 1; đúng một dòng năm 2020 |
| Filter attention | PASS browser | 25 dòng trang đầu; fixture legacy đều cần kiểm tra |
| Filter legacy | PASS browser | Đối chiếu mã hóa đơn fixture: 25 + 2, union đúng 27, không lặp; đổi filter từ trang 2 về trang 1 |
| Đóng dialog → đổi tenant → mở lại | PASS browser | Tenant owner không có dòng của tenant other; hàng đợi rỗng đúng |
| Reload route quản trị | PASS browser | Trang khách hàng mở lại; dialog/search là trạng thái tạm, không cam kết lưu qua reload |
| Owner lấy báo giá 3 phòng/30 ngày | PASS browser | Server trả 90.000 VND; UI ghi rõ không chuyển khoản |
| Tạo nháp → xem nháp → quay về pending → reload | PASS browser + DB | Một đơn 90.000 VND; không QR, không cấp gói; tab pending giữ trong URL |
| Tab thứ hai nhấp lặp Tạo bản nháp khi đã có đơn | PASS browser + DB | Hiện pending-order conflict; DB vẫn đúng một đơn; không phải race hai submit đầu tiên |
| Mở hộp xác nhận hủy rồi chọn Không | PASS browser | Giữ nguyên đơn; không tính là browser E2E hủy thành công |
| Hủy nháp bằng owner; tenant khác bị từ chối | PASS API | Entitlement giữ nguyên; browser reload không còn pending |
| Nhân viên vào quản lý thuê bao | PASS browser | Hiện Không có quyền truy cập |
| Nhân viên và owner tenant thứ hai mở /super-admin/tenants | PASS browser | Trả về /, không hiển thị danh sách admin |
| Owner/staff/other/admin kiểm tra RPC admin | PASS API | Chỉ admin fixture được gọi |
| Legacy lịch sử vẫn truy cập/xem chi tiết, không có write/provider button | PASS browser + component | Ảnh bên dưới; query error/stale được component test |
| Owner/other/support/anon ghi anomaly trực tiếp | PASS API | INSERT/UPDATE/DELETE đều 42501; dữ liệu chứng từ nguyên vẹn |
| Khóa/ban/gỡ role/logout với JWT cũ | PASS API | Không đọc legacy ngoài quyền; RPC admin từ chối |
| 20 retry/race, rollback, expiry/cancel, lost-response replay | PASS integration | 96 checks; không tính là browser mất mạng |
| Mất phản hồi POST sau commit → thử lại | PASS browser + DB | Giữ phản hồi POST 200, DB đã có một pending 90.000đ; fail ConnectionClosed, UI hiện lỗi; thử lại trả đúng payment/invoice cũ, không thêm đơn, entitlement không đổi |
| Ngắt preflight trước submit → kết nối lại | PASS browser + DB | Fail OPTIONS, không có pending mới; UI hiện lỗi; báo giá mới và tạo nháp sau khôi phục đạt. Không tính là mô phỏng toàn thiết bị offline |
| Thu hồi phiên owner khi báo giá đang mở → Tạo bản nháp | PASS browser + DB | Global signOut chỉ fixture owner; browser JWT cũ bị từ chối, UI yêu cầu đăng nhập/kiểm tra quyền; DB không có pending mới |
| Admin browser bị khóa khi dialog đang mở → tải lại | PASS browser | Account_locked chỉ fixture admin; RPC từ chối, UI ẩn các dòng cũ và báo cần phiên quản trị hợp lệ |
| Offline toàn trình duyệt/thiết bị và tự refresh token đúng thời điểm hết hạn JWT | NOT RUN browser | Kiểm thử ở trên là lỗi mạng riêng RPC và phiên bị thu hồi, không đồng nhất với các tình huống này |
| BillingHistory sau cập nhật | PASS browser smoke + component | Browser reload bản cuối: nhãn Đã hủy đúng, Làm mới và xem chi tiết hóa đơn hoạt động; không còn nút SePay. Lỗi/refetch/tenant switch có test riêng |
| Provider thanh toán/email Internet, staging/VPS | NOT RUN | Theo deferred; không gọi provider |

Ảnh chỉ chứa tenant fixture:
![Lịch sử đối soát chỉ đọc](../../../artifacts/a0-20261017/legacy-readonly.jpg)

Ảnh lưu tại artifacts/a0-20261017/legacy-readonly.jpg ở root dự án.

Bằng chứng bổ sung (chỉ fixture):

- artifacts/a0-20261017/lost-response-recovered.jpg
- artifacts/a0-20261017/revoked-session.jpg
- artifacts/a0-20261017/admin-lock-denied.jpg
- artifacts/a0-20261017/billing-history-readonly.jpg

## Bản đồ route và trách nhiệm

| Điểm vào | Nguồn / hành động server | Trách nhiệm |
|---|---|---|
| /super-admin/tenants → Xem hóa đơn → Đối soát | admin_subscription_reconciliation | Hàng đợi thuê bao từng tenant, chỉ đọc, cursor/filter server |
| /settings/subscription → Gia hạn → báo giá/nháp | create_subscription_quote, create_subscription_checkout_draft, get_subscription_checkout_draft | Owner, giá snapshot server; nháp không payable |
| /settings/subscription?tab=pending | payment_transactions + invoices; cancel_subscription_payment | Tra cứu/hủy; không thu tiền hoặc tăng quota |
| /settings/subscription/pay/:invoiceId | Guard chứng từ không payable | Không phát QR cho nháp/legacy chưa xác minh |
| /finance/reconciliation | payment_anomalies SELECT qua RLS | Lịch sử SePay thuê bao; không phải booking invoice, không còn ghi từ browser |
| /settings/subscription?tab=history | payment_transactions + invoices SELECT qua RLS | Lịch sử thuê bao chỉ đọc, không gọi SePay; lỗi có retry, chi tiết theo tenant hiện tại |
| sync-sepay-transactions | payment_transactions + public.invoices → settle_subscription_payment + payment_anomalies | Đồng bộ thuê bao cũ, vẫn tồn tại endpoint; việc bỏ nút không vô hiệu hóa API |
| sepay-webhook / settlement | settle_subscription_payment | Không mở thanh toán thật; legacy pending và quote_draft bị chặn theo cutover trước |
| expire-pending-payments | expire_pending_subscription_payments | Hủy pending/invoice nguyên tử; không đồng nghĩa lifecycle tenant/trial |

Đã rà cả consumer BillingHistory và bỏ lời gọi sync cuối còn lại trong src.
Đã đọc source sync: owner chỉ query tenant mình; admin có nhánh toàn cụm,
lọc tài khoản ngân hàng và gọi settlement. **Không gọi endpoint provider để
test**. Trước bật provider phải gia cố phiên live ở edge, phân biệt lệnh global
và tenant explicit, kiểm tra success:false ở mọi consumer và đối chiếu source
bank/provider còn thuộc giai đoạn cũ. Không coi việc ẩn nút hoặc fail-closed
settlement là nghiệm thu provider.

## Kiểm chứng mới trong đợt này

- Lượt baseline trước: Vitest 87 files đạt; 635 test đạt / 16 skip.
  Lượt bổ sung mới nhất sẽ ghi bên dưới; skip không tính pass.
- Đối soát tích hợp: **70 checks đạt**, gồm legacy grants/read scope; cleanup đạt.
  Lượt trước 63 checks đạt nhưng cleanup mail lỗi đã được sửa, dọn và chạy lại.
- Checkout/draft/expiry/cancel tích hợp: **96 checks đạt**, cleanup đạt.
- TypeScript: tsc --noEmit -p tsconfig.app.json đạt.
- ESLint phần frontend/script đã sửa đạt; node --check harness đạt.
- Security advisors local: không issues; DB lint public/private: không schema errors.
- Hai migration mới khớp history local; không reset DB.
- Docker build + verify:build đạt; container smoke đạt, health healthy tại 8082.
  Có image trước sửa: roomqc-a0-before-20261017:local.
- Còn cảnh báo bundle vendor ~14,16 MB minified / 4,72 MB gzip; chưa tối ưu A3.
  BuildKit cảnh báo tên ARG publishable key: đây là public frontend key,
  không phải service_role; không đưa secret key vào build/browser.

## Dữ liệu thử và phần tiếp theo

Harness scripts/a0-browser-fixtures-local.mjs tạo bốn Auth user và bốn workspace
tạm; staff được chuyển vào tenant owner. Manifest *.local không chứa token/key.
Đã logout browser, xóa đúng IDs fixture, delivery queue theo delivery IDs, thư
Mailpit theo recipient, xác minh tenant/user không còn rồi xóa manifest.
Những fixture đã dọn chỉ dùng để kiểm thử, không thể khôi phục qua UI; có thể
tạo lại bằng harness. Không xóa dữ liệu khách đang có hoặc reset database.

Đã bổ sung fault injection mất phản hồi POST/thu hồi phiên, khóa admin và
đối chiếu đủ filter legacy. Trước khi đóng A0 vẫn phải ghi nhận các ngoại lệ:
hủy thành công bằng click xác nhận UI chưa chạy (đã có API/component),
offline toàn thiết bị và race hai submit đầu tiên chưa chạy browser;
không tính tab thứ hai đã có pending thành race tạo đầu tiên. API legacy
provider còn cần live-session guard/scope explicit trước bật thanh toán,
việc bỏ nút không vô hiệu hóa endpoint.

Backlog A3 xác nhận qua browser: list admin dùng nhãn “Chưa đăng ký” cho
fixture đang trial, menu admin mobile chưa có tên nút và vẫn lộ link offscreen
trong accessibility tree; lịch sử legacy chỉ giới hạn 200, chưa phân trang.
Không dùng con số hiển thị trong console cũ làm thống kê server chuẩn.

Sau A0 chuyển A1 theo plan: sửa job báo success khi lỗi, run ID/scope/kết quả,
monitor last-success đúng phạm vi/backlog. Chưa chạy lifecycle global,
chưa sửa chính sách grace, chưa bật cron production hay thanh toán.

## Bổ sung kiểm chứng browser và lịch sử thanh toán (cùng ngày)

- Harness bổ sung inspect-owner, revoke-owner, lock-admin/unlock-admin;
  luôn xác minh manifest/project/loopback và chỉ thay đổi tài khoản fixture.
  Không lưu access token hoặc khóa dịch vụ vào manifest/báo cáo.
- Mất phản hồi: interception đúng localhost:54321, Response-stage của
  create_subscription_checkout_draft. OPTIONS phải cho qua trước khi giữ POST;
  ngắt OPTIONS chỉ chứng minh lỗi trước ghi, không phải mất phản hồi sau commit.
  DB đã xác nhận payment 35eb405a-65b1-4921-8590-31ca49505d20,
  invoice 1c250e3c-1210-49f0-af34-67e496723fb6 pending 90.000đ trước khi
  ngắt POST. Sau retry vẫn đúng hai IDs này, không thêm payment/invoice.
  Đơn trước đó đã hủy riêng, không bị tính là đơn phát sinh do retry.
- Thu hồi phiên sau báo giá: máy chủ từ chối thao tác bằng JWT browser cũ,
  không sinh pending mới. Hai đơn fixture sau API hủy đều failed với hóa đơn
  cancelled, registered_rooms vẫn 0, trial và ngày hết hạn giữ nguyên.
- Admin khóa giữa dialog: tải lại hiện lỗi quyền và không giữ bảng cũ.
  Không cam kết dữ liệu đã tải tự biến mất ngay khi khóa: revalidation khi
  refresh hoặc timer màn đối soát (30 giây khi hoạt động) mới kiểm tra lại.
- Phân trang all và legacy: lấy mã hóa đơn từ DOM hai trang, khẳng định
  count=25+2 và set union=27; stale chỉ có mã kết thúc -26 (năm 2020).
- Vitest mới nhất: **88 file đạt, 643 test đạt / 16 skip**, gồm 8 test mới
  BillingHistory. TypeScript ứng dụng, ESLint phần sửa và node --check harness
  chạy lại đều đạt (exit 0); git diff --check phần sửa không có lỗi whitespace.
- Docker build + verify:build đạt; chỉ recreate service roomqc tại 8082,
  container smoke đạt. Không cập nhật CRM/8080/8081, không chạy expiry/lifecycle
  sweep, không gọi SePay, không gửi mail ra Internet, không thêm migration.
- Tài liệu Realtime hiện hành được đối chiếu: filter tenant chỉ giảm sự kiện,
  không thay thế RLS; delete event có giới hạn tùy replica identity. Dùng nút
  Làm mới để tra cứu lại, không coi kết nối realtime là xác nhận thanh toán.

### Bàn giao lượt bổ sung

Browser reload bản cuối tại /settings/subscription?tab=history: hai hóa đơn
fixture đã hủy hiện “Đã hủy”, làm mới thành công, chi tiết vẫn ghi bản nháp
không chuyển khoản/kích hoạt. Container smoke đạt và health healthy.
Đã đăng xuất fixture owner/admin, xóa interception bằng Fetch.enable patterns=[]
và đóng tab do agent tạo. Cleanup run 4c0300ae đạt: xóa chính xác bốn workspace
tạm, bốn Auth user, queue/mail liên quan; xác minh IDs không còn rồi xóa
manifest local. Dữ liệu thử đã xóa không khôi phục từ UI; có thể tạo lại bằng
harness. Không xóa dữ liệu khách hàng có sẵn hoặc reset DB.

Chưa đóng toàn bộ A0/A1: các ngoại lệ browser và gia cố endpoint provider
ở trên vẫn còn. Phần tiếp theo theo plan là chốt baseline ngoại lệ rồi A1
job/run-history/monitor; không tự bật provider hoặc cron production.
