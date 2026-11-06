# RoomQC — kiểm schema phục hồi và trạng thái khóa thực tế

Ngày 28/10/2026. Công việc thuộc T02/T08/T12 trong [kế hoạch tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md), tiếp [giao thức quản lý credential](roomqc-setup-credential-command-local-2026-10-28.md). Đây là mã và kiểm chứng local; chưa là bộ cài hoặc nghiệm thu VPS.

## 1. Vấn đề cần sửa

Fingerprint hiện hành trước thay đổi là **phiên bản 2**, được nâng từ phiên bản1 để chuẩn hóa daily partition Realtime. Một số ghi chú ở checkpoint trước đã gọi nhầm là v1. Cả v1 và v2 đều chưa gồm `roomqc_setup` hoặc `roomqc_setup_admin`, nên thay đổi hàm/quyền ở đó có thể không bị phát hiện bằng hash. Không sửa các packet lịch sử hoặc chuyển bằng chứng của chúng sang mã mới.

Ngoài ra, `receipt` là kết quả lịch sử của một lệnh cấp khóa. Nó vẫn tồn tại sau khi khóa hết hạn, bị thu hồi hoặc cụm đổi binding; dùng receipt để báo sẵn sàng sẽ cho kết quả sai. Công cụ cấp khóa cần một projection hiện hành được xác thực riêng.

## 2. Triển khai

Hai migration được tạo bằng Supabase CLI2.122.0 (`migration new`), nối tiếp chuỗi cũ:

| Migration | Nội dung | Phiên áp dụng |
|---|---|---|
| [Live status](../../../supabase/migrations/20261028092339_setup_credential_live_status.sql) | `roomqc_setup_admin.status()` trả trạng thái hiện hành, không trả bearer/signing material | Bảo trì riêng, migration thường bị chặn; không nới quyền runtime |
| [Fingerprint v3](../../../supabase/migrations/20261028092341_release_schema_fingerprint_v3.sql) | Phủ namespace/hàm/owner/ACL và capability role graph phục hồi | Migration nghiệp vụ có quyền sở hữu hàm hiện hành |

`status` dùng một statement snapshot cho version/authority/head, clock quan sát lấy từ database. Issuer hoặc installer LOGIN hợp lệ được gọi; mixed service-role/elevated login bị từ chối theo guard hiện hành. Hàm definer do NOLOGIN owner hẹp sở hữu, search_path rỗng, không có mutation hoặc truy vấn dữ liệu khách.

Projection gồm contractVersion, version, cluster/binding/release, observedAt, ready/reasonCode, historicalResult=false và metadata hạn/revoke/retirement của head. Nó không thay CAS cho mutation sau đó; kết quả có thể cũ ngay sau khi đọc, nên installer phải xác minh lại ở từng điểm quyết định.

| Tình trạng | Kết quả |
|---|---|
| Chưa bind hoặc chưa cài release | UNBOUND |
| Không có head | CREDENTIAL_MISSING |
| Head không còn khớp authority | CREDENTIAL_TARGET_MISMATCH |
| Đã thu hồi | CREDENTIAL_REVOKED |
| Chưa tới notBefore | CREDENTIAL_NOT_YET_VALID |
| Hết expiresAt | CREDENTIAL_EXPIRED |
| Đã qua retireAfter | CREDENTIAL_RETIRED |
| Head hợp lệ tại thời điểm đọc | ready=true; vẫn cần file/signer/transport/release verification |

Schema bảo trì tiếp tục không có trong allowlist PostgREST. Nội dung credential còn hạn trên file cũng không đủ để coi là ready: cần status đúng target và RPC thật chấp nhận chữ ký/quyền.

## 3. Phạm vi fingerprint v3

Giữ toàn bộ chuẩn hóa Realtime v2 và mở rộng hai schema phục hồi cùng bốn role gốc: recovery, credential owner, issuer, installer. Hash phủ định nghĩa hàm, SECURITY DEFINER/search_path, owner/grants, schema/default ACL, các đối tượng mới trong namespace và role graph liên quan. Không hash business rows, bearer, secret hoặc thời gian cấp credential.

[Manifest verifier](../../../server/control/release-manifest.mjs) và final release-validation fence yêu cầu schemaFingerprintVersion3. Manifest v1/v2 giữ trong database nhưng RPC từ chối bằng55000 cho tới khi có phê duyệt mới. Không tự sao observed hash vào expected hash và không tự bật cổng phát hành. Binary cũ không dùng được như rollback đơn giản trên metadata v3; cần quy trình rollback tương thích có review.

Hash này không đo TLS/DNS/host identity, DSN đã nạp, PostgREST exposed-schema config, filesystem, toàn bộ extension hoặc quyền gián tiếp/dynamic call graph ngoài phạm vi. Installer vẫn cần kiểm riêng các thành phần đó; nhiều kiểm nhỏ đạt không thay full release attestation.

## 4. Kiểm thử

[Bài database manifest](../../../server/control/release-manifest-db.test.mjs) kiểm rebuild với OID/thứ tự tạo khác nhau; drift schema/function/body/owner/grants/role graph/default ACL; RPC thật từ chối metadata cũ; giữ các bài Realtime partition/ACL/history và hash rollback. Một lượt focused ban đầu có12/13 vì bài test kỳ vọng HTTP400 cho SQLSTATE55000; PostgREST thật trả500. Đã sửa assertion theo hành vi API, giữ yêu cầu55000 và từ chối manifest, rồi13/13 đạt. Không đổi handler để làm test xanh.

[Native integration](../../../server/control/testing/setup-credential-native.mjs) nối vào bộ đăng ký/API/worker/CLI hiện có. Các kiểm mới gồm status chưa bind/không head/đã cấp/rotation/revoked/retired/expired/đổi binding, read-only transaction, mixed role denial, PostgREST không expose admin schema,9 actual catalog drift với runtime verifier từ chối và rollback về cùng hash. Upgrade582/583 được chèn lỗi cuối migration rồi kiểm schema/function/status/history trước khi apply lại.

Hai SQL-writer SIGKILL và các fault API/worker/CLI cũ tiếp tục là hồi quy. Đây chưa là bài signer, file fsync/rename, scheduler hoặc installer CLI. Kết quả terminal/cùng source/advisor/cleanup ghi ở mục6.

## 5. Công việc tiếp theo

1. Installer config và role/DB identity preflight, bind approved target/release + v3 hash; từ chối drift trước mutation. Chưa lấy status hoặc observed hash làm phê duyệt.
2. Consumer budget riêng cho issuer/installer/rotation và native/vendor DSN mapping; không dùng migration reserve hoặc pool vô hạn.
3. Signer custody, kiểm algorithm/fingerprint, tái tạo cùng claims theo cùng key sau mất response; không mint ngoài journal.
4. Private output directory/file, exclusive temp/fsync/atomic rename, cùng key đối soát DB/file; native CLI SIGKILL tại từng barrier và lô chạy lại đúng target.
5. Refresh một instance/target và bounded overlap; RPC thật với file mới trước khi thu hồi file cũ. Runtime mount read-only và lỗi expiry/missing có cảnh báo, giữ job/history.
6. Audit quyền gián tiếp/247 WARN theo số đo checkpoint trước, rồi số đo mới có disposition riêng; cross Auth/directory actor revoke, full-default/rebuild, VPS/TLS/DR/E2E/load/RC/pilot vẫn mở.

Giữ70 ca not_run/122 entries unverified/124 lượt môi trường và reviewer/signoff/gates cho tới khi có actual proof đúng môi trường và quyết định theo [hồ sơ nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md). Không áp migration hoặc tạo credential trên hệ thống đang phục vụ chỉ để kiểm kế hoạch.

## 6. Kết quả terminal và giới hạn

**Checkpoint hiện hành — fingerprint v3 và trạng thái khóa:** [catalog/readiness local](roomqc-setup-attestation-status-local-2026-10-28.md) đạt244/244 controls, gồm60 credential/status/attestation (25 mới), giữ184 API/worker/CLI;9 drift catalog thật đều bị verifier chặn,2 SQL-writer SIGKILL/2 barrier. Control658 tổng/656 pass/0 fail/2 skip;583+18 migrations,source277 files/hash894abdb63eaac8c45e2ec852773fd5c824f22908ceff1f35c40d159d601ac1f8,cleanup0. Upgrade582/583 rollback đạt; fingerprint v3 phủ2 schema phục hồi và capability graph, manifest v1/v2 bị từ chối. Status đọc hiện hành, không lấy receipt làm readiness; admin schema không expose REST. Advisor808/247WARN chưa disposition. Nhận installer/DB identity/target/budget/signer/file/refresh→cross-system revoke→T10/signup/console→default-full/rebuild→VPS/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

- [Native packet](../../../artifacts/roomqc-setup-attestation-native-1f0743f62ae7-local-2026-10-28.json) — terminal0,244 controls;60 credential/status/attestation,9 actual catalog drift,45 API và16 CLI giữ nguyên phạm vi. Hai SQL writer SIGKILL,API10/CLI1 SIGKILL tiếp tục đạt.
- [Control regression](../../../artifacts/roomqc-workspace-recheck-f29142d7eb56-local-2026-10-28.json) — 658 tổng/656 pass/0 fail/2 skip,terminal0. Windows symlink và POSIX notification-file skip chưa đóng.
-583 business+18 directory migrations; fault cuối582/583 rollback schema/fingerprint definition/status surface/history;581 vẫn giữ rehearsal riêng. Cleanup độc lập containers/volumes/networks0.

Source277 files SHA256 `894abdb63eaac8c45e2ec852773fd5c824f22908ceff1f35c40d159d601ac1f8`; advisor CLI2.122.0 đo808 findings, phân bố{"INFO":561,"WARN":247}. Đây là đo mới, không phải disposition hoặc review bảo mật. Frontend66/66 packet trước giữ14 source/test không đổi, không thành browser/Android E2E.

Native dùng approved release/health và HS256 signer fixture. Chưa kiểm operational DSN/approved installer/signer/file publication/refresh schedule/VPS/TLS/offsite restore/public email/load/pilot. Receipt/status/source hash không thay target approval. Các ca môi trường,reviewer/signoff/gates vẫn mở; goal toàn plan active.
