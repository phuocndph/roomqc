# RoomQC — kế hoạch hiện hành cho toàn bộ VPS và đăng ký tự động

**Checkpoint triển khai hiện hành — rotation 29/10/2026:** backend310 tệp, SHA256 `314c1ec4b68fec86b5cf49aedf6d328555e4545f7d934520989b362fca74cb4a`;585 business+19 directory. [Daemon/journal và DB ready-head fence](roomqc-setup-rotation-local-2026-10-29.md) có14 kiểm native (8 rotation),18 process UID10001/CapEff0, kill/replay/overlap/expiry/revoke; unit509 pass/184 skip/0 fail. Run1c06a184f980 exit0, source/schema không đổi, cleanup0. Phạm vi entrypoint `--once`; chưa periodic daemon lâu/SIGTERM, full race/fault matrix, runtime container read-only mount/reload hoặc actor revoke xuyên hai DB. [Runbook mới](roomqc-setup-credential-rotation-runbook.md). Tiếp BG02 phần còn thiếu; BG06 phải khóa candidate mới. Các checkpoint301 phía dưới giữ lịch sử, không phải nguồn hiện hành. Không đổi70ca/124lượt/122mục, reviewer/signoff/gates.

**Checkpoint local trước — 29/10/2026:** backend301 tệp, SHA256 `2ec50f6dd1e473a45a54636594d6fd59451c452eb1f5d0f1a375bd1795b371d0`. [Runtime kiểm khóa live trước nhận việc](roomqc-setup-runtime-readiness-local-2026-10-29.md) đã sửa lỗi file còn hạn nhưng khóa đã revoke vẫn vượt readiness. Native run39f0f08155b0 đạt38 kiểm (22 worker,8 backfill,8 apply), source/schema không đổi và cleanup0; unit495 pass/184 skip/0 fail. Đây là diagnostic local; chưa daemon rotation, runtime UID/mount read-only hoặc thu hồi quyền nguyên tử xuyên hai database.

**Nhận tiếp BG02:** scheduler/journal, hai rotator và overlap/expiry khi daemon chết; container runtime chỉ mount output read-only; chốt điểm hiệu lực Auth→directory. R4 là [snapshot kế hoạch](../../../artifacts/roomqc-vps-signup-execution-plan-audit-r4-2026-10-29.json) của source301/ede96e trước sửa runtime, verifier r4 phải từ chối nguồn mới; giữ nguyên lịch sử, không nới pin. Các packet rebuild/filesystem/restore phía dưới có phạm vi nguồn riêng. Giữ8đợt/25task/27gói/70ca/124lượt,70ca not_run/122mục unverified, reviewer/signoff/gates chưa đổi.

**Checkpoint local lịch sử — timeout bộ cài:** [Báo cáo deadline](roomqc-setup-installer-deadlines-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend291 files/hash `bb21bef86c200d3d09c950b11c96417710bb9a9a47af7af0d3a0200caec2a367`;584+19 migrations. Focused100/100, native362/362 và control673 tổng/671 pass/0 fail/2 skip; terminal0, cùng source/schema tương ứng, cleanup0. IF11 có SQLSTATE thật, witness rollback, deadline45giây và13 lần kiểm session/mutex. IF01–IF11,IF13,IF16,IF17 có local proof đúng scope; tiếp IF12/IF14/IF15 rồi rotation/mount/Auth→directory. Lần1/T08/T12,70ca/124lượt/122mục,reviewer và gates vẫn mở.

**Checkpoint đã kiểm trước nháp timeout:** [Báo cáo mới](roomqc-setup-installer-transactions-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend289 files/hash `6802f300c3c4232e8e649f039aaf5be285da92f8b0a2116c0308318de3c16e14`;584+19 migrations. Focused75/75, native337/337 và control673 tổng/671 pass/0 fail/2 skip; terminal0, cùng source/schema tương ứng, cleanup0. IF10 đã có thu hồi khóa qua LOGIN API thật; IF16 có witness mutation→rollback và replay cùng key. Các nhóm IF01–IF10,IF13,IF16,IF17 có local proof đúng scope; còn IF11/IF12/IF14/IF15 rồi rotation/mount/revoke xuyên hệ thống. Lần1/T08/T12,70ca/124lượt/122mục,reviewer và gates vẫn mở.

**Checkpoint trước — preflight/quyền/fences local:** [Báo cáo fences](roomqc-setup-installer-fences-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend288 files/hash `3ddefd9ddc068cbf097331f3f708fee790e7b5bfe27075148f450bd8681d7b22`;584+19 migrations. Focused66/66 và control673 tổng/671 pass/0 fail/2 skip, terminal0/cùng source/cleanup0. [Native328/328](../../../artifacts/roomqc-setup-installer-fences-native-51f2a15b16c2-local-2026-10-28.json) gồm66 installer controls, terminal0/source/schema/cleanup0. IF01–IF09,IF13,IF17 có proof local; IF10 còn key withdrawal, IF11/IF12/IF14/IF15/IF16 chưa khép, rồi rotation/mount/revoke xuyên hệ thống. Lần1/T08/T12,70ca/124lượt/122mục,reviewer và gates giữ mở.

**Checkpoint trước — IF01–IF05 có proof local:** [Báo cáo fault](roomqc-setup-installer-faults-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend287 files/hash `1f576b109c6c5665a2dec4e4e0aa06e818a246a872c384b1b226d84eadc612dc`;584+19 migrations. Native289/289 gồm27 installer controls, control673 tổng/671 pass/0 fail/2 skip; terminal0, cùng source/end-source/schema/cleanup0. Đã kiểm bind/issue/revoke mất phản hồi, caller/key/body conflict, hai CLI và SIGKILL trước/sau commit. Còn IF06–IF17 rồi rotation/mount/revoke xuyên hệ thống; chưa đóng lần1/T08/T12, nghiệm thu70ca/124lượt/122mục và gates vẫn mở.

**Checkpoint đã kiểm trước đợt fault:** [Báo cáo và giới hạn](roomqc-setup-credential-installer-local-2026-10-28.md), [bảng triển khai 11 lần bàn giao](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend287 files/hash `7b7fb7ddd8f126875160323e409e441d855646b61788abb7189ea7972a3f4224`,584+19 migrations; native278/278 gồm16 installer CLI mới, control672 tổng/670 pass/0 fail/2 skip; terminal0, cùng source, cleanup0. Lần1 chưa đóng: còn fault matrix toàn tuyến; lần2 rotation/mount reload/thu hồi Auth→directory chưa kiểm. Phạm vi toàn VPS+signup, đầu ra Plan+nghiệm thu;70ca/124lượt/122mục,reviewer,gates và goal tổng thể giữ mở.

**Checkpoint lịch sử — publisher trước installer:** [publisher local](roomqc-setup-publication-local-2026-10-28.md) đạt262/262 controls, gồm18 publication mới với4 publisher SIGKILL/resume; credential/status/attestation/publication tổng78. Control663 tổng/661 pass/0 fail/2 skip;583+18 migrations, source281 files/hash33d8482f5c9e784d8d54cfce29ebf33a0f0d47ab66e6df9f993c074a7afcf7d9, cleanup0. Receipt/status được đọc lại qua DB, private intent/stage/fsync/rename và native RPC đã kiểm; authority callback vẫn fixture. Chưa có operational installer/DB identity/target/budget/live directory authority/rotation hoặc mount reload thật. Nhận cấu hình/preflight và issue→publisher→rotation, rồi cross-system revoke/T10/signup/console/default-full/rebuild/VPS/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

**Checkpoint trước — fingerprint v3 và trạng thái khóa:** [catalog/readiness local](roomqc-setup-attestation-status-local-2026-10-28.md) đạt244/244 controls, gồm60 credential/status/attestation (25 mới), giữ184 API/worker/CLI;9 drift catalog thật đều bị verifier chặn,2 SQL-writer SIGKILL/2 barrier. Control658 tổng/656 pass/0 fail/2 skip;583+18 migrations,source277 files/hash894abdb63eaac8c45e2ec852773fd5c824f22908ceff1f35c40d159d601ac1f8,cleanup0. Upgrade582/583 rollback đạt; fingerprint v3 phủ2 schema phục hồi và capability graph, manifest v1/v2 bị từ chối. Status đọc hiện hành, không lấy receipt làm readiness; admin schema không expose REST. Advisor808/247WARN chưa disposition. Nhận installer/DB identity/target/budget/signer/file/refresh→cross-system revoke→T10/signup/console→default-full/rebuild→VPS/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

**Checkpoint trước — lệnh quản lý khóa phục hồi:** [giao thức và bằng chứng local](roomqc-setup-credential-command-local-2026-10-28.md) đạt219/219 controls, gồm35 mới với2 SQL-writer SIGKILL và2 barrier; giữ184 API/worker/CLI nền. Control656 tổng/654 pass/0 fail/2 skip;581+18 migrations, source277 files/hashafbb17c9eb867af6d77e58d73bcaaf5ffc3bdafd75963d3186d513806154edb9, cleanup0. Upgrade581 dùng phiên bảo trì riêng, rollback schema/role/history đạt. Advisor đo lại808 findings/247 WARN, chưa disposition. Đây là giao thức DB, chưa installer/file publication/lịch thay khóa. Fingerprint v2 tại checkpoint này chưa phủ roomqc_setup/roomqc_setup_admin; nhận attestation→installer/rotation và cross-system revoke→T10/signup/console→default-full/rebuild→VPS/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

**Checkpoint trước — CLI với biên nhận native:** [reader/writer, signed batch và phục hồi tiến trình](roomqc-setup-cli-native-local-2026-10-28.md) đạt184/184 controls, gồm16 CLI mới (3 barrier),45 API/process và123 nền; cùng source276 files/hash592e36737b8f89b8e7b905716f00210569c855b75b32534c68324518c60f4d39. Control656 tổng/654 pass/0 fail/2 skip;580+18 migrations,cleanup0. CLI có biên nhận PostgREST thật, lost-response sau commit và SIGKILL; Auth confirmed/health/release/batch-review vẫn fixtures. Nhận installer/rotation/maintenance và revoke semantics→T10/quotas→signup/email/console delta→default-full/rebuild→staging/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

**Checkpoint trước — tích hợp API/Auth/process local:** [đăng ký→recheck→worker với Auth thật](roomqc-setup-api-native-local-2026-10-28.md) đạt168/168 controls, gồm45 API/process và28 barrier mới,10 SIGKILL (7API/3worker), TCP lost-response sau commit và live session revoke khi chờ directory lock. Control656 tổng/654 pass/0 fail/2 skip; cùng source274 files/hash98387288f1cc901146c430c3b7728f4acc7c0a09ec0ed5dc85a9ca5bb341d844;580+18 migrations,cleanup0. Auth accounts confirmed/health/release vẫn fixtures; chưa public email signup, native CLI toàn tuyến, default-full/rebuild, browser/Android hoặc VPS. Nhận native CLI→installer/revoke/T10→candidate/default/rebuild→staging/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

**Checkpoint trước — recheck local:** [API/contract/UI/journal và proof](roomqc-workspace-recheck-local-2026-10-28.md) có migration18, replay trước CAS, detail snapshot nhất quán, một recovery cycle/dispatch (3 attempts/15 phút), giữ job history/lease và sửa late owner settle. Control656 tổng/654 pass/0 fail/2 skip; frontend66/66 + TS/lint; native nền580+18 migration/123 controls; backend272 files/cleanup0. Native chưa kiểm platform recheck/live Auth; client dùng jsdom/Capacitor mock. Nhận public API→worker→remote thật/process faults, native CLI toàn tuyến, installer/T10/full-default/rebuild/VPS/DR/E2E/tải/RC/pilot. Chưa bật runtime hoặc ký T12;70ca/122mục/124lượt/gates giữ nguyên.

**Điểm đọc tổng hợp 28/10:** [plan chi tiết toàn phạm vi](roomqc-vps-signup-master-plan-2026-10-28.md) và [hồ sơ nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md). Có25 phiếu/dependency/đầu ra và điều kiện local→staging→pilot→public. Recheck có packet272 files riêng; checkpoint CLI bên dưới chỉ áp source268. Không thay70ca/122mục/gate/signoff.

**Checkpoint trước — CLI apply theo lô:** [writer/manifest/process recovery local](roomqc-setup-backfill-cli-local-2026-10-28.md) có signed batch đúng report/target/allowlist, writer budget/pool1, Windows ACL/POSIX files, output exclusive/fsync và actual CLI SIGKILL/post-commit response-loss/resume. Control640 tổng/638 pass/0 fail/2 skip; native580+17 migration/123 controls; Linux container14/14; source268 file/cleanup0. Nhận durable recheck4.4 rồi public API/worker fault/E2E, installer/T10/default-full/rebuild/VPS theo plan. Chưa apply dữ liệu vận hành hoặc bật worker/dispatch;70ca/122mục/gates giữ nguyên.

**Checkpoint trước — lõi apply backfill:** [ghi đối soát local](roomqc-setup-backfill-apply-local-2026-10-28.md) có directory 0017, role riêng, hai RPC, journal/CAS/audit/final expiry và terminal reconciliation. Control 634 tổng/632 pass/0 fail/2 skip; native 580+17 migration/123 controls, gồm 8 apply mới; source 261 file, cleanup0. Nhận config/CLI writer, approved batch manifest và process interruption/resume ở4.3, rồi durable recheck4.4. Chưa apply dữ liệu vận hành hoặc bật worker/dispatch;70 ca/122 mục/gates giữ nguyên.

**Checkpoint trước — upgrade và dry-run backfill:** [đọc đối soát local](roomqc-setup-backfill-local-2026-10-28.md) có reader0016/scanner/config/CLI; upgrade0014→0015 có dữ liệu, hai migrator và giữ lease/attempt/deadline/history. Control620 tổng/618 pass/0 fail/2 skip; native580+16/115 controls gồm8 backfill+17 worker, source257 file/cleanup0. Chưa apply hoặc durable recheck; nhận apply4.3 với migration tiếp theo0017 nếu cần, rồi4.4. Installer/T10/full-default/rebuild/VPS/E2E/pilot còn mở;70 ca/122 mục/gates giữ nguyên.

**Phạm vi/đầu ra đã chốt:** toàn bộ VPS + signup / plan + nghiệm thu. [Phiếu triển khai](roomqc-vps-signup-next-delivery-2026-10-28.md) đã chi tiết hóa upgrade/backfill ở4.3, durable recheck ở4.4 và lịch giao việc theo gate ở14; [ma trận thực thi](../../../artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json) giữ70 ca/124 cặp môi trường chưa chạy. Đây là kế hoạch, chưa ký nghiệm thu hoặc triển khai phần mới.

**Checkpoint trước — worker:** [worker đối soát đăng ký local](roomqc-setup-worker-local-2026-10-28.md): directory migration0015, role riêng, DB-clock lease/fencing/atomic settle, runtime/config/budget và Compose opt-in. Control609 tổng/607 pass/0 fail/2 skip; native580+15 migration/107 controls,17 worker với directory+remote roles thật cùng run; source250 file/cleanup0. Nhận backfill/upgrade14→15 → durable recheck → process-kill/live control E2E; installer/T10 còn mở. Example replicas0, chưa bật production;70 ca/122 mục/gates giữ nguyên.

**Checkpoint trước — credential:** [credential/adapter phục hồi riêng](roomqc-setup-recovery-scoped-local-2026-10-28.md): schema roomqc_setup chỉ2 RPC, DB kiểm expiry/rotation/revocation và rollback nếu hết hạn giữa lúc ghi. Native580 migration/90 controls/4 barrier protocol+2 credential/exit0; unit16/16, source240 file, cleanup0. Nhận worker DB-clock lease/fencing → backfill/recheck; installer/secret/T10/live full E2E còn mở. Chưa cấp credential vận hành/bật worker; 70 ca/122 mục/gates giữ nguyên.

**Checkpoint trước:** [closure proof và quyền recovery](roomqc-setup-recovery-boundary-local-2026-10-28.md): sửa setup-status; net recovery86→0 và quyền role khác giữ hash. Native579 migration/69 controls/4 barrier/exit0, directory closure riêng577 pass/0 fail/2 skip. Nhận review quyền nối tiếp và installer phiên owner extension → credential/worker → backfill/recheck. Chưa cấp credential/bật worker; 70 ca/122 mục/gates giữ nguyên. Các checkpoint API trước đây không là source hiện tại.

**Đọc để triển khai tiếp:** [kế hoạch hành động và nghiệm thu 28/10](roomqc-vps-signup-next-delivery-2026-10-28.md) chốt phần còn lại sau API T12: quyền recovery → worker/status/backfill/recheck → runtime và kiểm toàn tuyến; T10 vendor/DSN/budget phải đủ trước bật thật. Tài liệu giữ tám đợt/25 task/27 gói/70 ca, chỉ rõ file, fault proof, cutover và đầu vào làm sau. Các checkpoint và lệnh giao cũ bên dưới là lịch sử đúng source của chúng; không thay điểm nhận này hoặc trạng thái nghiệm thu.

**Checkpoint trước — T12 API/directory local:** [Dispatch + job + API](roomqc-setup-dispatch-api-local-2026-10-28.md) đã nối lưu trước network, 202 khi gửi trùng, fenced RPC adapter và atomic activation/job/audit. Run 5de3cffd4d60: backend 25/25, PostgreSQL 13/13, frontend 43/43, TS/lint exit 0; hồi quy 578 tổng / 576 pass / 0 fail / 2 skip Windows. Source 237 + 18 file không đổi, cleanup độc lập 0. Auth/remote adapters là doubles; chưa thay tích hợp toàn tuyến thật. Flag mặc định false; [mục 5](roomqc-setup-dispatch-api-local-2026-10-28.md#5-đầu-việc-nhận-tiếp) nhận worker/quyền RPC → backfill/recheck → runtime/cutover → full/E2E. T12 và VPS chưa nghiệm thu; 70 ca/122 mục/gate giữ nguyên.

**Checkpoint trước — database T12:** [Giao thức dispatch/closure local](roomqc-setup-dispatch-local-2026-10-28.md) đạt 52/52 controls và 4 barrier bằng Auth/PostgREST/PostgreSQL thật riêng, replay đủ 578 migration. Source 232 file/schema không đổi, terminal exit 0, cleanup độc lập Docker 0. API/gateway chưa chuyển giao thức; directory dispatch + job, worker/recheck/backfill chưa nối. [Mục 5 báo cáo](roomqc-setup-dispatch-local-2026-10-28.md#5-đầu-việc-nhận-tiếp) ghi sáu bước nhận tiếp, file/đầu ra/điều kiện nhận. Trước credential worker phải rà toàn bộ PUBLIC RPC surface; trước cutover phải drain RPC cũ, giữ tombstone khi rollback. Chưa nghiệm thu T12/VPS; 70 ca/122 mục/gate giữ nguyên.

**Checkpoint trước — T11 local, tiến độ thiết lập:** [API/client/onboarding](roomqc-setup-status-local-2026-10-28.md) đã nối owner-only/no-store, kiểm kết quả trước POST và chặn phản hồi cũ khi đổi phiên/cụm. Run 93df1cd3bf1e: backend21/21, PostgreSQL2/2, frontend42/42, TS/lint exit0, source231 +16 file frontend không đổi, Docker0. Auth/receipt adapter giả lập; chưa thay live Auth/browser/Android hoặc T12 worker. Contract hiện24 operation:8 foundation/12 local/3 planned/1 partial. [Mục5 báo cáo](roomqc-setup-status-local-2026-10-28.md#5-đầu-việc-nhận-tiếp) là phiếu nhận tiếp; giữ T10.b unresolved và dependency. 70 ca/122 mục release, reviewer/signoff/gate giữ nguyên.

**Điểm nhận T10.b hiện hành — vendor plan:** [Auth/PostgREST local](roomqc-resource-vendor-local-2026-10-28.md) có 15/15 kiểm plan/CLI và 7/7 controls bằng Auth/PostgREST/PostgreSQL thật riêng; source 229 file ổn định, native exit 0, cleanup Docker 0. Auth pool hữu hạn và listener PostgREST đã được tính. [Runbook](roomqc-resource-vendor-runbook.md) giữ cách chạy. Realtime/Storage/Meta/Functions/Supavisor còn unresolved; consumer runtime/DSN binding, worker live, rolling overlap và T10.c–f chưa khép. Nhận delta theo mục5 báo cáo vendor; 70 ca/122 mục release, reviewer/signoff/gate giữ nguyên. Các checkpoint dưới chỉ áp dụng source của từng báo cáo.

**Checkpoint trước T10.b — đích PostgreSQL:** [checker chỉ đọc](roomqc-resource-database-local-2026-10-28.md) đã kiểm identity/settings của đích attestor và cộng ngân sách nhiều database trên cùng lineage PostgreSQL. Directory: 536 tổng / 534 pass / 0 fail / 2 skip; Linux: 62/62, source 225 file ổn định; có role denial, stop/restart/recovery thật và cleanup Docker 0. [Runbook](roomqc-resource-database-runbook.md) giữ schema/quyền/lệnh/giới hạn. Chưa bind DSN native/vendor tới các đích này; nhận tiếp vendor/pooler → consumer DSN binding → remaining worker live → T10.c–f. T10/VPS/capacity chưa nghiệm thu; 70 not_run / 122 unverified và reviewer/signoff/gate giữ nguyên. Các delta dưới là checkpoint đúng source của chúng.

**Checkpoint runtime trước T10:** [inventory runtime native](roomqc-resource-deployment-runtime-local-2026-10-28.md) đã đối chiếu container thực, image/process/env/mount/network/cached profile và thay đổi trong lúc kiểm; có live proof hai API native riêng biệt. [Runbook](roomqc-resource-deployment-runtime-runbook.md) phân biệt native snapshot với toàn stack. Nhận tiếp vendor/pooler/process khác/remaining workers và DB identity/settings của T10.b; giữ 70 ca và gate. Những đoạn inventory runtime còn thiếu bên dưới là checkpoint trước của đúng source đó.

**Checkpoint plan T10 trước:** [preflight kế hoạch deployment](roomqc-resource-deployment-plan-local-2026-10-28.md) đã nối kiểm ngân sách/hash/replica xuyên Compose project và projection đã nạp của native process. Chỉ kiểm plan; runtime/VPS/capacity chưa được xác nhận. [Runbook](roomqc-resource-deployment-preflight-runbook.md) giữ schema/command/exit và coverage. Việc nhận tiếp là inventory container thực, kể cả orphan/one-off/stopped và cached projection, rồi vendor/pooler/DB identity; giữ nguyên 70 ca và các gate.

**Bắt đầu giao việc:** [bản bàn giao ngày 28/10](roomqc-vps-signup-handoff-2026-10-28.md)
gom tám đợt, điều kiện nhận, đầu vào bên ngoài và bộ nghiệm thu. Diagnostic
parent-boundary sau sửa `0146874c679e` đã đạt exit 0: 29 FK / 248 từ chối,
rollback 11 bảng và cleanup độc lập đạt. [Biên bản local](roomqc-parent-boundary-local-2026-10-28.md)
ghi phạm vi; [lượt thiếu fixture](roomqc-parent-boundary-handoff-2026-10-28.md)
giữ lịch sử. Không giao lại fixture/khóa ghép/deferred như chưa làm; full backend
và rebuild của candidate cuối chưa được thay thế bằng diagnostic.

**Phạm vi đã chốt ngày 27/10/2026: toàn bộ VPS + signup. Đầu ra: plan + nghiệm thu.**
Giữ 8 đợt, 25 task, 27 gói và 70 ca gốc. Khách chỉ đăng ký; RoomQC quản lý
cụm VPS, cấp không gian sử dụng, gói/quota, sao lưu và vận hành.

**Delta triển khai console:** [T14 local + phần đọc T15/T16/T17](roomqc-control-admin-consoles-local-2026-10-28.md)
đã nối hai route/menu, guard trước child render, client theo phiên/runtime và
trang đọc/list/detail/filter/cursor/scroll. 79/79 frontend và 12/12 HTTP+directory
riêng đạt, dataset 1.000 metadata/40 trang. Adapter quyền/remote receipt của bài
HTTP là giả lập; live Auth/browser/Android và các thao tác vận hành vẫn còn mở.
T07 backend tiếp đó đã có [proof local](roomqc-control-alerts-local-2026-10-28.md):
lifecycle/event/outbox atomic, dispatcher, list/ack/receipt lookup. Tiếp đó
[client/UI cảnh báo](roomqc-control-alert-ui-local-2026-10-28.md) đã có journal,
list/ack và phục hồi kết quả; 116/116 frontend, 13/13 HTTP+directory, TS/lint/build
đạt. [Năm thao tác cụm T09/T15](roomqc-control-cluster-commands-local-2026-10-28.md)
tiếp đó đã nối client/journal/UI; tổng hợp155/155 frontend,17/17 HTTP lệnh cụm và
13/13 HTTP cảnh báo đạt. [T10 partial local](roomqc-control-resource-bounds-local-2026-10-28.md)
tiếp đó có queue hữu hạn/validator tổng kết nối/API binding/readiness; directory
470 pass/0 fail/1 skip, Linux loader8/8, HTTP cụm17/17 và cảnh báo13/13 đạt.
[Shared native startup](roomqc-control-shared-resource-runtime-local-2026-10-28.md)
tiếp đó bắt buộc file ở staging/production cho API, health/probe, alert và external
booking;479pass/0fail/2skip, Linux18/18, Compose5matrix, HTTP17/17+13/13 đạt.
Nhận T10.a/phần còn lại b: actual deployment/replica/profile/vendor/pooler; rồi
host/fairness/usage/quota/tải. Chưa bind toàn hệ thống hoặc đo capacity. Còn bundle Linux,
live Auth/browser/Android và kênh mất host B09; giữ dependency và packet đã đạt.

**Hiện trạng cập nhật 28/10/2026:** policy live command đã kiểm local trên
577 migrations nghiệp vụ; current 106/106 và populated upgrade 576→577 đạt.
[Hồi quy policy](roomqc-advice-policy-live-regression-local-2026-10-28.md)
ghi rõ native/Edge/client/restart/interruption và giới hạn. Baseline đỏ được
giữ làm lịch sử; không còn giao lại bản nháp policy như việc chưa kiểm.

[Q02](roomqc-q02-room-writers-diagnostic-local-2026-10-28.md) đạt 536/536 và
[Q03 delivery](roomqc-q03-workflow-delivery-diagnostic-local-2026-10-28.md)
đạt 65/65 diagnostic, cleanup hoàn tất. Q02 chưa đóng toàn bộ writer; general
workflow engine và async dispatcher Q03 chưa triển khai. [Full backend run
75b23132abab](roomqc-q04-full-backend-failure-local-2026-10-28.md) đã kết thúc
exit1 tại `parent_boundary_controls` (`P0001`); source cuối khớp và fixture
đã cleanup theo ownership state. Managed-health đạt 33 mốc nhưng toàn run chưa đạt;
chưa có independent rebuild. [Editor policy](roomqc-advice-policy-editor-local-2026-10-28.md)
đạt 65/65 kiểm client/hook/component, TS/lint; native client và thiết bị còn mở.

**Đọc và giao việc:** [bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md)
giữ tám đợt và đầu ra demo; [phiếu T01–T25](roomqc-vps-signup-detailed-delivery-2026-10-26.md)
giữ file, bước làm, dependency, kiểm nhận và rollback.
[Bộ 70 ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) giữ nguyên
`not_run`; 122 mục release vẫn `unverified`. Chưa thay reviewer, signoff hay gate.
Lịch sử checkpoint giữ tại [tiến độ](roomqc-vps-signup-progress.md) và báo cáo gốc.

**Việc nhận tiếp:** [mục 4 kế hoạch hành động](roomqc-vps-signup-next-delivery-2026-10-28.md#4-gói-nhận-trước-t12-phục-hồi-đăng-ký-và-t11-tiến-độ) và [phiếu 19.46](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1946-kế-hoạch-hành-động-và-nghiệm-thu-sau-api-t12).
Nhận quyền recovery/worker/status/backfill/recheck; khép T10 vendor/DSN/worker/budget trước bật thật. Giữ delta Q02/Q03/nghiệp vụ và Q04 trong đợt nền; full-default/rebuild trên candidate cuối sau freeze. Giữ dependency ledger, chưa ký T11/T12 khi dependency chưa đủ. Chỉ mirror tài liệu/artifact đã lọc; implementation ở integration và kết quả kiểm ghi đúng source/phạm vi.

## 1. Kết quả cần đạt và mô hình vận hành

Khách vào **roomqc.com → đăng ký → xác minh email → khai báo khách sạn → hệ thống cấp không gian sử dụng → thêm phòng, mời nhân viên → sử dụng**. Khách không phải thuê VPS hoặc cấu hình Docker/Supabase.

RoomQC chuẩn bị các cụm VPS trước, theo dõi sức khỏe và phân khách mới vào cụm đủ điều kiện. Một cụm phục vụ nhiều workspace, dữ liệu được tách bằng quyền phía server và database; một workspace có thể có nhiều khách sạn theo gói. Không tạo VPS riêng cho mỗi lần đăng ký. Khách đã gắn cụm giữ nguyên mapping khi cụm đầy hoặc lỗi; chuyển cụm là quy trình riêng có đối soát dữ liệu.

```mermaid
flowchart TD
    U[Khách đăng ký tại roomqc.com] --> V[Xác minh email và khai báo khách sạn]
    V --> C[RoomQC kiểm quyền, gói và cụm đủ điều kiện]
    C --> Q[Giữ suất và ghi yêu cầu cấp phát bền vững]
    Q --> W[Worker tạo workspace, khách sạn và quyền chủ]
    W --> R[Đối soát kết quả và lưu ánh xạ cụm]
    R --> P[Khách xem tiến độ rồi vào sử dụng]
    W --> E[Chờ, thử lại hoặc cần hỗ trợ]
    E --> R
    O[Quản trị RoomQC] --> H[Theo dõi VPS, dung lượng, backup và cảnh báo]
    H --> C
    O --> E
```

Tạo workspace phải có kết quả có thể đọc lại khi mất mạng. Việc thử lại dùng cùng định danh yêu cầu và kiểm kết quả đã ghi trước đó; không tạo thêm khách sạn hoặc bắt đầu lại thời gian dùng thử. Sơ đồ mô tả hành vi cần đạt, không xác nhận toàn bộ đã triển khai.

V1 gồm quản lý cụm/tài nguyên, nhận khách mới, trial/gói/quota, đăng ký và phục hồi, hai màn quản trị, Linux/TLS, backup/restore, cảnh báo, E2E, tải và pilot. Tự thuê VPS, HA đa vùng, SSO xuyên cụm và thu tiền thật chưa nằm trong V1. Mục tiêu 1.000 khách sạn cần mở rộng theo số đo từng cụm; chưa có bằng chứng 100.000 người hoạt động đồng thời.

## 2. Điểm xuất phát thực tế

Điểm nhận là [19.40](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1940-điểm-nhận-và-nghiệm-thu-hiện-hành).
Policy current 106/106; native 76/76, Edge 59/59, caller 28/28,
restart 8/8 + caller 2/2, interruption 13/13 đạt trong packet local.
Populated upgrade có seed 3/3 và rollback/forward/post 25/25; bảo toàn receipt,
trial và số tiền đã kiểm. Không suy thành old-binary rollback hoặc VPS upgrade.
Q02 536/536 (31 application-client checks là tập con), Q03 delivery 65/65
có scope riêng; chưa đóng writer graph hoặc triển khai engine tổng quát.

Đối chiếu OpenAPI và handler hiện có: 24 operation, gồm 8 foundation,
12 implemented-local, 3 planned và 1 partial-local. Setup-status đã nối
API/client/onboarding local; backups, tenant-summary và recheck còn thiếu handler;
hai child route infrastructure/registrations đã nối local, đọc API đang có.
Alerts/list/ack/receipt lookup đã nối backend/client/journal/UI và có proof local.
Năm thao tác cụm có client/journal/UI local; cấu hình nâng cao, backups,
totals/tenant-summary/durable recheck và live E2E còn thiếu.
Limiter hiện là bucket memory theo socket IP; T13 phải giải quyết restart,
nhiều instance và proxy trước public signup.

Nhận delta theo19.40; không làm lại wiring/current/upgrade policy đã có proof
nếu không có thay đổi hoặc lỗi mới. Giữ [populated upgrade566→572](roomqc-report-upgrade-local-2026-10-27.md),
[advice upgrade1007](roomqc-advice-upgrade-local-2026-10-27.md) và
[interruption1008](roomqc-advice-interruption-local-2026-10-27.md) đúng source
của chúng. Failed history và stability follow-up15eb vẫn thuộc packet Q04.

Advisors CLI2.121.0 của packet577 có 732 findings: 40 no-policy INFO,
7 FK INFO, 502 unused-index INFO, 183 multiple-permissive WARN; disposition
theo object/workload còn mở. ACL 40 bảng không thay kiểm quyền
gián tiếp. 70 ca not_run và 122 mục unverified vẫn giữ; chưa có số đo sức chứa
VPS hay bằng chứng 100.000 người hoạt động đồng thời.

## 3. Tài liệu điều phối và trách nhiệm

| Dùng khi nào | Nguồn cần đọc |
|---|---|
| Chốt mục tiêu, hiện trạng, thứ tự và việc nhận ngay | Bản hiện hành này |
| Giao file/input/actions/test cụ thể | [Phiếu triển khai T01–T25](roomqc-vps-signup-execution-ready-2026-10-22.md) và [checklist triển khai](roomqc-vps-signup-launch-checklist-2026-10-21.md) |
| Đối chiếu phạm vi 27 gói | [Work packages](roomqc-vps-signup-work-packages-2026-10-19.md) |
| Đối chiếu mã, dependency, môi trường bắt buộc | [Delivery ledger](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json) |
| Thực hiện và ghi kết quả 70 ca | [Worksheet](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) và [protocol](roomqc-vps-signup-acceptance-protocol-2026-10-21.md) |
| Review cơ chế phê duyệt release | [Thiết kế signed approval](roomqc-t08-signed-approval-design-2026-10-26.md), [durable authority](roomqc-t08-durable-authority-local-2026-10-26.md) |
| Nhận phần membership và quyền nhân viên | [Phiếu EC10–EC15](roomqc-ec10-ec15-execution-and-acceptance-2026-10-26.md); [baseline trước sửa](roomqc-ec10-ec15-api-red-baseline-local-2026-10-26.md); [boundary fix791 và phần chưa khép](roomqc-ec10-ec15-authority-boundary-local-2026-10-26.md) |

BE phụ trách backend/database, FE phụ trách web/Android, OPS phụ trách hạ tầng/vận hành, QA chạy và review bằng chứng, RQ là người quyết định sản phẩm/phát hành phía RoomQC. Đây là vai trò; chưa tự điền tên owner/reviewer hoặc ký thay. Một đầu mối kiểm soát contract, migration và version để tránh các phần dùng schema khác nhau.

## 4. Tám đợt bàn giao

| Đợt | Task trong đợt | Kết quả dùng được | Điều kiện chuyển bước |
|---|---|---|---|
| 1 | T01,T02,T03,T04,T05,T06,T08 | Nền bền vững, quyền và phê duyệt release đúng; số đo health đáng tin | A01–A11; B01–B07/C01–C04 đúng phạm vi; đóng delta health tại mục 6, có packet source nhất quán |
| 2 | T07 | Cảnh báo có người xử lý, chống gửi trùng/mất khi restart | B08–B09; lifecycle/outbox local đạt; host-loss delivery cần bằng chứng staging riêng |
| 3 | T09,T10 | Chọn cụm nhận khách và giới hạn tải có căn cứ | C05–C10; 20 yêu cầu tranh 1 suất không vượt limit, có tổng connection/queue/resource budget |
| 4 | T11,T12,T13 | Đăng ký, xem tiến độ, tiếp tục và tự phục hồi | D01–D15; một bộ dữ liệu qua retry/F5/hai tab/mất response; email thật nghiệm thu đúng môi trường |
| 5 | T14,T15,T16,T17 | Hai màn Hạ tầng và Đăng ký mới dùng dữ liệu thật | E01–E08; tìm đăng ký kẹt dưới 30 giây trong bài thử; action/Back/scroll/quyền đúng |
| 6 | T18,T19,T20 | Bộ cài Linux, backup/restore ngoài host và người trực | F01–F09 cùng B01/B09 cần staging; reboot/rerun giữ dữ liệu, clean-host restore và alert drill |
| 7 | T21,T22,T23,T24 | A/B đồng thời, E2E, tải/soak và release candidate | G01–G07; audit đủ 70 ca và môi trường, operating limit có số đo, defect/rollback/reviewer rõ |
| 8 | T25 | Pilot nhỏ, báo cáo quyết định mở rộng | G08 sau ít nhất 7 ngày quan sát; 1 nội bộ, ổn định 24–48h rồi cohort 5–10 đã duyệt |

Đợt là nhóm bàn giao, không thay dependency. T08 phải cung cấp nền cho T06; T14 có thể chuẩn bị khi T03/T04 đủ đầu vào. Chuẩn bị source/bundle không cần chờ toàn bộ staging, nhưng nghiệm thu phải đúng dependency và môi trường.

## 5. Phiếu giao T01–T25 và đầu ra bắt buộc

Dependency dưới đây giữ nguyên ledger. Chi tiết file và thao tác ở các phiếu liên kết mục 3; mỗi task nhận với source/target/allowed effects cụ thể và có báo cáo expected/actual.

| Task / phụ thuộc | Đầu ra cần khép | Nghiệm thu trọng tâm / vai trò |
|---|---|---|
| T01 / — | Inventory source/image/schema/config/port/volume/flag và fixture có ownership/cleanup | A01–A03; BE+OPS → QA |
| T02 / T01 | Directory migration history/checksum/lock, runtime role, volume, readiness/shutdown | A04–A07: DB trống/có dữ liệu, hai migrator, mismatch, rerun/restart; BE+OPS → QA |
| T03 / T01,T02 | Live session/capability/AAL, command mutation+audit+receipt cùng transaction | A08–A11: revoked/wrong actor deny và valid recovery; BE → QA |
| T04 / T01 | Contract/DTO/error/cursor/version/client key; typed client đọc kết quả lệnh | A03,A08–A11: mất response/headers, F5 không gửi lệnh mới; BE+FE → QA |
| T05 / T01,T04 | Host/mount/DB exporters và probe Auth/REST/Storage/Realtime/Functions có deadline | B01–B03: đối chiếu OS/DB, đúng target, private ports; OPS+BE → QA |
| T06 / T02,T05,T08 | Atomic health proof, snapshot/window/latch bền vững, timed managed runtime | B04–B07: stale/late/revision/restart không mở admission; BE+OPS → QA |
| T07 / T06 | Alert lifecycle, event+outbox atomic, retry/dead-letter/heartbeat | B08–B09: dedupe/restart/ack/reopen và host-loss delivery; BE+OPS → QA |
| T08 / T02,T03,T04 | Trusted signed release, registry/canary, issuer/revocation và quyền gián tiếp | A06,B02,C01–C04: expiry/tamper/SSRF/cross-process/no-effects; BE+OPS → QA |
| T09 / T06,T07,T08 | Admission/reservation/affinity và close/drain/reopen có version/reason/receipt | C05–C10: tranh suất/replay/expiry/close/first-dispatch races; BE → QA+OPS |
| T10 / T09 | Tổng pool/replica/worker/vendor budget, queue/deadline/quota có giới hạn | Budget tạm trước signup, chốt G05–G06 tại T23; BE+OPS → QA |
| T11 / T03,T04,T09,T10 | Verified-owner signup, private setup-status, nextAction và resume | D01–D06: đúng một tenant/hotel/trial, no leak/wrong cluster; BE+FE → QA |
| T12 / T11 | Durable job/lease/fencing, dispatch/receipt reconciliation và backfill | D07–D11: kill từng cửa sổ, stale worker, unknown commit; BE → QA+OPS |
| T13 / T11,T12 | Limiter nhiều instance, proxy/challenge, email/callback/reset/invite | D12–D15: direct Auth/forged IP/spam/signup-off và email thật; BE+FE+OPS → QA |
| T14 / T03,T04 | Hai route/menu admin, platform guard, scoped client/cache/cancellation | A03,E08: logout/revoke/workspace switch không nhận response cũ; FE+BE → QA |
| T15 / T06,T07,T09,T14 | Hạ tầng list/detail, health/backup/admission và command result dialog | E03–E05: unknown khác 0, receipt quyết định kết quả; FE+BE → QA+RQ |
| T16 / T12,T14 | Registrations search/cursor/totals/timeline, tenant-summary, durable recheck | E01,E02,E05,E08: 1.000 metadata, không impersonate/recreate; FE+BE → QA+RQ |
| T17 / T13,T15,T16 | Mobile 390px, keyboard/focus/contrast, một menu, Back/scroll | E01–E08: mọi chức năng có đường click và giữ ngữ cảnh; FE+QA → RQ |
| T18 / T06,T08 | Linux full vendor bundle pin digest, preflight/TLS/private ports/upgrade | F01–F04,B01: sai target/port/secret/volume dừng; reboot giữ data; OPS+BE → QA |
| T19 / T12,T18 | Backup nhất quán, offsite/key custody, clean-host restore và revocation checkpoint | F05–F08: DB/Auth/queue/objects/mapping/receipt khớp, RPO/RTO đo thật; OPS → QA+RQ |
| T20 / T07,T18,T19 | Named on-call/escalation, runbook/killswitch và drill | B09,F09: fault/detected/received/ack/recovery có timestamp; OPS → QA+RQ |
| T21 / T12,T13,T18 | Hai backend độc lập cùng chạy, key/Auth/DB/object/channel/volume riêng | G01–G03: token A bị B từ chối, khách A không fallback B; QA+BE+OPS → QA |
| T22 / T17,T21 | Browser/Android signup→phòng→invite→staff login và fault/reload/revoke | A/D/E/G theo worksheet: UI+API+DB/receipt proof; QA+FE+BE → QA |
| T23 / T10,T21,T22 | Workload/profile tải, soak, noisy-neighbor, capacity/cost report | G04–G06: p95/p99/errors/pool/IO/queue, operating limit; QA+OPS → BE+RQ |
| T24 / T19,T20,T22,T23 | Freeze RC, audit 70 ca, cutover/rollback/secret review, gate packet | G07; không còn Critical/High quyền/dữ liệu/cấp phát/restore trong scope; QA+OPS → BE+FE+RQ |
| T25 / T24 | Pilot đo tối thiểu 7 ngày, drills và báo cáo mở rộng | G08: lỗi/availability/cost/support, quyết định riêng cho public; OPS+RQ → QA |

## 6. Công việc nhận ngay sau API T12

Theo [kế hoạch hành động](roomqc-vps-signup-next-delivery-2026-10-28.md), bắt đầu inventory quyền hiệu lực PUBLIC/SECURITY DEFINER của recovery role, rồi adapter/worker lease-fencing, closure proof trong setup-status, backfill và durable recheck. Không giao lại dispatch/job/API đã đạt local. T10 vendor/DSN/budget/runtime còn mở: chuẩn bị T12 trong fixture không thay nghiệm thu dependency hoặc cho phép bật worker/signup thật.

Giữ backlog nền theo [19.40](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1940-điểm-nhận-và-nghiệm-thu-hiện-hành): native policy/client/mapping/freshness/retention/abuse/thiết bị, mobile money/generic exports, writer graph Q02, engine/dispatcher Q03 và indirect privilege/advisors. Policy577 và parent-boundary diagnostic đã đạt local giữ proof đúng source; full75 vẫn failed history. Không dùng diagnostic hoặc full lỗi làm reference dựng lại độc lập.

Sau khi khép các delta của candidate, freeze rồi chạy default full và independent rebuild. Trong khi phát triển chỉ chạy kiểm phù hợp thay đổi/lỗi/nghi vấn; không lặp diagnostic xanh hoặc full rộng vô hạn. [25 phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md) giữ file/bước/rollback; chưa nghiệm thu toàn task hoặc gate.

## 7. Thiết kế signup và gói sử dụng phải giữ xuyên suốt

| Bước / sự kiện | Kết quả server phải bảo đảm | Phục hồi / kiểm chứng |
|---|---|---|
| Tạo intent | Validate/challenge/limiter trước giữ suất; identity và client key ổn định | Replay cùng payload đọc cùng kết quả; khác payload conflict; không lộ email người khác |
| Chọn cụm | Trust+health+freshness+backup+policy+manual gate+budget đều đạt; reserve atomic | Một suất cuối chỉ cấp một lần; không có cụm thì chờ rõ lý do |
| Auth và verify email | Giữ affinity, callback đúng cụm/origin; owner và live session hợp lệ | Chưa verify không tạo dữ liệu nghiệp vụ; callback dùng lại/hết hạn không tạo identity khác cụm |
| Gửi khai báo khách sạn | Server quyết định tenant/role/trial/quota; ghi durable binding/job/dispatch trước remote effect | F5/hai tab/retry không tạo tenant hoặc kéo dài trial lần hai |
| Tạo dữ liệu ở cụm | Transaction idempotent tạo đúng tenant/hotel/profile/trial/receipt theo contract | Unknown response phải đọc receipt; không coi là thất bại để tạo lại |
| Hoàn tất directory | Receipt đúng workspace/cụm/routing version mới activate | Lease/fencing chặn stale worker; trạng thái `provisioning` không tự cấp quyền dispatch mới |
| Đọc tiến độ và tiếp tục | Private status trả step/nextAction/retryAfter tối thiểu, no-store | Owner mới được đọc; missing khi chưa có closure proof→chờ đối soát, proven closed→waiting_owner, unavailable→retry, conflict→needs_review |
| Mời nhân viên | Gán quyền server-side khi tạo/mời; accept đúng recipient và live assignment | Invite→accept→login→thao tác đúng vai trò; revoke/offboard có hiệu lực theo contract |
| Trial/gói/quota | Policy có version: số khách sạn/phòng/nhân sự/storage/report/retention, grace và suspension | Enforce ở server; không chỉ ẩn nút; chưa chốt policy thì không tự áp limit mới |
| Hết hạn hoặc dừng sử dụng | Hành vi grace/read-only/suspend/export/delete được RQ duyệt, có audit | Không tự xóa dữ liệu, reset trial hoặc chuyển database; thu tiền thật là backlog riêng |

Control plane lưu mapping/intent/job/receipt/health/audit và metadata vận hành; nghiệp vụ vẫn đi đến đúng cụm. Worker không lưu mật khẩu/JWT owner, không giả danh owner tạo khách sạn. Client không nhận service key hoặc quyền chọn cluster tùy ý. Metadata user có thể sửa không được dùng làm nguồn cấp quyền.

Đóng admission chỉ ngăn việc mới theo mốc kiểm quyền; không thể hủy remote write đã được cho phép và commit. T11/T12 phải có durable dispatch+remote idempotency+receipt, không chỉ một lease trong directory. Không xóa đường recovery cũ trước khi backfill và fault-recovery mới được chứng minh.

## 8. Hai màn quản trị và API còn phải hoàn thiện

Hai entry `/super-admin/infrastructure` và `/super-admin/registrations` đã nối route/menu/guard local tại T14. Giữ phần đã đạt; tiếp API/UI delta và live Auth/browser/Android acceptance. Local wiring chưa chứng minh đã deploy VPS.

**Hạ tầng:** danh sách cụm/host, nhận hay chặn khách và lý do, thời điểm đo, CPU/RAM/data disk/inode/DB connection/queue, capacity và lần backup/restore gần nhất. Chi tiết kỹ thuật mở khi cần. Đóng/drain/mở/đổi limit có reason, impact, expected version, client key và kết quả durable; response 202 chỉ là đã nhận yêu cầu.

**Đăng ký mới:** search/filter/cursor theo URL, trạng thái và cụm, thời điểm cập nhật, next action, timeline/job/receipt và lỗi an toàn. `tenant-summary` đọc đúng cụm; `recheck` enqueue và đọc completion, không tạo lại tenant hoặc impersonate. Mục tiêu bài thử tìm đăng ký kẹt dưới 30 giây trên 1.000 metadata.

Các contract cần khép gồm private `setup-status`, typed command-result recovery, workspace list/detail/timeline/search/totals, durable recheck, alerts/backups/acknowledge. Theo chuỗi **contract → handler+permission → typed client/native allowlist → API integration → UI E2E**. Phân biệt 401/403/409/429/503 và unknown commit; không sinh client key mới chỉ vì mất response.

Một menu chính có đường click cho mọi chức năng; màu thông dụng, tương phản rõ, luôn có chữ thay vì chỉ màu. Back quay lại list/filter/scroll trước, trang mới đưa nội dung lên đầu; link trực tiếp có fallback hợp lệ. Test 390px, zoom, bàn phím, loading/empty/error/unknown/stale. Logout/revoke/switch workspace phải hủy request/cache cũ, không hiển thị data của actor hoặc cụm trước.

## 9. Quản lý tài nguyên, Linux và phục hồi dữ liệu

| Phần | Việc phải thực hiện | Bằng chứng cần bàn giao |
|---|---|---|
| Capacity mỗi cụm | Tổng mọi replica×pool/vendor/worker/report/upload/Realtime/migration/backup, OS reserve và emergency headroom; queue/concurrency/deadline có giới hạn | Budget có cấu hình host/workload, query plan/pool wait/CPU/RAM/IO; không dùng công thức một user=một connection |
| Admission | Thiếu/stale/invalid/down/full hoặc backup/manual gate không đạt thì chặn mới | Race matrix, decision reasons/version; khách cũ giữ mapping và tiếp tục theo policy |
| Bổ sung cụm | Chuẩn bị host, deploy pinned bundle, validate trust/services/health/backup trước operator mở nhận | Inventory/approval/health/restore và command receipt; không tự chuyển khách cũ |
| Preflight Linux | Xác nhận exact host/IP/OS/mount/ports/volumes/network/origins/clock/secret refs; dry-run/checkpoints | Sai target, port bận, thiếu secret, volume có data phải dừng trước init/overwrite |
| Deploy/upgrade | Pin full Supabase vendor release/digest đã review; role migration riêng, readiness/schema check, graceful shutdown | Install/rerun/reboot/compatible rollback giữ data; TLS/Auth/REST/Storage/Realtime/Functions/upload/callback/CSP qua proxy |
| Mạng và quyền | DB/metrics/Studio private, firewall/TLS/rotation; API/worker không có signer hoặc DDL | Port/role/secret scan; public key chỉ xác minh, secret refs không xuất chat/report |
| Backup | Directory+DB/Auth/queue+object bytes+manifest/version/secret refs, cửa sổ nhất quán, mã hóa/checksum/retention | Offsite upload+readback; key custody ngoài failure domain; uploaded khác restore-verified |
| Restore | Host/volume sạch, cách ly không ghi source, chống hai bản cùng nhận write | Login/mapping/job/receipt/trial/phòng/invite/file bytes khớp; sai key/checksum/version/missing object phải fail |
| Thu hồi sau restore | Restore có thể làm lùi epoch/approval trong DB; đối chiếu revocation checkpoint nằm ngoài failure domain | Cô lập admission cho tới khi đối soát quyền/receipt và được mở lại đúng quy trình |
| Vận hành | Người trực chính/phụ, escalation, killswitch/reopen owner và runbook | Drill mất host/control/DB/disk/cert/key/backup/signup kẹt: fault→detected→received→ack→recovery |

Không coi Docker Desktop local là bằng chứng Linux production. Backup cùng máy không bảo vệ khi mất host. Không ký mất-host recovery nếu chưa thử bằng offsite và khóa còn lấy được khi host gốc không còn.

## 10. Bộ nghiệm thu và ngưỡng đánh giá

Giữ nguyên từng scenario/expected/task/requiredEnvironments trong [70 ca gốc](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md). Không thêm ca đánh số mới hoặc thay fixture pass thành kết quả nghiệm thu.

| Nhóm | Số ca | Nội dung phải kiểm |
|---|---|---|
| A01–A11 | 11 | Baseline, migration/data durability, quyền hiện thời, command/audit/receipt |
| B01–B09 | 9 | Đúng metric/probe, health/stale/restart, alerts và host-loss delivery |
| C01–C10 | 10 | Registry/trust/SSRF, capacity/reservation/affinity và race |
| D01–D15 | 15 | Signup/resume/private status, receipt/worker/kill, abuse/proxy/email |
| E01–E08 | 8 | Hai admin console, search/pagination, action/recovery, UX/quyền/cache |
| F01–F09 | 9 | Linux/TLS/rotation, backup/offsite/clean-host restore và on-call |
| G01–G08 | 8 | A/B đồng thời, E2E/tải/soak, cutover/RC và pilot |

Mỗi ca ghi source/image/schema/config/contract, môi trường, command và thời điểm, expected/actual, pass/fail/partial/not_run, positive/negative/recovery, row effects/receipt, failed history/limitations, cleanup và owner/reviewer/signoff. Không chứa token/DSN/khóa/PII. Test run bị skip/cancel/không có terminal exit không được trình bày là full pass.

Nghiệm thu chia ba môi trường: **local disposable** chứng minh logic và recovery có phạm vi; **staging Linux** chứng minh host/network/provider/restore/tải; **pilot** chứng minh vận hành với cohort được duyệt. Môi trường nào bắt buộc lấy từ ledger, không tự bỏ vì môi trường khác đã xanh.

| Chỉ số | Mục tiêu staging đề xuất, cần review trước áp dụng |
|---|---|
| setup-status / admin list 1.000 metadata | p95 server ≤500ms / ≤1s, payload theo page, đo window/dataset rõ |
| reserve / provision | p95 ≤1s / ≤10s sau submit, không tính chờ người dùng/email; tách queue/RPC/commit |
| Freshness | Thường ≤60s; >120s stale chặn nhận mới theo policy có version |
| Load/soak | Ramp 10→25→50→100 phiên có think time khi mức trước đạt; soak ≥60 phút; 5xx ngoài fault <1% |
| DR | RPO≤24h/RTO≤4h là đề xuất cần RQ chấp nhận; đo từ last consistent point/fault, không từ lúc bắt đầu restore |
| Host-loss alert | detected≤180s, received≤300s đề xuất, đo từ ngoài host |
| Pilot | Ít nhất 7 ngày; đề xuất availability API trọng yếu ≥99,5%, mẫu số và planned maintenance rõ |

Đây chưa là SLA hoặc policy production. RPO 24h có thể mất đến một ngày dữ liệu; nếu không chấp nhận phải thiết kế WAL/PITR cùng object consistency phù hợp. Operating limit phải thấp hơn max tested với headroom có lý do, không lấy số connection hoặc test loop làm số người dùng thực.

## 11. Quyết định phát hành và điều kiện dừng

| Gate | Điều kiện đủ để đề nghị quyết định |
|---|---|
| L — local integrated | Candidate hiện hành nhất quán, authority/health/receipt/recovery/cleanup có proof và review |
| S — staging | Exact Linux target/release/network/TLS, backup/rollback và operator; external inputs đúng case |
| P — bắt đầu pilot | Pre-pilot RC cases đủ môi trường; không Critical/High quyền/dữ liệu/cấp phát/restore; on-call/offsite restore/killswitch và cohort đã duyệt |
| U — public signup | Sau T25/G08 có số liệu capacity/anti-abuse/cost/support và quyết định mở riêng |
| B — thu tiền thật | Nghiệm thu provider/payment/security/business riêng, ngoài V1 |

Mọi gate hiện vẫn `not_authorized_by_this_ledger`. G08 chưa thể pass trước khi bắt đầu pilot; T24 audit đủ 70 ca nhưng giữ G08 pending có kế hoạch hợp lệ, sau ít nhất 7 ngày mới nghiệm thu nó.

Phát hiện quyền chéo, mất/nhân data, duplicate provisioning, unknown commit bị tạo lại, checksum drift, tài nguyên critical hoặc restore không đúng thì dừng mở rộng/đóng nhận mới theo runbook; giữ dữ liệu/receipt và route khách cũ, đối soát trước recovery. Không reset DB, xóa tenant/job, down-migrate phá dữ liệu hoặc sửa lịch sử để dashboard xanh.

## 12. Phần cần khóa/quyền và cách tiếp tục khi chưa có

| Đầu vào cần có / bên cung cấp | Task và bằng chứng bị ảnh hưởng | Phần vẫn làm được ngay |
|---|---|---|
| Exact VPS staging, mount/network/ports và quyền vận hành — RQ/OPS | T05,T10,T18,T23, B01/F01–F04/G04–G06 | Bundle/preflight/fixture/budget tham số; chưa SSH/apply vào host chưa xác định |
| DNS roomqc.com và exact app/API/admin/callback/native origins — quản DNS/OPS | T13,T18,T22, D15/F03 | Template/allowlist/local callback; tên miền được nêu chưa chứng minh DNS/TLS đã xong |
| Email provider/sender verified/webhook và hộp thư thử — quản email | T13/D15 | Outbox/internal sink, retry/dedupe/security; trang Resend đã mở không chứng minh sender verified |
| Offsite store, retention/cost và người giữ key ngoài host — OPS/RQ | T19/F05–F08 | Manifest/consistent backup/restore disposable; chưa ký offsite mất-host |
| Đích alert ngoài host, người trực và escalation — OPS/RQ | T07,T20/B09/F09/P | Lifecycle/outbox/sink local; chưa ký received khi host chết |
| Trial/quota/grace/retention/capability và người ký — RQ/BE/OPS | T03,T10,T11,T13,T25 và gate liên quan | Contract/test theo tham số, giữ policy đã duyệt; không tự áp default mới |
| Cohort, consent/support window/operating limit/kill-switch owner — RQ | T25/G08/P/U | RC và kế hoạch pilot; chưa thêm khách thật hoặc mở public |

Theo chỉ dẫn trước của người dùng, các mục cần mã khóa/quyền chưa có được tổng hợp làm sau; thiếu gì chỉ hoãn case/gate phụ thuộc mục đó, không dừng phần local độc lập. Không yêu cầu gửi mật khẩu/API key/SSH key trong chat. Dùng secret reference và kho vận hành, ghi rõ ai cung cấp; không đánh `deferred_external` thành pass.

## 13. Tiến độ, báo cáo và điều kiện hoàn thành kế hoạch

Ước lượng lịch sử toàn backlog: **30–47 ngày công**, có dự phòng **36–57 ngày công**, cộng thời gian chờ dịch vụ và pilot ít nhất 7 ngày. Đây không phải thời gian còn lại hoặc cam kết ngày hoàn thành. Ước lượng lại sau khi chốt delta T06/T08, quyền gián tiếp và inventory VPS; không cộng lại effort cho phần đã có proof.

Mỗi đợt báo cáo một packet: đầu ra nào dùng được; source và môi trường; case nào đạt/chưa đạt/chưa chạy; lỗi và ảnh hưởng; external input còn thiếu; cleanup/rollback; người review; gate được đề nghị; task tiếp theo. Không báo “ổn định hoàn toàn” từ unit tests hoặc phần trăm suy đoán.

**Việc triển khai nhận tiếp:** T10.a–f theo [báo cáo budget](roomqc-control-resource-bounds-local-2026-10-28.md), rồi T11/T12 signup/resume/worker khi đủ dependency; không giao lại control queue/validator/API binding đã đạt local. Năm thao tác cụm T09/T15, T07 backend/client/UI cảnh báo, T14 và phần đọc T15/T16 đã có proof local. T09 còn ordering races; overload control đã có proof, workload đa tenant chưa có. T07 còn Linux/kênh ngoài host và live Auth/UI. Parent-boundary đã có diagnostic đạt, không tính lại effort đã làm. Native policy client/control mapping/thiết bị → mobilemoney → F3 → writerQ02 còn lại → Q03 → Q04 của candidate cuối vẫn phải khép theo dependency và phạm vi phát hành. Target terminal/
transport và populated upgrade566→572 đã có scoped proof; giữ hồi quy theo
delta. Sau nền tiếp đủ tám đợt theo dependency. Signup, hai console, Linux/
offsite/on-call và A/B/web/Android/tải/pilot là đầu ra bắt buộc, chưa hoàn tất.

Hoàn thành bản kế hoạch nghĩa là phạm vi/dependency/đầu ra/tiêu chí/case/môi trường/đầu vào và cổng quyết định đều rõ, liên kết kiểm được. Hoàn thành sản phẩm cần bằng chứng thực chạy và review của toàn phạm vi; hai kết luận này tách biệt.

## 14. Phân rã phần nhận ngay thành các lần bàn giao

Bảng dưới giữ phân rã lịch sử T08/T06; không thay điểm nhận19.40 ở đầu trang và mục6. Không thêm task hoặc ca nghiệm thu. Thực hiện trên nhánh tích hợp; chỉ chuyển tài liệu/bằng chứng đã lọc sang cây chính. Các phần đã có proof được giữ làm hồi quy, không đặt lại trạng thái thành chưa triển khai.

| Lần bàn giao / task hiện hữu | Thao tác cần thực hiện | Kết quả phải kiểm trước khi nhận |
|---|---|---|
| Thu hồi khóa ký / T08 — đã có scoped local proof | Giữ hồi quy migration0011/fingerprint/tombstone/install guard/command/audit/receipt; xem report đầu trang | Full control346/346 có alias/nhiều cụm/khóa chưa dùng/replay/conflict/races/rollback/process; chưa thay full vendor hoặc issuer production |
| Migration và quyền / T02,T03,T08 | Thêm migration directory sau 0010 bằng runner `server/control/migrate.mjs`; tách role cài và role sử dụng; kiểm entry gián tiếp không vượt quyền | Upgrade DB có dữ liệu giữ history/checksum/receipt; hai migrator/rerun/mismatch đúng; runtime không gọi được đường ghi thay thế hoặc tự bật lại khóa đã thu hồi |
| Runtime nhiều process / T06,T08 | Nối quyết định thu hồi vào validate/health/admission/reserve/first-dispatch; giữ pre-network và commit checks; thử API/worker cũ đang chạy và restart | Response muộn không tạo generation/snapshot/reservation mới; chu kỳ tiếp không gọi network; phê duyệt mới hợp lệ khởi động lại warmup nhưng không tự mở manual/backup gate |
| Installer và readiness / T02,T04,T08 — đã có scoped local proof | Giữ hồi quy CLI/private file/role riêng/schema lock/inventory/trust; xem report đầu trang; chuyển kiểm POSIX permissions và TLS/issuer thật sang đúng môi trường T18 | Full358/358 gồm native7/7: lost-COMMIT→receipt/replay không effects lần hai; target đổi khi chờ lock bị từ chối; từ chối role/file/schema/binding/expiry/tamper. Chưa là Linux acceptance |
| Quyền nghiệp vụ gián tiếp / T03,T08 | Lập caller→RPC/Edge/view/definer/trigger/FK→data map; thử recipient/offboarding/workflow; disposition từng policy/FK/index finding theo workload | Mỗi đường nhạy cảm có positive, denial không effects và recovery; thu hồi nhân viên chặn thao tác tiếp theo; không kết luận an toàn chỉ từ direct ACL hoặc advisor exit 0 |
| Packet tích hợp / T01,T06,T08 | Freeze candidate; focused và full control, default full backend rồi rebuild độc lập; kiểm source/runtime/schema/render trước/sau và cleanup exact-owned | Native exit và fail/skip/cancel rõ; fault→deny→recovery đủ năm dịch vụ; giải thích stability follow-up 15eb; liệt kê phần local đạt và external còn thiếu, không tự ký gate |

Ngoại trừ các dòng key-wide/installer đã ghi proof và các hồi quy có report, đây là tiêu chí công việc **chưa khép**, không phải tuyên bố toàn bộ đã đạt. Khi có delta sản phẩm mới, phải tạo checkpoint mới; không gắn hash `d4cea563…` cho source đã đổi. Sau packet đợt 1, đầu việc kế tiếp là T07 alert lifecycle/outbox.

**Cụ thể hóa phần quyền nhân viên:** [phiếu EC10–EC15](roomqc-ec10-ec15-execution-and-acceptance-2026-10-26.md) giữ baseline red và lịch sử. Legacy detail/summary và system-role/owner/alias đã có proof811; browser direct writes đã khép812; terminal recovery đã có proof813. Giữ hồi quy theo source; catalog818 nay có22đích/45candidate entry paths,25unresolved dependencies. Current19/28paths là lịch sử; direct ACL không chứng minh toàn quyền gián tiếp. Không đổi additive thành deny-override hoặc tự tăng task/case/kết quả nghiệm thu.

## 15. Danh mục thao tác quản lý phải có đường sử dụng

Các thao tác dưới đây là việc con của T đã có. OpenAPI phân biệt planned với implemented-local khi handler/quyền đã có proof. Client/UI và nghiệm thu task/môi trường ghi riêng; không suy endpoint local thành chức năng đã nghiệm thu toàn bộ.

| Người dùng / tình huống | Màn hình và thao tác cần có | Kiểm phía server và dữ liệu bắt buộc / task |
|---|---|---|
| RoomQC thêm cụm | Hạ tầng → thêm cụm → xem kiểm tra → mở nhận khách | Đúng host/release/endpoint; health/backup/capacity đủ; install không tự mở admission; có version/reason/receipt / T08,T09,T15,T18 |
| RoomQC xem tải | Hạ tầng → danh sách và chi tiết cụm | CPU/RAM/disk/inode/DB/queue kèm thời điểm đo, stale/unknown khác 0; budget tổng mọi pool và headroom / T05,T06,T10,T15 |
| RoomQC bảo trì hoặc cụm đầy | Đóng nhận mới hoặc drain; xem tác động và kết quả lệnh | Không nhận thêm suất; giữ mapping khách hiện tại; reopen là lệnh riêng có kiểm quyền và điều kiện / T03,T04,T09,T15 |
| Khách đăng ký | Form → email xác minh → khai báo khách sạn → tiến độ → vào sử dụng | Server chọn cụm/role/gói; đúng một tenant/hotel/trial; có nextAction khi chờ hoặc lỗi / T11,T12,T13 |
| Khách F5 hoặc mất mạng | Mở lại tiến độ hoặc đăng nhập lại để tiếp tục | Cùng intent/workspace/cụm; đọc receipt trước retry mutation; không tạo trial mới / T04,T11,T12 |
| RoomQC hỗ trợ đăng ký kẹt | Đăng ký mới → lọc/tìm → timeline → đối soát → kết quả | Đọc đúng cụm; recheck chỉ enqueue; tách waiting_owner/retry/needs_review; không impersonate hoặc tạo tenant bằng tay / T12,T16 |
| Chủ khách sạn mời nhân viên | Quản lý nhân viên → chọn vị trí/quyền → gửi lời mời → chấp nhận | Assignment do server kiểm; invite đúng người nhận; staff login chỉ thấy dữ liệu/quyền hiện thời / T03,T08,T13,T22 |
| RoomQC quản lý gói | Xem trial, gói, thời hạn, usage và giới hạn; thay đổi theo policy đã duyệt | Enforce server-side, audit và version; không gia hạn trial qua replay; hành vi grace/suspend/export rõ / T03,T10,T11,T22 |
| RoomQC sao lưu/khôi phục | Xem lịch sử backup và restore proof; chạy runbook có quyền | Khác biệt uploaded/restore-verified; DB/Auth/objects/directory/receipt cùng checkpoint; khóa ngoài host; phục hồi cách ly / T19,T20 |
| RoomQC dừng dịch vụ khách | Xem lý do, ảnh hưởng, giữ dữ liệu và hỗ trợ xuất theo policy | Dừng quyền đúng scope; không tự xóa, chuyển DB hoặc reset trial; deletion/retention phải có quyết định riêng / T03,T11,T20,T24 |

Trang Hạ tầng phải trả lời được **cụm nào đang nhận khách, vì sao cụm này bị chặn, còn bao nhiêu tài nguyên và ai cần xử lý**. Trang Đăng ký mới phải trả lời được **khách đang ở bước nào, đã cấp dữ liệu chưa, cần khách hay RoomQC làm gì và lần đối soát gần nhất kết quả ra sao**. Thông tin debug nằm trong chi tiết, không lấn phần hành động chính.

## 16. Điều phối, chốt policy và bàn giao nghiệm thu

Trước khi nhận một task, ghi input/source/target, phần đã có proof được giữ, phần sẽ sửa, effects được phép và cách rollback. Khi bàn giao, đối chiếu đúng output/case/môi trường ở mục 5 và worksheet. Không đóng task vì đã có file hoặc màn hình.

| Cần chốt | Đầu ra cụ thể cần ghi | Mốc cần dùng / khi chưa chốt |
|---|---|---|
| Gói dùng thử và gói dịch vụ | Thời lượng trial; số workspace/hotel/phòng/nhân viên/storage; quota cứng/mềm; grace và thao tác bị chặn; policy version | Trước enforcement T10/T11/T13; vẫn làm contract/fixture tham số, chưa áp giới hạn mới |
| Dữ liệu khi hết hạn/ngừng dùng | Quyền đọc/xuất; retention; người có quyền gia hạn/suspend/delete; thông báo và audit cần giữ | Trước cutover/pilot; không mặc định xóa dữ liệu |
| Sức chứa và ngân sách | Cấu hình từng host, tổng pool, IO/storage/egress, chi phí offsite/email; max-tested và operating limit có headroom | Budget tạm T10, số đo T23; chưa hứa số user/khách sạn trên mỗi VPS |
| Phục hồi và vận hành | RPO/RTO chấp nhận được, offsite/key holder, on-call chính/phụ, escalation và quyền reopen | Trước T19/T20/P; thiếu input chỉ hoãn ca phụ thuộc |
| Phát hành | Người chạy/reviewer/release owner; cohort pilot, giờ hỗ trợ, điều kiện dừng/mở rộng | Trước ký gate liên quan; giữ signoff trống khi chưa có người nhận |

**Nhịp báo cáo:** cuối mỗi đợt mục 4 có một báo cáo kết quả. Lỗi quyền/dữ liệu/cấp phát/restore được báo ngay cùng ảnh hưởng và hành động chặn; các mục cần khóa/quyền được gom vào danh sách external đang chờ. Mọi báo cáo chỉ ra task và bước tiếp theo để không quay lại kiểm lặp một nhánh đã đạt trong khi các đợt còn lại chưa làm.

**Nghiệm thu kế hoạch:** đủ 25 dependency rows, 27 package mappings, 70 case/environment mappings, không vòng dependency, mọi chức năng có đường sử dụng, các liên kết nội bộ hợp lệ và nguồn tiến độ nhất quán. **Nghiệm thu sản phẩm:** chạy đúng các môi trường bắt buộc, evidence và reviewer cho từng ca; giữ G08 chờ pilot trước khi quyết định U. Biên bản kiểm tra tài liệu chỉ xác nhận vế thứ nhất.

Kết quả kiểm tra tĩnh của lượt bàn giao này lưu tại
[biên bản kiểm tra kế hoạch](../../../artifacts/roomqc-vps-signup-plan-validation-2026-10-27.json).
Sau packet policy local, bản refresh readiness hiện hành là
[artifact 28/10](../../../artifacts/roomqc-vps-signup-plan-readiness-final2-2026-10-28.json).
Đối chiếu dependency/case/package, 54 ca cần local, 69 ca cần staging, 1 ca cần
pilot, các API planned/partial và liên kết tài liệu. Các tập môi trường chồng
nhau; đây vẫn là70ca, không tự tạo thêm ca release. Biên bản không thay kết quả
chạy sản phẩm, review, gate hoặc bằng chứng sức chứa VPS.

## 17. Lệnh giao việc đầu tiên sau baseline API red

Phần này giữ lịch sử baseline quyền trước993; điểm nhận hiện hành ở mục6,
phiếu19.38 của phiếu chi tiết.

**Cập nhật818 cho bảng lịch sử dưới đây:** bước3–5 đã có backend/editor/catalog/
readback; direct browser DML812, terminal outcomes813 và source Edge817 đã có scoped proof.
Nhận bước1/2/6 về deployment inventory/writer khác/current24indirect/monitor/advisors rồi bước7 freeze/full
pipeline. Browser/Android/transport fault thật vẫn ởT22. Không giao lại readback,
direct revoke hoặc terminal logic như chưa triển khai; giữ hồi quy và kiểm delta.
Full control384/384 và scoped hồi quy thuộc818; default full817 đã fail cascade và đã có fix818. Default full818 đã hoàn tất; rebuild bản cuối cần packet riêng.70ca và chữ ký chưa đổi.

Phần này cụ thể hóa T03/T04/T08 và EC10–EC15, không thêm task hoặc ca release.
Boundary scope/live authority đã có [bản sửa791 và scoped proof](roomqc-ec10-ec15-authority-boundary-local-2026-10-26.md):8fail cũ bị chặn, thêm lock/expiry controls. Chưa đóng toàn bước1/2 vì
inventory/indirect/workflow vẫn mở. Nhận phần còn lại bước1/2/5/6, giữ hồi quy
command/editor đã đạt; source hiện tại chưa đủ mở thêm khách thật.

| Thứ tự / người thực hiện → review | Input và thao tác cụ thể | Bằng chứng bắt buộc để bàn giao |
|---|---|---|
| 1 / BE → QA | Lấy26controls/4readbacks làm baseline, chốt actor-target matrix; kiểm INSERT/UPDATE/DELETE và RPC/trigger/definer cho user_permissions/user_hotels; đối chiếu tenant thật của user và hotel, hierarchy và quyền tự sửa | Inventory có allowed/denied/unresolved, mọi active caller có file; giữ foreign-owner/staff negatives và positives; hai scope exploits không còn effects, kiểm cả đổi target trong UPDATE |
| 2 / BE → QA | Đặt live session/profile/role và target checks vào transaction; khóa theo thứ tự có tài liệu, kiểm lại sau chờ lock; không tin user_metadata hoặc supplied tenant_id | Locked/inactive/deleted-session đủ6ca bị chặn; old JWT, revoke/role-drop khi chờ lock và recovery hợp lệ có API+DB proof; denial không làm đổi business rows/version/receipt |
| 3 / BE → FE+QA | Thiết kế hai aggregate saves: custom grants và hotel membership+cờ; expected version, stable key, canonical digest, mutation+audit+receipt atomic; result lookup đúng actor/target | Lỗi audit/receipt rollback; mất response sau commit đọc lại cùng receipt; replay20lần chỉ1commit; cùng key khác payload conflict; hai editor một bên thắng; không có partial membership/flags |
| 4 / BE+FE → QA | Giữ read model/enforcement/editor đã đồng bộ ở811; effective/custom/inherited/source/version, owner/system role/alias | Actual API811 đã kiểm bốn đường đọc, owner/system-role/alias/additive; kiểm delta nếu sửa tiếp và bổ sung browser/Android, không coi API proof là UI proof |
| 5 / FE+BE → QA | Chuyển active save callers sang một command; bỏ DELETE+INSERT và remove/add/PATCH từng hotel khỏi save path; pending recovery, error mapping, cache scoped/cancel và draft lifecycle | Ngắt trước commit giữ cấu hình cũ; F5/hai tab/mất response không tạo key mới; đổi user/workspace/logout/revoke không nhận response cũ; web và Android/mobile390 có đường dùng |
| 6 / BE+QA → OPS | Khép direct/privileged compatibility sau khi inventory caller; kiểm legacy Edge update-user và các đường registration/invitation/profile; review indirect/current19/workflow và667advisor findings811 | Đường ghi còn dùng có boundary và proof atomic/live authority phù hợp, đường bỏ dùng có disposition/deployment inventory; không revoke trước khi positive signup/invite/profile đạt; scan lại khi schema đổi |
| 7 / QA+OPS → BE+FE+RQ | Freeze candidate mới; focused/full control/default full backend/independent rebuild, so source/schema/runtime/render trước-sau; packet lỗi và cleanup | Native exit/failed history đầy đủ; source mới có proof riêng,9baseline failures được đối chiếu từng control; không Critical/High còn mở trong phạm vi trước đề nghị gate |

File nhận cụ thể ở mục3 của phiếu EC10–EC15. Bước3–5 cần contract thống nhất
trước đổi caller; không đưa endpoint planned vào UI như đã triển khai. Review
API baseline không thay browser/Android journey hoặc nghiệm thu môi trường Linux.

**Hồ sơ bàn giao đợt sửa:** bảng trước/sau từng control; commit effects/audit/
receipt/version; ma trận caller và direct-write disposition; source/schema/image
refs; lệnh/thời gian/exit; cleanup; failed attempts; giới hạn còn mở và người
review. Không chỉ ghi “test xanh”. 70 worksheet rows giữ nguyên cho tới khi
đủ đúng scenario và môi trường; baseline bổ sung không tự ký A08–A11/E08.

**Sau bàn giao:** lần lượt T07 → T09/T10 → T11/T12/T13 → T14–T17 → T18–T20 →
T21–T24 → T25 theo dependency mục5. Không đưa estimate lịch sử30–47ngày công
thành thời gian còn lại; cập nhật effort sau inventory và contract của bước1–3.

## 18. Giao việc chi tiết và nghiệm thu theo phạm vi đã chốt

Đầu ra được chốt: **toàn bộ VPS + signup / Plan + nghiệm thu**. Nhận
[bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md) và [25 phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md),
không mở roadmap mới. Mỗi T có file/bước làm/dependency/đầu ra/rollback; mỗi ca
phải đủ requiredEnvironments của worksheet và evidence/reviewer trước đề nghị ký.

Phần nhận hiện hành là [kế hoạch hành động sau API T12](roomqc-vps-signup-next-delivery-2026-10-28.md) và [phiếu19.46](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1946-kế-hoạch-hành-động-và-nghiệm-thu-sau-api-t12). Bản nháp policy577/source1022 ở19.38 và các checkpoint/lệnh giao cũ là lịch sử; policy regression đã có proof local. Giữ Q02/Q03 và full candidate gate còn mở; nghiệm thu từng đợt theo dependency, không thừa kế proof sang source mới.

Đối chiếu lượt này ghi tại [biên bản kiểm kế hoạch](../../../artifacts/roomqc-vps-signup-plan-readiness-1022-2026-10-27.json):
inventory và cú pháp khác kiểm SQL/runtime. Bản kế hoạch chỉ được đánh chuẩn
bị xong khi 25 dependency rows,27package mappings,70case/environment mappings,
link/anchor và bảo vệ dữ liệu/implementation đều kiểm được. Không phát sinh
cam kết launch date, capacity hoặc policy thương mại từ việc duyệt tài liệu.

Lượt chuẩn bị này giữ nguyên70case,122release entries,owner/reviewer/signoff và
gates L/S/P/U/B. Chỉ sanitized docs/artifact được mirror; chưa deploy, mở signup,
test browser/Android/tải/restore/pilot hoặc gọi provider thật.

### Cập nhật 28/10/2026 — local policy packet đã đạt

Packet migration577 đã được chạy lại trên fixture Docker exact-owned. Policy
current đạt106/106; workflow native76/76, Edge59/59, production caller28/28, restart8/8 + caller2/2,
interruption 13/13; populated upgrade 576→577 seed3/3 và control25/25. ACL/no-
policy 40 bảng đạt; advisors CLI2.121.0 ghi732 findings cần disposition. Biên
bản và artifact: [policy regression](roomqc-advice-policy-live-regression-local-2026-10-28.md).

Kết quả này chỉ đóng packet local policy/upgrade/regression của T01/T03/T04/T08/
T10/T13. `productAccepted=false`; chưa thay đổi 70 case, 122 release entries,
signoff hoặc gate. VPS/Linux, DNS/TLS, email thật, offsite restore, browser/
Android, load/soak, pilot và review vẫn là điều kiện bắt buộc tiếp theo.
