# RoomQC — lõi ghi đối soát đăng ký cũ, bằng chứng local

**Checkpoint kế tiếp:** [CLI/config/signed batch và process interruption-resume local](roomqc-setup-backfill-cli-local-2026-10-28.md) đã có proof mới; số/source và phần chưa triển khai bên dưới là lịch sử của checkpoint core.

Ngày 28/10/2026. Đã triển khai migration directory 0017, tài khoản runtime ghi qua hai RPC, journal lệnh bất biến và applier. **Đây là lõi apply đã kiểm local; CLI/config writer, manifest batch được duyệt và crash-resume toàn batch chưa hoàn tất.** Durable admin recheck vẫn chưa triển khai. [Kế hoạch nhận tiếp](roomqc-vps-signup-next-delivery-2026-10-28.md) và [phiếu triển khai](roomqc-vps-signup-start-pack-2026-10-28.md) giữ toàn phạm vi VPS + signup.

## 1. Đã thay đổi gì

| File | Hành vi |
|---|---|
| `server/control/migrations/0017-setup-backfill-apply.sql` | Role runtime/writer riêng, journal append-only, snapshot projection và apply RPC có khóa/CAS/audit/fence |
| `server/control/setup-backfill-apply.mjs` | Key UUIDv8 ổn định theo batch+workspace; kiểm schema/target/quyền; lấy receipt ngoài transaction rồi gọi RPC |
| `server/control/setup-backfill-apply-cases.mjs` | 12 ca PostgreSQL cho quyền, bảy nhóm, CAS microseconds, concurrency, lease/budget, fault/expiry và upgrade |
| `server/control/setup-backfill-apply.test.mjs` | 2 unit cho key ổn định, scope/validation trước network và lọc binding trước journal |
| `server/control/directory-db.test.mjs` | Đăng ký các ca mới; fixture disposable tăng cap tmpfs từ 2GiB lên 3GiB sau lỗi init-file ở lượt đầy đủ |
| `server/control/testing/setup-worker-native.mjs` | 8 kiểm apply cùng reader/worker/recovery/Auth/PostgREST thật; cleanup thêm role chính xác |

Reader0016 và CLI dry-run không được cấp thêm quyền ghi, không có `--apply`. Database nghiệp vụ, UI và cấu hình đang phục vụ không được thay đổi trong lượt này. Directory dùng migrator tuần tự riêng; 0001–0016 giữ checksum, không có migration nghiệp vụ mới ngoài bộ580 đã ghi nhận.

## 2. Quyền, CAS và tác động

Runtime chỉ có `read_setup_backfill_snapshot` và `apply_setup_backfill`; không đọc trực tiếp workspace/journal, không DML/DDL, không SET ROLE writer. Writer NOLOGIN/NOINHERIT không có membership cho runtime; function dùng search_path rỗng và định danh object đầy đủ. Readiness từ chối sai system_identifier/database OID/name/role, DB recovery, role quản trị, membership hoặc column/function grants dư.

Snapshot riêng có cùng projection với scanner, giữ timestamp microseconds. JS so fingerprint của dòng đã review; SQL so cấu trúc snapshot mới dưới khóa. Không giả định hash JSON của JS bằng JSONB::text của PostgreSQL. Thứ tự khóa: advisory release727001 shared → command theo session_user+key → workspace → job → dispatch → cluster shared. Không giữ row lock khi gọi remote receipt.

Journal keyed caller LOGIN+UUID lưu report/snapshot hashes, binding allowlist và kết quả đã lọc. Không lưu owner input, owner ID, lease token hoặc provider body. Binding chỉ giữ năm trường định danh được phép; RPC từ chối trường dư và giới hạn kích thước JSON. Replay tìm receipt đã commit trước CAS mới, nên kết quả lịch sử không biến thành trạng thái mới sau worker chạy. Cùng key khác payload bị409; hai caller có receipt riêng.

| Trường hợp | Kết quả lõi đã kiểm |
|---|---|
| Active đúng receipt, job/dispatch không xung đột | No-op có command/audit, giữ gói/trial |
| Local committed bất biến đúng identity + receipt phù hợp + job còn điều kiện | Activate directory và settle job atomic, không provision |
| Pending, gồm receipt tổng quát chưa chứng minh dispatch | Reuse job; orphan hợp lệ enqueue với created_at/deadline gốc, không cấp24h mới |
| Local closed đúng identity, không receipt mâu thuẫn | Waiting_owner hoặc no-op nếu đã waiting_owner; missing receipt đơn thuần không đủ |
| Stale, held lease, terminal/exhausted/overdue, protected workspace | Skip/review, không reset budget hoặc cướp lease |
| Conflict/unavailable/revoked remote token | Giữ dữ liệu, lý do đã lọc; không tự activate hoặc close |

Khi terminal reconciliation kết thúc lease đã hết hạn, attempt cũ được ghi lease_expired, không dựng worker success giả. Fault ở job/command/audit rollback cùng transaction. Final DB-clock fence sau audit kiểm release và deadline; hết hạn trong lúc audit chờ rollback cả activation/command/audit. Lỗi DB khác được trả thành lỗi an toàn, không bị biến thành success.

## 3. Bằng chứng của source cuối

| Run | Kết quả | Phạm vi |
|---|---|---|
| [Control d11c279fe087](../../../artifacts/roomqc-setup-backfill-apply-d11c279fe087-local-2026-10-28.json) |634 tổng /632 pass /0 fail /0 cancelled /2 skip, terminal0|12 PostgreSQL apply +2 unit mới và toàn bộ control regression; remote observations trong ca directory là doubles |
| [Native b566f5d28eec](../../../artifacts/roomqc-setup-backfill-apply-native-b566f5d28eec-local-2026-10-28.json) |123/123 controls, terminal0|580 business +17 directory migrations;17 worker +8 reader +8 apply, cùng Auth/PostgREST/PostgreSQL và ba directory runtime roles thật |
| Cleanup độc lập |0 container /0 volume /0 network theo exact label ở cả hai run|Không dọn stack đang phục vụ; native roles được xóa và baseline phục hồi trước advisors |

Backend **261 file**, SHA256:

    d47e7f7fd09e882157ee9c42903b14089ee2524bcc9d64eb14d7b842bf8e5cc3

Bộ580 migration nghiệp vụ giữ hash:

    77b385945e7b223a44a6ea98bb42ff19204aa5dd687fbbf317601c570c3b3b1d

Schema nghiệp vụ trước/sau native:

    553e8e5f781edcb188df30a1cd8174e099d8251bce7892cab6c547216c6965b3

Hai skip: fixture symlink Windows không được OS cho tạo; production notification POSIX file modes cần Linux. Không coi skip là pass. Không có frontend/browser/Android test mới trong lượt này.

## 4. Các cửa sổ đã kiểm

- Bảy nhóm có đáp án; dispatch/remote receipt không bị sửa bởi apply. Workspace/job chỉ thay đổi khi đủ proof và budget; report/journal không có input riêng tư.
- Đổi updated_at thêm1microsecond trong lúc đang đọc remote làm SQL CAS trả skipped_stale; key cũ replay đúng receipt cũ.
- Bốn request cùng key chỉ một effect; tạo client mới sau commit đọc lại cùng kết quả. Hai LOGIN operator cùng snapshot chỉ một activation; kết quả scoped riêng theo caller. Đây chưa phải fault mạng/SIGKILL thực tế.
- Held lease giữ nguyên job/history; expired claimed attempt được kết thúc lease_expired, stale worker settle bị từ chối. Exhausted/overdue/needs_review/succeeded/cancelled không được tự mở lại.
- Orphan pending enqueue với created_at bằng dispatch gốc và deadline gốc+24h, vẫn pending khi receipt missing. Khai group committed cho pending không làm active.
- Fault insert command, update job hoặc insert audit rollback toàn bộ; cùng key chạy lại phục hồi sau gỡ fault. Hai barrier DB lock chứng minh deadline và release expiry ở final audit rollback mọi ghi.
- Upgrade0016→0017 có workspace/job needs_review/dispatch/audit thật; hai migrator chỉ một apply, rerun no-op, lịch sử và dữ liệu cũ giữ nguyên.
- Native lấy receipt thật bằng scoped credential. Generic receipt vẫn chỉ reuse job; missing không tạo tombstone. Terminal committed được fixture lưu từ protocol proof thật rồi applier mới activate directory; replay không thêm business receipt/trial. JWT bị revoke còn hạn cho unavailable và không activate.

## 5. Lịch sử fail và giới hạn

[2bcefa92d903](../../../artifacts/roomqc-setup-backfill-apply-2bcefa92d903-local-2026-10-28.json):9/12 đạt; fixture chưa làm job due và helper fault/barrier còn PUBLIC EXECUTE nên readiness chặn trước cửa sổ thử. Sửa fixture, không nới product permissions. [6d4506e749d1](../../../artifacts/roomqc-setup-backfill-apply-6d4506e749d1-local-2026-10-28.json) sau đó12/12 đạt ở source trước khi thêm hai case và native.

[af15c182d613](../../../artifacts/roomqc-setup-backfill-apply-af15c182d613-local-2026-10-28.json):634 tổng/631 pass/1 fail/2 skip; ca upgrade alert gặp PostgreSQL `could not write init file`. Sau tăng cap fixture disposable2→3GiB và sửa nguồn, full run cuối ở mục3 đạt. [Native15c4ca3a01cc](../../../artifacts/roomqc-setup-backfill-apply-native-15c4ca3a01cc-local-2026-10-28.json) exit1 do duplicate identifier trong fixture; đã sửa, node syntax check và native run cuối đạt. Mọi lượt đều giữ lịch sử và cleanup0; không ghép count source cũ thành proof source cuối.

Native vẫn seed directory bằng administrator SQL và approval có chữ ký là fixture. Local terminal dispatch trong bài apply được fixture ghi từ scoped protocol proof thật, chưa phải public control signup API. Directory và business là hai DB trong cùng PostgreSQL sandbox, chưa chứng minh failure domain A/B. Không có operational writer config/CLI/approved manifest/batch process interruption, durable admin recheck, full public signup E2E, toàn bộ D10 SIGKILL, full-native default/rebuild, Linux/VPS/TLS/offsite restore/tải/pilot.

Advisors vẫn762 findings:43 no-policy INFO,7 FK INFO,513 unused-index INFO và199 permissive-policy WARN. Recovery catalog reviewedSafe=false; indirect/dynamic/aggregate/window và disposition từng finding vẫn mở. Không dùng123 native controls để ký thay các việc này.

## 6. Nhận tiếp đúng thứ tự

1. **Khép apply4.3:** config/DSN writer riêng với UTC và write-session options rõ; cùng server/DB của report nhưng role khác reader; consumer budget riêng/pool1; manifest batch/allowlist/report hash/reviewer/source/target, output exclusive và không secret. CLI apply riêng; không đổi CLI dry-run thành ghi ngầm. Thử full CLI/file/ACL, batch rerun và interruption/resume thực.
2. **Durable recheck4.4:** live platform authority, command/result contract riêng, routing+snapshot CAS, bounded recovery budget; UI/journal giữ key qua F5/response-loss. Không dùng DB operator receipt của backfill làm platform-user command receipt.
3. **Tích hợp và vận hành:** installer/privilege disposition/T10 vendor-DSN-overlap, public API→worker→remote→status và process-kill; freeze/default-full/rebuild; VPS/restore/A-B/browser/Android/tải/RC/pilot theo dependency gốc.

70 ca nghiệm thu vẫn not_run,122 release entries unverified;124 lượt môi trường chưa đổi actual/reviewer/signoff. Chưa cấp credential vận hành, migrate DB đang phục vụ, bật dispatch/worker hoặc mở signup production. Goal toàn bộ plan còn active.
