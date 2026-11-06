# RoomQC — kế hoạch triển khai toàn bộ VPS và đăng ký tự động

> **Readback811 đã có scoped proof:** [detail/summary](roomqc-permission-readback-scope-local-2026-10-26.md),67API+4races,metadata30+4 và full control358/358exit0 trên550schema. Nhận tiếp inventory/direct/privileged compatibility, terminal pending recovery, indirect/workflow/advisors, freeze và full backend/rebuild cuối; tiếp đủ alerts/admission/signup/console/ops/E2E/pilot. Các đoạn giao legacy detail trước811 bên dưới giữ lịch sử, không là việc chưa bắt đầu.

> **Việc đã chạy mới:** [allocation20transaction/full-control358](roomqc-admission-concurrency-local-2026-10-26.md), source `c8dd891d…`,native0. Nhận tiếp legacy detail/direct compatibility/terminal recovery → indirect/advisors → freeze/full backend/rebuild cuối → alerts/admission budget/signup. Các đoạn giao chẩn đoán810 bên dưới giữ failed history, không là việc chưa thực hiện.

> **Đọc trước khi nhận việc:** [phiếu triển khai và nghiệm thu chi tiết26/10](roomqc-vps-signup-detailed-delivery-2026-10-26.md), đủ8đợt/27gói/T01–T25/70ca. [Candidate810](roomqc-authority-editor-candidate810-local-2026-10-26.md) đã có editor/catalog/client scoped proof, full-control357/358exit1 cần chẩn đoán. Nhận theo mục13 của phiếu: reservation failure → legacy detail/direct compatibility/terminal recovery → indirect/advisors → freeze/full pipeline → alerts/admission/signup và các đợt còn lại. [Biên bản cập nhật](../../../artifacts/roomqc-vps-signup-plan-current-review-2026-10-26.json) không thay nghiệm thu sản phẩm; mô tả thiếu component/caller cũ dưới đây là lịch sử.

> **Nhận việc793:** [backend atomic commands](roomqc-ec10-ec15-atomic-commands-local-2026-10-26.md) đã có actual API43checks+3concurrency checks, metadata30+4, terminal0 và cleanup0. Chuyển active caller/readback/pending recovery theo [contract](roomqc-employee-authority-command-contract-2026-10-26.md), không viết lại backend command như chưa có. UI legacy vẫn có thể lưu dở, detail mismatch chưa khép. Native advisors667findings; chưa full pipeline793. Bảng task/dependency và70ca giữ nguyên; các checkpoint dưới là lịch sử.

> **Nhận việc sau fix791:** [scoped boundary proof](roomqc-ec10-ec15-authority-boundary-local-2026-10-26.md) chặn8scope/live failures,55controls/54pass/1atomic fail và1readback mismatch còn lại. Tiếp bước3–5 mục17 plan: atomic save/receipt/version/recovery → read model/callers/cache. Native advisor665findings đã scan, chưa disposition; chưa full pipeline791. Các checkpoint/chỉ dẫn bên dưới là lịch sử theo source tương ứng.

> **Việc nhận ngay:** [baseline actual API red](roomqc-ec10-ec15-api-red-baseline-local-2026-10-26.md) hoàn tất exit1 với9controls không đạt và1readback mismatch. Nhận mục17 của plan hiện hành và phiếu EC10–EC15 để sửa target scope/live authority/atomic save/readback; giữ positives/recovery và checkpoint790 trước sửa. Không còn giao baseline này như việc chưa chạy; browser/Android và coverage ngoài ma trận vẫn cần kiểm.

> **Cập nhật hiện trạng 26/10:** dùng [plan hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md), mục6/14. Source `d4cea563…`/790 file có [control358/358 và installer](roomqc-t08-release-installer-local-2026-10-26.md), cùng [default full backend](roomqc-installer790-full-backend-local-2026-10-26.md) `ce2e6829dae8`, terminal0, source/runtime và cleanup đã kiểm độc lập. Còn quyền gián tiếp/EC10–EC15 và independent rebuild; key-wide784/346 và diagnostic99b42 thuộc source cũ. Bảng T01–T25/dependency giữ nguyên; chưa nghiệm thu toàn sản phẩm hoặc mở gate.

> Checkpoint lịch sử781/1261ed46: [signed validate/admission/receipt](roomqc-t08-signed-runtime-local-2026-10-26.md).
> Catalog v2 bắt buộc chữ ký; validate/reserve/open/provision retry đã kiểm primary authority; full control330/330,exit0.
> Health worker/commit và backend harness còn cutover; chưa full backend/rebuild781. Proof cũ dưới đây thuộc baseline98b.
>
> Baseline tích hợp26/10: [release/catalog và năm dịch vụ](roomqc-t06-release-catalog-local-2026-10-26.md).
> Candidate 98b0713…/773 file, 546 business + 9 directory migrations.
> Full control **307/307**, không fail/cancel/skip, terminal exit 0.
> Diagnostic061d6cd02b87 **terminal exit 0**: actual release mutation/fence,
> next-cycle rejection, actual Functions deployment, installer/restart và đủ
> năm probes phục hồi. Independent cleanup21checks0. Lượt009b **exit 1** giữ lịch sử.
> Default full343bb7abed65 đã native terminal0,source/render khớp;cleanup độc lập3checks0.
> Independent full rebuild380159ba6e22 đã native terminal0,source/schema/runtime khớp;
> cleanup độc lập3checks0. Đây là local proof, chưa đóng toànT06/T08.
> 70 worksheet `not_run`, 122 release entries `unverified`, gate và signoff giữ nguyên.
>
> Checkpoint lịch sử policy/target26-10: [policy/target/restart](roomqc-t06-policy-target-local-2026-10-26.md) /
> [artifact](../../../artifacts/roomqc-t06-policy-target-local-2026-10-26.json).
> Source65a8128…/773files,546business+9directory migrations; full control301/301,
> 0fail/skip/cancel,terminal0. Diagnosticc9cc2797dc73 cùng source terminal0:
> actual metrics overlap, policy/target fence, replay đúng một lần, old next-cycle
> reject và readonly-config restart recovery; independent cleanup21checks0.
> Synthetic approval/actor; không physical exporter/release/catalog change.
> Nhận tiếp mục16 của plan: release/catalog, rồi combined full backend/rebuild.
> Chưa đóng toànT06/T08/70case hoặc mở gate. Các checkpoint dưới đây là lịch sử.

> Checkpoint26-10: [report](roomqc-t06-credential-cycle-local-2026-10-26.md) /
> [artifact](../../../artifacts/roomqc-t06-credential-cycle-local-2026-10-26.json).
> Source cuối9518716…/773file,546business+9directory migrations; full control298/298,
> 0fail/skip/cancel,exit0. Actual backend974dba47562a trên85c9ebe… terminal0:
> rotate→disable→chu kỳ disabled→same-user/new-session recovery, hai pool đóng,
> source/render khớp, cleanup độc lập0. Sau đó chỉ sửa isolated timeout test.
> Diagnostic không là full timed/rebuild proof951; timeout15eb cũ chưa rõ nguyên
> nhân, giữ stability follow-up. Config/restart và toàn roadmap còn mở; gates không đổi.

> Checkpoint773/23-10 — lịch sử: [report](roomqc-t06-metrics-credential-local-2026-10-23.md) /
> [artifact](../../../artifacts/roomqc-t06-metrics-credential-local-2026-10-23.json).
> Source0f1c605…/773file,546business+9directory migrations; full control297/297,
> 0fail/skip/cancel,exit0. Metrics thật overlap: rotation1→2 và disable2→3
> đều bị fence tại health commit, admission manual_closed. Diagnostic15eb29de822d
> terminal1 ở credential_disabled_next_cycle; recovery sau disable chưa chứng minh.
> Không full-backend/rebuild773; cleanup độc lập0. Đây là lỗi nghiệm thu còn mở,
> không là chứng nhận hoàn tất;122entries/70worksheet/gates/signoff không đổi.

> Checkpoint disable771/22-10: [report](roomqc-t08-probe-disable-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t08-probe-disable-local-2026-10-22.json).
> Source01ac08e…/771file,546business+9directory migrations; full control288/288,
> 0fail/skip,exit0; migration8→9 giữ dữ liệu/checksum, Auth thật late-response
> bị fence và installer-only disable không bị runtime bật lại; cleanup18checks0.
> Chưa combined full-vendor metrics/config drill hoặc independent rebuild771.
> Backend770 bên dưới giữ lịch sử, không thừa kế pass;122entries/gates không đổi.

> Checkpoint source/config binding22/10: [report](roomqc-t06-source-binding-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-source-binding-local-2026-10-22.json).
> Candidate770/source39d3efd…; full control283/283,0fail/skip,exit0. Source-set139
> và rendered monitoring được ràng buộc, có omission/mutation/ownership checks.
> Default full backend d4feca68d43b/session69733 đã terminal0,17mốc managed
> thật; source/render khớp đầu/cuối, independent cleanup container/network/volume0.
> Đây là scoped local proof770, chưa independent rebuild hoặc đóng toànT06/T08.
> Live rotation/issuer/Linux/RC và122 release entries vẫn mở.
>

> Checkpoint T06 timed-local 22/10: [report](roomqc-t06-managed-timed-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-managed-timed-local-2026-10-22.json).
> Candidate 768 file / 546 business + 8 directory migrations, source a3aaf6b…;
> full control 270/270, 0 fail/skip. Pipeline managed thật có 17 mốc thời gian,
> warmup/fault/restart/recovery/stale/shutdown; không dùng clock giả.
> Đây là scoped Docker Desktop VM proof, chưa là Linux/offsite/issuer approval,
> chưa đóng toàn T06/T08 hoặc đổi 122 release entries. Xem terminal run và giới
> hạn trong report; các checkpoint bên dưới là lịch sử đúng source của chúng.

> Checkpoint T06 managed-runtime22/10: [report](roomqc-t06-managed-runtime-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-managed-runtime-local-2026-10-22.json).
> Source765/546 +8 directory migrations,10e89a2…; CLI đã nối managed probes,
> hai role/pool riêng, configv2 có tổng budget và bounded cleanup.
> Full control265/265,0 fail/skip; lint/syntax8 đạt, compose merge đạt; cleanup0.
> Real-directory proof dùng collector/metrics fixture, chưa thay timed five-vendor
> pipeline hoặc đóng T06/T08. Không deploy, không mở gate/đổi122 entries.


> Checkpoint T06 local22/10: [health proof](roomqc-t06-health-proof-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-health-proof-local-2026-10-22.json).
> Source762/546 +8 directory migrations,8dc491f…; bằng chứng health được kiểm
> ngay giao dịch ghi, admission chặn snapshot cũ sau rotation/expiry/recovery.
> Full control254/254,0 fail/skip,lint/syntax19 đạt; independent cleanup0.
> Đây là scoped local delta, chưa đóng toànT06/T08 hoặc timed full-vendor pipeline.
> Không deploy, không đổi mapping khách cũ hoặc gate/122 entries.

> Checkpoint thực hiện22/10: [T08 local](roomqc-t08-release-validation-local-2026-10-22.md),
> source2495ee9… full control243/243,0 fail/skip,lint/syntax10 đạt. Hai lỗi
> fixture source6f3 đã tái hiện/sửa, giữ expiry và timeout proof. Chưa đóng toànT08,
> issuer/indirect audit và atomic health/timed pipeline vẫn mở. Không deploy/gate.

Ngày cập nhật: 26/10/2026, Asia/Bangkok. Phạm vi người dùng xác nhận: **Toàn bộ VPS + signup**.
Đầu ra được yêu cầu: **Plan + nghiệm thu**. Đây là tài liệu chuẩn bị triển khai,
không phải báo cáo đã hoàn thành sản phẩm hay lệnh mở đăng ký.

Bản này sắp xếp lại việc thực hiện của kế hoạch hiện hữu, **không thêm task/case**.
Giữ nguyên 8 đợt, 27 gói, T01–T25, 70 ca A01–G08 và dependency trong
[ledger](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json).
Đọc cùng [phiếu giao việc kỹ thuật](roomqc-vps-signup-launch-checklist-2026-10-21.md)
và [quy trình nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).
Bảng [70 ca để điền kết quả](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md)
là phiếu trống, không phải evidence.

**Cách đọc hiện hành:** nhận checkpoint790/d4cea563 trong
[report installer/readiness](roomqc-t08-release-installer-local-2026-10-26.md):
full control358/358, native CLI7/7 có lost-COMMIT→receipt/replay, primary-target
race và file/role/schema/trust boundary; key-wide/signed health giữ hồi quy.
Default full backend790 đã terminal0 theo report đầu trang. Còn quyền gián tiếp,
issuer/Linux và independent rebuild trên candidate cuối. Checkpoint784/346 và
diagnostic99b42 giữ lịch sử đúng source.
Membership/quyền nhân viên nhận theo [phiếu EC10–EC15](roomqc-ec10-ec15-execution-and-acceptance-2026-10-26.md),
gồm baseline, contract atomic, readback và fault/race/recovery, không đổi semantics
quyền chỉ để checkbox khớp hoặc coi local controls là release acceptance.
Dispatch hiện hành lấy từ mục6/14 của plan hiện hành; các phiếu
theo checkpoint dưới đây giữ làm chi tiết và lịch sử, không giao lại phần đã có proof.
Baseline tích hợp98b0713…/773 file,directory9,control307/307 giữ proof riêng.
Report release/catalog ở đầu trang ghi riêng terminal fail009b/sourcee291 và
kiểm chứng bản sửa mới; policy/targetc9cc và credential974dba giữ lịch sử đúng
source.15eb cũ vẫn theo dõi stability. Dispatch ở mục16 thay hướng dẫn cũ.
Diagnostic061d, default full343 và independent rebuild380 cùng nguồn đã terminal0;
chưa đủ issuer/cross-replica/Linux hoặc toànT06/T08. Không mở gate/public.

## 1. Kết quả cuối cùng cần bàn giao

Khách vào roomqc.com, đăng ký và xác minh email, khai báo khách sạn, được cấp
không gian sử dụng, thêm phòng và mời nhân viên. Khách không phải thuê VPS,
cài Docker, nhập khóa API hoặc cài Supabase.

RoomQC sở hữu và vận hành các cụm VPS chuẩn bị sẵn. Một cụm phục vụ nhiều
workspace; một workspace có thể quản lý nhiều khách sạn theo gói. Dữ liệu
tách biệt bằng quyền phía server và database. Không tạo VPS cho mỗi signup.
Không tự chuyển khách đã có dữ liệu sang cụm khác khi cụm đang dùng đầy/lỗi.

V1 bao gồm: registry, health, admission, capacity budget, đăng ký/resume/reconcile,
hai màn admin, Linux/TLS, backup/restore, alert/on-call, E2E/load và pilot.
V1 không tự thuê VPS, không hứa HA đa vùng, không có SSO xuyên cụm, chưa thu tiền
thật. Quản lý trial/gói/quota có trong phạm vi; tích hợp thanh toán cần gate riêng.
1.000 khách sạn là mục tiêu mở rộng theo cụm, không là bằng chứng 100.000 người
đồng thời. Chỉ công bố sức chứa sau đo trên cấu hình và workload xác định.

## 2. Điểm xuất phát đã đối chiếu và vấn đề phải xử lý trước

Bảng dưới giữ baseline của lần soạn phiếu trước checkpoint790. Trạng thái hiện
hành và thứ tự nhận việc lấy từ [plan tổng thể](roomqc-vps-signup-plan-current-2026-10-26.md),
mục2/6/14; không giao làm lại signed health/key-wide/installer đã có proof.

| Hạng mục | Bằng chứng hiện có | Còn thiếu / cách tiếp tục |
|---|---|---|
| Directory, migration, registry, reservation, command/audit | Nhiều scoped local tests đã có; không làm lại nền như chưa tồn tại | Cần nghiệm thu tích hợp trên candidate hiện hành và staging |
| T04 command-result | Source e5c5deb…; full control 237/237 đã đạt ở checkpoint cũ | Typed client, F5/browser lost-response và command dialog chưa khép |
| T06 health và managed runtime | Source98b0713…control307/307;full343 và independent rebuild380 terminal0 có credential/policy/target/release mutation,fault/recovery/stale/warmup/shutdown và mandatory business checks;source/schema/runtime khớp,cleanup độc lập0 |15ebstability chưa rõ root cause.Không physical exporter/issuer/Linux hoặc đóng toànT06 |
| T08 release validation | Delta781/1261ed46 có signed catalog v2/primary preflight+commit validate/admission/reserve/provision retry/receipt recovery; full control330/330,9ca authority và3ca runtime; held HTTP response sau withdrawal không ghi validate | Còn managed health metadata/health commit/snapshot warmup/harness cutover, installer entry point và thu hồi theo key; hai API/worker process thật, full backend/rebuild781. Directory disable không là remote Auth revoke |
| Direct permissions/current19 | Đã kiểm direct ACL và 23 FK boundary; A/B full-vendor tuần tự từng đạt trên source f7 | RPC/Edge/view/definer/trigger/caller gián tiếp; recipient/offboarding/workflow. Candidate a3aaf có 620 advisor findings: 151 policy WARN, 7 FK INFO, 443 unused-index INFO, 19 no-policy INFO; phải disposition theo caller/workload, không coi exit0 là hết cảnh báo |
| Signup/admin | Có nền intent/bootstrap/provision và admin đọc | setup-status, durable reconciliation/recheck, tenant-summary, alerts/backups và hai console còn thiếu theo inventory |
| Production readiness | Có fixture/runbook local | Linux/TLS, email Internet, offsite restore, on-call, simultaneous A/B, browser/Android, load/soak và pilot chưa nghiệm thu |

Snapshot6f3 lúc lập plan (lịch sử trước sửa fixture): 757 file / 546 migrations,
SHA256 `6f3d1752e256de92e8ae37d4425497bb6a628e287bc125fb42066757660fbed7`.
Đây là manifest có phạm vi kế thừa từ T04 + hai file T08 mới, không phải khẳng
định fingerprint mọi file trong repository hay bản đang deploy.

Hai test từng fail thuộc service-probes.test.mjs: kiểm năm probe thành công và
timeout song song. Đã tái hiện6 test/4 đạt/2 fail và xác nhận canary fixture thiếu
exp. Đã sửa fixture hợp lệ, giữ kiểm expiry sản phẩm và các assertion success/
timeout; thêm negative missing/expired/near-expiry/wrong-type/unsafe exp trước
manifest transport. Source2495ee9… full control243/243 đạt. Chi tiết và failed
history ở reportT08, không xóa hoặc relabel run6f3.

Kết quả 237/237, frontend 388/388 và A/B ở các source cũ chỉ là lịch sử đúng
phạm vi, không gán cho source 6f3. Lượt lập plan này không chạy lại product suite,
không triển khai VPS, thay DB/DNS/provider hay gửi email Internet.
122 releaseAcceptance entries vẫn unverified; owner/reviewer/signoff chưa có tên.

## 3. Kiến trúc và ranh giới dữ liệu phải giữ

Thiết kế chi tiết ở [kiến trúc mục 4](roomqc-vps-signup-preparation-plan-2026-10-21.md#4-kiến-trúc-triển-khai-cần-khóa).

| Thành phần | Trách nhiệm | Không được làm |
|---|---|---|
| Frontend web/Android dùng chung | Nhận slug, resolve cấu hình tối thiểu, hiển thị tiến độ/hành động server trả về | Chọn cluster/tenant/role/gói tùy ý, giữ service key, kết luận success từ toast |
| Control API | Directory, live platform authority, admission, intent, status, admin commands | Proxy toàn bộ nghiệp vụ hoặc dùng JWT metadata cũ thay quyền hiện thời |
| Directory DB riêng | Cluster/host mapping, reservation/job/receipt, health/policy/audit và metadata vận hành | Lưu mật khẩu/JWT của owner trong queue; môi trường lỗi thì fallback DB nghiệp vụ |
| Worker | Thu metric/probe, đối soát receipt, xử lý outbox có lease/fencing | Giả danh owner để tạo tenant; worker cũ ghi đè kết quả worker mới |
| Cụm Supabase | Auth + PostgreSQL + REST + Storage + Realtime + Functions; dữ liệu và quyền khách | Chấp nhận JWT cụm khác; cấp quyền theo user_metadata; mở service_role cho client |
| Backup và giám sát ngoài host | Giữ bản sao/khóa có thể khôi phục, phát hiện cả host chết, gửi người trực | Coi dump cùng VPS là offsite; coi chính host im lặng là host khỏe |

Định danh toàn nền tảng phải bao gồm workspace/cụm, không dùng tenant UUID đơn
lẻ làm khóa toàn cục. Client/cache/request cần scope actor + authority + workspace
+ cluster + routing version tương ứng; logout/đổi quyền phải hủy response cũ.

Trạng thái giữ schema hiện hữu:

- Cluster: active / draining / offline; host và validation là trục riêng.
- Workspace: reserved / provisioning / active / suspended / migrating / expired.
- Job: queued / leased / retry / waiting_owner / needs_review / succeeded / cancelled.
- Health: healthy / degraded / unreachable / unknown; freshness/admission riêng.
- “Chờ email”, “sẵn sàng”, “đang xác minh kết quả” là nhãn giao diện/step,
  không tự thêm enum database.

## 4. Hành trình signup — từng bước, kết quả và cách phục hồi

| Bước | Hệ thống phải làm | Chứng cứ / khi lỗi |
|---|---|---|
| 1. Khách gửi yêu cầu | Validate body, challenge/limiter, tạo hoặc đọc lại intent theo cùng identity | D03/D12/D13; challenge fail không giữ suất; không nhận tenant/role/cluster do client ép |
| 2. Chọn cụm | Kiểm release/credential/health/backup/policy/manual gate và capacity; giữ suất atomically | C05–C08; 20 yêu cầu tranh 1 suất chỉ 1 được cấp; không có cụm thì trả lý do chờ |
| 3. Tạo/xác minh Auth | Giữ affinity đã cấp, email/callback đúng origin và cụm | D02/D04/D15; chưa verified owner thì chưa cấp dữ liệu nghiệp vụ |
| 4. Khai báo khách sạn | Kiểm live owner/session; ghi binding và một job bền vững trước remote call | D01/D05/D07; ID, gói, quota/trial lấy từ server/policy được duyệt |
| 5. Cấp dữ liệu | Transaction phía cụm tạo đúng một bộ tenant/hotel/profile/trial/receipt theo contract | Audit/receipt và row count; retry không tạo thêm hoặc kéo dài trial |
| 6. Hoàn tất directory | Đối chiếu receipt đúng workspace/cụm/routing version rồi activate | D07/D11; mất response sau commit là unknown, không là thất bại cần tạo lại |
| 7. F5/hai tab/thiết bị mới | setup-status private trả state/step/nextAction/retryAfter; tiếp tục cùng binding | D04/D06; người khác không đọc được trạng thái riêng tư; không đổi cụm |
| 8. Tự phục hồi | Worker claim bằng lease/fencing; missing→waiting_owner, unavailable→retry, conflict→needs_review | D08–D10; kill từng cửa sổ; stale worker không activate; không lưu owner token |
| 9. Sử dụng/mời nhân viên | Route đúng cụm, quyền nhân viên được gán server-side, quota phía server | T22; owner mời→nhân viên nhận→đăng nhập→đúng chức năng; revoke có hiệu lực |
| 10. Hết trial/gói hoặc sự cố | Áp grace/read-only/suspend theo policy đã duyệt; giữ dữ liệu và audit | Không tự xóa, không reset trial, không chuyển database; hỗ trợ qua hành động có quyền |

Chỉ bỏ recovery-write trong bootstrap GET và support/reconcile đồng bộ cũ
sau khi job/resume/backfill và fault-recovery được chứng minh. Không để khách
đang đăng ký dở mất đường tiếp tục khi rollout.

## 5. Phiếu triển khai T01–T25

BE: backend; FE: frontend; OPS: vận hành; QA: kiểm thử/review; RQ: RoomQC quyết định.
Đây là vai trò, chưa tự gán tên người. Dependency lấy nguyên ledger; số thứ tự
không cho phép chạy T06 trước T08. Chuẩn bị contract/bundle có thể sớm, nghiệm thu
phải đợi dependency thực. Không tự mở thêm worktree hoặc giao agent trong lượt plan.

| Task / phụ thuộc | Việc phải giao và artifact bàn giao | Nghiệm thu bắt buộc / vai trò |
|---|---|---|
| T01 / — | Chốt source/dirty/image/schema/config/contract; inventory runtime thật; fixture exact-owned và cleanup list | A01–A03; target được xác nhận, CRM/source khác không đổi. BE/OPS → QA |
| T02 / T01 | Directory DB trống/có dữ liệu, migration checksums/lock, runtime least privilege, volumes/readiness/shutdown | A04–A07; two-migrator/rerun/mismatch/rollback/restart; API không DDL/xóa audit. BE/OPS → QA |
| T03 / T01,T02 | Capability/AAL/live session/actor matrix; command mutation+audit+receipt; authority race | A08–A11; anon/staff/wrong actor/revoked deny; valid positive/recovery; audit fail rollback. BE → QA/OPS |
| T04 / T01 | OpenAPI/router/DTO/error/cursor/version/key tương thích; command-result có handler thì giữ regression, nối typed client sau | A03,A08–A11; unknown outcome không bị hiểu là failed; sai key/actor/target không lộ. BE/FE → QA |
| T05 / T01,T04 | Host/mount/DB exporters, fixed queries, bounded probes và private ports | B01–B03; số đo so Linux/DB, quyền/TLS lỗi không thành healthy; không public exporter. OPS/BE → QA |
| T06 / T02,T05,T08 | Nối collection→5 dịch vụ→HealthStore; kiểm credential/target/release/policy revision ngay transaction; persisted windows và deadline | B04–B07; delayed sample/rotation/race/stale/restart không mở admission; timed pipeline thật. BE/OPS → QA |
| T07 / T06 | Alert lifecycle và event+outbox atomic; dedupe, ack/resolve, bounded retry, external heartbeat | B08–B09; restart không mất/nhân alert; ack không mở gate; người trực nhận khi host chết. BE/OPS → QA |
| T08 / T02,T03,T04 | Disposition quyền gián tiếp/policy/FK; issuer, canary, approval catalog, trusted release và target allowlist | A06,B02,C01–C04; giữ regression2 lỗi đã sửa; replay/expiry/tamper/SSRF/revision fence; validate không tự mở nhận mới. BE/OPS → QA |
| T09 / T06,T07,T08 | Admission/reservation/affinity, close/drain/reopen theo version/reason/receipt | C05–C10; tranh suất/replay/close-race/expiry/first-call; giữ route khách cũ. BE → QA/OPS |
| T10 / T09 | Budget tổng pool/vendor/replica/worker/migration/backup; bounded queue/concurrency/deadline/quota | G05–G06; có provisional operating budget trước signup; chốt bằng T23 trên staging. BE/OPS → QA |
| T11 / T03,T04,T09,T10 | Intent→Auth→owner provision; private setup-status; UI resume/hai tab/thiết bị mới | D01–D06,A03; đúng một bộ dữ liệu/trial; no leak/wrong-cluster; nextAction từ server. BE/FE → QA |
| T12 / T11 | Durable job, claim/lease/fencing, receipt reconciliation, backfill và read completion | D07–D11,A07; kill sau claim/trước call/sau call/trước ack; không tạo lại khi commit chưa rõ. BE → QA/OPS |
| T13 / T11,T12 | Persistent multi-instance limiter/challenge/trusted proxy; Auth path và signup-off; email/callback/reset/invite | D12–D15; spoofed IP không bypass, NAT không bị gom sai; Gmail/Outlook thật riêng. BE/OPS/FE → QA |
| T14 / T03,T04 | Hai admin entry, platform guard, typed client, scoped cache và request cancellation | A03,E08; độc lập selectedHotel, logout/revoke/switch không nhận dữ liệu cũ. FE/BE → QA |
| T15 / T06,T07,T09,T14 | Hạ tầng list/detail/health/backup/admission; command dialog và lost-response result read | E03–E05; unknown≠0, impact/reason/version/key rõ; không toast success từ 202. FE/BE → QA/RQ |
| T16 / T12,T14 | Đăng ký mới: search/cursor/totals/timeline/job/receipt; tenant-summary đúng cụm; recheck enqueue/completion | E01,E02,E05,E08; 1.000 metadata, tìm nguyên nhân <30s; không impersonate/recreate. FE/BE → QA/RQ |
| T17 / T13,T15,T16 | Mobile/keyboard/focus/contrast, một menu dễ tìm, Back/scroll giữ ngữ cảnh | E01–E08; 390px/zoom, không pastel khó đọc, không chức năng bị mất đường click. FE/QA → RQ |
| T18 / T06,T08 | Bundle Linux full vendor pin digest, preflight/dry-run/checkpoints; TLS/private ports/cert/reboot/upgrade | F01–F04,B01; sai host/port/secret/volume dừng; redeploy/reboot giữ dữ liệu. OPS/BE → QA |
| T19 / T12,T18 | Backup nhất quán directory+Auth/DB/queue+object bytes+manifest; mã hóa offsite/key độc lập; restore sạch | F05–F08; sai checksum/key/version fail; mất host vẫn login/data/receipt đúng, đo RPO/RTO. OPS → QA/RQ |
| T20 / T07,T18,T19 | Runbook, on-call/escalation/reopen policy; host/DB/disk/cert/credential/backup/signup drills | B09,F09; fault/detected/received/ack/recovery có timestamp và người nhận. OPS → QA/RQ |
| T21 / T12,T13,T18 | Hai backend độc lập **cùng chạy**, Auth/key/DB/objects/channels/volumes riêng | G01–G03; cùng UUID không nhầm, A-token→B bị từ chối kèm positive đúng cụm; A down không fallback DB B. QA/BE/OPS → QA |
| T22 / T17,T21 | Browser/Android: signup→verify→hotel→rooms→invite→staff login; fault/reload/revoke/Back/deep-link/cutover | Các case A/D/E/G liên kết trong worksheet; UI+API+DB/receipt, không chỉ component tests. QA/FE/BE → QA |
| T23 / T10,T21,T22 | Profile hardware/images/data/think-time; load có điều kiện 10→25→50→100; soak ≥60m/noisy-neighbor | G04–G06; p95/p99/errors/pools/IO/queue/cost; max tested và operating limit/headroom tách biệt. QA/OPS → BE/RQ |
| T24 / T19,T20,T22,T23 | Freeze RC, audit đủ 70 case/required environments; secret scan, cutover/rollback, defects/limits và phê duyệt | G07 và full audit; không Critical/High quyền/dữ liệu/cấp phát/restore còn mở trong scope. QA/OPS → BE/FE/RQ |
| T25 / T24 | 1 khách sạn nội bộ, ổn định 24–48h rồi cohort 5–10 đã duyệt; quan sát ≥7 ngày, drill/báo cáo chi phí/support | G08; sau số liệu pilot mới quyết định mở rộng/public; billing riêng. OPS/RQ → QA |

Vị trí triển khai tham chiếu, không phải lời khẳng định đã tồn tại đủ:
`server/control/{app,admin,admin-read,store,cluster,config,command-results,release-validation,release-manifest}.mjs`,
các module health/probe/worker và `server/control/contracts/control-v3.openapi.json`;
migration theo quy trình repository; `scripts/test-control-directory.mjs`,
`scripts/test-control-backend-sandbox.mjs`; route/menu/client ở `src/`,
bundle/runbook ở `deploy/` và docs hiện có. Trước sửa phải tìm đúng caller/module,
đọc diff bẩn, không tạo file trùng chức năng hoặc đoán tên migration.

## 6. Tám đợt bàn giao và thứ tự thực hiện

| Đợt | Nhóm task / mốc người dùng nhìn thấy | Điều kiện chuyển / ước lượng cũ |
|---|---|---|
| 1 | T01–T06/T08 theo dependency: nền, quyền, trust, số đo đáng tin | Hết fail regression và defect High trong phạm vi; pipeline thật. 8–12 ngày công |
| 2 | T07: có cảnh báo và đường xử lý | Dedupe/outbox/retry/restart local; external pending ghi riêng. 3–5 ngày công |
| 3 | T09–T10: biết cụm nào nhận khách, còn bao nhiêu budget | Race/affinity/close đúng, có tổng budget. 2–3 ngày công |
| 4 | T11–T13: khách đăng ký, tiếp tục và tự phục hồi | D01–D14 local; D15 thật giữ gate external. 4–6 ngày công |
| 5 | T14–T17: hai màn admin dùng được | API thật + E01–E08, không dùng mock để nghiệm thu. 4–6 ngày công |
| 6 | T18–T20: vận hành trên Linux, restore và người trực | F01–F09/B01/B09 đúng staging. 4–7 ngày công |
| 7 | T21–T24: E2E/tải/RC có operating limit | Candidate nhất quán, đủ case/môi trường và reviewer. 4–6 ngày công |
| 8 | T25: pilot nhỏ có quan sát | ≥7 ngày đo/drill, quyết định go/no-go. 1–2 ngày công + thời gian quan sát |

Tổng lịch sử 30–47 ngày công, có dự phòng 36–57; đây là dự toán cần ước lượng lại
sau T08/T06 và khi có cấu hình VPS, **không phải thời gian còn lại đã cam kết**.
Không suy số ngày từ tốc độ agent; không cộng thời gian chờ key như công triển khai.
T14 và chuẩn bị bundle có thể bắt đầu khi đúng dependency, không chờ toàn bộ
nhóm đánh số trước kết thúc. T19/T20 không nghiệm thu bằng file template.

## 7. API và hai màn quản trị cần hoàn thiện

Inventory source không thay xác nhận runtime đang deploy:

| Contract | Thực tế đã đối chiếu | Đầu ra cần khép |
|---|---|---|
| signup-intents / bootstrap / provision | Có nền | Strict validation, durable limit/binding/job; cắt recovery cũ có backfill an toàn |
| setup-status | OpenAPI planned; chưa app handler | Private live-owner read, minimal DTO, nextAction/retryAfter/no-store; native allowlist |
| cluster list/detail/commands | Local một phần | Live authority, nguồn health/backup/admission thật và compatibility proof |
| cluster command-result | Handler T04 đã kiểm scoped local ở source trước | Typed client giữ key trước POST, recover F5/lost headers, scope actor và primary read |
| workspace list/detail/timeline | API local có phần đã test | Server cursor/search/totals, tenant-summary đúng cụm và bounded gateway |
| workspace recheck | Planned, chưa durable handler | Một enqueue/receipt, 202 chỉ accepted, completion read riêng; không tạo tenant |
| alerts/backups/acknowledge | Planned | Query/permission/cursor/audit; ack≠resolve; uploaded≠restore verified |

Prefix theo cấu hình hiện tại; không coi đường đề xuất là URL production.
Mọi delta theo chuỗi: contract → handler/permission → typed client/native
allowlist → API integration → UI E2E. 401/403/409/429/503 có code/message/requestId,
không trả raw SQL/DSN/token. Unknown commit không được sinh key mới để retry.

Hai entry đề xuất: `/super-admin/infrastructure` và
`/super-admin/registrations`, phải đăng ký route/menu/guard thực tại T14.

- Hạ tầng: tên cụm/host, trạng thái dịch vụ, thời điểm đo, CPU/RAM/data disk/inode,
  capacity/queue, backup/restore gần nhất và lý do nhận/chặn khách. Detail chỉ mở
  phần kỹ thuật khi cần. Nút đóng/drain/mở/đổi limit theo capability; dialog có
  ảnh hưởng, reason, version, key và kết quả durable.
- Đăng ký mới: slug/workspace, cụm, step, thời điểm cập nhật, lỗi an toàn,
  next action. Search/filter URL + cursor; detail có timeline/job/receipt và
  recheck. Không cho support sửa receipt, đổi cụm hoặc lấy mật khẩu khách.
- Màu phổ thông tương phản rõ, luôn kèm chữ/icon; lỗi/unknown không tô xanh.
  Một menu chính, mọi chức năng có điểm click. Back trả list/filter/scroll trước,
  link trực tiếp có fallback nội bộ hợp lệ. Chuyển trang mới đưa nội dung lên đầu.

## 8. Budget, quota và mở rộng VPS

T10 lập một phiếu budget theo từng cụm: CPU/RAM/OS reserve, disk/data mount/inode,
IOPS, DB max connections, mọi replica×pool, vendor sessions, workers, report,
upload, Realtime, migration/backup và emergency headroom. Cộng budget toàn cụm,
không cấp max pool riêng cho từng service rồi bỏ qua tổng. Chọn pooling mode theo
transaction/session behavior thực; không dùng công thức mỗi user một connection.

Trial/quota/seat/storage/upload/report/retention/grace cần RQ duyệt và version.
Quyền/gói có enforcement phía server, không chỉ ẩn nút. Thiếu policy không tự
chọn số trial hoặc áp xóa dữ liệu. T08/T22 phải có hồi quy hết hạn/revoke/quota.

Admission chỉ nhận mới khi tất cả trục trust/health/freshness/resource/backup/
policy/manual gate đạt. Draft/missing metric/stale/invalid/down/full phải chặn.
Close/drain chỉ ảnh hưởng mới; không logout hoặc chuyển DB của khách cũ.
Đề xuất tăng cụm khi forecast/headroom đạt ngưỡng policy đã duyệt; operator thêm
cụm qua bộ cài, validate, health/backup acceptance rồi mới mở. Di chuyển khách
cũ là quy trình riêng có export/restore/cutover, không phải fallback tự động.

Ngưỡng staging đề xuất, chưa là SLA/policy được áp:

| Chỉ số | Mục tiêu thử | Cách đo |
|---|---|---|
| setup-status / admin list 1.000 metadata | p95 ≤500ms / ≤1s server-side | Dataset, page/payload size, query/trace và window |
| reserve / provision sau submit | p95 ≤1s / ≤10s, chưa tính chờ email | Queue/RPC/commit/activate breakdown |
| Metrics | Thường ≤60s; >120s stale chặn mới | Stop/restart có timestamp và persisted admission |
| Load | 10→25→50→100 phiên chỉ khi mức trước đạt; soak ≥60m | Có think-time, tenant đối chứng, 5xx ngoài fault <1%, không loop HTTP giả user |
| DR | RPO≤24h, RTO≤4h cần phê duyệt | Last consistent point→fault và fault→service verified; không bắt đầu đồng hồ muộn |
| Host loss | detected≤180s, received≤300s đề xuất | Fault/detected/received/ack/recovery từ ngoài host |

RPO 24h nghĩa là có thể mất tối đa một ngày dữ liệu theo mục tiêu; RQ phải chấp
nhận mức mất dữ liệu này hoặc yêu cầu phương án WAL/PITR/đồng bộ object phù hợp.
Không hứa RPO thấp hơn mà chỉ có backup hằng ngày. Operating limit thấp hơn max
tested, headroom phải có lý do; không công bố “100.000 concurrent” từ bảng này.

## 9. Linux/TLS, backup và vận hành

Trước cài: kiểm exact host ID/IP/OS/CPU/RAM/disk/mount/ports, existing volumes,
images/digests, secret refs, origins/callbacks/CSP, firewall/private network,
clock, offsite/rollback và người duyệt. Có dry-run và checkpoint. Sai target,
cổng bận, thiếu secret hoặc volume đã có dữ liệu không được init/overwrite.
Pin full vendor bundle tương thích; CLI dev stack không là bộ production.

Cài/rerun/reboot phải giữ dữ liệu; migration dùng quyền riêng, API runtime không
DDL. Health có live/ready tách biệt. Private DB/metrics/Studio; TLS/WebSocket/
upload/Auth/REST/Storage/Realtime/Functions/callback được thử xuyên proxy.
Rotate khóa/chứng chỉ có plan, provenance/revision fencing, rollback cấu hình
và secret scan. Không nâng Supabase/gateway chỉ để theo docs “latest”.

Backup phải bao gồm directory mapping/job/audit/receipt, DB/Auth/queue ở từng
cụm, object **bytes**, manifest/version và secret refs/khóa cần khôi phục.
Chốt cửa sổ nhất quán: write pause/checkpoint/sequence hoặc phương án đã review;
không ghép dump các thời điểm tùy tiện rồi coi là nhất quán. Mã hóa, checksum,
upload/readback offsite và retention/key custody ngoài failure domain.

Restore host sạch, cách ly không ghi vào source; chống hai bản cùng nhận write.
Kiểm mapping/Auth/login/receipt/job/trial/phòng/mời nhân viên/file bytes,
đối soát trước mở routing. Sai checksum/key/version/missing object phải fail.
Bản backup uploaded không được gắn nhãn restore-verified. Host gốc mất vẫn phải
khôi phục được bằng offsite và người giữ khóa độc lập; đo RPO/RTO thật.

On-call có tên người chính/phụ, đích nhận ngoài host, escalation, giờ support,
người có quyền kill-switch và mở lại. Drill host/control/DB/disk/cert/credential/
backup trễ/signup kẹt có runbook, timestamps, action và recovery proof.
Không dùng chính VPS hỏng làm kênh cảnh báo duy nhất.

## 10. Nghiệm thu: ai chạy, cần chứng cứ gì, khi nào được mở

[Bảng 70 ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) giữ nguyên
scenario/expected/environment/task mapping từ ledger. Mỗi ca phải có:
prepare exact-owned → positive → negative/no-effects → fault/race phù hợp →
recovery positive → API/DB/receipt/audit assertions → cleanup → reviewer.

Mỗi packet ghi case/task/package, candidate/source/image/schema/config/contract,
run/time/command/exit, expected/actual, pass/fail/not_run/partial, data effects,
failed history, limitations, cleanup, rollback, owner/reviewer/signoff.
Không lưu secret/PII. Screenshot/HTTP202/toast không thay row/receipt proof.
Mẫu đầy đủ ở [protocol mục 9](roomqc-vps-signup-acceptance-protocol-2026-10-21.md#9-mẫu-evidence-bắt-buộc).

| Gate | Điều kiện / quyền quyết định |
|---|---|
| L — local integrated | Candidate hiện hành, tests đúng phạm vi, security/receipt/recovery/cleanup và reviewer; không chỉ count xanh |
| S — staging | Exact Linux target/release/origins/TLS/private ports, backup/rollback và người vận hành đã duyệt; external proof theo case |
| P — cho pilot | RC và các ca bắt buộc trước pilot đạt, không Critical/High quyền/dữ liệu/cấp phát/restore; offsite restore/on-call/kill-switch/cohort đã duyệt |
| U — mở public signup | Sau T25/G08 và capacity/abuse/cost review, RQ quyết định riêng; pilot không tự bật public |
| B — thu tiền thật | Payment/provider/security/business acceptance và phê duyệt riêng, ngoài V1 |

G08 chỉ được ký **sau** quan sát pilot; không bắt G08 đạt để bắt đầu pilot.
T24 audit đủ 70 ca: ca pre-pilot phải đủ môi trường, G08 có kế hoạch/cohort và
giữ pending cho tới sau pilot, không tự tính pass. Không bỏ qua staging chỉ vì
local đạt. RequiredEnvironments trong ledger là nguồn quyết định.

Dừng mở rộng/đóng nhận mới khi phát hiện quyền chéo, mất/nhân dữ liệu, cấp phát
trùng, unknown commit bị tạo lại, checksum drift, tài nguyên critical hoặc
không restore được. Giữ route khách cũ; dừng claim mới nếu cần; đối soát receipt;
rollback binary/config tương thích. Không reset DB, down-migrate phá dữ liệu,
xóa tenant/job hoặc sửa lịch sử để dashboard xanh.

## 11. Đầu vào cần chốt và phần vẫn làm được nếu chưa có quyền

| Đầu vào / người chịu trách nhiệm đề xuất | Cần trước | Khi thiếu |
|---|---|---|
| Tên implementer/reviewer/OPS/release owner — RQ | Nhận ticket/ký packet | Giữ tên/signoff null, không tự ký thay |
| Trial/quota/grace/retention/export/delete/capability/MFA — RQ+BE/OPS | Feature/gate liên quan T03/T11/T13/T25 | Giữ policy hiện được duyệt; viết contract/test tham số, không tự áp default mới |
| VPS staging exact target, cấu hình, network, mount/port và budget — RQ/OPS | T05/T10/T18/T23 proof thật | Làm bundle/preflight/disposable tests; không SSH/apply vào host đoán |
| DNS roomqc.com, exact app/API/admin/callback/Android origins — quản DNS/OPS | T13/T18/T22 | Làm template/local allowlist; tên miền đã nêu không chứng minh sở hữu/cấu hình xong |
| Email provider, sender verified, webhook và Gmail/Outlook thử — quản email | D15 | Outbox/internal sink local; không coi nhận Mailpit là Internet deliverability |
| Offsite store, retention/cost và người giữ key độc lập — OPS/RQ | T19 | Làm manifest/clean restore local; không ký mất-host recovery |
| External heartbeat/alert destination/on-call/escalation — OPS/RQ | T20/P | Làm lifecycle local, giữ received-on-host-loss pending |
| Cohort/consent/support window/operating limit/kill-switch owner — RQ | P/U | Hoàn thiện RC; chưa thêm khách hoặc mở public |

Không yêu cầu gửi mật khẩu/API key/SSH key trong chat. Ghi secret reference và
người giữ, chỉ mount qua kho vận hành. Thiếu một input chỉ hoãn đúng case/gate,
không bỏ toàn roadmap, không tính pass hoặc tự cấp quyền mới.

## 12. Phiếu công việc đầu tiên khi được triển khai tiếp

Checklist con T01/T03/T04/T08/T06, không thêm mã roadmap. Các bước sửa fixture
và full regression trước đó đã có [packetT08](roomqc-t08-release-validation-local-2026-10-22.md),
không nhận lại như việc chưa làm hoặc chạy lặp chỉ để tăng số test.

1. Nhận [checkpoint26-10](roomqc-t06-credential-cycle-local-2026-10-26.md):
   source9518716…,773file/546business+9directory migrations, control298/298,
   0fail/skip/cancel,exit0. Backend diagnostic974dba/85c9ebe terminal0 nhưng
   không là full timed/rebuild951. Giữ stability follow-up15eb cũ; tiếp
   genuine config/restart và full regression/rebuild ở
   [mục14.4](#144-lượt-thực-hiện-kế-tiếp--khép-khoảng-trống-của-packet), không
   triển khai lại installer-only disable hoặc atomic health đã có.
   [Source-binding770](roomqc-t06-source-binding-local-2026-10-22.md) đã có
   default backend d4feca68d43b/session69733 terminal0,17mốc thật và independent
   cleanup0. Đây là lịch sử source39d3efd…, không thay full backend771 hoặc
   independent rebuild. [Timed768](roomqc-t06-managed-timed-local-2026-10-22.md)
   và A/B/FE cũ cũng giữ đúng phạm vi, không thừa kế pass sang mã thay đổi.
2. Hoàn tất current19 indirect: effective grants/inherited roles và mọi RPC/Edge/
   view/definer/trigger/FK/dynamic entry; 151 policy WARN và 7 FK INFO của candidate
   a3aaf phải có disposition cụ thể. Count135 thuộc checkpoint cũ, không là mẫu số
   hiện hành. Positive→negative no-effects→recovery qua actual caller; review cả
   443 unused-index và 19 no-policy INFO, không tự xóa index/policy để giảm count.
3. Khép recipient/offboarding/EC10–EC15/workflow còn thiếu theo inventory, giữ
   các invitation/current19/direct23-FK/T04 regressions đã có. Ghi rõ mẫu số
   thực chạy/chưa chạy, không dùng structural checks thay E2E.
4. Nhận [disable771](roomqc-t08-probe-disable-local-2026-10-22.md): installer-only
   store+DB guard, audit/upgrade/late actual Auth response đã đạt scoped local.
   Không giao lại như chưa có; tiếp trusted issuer/provision/rotate/remote revoke
   và approval provenance ngoài runtime. File catalog thủ công không thay
   automation/multi-replica; combined metrics/config/restart drill còn thiếu.
5. Giữ hồi quy [atomic health](roomqc-t06-health-proof-local-2026-10-22.md) và
   managed runtime: ràng buộc credential/target/release/policy ngay transaction
   write/admission read, hai role/pool tách biệt và tổng connection budget.
   Không triển khai lại các boundary/wiring đã đạt như việc chưa làm.
6. Giữ hồi quy packet mục14 đã đo: registry→manager→5 probes thật→metrics thật→
   HealthStore→admission, warmup/stale/fault/restart/recovery theo thời gian thực.
   Tiếp phần còn thiếu: trust/config rotation trong cùng timed drill, approved
   issuer/multi-replica, Linux/staging. Không giữ transaction qua HTTP, fake
   clock/backdate sample hoặc bỏ full-vendor workflows. Giữ unknown fail-closed.
7. Tiếp alert→admission/budget→signup/status/resume/reconcile→hai admin console→
   Linux/TLS/offsite/on-call→simultaneous A/B/browser/Android/load/RC→pilot theo
   dependency. Phần cần khóa hoãn đúng external acceptance, không dừng roadmap.
8. Mỗi delta có focused tests; freeze rồi regression phù hợp trước gate;
   packet gồm actual/failures/limits/cleanup/rollback/next action. Ledger/gates
   chỉ đổi sau đủ evidence và reviewer, không theo số test hoặc diagnostic checkpoint.

## 13. Nghiệm thu chính bộ kế hoạch này

Kế hoạch được coi là sẵn sàng giao việc khi: đủ T01–T25/70 case và mapping;
dependency không vòng; không bỏ đường click/operation; phân biệt implemented,
planned và test scope; có owner role/input/deliverable/DoD, rollback và stop rule;
mỗi input external có điểm cần; số liệu lịch sử không gán source mới.

Đây không phải tuyên bố đạt 70 ca sản phẩm. Kết quả kiểm tính nhất quán tài liệu
và source/index/ledger guard nằm trong
[planning refresh artifact](../../../artifacts/roomqc-vps-signup-execution-ready-2026-10-22.json).
Nguồn dài hơn vẫn giữ lịch sử, đọc checkpoint mới đầu trang trước nội dung cũ.

Lượt chốt toàn bộ VPS + signup hiện hành có
[biên bản kiểm tra kế hoạch](../../../artifacts/roomqc-vps-signup-plan-acceptance-handoff-2026-10-22.json)
riêng; không ghi đè artifact kiểm thử hoặc lịch sử phê duyệt trước đó.

Lượt xác nhận trước **toàn bộ VPS + signup / plan + nghiệm thu** cập nhật
dispatch theo candidate771/source01ac08e…; đó là checkpoint lịch sử.
[Biên bản kiểm tra tài liệu trước đó](../../../artifacts/roomqc-vps-signup-planning-verification-2026-10-22.json)
giữ snapshot768; biên bản771 được dẫn riêng bên dưới, không ghi đè lịch sử.
Nghiệm thu tính nhất quán của bộ kế hoạch không là 70 ca sản phẩm đạt.

Hướng dẫn Supabase/PostgreSQL đã dùng để khóa các yêu cầu quyền hiện thời,
không lộ service key, RLS đúng tenant, pooling theo workload, pin vendor và tự chịu
backup/DR khi self-host. Không thay schema hoặc config sản phẩm trong lượt này.
Nguồn đối chiếu ngày 22/10:
[changelog](https://supabase.com/changelog.md),
[self-host Docker](https://supabase.com/docs/guides/self-hosting/docker),
[sessions](https://supabase.com/docs/guides/auth/sessions).
Thông báo TLS managed không tự chứng minh pinned self-host bundle cần nâng;
phải review tương thích endpoint/client thực khi nghiệm thu staging.

Biên bản cập nhật theo candidate771 ở
[kiểm tra kế hoạch771](../../../artifacts/roomqc-vps-signup-plan-validation-771-2026-10-22.json);
artifact planning-verification trước đó vẫn giữ snapshot768, không bị relabel.

Cập nhật23/10 nhận terminal diagnostic773, không sửa source trong phần chốt
plan này. Xem [kiểm tra kế hoạch773](../../../artifacts/roomqc-vps-signup-plan-validation-773-2026-10-23.json):
nghiệm thu tài liệu khác nghiệm thu sản phẩm; ở checkpoint23-10 chu kỳ/recovery vẫn mở.

Cập nhật26/10 được kiểm riêng ở
[biên bản plan hiện hành](../../../artifacts/roomqc-vps-signup-plan-validation-2026-10-26.json).
Artifact773/23-10 giữ hash/tình trạng lịch sử, không relabel theo source mới.

## 14. Packet tích hợp tiếp theo — T05/T06/T08, không thêm task hoặc case

**Dispatch hiện hành ở mục16.** Các bước dưới đây giữ thiết kế và checkpoint lịch
sử;không giao lại policy/target/restart subset đã có proofc9cc/65a8128.

Mục tiêu: chứng minh cấu hình managed đã viết thực sự nối được năm dịch vụ,
nguồn metrics và directory trong cùng một lần chạy. Đây là phần nghiệm thu
local có phạm vi của B02/B04–B07/C01–C04; không tự đóng toàn bộ các ca đó,
không thay B01 Linux staging, không thay backup/offsite hoặc pilot.

**Trạng thái hiện hành:** bảng dưới giữ thiết kế nghiệm thu, không tự đánh dấu
toàn bộ pass. [Packet source-binding770](roomqc-t06-source-binding-local-2026-10-22.md)
đã có default full backend terminal0 và17mốc thật; timed768 giữ lịch sử.
Bước10 đã có scoped credential diagnostic974dba/85c9ebe terminal0;
config/restart và full combined acceptance vẫn thiếu. Timeout15eb cũ giữ
stability follow-up; source binding đã có. Trình tự tiếp tục cụ thể ở
[mục14.4](#144-lượt-thực-hiện-kế-tiếp--khép-khoảng-trống-của-packet).

### 14.1. Đầu vào, phạm vi thay đổi và người nhận

- BE/OPS thực hiện, QA độc lập review; RQ chỉ định tên trước ký. Trong lúc chưa
  có tên chỉ chuẩn bị công việc, không tự điền reviewer/signoff.
- Lượt tiếp theo kế thừa source9518716…/773 với control298/298 và directory9;
  scoped diagnostic974dba/85c9ebe terminal0 đã qua disable/recovery/shutdown.
  Source cuối chỉ khác isolated test; không relabel proof hoặc bỏ stability follow-up15eb.
  Full backend770/39d3efd,768/a3aaf và765/10e89 giữ lịch sử đúng phạm vi.
  Freeze lại source/image/migration/schema/
  config sau mọi delta. Giữ full vendor pin, không nâng gateway/Auth/Postgres
  chỉ vì changelog mới. Review cảnh báo tương thích/bảo mật theo release thực.
- Sửa đúng harness/setup/monitoring cần thiết:
  `scripts/test-control-backend-sandbox.mjs`,
  `scripts/control-backend-service-setup.mjs`, renderer/compose monitoring và
  health workers hiện hữu. Không bỏ permission/password/invitation/recovery
  checks bắt buộc để rút thời gian. Diagnostic riêng không là full-build proof.
- Chỉ tạo tài nguyên disposable có exact run/project/label và cleanup đã kiểm
  đường dẫn. Không dùng DB đang phục vụ, CRM, DNS, VPS thật hoặc email Internet.
  Không xuất ownership.json, bundle, keyring, refresh token hay log private.

### 14.2. Các bước chạy và bằng chứng bắt buộc

| Bước | Cách thực hiện | Bằng chứng đạt / điều kiện dừng |
|---|---|---|
| 1. Preflight | Ghi baseline, Docker/Compose thực, pin images, quyền fixture, nguồn đo mount và owned cleanup plan | Sai runtime/target/manifest thì dừng trước mutation; lỗi tool discovery phải kiểm đúng môi trường, không tự sửa Docker toàn máy |
| 2. Dựng full backend | Một stack exact-owned, không public DB/exporter; giữ build Auth và mọi business migration/check hiện có | Năm dịch vụ đáp ứng positive checks; schema sau private Realtime initialization được freeze |
| 3. Cấp canary | Chỉ installer tạo account/object thử và durable session bundle riêng tư; worker nhận credential đã giới hạn quyền | Xác thực đúng user/session/expiry/publishable key/target; runtime không giữ installer hoặc service-role key |
| 4. Nối số đo thật | node_exporter + postgres_exporter ít quyền + Prometheus trên private network; dùng mount chứa volume thực | CPU/RAM/disk/inode/connections có provenance/labels; Windows ghi docker-desktop-vm, không nhận là Linux VPS proof; không tự tạo số đo khỏe |
| 5. Chạy managed runtime | Nạp catalog/DSN/keyring qua file riêng, metrics và probe là hai PG role/pool; dùng collector mặc định thật | Directory có sample/revision đúng đích; probe role không đọc quyền metrics và ngược lại; query/acquire/shutdown được giới hạn; tính cả hai pool |
| 6. Warmup thật | Lấy mẫu liên tục theo cadence cấu hình, không sửa clock, firstValidAt hoặc timestamps để rút ngắn | Trước 300s vẫn warming; sau đủ 300s hợp lệ mới có thể healthy. Nếu máy không đủ ngưỡng, ghi nguyên nhân blocked, không sửa policy để ép xanh |
| 7. Fault từng dịch vụ | Dừng/khôi phục lần lượt Auth/REST/Storage/Realtime/Functions thuộc stack thử, có positive trước và sau mỗi fault | Probe đúng dịch vụ lỗi; sau ≥60s và ≥3 mẫu lỗi đủ điều kiện BACKEND_UNREACHABLE. Phân biệt lỗi phụ thuộc thực, không giả năm boolean |
| 8. Mất metrics/stale | Ngắt nguồn đo đủ >120s với timestamps thật, giữ directory hoạt động | Stale/unknown được lưu, admission chặn nhận mới; không suy số 0 là khỏe; mapping khách cũ không đổi |
| 9. Restart và recovery | Restart worker giữa fault/recovery, tiếp tục cùng dữ liệu directory | Cửa sổ lỗi không mất; fault đã latch chỉ được gỡ sau ≥600s hồi phục liên tục theo policy hiện hành; stale restart phải warmup lại khi mất continuity |
| 10. Trust/config thay đổi | Rotate/revoke credential, đổi revision/catalog đã duyệt hoặc gây lệch config trong fixture; phục hồi bằng quy trình installer | Proof cũ không ghi/mở admission; không kéo dài expiry, bỏ signature/fence hoặc cấp thêm runtime grant để vượt test |
| 11. Kiểm ba trục | Đọc worker live/ready, persisted health và admission trong cùng timeline | Worker hoàn thành cycle không đồng nghĩa cluster healthy; healthy không đồng nghĩa admission open. Manual/reopen/backup/release/capacity gate độc lập vẫn phải được giải thích |
| 12. Regression/cleanup | Khôi phục dịch vụ, chạy full mandatory workflow và schema-frozen assertions; đóng hai pool, cleanup độc lập | Có terminal exit, actual counts/fail/skip/limits; mọi resource owned có disposition, leftovers0 hoặc defect cụ thể; không sửa failure history |

Đối với bước 11, fixture có thể cấp backup/release/manual metadata phục vụ
thử admission, nhưng phải ghi rõ đó là **fixture**, không là bằng chứng offsite
restore, trusted issuer automation hoặc phê duyệt mở public. Không gọi command
mở nhận khách trên serving runtime. Toàn-cycle deadline chỉ được ghi đạt nếu
đã đo cả bước DB assert/write, không chỉ timeout của HTTP collector.

### 14.3. Điều kiện bàn giao packet

Chỉ coi packet này đạt khi có timeline sanitised start/observed/persisted/fault/
recovery, source và image digests, source metrics thật, outcomes từng bước,
API/DB/revision assertions, secret-safe artifact, terminal full run và cleanup
độc lập. Giữ mọi run fail cùng nguyên nhân/fix/rerun; một happy-path không đủ.

Sau packet mới re-estimate phần còn lại; tiếp indirect/workflow/issuer chưa
khép, rồi T07→T09/T10→T11–T13→T14–T17→T18–T20→T21–T24→T25 theo dependency.
Không chốt lịch hoàn thành hay sức chứa trước inventory staging và đo tải.

### 14.4. Lượt thực hiện kế tiếp — khép khoảng trống của packet

Đây là checklist con T01/T05/T06/T08, **không thêm task/case**. BE/OPS thực hiện;
QA độc lập đối chiếu bằng chứng trước đề xuất nghiệm thu. Chỉ thao tác tài nguyên
disposable exact-owned; admission luôn manual_closed. Chưa có reviewer được
chỉ định thì ghi chưa ký, không tự coi packet là release approval.

| Thứ tự | Việc cần làm và đầu ra | Điều kiện nghiệm thu / khi không đạt |
|---|---|---|
| 1. Chốt đầu vào | Nhận9518716…/773/546+9, control298/298; scoped974dba/85c9ebe terminal0;15eb cũ giữ stability follow-up. Ghi dirty/source/image/config/schema/ownership và run failures | Không relabel diagnostic thành default full951/rebuild; source đầu/cuối khớp, target sai dừng trước mutation |
| 2. Ràng buộc bộ nguồn | Source9518716… có runtime/orchestrator set142/65b528d0…; diagnostic85c có set142/a5c2b393…. Giữ manifest path/LF cho runtime/migrations/package/harness/relay/monitoring và render digest không secret | Reference phải có default fullTimedDrillExecuted và credentialMutation verified; diagnostic/770 cũ không đủ điều kiện. Không relabel digest theo delta test-only; mutation/omission checks không đọc .env/keyring/bundle |
| 3. Chuẩn bị điểm quan sát | Nếu cần, dùng gate fixture giới hạn thời gian để giữ một response thật trên relay private cố định rồi thả lại; ghi observed-before-mutation và released-after-mutation | Không tạo payload metric/probe giả, không mở đích tùy ý/public port. Luôn release trong finally; deadline collector không bị nới để che lỗi. Chưa quan sát được overlap thì case chưa chứng minh race |
| 4. Rotation đang thu thập |773 đã quan sát actual response overlap, revision1→2, HEALTH_PROOF_CHANGED tại commit và sample mới generation2/warming; giữ regression, không nhận là full warmup | Rerun giữ persisted sample/audit unchanged ở old cycle, positive revision mới và admission đóng; không lưu password/token hoặc suy cả packet đã pass |
| 5. Thu hồi/hết hiệu lực |974dba/85c9ebe đã fence disable2→3, quan sát next cycle PROBE_CREDENTIAL_DISABLED và same-user/new-session recovery3→4; shutdown/render/source/cleanup đạt.15eb cũ không tái hiện, root cause chưa rõ | Không gọi đây là production scheduler fix/full acceptance. Giữ stability follow-up trong default full/rebuild; remote Auth revoke, approval expiry/withdrawal/issuer vẫn mở |
| 6. Đổi cấu hình đang chạy | Lần lượt đổi approved catalog/release, policy revision và target binding của fixture trong khi collection còn chạy; kiểm cả worker restart | Sample/proof cũ bị fence tại write và admission read; không dùng snapshot healthy cũ. Ghi đúng version/timestamps; recovery phải tuân warmup/continuity policy, không backdate hoặc sửa gate bằng SQL |
| 7. Hồi quy và rebuild đối chứng | Focused tests → freeze → full control DB-enabled → default full backend giữ mọi business check → rebuild độc lập có cùng manifest; giữ timeline/recovery/shutdown | Terminal exit/fail/skip và source/image/schema/config khớp; source delta phải có regression tương ứng. Unit-only/diagnostic không thay full run. Rebuild tuần tự vẫn không thay T21 hai cụm đồng thời |
| 8. Bàn giao có giới hạn | Report + JSON sanitize: từng nhánh observed/actual, failure history, proof revisions, remaining gaps, independent cleanup và rollback | Không secret/PII, leftovers0 hoặc defect có disposition. Không đổi122 release entries/gates nếu chưa đủ case/môi trường/reviewer; issuer automation/cross-replica/Linux vẫn ghi riêng nếu chưa chứng minh |

Chỉ sau phần này mới ước lượng lại phần còn lại của đợt1. Tiếp tục các khoảng
trống quyền/workflow/issuer theo mục12 rồi T07 trở đi theo dependency; không dừng
toàn roadmap chỉ vì chưa có khóa DNS/email/VPS, cũng không bỏ nghiệm thu external.

## 15. Phiếu thực hiện và nghiệm thu chi tiết cập nhật23/10

Đây là phần giao việc còn mở, đọc trước các checkpoint lịch sử. Không thêm
task/case/package, không thay dependsOn hoặc requiredEnvironments trong ledger.
Công việc đang có scope local; mọi thao tác VPS/DNS/email thật phải có exact
target, input và quyền tương ứng. Không yêu cầu khách hàng làm các bước này.

### 15.1. Khép lỗi chu kỳ disable và recovery trước khi nhận packet tích hợp

Cập nhật26/10: [974dba/85c9ebe](roomqc-t06-credential-cycle-local-2026-10-26.md)
đã hoàn tất scoped diagnostic dưới đây, không cần triển khai lại instrumentation
hoặc chạy lại chỉ để tăng count. Source951 chỉ sửa test timeout độc lập và có
control298/298.15eb cũ chưa rõ nguyên nhân, giữ follow-up trong default full
run/rebuild. **Việc kỹ thuật nhận ngay là15.2 genuine config/restart**, không
coi credential diagnostic là đóng toàn packet hoặc issuer proof.

Người thực hiện: BE/OPS; người kiểm: QA độc lập; người ký: RQ chỉ định.
Hiện chưa có tên/reviewer/signoff. Input là report773 và private diagnostics
đúng ownership; không dùng fixture đã cleanup như dịch vụ còn chạy.

| Bước | Thao tác và dữ liệu cần thu | Đầu ra / tiêu chí đạt |
|---|---|---|
|1| Xác nhận scoped source0f1c605…/773, runtime-set142, migrations546+9, dirty diff, test command và Docker target; kiểm không trùng serving stack | Baseline có hash/config/image/schema/contract và owned cleanup plan; sai target dừng trước mutation |
|2| Đọc allowlisted diagnostic15eb: first sample→rotate fence→rotate recovery→disable fence→timeout; chỉ đọc cycle timestamps/codes/counters/state/revision | Giữ run exit1; tách actual observed và expected chưa thấy; không kết luận nguyên nhân từ errorCode wrapper |
|3| Tái hiện có giới hạn: fixture mới, installer/reader tách worker; ghi cycle start/finish/active, worker status, credential state/revision, audit counts; kiểm đường readiness→stale sweep→assertTarget→manager→collector→record | Xác định chu kỳ không chạy, bị chặn sớm, lỗi runtime hay assertion quan sát sai; không in secret/PII hoặc dump private state |
|4| Bổ sung focused regression sát nguyên nhân; chỉ sửa source trong integration sau khi có chẩn đoán | Không đổi grant/vendor/production deadline để vượt test; không bỏ kiểm disable/recovery. Nếu expected code đổi do thứ tự guard hợp lệ, phải review contract và chứng minh counters/no-effects |
|5| Rerun rotation và disable trong lúc response metrics thật đang held; installer expectedRevision; release trong finally |1→2 và2→3 mỗi lần đúng một audit/revision; old cycle0 successful targets, không persisted sample/collector audit/policy change, admission đóng |
|6| Quan sát ít nhất một cycle hoàn tất **sau** disable, không nhầm lastErrorCode của cycle vừa bị fence | Credential vẫn disabled, không runtime tự bật/refresh; không forbidden probe/metric I/O hoặc health write. Code và sequence phù hợp contract đã review; explicit no-effects bằng counters |
|7| Installer sign-in cùng canary user, session mới; recover expectedRevision; cho runtime nhận sample hợp lệ mới | Revision tăng một lần; warming/firstValidAt mới theo policy; không kéo dài expiry cũ hoặc fake clock; admission manual_closed; disable/recovery race và old revision đều bị chặn |
|8| Dừng worker có kiểm soát, kiểm exit/pools/config/source, cleanup độc lập; xuất report+JSON | Graceful exit0 và hai pool đóng; container/network/volume owned0; failed history giữ nguyên. Đây mới là credential diagnostic đạt, chưa là default full backend hoặc nghiệm thu toànT06/T08 |

Không rerun vô hạn trên cùng lỗi. Sau tối đa2–3 thử nghiệm cùng cách mà không
tăng hiểu biết, quay lại chẩn đoán/thiết kế quan sát. Không chỉ nới150s để ép
xanh. Phân biệt backoff/cycle hoàn tất với chờ một code trong snapshot cũ.

### 15.2. Chính xác thế nào là thay đổi cấu hình có hiệu lực

Sau15.1 mới freeze packet kết hợp. Target/release/catalog được duyệt là input
có version; catalog trong process là immutable startup snapshot. Chỉnh file
mà không thay authority/reload không chứng minh revoke hoặc hot-reload.

| Nhánh trongT06/T08 | Mutation hợp lệ và mốc quan sát | Bắt buộc kiểm / phục hồi |
|---|---|---|
| Policy | Dùng update_policy có capability, reason/key và expected row_version; hold actual collection trước commit | Old proof.policyVersion bị fence; policy+audit+receipt atomic; new sample đúng version. Replay cùng key không tăng version hai lần |
| Telemetry target | Inventory duyệt target khác thật; dùng bind_telemetry_target và fingerprint hợp lệ, không SQL bump version/time | Old target/sample không ghi hoặc mở admission. Phục hồi binding qua command được duyệt và warmup mới; cùng fingerprint không được giả là revision mới |
| Release/validation | Dùng release/schema/catalog revision được authority phê duyệt; old worker đang collection, control authority đã đổi | Old binding/release bị fence tại write/read; invalidate không mở admission. Revalidate và installer credential khớp release mới rồi mới có positive |
| Catalog/restart | Ghi digest catalog cũ/mới và authority revision; restart đúng worker với readonly config mới | Chứng minh process cũ không thể authorize/commit sai; process mới nạp đúng snapshot. Startup lỗi giữ unknown/closed, không fallback catalog cũ |
| Approval expiry/withdrawal | Approval thật có hạn/revision; expiry theo clock thật hoặc withdrawal có audit và authority live | Loaded approval cũ không còn hiệu lực trên cả replica; không backdate sample, kéo dài exp hoặc gọi synthetic approval là issuer proof |
| Hai replica/refresh | Hai runtime có identity/pool budget riêng, cùng directory; đổi/thu hồi quyền trong lúc cạnh tranh | Lease/fencing chỉ một tác động hợp lệ; stale worker không ghi đè; refresh uncertain không replay token. Mất replica không mở fallback DB |

Mỗi nhánh có positive trước mutation, negative không tác động cấm, recovery
positive và source/config/image/schema binding. Đo deadline toàn cycle gồm DB
assert/write, không chỉ HTTP. Không giữ SQL transaction/lock qua network I/O.

Sau đó: focused→freeze→DB-enabled full control→default full backend không
--diagnostic→independent full rebuild với reference hợp lệ. Cả hai full runs
phải terminal, mọi mandatory business check/timed windows còn nguyên, source/
render/schema khớp và cleanup riêng. Sequential rebuild không thayT21 hai cụm
đồng thời. Không dùng default backend770 làm reference773 vì chưa có proof mới.

### 15.3. Các packet còn lại của toàn hệ thống

Mỗi dòng là checklist con củaT đã có; input/output/DoD và owner role bổ sung
cho bảng25task mục5. Không phải trạng thái đã hoàn thành.

| Packet / điều kiện vào | Thứ tự triển khai thực tế | Bàn giao và nghiệm thu |
|---|---|---|
| Quyền/issuer — T03/T08, chạy song song về chuẩn bị khi đủ dependency | Inventory current19 actual callers→effective/inherited grants→RPC/Edge/view/definer/trigger/FK→recipient/offboarding/workflow→disposition advisors→issuer signing/rotation/revoke/cross-replica | Matrix allowed effects, positive/negative/no-effects/recovery;620findings lịch sử phải disposition hoặc rescan có source. Không xóa index/policy để giảm count, không dùng user_metadata để cấp quyền |
| Cảnh báo — T07 sauT06 | Chốt identity/dedupe key/severity→event+outbox atomic→dispatch bounded retry/lease→ack/resolve lifecycle→restart và silent-host detection | API/DB/events/outbox đúng một lần theo contract; ack không resolve/mở gate. External destination thiếu thì đểB09 external pending, local vẫn làm |
| Nhận khách/tài nguyên — T09/T10 sau dependency | Đọc trust/health/backup/policy/capacity hiện thời→reserve atomic và affinity→close/drain/reopen commands→reservation expiry/replay→pool/queue/quota/headroom |20request tranh1suất chỉ1;20replay một intent không nhân workspace/trial; close-race không cấp sau closure; existing route không đổi. Budget tính mọi replica/vendor/worker/report/backup/migration, không mỗi user một connection |
| Đăng ký — T11/T12 sau admission/budget | Contract+private setup-status→live verified owner→durable job trước remote call→transaction tenant/hotel/profile/trial/receipt→activate directory→resume→reconcile/backfill | D01–D11: một bộ dữ liệu; loss-after-commit là unknown chờ receipt, không create lại. Kill sau claim/trước remote/sau commit/trước ack, stale lease bị fence. Không lưu JWT/password owner vào job hoặc worker giả owner |
| Chống lạm dụng/email — T13 | Durable limiter dùng chung replica→trusted proxy/challenge→Auth signup-off→callback/origin/native allowlist→verify/reset/invite email | D12–D15: spoofed IP không bypass, NAT không bị gom sai, resend idempotent/giới hạn. Gmail/Outlook/link expired/used/wrong-cluster và provider bounce thật nghiệm thu riêng; sandbox SMTP không thay Internet |
| Hai màn admin — T14–T17 | Route/menu/guard→typed client/cache scope/cancel→Hạ tầng→Đăng ký mới→command/recheck completion read→mobile/Back/scroll | E01–E08 trên API thật và1.000metadata. Tìm signup kẹt<30s; command lost-response giữ original key,202 không toast completed; unknown không là0.390px/keyboard/zoom, không chức năng bị mất điểm click |
| Linux/DR/on-call — T18–T20 | Preflight/dry-run/bundle pin→TLS/private network→deploy/rerun/reboot/upgrade→backup consistent/offsite/key custody→restore host sạch→external alert/escalation drills | F01–F09/B01/B09 trên target staging đã duyệt. Restore DB/Auth/directory/queue/object bytes/receipt và login đúng; đo RPO/RTO từ thời điểm fault thật, không chỉ file backup tồn tại |
| A/B/E2E/load/RC — T21–T24 | Hai stack đồng thời→browser/Android real journeys→fault/reload/revoke→ramp load→soak/noisy neighbor→freeze/review/rollback RC | G01–G07 + linked A/D/E: token/object/channel/UUID cùng tên không lẫn; max tested ≠ operating limit. Mọi70case được audit, G08 pending đúng pilot; không Critical/High liên quan quyền/dữ liệu/cấp phát/restore còn mở |
| Pilot — T25 sauT24 và gateP |1KS nội bộ→24–48h ổn định→cohort5–10 được duyệt→quan sát≥7ngày→incident/drill/support/cost report | G08 có số liệu dùng thật và rollback/kill-switch owner. Mở publicU/thu tiềnB cần quyết định riêng, không suy từ test local hoặc tự tăng cohort |

### 15.4. Một hồ sơ quản lý xuyên suốt cho mỗi khách đăng ký

T11/T12/T16 phải dùng một nguồn trạng thái directory, không thêm nhiều dashboard
với số liệu khác nhau. Dữ liệu quản trị tối thiểu cần đối chiếu:

| Nhóm | Trường/quan hệ cần có hoặc chuẩn hóa quaDTO | Ai thấy / thao tác |
|---|---|---|
| Định danh/routing | workspaceId+slug, clusterId, tenantId/hotelId khi đã có, routingVersion; correlation intent/job/receipt | Owner chỉ workspace của mình; support theo capability. Không lookup bằng tenant UUID toàn cục đơn lẻ |
| Tiến độ | state/step, safe reasonCode, updatedAt, nextAction/retryAfter, attempt/lease metadata được phép | Owner nhận hướng dẫn tiếp tục; admin xem timeline; không trả raw SQL/DSN/token hoặc recipientPII không cần thiết |
| Gói sử dụng | plan/policyVersion, trialStart/end, seat/hotel/storage quota và usage, grace/suspension theo policy được duyệt | Enforcement server-side; đổi gói có version/reason/audit. Không reset trial vì retry hoặc sửa toast |
| Công việc phục hồi | jobId/status/attempt/nextRun, receipt commit/binding, conflict/needs_review, result read | Recheck enqueue duy nhất, không recreate/đổi cụm/impersonate. Unknown commit phải đối soát trước |
| An toàn/vận hành | health/freshness/admission reasons của cụm, backup/restore status/time, release/schema version | Admin theo quyền; không lộ host private/secret cho khách. uploaded không là restore_verified |
| Lịch sử lệnh | actor/authority/target/operation/key/version/result/requestId/time và audit linkage | Lưu key trước POST; đọc receipt primary khi mất response; không gửi lại mutation bằng key mới khi chưa rõ kết quả |

Tên trường cụ thể phải theo contract hiện hữu hoặc migration/API review,
không tự thêm enum database theo nhãnUI. Trạng thái workspace/job/cluster/health
khác nhau; UI không gộp thành một nhãn “đã xong”.

Hằng ngày OPS cần xử lý theo ưu tiên: alert chưa nhận→backup/credential/cert
sắp hết hạn→signup retry/needs_review/lease kẹt→capacity/cost/headroom. Tác vụ
nào chưa có UI phải có entry command/runbook có quyền; không cho sửa DB tay
hoặc có nút được render nhưng handler chưa tồn tại. Định kỳ restore/drill và
retention theo policy đã duyệt; lượt plan này không tự tạo automation.

### 15.5. Trình tự nghiệm thu và điều kiện mở cho khách thật

1. Mỗi packet có source/image/schema/config/contract, exact target và timestamp.
   Mỗi case có actual/evidence riêng cho từng requiredEnvironment trong
   [worksheet70](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md).
2. Local: positive→negative/no-effects→fault/race→recovery; API+DB+receipt/audit,
   terminal và independent cleanup. Số unit/integration tests không thay70case.
3. Linux staging: xác nhận TLS/origins/ports/pool/budget/email/offsite/on-call,
   runbook/deploy/reboot/upgrade/restore. Windows Docker proof không thay bước này.
4. RC: review toàn bộ case và remaining defects; source freeze, rollback đã drill,
   operating limit có số đo. Pilot chưa chạy thì G08 vẫn pending, không tạo vòng
   T24 chờT25. Không gán đủ100 điểm hoặc100% ổn định bằng cảm tính.
5. Pilot: RQ phê duyệt cohort và người dừng nhận mới;≥7ngày có evidence rồi mới
   quyết định mở rộng. Public/billing là gate độc lập, chưa được plan này cấp.
6. Dừng khi cross-tenant authority sai, duplicate provisioning, unknown commit bị
   create lại, drift/mất dữ liệu, restore chưa chứng minh hoặc vượt safe budget.
   Đóng nhận mới/claim mới đúng scope, giữ route khách cũ và bảo toàn receipt/audit.
   Không resetDB/down-migrate/xóa workspace để làm test xanh.

Nghiệm thu **bộ kế hoạch**: đủ8đợt/27gói/25task/70case, mapping hai chiều và
dependency đúng; có input/role/output/DoD/rollback/điểm dừng; links/mirror/secret
scan và source/index/ledger guard đạt. Nghiệm thu **sản phẩm** chỉ khi đã có
evidence đúng môi trường và reviewer có thẩm quyền. Hai việc này không thay nhau.

### 15.6. Đầu vào phải xin đúng thời điểm, không chặn phần local

| Cần chốt | Trước khi nào | Nếu chưa có |
|---|---|---|
| Tên người thực hiện/reviewer/OPS/release owner | Nhận packet và ký case/gate | Chuẩn bị code/test/report được; không tự ký hoặc ghi đã review độc lập |
| Trial/quota/grace/retention/export/delete/MFA và cơ chế gia hạn | T10/T11 enforcement và acceptance liên quan | Lập config/version/contract/test; giá trị đề xuất không tự áp production |
| Exact Linux staging host/CPU/RAM/disk/IOPS/mount/ports/network và apply authority | T05/T10/T18/T23 đo thật | Local fixtures/bundle/preflight làm tiếp; không SSH/deploy nhầm serving VPS |
| DNS roomqc.com, HTTPS app/API/admin/Android callbacks đã chọn | TLS/callback/browser staging | URL trong plan là đề xuất; không coi sở hữu domain là DNS đã cấu hình |
| Provider/sender verified/secret ref/webhook/inbox thử | D15 Internet acceptance | Làm sandbox/templates/dedupe; defer đúng case mail thật, không gửi khóa trong chat |
| Offsite store/retention/backup encryption và người giữ khóa ngoài host | T19 restore/pilot | Làm format/preflight/drill local; chưa coi dump cùng host là offsite |
| External destination/on-call/escalation/reopen policy | T20/host-loss acceptance | Local outbox/retry/ack vẫn làm; external receipt còn pending |
| Cohort/consent/limit/kill-switch owner | GateP/U | Giữ closed/manual; không tự mở signup public hoặc thu tiền |

Đối chiếu Supabase/PostgreSQL ngày23/10: quyền dựa live session/server data,
không user_metadata; key đặc quyền chỉ server; pooling/budget theo workload,
transaction ngắn, vendor pin và tự chịuDR khi self-host. Changelog có thông báo
TLS HTTP API managed và Postgres minor upgrades: phải review release/extension/
client thực cùng staging compatibility, không nâng pinned bundle hoặc sửaDB
trong lượt chốt plan. Directory disable không là remote Auth session revoke.

## 16. Phiếu nhận việc hiện hành26/10 — release/catalog và nghiệm thu kết hợp

Đây là checklist chi tiết trong T01/T05/T06/T08; không thêm task/case/package.
Mục này thay dispatch config/restart cũ ở mục12/14.4/15.1: policy/target và
readonly restart đã có scoped proofc9cc/65a8128. Không triển khai lại subset
đó như chưa làm; giữ regression trong packet kết hợp.

### 16.1. Điểm xuất phát, chủ trì và ranh giới

- BE/OPS thực hiện; QA đối chiếu độc lập; RQ chỉ định người ký. Hiện chưa có
  tên/reviewer/signoff, không tự ký thay.
- Input xuất phát: source65a8128…/773file,546business+9directory migrations,
  runtime142/2c41bd6e…,control301/301. Candidate sau delta và terminal kiểm chứng
  theo report release/catalog; giữ dirty edits và failure history15eb/f7f0/009b.
- Chỉ tài nguyên disposable exact-owned trong integration. Primary chỉ nhận
  sanitized docs/artifacts. Không apply vào DB phục vụ,CRM,VPS,DNS hoặc mail thật.
- Mục tiêu: thay **quyền/binding release có hiệu lực** trong directory khi worker
  cũ đang collection, rồi revalidate/installer/restart đúng release mới.
  File-only catalog edit không là thu hồi snapshot đã nạp.
- Approval fixture vẫn synthetic. Runtime-observed hash không được biến thành
  issuer approval. Trường hợp đổi release manifest data mà schema không đổi phải
  ghi schema unchanged; không tạo migration giả hoặc tự bump version bằng SQL.

### 16.2. Chuỗi thao tác phải triển khai

| Bước | Việc thực hiện / vị trí đối chiếu | Tiêu chí đạt và điều kiện dừng |
|---|---|---|
| Chốt candidate | Manifest scoped, runtime binding, images/render/schema/contract;exact fixture và cleanup inventory | Hash đầu/cuối khớp;không đọc/in secret;target hoặc ownership sai thì dừng trước write |
| Chốt authority | Đọc release-validation.mjs,health-config/health-evidence,AdminDirectory và ClusterGateway.validateCluster;liệt kê mọi revision/expiry/fingerprint tham gia authorize/write/admission | Chỉ rõ nguồn authority live và snapshot startup. Nếu thiếu durable revoke revision,thiết kế contract/migration review riêng;không lấy đổi file làm bằng chứng |
| Chuẩn bị hai cấu hình | Installer tạo expected release cũ/mới và readonly catalog/config digest;giữ keyring/session private,worker không có elevated installer/operator input | New approval do fixture authority định trước;không suy từ manifest runtime.Tamper/missing/wrong-cluster/expired catalog fail closed |
| Positive trước đổi | Full backend exact-owned,năm service thật + metrics thật +directory;worker cũ có sample hợp lệ | Ghi cycle/generation/release/schema/policy/target/credential/authority revision;admission manual_closed |
| Giữ response thật | Relay private giữ authentic HTTP200 trong bounded gate;reader xác nhận heldAt trước mutation | Không payload giả,không tùy ý public URL;release trong finally;không giữ SQL transaction/advisory lock qua HTTP |
| Đổi release có hiệu lực | Fixture installer đổi business manifest qua đường installer đã review;control operator dùng validate có capability,key,reason,expectedVersion và **actual** manifest transport | Mutation+receipt+audit atomic;current directory binding/release thực đổi đúng một lần;không trực tiếp SQL bump directory revision để ép test |
| Late response negative | Thả response cũ sau authority commit;đọc persisted sample,evaluator,collector audit và admission | Code theo contract thực;so với **post-command committed baseline** vì invalidation hợp lệ có thể tăng generation;không thêm sample/audit cũ hoặc mở admission |
| Next cycle negative | Quan sát cycle hoàn tất mới của worker vẫn giữ startup snapshot cũ | Stale snapshot không auto-authorize release mới,không fallback key/service_role,có counters/no-effects;không lấy error cycle trước làm bằng chứng |
| Replay/result | Replay same key+same payload,đọc durable command-result;thử old expectedVersion hoặc changed payload | Không mutation/audit lần hai;sai payload/version conflict an toàn;unknown response đọc original receipt,không sinh key mới |
| Đồng bộ deployment | Installer recreate Functions với release environment mới qua override explicit; so toàn bộ rendered config và actual container; giữ override cho mọi fault/recovery | Cùng image, chỉ đổi release environment, không public port; giữ SHA bundle ban đầu và digest delta. Lệch một dịch vụ thì không đạt |
| Installer/restart | Installer rebind credential/canary đúng release mới;dừng đúng owned worker,kiểm exit/pools;restart cùng runtime volume bằng readonly config mới | Actor/user/session/expiry và release hash khớp;startup logged digest đúng snapshot;worker không tự cấp quyền hoặc kéo dài exp |
| Positive phục hồi | Sample mới đúng authority/release/schema/credential; đủ đúng năm service probes cùng true; warmup và continuity dùng clock thật | ready khác healthy khác admission;firstValidAt mới khi proof đổi;không backdate hoặc tự mở manual/backup gate. Giữ mandatory five-service check sau drill |
| Fail/recovery paths | Thiếu approval,manifest mismatch,issuer unavailable,invalid config,failed startup/revalidation,race rollback | Unknown/closed,counters/no-effects;khôi phục bằng installer/versioned command,không quay về catalog cũ âm thầm hoặc resetDB |
| Handoff | Report+JSON lọc,timeline source/versions/actual/limits/failure history/cleanup;mapping vềB02/B04–B07/C01–C04 | Không tự ký cả case/môi trường;physical exporter/issuer/cross-replica chưa chứng minh ghi riêng |

File cụ thể phải tìm đúng source/caller trước sửa: các module nêu trên,
scripts/control-backend-managed-client.mjs,control-backend-managed-health.mjs,
test-control-backend-sandbox.mjs và control-backend-source-binding.mjs.
Nếu cần schema mới: đọc quy trình migration,giữ checksum lịch sử,kiểm upgrade/
rerun/least-privilege;không thêm runtime grant để test dễ pass.

### 16.3. Trình tự kiểm thử cho packet kết hợp

1. Focused regression: happy path,actual mutation,fence/replay,next-cycle/restart,
   failed config và source-reference omission/mutation;syntax/lint/diff-check.
2. Freeze lại candidate manifest **sau** mọi delta;không lấy65a làm hash cho code mới.
3. Chạy `node scripts/test-control-directory.mjs`:DB-enabled suite phải terminal,
   ghi tests/pass/fail/cancel/skip,không skip Docker case bắt buộc.
4. Chạy default `node scripts/test-control-backend-sandbox.mjs --run`,không
   --diagnostic;giữ mọi business permission/password/invitation/workflow check,
   actual credentials/config mutations và warmup/fault/recovery/stale/shutdown.
5. Independent full rebuild từ fixture mới với reference đúng cùng nguồn,
   images/schema/render/timed proofs;reference phải từ default full terminal,
   không nhận diagnostic hoặc backend770. T21 vẫn cần hai cụm **đồng thời** riêng.
6. Terminal evidence lấy process handle/child close event;exitnull không là0.
   Quan sát live handle trước chờ,không restart chỉ vì session mất output.
7. Kiểm độc lập từng run-label containers/networks/volumes;không prune toàn máy.
   Nếu fail:giữ history,diagnose giới hạn2–3attempt cùng cách rồi đổi cách tiếp cận;
   không nới production deadlines,warmup hoặc privilege để ép xanh.

Triển khai và lỗi thực tế của packet theo [report release/catalog](roomqc-t06-release-catalog-local-2026-10-26.md).
Run009b trên sourcee291 đã fail terminal1 do Functions còn release cũ, dù
checkpoint recovery bên trong đã báo đạt. Candidate98b sửa actual deployment
và all-five predicate; run061d mới đã terminal0,all-five recovery và cleanup0.
Default full343 trên98b sau đó đã native terminal0,source/render khớp và cleanup
độc lập0; independent rebuild380 từ full reference đã native terminal0 và cleanup0. Report
giữ hai scope riêng; không đổi kết quả product từ scoped diagnostic.

### 16.4. Sau packet này: nhận việc đến hết toàn bộ VPS + signup

Mọi bước giữ dependsOn/T01–T25 ở mục5;đợt là bàn giao,không là thứ tự cứng
chạyT06 trướcT08. Mục15.3 có input/output từng packet;đây là đường giao việc còn lại.

| Nhóm phải khép | Dữ liệu/đường thực thi phải có | Đầu ra nghiệm thu |
|---|---|---|
| Quyền và trust — T03/T08 | Current19 indirect caller/effective ACL;RPC/Edge/view/definer/trigger/FK;recipient/offboarding;issuer signing/expiry/revoke/cross-replica | Positive→negative no-effects→recovery;disposition620findings lịch sử hoặc rescan có source;không xóa policy/index chỉ giảm count |
| Cảnh báo — T07 | Event+outbox một transaction;dedupe/lifecycle/lease/bounded retry;ack/resolve;external host-loss detector | B08 local+staging,B09 staging;restart không mất/nhân alert,ack không mở gate |
| Nhận khách và budget — T09/T10 | Trust/health/backup/capacity/manual policy hiện thời;reserve/expiry/affinity;sum mọi pool/replica/queue | C05–C10;20request tranh1suất/20replay một intent;giữ route cũ;bảng budget vớiheadroom,laterT23đo chốt |
| Signup và phục hồi — T11/T12 | Durable job trước remote call;verified live owner;private setup-status;receipt transaction;resume/F5/hai tab;lease/fencing/reconciliation/backfill | D01–D11;kill sau claim/trước call/sau commit/trước ack;đúng1workspace/tenant/hotel/trial/receipt;unknown commit không tạo lại |
| Chống abuse/email — T13 | Limiter durable shared,trusted proxy/challenge,Auth signup-off,allowlist web/Android;verify/reset/invite/bounce | D12–D15;resend có giới hạn,NAT/spoofing đúng;Internet Gmail/Outlook riêng,không thay bằngSMTPsink |
| Console — T14–T17 | Hai route/menu platform-guard,typed client/cache scope;infra health/backup/admission;registrations cursor/search/timeline/recheck completion | E01–E08;1.000metadata,nguyên nhân signupkẹt<30s;390px/keyboard/Back/filter/scroll;mọi nút có handler và đường click thật |
| Linux/DR/on-call — T18–T20 | Exact target,preflight,dry-run,pinned bundle,TLS/private ports/reboot/upgrade;offsite consistent DB/Auth/directory/queue/object bytes;key custody ngoài host | F01–F09,B01/B09 staging;restore host sạch và login/file/receipt đúng;đoRPO/RTO;người trực nhận khi host chết |
| Hai cụm/E2E/tải/RC — T21–T24 | A/B đồng thời,key/volume/Auth/channel riêng;browser/Android full journey;load/soak/noisy neighbor;freeze/cutover/rollback | G01–G07 và linked A/D/E;70case được audit theo môi trường;operating limit có số đo;không Critical/High quyền/dữ liệu/cấp phát/restore |
| Pilot — T25 |1KS nội bộ ổn24–48h→cohort5–10 đã duyệt→quan sát≥7ngày;support/cost/drill/kill-switch | G08 sau pilot;go/no-go doRQ;publicU/billingB không tự được bật |

### 16.5. Hồ sơ bàn giao và quyền mở

Mỗi task dùng cùng bộ evidence,không tạo sổ trạng thái cạnh tranh:
candidate/source/image/schema/config/contract;exact target/run/time/command/exit;
case×requiredEnvironment;actual và API/DB/receipt/audit refs;allowed effects;
failures/defects/limits/cleanup/rollback;implementer/reviewer/signoff.

Kết quả kiểm **plan** phải có đủ8đợt/27gói/25task/70case,mapping hai chiều,
dependency acyclic,links/mirror/source/ledger/index guards. Kết quả **sản phẩm**
chỉ đổi từng case sau evidence đúng môi trường và reviewer. Hiện70not_run,
122unverified,signoffnull;không tự mở L/S/P/U/B.

Chờ cấp input đúng lúc:exact VPS Linux +apply authority;DNS/origins/callbacks;
email sender verified/secret reference;offsite+encryption/key custodian;on-call
ngoài host;trial/quota/grace/retention;cohort/operating limit/kill-switch owner.
Thiếu gì chỉ deferred đúng phần đó,local vẫn tiếp tục;không gửi khóa trong chat.

Supabase/Postgres review26/10 giữ server-side live-session authorization,
không user_metadata;secret key không vào frontend;sum connection pool budget;
transaction ngắn,không lock qua network;self-host chịubackup/DR. Đã đối chiếu
[changelog](https://supabase.com/changelog),
[sessions](https://supabase.com/docs/guides/auth/sessions),
[self-hosting](https://supabase.com/docs/guides/self-hosting/docker).
TLS/PG breaking notices cần compatibility review theo pin hiện tại,
không tự nâng bundle hoặc áp hướng dẫn managed như self-host đã được nâng.

### 16.6. Phiếu thiết kế T08 kế tiếp — phê duyệt có hạn và thu hồi xuyên replica

Đọc [thiết kế thực hiện T08](roomqc-t08-signed-approval-design-2026-10-26.md)
để nhận contract ký, quyền DB, thứ tự transaction và xử lý provisioning/restore.
Thiết kế chỉ rõ retry khi đã provisioning và remote outcome chưa rõ; không
coi đóng admission là hủy một remote commit đã xảy ra.

Đã có [rà soát current source98b](roomqc-t08-current-source-review-2026-10-26.md):
catalog thật492functions/11views/369policies,28candidate paths tới19targets;
body của19hàm trên paths và8authority helpers khớp migration hiện hành. Đã
ánh xạ162HTTPdenials tới18thao tác/9trạng thái,14revocation-first races và1
mutation-first race; snapshot/recovery giữ đúng phạm vi nhóm kiểm thử.
25unresolved graph edges là base relations ngoài target graph, không là bảng mất.
Đây là inventory/partial proof,
không đóng quyền gián tiếp, full employee matrix hoặc620advisor findings lịch sử.

Đây là checklist con của T03/T08, giữ nguyên 27 gói/T01–T25/70 ca. Chỉ bắt đầu
sửa runtime sau khi lượt full và rebuild có terminal và cleanup. Mốc này đã đạt
trên98b; delta mới phải có source/proof riêng. Đọc `server/control/release-validation.mjs` hiện hành:
`ReleaseValidationCatalog` v1 là dữ liệu do installer nạp lúc khởi động;
`get()` kiểm hạn credential, còn `expectation()` trả identity bất biến. Chưa có
chữ ký issuer, hạn phê duyệt riêng hoặc epoch thu hồi bền vững. Credential hết
hạn và approval hết hạn là hai điều kiện riêng, không dùng một cái thay cái kia.

| Thứ tự / người thực hiện | Thay đổi cần chốt trước khi viết mã | Bàn giao và nghiệm thu |
|---|---|---|
| 1 / BE + QA | Liệt kê mọi nơi nạp catalog, đọc expectation, validate manifest, ghi health, reserve và first provision; phân biệt startup cache với authority trong DB | Sơ đồ caller và bảng đọc/ghi từng đường, có vị trí source thực; không bỏ đường worker hoặc API replica thứ hai |
| 2 / BE + OPS | Chốt envelope version, approval ID, issuer/key ID, thuật toán allowlist, inventory/cluster/host, release/schema/frontend binding, not-before/expiry và epoch; ký bytes chuẩn hóa có domain separation | Contract và fixtures hợp lệ/sai trường/sai kiểu/đổi thứ tự bytes; digest runtime chỉ dùng so khớp, không tự tạo approval |
| 3 / OPS + BE | Issuer giữ private signing key ngoài API/worker; runtime chỉ nhận public trust keys và secret refs đúng chức năng; quy trình thêm/rotate/thu hồi key riêng với rotate canary | Bộ ký và validator local bằng key dùng một lần trong thư mục private; báo cáo chỉ ghi fingerprint. Chưa cần key production để hoàn thành local |
| 4 / BE | Thiết kế trạng thái approval và withdrawal epoch trong directory: authority hiện thời là dữ liệu bền vững; quyền installer/operator tách runtime; command có expectedVersion, client key, reason, audit và receipt | Review migration/upgrade/checksum/least privilege theo quy trình repo; không sửa migration cũ hoặc thêm grant chỉ để test đạt. Nếu không có schema delta cần chứng minh đường lưu hiện hữu đủ |
| 5 / BE | Mỗi validate/health commit/admission/reserve/first-call kiểm lại binding, hạn và epoch hiện thời; network collection ở ngoài transaction, khi ghi mới kiểm authority atomically | Response thu thập trước withdraw hoặc expiry không tạo health/receipt/cấp phát mới; số effects so với baseline sau lệnh thu hồi đã commit |
| 6 / BE + QA | Hai API/worker process dùng cùng directory, cache startup khác nhau; không coi notification là nguồn đảm bảo duy nhất | Process A thu hồi; B giữ response thật rồi thả sau commit phải bị chặn; cycle mới và process vừa restart cũng bị chặn; DB read/unavailable không dùng approval cache để nhận khách |
| 7 / BE + OPS | Quy trình phê duyệt lại bằng issuer hợp lệ + command có quyền; epoch không lùi khi replay/restore/rollback config | Positive phục hồi cần proof mới và warmup mới; không reset latch/manual/backup gate, không tự bật signup hoặc chuyển cụm khách cũ |
| 8 / QA | Focused → freeze source mới → full DB control → full backend → independent rebuild khi runtime thay đổi; giữ kết quả lỗi cũ | Report/JSON đúng candidate, exit thực, cleanup độc lập, giới hạn và reviewer; không thừa kế kết quả candidate98b sang delta mới |

Bộ thử tối thiểu trong các case A06/B02/C01–C04 và hồi quy B04–B07:

- Approval hợp lệ: đúng issuer/key, cụm/host/release/schema/frontend, thời gian
  và epoch; đủ năm dịch vụ nhưng admission vẫn cần các điều kiện khác.
- Chữ ký sai, issuer/key lạ, payload bị sửa, envelope sai version/thuật toán,
  thiếu binding hoặc sai cụm phải bị từ chối trước effect. Không tải key từ URL
  tùy ý do request cung cấp; giữ allowlist chống SSRF hiện hữu.
- Hết hạn giữa collection và commit, not-before chưa tới, timestamp sai kiểu,
  withdrawal trước/giữa/sau remote response và worker cũ giữ cache đều có
  negative/no-effects và positive đúng thứ tự transaction.
- Hai lệnh thu hồi cạnh tranh, cùng client key replay và changed-payload replay:
  một kết quả có audit/receipt; không tăng epoch hai lần hoặc trả success giả.
- Restart API/worker, mất notification, issuer offline, directory unavailable,
  restore cấu hình cũ và xoay key không được tái hợp lệ hóa approval đã thu hồi.
  Chốt trong design quyền rotate/withdraw và ảnh hưởng đến validate/nhận mới;
  hoạt động khách đã có dữ liệu không bị đổi routing hoặc xóa dữ liệu.

Các dòng trên là **tiêu chí phải xây và thử**, chưa phải kết quả đạt. Hồ sơ này
chưa thay kết quả 70 worksheet hoặc trạng thái phê duyệt phát hành. Sau T08,
nhận lần lượt quyền gián tiếp → T07 → T09/T10 → T11–T13 → T14–T17 → T18–T24 →
T25 theo dependency; checklist chi tiết toàn bộ vẫn ở mục5/15.3/16.4.
