# RoomQC — lệnh nguồn đổi trạng thái phòng, local 27/10/2026

Phần triển khai của T01/T03/T04/T08, W2/R2–R4 và nền R6. Đã có bản sửa database
và kiểm thử native; **chưa hoàn tất W2 hoặc toàn VPS + signup**. Bằng chứng trước
sửa giữ ở [baseline đỏ](roomqc-room-source-red-local-2026-10-27.md).

## Kết quả và phạm vi

| Kiểm chứng | Kết quả |
|---|---|
| Native source diagnostic | **52/52**, native exit0; Auth/REST thật; ba race chờ khóa thật nằm trong 52 kiểm tra |
| Source / schema | Candidate827, scoped SHA `f3d17114ed3734be86ea2350369e0f240503e9fa9f49a15e0f2c63fad5061336`; **556 business + 12 directory migrations**, runtime binding163 file |
| Full control cùng source | **384/384**, exit0; không fail/skip/cancel; có fixture ACL độc lập populate25/25 |
| Direct ACL trong native diagnostic | **25 bảng**, 300 browser/probe denials,88 private service denials,53 positives,25 snapshots giữ nguyên; fixture này populate5/25 |
| Cleanup | Source diagnostic và full control đều đã dọn;6 kiểm tra độc lập container/volume/network đều còn0 theo đúng label của từng run |
| Native advisors | 663 findings:25 no-policy,7 FK,496 unused indexes,135 permissive-policy warnings; chưa disposition toàn bộ |

Source manifest có phạm vi, không phải hash toàn repository hay bản đang phục vụ.
Không so count663 với scan657/646/668 để kết luận giảm hoặc tăng rủi ro. Direct
ACL chỉ chứng minh quyền truy cập bảng trực tiếp; chưa chứng minh mọi đường RPC,
trigger, view, definer hoặc toàn quyền nghiệp vụ gián tiếp.

Diagnostic run `78d5fb76396a`, fixture `0f690ec386f9`, từ **27/10/2026
03:26:24–03:27:51 Asia/Bangkok**. Source/runtime/migration trước–sau khớp,
temporary fault trigger được gỡ và schema fingerprint khớp. Không gọi Edge,
giao diện, VPS đang phục vụ, CRM hoặc provider Internet trong suite nguồn này.

## Bản sửa đã thực hiện

Migration `20261026200830_room_workflow_source_commands.sql` đã có nội dung,
thay cho trạng thái rỗng ở baseline trước. Các thay đổi:

1. `transition_room_status` kiểm Auth/profile/role/session và membership hiện
   thời; khóa lệnh, phòng và khách sạn theo thứ tự; kiểm tenant, khách sạn active,
   assignment và quyền chuyển trạng thái. Kiểm thời gian thực sau chờ khóa,
   sau thay dữ liệu và sau ghi kết quả; không dùng `now()` làm hạn phiên cố định
   từ đầu giao dịch.
2. Thêm `_command_id` tùy chọn sau sáu tham số cũ. Cùng actor/key/payload trả
   kết quả đã ghi; cùng key khác payload trả409; replay không đảo trạng thái
   nếu phòng đã được đổi bằng lệnh khác sau đó. Receipt lookup qua
   `get_room_transition_result`, vẫn kiểm quyền hiện tại.
3. Lưu command, request, old/new, reason/force, snapshot nguồn, event ID và
   kết quả trong private table cùng giao dịch cập nhật phòng. Chỉ trạng thái
   thực sự đổi mới tạo canonical event; nguồn nằm `pending`, chưa có dispatcher.
4. Dùng audit trigger hiện có cho status change, bỏ INSERT `state_change` trùng
   trong RPC. No-op không thêm audit đổi trạng thái; deadline DND/OOS thay đổi
   có audit `update`. Lý do và ngữ cảnh yêu cầu được giữ trong command/source.
5. Giữ state machine, force của owner, DND/OOS, deep-clean timestamp. Deadline
   DND mặc định được giữ khi gọi lại cùng trạng thái; gia hạn có chỉ định vẫn
   cập nhật. Caller cũ không gửi key vẫn hoạt động nhưng chưa có chống retry
   xuyên mạng cho mọi ý định; mỗi lần gọi cũ nhận command mới, status no-op không
   tạo lại event/audit đổi trạng thái.
6. Đưa signature cũ ra private để tránh overload mơ hồ và thay body cũ bằng
   forwarding guard. Revoke trực tiếp bảng/helper/private legacy function với
   anon/authenticated/service_role. Public source và result chỉ cấp cho
   authenticated; service role không được giả làm actor browser.
7. Thêm `scripts/control-backend-room-source-checks.mjs`, nối vào diagnostic
   `room-source`, default full pipeline và điều kiện nhận independent rebuild.
   Mở rộng direct ACL lên25 bảng và parent-boundary snapshot lên40 bảng.

## Đối chiếu các phát hiện trước sửa

| Baseline | Sau sửa, đã kiểm trong native suite |
|---|---|
| Staff ở khách sạn chưa được giao trả200, có effects | Bị từ chối, phòng/audit/command giữ nguyên |
| Foreign tenant trả400 nhưng không effects | Safe denial401/403, không effects; không tuyên bố baseline đã ghi chéo tenant |
| 20 yêu cầu tạo21 state-change audit |20 cùng command:1audit/1event/1result;20 caller cũ:1audit/1event và20command, gồm các no-op |
| Không có canonical workflow event ID | ID được trả từ mutation đã commit và đối chiếu với private source, đúng tenant/hotel/room |
| Session hết hạn khi chờ khóa vẫn ghi dữ liệu | Chờ khóa phòng/khách sạn/command thật đều bị chặn; delay khi ghi source/result cũng rollback toàn effects |

Owner/staff hợp lệ và locked-owner denial cũ giữ hồi quy. Có thêm positives và
denials cho inactive/deleted profile, role bị gỡ, assignment bị thu hồi, hotel
inactive, logout, force/state machine, no-op, DND extension, OOS/deep clean,
conflict, lookup khác actor và service/anonymous. Fault audit và fault insert
source/result đều rollback phòng+audit+command; gỡ fault, thử lại cùng key chỉ
ghi một kết quả. Ba lock races nằm trong52, không cộng thành55; delay insert
không được gọi là một lock race thứ tư.

## Còn phải triển khai

- **R1/R5:** chuyển đủ caller sang key ổn định và result recovery; cập nhật
  generated types, error mapping và cache/identity lifecycle. Bỏ event giả trong
  `useUpdateRoom`; mark-ready lấy old/new/event từ server, kiểm task liên quan.
  Backend lookup đã có chưa chứng minh UI đã dùng hoặc phục hồi sau F5.
- **Writer graph:** check-in/out, room checks, bulk, reception, change-booking-room,
  timer và `update_room_status_safe` cần disposition và native regression. Một
  RPC đã sửa chưa bảo vệ toàn graph; force/legacy status ở writer cũ cần kiểm riêng.
- **W3–W8:** configured engine/config version/atomic save, action/schema
  compatibility, durable dispatcher, caller/legacy reconciliation, recipient/
  offboarding/cron/email/webhook/outbox và advisor/indirect closure.
- **W9:** freeze candidate sau mọi delta, default full backend và independent
  rebuild trên bản cuối. Full818 là checkpoint khác; full control384/384 không
  thay hai run này. Native suite mới đã được nối nhưng chưa chạy default full827.
- Sau đó **T07 → T09/T10 → T11–T13 → T14–T17 → T18–T20 → T21–T24 → T25**:
  cảnh báo, phân bổ tài nguyên, signup/jobs/abuse, hai console, Linux/restore,
  E2E/tải và pilot. Phần cần khóa/quyền tiếp tục ghi riêng.

[Artifact đã lọc](../../../artifacts/roomqc-room-source-commands-local-2026-10-27.json)
ghi từng control, full-control terminal, cleanup và giới hạn. Chỉ chuyển tài
liệu/artifact sang cây chính; implementation vẫn ở integration. Không deploy
hoặc sửa serving DB trong lượt này.70 ca `not_run`,122 release entries
`unverified`; gates/reviewer/signoff giữ nguyên. Proof này khép một phần nguồn
phòng, chưa xác nhận sản phẩm đủ điều kiện đưa khách thật vào sử dụng.
