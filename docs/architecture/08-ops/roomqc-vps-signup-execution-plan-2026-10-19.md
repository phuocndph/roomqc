# RoomQC — kế hoạch thực thi chi tiết quản lý VPS và đăng ký tự động

**Điểm nhận việc mới nhất — EC05 partial, không thay toàn bộ roadmap:**
[Policy/SDK diagnostic](roomqc-m06-password-policy-diagnostic-local-2026-10-21.md)
có 33 controls/18 đạt/15 fail trên candidate 700/538, terminal exit 1/cleaned 11.
Server completion/live-state/forced caller/fault/races nhận tiếp tại
[plan mục 15.7](roomqc-vps-signup-preparation-plan-2026-10-21.md#157-phiếu-ec05-hiện-hành--hoàn-tất-server-sau-policysdk-diagnostic).
Control 203/203 và client tests không thay full A/B/Auth/E2E. Giữ các handoff
bên dưới làm lịch sử; tám đợt/27 gói/25 bước/70 case, 122 releaseAcceptance và
gate L/S/P/U/B không đổi. Bản cập nhật kế hoạch này không deploy serving/VPS/provider.

**Nhận tiếp:** [employee fix full A/B local đã đạt](roomqc-m06-employee-atomic-fix-local-2026-10-21.md)
→ [caller inventory ban đầu](roomqc-m06-employee-caller-inventory-local-2026-10-21.md), phiếu 15.2.4.
Candidate 682/537: A/B exit 0/cleaned, 280/1.764/20 + employee 30/4, final recovery;
control 194/194. Reviewer/full matrix/E2E và đủ tám đợt vẫn mở; gate không đổi.

**Điểm hiện hành — toàn bộ VPS + signup, Plan + nghiệm thu:**
[kế hoạch chi tiết](roomqc-vps-signup-preparation-plan-2026-10-21.md) và
[quy trình nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).
**A/B thành công gần nhất, source cũ:** [bản sửa account/session năm bảng — A/B local](roomqc-m06-business-actor-fix-local-2026-10-21.md).
Source **668 files/535 migrations**, fingerprint trước A/sau A/B không đổi.
A f1381bbb5dbe / B e2ab861d76b4 đều **exit 0**, cleaned 18 objects/run.
Mỗi run: **1.764/1.764 account/session**, **280/280 hotel scope**, **20/20 races**.
588 negative failures baseline đã đạt; 1.176 before/restored positives giữ nguyên.
Tập identity/expected không đổi; actual Auth/logout/recovery và no-effect assertions.
Race chỉ owner POST/năm bảng, profile lock/session deletion/hai thứ tự lock;
không suy thành mọi role/action/workflow hoặc hủy in-flight GET.
Full control DB **189/189**, 0 skip; 12 focused là subset. 364 policy có trước
không đổi/xóa, thêm đúng 5 restrictive actor policies và 5 statement triggers.
Advisors 605 (17 no-policy/8 FK/445 unused/135 permissive); không drop index theo count.
Tiếp caller/capability/workflow/RPC/Edge/other-table matrix, 17-target/policy/FK →
issuer/trust/atomic timed health và toàn bộ các đợt VPS/signup còn lại.
Hai rebuild tuần tự không thay simultaneous A/B hoặc Linux/E2E/load/pilot.
Chưa đóng R4/T03/T08/122 releaseAcceptance hoặc gate L/S/P/U/B; reviewer còn pending.

**Các handoff bên dưới là lịch sử; không thay điểm hiện hành đầu trang.**

**Điểm nhận việc mới nhất:** [phiếu triển khai 16 mục / 8 đợt / đủ T01–T25](roomqc-vps-signup-launch-checklist-2026-10-21.md).
**Lát vừa khép local:** [lifecycle service + recovery sản phẩm](roomqc-m06-lifecycle-local-2026-10-21.md).
Source **647 files/531 migrations**, SHA256 0f14369a…; control **154/154**,
Vitest riêng **27/27**. A **41f2b3011bc6** / B **9b6a13ced16e** exit 0/cleaned
16 objects/run, fingerprints/eszip khớp. Mỗi run 89 recorded checks/82 nhãn,
105 transitions/thông báo in-app và bốn bảng tài chính có hàng thật không đổi.
Fixture grace đã sửa; không nhận lại như lỗi chưa xử lý. Nhận tiếp
**provider queue/webhook → 17-target/policy/FK → issuer/trust/atomic health/pipeline**,
rồi signup/UI/Linux/offsite/E2E/tải/pilot. R4-a tổng/R4/T08 chưa khép; chưa mở gate.
Lượt tiếp tục này sửa harness và kiểm sandbox riêng, không sửa product/migration,
deploy runtime, gửi email thật hoặc mở signup/billing. Hai rebuild tuần tự không
thay hai backend đồng thời. Giữ nguyên 27 gói/25 bước/70 case nghiệm thu.

**Phiếu thiết kế trước snapshot lifecycle — 21/10:**
[mục 24: đầu việc, hợp đồng, phiếu nhận và tiêu chí bàn giao](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-2026-10-21),
[checklist triển khai chi tiết 24.7–24.12](roomqc-vps-signup-deployment-plan-2026-10-20.md#execution-checklist-2026-10-21),
[sổ 27 gói/25 bước/70 case](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json).
Lát nhận tiếp: service lifecycle/provider/17 targets → policy/FK → issuer/trust →
atomic health/pipeline. Email-admin đã có local proof, giữ hồi quy, không làm lại
như lỗi chưa sửa. Toàn bộ signup/UI/VPS/offsite/E2E/tải/pilot vẫn giữ scope.
Lượt cập nhật kế hoạch này chỉ sửa tài liệu/artifact và kiểm cấu trúc tài liệu;
không chạy lại suite sản phẩm, thay runtime/DNS/provider hay mở signup/billing.

**Mốc implementation trước lifecycle:** [email-admin — local proof có phạm vi](roomqc-m06-email-admin-local-2026-10-21.md).
Scoped backend **643 files/531 migrations**, SHA256
4334aef4f09c6f867346f8e4ca7c4a8a2408efdcf410f6536989b97538d7c493;
full control **152/152**, Vitest riêng **7/7**. A dbbf929824ec / B 36a0835d1dc3
exit 0/cleaned, identity khớp; 114 named checks/7 race mỗi run, advisors cả hai 640.
Đây là bằng chứng đã lưu, không suite vừa chạy lại khi lập plan. Không đóng
R4-a tổng/R4/T08 hoặc gate release; hai rebuild tuần tự không thay A/B đồng thời.
[Handoff 29](roomqc-vps-signup-execution-plan-2026-10-19.md#email-admin-handoff).

**Baseline trước email-admin:** [live actor tại chín lệnh ghi — local proof](roomqc-m06-mutation-local-2026-10-20.md).
Source 640 files/530 migrations, control 148/148; A 6eade27a974f / B f2025aa52f13
exit 0/cleaned, canonical hashes/images khớp, advisors cả hai 640. Mỗi run có
162 matrix denials/29-table snapshots/15 race và recovery positive/replay.
Scope này local_verified; R4-a tổng/R4/T08 còn mở. Tiếp service/provider/17-target
disposition → policy/FK → pipeline theo [phiếu hiện hành](roomqc-vps-signup-deployment-plan-2026-10-20.md#pre-implementation-current).
Không deploy hoặc nâng gate; 637/529 phía dưới là baseline lịch sử trước mutation proof.

**Baseline trước mutation proof:** [email-ready/profile RLS local proof](roomqc-m06-email-ready-local-2026-10-20.md),
source **637 files/529 migrations**; A 95d9560fba65 / B 91373e6a5871 exit 0/cleaned,
control **144/144**, mỗi backend 106 registration HTTP/39 SQL và email 20 fresh/
18 invalid/23 positive queues. Advisors cả A/B 645; không có index fix.
Nhận việc tại [handoff 27](#email-ready-handoff): caller/room-complete/checkout/admin
→ policy/FK → R3/R5/R6/R7. Hai fix mới và guard Auth xóa mềm đã local_verified;
R4/T08/allSafe vẫn mở, không deploy hoặc nâng gate.

**Run sheet chuẩn bị triển khai:** [mục 21](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-current)
và [phiếu điều phối mục 22](roomqc-vps-signup-deployment-plan-2026-10-20.md#launch-runbook),
giữ 27 gói/25 bước/70 case; sáu bàn giao đợt đầu, file/actions/test/rollback,
journey signup, UI/admin, VPS/offsite, external inputs và stop/reopen.
Lượt lập kế hoạch tổng hợp proof đã chạy, không sửa implementation/khởi chạy
suite hoặc đổi runtime; quan sát 15:24 +07 0005/signup=false chỉ là lịch sử.

**Snapshot trước đợt Auth xóa mềm:** [mục 25](#registration-handoff), sau
[proof guard đăng ký](roomqc-m06-registration-local-2026-10-20.md): source 632
backend files/526 migrations, A 4317f0ce9c62 / B 0fe112b0e675 exit 0/cleaned,
94 HTTP/39 SQL registration controls mỗi lượt, control 142/142, local build đạt.
R4/T08 chưa đóng; lỗi High Auth xóa mềm ở room setup/quote đã tái hiện và là việc
sửa kế tiếp. Mục 24 giữ scope/checklist, các baseline 628/525/139 của nó là lịch sử.
Không tăng 27 gói/25 bước/70 case hoặc deploy/mở signup từ proof này.

Ngày cập nhật: 20/10/2026, Asia/Bangkok. Trạng thái: **đang triển khai, nền đã kiểm chứng local; chưa đạt staging/pilot**.
Tài liệu này cụ thể hóa thứ tự thực hiện trên hiện trạng đã quan sát, không ghi nhận
các đầu việc dưới đây là đã hoàn thành. Mỗi mã T là bước con của 27 gói P0–P8,
không tạo thêm một roadmap độc lập hoặc thay đổi tổng 70 tình huống nghiệm thu.

- Phạm vi và kiến trúc: [kế hoạch tổng thể](roomqc-vps-signup-implementation-plan-2026-10-19.md).
- Phân công và phụ thuộc: [27 gói công việc](roomqc-vps-signup-work-packages-2026-10-19.md).
- Điều kiện đạt: [70 tình huống và các cổng phát hành](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
- Kết quả thực hiện: [tracker](roomqc-vps-signup-progress.md), không suy ra từ tài liệu thiết kế.
- Phiếu giao việc cho phần còn lại: [mục 18–23](#18-điểm-bắt-đầu-đã-đối-chiếu-và-thứ-tự-giao-việc),
  bổ sung sau đợt M05; giữ nguyên 27 gói, 25 bước và 70 case.
- Điểm bắt đầu trước lượt code kế tiếp: [mục 18.3](#183-cập-nhật-chuẩn-bị-m06-và-điều-kiện-bắt-đầu-kế-tiếp);
  R1/R2 đã đạt local trên hai full vendor builds 523 migration, maintenance
  Janitor thật và full suite 111/111. R3 local lifecycle mới có
  [proof riêng](roomqc-m06-session-local-2026-10-19.md): encrypted store/lease/fencing
  và Auth thật, chưa installer/production policy/R6 runtime. Tiếp theo R4–R7;
  toàn M06/T08 và gate signup vẫn chưa đủ điều kiện đóng.

Snapshot nhận việc trước guard đăng ký: [mục 24 — kế hoạch chi tiết theo hiện trạng R4](#24-kế-hoạch-nhận-việc-hiện-hành--cập-nhật-sau-khi-rà-source-r4).
Mục này cập nhật source **628 backend files / 525 migrations** và proof caller mới:
A 55a4b60c80b1 / B 0dbf25756725 đều exit 0/cleaned, cùng canonical schema/
migration/images/init-spec; control **139/139**, focused audit+graph **14/14**
là subset. Catalog có **149 triggers / 25 candidate entry paths**; đây chỉ là
discovery, allSafe=false/transitiveReachabilityProven=false.
[Báo cáo/ledger 17 bảng và giới hạn](roomqc-m06-callers-local-2026-10-20.md).
Proof direct-write/FE 27 tests/build trước đó giữ làm lịch sử có phạm vi.
**R4/T08 vẫn mở**: cần harmonize guard đăng ký browser/service/gateway, kiểm
trigger email và checkout/admin, policy/FK, trusted release và pipeline.
Có đủ 25 bước, phiếu test actor/policy, API/UI, dự toán và gate. Đọc
[checklist nhận việc](#2411-checklist-nhận-việc-và-bàn-giao-từng-đợt) và
[bảng quyết định trước triển khai](#2412-quyết-định-và-đầu-vào-trước-từng-cổng).
Phiếu code/test nhỏ nhận việc ngay nằm ở [24.16](#2416-phiếu-nhỏ-sẵn-sàng-nhận-việc--bắt-đầu-từ-đúng-phần-chưa-khép).
Các snapshot cũ bên dưới giữ làm lịch sử; không dùng chúng xác nhận source mới.

## 0. Bản giao việc để chuẩn bị triển khai

### 0.1. Hiểu đúng sản phẩm sẽ bàn giao

RoomQC quản lý VPS, Docker, database, backup và hỗ trợ. Khách sạn chỉ đăng ký,
xác thực email, khai báo cơ sở rồi sử dụng. V1 dùng **một data cluster trên một
host**, chứa nhiều workspace được phân quyền/cách ly; không tạo một VPS hoặc một
bộ Supabase cho mỗi lần đăng ký. Một doanh nghiệp có thể có nhiều khách sạn.
Control/directory quản lý định tuyến và cấp phát; dữ liệu phòng/khách/đặt phòng
vẫn nằm ở data cluster đã gán. Thêm cluster chuẩn bị sẵn để nhận khách mới khi
cần mở rộng; chưa tự di chuyển dữ liệu khách đang dùng.

Hai đầu ra người vận hành sử dụng hằng ngày là **Hạ tầng** và **Đăng ký mới**.
Không đưa chúng vào nhật ký khách sạn, tạo menu phụ trùng lặp hoặc yêu cầu khách
hiểu CPU, Docker và cluster. Mỗi chức năng có route/nút/quyền/lý do disabled và
test theo bảng mục 20.5. Không cam kết 1.000 khách sạn hoặc 100.000 phiên đồng
thời khi chưa có capacity profile trên cấu hình máy xác định.

### 0.2. Thứ tự bàn giao và bằng chứng để đi tiếp

| Mốc | Thực hiện trong plan | Sản phẩm phải nhận được | Điều kiện chuyển mốc |
|---|---|---|---|
| 1. Khép backend kiểm chứng | T01/T08, M06; mục 18.3 và 19.1–19.4 | Hai fresh build đã khởi tạo đầy đủ có cùng schema; manifest tin cậy, quyền tối thiểu, đủ năm probe và fault/recovery | Không còn drift không giải thích; advisors được rà; source/test/artifact cùng phiên bản |
| 2. Biết đúng sức khỏe cụm | T05/T06, M05/M10; mục 19.5 | Metrics → probes → snapshot → admission bằng nguồn thật; restart/stale/target change có log | Drill đủ thời gian thật, thiếu số đo không thành khỏe, khách active giữ mapping |
| 3. Có cảnh báo xử lý được | T07, M07/M08; mục 19.6 | Alert có vòng đời, ack/audit, outbox/dispatcher bền vững tới sink thử | Retry/restart/mất response không làm mất alert hoặc gửi vô hạn; external heartbeat giữ gate riêng |
| 4. Cấp suất và quyền an toàn | T03/T04/T09/T10; mục 20.1 | Authority/revoke/MFA, validation, quota/affinity/budget | Race 20 request/1 suất, close/version và live Auth đạt; không bypass gate từ UI |
| 5. Khách đăng ký dùng được | T11–T13; mục 20.2–20.4 | Start → xác thực → khai báo → active → thêm phòng/mời nhân viên; resume và reconcile | Refresh/hai tab/timeout/worker chết không cấp trùng; riêng tư và anti-abuse đạt |
| 6. Admin vận hành qua UI | T14–T17; mục 20.5 | Hai màn list/detail, tìm kiếm, timeline, command dialog, job status | API thật, quyền thật; keyboard/390px/Back/scroll và tìm lỗi trong 30s đạt |
| 7. Cài và cứu được trên VPS | T18–T20/M09; mục 21.1–21.3 | Bundle Linux/TLS/rotation, backup offsite, restore host sạch, cảnh báo ngoài host, runbook | Reboot/redeploy/restore/host-loss có bằng chứng; có operator và đầu vào external |
| 8. Release đủ điều kiện thử khách | T21–T24; mục 21.4–21.6 | A/B độc lập, E2E desktop/Android, tải/soak/cutover/rollback | Đối chiếu đủ 70 case theo môi trường; không lỗi nghiêm trọng quyền/dữ liệu/cấp phát/restore |
| 9. Pilot và quyết định mở rộng | T25; mục 21.6 | Một khách nội bộ, rồi 5–10 khách được chọn; báo cáo ít nhất 7 ngày | Có số liệu lỗi/SLO/sức chứa/backup/hỗ trợ/chi phí; RoomQC duyệt, không tự mở public/thu phí |

Các mốc là cách đọc T01–T25, không phải gói hoặc acceptance ID mới. Người nhận
ticket lấy chi tiết ở mục 18–23, đối chiếu ma trận mục 12 và tài liệu 70 case;
không triển khai chỉ từ bảng tóm tắt này. Mốc 1–6 tiếp tục được trên sandbox khi
chưa có khóa VPS/provider. Khóa/quyền external tập trung mục 22, chỉ chặn đúng cổng.

### 0.3. Cách tổ chức đợt làm tiếp theo

1. Chỉ nhận ticket có input, target ownership, dependency, expected outcome và
   rollback rõ. Backend sở hữu schema/contract; frontend không tự thêm enum hay
   quyết định phân bổ. Operator xác minh target Linux/offsite; RoomQC duyệt gate.
2. Đợt gần nhất khép phần M06/T08 còn lại: **R4 theo mục 24.3**, rồi R3 còn lại/
   R5/R6/R7 theo mục 24.4. Giữ proof R1/R2/R3 local làm hồi quy; không viết lại
   exporter/worker M04/M05 hoặc deploy bản nháp để làm UI xanh.
3. Mỗi đợt bàn giao diff, source/image/schema/config, command/exit code, expected/
   actual/case ID, log đã lọc, lỗi còn mở và bước kế tiếp theo mẫu mục 23.2.
4. Ước lượng hiện hành ở mục 24.8 là 30–47 ngày công còn lại, dự phòng khoảng
   36–57; 21–33 ở mục 3 chỉ là lịch sử, không cộng hai số hoặc coi là deadline.
   Sau R4/R7 phải ước lượng lại bằng chi phí thực; pilot ≥7 ngày và thời gian
   chờ external tính riêng. Không coi số test là phần trăm hoàn thành.

### 0.4. Rủi ro phải đóng và ảnh hưởng nếu bỏ qua

| Rủi ro hiện tại hoặc cần chứng minh | Ảnh hưởng nếu bỏ qua | Ticket / điều kiện không được vượt |
|---|---|---|
| Maintenance vendor đã đạt controlled drill; scheduled soak staging chưa có | Chưa chứng minh scheduler tự bảo trì ổn định qua chu kỳ thật | R2 giữ proof local; soak đúng release trước staging/pilot, không bỏ schema khỏi fingerprint |
| Quyền Realtime/revoke đã đạt v2; coordinated refresh/rotation còn thiếu | Monitor có thể hết phiên hoặc tranh refresh nếu lifecycle chưa được kiểm chứng | R3/R7; refresh/TTL/fencing/restart và full backend hiện hành; timeout không là denial hợp lệ |
| Migration manifest mới và gateway cũ chưa tương thích | Gateway cũ gửi body/quyền khác contract mới; deploy riêng migration có thể làm validation lỗi | T08/T18; rehearsal upgrade có consumer-compatible release, rollback config/binary theo schema compatibility |
| Session/quyền hoặc cache sai cụm chưa E2E | Có thể lộ hoặc thao tác sai dữ liệu nếu kiểm soát tenant/authority không đúng | T03/T14/T21/T22; không mở staging/pilot nếu case quyền/cách ly liên quan chưa đạt |
| Mất response/lease hết khi cấp phát | Có thể cấp trùng tenant/hotel/trial hoặc để khách kẹt nếu thiếu receipt/fencing | T09/T11/T12; không bàn giao flow signup chỉ bằng journey thuận |
| Giới hạn cụm chỉ ước lượng | Một tenant nặng có thể gây chậm cả cụm; thêm khách vượt sức chứa | T10/T23; phải có measured operating limit/headroom, không dùng tổng nhân sự làm concurrency |
| Backup chỉ trên cùng máy hoặc chưa restore | Không chứng minh phục hồi khi mất VPS, có nguy cơ mất dữ liệu khách | T19; không mở pilot nếu offsite/host-loss drill chưa đạt |
| Cảnh báo cùng failure domain, thiếu người trực | Host hỏng nhưng không ai nhận biết hoặc xử lý kịp | T20/M09; không mở pilot bằng việc chỉ thấy alert trong dashboard local |

Đây là sổ rủi ro để lập thứ tự kiểm chứng, không phải kết luận đã xảy ra mất/rò
dữ liệu. Mỗi lỗi mới phải có severity/owner/ticket và gate bị chặn; việc chấp nhận
rủi ro không được thay thế các case bắt buộc về quyền, dữ liệu và khôi phục.

### 0.5. Các quyết định cần chốt, không để kỹ sư tự suy đoán

Những lựa chọn dưới đây là input cho ticket, không phải yêu cầu cung cấp khóa
ngay trong chat. Có thể chuẩn bị code/fixture trước; chỉ cổng liên quan bị chặn.

| Quyết định | Đề xuất/ranh giới dùng để chuẩn bị | Người duyệt và hạn chót | Bằng chứng phải lưu |
|---|---|---|---|
| Mô hình cấp phát | V1 workspace dùng một cụm đã chuẩn bị; không một VPS/một đăng ký; không tự chuyển cụm khách cũ | RoomQC; trước thay đổi phạm vi T08/T11 | ADR hiện có + mọi thay đổi thiết kế được duyệt |
| Gói dùng thử, số cơ sở/phòng/nhân viên, khi hết hạn | Đọc chính sách hiện hành, không tự đổi giá/trial; tách việc khóa nghiệp vụ, login, xuất dữ liệu và hỗ trợ | RoomQC; trước đóng contract T11/T13 | Policy version + tình huống trial/expiry/invite; thanh toán thật giữ backlog riêng |
| Trạng thái thất bại và phục hồi | Missing → chủ tiếp tục; unavailable → retry có trần; conflict → hỗ trợ; không tự tạo lại tenant hoặc danh tính | Backend review; trước T12 | Enum/API DTO + state-transition tests + thông điệp người dùng |
| Quyền quản trị, MFA và hỗ trợ | Authority cố định, live role/session; không dùng owner khách sạn làm platform admin; không giả danh chủ khách sạn mặc định | RoomQC + review quyền; trước T03/T14 | Operation × capability × AAL; test deny/revoke và quy trình break-glass |
| Tên miền và topology | Chọn public app/API/callback/admin origins của `roomqc.com`; không đổi DNS chỉ để thử | RoomQC/operator; trước T18/D15 | Danh sách origin/allowlist/CSP/TLS; plan không coi tên miền đã cấu hình |
| Profile VPS và giới hạn nhận khách | Chọn một cấu hình Linux làm mẫu đo; operating limit theo T23, không suy từ tổng nhân sự | RoomQC/operator; trước staging/pilot | Inventory + capacity report + headroom + ngưỡng dừng |
| Backup, retention và xóa dữ liệu | Mục tiêu pilot RPO≤24h/RTO≤4h phải đo; retention/chi phí/key custody cần duyệt; chưa tự xóa khách hết hạn | RoomQC/operator; trước T19/pilot | Backup policy, export/deletion procedure, restore proof và người giữ key |
| Alert và giờ hỗ trợ | Chọn đích cảnh báo ngoài host, người trực/người thay ca và escalation; local sink không tính received | RoomQC; trước T20/pilot | Destination refs, lịch trực, detection/received/ack/recovery timestamps |
| Mở đăng ký và phát hành | Gate L/S/P/U/B độc lập; mỗi gate có người duyệt, scope, quota và kill switch | RoomQC; trước từng lần mở gate | Phiếu duyệt + release manifest + case matrix; không mở theo số test xanh |

**Không phải quyết định cần chờ:** tiếp tục sửa/kiểm chứng R1–R7 ở mục 19.3.2
trên fixture riêng, hoàn thiện API/worker/UI, template email local và bundle
preflight. Không cần khách sạn tự đăng ký VPS, Docker hoặc gửi thông tin hạ tầng.

## 1. Đích bàn giao và ranh giới phiên bản đầu

Chủ khách sạn vào RoomQC → đăng ký → xác thực email → khai báo khách sạn → có
không gian sử dụng và gói thử theo chính sách hiện hành → thêm phòng → mời nhân viên.
Khách chỉ làm việc với ứng dụng; việc chọn cụm, cấu hình máy, database và backup do
RoomQC vận hành. Khi mất mạng hoặc đóng trình duyệt, khách tiếp tục cùng đăng ký.

Quản trị RoomQC có hai mục mới trong `/super-admin`: **Hạ tầng** và **Đăng ký mới**.
Từ đây phải trả lời được: cụm nào còn nhận khách, đang thiếu điều kiện gì, khách
đang kẹt bước nào và hành động tiếp theo là gì. `/settings/audit-log` vẫn là nhật ký
nghiệp vụ của khách sạn, không phải trang quản lý VPS toàn nền tảng.

Đơn vị phân bổ là workspace/doanh nghiệp; một workspace có thể chứa nhiều khách sạn.
Mỗi khách sạn có nhiều nhân viên. Không dùng số nhân viên đăng ký làm số phiên đồng
thời; không dùng số khách sạn làm số workspace nếu doanh nghiệp có nhiều cơ sở.

Phiên bản đầu cấp workspace trong cụm Supabase self-host đã chuẩn bị trên VPS do
RoomQC quản lý. Việc thuê máy tự động, di chuyển tenant đang dùng, đăng nhập chung
nhiều cụm, HA nhiều vùng và thanh toán thật là phạm vi sau. Các chức năng gói/trial
hiện có được nối lại đúng backend; không tự thay giá, thời gian dùng thử hoặc chính
sách giữ/xóa dữ liệu để hoàn thành luồng kỹ thuật.

## 2. Điểm xuất phát đã kiểm tra

Nguồn tích hợp: `roomqc-worktrees/integration`, nhánh `codex/roomqc-parallel-integration`.
Commit đã kiểm chứng gần nhất: `a3c17c6` (M05; M04: `a34f3b6`, multi-mount: `dec5fdf`,
admin/health: `d0f9b7b`, nền directory: `8d0628e`). Checkout chính là `room-weave-pro-main`, có nhiều
thay đổi từ trước; chỉ đồng bộ file đúng phạm vi sau kiểm tra, bảo toàn index và
các thay đổi nghiệp vụ khác.

| Phần | Bằng chứng hiện có | Cách tính trong kế hoạch này |
|---|---|---|
| Control API + directory riêng | Báo cáo admin/health ghi runtime `0005`, image và fingerprint 16 bảng | Bằng chứng local của đợt đã hoàn tất, không coi là health VPS hiện tại |
| Proxy frontend | GET `8082/api/control/healthz` trả 200 JSON `status=ok` | Chứng minh proxy local; chưa chứng minh luồng khách đăng ký |
| Migration, grants, restart | Đợt `d0f9b7b` ghi 44/44 test, 0 skip; gồm migration, restart, role grants và race | Không phải 44/70 acceptance release, không cộng lặp 17 test nền |
| Admin command, registry, evaluator, admission | Receipt/version/audit atomic, gate DB/affinity, HTTP pinned DNS và snapshot đã kiểm chứng local | Còn Auth/revoke thật, manifest/probes và E2E; chưa đóng toàn bộ P1/P3 |
| Kiểm tra release cụm | R1/R2: hai full vendor builds 523 migration qua init/Janitor/năm fault/quyền/revoke và cùng hash v2 | Gateway vẫn legacy; coordinated refresh/rotation, trusted artifact và worker integration chưa đóng |
| Giám sát | M04/M05 có bằng chứng commit; full current-tree suite M06 111/111, 0 fail/skip | Chưa có full metrics→probe→admission timed drill; worker chưa bật thường trực, chưa đo sức chứa VPS |
| Giao diện hạ tầng/đăng ký mới | Có super-admin và tenant console cũ | Tái sử dụng layout; bổ sung API/client/routes, không coi đã có console hạ tầng |
| VPS/TLS/email thật/offsite/pilot | Chưa có bằng chứng triển khai tương ứng trong đợt này | Giữ `not_run` ở môi trường thật; tiếp tục phần code/local độc lập |

Hiện trạng đối chiếu source/tracker/artifact. Đợt P2 sau khi cập nhật plan đã chạy
suite 59 test trong sandbox riêng; xem [báo cáo P2](roomqc-p2-source-local-2026-10-19.md).
Sau đó M04/M05 có báo cáo riêng; [báo cáo M05](roomqc-p2-health-worker-local-2026-10-19.md)
là bằng chứng nguồn đã commit mới nhất; draft M06/bằng chứng một phần cập nhật ở
mục 18.3. Lượt chuẩn bị kế hoạch lúc 18:24 +07:00 ngày 19/10
kiểm tra read-only: direct/proxy readyz đều 200, schema thường trực vẫn `0005`,
image control/frontend giữ nguyên như mục 18, signup vẫn false.
Không suy ra vừa đo VPS hoặc image thường trực đã đổi theo source. Artifact gốc
được giữ nguyên, không áp migration hay thay đổi DB nghiệp vụ và không bật signup.

### Phần đã làm không lặp lại và thứ tự còn lại

T02–T04 đã có một phần quan trọng đạt local ở đợt admin/health; giữ test làm hồi quy,
không viết lại để khớp mô tả cũ. T01 vẫn kiểm tra phạm vi mỗi đợt; P1-03 còn Auth
thật/revoke/MFA và support command identity. Bước ngay tiếp theo là M06/T08, khép
M05/M10 trên full backend rồi M07/M08; sau đó khép T03/T09/T10 và P4–P8.
Danh sách thao tác nhỏ, file/test và tiêu chí đóng đợt P2 ở
[run sheet giám sát](roomqc-p2-monitoring-delivery-plan-2026-10-19.md).

### Quy tắc ghi nhận tiến độ

Mỗi bước có trạng thái, môi trường, người phụ trách, commit/image/schema, case ID,
expected/actual và đường dẫn artifact. Dùng các nhãn:

`planned` → `in_progress_unverified` → `local_verified` → `staging_verified` → `pilot_verified`.

`deferred_external` ghi rõ đầu vào cần thiết và gate bị chặn; không đồng nghĩa done.
Một gói có thể đạt local nhưng chưa đạt staging. Không dùng số dòng code, số test
assertion hoặc điểm phần trăm để thay nghiệm thu vận hành.

## 3. Thứ tự thực hiện và mốc kiểm tra

**Dự toán trong mục 3 giữ làm baseline lịch sử khi lập plan.** Khi nhận việc dùng
hiện trạng 24.1, bảng 25 bước 24.2, run sheet 24.11, phiếu nhỏ 24.16 và **dự toán
còn lại 24.8**. Không dùng 21–33 ngày công cũ làm lịch hiện hành hoặc cộng vào 30–47.

| Đợt | Gói chính | Kết quả có thể kiểm tra | Phụ thuộc | Ước lượng ngày công còn lại |
|---|---|---|---|---|
| 1 | P0 bổ sung, P1-03, hồi quy P1-01/02 | Lệnh quản trị có quyền/version/receipt/audit; nền mới chạy được trong sandbox | Hiện trạng trên | 2–3 |
| 2 | P2-01/02/03 | Số đo thật, dữ liệu cũ bị nhận diện, alert có vòng đời | Schema và hợp đồng đợt 1 | 3–4 |
| 3 | P3-01/02/03 | Cụm đã xác minh mới nhận khách; giữ suất và affinity an toàn | Đợt 1–2 | 3–4 |
| 4 | P4-01/02/03 | Signup tiếp tục được; worker đối soát kết quả; kiểm soát lạm dụng | Đợt 3; authority/receipt tại backend | 3–5 |
| 5 | P5-01/02/03/04 | Quản trị dùng hai màn chính để vận hành, có trạng thái lỗi thật | API đợt 1–4 | 3–5 |
| 6 | P6-01/02/03 | Bộ cài VPS, backup/restore và runbook | Local đã đạt; quyền staging cho bước thật | 3–5 |
| 7 | P7-01/02/03/04 | Hai backend độc lập, E2E/fault/load, release candidate | Đợt 1–6 | 3–5 |
| 8 | P8-01 | Pilot có giới hạn, báo cáo vận hành và quyết định mở rộng | Gate staging/pilot đạt | 1–2 + ít nhất 7 ngày quan sát |

Tổng dự kiến **21–33 ngày công kỹ thuật**, cộng thời gian quan sát/chờ nhà cung cấp
và sửa lỗi phát sinh. Đây là dự toán để tổ chức công việc, chưa phải lịch cam kết;
chốt lại sau đợt 1. Thay ước lượng 23–36 ngày công lúc lập plan gốc cho phần việc
còn lại, không cộng hai con số. Các đoạn độc lập có thể làm song song sau khi chốt
contract; không chia tổng ngày công cho số nhánh để suy ra ngày bàn giao.

Trong lúc code tiếp tục, signup của stack đang phục vụ vẫn đóng. Chỉ mở ở sandbox
khi đủ gate local; staging, pilot và public là các mốc riêng.

## 4. Đợt 1 — khép phần nền và quản trị đang dở

### T01 — khóa baseline, phạm vi và quyền ghi (P0-01/03)

1. Ghi `git status`, commit, diff các file control, image/schema đang chạy; ghi rõ
   mã chưa commit chưa nằm trong image. Kiểm tra trạng thái các nhánh/worktree cũ
   trước dùng lại, không ghép thay đổi không rõ nguồn.
2. Ghi tên project/container/network/volume sở hữu của sandbox. Chọn port trống;
   không chiếm 8080/8081/8082 của ứng dụng khác hoặc 8090 của CRM.
3. Tạo fixture tổng hợp cho platform admin, owner, staff, email chưa xác minh,
   workspace reserved/provisioning/active/expired và cụm đóng/đầy/stale. Secret chỉ
   vào secret file hoặc stdin; báo cáo chỉ ghi ID và trạng thái.
4. Chụp fingerprint phần cần bảo vệ ở checkout/DB nguồn. Cleanup nhận run ID và
   manifest target cụ thể, dừng khi target không thuộc sandbox.

**Bàn giao:** cập nhật baseline và công cụ sandbox có prepare/verify/cleanup.
**Đạt:** A01/A02 và phần fixture của P0-03; Ctrl+C hoặc test lỗi vẫn dọn tiếp được.
A03 chỉ đóng sau browser/cutover, không đóng bằng việc đọc route.

### T02 — sửa tương thích test với migration mới (P1-01)

File: `server/control/directory-db.test.mjs`, `migrations/0004-admin-policy-guards.sql`.

1. Rà schema/grants/constraint/index của `0004` trước lần áp đầu. Chỉ file chưa áp
   mới được chỉnh; các migration đã có history giữ nguyên checksum.
2. Đổi rollback-probe test từ số `0004` sang số kế tiếp, tránh trùng migration thật.
   Kiểm tra số/version migration từ manifest thay vì giữ giả định luôn có ba file.
3. Test nâng cấp DB cũ so sánh từng trường cần bảo toàn; không coi cột nullable mới
   là mất dữ liệu do `SELECT *` trả shape khác.
4. Fixture reserve phải chủ động có credential/release/frontend/health/backup hợp
   lệ. Không mở mặc định cụm mới hoặc bỏ điều kiện an toàn để test cũ pass.
5. Chạy DB trống, upgrade từ v2/v3, rerun, hai migrator đồng thời, checksum mismatch,
   migration lỗi và grant denial. Chỉ dùng PostgreSQL container disposable.

**Đạt:** A04–A07 phần liên quan; mọi test bắt buộc chạy, không skip để đạt số đẹp.
**Artifact:** schema versions trước/sau, dữ liệu giữ nguyên, kết quả runner mới.

### T03 — hoàn chỉnh quyền và lệnh quản trị nguyên tử (P1-03)

File đang dở: `admin.mjs`, `admin-read.mjs`, `app.mjs`, `errors.mjs`, `support.mjs`.

1. Mỗi request xác nhận actor tại authority cố định qua `platform_support_actor`.
   Không nhận authority/role từ request, `user_metadata` hoặc cache quyền frontend.
2. Lập bảng operation → capability: đọc, thao tác hạ tầng, đối soát hỗ trợ. V1 có thể
   cùng super-admin nhưng handler vẫn kiểm tra capability cụ thể. Session bị khóa,
   revoke hoặc thu hồi role phải mất quyền ở request kế tiếp.
3. Mutation bắt buộc UUID `Idempotency-Key`, `expectedVersion`, reason 5–1.000 ký
   tự và payload allowlist. Hash gồm operation, target, version và payload chuẩn hóa.
4. Trong một transaction ngắn: khóa phù hợp → tìm replay → kiểm tra version → ghi
   mutation + audit/event + receipt → commit. Audit lỗi phải rollback mutation.
5. Cùng key/actor/operation và cùng payload trả receipt cũ; thay target/payload trả
   409. Hai admin sửa cùng version chỉ một bên thắng. Không giữ transaction khi
   gọi HTTP xác minh backend; kiểm tra lại version/fingerprint trước khi commit.
6. Chốt `set_serving` vào contract như lệnh đưa cụm draining về phục vụ, vẫn đóng
   nhận mới; không để enum OpenAPI và implementation lệch nhau.
7. Lỗi 401/403/409/429/503 có mã ổn định, request ID mới cho từng attempt; receipt
   giữ command ID. 429 trả Retry-After. Không ghi raw token/SQL/payload khách.

**Test:** 20 request thật cùng key; mất response sau commit; hai actor cùng version;
audit insert thất bại; owner/staff/anon gọi từng route; actor bị revoke giữa hai request.
**Đạt:** A08–A11. Test phải xác nhận số mutation/event/receipt, không chỉ HTTP 200.

### T04 — khép read API, contract và bàn giao đợt (P0-02, P1-03)

1. Đối chiếu từng operation trong `contracts/control-v3.openapi.json` với router.
   Endpoint chưa làm giữ `planned`; file có parser chưa đồng nghĩa implemented.
2. Hoàn thiện filter/cursor/schema/error DTO; mặc định 25, tối đa 100. Cursor ràng
   buộc route/filter và giữ chính xác timestamp PostgreSQL, gồm phần microsecond.
3. Workspace detail không trả email hash, token, secret ref hay payload form. Nếu
   timeline dài phải có phân trang thật; không hard-code 20 dòng rồi báo hết dữ liệu.
4. Dùng ít nhất 1.000 metadata với timestamp trùng/sát nhau để kiểm tra không mất,
   trùng bản ghi khi đi trang; test cursor sai, filter đổi và query thừa/nhân đôi.
5. Chạy suite control/DB liên quan, viết artifact mới; giữ artifact nền làm lịch sử.
   Review diff rồi đồng bộ file xác định sang checkout chính, không ghi đè cả cây.

**Cổng kết thúc đợt 1:** quyền và lệnh đạt trong sandbox; snapshot mã/schema rõ ràng;
signup của stack chính vẫn đóng. Chưa tuyên bố tài nguyên VPS đã được giám sát.

## 5. Đợt 2 — nguồn số đo, quyết định sức khỏe và cảnh báo

### T05 — dựng monitoring riêng tư, đo đúng tài nguyên (P2-01)

Thực hiện theo M01–M04/M06 trong run sheet P2; M05/M07–M10 khép T06/T07. Mã M
chỉ chia nhỏ T05–T07, không thêm gói hay đổi 70 acceptance case.

M04 đã có `deploy/monitoring/compose.yml`, `queries.yml`, `exporter-roles.sql` và
renderer sinh `prometheus.yml`; đã kiểm chứng fixture local, chưa deploy thường
trực. `rules/` và alert runtime còn thuộc M07/M08. Xem báo cáo M04 trong tracker.

1. Pin version/digest node_exporter, postgres_exporter, Prometheus, Alertmanager.
   Ghi overhead CPU/RAM/disk; giới hạn scrape/retention. Grafana chỉ mạng quản trị.
2. Inventory nối host → cluster → mount DB/Storage. Nếu DB và Storage khác ổ, đo
   từng mount và chặn khi bất kỳ ổ bắt buộc nào critical; không ghép số free của
   ổ A với total của ổ B để tạo một phần trăm không có thật.
3. Exporter DB dùng role giám sát tối thiểu; không quyền sửa dữ liệu nghiệp vụ.
   Port exporter/DB không public; không mount Docker socket.
4. Probe Auth/REST/Storage/Realtime/Functions bằng request có ý nghĩa. HTTP port
   mở hoặc một 401 tùy ý chưa chứng minh service hoạt động. Canary cần resource
   tổng hợp riêng và cleanup; không ghi dữ liệu vào khách đang dùng.
5. Đối chiếu Linux `MemAvailable`, filesystem thực và `pg_stat_activity` với metric.
   Công bố dung sai trước test: CPU ±5 điểm %, bytes/counts chênh do thời điểm đo
   phải giải thích; không áp dung sai để bỏ qua sai mount hoặc sai đơn vị.

**Đạt:** B01–B03. Local Docker Desktop chỉ đạt integration; đối chiếu host thật ở VPS staging.

### T06 — persist snapshot và kiểm thử evaluator (P2-02)

Tận dụng `health-policy.mjs` đang dở; bổ sung telemetry adapter, snapshot store và
health worker. Chu kỳ scrape/worker 30s; dữ liệu hết hạn 120s, dựa thời gian server.

| Số đo | Hợp đồng đầu vào | Cảnh báo / chặn nhận mới mặc định để đo staging |
|---|---|---|
| CPU | % busy 0–100; nguồn `rate` cửa sổ 1 phút | ≥70% trong 5 phút / ≥85% trong 5 phút |
| RAM | Available và total bằng byte | Còn <25% trong 5 phút / <15% trong 2 phút |
| Disk từng mount bắt buộc | Free/total byte và inode free % | <25% hoặc <20 GiB / <15% hoặc <10 GiB; critical chặn ngay |
| Inode | % còn lại trên từng mount | <20% / <10%; critical chặn ngay |
| DB connections | Used và budget kết nối thực | ≥70% trong 5 phút / ≥85% trong 2 phút |
| Probe | Năm service bắt buộc, kết quả typed | Lỗi cảnh báo; 3 mẫu liên tiếp và ≥60s lỗi thì chặn |
| Freshness | Observed/received/validUntil, generation | Không có mẫu hợp lệ >120s thì chặn |

1. Chốt CPU như bảng: cửa sổ tính rate 1 phút, cửa sổ duy trì ngưỡng 5 phút. Cập
   nhật các tài liệu nguồn tương ứng; không vô tình thêm hai lần cửa sổ 5 phút.
2. Reject NaN/Infinity/âm/sai range; bytes/counts là safe integer; mẫu tương lai >5s
   hoặc đã quá 120s bị từ chối. Không có dữ liệu là unknown/null, không phải 0.
3. Mở rộng schema sample cho nhiều mount nếu cần; nâng version contract. Không dùng
   evaluator một ổ hiện tại để tuyên bố đã bảo vệ đủ DB và Storage khác filesystem.
4. Query Prometheus theo template cố định + registry ID. Browser không truyền PromQL.
   Timeout/backoff có giới hạn; UI đọc snapshot, không scrape trên mỗi lần mở trang.
5. Ghi sample/state/generation cùng transaction; mẫu cũ không ghi đè mẫu mới. Hai
   worker đua nhau vẫn giữ thời gian tăng đúng. Không có mẫu mới vẫn phải phát hiện
   snapshot stale và ghi sự kiện đóng nhận; admission recheck freshness độc lập.
6. Persist các mốc sustained/probe failures/recovery qua restart. Có gap >120s thì
   bắt đầu warmup lại; policy version đổi cần evaluate theo policy mới trước mở.
7. Có số đo hợp lệ liên tục 5 phút trước khi đủ điều kiện mở lần đầu. Sau critical,
   cần 10 phút khỏe với CPU/connection <65%, RAM >25%, disk >25% và >20 GiB,
   inode >20%, probes tốt; pilot vẫn cần admin mở lại có lý do.
8. Unit test ranh giới bằng fake clock; DB test worker cạnh tranh, restart/gap,
   policy đổi và stale. API/client không tự chuyển snapshot cũ thành healthy.

**Đạt:** B04–B07; có artifact đối chiếu từng ngưỡng, thời gian và reason code.

### T07 — cảnh báo có vòng đời và tín hiệu ngoài máy (P2-03)

1. Fingerprint theo môi trường/resource/type; một lỗi liên tục chỉ một alert mở.
   Lưu opened/lastSeen/ack/resolved và audit actor/reason; tránh label user/email.
2. Severity/runbook: disk/DB critical, metric stale, backend unreachable, backup
   quá hạn, job provisioning kẹt, control/worker heartbeat mất.
3. Acknowledge chỉ xác nhận đã thấy; không đổi metric, resolve hoặc mở admission.
   Resolution dựa điều kiện phục hồi đã kiểm chứng; cooldown chống gửi dồn.
4. API alerts/backups/audit có phân trang và DTO an toàn. Ack dùng command/version
   như thao tác admin khác, không có đường ghi bỏ qua receipt/audit.
5. Local gửi tới inbox thử. Đích cảnh báo thật được cấu hình sau; heartbeat từ hệ
   thống ngoài VPS mới chứng minh phát hiện mất cả máy.

**Đạt:** B08 local; B09 chỉ đạt khi ngắt host thử và nhận được cảnh báo bên ngoài.

## 6. Đợt 3 — registry và điều kiện nhận khách đáng tin cậy

### T08 — ràng buộc endpoint, credential và manifest (P3-01)

File: `registry.mjs`, `cluster.mjs`, `config.mjs`, `admin.mjs`; thêm HTTP transport
an toàn và migration Supabase cho manifest, tên migration do CLI sinh.

1. DB giữ metadata/policy; secret phía server resolve theo ref. UI chỉ chọn entry
   trong inventory duyệt sẵn; không nhận URL bất kỳ, SSH key hay service key.
2. Cụm mới là pending validation + đóng nhận. Trùng ID/host, endpoint sai và sửa
   endpoint cụm có workspace bị từ chối. Đổi ref secret không đổi tenant binding.
3. Trước request, resolve và kiểm tra toàn bộ A/AAAA theo inventory; xử lý IPv4,
   IPv6 và IPv4-mapped IPv6. Cấm metadata/link-local, redirect và DNS tới đích ngoài
   tập cho phép. IP nội bộ chỉ dùng nếu được duyệt chính xác trong môi trường đó.
4. Pin địa chỉ đã kiểm tra vào kết nối thực tế, vẫn xác minh certificate/hostname
   TLS và SNI. Không chỉ validate DNS rồi gọi `fetch` resolve lại. Test DNS rebinding,
   mixed allowed/forbidden answers và redirect không được mang credential đi nơi khác.
5. Đọc changelog/docs Supabase đúng version trước triển khai RPC manifest. RPC chỉ
   server được gọi; anon/authenticated không được execute. Manifest phản ánh release,
   schema/contract thực tế theo artifact triển khai, không là chuỗi UI tự nhập.
6. Validation đủ Auth/REST/Storage/Realtime/Functions, schema compatibility, secret,
   public key, CSP/frontend version. Kiểm tra lại registry version sau remote probe
   trước lưu validation, tránh chứng nhận một endpoint đã bị đổi giữa chừng.
7. Test rotate credential, ref mất/sai, TLS lỗi, release lệch và frontend cũ. Lỗi
   đóng nhận mới, hiển thị thiếu điều kiện; không tự đổi workspace sang cụm khác.

**Đạt:** C01–C04; thiếu RPC/SSRF protection là lỗi phải đóng, không phải việc chờ API key.

### T09 — admission và phân bổ có khóa (P3-02)

1. Gate chỉ mở khi đồng thời: global signup cho phép trong môi trường đó; cụm
   serving/active; credential đúng; manifest/frontend hợp lệ; metric mới/đủ warmup;
   không critical; backup đã verify; chưa hết limit; admin chưa đóng và đã cho mở.
2. Mặc định staging/pilot: backup bundle ≤24h, restore proof ≤30 ngày, manifest
   checksum hợp lệ. Thông tin do pipeline tin cậy ghi, không cho UI tự đánh dấu pass.
3. Trong transaction phân bổ: khóa dùng chung với policy/close; xử lý expiry đúng
   trạng thái; kiểm tra retry/affinity; tính active + provisioning + reserved chưa
   hết hạn; chọn cụm đủ điều kiện; giữ suất + affinity + event nguyên tử.
4. `cluster_policies.tenant_limit` là nguồn chuẩn. Hạ dưới số đã giữ/dùng chỉ chặn
   nhận thêm, không xóa khách/reservation đang provisioning. Import/restart không
   ghi đè limit; `max_workspaces` compatibility không là API ghi thứ hai.
5. Retry cùng đăng ký giữ ID/expiry/suất; affinity email tồn tại sau expiry. Cụm
   affinity đang blocked thì trả hướng tiếp tục/chờ hỗ trợ, không tự chọn cụm B.
6. Trước first provision recheck gate, nhưng suất đã giữ không tính thành suất mới.
   Khi RPC đã bắt đầu, tiếp tục đối soát receipt dù gate đổi; không expire theo tuổi.
7. Lưu generation/policy version đã dùng; admission snapshot phục vụ giải thích,
   không thay cho kiểm tra freshness/count trong transaction phân bổ.
8. Bài test thật: 20 khách tranh một suất; 20 retry cùng khách; close và reserve
   chồng lấn; đổi limit khi đang cấp phát; clock expiry; stale sau reserve; affinity
   sau restart/expiry. Xác nhận cả số dòng, audit và thứ tự commit.

**Đạt:** C05–C10. Đóng nhận mới không khóa login/nghiệp vụ khách active.

### T10 — budget để một khách không chiếm hết cụm (P3-03)

1. Liệt kê pool/concurrency của control, health worker, reconcile worker, Auth,
   REST, Realtime, Functions, exporter và backup; cộng budget theo từng database.
2. Giữ phần kết nối vận hành dự phòng; pool bounded, timeout/queue có giới hạn.
   Không giải quyết quá tải bằng tăng `max_connections`/`work_mem` không đo RAM.
3. Kiểm tra report nặng, upload size/rate, job batch, room quota đang có; thêm giới
   hạn server tại đường gây nghẽn có số đo. Kèm lỗi có thể thử lại và request ID.
4. Tải tenant A nặng đồng thời tenant B đặt phòng và tenant C signup; ghi riêng
   latency/error/pool/IO theo profile tổng hợp, không log dữ liệu khách thật.

**Đạt:** G05 cùng capacity profile P7; có hạn mức vận hành và hành động tăng cụm.
Admission một mình không được coi là bảo vệ mọi tải nghiệp vụ đang hoạt động.

## 7. Đợt 4 — khách tự đăng ký và tiếp tục được khi có lỗi

### T11 — trạng thái thiết lập riêng tư và resume (P4-01)

File: `app.mjs`, `store.mjs`, `src/pages/auth/WorkspaceStart.tsx`, `Onboarding.tsx`,
`AuthCallback.tsx`, `src/lib/workspace.ts` và phần bootstrap runtime hiện có.

1. Thêm setup-status xác thực đúng backend và owner. Khi chưa có tenant, kiểm tra
   email đã xác minh + binding owner; khi có tenant, kiểm tra mapping/version.
   Người khác biết slug/UUID vẫn không xem được tiến độ riêng tư hoặc job.
2. Public bootstrap chỉ trả metadata định tuyến tối thiểu; không email/hash, job,
   lỗi nội bộ hoặc token. Chuyển side effect activate/reconcile hiện nằm trong GET
   bootstrap sang luồng đã định quyền/worker; request đọc công khai không trở thành
   công cụ kích hoạt cấp phát. Giữ tương thích luồng khôi phục cũ qua test hồi quy.
3. Bước UI có mã ổn định: nhập thông tin → chờ xác thực → chờ khai báo khách sạn →
   đang thiết lập → đã sẵn sàng / cần chủ tiếp tục / cần hỗ trợ. Các bước UI không
   tự thêm trạng thái thanh toán hoặc sửa enum DB ngoài contract.
4. Refresh, hai tab và thiết bị mới đọc lại từ server bằng phiên hợp lệ; không chỉ
   dựa sessionStorage. Poll backoff có trần và dừng khi logout, active hoặc lỗi quyền.
5. Khi submit chưa biết kết quả, giữ form và mã hỗ trợ. Sau server xác nhận active,
   chuyển đúng workspace/hotel. Không reset form rồi khuyến nghị tạo đăng ký khác.
6. Email quay lại/callback hết hạn có đường gửi lại/đăng nhập; cùng email đã có
   workspace được hướng về tài khoản cũ hoặc thêm cơ sở trong doanh nghiệp.
7. Native Android bổ sung allowlist đúng setup-status/callback, PKCE và deep link
   workspace; không mở wildcard origin để sửa lỗi mobile.

**Đạt:** D01–D06; record owner/workspace/tenant/hotel/trial ổn định qua các lần thử.

### T12 — job đối soát, lease và khôi phục kết quả (P4-02)

File mới dự kiến: `workers/provisioning-reconcile.mjs`, job store/CLI/tests.
Job giữ workspace/cluster/owner/routing version và mã lỗi; không lưu password,
access token hoặc biểu mẫu khách để tự đăng ký thay họ.

| Kết quả đọc receipt tại đúng cụm | Chuyển trạng thái job / UI | Không được làm |
|---|---|---|
| Verified, khớp workspace/owner/tenant/hotel/version | Activate mapping nguyên tử; completed | Tạo thêm tenant hoặc kéo dài trial |
| Missing, backend trả lời được | waiting_owner; hướng dẫn chủ tiếp tục | Coi missing là lỗi mạng hoặc tự chạy lại form |
| Unavailable/timeout | Retry có backoff và mã hỗ trợ | Kết luận không có tenant rồi chuyển cụm |
| Conflict hoặc binding/version lệch | needs_review; hiển thị bằng chứng đã lọc | Ghi đè mapping bằng ID browser cung cấp |

1. `beginProvision` ghi job đối soát cùng transaction trước RPC ngoài cụm. Backfill
   cho trạng thái cũ chỉ qua dry-run, allowlist workspace và owner đã đối chiếu.
2. Claim ngắn bằng SKIP LOCKED; partial unique cho một job chưa kết thúc cùng
   workspace/kind; lease 90s, remote timeout 20s. Commit claim trước gọi HTTP.
3. Mọi ack/retry/activation kiểm tra fencing token và expected routing version.
   Worker lease cũ trả muộn không được sửa kết quả worker mới; receipt tại backend
   vẫn là hàng rào chống trùng khi RPC đã chạy dù HTTP client timeout.
4. Retry đề xuất 30s, 2m, 5m, 15m, 30m có jitter; tối đa 5 lượt tự động rồi hỗ trợ.
   Counter chỉ tăng khi thật sự attempt; restart không reset budget hay mất job.
5. API recheck yêu cầu capability support-reconcile, command ID/version/reason;
   trả 202 + job/command ID. Bấm lại trả công việc cũ, không tạo nhiều job active.
6. Worker shutdown ngừng claim mới và chờ deadline; hard kill được lease phục hồi.
   Không tự expire/xóa Auth/tenant của workspace đã bắt đầu provisioning.
7. Fault test tại bốn điểm: sau claim; trước RPC; remote đã commit nhưng mất response;
   trước local ack. Thử hai worker, lease hết, active đã xong và version conflict.

**Đạt:** D07–D11, A07 phần worker; count tenant/hotel/trial và binding trước/sau khớp.

### T13 — proxy, chống lạm dụng và email (P4-03)

1. Proxy ghi đè forwarded headers; backend chỉ tin IP từ proxy nằm trong allowlist.
   Parse IPv4/IPv6 chuẩn và chain đúng topology; direct request không giả được IP.
2. Limiter intent/email/global dùng trạng thái bền vững dùng chung nhiều API instance.
   Tách signup, login/reset, invitation và polling; không gộp mọi người qua cùng
   reverse proxy vào một bucket socket. Có trần dung lượng và Retry-After.
3. Thêm adapter chống bot kiểm tra server-side cho public signup. Challenge sai,
   hết hạn hoặc replay không được giữ suất. Local dùng fixture/provider test key;
   production thiếu cấu hình thì gate public vẫn đóng.
4. Thử gọi thẳng Supabase Auth: không được vượt quota/challenge/cấp tenant qua RPC.
   Chốt policy Auth signup tương thích lời mời; tắt đăng ký mới không làm hỏng
   login, reset mật khẩu và invitation nhân viên hiện hữu.
5. Email xác thực/reset/invite dùng origin + workspace đã duyệt, không URL browser
   tùy ý. Resend cooldown, link expired/replay, callback tab mới và device mới có test.
6. Local dùng inbox kiểm soát. Staging kiểm tra SPF/DKIM/DMARC theo provider, Gmail/
   Outlook thử, bounce/complaint/webhook và chống gửi trùng. Không coi Mailpit/Inbucket
   là bằng chứng gửi Internet; không test bằng địa chỉ khách thật.

**Đạt:** D12–D14 bằng môi trường tương ứng; D15 cần domain/provider thật. Khóa email
chưa có không chặn hoàn thiện limiter, callback, template và provider adapter local.

## 8. Đợt 5 — giao diện quản trị để vận hành hằng ngày

### T14 — login quản trị và lớp dữ liệu (P5-01)

File: `src/App.tsx`, `SuperAdminLayout.tsx`, auth/hook hiện có; thêm client control
typed và hooks riêng. Không dùng hook default tenant backend cho dữ liệu đa cụm.

1. Entry `/super-admin/login` ở root dùng authority cố định, hoạt động cả khi
   frontend bật directory. Workspace owner không mặc nhiên có quyền platform.
2. Điều hướng từ `/app/:slug` tới admin bằng root URL đã duyệt; không thêm basename
   workspace trước `/super-admin`. Login thất bại có cách thử lại, không về onboarding.
3. Query keys có authority identity/session scope và cluster/filter/cursor. Logout,
   đổi quyền/cụm xóa cache nhạy cảm và hủy request cũ; không cache token trong key.
4. Các mutation dùng command identity lưu bền cho payload đang chờ. Chỉ bỏ identity
   khi có receipt/outcome rõ; 409 đọc lại version và yêu cầu người dùng xem thay đổi.
5. Phân biệt initial loading, empty, unavailable và stale. Dữ liệu cũ vẫn xem được
   có nhãn nhưng không dùng làm bằng chứng cho phép lệnh nhạy cảm.

**Đạt:** A03 phần admin, E05/E08; server auth denial vẫn đúng khi tự gọi API.

### T15 — hai màn hạ tầng, tránh dashboard dư thừa (P5-02)

| Route | Nội dung trên vùng đầu màn hình | Thao tác có chỗ click |
|---|---|---|
| `/super-admin/infrastructure` | Tổng cụm/đang nhận/bị chặn; mỗi dòng tên cụm, máy, số workspace đã giữ/dùng, gate + lý do, RAM/disk còn lại, thời điểm đo | Xem chi tiết, ngừng nhận mới, thêm cụm đã chuẩn bị |
| `/super-admin/infrastructure/:id` | Một banner nguyên nhân + việc cần làm; tài nguyên, trạng thái dịch vụ, limit/suất, backup/restore và release | Kiểm tra lại, mở/đóng nhận mới, draining/serving, đổi policy |

1. Trạng thái serving, sức khỏe, nhận khách và gói thuê bao có nhãn riêng; không dùng
   một dấu chấm xanh cho bốn nghĩa. Metric thiếu không hiển thị 0%.
2. Dùng chữ đậm trên trắng/xám, xanh dương cho hành động, cam/đỏ cho cảnh báo/lỗi;
   chữ/icon đi kèm màu, tương phản đủ WCAG AA cho text và control liên quan.
3. Dialog lệnh cho xem trước/sau, số workspace bị ảnh hưởng, version và lý do.
   `open_admission` liệt kê mọi điều kiện còn thiếu; không có nút bỏ qua critical.
4. `set_draining` chỉ ngừng phân bổ mới và giữ route cũ; `set_serving` không tự mở
   admission. Không thêm nút restart DB/restore production hoặc shell console.
5. Alert/backup nằm trong detail/section có deep link, không thêm menu phụ lặp.
   Alert ack không tự chuyển banner thành khỏe nếu metric vẫn xấu.

**Đạt:** E03–E05; toast chỉ báo kết quả đã commit hoặc yêu cầu nền đã được enqueue.

### T16 — danh sách đăng ký, timeline và dữ liệu đúng cụm (P5-03)

1. `/super-admin/registrations`: tìm slug/workspace/request ID, filter trạng thái,
   lỗi/cụm/tuổi đăng ký; count server, cursor 25/100 và filter trong URL.
2. `/super-admin/registrations/:id`: bước hiện tại, owner đã verify hay chưa trong
   phạm vi được phép, timeline intent/Auth/provision/receipt/active, job/attempt gần
   nhất, lý do lỗi, mã hỗ trợ và hành động tiếp theo. Không hiện secret/raw payload.
3. Phân biệt “Chủ cần tiếp tục”, “Không kết nối được cụm” và “Cần đối soát”; nút
   “Kiểm tra lại” hiển thị pending job, không hứa đã sửa ngay khi nhận 202.
4. Tenant-summary do control đọc server-to-server tại cluster đã gán, quyền đọc tối
   thiểu. ID toàn nền tảng là cluster + tenant, không chỉ UUID tenant.
5. Có liên kết hai chiều tới khách hàng/cụm tương ứng. Nếu backend kia unavailable,
   hiển thị lỗi tại cụm đó; không fallback sang dữ liệu default hoặc hiển thị số 0.
6. Billing/gói chỉ bật thao tác đã hỗ trợ đúng backend. Không lấy authority session
   giả danh chủ khách; không mở quyền settlement nhờ có quyền vận hành hạ tầng.

**Đạt:** E01/E02/E08, G01; không chức năng nào chỉ có API mà bị mất đường truy cập
trong UI đã bàn giao. Timeline dài phải đọc tiếp được, không giấu lịch sử sau trang đầu.

### T17 — nghiệm thu usability bằng việc thật (P5-04)

1. Người thử chưa biết bản ghi mẫu tìm đăng ký lỗi và chọn hành động đúng trong
   30s; ghi thời gian, bước click và điểm gây nhầm, không chỉ người viết code tự demo.
2. Desktop, 390px, zoom 200%, tab/shift-tab/enter/escape; dialog giữ/trả focus đúng,
   nhãn screen reader và vùng báo lỗi rõ. Không tràn ngang giấu hành động chính.
3. Scroll menu xuống cuối rồi đổi trang: nội dung mới hiện từ đầu. Back trả đúng
   filter/trang/vị trí trước; direct link có fallback hợp lý, không về trang bất kỳ.
4. Hai tab/admin thay policy, F5 sau mất response, API 503, session revoke và query
   trả muộn khi đổi cụm: không hiện success/cached data của cụm khác.

**Đạt:** E01–E08 với browser kết nối API thật; component mock chỉ là lớp hỗ trợ.

## 9. Đợt 6 — bộ cài VPS, backup ngoài máy và ứng cứu

### T18 — bundle có thể cài lại và nâng cấp an toàn (P6-01)

File mới dự kiến: `deploy/vps/`, release manifest, preflight/deploy/verify scripts
và env examples. Giữ `control-local.mjs` cho phát triển, không dùng CLI Supabase
local làm bộ cài production.

1. Pin bộ Supabase self-host đầy đủ, frontend/proxy/control/worker/directory và
   monitoring; ghi image digests, schema/contract, host architecture và data mounts.
   Trước khi chọn bundle, qua bảng tương thích ở mục 16: không lấy compose upstream
   mới nhất để vô tình nâng PG major, đổi Kong/Envoy hoặc callback Auth của hệ hiện có.
2. Preflight read-only kiểm tra OS/RAM/disk/inode/clock/Docker/port/DNS/TLS/secret,
   tên môi trường/volume hiện có. Sai host, thiếu secret hoặc volume mismatch phải
   dừng trước prepare/apply; không tự format, đổi ownership rộng hoặc tạo DB rỗng.
3. Tách prepare → migrate bằng account riêng → deploy → verify. Runtime không có
   migration credential; secret nằm file quyền hạn chế/secret store, không build args.
4. Public chỉ proxy/TLS cần thiết; DB/control/exporter riêng tư hoặc loopback tùy
   topology. Đường SSH/quản trị giới hạn riêng, không đi qua chức năng khách hàng.
5. Kiểm tra TLS renewal, WebSocket Realtime, upload limit/timeouts, CSP/allowlist,
   redirect/callback, VAPID và Android deep link trên chính release được phục vụ.
6. Resource limits, restart, healthcheck, log rotation, disk alert và bounded pools.
   Ghi đường dẫn volume thật; deploy lại không tạo volume mới che khuất dữ liệu.
7. Upgrade theo expand/contract, compatibility matrix binary/schema; giữ image cũ.
   Migration không tương thích thì forward-fix hoặc quy trình restore riêng, không
   chạy binary cũ kèm schema.sql để hạ DB hoặc xóa history.

**Đạt:** F01–F04 trên Linux staging; restart VPS thực và xác nhận dữ liệu còn nguyên.

### T19 — backup theo bộ nhất quán và restore sang máy sạch (P6-02)

1. Inventory đầy đủ directory mapping/affinity/command/job/audit; DB tenant/Auth/
   Storage metadata/PGMQ; Storage object bytes; release manifest; cấu hình và các
   secret/Vault key cần khôi phục. Không coi backup DB là backup đủ ứng dụng.
2. Mỗi backup set có ID, scope/cluster/environment, UTC time window, schema/image,
   checksum từng phần, số object/bytes, trạng thái verify và secret-reference version.
3. Pilot dùng maintenance window quiesce mọi writer liên quan: app/API, jobs,
   uploads và dịch vụ nền/Auth có ghi. Xác nhận không còn writer trước tạo snapshot
   DB + objects cùng bộ; chỉ một cờ frontend không được coi là đã ngừng ghi.
4. Dùng công cụ backup/mã hóa chuẩn đã pin; upload tới kho ngoài failure domain
   VPS, verify đọc/checksum sau upload. Secret giải mã giữ kho/quyền tách biệt nhưng
   có break-glass đã thử; không lưu key duy nhất cùng máy hay cùng backup ciphertext.
5. Lịch khởi đầu đề xuất mỗi 12h để có dư địa với RPO ≤24h. Retention backup phải
   duyệt theo chi phí/nghĩa vụ dữ liệu; cleanup có dry-run + ownership + manifest,
   chưa tự xóa backup đang có theo thời hạn suy đoán.
6. Restore vào host/volume mới có nhãn; từ chối source/live target. Verify đủ parts,
   key/checksum/version trước mở dịch vụ; thiếu object hoặc sai key phải fail rõ.
7. Kiểm tra login owner/staff, workspace routing, rooms/bookings mẫu, invitation,
   file bytes/hash, receipt/trial và khả năng xử lý queue theo semantics cũ. Đối
   soát job/payment có thể đã chạy ngoài snapshot; không tự replay tác vụ tài chính.
8. Drill mất host gốc: chỉ dùng offsite + secret store độc lập. Đo thời điểm dữ liệu
   gần nhất (RPO) và thời gian tới phục vụ lại (RTO); mục tiêu pilot ≤24h/≤4h chỉ
   được công bố khi đo đạt với dataset đã ghi.

**Đạt:** F05–F08. Bản sao cùng ổ hoặc dump đọc được chưa đóng được mục mất cả máy.

### T20 — runbook đủ dùng khi không có người viết code (P6-03)

Mỗi runbook ghi: dấu hiệu → mức ảnh hưởng → kiểm tra read-only → khôi phục theo
target xác định → kiểm tra dữ liệu/health → điều kiện mở nhận mới → người trực.

| Tình huống | Xử lý ban đầu | Bằng chứng để kết thúc |
|---|---|---|
| Control/directory down | Đóng signup; giữ mapping và data clusters; kiểm tra volume/DB/pool | Ready đúng schema, mapping/receipt đối soát, alert resolved |
| Metrics stale/worker mất | Admission blocked, báo unknown; sửa nguồn/collector | Fresh đủ warmup, recovery đúng cửa sổ, admin mở lại |
| Disk/inode/connection critical | Dừng nhận mới; khoanh vùng WAL/log/object/query/pool | Số đo giảm bền vững; không xóa dữ liệu khách để chữa nhanh |
| Backend unreachable | Giữ cluster mapping, kiểm tra mạng/TLS/service | Đúng backend phục hồi, probe và dữ liệu canary đạt |
| Credential/TLS lỗi | Đóng nhận mới, rotate/renew theo release refs | Secret không lộ; workspace không đổi cụm; auth/requests đạt |
| Provisioning kẹt | Đọc job/receipt, phân biệt missing/unavailable/conflict | Cùng binding hoặc waiting_owner/needs_review có người nhận |
| Backup/offsite thất bại | Cảnh báo, không tự đánh dấu verified/mở cụm | Bộ backup mới verify và restore proof còn hạn |
| Mất cả VPS | Nhận cảnh báo ngoài máy, phục hồi host sạch | RPO/RTO, data checks và đường truy cập được ghi nhận |

**Đạt:** F09/B09; người vận hành khác thực hiện một drill theo tài liệu và nhận
được cảnh báo thử ở đích được kiểm soát. Không dùng sửa SQL tùy ý như thao tác thường ngày.

## 10. Đợt 7 — chứng minh sản phẩm trước pilot

### T21 — hai backend độc lập thật (P7-01)

1. Hai bộ Auth/DB/Storage/Realtime/Functions, key/secret/volume/network riêng; một
   directory chung. Nếu máy local không đủ RAM, dùng hai host thử hoặc staging;
   không đổi sang hai URL trỏ cùng DB rồi gọi đó là đa cụm.
2. Signup mới ở A/B, token A không dùng ở B; đồng thời token A ở A vẫn chạy, tránh
   kết luận security pass vì cả hai backend đều hỏng. Test rows/object/channel/RPC.
3. Cố ý có tenant UUID giống nhau trong fixture độc lập nếu phù hợp, để chứng minh
   console/routing dùng cluster+tenant. Callback/reset/invite/mobile về đúng cụm.
4. Drain A, khách mới chưa có affinity sang B; khách A vẫn vào A. A down không làm
   khách đã gán A rơi sang DB B hoặc tạo lại Auth/tenant.

**Đạt:** G01–G03 và phần data isolation D/E liên quan; lưu positive/negative controls.

### T22 — browser E2E và fault injection (P7-02)

1. Seed dữ liệu tổng hợp theo run ID, email inbox thử; kiểm tra exact schema/images.
   Browser test thao tác qua UI và API thật, không thay network bằng mock khi nghiệm thu.
2. Chạy owner signup → email → onboarding → tạo phòng → mời staff → staff đăng nhập
   đúng quyền → nghiệp vụ room/booking cơ bản → logout/reset → mở lại workspace.
3. Chạy admin tìm đăng ký → xem cụm → close/open/đổi limit → recheck → kiểm tra audit.
   Kèm quay lại/scroll/mobile, hai admin, session revoke và dữ liệu stale.
4. Chặn response chỉ sau khi có bằng chứng remote/local commit, kill worker tại
   các điểm đã định, mất DB/metrics/backend trong sandbox. Không fault inject trên
   container dự án khác hoặc dữ liệu khách đang dùng.
5. Sau từng lỗi, đếm owner/tenant/hotel/trial/job/receipt, kiểm tra mapping không
   đổi và không mất bản ghi. Có screenshot/trace quan trọng đã lọc thông tin nhạy cảm.

**Đạt:** các case A–F/G liên quan môi trường được chạy lại trên release candidate;
not-run được giữ nguyên cùng lý do, không chuyển thành pass bằng demo tay.

### T23 — capacity profile và limit có căn cứ (P7-03)

1. Ghi VPS CPU/RAM/disk/IOPS/region, Docker/kernel, image digests, DB settings,
   lượng dữ liệu, kích thước file và toàn bộ service cùng máy.
2. Dataset console ít nhất 1.000 workspace. Dataset nghiệp vụ theo profile
   10/50/100 khách sạn và 10–50 tài khoản/khách sạn; số tài khoản khác số đang hoạt động.
3. Tăng 10 → 25 → 50 → 100 phiên đồng thời có think time 3–10s và workload được
   ghi trước: login, rooms, bookings read/write, realtime, uploads, report, signup.
   Không bắt buộc đạt mức cuối; dừng khi lỗi/critical/pool/IO vượt tiêu chí.
4. Đo p50/p95/p99, 5xx, DB pool/wait/locks, CPU/RAM/disk/IO, realtime delay, job age,
   RSS/leak và tác động tenant nặng lên tenant đối chứng. Warmup tách khỏi sample.
5. Target staging: bootstrap/setup-status server p95 ≤500ms; reserve ≤1s; provision
   hợp lệ đến active ≤10s không tính email; admin page ≤1s với limit chuẩn.
6. Soak ít nhất 60 phút ở operating profile đề xuất; 5xx không chủ ý <1%, không
   memory/queue tăng vô hạn hay connection leak. Ghi cả request bị gate từ chối
   theo kỳ vọng, không gộp với outage để che hoặc thổi error rate.
7. Báo maximum tested và operating limit có headroom. Lấy điểm bắt đầu suy giảm để
   đặt giới hạn bảo thủ, đo lại ở giới hạn đó; không chọn số tenant chỉ từ RAM trống.
   Chi phí gồm VPS, backup, bandwidth/email/monitoring và vận hành.

**Đạt:** G04–G06, P3-03. Mục tiêu 1.000 khách sạn được phục vụ bằng nhiều cụm đã
đo; chưa có cơ sở cam kết một VPS hoặc toàn hệ thống đạt 100.000 phiên đồng thời.

### T24 — release candidate, cutover và rollback (P7-04)

1. Đối chiếu 70 case: pass/fail/not-run theo môi trường, không cộng lại test cũ.
   G08 là pilot đợt 8 nên chưa pass ở release candidate; không vì vậy giả đóng case.
2. Full suite/build ở integration; contract parse/refs/security, schema/grants,
   Supabase advisors đúng CLI đã kiểm tra `--help`/version, secret/artifact scan và
   container smoke. Legacy warning có owner/ảnh hưởng, không lẫn với lỗi mới.
3. Không còn lỗi Critical/High ảnh hưởng quyền, dữ liệu, phân bổ hoặc restore trước
   gate liên quan. Test hỏng do fixture/runner cũng phải sửa hoặc ghi không kiểm
   chứng được; không gọi đó là lỗi môi trường để cho qua.
4. Cutover trên staging host trước: control sẵn sàng, signup đóng; frontend hỗ trợ
   legacy/workspace/admin; CSP/redirect đúng; mapping khách cũ đối soát theo inventory.
   Chưa có đường legacy đạt thì không bật directory toàn cục trên host có khách cũ.
5. `directory_required=true` chỉ tại cụm đã nghiệm thu; rollback không tắt tùy tiện
   để mở lại đường bypass provisioning. Lưu cờ trước/sau, release/backup/command IDs.
6. Rollback frontend/control bằng image tương thích, giữ directory/mapping/receipt;
   đóng signup/claim mới trước khi khôi phục. Không `down -v`, reset DB, xóa workspace
   hoặc đổi cluster endpoint để che sự cố. Schema không tương thích thì forward-fix.

**Đạt:** G07 và release checklist; gate pilot chỉ mở khi staging/backup/alert/capacity đạt.

## 11. Đợt 8 — pilot có người dùng được chọn (P8-01)

### T25 — giới hạn ban đầu, quan sát và quyết định

1. Trước ngày 0: chỉ định người trực, giờ hỗ trợ, kênh sự cố, allowlist khách pilot,
   limit từ profile, backup/offsite/restore proof và kill switch signup đã thử.
2. Ngày 0: một khách sạn nội bộ, đi hết owner/staff/rooms/booking/upload/callback.
   Ghi thời gian đến khách sạn, phòng và nhân viên đầu tiên; mọi lỗi có ticket/owner.
3. Sau 24–48h ổn định mới xem xét thêm từng khách, tối đa nhóm 5–10 khách pilot
   đã chọn. Có sự cố Critical/High thì ngừng tăng, đóng nhận mới khi cần.
4. Quan sát ít nhất 7 ngày; gồm giờ cao điểm, backup hằng kỳ, một restore drill,
   một alert drill, vận hành recheck và feedback UX thực tế.
5. Mục tiêu theo dõi API quan trọng ≥99,5% trong cửa sổ pilot; ghi cách đo, outage,
   provider lỗi và tác động riêng. Không cam kết SLA dài hạn từ một tuần dữ liệu.
6. Báo cáo quyết định: tiếp tục pilot / mở thêm có giới hạn / thêm cụm / sửa trước.
   Public signup và thu phí cần gate U/B riêng, không tự mở khi đủ bảy ngày.

**Đạt:** G08; không rò/mất dữ liệu, không cấp phát trùng, có số đo vận hành và người
chịu trách nhiệm. Hết thời gian quan sát mà chưa đủ bằng chứng thì kéo dài pilot.

## 12. Bảng đối chiếu đủ 27 gói công việc

| Gói | Bước thực thi | Bằng chứng bắt buộc / case chính |
|---|---|---|
| P0-01 | T01 | Baseline nguồn/runtime/port/flags; A01–A03 theo môi trường |
| P0-02 | T04, T08 | ADR và contract khớp implementation, version/state/error rõ |
| P0-03 | T01, T21, T22 | Fixture ownership, email/accounts, hai backend, cleanup an toàn |
| P1-01 | T02 | Upgrade/rerun/checksum/lock/grants; A04–A06 |
| P1-02 | T02, T04, T12 | Restart/drain/readiness API+DB+worker; A07 |
| P1-03 | T03, T04 | Authority, command/version/receipt/audit; A08–A11 |
| P2-01 | T05 | Linux metric đúng host/mount, mạng riêng; B01–B03 |
| P2-02 | T06 | Sample/generation/freshness/window/restart; B04–B07 |
| P2-03 | T07, T20 | Alert lifecycle và heartbeat ngoài host; B08–B09 |
| P3-01 | T08 | Registry/credential/manifest/SSRF/rotation; C01–C04 |
| P3-02 | T09 | Slots/retry/close race/affinity/first provision; C05–C10 |
| P3-03 | T10, T23 | Budget và noisy-neighbor có số đo; G05 |
| P4-01 | T11 | Owner/setup-status/resume/forms/privacy; D01–D06 |
| P4-02 | T12 | Receipt/job/lease/fencing/kill recovery; D07–D11 |
| P4-03 | T13 | Proxy/Auth/abuse/email; D12–D15 |
| P5-01 | T14 | Root admin login, cache/authority/routes; A03/E08 |
| P5-02 | T15 | Hạ tầng và command dialog; E03–E05 |
| P5-03 | T16 | Registrations/timeline/recheck/tenant-summary; E01/E02/E08 |
| P5-04 | T17 | Usability/scroll/Back/mobile/keyboard; E01–E08 |
| P6-01 | T18 | Linux deploy/redeploy/restart/TLS/secret; F01–F04 |
| P6-02 | T19 | Full offsite backup/restore/failure/host loss; F05–F08 |
| P6-03 | T20 | Runbook người khác thực hiện được; F09 |
| P7-01 | T21 | Backend A/B thực sự cách ly; G01–G03 |
| P7-02 | T22 | Browser E2E + faults trên source/image xác định |
| P7-03 | T23 | Capacity/soak/dataset/noisy-neighbor; G04–G06 |
| P7-04 | T24 | Full release, defects, gate/cutover/rollback; G07 |
| P8-01 | T25 | Báo cáo pilot ít nhất 7 ngày; G08 |

70 case giữ nguyên định nghĩa tại tài liệu nghiệm thu. Bảng này là đường thực thi,
không phải báo cáo pass. Mỗi case nhiều assertion vẫn chỉ là một case khi tổng hợp.

## 13. Kiểm tra và báo cáo sau từng đợt

### Lệnh đã có trong repository

Chạy tại integration sau khi hoàn thành thay đổi tương ứng, không coi danh sách
lệnh là kết quả đã chạy trong lượt lập plan:

```powershell
npm run test:control
npm run test:control:db
npm run build
npm run verify:build
npm run control:local -- preflight
npm run control:local -- verify
```

`test:control:db` dùng PostgreSQL disposable riêng. Frontend build/full suite chạy
ở cổng tích hợp khi có thay đổi FE hoặc release; backend-only kiểm tra đúng phần
liên quan trước. `control:local -- up` và `restart-check` chỉ chạy sau review/migrate
sandbox đạt, dùng state local đang có và signup vẫn false.

Không dùng `test:control:local` trên backend nghiệp vụ đang dùng: script cũ có thay
đổi `directory_required`. E2E mới phải trỏ sandbox có ownership/fixtures rõ ràng.
Script monitoring/worker/VPS mới chỉ được ghi lệnh chính thức sau khi đã triển khai,
có `--help`, kiểm tra input/target và runbook; không để lệnh dự kiến trông như có sẵn.

### Nội dung báo cáo bắt buộc

1. Đã thay đổi gì, ở nhánh/commit nào, đã đồng bộ/deploy tới đâu.
2. Case đạt/lỗi/chưa chạy, command thực tế, môi trường và artifact mới.
3. Image/schema/policy versions và cờ signup/directory liên quan.
4. Ảnh hưởng khách đang dùng, rollback và lỗi còn mở với mức độ/người phụ trách.
5. Việc tiếp theo có thể làm ngay và việc cần đầu vào bên ngoài.

Artifact không có credential/raw email/payload. Có source tree hash cho mã chưa
commit, image digest thực chạy, schema history và run ID; không gán hash code mới
cho image cũ hoặc sửa artifact nền để tạo cảm giác test mới đã chạy.

## 14. Đầu vào bên ngoài để riêng, chưa cần để làm code/local

| Đầu vào | Cần khi nào | Có thể hoàn thiện trước | Chứng minh khi đã có |
|---|---|---|---|
| VPS staging, SSH/CI, OS/IP/tài nguyên | T05 đối chiếu Linux, T18 deploy, T23 capacity | Compose/preflight/verify và sandbox | F01–F04, B01, capacity đúng cấu hình máy |
| DNS roomqc.com, staging/app/API origins và TLS | Callback/CSP/mobile staging, T18/T22 | Origin allowlist, template, test local | Browser/Auth/Realtime/Storage qua domain thật |
| Resend/SMTP, miền verified, webhook secret | T13 email thật | Queue/templates/provider adapter/inbox thử | D15, bounce/retry/callback đúng; tình trạng tài khoản phải kiểm tra lại |
| Chống bot production | Gate public | Adapter/server verification/test fixtures | Challenge fail/replay/direct Auth và hạn mức đạt |
| Kho offsite và khóa phục hồi | T19 backup thật, gate pilot | Manifest/encryption/restore pipeline local | F05–F08 bằng bản lưu ngoài máy |
| Đích alert và hệ thống heartbeat độc lập | T07/T20, gate pilot | Alert lifecycle/runbook/inbox local | B09/F09 khi host thử mất kết nối |
| Operator/MFA và khách pilot | Lệnh production/T25 | Capability server, UI, checklist | Người trực xử lý drill; khách được chọn hoàn tất hành trình |

Không yêu cầu gửi secret trong chat. Khi tới bước cấu hình, nhập vào server/secret
store được quản trị; báo cáo chỉ giữ tên ref và trạng thái. Thiếu các đầu vào trên
không phải lý do bỏ dở T01–T17 hay đánh dấu triển khai VPS/email/offsite đã hoàn tất.

## 15. Điều kiện chuyển cổng

| Cổng | Điều kiện tối thiểu | Phạm vi cho phép |
|---|---|---|
| Local | Nền/control/commands đạt, fixture tách biệt; gate đúng nguồn, worker/flow local đạt theo đợt | Dùng tài khoản/dữ liệu tổng hợp trong sandbox |
| Staging | T05–T20 đạt trên cấu hình staging; callback/TLS/email/backup và A–F liên quan có bằng chứng | Khách thử kiểm soát, chưa mở rộng công khai |
| Pilot | E2E đa cụm/fault/load/cutover phù hợp đạt; restore offsite/alert/người trực sẵn sàng; không còn lỗi nghiêm trọng liên quan | Một khách nội bộ rồi nhóm 5–10 khách được chọn |
| Public | Anti-abuse/Auth/proxy/monitoring/support đã nghiệm thu, pilot đủ bằng chứng, limit/kill switch đã thử | Đăng ký công khai có hạn mức |
| Paid | Gate thanh toán/settlement/provider/chính sách gói và quyền dữ liệu riêng đã đạt | Thu phí/cấp gói thật theo backlog billing |

Ưu tiên hiện hành là **R4 → R3 còn lại/R5 → R6 → R7** trong M06/T08 theo mục 24;
sau đó khép pipeline T05/T06 và cảnh báo T07, phần Auth/admission/budget còn lại
ở T03/T09/T10, rồi signup và console. Các test T01–T04 vẫn là hàng rào hồi quy.

## 16. Tương thích Supabase phải khóa trước bộ cài và cutover

Đã đọc changelog và tài liệu Docker ngày 19/10/2026; chưa nâng cấp dịch vụ theo các
thông báo này. Áp dụng tùy release self-host đã chọn, không mặc định chính sách
Supabase Cloud đã có hiệu lực trên container local đang dùng.

| Thay đổi cần rà | Bước chịu trách nhiệm | Kiểm tra và cách xử lý |
|---|---|---|
| Gateway mặc định chuyển Kong → Envoy | T08/T18/T22 | Inventory release/config hiện có; chốt gateway trong manifest. Test toàn bộ route/RPC/WebSocket/headers. Giữ bản cũ đã pin nếu chưa kiểm chứng chuyển đổi; không phụ thuộc service name `kong` trong bộ cài mới |
| `API_EXTERNAL_URL` có hậu tố `/auth/v1` ở cấu hình mới | T13/T18/T22 | Đối chiếu release/template; test xác thực/reset/invite/mobile, không nối hậu tố hai lần; không sửa URL production chỉ vì default upstream đổi |
| Postgres major 15 → 17 không tự nâng volume | T18/T19 | Ghi major/extension/collation. Cài mới chọn bộ tương thích; nâng dữ liệu cũ thành đợt có backup/restore/upgrade test riêng, không đổi tag rồi mount volume cũ |
| Minor PostgreSQL 15.19/17.11: ltree, btree_gist/NaN, pgcrypto legacy cipher và custom operator | T18/T19/T24 | Kiểm tra extension/index/cipher/operator theo changelog cho từng release đích; reindex/chuyển mã hóa/restore compatibility chỉ trong đợt nâng cấp có bằng chứng. Chưa chạy các thao tác này trên DB nghiệp vụ trong lượt lập plan |
| Bảng mới không mặc định được Data API expose | T08/T11/T24 | Kiểm tra grants/privileges và RLS trên release đích. Manifest server-only phải từ chối anon/staff; endpoint nghiệp vụ chỉ cấp đúng role/policy, không mở toàn schema để hết lỗi |
| Schema Realtime được khóa; policy trên `realtime.messages` vẫn được phép | T08/M06/T18 | Không tạo bảng/function hoặc lặp `ALTER TABLE ... ENABLE RLS` trong schema do service quản lý; kiểm tra RLS có sẵn và dùng policy canary đúng topic. Khởi tạo hành vi service trước freeze schema, vẫn phát hiện drift publication/ACL |
| TLS 1.2 CBC cũ bị loại ở HTTP API Cloud từ 10/11 | T18/T22 | Test trust/cipher bằng client web/Android và proxy thật; không gán lịch Cloud thành việc đã cập nhật self-host |

Nguồn đối chiếu:

- [Self-host Docker và lựa chọn bộ release](https://supabase.com/docs/guides/self-hosting/docker).
- [Thay đổi gateway](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b).
- [Thay đổi Auth external URL](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1).
- [Nâng major PostgreSQL](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change).
- [Tương thích minor PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- [Quyền Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- [Giới hạn sửa schema Realtime](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)
  và [phân quyền kênh riêng](https://supabase.com/docs/guides/realtime/authorization).
- [TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).


## 17. Phiếu chuẩn bị triển khai tiếp theo — chốt ngày 19/10/2026

Đây là run sheet bổ sung, không thay 27 gói, 25 bước hoặc 70 case bên trên.
Mục 17.1–17.3 giữ mốc lịch sử trước khi M04/M05 hoàn tất kiểm chứng nguồn local;
điểm bắt đầu mới dùng mục 18 và tracker, không triển khai lại các phần đã đạt.
Tình trạng công việc lấy ở tracker; việc có tên file, script hoặc cấu hình chưa
chứng minh đã deploy. Lượt rà này không mở signup, đổi DNS, gửi email thật hoặc
ghi vào Supabase nghiệp vụ. M04 được tiếp tục trong sandbox riêng theo mục 17.3.

### 17.1. Mốc nguồn và runtime phải phân biệt

- Nguồn đã kiểm chứng trước lượt này: dec5fdf, suite 59/59; artifact source cũ giữ nguyên.
- Runtime quan sát 15:19 +07:00: /api/control/livez và /api/control/readyz tại
  8091 trả 200; readyz qua proxy 8082 trả 200, schema 0005-health-snapshot-guard.sql.
- Image control đang chạy:
  sha256:a65408e99b5cc9f012c582be7e0c46b211d089e605c44335e194e38dc73136e1.
  Image frontend:
  sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b.
- Nhánh integration có M04 đang hoàn thiện: compose, DB queries/role, renderer,
  monitoring-config và thay đổi telemetry-source. Không gán hash image trên cho mã mới.
- Bộ unit/DB hiện tại đã chạy 64/64 trước khi thêm kiểm thử stack monitoring thật.
  Kết quả này không chứng minh exporter chạy được, không là 64/70 acceptance.
- Tài nguyên Docker Desktop chỉ phản ánh Linux VM; B01 Linux VPS vẫn cần staging.

### 17.2. Điều kiện bắt đầu mỗi ticket

1. Ghi ID T/M/P và acceptance ID liên quan, phạm vi môi trường và người nhận việc.
2. Ghi git diff/source hash, image/schema/config trước khi chạy; nhận diện phần đang dở.
3. Fixture phải có run ID và manifest tên container/network/volume/temp directory;
   không nhận tên project/DB nghiệp vụ làm fixture hoặc tự fallback khi thiếu config.
4. Chỉ chạy một migrator với quyền phù hợp tại target được duyệt; runtime không giữ
   quyền DDL. Không chỉnh checksum file đã có history.
5. Chốt contract trước API/UI: dữ liệu nào server sở hữu, version/idempotency, lỗi,
   timeout, pagination và DTO không chứa bí mật.
6. Ghi trước expected/actual, negative control và điều kiện cleanup. Test lỗi vẫn
   phải thu hồi đúng tài nguyên đã tạo, không down -v hoặc xóa theo glob.
7. Thiếu secret bên ngoài thì ghi deferred_external đúng gate; tiếp tục phần local
   độc lập. Không dùng fixture success hoặc nới quyền để lấp thiếu cấu hình.
8. Người thực hiện có thể là cùng một kỹ sư qua nhiều đợt; review, người trực và
   người duyệt pilot/public phải được chỉ định trước cổng tương ứng.

### 17.3. Đợt gần nhất: M04 → M05 → M06/T08 → M07/M08 → M10

| Bước con | Việc cụ thể theo thứ tự | File/đầu ra | Đóng bước bằng bằng chứng |
|---|---|---|---|
| M04-a | Rà digest, UID, resource/log limits, private network và host mount; xác nhận không cần privileged/PID host/Docker socket | deploy/monitoring/compose.yml và test config | Compose chạy được trên môi trường đã ghi; exporter/DB không publish port |
| M04-b | Áp role thống kê mới trong PostgreSQL disposable; cấp LOGIN/password qua secret channel; kiểm tra quyền PUBLIC không cho đọc/ghi business fixture | exporter-roles.sql, queries.yml | Đọc thống kê đúng; business SELECT/DML/DDL và tự tăng quyền đều bị từ chối |
| M04-c | Render bundle mới từ target inventory; không ghi đè thư mục có sẵn, không in DSN/password | monitoring-config.mjs, render-monitoring-config.mjs | --help không ghi; input sai dừng; bundle readable đúng container UID; rerender cùng thư mục bị chặn |
| M04-d | Discover filesystem thực chứa volume fixture; đối chiếu CPU, MemAvailable, disk/inode và số client DB | monitoring-stack.test.mjs, log mới | Sai mount/unsupported FS phải fail; không thay bằng ổ bất kỳ để lấy số |
| M04-e | Thu hồi quyền thống kê, dừng DB, dùng mật khẩu cũ và rotate có chủ đích | Cùng integration test | Nguồn từ chối mẫu lỗi; sau sửa có mẫu thật mới; không mở admission |
| M04-f | Kiểm tra socket qua các đường symlink, non-root/capabilities; dọn tài nguyên theo ownership | Runtime inspect + cleanup guard | Không còn container/network/volume/temp fixture, không ảnh hưởng stack khác |
| M05-a | Thêm entrypoint worker riêng, pool metrics, chu kỳ 30s và giới hạn target/fanout | workers/health-worker.mjs và compose, dự kiến | Không scrape trong HTTP handler; không chồng vòng hoặc queue vô hạn |
| M05-b | Khóa snapshot vào expected target fingerprint hiện hành; đổi cấu hình làm bằng chứng cũ mất hiệu lực ngay | Config/HealthStore + migration nếu cần | Chưa có mẫu target mới vẫn không được dùng snapshot target cũ để nhận khách |
| M05-c | Sweep stale độc lập với source collect; heartbeat/readiness; SIGTERM/kill/restart | Worker tests + DB tests | >120s chặn tại reserve dù worker ngừng; window/generation không lùi |
| M06/T08 | Triển khai manifest server-only và canary của đủ Auth/REST/Storage/Realtime/Functions | Migration Supabase bằng CLI, probe adapter/tests | Key sai/release sai/service down bị phân biệt; không hard-code năm probe true |
| M07/M08 | Alert lifecycle + ack command/audit + notification outbox/cooldown/retry | Store/API/dispatcher tests | Một lỗi một alert; ack không mở gate; mất response/restart không gửi dồn vô hạn |
| M10 | Suite hồi quy + runtime sandbox + source/image/schema manifest và handoff | Artifact mới, tracker, runbook | Pass/fail/not-run riêng; M09/external còn thiếu không bị đánh dấu pass |

M04 dùng fixture PostgreSQL riêng; chưa phải full Supabase và chưa chứng minh năm
service hoạt động. Chu kỳ scrape local có thể 5s để kiểm thử; staging/production
không lấy cấu hình test này làm chuẩn. Nếu host bind không hỗ trợ propagation,
chọn cấu hình tối thiểu đã thử, không sửa mount propagation toàn host hoặc cấp
privileged. Khi thay mount/inventory phải kiểm tra lại exporter và warmup.

### 17.4. Hợp đồng phải khép trước signup/UI

| Ranh giới | Nội dung bắt buộc | Trường hợp phải chặn |
|---|---|---|
| Registry → backend | Cluster ID/endpoint trong inventory, DNS/IP pinning, TLS đúng hostname, credential ref, release/schema manifest | Endpoint lạ, ref mất, version lệch, manifest không xác minh |
| Metrics → admission | Target/schema/policy version, generation, observedAt/validUntil; xét từng mount | Unknown/stale/sai target/critical/không đủ warmup |
| Reserve → Auth | Workspace UUID/slug, affinity và expiry gốc; cluster do server chọn | Retry muốn đổi cụm, body tự gán role/tenant/gói |
| Provision → receipt | Workspace/cluster/owner/tenant/hotel/routing version khớp toàn bộ | Email chưa verify, token sai cụm, receipt conflict |
| Worker → activation | Job lease/fencing + receipt hợp lệ; local commit nguyên tử | Worker cũ trả muộn; routing version đã đổi; outcome chưa rõ |
| Admin → mutation | Authority cố định kiểm tra mỗi request, capability, command ID, expectedVersion/reason | Quyền bị revoke, stale dialog, cùng key khác payload |
| Console → tenant summary | Control server đọc đúng cluster+tenant, DTO tối thiểu, cache có authority scope | Không fallback tenant ID sang backend mặc định |
| Backup → gate | Backup set nhất quán, checksum/offsite verified, restore proof còn hạn | File dump đơn lẻ, thiếu objects/key hoặc backup cùng host |

T03 còn phải kiểm tra Auth/revoke/MFA thật. T09 đã có race ở directory, nhưng phải
chạy lại với backend thật sau M06/T08. Không bật nút mở admission chỉ vì API 200.

### 17.5. Run sheet T11–T17: đăng ký và giao diện

1. Cài GET /api/control/workspaces/{slug}/setup-status theo OpenAPI; chỉ owner/session
   đúng cụm được xem trạng thái riêng tư. Không làm public bootstrap lộ email/job.
2. Hợp nhất UI chờ email → khai báo → đang xử lý → active. Đây là trạng thái hiển
   thị, không tự thêm mọi nhãn UX vào enum workspace.
3. Reload/hai tab/thiết bị mới phải resume bằng phiên và binding server, không chỉ
   sessionStorage. Timeout không xóa form hoặc hướng dẫn tạo khách sạn lần nữa.
4. Khi bắt đầu provision, ghi job cùng transaction. Claim/lease ngắn; gọi backend
   ngoài transaction; activate/ack chỉ sau kiểm tra fencing và receipt.
5. Receipt verified → activate; missing → chủ tiếp tục; unavailable → retry;
   conflict → needs_review. Mỗi nhánh phải có negative test, không gộp thành network error.
6. Limiter bền vững qua restart/nhiều API instance; tách signup/login/invite/reset.
   Kiểm thử direct Auth và forwarded headers, không chỉ nút frontend.
7. Tái sử dụng /super-admin layout: chỉ thêm Hạ tầng và Đăng ký mới; alert/backup
   là section/deep link. /settings/audit-log vẫn là nhật ký khách sạn.
8. Registrations UI đọc workspace API, không tạo thêm nguồn dữ liệu song song.
   Cursor 25/100 và filter trong URL; count server; Back giữ ngữ cảnh.
9. Close/open/limit/recheck dùng dialog có ảnh hưởng/lý do/version; giữ command ID
   khi F5 hoặc mất response. 202 chỉ nghĩa đã nhận công việc.
10. Nghiệm thu 390px/zoom 200%/bàn phím/scroll và session revoke; màu thông dụng,
    có chữ/icon, không pastel khó đọc hoặc menu phụ trùng.

### 17.6. Budget, nghiệm thu và quyết định lên VPS

- T10 lập bảng pool thực tế theo database: số replica × pool mỗi service + kết nối
  tạm (exporter/backup/migrator) + phần dự phòng vận hành không vượt budget đã đo.
  Không coi 1 user = 1 DB connection; không tăng max_connections để thay load test.
- T18 chỉ nhận inventory có OS/architecture/RAM/CPU/disk/inode và mount thật; pin
  full Supabase release. Cài lại/restart không đổi volume hoặc che dữ liệu cũ.
- T19 phải khôi phục directory + Auth/DB + object bytes + cấu hình/key liên quan
  từ bản ngoài host; kiểm tra file hash, login, mapping, receipt và queue.
- T21 dùng hai backend có DB/Auth/key riêng. Hai URL cùng DB không phải đa cụm.
  Token sai cụm bị chặn đồng thời positive control ở đúng cụm vẫn hoạt động.
- T22 test browser với API thật: owner → email → onboarding → phòng → mời staff →
  phân quyền → nghiệp vụ → admin xử lý lỗi, kèm kill/lost-response có kiểm soát.
- T23 tăng tải 10/25/50/100 phiên có think time; soak ít nhất 60 phút. Công bố
  maximum tested và operating limit có headroom; không cam kết 100.000 đồng thời.
- T24 kiểm tra đủ A01–G08 theo môi trường; G08 thuộc pilot, không pass ở staging.
  Lỗi Critical/High về quyền, dữ liệu, phân bổ hoặc restore chặn cổng liên quan.
- T25 một khách nội bộ trước, rồi nhóm 5–10 khách được chọn khi đủ bằng chứng;
  quan sát ít nhất 7 ngày. Public và thu phí vẫn là hai cổng riêng.
- Khách sạn active không bị khóa hoặc tự đổi cụm khi đóng nhận mới. Với lỗi dữ
  liệu/quyền: dừng mở rộng, giữ bằng chứng, đóng signup/claim mới theo runbook;
  rollback image tương thích, không xóa binding/volume để thử lại.

### 17.7. Báo cáo và phần cần RoomQC cung cấp sau

Mỗi đợt ghi: T/M/P IDs → commit/tree hash → image/schema/config thực dùng → lệnh
và expected/actual → acceptance pass/fail/not-run → lỗi/owner → cleanup/rollback.
Không cộng số test qua các lượt, không dùng số assertion làm phần trăm sản phẩm.

Đầu vào gom một lượt theo gate: VPS Linux staging/đường CI hoặc SSH; DNS/TLS của
roomqc.com và origin được duyệt; email provider/domain verified; chống bot production;
kho offsite + khóa khôi phục độc lập; alert/heartbeat ngoài host; operator/MFA và
danh sách khách pilot. Không yêu cầu gửi bí mật trong chat. Thiếu các mục này không
chặn code/test local, nhưng chặn công bố đã nghiệm thu môi trường thật.

Dự toán 21–33 ngày công tại mục 3 là khoảng kế hoạch còn lại ở mốc trước; phải
re-estimate sau M04/M06 và sau kiểm thử hai backend. Không đổi thành lịch cam kết,
không chia theo số nhánh; chờ external và ít nhất 7 ngày pilot tính riêng.

### 17.8. Cập nhật thực hiện M05 — không thay scope/gate

Đợt [M05 local](roomqc-p2-health-worker-local-2026-10-19.md) thêm worker/config/
entrypoint/compose opt-in và directory target binding `0006`; 87/87 test + process
offline SIGTERM/restart đã đạt. Runtime vẫn `0005`, signup đóng; M05/T06 partial,
không coi worker có source là hoàn tất monitoring. [Runbook worker](roomqc-health-worker-runbook.md)
ghi điều kiện bật, quyền, budget và thao tác đổi target.

Thứ tự tiếp theo: M06/T08 đủ release manifest + năm probe có ý nghĩa trên full
Supabase sandbox riêng; khép pipeline thật/restart/kill/DB down-up/10 phút drill
M05/M10; rồi alert lifecycle M07/M08 và external M09. Legacy cluster chưa có host
mapping phải xử lý bằng quy trình audit trước binding, không tự điền host theo tên.
Tiếp tục P3–P8 và đủ 70 case; 87 test local không phải số acceptance đã đóng.

## 18. Điểm bắt đầu đã đối chiếu và thứ tự giao việc

Phần 18–23 là phiếu chuẩn bị thực hiện trên code hiện tại. Các hậu tố T08-a,
T11-b… chỉ chia việc trong T01–T25; không thêm gói P hoặc acceptance ID mới.
Mọi file ghi **dự kiến** đều chưa được coi là đã tồn tại hoặc đã chạy.

### 18.1. Baseline để người nhận việc không triển khai nhầm

| Hạng mục | Quan sát/bằng chứng ngày 19/10 | Hệ quả khi bắt đầu |
|---|---|---|
| Source integration tại baseline M05 | `a3c17c65bdfef6e50ba8864e230aed7693d13c91`; plan đã commit tiếp theo `5cb5837` | Draft implementation M06 chưa commit ghi riêng ở mục 18.3; không nhầm với image đang chạy |
| Source directory | Đã có `0006-telemetry-target-binding.sql` | Không sửa nội dung các migration cũ để né checksum |
| Directory thường trực | `/api/control/readyz` trả schema `0005-health-snapshot-guard.sql` | Chưa áp `0006` vào stack thường trực; có source không đồng nghĩa đã deploy |
| Control thường trực | Image `sha256:a65408e99b5cc9f012c582be7e0c46b211d089e605c44335e194e38dc73136e1`; 8091 ready 200 | Không gán kết quả M05 cho image cũ |
| Frontend thường trực | Image `sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b`; proxy 8082 ready 200 | Giao diện mới phải build/deploy riêng sau nghiệm thu |
| Signup | `ROOMQC_CONTROL_SIGNUP_ENABLED=false` trong container control | Giữ đóng ngoài sandbox trong các đợt code/local |
| Monitoring | Có source/config/exporter/worker test; chưa có monitoring/health worker thường trực của release mới | Không trình bày trạng thái mẫu như số đo VPS thật |
| Test có bằng chứng | M05: 87/87 và artifact đã commit; M06: một lượt 101/101 có log toàn lượt, sau đó thêm hai advisor tests/helper changes | Phải chạy lại suite cuối trên current tree; không phải 101/70 case hoặc toàn bộ E2E |
| Backend nghiệp vụ | Project `ehjtoajnlnuvuiwkpmbp` đang phục vụ local | Không dùng làm nơi thử migration, fault, demo signup hoặc reset dữ liệu |
| Trang đang mở | `/settings/audit-log` thuộc khách sạn | Hai màn quản trị nền tảng nằm ở `/super-admin`, không ghép tài nguyên VPS vào nhật ký khách sạn |

Trước mỗi lệnh ghi phải nhận diện đúng repository, Compose project, cluster,
environment và ownership manifest. Thiếu một mục thì dừng lệnh ghi đó; tiếp tục
công việc đọc/thiết kế độc lập. Các sandbox browser cũ có thể dùng fixture trong
backend nghiệp vụ; phải đọc target guard, không tái sử dụng chỉ dựa vào tên script.

### 18.2. Các đợt bàn giao tiếp theo và trách nhiệm

| Thứ tự | ID trong plan | Sản phẩm bàn giao để review | Điều kiện bắt đầu | Người chịu trách nhiệm |
|---|---|---|---|---|
| 1 | T01, T08/M06 | Full backend sandbox + manifest tin cậy + adapter đủ năm dịch vụ | Baseline/ownership, release và probe contract đã chốt | Kỹ sư backend; người review quyền dữ liệu |
| 2 | T05/T06, M05/M10 | Pipeline metrics → probes → snapshot → admission, chạy thật qua restart/fault | Đợt 1 và source M05 | Kỹ sư backend/vận hành |
| 3 | T07, M07/M08 | Alert bền vững, ack có audit, notification outbox tới sink local | Snapshot/policy/reason codes ổn định | Kỹ sư backend |
| 4 | T03/T04/T08/T09/T10 | Auth/revoke thật, validation đầy đủ, reservation/gate và budget | Full sandbox/probes; authority fixture thật | Kỹ sư backend; review quyền và race |
| 5 | T11/T12/T13 | Khách đăng ký và tiếp tục được, worker tự đối soát, chống abuse local | Gate/reservation và receipt đã đạt | Kỹ sư backend + frontend |
| 6 | T14–T17 | Hạ tầng/Đăng ký mới, command dialog, tìm lỗi và xử lý qua UI | API/authority/schema DTO ổn định | Kỹ sư frontend; người thử thao tác |
| 7 | T18–T20, M09 | Bộ cài Linux, offsite/restore, alert ngoài máy, runbook | Code local đạt; đầu vào external của mục 22 | Vận hành; người kiểm chứng restore độc lập |
| 8 | T21–T24 | A/B thật, browser E2E, tải, release/cutover/rollback | Hai backend + staging release xác định | Kỹ sư kiểm thử/vận hành |
| 9 | T25 | Pilot 1 nội bộ → 5–10 khách, quan sát ít nhất 7 ngày | Gate P được duyệt trên bằng chứng | RoomQC duyệt; operator trực và người hỗ trợ |

Các vai trò có thể do cùng kỹ sư thực hiện ở local. Trước staging phải có tên
người duyệt release; trước pilot có tên operator/người thay ca. Review restore
và thử usability cần người khác làm theo tài liệu. Bảng này không tự phân agent,
tạo worktree hoặc cấp quyền deploy.

Đợt 1–2 là đường phụ thuộc chính cần khép trước khi nối signup. Trong thời gian
đó có thể chuẩn bị UI skeleton, inventory VPS và runbook; không dùng mock UI để
tuyên bố API/E2E hoàn tất. Ước lượng 21–33 ngày công ở mục 3 là dự toán lịch sử:
chốt lại phần còn lại sau đợt 1–2, dựa trên chi phí full stack và lỗi thực tế;
không suy ra ngày hoàn thành từ số test hoặc số nhánh. Ít nhất 7 ngày pilot và
thời gian chờ nhà cung cấp vẫn tính riêng.

### 18.3. Cập nhật chuẩn bị M06 và điều kiện bắt đầu kế tiếp

Cập nhật sau implementation R2 ngày 19/10, source base `5cb5837`: source M06
vẫn chỉ ở integration, chưa commit/sync implementation/deploy. **R1/R2 đã
local_verified theo controlled fixture; toàn M06/T08 chưa đóng.**
[Báo cáo R2](roomqc-m06-partition-local-2026-10-19.md) và
[artifact current tree](../../../artifacts/roomqc-m06-partition-local-2026-10-19.json)
thay các kết luận lỗi R1/R2 ở snapshot trước; log lịch sử vẫn giữ nguyên.

| Bằng chứng thực | Kết quả và giới hạn |
|---|---|
| Full suite current tree | `.local/roomqc-m06-control-suite-v2-final.log`: **111/111**, 0 fail/skip, 121101.8274ms. Gồm 10 manifest DB tests; không cộng subsets hoặc dùng 101 test lịch sử |
| Hai full vendor builds | `1d2e7d793b84`, `7bbeec983dbf`: mỗi lượt replay 523 migrations, exit 0 tại permission_controls_verified; internal network/no ports/providers, không business DB |
| Independent schema v2 | Hai initialized builds khớp `f3d48c3e1134a8fc142f84f21cfb45b9d556bec3f3c122c34a0236246b9a149d`; migration-set `f741f99eedd860953a9b8a220638242225e1c800456f34fc3ce6a28a92c41eac`, init-spec `66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae`. Lượt B reference completed/cleaned A; artifact production vẫn chưa có |
| Root cause đã xác minh | Catalog `697008206be7`: column shape/inheritance khớp; ACL defaults lấy nhầm chủ cuối. Vendor tạo child bằng supabase_admin rồi chuyển owner; đã sửa semantics và regression đỏ→xanh. Logical column/index positions cũng có regression riêng cho historical DROP COLUMN |
| Maintenance vendor | Cả A/B gọi Janitor thật: old empty child được dọn, future empty child được tạo lại, hash tĩnh không đổi và private round-trip đạt. `scheduledSoakVerified=false`; chưa là scheduler soak staging |
| Năm service/fault/quyền | Auth/REST/Storage/Realtime/Functions healthy, stop/restart từng service, schema frozen; negative scope/API/topic/Function và revoke/re-login cùng identity đều đạt. Realtime denial đúng ref/topic/Unauthorized, deadline acceptance 8000ms giữ server backoff 5000ms; không nới health path |
| Dedicated probe grants | 0 business table grants, 0 callable business SECURITY DEFINER trong public/private ở cả full runs |
| Advisors | 679 findings/0 ERROR lặp lại, vẫn chưa đóng R4. Audit trực tiếp 17 RLS-no-policy tables: anon/authenticated không table/column privilege; caller/view/function review và performance triage còn mở |
| Cleanup | Hai successful full builds mỗi lượt dọn 13 exact-owned objects; kiểm Docker project labels không còn container/volume/network. Không còn run full backend này cần chờ |
| Runtime đang phục vụ | Không đổi schema/image/flag. Snapshot directory 0005/signup false giữ riêng với source 0006; worker/adapter M06 chưa deploy |

Source/file review tiếp tục: manifest v2 migration
`20261019142205_control_realtime_partition_attestation.sql`, original manifest/
canary migrations, release-manifest/safe-http/safe-websocket/service-probes và
tests; runner/helper scripts, pinned package/lock và canary Function.
[ADR v2](../adr/roomqc-realtime-partition-fingerprint-v2.md) ghi canonicalization,
creator→owner ACL, logical columns/index keys, static invariants và compatibility.
Không sửa migration gốc, tự promote v1 approval hoặc dùng synthetic fixture
artifact/frontend hashes làm expected production. Private logs/env có secrets
tổng hợp; chỉ dùng public filtered logs và metadata artifact đã lọc.

**Nhận việc kế tiếp:**

1. R3: coordinated refresh/secret refs/version/TTL/rotation, hai worker và restart;
   revoke/re-login fixture đã đạt chỉ giữ regression, không thay lifecycle thật.
2. R4: hoàn thiện [triage](roomqc-m06-advisor-triage-2026-10-19.md), review
   server callers/views/definers/no-policy reachability, 51 bảng policies, tám FK
   và index workload. Không xóa 501 unused-index từ fresh fixture.
3. R5: trusted production release artifact/generator/installer; schema/live
   observed không tự trở thành approved expected. Schema đổi phải rebuild proof.
4. R6: thay manifest gateway legacy; nối target/secret/release version và five
   probes vào health runtime. Thiếu config vẫn HEALTH_PROBES_UNCONFIGURED, không
   service_role fallback hoặc gán true.
5. R7 rồi M05/M10 pipeline/thời gian thật/restart/kill; M07/M08 alert/outbox.
   Sau đó T03/T09–T25 theo dependency, không thu mục tiêu toàn plan về R2.

T08/M06 chỉ đóng khi cả credential lifecycle/advisors/trusted artifact/runtime
integration và bằng chứng liên quan đạt. Chưa chứng minh Linux/provider/offsite/
E2E/capacity/pilot; SQL replay sandbox không thay migration/acceptance production.

## 19. Phiếu triển khai gần nhất — M06/T08 và khép giám sát

### 19.1. T08-a — khóa release, sandbox và hợp đồng probe

**Sửa/đọc:** `cluster.mjs`, `safe-http.mjs`, `registry.mjs`, `health-config.mjs`,
`health-runtime.mjs`; `deploy/monitoring/`; ADR hiện có. Runner/probe/tests đã có
draft ở integration theo mục 18.3; phần runtime integration vẫn chưa có. Không
tạo lại file hoặc ghi đè draft mà chưa review nội dung hiện tại.

1. Đọc docs/changelog hiện hành rồi khóa một bộ image/config tương thích. Lưu
   version và digest Auth, REST, DB, Storage, Realtime, Functions, gateway. Không
   ghép image mới nhất riêng lẻ; không coi image cache là release đã kiểm chứng.
2. Sandbox dùng official self-host Compose pinned, project mới, working directory
   tuyệt đối, config/migrations/volume riêng, mạng internal và không publish port;
   probe container trong cùng mạng. Guard từ chối project nghiệp vụ, đường dẫn bên
   ngoài run root, volume đã tồn tại không có ownership hoặc cleanup manifest
   không khớp. CLI chỉ dùng đúng tác vụ đã khám phá `--help`/version, ví dụ sinh
   migration; không chạy `supabase start` ở root nghiệp vụ hoặc lấy dev CLI làm
   bộ cài production.
3. Khởi tạo từ migrations/release artifact tin cậy, dữ liệu tổng hợp và inbox thử;
   không dump tài khoản/email/password của khách sang fixture. Khi cần hai backend,
   A/B phải có key/DB/volume riêng; thiếu RAM thì kiểm tra tuần tự hoặc staging,
   không thay bằng hai URL cùng database.
4. Ghi probe spec cho từng dịch vụ: public/internal origin, protocol, quyền,
   resource ID tổng hợp, expected payload/hash, deadline, cleanup, log allowlist.
   Mọi URL/credential ref từ inventory server; browser không chọn target.
5. Khóa schema result dự kiến: `service`, `status`, `checkedAt`, `durationMs`,
   `reasonCode`, `clusterId`, `releaseId`, `targetFingerprint`. Status tối thiểu
   phân biệt ok/unconfigured/unreachable/denied/invalid_response/timeout. Đây là
   DTO dự kiến phải review OpenAPI trước viết UI, không phải API đang có.
6. Boolean cho evaluator chỉ được derive từ kết quả hợp lệ đúng identity và
   thời hạn; thiếu bất kỳ service nào không đủ điều kiện healthy/nhận mới.

**Nghiệm thu:** prepare/verify/cleanup có target guard; chạy lại không ghi đè sandbox
khác; lỗi/Ctrl+C vẫn có manifest để dọn chính xác. Log chỉ ID/hash/status; không
in `supabase status` chứa key hoặc toàn bộ container env. Liên quan A01/A02, B02,
C01/C04 và fixture P0-03, chưa đóng toàn bộ các case này.

### 19.2. T08-b — manifest server-only và kiểm chứng schema thực

**Đầu ra:** migration Supabase do CLI sinh tên; định nghĩa RPC
`control_cluster_manifest`; công cụ tạo release artifact; tests grants/drift.

1. Tạo migration qua `supabase migration new` sau kiểm tra help, không tự đặt
   timestamp. Chỉ thử SQL trên database sandbox được nhận diện, không áp lên
   backend nghiệp vụ. Directory migrations và Supabase migrations là hai hệ riêng.
2. Deployment metadata trong schema private: cluster ID, release ID, contract
   version, migration set hash, frontend compatibility và artifact digest.
   Chỉ migrator/operator pipeline được ghi. Runtime/browser không được tự khai
   một hash rồi đánh dấu valid.
3. RPC trả thêm challenge/nonce từ request để đối chiếu phản hồi; xác nhận chính
   xác cluster/release/contract/schema, không chỉ so một chuỗi hash. Cấm response
   bị cache dùng lại; lưu expected/observed đã lọc để giải thích lỗi.
4. Phải kiểm tra schema thực với artifact build tin cậy. Định nghĩa fingerprint
   canonical có version: tên/type/nullable/default cột, constraint/index, function
   definition, RLS/policies, trigger và quyền app liên quan; thứ tự ổn định, không
   phụ thuộc OID, dữ liệu hoặc extension nội bộ. Bao gồm tập migration ứng dụng.
   Schema fingerprint hiện tại không được tự trở thành expected artifact của cụm.
   Bao gồm publication/membership/ACL có liên quan; long qualified identity không
   được bị ép về type `name` làm cắt 63 bytes. Test hai build khác thứ tự OID và
   tên dài, giữ ordering/canonical identity duy nhất.
5. Tạo expected fingerprint từ fresh build bằng đúng migrations; chứng minh fresh
   build lặp lại cho cùng hash. Thay cột/function/policy/ACL có chủ đích phải bị
   phát hiện. Khôi phục schema rồi hash trở về; không cần sửa bảng manifest để pass.
6. Ưu tiên RPC `SECURITY INVOKER`, role NOLOGIN chuyên probe có quyền đúng phần
   metadata/canary, không đọc business tables hoặc DDL. Revoke EXECUTE mặc định
   từ PUBLIC/anon/authenticated; RLS cho bảng exposed và defense-in-depth private.
   Không thêm SECURITY DEFINER chỉ để chữa lỗi quyền. Nếu có nhu cầu khác, phải
   ghi ADR riêng và review grants/search_path trước triển khai.
7. Worker giám sát không nhận business `service_role`, API migrator DSN, SMTP key
   hoặc quyền root. Probe credential là secret ref riêng; token có scope, expiry
   và rotation được test. API validation cũng dùng quyền cần thiết, không mở rộng
   quyền cho browser để gọi manifest.
8. Đo thời gian/lock/chi phí fingerprint trên schema đầy đủ. Giữ trong deadline
   validation; nếu cần cache/background verification phải có version và TTL rõ,
   drift/stale phải chặn. Không dùng cache hash vô hạn để bỏ qua drift.
9. Freeze expected sau lifecycle initialization đã chốt của release (canary,
   service migrations, private Realtime round-trip). Lưu phase và init-spec hash;
   independent build phải chạy cùng init. Quan sát schema lúc deploy chỉ để so
   với expected đã duyệt, không tự ghi nhận một schema bất kỳ thành hợp lệ.
10. Artifact generator/installer phải lấy digest thật của frontend/functions/
    image/config/migration và compatibility matrix từ build pipeline tin cậy;
    review nguồn tạo/ghi expected và quyền installer. Giá trị tổng hợp trong
    fixture chỉ phục vụ test, không được promote hoặc nhập tay thành release thật.

**Rà quyền trên full app trước khi nối worker:** liệt kê toàn bộ effective grants
của role probe, gồm quyền kế thừa từ PUBLIC, role membership và EXECUTE của mọi
function trong schema exposed. Đặc biệt kiểm tra các SECURITY DEFINER có sẵn:
role không được đọc/ghi nghiệp vụ gián tiếp qua RPC dù bảng đã bị revoke.
Test quyền trên fixture nhỏ chỉ là điều kiện đầu; chưa thay audit full schema.
Các quyền PUBLIC quá rộng cần migration mới có test hồi quy cho owner/staff,
không sửa migration lịch sử hoặc thu hồi đại trà làm hỏng nghiệp vụ.

**Test bắt buộc:** dedicated role thành công; anon/owner/staff bị từ chối; dedicated
role không SELECT/DML/DDL business; sai cluster/release/nonce/hash/migration/ACL
bị reject; DB down không trả manifest valid. Run advisors và kiểm tra quyền SQL
trên sandbox trước đóng ticket. Chạy positive control ở đúng role cùng lượt với
negative control, tránh test pass vì cả database đều hỏng. Liên quan A06/C01/C04.

### 19.3. M06-a — đủ năm probe, có positive/negative control

Endpoint chi tiết phải khớp version đã pin ở T08-a. Ma trận sau là hành vi cần
đạt; không giả định mọi release có cùng health endpoint hoặc JSON shape.

| Dịch vụ | Bằng chứng khỏe phải lấy | Resource/quyền | Negative control |
|---|---|---|---|
| Auth | Health đúng version và kiểm tra có chạm Auth DB/session thật | Endpoint được xác minh từ source/docs; nếu health chỉ chứng minh process thì dùng canary identity riêng không có hotel/role nghiệp vụ | DB/Auth dừng, session bị revoke/hết hạn, sai key; HTTP 200 process đơn thuần không đủ |
| REST | RPC manifest/canary đọc DB trả nonce + đúng cluster/release/hash | Role probe chỉ đọc metadata/canary, không business | Schema drift, sai role/key, REST/DB down, nonce cũ |
| Storage | Đọc object canary private có bytes/hash đã biết qua Storage API | Object tổng hợp tạo khi deploy; quyền chỉ bucket/path canary, không public business bucket | Storage down, backend object mất, bytes sai, key hết quyền; status process không thay file read |
| Realtime | WebSocket join ứng dụng thành công và round-trip nonce giữa client canary gửi/nhận trên topic riêng | Kênh private/policy canary; hai kết nối ngắn có bound; không join channel khách | Sai token/topic quyền, join error, DB/Realtime down, nonce không khớp, handshake chỉ 101 |
| Functions | Invoke function canary trả challenge + cluster/release đúng | Function riêng, chỉ probe credential; không mail/payment/nghiệp vụ | Runtime/function mất, sai key/release, response cache/nonce cũ |

Đối với Auth, ticket phải chốt một trong hai cách dựa trên source của image:
endpoint có kiểm tra DB thật, hoặc canary session. Nếu cần session, quy định rõ
ai tạo/refresh, chỗ giữ refresh token, khóa chống hai worker rotate cùng lúc,
hạn chế quyền và xử lý hết hạn/revoke. Chưa chứng minh nhánh nào thì Auth probe
là unconfigured, không lấy `/health.version` thay kiểm tra database.

Canary được tạo ở lúc deploy/migration hoặc fixture setup, không tạo owner/hotel
mới mỗi 30 giây. Object không có PII; topic chỉ run ID/nonce; function không có
side effect. Không có cleanup nào được xóa bucket/user/object ngoài manifest sở hữu.

**Chuẩn bị Functions khi runtime không có Internet:** inventory tất cả import
remote/JSR/npm của main handler và canary, khóa version/lockfile và chuẩn bị
dependency cache hoặc bundle trong build phase được kiểm soát. Runtime chỉ dùng
artifact đã chuẩn bị; chứng minh cold start và invoke khi egress bị chặn.
Không mở Internet thường trực, bỏ signature/auth hoặc trả kết quả giả để né
dependency chưa có. Image/cache/bundle hashes phải nằm trong release manifest.

**Thực hiện transport:**

1. Mở rộng HTTP bounded transport khi cần đọc binary/headers; giữ DNS/IP pinning,
   TLS hostname/SNI, cấm redirect và body limit. Header/token chỉ gửi đúng origin.
2. WebSocket dùng cùng destination policy và IP đã duyệt trong kết nối thực tế.
   Không validate HTTP rồi để WebSocket tự resolve DNS khác. Test rebinding,
   mixed A/AAAA, IPv4-mapped IPv6, TLS sai và redirect upgrade.
3. Mỗi probe có deadline riêng dự kiến tối đa 5s; cả remote validation tối đa
   20s, target health không vượt 25s hiện có. Thiết kế fanout/metrics/persist để
   tuân deadline tổng; không cộng tuần tự năm timeout 20s. Request abort phải
   đóng socket/timer/listener, không có callback ghi kết quả muộn.
4. Body object canary nhỏ, text/JSON có max bytes; không ghi raw WS frames/token
   hoặc signed URL vào log. Result trả reason code ổn định; lỗi không thành true.
5. Unit/protocol test hỗ trợ phân nhánh; bằng chứng đóng M06 phải có full backend
   thật, từng service được tắt/làm sai độc lập và được khôi phục sau test.

**Nghiệm thu:** năm service tốt cùng lúc ở đúng backend; từng negative bị phát hiện;
quyền tối thiểu; deadline thật; không file descriptor/connection leak qua nhiều
vòng. B02/C01/C04 tương ứng, chưa chứng minh Linux capacity hay Internet TLS.

### 19.3.1. Run sheet M06 còn lại — nhận việc từ lỗi thực, không làm lại nền

Các dòng sau chia nhỏ T08/M06, không thêm acceptance ID. Chỉ chạy trên fixture
sở hữu mới; không tái mở sandbox đã cleanup hoặc dùng backend khách sạn để thử.
Chưa có khóa external không chặn những bước này.

**Cập nhật cách nhận việc:** bước 1–5 và revoke/re-login cơ bản đã đạt trên hai
full vendor builds v2/523 migrations, gồm Janitor thật và repeatability. Giữ
checklist dưới đây làm hồi quy, không điều tra lại lỗi đã có root cause/proof.
Bước 6 coordinated refresh/TTL/rotation chưa khép; bước 7 triage mới có direct
grants audit 17 bảng; bước 8 suite đã 111/111 nhưng toàn hồ sơ runtime/artifact
R5–R7 còn thiếu; bước 9 chưa nối. Không thay proof production bằng local.

| Thứ tự | File/đầu vào phải xử lý | Thực hiện và negative control bắt buộc | Đầu ra để review / điều kiện đạt |
|---|---|---|---|
| 1. Xác nhận nguyên nhân drift | Runner, canonical parts, source Realtime đúng digest | So định nghĩa publication trước/sau lần Broadcast đầu; lặp không fault rồi mới tắt Auth. Ghi actor/service/phase làm DDL nếu xác nhận được; không in token hoặc payload nghiệp vụ | Chẩn đoán có bằng chứng; phân biệt lazy init với lỗi fingerprint/phụ thuộc dịch vụ. Chưa rõ thì giữ fail, không đổi expected |
| 2. Sửa thứ tự build lifecycle | `test-control-backend-sandbox.mjs`, service setup/checks, manifest tests | Start core → replay migration đúng thứ tự → start Functions → setup canaries → private round-trip/warmup có bound → capture canonical schema → freeze expected → validate. Warmup không cần manifest đã valid; nếu cần tách low-level canary init để tránh vòng phụ thuộc | State/phase/init-spec hash được ghi; ordinary probe không tạo DDL sau freeze; guard không cho dùng state pre-init làm independent reference |
| 3. Chứng minh reproducibility | Hai run root/volume/key/project độc lập cùng release/migration set | Chạy toàn chuỗi init ở A/B; so digest và canonical schema sau init. Thứ tự OID/identity dài khác không làm hash khác. Chủ đích đổi policy/ACL/publication sau freeze phải bị reject; restore schema trở lại phải match | Hai initialized fresh-build proofs và diff đã lọc; không bỏ publication/ACL khỏi fingerprint để che lỗi; old pre-init hash chỉ giữ làm lịch sử |
| 4. Fault/recovery đủ năm dịch vụ | `control-backend-service-checks.mjs`, runner; typed probe DTO | Baseline cả năm khỏe → stop một service → service đó không ok → các service không phụ thuộc vẫn đạt đúng expectation → restart → cả năm khỏe; lặp Auth/REST/Storage/Realtime/Functions. Riêng DB down kiểm theo dependency thực, không đòi các service dùng DB vẫn khỏe | Log trước/fault/sau cho từng service; duration/status/reason/nonce/identity; schema sau recovery không đổi. Mỗi lần fault đều cleanup kể cả assertion lỗi |
| 5. Rà quyền qua API thực | Probe role/token; Auth canary không membership; Storage/topic riêng; permission script | Token probe không đọc/ghi business REST, không upload/list object ngoài scope hoặc join topic khách; anon/owner/staff/service-role không invoke canary Function trái spec. Positive cùng tài nguyên/quyền đúng phải hoạt động. Denied topic phải có protocol assertion xác định; timeout tiếp tục là fail | Ma trận role × operation expected/actual; 0 business grants/definers vẫn đúng sau init; lỗi 401/403 được phân biệt với backend hỏng; không dùng server log Unauthorized thay phép thử end-to-end |
| 6. Session/credential lifecycle | `service-probes.mjs`, config/resolver, Auth setup; lifecycle module/tests dự kiến | Auth `/user` phải chạm user + `auth.sessions` của release pin; revoke/hết hạn/sai session không khỏe. Tách probe token và Auth access/refresh, secret refs/version/TTL; single-flight/lease refresh không reset session lẫn nhau. Test hai worker refresh, mất ref, expired/stale key, rotate khi request đang chạy, restart và revoke | Tài liệu issuer/scope/store/expiry/refresh/rotation/recovery cho từng secret; worker không nhận business service_role, chỉ provisioner setup có quyền cần thiết. Thiếu ref hoặc refresh thất bại không ready/khỏe |
| 7. Advisors và review schema | `control-backend-advisors.mjs`, CLI đã kiểm version/help; full fixture | Thực sự chạy advisors trên target được sở hữu, lưu findings/baseline riêng; xác định issue mới do M06 hay lịch sử. Xử lý issue quyền/RLS/function nghiêm trọng; issue chấp nhận phải có lý do/owner và không làm mất case bắt buộc | Raw output ở nơi riêng, báo cáo lọc theo severity/rule/object; exit 0 với `--fail-on none` không đồng nghĩa không có issue. Chưa tới phase không ghi pass |
| 8. Suite cuối và đóng gói bằng chứng | `scripts/test-control-directory.mjs`, focused tests, runner; artifact/runbook dự kiến | Chạy focused regression sau sửa; sau đó full suite trên current tree với log toàn lượt; full backend trên cùng migration/code hashes. Không dùng 101 test lượt cũ thay current tree hoặc cộng hai test advisor rời để coi full-suite đã đạt; không skip bắt buộc/sửa artifact lịch sử | Source tree/commit, config/migration/init hashes, image/bundle hashes, command/exit/pass/fail/skip, case mapping, lỗi/giới hạn và cleanup proof. Local partial khác release acceptance |
| 9. Nối production-shaped validation | Generator/installer mục 19.2; `cluster.mjs`, health config/runtime và tests | Thay gateway legacy bằng verifier đủ nonce/identity/schema/năm service; expected artifact thật từ pipeline. Recheck version sau probe; invalidate khi đổi ref/release/target. Config thiếu vẫn fail-closed | Contract/API/runtime khớp, grants và race tests đạt; sync source chỉ sau review. Việc deploy worker/0006 thường trực là bước riêng có verify/rollback, không tự diễn ra khi sửa file |

**Phân chia để bàn giao:** bước 1–3 khép chẩn đoán/build lifecycle; bước 4–7 khép
protocol/quyền/sự cố; bước 8 đóng artifact source tương ứng; bước 9 khép tích hợp
T08 rồi chuyển drill M05/M10. Mỗi phần có diff và bằng chứng riêng; không cần
đợi UI hoặc VPS mới chạy hồi quy denied-topic và khép partition lifecycle. Nếu cần sửa migration
đã được áp ở một môi trường khác, tạo migration mới theo lịch sử thực; không đổi
checksum để sửa build. Migrations hiện mới thử trong fixture vẫn phải xác minh
chưa được áp ở đâu trước quyết định sửa draft.

**Lệnh đã tồn tại để kỹ sư dùng sau khi sửa đúng phạm vi:**

```powershell
node scripts/test-control-backend-sandbox.mjs --help
node scripts/test-control-directory.mjs
```

Lệnh `--run`/`--expected-build-state` theo help hiện hành và ownership manifest
đã kiểm; sau đổi lifecycle phải yêu cầu reference đã initialized và cleaned.
Không sao chép đường dẫn state của lượt pre-init để lấy pass. Artifact generator,
credential manager và script deploy còn chưa hoàn tất: không công bố lệnh dự
kiến như công cụ đã chạy được. Lượt cập nhật tài liệu này không chạy các test trên.

### 19.3.2. Phiếu nhận việc ngay từ hiện trạng — không cần khóa external

R1–R7 là nhãn chia nhỏ **cùng T08/M06**, không phải bảy gói mới. Backend chịu
trách nhiệm triển khai; reviewer quyền/DB xác nhận R1–R5, reviewer runtime xác
nhận R6–R7. Một người có thể làm nhiều vai trò ở local nhưng phải ghi người
thực hiện/review trong báo cáo. Không có agent/nhánh mới được tạo bởi bảng này.

| Ticket | Input / phụ thuộc | Phạm vi sửa hoặc tạo dự kiến | Kết quả bàn giao, điều kiện được đóng |
|---|---|---|---|
| R1 — đã local_verified theo baseline, giữ hồi quy | Run `78fbeb354fbd`, log denial-backoff, Realtime v2.143.3; chưa phải proof v2 | `service-probes.mjs`, `control-backend-permission-checks.mjs`, service-probes tests; không nới policy | Denial có tương quan, positive trước/sau, revoke/re-login cùng identity đã đạt. Không làm lại fix; chạy lại trong full backend v2 ở R2/R7 |
| R2 — local_verified, giữ regression | Runs `1d2e7d793b84`/`7bbeec983dbf`, source/catalog/ADR và artifact current tree; scheduler soak staging còn thiếu | Migration v2 `20261019142205_control_realtime_partition_attestation.sql`, helpers/DB tests/runner đã sửa creator→owner ACL và logical keys. Migration gốc không đổi | Hai full builds exit 0, 523 migrations/cùng hash v2/Janitor thật/năm faults/quyền, full suite 111/111; không phải artifact production hoặc proof scheduled soak |
| R3 — local lifecycle đã có proof, còn installer/production/runtime | Báo cáo R3 + encrypted store 0007; full-suite 123/123 tại source R3 | Giữ probe-credentials/probe-session/probe-secrets và tests làm hồi quy; bổ sung issuer/installer/TTL và R6 integration | Local Auth/refresh/quarantine/recovery không thay full five-service/runtime proof; không cấp service_role cho monitor |
| R4 — partial local_verified, tổng thể còn mở | [Proof hiện hành](roomqc-m06-access-local-2026-10-20.md): 525 migrations, fresh A/B dd45e76bae82 / 0e3ec605323b, 176 API checks/lượt, 128 control/27 focused | Hai forward migrations actor/session và direct-write đã test; tiếp tục reachability 17 bảng, semantics 135 permissive WARN, legacy workflow/session và tám FK | Không làm lại fix direct-write đã chứng minh; source thay mới chạy regression/fresh A/B tương ứng; chưa đóng toàn R4 hoặc T08 |
| R5 — release artifact và installer đáng tin | R2 ổn định; R4 chốt schema; spec mục 19.2 | Generator/installer dự kiến + artifact schema/trust tests; mọi digest lấy từ build thật | Nguồn approved, schema/init/contract/migration/image/frontend/functions hashes đúng; schema/live tùy ý không được tự trở thành expected; synthetic artifact bị từ chối ở mode deploy |
| R6 — nối validation và health runtime | R1–R5, target/secret ref contract | `cluster.mjs`, `app.mjs`, admin/store, `workers/health-config.mjs`, `workers/health-runtime.mjs`, OpenAPI/tests | Không còn request manifest legacy bằng business key/body rỗng; đủ probe/nonce/version race; thiếu config fail-closed; chưa tự deploy thường trực |
| R7 — hồi quy cuối và hồ sơ bàn giao | R1–R6 có diff review được; fixture còn đủ ownership | Test harness, artifact/report/runbook/tracker | Full suite current tree + full backend exit 0, không skip bắt buộc; A06/B02/C01/C04 theo phạm vi; source/image/schema/log/cleanup đồng bộ; T08 chỉ local_verified ở phạm vi chứng minh |

**Ưu tiên thực hiện:** R1/R2 đã có proof v2 local, giữ regression; tiếp theo
R3/R4 → R5 → R6 → R7. Nếu điều tra lỗi mới quá 2–3
cách chưa rõ, dừng lặp full sandbox, thu hẹp protocol/SQL reproduction và review
giả thuyết. Sau đó R3/R4 → R5 → R6 → R7. Có thể chuẩn bị báo cáo R4 trong khi
R2/R3 đang được xử lý; đây là dependency logic, không tự cho phép chạy nhiều
full Supabase cùng lúc trên máy thiếu RAM.

#### R1 — checklist hồi quy denial đã kiểm chứng local

Trạng thái: run `78fbeb354fbd` đã qua toàn chuỗi dưới đây. Root cause đã xác
minh ở vendor `join_error`: backoff mặc định 5000ms bằng deadline cũ. Helper
`verifyRealtimeProbeIsolation` tách phép thử acceptance 8000ms (trần 10000ms),
không thay health timeout 5000ms hoặc giảm backoff bảo vệ server. Giữ checklist
làm regression cho R2/R7; R3 chưa đóng vì refresh/rotation nhiều worker còn thiếu.

1. Lưu run ID/source hash của permission script, phase cuối, deadline thật và
   protocol fields allowlist: event/topic/ref/join_ref/status/reason code. Không
   ghi token, URL query có credential, raw frame hoặc payload người dùng.
2. Dùng fresh owned fixture, xác nhận Realtime ready và positive private topic
   hoạt động với đúng key/role trước negative; object tồn tại nhưng không được
   phép truy cập, tránh false-pass vì resource không tồn tại.
3. Đối chiếu Phoenix frame/join/ref với release source; xác định server gửi
   `phx_reply` lỗi, channel error/close có định nghĩa, hay client không đọc đúng
   frame. Chỉ một phản hồi khớp request và denial spec mới chứng minh từ chối.
   Close/reset/timeout chung không chứng minh quyền và phải fail.
4. Nếu harness sai, sửa parser/listener và thêm regression cho sai ref, reply
   tới muộn, close-before-reply, error, abort. Nếu server/policy sai, sửa đúng
   policy/contract sau review; tuyệt đối không cho phép topic khách để test xanh.
5. Khép listener/timer/socket ở mọi nhánh. Sau denial chạy lại positive control
   cùng fixture, rồi thử logout/revoke token cũ, `/user` bị từ chối và re-login
   canary để cả năm probe khỏe. Đây là hồi quy R1; R3 còn phải chứng minh refresh/
   rotation có điều phối, không đóng R3 chỉ từ chuỗi này.
6. Lưu expected/actual, error code, duration, matched ref và filtered server event;
   cập nhật hướng chẩn đoán/runbook. Không tăng timeout vô hạn hoặc catch tất cả
   lỗi rồi coi là denial thành công.

#### R2 — checklist fingerprint và partition do Realtime quản lý

**Trạng thái cập nhật:** R2 local_verified sau catalog evidence và regression
đỏ→xanh: creator supabase_admin khác owner cuối, cần transform default ACL khi
chuyển owner. Hai full runs 523 migrations đã qua Janitor/repeatability/quyền;
111/111 suite current tree gồm 10 DB tests. Bảng sau giữ cách thực hiện và điều
kiện hồi quy cho schema thay đổi tiếp, không là danh sách việc chưa làm lại.
[Báo cáo](roomqc-m06-partition-local-2026-10-19.md) phân biệt controlled drill
đã đạt với scheduled soak staging chưa chạy. Không truy vấn lại container đã
cleanup hoặc đụng backend nghiệp vụ để lấy mẫu.

| Bước trong cùng R2 | Thao tác cụ thể, phạm vi ghi | Kết quả phải nhận được trước bước sau |
|---|---|---|
| Khoanh vùng không rebuild toàn bộ | Đọc nhánh raise trong migration v2, helpers shape và fixture PG16; so với DDL/migrations vendor đúng digest. Chỉ source/catalog, không đọc business rows | Danh sách giả thuyết riêng: relation/column ACL, global/schema default ACL, inherited column flags/default/generated và projection. Chưa có số liệu thì chưa sửa expectation |
| Chụp catalog đúng release | Bổ sung diagnostic có guard vào runner owned fixture trước cleanup: parent/child column metadata, ACL theo role và creator default ACL; chuẩn hóa OID sang định danh ổn định, không ghi credential. Nếu cần target mới, một fresh owned run, không chạy nhiều full stack đồng thời | Diff field cụ thể expected/actual và phase/actor tạo partition; diagnostic công khai chỉ enum, chi tiết catalog để private artifact có hash |
| Tạo reproduction tối thiểu | Trên PG16 disposable dựng đúng parent/default ACL/creator role/child theo catalog; chỉ ghi fixture; test trước sửa phải tái hiện lỗi | Một regression fail đúng mismatch, không chỉ thêm điều kiện bỏ qua. Dừng/review giả thuyết nếu 2–3 cách không tái hiện |
| Sửa validator/version an toàn | Sửa migration v2 chưa deploy sau xác minh history; migration gốc giữ checksum. Dùng semantics vendor/default privileges thật, không chấp nhận mọi ACL hoặc mọi child | Reproduction thành pass; giữ đủ negative grants/columns/index/constraint/RLS/publication/bounds; v1 approval vẫn bị từ chối tới khi installer duyệt v2 |
| Chạy focused gate | `release-manifest*.test.mjs`, `service-probes.test.mjs` và regression mới theo test runner hiện có | Báo số test thực tế/exit/skip; 7/7 cũ chỉ lịch sử, không tự cộng vào suite mới |
| Chạy build A và vendor maintenance | Full backend owned, pin source/images/migrations/init. Runner tạo child cũ trống ngày UTC−4, bỏ child tương lai trống UTC+3 rồi gọi `Realtime.Tenants.Janitor.MaintenanceTask.run("realtime-dev")` trong owned vendor container | Routine trả `:ok`, child cũ được dọn/child tương lai được tạo lại; private round-trip tốt, static hash không đổi; không chỉnh clock, policy hay code vendor |
| Chạy build B và đối chiếu | Backend mới/key/volume/run root độc lập, cùng current migration/init/code hashes; không reference v1 | Static v2 hash A=B sau init/maintenance; đủ năm fault/recovery + quyền + revoke/re-login/R1 đạt; tamper cố ý vẫn fail rồi phục hồi đúng expected |
| Chốt phạm vi và bàn giao | ADR v2, catalog explanation, compatibility matrix, run manifests/logs đã lọc, cleanup proof | R2 chỉ local_verified theo proof đạt; `scheduledSoakVerified=false` tới khi staging qua chu kỳ Janitor thật. R5/R6/R7 và gate external không tự đóng |

Các bước trên chia nhỏ R2, **không thêm gói/T/acceptance ID**. Checklist kỹ thuật
toàn bộ R2 bên dưới vẫn là ràng buộc nghiệm thu, không được bỏ sau khi sửa mismatch.

1. Ghi chính xác schema scope hiện tại, parent `realtime.messages`, child table/
   index/constraint/owner/ACL/policy/publication và routine tạo/dọn partition.
   Source pin: `d46540b3a4a79113f40301d5e5cb690f41150b9b` (v2.143.3). Janitor
   gọi `delete_old_messages` và `create_messages_partitions`; lazy publication
   init đã sửa không thay được kiểm chứng maintenance này.
2. Viết ADR chọn canonicalization **có version**: phần schema tĩnh so hash;
   phần partition động chỉ normalize identity/time bounds đã xác thực theo
   template/range/retention của vendor pin. Phải kiểm parent attachment, kiểu
   partition/bounds, cấu trúc cột/index/constraint, owner/grants/RLS liên quan
   và membership/publication. Tên có prefix đúng không đủ để được bỏ qua.
3. Phân biệt expected artifact tĩnh và observed validated dynamic topology;
   dynamic topology không được cập nhật expected. Bảng lạ/partition ngoài
   bounds/ACL rộng/policy đổi/publication đổi phải fail. Không exclude cả schema
   `realtime`, không tắt Janitor production, không cấp DDL cho monitor.
4. Tạo reproduction sandbox qua maintenance entrypoint được release hỗ trợ:
   trước maintenance → tạo partition kỳ tiếp theo/dọn kỳ cũ → sau maintenance
   → private round-trip → kiểm manifest. Không chỉnh clock host hoặc sửa runtime
   vendor. Nếu không có entrypoint phù hợp, document cách harness gọi routine
   vendor dưới installer role trong fixture và tách khỏi worker production.
5. Negative controls trên fixture: sai bounds/attachment/owner/grant/policy/
   cấu trúc child/publication; trường hợp được hỗ trợ phải bị reject. Khôi phục
   fixture rồi hash/validator trở lại valid, không cập nhật expected để phục hồi.
6. Hai fresh builds độc lập phải qua initialization và maintenance tương đương
   để validator hợp lệ; hash tĩnh không phụ thuộc OID/ngày tạo partition. Thay
   format/version phải có compatibility test và migration path cho gateway cũ.
7. Đo query duration/lock/cost trên full schema, trong budget probe. Ghi bằng
   chứng controlled drill local riêng; bổ sung soak qua chu kỳ maintenance thật
   trên staging trước gate S/P. Accelerated/unit clock không thay proof scheduler
   hoạt động thật; toàn bộ thời gian quan sát ghi ở báo cáo.
8. Review xong mới chốt expected artifact, chạy lại năm service fault và permission
   suite. Revert binary/config chỉ nếu schema tương thích; nếu sửa migration đã
   deploy phải dùng forward migration, không đổi checksum history.

Nguồn kiểm chứng lifecycle (public upstream, không phải endpoint deployment):

- [Replication connection — lazy publication](https://github.com/supabase/realtime/blob/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/replication_connection.ex).
- [Janitor maintenance task — partition lifecycle](https://github.com/supabase/realtime/blob/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/janitor/maintenance_task.ex).

#### R3–R7 — thứ tự verify và điều kiện dừng

Cập nhật implementation R3: [báo cáo](roomqc-m06-session-local-2026-10-19.md) và
[ADR](../adr/roomqc-probe-credential-lifecycle.md) có encrypted store directory
`0007`, lease/CAS/revision/target guard, key rotation, crash/abort/quarantine và
GoTrue thật refresh/revoke/recover cùng user, mất response sau remote 200.
Đây là local lifecycle proof; vẫn thiếu production issuer/TTL/installer,
full five-service coordinator và R6 snapshot-transaction/runtime. Không đóng
R3 tổng thể/M06/T08 hoặc gate signup; runtime chưa migrate/deploy theo source.

- R3: tách issuer, scope, secret ref/version, TTL và refresh ownership của probe
  JWT, Auth access/refresh, object/function canary và installer credential. TTL/
  overlap rotation chốt trong config/ADR; không đoán một giá trị để đóng test.
  Hai worker refresh tranh lease, stale result, mất ref, logout, restart và rotate
  giữa probe phải có test; session hết hạn không trở thành healthy nhờ cache.
  Revoke/re-login cùng canary identity đã có proof R1, giữ regression; không coi
  đăng nhập lại thủ công là coordinated refresh hoặc secret rotation tự động.
- R4: giữ nguyên 679 findings làm evidence input, **không** đặt mục tiêu số finding
  bằng 0 bằng mọi giá. 501 unused-index trên fixture rỗng không chứng minh index
  thừa; RLS không policy có thể là intentional deny-all. So baseline/object thật,
  đo query khi cần và ghi quyết định. 153 permissive-policy WARN cần review sự
  chồng lấn/quyền/hiệu năng; không tự kết luận đều vô hại hoặc đều là lỗ hổng.
  Phân luồng review từ metadata đã có: 153 WARN trên 51 bảng business; 17 RLS
  no-policy gồm 14 bảng private server-only và ba bảng public `email_admin_actions`,
  `email_deliveries`, `email_provider_events`. Phải xác minh effective grants,
  schema exposure và đường đọc server trước kết luận intentional deny-all.
  Tám FK candidates: `private.hotel_room_setup.confirmed_by`,
  `private.subscription_status_job_runs.blocked_by`,
  `private.workspace_provisioning.hotel_id`, và năm cột `public.staff_invitations`
  (`hotel_id`, `invited_by`, `position_id`, `reports_to`, `tenant_id`). Đối chiếu
  index hiện hữu/query thật trước đề xuất migration; không thêm index mù.
  Mỗi record triage có rule/object/severity/baseline/impact/owner/action/test;
  issue accepted có lý do và ngày rà lại. Mọi migration mới làm đổi migration-set
  hash đều yêu cầu tái lập proof R2/R5/R7 phù hợp, không dùng artifact schema cũ.
- R5: mỗi artifact ghi schema/canonicalization/init-spec version, migration-set
  hash, release/contract, images/frontend/functions/config digests và trust source.
  Test artifact bị thay, sai cluster/release, downgrade hoặc synthetic production
  input. Installer có verify trước ghi và quyền riêng; không có nút UI nhập hash
  tùy ý rồi đánh dấu cụm valid.
- R6: khóa snapshot identity/version trước HTTP; recheck trong transaction ngắn
  sau HTTP. Thay endpoint/ref/release giữa chừng phải 409/invalidate; mutation/
  receipt/audit cùng transaction. Health worker config dùng dedicated probes;
  `HEALTH_PROBES_UNCONFIGURED` chỉ biến mất khi đủ input đã verify, không fallback
  service_role hoặc boolean `true`.
- R7: chạy focused tests → full control suite → independent initialized backend
  với advisors/permissions/fault/recovery → report. Sau sửa source trong lượt
  cuối phải rerun phần bị ảnh hưởng và full gate tương ứng; không cộng lượt cũ.
  Permission timeout, maintenance chưa chứng minh, advisors chưa triage, synthetic
  release, source/image mismatch hoặc cleanup không rõ đều giữ ticket/gate mở.

**Rollback cho cả đợt:** chỉ hủy/dọn fixture do ownership manifest xác định;
giữ source diff/log để review. Không đồng bộ code chưa verified sang primary,
không đụng index/thay đổi người dùng, không migrate/fault DB nghiệp vụ, không
đổi image đang phục vụ. Việc triển khai thường trực là ticket có verify/rollback
riêng sau khi local đạt, không là side effect của R7.

### 19.4. T08-c — validation không dùng kết quả của cấu hình đã đổi

**Sửa:** `ClusterGateway.validateCluster`, nhánh validate trong `app.mjs`,
`AdminDirectory.execute`, registry DTO và contract tests.

1. Trước probe chụp cluster row version, inventory fingerprint, endpoint, release,
   credential version và expected probe identity. Không giữ DB transaction lúc HTTP.
2. Sau probe mở transaction ngắn, kiểm tra lại đủ identity/version với inventory
   hiện hành và command expectedVersion; thay đổi ở giữa trả 409, không lưu valid.
3. Chỉ persist manifest/validation khi đủ năm probe + schema + frontend/CSP/public
   key đúng; lưu checkedAt/identity để chỉ ra release nào đã được xác minh.
4. Đổi target/credential/release phải vô hiệu bằng chứng cũ theo contract được
   review; gate vẫn đóng tới khi có validation/snapshot mới. Không làm mất mapping
   workspace active hoặc tự chuyển backend khi validation thất bại.
5. Lệnh validate vẫn command/version/receipt/audit nguyên tử; cùng key trả receipt
   cũ, không chạy probe/mutation lần hai vô hạn. Audit insert lỗi rollback kết quả.

**Test:** thay inventory/credential khi probe đang chờ; hai admin cùng version;
remote thành công nhưng local audit lỗi; response mất sau commit; replay cùng key;
ref mất/TLS lỗi/frontend cũ. C01–C04, A10/A11 theo phạm vi validation.

### 19.5. M05/M10 — nối pipeline và drill đủ thời gian thật

1. Nối adapter M06 qua config secret riêng vào `health-runtime.mjs`, bỏ trạng thái
   unconfigured chỉ khi cấu hình đủ. Thiếu một ref vẫn live nhưng không ready/healthy.
   Cập nhật help/compose/runbook; không gắn `true` mặc định trong entrypoint.
2. Dựng directory + monitoring + full backend sandbox riêng; approve telemetry
   target qua command có audit. Chứng minh source mount/DB budget/cluster đúng.
3. Thu thập liên tục ít nhất 10 phút bằng nhịp thật; đủ warmup 5 phút, ghi generation,
   freshness, probes và chi phí worker. Nếu test accelerated clock thì ghi riêng,
   không lấy thay bằng chứng thời gian thật này.
4. Stop nguồn metric >120s; source hang không ngăn stale sweep. Admission đóng
   dù worker đang dừng; workspace active vẫn giữ mapping và đọc nghiệp vụ được
   nếu data backend còn hoạt động.
5. Dừng/khởi động DB directory của sandbox; hard kill worker rồi restart; hai worker
   tranh nhau, một mẫu cũ về muộn. Kiểm tra state/window/generation và role boundary.
6. Tắt từng backend service, đổi target khi collect, key hết quyền và DB lock thật;
   socket bị abort không được commit sample muộn. Ghi fault start/end và reason.
7. Khôi phục nguồn, quan sát đủ recovery 10 phút; operator latch vẫn đóng tới khi
   admin duyệt. Không tự mở nhận vì một sample khỏe hoặc process vừa restart.
8. Build image mới từ source đã review; so hash file trong image, runtime schema,
   không nhầm image offline M05 với image pipeline mới. Dọn fixture theo ownership.

**Đóng phần local của M05/M06/M10:** có log toàn lượt, dữ liệu raw đã lọc, source/
image/config/schema và bảng B02/B04–B07 expected/actual. M10 tổng thể vẫn cần
M07/M08; B01 Linux và B09 external chưa chạy giữ not_run/deferred_external.

### 19.6. M07/M08 — cảnh báo và giao thông báo local

1. Rà bảng `alerts` đã có, chỉ thêm migration directory kế tiếp khi thật sự thiếu
   reason/audit/version/outbox. Không reset bảng hoặc đổi checksum migration cũ.
2. Với mỗi environment/resource/type/mount có tối đa một alert mở. Ghi lifecycle
   open → lastSeen → acknowledge tùy chọn → resolved; recurrence sau resolve tạo
   lần mới liên kết được. Unknown/stale không được dùng để resolve lỗi cũ.
3. Lifecycle + event + notification outbox trong transaction; unique delivery key
   theo alert/lifecycle/route. Dự kiến dispatcher riêng dùng lease/fencing và trần
   retry; schema/grants review trước code. Không cấp email key cho metrics worker.
4. Bổ sung `GET /admin/alerts`, `POST /admin/alerts/{id}/acknowledge` theo OpenAPI.
   Ack cần command/version/reason, actor live; ack không resolve hoặc mở admission.
5. Severity tới destination ref đã duyệt; local sink chỉ thu payload tổng hợp. Có
   open message, nhắc theo cooldown có trần, resolution một lần. Retry có backoff;
   khi provider không hỗ trợ idempotency phải ghi nhận cửa sổ có thể gửi trùng.
6. Test hai worker cùng mở/resolve, ack stale, mất response khi sink đã nhận, process
   restart, provider timeout/rate-limit và retry budget hết. Dead-letter có API/UI
   hiển thị, không bị mất vì app đã toast thành công.

**Đạt local:** B08 và API/auth/pagination tương ứng. Không gửi email thật ở bước này.
M09/B09 chỉ đóng sau heartbeat bên ngoài host ở mục 22, không từ sink local.

## 20. Phiếu nối đăng ký và giao diện — T03/T09–T17

### 20.1. Quyền quản trị và ngân sách trước khi mở flow

1. Khép T03 trên Auth thật: platform admin/owner/staff/anon, session revoke/role
   removed/account locked và authority down. Chốt chính sách MFA cho lệnh nhạy cảm
   trong ADR, kiểm chứng AAL/phiên hiện hành; không tin user_metadata hoặc chỉ route guard.
2. `requireCapability` v1 hiện cho super-admin sau RPC live; không quảng bá như đã
   có bộ vai trò hạ tầng/support độc lập. Nếu tách vai trò trong release này, map
   capability server phải có contract và negative test cho từng operation.
3. Support recheck/reconcile phải đi cùng command/version/receipt/audit; loại đường
   mutation cũ không có cùng boundary, giữ tương thích bằng contract/test rõ ràng.
4. T09 kiểm tra lại gate với backend thật: release/credential/frontend, health đúng
   target/fresh/warmup, backup proof, serving, quota và operator latch. Một điều
   kiện thiếu là blocked với reason; không có nút UI bỏ qua.
5. Chạy lại race 20 khách/1 suất, retry, close/limit, expiry và affinity. Mẫu khỏe
   hết hạn sau reserve phải được recheck trước first provision; RPC đã chạy thì
   tiếp tục reconcile, không reassign hoặc tự xóa danh tính.
6. T10 lập hai bảng budget riêng directory và data DB: service/replica/pool max/
   queue timeout/statement timeout/kết nối nền và dự phòng operator. Cộng đủ Auth,
   REST, Realtime, Functions, exporter, backup/migrator, control/worker. Budget
   arithmetic M05 chưa thay load test hoặc số kết nối thực tế.

**Đầu ra:** bảng quyền operation, policy backup/validation, gate reason DTO, budget
được kiểm chứng và bảng A08–A11/C05–C10. Không tự mở public signup từ bước này.

### 20.2. T11-a — chuẩn hóa luồng khách và trạng thái riêng tư

| Bước khách nhìn thấy | Điều kiện và nguồn chuẩn | Hành động UI | Khi có lỗi |
|---|---|---|---|
| Đăng ký doanh nghiệp | Intent đã giữ suất/affinity tại control | Nhập email/slug/thông tin tối thiểu, gửi một request có identity ổn định | Giữ form; lỗi có request ID; không tự chọn cụm |
| Xác thực email | Auth tại cụm được gán; chưa có phiên xác minh thì không mở dữ liệu riêng | Hướng dẫn mở email, gửi lại theo cooldown, sửa thao tác qua flow được phép | Thông báo chung, không public lookup tiến độ theo email |
| Khai báo khách sạn | Owner/session/email binding đúng backend; chưa có receipt hoàn tất | Submit field allowlist đã validate | 401/403 hướng đăng nhập/xác minh; không gửi lại tự động khi outcome chưa rõ |
| Đang thiết lập | Directory provisioning + receipt job | Poll setup-status có backoff, hiện mã hỗ trợ | Mất mạng giữ ngữ cảnh; reload lấy lại từ server |
| Chủ cần tiếp tục | Receipt missing và backend trả lời được | Mở lại form đúng workspace, giữ giá trị hợp lệ | Không thông báo đã tạo thành công hoặc tạo intent mới |
| Cần hỗ trợ | Receipt conflict/routing version lệch | Hiện mã hỗ trợ, đường liên hệ được cấu hình | Không sửa mapping hoặc chọn cluster khác trên browser |
| Sẵn sàng | Directory active khớp receipt owner/tenant/hotel/version | Đi đúng workspace/hotel → thêm phòng → mời nhân viên | Không thêm trial/tenant lần nữa khi reload |

**Các bước code cụ thể:**

1. Thêm setup-status vào router, store/gateway và typed client theo OpenAPI; mọi
   private read kiểm tra phiên đúng cụm và owner binding. UUID/slug không là quyền.
2. Chốt xử lý `waiting_email`: với cấu hình mặc định chưa có session sau signUp,
   UI hiển thị hướng dẫn từ thao tác vừa gửi, không gọi anonymous private status.
   Setup-status/provision chỉ mở cho phiên owner đã xác minh. Không nới quyền GET
   để tiện vẽ bước chờ email; đồng bộ mô tả/enum contract trước code.
3. Public bootstrap chỉ metadata định tuyến, không job/owner/email. Chuyển side
   effect activate/reconcile trong GET hiện tại sang worker/luồng được định quyền;
   rollout có test tương thích, không cắt cơ chế recover trước khi worker sẵn sàng.
4. Khi phiên hợp lệ, refresh/hai tab/new device lấy nguồn server. Query key có
   workspace/cluster/identity scope; logout/hủy component abort request và polling.
5. Poll đề xuất 2s → 5s → 10s → tối đa 30s, jitter và Retry-After; dừng khi active,
   logout, lỗi quyền hoặc needs_review. Không poll vĩnh viễn sau trang đã đóng.
6. Cập nhật `WorkspaceStart.tsx`, callback/onboarding/bootstrap; giữ đúng basename
   `/app/:slug`, allowlist origin/CSP và native `workspace-transport`. Android chỉ
   thêm endpoint/setup deep link cần thiết, không wildcard.
7. Với lỗi không xác định sau submit, hỏi server bằng status cùng đăng ký; không
   tự submit lại form, tăng trial hoặc khuyên tạo tài khoản khác.

**Đạt:** D01–D06/A03 và mobile/callback tương ứng trên API thật. Cùng một luồng
phải đối chiếu số owner/workspace/tenant/hotel/trial trước/sau, không chỉ route UI.

### 20.3. T12-a — enqueue, lease, fencing và kết quả job

**Sửa:** `store.mjs`, `app.mjs`, `support.mjs`; file dự kiến
`workers/provisioning-reconcile.mjs`, job store/config/runtime/tests và compose riêng.

1. Trong transaction beginProvision: kiểm tra owner/routing version/gate → chuyển
   provisioning → enqueue đúng một receipt_reconcile job → event → commit. HTTP
   tới backend nằm ngoài transaction; unique live job là hàng rào chống trùng.
2. Job giữ IDs/routing version, attempt/error/lease; không password/access token,
   thông tin payment hoặc form. Worker chỉ đọc receipt server-to-server tại đúng cụm.
3. Claim bằng `FOR UPDATE SKIP LOCKED`, update lease token mới, commit ngay. Lease
   90s, remote deadline 20s; concurrency/pool/queue có trần và shutdown ngừng claim.
4. Retry đề xuất 30s/2m/5m/15m/30m có jitter, tối đa 5 attempt tự động; định nghĩa
   attempt tại lúc thực sự bắt đầu gọi remote. Reclaim lease không tự reset budget.
   Không gọi HTTP trong DB transaction để giữ lease bằng lock dài.
5. Mọi ack/retry/activate kiểm tra lease token, job state và expected routing version.
   Đọc receipt verified phải đối chiếu workspace/cluster/owner/tenant/hotel/version;
   transaction local gồm activate + job success + event. Audit lỗi thì rollback.
6. Missing → waiting_owner; unavailable → retry; conflict → needs_review. Chốt
   attempt/error code và nextAction trước UI; không retry form thay khách.
7. Recheck admin trả 202/job/command ID; cùng idempotency key không enqueue thêm.
   Recheck active trả trạng thái đã hoàn tất hoặc conflict có hướng xử lý; không
   dùng công cụ support làm đường thay owner, gia hạn trial hay sửa billing.
8. Graceful shutdown có deadline; hard kill chỉ để lease hết và worker mới đối soát.
   Không dọn Auth/tenant dựa vào tuổi provisioning. Bổ sung readiness đúng schema/
   quyền và kiểm tra process không có DDL credentials.

**Fault matrix bắt buộc:** kill sau claim; trước remote; backend commit rồi mất
response; trước local ack; lease cũ về muộn sau worker mới; hai worker cùng job;
audit fail; already active; routing version đổi. Mỗi dòng ghi row counts/lease/
receipt trước-sau và expected outcome. D07–D11, A07 phần worker chỉ đóng bằng
process+database thật, không chỉ fake clock.

### 20.4. T13-a — chống lạm dụng và email có đường quay lại đúng

1. Định nghĩa topology proxy và `trustedProxies`; direct client không tự khai
   forwarded headers. Proxy ghi đè chain; test IPv4/IPv6/NAT/chain sai và request
   đi thẳng API. Không áp bucket IP socket của proxy cho toàn bộ khách.
2. Thay limiter `Map` process hiện có bằng state dùng chung bền vững có bound/
   TTL/index; tách intent/Auth/resend/reset/invite/status. Chốt threshold trong
   config và đo; response 429 có Retry-After, restart không xóa quota.
3. Anti-bot kiểm tra phía server trước reserve, ràng buộc action/origin/expiry và
   replay; local provider fixture. Thiếu production config giữ gate U đóng.
4. Kiểm thử gọi thẳng Auth/RPC không vượt quyền/quota tạo tenant. Tắt public signup
   vẫn cho khách cũ login/reset/invite; không dùng tắt Auth signup bừa để làm hỏng staff.
5. Xác thực/reset/invite dùng redirect allowlist + workspace binding. Link expired,
   replay, mở tab/thiết bị mới và Android phải về đúng cụm; không tin return URL
   browser tùy ý. Không log URL chứa token hoặc dùng analytics ghi callback token.
6. Local inbox kiểm soát để kiểm template/link/cooldown/duplicate. Resend/domain
   `roomqc.com` chỉ chuyển sang gửi thật khi đã verify DNS/provider và đích thử
   được chỉ định; trạng thái đã mở dashboard không chứng minh deliverability.
7. Webhook verify signature/raw body/time window/replay key; bounce/complaint đưa
   vào trạng thái quan sát được, retry có trần. Cấu hình email tập trung, không
   dùng email key trong frontend/control health worker.

**Đạt local:** D12–D14 và nhánh callback/template. D15 phải thử Gmail/Outlook ở
staging qua domain thật và kiểm bounce; không đánh dấu pass từ Mailpit/Inbucket.

### 20.5. T14–T17 — từng màn hình và hành động phải có chỗ truy cập

Giữ sidebar chính, chỉ thêm **Hạ tầng** và **Đăng ký mới**. Không tạo menu phụ
trùng, dashboard thứ ba hoặc nút shell/restart database cho người dùng ứng dụng.

| Màn/route dự kiến | Dữ liệu/API | Thao tác và điều kiện |
|---|---|---|
| `/super-admin/login` | Authority cố định, kiểm live role/session | Login/MFA; 401/403/503 rõ; owner không vào được |
| `/super-admin/infrastructure` | Cluster list/snapshot/admission từ control | Tìm/lọc, mở detail, thêm cụm từ inventory đã duyệt; count không lấy từ một page |
| `/super-admin/infrastructure/:id` | Cluster/detail/events, probe status, backup/release/policy | Validate, bind target được duyệt, đóng/mở nhận mới, draining/serving, sửa limit |
| Section cảnh báo trong detail | Alert list + ack endpoint | Ack có lý do/version; trạng thái lỗi còn thì banner vẫn còn; deep link truy cập trực tiếp |
| Section backup/release trong detail | Metadata backup/manifest đã lọc | Xem bằng chứng/thời điểm; không checkbox tự nhận backup pass hoặc nút restore production |
| `/super-admin/registrations` | Workspace list/filter/cursor/count | Tìm slug/request ID, lọc trạng thái/cụm, đi detail; URL giữ bộ lọc |
| `/super-admin/registrations/:id` | Workspace/detail/timeline/job + tenant-summary đúng cluster | Recheck có job status; mở cụm/khách tương ứng; không giả danh owner |
| Tenant console hiện có | Chỉ phần đã hỗ trợ đúng backend | Các thao tác billing không hỗ trợ đa cụm giữ disabled có giải thích; không fallback default DB |

**Thứ tự code và kiểm tra:**

1. Typed `control-client`/hooks dự kiến, schema/error parsing và query key có
   authority/user/cluster/workspace/filter/cursor; không token trong key/storage.
   Logout/revoke/đổi workspace xóa cache nhạy cảm và hủy response cũ.
2. Root admin router phải hoạt động khi directory bật/tắt; không được chèn workspace
   basename vào global admin. Menu không tạo đường tới trang chưa có API mà không
   báo trạng thái rõ; phần chưa deploy không quảng bá như chức năng đã sẵn sàng.
3. Màn danh sách trước, detail sau; mỗi view có loading/empty/unavailable/stale.
   Unknown là “Chưa có dữ liệu”, không 0% hoặc khỏe. Có timestamp/nguồn đo và lý do.
4. Mutation dialog có ảnh hưởng, trước/sau, expectedVersion, lý do và command ID.
   Chỉ lưu metadata pending cần thiết qua F5; không lưu token/PII. Khi mất response
   hỏi receipt cùng key; 409 tải lại và cho xem thay đổi, không tự đổi key retry lệnh.
5. Với 202 hiển thị “Đã nhận yêu cầu” và theo dõi job; chỉ báo hoàn tất khi server
   xác nhận. Nút disabled nói điều kiện thiếu, không để người dùng bấm rồi toast giả.
6. Màu thông dụng trên trắng/xám, chữ/icon cho trạng thái; WCAG AA; 390px, zoom 200%,
   keyboard/focus. Click menu dưới phải thấy đầu nội dung; Back giữ filter/trang/
   vị trí, direct link có fallback đúng danh sách.
7. Audit reachability: liệt kê mọi command/section API đã bàn giao → route → nút/
   menu → quyền → disabled reason → test. Không bỏ một chức năng khi gỡ menu phụ.
8. Người thử chưa biết fixture tìm một signup lỗi và hành động đúng trong 30s.
   Test trên browser nối API thật gồm F5/mất response/hai admin/revoke/503/query
   trả muộn; component test không thay E01–E08.

**Đầu ra:** bản build, ảnh desktop/mobile, log thao tác, bảng API↔nút, các lỗi và
test liên quan. UI chỉ được coi bàn giao khi thao tác thật cập nhật đúng directory/
cluster và audit, không chỉ có trang đẹp hoặc mock data.

## 21. Phiếu lên VPS, nghiệm thu và mở khách thật — T18–T25

### 21.1. T18 — bundle và đường triển khai xác định

1. Tạo `deploy/vps/` dự kiến gồm compose pinned, env/secret-ref examples, release
   manifest, preflight/prepare/migrate/deploy/verify và rollback instructions.
   Script mới có --help không side effect và target guard; chưa công bố lệnh
   như đã chạy được trước khi implementation/test hoàn tất.
2. Inventory Linux ghi provider/region/OS/architecture/vCPU/RAM/disk/IOPS/mount,
   host ID/cluster ID, IP/origin, firewall, data volumes, budget và người phụ trách.
   Cấu hình VPS chỉ chọn làm profile thử; không cam kết sức chứa từ RAM/vCPU.
3. Pin full Supabase self-host release, không dùng CLI dev làm production installer.
   Kiểm gateway Kong/Envoy và `API_EXTERNAL_URL` theo đúng bundle; local CLI hiện có
   không tự chứng minh cấu hình self-host. Không tự nâng PG major khi đóng gói.
4. Cổng public chỉ HTTP redirect/HTTPS theo topology; DB/control/exporter/Prometheus/
   Studio/admin interface riêng tư. SSH qua đường quản trị được duyệt. Verify từ
   phía ngoài host, không chỉ xem Compose không publish port.
5. Preflight read-only fail trước thay đổi khi sai host/volume/secret/DNS/port/clock/
   dung lượng. Prepare không format/xóa/init đè volume; migration credential chỉ
   job một lần; verify luôn kiểm image/schema/config/volume thực tế.
6. Chạy cài mới → redeploy no-op → reboot host → verify dữ liệu/callback/Realtime/
   upload/Functions. Chạy secret/TLS rotation và renewal, Android deep link/CSP.
7. Nâng cấp theo compatibility matrix; backup verified trước bước rủi ro. Rollback
   binary chỉ khi schema tương thích; nếu không forward-fix/restore có quy trình,
   không hạ schema bằng file cũ hoặc `down -v`.

**Đạt:** F01–F04 trên Linux staging với release manifest và log đầy đủ.

### 21.2. T19 — bộ backup thực sự khôi phục được

1. Inventory backup set: directory + cluster DB/Auth + queue/receipt + Storage
   metadata và object bytes + release/config + key cần giải mã/vận hành. Dùng
   backup tooling chuẩn đã pin; không tự viết thuật toán mã hóa.
2. Với pilot dùng cửa sổ maintenance quiesce đủ writers; xác nhận DB/app/jobs/
   Auth/Storage không ghi trong snapshot. Chốt time window và sequence; DB dump
   độc lập giữa lúc upload vẫn chạy không đủ nhất quán.
3. Manifest set ghi parts/checksum/object count/bytes/key version/UTC/schema/image/
   cluster/scope; upload offsite ở failure domain khác, verify đọc lại. “Uploaded”
   khác “verified”; không cho UI tự ghi verified/restore_test_at.
4. Backup dự kiến mỗi 12h để có dư địa RPO≤24h; retention/quota/chi phí phải được
   RoomQC duyệt trước cleanup. Key khôi phục tách nơi lưu ciphertext, có người
   giữ/break-glass; backup cùng VPS không tính offsite.
5. Restore vào host/volume sạch được gán ownership, từ chối nguồn/live target.
   Test từng lỗi thiếu part/checksum/key/version/object rồi bảo đảm không mở route.
6. Verify login owner/staff, đúng workspace/cụm, phòng/booking mẫu, receipt/trial,
   file bytes và pending jobs. Chặn tự replay payment/email tác vụ ngoài snapshot
   cho tới đối soát; ghi rõ cách xử lý queue khi phục hồi.
7. Drill mất host gốc chỉ từ offsite + secret store độc lập. Đo RPO/RTO thực với
   dataset ghi rõ; mục tiêu pilot ≤24h/≤4h chưa thành cam kết tới khi drill đạt.

**Đạt:** F05–F08. Bộ backup không verify hoặc restore proof quá hạn giữ gate nhận
mới đóng theo policy; không tự khóa khách đang active.

### 21.3. T20/M09 — cảnh báo ngoài máy và người trực

1. Cấu hình heartbeat/probe độc lập failure domain, không đặt watchdog duy nhất
   cùng host đang giám sát. Destination và người nhận được RoomQC chỉ định.
2. Thống nhất với M09: mục tiêu đề xuất phát hiện ≤180s và nhận thông báo ≤300s,
   đều tính từ mốc fault UTC, không cộng hai khoảng. Ghi riêng thời gian ack của
   người trực và phục hồi, không xem đã gửi là đã nhận. Chốt cấu hình/người duyệt
   trước drill; đây chưa phải SLA cam kết. Phân biệt control down, backend down,
   exporter stale và provider cảnh báo down. Stale metric >120s là điều kiện
   admission khác, không bị nới thành 180s bởi mục tiêu cảnh báo ngoài host này.
3. Runbook mỗi lỗi gồm dấu hiệu/ảnh hưởng/kiểm tra read-only/target/khôi phục/
   data verify/điều kiện mở lại/người trực. Thử do người khác làm theo, không dựa
   vào người viết code nhớ lệnh riêng.
4. Dọn dung lượng không được xóa dữ liệu/WAL/volume khách tùy ý. Credential mất
   phải rotate theo ref, không sửa mapping. Signup kẹt phải đọc receipt/job, không
   tạo lại tenant. Mất host dùng bộ restore đã thử.

**Đạt:** B09/F09 khi có thông báo thực ngoài host và log phục hồi; thiếu provider
giữ deferred_external, không cản code/local khác.

### 21.4. T21/T22 — E2E có định danh và fault kiểm soát

1. Hai backend A/B full service, Auth key/DB/object/network riêng. Fixture có
   platform admin, owner, staff đủ quyền, email chưa xác minh, revoked session,
   cụm closed/full/stale và các receipt missing/unavailable/conflict.
2. Journey thuận: start → Auth/email → onboarding → active → thêm phòng → invite
   staff → staff chỉ thao tác đúng quyền → logout/login/reset → admin tìm được
   workspace và đúng cluster. Đối chiếu DB rows/audit/receipt cùng lượt.
3. Token/data/object/channel A không dùng ở B; positive control ở đúng A/B phải
   vẫn chạy. Có thể dùng UUID tenant giống nhau ở fixture để bắt lỗi thiếu cluster
   scope. Admin tenant-summary không fallback backend mặc định.
4. Journey lỗi: refresh/hai tab/new device/timeout, mất response sau remote commit,
   kill worker, lease cũ, directory/source/backend down, stale dialog, revoke và
   thiếu CSP/callback. Fault chỉ nhắm tài nguyên sandbox/staging đã allowlist.
5. Cụm A draining/down: khách mới chưa affinity có thể sang B; khách active A giữ
   A, không lộ dữ liệu hoặc tạo lại khách ở B. Global signup closed không chặn
   login/reset/invite khách hiện hữu.
6. Browser desktop + Android theo release, viewport/mạng ghi rõ. Capture console/
   network có redaction; callback tokens không vào artifact. Test runner lỗi
   hạ tầng là fail/not_run có lý do, không skip để báo xanh.

**Đạt:** D/E và G01–G03/A03 liên quan bằng case thật, không chỉ unit test.

### 21.5. T23 — tìm sức chứa an toàn, không đoán 1.000 khách sạn

1. Profile ghi CPU/RAM/IOPS/mạng/digests, số workspace/hotel/room/bookings/objects,
   mix tác vụ và think time. Phân biệt tài khoản đã đăng ký, người online, người
   đang thao tác và request/s; không dùng một con số thay bốn nghĩa này.
2. Chạy mức 10→25→50→100 phiên có kịch bản; có đối chứng tenant nhẹ, report/upload
   nặng và signup đồng thời. Đo latency/error riêng mỗi nhóm, CPU/MemAvailable/IO/
   inode/connection/pool wait/queue lag và chi phí monitor/backup.
3. Soak ít nhất 60 phút tại mức đề nghị; dừng theo ngưỡng an toàn công bố trước
   khi chạy, giữ log cả mức không đạt. Kiểm leak/budget/lock và dữ liệu sau tải.
4. Đối chiếu mục tiêu p95 server: bootstrap/status ≤500ms, reserve ≤1s, provision
   ≤10s không tính chờ email, admin list 1.000 metadata ≤1s; 5xx ngoài fault <1%.
   Không gộp thời gian API với tải trang. Không đạt thì tối ưu/giảm limit rồi đo lại.
5. Capacity report ghi maximum tested và operating limit thấp hơn có headroom.
   Chốt tenant_limit/resource budget và runbook thêm cụm trước khi đầy; không lấy
   1.000 khách sạn × 50 nhân sự làm số người dùng đồng thời đã kiểm chứng.
6. Thêm cụm đã chuẩn bị cho khách mới ở v1; chưa tự migrate tenant cũ, autoscale
   hoặc cam kết 100.000 người đồng thời. Các mục đó cần thiết kế/nghiệm thu riêng.

**Đạt:** G04–G06. Phải có dataset/config/result để tái lập, kể cả khi operating
limit đo được thấp hơn mục tiêu kinh doanh.

### 21.6. T24/T25 — cutover, pilot và dừng mở rộng

1. Release candidate khóa commit/tree/image/schema/config; đối chiếu đủ 70 case
   theo môi trường. Không còn lỗi Critical/High về quyền, dữ liệu, cấp phát,
   isolation hoặc restore trước cổng tương ứng.
2. Cutover rehearsal giữ đường legacy: login/reset/invite/mobile/global admin và
   khách chưa mapping. Không bật flag rồi ép khách cũ tạo workspace. Frontend
   rollback phải tương thích schema và mapping mới đã được ghi.
3. Phiếu duyệt gate S/P ghi người duyệt, scope, limit, backup/restore/alert proof,
   operator, kill switch và rollback. Local pass không tự là authority deploy.
4. Pilot một khách nội bộ trước; chỉ tăng 5–10 khách được chọn khi luồng và hỗ trợ
   ổn định. Quan sát ít nhất 7 ngày, đo API quan trọng mục tiêu ≥99,5%, lỗi signup,
   email, worker, tài nguyên, backup, hỗ trợ và chi phí theo dataset thực.
5. Lỗi quyền/rò/mất dữ liệu/cấp phát trùng/restore không đạt: dừng mở rộng và đóng
   cấp phát mới theo runbook, bảo toàn bằng chứng; xử lý ảnh hưởng khách active
   riêng. Không rollback bằng xóa workspace/volume hoặc đổi khách sang DB khác.
6. Chỉ duyệt U khi anti-abuse/Auth/proxy/support/monitoring/backup đạt. Gate B thu
   phí là backlog riêng, không tự bật settlement/gia hạn gói sau khi signup xong.

**Bàn giao cuối:** release manifest, bảng 70 case, defects còn lại, capacity,
backup/restore/alert drill, runbook và báo cáo pilot; RoomQC quyết định mở rộng.

## 22. Đầu vào ngoài mã nguồn — gom theo cổng, không xin khóa trong chat

| Khi cần | Đầu vào cần chuẩn bị | Được tiếp tục khi chưa có | Cách cung cấp an toàn / bằng chứng |
|---|---|---|---|
| Trước T18 staging | VPS Linux riêng cho test, inventory cấu hình/IP/mount, đường deploy/SSH/CI và người có quyền | M06, alert local, signup/UI, bundle/preflight local | Secret file/store/CI secret; inventory không có password; xác nhận đúng host trước lệnh ghi |
| Trước TLS/callback thật | Quyền DNS `roomqc.com`, origin/subdomain staging/API đã chọn | Allowlist/redirect tests trên local | Thao tác DNS trong tài khoản được cấp; verify record/cert/renewal, không gửi DNS token qua chat |
| Trước D15 | Resend/provider account, domain sender verified, FROM/REPLY-TO, hai inbox thử kiểm soát | Template/inbox local/callback/cooldown/webhook adapter | API key trong secret store; SPF/DKIM/DMARC và message/bounce evidence; không mail khách thật |
| Trước gate U | Anti-bot production config và chính sách rate-limit/support | Fixture test và limiter bền vững | Secret server; test wrong/expired/replay và direct Auth |
| Trước T19/gate P | Kho offsite độc lập, quyền read/write tối thiểu, key recovery riêng, retention/ngân sách được duyệt | Backup/restore local trên target sạch | Upload/readback checksum và host-loss drill; key không nằm cùng backup duy nhất |
| Trước M09/gate P | Dịch vụ heartbeat/kênh cảnh báo ngoài host, người nhận/người trực | Outbox/sink local và runbook | Destination ref; thử gửi/cắt host có phạm vi được duyệt, lưu receipt/thời gian |
| Trước P/U | Admin/MFA, operator/người thay ca, khách pilot, thời gian hỗ trợ | Code/test và diễn tập tổng hợp | Danh sách vai trò/contact trong nơi nội bộ; không đưa mật khẩu/PII vào repo |

Những dòng này là dependency external, không phải kết luận đã thiếu quyền của
phiên hiện tại. Khi thực hiện phải kiểm tra khả năng truy cập hiện có trước;
chỉ yêu cầu đầu vào còn thiếu tại đúng cổng. Không bắt khách sạn đăng ký VPS,
cài Docker hoặc cung cấp key hạ tầng cho RoomQC để dùng sản phẩm.

## 23. Quy tắc đóng ticket và mẫu bàn giao có thể kiểm tra

### 23.1. Mỗi ticket phải đi qua cùng một chuỗi

1. **Ready:** ID P/T/M, acceptance liên quan, input/dependency, target ownership,
   contract và expected outcome đã chốt; không còn quyết định quyền dữ liệu mơ hồ.
2. **Implemented:** diff đúng phạm vi, migrations có nguồn/version và grants; không
   credential trong Git/bundle/log; script có help và guard trước mutation.
3. **Verified local:** test có positive/negative/fault cần thiết trên môi trường
   nhận diện; không skip bắt buộc; cleanup proof và dữ liệu cần bảo vệ được đối chiếu.
4. **Reviewable:** commit/tree hash, artifact/log, expected/actual, giới hạn và rollback
   đủ để người khác đọc; trạng thái OpenAPI khớp handler/runtime thực tế.
5. **Deployed/verified môi trường tiếp theo:** image/schema/config của môi trường
   đó được kiểm tra riêng. Chỉ cập nhật staging/pilot_verified bằng bằng chứng tại đó.

Một ticket local hoàn tất không đóng gói P tổng thể nếu còn Linux/provider/browser/
pilot acceptance. Không đổi `not_run` thành passed vì chưa gặp lỗi trên trình duyệt.
Không dùng phần trăm ước lượng để che việc chưa test backup/isolation/recovery.

### 23.2. Mẫu ghi nhận sau từng đợt

| Trường | Nội dung bắt buộc |
|---|---|
| Phạm vi | P/T/M IDs, file thay đổi, cái gì chưa triển khai |
| Nguồn và runtime | Source base/commit/tree; image digest; schema/config/inventory fingerprint |
| Môi trường | local/staging/pilot, host/project/cluster/run IDs, dataset và thời gian |
| Kiểm thử | Command thực đã chạy, exit code, pass/fail/skip; acceptance ID expected/actual |
| Bằng chứng | Log đầy đủ và checksum, manifest, ảnh/traces đã lọc; không token/DSN/PII |
| Rủi ro/lỗi | Severity, ảnh hưởng, owner, bước sửa hoặc external dependency; không trộn done/not-run |
| Bảo toàn | Fingerprint/index file ngoài phạm vi; ownership cleanup; không thay DB nghiệp vụ |
| Vận hành | Signup flag, worker/monitor có thực sự deploy không; rollback và lệnh verify |
| Bước kế tiếp | Ticket ready tiếp theo và gate nào vẫn đóng |

Những lệnh đã có (`npm run test:control:db`, các test control/source/worker) chạy
đúng runbook. Runner full backend, dispatcher, VPS deploy/restore mới phải được
viết/verify rồi mới thêm vào danh sách lệnh vận hành. Không chạy script tên “local”
hoặc “sandbox” trên backend nghiệp vụ nếu chưa kiểm tra guard/target.

### 23.3. Thứ tự bắt tay vào code sau kế hoạch này

1. T01/T08-a: nhận draft/source/run state ở mục 18.3, kiểm ownership; không dùng
   lỗi startup đã vượt qua làm điểm xuất phát hoặc làm lại nền M04/M05.
2. M06/T08-b: R1/R2 đã đạt controlled local v2; giữ regression, ADR và hai full
   initialized build/maintenance proofs. Hai hash v1 cũ không là reference cho
   current v2; scheduled soak phải có bằng chứng staging riêng.
3. M06/T08-c: R3–R7 mục 19.3.2; session/rotation/advisors, artifact thật, nối
   gateway/health runtime và full suite/current-tree proof trước drill pipeline.
4. M05/M10: pipeline/thời gian thật/restart/kill/recovery, artifact mới.
5. M07/M08, rồi T03/T09/T10 và T11–T17 theo dependency ở mục 18.
6. T18–T25 khi đủ đầu vào external; gate S/P/U/B giữ độc lập như mục 15.

Đây là kế hoạch chuẩn bị triển khai. Lượt cập nhật này chỉ sửa tài liệu, đọc source/
artifact và kiểm tra runtime read-only; không áp migration, deploy worker, gửi email,
đổi DNS, chạy fault trên backend đang dùng hoặc mở signup.

## 24. Kế hoạch nhận việc hiện hành — cập nhật sau khi rà source R4

Phần này là điểm đọc đầu tiên khi bắt đầu triển khai tiếp. Nó cập nhật điểm xuất
phát của mục 18–23, giữ nguyên định nghĩa T01–T25, 27 gói P0–P8 và 70 case A–G.
Các mục bên dưới là checklist con, không phải các hạng mục nghiệm thu mới.
Cập nhật chuẩn bị ngày 20/10/2026: tiếp nhận kết quả các process audit đã chạy,
đọc source/runtime và cập nhật kế hoạch; không sửa tiếp implementation, áp migration
nghiệp vụ, đồng bộ implementation hay deploy trong lượt chuẩn bị này.
Audit graph mới nằm ở integration/chưa commit; bằng chứng riêng ghi rõ phạm vi.
Các checklist phía dưới là việc cần thực hiện, không phải kết quả đã nghiệm thu.

### 24.1. Điểm xuất phát xác định, không dùng bằng chứng cũ cho source mới

| Thành phần | Đã đối chiếu lại ngày 20/10/2026 | Trạng thái khi giao việc |
|---|---|---|
| Source làm việc | Worktree integration, nhánh codex/roomqc-parallel-integration, HEAD 5cb583729ce055db64df8b192f10476db1fa99b8; có implementation chưa commit | Review cả diff và file chưa tracked; HEAD riêng lẻ chưa định danh toàn source |
| Runtime local, kiểm tra 10:34 +07 ngày 20/10 | GET http://127.0.0.1:8091/api/control/readyz và proxy http://127.0.0.1:8082/api/control/readyz đều 200 JSON, schema 0005-health-snapshot-guard.sql | Đây là nền đang phục vụ; đường direct cũng cần prefix /api/control, không dùng /readyz trần |
| Image/flag local | Control image sha256:a65408e99b5cc9f012c582be7e0c46b211d089e605c44335e194e38dc73136e1; ROOMQC_CONTROL_SIGNUP_ENABLED=false | Chưa nâng image/schema, chưa mở signup; không suy ra worker mới đang chạy |
| Directory source | Đã có migration 0006 và 0007-probe-credentials.sql | Phải kiểm upgrade/role/runtime compatibility trước triển khai thường trực |
| Control suite hiện hành | 139/139, 0 fail/skip/cancel, exit 0; focused audit+graph 14/14 là subset; log .local/roomqc-r4-caller-graph-control-2026-10-20.log | Scoped backend manifest 628 files; không cộng các lượt hoặc đổi thành acceptance/UI/VPS |
| Full vendor caller audit hiện hành | A 55a4b60c80b1 / B 0dbf25756725: exit 0, 525 migrations, cleaned=true, cleanup 14 objects/lượt; B repeatability matched | [Report/ledger/artifact](roomqc-m06-callers-local-2026-10-20.md); metadata 149 triggers/25 candidate paths, không chứng minh transitive authorization |
| Runtime read-only bổ sung 11:03 +07 | Readyz direct/proxy vẫn 200/schema 0005 | Không nâng image/schema, readyz không trả signup flag; quan sát flag trước đó không là giám sát liên tục |
| Bằng chứng backend trước sửa R4 | Run 9340a62e66ef replay 523 migrations, quyền/fault/recovery đạt và đã cleanup 13 owned objects | Chưa bao gồm migration R4 mới; không dùng hash này nghiệm thu schema mới |
| Catalog quyền R4 hiện hành | A/B: 17 no-policy tables, 469 functions, 11 views, 358 policies, 13 FK; 0 browser direct table/column grant violations; advisors 650 findings (17 no-policy, 8 FK, 490 unused-index, 135 permissive WARN) | allSafe=false, transitiveReachabilityProven=false; chưa chứng minh mọi view/definer hoặc policy an toàn |
| Sửa R4 direct-write — proof trước caller graph | Migrations 20261019161809 actor/session và 20261020031717 direct-write; 525 migrations. A dd45e76bae82 / B 0e3ec605323b đều exit 0, permission_controls_verified, cleanup 14 objects/lượt | Cùng schema/migration/images/init-spec; direct REST/child grants/notes và single-supplement atomic link có proof. Không đồng nghĩa mọi legacy workflow đã đạt |
| Email admin / FE | Mỗi backend 176 API checks/8 real Auth actors/4 orders; Edge provider-disabled; 20 SQL session denials. Focused 27/27, build+verify local exit 0/378 assets | [Report/artifact](roomqc-m06-access-local-2026-10-20.md) có hash source/log và lỗi verify ban đầu; chưa mail thật, browser E2E, UI/VPS hoặc deployment config |
| Màn quản trị | Có router/layout super-admin và API đọc một phần; các trang Hạ tầng/Đăng ký mới chưa nối hoàn chỉnh | Không đặt UI mới tại /settings/audit-log; không coi tenant console cũ hỗ trợ đa cụm đầy đủ |

[Report R4](roomqc-m06-access-local-2026-10-20.md) và artifact đã lọc có scope
manifest/source/log hashes; raw state/log ở .local của integration. Không công bố
function bodies, DSN, Auth token hoặc synthetic secret. Hai build tuần tự không
thay A/B routing đồng thời, bundleHash compose từng run không phải canonical
release digest. Snapshot runtime có thời điểm, không là giám sát liên tục.

### 24.2. Bảng giao việc 25 bước và phụ thuộc để không bỏ sót

Trách nhiệm: BE = backend/dữ liệu; FE = frontend/mobile; OPS = vận hành;
QA = kiểm thử; RQ = chủ sản phẩm RoomQC. Đây là vai trò chịu trách nhiệm, chưa
phải danh sách người đã nhận việc. Mỗi lượt chỉ nhận phần có đầu vào sẵn sàng.

| Bước | Phần phải bàn giao tiếp | Phụ thuộc trước khi đóng | Vai trò | Điều kiện kiểm tra |
|---|---|---|---|---|
| T01 | Chụp source/runtime/ownership, phân loại code nháp và dữ liệu phải bảo toàn | Mỗi lượt bắt đầu | BE/OPS | A01–A03; manifest đúng target, hash ngoài phạm vi không đổi |
| T02 | Giữ regression migration/roles; kiểm 0005→latest, empty→latest, rerun/checksum/race | T01, directory migration mới | BE | A04–A07; không dùng business DB để thử |
| T03 | Khép authority thật, operation/capability, live session/revoke và quyết định MFA | Authority fixture; R4 đã sửa quyền | BE/RQ | A08–A11; lệnh unauthorized không ghi mutation/audit thành công |
| T04 | OpenAPI/router/DTO/error/cursor đồng bộ, thêm status/receipt read cần thiết trước UI | T02/T03 và từng handler mới | BE | Không gắn implemented khi route còn planned hoặc chỉ có unit parser |
| T05 | Giữ exporter regression; đủ năm probe và manifest tin cậy | T08; M06/R3–R7 | BE/OPS | B01–B03 theo môi trường; Linux host metrics còn là gate riêng |
| T06 | Health worker dùng probes thật, ghi snapshot/admission có version fencing nguyên tử | T05/T08 | BE | B04–B07, M05/M10 timed drill và restart thật |
| T07 | Alert lifecycle + ack/audit + outbox/retry tới local sink; external heartbeat riêng | T06, API quyền T03 | BE/OPS | B08 local; B09 chỉ có bằng chứng ngoài host mới đạt |
| T08 | Hoàn thiện R4→R5→R6→R7 và phần R3 còn lại; validate release/credential/endpoint đúng phiên bản | T01/T02, fixture full vendor | BE | C01–C04/A06; current-tree proof, không tự tin hash live |
| T09 | Hồi quy admission/reservation/affinity, cùng khóa với admin close, recheck trước first provision | T03/T06/T08 | BE | C05–C10; 20 request/1 suất và không chuyển khách cũ sang cụm khác |
| T10 | Cấu hình budget pool/concurrency/report/upload có số đo | Inventory component và T09; xác nhận cuối tại T23 | BE/OPS | G05; bounded queue/timeout, headroom và tenant đối chứng |
| T11 | Setup-status riêng tư, owner binding, resume/callback/onboarding/Android | T03/T04/T09; T12 trước khi bỏ side effect recovery cũ | BE/FE | D01–D06/A03; không lộ trạng thái khi chỉ biết slug/UUID |
| T12 | Enqueue/reconcile worker bền vững, lease/fencing/receipt và recheck 202 | T03/T09; contract provisioning | BE | D07–D11/A07; kill ở từng điểm, không trùng tenant/hotel/trial |
| T13 | Proxy trust, limiter bền vững, direct Auth abuse, email/callback/reset/invite | T11/T12; provider thật khi chạy D15 | BE/OPS | D12–D15; local inbox không thay email thật |
| T14 | Entry admin độc lập workspace, typed client/cache scope/login/MFA | T03/T04, API sẵn sàng | FE | A03/E08; logout/đổi authority hủy response cũ |
| T15 | Hạ tầng list/detail, status/probe/resource/admission/backup/command dialog | T06/T07/T08/T14 | FE | E03–E05; thiếu/cũ là unknown, command có kết quả thật |
| T16 | Đăng ký mới list/detail/timeline/job/recheck, tenant-summary đúng cụm | T11/T12/T14, API summary | FE/BE | E01/E02/E05/E08; 1.000 metadata phân trang server |
| T17 | Hoàn chỉnh thao tác keyboard/mobile/Back/scroll và mọi đường truy cập | T15/T16 | FE/QA | E01–E08; người thử tìm nguyên nhân trong 30s |
| T18 | Bundle pinned/preflight/migrate/deploy/verify/upgrade/rollback Linux | Local integrated đạt; VPS/DNS/secret refs sẵn sàng cho staging | OPS/BE | F01–F04, B01; reinstall no-op/reboot/rotation/TLS thật |
| T19 | Backup set nhất quán + offsite readback + restore host sạch + key recovery | T18 và kho/khóa độc lập | OPS/QA | F05–F08; bytes/Auth/mapping/jobs đúng, RPO/RTO đo thật |
| T20 | Runbook, heartbeat ngoài host, alert drill và người trực | T07/T18/T19, đích cảnh báo được cấu hình | OPS/RQ | B09/F09; ghi fault/detection/received/ack/recovery |
| T21 | Hai backend A/B độc lập; tích hợp directory/frontend/Auth/object/channel | T08/T11/T12; có thể chuẩn bị fixture sớm | BE/QA | G01–G03; sequential fresh builds không thay A/B integration |
| T22 | Browser E2E desktop/Android, sai quyền và fault/recovery/cutover | T13–T21 có phần tương ứng | QA/FE | A–G liên quan bằng API/UI thật; không chỉ service tests |
| T23 | Load + noisy-neighbor + soak 60 phút, capacity report và operating limit | T10/T18/T21; dataset xác định | OPS/QA | G04–G06; lưu cả mức không đạt và ngưỡng dừng |
| T24 | Khóa release candidate, đủ 70 case, cutover/rollback rehearsal và duyệt gate | T01–T23 tại đúng môi trường | BE/OPS/RQ | G07; không Critical/High chưa xử lý về quyền/dữ liệu/cấp phát/restore |
| T25 | Một khách nội bộ → 5–10 khách, theo dõi ít nhất 7 ngày, quyết định mở rộng | Gate P đã duyệt | OPS/RQ | G08; public/paid vẫn là cổng riêng |

Bảng trên là danh sách phải làm, không cấp trạng thái passed. Mỗi case ghi riêng
môi trường/run ID/kết quả; 139 control tests không bằng 139/70 case hoặc tỷ lệ hoàn tất.

### 24.3. Phiếu đợt đầu: khép phần R4 còn dở trước khi nối runtime

**Phạm vi:** T01/T02/T03/T08, M06/R4; giữ R1/R2 và lifecycle R3 làm hồi quy.
**Đầu vào hiện hành:** source 525 migrations; A dd45e76bae82 và B 0e3ec605323b
đều qua/cleanup, cùng schema/migration/images/init-spec. Catalog 17 no-policy
tables, 469 functions, 11 views, 358 policies; advisors 650 findings. Xem
[report/artifact](roomqc-m06-access-local-2026-10-20.md). Run schema 523/524 chỉ
là lịch sử; chưa cần VPS/provider/DNS cho các việc còn lại.

**Không làm lại phần đã có:** giữ fixture **tám actor**, 176 HTTP/RPC/Edge checks
và 20 SQL session denials làm regression. Direct-write đã deny protected columns/
root INSERT/DELETE/child writes; notes và guarded workflow control vẫn đạt;
single-supplement link đã atomic. Bước 1–3 dưới là **ma trận hồi quy/mở rộng**,
không ghi lại toàn bộ là chưa làm. Điểm nhận việc là bước 4 và phiếu nhỏ 24.16.

**Bước 1 — cố định fixture và bộ hành vi quyền.**

1. Review harness trước chạy; chỉ network/container/database có ownership manifest
   của lượt thử, account tổng hợp .invalid; không provider hoặc email khách thật.
2. Dùng Auth thật tạo owner A, owner B khác tenant, staff thường, staff được giao
   phiếu phân phối, người phụ trách theo role schema thực tế và platform admin.
   Cần positive control mỗi role; không dựng toàn bộ token bằng JWT giả tự ký.
3. Tạo tenant/hotel bằng provisioning RPC hiện có; profile/role/membership theo
   luồng thực. Ghi IDs riêng trong private fixture state; artifact chỉ dùng nhãn.
4. Có snapshot row counts/role/grants trước test; mỗi denial phải chứng minh
   không có side effect. Cleanup xác nhận đủ label/target trước xóa.

**Bước 2 — kiểm các actor guard mới qua API thực.**

| Đường vào | Positive control | Các nhánh phải bị chặn |
|---|---|---|
| Get/save/complete room setup → private.room_setup_owner | Owner active/confirmed, đúng hotel, session còn hiệu lực | Owner khác tenant; staff; locked; deleted; unconfirmed; banned; revoked; session ID sai hoặc quá not_after |
| Quote/checkout draft → private.subscription_quote_actor | Owner hợp lệ và đúng tenant/gói cho phép | Các nhánh profile/Auth/session như trên; client không tự chọn owner/tenant |
| Support reconciliation/job monitor → public.platform_support_actor | Platform admin hiện hành từ authority đã cấu hình | Hotel owner/staff; role bị thu hồi; deleted/locked/banned/unconfirmed; logout; session sai/hết |
| Email admin status/retry/test | Admin được phép; không gọi provider trước authorization | Anonymous, owner/staff, deleted/locked/inactive/unconfirmed, revoked/banned; profile query lỗi phải từ chối |
| Server-only tables/RPC | Server role đúng scope vẫn làm được thao tác cần thiết | anon/auth không đọc 3 public email tables; không gọi RPC service-only; private schema không public expose |

Email guard hiện dùng profile.is_super_admin, SQL platform guard dùng user_roles:
phải ghi mô hình quyền được duyệt và thử trường hợp hai nguồn lệch nhau; không tự
đổi toàn hệ thống sang một field chỉ để test xanh. Live Auth getUser chưa chứng
minh live session chưa revoke: kiểm trường hợp JWT chưa hết hạn nhưng session đã
xóa/thu hồi; bổ sung guard server cần thiết nếu test chỉ ra khoảng trống.

Private schema không được expose chỉ để dễ test. Với REST public, route có thật
và bị chặn quyền mới là bằng chứng denial. 404/route thiếu, timeout hoặc 503 không
thay SQLSTATE 42501/đúng permission error. Với private, kiểm catalog grants +
schema exposure denial riêng; không dùng PGRST106 để khẳng định mọi definer an toàn.

**Bước 3 — kiểm sửa policy distribution bằng cả REST và RPC UI đang gọi.**

1. Đối chiếu đúng bốn tên legacy "in their tenant" đã drop và bốn policy đích
   distribution_orders_*_policy còn nguyên, kể cả UPDATE USING/WITH CHECK.
2. Tạo phiếu ở tenant A/B; người có quyền phụ trách xem/tạo/sửa/xóa theo policy
   nghiệp vụ, staff được giao chỉ thực hiện hành động được giao. Đọc source đích
   để xác định quyền sửa/xóa, không suy đoán staff được mọi quyền.
3. Staff không được giao và user tenant B phải bị từ chối; thử đổi tenant/hotel/
   người được giao trong payload để bắt lỗi WITH CHECK/ownership. Đặc biệt thử
   REST PATCH trực tiếp bằng staff đang được giao: tenant-only WITH CHECK chưa
   chứng minh ngăn đổi assignee/hotel/cột quản trị. So sánh OLD/NEW hoặc giới hạn
   cột/thao tác theo hợp đồng được duyệt; không suy ra RPC guard bảo vệ REST.
   Thử DELETE và các bảng con/item để tránh đường vòng; denial phải giữ dữ liệu,
   assignment, tồn kho và audit như trước. Đây là rủi ro cần test, chưa phải kết
   luận đã xảy ra sửa dữ liệu trái phép trong hệ thống đang dùng.
4. Test get_distribution_orders_filtered, get_distribution_order_detail và
   create_distribution_order theo hook useDistributionOrders.ts; rà thêm mutation
   RPC hiện dùng. SECURITY DEFINER có thể bypass RLS nên REST pass chưa đủ.
5. Mỗi test gồm control hợp lệ, denial, row count/audit trước-sau và tính nhất quán
   danh sách/chi tiết. Nếu semantics chưa rõ thì ghi quyết định nghiệp vụ cần chốt,
   không mở rộng quyền mặc định để giữ UI hoạt động.

**Bước 4 — hoàn thiện hồ sơ triage, không xóa cảnh báo cho đẹp.**

1. Với 17 no-policy tables: lập bảng table → grants → caller/view/definer →
   authorized actor → negative test → kết luận có phạm vi.
2. Với **135 permissive-policy WARN hiện hành**: tính lại số bảng từ catalog 525,
   không tái dùng 153/51 của schema 523. Review table×operation×role,
   USING/WITH CHECK và các definer. Finding hiệu năng không tự chứng minh rò
   dữ liệu; policy rộng hơn ý định phải sửa.
3. Với tám FK: kiểm index leading columns, truy vấn/join/delete cha thật và
   EXPLAIN trên dataset; thêm index chỉ khi có workload/lợi ích và đo chi phí ghi.
4. Giữ **490 unused-index INFO hiện hành** trên fresh DB làm thông tin. Không xóa index
   chỉ vì pg_stat chưa có lượt dùng; cần số đo đủ thời gian/dataset trước đề xuất.
5. Mỗi finding/object có severity, tác động, owner, action, test hoặc lý do chấp
   nhận và mốc review. Quyền/dữ liệu chưa rõ giữ gate đóng; performance follow-up
   chỉ được chuyển T10/T23 khi có giới hạn và lý do cụ thể.
6. Mọi sửa SQL là migration forward-only tạo bằng CLI đã pin; không sửa checksum
   migration đã áp. Nếu thêm migration sau 525, dùng count/hash thật mới nhất.

**Bước 5 — kiểm bản sửa, tái lập và đóng hồ sơ.**

1. Focused tests R4 + email unit/integration; kiểm type/import và khởi động Edge
   Function đúng runtime đã pin. Unit 13 test trước đó không thay Edge execution.
2. A dd45e76bae82 và B 0e3ec605323b đã đạt trên source 525: replay, native
   advisors, 176 API checks, năm service/fault/recovery/permissions, Janitor và
   cleanup. Đây là baseline; đổi migration/harness/function liên quan phải tạo
   A mới. Không sửa checksum để giữ con số 525.
3. Khi source đổi, B mới tham chiếu ownership.json A completed/cleaned **cùng
   source**. Canonical schema/migration/images/init-spec phải khớp. Không dùng
   state schema 523/524 cho source mới hoặc so compose chứa tên/path/secrets
   mỗi run như release artifact byte-identical.
4. Kiểm Janitor maintenance/round-trip, callback denial đúng protocol và cleanup;
   giữ scheduled soak là việc staging riêng.
5. Chạy full control suite current tree sau lần sửa cuối; focused/email suite ghi
   log, exit/pass/fail/skip và source hashes. Không đặt sẵn con số test dự kiến.
6. Xuất artifact/report R4 đã lọc vào artifacts và docs; cập nhật tracker/advisors.
   Handover chỉ ghi local_verified đúng phần đã chứng minh; không tự deploy.

**Đóng đợt:** không còn lỗi quyền nghiêm trọng chưa xử lý trong phạm vi, current
migration replay qua cả A/B, focused/full tests đạt, triage có owner/action,
source/log/hash/cleanup khớp. Nếu một điều kiện thiếu, báo rõ thiếu gì và giữ
R4/T08 mở. Mất ref/key production không cản các fixture test này.

### 24.4. Phiếu tiếp nối R3/R5/R6/R7 — biến code đã test thành pipeline tin được

Các nhóm dưới thuộc T05/T06/T08 hiện có. Thực hiện sau khi schema/quyền R4 ổn định;
không chạy lại phần R3 đã đạt chỉ để tạo thêm số test.

| Phần | Thao tác triển khai cụ thể | File đang có / file mới dự kiến | Điều kiện đóng |
|---|---|---|---|
| R3 còn lại | Chốt issuer/scope/TTL theo release; tạo/rotate/recover cùng canary bằng quyền installer; đóng vòng đời signing key, access/refresh và KEK | probe-credentials.mjs, probe-session.mjs, probe-secrets.mjs; tool issuer/installer dự kiến | Key/ref thiếu không fallback; 2 worker tranh refresh chỉ 1 request; revoke/mất response/restart vào recovery đúng; TTL local không mặc nhiên là production |
| R5 artifact | Build tạo artifact expected từ nguồn được duyệt; định danh release/schema-init/contract/migration/image/frontend/functions/config; kiểm trust trước installer ghi | release-manifest.mjs và runner hiện có; generator/installer/trust config dự kiến | Tamper, sai target, downgrade, synthetic input cho deploy đều fail; expected không lấy từ chính live target đang kiểm |
| R6 gateway | Sửa validateCluster dùng contract manifest mới và dedicated credential; chụp identity/version trước HTTP, recheck trước transaction commit | cluster.mjs, app.mjs, admin.mjs, contracts/control-v3.openapi.json | Đổi endpoint/ref/release/credential/version giữa probe trả 409/invalidate; command/receipt/audit nguyên tử |
| R6 health | Nối probe manager vào health config/runtime; snapshot commit kiểm lại binding/revision trong cùng transaction ghi health/admission | telemetry.mjs, store.mjs, workers/health-config.mjs, workers/health-runtime.mjs và tests | Rotation sau probe return nhưng trước commit không ghi healthy; guard trước return R3 chưa đủ thay kiểm transaction này |
| R7 regression | Khóa source rồi chạy focused→full control→full vendor/permission/fault/advisor; ghi chứng cứ cùng source | scripts/test-control-directory.mjs, test-control-backend-sandbox.mjs và report/artifact | Không skip bắt buộc, không source/image/hash mismatch; source thay sau test phải kiểm lại phần ảnh hưởng và full gate tương ứng |

Không đưa service_role vào monitor để thay probe role. Không cấp rộng business
table/RPC cho canary. Các pool API/provision/health/probe/installer vẫn tách quyền;
installer không chạy thường trực bằng database superuser trong API container.

**Trust model v1 đề xuất cho R5, phải chốt ở ADR trước code installer:** artifact
chỉ được tạo từ build có source/lock/digests xác định. Operator/CI duyệt một
artifact digest cụ thể vào release manifest bất biến, cấp qua file/store riêng
read-only đối với API/worker; approval ID, người duyệt và thời gian có audit.
Installer kiểm digest, target, contract và compatibility trước ghi. Browser/
request/admin DB row không được thay trust root hoặc tự phê duyệt expected hash;
hash live của target chỉ là actual. Test sửa artifact, sửa ref, thiếu approval,
unknown release và giả synthetic ở deploy mode đều phải fail trước mutation.
Nếu chọn ký artifact bằng CI thay file được ghim, phải bổ sung key custody/
rotation/verification và test chữ ký; không ghi "signed" khi chưa triển khai.

**Drill M05/M10 sau R7:**

1. Chạy trên sandbox đủ metrics → five-service probes → snapshot → admission;
   chờ warmup 5 phút thật, đối chiếu timestamp/generation ở DB và API.
2. Cắt exporter/nguồn metric hơn 120 giây: gate mới phải đóng, bootstrap khách
   active vẫn giữ mapping; đọc lại sau API/worker restart.
3. Stop/recover từng service trên fixture đã allowlist; xác nhận kết quả typed,
   không biến missing metric/probe thành healthy hoặc số 0.
4. Đổi policy/target/revision lúc đang collect và dùng 2 worker để thử mẫu cũ;
   kết quả phải bị fence trước commit.
5. Giữ tải critical/điều kiện phục hồi theo bảng T06, chờ recovery 10 phút thật;
   pilot cần admin mở lại, worker không vượt manual_closed.
6. Khi đạt mới tạo bundle local thường trực trong ticket triển khai riêng; trước
   up/migrate phải preflight/backup/compatibility/rollback và verify image/schema/
   flag. Signup chính vẫn false trong giai đoạn chuẩn bị.

### 24.5. Hợp đồng API và giao diện phải khép trước khi khách dùng

Tất cả path control dưới đây có prefix /api/control. Route UI là route frontend
đề xuất đã thống nhất mục 20.5; endpoint planned chưa được quảng bá là dùng được.

| Hợp đồng | Hiện trạng đã đọc | Việc phải hoàn thiện và nơi click |
|---|---|---|
| GET /admin/clusters, /admin/clusters/:id; POST register/commands | implemented-local, commands partial-local | Hạ tầng list/detail; validate/đóng-mở/draining/sửa limit có quyền/version/reason/receipt; không cho nhập URL chạy shell |
| GET /admin/workspaces, /admin/workspaces/:id | implemented-local, đã có cursor metadata | Đăng ký mới list/detail; search slug/request ID, filter/cursor giữ URL, timeline không cắt mất lịch sử |
| GET /workspaces/:slug/setup-status | planned | Owner đã xác minh đọc tiến trình; thêm vào onboarding/callback, không anonymous status |
| POST /admin/workspaces/:id/recheck | planned | Nút "Kiểm tra lại" trong detail; 202 + job/command ID, poll kết quả và replay cùng key |
| GET /admin/workspaces/:id/tenant-summary | planned | Tóm tắt doanh nghiệp theo workspace+cluster; capability riêng, không fallback default client |
| GET /admin/alerts; POST /admin/alerts/:id/acknowledge | planned | Cảnh báo trong Hạ tầng/detail, deep link được; ack không resolve/mở gate |
| GET /admin/backups | planned | Section sao lưu trong detail: verified/restore proof từ hệ thống, không checkbox người dùng tự xác nhận |
| GET /admin/audit, /admin/overview | implemented-local | Timeline vận hành trong super-admin; không trộn nhật ký khách sạn |
| Command receipt/status lookup | Contract cần xác định ở T04 trước FE | Sau timeout/F5 hỏi lại cùng command ID; nếu chưa có endpoint đọc receipt phải làm trước E05 |
| Global admin login/capability/MFA | Còn phải khép T03/T14 | Entry admin riêng, không workspace basename ngẫu nhiên; 401/403/authority 503 có hướng tiếp tục |

**Màn Hạ tầng:** phần đầu chỉ hiện tên/môi trường, "Đang phục vụ", "Nhận khách
mới" và lý do chặn. Phần số đo là CPU, RAM khả dụng, disk/inode từng mount, DB
connections, five-service status, thời điểm đo. Backup/release/audit là section
chi tiết; không rải mọi field kỹ thuật lên đầu. Không dùng pastel để biểu đạt
trạng thái, cần chữ/icon cùng màu thông dụng có tương phản AA.

**Màn Đăng ký mới:** ưu tiên khách đang kẹt/cần hỗ trợ; một dòng gồm slug/workspace,
bước hiện tại, cụm, cập nhật cuối và việc cần làm. Chi tiết cho biết "đang chờ ai",
mã hỗ trợ, timeline và job; không nút "tạo lại tenant". Dữ liệu cá nhân chỉ hiển thị
khi role/contract có nhu cầu rõ, không trả raw hash/token/form.

**Bảng reachability bắt buộc khi giao UI:** operation → API → route → menu/nút
→ capability → disabled reason → E2E. Mọi API chức năng đã bàn giao phải có chỗ
click hoặc CLI vận hành được ghi rõ; không dựng menu phụ lặp để tránh bỏ sót.

### 24.6. Phiếu signup tự phục vụ — chi tiết kết quả ở từng bước

| Bước khách thấy | Nguồn chuẩn và kết quả phải có | Lỗi cần test trước khi đi tiếp |
|---|---|---|
| Chọn địa chỉ doanh nghiệp | Server giữ đúng 1 workspace/cluster/affinity, hạn giữ chỗ không kéo dài khi replay | Slug bận; 20 request/1 suất; same email; cụm full/closed/stale |
| Tạo tài khoản | Auth ở cụm đã gán; không password/token trong directory/job | Tạo Auth xong mất mạng; đăng ký lại sau expiry vẫn affinity cũ, không sang Auth B |
| Chờ xác thực email | UI hiển thị từ thao tác vừa gửi khi chưa có session; server không mở private status cho anon | Resend cooldown; link hết/dùng lại/sai cụm, tab mới/thiết bị mới |
| Nhập khách sạn | Owner verified; field allowlist; entitlement do policy server | Email khác; sai owner; payload cố chọn tenant/role/plan/cluster; quota phòng |
| Đang thiết lập | beginProvision + owner/version + đúng 1 reconcile job được commit trước RPC | Kill/timeout, gate đổi ngay trước first provision; không báo chưa tạo chỉ vì mất response |
| Kết quả chưa rõ | Receipt verified→active; missing→waiting_owner; unavailable→retry; conflict→needs_review | Lease cũ trả muộn; remote commit/local audit lỗi; recheck trùng |
| Sẵn sàng dùng | Đúng 1 tenant/hotel/trial và mapping; hướng dẫn thêm phòng/mời nhân viên | Reload không cộng trial; staff vào đúng khách sạn/quyền; logout/login/reset/invite |
| Tạm dừng đăng ký mới | Chặn intent/Auth signup cần thiết; login/reset/invite khách cũ vẫn chạy | Gọi trực tiếp Auth để bypass; forged forwarded IP; limiter nhiều instance/restart |

**Thứ tự ghép code:** hợp đồng/status → enqueue/reconcile → HTTP/provisioning
fencing → callback/resume → form/polling → abuse/proxy/email → E2E. Chỉ bỏ recovery
side effect cũ trong public GET khi đường worker/authorized recovery đã sẵn sàng,
có kiểm thử tương thích. Những giá trị commercial trial/quota vẫn theo policy
RoomQC hiện hành; thay chính sách là quyết định sản phẩm, không tự thêm vào migration.

Các field người dùng nhập giữ tối thiểu đúng nhu cầu onboarding; không thêm yêu
cầu IP/VPS/Docker. Form chờ kết quả được bảo toàn hợp lý, không lưu mật khẩu hoặc
token vào pending command/job/browser cache không an toàn.

### 24.7. VPS, backup và mở rộng: deliverable cụ thể để chuẩn bị đầu vào

| Deliverable | Chuẩn bị trong code/local | Bằng chứng phải lấy trên hạ tầng thật |
|---|---|---|
| Inventory host | Schema/template host ID, cluster ID, OS/arch, vCPU/RAM/disk/IOPS/mount/network; không secret | OPS đối chiếu máy thực/volume/port/firewall/clock và ghi target được duyệt |
| Bundle release | Compose full Supabase pinned, config/origin allowlist, migration order, images/functions/frontend hashes, secret refs | Linux cài mới→redeploy no-op→reboot, dữ liệu bền vững và đủ năm dịch vụ |
| Preflight/upgrade | Help không side effect, dry-run, fail trước mutation khi thiếu/sai target/volume/version/secret | Chạy với host sai và volume có dữ liệu; không format/init đè; rehearsal tương thích schema/consumer |
| TLS/callback/mobile | Template public app/API/admin/callback origins, CSP/WebSocket/upload/deep link tests | Domain roomqc.com đã chọn topology; cert/renewal/TLS hiện đại, browser desktop/Android hoạt động |
| Backup set | Directory + DB/Auth/queue/receipt + Storage metadata/object bytes + release/config + key versions; cửa sổ quiesce | Offsite khác failure domain, checksum readback, key recovery độc lập; không chỉ backup trên VPS |
| Restore | Target ownership guard, reject thiếu part/sai checksum/key/version, verify suite | Host/volume sạch: login/mapping/rooms/invite/bytes/jobs đúng; đo RPO≤24h/RTO≤4h theo dataset pilot |
| Alert ứng cứu | Persistent alert/outbox/sink, runbook từng lỗi và escalation template | Cắt host thử: detection≤180s, received≤300s từ cùng mốc fault, operator ack/restore có log |
| Capacity/mở rộng | Workload+think time, tenant nặng/tenant đối chứng/signup; bounded budget | 10→25→50→100 phiên, soak≥60 phút; maximum tested và operating limit có headroom |
| Pilot | Checklist release/gate/kill switch/support/báo cáo theo ngày | Một nội bộ rồi 5–10 khách, ít nhất 7 ngày, không lỗi nghiêm trọng; RQ duyệt tăng quy mô |

Các mục tiêu thời gian ở trên là mục tiêu nghiệm thu cần đo, chưa phải SLA đã
cam kết. Backup dự kiến mỗi 12h hỗ trợ mục tiêu RPO, nhưng retention/xóa/chi phí
phải được chốt trước bật lịch cleanup. Restore không tự replay email/payment
outbox cho tới đối soát. Một data cluster/host v1 không phải HA: mất host có thể
ảnh hưởng tất cả workspace trên host đó; capacity không thay phương án khôi phục.

Chuẩn bị bảng mở rộng gồm cluster hiện tại, operating limit, mức cảnh báo cần
bổ sung cụm, lead time cài/validate cụm và ngân sách. Mở rộng v1 chỉ đưa khách
mới chưa có affinity sang cụm mới; di chuyển khách cũ/HA/100.000 concurrent chưa
thuộc deliverable này. Muốn đạt 1.000 khách sạn cần capacity tổng theo nhiều cụm
và đội vận hành, không tăng một con số tenant_limit rồi coi đã đáp ứng.

### 24.8. Ước lượng và lịch nhận việc theo cổng

Đây là dự toán chuẩn bị của phần còn lại, thay cách dùng con số lịch sử 21–33
ngày công làm deadline. Một ngày công là khối lượng của một kỹ sư có đầu vào đầy
đủ; không quy đổi trực tiếp thành thời gian chạy agent hoặc ngày bàn giao chắc chắn.

| Chặng còn lại | Bước thuộc plan | Dự toán sơ bộ ngày công | Sản phẩm review được |
|---|---|---|---|
| Khép quyền/release/lifecycle/runtime và current proof | T01–T06/T08, R3–R7 | 8–12 | R4 report, release artifact/installer, pipeline và full test logs |
| Alert lifecycle/notification/drill local | T07, M07/M08/M10 | 3–5 | API+outbox+sink, restart/retry/fault proof |
| Auth/admission/budget còn lại | T03/T04/T09/T10 | 2–3 | Capability/receipt, race 20/1, budget config và test |
| Signup/resume/reconcile/abuse/email local | T11–T13 | 4–6 | Journey có recovery, worker và focused E2E |
| Admin UI/callback/mobile/usability | T14–T17 | 4–6 | Hai màn API thật, reachability và browser evidence |
| Linux bundle/offsite/restore/alert thực | T18–T20 | 4–7 | Reproducible deploy và host-loss restore/alert drill |
| A/B/E2E/load/cutover/release | T21–T24 | 4–6 | 70-case ledger, capacity và RC/gate packet |
| Hỗ trợ và tổng kết pilot | T25 | 1–2 + quan sát≥7 ngày | Báo cáo vận hành/chi phí và quyết định mở rộng |

Mỗi dòng chỉ tính phần còn thiếu của chặng: guard R4/release/probe ở dòng đầu
không tính lặp vào authority/capability/command integration ở dòng thứ ba.
Thời gian test/handoff dùng chung phân bổ một lần khi estimate lại theo ticket.
Tổng sơ bộ 30–47 ngày công, chưa gồm thời gian chờ quyền/provider, vận hành phát
sinh hoặc quan sát pilot. Dành dự phòng khoảng 20% để bố trí nguồn lực: khoảng
36–57 ngày công. Đây không là yêu cầu mua thêm VPS/người ngay trong lượt này.
Ước lượng lại ngay sau R4/R7/pipeline vì số policy cần sửa và lỗi full stack có
thể thay khối lượng đáng kể; báo rõ thay đổi thay vì âm thầm rút acceptance.

Có thể chuẩn bị contract/mock UI, inventory, dataset và runbook trong lúc backend
đang kiểm chứng; merge theo dependency, không nghiệm thu mock như integration.
Không tạo agent/worktree mới từ bảng này; chỉ phân việc theo cơ chế đã được yêu
cầu và khi có target/file ownership rõ.

### 24.9. Phần cần khóa/quyền — gom làm sau, không bỏ quên gate

1. VPS Linux staging và đường SSH/CI/secret store: chỉ cần trước chạy T18 thật.
2. DNS roomqc.com và topology app/API/callback/admin: chỉ cần trước TLS/email
   domain/E2E callback thật. Kiểm hiện trạng DNS trước chỉnh, không tự đoán record.
3. Resend/SMTP và domain verified: kiểm tình trạng tài khoản hiện tại; cuộc hội thoại
   trước có mở dashboard nhưng chưa có bằng chứng release này gửi mail thật.
   Chuẩn bị FROM/REPLY-TO, provider/webhook secret refs và inbox Gmail/Outlook thử.
4. Anti-bot production và policy direct Auth/signup: trước gate U; fixture test
   vẫn triển khai được ngay.
5. Offsite bucket/credentials/quota/retention/key custody độc lập: trước T19 thực
   và gate P; không lưu key duy nhất cùng chỗ ciphertext.
6. External heartbeat/alert destination và người trực/người thay ca: trước B09/F09.
7. Policy trial/quota/expiry, admin MFA, khách pilot và giờ hỗ trợ: RQ chốt trước
   contract/gate tương ứng; không thay billing tự động để chạy demo.

Ghi mỗi mục là available / needs_configuration / deferred_external sau khi kiểm
tra thực tế. Không mặc định "thiếu quyền" vì chưa hỏi; không yêu cầu gửi secret
trong chat. Không coi các mục này đã hoàn thành hoặc chặn phần local độc lập.

### 24.10. Hồ sơ đóng toàn bộ plan

Chỉ đề xuất hoàn tất P0–P8 khi có đủ:

1. Bảng 27 gói→T01–T25→70 case đầy đủ; trạng thái và evidence theo từng môi trường.
   Những case chưa chạy ghi not_run/deferred với gate bị chặn, không gọi hoàn tất.
2. Source tree/image/schema/config/release artifact cùng phiên bản; expected/actual,
   log/checksum/run IDs, positive/negative/fault proofs và cleanup ownership.
3. Hai màn quản trị thao tác API thật; khách tự signup/resume dùng được; quyền,
   isolate A/B và không trùng receipt/tenant/trial đã thử bằng browser + DB.
4. Linux deploy/upgrade/reboot/TLS/secret rotation; offsite restore/host-loss,
   alerts và người trực đã kiểm, capacity/operating limit được chốt từ số đo.
5. Cutover/kill switch/rollback rehearsal đạt; release không còn Critical/High
   liên quan quyền/dữ liệu/cấp phát/khôi phục chưa xử lý.
6. Pilot ít nhất 7 ngày có báo cáo lỗi/khả dụng/tài nguyên/backup/hỗ trợ/chi phí
   và quyết định RQ về mở rộng; gate U và gate B duyệt riêng.

**Việc bắt tay ngay sau khi duyệt triển khai:** nhận T01/R4-a ở 24.16, đóng
reachability/policy/FK và legacy workflow còn thiếu; direct-REST scope đã test
giữ làm regression. Sau đó theo R3/R5/R6/R7 ở 24.4 và 24.16. Không bắt đầu bằng mở signup, nâng image đang phục vụ
hoặc vẽ biểu đồ VPS khi pipeline chưa đạt.

Tài liệu Supabase đã đối chiếu khi chuẩn bị: changelog 19/10/2026, hướng dẫn
[self-host Docker](https://supabase.com/docs/guides/self-hosting/docker),
[RLS và grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
và [thay đổi TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).
Bộ cài vẫn phải pin upstream/digests và thử trên Linux; không dùng quick-start
mới nhất hoặc CLI dev tự động làm bản cài production chưa kiểm chứng.

### 24.11. Checklist nhận việc và bàn giao từng đợt

Đây là **run sheet hiện hành**, đọc cùng định nghĩa T01–T25 ở mục 4–11,
không phải 8 dự án mới. Mỗi ô dưới được chuyển thành checklist trong ticket;
BE/FE/OPS/QA là vai trò, chưa gán cho một người hoặc agent cụ thể. Không bắt đầu
đợt sau chỉ vì đã hết thời gian dự toán. Có thể chuẩn bị các phần độc lập, nhưng
không ghép mock thành bằng chứng đã tích hợp.

**Cách đọc phụ thuộc để tránh vòng chờ:** T08 cung cấp manifest/credential/probe
contract trước → T05 nối từng nguồn → T06 ghi snapshot nguyên tử → T08 validation
end-to-end và R7 mới đóng tổng thể. Nhãn T05 “phụ thuộc T08” không yêu cầu T08
đã nghiệm thu toàn bộ mới bắt đầu. T11/T12 tương tự: chốt contract chung, nối
enqueue/receipt worker trước khi bỏ đường recovery cũ; không chờ hai bước tự
đóng lẫn nhau. T21 có thể chuẩn bị fixture sớm, nhưng A/B integration chỉ nghiệm
thu sau consumer/signup/client đã nối thật. Không thay sequencing bằng bỏ gate.

#### Đợt 1 — quyền, release tin cậy và đường giám sát thật

**Bước liên quan:** T01–T06/T08; R3–R7. **Chịu trách nhiệm:** BE; review QA/OPS.
**Dự toán phần còn lại:** 8–12 ngày công, sẽ ước lượng lại sau review R4.

1. Ghi source manifest gồm HEAD + hash file đã sửa/chưa tracked, lockfiles,
   migrations, contract, config và image. Ghi schema runtime riêng; không dùng
   HEAD 5cb5837 để đại diện toàn bộ working tree. Bảo toàn primary index.
2. Giữ fixture tám actor/real GoTrue, 176 API checks cùng SQL/Edge hiện có.
   Direct-write bên dưới đã đạt A/B source 525; chỉ mở rộng nhánh chưa có coverage.
   Ma trận cần bảo vệ gồm
   staff được giao tự PATCH assignee/hotel/tenant/created_by/status/totals;
   manager ngoài hotel; direct INSERT/DELETE; bảng con/batch/item và RPC thao tác
   trạng thái. Xác định tập cột staff thực sự cần sửa từ UI hiện hành.
3. Chốt chính sách assignment/scope/state; nếu test vượt quyền, tạo migration
   forward bằng CLI, không sửa checksum các migration đã replay. Giới hạn cột/
   transition hoặc bắt đi qua guarded RPC; không bỏ quyền hợp lệ của staff mà
   chưa có đường thao tác thay thế. Positive controls phải chạy sau sửa.
4. Hoàn thành bảng 17 no-policy tables → caller/view/definer/grants → actor/test;
   rà danh sách permissive policies theo operation; xác nhận lại số bảng từ
   catalog hiện hành. Phân tích tám FK với dataset và EXPLAIN; không xóa 490
   unused-index chỉ dựa fresh fixture. Security chưa rõ vẫn giữ R4 mở.
5. Chốt authority: platform dùng user_roles, email dùng profile.is_super_admin
   hiện hành; thử role-only/profile-only, blocked/deleted/revoked và đúng caller
   JWT. Việc hợp nhất nguồn quyền là quyết định riêng có migration/test, không
   tự đổi hệ thống sang một field.
6. Khép issuer/installer probe: account scope, TTL, refresh lease/CAS, recovery,
   key version/KEK và rotation. Thiếu secret/ref không fallback sang service_role.
   API/worker chỉ đọc credential đúng target; issuer/migrator tách quyền.
7. Build artifact từ source được duyệt; operator/CI phê duyệt digest bất biến.
   Installer xác minh expected → target → contract/version trước ghi. Reject
   tamper, unknown release, downgrade và synthetic fixture trong deploy mode.
8. Sửa gateway validate theo contract mới; kiểm target/ref/release/credential
   version trước/sau HTTP. Health snapshot và admission phải recheck revisions
   trong **chính transaction commit**, không chỉ trước khi probe trả kết quả.
9. Thu kết quả A đã có làm baseline có phạm vi. Sau sửa liên quan, chạy A mới và
   B độc lập tham chiếu state A completed/cleaned mới nhất; toàn migration/hash/
   init-spec/images phải khớp. Sequential builds này không thay hai backend A/B.
10. Focused FE/email → full control/DB → full vendor/permission/fault/advisors →
    build/verify:build; lưu exit và không skip bắt buộc. Chạy drill pipeline
    warmup/stale/recovery theo 24.4 bằng thời gian thật, không fake clock thay.
11. Xuất report/artifact đã lọc gồm quyền được chứng minh, findings còn lại, source
    hashes, expected/actual, commands, log checksums, cleanup và next action.

**File nhận việc:** server/control/{cluster,admin,store,telemetry,release-manifest,
probe-credentials,probe-session,probe-secrets,service-probes}.mjs;
workers/{health-config,health-runtime}.mjs; scripts/control-backend-*.mjs,
test-control-backend-sandbox.mjs; supabase/migrations và các test tương ứng.

**Đạt khi:** actor/scope/denial/revoke, receipt/version và transactional fencing
có positive/negative/race proof; fresh A/B source-identical đạt và cleanup;
triage có kết luận/owner/action, không unresolved Critical/High trong phạm vi.
**Chưa đủ để:** đóng T08 toàn release, đo Linux host, mở signup hoặc sửa DB nghiệp vụ.
**Dừng/khôi phục:** test mất ownership, hash sai hoặc data boundary sai thì ngừng;
giữ private diagnostics, cleanup exact-owned targets, không reset runtime chính.

#### Đợt 2 — cảnh báo có người xử lý, không chỉ biểu đồ

**Bước:** T07/M07/M08/M10. **Vai trò:** BE/OPS; QA review. **Dự toán:** 3–5 ngày công.

1. Chuẩn hóa alert key theo cluster + loại lỗi + phạm vi/mount; một lỗi lặp chỉ
   một alert mở. Giữ first_seen/last_seen/severity/reason, không ghi raw secret.
2. Evaluator phát mở/đổi mức/resolve từ snapshot đã chấp nhận. Ack chỉ là người
   vận hành đã nhận biết; không resolve lỗi, không mở admission.
3. Thêm read API/ack với capability, reason/version/command receipt và timeline.
   Filter/page có giới hạn; client không gửi raw query hay arbitrary webhook URL.
4. Ghi notification outbox cùng transaction chuyển trạng thái. Dispatcher claim/
   lease/fencing, retry bounded/backoff và dead-letter có đường xem/tiếp tục.
5. Giao local sink: mất response sau sink nhận, restart dispatcher, hai worker,
   sink down, lỗi kéo dài và recovery. Không hứa exactly-once delivery nếu sink
   không có idempotency; dùng event ID/dedupe và công bố at-least-once có kiểm soát.
6. Xác định escalation theo severity, người trực, đích được duyệt và thời gian.
   Adapter provider dùng secret refs; không gửi thật nếu chưa cấu hình/được duyệt.

**Bàn giao:** alert APIs/DTO, schema forward nếu cần, evaluator/outbox/dispatcher,
unit+DB+HTTP tests, local sink evidence và runbook stuck/dead-letter.
**Đạt local:** B08, restart/retry không mất sự kiện, ack/audit đúng.
**Giữ mở:** B09/F09 tới khi có heartbeat ngoài failure domain và proof received.
**Khôi phục:** dừng dispatcher bằng config, giữ outbox; không xóa job để dọn dashboard.

#### Đợt 3 — chốt quyền lệnh, phân bổ và ngân sách trước signup

**Bước:** T03/T04/T09/T10. **Vai trò:** BE/OPS, RQ duyệt policy. **Dự toán:** 2–3 ngày công.

1. Ma trận capability platform-read / infra-operate / support-reconcile theo API;
   V1 có thể cùng super-admin nhưng server vẫn kiểm operation. Chốt MFA/AAL cho
   lệnh production; authority cluster unavailable phải fail-closed, không dùng
   owner khách sạn hoặc user_metadata thay quyền.
2. Bổ sung contract đọc command receipt/status theo quyền để phục hồi sau F5/
   timeout; cùng key khác payload 409. Contract quyết định trước FE, không thêm
   endpoint đọc được receipt người khác chỉ vì biết UUID.
3. Hồi quy 20 request tranh 1 suất, 20 retry cùng intent và hai admin close/open/
   version race bằng DB thật. Transaction không giữ khóa qua HTTP/provider.
4. Reservation/affinity/recheck-first-provision cùng nguồn gate. Expired trước
   provision mới được giải phóng slot; đã có Auth affinity hoặc outcome chưa rõ
   không chuyển sang cụm khác. Đóng nhận mới không khóa khách active.
5. Inventory budget tất cả connection pools/Auth/REST/worker/monitor; đặt timeout,
   queue/concurrency/report/upload caps qua cấu hình có version. Không tăng
   max_connections/work_mem theo số tài khoản.
6. Thử tenant nặng + tenant đối chứng + signup; khép correctness trước, operating
   limit cuối phải lấy số đo T23, không tự gán khách sạn/cụm từ cấu hình máy.

**Bàn giao:** OpenAPI khớp router/DTO/errors/receipt, authority và admission tests,
budget inventory/config. **Đạt:** A08–A11/C05–C10 theo môi trường, không tăng quota/
thay trial thương mại. **Rollback:** đóng nhận mới; giữ khách cũ/mapping/receipts.

#### Đợt 4 — khách đăng ký, xác thực và tiếp tục sau lỗi

**Bước:** T11–T13. **Vai trò:** BE/FE; QA, RQ duyệt trial policy. **Dự toán:** 4–6 ngày công.

1. Contract setup-status private trả step, nextAction, request/support ID,
   lastUpdated, retryAfter khi hợp lệ; không trả email/receipt/job detail cho anon.
2. beginProvision commit owner/binding/routing version + đúng một live reconcile
   job trước khi gọi cụm. Payload job không có password/access/refresh token,
   không lưu tùy tiện form để worker chạy lại.
3. Reconciler đọc receipt tại cụm gán: verified→activate; missing→waiting_owner;
   unavailable→retry; conflict→needs_review. Lease đề xuất 90s, timeout 20s,
   retries 30s/2m/5m/15m/30m có jitter; là cấu hình thử, phải kiểm timeout tổng.
4. Owner resume theo session đúng cụm và registration; form không bị mất khi
   timeout/outcome unknown. Hai tab, F5, new device, callback expiry/replay không
   tạo thêm tenant/hotel/trial hoặc tự kéo dài hạn dùng.
5. Nối xác thực email/reset/invite/PKCE/deep link Android đúng origin+workspace;
   native transport allowlist cho API mới cụ thể, không wildcard.
6. Triển khai trusted proxy/IP và limiter bền vững nhiều instance/restart. Chặn
   forged forwarding, spam intent/Auth/resend và challenge replay; challenge fail
   không giữ slot. Kiểm direct Auth signup, không chỉ form RoomQC.
7. Flag public signup đóng được cả đường cần chặn, vẫn giữ login/reset/invite
   khách cũ. Mailpit/sink dùng local; Gmail/Outlook/domain thật chỉ đạt D15 khi
   thực gửi/nhận/callback trên staging được cấp phép.
8. E2E ít nhất một owner mới → email → hotel → rooms → invite staff → staff login;
   thêm mọi fault window D07–D11 bằng remote commit proof, không chỉ HTTP timeout.

**File hiện có:** app/store/support/cluster; src/lib/workspace.ts, workspace client/
start pages, auth/Onboarding, AuthCallback/EmailVerification, native transport.
File worker/DTO/test mới phải ghi planned trước tạo; không dựng signup thứ hai.
**Đạt:** D01–D14 local và browser bằng API/DB thật; D15 external giữ trạng thái riêng.
**Rollback:** flag signup mới off, worker pause có lease; giữ job/intent/receipt;
không xóa tài khoản Auth hoặc tự chạy lại cấp phát.

#### Đợt 5 — hai màn quản trị dùng được trong công việc hằng ngày

**Bước:** T14–T17. **Vai trò:** FE/BE; QA usability. **Dự toán:** 4–6 ngày công.

1. Entry /super-admin/login root dùng authority định danh; directory flag/
   workspace basename không đẩy admin về onboarding. Typed control client không
   dùng Supabase singleton của khách sạn cho dữ liệu control.
2. Query keys gồm authority/cluster/workspace/version cần thiết; logout/đổi quyền
   abort request và xóa đúng cache. Không hiển thị response cũ sau chuyển cụm.
3. Hạ tầng list/detail theo 24.5: trạng thái phục vụ/nhận khách/lý do chặn ở đầu;
   resources/five services/time; backup/release/audit ở chi tiết. Hiển thị unknown/
   stale/unavailable thành chữ, không giả 0% hoặc dùng màu duy nhất.
4. Commands có impact summary, reason, expectedVersion, pending/unknown-result/
   succeeded/conflict/failed. Timeout/F5 giữ cùng command identity qua receipt;
   không toast thành công khi chỉ 202/queued.
5. Đăng ký mới list/detail ưu tiên needs_review/stuck, filter/search/cursor URL,
   tổng server và timeline đầy đủ trên ≥1.000 metadata. Recheck là đối soát cùng
   binding, không nút tạo lại tenant. Tenant-summary server chọn đúng cluster.
6. Tạo reachability ledger: tính năng→API→menu/route/nút→capability→disabled reason
   →E2E. Actions hiếm đặt trong detail, không menu phụ lặp; CLI-only ghi rõ lý do.
7. Back về đúng danh sách/filter/page/scroll trước đó; đi trang mới scroll top.
   Thử sidebar cuối trang, F5/deep link, 390px, zoom 200%, keyboard/focus và screen
   reader cơ bản; status chữ/icon, màu thông dụng tương phản WCAG AA.
8. Cho người chưa biết code tìm một đăng ký kẹt/cụm bị chặn trong ≤30s; ghi thời
   gian/lỗi thực, không chỉ tự xác nhận “giao diện đẹp”. Fix rồi thử lại.

**Routes UI đề xuất:** /super-admin/infrastructure, /super-admin/infrastructure/:id,
 /super-admin/registrations, /super-admin/registrations/:id.
Chỉ chốt sau review router; đây chưa phải route đang hoạt động.
**Đạt:** E01–E08 và A03 liên quan; API thật, không mock production.
**Rollback:** ẩn entry feature chưa đạt qua flag; không bỏ đường đọc support cũ.

#### Đợt 6 — bộ cài Linux, backup và khôi phục ngoài máy

**Bước:** T18–T20/M09. **Vai trò:** OPS/BE; QA độc lập. **Dự toán:** 4–7 ngày công.

1. RoomQC duyệt inventory host/volume/port/domain và offsite target. Record source/
   destination riêng, firewall chỉ public reverse proxy cần thiết, DB/exporters/
   Prometheus/Studio admin không lộ public. Không chiếm port CRM/dự án khác.
2. Bundle pinned upstream/images/locks/functions/frontend/config và approved
   artifact; help/dry-run không ghi. Preflight CPU/RAM/arch/disk/clock/DNS/port/
   volume ownership/secrets/current schema trước bất kỳ init/migrate nào.
3. Tách installer/migrator/runtime permissions. Secrets sinh/nhập qua máy/secret
   store được duyệt, file ACL/UID/GID đúng; không dán key vào dashboard/chat/log.
4. Rehearsal install mới → verify → redeploy no-op → reboot → upgrade consumer/
   schema tương thích. Không pull latest hay chạy quick-start thay verified bundle.
5. TLS/CSP/Origins/websocket/upload/callback thực và renewal; thử secret missing/
   rotate/revoke/key recovery. Không đổi endpoint cluster có khách để “chuyển máy”.
6. Chốt cửa sổ backup/quiesce, DB consistent points + object snapshot/version
   manifest. Gói đủ directory, cluster DB/Auth/queues/receipts, Storage metadata/
   bytes, release/config và refs/key versions; KEK/recovery secret quản lý độc lập.
7. Backup đề xuất 12h/lần; retention/immutability/chi phí do RQ duyệt trước cleanup.
   Upload offsite rồi readback/checksum; backup thiếu part chưa được verified.
8. Restore target sạch khác volume/host; checksum/key/version fail phải dừng.
   Giữ outbox email/payment tắt đến đối soát, không gửi lại ngoài ý muốn.
   Đăng nhập, mapping/trial/rooms/invite/object bytes/jobs phải đúng.
9. Mô phỏng mất host gốc và chỉ dùng offsite+recovery keys; đo RPO/RTO theo dataset
   pilot. Mục tiêu RPO≤24h, RTO≤4h là mục tiêu cần đo, không SLA đã đạt.
10. External heartbeat khác failure domain + đích thật đã duyệt; fault/detected/
    received/ack/recovered timestamps. Mục tiêu phát hiện≤180s/received≤300s;
    provider accepted không thay người nhận được thông báo.
11. Người khác dùng runbook xử lý DB down/disk full/stale metrics/queue stuck/
    certificate/credential/host loss; có người trực và người thay.

**Đạt:** F01–F09/B01/B09 đúng staging, restore từ offsite thật.
**Điều kiện dừng:** target/ownership chưa rõ, thiếu backup/key hoặc incompatible
schema thì dừng trước ghi; giữ source host. Không rollback DB bằng restore đè
hoặc drop migration; application rollback chỉ khi compatibility đã chứng minh.

#### Đợt 7 — hai backend, E2E, tải và release candidate

**Bước:** T21–T24. **Vai trò:** QA/BE/FE/OPS. **Dự toán:** 4–6 ngày công.

1. Dựng A/B **đồng thời**, Auth/DB/signing keys/Storage/Realtime riêng. Có tenant/
   object cùng local ID nếu cần; route phải theo workspace+cluster. Hai fresh builds
   tuần tự cùng hash ở R4 không phải bằng chứng isolation G01/G02.
2. Browser desktop/Android: signup/resume/invite/login/reset, admin commands/
   receipts, deep links/cache/Back và legacy cutover. Dùng đúng image candidate.
3. Sai token/data/object/channel giữa A↔B phải deny; positive controls cùng lúc
   vẫn đạt. A draining/down chỉ chuyển khách mới chưa affinity sang B; khách cũ
   A giữ mapping và thông báo unavailable, không fallback B.
4. Fault API/directory/worker/five services/authority/network tại từng cửa sổ
   commit; chụp trước-sau DB và outcome. Không dùng 404/timeout làm proof deny quyền.
5. Dataset/version xác định, ≥1.000 workspace metadata; workload nghiệp vụ theo
   số phòng/ngày/nhân sự được chọn. Tải 10→25→50→100 phiên có think time và mixed
   operations; báo failed level, stop thresholds, không chỉ mức xanh.
6. Tenant report/upload nặng + tenant đối chứng + signup để đo noisy-neighbor;
   soak≥60 phút tại operating candidate. Record p50/p95/p99/error/pool/CPU/RAM/
   disk IO/backlog/connection+memory trends và cost.
7. Operating limit dưới maximum tested có headroom; xác định ngưỡng mua/thêm cụm,
   thời gian cài/validate và ngân sách. Không hứa 1.000 khách sạn/100.000 concurrent
   từ một VPS hoặc tăng tenant_limit mà chưa đo.
8. Khóa RC source+image+schema+config; đối chiếu đủ 70 case expected/actual và
   defects. Trường hợp not_run không chuyển passed vì unit tests nhiều.
9. Rehearsal cutover/kill switch/frontend rollback; giữ khách legacy, mapping,
   receipts/audit và đường support. RoomQC duyệt gate pilot trên evidence packet.

**Đạt:** A–G liên quan tại đúng môi trường; G01–G07, không unresolved Critical/
High quyền/dữ liệu/cấp phát/restore. **Không được tự mở public/paid.**
**Rollback:** đóng signup, giữ routing/mapping, dùng binary/config compatible đã
rehearsal; schema forward-fix khi cần. Không tự di chuyển tenant để né incident.

#### Đợt 8 — pilot có quan sát và quyết định mở rộng

**Bước:** T25. **Vai trò:** OPS/RQ, QA hỗ trợ. **Dự toán:** 1–2 ngày công tổng kết,
cộng ít nhất 7 ngày lịch quan sát; thời gian chờ khách/provider không tính lẫn.

1. Chọn một workspace nội bộ, rồi 5–10 khách có đồng ý/được chọn; quota/operating
   limit thấp, người hỗ trợ được chỉ định. Không public signup âm thầm.
2. Hằng ngày theo dõi login/signup/provision outcomes, API availability/latency,
   errors/queues/alerts/resources, backup verification/restore và hỗ trợ thực.
3. Thử backup/alert drill trong phạm vi đã thống nhất; mọi fault có target/rollback.
4. Tách lỗi sản phẩm, email/provider và thao tác người dùng; ghi severity/time-to-
   detect/ack/recover, ảnh hưởng và action owner. Không che incident khỏi báo cáo.
5. Báo SLO đề xuất≥99,5% API quan trọng trong cửa sổ đo, capacity/headroom, chi phí
   trên workload và phản hồi UX; nêu rõ sample nhỏ không chứng minh quy mô 1.000 KS.
6. RoomQC duyệt giữ pilot/mở rộng/sửa tiếp; gate U public và B paid có phiếu riêng.
   Chỉ đóng toàn plan khi mọi deliverable/gate thuộc phạm vi được chứng minh.

**Dừng mở rộng ngay:** mất/rò dữ liệu, cấp phát trùng, cross-tenant access,
backup/restore thất bại hoặc không có người xử lý cảnh báo. Tắt nhận mới trước,
giữ dịch vụ khách đang hoạt động nếu an toàn; ứng cứu theo runbook.

### 24.12. Quyết định và đầu vào trước từng cổng

Mọi giá trị dưới đây là **đề xuất chuẩn bị hoặc cần xác nhận**, không thay chính
sách thương mại/vận hành đang có. Không yêu cầu gửi key/mật khẩu trong chat.

| Mục cần chốt | Đề xuất dùng để chuẩn bị | Chốt muộn nhất | Không có đầu vào thì làm gì |
|---|---|---|---|
| Deployment V1 | Một data cluster/host, nhiều workspace cách ly; control directory riêng | Trước T08/T18 | Giữ ADR hiện có; không làm VPS-per-signup |
| Admin authority/MFA | Authority cố định, live role/session; lệnh production theo AAL được duyệt | Trước đóng T03/T14 | Làm fixture và contract; không bỏ qua kiểm quyền |
| Trial/quota/expiry | Đọc policy hiện hành; quota server, không tự đổi giá/trial | Trước đóng T11/D01 | Nối policy provider có version; chưa tự quyết thông số thương mại |
| Profile VPS | Linux host test có OS/arch/vCPU/RAM/disk/IOPS/network; size từ đo | Trước T18/T23 thật | Viết inventory/preflight/dataset local |
| Origins/domain | Tên miền roomqc.com; topology app/API/admin/callback cần duyệt | Trước TLS/T13 external | Không tự đổi DNS; chuẩn bị allowlist template |
| Email/provider | Xác nhận Resend hiện trạng/domain verified, FROM/REPLY-TO/webhook refs | Trước D15/gate S liên quan | Mailpit/provider-disabled; không tuyên bố đã gửi mail thật |
| Offsite | Failure domain khác VPS, retention/immutability/quota/chi phí/key custody | Trước F05–F08/gate P | Làm format/validator/local restore; không tính backup cùng máy là offsite |
| Monitoring retention | Đề xuất metrics 15d/log 14d/ops audit 180d; tách hồ sơ khách | Trước bật cleanup thật | Không xóa dữ liệu theo tuổi khi chưa duyệt |
| Alert/on-call | Destination ngoài host + người trực/người thay + escalation | Trước B09/F09/gate P | Local sink và runbook; giữ external not_run |
| Anti-bot | Provider/test mode, IP proxy trust, direct Auth policy | Trước gate U | Test adapter/local; không mở public khi thiếu production controls |
| Pilot/success | 1 nội bộ→5–10 khách, ≥7 ngày; quota/giờ hỗ trợ/kill switch | Trước gate P | Chuẩn bị RC/checklist; không tự chọn khách thật để gửi thư |
| Billing/paid | Báo giá/thu phí/settlement theo backlog riêng, không lẫn health admission | Trước gate B | Vẫn hoàn thiện trial/entitlement; không tự bật thu tiền |

**Phân biệt khóa:** admission chỉ chặn nhận mới; suspension là trạng thái workspace;
trial/entitlement là quyền nghiệp vụ thương mại. VPS đầy không tự khóa tài khoản
khách đang hoạt động, hết trial không tự xóa dữ liệu hoặc chuyển cụm. Quyền đọc/
export khi hết hạn phải do RQ chốt, không suy từ trạng thái signup.

### 24.13. State machine và bất biến dữ liệu dùng khi review

Không ghép state của workspace, job, health và admission vào một badge “lỗi”.
Nguồn chuẩn là database/control contract; browser không tự suy trạng thái thành công.

| Đối tượng | Trạng thái hiện có/luồng cần bảo vệ | Bất biến bắt buộc |
|---|---|---|
| Workspace | reserved→provisioning→active; reserved→expired; suspended/migrating có quy trình riêng | active có tenant_id/hotel_id/owner_id; không cho browser gán binding |
| Reservation | Retry cùng identity giữ intent; expiry chỉ trước provisioning | Không kéo dài expiry/trial khi replay; không chiếm thêm slot |
| Affinity | Email đã có Auth/registration gắn cụm ban đầu | Cụm A down/full không tạo lại Auth ở B; conflict vào support |
| Provisioning job | queued→leased→succeeded/retry/waiting_owner/needs_review; cancelled có kiểm soát | Một live job/workspace/kind; lease/fencing chặn stale result; không arbitrary rerun form |
| Remote receipt | verified / missing / unavailable / conflict là kết quả đọc có nghĩa khác nhau | verified phải khớp owner/workspace/tenant/hotel/routing; timeout không bằng missing |
| Health | healthy/degraded/unreachable/unknown; generation/freshness/target binding | Mẫu cũ/sai target/credential revision không overwrite healthy trong commit |
| Admission | open/blocked/manual_closed; không đồng nhất health/cluster.status | All conditions đủ mới nhận; manual_closed không bị worker tự gỡ |
| Cluster | active/draining/offline; validation pending/valid/invalid riêng | Khách active giữ route; endpoint có workspace không được đổi tùy tiện |
| Admin command | started/succeeded/failed + receipt/version/audit | Mutation+receipt+audit nguyên tử; replay một key/payload một kết quả |
| Alert | Mở→ack tùy chọn→resolved bởi bằng chứng phục hồi | Ack không resolve hoặc tự mở gate; notification không quyết định health |
| Backup | pending/verified/failed, restore proof và bộ parts riêng | Tạo dump chưa bằng verified/offsite/restore success; thiếu key/bytes là thất bại |

Định nghĩa transition cụ thể phải đối chiếu schema/handler/test khi nhận ticket;
bảng này không cho phép tự thêm enum mới. Mọi proposal enum cần migration,
contract, compatibility và test forward/rollback trước khi UI sử dụng.

### 24.14. Checklist báo cáo và quản lý bằng chứng

Mỗi đợt dùng đúng một báo cáo authoritative; sửa hoặc supersede rõ, không đẻ
thêm plan tương đương. Tracker giữ current; báo cáo cũ giữ timestamp/lịch sử.

1. Scope P/T/acceptance ID; owner/reviewer; dependency đã đạt/chưa đạt.
2. Source HEAD + working-tree hash manifest, dependency locks, image digests,
   directory/app migration sets và config/secret **refs/versions**, không giá trị.
3. Target/environment/run ID/ownership và thời gian UTC/Asia-Bangkok.
4. Lệnh đã chạy, exit/pass/fail/skip/cancel, expected/actual; source đổi sau test
   phải chỉ rõ phần test lại. Không đặt sẵn pass count để verifier chỉ kiểm con số.
5. Positive/negative/fault/race controls và snapshot trước-sau theo từng case.
   Kết quả fail/intermediate giữ làm lịch sử; 404/timeout không thay quyền deny.
6. Log/artifact SHA256 đã lọc, report links; raw private logs ở .local, không
   publish token/DSN/email khách/function bodies chứa thông tin nhạy cảm.
7. Cleanup exact-owned resources và primary index hash giữ nguyên; không xóa
   toàn workspace/volume hoặc giết process chưa xác định owner.
8. Defects severity/impact/action/owner/gate, decision records và phần external.
   not_run/deferred_external không phải passed.
9. Next ticket đầu tiên có input/expected output; không báo “xong hệ thống” từ
   việc unit test/build xanh. Đồng bộ implementation/deploy là ticket riêng.

**Baseline A/B hiện hành để đối chiếu, không làm trust root production:**

- Caller audit A 55a4b60c80b1 / B 0dbf25756725; mỗi lượt 525 application migrations,
  permission_controls_verified, process exit 0; cleanup 14 objects, cleaned=true.
- Pre-init: 43532b7e7ec07d8764fae859fb77a50e9f03de0bdd7511ff4e9f7646fa615117.
- Initialized: c61528eb4241fb0448cd304535bb101b758546f04a24671ebcd5e0a50b53a5cb.
- Migration-set: 962030ea4b52db78f2001a22c531f258701c1836f80de23f3347c2a86e674095.
- Init-spec: 66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae.
- B.buildRepeatability.matched=true, cùng image lock; compose bundleHash khác
  do tên/path/credentials mỗi lượt. Lỗi assertion bundleHash là diagnostic ở
  lượt direct-write trước, đã được giải thích trong report lịch sử; không phải
  lỗi của lượt caller audit mới. Chưa có reproducible production bundle.
- Full control hiện hành 139/139; focused audit+graph 14/14 là subset.
  Source/log hashes, commands/exit/cleanup ở
  [caller report/artifact](roomqc-m06-callers-local-2026-10-20.md).
  FE focused 27/27/build+verify 378 assets là proof lượt direct-write trước,
  giữ tại [report lịch sử có phạm vi](roomqc-m06-access-local-2026-10-20.md).
- Runtime 11:03 +07: readyz direct/proxy 200/schema 0005. Image/signup=false là
  quan sát trước đó 10:34; readyz mới không trả flag nên không suy lại flag.
  Không sync implementation, migrate DB nghiệp vụ hoặc deploy trong lượt
  chuẩn bị kế hoạch. Test audit đã chạy được thu kết quả, không khởi chạy lại.
- Source liên quan thay thì tạo proof mới, không ép expected về schema 525 cũ.
  Hai fresh builds tuần tự không thay two-backend routing/isolation E2E.

### 24.15. Lệnh kiểm chứng khi bắt đầu triển khai

Lệnh dưới thực hiện trong integration, **chỉ sau review phạm vi/target**. Đây là
run sheet, không phải ghi nhận vừa chạy. Không dùng các script local đời cũ có
thể tự truy vấn/ghi business Supabase để thay sandbox owned đã kiểm.

```powershell
npm.cmd run test:control:db
npx.cmd vitest run src/hooks/useDistributionOrders.test.tsx src/hooks/useCreateDistributionFromSupplement.test.tsx src/lib/email-admin-authorization.test.ts src/lib/email-auth.test.ts src/lib/email-infrastructure.test.ts
npm.cmd run build
npm.cmd run verify:build
node scripts/test-control-backend-sandbox.mjs --help
```

Full vendor A dùng --run và --advisors-cli với absolute path native CLI 2.121.0
đã xác minh; B thêm --expected-build-state tới A completed/cleaned **cùng source**.
Không paste DSN/token vào command. Đọc --help hiện hành trước sử dụng flags;
thiếu native CLI không bỏ advisor gate. Các commands có thể cần Docker/resources,
nên không chạy hai full vendor fixtures chồng nhau khi máy không đủ headroom.

Trước deploy thường trực phải có ticket T18/T24 riêng: approved target/release,
backup/compatibility/rollback, migration credentials và phiếu gate. Lượt duyệt
plan không tự cho phép bật signup hoặc thao tác DNS/production.

### 24.16. Phiếu nhỏ sẵn sàng nhận việc — bắt đầu từ đúng phần chưa khép

Các mã R4-a/b/c, R3/R5/R6-a/b/R7 dưới đây chỉ là checklist con của T01–T08;
**không tăng 27 gói, 25 bước hoặc 70 acceptance**. Chốt đầu ra từng phiếu,
review rồi ghép theo thứ tự. BE chịu trách nhiệm source/data, QA review proof,
OPS review quyền/secrets/target; RoomQC duyệt chính sách và gate. Không giả định
đã có người/agent nhận việc. Những file có chữ “dự kiến” chưa tồn tại.

#### Phiếu R4-a — quyền gián tiếp và các lệnh nghiệp vụ chưa được phủ

**Input hiện hành:** [report+ledger](roomqc-m06-callers-local-2026-10-20.md),
628-file manifest/525 migrations, fresh A 55a4b60c80b1 / B 0dbf25756725,
139 control tests. Catalog 17 no-policy tables, 469 functions, 11 views,
149 triggers; graph có 25 candidate entry paths. Giữ direct-write/session
proof có phạm vi làm regression, không làm lại nền chỉ để tăng test count.

**Phần đã có:** catalog v2 và graph candidate đã được triển khai/kiểm chứng local;
ledger có metadata cho 17/17 target. **Chưa có:** semantic/runtime disposition đủ
mọi đường. Một đường do comment đã được giải thích; trigger email có lời gọi
thật. Không dùng số node/edge hoặc “không tìm thấy caller” làm bằng chứng safe.

**File làm việc:** scripts/control-backend-access-{audit,graph,checks}.mjs,
scripts/control-backend-actor-session-checks.mjs và sandbox runner;
server/control/backend-access-{audit,graph}.test.mjs; server/control/cluster.mjs,
app.mjs; src/pages/auth/Onboarding.tsx và src/lib/workspace.ts.
Forward migration/registration-check module/test mới là **dự kiến**;
tạo qua CLI và apply_patch theo quy tắc repository, không sửa migration đã áp.

**Lát việc nhận trước — khóa guard đăng ký, thuộc T08/T11:**

1. Ghi hợp đồng actor theo ba đường trước sửa:
   browser legacy complete_registration, control gateway /provision,
   service provision_workspace_registration/reconcile. Input do server chọn
   workspace/cluster/owner; form không chọn tenant/role/plan hoặc service identity.
2. Source gap cần đóng: wrapper legacy ở migration email 20261016072409:368
   chưa live-session/profile guard tương đương; service RPC :309 chưa đủ owner
   ban/lock/delete/inactive check; ClusterGateway.user :24 chỉ GoTrue /user +
   confirmed email. Đây là review source, **chưa tái hiện khai thác**, không kết
   luận đã có sự cố trên production.
3. Định nghĩa browser actor hợp lệ: Auth subject đúng owner, email đã xác minh,
   phiên còn tồn tại/hợp lệ theo helper hiện hành, tài khoản không ban/xóa,
   profile không khóa/xóa/inactive. Cho phép trạng thái unprovisioned/pending_setup
   hợp lệ; không mặc định owner mới phải đã có tenant/hotel mới được onboarding.
4. Định nghĩa service actor riêng: chỉ backend được phép gọi; kiểm owner live/
   eligibility, binding workspace và receipt ngay transaction provision.
   Worker đối soát không bị ép có interactive session của khách. Không lấy
   role từ user_metadata/p_fields, không fallback sang service_role cho browser.
5. Giữ directory_required chặn legacy bypass, invitation guard, verified email
   canonical, quota/trial policy server và receipt owner/workspace exclusivity.
   Đọc receipt không được tạo tenant; kết quả unavailable không thành missing.
6. Guard phải chạy trước mutation và replay nhạy cảm; đổi trạng thái tài khoản
   trong lúc xử lý phải được recheck/serialize tại commit phù hợp. Không giữ DB
   transaction/lock qua HTTP. Chốt lock order Auth owner/workspace/receipt để
   tránh đảo khóa với invitation/worker; audit denial không giả success.
7. Tạo forward migration và compatibility test cho impl/wrapper/service/gateway.
   RPC actor nếu cần là contract planned: chốt tên/signature/DTO/grants trước
   code caller; trả định danh tối thiểu, không trả hash/token/secret profile.
   HTTP errors map rõ login-required/forbidden/conflict/unavailable; không đổi
   toàn bộ lỗi thành “sai mật khẩu” hoặc “lỗi mạng”.

**Ma trận test bắt buộc cho lát đăng ký — fixture riêng, Auth/HTTP thật:**

| Nhóm | Thử gì | Expected/ảnh chụp trước–sau |
|---|---|---|
| Owner mới hợp lệ | pending_setup hoặc chưa có binding, email verified, session live | Một tenant/hotel/trial/receipt, owner mapping đúng; không mất quyền login |
| Idempotency | Replay cùng registration; hai request cùng owner/workspace | Cùng kết quả; không thêm tenant/trial/mail/job hoặc kéo dài expiry |
| Actor không hợp lệ | Anon, sai subject/owner, staff/invited account chưa hoàn tất | Deny đúng contract; không thêm/sửa provisioning/business/outbox |
| Auth không hợp lệ | Email unverified, Auth deleted/ban, session thiếu/revoked/không còn hợp lệ | Deny browser; positive control trước/sau; không coi timeout/404 là quyền deny |
| Profile không hợp lệ | locked/deleted/inactive và profile đã provision ở nơi khác | Không provision/replay mutation; eligibility phân biệt pending_setup |
| Directory/service | directory_required bật; browser gọi legacy; service hợp lệ/sai owner | Browser không bypass; service không phụ thuộc interactive session; receipt conflict không bị ghi đè |
| Thay trạng thái/race | Owner bị khóa hoặc version/binding đổi trước commit | Không commit dựa actor/binding cũ; conflict/retry có đường tiếp tục |
| Lỗi giữa các mốc | Remote commit rồi mất response; audit/local commit fail | Đối soát receipt, không tạo lại; API không quảng bá thành công khi chưa biết kết quả |
| Tương thích | Owner existing, staff invitation, reset/login, form local lẫn directory | Luồng hợp lệ vẫn dùng được; không tạo onboarding thứ hai |

Snapshot gồm counts/binding/version của users, tenant/hotel/subscription,
workspace receipt, registration jobs và email deliveries liên quan fixture.
Không dump dữ liệu khách thật hoặc function body vào report.
Security denial log có thể ghi theo chính sách; không yêu cầu xóa log để khẳng
định “no side effects”, chỉ cấm mutation nghiệp vụ/receipt success trái quyền.

**Lát kế tiếp — trigger email và các entry chưa phủ:**

1. Review public.users row policies/protected columns → queue_owner_workspace_ready
   → enqueue_roomqc_email → email_deliveries. Tên email/tenant/hotel lấy từ nguồn
   chuẩn, không để payload chọn destination/template/path tùy ý.
2. Positive: chủ verified/live provision đúng scope tạo một workspace-ready email.
   Denied: actor/profile không hợp lệ, sai tenant/hotel/email không tạo mail.
   Retry/update lặp không tạo bản gửi mới ngoài dedupe contract. Provider giữ tắt;
   kiểm queue bằng fixture metadata, không gửi mail tới người thật.
3. Mở rộng create/get quote và checkout draft, reconciliation read/mutate,
   monitor/recover lifecycle theo signature trong ledger. Mỗi root có allowed
   actor + denied owner/staff/cross-tenant + lock/delete/revoke/session.
   Platform user_roles và email profile.is_super_admin là hai authority hiện có;
   thử role-only/profile-only, không tự hợp nhất chính sách.
4. Nghiệp vụ distribution còn thiếu ngoài direct-write scope: state transition,
   inventory atomicity/cancel/warehouse và membership hotel. Những nhánh đã có
   176 checks giữ regression; chỉ claim nhánh có positive/negative/DB proof.
5. Mỗi kết luận gắn source/callsite, INVOKER/DEFINER/EXECUTE/search_path, predicate,
   output/side effect, test ID và disposition. Graph trigger grant chỉ là
   candidate; vẫn phải kiểm row policy và các side effect gián tiếp/FK.
6. Dismissal comment prevent_user_privilege_escalation→complete_registration
   ghi thủ công, giữ raw graph count 25. 25 dependency ngoài tập target không
   nghĩa object bị mất; generate_unique_code invoker/dynamic và monthly_expenses
   materialized view không được xử lý như một definer bypass/view thường.

**Bàn giao:** ledger 17/17 có source + review disposition + test hoặc pending cụ thể;
migration/caller tương thích nếu cần; log/expected-actual/hash/cleanup và defect
severity/owner/gate. Scope thiếu proof vẫn open, không đổi allSafe=true từ graph.

**Đóng lát đăng ký:** guard cả ba đường có positive/denial/no-business-side-effect/
race/idempotency proof trên source mới; browser legacy và directory đều không
bypass, service recovery vẫn hoạt động. Đây chưa đóng toàn R4/T08/D02/A09.

**Đóng R4-a:** mọi entry trong phạm vi gate có giải thích và proof cần thiết;
tiếp R4-b/R4-c rồi trusted artifact/runtime. Thiếu external key không chặn lát
này. Rollback local chỉ exact-owned fixture; runtime chính không bị migrate.
Source/schema đổi phải cập nhật manifest và fresh A/B/hồi quy theo R7.

#### Phiếu R4-b — semantics policy hiện hành

**Input:** 135 permissive WARN ở schema 525, không dùng 153/51 lịch sử.
**File:** audit/harness trên; migration mới nếu semantics thực sự sai.

1. Tính lại bảng × operation × effective role × policy OR/AND, USING/WITH CHECK,
   membership/hotel scope, view/definer và callsite; ghi policy đang bảo vệ gì.
2. Tạo bảng expected quyền từ hành vi sản phẩm, đối chiếu positive/negative giữa
   tenant/hotel và khi revoke/lock/delete. Chỉ việc gộp policy không được làm tăng
   quyền hoặc làm mất thao tác hợp lệ.
3. Đo query plan trên dataset xác định nếu cảnh báo chỉ là hiệu năng; không viết
   migration hàng loạt dựa trên số finding.
4. Triage từng nhóm: fixed+proof / intended+reason+review date / performance
   follow-up+operating constraint / unresolved-security. Không gọi toàn nhóm done
   nếu chỉ có nhánh notes/create được thử.

**Bàn giao:** current policy matrix + quyết định semantics + test/query evidence.
**Đóng:** không unresolved quyền/dữ liệu nghiêm trọng; performance được chuyển
T10/T23 chỉ khi có owner, giới hạn vận hành và tiêu chí đo, không bỏ khỏi plan.

#### Phiếu R4-c — tám FK và ghi nhận unused indexes đúng cách

**Input:** tám FK có tên ở advisor triage; dataset gần profile pilot.
**File:** fixture/performance harness dự kiến, audit report, migration nếu cần.

1. Đối chiếu FK columns, index leading columns/partial conditions và index trùng.
2. Ghi truy vấn đọc/join, invite/provision writes và parent update/delete thực tế;
   dùng EXPLAIN/ANALYZE có kiểm soát trong fixture, không trên DB khách đang dùng.
3. So trước/sau: rows, buffers, time, lock/wait, write cost/index size. DDL cần
   kế hoạch lock/timeout/upgrade, không suy ra an toàn từ DB rỗng.
4. Không xóa 490 unused-index INFO chỉ vì stats fresh; ghi rõ cần quan sát dài hơn.

**Bàn giao:** 8/8 có quyết định và evidence; migration có lợi ích được chứng minh
hoặc no-change có lý do. Sửa schema phải tái lập hash/A/B theo R7.

#### Phiếu R3/R5 — quyền installer và artifact có nguồn phê duyệt

**Phụ thuộc:** R4 chốt schema có thể làm candidate; không đợi VPS để test local.
**File:** release-manifest.mjs, probe-{credentials,session,secrets}.mjs và tests;
generator/issuer/installer/trust configuration là deliverable dự kiến.

1. Chốt release input schema: upstream+image digests, source/lock/functions/frontend,
   migration set, initialized schema/init-spec, contract, config schema và target
   compatibility. Tách phần bất biến khỏi run names/paths và secret values.
2. Operator/CI duyệt digest vào trust store độc lập, read-only với API/worker.
   Expected lấy từ artifact được duyệt, actual lấy từ target; không đổi expected
   tự động để khớp live drift. Không gọi artifact “signed” nếu mới chỉ pin digest.
3. Installer help/dry-run không ghi; verify trust/target/compatibility trước tạo
   hoặc rotate dedicated canary/probe. Runtime/migrator/issuer tách quyền.
4. Quy định access TTL/refresh, key version, KEK recovery và credential revoke/
   quarantine. Giữ lease/CAS local đã đạt; không yêu cầu khách tự giữ key.
5. Test thiếu approval/ref/key, tamper, unknown release, downgrade, sai target,
   synthetic fixture ở deploy mode; mọi nhánh dừng trước mutation.
6. Rehearsal empty install và upgrade consumer/schema compatibility trong fixture;
   giữ outbox/provider tắt. Bàn giao secret refs/version, không dump giá trị.

**Đóng:** artifact validator + installer/issuer + permission/trust tests đạt;
không suy local thành cấp quyền deploy VPS hoặc tự mở signup.

#### Phiếu R6-a — ghi health và credential revision nguyên tử

**Khoảng trống đã đọc source:** ProbeSessionManager.run kiểm assertCurrent trước
return, nhưng HealthStore.record hiện kiểm target, chưa khóa/recheck credential
revision ngay trong transaction ghi health. Đổi khóa ở giữa hai thời điểm có thể
làm ghi kết quả của revision cũ. Đây là gap source cần sửa trước nối runtime;
không phải kết luận production đã gặp sự cố.

**File:** telemetry.mjs, probe-credentials.mjs, probe-session.mjs, health-policy.mjs,
workers/health-worker.mjs; telemetry-binding/probe DB tests tương ứng.

1. Chốt evidence DTO không chứa secret: target binding, release, credential identity/
   revision và generation tương ứng; validate server, không nhận browser tự xác nhận.
2. Trong transaction ghi snapshot: khóa/recheck đúng metadata revision, trạng thái
   usable, binding và target; dùng lock/fencing tương thích với rotate/revoke/
   recover để không có cửa sổ check-then-write. Review lock order tránh deadlock.
3. Guard trước ghi health/admission/event; stale revision phải reject/rollback
   toàn bộ, không chỉ cảnh báo rồi commit healthy. Worker role chỉ được metadata
   cần dùng, không cấp quyền đọc ciphertext/refresh secret rộng để dễ kiểm.
4. DB race tests: pause sau probe return, rotate/revoke/recover/đổi target rồi
   resume record; không mẫu healthy cũ, event giả hoặc gỡ operator_reopen_required.
5. Positive current revision vẫn ghi được; hai worker, deadlock/timeout và crash
   rollback không làm generation/freshness lùi hoặc admission tự mở.

**Đóng:** race thật trên disposable PostgreSQL với runtime roles, before/after
rows và transaction outcome. Mock assertCurrent hoặc guard trước return chưa đủ.

#### Phiếu R6-b/R7 — nối gateway, runtime và đóng hồ sơ local tích hợp

**Phụ thuộc:** proof quyền, trusted artifact và R6-a đạt.
**File:** cluster.mjs, admin.mjs, app.mjs, telemetry.mjs,
workers/health-{config,runtime,worker}.mjs,
server/control/contracts/control-v3.openapi.json và runner/test hiện có.

1. Gateway gọi manifest contract mới bằng dedicated credential; chụp identity/
   ref/release/version trước HTTP và kiểm lại tại commit. Body/key legacy bị loại
   qua upgrade rehearsal, không deploy SQL mới trước consumer tương thích.
2. Entry worker tạo probe manager/source cho từng target; đủ Auth/REST/Storage/
   Realtime/Functions. Thiếu config/unknown/fault giữ fail-closed; không thay
   HEALTH_PROBES_UNCONFIGURED bằng fallback luôn đúng.
3. Check pool/timeouts/cancellation/concurrency/budget, redaction và shutdown;
   API/health/provision/issuer không chia sẻ credential rộng.
4. Khóa scope source, chạy focused/full DB suite, full vendor A mới rồi B từ
   completed A khi source liên quan đổi; advisors/permissions/fault/Janitor,
   frontend build+verify. Ghi **kết quả thực**, không đặt trước số test phải đạt.
5. Pipeline thật: warmup 5 phút, metric loss >120s, từng service fault/recovery,
   target/policy/credential race, API/worker restart, recovery 10 phút theo policy.
   Không fake clock thay bằng chứng elapsed time; scheduled soak vẫn gate staging.
6. Report+artifact có command/exit/source/image/schema/config refs/log SHA/cleanup;
   reviewer đối chiếu report với snapshot và các case A06/B02/C01/C04 liên quan.
   Đây là proof local một phần của 70 case, không tự nâng staging/pilot.

**Bàn giao sau phiếu này:** pipeline local integrated có evidence; chuyển T07
alert rồi T03/T09/T10 và T11–T25 theo run sheet tám đợt. Deployment thường trực
là ticket T18/T24 riêng. Không dừng toàn plan chỉ vì M06 đã kiểm chứng local.

<a id="registration-handoff"></a>

## 25. Handoff sau proof đăng ký local

Ngày 20/10/2026. Phần này cập nhật điểm nhận việc, không thay scope T01–T25,
27 gói P0–P8 hoặc 70 case. [Report/artifact registration](roomqc-m06-registration-local-2026-10-20.md)
chứng minh source 632 files/526 migrations: A 4317f0ce9c62 / B 0fe112b0e675
exit 0, same schema/migration/images/init-spec, cleanup 14 objects/lượt;
94 HTTP/Auth checks, 39 SQL denials/3 roots/13 states mỗi lượt, hai race thật.
Control 142/142; focused 7/7 là subset; build+verify local 378 assets đạt.
Bản 24.16 nói migration/harness registration “dự kiến” là lịch sử: code đó đã
được thêm và có proof có phạm vi, không nhận lại như chưa triển khai.

**Nhận tiếp R4-a, không mở runtime:**

1. Sửa **R4-AUTH-SOFT-DELETE / High**: fixture B/rollback đã xác nhận
   private.room_setup_owner và private.subscription_quote_actor vẫn cho qua sau
   auth.users.deleted_at. Phân biệt với public.users.deleted_at đã có guard.
   Rà platform/email/distribution root tương tự; chỉ claim nhánh có proof.
2. Tạo forward migration bằng CLI đã pin; không sửa migration 526 đã có proof,
   không áp business DB. Bổ sung Auth-deleted/null-state/wrong role và HTTP/SQL
   positive-before/deny/positive-after; giữ live session/tenant/hotel/receipt.
3. Trigger email workspace-ready đã có valid/dedupe proof qua provision; rà tiếp
   direct public.users trigger path, destination/callback scope và guard invalid
   account. Service-only RPC không chứng minh mọi trigger path đã an toàn.
4. Mở rộng create/get checkout draft, reconciliation read/mutate/monitor/recover;
   hoàn thiện disposition ledger 17/17, role-only/profile-only authority tests.
5. R4-b policy 135 WARN và R4-c tám FK như 24.16. Current advisors 649
   (17+8+489+135); unused INFO theo workload, không xóa index cho đẹp.
6. Sau sửa source: manifest mới, focused/full control, fresh A mới và B tham chiếu
   A completed/cleaned; report ghi expected/actual, hashes/cleanup. Không dùng
   registration source-526 proof làm proof schema/source mới.
7. Tiếp R3/R5 → R6-a transaction health check → R6-b/R7 → T07/T09/T10 → T11–T25.
   Không dừng toàn plan khi một lát backend đã local_verified.

Runtime 14:56 +07 direct/proxy readyz 200/schema 0005, signup=false theo inspect
đúng container, image không đổi. Source implementation chỉ integration; docs/
artifacts mirrored primary, primary index được bảo toàn. Không có deploy/mail thật/
DNS/public signup trong lượt này. Gates staging/pilot và 70 acceptance vẫn mở.

<a id="auth-soft-delete-handoff"></a>

## 26. Handoff sau proof Auth xóa mềm

[Report/artifact](roomqc-m06-auth-soft-delete-local-2026-10-20.md) là evidence
current source 633/527; 26 này nối tiếp 24/25, không thay 27 gói/25 bước/70 case.

1. High R4-AUTH-SOFT-DELETE đã local_verified cho năm guard; giữ 210 HTTP/44 SQL
   actor checks, registration 94 HTTP/39 SQL/two lock races làm regression.
   Không áp source mới vào runtime hay coi local_verified là production fix.
2. Tiếp R4-a trigger workspace-ready: kiểm fresh event thay vì mail dedupe đã
   tồn tại; actor/profile/Auth live/null-state, tenant-hotel/email destination,
   một outbox đúng. Provider tắt, chỉ fixture exact-owned.
3. Room complete và checkout/admin/reconciliation/lifecycle còn cần positive/
   negative/replay/race/no-side-effect đủ phạm vi; lập disposition 17/17 ledger.
   Auth-soft-delete read/save/quote/draft proof chưa đóng mọi nhánh này.
4. B advisors 646 (17+8+486+135), A không chạy advisors. R4-b 135 WARN semantics,
   R4-c tám FK workload còn mở; unused reduction không là index fix.
5. R3 issuer/R5 approved artifact → R6 atomic credential revision trong
   HealthStore.record + gateway/runtime → R7 full timed pipeline. Không bỏ
   transaction guard chỉ vì ProbeSessionManager.assertCurrent đã có.
6. T07 alerts → T03/T09/T10 authority/admission/budget → T11–T17 signup/reconcile/
   UI → T18–T25 Linux/offsite/restore/external alert/A-B/E2E/load/cutover/pilot.
7. Sau source liên quan đổi, source manifest + focused/full + fresh A/B mới;
   bật native advisors cho candidate R4 cuối. Không tái dùng 4e15… cho code mới.

Runtime read-only 15:24 +07: schema 0005, signup=false, image không đổi. Primary
index bảo toàn; chỉ docs/artifact được mirror, không sync implementation.
Lần B gọi path tương đối bị preflight từ chối trước tạo resource đã giữ log;
B absolute current exit 0 và cleanup zero. R4/T08/gates vẫn mở.

<a id="email-ready-handoff"></a>

## 27. Handoff trước mutation proof — email-ready và profile RLS

[Report/artifact](roomqc-m06-email-ready-local-2026-10-20.md) là baseline local
**637 files / 529 migrations**, source SHA256
`4f33e1b04bfd351373704054af04b8e5aecfd26fa89b39de886c5921ad75cfe8`.
A 95d9560fba65 / B 91373e6a5871 exit 0/cleaned; control 144/144; advisors
native cả hai 645=17+8+485+135. Primary chỉ docs/artifacts; không triển khai runtime.
633/527/142 ở mục 26 là lịch sử, không proof cho current tree.

1. Giữ hai forward migrations email-ready/profile policy và regression:
   fresh events/recipient/dedupe/rollback, first profile insert trước role,
   trusted service session-free, HTTP self/managed-staff update và protected deny.
   Banned fresh queue và 500/42P17 đã local_verified fix; không nhận lại như lỗi mở.
2. **Code kế tiếp:** caller room-complete/quote/checkout create/read/replay,
   platform/admin/lifecycle/reconcile/email-admin, distribution/membership;
   positive/negative/live actor/session/no-side-effect và race đúng contract.
3. Hoàn thiện 17-target disposition, 135 permissive-policy semantics và tám FK
   workload. Graph 1008/889/25 chỉ candidate, allSafe/transitiveReachability=false;
   không xóa unused indexes chỉ vì fresh statistics.
4. R3 issuer/R5 approval → R6 kiểm credential revision/state/binding ngay transaction
   HealthStore.record + gateway/runtime → R7 timed pipeline/current-source proof.
5. Sau đó alert/authority/admission/budget → signup/resume/receipt reconciliation/
   abuse → hai màn admin → Linux/TLS/offsite/restore/external alert → đồng thời
   A/B/browser E2E/load/cutover/RC → pilot ≥7 ngày. Giữ 27 gói/25 bước/70 case.
6. Worker hiện chỉ receipt_reconcile; missing → waiting_owner, không tự submit
   initial registration hoặc lưu JWT/password trong queue.
7. Source liên quan đổi phải chụp candidate/proof mới; hai sequential builds
   không thay T21 simultaneous routing hoặc Linux/provider/pilot.

Nhận việc theo [bảng điều hành mục 21](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-current)
và [phiếu điều phối mục 22](roomqc-vps-signup-deployment-plan-2026-10-20.md#launch-runbook).
Có file/actions/test/đạt/rollback, sáu bàn giao đợt đầu, các chặng tiếp, owner/
reviewer, journey khi lỗi, external checklist và cổng L/S/P/U/B.

Lượt cập nhật kế hoạch không sửa code/khởi chạy suite mới/deploy/đổi signup/DNS/
provider; chỉ tổng hợp proof đã chạy, nhận B hoàn tất và kiểm hash/cleanup.
Runtime 15:24 +07 schema 0005/signup=false là lịch sử chưa kiểm lại.

<a id="mutation-handoff"></a>

## 28. Handoff hiện hành sau proof chín root ghi

[Report/artifact](roomqc-m06-mutation-local-2026-10-20.md) xác nhận scoped source
**640 files/530 migrations**, SHA256
`fe82269a2737a0a7e654fca8cc0ffbc1ca86626e525ad60b7cab12aafdfe8274`.
Control 148/148; A 6eade27a974f / B f2025aa52f13 exit 0/cleaned, canonical/
migration/images/init-spec khớp; advisors cả hai 640=17+8+480+135.
480 là workload statistics, không index fix. Frontend build không chạy lại
ở lát backend-only; 378 assets trước đó giữ proof lịch sử.

**Scope đã local_verified:** live Auth/profile/required role/session tại chín
mutation roots; 162 matrix denials/29-table snapshots/15 race mỗi run, actual job
recovery/replay, logout/new login, không gia hạn trial khi reactivate, draft
vẫn non-payable. Run 124d3e7ce697 fail vì fixture đòi trial thay vì active đã
được chẩn đoán và sửa test; không nới nghiệp vụ, log fail giữ trong artifact.

**Phiếu nhận tiếp, không cần external key:**

1. R4-a: lấy catalog 530 làm input, giữ các proof đã đạt và hoàn thiện ledger
   17 targets. Source/callsite → effective grants/authority → private/table/
   trigger/implicit effects → positive/negative/race/test → disposition.
2. Nhận service lifecycle begin/batch/finish/outbox và email-admin status/test/
   retry/provider metadata. Không chạy các script local cũ trỏ business DB.
   Dùng exact-owned fixture; provider/sink nội bộ, không gửi email Internet.
3. Với email-admin, review authority ở Edge preflight và tại mutation transaction;
   thu hồi giữa hai mốc cần được tái hiện có before/after, không tự gắn defect
   chỉ từ source. Giữ authority email profile.is_super_admin khác platform
   user_roles; không âm thầm hợp nhất policy.
4. Giữ registration/email-ready/distribution/actor-session/nine-root regression.
   Chỉ thay graph allSafe/transitiveReachability khi có proof đủ contract;
   hiện vẫn false, không coi 25 candidate paths là 25 lỗ hổng.
5. R4-b 135 policy semantics + R4-c tám FK workload; không xóa 480 unused-index
   từ DB mới. Sau đó R3/R5 → R6 atomic health/gateway → R7 timed pipeline.
6. Vẫn phải alert/admission/budget → durable signup/resume/reconcile/abuse →
   admin UI → Linux/offsite/restore/external alert → A/B đồng thời/E2E/tải/RC →
   pilot ≥7 ngày. Giữ nguyên 27 gói/25 bước/70 case; chưa deploy hoặc nâng gate.

Hai rebuild A/B tuần tự không thay simultaneous multi-cluster E2E. Primary chỉ
nhận docs/artifacts; index không đổi. Runtime 0005/signup=false trước đây là
quan sát lịch sử, lượt implementation này không kiểm tra lại runtime phục vụ.

<a id="email-admin-handoff"></a>

## 29. Handoff hiện hành — email-admin local và kế hoạch nhận tiếp

[Report](roomqc-m06-email-admin-local-2026-10-21.md) /
[artifact](../../../artifacts/roomqc-m06-email-admin-local-2026-10-21.json):
scoped backend 643 files/531 migrations, SHA256
4334aef4f09c6f867346f8e4ca7c4a8a2408efdcf410f6536989b97538d7c493.
Control 152/152 và Vitest riêng 7/7; A dbbf929824ec / B 36a0835d1dc3 exit 0,
cleaned 15 mỗi lượt, identity khớp. 114 named checks/7 race mỗi run; advisors
cả hai 640=17+8+480+135. Hai rebuild tuần tự, không A/B đồng thời hoặc release pass.

Original-source race đã tái hiện session DELETE sau Edge preflight vẫn cho ba
action 200; wrapper transaction mới chặn 403, không business mutation. Email
authority vẫn profile.is_super_admin, không tự hợp nhất platform user_roles.
Proof đã lưu, không suite chạy lại trong lượt cập nhật plan.

**Nhận việc theo đúng phần chưa khép:**

1. [Run sheet chi tiết 24.7–24.12](roomqc-vps-signup-deployment-plan-2026-10-20.md#execution-checklist-2026-10-21):
   service lifecycle begin/batch/finish/outbox → queue/provider/webhook → final
   disposition 17 targets → 135 permissive semantics/tám FK workload.
2. Giữ registration/Auth-soft-delete/email-ready/distribution/nine-root/
   email-admin regression; không triển khai lại guard đã có proof như lỗi mới.
3. R3 issuer/R5 approved release → R6 atomic health → gateway/runtime R7,
   timed warmup/stale/recovery thật và current-source proof.
4. T07 alert → T03/T09/T10 capability/admission/budget → T11–T13 signup/private
   status/resume/receipt-reconcile/abuse → T14–T17 hai màn /super-admin API thật.
5. T18–T20 Linux/TLS/offsite/restore/external alert → T21–T24 A/B đồng thời/
   browser/Android/E2E/tải/cutover/RC → T25 pilot ≥7 ngày và quyết định gate riêng.

Giữ 27 gói/25 bước/70 case; sổ JSON thêm scoped implementation update, không
ghi đè snapshot đầu 640/530 và không biến releaseAcceptance thành verified.
Graph allSafe/transitiveReachabilityProven vẫn false. Frontend build chưa chạy
lại cho lát backend-only; runtime phục vụ/provider/flags chưa kiểm lại.

Kế hoạch mới đã chỉ rõ schema tái sử dụng, API implemented/partial/planned,
native setup-status allowlist gap, trạng thái workspace khác job/nextAction,
fault windows, trách nhiệm/gate/rollback, dự toán 30–47 ngày công có dự phòng.
Đây là kế hoạch chuẩn bị, không phê duyệt deploy/DNS/email thật/public/billing.
Primary chỉ nhận docs/artifacts đã lọc; không commit/reset/merge hoặc sửa index.

<a id="lifecycle-handoff"></a>

## 30. Handoff hiện hành — lifecycle A/B local đã đạt, nhận provider

[Report](roomqc-m06-lifecycle-local-2026-10-21.md) /
[artifact](../../../artifacts/roomqc-m06-lifecycle-local-2026-10-21.json):
source **647 files/531 migrations**, SHA256
0f14369ae81c0dcaad55a8b9548b1095ad7ed83ce933ac6cc530789f9aa857ab.
Control **154/154**, unit riêng **27/27**, focused 2/2 là subset. Fresh A
**41f2b3011bc6** / B **9b6a13ced16e** exit 0/cleaned 16 mỗi run, image/migration/
schema/init-spec/lifecycle eszip khớp. Docker label inventory sau chạy đều rỗng.

Mỗi run có 89 recorded checks/82 nhãn, 14-table snapshots, hai row-lock race
timeline và các concurrent replay/worker controls; actual Edge xử lý 105
transitions và thông báo in-app. Bốn bảng tài chính mỗi bảng có hàng mẫu thực
được owner tạo qua non-payable quote/draft RPC, không thay đổi sau lifecycle.
Recovery dùng RPC sản phẩm có live admin authority/receipt/replay, không dùng
fixtureClose SQL adapter. Trigger grace nguyên vẹn; fixture đã sửa và có assert
postcondition. Không nhận lại fixture/grace như lỗi chưa khép.

Advisors cả hai **634=17+8+474+135**; unused-index giảm theo workload, không phải
index fix. allSafe/transitiveReachabilityProven vẫn false. Đây không đóng R4-a
tổng/R4/T08, R6/R7 hoặc gate release. Hai rebuild tuần tự không thay A/B đồng thời.

**Điểm nhận tiếp:** [provider handoff](roomqc-m06-lifecycle-local-2026-10-21.md#provider-handoff)
và [phiếu 16 mục](roomqc-vps-signup-launch-checklist-2026-10-21.md).

1. Actual Edge queue/provider/webhook trên fixture signing key/sink internal;
   không Resend thật, scheduler, default Mailpit business URL hoặc Internet egress.
2. Tái hiện same event ID/different provider-or-type; chưa gọi hypothesis từ
   source là exploit/defect confirmed. Nếu fix, phân tích lock order
   finish-delivery → record-event, tránh thêm event → delivery lock inversion.
3. 17-target disposition → 135 policy semantics/tám FK → R3 issuer/R5 trust →
   atomic health/gateway/runtime R6/R7; giữ lifecycle và các guard đã đạt hồi quy.
4. Tiếp đầy đủ alert/admission/budget, signup/resume/reconcile/abuse, admin UI,
   Linux/TLS/offsite/external alert, A/B đồng thời/E2E/Android/load/RC/pilot.

Primary chỉ mirror docs/artifacts; index không đổi, không sync implementation,
deploy hoặc mở public/billing. Giữ 27/25/70; release case chưa có signoff không
được nâng verified từ bộ assertions local.
