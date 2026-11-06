# RoomQC — inventory contract workflow trước khi sửa engine

Ngày27/10/2026, Asia/Bangkok. Việc conT03/T08 trên candidate818; không thêm task
hoặc gate. [Baseline Edge thực](roomqc-workflow-runtime-red-local-2026-10-27.md)
đã có10controls/6pass/4fail. Tài liệu này bổ sung inventory source và catalog
CHECK constraints, không biến source review thành kiểm thử mọi luồng.

## Inventory có phạm vi rõ

AST TypeScript đối chiếu15source files: **20event constants**, **18event lựa
chọn ở UI**, **18hook call sites** (15constant references,3string literals,
0dynamic expression chưa resolve), **6action lựa chọn ở UI**, **5case trong
executeAction**. Artifact giữ từng caller, line, event fields và source hash.
Các call site tồn tại trong source; chưa gọi tất cả là luồng đã chạy E2E.

Ba string literal ởRoom Checks/Setup Room đã được nối với constant tương ứng;
không báo nhầm chúng là dynamic hoặc kết luận không có caller. Tìm caller local
không chứng minh cron/deployed consumers bên ngoài đầy đủ.

## Đối chiếu action

| Action chọn ở UI | CHECK thực tế cho lưu | Handler có case | Phần phải khép |
|---|---|---|---|
|send_notification |Có |Có | Config channels/recipients, live scope, outbox và kết quả provider |
|send_email |Có |Không | Handler/queue typed tương ứng, không trả success khi bỏ qua |
|create_housekeeping_task |Không |Có | Migration giữ các action cũ; typed source/room/hotel/assignee và receipt |
|create_maintenance |Có |Có | Canonical source, field validation, atomic audit/receipt |
|update_record |Có |Có | UI lưufield_updates/target_mode, handler đọcfields/table; phải đồng bộ, increment atomic và formula an toàn |
|call_webhook |Không |Không | Schema/handler/outbox, URL/IP/DNS/redirect/timeout/secret boundary; local sink trước provider thật |

CHECK actual có9action types: create_maintenance,create_purchase_order,
create_transaction,send_notification,send_email,update_record,webhook,wait,
conditional. Không tự xóa các giá trị legacy khi thêm hai giá trị UI còn thiếu.
Handler còn cócreate_log ngoài UI/CHECK; inventory consumer của đường này còn mở.
Mỗi action cần config migration hoặc adapter rõ ràng, không âm thầm bỏ trường.

## Bằng chứng schema thực

Một transaction **READ ONLY** trên DB Docker exact-owned của lượt full818 đang
chạy đã đọcpg_constraint và schema fingerprint. Schema khớp manifest818; CHECK
thực đúng9types trên và không cócall_webhook/create_housekeeping_task. Đây là
catalog proof về cấu hình được chấp nhận, chưa phải chạy mọi INSERT/UI action.
Query không chỉnh schema/data, không đọc tenant thật hoặc secret; không suy lượt
full backend đã hoàn tất từ observation giữa chừng.

## Event và nguồn dữ liệu

20constants gồm room_status_change,room_check_completed,room_standards_applied;
inventory_low_stock,inventory_transaction; năm event adjustment; hai event
maintenance; laundry_batch_status_change; bốn event housekeeping; delivery_stop_completed;
daily_inventory_report,daily_room_status_report. UI còn córoom.checkout chưa
nối với constant/caller local. Artifact ghi số caller cho từng event và phần
chưa có authoritative transition mapping; không gọi “không có caller” là “bỏ dùng”.

Một số caller đang gửi tên hiển thị thay vì stable source ID, ví dụ low-stock
chỉ cóitem_name/alert_type. Có đường cập nhật phòng đã loại status khỏi UPDATE
nhưng còn gửi event theo data.status. Đây là lý do phải nối source event/record/
transition từ server trước khi bật lại filter, không dùng payload client làm
chứng cứ rằng nghiệp vụ đã xảy ra. Các vấn đề caller này đang ở source review;
chưa có runtime red riêng cho từng trường hợp.

## Thứ tự triển khai tiếp

1. Hoàn tất authoritative source-transition mapping cho20constants,room.checkout,
   manual/schedule/cron và các config legacy. Chốt allowed effects theo nghiệp vụ.
2. Xây event/command có live actor-session-hotel scope, audit/receipt/replay;
   delivery fallback derive từ phiếu/stop thật và chỉ tạo một task.
3. Đồng bộ UI/schema/handler cho đủ6action; giữ legacy fields có disposition;
   external effects đi qua outbox bounded và sink local khi chưa có khóa/quyền.
4. Đưa baseline4fail và ma trận event/action vào pipeline chuẩn, giữ positive/
   negative/no-effects/recovery/race. Chạy candidate mới theo ảnh hưởng delta.

Không chỉ đổitrigger_type→trigger_event rồi kích hoạt engine service-role hiện
tại. Không coi tests control384/384 hoặc full818 là nghiệm thu các workflow chưa
có trong harness.70worksheet rows/122release entries/gates/signoff giữ nguyên;
mục tiêu tiếp theo vẫn là toàn bộ VPS/signup theo kế hoạch hiện hành.
