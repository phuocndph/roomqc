# Bộ cài hệ thống quản trị tập trung

Nguồn triển khai nằm trong worktree `integration`. Đây là bộ ghép dịch vụ quản
trị và công cụ khởi tạo directory chuyên biệt; chưa thay quy trình triển khai
tenant, chưa tự tạo VPS hoặc cấp quyền nhận khách thật.

## Cài theo giai đoạn khi cần cấp credential cho worker

Descriptor và budget phải khai báo đầy đủ worker dự định sử dụng ngay từ lúc
lập plan. Không sửa các file cấu hình bất biến hoặc thêm worker sau khi prepare.
Thư mục `credentialsDirectory` được tạo riêng cho runtime; không đặt signer,
DSN quản trị hoặc cấu hình installer vào đó.

```text
node scripts/roomqc-management-install.mjs --config-file ABSOLUTE_PRIVATE_JSON --mode plan
node scripts/roomqc-management-install.mjs --config-file ABSOLUTE_PRIVATE_JSON --mode prepare
```

`prepare` chỉ dùng cho bản cài mới chưa có root sở hữu: tạo TLS, database
directory, migration và các LOGIN/DSN theo capability đã khai báo. Chỉ container
directory được chạy; API, frontend và các worker chưa khởi động. Biên nhận phải
có `directoryPrepared:true`, `runtimeStarted:false`, `deploymentReady:false`.
Preflight vẫn tính đủ tài nguyên cho toàn bundle; bước này không hạ gate tài
nguyên và không mở đăng ký. Không chạy prepare lần hai trên root đã tồn tại.

Sau đó dùng công cụ credential sản phẩm đã có (`control-setup-credential.mjs`)
để kiểm đích/release, cấp credential giới hạn quyền và xuất vào đúng thư mục
runtime. Việc cấp credential vẫn cần cấu hình business/directory riêng, signer
đúng backend và phê duyệt release thật. Prepare không tạo hoặc giả lập chúng.
Health worker cần probe/metrics sẵn sàng trước bước tiếp theo.

```text
node scripts/roomqc-management-install.mjs --config-file ABSOLUTE_PRIVATE_JSON --mode resume
node scripts/roomqc-management-install.mjs --config-file ABSOLUTE_PRIVATE_JSON --mode verify
```

`resume` giữ nguyên plan/hash, khởi động toàn bộ dịch vụ đã khai báo và yêu cầu
tất cả healthy. Thiếu/sai credential vẫn thất bại; không bỏ worker lỗi để báo
thành công. `verify` kiểm toàn bộ runtime và xác nhận signup tiếp tục đóng.
Luồng `initialize` cũ vẫn dùng được nếu mọi dependency đã sẵn sàng trước khi cài.

## Hai lệnh sản phẩm

1. `npm run management:bootstrap -- --config-file /ABSOLUTE/private/bootstrap.json --initialize`
   chỉ dùng cho directory PostgreSQL16 mới, rỗng, đúng database OID/system ID
   và ngân sách kết nối đã duyệt. Chạy bằng tài khoản vận hành riêng có DSN quản
   trị, CA công khai và thư mục credentials 0700; không chạy trong API.
2. `npm run management:bundle -- --config-file /ABSOLUTE/private/management.json --output-directory /ABSOLUTE/private/output`
   tạo `management.compose.json`. Bundle chỉ chứa đường dẫn cấu hình/secret;
   không chứa mật khẩu, service key, DSN hoặc private key.

Trong image control, gọi tương ứng `node management-bootstrap-cli.mjs` và
`node management-bundle-cli.mjs`; code nằm tại `/app`.

Mẫu trường bắt buộc:

- `deploy/control/management-bootstrap.example.json`;
- `deploy/control/management.example.json`.

Giá trị image, database identity, hash và tài nguyên trong mẫu phải được thay
bằng cấu hình được kiểm chứng. Không dùng mẫu làm chứng minh sức chứa. Budget
phải cùng môi trường và khớp số replica/pool của từng dịch vụ; worker đang được
phân bổ không được bỏ khỏi bundle. Catalog probe của health có tài khoản, trust,
keyring và cấu hình riêng, không bị hạ thành probe legacy khi thiếu thông tin.

## Điều kiện trước khi khởi tạo

Người vận hành chuẩn bị mạng/volume riêng với ownership đã kiểm, không nhận
lại resource trùng tên chưa rõ nguồn. Directory network phải internal; mạng web
chỉ chứa frontend/API và cần bridge có gateway để công bố cổng loopback; không
dùng web bridge `internal` rồi coi container healthy là đã truy cập được. Metrics
và egress theo cấu hình đã duyệt. Data volume
0700 UID70; private directory volume chỉ chứa server key, certificate và admin
password; CA công khai ở volume riêng. Xem `deploy/control/directory/README.md`
cho SAN, PostgreSQL TLS, UID và mode bắt buộc. CA private key không vào runtime.

Các file private dùng owner vận hành hoặc root, mode0600, thư mục0700, không
symlink/hardlink. Runtime DSN được tạo bởi provisioner theo từng capability,
không cấp DSN quản trị cho API hoặc worker. Cấu hình API qua `api.env` riêng,
định dạng env raw của Compose; không in `docker compose config` hoặc môi trường
container ra báo cáo công khai. API vẫn cần public URL, email hash key, các cụm
và authority quản trị thật. `initial-registry.json` của bootstrap chỉ có:

```json
[{"id":"cluster-a","url":"https://cluster-a.roomqc.invalid","publishableKey":"PUBLIC_KEY","vapidPublicKey":"PUBLIC_VAPID","maxWorkspaces":10,"credentialRef":"cluster-a"}]
```

Không đưa service key vào initial registry. Các trường này phải khớp cấu hình
API; bootstrap đồng bộ mapping ban đầu để API không lỗi registry khi khởi động.

## Chạy lại và kiểm tra

Sau lần khởi tạo hoặc khi bị ngắt, dùng cùng file cấu hình và credentials:

```text
npm run management:bootstrap -- --config-file /ABSOLUTE/private/bootstrap.json --resume
npm run management:bootstrap -- --config-file /ABSOLUTE/private/bootstrap.json --verify
```

Resume giữ nguyên mật khẩu và chính sách cụm hiện có; không xoay credentials.
Verify không chạy migration hoặc thay grants. Database được đánh dấu bằng ID
bản cài, manifest migration và registry ban đầu. Khác marker, sai đích, database
đã có dữ liệu chưa được nhận diện, schema/checksum sai hoặc role không đúng đều
bị chặn. Bộ khởi tạo không phải công cụ nâng cấp phiên bản; nâng cấp directory
cần quy trình backup, kiểm soát schema và phục hồi riêng.

Bundle gồm directory, API, frontend và worker theo budget. Các dịch vụ có image
digest cố định, giới hạn RAM/CPU/PID, root filesystem chỉ đọc, bỏ capabilities,
healthcheck và log rotation. Chỉ frontend công bố cổng loopback; reverse proxy
bên ngoài cung cấp DNS/TLS thật. Không công bố database hoặc cổng worker. API
khởi động với đăng ký mới và setup dispatch đều đóng, kể cả `api.env` có giá trị
khác. Chỉ mở bằng quy trình nghiệm thu/cutover riêng.

Trước `docker compose up`, vẫn phải kiểm ownership, TLS, file cấu hình,
preflight tài nguyên toàn máy và consumers chạy ngoài bundle. Các mục
`externalConsumers` trong báo cáo không có nghĩa đã được cài hoặc nghiệm thu.
Không có bước tăng ổ đĩa, prune, reboot, xóa dữ liệu hay thay runtime hiện hữu
trong hai lệnh này. Bundle báo `deploymentReady:false` cho đến khi nghiệm thu
toàn bộ môi trường triển khai; nó không cấp quyền bypass các gate hiện có.

## Kiểm tra cô lập

```text
node --test server/control/management-bundle.test.mjs
node scripts/build-control-image.mjs --build
ROOMQC_MANAGEMENT_TEST_CONTROL_IMAGE=roomqc/control@sha256:VERIFIED_DIGEST npm run test:management:local
```

Lệnh cuối cần Docker local và các image fixture đã cài. Nó tạo tài nguyên gắn
nhãn riêng, dùng TLS thật, gọi CLI sản phẩm, chạy frontend/API/alert worker,
kiểm HTTP qua reverse proxy và restart để đối chiếu dữ liệu. Chỉ dọn tài nguyên
có đúng nhãn của lượt chạy; kiểm container khác không bị khởi động lại. Không
truy cập Contabo, không mở signup và không gửi cảnh báo/email ra ngoài.

Kiểm này chưa chứng minh browser signup đầy đủ trên bundle, health/setup worker
với backend thật, backup offsite/restore, TLS renewal, tải hoặc vận hành VPS thật.

## Kết quả ngày 31/10/2026

Lượt `b98a421dc28f` hoàn tất, exit0. CLI bootstrap nhận đúng database mới, áp
27migration và tạo2LOGIN riêng cho API/alert worker. Sai database OID, resume
trên database chưa có owner và initialize trên database đã có function riêng đều
bị chặn; thử sau xác nhận database chưa bị nhận quyền sở hữu. Resume áp0migration
và verify đạt. Registry ban đầu được đồng bộ trong cùng quy trình khởi tạo.

CLI bundle tạo Compose sản phẩm, được dùng cùng overlay chỉ thêm nhãn kiểm thử.
Directory/API/frontend/alert worker đều healthy; frontend và API qua Nginx trả200,
admin không có phiên trả401, signup trả503 `SIGNUP_CLOSED`. Restart các dịch vụ
giữ nguyên bản ghi sentinel và verify vẫn đạt. API kết nối TLS thật và bị từ chối
đọc password hash hoặc tạo bảng. Alert worker chỉ được kiểm lúc không có công
việc gửi; không có bằng chứng delivery ra ngoài.

Image control được build/import kiểm297file đóng gói; bộ ràng buộc nguồn có
500file và cùng source hash đầu/cuối. Frontend
là image hiện có, chỉ được kiểm phục vụ app shell và route quản trị. Không nhận
là browser E2E. Sau dọn, container/network/volume mang nhãn thử đều0; container
khác giữ nguyên thời điểm khởi động. Hồi quy liên quan có20bài (19pass/1skip) và
62bài (59pass/3skip),0fail. Skip không được tính là đã kiểm.

Biên nhận: `artifacts/roomqc-management-bundle-local-2026-10-31.json`.
Không cập nhật Contabo, không mở signup production. Gói SSH chung và việc nối
health/setup worker với backend thật vẫn là phần tiếp theo của mục tiêu.

## Cập nhật tiếp 31/10 — quản trị và signup trên cùng bản cài qua SSH

Diagnostic `management-customer-journey` cài backend và bộ quản trị qua cùng
kết nối SSH đã ghim host key, dùng CLI bootstrap/bundle sản phẩm và image control
đóng gói. Hành trình khách hàng gọi management Nginx/API thực sự đã cài; không
khởi động thêm API trong tiến trình test, không tạo directory trong business DB.
Directory riêng được kiểm TLS và marker chủ sở hữu bản cài.

```powershell
$env:ROOMQC_MANAGEMENT_TEST_CONTROL_IMAGE='roomqc/control@sha256:0f6456795f2a573c0297eaad9076d1423fa93c246ae7794c61dcd85e133d4f33'
node scripts/test-control-backend-sandbox.mjs --run --diagnostic management-customer-journey
```

Image này khớp source binding501file của lượt `a6502c42da53`; sau khi sửa nguồn
phải build lại, không tái dùng image cũ để chứng nhận nguồn mới. Lượt đã kết thúc
exit0:591migration business,27migration directory,93/93kiểm tra signup/OTP/phòng/
nhân viên/REST-RPC/Storage/Realtime. Mất phản hồi sau provision và gửi lại đồng
thời không tạo thêm dữ liệu. Signup mặc định đóng; chỉ overlay local có nhãn
thử được mở, sau đó đóng lại và kiểm `SIGNUP_CLOSED`. Restart giữ sentinel;
bootstrap verify, TLS và hai giới hạn quyền API đạt.

Đối chiếu41dịch vụ sẵn có không thay thời điểm khởi động; cleanup độc lập xác
nhận container/network/volume của backend, management và transport đều0. Lượt
trước `93ae9a35fd2e` dù đạt93kiểm tra vẫn exit1 do một container baseline biến
mất nên không được nhận là đạt toàn bộ. Bản mới lưu danh tính baseline; chỉ
container có đúng nhãn sở hữu của lượt thử mới được loại khỏi danh sách dịch vụ
không liên quan. Lượt đạt mới không loại container nào và đối chiếu đủ41.

Đây vẫn là nghiệm thu local: máy Linux thử dùng Docker daemon local; authority
quản trị queue, health/release/backup là fixture;591migration do runner áp dụng.
Overlay local có relay backend và kết nối audit tạm, không đại diện topology
production. Frontend mới chỉ phục vụ app shell, chưa có browser signup trên
bộ ghép này. Orchestrator SSH hiện nằm trong runner nghiệm thu, chưa phải lệnh
cài management production tổng quát. Worker đầy đủ, pipeline schema sản phẩm,
DNS/TLS/email ngoài máy, backup offsite/restore, tải và pilot vẫn chưa hoàn tất.

Biên nhận: `artifacts/roomqc-management-backend-ssh-signup-local-2026-10-31.json`.
