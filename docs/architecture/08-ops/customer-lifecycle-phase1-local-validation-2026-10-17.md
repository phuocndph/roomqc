# RoomQC — Đợt 1: công cụ hỗ trợ và kiểm chứng local

Ngày 17/10/2026. Trạng thái: **hoàn thành phần mã và kiểm chứng local trong đợt
này; chưa hoàn thành cổng nghiệm thu staging của Đợt 1**. Không triển khai VPS,
không mở đăng ký công khai, không chuyển khách legacy và không thay đổi CRM.

## Kết quả đã triển khai

- Công cụ nội bộ `npm run control:support -- lookup --query SLUG_OR_REQUEST_ID`:
  tìm directory, đọc receipt từ đúng cụm, hiển thị trạng thái/lỗi và lịch sử có
  giới hạn. Có API tương ứng, chưa xây thêm trang UI. Không trả email thô,
  email HMAC, service key hoặc dữ liệu nghiệp vụ khách.
- Lệnh `reconcile`: chỉ phục hồi liên kết từ receipt hiện có; không tạo lại
  tenant/hotel, không đổi cụm, không điều chỉnh gói hoặc gia hạn trial. Bắt buộc
  workspace UUID + routing version từ lần tra cứu và lý do 5–1.000 ký tự.
- Nguồn xác thực quản trị cố định bằng `ROOMQC_CONTROL_SUPPORT_CLUSTER_ID`;
  mặc định đóng nếu chưa cấu hình. RPC `platform_support_actor()` kiểm tra role
  super_admin thật, user active/không khóa, session_id còn trong auth.sessions
  và not_after nếu có. Không tin user_metadata, cờ giao diện hay service key
  đơn lẻ để xác định người vận hành. Không khẳng định kiểm tra mọi chính sách
  inactivity/timebox của Auth ngoài các điều kiện đã thực thi này.
- Mỗi lệnh hỗ trợ có audit started trước gọi cụm; mapping + thành công/audit
  trước-sau commit cùng transaction. Lỗi giữ failed + mã; crash giữ started
  để điều tra. Không có receipt, receipt lệch hoặc mất kết nối đều không tạo mới.
- Kiểm tra receipt đủ workspace/tenant/hotel/owner, chống binding sai hotel,
  phiên bản định tuyến cũ và phục hồi reservation đã expired. Không giữ khóa
  transaction database trong lúc gọi HTTP tới cụm.
- Ghi last_error_code + attempt khi provisioning/bootstrap gặp lỗi. Lỗi đến
  muộn không ghi đè trạng thái đã active; log không chứa raw RPC diagnostics
  có thể lộ dữ liệu khách. Active của directory **không đồng nghĩa đã thanh toán**.
- Schema directory thêm support_actions và index cho request ID, slug/history.
  Runtime tối thiểu không có DDL/DELETE audit; chỉ được cập nhật cột kết quả
  của audit, không sửa actor/reason/before_state. Đã thử bằng role DB riêng.
- Cổng control mặc định đổi sang **8091** đồng bộ ở server, Docker, Vite và
  mẫu Nginx VPS; không chiếm 8090 đang thuộc CRM. Compose có thể đổi host port,
  nhưng upstream proxy phải đổi theo; trong container luôn 8091.

Theo hướng dẫn Supabase, phần xác thực được thực thi ở backend và kiểm tra
session còn tồn tại thay vì chỉ kiểm tra JWT/role tại trình duyệt. Migration
`20261017035237_platform_support_actor.sql` đã áp dụng, kiểm chứng và ghi nhận
lịch sử **local**, không chạy trên staging/production.

## Bằng chứng kiểm thử

Các số dưới đây là lần chạy cuối của từng bộ, không cộng các lần chạy lặp:

| Bộ kiểm tra | Kết quả |
|---|---|
| Control unit, cấu hình, HTTP boundary, CLI và bảo vệ audit | 8 đạt; cũng đạt trong image Node 22 |
| Directory HTTP → DB riêng → Supabase Auth/RPC/RLS + CLI thật | **87 kiểm tra đạt** |
| Vitest toàn repo | 532 đạt; 16 bỏ qua thuộc 2 file integration cần cấu hình riêng |
| Ma trận tenant/plan/payment/read-only | 55 đạt |
| Thiết lập phòng | 36 đạt |
| Đăng ký legacy | 28 đạt |
| Email/Auth/OTP/lời mời/queue | 58 đạt trên Mailpit; không gửi Internet |
| TypeScript / lint phạm vi sửa | Đạt, không có lỗi được báo |
| DB security advisors local / lint public,private | Không báo issue/error ở lượt chạy này |
| Build image control / unit trong image | Đạt |
| HTTP/container RoomQC hiện có | verify:container đạt tại 127.0.0.1:8082 |

Hai bài đồng thời tách biệt đã chạy thật qua HTTP và DB: **20 yêu cầu cấp phát
lần đầu** chỉ một lần tạo tenant/trial, một receipt, một hotel; **20 retry** trả
cùng tenant, giữ nguyên hotel và thời điểm hết dùng thử. Đây là kiểm thử tính
nhất quán, **không phải** đo tải 20 người hoặc chứng minh tải production.

Ma trận hỗ trợ gồm anonymous, owner, người khác tenant, metadata tự gán admin,
admin thật, bị khóa/inactive, bị gỡ role, phiên quá not_after và JWT đã logout.
Có receipt sai từng UUID, workspace/route cũ, missing/unavailable, trạng thái
reserved/expired/suspended/migrating, mất phản hồi sau commit, ghi audit thất bại,
retry recovery, lỗi đến muộn và quyền runtime hạn chế. Các ca âm tính cố ý trả
4xx/503 trong log là kết quả kiểm tra mong đợi, không phải lỗi kiểm thử.

Test dùng DB/container directory tạm, user/tenant được định danh riêng và tự
dọn. Cờ directory_required đã được khôi phục **false**. Không reset DB, không
xóa dữ liệu người dùng sẵn có và không thay đổi process CRM.

## Trạng thái chạy thực tế sau đợt này

- RoomQC Docker vẫn ở 8082; CRM vẫn ở 8090.
- Chưa có `.env.control` hay control service thường trực. Cổng 8091 là cấu hình
  sẵn sàng triển khai, **không phải** dịch vụ đang được để chạy sau test.
- `/api/control/healthz` trên frontend Docker vẫn trả 503 có chủ đích vì chưa
  nối proxy control. Feature flag directory vẫn tắt, signup public vẫn chưa mở.
- Bộ kiểm tra đã khởi động/dừng service HTTP thật và DB riêng trong quá trình
  chạy. Điều này không thay thế staging có database/secret/backup bền vững.
- Không build/recreate frontend 8082 trong đợt này vì không sửa UI; chỉ thay
  cấu hình proxy của Vite cho lần khởi động dev tiếp theo.

## Ma trận bắt buộc trên staging trước khi nghiệm thu Đợt 1

Toàn bộ cột staging dưới đây còn **chưa chạy**. Ca local ở các bộ khác nhau
không được gọi là một hành trình browser E2E đã hoàn chỉnh.

| Ca | Kết quả phải đạt trên staging | Tình trạng staging |
|---|---|---|
| 1. Đăng ký từ /start | Slug đúng, reserve có hạn, email/Auth đúng origin | Chưa chạy |
| 2. Email chưa xác thực / OTP sai | Không cấp phát hoặc đăng nhập trái quy định | Chưa chạy |
| 3. OTP thật, reload/callback/thiết bị mới | Về đúng workspace; không dùng cấu hình tenant khác | Chưa chạy |
| 4. Khai báo hotel → tạo phòng | Dữ liệu/giá/quota lưu đúng và chỉ một lần | Chưa chạy |
| 5. Mời nhân viên → đặt mật khẩu → login | Đúng workspace, hotel, vị trí và quyền đã giao | Chưa chạy |
| 6. Hai tab / retry reservation | Một workspace, không kéo dài hạn giữ chỗ | Chưa chạy |
| 7. Hai mươi yêu cầu cấp phát ban đầu | Một tenant/trial/hotel/receipt | Chưa chạy |
| 8. Hai mươi retry sau thành công | Không đổi dữ liệu hoặc ngày hết trial | Chưa chạy |
| 9. Mất phản hồi sau commit | Bootstrap/CLI phục hồi binding, không cấp lại | Chưa chạy |
| 10. Slug hết hạn và đăng ký lại | UUID mới; yêu cầu cũ không sống lại | Chưa chạy |
| 11. Sai chủ sở hữu / quyền hỗ trợ bị thu hồi | Không đọc/ghi ngoài quyền; session logout bị chặn | Chưa chạy |
| 12. Cụm/DB/proxy lỗi | Lỗi JSON có request ID, giữ mapping; không redirect sai DB | Chưa chạy |
| 13. Sai receipt/route và audit thất bại | Không ghi đè mapping; không báo thành công giả | Chưa chạy |
| 14. Tenant isolation REST và RPC | Chủ/nhân viên không đọc/ghi chéo tenant | Chưa chạy |
| 15. Tenant isolation Storage và Realtime | Không lấy file/channel/sự kiện của tenant khác | Chưa chạy |
| 16. Đăng nhập khách legacy | Vẫn hoạt động; chưa bị cutover ngầm | Chưa chạy |

## Việc cần để chuyển sang staging

1. Xác định VPS/đường truy cập triển khai đã được cấp, domain staging và TLS;
   không gửi mật khẩu hoặc khóa bí mật trong chat.
2. Chuẩn bị DB directory bền vững riêng, tài khoản migration/runtime ít quyền,
   HMAC ổn định và secret cluster ở phía server. Backup trước migration.
3. Áp đúng phiên bản migration/Functions/templates lên staging; cấu hình Auth
   site URL/redirect, email thật và cụm quản trị chuẩn. Kiểm tra Resend/DNS độc lập.
4. Chạy control 8091 + health, nối `/api/control/` cùng origin, giữ pilot hạn chế;
   cấu hình build flag/allowlist chỉ cho môi trường pilot. Kiểm tra Nginx trước reload.
5. Chạy đủ ma trận trên và lưu bằng chứng. Chỉ khi đạt mới chốt Đợt 1; chưa mở
   thanh toán thật khi server quote/expiry và các cổng Đợt 2–3 chưa hoàn thành.

Runbook thao tác: [hỗ trợ provisioning](customer-provisioning-triage-runbook.md).
Kế hoạch tổng: [quản lý vòng đời khách hàng](customer-lifecycle-management-audit-plan-2026-10-17.md).

## Đợt tiếp nối: một hành trình tích hợp local

Đã bổ sung [kiểm chứng hành trình khách hàng](customer-journey-local-validation-2026-10-17.md):
81 kiểm tra đạt sau review (bản đầu 69) với signup/OTP thật qua Mailpit → provisioning → phòng → lời
mời/đăng nhập nhân viên → hai tenant REST/RPC/Storage/Realtime. Sửa lỗi Storage
local 42P10 bằng chỉ mục tương thích qua công cụ bảo trì local riêng; không
sửa quyền/metadata hoặc thêm migration ứng dụng trên schema Storage.
87 directory/support, 8 control unit và 532 Vitest/16 skip đã chạy lại đạt.
Phạm vi Storage chỉ guest-documents; Realtime chỉ rooms UPDATE với positive
controls và cửa sổ âm tính hữu hạn. Các ca staging phía trên **vẫn chưa chạy**,
không đổi trạng thái nghiệm thu browser E2E hay mở public signup.

Sau review đã siết đúng mã/lý do từ chối, kiểm tra dữ liệu không đổi; phát hiện
Realtime disconnect suốt lượt test, thêm positive control sau cửa sổ âm tính;
deadline HTTP/SDK/polling/cleanup và ca INSERT tệp mới chéo tenant. 16 regression
cho chính guard/timeout/Realtime đã đạt và thêm vào CI; control unit 8, Vitest
532/16 skip và TypeScript đã chạy lại. Lượt sửa guard không đổi schema/quyền DB.
