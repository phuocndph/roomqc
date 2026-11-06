# RoomQC — phiếu điều phối triển khai và nghiệm thu toàn bộ VPS + signup

> Checkpoint T06 managed-runtime22/10: [report](roomqc-t06-managed-runtime-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-managed-runtime-local-2026-10-22.json).
> Source765/546 +8 directory migrations,10e89a2…; CLI đã nối managed probes,
> hai role/pool riêng, configv2 có tổng budget và bounded cleanup.
> Full control265/265,0 fail/skip; lint/syntax8 đạt, compose merge đạt; cleanup0.
> Real-directory proof dùng collector/metrics fixture, chưa thay timed five-vendor
> pipeline hoặc đóng T06/T08. Không deploy, không mở gate/đổi122 entries.


Ngày lập: 22/10/2026, Asia/Bangkok. Phạm vi đã xác nhận: **Toàn bộ VPS + signup**.
Đầu ra: **Plan + nghiệm thu**. Trạng thái tài liệu: kế hoạch giao việc, không phải
chấp thuận triển khai production hoặc báo cáo sản phẩm đã nghiệm thu.

Đọc tài liệu này để nhận việc từ checkpoint hiện hành. Không tạo roadmap thứ hai:
giữ nguyên **8 đợt, 27 gói, T01–T25, 70 ca** và dependency của
[ledger](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json).
Chi tiết toàn bộ task ở [plan chính](roomqc-vps-signup-execution-ready-2026-10-22.md);
kịch bản và expected ở [phiếu 70 ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md);
cách thu bằng chứng/ký ở [protocol](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).
Phiếu này bổ sung bước nối runtime thực tế sau T06, không đổi schema/API đang chạy.

## 1. Chốt sản phẩm sẽ bàn giao

Khách đăng ký trên roomqc.com, xác minh email, tạo khách sạn và bắt đầu dùng;
không phải mua VPS, cài Docker, Supabase hoặc nhập khóa kỹ thuật. RoomQC chuẩn bị
và vận hành các cụm máy chủ. Hệ thống phân khách mới vào **cụm đã chuẩn bị sẵn**,
không tạo một VPS mới cho mỗi tài khoản hoặc mỗi khách sạn.

| Phần | Phải bàn giao | Ranh giới không được vượt |
|---|---|---|
| Khách hàng | Đăng ký → xác minh → khai báo khách sạn → thêm phòng → mời nhân viên → dùng đúng quyền | Không tự chọn cluster, tenant, role, giá/gói hoặc quota bằng dữ liệu client |
| Quản lý hạ tầng | Registry cụm/host, phiên bản, sức khỏe, tài nguyên, hạn mức và đóng/mở nhận khách | Không có shell/root console, tự thuê VPS hoặc chuyển database khách cũ trong V1 |
| Quản lý đăng ký | Tiến độ riêng tư, lỗi/hành động tiếp theo, retry/resume và job đối soát | Không yêu cầu tạo lại khi chưa biết remote commit; không giả danh owner |
| Quản lý gói | Trial, quyền tính năng, số nhân viên/phòng/dung lượng và giới hạn theo chính sách được duyệt | Thu tiền thật là gate riêng; không tự quyết định ngày trial, giá hoặc xóa dữ liệu |
| Vận hành | Linux/TLS, giám sát ngoài host, backup offsite, restore sạch, ứng cứu và rollback | Local Docker không thay VPS Linux; backup upload không thay restore đã kiểm chứng |

Workspace có thể chứa nhiều khách sạn theo gói. Mọi định danh/cache/tổng hợp
phải scope theo workspace + cluster/routing version, không coi tenant UUID đơn
lẻ là khóa toàn cục. Cụm cũ lỗi/đầy thì chặn nhận mới, giữ đường dẫn khách cũ;
không fallback dữ liệu sang cụm khác.

1.000 khách sạn × 10–50 nhân viên là mục tiêu số tài khoản, không phải số phiên
hoạt động đồng thời. Chưa có căn cứ cam kết 100.000 concurrent hoặc số khách sạn
trên một VPS. T23 phải đo cấu hình/workload thực rồi mới công bố operating limit.

## 2. Hiện trạng đã đối chiếu

| Phần | Bằng chứng hoặc quan sát | Cách ghi nhận trong đợt tới |
|---|---|---|
| Directory/registry/reservation/command | Có triển khai và nhiều scoped tests | Review phần có sẵn, không xây lại từ đầu; nghiệm thu theo candidate hiện hành |
| T04 | Command-result có HTTP/DB proof trên checkpoint riêng | Typed client và mất response trên trình duyệt còn phải nối; không đổi unknown thành failed |
| T08 | Có approved catalog, canary, kiểm release và revision | Issuer automation/provenance, đồng bộ revision nhiều replica và indirect audit còn mở |
| T06 mới nhất | Source 762 file, 546 business migrations, 8 directory migrations; full control **254/254** đạt ở lượt trước | Nhận boundary fix; không coi toàn bộ T06 đã đóng |
| Runtime health | CLI hiện vẫn dùng lỗi `HEALTH_PROBES_UNCONFIGURED` khi không được cấp probe | Đây là điểm nối sản phẩm tiếp theo, không phải chỉ thêm dashboard |
| Config health | schemaVersion 1 tính pool metrics, chưa khai báo pool riêng quản lý canary | Thêm budget/contract có version trước khi mở thêm kết nối |
| Năm dịch vụ | Đã có collector và harness vendor | Cần nối manager → 5 probe → metrics → snapshot → admission qua thời gian thật |
| Signup/admin | Một số API mới nằm trong OpenAPI; hai entry admin còn là đề xuất | Đặc tả không được coi là handler/UI hoạt động; kiểm router/store/client/E2E từng endpoint |
| Production | Chưa có đủ Linux/TLS, Internet email, offsite DR, on-call, browser/Android E2E, load/soak/pilot | Giữ các gate chưa được phê duyệt |

Fingerprint checkpoint T06:
`8dc491fc8eb16235465abef9caf47597160afe58c42e5327bffc8ba84edc441a`.
Đây là manifest source **có phạm vi**, không phải mọi file repository, binary đang
phục vụ hoặc schema production. Source được tính lại trong lượt lập phiếu này;
254/254 là kết quả lịch sử từ [packet T06](roomqc-t06-health-proof-local-2026-10-22.md),
không phải suite vừa chạy lại.

Các lần A/B tuần tự, frontend/TypeScript và full-control cũ phải giữ đúng
fingerprint/run của chúng. Không thừa kế sang candidate mới. **122 mục
releaseAcceptance vẫn unverified**; owner/reviewer/signoff chưa có tên.
Lượt này chỉ đọc source và tạo tài liệu, không kiểm chứng serving runtime.

## 3. Tám đợt triển khai, đầu ra và điều kiện chuyển

BE = backend; FE = giao diện; OPS = vận hành; QA = kiểm thử/review;
RQ = người quyết định của RoomQC. Đây là vai trò, chưa phải tên được phân công.

| Đợt | Task / chủ trì | Việc phải hoàn thiện | Điều kiện bàn giao |
|---|---|---|---|
| 1 | T01–T06 và T08 theo dependency; BE/OPS | Khóa baseline, directory/quyền/contract, nguồn metrics và trust; hoàn thiện runtime health | A01–A11, B01–B07, C01–C04 theo môi trường; quyền/issuer/timed pipeline không còn khoảng trống trong scope |
| 2 | T07; BE/OPS | Alert lifecycle, event + outbox, retry/dedupe và heartbeat ngoài host | B08–B09; local chứng minh lifecycle; staging chứng minh người trực nhận khi mất host |
| 3 | T09–T10; BE/OPS | Admission/giữ suất/affinity; tổng pool, queue, quota và headroom | C05–C10; 20 request tranh 1 suất; G05–G06 có budget trước signup, chốt số bằng T23 |
| 4 | T11–T13; BE/FE | Signup private status/resume, job bền vững, abuse/proxy/email | D01–D15 và mapping A03/A07; đúng một bộ dữ liệu, không tạo lại khi commit unknown |
| 5 | T14–T17; FE/BE | Hai console Hạ tầng/Đăng ký mới, typed client, thao tác có receipt | E01–E08 và A03; API thật, list/filter/cursor, Back/focus/scroll, mobile/bàn phím |
| 6 | T18–T20; OPS | Bộ cài Linux/TLS, backup nhất quán offsite, restore và on-call | F01–F09, B01/B09 trên staging; reboot/rerun giữ dữ liệu; mất host vẫn khôi phục được |
| 7 | T21–T24; QA/OPS/BE/FE | Hai backend đồng thời, E2E web/Android, load/soak, RC/cutover | G01–G07 và audit đủ 70 ca; case pre-pilot đạt đúng môi trường; G08 giữ pending |
| 8 | T25; OPS/RQ | Pilot có giới hạn và báo cáo số liệu vận hành | G08 sau pilot; quyết định mở public riêng, không tự bật theo lịch |

Đợt là nhóm bàn giao, không thay dependency. **T06 phải sau T08**, dù số thứ tự
nhỏ hơn. T14 có thể chuẩn bị sau T03/T04; T18 có thể chuẩn bị sau T06/T08.
Không nghiệm thu console bằng mock hoặc bắt mọi việc chờ email/VPS credentials.

## 4. Đợt nhận ngay — khép trust và nối health runtime

Các bước dưới đây là checklist con của T01/T03/T04/T05/T06/T08, không tạo mã task
hay case mới. Contract thiết kế có thể làm trước; không đóng T06 khi điều kiện
T08 còn thiếu.

### 4.1. Nhận checkpoint và khóa phạm vi

1. Xác nhận đúng integration worktree, branch, dirty diff, source manifest,
   migrations, pinned images, schema/config/contract và các test fixture sở hữu.
2. Review packet T06 và lịch sử red/green; không nhận lại atomic proof fix như
   chưa làm. Kiểm regression revision/expiry/target/policy và admission read fence.
3. Lập bảng phần đã triển khai, local proof, còn thiếu proof và chưa triển khai.
   Không tính phần trăm từ số test hoặc từ số file có sẵn.
4. Giữ primary index, ledger/gates, CRM và DB đang phục vụ nguyên trạng.
5. Đầu ra: baseline trước sửa, phạm vi file dự kiến, test/cleanup/rollback plan.

### 4.2. Khép quyền gián tiếp và các workflow còn thiếu

Phạm vi current19 đã có direct proof; tiếp effective/inherited grants và mọi
đường RPC/Edge/view/definer/trigger/FK/dynamic caller theo inventory.
Disposition từng policy WARN và FK workload; không thêm index/policy hàng loạt
chỉ để xóa cảnh báo.

Với mỗi đường gọi: actor đủ quyền phải làm được → actor sai tenant/quyền/session
bị chặn và không có tác động → cấp lại đúng quyền/session thì hoạt động trở lại.
Giữ invitation/current19/direct-FK/password/command regressions đã có; bổ sung
recipient/offboarding/EC10–EC15 theo inventory, không suy structural scan là E2E.

Đầu ra: bảng caller → authority → allowed effects → test/evidence → disposition.
Defect High về quyền/dữ liệu còn mở phải chặn gate tương ứng.

### 4.3. Chốt contract cấu hình managed probe

Điểm sửa dự kiến: `server/control/workers/health-config.mjs`, config tests và
module managed-probe riêng **nếu cần**, tái sử dụng `probe-session.mjs`,
`probe-credentials.mjs`, `service-probes.mjs`. Tên file mới chỉ là dự kiến.

- Metadata chỉ chứa target, approved endpoints/addresses, release/schema,
  inventory/credential reference, publishable key và Storage digest đã duyệt.
- DSN và keyring đi bằng secret-file references; không đặt password/token/service
  key trong metadata, client, CLI args hoặc log.
- Không cấu hình managed probe: giữ trạng thái chưa sẵn sàng, không có positive
  fallback. Cấu hình một phần/sai schema/target thiếu phải từ chối khởi động.
- TLS verify-full cho production, exact origin/allowlist, không theo redirect;
  cấu hình local chỉ dùng trong fixture được xác định.
- Reader private file phải kiểm giới hạn bytes, loại file, ownership/mode hoặc
  Windows ACL; review symlink và thay file giữa kiểm tra/đọc.
- Chốt schemaVersion mới hoặc migration tương thích trước khi sửa mẫu cấu hình;
  từ chối field lạ, duplicate target và budget không nhất quán.

Nghiệm thu: missing/partial/malformed/duplicate/oversized/unsafe-path/permission/
TLS/target mismatch đều fail an toàn; thông báo không tiết lộ nội dung secret.

### 4.4. Hai pool và hai quyền riêng

| Pool / quyền | Được làm | Không được làm |
|---|---|---|
| Metrics writer | Ghi snapshot/health theo quyền đã giới hạn, stale sweep | Đọc ciphertext/session/keyring, cài hoặc đổi probe credential |
| Probe runtime | Dùng credential bundle giới hạn để quản lý phiên canary | DDL, cấp quyền nghiệp vụ, đọc DB khách bằng service_role |
| Installer/issuer ngoài runtime | Tạo canary/resource, phát hành/rotate/revoke bundle theo quy trình được duyệt | Trở thành secret mount thường trực của health worker |

Không gộp metrics và probe role trong cùng login để vượt readiness check.
Tổng ngân sách directory DB phải tính cả hai pool × số replica, API, reconcile,
exporter, migration/backup và dự phòng. Pool business DB của từng cụm phải có
phiếu riêng; không cộng nhầm hai database rồi coi budget đã bảo vệ cả hai.

Kiểm timeout acquire/query/lock/idle, shutdown và cleanup pool sau lỗi startup.
Nếu probe pool/secret không sẵn sàng, **stale sweep của metrics vẫn phải chạy**
để dữ liệu cũ không tiếp tục mở admission.

Nghiệm thu: kiểm quyền bằng role thực; metrics không đọc envelope; runtime không
DDL; over-budget bị chặn; probe outage không chặn stale expiry; dừng tiến trình
không để pool/socket treo vô hạn.

### 4.5. Issuer, canary và quản lý phiên

1. Installer tạo đúng tài khoản canary và object kiểm tra riêng, không dùng owner
   của khách hoặc nhân viên thật. Bundle bind đúng cluster/target/release/schema.
2. Approval catalog có provenance và revision từ bên ngoài runtime; không tự
   phê duyệt release dựa trên endpoint vừa trả lời.
3. Giữ refresh token/session data trong encrypted bundle; chỉ truyền narrow
   credential cho từng service probe, không phát tán installer password.
4. Refresh theo lease/fencing; hai replica không ghi đè token/revision mới.
   Rotate/revoke/expiry phải chặn proof cũ ngay, kể cả mẫu đang chờ lock.
5. Restart mất trạng thái trong RAM không làm mất revision hoặc tự mở gate.
   Thiếu keyring/bundle/approval thì fail-closed, không fallback service_role.
6. Đầu ra: installer/issuer dry-run/apply/verify/revoke procedure, audit an toàn,
   recovery plan và tests lifecycle/race trên tài nguyên disposable.

### 4.6. Nối luồng thật

Điểm nối dự kiến: `server/control/workers/health-runtime.mjs`,
`health-worker.mjs`, `probe-session.mjs`, `telemetry.mjs` và compose worker.

Chuỗi cần chứng minh: registry đã duyệt → assertTarget/live credential context
→ ProbeSessionManager → Auth/REST/Storage/Realtime/Functions → Prometheus thật
→ HealthStore transaction → admission đọc snapshot/live metadata.

Giữ bằng chứng có binding/revision/policy/target/freshness. Không chỉ trả năm
boolean hoặc ghép callback giả với snapshot rồi gọi là full pipeline.
Storage phải kiểm bytes/digest canary, không chỉ HTTP 200.

Giữ deadline/cancellation toàn target; không giữ transaction DB trong lúc HTTP.
Defaults source đang có: chu kỳ 30s, target timeout tối đa 25s, shutdown worker
10s; freshness/proof kiểm theo clock phù hợp tại write. Đây là cấu hình hiện có,
không phải SLA. Đo tổng thời gian refresh + probes + metrics + commit, không tăng
proof TTL để che pipeline quá chậm.

Compose opt-in chỉ mount metadata/metrics DSN/probe DSN/keyring cần thiết;
nonroot/read-only/capdrop, network đúng allowlist, không public exporter/DB,
không mount Docker socket hoặc secret của API/migrator/issuer.

### 4.7. Bài thử xuyên dịch vụ và thời gian thật

Dùng harness full-vendor pin phiên bản và môi trường exact-owned; không test
ngắt dịch vụ trên DB/VPS đang phục vụ. Bộ thử tối thiểu:

| Bài thử | Kết quả phải quan sát |
|---|---|
| Khởi động đúng cấu hình | Probe thực đủ 5 dịch vụ, metrics thực; warmup theo policy trước ready/admission |
| Dừng từng dịch vụ | Probe tương ứng fail; positive control dịch vụ khác vẫn đúng; admission không nhận mới |
| Prometheus hoặc probe runtime mất kết nối | Không ghi healthy giả; stale sweep vẫn làm snapshot hết hiệu lực |
| Token refresh/rotation/revoke | Dữ liệu revision cũ bị từ chối; lease/revision mới không bị worker cũ ghi đè |
| Target/policy/release đổi giữa probe và commit | Mẫu cũ không ghi sequence/policy/event có tác dụng mở gate |
| Hai worker, restart và mất response | Không reset recovery window sai; không mở mới từ snapshot stale; cleanup đúng |
| Phục hồi dịch vụ | Thu được proof mới hợp lệ; recovery theo policy, critical latch/manual gate không tự mất |
| Shutdown/cancel | Deadline hữu hạn, không leak pool/listener/socket/container/volume/network |

Đo timestamp thực warmup/fault/stale/recovery và lưu snapshot/admission/event
đối chứng. Clock giả/callback chỉ là unit proof. Scope Docker Desktop VM phải
ghi đúng, không coi là chứng minh Linux host thật B01.

### 4.8. Cách bàn giao đợt này

Focused tests → freeze source → regression control phù hợp → packet đã sanitize
→ independent cleanup → reviewer. Full suite cần terminal exit code, fail/skip/
cancel rõ; không cộng focused subsets vào full count. Chạy A/B/FE/E2E khi delta
hoặc gate cần, không mượn bằng chứng từ source khác hoặc bỏ fail khỏi báo cáo.

Bàn giao gồm: source/image/schema/config hashes, files/diff scope, test actual,
failed history, quyền dữ liệu, limits, rollback, cleanup và việc tiếp theo.
Chưa được đóng toàn T06/T08 nếu indirect/issuer/timed pipeline còn thiếu proof.

## 5. Đợt 2–3 — từ đo đạc đến điều khiển nhận khách

T07 phải tạo event + outbox trong cùng transaction; dedupe theo lifecycle,
acknowledge không resolve hoặc mở admission; resolve dựa trên recovery thực.
Retry có backoff/jitter/max attempts, không gửi trùng vô hạn sau restart.
Local dùng internal sink; host-loss delivery phải có người nhận ở staging.

T09 kiểm toàn bộ trust/health/freshness/resource/backup/policy/manual flags trong
giao dịch reservation. Test 20 request tranh suất cuối, 20 replay cùng intent,
close/drain/expiry-race, first provision và unavailable receipt. Workspace đã
provisioning không bị hết reservation rồi cấp trùng; khách cũ giữ binding.

T10 bàn giao phiếu budget từng DB/host: CPU/RAM reserve, data mount/disk/inode/IO,
max connections và từng replica × pool, vendor/realtime, report/upload/background
jobs, queue limit, migration/backup/emergency headroom. Server enforcement quota
và policy có version. Quá tải thì queue/reject có lý do, không tăng pool tùy tiện.
Ngưỡng pilot ban đầu phải thấp và được duyệt; T23 mới chốt operating limit.

## 6. Đợt 4 — khách tự đăng ký, tiếp tục và phục hồi

| Bước | Nguồn sự thật | Expected và phục hồi |
|---|---|---|
| Gửi đăng ký | Intent + challenge/limiter server-side | Body whitelist; replay cùng identity không giữ thêm suất |
| Giữ suất/chọn cụm | Directory transaction | Chỉ cụm đủ gate/budget; lưu affinity, không tự đổi khi cụm lỗi |
| Xác minh email | Auth của đúng cụm + session hiện thời | Callback đúng origin/workspace; chưa verified không có dữ liệu nghiệp vụ |
| Khai báo khách sạn | Live owner authority + binding | Tenant/role/trial/quota lấy server; một job durable trước remote call |
| Cấp dữ liệu | Transaction cụm + receipt | Một bộ tenant/hotel/profile/trial/receipt theo contract; retry không tạo thêm |
| Kích hoạt | Receipt đúng workspace/cụm/routing version | Mất response sau commit là unknown; đối soát trước khi báo xong |
| F5/hai tab/thiết bị mới | Private setup-status | State/step/nextAction/retryAfter từ server; không dựa riêng sessionStorage |
| Tự phục hồi | Job claim/lease/fencing | missing→waiting_owner; unavailable→retry; conflict→needs_review; verified→complete |
| Mời nhân viên | Invitation và quyền được gán phía server | Nhận thư→accept→login đúng tenant/role; revoke/offboarding có hiệu lực |
| Hết trial/quota | Policy version được duyệt | Grace/read-only/suspend theo chính sách; không xóa dữ liệu hoặc reset trial |

T11–T12 phải fault-inject sau claim, trước call, sau remote commit, trước local
ack và sau lease expiry. Worker recovery chỉ đối chiếu receipt, không giữ owner
token trong queue hoặc tái tạo tenant. Recheck là enqueue; HTTP 202 chưa là hoàn
tất. Backfill registration dở phải có dry-run/allowlist/recovery trước khi bỏ
cơ chế cũ.

T13 kiểm limiter bền vững nhiều replica, trusted proxy và đường gọi Auth trực
tiếp. Signup-off không được phá invitation. Email verify/reset/invite có expiry,
resend cooldown, link dùng lại/deep-link đúng cụm. Internal SMTP sink không thay
Gmail/Outlook thật; provider/DNS thiếu chỉ hoãn D15, không bỏ local implementation.

## 7. Đợt 5 — quản trị đủ chức năng nhưng dễ dùng

Hai entry đề xuất cần đăng ký route/menu/guard thật tại T14:

- `/super-admin/infrastructure`: cụm/host, version, freshness, tài nguyên,
  health, capacity, backup/restore, lý do nhận/chặn; detail/timeline khi cần.
- `/super-admin/registrations`: search/filter/cursor, signup step, age, cụm,
  lỗi an toàn và next action; detail job/receipt/timeline/tenant-summary/recheck.

T04/T14 chốt inventory OpenAPI → router → authority → store → typed client →
UI → positive/negative/E2E. Setup-status, tenant-summary, alerts/backups và
recheck phải kiểm từng tầng; có trong JSON contract chưa chứng minh có handler.
Tái dùng command-result đã có, không xây cơ chế receipt trùng.

Lệnh ghi có capability, reason, expected version và idempotency key giữ nguyên
qua retry/F5. Lost response phải đọc kết quả durable; stale version báo conflict
và yêu cầu refresh, không thông báo success chỉ từ toast.

Cache/request scope actor + authority + cluster/workspace + routing version;
logout/revoke/chuyển scope phải hủy hoặc loại response cũ. Unknown khác 0/healthy.
Dùng màu phổ thông, tương phản rõ và chữ/icon; một menu chính, mọi chức năng có
điểm click. Back trả đúng list/filter/scroll; route mới lên đầu, dialog giữ focus.
Nghiệm thu 390px, zoom, bàn phím; tìm nguyên nhân đăng ký kẹt <30s trong dataset
1.000 metadata. Không mặc định mọi metadata là một khách sạn đang hoạt động.

## 8. Đợt 6 — Linux, backup và vận hành hằng ngày

T18: xác nhận host/IP/OS/hardware/mount/volume/port/network trước apply; có
preflight read-only, dry-run, prepare/apply/verify checkpoints. Pin images/digests
và vendor tương thích; không dùng dev CLI stack làm production bundle.
Sai target, port bận, volume đã có dữ liệu hoặc thiếu secret phải dừng, không
init/format/overwrite. Rerun/reboot/upgrade giữ dữ liệu và có đường quay lại.

TLS/callback/CSP/WebSocket/upload và cả năm dịch vụ phải thử xuyên proxy;
DB/metrics/Studio chỉ private. Key/cert rotation và expiry có runbook; tách
migrator/runtime. Không tự nâng Supabase theo chữ “latest” của tài liệu.

T19: backup bao gồm directory mapping/job/audit/receipt, business DB/Auth/queue,
Storage **object bytes**, manifest/watermark/config/secret refs và khóa cần
khôi phục. Chốt write-pause/checkpoint hoặc cơ chế nhất quán được review.
Mã hóa/checksum/upload/readback offsite; key custody ngoài failure domain.
Retention có dry-run/approval, không xóa theo glob mơ hồ.

Restore vào host/volume sạch cách ly; ngăn hai bản cùng nhận write. Kiểm Auth/
login/mapping/rooms/staff/trial/job/receipt/file bytes trước mở routing.
Sai key/checksum/version hoặc thiếu object phải fail. Đo RPO từ điểm dữ liệu
nhất quán đến fault; RTO từ fault đến service verified, không bắt đầu đồng hồ muộn.

T20: mỗi cảnh báo có tác động, cách xác nhận, hành động, escalation, owner chính/
phụ, điều kiện mở lại và timestamp. Mất chính VPS phải vẫn nhận qua kênh ngoài
host. Drill control/DB/disk/TLS/credential/backup/signup kẹt, có received/ack/
recovery thật; dashboard cùng VPS không thay external heartbeat.

## 9. Đợt 7–8 — chứng minh trước khi mở rộng

T21 dựng hai backend **đồng thời**: Auth/key/DB/Storage/Realtime/Functions/
volumes riêng; một directory chung. Test A-token không dùng ở B kèm positive
đúng cụm; cùng UUID không nhầm; A down không fallback B. Hai lần chạy tuần tự
hoặc hai registry trỏ cùng backend không thay bài thử này.

T22 web/Android E2E: signup→verify→hotel→rooms→invite→staff login→đúng quyền;
reload/hai tab/mất mạng/mất response/revoke/Back/deep-link/cutover. Bằng chứng
gồm UI + API + DB/receipt; không thay bằng component test.

T23 profile hardware/images/data/workload/think-time. Tăng 10→25→50→100 phiên
**chỉ nếu mức trước đạt**, soak tối thiểu 60 phút; có bookings/write/realtime/
upload/report/signup và noisy-neighbor đối chứng. Ghi p50/p95/p99, lỗi ngoài
fault, CPU/RAM/IO/disk/pool/queue/lag và chi phí. Operating limit thấp hơn
max tested với headroom có lý do; không suy rộng tuyến tính lên 100.000 user.

T24 freeze RC, audit 70 case và môi trường bắt buộc, secret scan, defect list,
cutover/rollback, version-compatible DB và người phê duyệt. Không Critical/High
quyền/dữ liệu/cấp phát/restore còn mở trong scope pilot. G08 chỉ có kế hoạch/
cohort ở đây, chưa pass trước khi pilot diễn ra.

T25 pilot 1 khách sạn nội bộ; ổn định 24–48h trước cohort 5–10 đã duyệt.
Quan sát ít nhất 7 ngày, có giờ cao điểm/backup/restore/alert/support và UX
owner/nhân viên. Báo cáo thời gian đến sử dụng đầu tiên, failure/retry, tài nguyên,
chi phí/khách sạn, công support và incidents; RQ chọn sửa/giữ pilot/mở rộng.
Hết 7 ngày không tự bật public signup hoặc thu tiền.

## 10. Nghiệm thu và các cổng quyết định

| Nhóm | Ca chuẩn | Nội dung |
|---|---|---|
| A | A01–A11: 11 ca | Nền, migration, quyền và command |
| B | B01–B09: 9 ca | Metrics, health và alert |
| C | C01–C10: 10 ca | Registry/trust/admission/reservation |
| D | D01–D15: 15 ca | Signup/resume/reconcile/email/abuse |
| E | E01–E08: 8 ca | Hai console và UX |
| F | F01–F09: 9 ca | VPS/backup/restore/on-call |
| G | G01–G08: 8 ca | A/B, E2E, tải, RC và pilot |

**70 ca không phải 70 test case tự động.** Một ca có thể cần nhiều test và
local/staging evidence. B01/B09/D15/F01–F09/G04–G06 cần staging theo ledger;
G08 cần pilot. RequiredEnvironments của từng ca là nguồn chuẩn.

| Gate | Điều kiện mở | Không đủ để mở |
|---|---|---|
| L — local integrated | Current candidate, integrated security/data/receipt/recovery + cleanup và review | Một số unit test hoặc chỉ count 254 |
| S — staging | Target/release/origins/TLS/private ports/backup/rollback và quyền deploy được duyệt | Có source hoặc Docker local |
| P — pilot | Các case pre-pilot đủ, offsite restore/on-call/capacity/kill-switch/cohort được duyệt | Có file backup hoặc có plan G08 |
| U — public signup | Pilot G08 đạt + abuse/capacity/cost/support review + RQ phê duyệt riêng | Tự hết thời gian pilot |
| B — billing thật | Acceptance provider/payment/security/business riêng | Trial hoặc UI gói đã có |

Mỗi ca: prepare exact-owned → positive → negative/no-effects → fault/race phù
hợp → recovery positive → API/DB/audit/receipt asserts → cleanup → reviewer.
Phiếu chưa điền không là evidence, và pass local không thay pass staging.

## 11. Đầu vào cần từ RoomQC — gom riêng để làm đúng lúc

| Đầu vào | Cần trước | Nếu chưa có vẫn làm được |
|---|---|---|
| Implementer, independent reviewer, OPS và release owner có tên | Nhận/ký packet | Ghi role; chưa ký thay hoặc gán người tự động |
| Trial/quota/seat/room/storage/grace/retention/export/delete/MFA policy | T03/T11/T13/T25 tương ứng | Contract/tests tham số; giữ policy đã được duyệt |
| VPS staging exact target/profile, volume/port/network và chi phí | Proof T05/T10/T18/T23 thực | Bundle/preflight/disposable integration; không SSH vào target đoán |
| DNS roomqc.com và exact app/API/admin/callback/Android origins | T13/T18/T22 | Template/allowlist local; tên miền được nêu chưa chứng minh DNS hoàn tất |
| Email provider/sender/webhook và hộp Gmail/Outlook thử | D15 | Outbox/retry/internal sink; không ghi Internet delivery pass |
| Offsite store, retention/cost, người giữ recovery key độc lập | T19 | Manifest/clean restore fixture; chưa ký mất-host DR |
| Alert destination ngoài host, on-call chính/phụ/escalation | T20/P | Local alert lifecycle; giữ received-on-host-loss pending |
| Cohort/consent/support window/operating limit/kill-switch owner | P/T25/U | RC và runbook; chưa thêm khách/mở public |

Không yêu cầu gửi API key, password hoặc SSH key trong chat. Chỉ ghi secret
reference/người giữ; đưa secret qua kho vận hành phù hợp. Thiếu đầu vào nào chỉ
hoãn case/gate đó, không bỏ task hoặc chặn mọi việc local.

## 12. Phiếu giao việc, bàn giao và điều kiện dừng

Mỗi ticket ghi rõ:

| Trường | Nội dung bắt buộc |
|---|---|
| Nhận việc | Txx/Pxx/case IDs; source/candidate; input/dependency; owner/reviewer |
| Thay đổi | File/schema/API/config dự kiến; allowed effects; secret boundary |
| Kiểm thử | Môi trường, commands, expected/actual; positive/negative/race/recovery |
| Kết quả | Run/time/exit code/pass/fail/skip; failures giữ nguyên lịch sử |
| Dữ liệu | DB/receipt/audit assertions; before/after; kiểm không ảnh hưởng ngoài scope |
| Cleanup/rollback | Exact-owned resources, leftovers, bounded shutdown, compatible recovery |
| Giới hạn | Chưa test, external pending, defect/impact, bước tiếp theo |
| Phê duyệt | Reviewer/signoff thực, gate được phép mở; không tự ký |

Dừng nhận mới/mở rộng khi có quyền chéo, mất/nhân dữ liệu, tạo tenant trùng,
unknown commit bị tạo lại, trust/config drift, resource critical hoặc restore
không đạt. Giữ binding khách cũ; có thể dừng claim mới, đối soát receipt và
rollback binary/config tương thích. Không reset DB/down-migrate phá dữ liệu,
xóa job/tenant hoặc sửa lịch sử để làm kết quả xanh.

Báo cáo sau mỗi đợt: **đã bàn giao → bằng chứng → lỗi/rủi ro → việc còn thiếu →
đầu vào cần → đợt tiếp theo**. Không báo hoàn tất chỉ vì code đã được viết.

## 13. Ước lượng và mốc khởi động

Dự toán kế thừa: **30–47 ngày công**, **36–57 có dự phòng**, cộng thời gian chờ
external và ít nhất 7 ngày quan sát pilot. Đây là dự toán cũ, không là cam kết
lịch hoặc số ngày còn lại đã được tính lại. Sau disposition quyền và timed
pipeline, phải re-estimate theo người thực hiện, hardware và lỗi thực tìm thấy.

Thứ tự nhận ngay: baseline/checkpoint → indirect/workflow disposition và managed
config/budget contract → issuer/lifecycle → nối runtime → timed full-vendor
pipeline → packet/review. Sau đó tiếp T07→T09/T10→T11–T13→T14–T17→T18–T20→
T21–T24→T25 theo dependency; các phần chuẩn bị độc lập có thể đi trước.

Hướng dẫn Supabase/PostgreSQL đã được áp dụng vào kế hoạch để giữ RLS/authority
phía server, secret không vào client, hai pool ít quyền và tổng connection budget,
pin vendor và trách nhiệm backup/DR khi self-host. Đối chiếu:
[changelog](https://supabase.com/changelog.md),
[self-host Docker](https://supabase.com/docs/guides/self-hosting/docker),
[Auth sessions](https://supabase.com/docs/guides/auth/sessions).
Không nâng vendor hoặc thay DB trong lượt lập kế hoạch.

Kiểm tra chính phiếu này và guards trước/sau được lưu ở
[artifact bàn giao](../../../artifacts/roomqc-vps-signup-kickoff-2026-10-22.json).
Đây là kiểm tra kế hoạch, không phải nghiệm thu 70 ca sản phẩm.
