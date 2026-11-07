# Chạy nền tảng control v3 local

**Delta hiện hành T10.b — đích PostgreSQL:** [checker chỉ đọc](roomqc-resource-database-local-2026-10-28.md) đã kiểm identity/settings của đích attestor và cộng ngân sách nhiều database trên cùng lineage PostgreSQL. Directory: 536 tổng / 534 pass / 0 fail / 2 skip; Linux: 62/62, source 225 file ổn định; có role denial, stop/restart/recovery thật và cleanup Docker 0. [Runbook](roomqc-resource-database-runbook.md) giữ schema/quyền/lệnh/giới hạn. Chưa bind DSN native/vendor tới các đích này; nhận tiếp vendor/pooler → consumer DSN binding → remaining worker live → T10.c–f. T10/VPS/capacity chưa nghiệm thu; 70 not_run / 122 unverified và reviewer/signoff/gate giữ nguyên. Các delta dưới là checkpoint đúng source của chúng.

> **Runtime hiện hành28/10:** [bộ kiểm container](roomqc-resource-deployment-runtime-runbook.md) đã nối list/inspect/image và closed loopback probe; [live proof API](roomqc-resource-deployment-runtime-local-2026-10-28.md) có drift/restart/recovery trên hai project riêng. Không dùng native snapshot thay DB readiness, whole-stack/VPS/capacity hoặc quyền phát hành.

> **Preflight plan hiện hành28/10:** [runbook deployment](roomqc-resource-deployment-preflight-runbook.md) bổ sung kiểm native project/replica/hash/pool trên Compose đã resolve và projection đã nạp trên liveness. Đây chưa là kiểm container/DB/VPS thực; không dùng exit0 thay quyền triển khai.

> **Startup hiện hành28/10:** [shared budget](roomqc-control-shared-resource-runtime-local-2026-10-28.md)
> là bắt buộc trên native entrypoint staging/production. Local development vẫn có đường
> không file; không dùng nó để chứng minh production enforcement. Compose production
> cần truyền env file cho CLI để nội suy mount readonly; không set local để vượt guard.

> Checkpoint T06 managed-runtime22/10: [report](roomqc-t06-managed-runtime-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-managed-runtime-local-2026-10-22.json).
> Source765/546 +8 directory migrations,10e89a2…; CLI đã nối managed probes,
> hai role/pool riêng, configv2 có tổng budget và bounded cleanup.
> Full control265/265,0 fail/skip; lint/syntax8 đạt, compose merge đạt; cleanup0.
> Real-directory proof dùng collector/metrics fixture, chưa thay timed five-vendor
> pipeline hoặc đóng T06/T08. Không deploy, không mở gate/đổi122 entries.


> Source checkpoint22/10: [T06 health proof](roomqc-t06-health-proof-local-2026-10-22.md).
> Directory0008 và API/worker mới chỉ ở integration source, chưa deploy.
> Khi rollout có quyền: migrate trước, restart candidate tương thích; snapshot
> thiếu proof giữ unknown/blocked, cần collection mới +warmup/operator review.
> Không backfill proof từ boolean, không mở gate hoặc đổi routing khách cũ.

Đây là stack điều phối riêng; không phải bộ cài Supabase/VPS production.
Runtime đang đặt tại worktree `roomqc-worktrees/integration`. Chạy các lệnh bên
dưới từ thư mục đó; không khởi tạo bộ secret khác trong checkout chính để dùng
chung cùng Docker project/volume.

## Chuẩn bị và chạy

Yêu cầu Docker đang chạy, Node >=22 và dependency control (`npm ci --prefix
server/control --omit=dev --ignore-scripts`). Supabase local đã chạy tại 54321,
source chính có CLI và VAPID public key hợp lệ. Port 8091 phải trống hoặc do đúng
stack control này sở hữu.

```powershell
npm run control:local -- preflight
npm run control:local -- prepare --source "../../room-weave-pro-main"
npm run control:local -- up
npm run control:local -- verify
```

Prepare sinh secret một lần, ghi `.local/control/state.local`, `db.env.local`,
`api.env.local`. Rerun giữ HMAC/password; không sinh mới để tránh mất email affinity
hoặc DB không đăng nhập được. `up` build API, chờ DB, chạy migration bằng job có
credential riêng, tạo login runtime, rồi khởi động API. Mọi kiểm tra phải đạt;
diagnostic subprocess không được in nguyên văn vì có thể chứa credential.

Database directory chỉ nằm network nội bộ và volume riêng. Stack có restart
unless-stopped, healthcheck và log rotation. Worker/metrics runtime được bổ sung
ở các gói sau, chưa coi các role sẵn có là worker đang chạy.

## Proxy vào ứng dụng chính

Từ checkout chính đang chạy 8082:

```powershell
docker compose --env-file .env -f docker-compose.roomqc.yml -f docker-compose.roomqc-control.local.yml up -d --no-build --wait roomqc
```

Override chỉ mount nginx config và nối network access. Không rebuild JS hoặc bật
frontend directory/signup. Proxy trỏ Docker DNS, nên API được recreate vẫn resolve
lại; không cố định IP container. Các route `/api/` khác tiếp tục trả 503 rõ ràng.

Kiểm tra `http://127.0.0.1:8082/api/control/readyz`: 200 JSON và no-store.
Đăng ký mới trả SIGNUP_CLOSED. Dùng đúng origin 127.0.0.1:8082 cho local control;
origin localhost là origin khác. Không thêm CORS wildcard để chữa nhầm origin.

## Kiểm thử và khởi động lại

```powershell
npm run test:control:db
npm run test:control:local
npm run test:customer-journey:local
npm run control:local -- restart-check
```

`test:control:db` tạo container DB riêng, cổng ngẫu nhiên loopback và tmpfs; kiểm
tra label trước dọn đúng container. `test:control:local` nay dựng backend biệt lập,
áp toàn bộ migration hiện hành rồi kiểm tra Auth, cấp phát, giới hạn và hỗ trợ.
Không còn tìm Supabase đang phục vụ qua CLI hoặc đổi `directory_required` của nó.
`test:customer-journey:local` kiểm tra thêm signup/email OTP, tạo phòng, mời nhân
viên và cách ly REST/Storage/Realtime. Hai bài tích hợp không nhận URL đích; chỉ
mở signup trong fixture nội bộ, không dùng nhà cung cấp email thật hoặc cổng host.

Restart-check chỉ nhắm stack có ownership label: chụp hash history/registry/
workspace/attempts, dừng directory, xác minh livez=200/readyz=503, khởi động DB và
API lại, đối chiếu hash và signup closed. Nó có thời gian gián đoạn control ngắn,
chỉ dùng khi local đang đóng signup; không đem lệnh này chạy production.

## Khóa và sự cố

- `.local/control/operation.lock.local` ghi PID operation. Khi bị ngắt, kiểm tra
  `Get-Process -Id <PID>` trước. Nếu process còn sống, chờ/đọc status; không tạo
  lượt chạy khác. PID chết thì xóa đúng lock file này và chạy lại `up`.
- Checksum khác: dừng, đối chiếu source/release đã áp dụng. Không sửa history để
  làm xanh health, không chạy schema.sql cũ. Migration mới sửa lỗi bằng số tiếp theo.
- Schema/registry/grants thiếu: livez có thể vẫn xanh nhưng readyz=503; không mở signup.
- DB lỗi: giữ volume, xem log giới hạn của service. Không dump env/config/secret vào chat.
- Secret file thất lạc: khôi phục bản sao được bảo vệ; không tự tạo password/HMAC
  khác để thử với volume cũ. Chưa có backup ngoài máy, nên chưa đủ gate production.

## Dừng và rollback

```powershell
npm run control:local -- stop
```

Giữ nguyên volume và secret; không có lệnh xóa volume trong helper. Muốn bỏ proxy,
recreate frontend bằng compose cơ sở `docker-compose.roomqc.yml` với `--no-build`.
Không rollback database bằng binary cũ hoặc xóa mapping. Sau rollback kiểm tra
8082 login/health và các dịch vụ ngoài RoomQC vẫn chạy.

## Xác minh release của cụm bằng canary

Code integration nhận biến `ROOMQC_CONTROL_RELEASE_VALIDATION_FILE`: đường dẫn
tuyệt đối tới file JSON riêng do installer/operator quản lý. Đây là nguồn
approval độc lập với runtime đang đo; không tự lấy schema hash trả về để điền
thành expected. Lượt này chưa mount file, đổi env hoặc restart stack đang phục vụ.
Thêm env path mà không mount đúng file trong container sẽ không hoạt động.

File có `entries` (1–100). Catalog legacy `version:2` chỉ dùng cho local, mỗi entry
có đúng `inventoryRef`, `approval`, `credential`. Staging/production bắt buộc
`version:3`, mỗi entry có thêm `migrationReceipt`; loader từ chối catalog thiếu
receipt hoặc receipt chưa hoàn tất:

- `inventoryRef`: ID entry đã duyệt trong server inventory.
- `approval`: envelope Ed25519 được duyệt ngoài runtime; `payload.expected` chứa
  đúng clusterId/releaseId/artifactDigest/frontendArtifactDigest/
  migrationSetHash/schemaManifestHash từ release packet được review. Không đặt
  `expected` trực tiếp trên entry.
- `credential`: chỉ publishableKey và token canary role roomqc_control_probe.
  Không có service key, signing key, owner token hoặc password. Token phải còn
  hơn30 giây; chữ ký vẫn do PostgREST thật kiểm, không tin việc decode JWT.
- `migrationReceipt`: `{version:1,status:"complete",migrationSetSha256,totalCount,
  appliedCount,pending:[],complete:true}`. `migrationSetSha256` phải trùng
  `expected.migrationSetHash` và `appliedCount` phải bằng `totalCount`. Có thể tạo
  receipt read-only bằng `npm run control:business-migrate -- --mode receipt ...`.

Không đặt giá trị secret trong env/chat/command arguments hoặc commit file.
Chỉ env chứa path. Catalog phải là regular file không symlink, tối đa256KiB;
trust file tối đa64KiB;
Linux cần mode/owner/group tối thiểu theo runtime identity, không world readable
hoặc group/world writable. Windows ACL phải do installer thiết lập, không suy từ
mode. Loader giữ catalog bất biến trong bộ nhớ và không tự hot reload.

Không cấu hình file vẫn chạy được các route control cũ, nhưng lệnh validate bị
chặn RELEASE_MANIFEST_REQUIRED; không fallback service_role. File đã cấu hình
nhưng sai/hết hạn làm startup fail-closed với lỗi đã lọc. Khi rotate/thu hồi,
đóng nhận mới, triển khai catalog qua kênh secret và restart/redeploy đúng target
theo quyền được duyệt. Cơ chế issuer/rollout đa replica và live revocation của
toàn health pipeline còn cần hoàn thiện, không coi file reload là đã giải quyết.

Validate gọi nonce-bound manifest bằng canary ở origin trong inventory, bên
ngoài DB transaction. Khi ghi, recheck fingerprint target/approval/credential
và tuổi bằng chứng trong transaction lệnh; nếu lệch thì không lưu event/receipt/
validation một phần. Hợp lệ vẫn manual-close/operator-reopen-required.
Nó không xác nhận năm dịch vụ hoạt động hoặc cho phép tự mở admission. Receipt migration
chỉ là một gate bắt buộc của release; vẫn cần backup, health, DNS/TLS, email và nghiệm thu
production độc lập.
