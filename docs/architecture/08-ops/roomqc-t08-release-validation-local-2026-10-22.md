# RoomQC — T08 xác minh release cụm: kiểm chứng local có phạm vi

Chốt ngày22/10/2026, Asia/Bangkok. Đây là delta T01/T03/T04/T08 trong
[plan toàn bộ](roomqc-vps-signup-execution-ready-2026-10-22.md), không tạo task/case.
**Phần registry release validation đã có kiểm chứng local; tổng T08 và release
acceptance vẫn chưa hoàn tất.** Không deploy lên runtime đang phục vụ.

## 1. Kết quả và source

Registry không còn dùng service key/health Auth để thay xác minh manifest.
Nó dùng bản phê duyệt installer riêng, credential canary hẹp và challenge mới;
kiểm lại target/approval/credential fingerprint + tuổi bằng chứng trong transaction
lệnh trước khi lưu. Thiếu hoặc sai bằng chứng thì từ chối, không fallback đặc quyền.
Validate thành công vẫn đóng admission, không tự mở nhận khách.

Full control243/243,0 fail/skip/cancel,terminal exit0 trên757 file/546 migrations,
source SHA256 `2495ee971f6b8645a74dc006a1d66bdb96cad8527d5b63a83e3ee89e1ffc376f`.
Source trước/sau full run không đổi. Manifest có phạm vi kế thừa T04 +2 file mới,
không phải hash mọi file repository hoặc bản đang deploy.
Branch `codex/roomqc-parallel-integration`, HEAD5cb583729ce055db64df8b192f10476db1fa99b8;
worktree còn dirty, không commit/stage/merge/reset hoặc copy implementation vào primary.

[Artifact đã lọc](../../../artifacts/roomqc-t08-release-validation-local-2026-10-22.json)
ghi command/count/source/file hashes/cleanup/failed history và giới hạn.
[T04/sourcee5](roomqc-t04-command-result-local-2026-10-22.md) giữ lịch sử237 test;
[planning source6f3](../../../artifacts/roomqc-vps-signup-execution-ready-2026-10-22.json)
giữ trạng thái trước sửa fixture. Không relabel các packet cũ sang2495.

## 2. Delta đã triển khai

| Phần | Thay đổi | Ranh giới |
|---|---|---|
| release-validation.mjs | Catalog version1,1–100 entries, strict inventoryRef/expected/credential; private immutable map | Expected đến từ approval installer, không lấy observed runtime hash hoặc HTTP body để tự phê duyệt |
| File loader/config | ROOMQC_CONTROL_RELEASE_VALIDATION_FILE là đường dẫn tuyệt đối; regular/non-symlink,≤128KiB, bounded read và zero buffer | Không cấu hình thì startup tương thích nhưng validate đóng; có file cấu hình sai thì startup bị từ chối. Unix access check có mã; ACL Windows và Linux staging chưa nghiệm thu |
| release-manifest.mjs | Export helper credential; token role riêng, ba phần, exp safe-integer/ms-safe và còn >30s; challenge/time/exact approved identity | Decode shape/expiry không phải xác minh chữ ký. Chữ ký do endpoint thật kiểm; không dùng service_role |
| ClusterGateway | Gọi RPC manifest nonce-bound bằng canary + publishable key qua safe transport | Không gọi Auth health thay thế; không có fallback đặc quyền. Đây là compatibility check, không five-service health |
| Admin validate | Sau lock/version check, tính lại context/fingerprint và tuổi manifest rồi mới mutation/event/receipt | Recheck trong process/config hiện hành, chưa phải DB-backed cross-replica approval revision hay HealthStore atomic fence |
| OpenAPI/runbook | Ghi điều kiện catalog, canary, manual-close và triển khai/rotate có thẩm quyền | Không biến endpoint planned khác thành implemented hoặc tự mount/restart runtime |

Mỗi approval chứa đúng clusterId/releaseId/artifactDigest/frontendArtifactDigest/
migrationSetHash/schemaManifestHash. Fingerprint nội bộ ràng buộc inventory/host/
origin/internal origin/approved addresses/credential ref và hashes kỳ vọng/credential.
Kết quả validation công khai không chứa token hoặc private catalog.

Cấu hình/rotation theo [runbook local](roomqc-control-local-runbook.md).
Catalog nạp immutable, không hot reload. Provision/renew canary/issuer tự động và
distribution/revocation giữa nhiều replica vẫn còn phải làm, không coi file thủ công
là toàn bộ vòng đời production.

## 3. Lỗi hồi quy đã tái hiện và sửa

Sau khi bắt buộc exp, fixture trong service-probes.test.mjs vẫn tạo token canary
không có exp. Vì vậy REST bị từ chối trước transport; ca thành công nhận rest=false,
ca timeout có một kết quả invalid_response thay vì timeout.

- Run full trước sửa trên source6f3:243 test,241 đạt/2 fail,exit1.
- Tái hiện độc lập cùng source:6 test,4 đạt/2 fail,exit1; cùng hai assertion.
- Sửa duy nhất fixture dùng token có exp hợp lệ cho ca success/timeout; không bỏ
  expiry check, không đổi expectation năm dịch vụ hoặc timeout/deadline.
- Mở rộng negative transport inputs: missing exp, hết hạn, sát ngưỡng30s,
  string/null/fractional/unsafe integer đều bị từ chối trước manifest network call.
  Valid credential vẫn đến đúng RPC; count transport không tăng cho input sai.
- Run hiện hành source2495: focused12/12 và full243/243 đạt; giữ lịch sử fail,
  không gộp subsets thành số test hoặc số acceptance case mới.

Không sửa schema/grant, không đổi package/vendor version hoặc bỏ test.
Delta gồm10 file MJS và OpenAPI; file hashes ở artifact.

## 4. Kiểm chứng thực tế đã chạy

| Bộ kiểm | Lệnh / scope | Kết quả |
|---|---|---|
| Red reproduction | node --test server/control/service-probes.test.mjs trên6f3 | 6 test,4 pass/2 fail,exit1; giữ failed history |
| Focused unit/protocol | node --test server/control/service-probes.test.mjs server/control/release-manifest.test.mjs server/control/release-validation.test.mjs | 12/12,exit0; subset full |
| Focused DB/REST | ROOMQC_CONTROL_DB_TEST=true; node --test với pattern registry validate command / registry registration / registry validator / manifest: fail closed before trên directory-db và release-manifest-db | 4/4,exit0; subset full |
| Full control | node scripts/test-control-directory.mjs; script bật DB opt-in | 243/243,0 fail/skip/cancel,exit0;125688.4364ms |
| ESLint | 10 file MJS delta,--max-warnings=0 | exit0,0 warning |
| Syntax | node --check cho10 file MJS | 10/10,exit0 |
| Tracked product whitespace | git diff --check trên5 tracked product paths liên quan | exit0; chỉ cảnh báo chuyển LF/CRLF của Git |

Focused real manifest dùng PostgreSQL16 và PostgREST16 đã pin trong fixture.
Actual gateway gửi dedicated role/public key/challenge; attestation drift và sai
chữ ký bị endpoint thật từ chối; restore metadata/credential thì positive lại đạt.
Expired credential bị chặn trước request. Adapter chỉ rewrite route cố định
/rest/v1/rpc sang /rpc ở fixture, không cho URL tùy ý hoặc bỏ xác minh chữ ký.

Directory command race dùng actual API runtime DB role và transaction, nhưng
remote manifest transport được kiểm soát; không giả thành full timed vendor pipeline.
Giữ advisory lock727001, quan sát waiter trong pg_locks, thay approval rồi nhả:
lệnh bị fence và snapshot clusters/policies/commands/events không đổi. Khôi phục
approval thì lệnh thành công một version/event/receipt, manual_closed vẫn true.
T04 command-result vẫn đọc được receipt đúng quyền.

Full suite có các fixture thực riêng cho directory/GoTrue/PostgREST/monitoring/
Prometheus; nó không replay toàn bộ vendor A/B trên source này. Monitoring fixture
so sánh Docker Desktop VM, không phải metric Linux VPS. Năm service fixture của
monitoring chủ động false, không mở admission. Không suy mọi case70 hoặc frontend
đã chạy từ count243.

## 5. Cleanup và bất biến

Sau terminal, kiểm độc lập container/network/volume theo6 label families:
roomqc.control-directory-test, roomqc.no-policy-test, roomqc.monitor-test,
roomqc.monitor-stack, roomqc.probe-auth-test, roomqc.release-manifest-test.
**Cả18 số đếm đều0.** Không chạy broad delete hoặc xóa dữ liệu đang phục vụ.
Temporary file fixture có cleanup theo exact-owned test directory.

Primary index SHA256 giữ nguyên
`72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f`.
Raw ledger giữ
`612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63`;
protected subset giữ
`c853149a44cbc0c9de82ce375cf3dcebc42de4109ffd2f570c6ad7dd482693b0`.

27 gói/25 task/70 case,122 releaseAcceptance unverified; gates L/S/P/U/B,
owner/reviewer/signoff không được thay đổi. Primary chỉ nhận docs/artifact đã lọc.
Không migrate business DB/CRM, deploy/SSH/DNS/provider/gửi mail Internet, đổi
signup flag hoặc mount secret vào service đang chạy.

## 6. Giới hạn và phần tiếp theo

1. Issuer/provision/rotate/revoke canary tự động, approval provenance/cross-replica
   revision và production file permissions chưa hoàn tất.
2. ProbeSessionManager.assertCurrent và HealthStore.record hiện ở giao dịch riêng;
   còn khoảng hở khi rotate giữa hai lần kiểm. T06 phải fence credential/target/
   release/policy **ngay transaction health write**, không chỉ thêm một precheck.
   Persisted freshness/admission phải không thừa kế proof đã đổi revision.
3. Nối registry→credential/session manager→five-service probes→metrics source→
   persisted health→admission, timed warmup/stale/fault/restart/recovery còn mở.
   Không giữ DB transaction qua remote HTTP, vẫn cần bounded pool/deadline/shutdown.
4. Current19 indirect/workflow/recipient/offboarding/EC10–EC15,135 policy WARN và
   FK/workload dispositions vẫn chưa là full coverage. Direct19/23 FK và authority
   proof cũ được giữ hồi quy; không làm lại hoặc suy gián tiếp đã an toàn.
5. Không có FE/TypeScript/full-vendor A/B trên source2495. Các proof sourcef7 là
   lịch sử, không thừa kế. Browser/Android/Linux/TLS/email/offsite/on-call/load/
   pilot và independent reviewer/signoff còn phải thực hiện.
6. Tiếp T07 alert→T09/T10 admission/budget→T11–T13 signup/status/resume/reconcile/
   abuse→T14–T17 admin→T18–T20 Linux/DR/on-call→T21–T24 simultaneous A/B/E2E/load/
   RC→T25 pilot được duyệt. Thiếu khóa chỉ hoãn đúng external acceptance, không
   hạ tiêu chí hoặc dừng toàn roadmap.

Hướng dẫn Supabase/PostgreSQL đã dùng để giữ dedicated canary, không public secret,
pin self-host bundle và transaction boundary. Changelog/self-host docs đọc22/10;
không có vendor upgrade. Đây là scoped local checkpoint, chưa cấp quyền mở gate.
