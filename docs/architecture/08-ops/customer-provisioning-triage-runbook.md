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

Đã có API POST `/api/control/support/lookup` và `/support/reconcile`, cùng CLI
chạy từ gốc repo. Không cần mở một console lớn. Chưa có trang UI hỗ trợ mới.
Trước khi dùng trên staging:

1. Áp migration `20261017035237_platform_support_actor.sql` lên cụm làm nguồn
   quyền quản trị; chạy `control:migrate` lên **DB directory riêng**, không phải
   database Supabase. Khởi động image control mới, kiểm tra health.
2. Cấu hình `ROOMQC_CONTROL_SUPPORT_CLUSTER_ID` là ID cụm quản trị trong registry.
   Để trống thì API hỗ trợ đóng. Không cho caller tự chọn cụm để chứng minh quyền.
   Với v1 một cụm, đây chính là cluster-a. Tài khoản phải có role super_admin thật,
   hồ sơ active/không khóa và session còn trong Auth. Metadata do user sửa không
   cấp quyền; token đã đăng xuất hoặc phiên có not_after quá hạn bị từ chối.
3. Runtime directory cần các quyền ở runbook directory; thêm quyền hỗ trợ như
   phần nâng cấp bên dưới. Không cấp DDL/superuser và không dùng DB directory
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

# Copy workspace ID + routing_version from the lookup just performed.
npm run control:support -- reconcile --query an-thuy --workspace-id WORKSPACE_UUID --routing-version 1 --reason "Khoi phuc xac nhan da mat, ticket QC-123"
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

Mỗi lệnh hợp lệ ghi `started` trước khi gọi cụm. Kết quả `reconciled`, mapping
và audit trước/sau commit cùng transaction; không ghi được audit thì rollback
mapping. Lệnh bị chặn giữ `failed` + mã lỗi. Nếu process chết, dòng `started`
còn lại là tín hiệu cần điều tra, không tự hiểu là thất bại và cấp phát lại.
Lý do chỉ ghi thông tin ticket, không chứa mật khẩu/OTP/token hoặc dữ liệu khách.

### Quyền runtime sau nâng cấp directory

Ví dụ dưới đây dành cho DBA, thay `roomqc_control_runtime` bằng role đã tạo.
Không chạy bằng browser, không cấp cho anon/authenticated của backend khách.

```sql
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_runtime;
GRANT SELECT ON roomqc_control.clusters TO roomqc_control_runtime;
GRANT SELECT, INSERT, UPDATE ON roomqc_control.workspaces TO roomqc_control_runtime;
GRANT SELECT, INSERT ON roomqc_control.attempts TO roomqc_control_runtime;
GRANT USAGE, SELECT ON SEQUENCE roomqc_control.attempts_id_seq TO roomqc_control_runtime;
GRANT SELECT, INSERT ON roomqc_control.support_actions TO roomqc_control_runtime;
GRANT UPDATE (outcome, after_state, error_code, finished_at)
  ON roomqc_control.support_actions TO roomqc_control_runtime;
```

Đóng signup/dừng binary cũ, backup directory, migrate bằng tài khoản DDL rồi
khởi động runtime mới. Chưa có `.env.control` trên máy local hiện tại; bộ test
dùng service/DB/container tạm và tự dọn, không phải dịch vụ hỗ trợ thường trực.

## Điều kiện trước staging/production

Cần môi trường staging/VPS đã xác định, origin/domain và TLS, DB directory riêng,
control runtime có health đạt, cổng không xung đột, backup trước migration.
Chỉ bật feature flag cho pilot sau khi E2E staging đạt. Local test và Mailpit
không thay thế kiểm thử trên VPS hoặc xác minh Resend/DNS.
