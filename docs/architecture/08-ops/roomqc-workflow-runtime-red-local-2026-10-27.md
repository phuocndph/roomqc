# RoomQC — baseline workflow thực: 4 lỗi cần sửa

Ngày: 27/10/2026, Asia/Bangkok. T01/T03/T08, phần workflow/recipient/offboarding.
Candidate818, source nền `ea788e013096d699c6b7b0c30ee0bb23a6aea0dd9663d272bc1a91202dc87196`,
554business +12directory migrations. Source workflow và caller/UI được đóng dấu
bổ sung trong artifact. Đây là baseline red, không phải nghiệm thu sản phẩm.

## Kết quả đã quan sát

Actual Edge chạy source sản phẩm không sửa trên runtime Supabase đã pin, gọi
GoTrue và REST thật, replay đủ554migration trong backend Docker riêng. Runtime
không mở port và chỉ nối mạng internal. Không gửi Internet email hoặc Telegram.
Fixture dùng tenant/nhân viên/phòng và phiếu giao hàng tổng hợp, FK hợp lệ;
không nới CHECK constraint để ép workflow chạy.

**10controls:6đạt,4không đạt; native exit1.** Source/runtime/supplement trước–sau
khớp, schema fingerprint cuối khớp, cleanup và source verification đã chạy.
Artifact giữ kết quả từng ca và kiểm độc lập tài nguyên còn lại.

| Control | Expected | Actual | Kết luận |
|---|---|---|---|
| Owner kích hoạt cấu hình event lưu theo giao diện |1workflow và room note được cập nhật |HTTP200, executed0, room không đổi | Lỗi chức năng |
| Owner live, fallback giao hàng hợp lệ |1task xác nhận giao hàng |HTTP200, executed1,1task | Positive đạt |
| Tài khoản tenant khác |401/403, không effects |403, không effects | Đạt |
| Staff gọi hotel khác trong cùng tenant |401/403, không effects |200, executed1, tạo task | Lỗi ranh giới hotel |
| Owner account_locked |401/403, không effects |200, executed1, tạo task | Lỗi kiểm trạng thái hiện thời |
| Owner inactive |401/403, không effects |200, executed1, tạo task | Lỗi kiểm trạng thái hiện thời |
| GoTrue logout và dùng JWT cũ |Session đã bị xóa;401/403, không effects |Native session0;401, không effects | Đạt trong lượt này |
| Owner login lại |Khôi phục thao tác hợp lệ |200, executed1 | Recovery đạt |

Hai control còn lại xác minh fixture Auth/provision và việc GoTrue logout thật.
Không gộp findings thành số endpoint độc lập: ba lỗi quyền xuất hiện qua fallback
`delivery_stop_completed`; engine có action khác vẫn cần coverage riêng.

## Nguyên nhân và phạm vi cần sửa

1. UI và schema lưu `trigger_type='event'`, sự kiện cụ thể ở `trigger_event`.
   Handler lại lọc `trigger_type` bằng tên như `room_status_change`, nên không
   tìm thấy workflow. Baseline giữ đúng contract event này; action fixture dùng
   dạng backend hiện hiểu để tránh trộn nguyên nhân với lỗi action-config.
2. Handler dùng service-role và chỉ đối chiếu `users.tenant_id`. Đường fallback
   chưa chứng minh quyền hotel hoặc trạng thái active/locked trước tác động.
   Actual test đã tạo được task trong ba trường hợp phải từ chối.
3. Không được chỉ đổi filter để kích hoạt toàn engine: hành động hiện đọc event
   do client khai báo, dùng service-role và nhiều write/network calls riêng lẻ.
   Cần server xác minh nguồn sự kiện, scope, trường được sửa và kết quả durable.
4. `UpdateRecordAction.tsx` lưu `field_updates/target_mode`, handler đọc
   `fields/table/record_id`; một số action names/UI/schema cũng khác nhau.
   Đây là **finding từ source cần kiểm riêng**, chưa gọi là runtime proof của
   baseline10controls. Formula/increment, recipients, webhook/email/Telegram,
   audit/stats và lỗi giữa các action cần ma trận tương thích thực tế.

Các file chính: `supabase/functions/execute-workflow/index.ts`,
`src/lib/triggerWorkflow.ts`, `src/hooks/useWorkflows.ts`,
`src/components/settings/workflows/steps/WorkflowTrigger.tsx`,
`src/components/settings/workflows/actions/UpdateRecordAction.tsx` và migrations
workflow. Không kết luận endpoint ngoài đã ngừng dùng từ việc thiếu caller local.

## Phiếu sửa có thứ tự — việc con của T03/T08

| Bước | Thực hiện | Điều kiện nhận |
|---|---|---|
|1. Chốt contract đang dùng | Inventory20event keys, source record/transition và6action UI; so template/UI/schema/handler, manual/schedule/cron consumers | Mỗi config có đường xử lý rõ; ghi cả legacy và consumer chưa xác minh, không âm thầm bỏ field/action |
|2. Nguồn event và quyền hiện thời | Đọc source record/transition từ server; tenant/hotel/actor/session/capability lấy từ nguồn tin cậy; loại client-supplied role/tenant làm nguồn cấp quyền | Owner/staff hợp lệ đạt; foreign/unassigned/inactive/locked/revoked bị từ chối không effects; khóa thật và recheck tại commit |
|3. Transaction và replay | Mutation nghiệp vụ/event/action nội bộ + audit/receipt cùng transaction phù hợp; stable event/delivery ID và expected version; retry không nhân đôi task/stats | Audit/receipt fault rollback; response loss đọc lại kết quả; hai process/20replay chỉ một effect; không dùng service-role multi-request thay atomicity |
|4. Delivery fallback | Khóa và xác minh phiếu/stop/room/hotel từ DB, derive nội dung; scope theo nghiệp vụ giao hàng, không yêu cầu quyền housekeeping bất hợp lý cho người giao | Phiếu đúng đã giao tạo đúng1task; khác room/hotel, chưa giao, replay, revoked/locked và unknown response có expected/actual rõ |
|5. Cấu hình event/action | Đồng bộ trigger_event; typed allowlist target/field/relation; increment atomic; formula parser không eval tùy ý; giữ config cũ có migration/compatibility rõ | Bài thử từ config thực lưu bởi UI; unsupported/config lỗi báo rõ trước effects, không trả success0 che lỗi |
|6. Recipient và external effects | Recipient active/đúng tenant+hotel; external delivery qua outbox bounded, chống SSRF/secret/log leak; cron/worker có authority riêng | Không gửi đến foreign/inactive; timeout/restart/retry có durable outcome; provider thật để môi trường sau khi có khóa/quyền |
|7. Caller và giao diện | Typed event/result, error mapping, stable key, pending recovery; cache/request hủy đúng actor/workspace | Web/Android không báo thành công giả, không tạo key mới sau mất response; positive hiện có vẫn dùng được |
|8. Hồi quy và tích hợp | Đưa actual workflow controls vào pipeline chuẩn, freeze candidate mới; focused/full control/default full backend/rebuild tương ứng | Giữ red history818; source/schema/runtime/native exit/cleanup khớp; không dùng384/384 cũ để ký workflow |

Tên event/action được kiểm kê chính xác ở bước1; con số20/6 là inventory quan
sát từ source hiện tại, không chứng minh đủ20/6luồng đã được chạy. Các bước là
việc con của T03/T08, không thêm task/gate hoặc thay70ca của kế hoạch.

## Monitor role: bằng chứng catalog bổ sung

Trong cùng fixture, query effective grants cho `roomqc_monitor` trên **162bảng
public/private** thấy **0bảng có quyền đọc hoặc ghi theo table/column cùng schema
USAGE**. Bằng chứng này có tính cả quyền kế thừa qua catalog PostgreSQL; không
gọi nó là thử CRUD dưới role monitor, hoặc chứng minh mọi function/view/definer
và dữ liệu thống kê không thể bị đọc gián tiếp.16advisor WARN mang role monitor
không tự đồng nghĩa16lỗ hổng; vẫn cần disposition đường gọi/pg_read_all_stats/
runtime secrets và exporter theo workload trước khi khép T05/T08.

## Quan hệ với backend tích hợp đang kiểm

Default full818 là lượt riêng, đang kiểm health/recovery trên source đã freeze;
baseline này không chỉnh product source hoặc dùng dữ liệu của lượt đó.
Pipeline818 chưa có các control workflow vừa bổ sung. Dù lượt full818 sau đó
đạt,4lỗi native mới vẫn phải sửa và hồi quy; không coi full pass là mọi module
đều an toàn. Independent rebuild818 phải chờ native default terminal và chỉ
chứng minh repeatability của đúng candidate, không thay T21 simultaneous A/B.

**70worksheet rows vẫn `not_run`;122release entries vẫn `unverified`; không đổi
gate/reviewer/signoff.** Giữ mục tiêu toàn VPS/signup, tiếp T07→T09/T10→T11–T25
sau bàn giao nền. Chỉ mirror report/artifact đã lược thông tin nhạy cảm.
