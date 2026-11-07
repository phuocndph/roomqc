# RoomQC — xử lý đăng ký/cấp phát kẹt

Ngày 17/10/2026. Dành cho super admin vận hành đã được cấp quyền hỗ trợ.
Không phải hướng dẫn tự sửa SQL; không dùng service key trong browser.

## Nguồn dữ liệu

| Trường/trạng thái | Nguồn chuẩn | Quy tắc |
|---|---|---|
| workspace_id, slug, cluster_id, routing_version | roomqc_control.workspaces ở DB directory riêng | Không suy ra cluster theo email hay URL localhost; một email có một workspace đang hiệu lực ở v1. |
| request_id, outcome, thời điểm | roomqc_control.attempts và log control | request_id gắn từng yêu cầu; workspace_id gắn cả hành trình và các lần retry. |
| owner_id, tenant_id, hotel_id đã commit | private.workspace_provisioning tại cụm được directory chỉ định | Receipt tạo cùng transaction với tenant/hotel/owner/trial. Đây là bằng chứng commit khi mất phản hồi. |
| trial, active, grace, suspended; quota, read-only | public.tenants và subscription_plans tại cụm | Không lấy nhãn actual_status do client tính làm nguồn gói hiệu lực. |
| paid/completed, giao dịch nhà cung cấp | invoice/payment tại cụm và backend đối soát | Directory active chỉ nói đã cấp phát, không có nghĩa đã thu tiền. |

Một tenant có thể có nhiều hotel; hotel_id trong receipt là hotel đầu tiên.
routing_version không phải phiên bản gói. Cụm draining ngừng nhận đăng ký mới,
không dừng nghiệp vụ của khách cũ. Lỗi kết nối cụm không cho phép đổi mapping.

## Quy trình xử lý

1. Nhận slug và request ID từ thông báo lỗi; không yêu cầu mật khẩu/OTP/API key.
   Nếu khách không còn request ID, tra workspace theo slug bằng công cụ nội bộ
   và lấy các attempt gần nhất. Ghi ticket kèm thời điểm và phiên bản triển khai.
2. Kiểm tra health directory, backend được gán và kết nối của control tới cụm.
   Local hiện chưa có control runtime thường trực; HTTP 503 không tự chứng minh
   provisioning hỏng. Đặc biệt, cổng 8090 trên máy này thuộc CRM, không dừng CRM.
3. Ưu tiên công cụ `control:support lookup` bên dưới để đọc workspace, receipt
   và attempt, không cần tự sửa SQL. Khi điều tra chuyên sâu, chỉ chạy SELECT
   với tham số đã bind:
   - Directory: workspace theo slug/ID, attempts theo workspace/request ID.
   - Cụm đúng: get_workspace_provisioning(workspace_id) bằng dịch vụ nội bộ;
     kiểm tra owner/tenant/hotel liên quan còn tồn tại.
   Không ghi email thô, token, payload người dùng hay service key vào ticket/log.
4. Phân loại và xử lý theo bảng dưới. Trước khi retry provisioning, bảo đảm
   không còn request trước đang chạy; dùng lại workspace và owner đã xác thực.
5. Kiểm tra lại qua bootstrap/đăng nhập/setup. Xác nhận chỉ có một receipt,
   một tenant, một trial. Ghi kết quả và request ID mới vào ticket.

| Kết quả đối chiếu | Xử lý được phép |
|---|---|
| reserved, chưa owner/chưa bắt đầu, expires_at còn hạn | Khách tiếp tục xác thực và setup trên cùng workspace. |
| reserved đã hết hạn, chưa cấp phát và không có receipt | Dùng cơ chế expiry/reservation hiện có; không xóa lịch sử để tái sử dụng slug. |
| provisioning và receipt tồn tại, khớp workspace/owner/cụm | Retry bootstrap để backend đối soát binding từ receipt; không tạo tenant/trial mới. |
| provisioning nhưng cụm chưa truy cập được | Khôi phục kết nối, giữ reservation/mapping. Không đánh dấu expired để thử lại ở cụm khác. |
| provisioning và cụm truy cập được nhưng chưa có receipt | Xem request đang chạy/lỗi dữ liệu. Sau khi xác nhận đã kết thúc, retry luồng provisioning hiện có cùng workspace và owner; không insert tenant thủ công. |
| receipt khác owner/tenant/hotel với mapping | Dừng ghi/đổi gói/xóa cho ticket, khóa đăng ký mới nếu nghi lỗi hệ thống; chuyển kỹ thuật đối soát, không sửa mapping bằng suy đoán. |
| active, receipt đúng nhưng không đăng nhập được | Kiểm tra Auth/session, trạng thái user, hotel membership và gói tại cụm; không cấp phát lại. |
| legacy reservation không có expires_at | Giữ nguyên; cần kiểm tra receipt và giao thức cũ, không tự thu hồi theo tuổi bản ghi. |

## Ranh giới thay đổi quản trị

- Owner chỉ được sửa thông tin liên hệ/cấu hình giao diện và nghiệp vụ; không
  được ghi plan, ngày hết hạn, quota, approval, read-only hoặc dung sai thanh toán.
- Super admin đang active và không bị khóa dùng admin_manage_tenant, phải có
  lý do. Tạm ngưng/khôi phục/đổi gói và audit trước/sau commit cùng transaction.
  Khôi phục không gia hạn gói đã hết hạn. Đổi gói là điều chỉnh thủ công,
  không ghi nhận đã thu tiền. Giá trên UI chỉ là ước tính.
- Không xóa tenant từ UI/REST của browser, kể cả super admin. Chưa có chính sách
  lưu/xóa/khôi phục được duyệt. Không bật bulk action chưa có backend.
- Chỉ backend đối soát hoặc super admin được xác nhận thanh toán. Khách được
  gửi yêu cầu pending và hủy qua RPC có quyền; không tự sửa completed/gateway ID.
- Điều tra chưa rõ: dừng các thay đổi của ticket, lưu bằng chứng đọc và báo kỹ thuật.
  Không tự khóa toàn bộ tenant đang vận hành nếu chưa có căn cứ/ủy quyền.

## Công cụ hỗ trợ tối thiểu (CLI)

Đã có API POST `/api/control/support/lookup`, POST `/support/reconcile` và
GET `/api/control/support/reconcile-result?workspaceId=UUID`, cùng CLI
chạy từ gốc repo. Không cần mở một console lớn. Chưa có trang UI hỗ trợ mới.
Trước khi dùng trên staging:

1. Dùng đầy đủ migration của release đã duyệt: cụm quyền cần actor/acceptance RPC;
   directory cần acceptance consumption và durable command journal (đến0021
   trong bản đang kiểm). Chạy `control:migrate` lên **DB directory riêng**,
   không phải database Supabase. Không sửa checksum migration đã phát hành.
2. Cấu hình `ROOMQC_CONTROL_SUPPORT_CLUSTER_ID` là ID cụm quản trị trong registry.
   Để trống thì API hỗ trợ đóng. Không cho caller tự chọn cụm để chứng minh quyền.
   Với v1 một cụm, đây chính là cluster-a. Tài khoản phải có role super_admin thật,
   hồ sơ active/không khóa và session còn trong Auth. Metadata do user sửa không
   cấp quyền; token đã đăng xuất hoặc phiên có not_after quá hạn bị từ chối.
3. Runtime directory kế thừa role `roomqc_control_api` từ migrator đã duyệt,
   gồm quyền journal/consumption. Không dùng bộ grants hỗ trợ cũ thiếu journal.
   Không cấp DDL/superuser và không dùng DB directory
   làm một schema public của Supabase.
4. Đặt token đăng nhập ngắn hạn của admin vào biến môi trường của terminal
   `ROOMQC_SUPPORT_ACCESS_TOKEN` bằng công cụ lưu bí mật hoặc nhập ẩn. Không đưa
   token vào tham số lệnh, `.env` được commit, ticket, ảnh chụp hoặc chat. Đây
   **không phải** service key. Xóa biến khi xử lý xong. CLI không tự tạo admin.

```sh
# Default local transport is loopback 8091; production uses HTTPS.
# ROOMQC_PUBLIC_URL must match the Origin allowed by the control service.
npm run control:support -- lookup --query an-thuy
npm run control:support -- lookup --query REQUEST_UUID

# Linux: create a dedicated private directory; never reuse another ticket's file.
install -d -m 700 /var/lib/roomqc-support
# Copy workspace ID + routing_version from the lookup just performed.
npm run control:support -- reconcile --query an-thuy --workspace-id WORKSPACE_UUID --routing-version 1 --reason "Khoi phuc xac nhan da mat, ticket QC-123" --intent-file /var/lib/roomqc-support/QC-123.json
# After network loss or restart, read with the same original file.
npm run control:support -- result --intent-file /var/lib/roomqc-support/QC-123.json
```

CLI đọc `ROOMQC_CONTROL_URL` (mặc định `http://127.0.0.1:8091`) và
`ROOMQC_PUBLIC_URL` từ môi trường hoặc `.env.control` nếu có. Khi chạy từ máy
khác, dùng URL HTTPS được proxy đúng `/api/control/`, không truyền database URL
hay service key vào URL. HTTP chỉ được phép cho loopback, không theo redirect.

Lookup trả mapping, cluster status, receipt `verified/missing/unavailable/conflict`,
mã lỗi gần nhất và tối đa 20 attempt + 20 lệnh hỗ trợ. Không trả email thô, HMAC,
service key hoặc trường nghiệp vụ của khách. Slug tra bản ghi mới nhất; request ID
giữ khả năng tìm lại đăng ký cũ đã expired. Không suy luận trạng thái gói từ active.

Reconcile chỉ nhận receipt của đúng workspace/owner/tenant/hotel, khi trạng thái
đang provisioning hoặc active. Không tạo lại tenant, không đổi cụm, không sửa gói
hay trial. Workspace UUID và routing version cũ bị chặn. Khi chưa có receipt,
chủ tài khoản tiếp tục luồng thiết lập cũ; khi mất kết nối, giữ mapping để thử lại.

CLI lưu exact key/body/origin/actor vào file private trước network; token chỉ ở
environment. Thử lại dùng nguyên lệnh và file cũ; requestId mới chỉ là trace.
File tạo bằng exclusive create, kiểm ownership/mode/link, fsync trước gửi;
file ghi dở hoặc đổi actor/origin/body phải chặn gửi, không tự ghi đè/phát key mới.
Đây chưa phải atomic rename. Windows cần thư mục ACL private của operator;
không coi mode Unix trên Windows là bằng chứng ACL hoặc Linux crash durability.

GET result yêu cầu original Idempotency-Key và đúng một workspaceId; kiểm quyền
live cả trước/sau đọc. Kết quả là snapshot lịch sử, không bảo đảm workspace đang
sẵn sàng ở thời điểm hiện tại. 404/503/timeout là unknown, không chứng minh chưa
commit. Giữ file, đối soát original intent; không tạo lệnh mới để né kết quả chưa rõ.
Đổi reason/version/target là lệnh khác, cần giải quyết intent cũ trước. Actor không
còn quyền không được dùng receipt lịch sử để mở recovery hoặc đọc kết quả.

Mỗi lệnh hợp lệ ghi một action `started` và intent trước canonical acceptance.
Kết quả `reconciled`, mapping, audit, consumption và result commit cùng transaction;
không ghi được audit thì rollback effect. Lệnh bị chặn giữ `failed` + mã lỗi.
Thử lại cùng key giữ action gốc; recovery thành công có thể đổi failed→reconciled,
giữ ID/actor/reason/before-state và xóa error_code. Journal generation/expiry
closures giữ lịch sử phục hồi; không coi support_actions là log append-only.
Nếu process chết, `started` còn lại không chứng minh rollback hoặc cho phép cấp lại.
Lý do chỉ ghi thông tin ticket, không chứa mật khẩu/OTP/token hoặc dữ liệu khách.

### Quyền runtime sau nâng cấp directory

Ví dụ dưới đây dành cho DBA, thay `roomqc_control_runtime` bằng role đã tạo.
Không chạy bằng browser, không cấp cho anon/authenticated của backend khách.

```sql
GRANT roomqc_control_api TO roomqc_control_runtime;
```

Đóng mutation/dừng writer cũ, backup directory, migrate bằng tài khoản DDL rồi
khởi động runtime mới. Writer cũ không hiểu journal không được chạy song song
hoặc rollback để ghi; giữ read-only tới khi compatibility được chứng minh.
Không backfill receipt giả cho lịch sử cũ. Kiểm runtime health/config thực khi
triển khai; container kiểm thử tạm không chứng minh dịch vụ thường trực đã bật.

## Điều kiện trước staging/production

Cần môi trường staging/VPS đã xác định, origin/domain và TLS, DB directory riêng,
control runtime có health đạt, cổng không xung đột, backup trước migration.
Chỉ bật feature flag cho pilot sau khi E2E staging đạt. Local test và Mailpit
không thay thế kiểm thử trên VPS hoặc xác minh Resend/DNS.
