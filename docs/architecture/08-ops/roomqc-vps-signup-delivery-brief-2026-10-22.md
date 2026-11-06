# RoomQC — kế hoạch bàn giao toàn bộ VPS và đăng ký tự động

Cập nhật 27/10/2026, Asia/Bangkok. **Phạm vi: toàn bộ VPS + signup. Đầu ra: plan + bộ nghiệm thu.**

Mục tiêu: khách đăng ký là có không gian sử dụng; RoomQC lo máy chủ, dữ liệu,
gói dịch vụ, sao lưu và hỗ trợ. Giữ nguyên **8 đợt, 27 gói, 25 phiếu T01–T25,
70 ca A01–G08**. Bản này là cửa vào điều hành; [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md)
giữ file đầu vào, bước thực hiện và cách phục hồi cho từng T.

**Hiện trạng đã đối chiếu:** có bản nháp migration577, fixture và diagnostic;
source có phạm vi1022file/backend198. Runner chưa nối hai chế độ kiểm mới;
chưa có native policy/upgrade576→577 hoặc hồi quy của bản nháp. [Baseline1019](roomqc-advice-policy-baseline-local-2026-10-27.md)
giữ14test,7đạt/7chưađạt,exit1; chưa có proof sau sửa.
Nhận [phiếu19.38](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1938-phiếu-bắt-đầu-và-bàn-giao-plan--nghiệm-thu)
theo [contract](roomqc-advice-policy-command-contract-2026-10-27.md),rồi client/
UI/freshness/retention/abuse/thiết bị và tám đợt. Ma trận Edge1018,UTC/upgrade1017,
frontend1014 giữ đúng nguồn,không rerun. Advisors737 chưa disposition.
Sản phẩm chưa nghiệm thu: **70 ca not_run,122 mục unverified**,reviewer/gates
giữ nguyên. Chưa full/rebuild/browser/Android/deploy;không mirror implementation.

| Tài liệu | Dùng để làm gì |
|---|---|
| [25 phiếu triển khai](roomqc-vps-signup-detailed-delivery-2026-10-26.md) | Giao việc, đọc file/bước làm/dependency/đầu ra/rollback |
| [Kiến trúc và policy](roomqc-vps-signup-plan-current-2026-10-26.md) | Kiểm data boundary, API, resource và vận hành |
| [Worksheet 70 ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) | Ghi expected/actual theo đúng môi trường |
| [Quy trình nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md) | Tập hợp evidence, review và ký gate |
| [Ledger gốc](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json) | Nguồn chuẩn của dependency, package, case và trạng thái phát hành |
| [Tiến độ hiện hành](roomqc-vps-signup-progress.md) | Nhận đúng việc tiếp theo, phân biệt proof với bản nháp |

## 1. Mô hình cần xây dựng

### 1.1. Máy chủ và nơi lưu dữ liệu

RoomQC chuẩn bị nhiều cụm VPS có sẵn. Mỗi cụm phục vụ các workspace được gắn
vào đó; từng workspace có dữ liệu và quyền tenant riêng. **V1 không tự tạo một
bộ Docker/Supabase đầy đủ cho từng khách sạn.** Gói cần cách ly hạ tầng riêng
có thể gắn một cụm riêng sau khi kiểm budget và quy trình tương ứng.

| Thành phần | Trách nhiệm | Ranh giới bắt buộc |
|---|---|---|
| Website/web/Android | Đăng ký, xác minh, xem tiến độ, dùng đúng workspace | Không giữ service key, không tự chọn cụm hoặc tenant |
| Control API + directory | Registry, giữ suất, mapping, job, command/result, gói và audit | Metadata điều phối; tách dữ liệu nghiệp vụ và quyền platform |
| Cụm nghiệp vụ A/B | Auth, Database, Storage, Realtime, Functions | Key/token/data riêng theo cụm; server kiểm tenant/hotel/quyền hiện thời |
| Worker | Health, alerts, đối soát và tác vụ nền | Lease/fencing/deadline; không lưu JWT/mật khẩu chủ để giả danh |
| Kho offsite + on-call | Phục hồi và xử lý khi mất host | Ngoài failure domain; có restore thật và người nhận alert |

Khách đã gắn A vẫn ở A khi A đầy/drain/down. Thêm B dành cho khách mới hợp lệ;
không tự chuyển khách cũ khi lỗi mạng. Chuyển dữ liệu liên cụm là quy trình khác.
V1 có trial/gói/quota/vòng đời; thu tiền tự động, tự mua VPS, HA đa vùng và SSO
xuyên cụm chưa thuộc phạm vi này.

### 1.2. Một khách đăng ký thành công phải đạt gì

| Bước | Khách thấy | Server phải ghi/kiểm | Khi gián đoạn |
|---|---|---|---|
| 1. Bắt đầu | Form ngắn, báo thiếu suất rõ | Validate/abuse; intent + reservation + binding ổn định | Replay giữ intent/cụm/expiry |
| 2. Tài khoản và xác minh | Email xác minh, resend có hạn mức | Auth đúng cụm, callback đúng origin; chưa verify chưa cấp business data | F5/relogin vẫn tiếp đúng cụm |
| 3. Khách sạn | Form thông tin cần thiết | Owner/session sống; IDs/role/trial/quota do server quyết định | Giữ draft; field errors rõ |
| 4. Cấp workspace | Tiến độ và nextAction | Job/dispatch lưu trước network; đúng một tenant/hotel/profile/trial/receipt | Unknown phải lookup/reconcile trước lệnh mới |
| 5. Vào sử dụng | Tạo phòng, mời staff, phân quyền | Mời/nhận lời mời đúng người, hotel và quyền | Reload/hai tab không cấp thêm hoặc reset trial |
| 6. Quản lý gói | Ngày hết hạn, usage, giới hạn | Enforce server theo policy version | Hết hạn/hạ gói không tự xóa dữ liệu |

Tiến độ phân biệt cần xác minh, chờ chủ bổ sung, đang xử lý, thử lại sau,
cần RoomQC đối soát và sẵn sàng; map sang enum/DTO hiện có trước khi coding.
HTTP 202 là đã nhận việc. Timeout/not_found chưa chứng minh lệnh chưa commit.

### 1.3. Hai màn quản trị phải dùng được

| Route dự kiến, chưa nối | Nội dung ưu tiên | Đường thao tác |
|---|---|---|
| /super-admin/infrastructure | Cụm có nhận khách không, lý do, resource/queue, backup và alert | List → detail → close/drain/open/limit → kết quả; alert → ack; backup → proof |
| /super-admin/registrations | Khách ở bước nào, đã cấp data chưa, ai cần làm gì | Search/filter → detail/timeline → tenant-summary → recheck → completion |

Dùng một menu chính, màu thông dụng có tương phản, trạng thái có chữ. Back giữ
filter/scroll; trang mới lên đầu. Đủ loading/empty/stale/error/denied/unknown.
Quyền platform tách quyền owner/staff; support không giả danh chủ, sửa receipt
hoặc bấm tạo lại tenant. Mọi chức năng đều có đường click từ list/detail.

## 2. Điểm xuất phát và phần thực sự chưa hoàn tất

**Mốc nhận việc:** bản nháp577/source1022/backend198, chưa kiểm chứng SQL/runtime.
[Policy baseline1019](roomqc-advice-policy-baseline-local-2026-10-27.md) là bằng
chứng trước sửa:14test,7finding đang mở. Số577 là số file migration trên đĩa,
không xác nhận DB đang phục vụ đã nâng cấp. Không kế thừa full-control hoặc
nghiệm thu thiết bị từ bản cũ; current và populated upgrade là bước bắt buộc.

[Upgrade566→572](roomqc-report-upgrade-local-2026-10-27.md),
[advice upgrade1007](roomqc-advice-upgrade-local-2026-10-27.md) và
[interruption1008](roomqc-advice-interruption-local-2026-10-27.md) là lịch sử
cần giữ. Phiếu12.5, UTC mô phỏng và Edge matrix giữ proof local; nhận sửa baseline policy ở
[19.38](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1938-phiếu-bắt-đầu-và-bàn-giao-plan--nghiệm-thu),
rồi hoàn thành nền và các đợt còn lại.

| Phần | Đã có | Còn phải bàn giao |
|---|---|---|
| Directory/registry/quyền/command | Implementation + scoped proof lịch sử | Delta Q02/Q03, tích hợp/freeze và nghiệm thu cùng candidate |
| Signup | Intent/bootstrap/provision và support lookup/reconcile | Private setup-status/resume, durable jobs, abuse và journey hoàn chỉnh |
| API | Nền contract/handler | 6 operation planned + 1 partial ở mục4.2; nối client/UI và proof |
| Console | Super-admin hiện hữu và đặc tả | Hai route/menu, pages, typed client, API/UX thực |
| VPS/vận hành | Fixture và runbooks local | Linux/TLS, offsite restore, alert ngoài host, A/B, E2E/tải/pilot |

Advisors737 ở workload baseline1019 còn cần disposition từng object/đường dùng.
Direct ACL39 bảng không thay kiểm quyền gián tiếp. Rà contract/handler xác nhận
23 operation, trong đó 6 planned và 1 partial; hai route mới chưa được nối.
Limiter memory theo socket IP cần thay trong T13. Số test/finding không phải
phần trăm hoàn thành hoặc sức chứa production.

## 3. Tám đợt triển khai

| Đợt | Phiếu | Demo phải bàn giao | Điều kiện nhận |
|---|---|---|---|
| 1. Nền tích hợp | T01–T06,T08 | Quyền/command/report/workflow và health cùng candidate | Q02→Q03→Q04; source/schema/runtime, full/default-full/rebuild; A/B/C liên quan |
| 2. Cảnh báo | T07 | Lỗi → incident → gửi → ack → phục hồi → reopen | B08–B09; restart/mất response không mất việc, staging có người nhận ngoài host |
| 3. Suất và budget | T09,T10 | 20 intent tranh một suất; tenant nặng không làm tenant khác mất dịch vụ | C05–C10, config budget; G05/G06 khép sau T23 |
| 4. Đăng ký dùng ngay | T11–T13 | Signup → verify → hotel → ready; reload/restart tiếp đúng bước | D01–D15; một tenant/hotel/trial, scope/revoke/abuse và email Internet đúng môi trường |
| 5. Hai console | T14–T17 | Quản lý hạ tầng và tìm/xử lý ca đăng ký kẹt | E01–E08; API thật, 1.000 metadata, tìm ca dưới30s, Back/keyboard/mobile |
| 6. Vận hành VPS | T18–T20 | Cài Linux, reboot/upgrade, cắt host rồi restore sạch | F01–F09; TLS/private ports, data/file bytes/RPO/RTO và on-call |
| 7. RC tích hợp | T21–T24 | A/B đồng thời, web/Android, tải/soak, cutover/rollback | G01–G07 và linked cases; limits/cost có số đo, không Critical/High chặn |
| 8. Pilot | T25 | Khách sạn nội bộ rồi cohort được duyệt; báo cáo vận hành | G08 ≥7ngày có số đo/drill; đề nghị mở public riêng |

Dependency chính xác nằm dưới đây và trong ledger; số đợt không thay dependency.
T14 có thể chuẩn bị sau T03/T04, bundle T18 sau T06/T08; nghiệm thu từng T vẫn
cần đủ môi trường và input, không lấy mock thay màn vận hành thật.

### Bài demo bắt buộc theo đầu ra

Mỗi T có [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md) gồm file đầu vào, các bước thực hiện,
đầu ra/rollback. Bảng giao việc này chép dependency/case từ ledger, bổ sung đầu
ra có thể demo. BE: backend; FE: giao diện; OPS: hạ tầng; QA: kiểm thử; RQ: RoomQC.
Tên người nhận và reviewer thực tế chưa được chỉ định; vai trò không phải chữ ký.

| T | Thực hiện → review | Dependency | Đầu ra nhận | Ca gốc |
|---|---|---|---|---|
| T01 | BE/OPS → QA | — | Manifest source/image/schema/config, fixture A/B và ownership/cleanup. | A01, A02, A03 |
| T02 | BE/OPS → QA | T01 | Migration empty/populated, checksum, hai migrator, restart và runtime ít quyền. | A04, A05, A06, A07 |
| T03 | BE → QA/OPS | T01, T02 | Quyền sống, command/version, mutation + audit + receipt atomic; replay/recovery. | A08, A09, A10, A11 |
| T04 | BE/FE → QA | T01 | OpenAPI ↔ handler ↔ client/UI khớp; lỗi, scope, deadline, lookup sau mất response. | A03, A08, A09, A10, A11 |
| T05 | OPS/BE → QA | T01, T04 | CPU/RAM/disk/inode/IO/DB/queue đúng host; probe đủ 5 dịch vụ và timestamp. | B01, B02, B03 |
| T06 | BE/OPS → QA | T02, T05, T08 | Health atomic, expiry/warmup/latch; full pipeline và rebuild cùng candidate. | B04, B05, B06, B07 |
| T07 | BE/OPS → QA | T06 | Incident/outbox/dispatcher, ack/resolve/reopen và người nhận ngoài host. | B08, B09 |
| T08 | BE/OPS → QA | T02, T03, T04 | Registry/issuer/trust; đường quyền gián tiếp và disposition từng advisor. | A06, B02, C01, C02, C03, C04 |
| T09 | BE → QA/OPS | T06, T07, T08 | Decision + reservation atomic; 20 intent tranh 1 suất; close/expiry/dispatch race. | C05, C06, C07, C08, C09, C10 |
| T10 | BE/OPS → QA | T09 | Budget pool/queue/RAM/IO theo cụm; quota gói phía server và chống noisy tenant. | G05, G06 |
| T11 | BE/FE → QA | T03, T04, T09, T10 | Signup → verify → hotel → tiến độ riêng tư → sử dụng; F5/relogin giữ đúng cụm. | D01, D02, D03, D04, D05, D06, A03 |
| T12 | BE → QA/OPS | T11 | Job/lease/fencing/receipt; kill/restart/reconcile và backfill không tạo trùng. | D07, D08, D09, D10, D11, A07 |
| T13 | BE/OPS/FE → QA | T11, T12 | Limiter dùng chung, proxy/abuse, direct Auth gate, email/callback/webhook. | D12, D13, D14, D15 |
| T14 | FE/BE → QA | T03, T04 | Hai route/menu, typed client, platform guard và cache/pending theo phiên. | A03, E08 |
| T15 | FE/BE → QA/RQ | T06, T07, T09, T14 | Màn Hạ tầng: resource/reason/backup/alerts, command dialog và recovery. | E03, E04, E05 |
| T16 | FE/BE → QA/RQ | T12, T14 | Màn Đăng ký mới: search/cursor/timeline, tenant-summary và durable recheck. | E01, E02, E05, E08 |
| T17 | FE/QA → RQ | T13, T15, T16 | Back/filter/scroll, tương phản, keyboard/390px/200% zoom và mọi trạng thái lỗi. | E01, E02, E03, E04, E05, E06, E07, E08 |
| T18 | OPS/BE → QA | T06, T08 | Linux preflight → install → rerun → reboot → upgrade/rollback; TLS/private ports. | F01, F02, F03, F04, B01 |
| T19 | OPS → QA/RQ | T12, T18 | Backup directory + DB/Auth + object bytes; offsite readback và restore host sạch. | F05, F06, F07, F08 |
| T20 | OPS → QA/RQ | T07, T18, T19 | Runbook, người trực chính/phụ, killswitch và diễn tập host mất kết nối. | B09, F09 |
| T21 | QA/BE/OPS → QA | T12, T13, T18 | A/B chạy đồng thời, cùng UUID khác dữ liệu, token/routing/cache cách ly. | G01, G02, G03 |
| T22 | QA/FE/BE → QA | T17, T21 | Browser + Android đi trọn hành trình, offline/Back/deep-link/keyboard và fault. | A03, A08, A09, A10, A11, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, E01, E02, E03, E04, E05, E06, E07, E08, G01, G02, G03, G07 |
| T23 | QA/OPS → BE/RQ | T10, T21, T22 | Ramp/soak, backup/report cùng tải; latency/errors/cost và operating limit. | G04, G05, G06 |
| T24 | QA/OPS → BE/FE/RQ | T19, T20, T22, T23 | RC freeze, kiểm pre-pilot cases, cutover/rollback và packet đề nghị pilot. | G07 |
| T25 | OPS/RQ → QA | T24 | Pilot ≥ 7 ngày có số đo/drill; báo cáo go/no-go và đề nghị mở có giới hạn. | G08 |

## 4. Việc nhận ngay và cách chuyển bước

### 4.1. Khép nền đang làm, giữ phạm vi hữu hạn

Nhận [mục19.38 của phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1938-phiếu-bắt-đầu-và-bàn-giao-plan--nghiệm-thu).
Giữ hồi quy phần đã có proof; không giao lại target transport/upgrade566→572.

| Thứ tự | Việc thực hiện | Tiêu chí bàn giao |
|---|---|---|
| 1. Advice local | Baseline1019 có7finding chưa có proof sau sửa; review bản nháp577, sửa receipt barrier và nối runner theo19.38; sau đó control/client/UI/freshness/retention/abuse/thiết bị | Đóng service-only config; command/live authority/CAS/cancel/clock và populated upgrade có proof. Không xóa fence/hoàn quota/resend hoặc dùng54 quan sát1018 thay policy mới |
| 2. Mobile money + export | Inventory cash/debt/forecast và mọi generic PDF/Excel/CSV caller; fresh scoped source, epoch/recheck trước dựng/lưu | Cọc/refund/no-show/group/transfer đúng nghĩa; render file thật đúng font/kỳ/tổng; browser/Android proof riêng |
| 3. Q02 writer còn lại | Cancel/refund, trả trước, staged quote/payment/group/transfer flags, correction/retention, RW6–RW8 | Caller → authority → transaction/source → receipt → recovery đầy đủ; fault/race/replay, không bỏ đường ghi active |
| 4. Q03 | Workflow config/event/action/dispatcher/recipient/offboarding/legacy; indirect paths/advisors | Đóng browser vẫn chạy đúng; revoke chặn; disposition từng finding có lý do/reviewer/regression |
| 5. Q04 | Freeze delta cuối, upgrade/compatibility; focused + full-control + default-full + rebuild độc lập | Cùng source/schema/runtime/render, native exits và cleanup; giữ failed history; review packet rồi nhận T07 |

Đơn vị quota advice là giới hạn nội bộ đề xuất, chưa phải số tiền provider.
Source snapshot phải có phạm vi và độ mới; thiếu entitlement/source phải deny,
không giả0. Kết quả provider chưa rõ giữ unknown, không hứa exactly-once ngoài
contract provider. Caller1006, populated upgrade1007 và kill giữa I/O1008 có
proof theo báo cáo gốc; closure1014 giữ quota và UTCmôphỏng1017 đã đạt.
Full Edge matrix đã đạt1018. Midnight thực,policy/retention và thiết bị còn mở.

### 4.2. Các API còn phải hoàn tất và nối đường click

Base /api/control. OpenAPI/handler/client/UI thống nhất DTO/version/error/cursor;
không thêm một đường cấp tenant song song. Nhãn dưới là hiện trạng contract.

| Operation | T | Việc còn thiếu |
|---|---|---|
| GET /workspaces/{slug}/setup-status — planned | T11 | Owner-only, no-store, step/nextAction/retryAfter; không lộ job riêng tư qua bootstrap |
| GET /admin/alerts — planned | T07,T15 | Live platform capability, filter/cursor/severity/lifecycle/time |
| POST /admin/alerts/{id}/acknowledge — planned | T07,T15 | Key/version/reason; mutation/audit/receipt atomic; ack khác resolve |
| GET /admin/backups — planned | T15,T19 | Checkpoint/age; uploaded/readback/restore-verified khác nhau; không key/DSN |
| GET /admin/workspaces/{id}/tenant-summary — planned | T16 | Đúng cụm/routing version; timeout, unavailable khác missing |
| POST /admin/workspaces/{id}/recheck — planned | T12,T16 | Enqueue idempotent, trả job/accepted; đọc completion riêng |
| POST /admin/clusters/{id}/commands — partial-local | T09,T15 | Close/drain/open/limit, impact/capability/version/reason/key + result recovery |

### 4.3. Chuỗi thực hiện sau nền

**T07 → T09/T10 → T11–T13 → T14–T17 → T18–T20 → T21–T24 → T25**, theo
dependency từng T ở mục3. Mỗi lần bàn giao ghi phần đã khép và việc nhận tiếp;
không mở vòng rà nền mới khi không có delta/failure hoặc concern cụ thể.

### 4.4. Phiếu nhận đầu tiên — chuyển giao diện mục tiêu sang API đã kiểm

Phiếu lịch sử này đã có scoped proof ở990–993: client/form, terminal cancellation,
TCP-loss/process restart và upgrade566→572. Contract/steps còn trong phiếu chi
tiết19.23–19.27. Browser/Android/binary rollback chưa đạt; chỉ nhận phần thiếu,
không coi còn phải xây lại target API hoặc chạy lại toàn lát đã kiểm.

## 5. Nghiệm thu thế nào để tránh báo hoàn tất sớm

### 5.1. Bộ 70 ca giữ nguyên

| Nhóm | Số ca | Nội dung |
|---|---|---|
| A01–A11 | 11 | Nền, quyền, contract, receipt và recovery |
| B01–B09 | 9 | Metrics, health, cảnh báo và mất host |
| C01–C10 | 10 | Registry/trust, admission, reservation và binding |
| D01–D15 | 15 | Signup, resume, jobs, abuse và email |
| E01–E08 | 8 | Hai console, thao tác và quyền |
| F01–F09 | 9 | Linux/TLS, upgrade, backup/restore, on-call |
| G01–G08 | 8 | A/B, E2E, tải, RC và pilot |

54 ca cần local, 69 cần staging, 1 cần pilot; các tập chồng nhau. Mỗi ca cần đủ
requiredEnvironments trong worksheet. Thêm controls không tự thêm case hoặc
chuyển not_run thành pass; không ký từ screenshot/toast/HTTP202/tổng unit tests.

### 5.2. Dữ liệu và cách chạy

Fixture sở hữu riêng: tenant A/B; owner verified/unverified; staff đủ/thiếu/revoked
quyền và assigned/unassigned hotel; operator read-only/write; 1.000 metadata đủ
state; một cụm còn một suất; booking/payment/refund/files liên kết; same UUID
giữa hai cụm nhưng khác data. Không dùng tài khoản/dữ liệu khách thật.

Mỗi case: prepare → positive → denial không effects → fault/race → recovery.
Đối chiếu UI/HTTP + database + audit + receipt + số effects. Ví dụ20intent/1suất:
đúng1accepted/19NO_CAPACITY;20replay cùng intent không tăng allocated hoặc expiry.
Ví dụ mất response sau provision: restart/lookup trả tenant/trial/receipt gốc,
không thêm hotel hoặc gia hạn trial. Thu hồi quyền khi đang chờ phải có barrier,
không chỉ gọi tuần tự trước/sau.

Mỗi hồ sơ ghi T/package/case/environment, source/image/schema/config, actor matrix,
fixture/expected/actual, command/time/exit, fault window, effect counts, cleanup,
defect/giới hạn, người chạy/reviewer và quyết định. Token/DSN/PII không vào báo cáo.
Mẫu chuẩn và worksheet dùng hai tài liệu đã liên kết ở đầu trang, không tạo bộ ký mới.

### 5.3. Ngưỡng cần review trước chạy staging

| Số đo | Đề xuất để chốt, chưa phải SLA hay kết quả | Cách đo |
|---|---|---|
| Setup-status | p95 ≤500ms | Client/proxy thật, có timeout/error trong báo cáo |
| Admin list / reserve | p95 ≤1s | 1.000 metadata, tính pool/lock wait |
| Provision | p95 ≤10s, tách thời gian người dùng/email | Queue → durable receipt + mapping ready |
| Tải bền | Ramp10→25→50→100 phiên; soak≥60phút | Mix read/write/signup/upload/report/Realtime/backup/noisy tenant |
| Phục hồi | RPO≤24h, RTO≤4h | Cắt host, restore sạch, kiểm data và object bytes |
| Alert | Detect≤180s, received ngoài host≤300s | Fault/detected/received/ack/recovery timestamp |

Trước run điền exact VPS profile, error budget, pool/RAM/IO/disk/inode headroom,
queue age, workload/cost và stop thresholds. Thiếu số này chưa ký capacity.
Sai quyền/mất data/tạo trùng/restore lệch là lỗi chặn dù latency đạt. T23 giao
max-tested và operating limit thấp hơn có dự phòng; chưa có bằng chứng100.000
người đồng thời. Mục tiêu1.000khách sạn đạt bằng mở cụm theo số đo, không nhân tuyến tính.

## 6. Điều kiện phát hành và đầu vào làm sau

### 6.1. Các cổng quyết định

| Gate | Điều kiện đề nghị | Phạm vi |
|---|---|---|
| L | Q02/Q03/Q04 + delta quyền/health và packet cùng candidate được review | Local tích hợp |
| S | Exact host/release, Linux/TLS/private network, input cases và backup/rollback | Staging |
| P | T24 đủ pre-pilot; offsite restore/on-call/killswitch, không Critical/High chặn | Cohort pilot được duyệt; G08 chờ actual |
| U | T25/G08≥7ngày, capacity/abuse/cost/support review | Public signup có giới hạn, quyết định riêng |
| B | Provider/payment/security/business acceptance riêng | Thu tiền thật ngoài V1 |

Gate, người ký và thời gian ký hiện giữ nguyên. Duyệt kế hoạch chưa mở các gate.

### 6.2. Đầu vào cần chuẩn bị, không gửi secret trong chat

| Đầu vào / người cung cấp | Cần trước | Làm local trong lúc chờ |
|---|---|---|
| VPS exact host/OS/CPU/RAM/disk/mount/ports và deploy scope — RQ/OPS | T05/T18/T23 external proof | Preflight/bundle/fixture/budget tham số |
| roomqc.com, app/API/admin/callback/native origins, DNS/TLS — quản DNS/OPS | T13/T18/T22 | Template/allowlist thử |
| Provider/sender verified/webhook/inbox — quản email | D15 | Outbox/sink/retry/security; mở Resend chưa là proof gửi/nhận |
| Offsite store/retention/key custody ngoài host — OPS/RQ | T19 | Consistent manifest/checksum/disposable restore |
| Alert receiver ngoài host, trực chính/phụ/escalation — OPS/RQ | B09/T20/P | Lifecycle/dispatcher/sink/runbook |
| Trial/seat/room/storage/grace/suspend/retention/export policy có version — RQ | T10/T11/T13/cutover | Contract/fixture tham số; không tự áp gói mới vào khách thật |
| SLO/RPO/RTO/headroom/stop thresholds — RQ/OPS/QA | T19/T23/P | Instrument cách đo và dự thảo ngưỡng |
| Người nhận việc/reviewer/release owner/cohort/giờ hỗ trợ — RQ | Nhận T và gate tương ứng | Packet, để signoff trống |

Theo chỉ dẫn đã có, input cần khóa/quyền thiếu được gom làm sau; chỉ hoãn phần
phụ thuộc, tiếp local độc lập. Dùng secret reference/kho vận hành; không chép
API key/mật khẩu/SSH key vào chat hoặc tài liệu.

### 6.3. Dừng và phục hồi

Sai target/quyền, lặp/mất data, tạo lại unknown commit, checksum drift hoặc resource
critical/restore sai: dừng tác động/đóng nhận mới theo runbook; giữ mapping/data/
receipt/evidence khách cũ. Lookup/reconcile trước retry. Reopen là lệnh riêng.
Rollback code phải tương thích schema tiến tới; không reset DB, sửa migration
lịch sử hoặc xóa job/receipt/trial. Binary cũ không tương thích thì chặn rollback
đó, đóng tính năng mới và forward fix có kiểm chứng.

## 7. Lập lịch và báo cáo bàn giao

Nhận bản nháp policy theo19.38; sau mỗi lát bàn giao có expected/actual, failed
history, source/cleanup và việc tiếp theo. Khép Q02→Q03→Q04 rồi chuyển T07;
không để việc nền chiếm vô hạn các phần signup/console/VPS còn thiếu.

Chưa đủ inventory để chốt số ngày còn lại. Dự toán30–47ngày công/36–57có dự phòng
là lịch sử toàn backlog, không phải thời gian từ hôm nay. Khi bắt đầu từng T:
ghi người nhận/reviewer, khối lượng delta, estimate và external wait; cuối T cập
nhật actual và estimate T kế. T25 có ít nhất7ngày lịch, ngoài thời gian triển khai.

**Plan được bàn giao khi:**25T đúng dependency, đủ file/bước làm/đầu ra/rollback,
70case đúng môi trường, policy/input/gate rõ và liên kết kiểm được. **Sản phẩm
hoàn tất khi:** implementation, evidence, review và gate tương ứng thật sự đạt.
Baseline1019 đã tái hiện7finding policy trên fixture riêng; bản nháp577 chưa có proof sau sửa.
Giữ Edge1018/UTC-upgrade1017 đúng nguồn. Bàn giao tài liệu/dependency/API inventory và
bộ nghiệm thu theo bằng chứng; chưa triển khai VPS hay ký gate.
