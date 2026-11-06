# RoomQC — giao thức lệnh quản lý khóa phục hồi đăng ký

**Checkpoint tiếp theo — attestation/status:** [v3/live-status](roomqc-setup-attestation-status-local-2026-10-28.md) đã khép phần thiếu namespace fingerprint và projection current. Ghi chú checkpoint này gọi v1 chưa chính xác: trước thay đổi là v2, cùng phạm vi thiếu2 schema; packet lịch sử giữ nguyên. Bằng chứng219 controls ở dưới thuộc source cũ, không chuyển sang candidate mới.

Ngày 28/10/2026. Lát triển khai của T08/T12 trong [kế hoạch tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md). Phần này cung cấp giao thức database; chưa phải bộ cấp khóa vận hành hoàn chỉnh, chưa nghiệm thu VPS hoặc mở signup.

## 1. Phạm vi triển khai

[Migration append-only](../../../supabase/migrations/20261028082314_setup_recovery_credential_commands.sql) được tạo bằng Supabase CLI 2.122.0, lệnh `migration new setup_recovery_credential_commands`. Không đổi các migration trước. [Bộ kiểm native](../../../server/control/testing/setup-credential-native.mjs) dùng database và PostgREST riêng trong sandbox sở hữu; không dùng secret hoặc dữ liệu đang phục vụ khách.

| Quyền | Được làm | Ranh giới |
|---|---|---|
| Phiên bảo trì database | Cài schema, chuyển chủ sở hữu hàm sang role riêng | Migration thường bị từ chối ngay; không cấp thêm membership để vượt lỗi |
| `roomqc_setup_credential_owner` | Thực thi interface hẹp qua SECURITY DEFINER và RLS riêng | NOLOGIN, không superuser/BYPASSRLS/CREATE ROLE, không DELETE hoặc sửa nhật ký |
| `roomqc_setup_credential_issuer` | Cấp credential, đọc kết quả lệnh của đúng login | Không đổi binding, không thu hồi trực tiếp, không ghi bảng |
| `roomqc_setup_credential_installer` | Đổi binding, thu hồi, đọc kết quả lệnh của đúng login | Không cấp credential, không ghi bảng |
| API/worker/anon/authenticated/service_role | Giữ quyền nghiệp vụ hiện hành | Không được vào schema bảo trì |

Các capability role không có LOGIN/password. Tạo login bảo trì, bảo vệ DSN, bind target, resource budget và ký approved release vẫn là công việc của bộ cài tiếp theo. Interface không tự xác minh chữ ký approved release: `releaseSha256` tại đây là ràng buộc đã cài bằng phiên bảo trì, không thay trust protocol của installer.

## 2. Lệnh và kết quả bền vững

Schema `roomqc_setup_admin` không đưa vào danh sách schema của PostgREST. Chỉ có `bind(jsonb)`, `issue(jsonb)`, `revoke(jsonb)`, `receipt(uuid)` và grants theo vai trò trên. Các hàm definer dùng `search_path=''`; phần xử lý private dùng SECURITY INVOKER.

Mỗi mutation có version hợp đồng, operation, UUID key/requestId, reason, expectedVersion và cluster/binding/release hashes. Cùng key và cùng request từ đúng login trả nguyên kết quả cũ trước khi xét version hiện hành. Khác body hoặc login bị từ chối; `receipt` chỉ đọc kết quả của chính login. Kết quả luôn là lịch sử, không tự xác nhận credential còn dùng được.

Mutation, CAS version, command result và một audit cùng transaction. Chèn audit lỗi thì rollback toàn bộ, gồm credential và hạn nghỉ của khóa trước. Command/audit không được UPDATE/DELETE/TRUNCATE; không lưu token, signing secret, password hoặc email khách hàng. Không xóa lịch sử để chạy lại.

## 3. Cấp và thay credential

`issue` nhận predecessorId, TTL 120–3.600 giây, overlap 10–60 giây, thuật toán HS256/RS256/ES256 và signer fingerprint. Database sinh credential ID, iat/exp theo clock database; kết quả lưu cố định để signer tái tạo claims sau mất response. Chưa có proof signer/installer CLI cho ba thuật toán; native diagnostic chỉ dùng HS256 fixture.

Predecessor phải khớp head hiện tại. Khi cấp khóa mới, hạn nghỉ của khóa cũ được ghi cùng transaction; không kéo dài expiry hoặc hạn nghỉ đã đặt. Nếu còn credential thứ ba đang hiệu lực, lệnh bị chặn. Vì hạn overlap nằm trong database, tắt process thay khóa không làm khóa cũ tiếp tục dùng vô hạn.

Guard recovery kiểm authority rồi credential với SHARE lock theo cùng thứ tự với maintenance. Kiểm hạn retirement trước và sau RPC. Revoke/đổi binding chờ RPC đang giữ khóa kết thúc; sau khi revoke commit, JWT còn hạn bị từ chối. Đổi binding/release thu hồi các credential cũ và xóa head; credential đã thu hồi không được phục hồi bằng replay.

## 4. Nghiệm thu hỗ trợ, không thay ca gốc

Các control dưới là bằng chứng hỗ trợ A06/B02/C01–C04 và ranh giới T12; không tạo ca release mới hoặc tự ghi actual/reviewer vào worksheet.

| Nhóm | Đối chứng cần có |
|---|---|
| Upgrade | Phiên migration thường bị chặn; phiên bảo trì đúng; fault cuối migration rollback schema/role/history, rồi apply thành công |
| Quyền | Issuer/installer tách chức năng; mixed service-role và runtime bị chặn; ghi bảng trực tiếp bị chặn |
| Cấp và replay | Claims/row/clock trùng; JWT mới qua PostgREST thật; hai request cùng key một kết quả; khác body/login/target/release/version bị chặn |
| Rotation | Hai khóa cùng dùng trong overlap; quá hạn thật thì khóa cũ bị chặn dù rotator không chạy; không cấp thêm khóa thứ ba |
| Thu hồi | Revoke chờ RPC thật giữ khóa; replay hoặc lệnh revoke khác không đổi/xóa revoked_at; đổi binding chặn khóa cũ |
| Atomic/process | Audit fault không partial effects; SIGKILL SQL writer trước commit không lưu lệnh, sau commit có một lệnh đọc lại được |
| Giữ dữ liệu | 11 bảng nghiệp vụ giữ nguyên; command/audit không có bearer hoặc signing material; fixture role/container/volume/network được dọn theo ownership |

Kết quả terminal, packet native và hồi quy cùng source ghi ở mục7. Bài SQL writer SIGKILL không phải bài installer/file publication. Không dùng số control làm số ca nghiệm thu sản phẩm.

## 5. Phần cần nối tiếp

1. Bổ sung projection live-status hẹp cho đúng operator: current version/binding/release/head/expiry/revoked/retirement. Receipt lịch sử không được dùng thay readiness. Sau đó nối CLI config/private files và preflight binding DB identity/role/schema/approved release/resource budget; từ chối target sai trước mutation.
2. Signer custody và chữ ký trong bộ nhớ; không gửi secret qua argv/stdout. Đối chiếu fingerprint với command receipt.
3. File tạm private, fsync, publish nguyên tử; cùng key đối soát DB/file khi chết trước/sau commit hoặc rename. Không tự cấp khóa mới để chữa kết quả unknown.
4. Lịch refresh một instance/target, bounded connection budget gồm rolling overlap; kiểm RPC bằng credential mới, rồi revoke cũ qua vai trò riêng. Nếu file chưa publish khi overlap hết, phải dừng recovery rõ ràng và báo OPS; không nới quyền hoặc hồi sinh khóa cũ.
5. Mount runtime read-only, owner/ACL Linux/Windows, expiry/missing/restart và alert drills; thêm native CLI/process fault và integrate default-full/rebuild.
6. Review quyền gián tiếp/advisor, target Linux/VPS, secret rotation thật và reviewer/signoff theo [hồ sơ nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md).

Revoke credential trong cùng business DB không giải quyết khoảng thời gian từ Auth RPC cuối đến directory commit của actor. T03 vẫn phải chốt protocol hiệu lực xuyên hai hệ thống riêng. Worker/dispatch/signup vận hành và các gate tiếp tục giữ trạng thái hiện hành.

**Khoảng trống tại checkpoint cũ, đã có v3 local ở báo cáo mới:** fingerprint schema v2 chỉ phủ `public/private/auth/storage/realtime`; nó không phủ định nghĩa và ACL của `roomqc_setup` hoặc `roomqc_setup_admin`. Hash trước–sau bằng nhau trong diagnostic không chứng minh hai schema này không drift. T02/T08 cần manifest/checksum và catalog preflight riêng hoặc fingerprint version mới, gồm owner/ACL/search_path/function body/API exposure/role graph, kiểm drift âm và upgrade/rollback tương thích. Không lấy source hash của migration thay quan sát catalog database thực.

## 6. Phiếu triển khai công cụ cấp khóa tiếp theo

Đây là decomposition của T08, không thêm task vào ledger. Mỗi dòng cần kiểm cùng source/schema khi bàn giao.

| Bước | File hoặc hợp đồng cần làm | Điều kiện trước khi chuyển bước |
|---|---|---|
| Readiness | Projection chỉ đọc, xác thực đúng operator; trả version/target/head/live expiry và reason code | Receipt lịch sử không khiến credential revoked/retired/hết hạn hiển thị ready; sai caller không lộ dữ liệu |
| Target | Config versioned, private DSN ref, DB system identifier/OID/name/role, inventory + approved release/trust, binding và environment | Đổi DB/host/role/release/signature/expiry đều dừng trước mutation; không tự sửa ACL bằng quyền runtime |
| Budget | Consumer one-shot riêng pool1, replica/overlap policy và maintenance concurrency | Không vay migration reserve; mọi DSN/pool/replica đều khớp profile được review |
| Command | CLI nhận config/command file, check/issue/receipt/bind/revoke rõ; actor/role đúng operation | Không nhận raw JWT hoặc password trên argv; cùng key không đổi payload và không tự cấp lại khi timeout |
| Sign | Signer từ private file/ref; algorithm/fingerprint khớp receipt và deployment đã duyệt | Chỉ ký claims đã commit; sai key/alg hoặc receipt target chặn trước file publication; native REST xác minh chữ ký |
| Publish | Output directory private; file tạm exclusive, no symlink, flush và rename trong cùng filesystem | Kill trước/sau write/fsync/rename chạy lại không tạo credential khác, không báo ready khi file/live authority lệch |
| Refresh | Một instance mỗi target; thời điểm refresh có margin; giữ cùng command khi outcome unknown | Không kéo dài hạn khóa cũ; nếu publish lỗi đến retirement thì dừng recovery có cảnh báo, giữ job/history |
| Retire/revoke | Sau native RPC mới đạt thì lệnh revoke cũ bằng capability riêng; DB retirement vẫn là giới hạn cuối | Revoke lỗi/mất response không biến ready giả; same-key receipt/replay phục hồi, không clear revoked_at |
| Runtime | Mount file read-only; nạp lại mỗi request; kiểm owner/UID/GID hoặc Windows SID ACL | Expiry/missing/binding mismatch dừng claim trước remote call và có đường xử lý; không mất task đã claim |
| Delivery | CLI help/example/runbook, source manifest và native fault packet; staging rotation drill | Full regression cùng source, default-full/rebuild rồi đúng VPS target; chưa có reviewer thì chưa đóng gate |

Bài fault cho installer phải đặt barrier thực tại DB commit, file fsync, rename và trước/sau native verification. Chạy SQL writer rồi SIGKILL chỉ phủ DB transaction; không gộp thành proof publish file. Thử hai process đồng thời, stale predecessor, overlap hết khi mất mạng, quyền thư mục sai, signer sai và process restart. Ghi riêng thời gian mất khả năng recovery; không hứa zero downtime khi chưa có actual proof.

## 7. Kết quả terminal và giới hạn

**Checkpoint lịch sử — lệnh quản lý khóa phục hồi:** [giao thức và bằng chứng local](roomqc-setup-credential-command-local-2026-10-28.md) đạt219/219 controls, gồm35 mới với2 SQL-writer SIGKILL và2 barrier; giữ184 API/worker/CLI nền. Control656 tổng/654 pass/0 fail/2 skip;581+18 migrations, source277 files/hashafbb17c9eb867af6d77e58d73bcaaf5ffc3bdafd75963d3186d513806154edb9, cleanup0. Upgrade581 dùng phiên bảo trì riêng, rollback schema/role/history đạt. Advisor đo lại808 findings/247 WARN, chưa disposition. Đây là giao thức DB, chưa installer/file publication/lịch thay khóa. Fingerprint v1 chưa phủ roomqc_setup/roomqc_setup_admin; nhận attestation→installer/rotation và cross-system revoke→T10/signup/console→default-full/rebuild→VPS/DR/E2E/tải/RC/pilot.70ca/122mục/124lượt/reviewer/gates giữ nguyên.

- [Packet native](../../../artifacts/roomqc-setup-credential-native-e495738c86b6-local-2026-10-28.json) — terminal0,219/219 controls,35 mới/2 SQL writer SIGKILL/2 barrier; giữ45 API và16 CLI.581 business+18 directory migrations; rollback migration581 và cleanup theo ownership đạt.
- [Hồi quy control](../../../artifacts/roomqc-workspace-recheck-cab7d6645af3-local-2026-10-28.json) — terminal0,656 tổng/654 pass/0 fail/2 skip. Hai skip là Windows symlink permission và notification POSIX file modes; chưa đóng bằng các bài khác.
- Frontend giữ packet66/66 trước vì14 file source/test không đổi; đây là jsdom/Capacitor mock, chưa browser/Android E2E.

Native/current control cùng source277 files SHA256 `afbb17c9eb867af6d77e58d73bcaaf5ffc3bdafd75963d3186d513806154edb9`. Advisor CLI2.122.0 đo808 findings: {"INFO":561,"WARN":247}. Đây là số đo hiện hành, chưa review/disposition; không tự suy ra finding lịch sử đã được sửa. Đọc catalog advisor thấy65 finding có nhắc role/đối tượng recovery:64 WARN multiple_permissive_policies trên16 bảng public (mỗi bảng4) và1 INFO unindexed_foreign_keys. Chưa có đối chứng before cùng candidate để quy nguyên nhân tăng, chưa đánh giá quyền hiệu lực cho từng finding; T08 giữ backlog và reviewedSafe=false. Không xóa policy/grant hàng loạt để làm sạch số đếm.

Giữ các lần fail đã cleanup0:827591b2b20a dừng chain guard trước SQL;ab890cc6aa6a thiếu SET ROLE khi dùng ordinary migration login;2a941252401d lấy chẩn đoán rõ hơn;c0eaf731c4fd thử cấp lại ADMIN bị PostgreSQL từ chối;d0d75830b4e8 dừng fixture cấp role;f94fefa8bb44 đạt25 control mới rồi dừng fixture tạo audit trigger. Đã chuyển migration và fixture DDL sang maintenance session riêng; không nới quyền API/worker. Không đổi failed packet thành pass.

Chỉ dùng credential và approved release fixture. SQL process faults không chứng minh signer/CLI/private file/fsync/rename/scheduler. Fingerprint scope và cross-system actor revoke vẫn mở. Chưa chạy default-full/rebuild/VPS/staging/public email/browser/Android/load/pilot;70 ca not_run,122 entries unverified,124 lượt/reviewer/signoff/gates giữ nguyên.
