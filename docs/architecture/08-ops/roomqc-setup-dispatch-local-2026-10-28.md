# T12 — chống cấp trùng khi mất phản hồi, checkpoint local 28/10/2026

## 1. Kết quả và phạm vi

Đã xây giao thức cấp phát và đóng một lần gửi ở database cụm nghiệp vụ.
Một lần gửi có dispatch ID, workspace, owner, routing version và hash payload
bất biến. Khi không biết lời gọi trước đã commit chưa, hệ thống có thể đối soát
receipt hoặc đóng lần gửi dưới cùng khóa với transaction cấp phát. Lời gọi đến
muộn sau khi đã đóng không thể tạo thêm tenant/hotel/trial.

Đây là **phần database của T12**, chưa phải T12 hoàn chỉnh. Control API/gateway
vẫn dùng đường provisioning trước đó; directory chưa lưu atomic dispatch + job
theo giao thức mới, worker/recheck/backfill chưa nối. Chưa cutover DB đang phục
vụ, cấp credential worker thật hoặc mở signup production.

[Artifact đã lọc của run f34efdbdb3fa](../../../artifacts/roomqc-setup-dispatch-f34efdbdb3fa-local-2026-10-28.json)
ghi terminal exit 0, 52/52 kiểm tra, bốn tình huống chờ khóa thật, 11 bảng
nghiệp vụ được đối soát và cleanup độc lập. Auth, PostgREST và PostgreSQL trong
lượt này là thật; không dùng adapter giả cho các thành phần đó.

## 2. Thay đổi đã có

- Migration `supabase/migrations/20261027234130_workspace_setup_dispatch_fences.sql`
  được tạo bằng CLI 2.122.0; journal private có RLS, không lưu JWT/password
  hoặc nội dung thông tin khách sạn.
- RPC `provision_workspace_setup_dispatch` chỉ cho service role, kiểm business
  field allowlist, hash payload, live owner/session và routing fence. Business
  transaction lỗi thì rollback toàn bộ, giữ bằng chứng lần gửi đã đóng. Kiểm
  hạn phiên lần cuối bằng wall clock sau business write, trước commit.
- RPC `close_workspace_setup_dispatch` dùng try-lock, chỉ đối soát hoặc đóng
  lần gửi; không gọi tạo tenant và không cần giả danh owner. `busy` là chưa có
  kết luận, phải tra lại; receipt khớp trả `committed`, đóng thành công trả `closed`.
- Role `roomqc_setup_recovery` NOLOGIN/NOINHERIT có grant tường minh cho close
  và read-receipt. Các RPC provision và implementation đăng ký liên quan bị từ chối.
  Authenticator được phép chuyển sang role để dùng qua PostgREST.
- Entry provisioning cũ giữ tương thích workspace chưa áp dụng giao thức.
  Workspace đã có dispatch journal bị chặn đường cũ để không vượt qua fence.
- Harness `scripts/test-control-backend-sandbox.mjs --diagnostic setup-dispatch`
  chạy sau khi replay đủ schema. Script kiểm thực tế là
  `scripts/control-backend-setup-dispatch-checks.mjs`.

`closed`/`committed` ở đây là kết quả giao thức RPC, không phải enum workspace
mới thay cho state machine directory. Chưa được bật nút gửi lại chỉ vì receipt
đang thiếu; phải có closure proof đúng định danh và version.

## 3. Bằng chứng kiểm thử

Lệnh chạy lại từ integration, dùng native CLI advisor đã pin 2.121.0:

```powershell
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-dispatch --advisors-cli <duong-dan-cli-2.121.0>
```

Harness dựng stack thử trên network internal, không publish port hoặc gọi
provider ngoài; không dùng database đang phục vụ. Những dữ liệu fixture và
secret chỉ ở vùng private, không đưa vào artifact bàn giao.

| Nhóm kiểm | Kết quả đã quan sát |
|---|---|
| Quyền | Browser không gọi hai RPC mới; recovery không provision; token recovery hết hạn bị từ chối |
| Grant trực tiếp | Kiểm 229 relation trong public/private/auth/storage: 0 grant bảng, 0 grant cột cho recovery role |
| Cấp phát và replay | Auth owner/session thật; 20 replay đồng thời cùng tenant/hotel; trial/business/outbox không đổi |
| Identity và routing | Thay owner/workspace/hash/version, dùng payload khác cùng dispatch hoặc routing cũ đều bị chặn |
| Close trước request muộn | Close thắng khi provision chờ Auth lock; request muộn và entry cũ không tạo business effects |
| Provision đang giữ khóa | Close trả busy; commit xong phục hồi được từ receipt thật, không tạo lần nữa |
| Transaction bị terminate | PostgreSQL backend thật bị dừng giữa business write; rollback 11 bảng, retry cũ vẫn đóng |
| Phiên hết hạn khi đang ghi | DB clock vượt hạn trong lúc hotel insert chờ khóa; final guard rollback business/trial/outbox |
| Fault sau business write | Trigger fixture làm receipt insert lỗi; rollback toàn transaction nghiệp vụ; dispatch mới hợp lệ phục hồi được |
| Kết thúc | 52/52 controls, 4/4 barrier quan sát; source/schema khớp; Docker 0 container/volume/network theo label run |

Backend binding gồm 232 file, SHA256
`2514b0f8bd64fe2c2d87cec6909cc5383ac1b770566122696f6625106c5af882`.
Manifest **578 migration nghiệp vụ được hash riêng** vì chúng không nằm trong
backend source binding. Migration-set hash
`ad9db83246e8ab2551bd83a5447aff04e60d630627449bbe778a68354fe34fc3`.
Schema trước và sau fault fixture cùng hash
`3068d8b976516508199df929b24f0e04399f362a1a99a6bfebe0f87f92e1bb11`.

Advisor: 760 findings gồm 41 RLS-no-policy INFO, 7 unindexed-FK INFO,
513 unused-index INFO, 199 permissive-policy WARN; không có ERROR. Có 16
policy-overlap warnings nhắc recovery role. Kiểm grant trực tiếp ở trên chứng
minh role không có quyền bảng/cột tại source này; **chưa chứng minh toàn bộ
PUBLIC SECURITY DEFINER RPC đều an toàn cho role mới**. Phải rà mặt quyền gọi
gián tiếp trước khi cấp credential worker. Chưa đóng các warnings hoặc bỏ index
dựa trên thống kê của fixture.

Lịch sử được giữ trong artifact: `bd194f3ea727` exit 1 do harness chạy trước
migrations, đã sửa thứ tự; `3f4e2e4c2342` 47/47 trước expiry fence cuối;
`b864b4d5a96e` 50/50 trước scan grant mở rộng. Cả ba đã cleanup. Chỉ run
`f34efdbdb3fa` là proof 52/52 của checkpoint này; không cộng số giữa các run.

## 4. Cutover, rollback và nghiệm thu

Trước áp dụng giao thức, phải dừng nhận dispatch mới và drain lời gọi RPC cũ
đang bay. Triển khai migration → directory/API/worker tương thích → fault tests
trên staging → mới mở đường mới theo feature flag. Code local này chưa thực hiện
cutover đó. Không reset DB hoặc xóa receipt để chuyển giao thức.

Rollback ứng dụng phải giữ journal/tombstone và chặn entry cũ trên workspace đã
áp dụng. Không drop migration hay mở lại dispatch đã đóng. Workspace chưa rõ
commit giữ chờ đối soát; lỗi cần forward fix và đối soát đúng cụm/version.

70 ca sản phẩm vẫn `not_run`, 122 mục release vẫn `unverified`; reviewer,
signoff và gate không đổi. Diagnostic chưa nằm trong default full suite;
không dùng nó làm independent-rebuild reference. Chưa chứng minh Linux/TLS,
provider/inbox, offsite restore, browser/Android, hai backend, tải/soak hoặc pilot.

## 5. Đầu việc nhận tiếp

Đây là thứ tự làm trong T12; dependency T11/T10 và các gate toàn plan vẫn giữ.
BE/FE/OPS/QA là vai trò, chưa phải người đã nhận hoặc ký.

| Bước / vai trò | File và đầu vào | Việc làm, đầu ra bàn giao | Điều kiện nhận |
|---|---|---|---|
| 1. Directory trước network / BE → QA | `store.mjs`, directory migration kế tiếp `0014`, jobs/attempts hiện có | Một transaction kiểm owner/binding/admission/version, ghi immutable dispatch identity + job + audit rồi mới cho POST gọi remote. Payload dùng chính byte JSON đã hash; không lưu JWT/password. Một live job/dispatch/workspace; giữ checksum migration cũ | Hai POST/hai API tranh cùng workspace chỉ một dispatch; rollback directory thì 0 remote call; restart sau commit còn job; payload khác không ghi đè |
| 2. Gateway và POST / BE → QA | `cluster.mjs`, `app.mjs`, DTO/error và RPC của checkpoint này | Nối fenced provision và close/read adapters riêng; validate receipt/envelope; response timeout chuyển tra cùng dispatch, không sinh key mới. Chặn client gửi internal metadata | Thực tế Auth→control→RPC→business receipt→directory cùng ID; mất response sau commit vẫn một tenant/trial; stale owner/routing không activate |
| 3. Worker receipt-only / BE+OPS → QA | New provisioning worker/config/runtime, resource budget, role/RPC ACL inventory | Claim/lease/fencing bằng DB clock, batch/concurrency/attempt/backoff/deadline hữu hạn. busy/unavailable→retry; closed proof→waiting_owner; matching committed→atomic activate+settle. Rà mọi PUBLIC/SECURITY DEFINER callable và secret issuance/expiry/rotation/revocation trước enable | Hai worker và expired/stale lease không ghi kết quả; kill trước/sau claim/remote/receipt/activate có count proof; không replay business mutation hoặc cần JWT owner |
| 4. Backfill và recheck / BE+FE → QA | `support.mjs`, `admin.mjs`, contract, typed client, trang Đăng ký mới | Dry-run legacy provisioning: counts/classification/no writes; apply theo version. Admin recheck enqueue idempotent với key/reason/authority, trả job ID; UI theo dõi completion | Missing receipt legacy không thành retry an toàn; không có nút tạo tenant; replay cùng key một job, payload khác conflict, tenant-summary unavailable khác missing |
| 5. Runtime và cutover / OPS+BE → QA | Compose/secrets/resource-runtime và T10.b inventory | Khai báo process thực, pool/replica/rolling overlap trong cùng budget; hiện provisioning-worker replicas=0, chưa tự bật. Credential qua secret file và quyền tối thiểu; drain protocol cũ rồi cutover có rollback | Startup thiếu budget/secret hoặc vượt ngân sách bị chặn; restart giữ data/jobs; không token ở log/browser; Linux staging mới ký phần runtime |
| 6. Tích hợp, demo, bàn giao / BE+FE+QA | T11 setup-status/onboarding, T12 APIs/workers và 70-case worksheet | Demo signup→verify→hotel→timeout→resume→ready cùng tracing chain. Thêm stage vào full-default suite; khi freeze candidate chạy full + independent rebuild, bảo toàn lịch sử lỗi | D07–D11/A07 đúng required environments; không stale activation, không kéo dài trial; đủ terminal/hash/effects/cleanup/reviewer trước đề nghị nghiệm thu |

T10.b vendor/consumer DSN/worker còn mở, T11 intent/resume và T13 abuse/email
tiếp tục theo [plan tổng](roomqc-vps-signup-plan-current-2026-10-26.md).
VPS/DNS/TLS, provider, backup/key ngoài host và người trực còn ở backlog đầu
vào theo chỉ dẫn của người dùng. Chuẩn bị mã nguồn và kiểm thử độc lập tiếp tục;
không coi thiếu credential là bằng chứng phần sản phẩm đã hoàn thành.
