# ADR — Vòng đời credential giám sát RoomQC

Ngày 19/10/2026. Phạm vi M06/T08 R3, implementation local tại integration.
Đây không phải phê duyệt phát hành/VPS hay kết luận hoàn tất M06. Giữ toàn bộ
27 gói / 25 bước / 70 acceptance của kế hoạch VPS/signup.

## 1. Vấn đề và ranh giới

Auth canary phải kiểm tra một phiên thật, không chỉ decode JWT. Access token
ngắn hạn; refresh token quay vòng và chỉ dùng một lần (có ngoại lệ của GoTrue).
Hai worker, crash hoặc mất phản hồi có thể làm mất token mới hoặc thu hồi phiên
nếu thử lại token cũ. Không được xử lý bằng cách bỏ probe Auth, trả `true`, cấp
service_role cho monitor hay tạo thêm tài khoản canary tự động.

V1 giữ một data cluster/host và nhiều workspace. Credential này chỉ thuộc một
canary riêng, không có khách sạn/tenant nghiệp vụ. Không phải phiên đăng nhập
của khách, owner, nhân viên hoặc platform admin. Không lưu mật khẩu canary trong
worker; installer/operator có quyền phục hồi riêng.

## 2. Quyết định

### 2.1. Tách ba lớp quyền và bốn loại credential

| Thành phần | Được giữ/dùng | Không được giữ/dùng |
|---|---|---|
| Probe service | Publishable/anon key, JWT role `roomqc_control_probe`, Auth access token của canary | Refresh token, mật khẩu, service_role, signing key |
| Session coordinator | Bundle mã hóa, KEK file riêng, Auth access/refresh của một canary | Tạo user, password login, admin/service_role fallback, đổi routing/release |
| Installer/recovery | Seed/rotate có expected revision, phục hồi cùng canary user | Tự chọn observed schema hash làm release được duyệt, đổi identity âm thầm |
| API/worker cấp phát/metrics-only | Không có quyền đọc ciphertext trong bảng mới | Không được đọc token hoặc KEK qua admin DTO/audit |

JWT probe là token có scope DB/Storage/Realtime/Functions riêng, không dùng Auth
canary JWT thay thế. Publishable key không được là service_role hoặc `sb_secret_`.
Credential installer, key ký JWT probe và password canary không vào bundle.

Directory migration `0007-probe-credentials.sql` dùng quy ước migration riêng của
directory, không phải migration Supabase. Bảng nằm trong `roomqc_control`, không
expose Data API. Không thêm `SECURITY DEFINER` hoặc quyền DDL cho worker mới.
Hai group NOLOGIN là `roomqc_control_probe_runtime` và
`roomqc_control_probe_installer`; installer có INSERT, runtime chỉ SELECT/UPDATE
các cột cần thiết, không đổi binding/user/session. Không group nào được DELETE
slot/audit. Runtime readiness từ chối superuser, installer membership, DDL và
quyền workspace/history/audit không phù hợp. R6 mới cấp membership cần thiết cho
health login riêng; không tự nâng quyền API hiện hành.

### 2.2. Mã hóa và binding

AES-256-GCM bằng `node:crypto`, nonce ngẫu nhiên 12 byte, tag 16 byte; mỗi lần ghi
có nonce mới. AAD gồm envelope version, key ID, cluster ID, credential ref, binding
hash và revision. Không chuyển ciphertext sang cluster/ref/version khác được.
Binding hash gồm endpoint public/internal, inventory ref, địa chỉ được duyệt và
fingerprint của toàn bộ release expectation (backend/frontend/migration/schema).
Đầu vào binding phải đến từ inventory/artifact tin cậy, không từ HTTP body.

KEK không nằm trong database, Docker image, frontend, log, Git hay backup database
duy nhất. Keyring đọc từ absolute secret file, tối đa bốn khóa để overlap rotation;
file có version, activeKeyId, mapping key ID → 32-byte hex. Không đưa ví dụ chứa
khóa thật vào tài liệu. Unix kiểm permission/owner và NOFOLLOW final component;
Windows cần installer thiết lập/kiểm ACL riêng — mode bit không chứng minh ACL.
Giữ key recovery ở nơi độc lập có kiểm soát; restore DB mà mất KEK không giải mã
được. JavaScript/GC không đảm bảo xóa mọi bản sao plaintext trong bộ nhớ; giới hạn
thời gian giữ/reference, cấm heap dump không kiểm soát và cô lập process/secret.

Database chỉ giữ ciphertext và metadata tối thiểu: revision/state, user/session
IDs, expiry, lease. Audit chỉ ghi revision/state/reasonCode, không token, ciphertext,
email, password, endpoint response hay user/session IDs. API hiện có có thể đọc
audit an toàn, không được SELECT bảng secret.

### 2.3. Điều phối và fencing

1. Transaction ngắn dùng cùng advisory lock `727001` với admin/health; đọc binding
   hiện hành, khóa slot và lấy thời gian database. Không giữ DB connection/lock
   qua HTTP. Operator SQL/deploy phải tuân thủ cùng contract; direct DBA write ngoài
   contract không được xem như admin API đã được bảo vệ.
2. `ready` còn đủ hạn: giải mã có kiểm integrity/metadata, cung cấp access token
   cho probe. Không cache credential xuyên cycle hoặc chỉ dựa expiry JWT để cho khỏe.
3. Gần hết hạn: tăng revision, ghi lease UUID + expiry và bundle re-bound AAD,
   audit claim atomically. Worker khác nhận `PROBE_REFRESH_BUSY`, không chờ/replay
   token cũ, không được tạo mẫu khỏe từ access token đã cache.
4. Refresh HTTP duy nhất tại đúng origin `/auth/v1/token?grant_type=refresh_token`,
   publishable key, body chỉ refresh token; TLS/DNS/redirect/response bound dùng
   safe transport hiện hành. Không retry, không password grant hoặc alternate host.
5. Phản hồi phải có user confirmed, role authenticated và user/session không đổi,
   hạn hợp lệ. Commit token pair mới + revision + audit chỉ khi lease/revision/
   binding còn khớp và lease chưa hết hạn. Kết quả chậm của worker cũ bị fence.
6. Mất phản hồi, lỗi/abort sau claim, sai identity hoặc crash: `needs_recovery`.
   Lease hết hạn **không được steal** để retry refresh; process sau chuyển sang
   recovery. Nếu DB mất ngay khi ghi failure, lease còn lại cũng dẫn đến recovery.
7. Installer seed/rotate luôn có expected revision. Recovery có thể tạo phiên mới
   của cùng canary user, không thay user. Đây là thao tác explicit, không fallback
   tự động của monitor. Khóa mới có thể re-encrypt bundle hiện hành mà không gọi Auth.
8. Sau probe, kiểm revision/binding/expiry lần nữa trước trả kết quả. R6 còn phải
   đưa cùng guard vào transaction ghi health/admission: guard `.run()` hiện tại
   không tự bảo vệ khoảng cách giữa return và một transaction khác ghi snapshot.

GoTrue cho phép reuse trong một khoảng ngắn hoặc trả token hiện hành khi dùng
parent token. Thiết kế không dựa vào ngoại lệ đó để điều phối/retry. Sau logout,
JWT có thể còn dùng được ở REST tới lúc hết hạn; Auth probe vẫn phải gọi `/user`
để xác nhận phiên thật. Refresh success không thay cho năm service probes.

### 2.4. Policy local và phần chưa quyết định cho production

| Giới hạn hiện tại | Giá trị | Ý nghĩa |
|---|---|---|
| Refresh window | 120 giây | Chủ động refresh trước expiry, theo DB clock |
| Hạn còn lại tối thiểu khi seed/probe | 30 giây | Không chạy với credential sát hạn |
| Hạn còn lại của phản hồi refresh | >90 giây | Không nhận pair gần hết hạn ngay khi vừa refresh |
| Remote refresh timeout | 5 giây | Một request, không retry |
| Claim lease | 15 giây | Bao phủ request + short commit; quá hạn fail closed |
| Transaction deadline | 5 giây mặc định, constructor giới hạn 10–10.000 ms | Đóng connection thực khi quá hạn để rollback |

Các số trên là policy local candidate trong `probeSessionPolicy`; không tự đổi
JWT expiry server production. Fixture GoTrue cố ý dùng JWT 120 giây để hai refresh
diễn ra ngay, **không** là khuyến nghị cho người dùng thật; docs Supabase khuyến
nghị expiry thường khoảng một giờ và không dưới năm phút cho ứng dụng thông thường.

R5 cần chốt TTL/issuer/rotation calendar của JWT probe, KEK overlap/retirement,
trust source, secret mount/ACL, cảnh báo trước hạn và installer/recovery CLI.
JWT probe không refresh được bằng Auth; khi hết hạn phải explicit rotate, không
ký lại trong monitor. Không coi fixture policy hoặc class API là installer đã deploy.

## 3. Kiểm chứng và giới hạn

Xem [báo cáo R3](../08-ops/roomqc-m06-session-local-2026-10-19.md) và artifact nguồn/
log. DB tests phải có least privilege, atomic audit, multi-worker race, key/context
tamper, revision fence, restart/quarantine và rotation cùng identity. Fixture
GoTrue v2.197.0 pin digest kiểm refresh/revoke/recover trên Auth thật, directory DB
tách khỏi database Auth. Prefix adapter loopback không chứng minh vendor gateway.
Không gửi email thật, không dùng khách thật, không migrate backend đang dùng.

Chưa có proof R6 snapshot transaction/runtime, full five-service pipeline với
coordinator, scheduler soak, Linux/VPS TLS/ACL/clock skew, offsite key recovery hay
pilot. R3 local lifecycle không đóng M06/T08 hoặc bất kỳ gate public nào.

## 4. Tài liệu đối chiếu

- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions)
- [Phiếu R3–R7](../08-ops/roomqc-vps-signup-execution-plan-2026-10-19.md#1932-phiếu-nhận-việc-ngay-từ-hiện-trạng--không-cần-khóa-external)
- [ADR fingerprint v2](roomqc-realtime-partition-fingerprint-v2.md)
