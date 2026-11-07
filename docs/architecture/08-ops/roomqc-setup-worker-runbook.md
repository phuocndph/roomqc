# RoomQC — vận hành worker đối soát đăng ký

Worker xử lý **dispatch đã lưu** khi API hoặc kết nối bị gián đoạn. Worker gọi `roomqc_setup.close_dispatch`: cụm trả bằng chứng committed nếu đã cấp dữ liệu, hoặc đóng dispatch để owner có thể nhập lại. Không có đường tạo tenant/hotel, mạo danh owner, phát lại thông tin khách sạn hoặc chuyển cụm.

Tài liệu cấu hình, chưa là lệnh bật production. Example budget vẫn `provisioning-worker.replicas=0`; example cấu hình có `approval:null` và phải bị từ chối. [Kế hoạch toàn bộ](roomqc-vps-signup-next-delivery-2026-10-28.md#42-store-và-worker-đối-soát-có-leasefencing) giữ dependency T10, T11/T12 và các gate phát hành.

## 1. Mã nguồn và quyền

Migration directory `server/control/migrations/0015-setup-recovery-worker.sql` nối tiếp 14 migration cũ bằng migrator riêng; không phải migration Supabase nghiệp vụ. Runtime dùng LOGIN riêng chỉ là thành viên `roomqc_control_setup_runtime`. Role này có schema USAGE, SELECT lịch sử migration và EXECUTE đúng hai hàm:

- `roomqc_control.claim_setup_recovery(integer,jsonb)` nhận một job.
- `roomqc_control.settle_setup_recovery(uuid,uuid,integer,jsonb,integer)` ghi kết quả khi lease còn hợp lệ.

Không có quyền đọc/ghi trực tiếp workspace, job, dispatch, audit, credential hoặc bảng release. Chủ hai hàm là `roomqc_control_setup_writer`, NOLOGIN/NOINHERIT và không có member; chỉ được SELECT các quan hệ cần thiết, INSERT audit/journal và UPDATE các cột kết quả. Quyền UPDATE(id) trên clusters chỉ phục vụ điều kiện PostgreSQL của SELECT FOR SHARE; hai hàm không cập nhật cluster. Runtime readiness từ chối superuser, role quản trị, membership khác, CREATE schema hoặc quyền bảng/cột/sequence/function dư.

Migration phải dùng phiên quản trị directory đủ quyền tạo role và chuyển owner; tách khỏi DSN runtime. Không chạy migrator directory lên business DB/Auth. Giữ checksum 0001–0014; không sửa lịch sử đã áp dụng hoặc xóa journal để phục hồi.

Adapter remote là `server/control/setup-recovery.mjs`, dùng credential scoped theo cụm/release. Control API vẫn có adapter riêng; worker không nạp cấu hình service-role của API.

## 2. Trạng thái và bằng chứng

| Đầu vào | Kết quả bền vững |
|---|---|
| queued/retry đã đến hạn, identity và release hợp lệ | leased, token mới, tăng attempt, ghi journal+audit trước network |
| leased hết hạn | Đánh dấu journal cũ lease_expired rồi tiếp quản; token cũ không còn ghi được |
| Thiếu dispatch, identity sai, release không còn hiệu lực, quá deadline/attempt | needs_review, mã lỗi cố định và audit; giữ lịch sử |
| RPC busy hoặc kết nối/timeout/gián đoạn | retry với backoff+jitter; không tạo closed proof |
| RPC trả closed khớp workspace/owner/cluster/routing/hash/dispatch | Dispatch closed bất biến, job waiting_owner, journal+audit cùng transaction; owner tiếp tục qua API hiện có |
| RPC trả committed khớp | Dispatch committed, workspace active đúng tenant/hotel, job succeeded, journal+audit cùng transaction |
| Credential/đích/receipt bị từ chối | needs_review, không activate hoặc tạo dispatch mới |
| Lease/token/attempt cũ, mapping/owner/URL/credential-ref/release đổi trước settle | settled=false, dữ liệu và audit không đổi |
| Lease hết hạn trong lúc ghi terminal/audit | Rollback toàn bộ kết quả; job đã claim vẫn chờ lease hết hạn để tiếp quản |

Mỗi job có deadline mặc định từ created_at +24 giờ, tối đa 8 attempt; cột max_attempts chỉ cho 1–30. Đây là giới hạn lưu trong DB; thay config worker không kéo dài job cũ. Hết lượt giữ needs_review để support xử lý bằng đường recheck được nghiệm thu sau này. Không đưa về queued bằng thao tác SQL tùy tiện.

Receipt thiếu hoặc HTTP 200 riêng không đủ activate. Claim trả identity tối thiểu và approval ID/epoch/digest; không trả email, owner JWT/session, thông tin nhập khách sạn hoặc credential. Worker chỉ lưu các trường proof được phép từ response; event có job ID, attempt, trạng thái và code cố định.

## 3. Khóa và thời hạn

Mỗi claim/settle dùng một transaction DB ngắn trong lời gọi SQL. Thứ tự: shared advisory 727001 → workspace → job → dispatch → cluster FOR SHARE. Claim workspace bằng SKIP LOCKED; không có đường khóa job trước workspace. Shared advisory cho các worker chạy đồng thời, xung đột đúng với lệnh cluster/release/withdraw dùng exclusive 727001.

Không giữ transaction/kết nối trong lúc gọi HTTP. Settle đọc lại primary sau khi lấy khóa: token, attempt, lease/deadline theo clock_timestamp, owner/cluster/routing, dispatch, API URL/credential-ref, release approval hiện hành và signing-key revocation. Lease bị chặn bởi deadline và thời điểm approval hết hạn. Các lệnh release/key withdrawal cùng advisory fence nên không thể commit xen giữa kiểm quyền và ghi.

Sau tất cả cập nhật và audit, DB kiểm wall clock lần cuối. SQLSTATE riêng chỉ dùng để rollback nhánh hết hạn; lỗi audit/constraint khác được trả lên, không bị chuyển thành success. API đồng bộ tiếp tục từ chối ghi lên job leased.

## 4. Cấu hình và secret

Entry point: `node server/control/workers/setup-runtime.mjs`; trong image control: `node workers/setup-runtime.mjs`. `--help` chỉ mô tả cấu hình. [Compose opt-in](../../../deploy/monitoring/setup-worker.compose.yml) dùng profile setup-worker; [template](../../../deploy/monitoring/setup-worker.example.json) chưa thể chạy vì thiếu approval có chữ ký.

Các file phải là đường dẫn tuyệt đối, file thường, có giới hạn kích thước; symlink bị từ chối:

| Biến | Nội dung |
|---|---|
| ROOMQC_SETUP_CONFIG_FILE | Metadata/giới hạn/targets; không có service key, mật khẩu hoặc khóa ký |
| ROOMQC_SETUP_DATABASE_URL_FILE | DSN LOGIN riêng của directory, chỉ thuộc setup_runtime |
| ROOMQC_SETUP_RELEASE_TRUST_FILE | Public trust Ed25519 đã duyệt; runtime không nhận khóa riêng |
| ROOMQC_RESOURCE_BUDGET_FILE | Một ngân sách chung đã duyệt, đúng environment/database/pool/replicas |
| targets[].credentialFile | JSON credential scoped version1 do installer ngoài runtime cấp |

Target có cluster.id/url/internalUrl/inventoryRef/credentialRef/hostId/approvedAddresses và approval envelope. Chữ ký ràng buộc environment, host, endpoint fingerprint và expected release. Runtime kiểm signature/expiry lúc nạp và trước request; directory kiểm authority hiện hành trong claim/settle. Root trust được nạp khi khởi động; đổi trust/approval metadata cần restart có kiểm soát. Credential scoped được đọc lại mỗi request và readiness để hỗ trợ rotation bằng thay file atomic.

Production/staging yêu cầu HTTPS và PostgreSQL sslmode=verify-full. Local HTTP chỉ dùng loopback khi environment=local và ROOMQC_SETUP_ALLOW_LOCAL=true. Không có chuyển hướng hoặc fallback đích khác. Credential tối đa một giờ, DB kiểm revocation thật; loader chỉ kiểm shape/binding/expiry, PostgREST kiểm chữ ký.

POSIX secret phải đọc được bởi UID/GID runtime, không world-readable hoặc group-writable; Compose dùng 1000:1000 và read-only mount. Thư mục credential chỉ chứa secret của worker này. Windows ACL còn cần xác nhận bằng installer; kiểm file-size/symlink không chứng minh ACL Windows. Không đưa bearer/DSN/password vào stdout, readyz hoặc báo cáo chung.

## 5. Ngân sách và dừng worker

Mặc định pool2, concurrency2, interval1s, HTTP timeout worker6s (adapter5s), lease60s, retry base1s, backoff tăng theo attempt, jitter 0,5–1 và trần300s. Giới hạn schema/config: pool/concurrency1–4, interval0,1–30s, request≤15s, lease≤300s, retry base≤60s, shutdown≤20s. Lease phải đủ request×2+10s; shutdown ít nhất request+1s. Một tick nhận tối đa concurrency job, các tick không chồng nhau.

`assertProvisioningResources` so pool/replica/max/reserve/otherAllocatedConnections với consumer provisioning-worker trong ngân sách chung. Budget example replicas0 khiến startup bị từ chối. Tăng replica chỉ sau T10 vendor/DSN binding/rolling overlap và review target; không mặc định số pool là số người dùng hỗ trợ được.

readiness kiểm role/history, signature và credential của tất cả target được gán. Một credential chưa sẵn sàng dừng claim của instance đó và trả readyz503; cần rotate hoặc sửa đích, không nới kiểm quyền. SQL chỉ claim các cluster đã được gán trong bindings; inventory triển khai phải bảo đảm mọi cluster cần phục hồi có worker phụ trách.

GET /livez và /readyz bind loopback8095, no-store, không có endpoint ghi. SIGTERM/SIGINT dừng claim mới, abort request, chờ hữu hạn; nếu tiến trình chết, lease còn trong DB để instance sau tiếp quản. Mất kết nối DB/claim/settle có timeout pool, không mất job. Không công khai port8095 ra Internet.

## 6. Điều kiện trước khi bật thật và rollback

Hoàn thiện disposition quyền remote, installer cấp/rotate/revoke secret và phiên maintenance owner extension, target/release thực, Windows/Linux permissions; khép T10 vendor/DSN/resource/overlap. Nghiệm thu backfill mixed-state, durable admin recheck, control signup API/session thật, browser/Android và full-default/rebuild trên candidate cuối. Sau đó mới duyệt tăng replicas và mở dispatch/signup theo gate gốc.

Rollback compatible: đóng nhận dispatch mới, dừng worker có drain, giữ mapping/receipt/terminal/journal/schema, dùng bản ứng dụng tương thích. Không drop migration0015, xóa job, đổi terminal, reset trial hoặc chạy owner provision để chữa pending. Job chưa rõ kết quả giữ support review; không cấp lại hoặc tự chuyển cluster.

## 7. Checkpoint tích hợp core, chưa bật runtime vận hành

[API/Auth/process local](roomqc-setup-api-native-local-2026-10-28.md) có168/168 controls,10 SIGKILL với API/worker process riêng, TCP mất response sau commit và owner resume. API enqueue chờ30s cho request gốc; kiểm đã đợi next_attempt_at thật, không bỏ grace để claim sớm. Worker core fixture dùng request5s/lease22s và DB clock expiry; không thay config sản xuất60s hoặc chứng minh startup config/file/DSN/resource/overlap. Native CLI/installer/credentials target/full-default/rebuild/browser/Android/VPS vẫn cần kiểm; các điều kiện mục6 giữ nguyên. Recheck18 giữ nhiều job lịch sử: rollback binary phải chọn live/newest job, không quay về bản chọn job tùy ý hoặc xóa history.
