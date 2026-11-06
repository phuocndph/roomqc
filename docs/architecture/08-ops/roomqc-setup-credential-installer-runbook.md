# RoomQC — chạy bộ cài khóa phục hồi đăng ký

**Trạng thái triển khai hiện tại — IF14 local có bằng chứng, 29/10/2026:** backend295 file/SHA256 bf2ddd26bb2a7b6ad467680d31abff91b39e26ccb83cad1c734b21932d8d179d. [Actual CLI không đặc quyền](roomqc-setup-installer-nonroot-local-2026-10-29.md) đạt170/170 controls, gồm49 ca FS05/FS06 và238 CLI witness UID10001/CapEff0; [control](../../../artifacts/roomqc-workspace-recheck-2eda91b19a6f-local-2026-10-29.json) đạt674 pass/0 fail/2 skip. Terminal0, source/schema và cleanup0 đúng packet. [Topology lỗi volume](../../../artifacts/roomqc-installer-volume-topology-8149ffff280e-local-2026-10-29.json) đạt5 kiểm nền nhưng chưa có actual CLI, IF15 vẫn mở. [Blueprint](roomqc-vps-signup-deployment-blueprint-2026-10-28.md) giữ25 task/27gói/70ca/124lượt, review/gates chưa đóng. [Verifier hiện hành](../../../scripts/verify-vps-signup-plan-nonroot.mjs) pin295; các verifier cũ giữ pin lịch sử.

**Checkpoint local lịch sử — timeout bộ cài:** [Báo cáo deadline](roomqc-setup-installer-deadlines-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend291 files/hash `bb21bef86c200d3d09c950b11c96417710bb9a9a47af7af0d3a0200caec2a367`;584+19 migrations. Focused100/100, native362/362 và control673 tổng/671 pass/0 fail/2 skip; terminal0, cùng source/schema tương ứng, cleanup0. IF11 có SQLSTATE thật, witness rollback, deadline45giây và13 lần kiểm session/mutex. IF01–IF11,IF13,IF16,IF17 có local proof đúng scope; tiếp IF12/IF14/IF15 rồi rotation/mount/Auth→directory. Lần1/T08/T12,70ca/124lượt/122mục,reviewer và gates vẫn mở.

**Checkpoint trước — thu hồi khóa và rollback local:** [Báo cáo mới](roomqc-setup-installer-transactions-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend289 files/hash `6802f300c3c4232e8e649f039aaf5be285da92f8b0a2116c0308318de3c16e14`;584+19 migrations. Focused75/75, native337/337 và control673 tổng/671 pass/0 fail/2 skip; terminal0, cùng source/schema tương ứng, cleanup0. IF10 đã có thu hồi khóa qua LOGIN API thật; IF16 có witness mutation→rollback và replay cùng key. Các nhóm IF01–IF10,IF13,IF16,IF17 có local proof đúng scope; còn IF11/IF12/IF14/IF15 rồi rotation/mount/revoke xuyên hệ thống. Lần1/T08/T12,70ca/124lượt/122mục,reviewer và gates vẫn mở.

Phạm vi: CLI nội bộ đọc cấu hình private, kiểm target/DB/authority/budget và thực hiện check, bind, issue, publish hoặc revoke. Đây không phải daemon thay khóa, bộ cài VPS hoàn chỉnh hoặc quyết định bật worker. Theo dõi kết quả thực chạy trong báo cáo installer local cùng ngày; phần nào chưa có proof phải giữ chưa kiểm.

## 1. Đầu vào và ranh giới quyền

| Đầu vào | Điều kiện trước khi chạy |
|---|---|
| Candidate | Source/schema/contracts được review; directory có migration0019, business có migration584 preflight; migration bảo trì dùng phiên riêng, không cấp quyền đó cho API/worker |
| Release | Approved expectation v3 và signed envelope/trust từ quy trình phát hành độc lập; khớp cluster/host/inventory/endpoints/credential ref/environment; không tự lấy observed hash làm approval |
| DB identities | system identifier, database OID/name và LOGIN role được duyệt cho cả directory và business; primary, read-only startup, LOGIN connection limit1 |
| Quyền | Business issuer chỉ issue/receipt/status/preflight, installer chỉ bind/revoke/receipt/status/preflight; mỗi LOGIN chỉ một capability. Directory LOGIN chỉ thuộc observer metadata, không có quyền dữ liệu workspace hoặc ghi authority |
| Secrets | DSN/signing key/publishable key qua private file; không argv, biến môi trường chung, chat, log hay source. Nonlocal cần Linux, DSN TLS verify-full |
| Budget | Consumer issuer/installer/rotation khai báo riêng trên cả hai DB; pool1, replicas khớp config, fixed connections0; tổng có rolling overlap/reserve hợp lệ |
| Filesystem | Private input/journal và runtime output tách thư mục. Mount output directory vào runtime read-only để atomic rename hiện ra; không mount một file output hoặc thư mục chứa signer/DSN/config |

Khi chưa chứng minh UID/mount/reload thật hoặc chưa có lịch thay khóa, không bật worker phục vụ khách. Credential có TTL120–3.600 giây; file hợp lệ tại lúc kiểm không bảo đảm tiếp tục hợp lệ sau expiry/revoke/authority change.

## 2. Mẫu cấu hình không chứa secret

Mẫu dưới đây cố ý dùng placeholder chưa hợp lệ; phải điền bằng inventory đã duyệt và file private, không chạy nguyên mẫu. Các đường dẫn là đường dẫn Linux minh họa, không là file đã tồn tại. Issuer và installer dùng hai cấu hình với hai LOGIN riêng.

```json
{
  "version": 1,
  "environment": "production",
  "business": {
    "dsnFile": "/etc/roomqc/private/setup/business-issuer.dsn",
    "expected": {"systemIdentifier":"FILL_FROM_APPROVED_INVENTORY","databaseOid":"FILL_FROM_APPROVED_INVENTORY","databaseName":"FILL","role":"FILL_ISSUER_LOGIN"}
  },
  "directory": {
    "dsnFile": "/etc/roomqc/private/setup/directory-observer.dsn",
    "expected": {"systemIdentifier":"FILL_FROM_APPROVED_INVENTORY","databaseOid":"FILL_FROM_APPROVED_INVENTORY","databaseName":"FILL","role":"FILL_OBSERVER_LOGIN"}
  },
  "resourceBudgetFile": "/etc/roomqc/private/setup/resource-budget.json",
  "resourceBudgetSha256": "FILL_SHA256_OF_EXACT_BUDGET_BYTES",
  "businessDatabaseId": "FILL_BUDGET_DATABASE_ID",
  "consumerId": "setup-credential-issuer",
  "replicas": 1,
  "releaseTrustFile": "/etc/roomqc/private/setup/release-trust.json",
  "target": {
    "cluster": {"id":"FILL","hostId":"FILL","inventoryRef":"FILL","credentialRef":"FILL","url":"https://FILL","internalUrl":null,"approvedAddresses":[]},
    "expected": {"clusterId":"FILL","releaseId":"FILL","artifactDigest":"FILL","frontendArtifactDigest":"FILL","migrationSetHash":"FILL","schemaManifestHash":"FILL"},
    "approval": "REPLACE_WITH_REVIEWED_SIGNED_ENVELOPE_OBJECT"
  },
  "publisher": {
    "signer": {"algorithm":"HS256","fingerprint":"FILL_SIGNER_FINGERPRINT","keyFile":"/etc/roomqc/private/setup/signer","keyId":null},
    "publishableKeyFile": "/etc/roomqc/private/setup/publishable-key",
    "outputFile": "/var/lib/roomqc/setup-runtime/credential.json"
  }
}
```

Đối với installer: `consumerId=setup-credential-installer`, đổi business DSN/expected.role sang LOGIN installer, `publisher=null`. `setup-credential-rotation` hiện chỉ là consumer được khai báo ngân sách; chưa có scheduler thực thi. Không gọi đó là rotation đã vận hành.

Signer HS256 pin SHA256(bytes secret), không trim. RS256/ES256 dùng PKCS8 private PEM, pin SHA256(SPKI DER); RSA≥2048, EC P-256; keyId theo release. Signature verification/native REST của deployment phải được kiểm đúng algorithm được dùng. Không in signer hoặc output bearer để xem nội dung.

## 3. Thực hiện một lệnh

CLI chỉ nhận đường dẫn tuyệt đối. Local disposable cần `--allow-local`; không dùng cờ này cho staging/production. Không truyền DSN hoặc mật khẩu trực tiếp trong command line.

```powershell
node scripts/control-setup-credential.mjs --help
```

Trên Linux, sau khi đã có config/command file private và target được duyệt:

```sh
node scripts/control-setup-credential.mjs --config-file /etc/roomqc/private/setup/issuer.json --command-file /etc/roomqc/private/setup/command.json
```

| Operation | Command file | Điều kiện và kết quả cần kiểm |
|---|---|---|
| check | `{"version":1,"operation":"check"}` | Read-only; kiểm DB/role/budget/release/live authority rồi đọc status. `preflightVerified` khác `credentialReady`; một head lịch sử không làm ready |
| bind | Common fields + expectedClusterId/expectedBindingSha256 của binding trước, hoặc cả hai null nếu chưa bind | Chỉ LOGIN installer. expectedVersion từ live status. Bind đổi target/release và revoke credential theo giao thức; receipt lịch sử không chứng minh output usable |
| issue | Common fields + predecessorId/ttlSeconds/overlapSeconds/signerAlgorithm/signerFingerprint | Chỉ LOGIN issuer. TTL120–3.600s, overlap10–60s; nhận DB receipt, ký exact claims, publish file rồi native RPC và authority fence |
| publish | `{"version":1,"operation":"publish","key":"UUID_OF_ISSUE_COMMAND"}` | Cùng LOGIN đã issue; đọc receipt caller-scoped, kiểm current head/status, dùng lại file đúng hoặc hoàn tất publication. Không cấp credential mới hoặc gia hạn |
| revoke | Common fields + credentialId | Chỉ LOGIN installer, có reason/key/version; đơn điệu và replay được. File cũ vẫn có thể tồn tại nhưng status/RPC phải từ chối |

Common fields của bind/issue/revoke: `version=1`, operation, UUID key, UUID requestId, reason5–1.000 ký tự, expectedVersion, clusterId, bindingSha256 và releaseSha256. Hash/identity phải được tái tạo theo thư viện và candidate đã duyệt, không gõ đoán hoặc lấy từ UI khách. CLI từ chối extra fields, sai capability và key/body không khớp.

## 4. Phục hồi khi chưa rõ kết quả

1. Giữ nguyên config, LOGIN, command key và toàn bộ body gốc. Không tự đổi expectedVersion/key chỉ vì timeout.
2. Chạy lại đúng command file. DB tra immutable receipt theo caller/key trước CAS; bind/revoke tiếp tục là bind/revoke. Issue replay cùng command có thể hoàn tất file publication mà không tạo thêm credential.
3. `publish` chỉ áp cho receipt issue của chính issuer. Không dùng nó để xử lý bind/revoke; không ký receipt đã hết hạn hoặc revive head đã revoke/retire.
4. Nếu authority/release/target/DB identity/config/key file đã đổi: dừng, đối soát receipt/management/output theo runbook bảo trì. Không bỏ preflight hoặc nâng quyền để ép lệnh qua.
5. Intent/stage file do publisher quản lý. Không xóa file để thử lại hoặc ghi đè output khác target. DB và filesystem không cùng transaction; sau DB commit có thể chưa có file usable.
6. Hết hạn hoặc publication chưa usable trước overlap: dừng phục hồi/claim theo policy, giữ jobs/attempts/deadlines/history và cảnh báo. Không nới TTL hoặc reset revocation.

`SETUP_INSTALLER_COMMAND_CONFLICT` chỉ xuất khi PostgreSQL trả đúng refusal caller/key/body từ giao thức immutable trước effects. Giữ command gốc và LOGIN gốc để đối soát; không đổi key để lách conflict hoặc dùng LOGIN khác lấy receipt. Generic SQL error, client SIGKILL và mất kết nối sau dispatch vẫn là outcome unknown. Client chết không chứng minh server đã hủy autocommit statement; phải đợi outcome DB và replay đúng command.

Output chỉ có mã lỗi/refs/result metadata và gợi ý replay an toàn. Log vận hành phải giữ exit code, source/target refs, key và effect counts; không lưu DSN/bearer/signing material. Unknown không được hiển thị thành thất bại chắc chắn hoặc thành công.

## 5. Giới hạn và bàn giao

Fault matrix trước/sau DB commit và các fence filesystem phải có actual process/barrier proof; unit crypto hoặc help không thay native CLI. Mount/UID/reload, deadline/backoff của daemon, hai rotator, authority expiry khi giữ khóa và target staging là phần phải nghiệm thu riêng. Không thay quyết định gate L/S/P/U/B bằng CLI exit0.

Rollback binary/config phải tương thích schema/receipt; không down-migrate phá dữ liệu, xóa audit hoặc trả lại khóa đã revoke. Migration mới chỉ chạy sau review trên đúng maintenance target. Giữ signup/dispatch disabled và worker replicas0 trong cấu hình mẫu cho đến khi đủ mốc trong [kế hoạch](roomqc-vps-signup-implementation-board-2026-10-28.md).
