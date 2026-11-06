# RoomQC — API đăng ký, recheck và worker với Auth thật

Ngày28/10/2026. Checkpoint T03/T04/T11/T12/T16 sau [recheck local](roomqc-workspace-recheck-local-2026-10-28.md), theo [plan tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md). Đây là diagnostic tích hợp local; **chưa là full candidate, browser/Android, VPS hoặc nghiệm thu sản phẩm**.

## 1. Bằng chứng hiện hành

[Run native133227817f37](../../../artifacts/roomqc-setup-api-native-133227817f37-local-2026-10-28.json) terminal exit0: **168/168 controls**, gồm **45 controls API/process mới** và123 controls nền protocol/worker/reader/writer. 45 controls mới gồm28 barrier observations; không coi mỗi barrier là một ca release riêng. Có **10 lần SIGKILL thật: 7 API, 3 worker**, hai lần ngắt TCP sau commit, đồng hồ DB cho grace/lease và kiểm quyền Auth/PostgREST thật.

Đã replay580 migration nghiệp vụ và18 directory migrations trong các database riêng trên cùng PostgreSQL sandbox. Source274 files, SHA256 `98387288f1cc901146c430c3b7728f4acc7c0a09ec0ed5dc85a9ca5bb341d844`, khớp trước–sau; schema fingerprint trước–sau không đổi. Cleanup Docker độc lập theo nhãn run: **0 container/volume/network**,11 objects của fixture được dọn. Hai directory thử phục hồi role catalog về baseline riêng.

[Hồi quy control d1e6f63178cc](../../../artifacts/roomqc-workspace-recheck-d1e6f63178cc-local-2026-10-28.json) trên cùng source274 files/hash trên:656 tổng/**654 pass/0 fail/2 skip**,16 ca recheck đạt, terminal exit0, source không đổi, cleanup Docker độc lập0. Hai skip vẫn là symlink Windows và POSIX file mode Linux. [Frontend53e4109dfa35](../../../artifacts/roomqc-workspace-recheck-frontend-53e4109dfa35-local-2026-10-28.json) giữ66 tests + TS/lint ở14 file source/test không đổi; bộ kiểm consistency kiểm lại hash, không chạy lại frontend không đổi hoặc thay browser/Android thật.

## 2. Đã kiểm trên cùng run

| Nhánh | Actual phải quan sát và đã đạt |
|---|---|
| Happy path | HTTP signup-intents tạo workspace reserved; phiên owner thật đọc setup-status, submit provision, nhận active; replay không thêm business effect |
| Quyền | Phiên owner khác không đọc setup-status; owner không gọi admin detail; platform operator dùng live platform_support_actor |
| Mất phản hồi provision | Proxy đọc hết response từ native RPC sau business commit rồi cắt socket; API trả503, directory giữ provisioning/dispatch; không giả lập chỉ bằng bỏ return value |
| Detail quản trị | Live Auth → API → directory snapshot/fingerprint → native generic receipt; verified receipt vẫn không tự active |
| Mất phản hồi recheck | Command/audit đã commit nhưng socket client bị cắt; dừng API bằng SIGKILL rồi khởi động lại; GET đúng key đọc kết quả, replay trả command cũ, operator khác nhận404 |
| Worker phục hồi commit | Process worker riêng, directory LOGIN riêng và recovery token scoped; sau grace thật kích hoạt đúng tenant/hotel; snapshot11 bảng gồm trial/outbox/receipt không đổi |
| API chết trước remote | Proxy chặn trước upstream; SIGKILL API và chờ remote socket đóng trước nhả barrier; worker ghi closed proof; owner thấy waiting_owner rồi tiếp tục cùng workspace bằng dispatch mới |
| API chết sau remote commit | Proxy giữ response sau upstream commit; SIGKILL API; worker phục hồi active, giữ tenant/hotel/trial/outbox |
| Worker chết sau claim | SIGKILL sau DB claim; đợi lease hết bằng clock_timestamp thật rồi process mới tiếp quản; terminal closed, không tạo business data |
| Worker chết sau close | Remote closed proof đã tồn tại, directory còn leased; SIGKILL rồi lease/takeover; cùng proof và business snapshot giữ nguyên |
| Worker chết sau settle | Directory active/job succeeded/audit đã commit; SIGKILL trước ack; tick sau không settle hoặc provision lặp, một recovery success audit |
| Thu hồi phiên khi chờ khóa | Giữ workspace lock trong directory; pg_stat_activity chứng minh request recheck thật đang chờ; xóa đúng phiên Auth trong fixture, nhả lock; lệnh bị401/403, command/event/business không đổi; GET lệnh cũ cũng bị chặn |

API có **grace30 giây** trước worker để request gốc kết thúc; bài test chờ thời gian thật, không UPDATE next_attempt_at để rút ngắn. Worker test dùng lease22 giây/request timeout5 giây, thỏa công thức lease≥2×timeout+10s; đây là cấu hình của fixture core store, chưa chứng minh runtime config/file/resource/rolling overlap vận hành.

## 3. Thay đổi và lịch sử lỗi

- [Native API harness](../../../server/control/testing/setup-api-native.mjs) tạo directory riêng, HTTP proxy có barrier, GoTrue sessions và child processes. Workspace/job/dispatch được tạo qua Control API; SQL chỉ chuẩn bị migration/registry/health/release/role quản trị và fault locks/revoke.
- [Child harness](../../../server/control/testing/setup-api-native-child.mjs) chạy API thực hoặc core worker bằng LOGIN tương ứng. Secret chỉ đi qua IPC trong fixture; argv/log/report không có bearer/password/DSN. Process worker không nhận owner token hoặc service key.
- [Test fixture](../../../server/control/test-fixtures.mjs) bind internal endpoint/approved addresses vào signed approval và health proof; default fixture cũ giữ hành vi. Đây là fixture signing/health, chưa installer hoặc service probes thật.
- [Orchestrator](../../../scripts/control-backend-setup-dispatch-checks.mjs) gọi nhánh API trước nhánh worker cũ. [Sandbox runner](../../../scripts/test-control-backend-sandbox.mjs) cho client256MiB và timeout420s để đủ grace/lease thực. Các test mới vẫn ở diagnostic setup-dispatch; **chưa nối default full suite**.

Lịch sử retained: [969f3fcc9187](../../../artifacts/roomqc-setup-api-native-969f3fcc9187-local-2026-10-28.json) fail trước nghiệp vụ vì fork kế thừa --input-type=module; sửa execArgv riêng. [4c3d26781655](../../../artifacts/roomqc-setup-api-native-4c3d26781655-local-2026-10-28.json) và [b81f5c126063](../../../artifacts/roomqc-setup-api-native-b81f5c126063-local-2026-10-28.json) đã qua API/recheck lost-result nhưng test kỳ vọng worker claim trước grace30s. Run sau tăng timeout để phân biệt rồi xác nhận next_attempt_at30s; sửa test chờ DB clock, không sửa runtime. Cả ba fail cleanup độc lập0. Không gọi lỗi fixture là lỗi sản phẩm hoặc xóa packet đỏ.

## 4. Giới hạn chưa được khép

Auth accounts được GoTrue admin tạo và xác minh sẵn; chưa public email signup/verify/resend/callback/challenge/direct Auth gate. Health/probe/signed approval là fixtures. Operator role chuẩn bị bằng SQL trong fixture; workspace/job/dispatch nghiệp vụ đi qua HTTP, không seed SQL thay journey.

Directory và business là database khác nhau nhưng cùng host PostgreSQL. Chưa độc lập A/B hoặc chứng minh host failure. Proxy dùng localhost trong network test nội bộ, không mở port public. Snapshot11 bảng không thay kiểm toàn bộ nghiệp vụ khách sạn.

Thu hồi phiên trước final Auth check đã được tái hiện bằng Auth thật. **Chưa có protocol revoke atomic xuyên Auth và directory**; vẫn có khoảng thời gian giữa final RPC và directory commit cần T03/T08 chốt semantics/epoch/fencing. Chưa tuyên bố revoke tức thời toàn hệ thống.

Advisor: **761 findings /199WARN** (43 no-policy,7 FK,512 unused-index,199 permissive). So packet trước762, một index được workload mới sử dụng; **không có schema/index fix hoặc disposition mới**. Catalog review vẫn chưa đủ để reviewedSafe=true.

Native backfill CLI chưa kiểm toàn tuyến với target/credential files thật; Linux runtime installer/secret/maintenance/ACL, T10 budget/vendor/consumer DSN/rolling overlap, quotas/anti-abuse, full-default/rebuild, browser/Android, staging/TLS/offsite DR/load/RC/pilot vẫn mở. Không thay serving DB, runtime flags, worker replicas hoặc phát credential vận hành.

## 5. Thực hiện lại và nhận tiếp

```powershell
node scripts/test-control-backend-sandbox.mjs --help
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-dispatch
node .local/test-workspace-recheck-20261028.mjs --all
```

Để có advisor packet, dùng --advisors-cli với native CLI pin và đường dẫn đã xác minh theo runbook. Mỗi run phải có terminal/source/schema/cleanup; source đổi làm packet cũ thành lịch sử. SIGKILL/role revoke chỉ áp dụng exact-owned fixture do harness tạo.

**Nhận tiếp theo thứ tự:** native CLI reader/writer với real scoped target + file config/signed batch/restart; protocol revoke và installer/rotation/maintenance; T10 consumer/vendor/resource/overlap; tích hợp test vào default suite rồi candidate freeze/full-default/independent rebuild; tiếp các delta signup/console và staging/DR/E2E/tải/RC/pilot theo dependency. Giữ regression45 controls mới, không giao lại happy path/worker kill như chưa có code.

Ledger và worksheet gốc giữ nguyên checksum: **70 ca not_run,122 release entries unverified,124 cặp môi trường chưa ký**. Không reviewer/signoff/gate mới; plan toàn VPS+signup tiếp tục active.
