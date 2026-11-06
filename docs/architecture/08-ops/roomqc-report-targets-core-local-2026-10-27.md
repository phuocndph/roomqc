# RoomQC — quyền và lệnh lưu mục tiêu báo cáo tại server

Ngày27/10/2026. Bàn giao backend Q02/F2, T03/T04/T08 trong kế hoạch toàn bộ
VPS + signup. Code chỉ ở integration, chưa cập nhật database đang phục vụ.
**Caller phải chuyển sang RPC trong cùng gói triển khai với migration571.**
Đợt này chưa khép toàn F2 hoặc nghiệm thu sản phẩm.

## 1. Lỗi đã tái hiện trước sửa

Baseline có159kiểm tra:153hồi quy đạt,6kiểm tra mới không đạt.

| Lỗi | Quan sát thực tế qua Auth/REST |
|---|---|
| Nhân viên đọc mục tiêu KPI của khách sạn chưa được giao | HTTP200, trả1hàng |
| Nhân viên đọc mục tiêu tháng của khách sạn chưa được giao | HTTP200, trả1hàng |
| Quản lý ghi KPI vào khách sạn chưa được giao | HTTP201 |
| Quản lý ghi mục tiêu tháng vào khách sạn chưa được giao | HTTP201 |
| Phiên database đã hết hạn vẫn đọc trực tiếp bảng KPI | HTTP200 |
| Khách sạnNULL trong unique constraint | Cùng tenant/tháng/metric lưu được2hàng |

Đây là lỗi quyền và cấu hình dữ liệu, không suy ra giao dịch tiền bị nhân đôi.
Baseline chạy trên Docker riêng, còn0container/volume/network theo đúng label.

## 2. Bản sửa backend

Migration CLI tạo `20261027085249_report_targets_live_scope_and_atomic_commands.sql`:

- `get_report_targets` nhận loại mục tiêu, tháng đầu ngày1 và khách sạn;
  không nhận tenant từ browser. Kiểm live actor/session, reports.view và
  assigned active hotel; owner chỉ tenant của mình. Mục tiêu financial
  hotelNULL là mục tiêu toàn tenant, chỉ owner được đọc/quản lý; monthly
  bắt buộc khách sạn cụ thể. Owner hoặc manager đúng role hiện thời mới được ghi.
- `replace_report_targets` lưu cả bộ giá trị bằng một transaction, có
  expected revision, command UUID, mutex theo actor/key và scope. Revision
  gồm bộ đếm và fingerprint toàn hàng, nên thay đổi trusted rows/notes cũng
  làm bản đọc cũ bị từ chối. Hai người cùng revision chỉ một được commit.
- Giá trị phải là JSON number đúng metric/scale/range; occupancy0–100,
  tiền không âm trừ GOP/GOPPAR cho phép kế hoạch lỗ. Gửi bộ rỗng là yêu cầu
  xóa toàn bộ mục tiêu trong đúng scope. Ghi chú metric cũ hợp lệ được giữ.
  Mục tiêu financial và monthly vẫn là hai loại cấu hình hiện có, chưa tự hợp
  nhất hoặc ghi đè loại này bằng loại kia.
- Values, revision, activity log và durable result commit/rollback cùng nhau.
  Replay cùng key/payload trả cùng result, payload khác409; lấy kết quả qua
  `get_report_target_command`. Lookup actor-bound và kiểm quyền lại hiện thời;
  key chưa có trảnot_found. Kết quả không chứa credential.
- Hai bảng private lưu revision và command/result; không grant browser/machine.
  Ba public wrapper đều invoker; entrypoint definer đặt private, search_path
  rỗng, tự kiểm toàn bộ quyền và scope. Bỏ direct grants của financial_targets/
  monthly_targets, gồm service_role; policy cũ không tự cấp lại table privilege.
- Các nhóm hotelNULL bị trùng được đánh dấu legacy_review, giữ nguyên các
  hàng và giá trị để đối soát. Unique index chặn thêm canonical duplicate.
  Reader báo review_required và không chọn ngẫu nhiên một giá trị. Chỉ
  owner với explicit resolve, expected revision và bộ giá trị mới được thay;
  toàn bộ hàng cũ được giữ trong previous_rows của private command history.
  Chưa diễn tập populated upgrade metadata này trên chain có dữ liệu.

## 3. Bằng chứng có phạm vi

| Mục | Kết quả |
|---|---|
| Candidate |980file, SHA `4e9fc77fb07911b216386f22930a7f1a62976b940a3b6d419a65d4c81791bcee`|
| Schema/source binding |571business+12directory migrations,183file backend source binding|
| Native Auth/REST/PostgreSQL |**214/214**, exit0; giữ153kiểm tra961 và6ca baseline nay đạt, thêm55ca|
| Race trong214 |**14**, có khóa thật;5ca target mới: cùng revision, thu hồi quyền đọc, assignment ghi, role manager và hết phiên khi chờ|
| Fault |Audit và receipt lỗi23514: values/revision/audit/result đều rollback; bỏ fault rồi retry cùng key thành công|
| Replay/recovery |12request cùng key một receipt/cùng kết quả; actor khác không thấy result; lookup sau commit giữ đúng result|
| Direct ACL hiện hành |37bảng,444browser/probe denials,136private service denials,77positive reads;24+8denials mới cho2bảng target;3dynamic invoker denials|
| Drill ACL độc lập |4/4node tests, exit0, không skip; Postgres fixture riêng kiểm drift/grant trái phép/unknown table và phục hồi|
| Full control cùng candidate |**440/440**, exit0, không fail/cancel/skip/todo; kết thúc09:06:10UTC|
| Advisors |721findings:37no-policyINFO,7FKINFO,494unused-indexINFO,183permissiveWARN; chưa disposition đầy đủ|
| Native cuối |Run52d66c369326, kết thúc09:02:55UTC ngày27/10/2026|
| Bảo toàn |Source/runtime/migrations/schema trước-sau không đổi trong run; primary implementation/index, hai ledger và70hàng worksheet không đổi|

Artifact: [bằng chứng đã lọc](../../../artifacts/roomqc-report-targets-core-local-2026-10-27.json).
Không đưa raw log, env, ACL fixture bundle, tài khoản, JWT hoặc DSN vào hồ sơ.

Lịch sử chưa đạt được giữ: baseline153/159; lần sau206/206nghiệp vụ đạt nhưng
exit1 ở catalog ACL vì danh sách đóng mới bao35bảng, chưa tính2bảng target.
Đã mở rộng builder, independent fixture và reference gate thành37, giữ nhóm
legacy216/60denials riêng; lần cuối214/214và ACL37đạt. Không cộng các lượt cũ
vào tổng cuối hoặc bỏ qua exit1 vì các assertions nghiệp vụ đã xanh.

Lookup/replay đã được thực thi sau một commit biết trước; chưa mô phỏng cắt
TCP làm mất response trên browser. Phiên hết hạn khi chờ được kiểm theo clock,
không coi transaction-start time là thời gian hiện tại.

## 4. Giới hạn và đầu việc tiếp

**Chưa nối frontend. Không áp migration571 riêng lẻ:** các hook/page hiện còn
đọc/ghi trực tiếp bảng và sẽ bị từ chối sau cutover schema. Phải chuyển
`useFinancialTargets`, `useMonthlyTarget`, `SetTargetsDialog` và phần target
trong `FixedCostsSettingsPage` sang DTO/RPC mới; lưu batch, giữ pending/key trước
network, lookup/retry sau gián đoạn, không toast hoặc nhận response sau đổi
actor/hotel/runtime/kỳ. Form cần báo lỗi/legacy review và giữ draft khi lưu lỗi;
chưa thay nhập123.45thành12345hoặc lưu từng metric với partial success.

Nhận [mục19.23](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1923-phiếu-nhận-sau-backend-report-targets980),
rồi advice server/privacy/provider, mobile cash/debt/projected, F3 exports,
populated upgrade566→567→568→569→570→571; tiếp Q02writer→Q03→Q04 và đủ tám đợt
VPS/signup. Migrations cũ570giữ checksum; fresh replay571không thay populated upgrade.
Frontend330/330thuộc979, chưa chạy lại/khẳng định phù hợp API mới980.
Chưa browser/Android/download/default-full/rebuild/deploy hoặc đo sức chứa.
70ca not_run/122entries unverified, reviewer/signoff/gates giữ nguyên; goal active.
