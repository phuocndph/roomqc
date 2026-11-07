# Vòng đời khóa Tổng quan doanh nghiệp

Trạng thái: đã có SQL quản lý khóa, signer, công bố tệp, CLI issuer và daemon luân chuyển. [Tích hợp local76/76 và snapshot runtime](roomqc-summary-runtime-profile-local-2026-10-29.md) kiểm CLI/daemon/reader UID1000, signed/live directory test authority, shared/separate caller contention, mất phản hồi/SIGKILL, reload read-only và daemon thường trực ready/drift/recovery/shutdown. Image/daemon offline9/9 kiểm snapshot đã nạp; named volumes khác live Compose bind profile. Chưa Control API/browser E2E, inventory/release và VPS. Không bật production dựa trên unit hoặc nội dung runbook. [Checkpoint73/73](roomqc-summary-contention-mount-local-2026-10-29.md) và [62/62 UID10001](roomqc-summary-credential-lifecycle-local-2026-10-29.md) giữ lịch sử nguồn riêng.

## Ranh giới quyền

- Runtime chỉ nhận tệp bearer `roomqc_tenant_summary` và publishable key. Nó không nhận DSN, signing key hoặc quyền bảo trì.
- `roomqc_summary_credential_owner` là NOLOGIN/NOINHERIT, chủ của các hàm bảo trì; không cấp membership cho tài khoản chạy ứng dụng.
- Login installer riêng chỉ được bind/revoke/receipt/status/preflight. Login issuer riêng được issue/rotate/receipt/status/preflight; không bind hoặc revoke.
- SQL từ chối login có quyền nâng cao, quyền runtime hoặc nhiều capability memberships. Hai loại login bảo trì phải có connection limit 1.
- Schema `roomqc_summary_admin` không được thêm vào PostgREST. Chỉ schema runtime `roomqc_summary` được công khai qua API và vẫn yêu cầu JWT đúng capability.
- Ba bảng quản lý/lệnh/audit mới bật RLS; hai bảng authority/credential chỉ thêm policy cho chủ hàm NOLOGIN. Browser, service_role và runtime không có quyền trực tiếp.

## Migration và bản phát hành

Giữ nguyên hai migration đọc tổng quan trước đó. Migration `20261029144213_tenant_summary_credential_commands.sql` cần phiên bảo trì được duyệt, không nâng quyền tài khoản nghiệp vụ để chạy nó. Migration không tạo LOGIN/password và không tự duyệt release.

Catalog vẫn format v3; namespace quản trị và ba role mới được đưa vào fingerprint. Bản phát hành phải có schema hash/migration set/artifact được duyệt mới. Không lấy hash quan sát được để tự cấp approval.

## Công cụ đã có

```text
node scripts/control-summary-credential.mjs --config-file <private absolute JSON> --command-file <private absolute JSON>
node scripts/control-summary-credential-rotation.mjs --config-file <private absolute JSON> [--once]
```

Các lệnh issuer là `check`, `bind`, `issue`, `publish`, `revoke`; khả năng thực tế còn phụ thuộc loại login và consumer cấu hình. `--allow-local` chỉ cho thử nghiệm ngoài production. Linux là yêu cầu cho publisher/daemon triển khai.

Config issuer có version/environment, business và directory DSN file cùng expected physical identity; resource budget và hash; businessDatabaseId; consumerId; replicas; releaseTrustFile; target cluster/expected release/approval; publisher signer/publishableKeyFile/outputFile. Các đầu vào đều ở tệp riêng có kiểm ACL; không nhận secret qua command line.

Consumer phải là `summary-credential-installer`, `summary-credential-issuer` hoặc `summary-credential-rotation`. Mỗi process có một connection business và một connection directory, được khai báo riêng trong ngân sách; không mượn migration reserve. Directory chỉ dùng login quan sát với capability đọc `roomqc_control_setup_credential_observer` hiện có, không thêm quyền ghi directory.

Issuer đối chiếu signed approval và quyền hiện hành trong directory, mapping URL/credential ref, lịch sử migration, database system identifier/OID/role, role graph, schema và release manifest trước/sau các bước có effect. Không giữ transaction directory trong lúc đợi network RPC. Các session có deadline hữu hạn và bị đóng sau mỗi lượt.

## Cấp và công bố

1. Operator bind authority bằng expected version và binding cũ. Đổi binding thu hồi các khóa cũ, không sửa doanh nghiệp/khách sạn.
2. Issue ghi ID và thời gian từ DB, command và audit trong một transaction. Cùng caller/key/body trả cùng receipt; payload/caller khác không được chiếm key.
3. Publisher đọc lại receipt và trạng thái hiện hành qua đúng login, giữ mutex riêng `727013`, kiểm authority tại các fence rồi ký đúng claim trong receipt.
4. Intent và stage là tệp riêng, có kiểm inode/ACL và sync; chỉ thay output vắng mặt hoặc cùng ID/predecessor được phép. Rename và sync thư mục hoàn tất trước khi kiểm RPC thật bằng tệp mới.
5. Mất phản hồi hoặc lỗi tệp: giữ nguyên caller/key/body; tra receipt và chạy lại publish. Không đoán transaction đã rollback hoặc tạo key mới để bỏ qua kết quả chưa biết.

Signing hỗ trợ HS256 tối thiểu 32 byte, RSA tối thiểu 2048 bit hoặc P-256; fingerprint khóa được pin. Runtime không được mount signer. Token có TTL 120–3600 giây và không được gia hạn bằng cách sửa receipt cũ.

## Luân chuyển định kỳ

Daemon chỉ đổi head còn hiệu lực; thời gian quan sát lấy từ DB và cộng thời gian monotonic đã trôi. Chưa bind/thiếu khóa/hết hạn/bị thu hồi phải dừng để operator xử lý. Nó không tự bootstrap hoặc hồi sinh quyền đã bị thu hồi.

Trước dispatch phải ghi bền command vào journal riêng. Restart đọc pending trước khi tạo lệnh mới. Lỗi transport/publication giữ key cũ; chỉ hai từ chối CAS đã xác định mới được ghi superseded. Head mới và cutoff khóa trước được ghi cùng transaction; overlap hữu hạn 10–60 giây. Runtime kiểm cutoff trước và sau lần đọc.

Compose profile riêng: `deploy/monitoring/summary-rotation.compose.yml`; policy mẫu: `deploy/monitoring/summary-rotation.example.json`. Process nonroot, root filesystem read-only, không capability bổ sung. Input private read-only; journal và output là hai thư mục writable riêng. Control API chỉ mount output directory read-only để thấy atomic rename. Profile chưa được tự bật hoặc cấu hình vào database đang phục vụ.

## Chuẩn bị cấu hình triển khai theo từng cụm

Mẫu `deploy/monitoring/summary-installer.template.json` cố ý chưa hợp lệ. Không có giá trị identity/hash/approval mặc định nào được coi là đã duyệt. Điền từ inventory, manifest và chữ ký release được kiểm độc lập; không lấy hash vừa quan sát để tự phê duyệt. JSON cuối cùng giữ riêng ngoài Git. DSN và signer ở các tệp riêng, không gửi trong chat hoặc tham số dòng lệnh.

| Đường dẫn trong container | Nguồn và quyền cần chuẩn bị |
|---|---|
| `/etc/roomqc/rotation.json` | Policy read-only, khớp instanceId/replica đã khai báo |
| `/etc/roomqc/private` | Thư mục riêng UID1000, mode0700; config/DSN/signer/publishable key/trust/budget mode0600; rotator mount read-only; không mount vào Control API |
| `/var/lib/roomqc/summary-rotation-journal` | Thư mục bền vững riêng UID1000, mode0700; mỗi instance có namespace riêng; không dùng chung với output |
| `/run/roomqc/summary` | Thư mục output UID1000, mode0700; tệp mode0600; rotator ghi, Control API chỉ đọc cả thư mục |

Hai container cùng UID1000 để đọc tệp riêng tư; ranh giới bí mật nằm ở các mount riêng, không dựa vào việc dùng hai UID khác nhau. Host phải bảo vệ thư mục private; người có quyền quản trị Docker vẫn có thể đọc secret. Không gắn tệp output đơn lẻ vì atomic rename sẽ thay inode.

1. Chuẩn bị schema/migration bằng maintenance role và đăng ký release được duyệt. Tạo login installer, issuer và directory observer riêng, mỗi login connection limit1, đúng một capability membership. Không cho login ứng dụng membership vào role bảo trì.
2. Thêm `summary-credential-installer`, `summary-credential-issuer`, `summary-credential-rotation` vào cả database business và directory trong budget. Mỗi process dùng một connection mỗi database; replica phải tính cả hai process nếu dự kiến chạy đồng thời. Không lấy phần dự phòng migration để che thiếu ngân sách. Có thể giữ replicas1 cho CLI ít chạy để dành sẵn trần kết nối được phép; không đổi budget mỗi lần chạy lệnh. Nếu đổi budget hoặc replica, triển khai revision/hash mới có phối hợp cho các consumer liên quan; tệp đang được pin mà đổi giữa lượt sẽ bị từ chối.
3. Với runner bảo trì Linux có Node22 và source snapshot được duyệt, tạo cấu hình installer (`publisher:null`) và issuer riêng. Các đường dẫn tuyệt đối trong JSON phải tồn tại trên runner đó. CLI host không có sẵn trong worker image; chỉ daemon `workers/summary-rotation-runtime.mjs` được chạy trực tiếp trong image.
4. Dùng installer bind với expected version/binding đang có; dùng issuer issue để công bố head đầu tiên. Lưu command vào tệp private trước dispatch. Trạng thái `OUTCOME_UNKNOWN` phải tra/replay nguyên command. Không bật daemon để tự tạo head đầu tiên hoặc hồi sinh head đã hết hạn/bị thu hồi.
5. Thêm `tenantSummaryCredentialFile:"/run/roomqc/summary/summary.json"` vào đúng inventory entry. Overlay `deploy/monitoring/summary-consumer.compose.yml` bổ sung mount read-only cho service `roomqc-control`; source host của mount phải trùng `ROOMQC_SUMMARY_CREDENTIALS_DIR` ở rotator. Overlay chưa tự bật.
6. Render và review Compose với biến đã điền, xác nhận image digest, UID, mount, network, budget và quyền tệp trước khi khởi chạy profile `summary-rotation`. CLI/daemon đối chiếu release/identity trước các bước có effect; render Compose không thay kiểm runtime.
7. Sau khi bật trên staging, xác nhận API/UI đọc đúng tenant và cùng Control process nhận khóa mới. Thử revoke, mất file, DB/REST không liên lạc, restart và dừng có kiểm soát; lưu actual theo đúng target. Các bài local dưới đây không cấp quyền mở production.

Mẫu rotation chỉ mô tả một instance. Muốn chạy hai instance thường trực phải dùng hai cặp login issuer/observer riêng, tính replicas2, namespace journal riêng và kiểm đúng cấu hình triển khai; không tăng connection limit của một login để né xung đột. Shared journal/same caller được kiểm cho khả năng phục hồi và tranh chấp khi overlap tiến trình.

Daemon thường trực có `/livez` và `/readyz` ở `127.0.0.1:8097`; `--once` không giữ cổng. Status chỉ trả snapshot ngân sách hai DB/hash cấu hình và alive/ready, không trả private input hoặc lỗi SQL. Cấu hình và budget đang mount phải khớp snapshot process trước khi nhận runtime inventory; xem [runbook runtime](roomqc-resource-deployment-runtime-runbook.md). Readiness là kết quả chu kỳ gần nhất, không chứng nhận toàn hành trình đăng ký hoặc DB identity của mọi consumer.

## Những phần phải kiểm tiếp

- Đã có proof local replay migration bằng maintenance role và login nghiệp vụ bị từ chối; actual SQL → signer → tệp → Kong/PostgREST, replay/revoke/expiry/cutoff; business rows không đổi và cleanup riêng.
- Đã có CLI/daemon và reader UID1000/CapEff0/read-only source, signed/live directory approval bằng test authority, shared/separate caller contention, mất phản hồi/restart sau SIGKILL, atomic rename và lỗi/khôi phục/revoke không restart. Còn các điểm dừng khác và image/profile/ACL live trên staging; không chạy lại các biến thể đã đủ proof trước khi khép các nhóm mục tiêu khác.
- Config/inventory và release artifact được duyệt; browser → Control → cụm; VPS staging.

Chưa có signoff BG05/BG07 hoặc sản phẩm. Các bằng chứng của cơ chế setup giữ nguồn/phạm vi lịch sử riêng, không tự chuyển thành bằng chứng cho summary.
