# T06 — kiểm bằng chứng health tại write và admission, local 22/10/2026

Kết quả: đã tái hiện và sửa cửa sổ rotate sau manager assertion nhưng trước
health commit. Candidate cuối full control **254/254**,0 fail/skip/cancel,exit0.
Đây là delta local của T06/T08, không đóng toàn task hoặc mở gate.

Source triển khai ở roomqc-worktrees/integration, branch
codex/roomqc-parallel-integration, HEAD5cb583729ce055db64df8b192f10476db1fa99b8.
Primary chỉ nhận docs/artifact, không nhận code/migration hoặc được redeploy.

## 1. Source và phạm vi

Manifest có762 file:546 migration Supabase nghiệp vụ,8 migration directory.
SHA256 trước/sau full run:
`8dc491fc8eb16235465abef9caf47597160afe58c42e5327bffc8ba84edc441a`.
Phạm vi kế thừa757 của [T08](roomqc-t08-release-validation-local-2026-10-22.md)
+5 file mới; không phải hash mọi file repository hoặc runtime đang phục vụ.
Product delta20 file:19 MJS +directory0008; không thay Supabase business migration.
[Artifact](../../../artifacts/roomqc-t06-health-proof-local-2026-10-22.json)
giữ path manifest và hash từng file. [ADR](../adr/roomqc-health-proof-fencing.md)
ghi contract, quyền, warmup và rollout.

## 2. Lỗi đã tái hiện

Hai giao dịch thực xếp hàng trên advisory727001 sau một blocker. Installer được
đưa vào hàng trước, health write thứ hai. Manager đã kiểm revision1 trước đó;
installer commit revision2 trước health. Code cũ vẫn accepted:true,generation2
thay vì HEALTH_PROOF_CHANGED. Red reproduction1 test/0pass/1fail,exit1; không
chỉ suy đoán từ thứ tự async. Chưa đóng băng source ở lượt red, không gán red
cho candidate cuối.

Sau sửa, cùng thứ tự transaction từ chối proof cũ, không đổi health/policy/
health event hoặc sequence generation. Proof revision2 mới ghi thành công,
nhưng bắt đầu warmup; không tự mở nhận khách.

## 3. Thay đổi sản phẩm

- HealthStore bắt buộc proof đầy đủ; tính lại binding hash và so live credential,
  cluster endpoint/inventory/release/schema, policy version, target version sau
  lock. Dùng DB clock_timestamp sau chờ để kiểm freshness/expiry.
- Snapshot chỉ lưu projection an toàn của proof, không user/session/token/key.
  Binding/revision đổi bắt đầu lại warmup/recovery, vẫn giữ critical latch cũ.
- Admission đọc live metadata và approved binding; rotate, refreshing/recovery,
  expiry hoặc thiếu/thay inventory/catalog đều chặn mới ngay. UI health unknown
  nhưng vẫn giữ số đo cũ để điều tra. Không đổi mapping khách đã hoạt động.
- Directory0008 chỉ mở SELECT bảy cột metadata cho API/worker/metrics. Toàn bảng,
  envelope/Auth user/session và write vẫn deny. Trigger private SECURITY INVOKER
  BEFORE STATEMENT lấy advisory trước row lock để serialize direct installer writes.
- Worker nhận probes+evidence có policy/target context trước network; từ chối
  bare booleans. managedHealthProbe nối manager với serviceProbeConfiguration,
  bắt buộc server-owned Storage digest; không giữ transaction qua remote call.
- Catalog.expectation chỉ trả immutable approved release identity. Catalog.get
  dùng validate vẫn kiểm token expiry; không có fallback service-role/Auth-health.
  CLI mặc định chưa nối manager thật vẫn báo unconfigured, không giả healthy.

## 4. Nghiệm chứng trên candidate cuối

Lệnh chạy tại integration:

```powershell
node scripts/test-control-directory.mjs
```

Kết quả terminal session18731:254 tests,254pass,0fail,0skip,0cancel,exit0,
134838.2725ms. Runner bật ROOMQC_CONTROL_DB_TEST=true. Bao gồm7 health-proof DB
cases và4 health-evidence unit cases; không cộng lại chúng ngoài tổng254.

| Case group mới, không thêm ID roadmap | Bằng chứng |
|---|---|
| Rotation thắng trước write | Hai waiter thật, revision2 thắng; proof1 reject/no-effects/sequence không tiến; proof2 recovery |
| Snapshot cũ sau rotation/expiry/recovery/approval drift | API role thật xét blocked/unknown; reserve khách mới fail; snapshot và workspace cũ không đổi |
| Proof thiếu/tamper/future/stale/policy/release sai | Mã lỗi contract, no-effects và valid recovery |
| Proof hết hạn lúc chờ + write thắng trước rotation | DB clock sau lock; inverse order ghi được trước rồi admission đóng ngay khi rotate |
| Policy commit và credential expiry lúc chờ | Đã quan sát waiter; không dùng thời gian/version trước lock; valid recovery |
| Metadata grants/direct installer lock | Actual metrics/API SELECT metadata được; ciphertext/identity/write/call trigger deny42501; installer không giữ row lock khi chờ advisory |
| Managed worker | Manager/store thật, controlled service callback; advisory có thể lấy trong callback; proof đến snapshot; bare boolean không ghi |

19 MJS ESLint --max-warnings=0 và node --check đạt; git diff --check tracked
đạt. Source freeze trước/sau không đổi. Independent inspection cho container,
network,volume của cả6 test label families đều0. Không xóa tài nguyên ngoài
exact-owned fixture, không thay DB đang phục vụ/CRM/VPS/DNS/provider/email thật.

Directory proof dùng encrypted synthetic bundles qua actual runtime/installer
roles. Callback dịch vụ có kiểm soát, không tự nhận là đủ năm dịch vụ vendor
thật trong cùng timed pipeline. Full suite có native GoTrue, real REST manifest,
monitoring và protocol checks riêng; chúng không tự hợp thành full-vendor E2E.
Monitoring scope docker-desktop-vm; năm service probes của monitoring fixture
vẫn deliberately false; không mở admission production.

## 5. Lịch sử phải giữ và cách sửa harness

- Red race1/0/1 đã nêu ở trên, là lỗi sản phẩm thật.
- Intermediate directory run41/40/1,exit1: PostgreSQL53100 hết512MiB tmpfs khi
  tạo thêm DB kiểm thử cuối. Không relabel thành pass. Tăng cap tmpfs riêng của
  fixture lên1GiB; không tăng budget sản phẩm hoặc sửa expected assertions.
- Focused proof7/7 và unit/release7/7 đạt trước lần rà bridge cuối; giữ đúng
  phạm vi intermediate, không gán nguyên source cho candidate cuối.
- Full run session22213 trên sourcef96b0f15… đạt253/253,exit0. Rà sau run thấy
  managed adapter chưa nhận Storage digest cần cho collector thật; đã sửa input
  bắt buộc, thêm unit rồi rerun full trên8dc491f… thành254/254. Không thừa kế run
  f96 như nó đã kiểm source mới, không xóa lịch sử.

## 6. Giới hạn và bước tiếp theo

Chưa nghiệm thu: issuer/provision/rotation automation và cross-replica approval
revision; CLI/runtime nối registry→manager→năm vendor services→Prometheus→health
→admission trong cùng timed pipeline; restart/fault/stale/warmup thực theo plan.
Storage digest mới là server input, chưa thay bộ cài tài nguyên canary/issuer.

Tiếp phần local đó cùng indirect/workflow/recipient/offboarding/policy135/FK
disposition còn mở, rồi alert/outbox→admission/aggregate budget→private signup
status/resume/reconcile→hai admin console→Linux/TLS/offsite/on-call→simultaneous
A/B/browser/Android/load/RC/pilot theo dependency. Không nhận lại boundary fix
hoặc chạy lặp suite cùng source chỉ để tăng count.

Không có full-vendor A/B, frontend/TypeScript, Linux/TLS, email Internet, offsite
DR/on-call, E2E/load/soak/pilot trên8dc ở lượt này. Proof source cũ2495/e5/f7
giữ lịch sử; không gán sang8dc. Independent reviewer/signoff còn null.
122 releaseAcceptance entries vẫn unverified; L/S/P/U/B không thay đổi.

## 7. Rollout và an toàn vận hành

Đây là source chưa deploy. Snapshot legacy thiếu proof không được backfill từ
boolean; nâng migration0008 theo runbook và restart candidate tương thích khi
được phép, giữ nhận mới đóng cho tới collection+warmup+operator review. Existing
customer routing không bị admission gate này đổi sang cluster khác.

Mỗi credential revision mới làm lại warmup, kể cả same-session refresh: đây là
fail-closed có chủ ý. Nếu muốn continuity phải thiết kế/prove riêng, không bỏ
fence. Critical latch vẫn giữ. Không down-migrate, reset DB hoặc xóa audit/tenant
để rollback; dùng binary/config tương thích và đối soát receipt khi có sự cố.

Hướng dẫn Supabase/PostgreSQL đã dùng cho metadata-only grants, private invoker
trigger và transaction advisory lock; đối chiếu changelog/self-host/security
ngày22/10. Không nâng vendor theo latest hoặc áp schema vào Supabase nghiệp vụ.
