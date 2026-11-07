# RoomQC — Q02: sửa kiểm phòng nhanh/hoàn tác, còn mở writer graph

**Kết quả:** nhóm quick-check/undo đạt **39/39 native**. Toàn bộ diagnostic Q02
có **50 kiểm tra:45đạt/5chưa đạt, exit1**; chưa khép Q02. Hồi quy nguồn phòng
đạt **77/77,exit0**, gồm6lock races/8client controls; full control **384/384,exit0**;
TypeScript exit0. Cùng source có phạm vi **851file**, SHA
`b898c4f97668ff937eeca623e7c0b028cb646484670cb367868ad67e3b3dfe24`,
**558business+12directory migrations**. Bản sửa nằm tại worktree integration;
chỉ tài liệu/artifact đã lọc được bàn giao sang primary, chưa deploy VPS.

## 1. Lỗi đã xác nhận và thay đổi

Baseline850 qua Auth/REST thật đã thấy quick-check trả200, tạo bản kiểm nhưng
phòng `vacant_dirty` vẫn bẩn và không có canonical room event. Chủ bị khóa/hết
phiên vẫn tạo được check; người chưa gán hotel vẫn ghi được; undo lặp thêm
notes/audit và không kiểm lại assignment. Race chờ khóa thật cũng cho phép ghi
sau khi session hết hạn. Đây là các readback/effects, không suy từ source.

Migration forward `20261026213809_room_quick_check_live_commands.sql`:

- Kiểm native Auth/profile/role/session/hotel hiện tại trước ghi; khóa theo
  actor→command→room→hotel và kiểm wall clock sau chờ khóa, sau insert kết quả.
- Quick-check chuyển `vacant_dirty`→`vacant_clean`, `occupied_dirty`→`occupied_clean`
  qua nguồn phòng đã có; check, xóa phiên kiểm, room, audit, canonical source và
  command result cùng transaction. Không nuốt lỗi transition/audit.
- Giữ ảnh bắt buộc, bật/tắt chế độ và rate limit; bound notes/photo count.
- Lưu command theo actor/key/request trong bảng private có RLS, không cấp quyền
  trực tiếp cho browser/probe/service. Cùng key replay trả cùng check/result;
  khác payload hoặc operation trả409. Có RPC đọc lại kết quả theo quyền hiện tại.
- Undo khóa lại room/check, kiểm người/quyền/hotel/session, thời hạn10phút và
  check mới hơn. Undo cùng key replay một kết quả; undo mới trên bản đã undone
  trả409, không thêm notes/audit. Undo vẫn chỉ hoàn tác bản kiểm, không tự đổi
  ngược trạng thái phòng đã được nghiệp vụ khác sử dụng.
- Giữ lời gọi4args quick/2args undo qua default command parameter và forwarding
  body cho OID cũ; frontend types có optional key và result lookup mới.

## 2. Kết quả theo từng lần chạy

| Run | Phạm vi / kết quả | Giới hạn |
|---|---|---|
| Baseline850,fixture2e9aae018b32/backend67ab7f83c282 |557migrations;31controls,17pass/14fail;1actual lock race;exit1;schema/source/runtime khớp,cleanup0 | Fixture manager có role hotel_manager nhưng level staff. Không dùng positive/denial của actor này để khẳng định luồng manager hợp lệ; owner/clock/room readbacks giữ bằng chứng riêng |
| Attempt851,fixture368244d2ae08/backend0b2596ed5ce5 |558migrations;exit1 tại fixture assertion403≠200,không có terminal controls đầy đủ;cleanup0 | Guard mới phát hiện fixture manager không nhất quán. Giữ lịch sử; sửa fixture level manager, thêm precondition coherence; không tính run này là proof sản phẩm |
| Q02 sửa851,fixture94a48feba31b/backend419ee579546a |50controls,45pass/5fail;quick/undo39/39;actual room-lock expiry bị chặn;schema/source/runtime khớp;exit1 đúng vì còn5fail | Diagnostic backend có phạm vi, chưa UI/browser/Android và chưa khép mọi writer |
| Source hồi quy851,fixtureb9a52ed56a0c/backende6e4e5f243e3 |77/77,6lock races/8client ứng dụng thật;nativeexit0;schema/source/runtime khớp | Client thật thuộc room-transition/cancellation đã có; không phải frontend quick/undo recovery mới |
| Full control851,rune3e734cf2d13 |384/384,không fail/cancel/skip;exit0;source/runtime khớp | Không thay default full backend hoặc independent rebuild851 |
| TypeScript851 |`tsc --noEmit -p tsconfig.app.json`,exit0 | Chưa chạy browser/Android hoặc hook E2E quick/undo |

Q02 kiểm20request đồng thời cùng quick key chỉ tạo1check/1room event/1room audit;
20undo cùng key chỉ có1undo audit. Lookup/replay sau mất quyền bị chặn. Fault
audit của check/audit của room/command-result và expiry sau insert rollback toàn bộ;
gỡ fault rồi cùng key phục hồi đúng1check/event. Source hồi quy77 và full control
được chạy độc lập trên cùng source851, không kế thừa843.

Direct ACL thực trên schema558: **26bảng,312browser/probe denials,92private
service denials,55positives,26snapshots**; bảng command mới có12/4denials. Fixture
Q02 populate6/26, fixture source populate5/26. Đây là SQL role assumptions và
direct grants, chưa chứng minh toàn bộ indirect closure. Bộ fixture ACL riêng
trong full control populate26/26 và phát hiện các grant sai rồi phục hồi.

Native CLI2.121.0 advisors ghi **664findings**:26INFO no-policy,7INFO FK,
496INFO unused-index,135WARN permissive-policy. Chưa disposition từng object;
không đồng nhất số findings với số lỗi hoặc dùng count để ký security gate.

Cleanup độc lập cho baseline,attempt,Q02,source và full control: **15kiểm tra**
container/volume/network,tất cả0. Không reset DB đang phục vụ/CRM hoặc sửa index,
ledger,70dòng worksheet. Không có tiến trình của các run trên còn chạy.

## 3. Năm kiểm tra Q02 vẫn chưa đạt

| Kiểm tra | Actual trên source851 | Tác động / phần nhận tiếp |
|---|---|---|
| Manager hợp lệ chuyển booking checked_in |403,`FORCE_REQUIRES_OWNER`; fixture role/level đã được kiểm coherence | RW3 phải dùng quyền nghiệp vụ chuyển phòng, giữ owner-only force của RPC chính |
| Chuyển booking tại hotel chưa được gán |200và có effects | RW3 cần scope/live authority trước mọi booking write |
| Chuyển booking confirmed vào room out_of_service |200và có effects | RW3 cần chuẩn hóa trạng thái target và kiểm availability/overlap dưới lock |
| Check-in tạo canonical source |Nhận phòng thành công nhưng0canonical events | RW4 cần nguồn room event/result cùng booking/room transaction, không chỉ direct UPDATE |
| Check-out tạo canonical source |Trả phòng thành công nhưng0canonical events | RW4 tương tự; kiểm cả tiền/audit/receipt khi fault |

Transfer booking audit đã có1dòng trong positive hiện tại; giả thuyết “luôn mất
audit vì signature cũ” không được baseline xác nhận. Vẫn cần fault proof để
đóng nhánh exception swallowing; không xóa hoặc hạ assertion để suite xanh.

## 4. Phần chưa khép và việc tiếp theo

Frontend quick/undo hiện vẫn có caller cũ không gửi stable command key. Backend
đã hỗ trợ key/result lookup; **chưa có recovery UI cho hai operation này**, chưa
chứng minh reload/response loss trên browser/Android. Cần nối caller, giữ pending
khi outcome chưa rõ, safe errors và toast đúng trạng thái; không gọi đây là E2E
exactly-once. Retention/abuse của receipt cần policy và proof riêng.

Graph catalog hiện có34function candidates/20triggers; lexical scan không đóng
dynamic/deployed callers. RW3–RW8 còn transfer, check-in/out, booking-sync,
timer trusted-worker, safe/unchecked/Edge và lean/reopen/QC/setup/cancel paths.
Luồng quick/undo mới cùng khóa room; writer khác chưa theo cùng contract có thể
để race check mới/undo, nên chưa khẳng định compound graph đã atomic toàn bộ.

**Nhận tiếp:** RW3 transfer và RW4 check-in/out với5red controls giữ nguyên;
bổ sung denial/fault/real lock races/caller recovery, rồi RW5–RW8. Sau Q02 mới
Q03 engine/dispatcher và Q04 freeze/default full/rebuild. Toàn chuỗi còn
T07→T09/T10→T11–T13→T14–T17→T18–T20→T21–T24→T25.

**70worksheet rows vẫn not_run,122release entries vẫn unverified,gates/signoff
không đổi.** Linux/VPS/DNS/email/offsite/load/pilot chưa nghiệm thu; thiếu khóa
hoặc quyền được tổng hợp riêng, tiếp tục phần local độc lập.

Artifact: [kết quả native có phạm vi](../../../artifacts/roomqc-room-writers-quick-check-partial-local-2026-10-27.json).
Đối chiếu [kế hoạch hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md),
[phiếu triển khai](roomqc-vps-signup-detailed-delivery-2026-10-26.md#18-phiếu-điều-phối-chốt-27102026)
và [70ca nghiệm thu](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md).
