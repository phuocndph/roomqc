# RoomQC — bằng chứng local cho nguồn giao hàng và tác vụ xác nhận

Ngày kiểm tra: **27/10/2026, Asia/Bangkok**. Thuộc T01/T03/T08 của kế hoạch
VPS + signup. Đây là bằng chứng sửa một đường quyền gián tiếp; chưa nghiệm thu
toàn bộ workflow hoặc sản phẩm.

## Kết quả đã chạy

Candidate **823 file**, source `c38e9c08c94bb39f4d1c459318db6339347390607c507b31993eefbf545286c4`,
**555 migration nghiệp vụ + 12 directory**, runtime binding162file. Bộ diagnostic
chính thức nạp toàn bộ migration trên backend trống và chạy **Auth/REST/Edge thật**:
**65/65 kiểm tra đạt**, bao gồm **5 race có quan sát chờ khóa thực**; native exit0.
Không chèn SQL prototype thay migration trong lượt này. Source, migration,
runtime và schema trước–sau khớp; fault instrumentation đã được gỡ.

Nhánh Edge giao hàng chạy với **SUPABASE_URL + SUPABASE_ANON_KEY**, không có
service-role key. Mọi quyền và thay đổi dùng JWT của người đang thao tác.
Build/run trong fixture riêng, runtime chỉ có mạng Docker nội bộ, không công
khai cổng, không gọi provider ngoài và không sửa hệ đang phục vụ.

## Lỗi và hành vi sau sửa

| Vấn đề | Hành vi đã kiểm |
|---|---|
| Token tenant khác truyền `p_actor_id` của chủ khách sạn | RPC giao hàng từ chối, nguồn/đơn/tồn kho không đổi |
| Nhân viên khác khách sạn hoặc không được giao tuyến | RPC/tác vụ xác nhận từ chối, không có effect |
| Chủ tài khoản bị khóa, inactive hoặc đã logout | Từ chối cả tạo mới và đọc replay bằng token cũ |
| Gửi lại hoặc 20 request đồng thời | Một lần chuyển trạng thái, một source witness; một task và một receipt |
| Client giả room/tenant/label/số sản phẩm | Lấy dữ liệu từ stop/order/room trong DB; tenant/hotel ở context là điều kiện kiểm tra |
| Lỗi ghi source witness sau cập nhật giao hàng | Rollback cả nguồn, tồn kho và sổ giao dịch; thử lại áp dụng đúng một lần |
| Lỗi ghi receipt sau tạo task | Rollback task và kết quả; Edge trả lỗi an toàn, retry cùng nguồn phục hồi |
| Phiên hết hạn trong lúc chờ business lock | Kiểm lại wall clock sau lock, từ chối không effect |
| Khóa tài khoản, xóa membership hoặc phiên trước khi lấy actor lock | Nhìn thấy quyền mới nhất và từ chối |
| Gọi trực tiếp private function/bảng bằng anon/authenticated/service | Từ chối; không có đường thay thế bằng service-role |
| Legacy task duy nhất có scope đúng | Nhận lại task, không tạo trùng; nhiều task cũ trả409 để đối soát |
| Nguồn cũ chỉ có raw row, không có witness | Trả409 cần review; không tự xác nhận sự kiện hợp lệ |
| Có workflow cấu hình cho giao hàng | Trả409 rõ ràng; chưa âm thầm chạy fallback hoặc báo thành công |
| Sai JSON/method/source/context | 400/401/403/405 theo trường hợp; không thay dữ liệu |

Fault tồn kho dùng dữ liệu thực trong fixture: sau phục hồi quantity_total18,
quantity_in_use8 và **1 giao dịch kho**. Các số này là kỳ vọng của fixture,
không phải thay đổi dữ liệu khách sạn thật.

## Phạm vi hồi quy và quyền dữ liệu

Hai bảng private mới: `workflow_delivery_sources`, `workflow_delivery_results`,
RLS bật và không cấp quyền trực tiếp cho browser/service. Inventory direct ACL
đã tăng từ22lên **24bảng**: **288 browser/probe denials, 84 service denials,
51 positive controls, 3 dynamic invoker denials và 24 snapshot không đổi**.
Diagnostic này populate **6/24bảng**, bao gồm cả2bảng workflow. Fixture
PostgreSQL độc lập populate đủ24bảng đã qua8kiểm tra và hồi quy trong full control823;
không được mô tả diagnostic là đã populate đủ24.

Native advisors trên workload diagnostic có **657 findings**:24no-policy,
7FK,491unused-index,135permissive-policy. Khác role/workload với scan620
của full818 và646/668scoped; không suy ra số lỗi tăng/giảm. Còn cần disposition
theo object, đường gọi, workload và tác động.

Bộ kiểm tra mới đã được nối vào default full backend và điều kiện nhận rebuild.
Việc nối harness không chứng minh default full823 hoặc rebuild823 đã chạy.
**Full control823:384/384, exit0**, không fail/skip/cancel, source/runtime không
đổi. Cleanup độc lập12lệnh gồm native823(3), hai prototype(6), full control(3),
đều không còn resource mang nhãn riêng. [Artifact](../../../artifacts/roomqc-workflow-delivery-source-local-2026-10-27.json)
ghi terminal, phạm vi và guard. [Full backend818](roomqc-candidate818-full-backend-local-2026-10-27.md)
đã hoàn tất16suite/timed health33mốc, nhưng thuộc554migration và source818.

## Lịch sử thử sửa giữ nguyên

Trước delta sản phẩm, prototype kernel trên source818 đạt22controls/4lock races;
đồng thời chứng minh lỗi source RPC nhận actor giả. Prototype source guard v2
đạt32controls/4lock races, gồm20retry nguồn và rollback tồn kho khi witness
fault. Hai lượt này chỉ là prototype, không thay proof native823. Đã kiểm dọn
độc lập6lệnh Docker, kết quả đều0resource. Baseline đỏ và contract inventory
vẫn giữ nguyên để truy vết lỗi trước sửa.

## Phần còn mở và thứ tự tiếp

1. Workflow event theo UI vẫn lệch `trigger_type/trigger_event`; không bật filter
   trước khi có quyền, nguồn sự kiện và giao dịch an toàn cho từng hành động.
2. Configured engine chưa hoàn tất; còn action/schema/config drift, target
   resolution, recipient, cron/internal authority, email/webhook/outbox.
3. Witness giao hàng đã bền vững nhưng **chưa có async dispatcher**. Browser đóng
   trước khi gọi Edge vẫn có thể chưa tạo task; hook hiện còn phụ thuộc roomInfo.
4. Legacy source không witness cần quy trình đối soát/backfill có quyền và audit;
   không tạo bằng chứng nguồn từ payload client. Các writer/recipient/offboarding
   còn lại phải có positive/denial/recovery riêng.
5. Sau sửa và freeze candidate cuối: focused checks, full control, default full
   backend, rebuild độc lập; kiểm source/schema/runtime/render và cleanup.
6. Giữ toàn bộ phạm vi T07→T09/T10→T11–T13→T14–T17→T18–T20→T21–T24→T25:
   alerts, admission/budget, signup/recovery, console, Linux/restore/on-call,
   E2E/load và pilot. Đầu vào cần khóa/quyền được tổng hợp làm sau theo plan.

**70 ca worksheet vẫn `not_run`; 122 mục release vẫn `unverified`; gate và chữ ký
không thay đổi.** Không deploy production, không mở signup public và không
chuyển implementation sang cây đang phục vụ. Chỉ mirror report/artifact đã lọc.
