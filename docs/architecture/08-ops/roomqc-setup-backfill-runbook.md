# RoomQC — chạy thử đối soát dữ liệu đăng ký cũ

**Cập nhật:** [CLI writer/signed batch/process recovery đã có local proof](roomqc-setup-backfill-cli-local-2026-10-28.md). Mục1–6 mô tả reader chỉ đọc; mục7 giữ checkpoint core và mục8 hướng dẫn CLI apply riêng. Không cấp quyền ghi cho reader; chưa có operational approval/credential hoặc apply trên serving DB.

Công cụ này lập báo cáo để chuẩn bị backfill. Nó không apply, tạo lại khách sạn, sửa mapping, kéo dài trial, reset attempts hoặc mở lại job. [Kế hoạch4.3](roomqc-vps-signup-next-delivery-2026-10-28.md#43-đóng-khoảng-hở-tiến-độ-và-backfill-dữ-liệu-cũ) vẫn yêu cầu apply có audit/CAS, rerun và chức năng recheck sau bước này. Không dùng báo cáo dry-run để ký toàn bộT12.

## 1. Thành phần và giới hạn quyền

Directory migration0016 tạo group NOLOGIN `roomqc_control_backfill_reader`. Installer cấp LOGIN riêng làm thành viên duy nhất của group; không dùng LOGIN API, worker, migrator hoặc postgres. Group chỉ được SELECT các cột identity/state/version/lease tối thiểu và lịch sử migration; không đọc display_name, email_hash, publishable_key, audit hoặc secret. Group được đọc system_identifier từ pg_control_system để kiểm đúng server; không có pg_monitor hoặc quyền quản trị.

Mọi lượt chạy mở transaction `REPEATABLE READ READ ONLY`, xác minh đủ migration/checksum, server identifier/database OID/name/LOGIN và quyền hữu hiệu. Quyền bảng/cột/function/sequence hoặc membership dư làm lượt chạy bị từ chối. Công cụ không tự GRANT/REVOKE hoặc sửa lỗi cấu hình DB.

Remote dùng `SetupRecoveryGateway.receipt()` với credential scoped/release đã ký, kiểm URL/cluster/approval/epoch/digest/credential-ref, timeout và identity của receipt. Adapter cấp cho scanner chỉ có phương thức receipt. Credential recovery hiện có hai RPC được cho phép, gồm cả close ở giao thức worker; dry-run này **không gọi close**, không tuyên bố bearer là credential chỉ đọc ở mức quyền remote. Cần giữ custody/file ACL và kiểm journal trước/sau trong nghiệm thu. Không đưa token này vào browser.

## 2. Cấu hình trước khi chạy

Template: [setup-backfill.example.json](../../../deploy/monitoring/setup-backfill.example.json). Template thiếu target approval và có system identifier/OID bằng0 nên phải bị từ chối; không thể dùng nguyên bản để truy cập production.

| Trường | Đầu vào phải kiểm |
|---|---|
| environment | local/staging/production; local còn cần cờ allow-local rõ ràng |
| directory.dsnFile | Đường dẫn tuyệt đối tới file secret của LOGIN reader, không chứa DSN trong manifest |
| directory.expected | systemIdentifier/databaseOid/databaseName/role của directory đã được review độc lập; không lấy từ một DSN bất kỳ rồi tự chấp nhận làm expected |
| releaseTrustFile | File public trust Ed25519 đã duyệt; không chứa private signing key |
| resourceBudgetFile | Ngân sách chung đúng environment; chỉ local được null |
| targets | Tối đa16 cụm được giao, metadata URL/host/inventory/credential-ref/approved-addresses và release approval có chữ ký |
| targets[].credentialFile | File credential recovery riêng đã cấp ngoài repo; loader kiểm lại mỗi request |

Staging/production bắt buộc HTTPS, DSN sslmode=verify-full và một consumer `setup-backfill-reader` trong ngân sách directory: replicas1, một pool max1, fixedConnectionsPerReplica0. Không dùng dư phòng migration/backup làm ngân sách ngầm. Budget example chung chưa bật/thêm consumer này; người vận hành phải review manifest thực trước khi chạy. Không chạy nhiều bản CLI cùng lúc trên target chỉ có ngân sách cho một bản; orchestration/rolling-overlap toàn hệ vẫn thuộcT10.

DSN chỉ được có tham số sslmode; URL options hoặc PG* environment không được chọn lại role/target/session SQL. Kết nối được xây rõ từng trường, max1, default_transaction_read_only, search_path pg_catalog và timezoneUTC. Local không TLS chỉ được loopback/host.docker.internal theo validator, không chấp nhận host mạng tùy ý. HTTP target local chỉ loopback và cần opt-in.

File phải thường, đường dẫn tuyệt đối, có giới hạn kích thước; symlink bị từ chối. POSIX secret kiểm UID/GID/mode; Windows ACL vẫn cần installer xác nhận riêng. Không gửi DSN, password, bearer hoặc private key trong chat.

## 3. Lệnh và đầu ra

Lệnh đọc trợ giúp, không kết nối DB:

```powershell
node scripts/control-setup-backfill.mjs --help
```

Ví dụ cách gọi sau khi target/config/secret đã được review; đường dẫn dưới là ví dụ, không phải file đã tạo:

```powershell
node scripts/control-setup-backfill.mjs --config 'C:\RoomQC\ops\backfill.json' --output 'C:\RoomQC\reports\backfill-001.json'
```

Chỉ với fixture local đã được xác nhận mới thêm `--allow-local`. Muốn đọc trang sau, dùng `--cursor` đúng giá trị nextCursor từ báo cáo trước và một output mới. CLI không có `--apply`, không có tham số nhập SQL, khóa hoặc DSN trực tiếp. Output tạo bằng exclusive create, mode0600; file đã tồn tại được giữ nguyên và CLI báo lỗi. stdout chỉ có mode/count/hasNextPage hoặc error code đã lọc; không in raw lỗi DB/provider.

Một lượt đọc tối đa100 workspace và một dòng thăm dò để biết còn trang; tối đa hai lời gọi receipt đồng thời, mỗi lời gọi tối đa5s. Kết nối/statement/lock có timeout hữu hạn. Snapshot directory được đọc rồi rollback/release trước network. Timeout hoặc credential không dùng được thành unavailable, không thành missing/success. Exit0 nghĩa là đã lưu báo cáo thành công, không có nghĩa mọi đăng ký đã hợp lệ hoặc được sửa.

Report chứa version/mode/readOnly/directory-schema/scope-hash/cutoff/observedAt, pageCount, count theo bảy nhóm, ID/cụm/routingVersion/snapshot hash/reason/action/lease/budget của từng dòng và nextCursor. Không có email, tên khách sạn, owner ID, lease token, fieldsJson, receipt body, URL secret hoặc lỗi provider gốc. Các ID trong report vẫn là metadata vận hành; lưu nơi hạn chế truy cập.

## 4. Cách đọc bảy nhóm

| Nhóm | Ý nghĩa | Việc tiếp theo |
|---|---|---|
| active_valid | Mapping và receipt phù hợp, không thấy xung đột trong snapshot | Giữ dữ liệu/gói/trial; không chạy provision lại |
| committed_pending | Dispatch terminal committed khớp receipt nhưng directory chưa active | Review đường settle/backfill có proof; CLI không activate |
| dispatch_pending | Dispatch đã lưu, terminal chưa chứng minh; kể cả có receipt tổng quát | Worker cần lấy protocol proof cho đúng dispatch/hash, không suy receipt tổng quát thành proof |
| closed | Dispatch closed bất biến, identity khớp, receipt không mâu thuẫn | Review waiting_owner và đường owner tiếp tục; CLI không mở dispatch mới |
| legacy_unknown | Thiếu identity/dispatch/proof hoặc trạng thái được bảo vệ | Hỗ trợ thủ công; không adopt theo tên/email hoặc tạo lại trial |
| conflict | Mapping/job/dispatch/receipt/terminal không phù hợp | Dừng sửa tự động, giữ bằng chứng và đối soát |
| unavailable | Cụm/release/credential/receipt chưa đọc được an toàn | Sửa nguyên nhân rồi chạy báo cáo mới; không đổi mapping |

Missing receipt không chứng minh dispatch đã đóng. Workspace suspended/migrating/expired/reserved không được tự chuyển active. Lease đang held chỉ là quan sát, không bị cướp/reset. Deadline/attempts hết không được tự kéo dài bằng công cụ này.

## 5. Snapshot, cursor và điều kiện apply về sau

Fingerprint SHA256 dùng projection canonical của workspace/job/dispatch/cluster/release/credential binding, gồm lease token nội bộ nhưng chỉ xuất hash. Timestamp PostgreSQL giữ nguyên microseconds trong jsonb; không làm tròn tới milliseconds để tránh bỏ sót hai cập nhật gần nhau.

Mỗi trang là một snapshot directory nhất quán. Cursor giữ scope hash, cutoff created_at và thứ tự UUID; **không giữ một MVCC snapshot xuyên mọi trang**, không bảo đảm không có cập nhật/backdated insertion giữa trang. Remote receipt được quan sát sau khi nhả transaction. Count trong mỗi report là count trang, không là tổng inventory toàn hệ. Tổng hợp report phải kiểm cursor/scope và phạm vi; full consistent export nếu cần là gói riêng, không được suy từ cursor này.

Lõi apply0017 đã đọc lại dưới khóa, kiểm CAS/identity/approval và ghi audit atomic; report cũ hoặc bị sửa không có quyền ghi. CLI apply riêng, signed manifest và process interruption-resume đã có local proof ở mục8; vẫn cần phê duyệt/credential/target thật trước vận hành. Không sửa SQL trực tiếp theo cột action. Recheck được thiết kế riêng để có live authority, mã lệnh, CAS và kết quả bền vững.

## 6. Nâng cấp có dữ liệu và bằng chứng cần giữ

Kiểm upgrade dựng directory0014 từ file gốc, seed queued/retry/leased/succeeded/waiting_owner/needs_review/cancelled, attempts0/2/8/10, lease còn/hết hạn và dispatch có/thiếu. Hai migrator cùng chạy0015: một apply, một no-op; rerun no-op. Giữ IDs/state/lease/attempts/audit/dispatch/approval/history cũ, thêm max_attempts8 và deadline=created_at+24h. Không diễn giải deadline quá hạn thành24h tính từ ngày upgrade.

Nghiệm thu dry-run giữ before/after directory + business + remote dispatch journal; đọc receipt không tạo tombstone. Chứng minh quyền bị từ chối bằng LOGIN thật; gateway double chỉ hỗ trợ kiểm logic, không thay Auth/REST thật. Lưu exact source/schema/command/exit, failed history, report đã lọc và cleanup độc lập của fixture. Dùng proof đúng phạm vi để hỗ trợ A04–A07/D07–D11; chưa thay trạng thái70 ca gốc hoặc122 mục release.

**Rollback/dừng:** dừng CLI, giữ report và mọi job/receipt/tombstone. Không có data mutation của công cụ cần undo; không down-migrate0016 trên DB đang dùng để chữa cấu hình. Thu hồi LOGIN reader/file credential theo quy trình installer nếu cần; thay đổi credential recovery dùng chung phải review ảnh hưởng worker. Chưa cấp credential vận hành, migrate directory đang phục vụ hoặc chạy trên VPS chỉ vì có runbook này.

## 7. Checkpoint lõi apply trước CLI

[Report apply](roomqc-setup-backfill-apply-local-2026-10-28.md) ghi hai RPC, role NOLOGIN riêng, key theo batch/workspace, snapshot CAS giữ microseconds, journal caller-scoped, final DB-clock expiry và12 ca PostgreSQL +8 native controls. Trong checkpoint core, Class SetupBackfillApplier chỉ được fixture gọi; checkpoint CLI mới ở mục8 đã có config/file/manifest/process recovery local. Chưa cấp writer DSN/secret file vận hành. Reader0016/CLI hiện có vẫn giữ read-only.

Checkpoint CLI đã thực hiện writer config với UTC/write options, signed target/report/batch allowlist/source/reviewer, consumer riêng/pool1, output exclusive và interruption-resume trên fixture; Windows ACL/Linux container file checks có proof. Installer/key custody/target thật vẫn chưa được nghiệm thu. Sau đó durable platform recheck có contract/authority/journal khác operator backfill; không tái sử dụng caller LOGIN như user identity.

## 8. CLI apply theo lô được phê duyệt

Đã thêm `scripts/control-setup-backfill-apply.mjs`, tách khỏi CLI dry-run ở mục3. Template [writer](../../../deploy/monitoring/setup-backfill-apply.example.json) có identity bằng0 và approval trống nên không dùng nguyên bản được. Phần này mô tả công cụ và quy trình; chưa cấp tài khoản/key vận hành hoặc cho phép apply lên database đang phục vụ.

### 8.1. Chuẩn bị bốn file và quyền

1. Chạy reader trên đúng target và source dự kiến apply; giữ nguyên byte report. Reader và writer phải cùng systemIdentifier/databaseOid/databaseName, hai LOGIN khác nhau. Reader giữ quyền0016; writer chỉ membership `roomqc_control_backfill_runtime` và hai RPC của0017. Cấp tài khoản bằng installer/quy trình vận hành riêng, không đưa DSN vào manifest.
2. Writer config dùng cấu trúc reader cộng `batchTrustFile`; DSN reader được thay bằng file DSN writer. Trust release xác minh backend; batch trust là public key của người phê duyệt lô, khác mục đích với release approval. Staging/production cần HTTPS và DSN `sslmode=verify-full`; direct hoặc session-pinned endpoint, không dùng transaction pooling.
3. Ngân sách thực phải khai báo `setup-backfill-writer`: replicas1, một pool max1, fixedConnectionsPerReplica0. Không tự thêm consumer vào example chung hoặc lấy phần dành cho migration. Reader consumer phải còn trong budget nếu chạy cùng lúc. Mọi thay đổi budget cần tạo lại report/phê duyệt vì hash ràng buộc.
4. Tất cả file config/report/manifest/trust/DSN/credential và thư mục cha chứa chúng phải riêng tư. POSIX: owner hiện hành hoặc root và không có group/world bits; thư mục0700/file0600 là cấu hình thông thường. Windows: owner và mọi ACE Allow chỉ thuộc user hiện hành, SYSTEM hoặc Administrators; Allow cho Everyone/Users/Authenticated Users bị chặn. CLI kiểm ACL thật bằng Windows API, không dựa vào mode0600 của Node trên Windows. Mọi thành phần đường dẫn có symlink/junction bị từ chối.

DSN được phân tích thành trường pg rõ ràng, không nhận tùy chọn SQL hoặc PG* env để đổi target. Writer dùng max1, search_path=pg_catalog, timezoneUTC, datestyleISO,YMD và `default_transaction_read_only=off` rõ ràng; helper reader/attestor vẫn mặc định read-only. Statement/lock/network đều có timeout. Credential remote chỉ được đọc lại và lấy receipt; apply không gọi close hoặc provision.

### 8.2. Hợp đồng phê duyệt lô

`batchTrustFile` là JSON `{version:1,keys:[...]}`. Mỗi key có đúng `keyId`, publicKey JWK Ed25519 `{kty,crv,x}`, environment và target. Target có đúng `systemIdentifier`, `databaseOid`, `databaseName`, `readerRole`, `writerRole`; trust của targetA không ký được cho targetB. Không có private key trong runtime.

Manifest là `{version:1,algorithm:"Ed25519",keyId,payload,signature}`. Chữ ký base64url được người phê duyệt tạo ngoài runtime, trên bytes từ `setupBackfillBatchSigningBytes(unsignedEnvelope)`; domain là `roomqc.setup-backfill-approved-batch.v1:`. Hàm chỉ chuẩn hóa/kiểm shape, không cấp quyền hoặc ký thay người review.

| Payload | Ràng buộc |
|---|---|
| batchId | UUID lowercase được giữ nguyên qua mọi lần chạy lại |
| environment / notBefore / expiresAt | Đúng môi trường, thời hạn tối đa24h và còn hiệu lực trước mỗi ghi |
| reviewerRef / changeRef | Mã tham chiếu ASCII tới review/change thực; không phải tên/email hoặc signoff tự sinh |
| source | backendSha256 và backendFiles khớp source đang chạy và report |
| target | Đúng server/database/reader/writer đã được review |
| bindings | Đúng clusterId/approvalId/epoch/envelopeDigest/credentialRef của từng target đang cấu hình |
| reportSha256 / scopeSha256 / resourceBudgetSha256 | Report nguyên byte, scope reader và budget đúng nguồn đã duyệt |
| items | 1–100 dòng được chọn từ report; mỗi dòng đúng workspaceId/clusterId/routingVersion/snapshotSha256/group; không trùng workspace |

Report bị sửa, source khác, target/role khác, group/fingerprint khác, trust không đúng hoặc chữ ký hết hạn đều bị chặn trước database. Report quá24h cần scan/review mới. Cấp lại phê duyệt để tiếp tục cùng lô phải giữ batchId và mọi request ổn định; không đổi report/binding/payload của lệnh đã nhận rồi dùng lại key. Payload khác cùng key được database từ chối409. Không tạo batch mới chỉ để vượt kết quả đã chốt hoặc kéo dài budget job.

### 8.3. Chạy và tiếp tục sau sự cố

Đọc trợ giúp không kết nối database:

```powershell
node scripts/control-setup-backfill-apply.mjs --help
```

Sau khi có đủ target/config/trust/report/review thật, mẫu gọi là:

```powershell
node scripts/control-setup-backfill-apply.mjs --config 'C:\RoomQC\ops\writer.json' --report 'C:\RoomQC\ops\dry-run.json' --manifest 'C:\RoomQC\ops\signed-batch.json' --output 'C:\RoomQC\reports\apply-001.jsonl'
```

Chỉ fixture local mới thêm `--allow-local`. Output mới được tạo exclusive và kiểm ACL **trước kết nối database**. Tồn tại output làm lượt chạy dừng, không ghi đè. CLI pin một session pool1 và lấy advisory lock727004/1; mỗi apply SQL còn kiểm backend PID và lock của session. Không reconnect tự động sau mất session hoặc chuyển giao transaction pooler. Đây là khóa vận hành giữa CLI writer, không thay khóa/CAS của0017 hoặc T10 toàn stack.

Output JSONL gồm `begin`, từng `result` đã lọc và `complete` hoặc `stopped`. Mỗi dòng được fsync. Một result chỉ chứa commandId/workspaceId/clusterId/outcome/reason/applied/time; không dump snapshot, job, owner, DSN, token hay lỗi provider. Output metadata vẫn cần quyền truy cập hạn chế. `batch_recorded`/exit0 nghĩa đã ghi nhận hết các kết quả, **không** có nghĩa tất cả workspace active; phải review từng outcome/reason, gồm stale/busy/review/unavailable/conflict/retry_later.

Nếu SIGINT/SIGTERM, công cụ ngừng trước lần ghi kế tiếp và giữ kết quả đã nhận. Nếu SIGKILL, host chết, mất response hoặc hỏng phần đuôi output: giữ file cũ, dùng **cùng signed manifest và output mới**. CLI không dùng file kết quả làm authority và không bỏ qua dòng theo file cũ; gửi lại key xác định bởi batchId+workspaceId. RPC replay kết quả đã commit; dòng chưa commit mới được xử lý tiếp qua CAS. Partial log không chứng minh database chưa commit.

Nếu expiry/source/target/config/report drift: dừng, đối soát theo journal bền vững và review lại; không sửa file giữa run hoặc tạo key mới theo suy đoán. Approval/trust/budget/config/DSN/report/source được kiểm lại trước mỗi apply, sau remote observation trước SQL. Credential file được kiểm quyền và reload mỗi request. Không giữ transaction database trong lúc network hoặc file guard chạy.

**Giới hạn:** kiểm CLI interruption không thay toàn bộ D10 worker/API crash windows. HTTP fixture không thay native Auth/PostgREST; Linux container file check không thay bộ cài/TLS/secret custody trên VPS. Durable platform recheck, public API journey, full-default/rebuild, A/B, browser/Android, restore/tải/pilot vẫn theo plan và chưa được ký bằng runbook này.
