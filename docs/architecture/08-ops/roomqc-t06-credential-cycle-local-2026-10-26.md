# RoomQC — credential cycle/recovery: checkpoint26-10

Phạm vi: checklist conT01/T05/T06/T08, không thêm task/case hoặc đổi gate.
Đây là scoped local checkpoint; [JSON đã lọc](../../../artifacts/roomqc-t06-credential-cycle-local-2026-10-26.json).
Không phải nghiệm thu toàn bộ VPS/signup.

## 1. Kết luận

Lượt974dba47562a đã **terminal exit0**: giữ response metrics thật rồi rotate/
disable credential; old proof bị fence tại health commit, chu kỳ kế tiếp thấy
PROBE_CREDENTIAL_DISABLED; installer phục hồi bằng cùng user/session mới;
sample mới bắt đầu warming, worker shutdown exit0 và hai pool đóng.
Admission luôn manual_closed; cleanup độc lập container/network/volume0.

Lỗi timeout của run15eb29de822d **không tái hiện trong lượt có instrumentation**.
Chưa xác định nguyên nhân gốc và không sửa production scheduler/deadline để
đạt test. Giữ lỗi này ở stability follow-up cho default full run/rebuild;
không đổi fail cũ thành pass hoặc tuyên bố đã sửa dứt điểm.

Source cuối9518716… có full control298/298,0fail/skip/cancel và test timeout
độc lập đã sửa. Backend checkpoint chạy trên85c9ebe… trước delta test-only;
không relabel backend proof thành9518716 hoặc full timed acceptance.

## 2. Nguồn và thay đổi

| Nguồn | Binding / kết quả |
|---|---|
| Actual backend checkpoint85c9ebe… |773scoped files,546business+9directory migrations; runtime142/a5c2b393…; diagnostic974dba47562a/session92247 terminal0, source/render khớp đầu/cuối |
| Source cuối9518716… |773scoped files,546business+9directory migrations; runtime142/65b528d0…; full control298/298/exit0,134183.2061ms; source đầu/cuối không đổi |
| Khác biệt sau backend run | Chỉ test hanging-source thêm bounded referenced handle để chạy riêng trên Node pin; không sửa worker runtime hoặc timeout sản phẩm |

SHA256 đầy đủ và manifest kế thừa nằm trong artifact. Đây không là fingerprint
toàn repository hoặc bằng chứng source đang deploy. Vendor pins giữ nguyên.

Các file thay đổi trong lượt:

- `scripts/control-backend-managed-client.mjs`: allowlisted cycle events và
  observer có lastStartedAt/lastFinishedAt/error/counters; không dump event/config.
- `scripts/control-backend-managed-health.mjs`: progress phân biệt cycle cũ/mới,
  active và credential state/revision.
- `server/control/health-worker.test.mjs`: regression scheduler sau commit fence,
  disabled cycle/no metric/write, recovery; sửa isolated timeout test.
- `server/control/managed-backend-harness.test.mjs`: giữ entry constraints và
  kiểm explicit lifecycle logging allowlist.

Không source product khác, migrations, grant, vendor pin hoặc serving runtime
được thay đổi trong lượt này. Existing dirty edits vẫn được giữ.

## 3. Actual timeline974dba47562a

| Mốc | Actual / điều kiện |
|---|---|
| first_sample | Worker ready, credential ready revision1, health warming, generation1 |
| rotate fenced |1→2; actual metrics response đã held trước mutation; HEALTH_PROOF_CHANGED; zero successful targets và persisted sample/collector audit/policy guard không đổi |
| rotate recovery | Worker ready, sample revision2 và generation2/warming; không nhận là đã warmup300s |
| disable fenced |2→3; actual response overlap; HEALTH_PROOF_CHANGED; sample/audit guards không đổi, admission đóng |
| disabled next cycle | Cycle start1792984163105, finish1792984163218, sau cycle disable; PROBE_CREDENTIAL_DISABLED,0successful targets, DB credential disabled revision3 |
| same-user new session | Installer recover3→4; sameUserNewSession=true, không kéo dài session cũ |
| recovery sample | Cycle finish1792984226775; worker ready, credential ready4, warming mới/generation4. Không suy generation4 chỉ do một write: stale sweep/audit vẫn hoạt động độc lập |
| shutdown/render/source | Worker exit0, poolsClosed2, rendered configuration và source binding khớp đầu/cuối |
| cleanup | Harness cleaned=true; kiểm độc lập đúng run/label: container0/network0/volume0 |

Fixture approval vẫn synthetic, đo trên Docker Desktop VM. Directory disable
không là remote Auth logout; remoteAuthRevokeProved=false. Không offsite/Linux/
issuer/cross-replica proof, không public admission.

## 4. Kiểm thử và lịch sử lỗi

| Lượt | Actual | Disposition |
|---|---|---|
| Full control85c9ebe… |298/298,0fail/skip/cancel,exit0;134723.4326ms | Đúng source trước isolated-test fix, không gán sang951 |
| Isolated pinned Node trước fix |1pass,0fail,5cancel,exit1 | AbortSignal.timeout không giữ event loop; class test không có HTTP handle của runtime. Không coi cancel là pass |
| Isolated scheduler-only trên Node pin |1/1,0cancel/skip,exit0 | Scheduler fault→disabled→recovery hoạt động; không thay full class suite |
| Isolated host sau fix |6/6,0fail/cancel/skip,exit0 | Bounded ref handle/cleanup, không sửa production deadlines |
| Isolated pinned Node sau fix |6/6,0fail/cancel/skip,exit0 | Đúng image Node đang dùng cho backend |
| Full control source cuối951 |298/298,0fail/skip/cancel,exit0 | Session26321 terminal, không phải trạng thái đang chạy |
| Syntax/lint cuối |4files syntax đạt; lint0error/warning | Recommended JS + allowEmptyCatch; không thay lịch sử strict lint cũ |
| Default full backend951 / independent rebuild |not_run / not_run | Đợi genuine config/restart delta rồi freeze candidate kết hợp |

AbortSignal test fix chỉ cung cấp một referenced handle có trần2s trong
try/finally; runtime thật đã có HTTP server. Không tăng target25s, collector12s,
warmup300s, recovery600s hoặc cửa sổ chờ diagnostic để làm xanh.

Run15eb/0f1c605… terminal1 giữ nguyên trong
[report23-10](roomqc-t06-metrics-credential-local-2026-10-23.md).
New instrumentation giúp quan sát cycle; nó không chứng minh nguyên nhân fail
cũ. Cần kiểm stability tiếp, không gọi đây là production scheduler fix.

## 5. Cleanup, bảo vệ và nghiệm thu

Full control cuối: sáu label families×container/network/volume=18checks đều0.
Backend974dba và isolated unit container đúng label đều0. Private owned roots
giữ lại để điều tra; không xuất ownership, .env, bundle, keyring, log hoặc tokens.
Không prune Docker toàn máy hay xóa dữ liệu khách.

Primary chỉ nhận docs/artifacts đã lọc; index và hai delivery ledgers không đổi.
122 releaseAcceptance entries vẫn unverified,70worksheet vẫn not_run,
L/S/P/U/B không được mở bởi packet; reviewer/signoff chưa có. Không deployVPS,
đổiDNS/provider, gửi emailInternet, tạoagent/worktree/commit/merge.

## 6. Nhận việc kế tiếp

1. Nhận source9518716… và scoped backend checkpoint85c9ebe… đúng phạm vi.
   Không chạy lại credential packet chỉ để tăng count; giữ regression và
   stability follow-up15eb trong full combined run.
2. Thực hiện [plan15.2](roomqc-vps-signup-execution-ready-2026-10-22.md#152-chính-xác-thế-nào-là-thay-đổi-cấu-hình-có-hiệu-lực):
   genuine update_policy, inventory-approved telemetry binding, release/catalog
   authority và restart trong lúc response thật đang chờ. Sửa file catalog
   đơn thuần không là withdrawal live. Giữ command/audit/receipt, no SQL version
   hoặc timestamp forgery, old proof fence và recovery/warmup mới.
3. Hoàn tất delta→freeze→focused→DB-enabled full control→default full backend
   giữ mọi business workflow/timed window→independent full rebuild có reference
   đủ điều kiện. Diagnostic có fullTimedDrillExecuted=false không được dùng.
4. Tiếp indirect/workflow/issuer, alerts, admission/budget, private setup-status/
   resume/reconcile, hai console, Linux/TLS/DR/on-call, A/B đồng thời/browser/
   Android/load/RC/pilot theo8đợt/27gói/T01–T25/70case; không thu hẹp mục tiêu.

Đây là tiến bộ có evidence, không phải tuyên bố toàn bộ plan đã hoàn tất.
