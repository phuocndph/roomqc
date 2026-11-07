# T06 — managed health runtime local, 22/10/2026

Đây là delta triển khai local của T06, liên quan trust/canary T08; không đóng
toàn T06/T08 hoặc mở gate phát hành. Implementation chỉ ở integration worktree.
Primary chỉ nhận tài liệu và artifact đã sanitize.

## 1. Kết quả đã triển khai

Worker CLI đã có đường cấu hình thật để dùng ProbeCredentialStore,
ProbeSessionManager, managedHealthProbe và **collectServiceProbes mặc định**
thay vì chỉ có probe được inject từ test. Không cấu hình vẫn giữ fail-closed;
cấu hình một phần hoặc sai thì từ chối startup, không fallback sang API env,
service_role, password grant hoặc kết quả healthy giả.

Delta gồm 9 file: 8 MJS và 1 compose override; 3 file mới. Không thêm migration,
không sửa dữ liệu DB đang phục vụ, DNS/provider/email hoặc runtime VPS.

| Hạng mục | Hành vi mới |
|---|---|
| Config schemaVersion 2 | Cộng probeInstances × probePoolMax vào tổng budget; số replica probe phải bằng health; pool 1–4 |
| Config v1 | Tiếp tục hỗ trợ worker unconfigured, không được cấp thêm pool canary ngoài budget |
| Managed metadata | Exact schema, đủ target, đúng host/cluster/release, approved addresses, public key và Storage digest; không chứa token/refresh/password |
| Hai pool | Metrics và probe dùng login khác trên cùng primary directory; có acquire/query/lock/idle timeout, tên ứng dụng riêng |
| Quyền probe runtime | Từ chối role installer, DDL/business privilege và cả role metrics kết hợp |
| Private files | Absolute regular file, không symlink, kiểm identity lúc open, đọc giới hạn max+1 bytes và Unix quyền; lỗi đã redacted |
| Keyring | Dùng cùng bounded reader, tránh readFile không giới hạn sau stat |
| Runtime | Probe readiness được kiểm trong probe path sau stale sweep độc lập; lookup catalog/manager theo target cố định |
| Publishable identity | Bundle có public key khác metadata đã duyệt bị chặn trước collector |
| Lifecycle | Đóng cả hai pool đúng một lần kể cả constructor/startup failure; pool end treo có deadline |
| Compose | Override opt-in, thêm backend network và đúng probe DSN/keyring/metadata; không thêm port public hoặc issuer/API secrets |

Metadata do installer/release owner phê duyệt ngoài runtime. File cấu hình này
không thay issuer automation hoặc provenance nhiều replica; các phần đó vẫn mở.
Không lưu password, Auth JWT hoặc refresh token trong metadata. Encrypted bundle
hiện có vẫn do installer cấp trong directory theo binding/revision.

## 2. Candidate và bằng chứng

- Source scope: **765 file**, **546 business migrations**, **8 directory migrations**.
- SHA256: `10e89a23ac968e783ea3b29da3c090466b24c999cdccfcdc8d7a6fc6f156c76f`.
- Scope kế thừa manifest T06/8dc và union 3 file mới; không là fingerprint toàn repo
  hoặc binary/schema đang deploy.
- Full control: `node scripts/test-control-directory.mjs`, session 55201 terminal
  exit 0; **265 tests / 265 pass / 0 fail / 0 skip / 0 cancel**, 131288.906ms.
- 10 managed unit/runtime cases và 1 real-directory case mới là **subset** của265.
- Focused health/managed/probe-secrets/session:21/21 trên code cuối. Real-directory
  focused:1/1 trước refactor keyring reader; case đó được chạy lại trong full265.
- ESLint 8 MJS với max-warnings=0, syntax8 và tracked whitespace:exit0.
- Source không đổi trong hồi quy; primary index và hai bản ledger không đổi.

Real-directory case đọc private config/DSN/keyring, dùng hai role PostgreSQL thật,
persist revision proof, chặn metrics đọc ciphertext, phát hiện probe login mang
thêm role metrics, vẫn expireStale và phục hồi khi revoke quyền thừa. Collector
và số đo trong **case này là fixture có kiểm soát**, Auth claims synthetic;
không dùng nó thay bằng chứng full-vendor năm dịch vụ hoặc host metrics.

Full suite vẫn có monitoring thật trên Docker Desktop VM và GoTrue lifecycle
thật theo scope riêng; không suy chúng đã chạy chung pipeline managed mới.

Compose được ghép/validate bằng binary Compose **5.0.2** đã cài trên máy, chỉ
`config --no-interpolate --format json`, không tạo resource. Kết quả có đủ
directory/metrics/backend, ba secret metrics-dsn/probe-dsn/probe-keyring,
read_only/cap_drop ALL, 2 bind volumes và **0 published ports**.
Lệnh `docker compose` không được CLI hiện tại nhận diện; đã dùng trực tiếp binary
đã có, không cài plugin hoặc sửa Docker config.

## 3. Lịch sử lỗi giữ nguyên

1. Lượt focused thiếu ROOMQC_CONTROL_DB_TEST=true:1 case skipped; không tính pass.
2. Focused DB lần đầu:1/0/1, exit1. Fixture đã install binding không có approved
   address trong khi managed catalog có allowlist127.0.0.1; proof bị fence đúng.
   Sửa fixture để installer cấp bundle theo đúng approved binding mới.
3. Focused DB lần hai:1/0/1, exit1. Fixture chỉ lùi valid_until, vi phạm constraint
   valid_until > observed_at. Đã đọc constraint và lùi cả cửa sổ timestamp hợp lệ.
4. Focused DB sau sửa:1/1/0, exit0; full265 đạt trên candidate cuối. Không sửa
   constraint, nới expiry/proof hoặc loại assertion sản phẩm.

Các lần config check bằng `docker compose` thất bại do discovery không có subcommand;
validate bằng binary Compose cài sẵn đạt, giữ giới hạn không chạy stack.

## 4. Cách cấu hình khi nhận quyền rollout

Các bước dưới đây là runbook, **chưa apply vào hệ thống đang phục vụ**.

1. Xác nhận exact target/release, schema directory tối thiểu0008, pool budget,
   inventory/approval và canary bundle được installer cấp đúng binding.
2. Dùng health config schemaVersion2; giữ các field v1, thêm
   `connectionBudget.probeInstances` và `probePoolMax`. probeInstances bằng
   healthInstances. Cộng cả hai pool, mọi replica/API/reconcile/exporter/migration
   và reserved connections; maxConnections là budget thật đã duyệt, không lấy
   từ ví dụ/test.
3. Provision hai login ít quyền: metrics chỉ thuộc roomqc_control_metrics,
   probe chỉ thuộc roomqc_control_probe_runtime, không installer/metrics kết hợp.
   Không đổi grant bằng login runtime; readiness từ chối quyền thừa.
4. DSN cùng host/port/database/TLS nhưng khác username. Production bắt buộc
   sslmode=verify-full, không query options ghi đè role/TLS. Không đưa DSN lên chat/log.
5. Tạo managed metadata riêng theo schema dưới, từ release artifact được duyệt;
   không copy hash observed của runtime để tự phê duyệt.
6. Mount private metadata/DSN/keyring read-only bằng đủ ba file refs.
   Unix: root-owned/runtime-group read-only hoặc runtime-owned private file,
   không world-readable/group-writable. Windows ACL do installer kiểm riêng;
   mode bits trên Windows không phải bằng chứng ACL.
7. Ghép base health-worker.compose.yml + health-worker.managed.compose.yml.
   Chỉ nối network backend đã duyệt, không thêm Docker socket hay public ports.
8. Kiểm liveness/readiness, stale sweep và proof. Ready của worker chỉ có nghĩa
   vòng thu thập chạy được; không thay cluster health/warmup/manual admission.
   Không mở admission chỉ vì /readyz=200.

Ba biến file bắt buộc cùng tồn tại khi bật managed:

- ROOMQC_HEALTH_PROBE_CONFIG_FILE — metadata đã duyệt.
- ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE — DSN login probe-runtime riêng.
- ROOMQC_HEALTH_PROBE_KEYRING_FILE — keyring định dạng version1 hiện có.

Không có cả ba: worker giữ unconfigured/ready closed. Có một phần: startup từ
chối. Không có inline secret env fallback, không tự sinh key hoặc tài khoản canary.

### Mẫu cấu trúc metadata — không dùng nguyên mẫu để deploy

```json
{
  "version": 1,
  "targets": [{
    "cluster": {
      "id": "cluster-a",
      "hostId": "host-a",
      "url": "https://api.cluster-a.example.invalid",
      "internalUrl": null,
      "inventoryRef": "inventory-a",
      "credentialRef": "credential-a",
      "approvedAddresses": ["10.0.0.3"],
      "publishableKey": "REPLACE_WITH_APPROVED_PUBLISHABLE_KEY"
    },
    "expected": {
      "clusterId": "cluster-a",
      "releaseId": "REPLACE_WITH_APPROVED_RELEASE",
      "artifactDigest": "REPLACE_WITH_64_HEX",
      "frontendArtifactDigest": "REPLACE_WITH_64_HEX",
      "migrationSetHash": "REPLACE_WITH_64_HEX",
      "schemaManifestHash": "REPLACE_WITH_64_HEX"
    },
    "storage": { "sha256": "REPLACE_WITH_APPROVED_CANARY_BYTES_SHA256" }
  }]
}
```

Mẫu có placeholders cố ý không hợp lệ cho startup. Mỗi health target phải có
đúng một entry, hostId đúng target đã duyệt; endpoints/address/key/Storage digest
phải khớp bundle/resource. Không thêm auth/credential.token hoặc installer fields.

## 5. Rollback và bảo vệ dữ liệu

Delta không có DDL hoặc format bundle mới. Khi rollback, dừng worker bằng
shutdown có deadline; giữ directory0008, mapping, ciphertext/revision và keyring.
Nếu rollback binary cũ thì phải dùng config v1 tương thích và bỏ managed override;
worker cũ unconfigured vẫn fail-closed. Không down-migrate, backfill proof giả,
đặt healthy thủ công hoặc chuyển DB khách cũ.

Lỗi config/runtime làm readiness đóng, stale sweep tiếp tục nếu metrics login
hợp lệ; không tự rotate/reseed canary để che unknown refresh outcome.
Installer phải đối soát revision/session và phục hồi cùng canary theo quy trình.

## 6. Cleanup và phần còn lại

Kiểm độc lập sau full suite: container/network/volume đều0 theo cả sáu label
control-directory-test, no-policy-test, monitor-test, monitor-stack,
probe-auth-test và release-manifest-test. Không dọn tài nguyên người dùng khác.

**Chưa chứng minh trên source này:** actual managed pipeline đủ năm vendor
services + Prometheus/host metrics thật + warmup/stale/fault/restart/recovery
qua thời gian thật; trusted issuer automation/cross-replica approval;
current19 indirect/workflow/policy/FK disposition; full-vendor A/B đồng thời;
frontend/TypeScript/browser/Android; Linux/TLS/Internet email/offsite/on-call;
load/soak/RC/pilot. Không dùng số265 để khép các phần trên.

Tiếp theo: tích hợp pipeline managed vào full-vendor harness, không bỏ các
workflow checks sẵn có; lưu refresh/session bundle private từ installer, nối
directory/real metrics, drill thời gian thật. Song song về trình tự chuẩn bị:
issuer/disposition còn mở → alerts/outbox → admission/budget → signup/resume/
reconcile → hai console → VPS/DR/on-call → E2E/load/RC → pilot theo dependency.
Không dừng toàn roadmap vì thiếu key external; hoãn đúng case/gate liên quan.

122 releaseAcceptance entries, L/S/P/U/B, reviewer/signoff giữ nguyên.
[Artifact](../../../artifacts/roomqc-t06-managed-runtime-local-2026-10-22.json)
ghi hashes, run/fail history, cleanup và giới hạn. Hướng dẫn Supabase/PostgreSQL
được dùng để tách quyền, pool budget, private credentials và giữ fail-closed.
