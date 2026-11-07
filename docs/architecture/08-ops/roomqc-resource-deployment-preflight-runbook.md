# Kiểm tra ngân sách tài nguyên trước triển khai

**Bổ sung ngày30/10:** có [công cụ kiểm đích từ credential cấu hình của dịch vụ](roomqc-resource-consumer-target-runbook.md) và [proof local](roomqc-resource-consumer-targets-local-2026-10-30.md). Đây là bước opt-in mở session chỉ đọc riêng sau PLAN; không chứng minh pool đang chạy, namespace mạng hoặc topology. Các giới hạn của bước hiện tại dưới đây giữ nguyên.

**Tiếp sau plan:** đã có [bộ kiểm container runtime](roomqc-resource-deployment-runtime-runbook.md) và [live proof API](roomqc-resource-deployment-runtime-local-2026-10-28.md). Các giới hạn runtime ở mục5 dưới là checkpoint plan; dùng runbook runtime cho hành vi hiện hành. Staging/production vẫn cần registry digest; local bổ sung exact Docker content ID để kiểm build riêng.

Đây là kiểm **kế hoạch Compose đã resolve** của T10.a/phần T10.b. Chương trình chỉ đọc cấu hình; không cấp quyền triển khai hoặc xác nhận VPS đã đủ sức chứa. [Báo cáo local](roomqc-resource-deployment-plan-local-2026-10-28.md) giữ bằng chứng và phần còn thiếu.

## 1. Đầu vào cần chuẩn bị

1. Ngân sách riêng của môi trường, gồm tất cả DB/consumer/pool/replica và reserve. Không lấy file example đổi nhãn để coi là đã đo tải. Tạo SHA-256 trên **đúng bytes** của file được review; BOM, xuống dòng hoặc cách format khác tạo hash khác.
2. Manifest từ [mẫu](../../../deploy/control-resource-deployment.example.json). Thay các số 0, đường dẫn, DB ID, project/service và image bằng giá trị được review. Mẫu là placeholder, chưa chạy được và chỉ minh họa một project; inventory thực cần đủ các project liên quan.
3. Compose và các env file được ghi đường dẫn tuyệt đối. `envFiles` là các file truyền cho CLI để nội suy; service `env_file` vẫn dùng để nạp môi trường của container. Chương trình không lấy biến ROOMQC/COMPOSE tùy ý từ terminal và tắt `.env` tự động. Docker vẫn dùng các biến hệ thống cần thiết để tìm plugin/context.
4. Image native có digest `repository@sha256:...` trùng manifest; không dùng tag hoặc `build`. Cấu hình development hiện có cần một bản release/override được review trước. Kiểm này không pull/inspect image hoặc chứng thực nội dung image đã được review.

Manifest chứa `schemaVersion:1`, `environment:local|staging|production`, `budgetFile`, `budgetSha256`, `projects`. Mỗi project có `id`, danh sách `files`, `envFiles`, `profiles` và `services`. Mỗi service có `name`, `adapter`, `databaseId`, `image`. Các trường chưa biết, project/service trùng hoặc adapter chưa hỗ trợ bị từ chối.

## 2. Các adapter hiện có

| Adapter | Command phải khớp | Ngân sách được ràng buộc |
|---|---|---|
| `control-api` | `node server.mjs` | Directory; pool, poolBudget và tổng API instances |
| `health-worker` | `node workers/health-runtime.mjs` | Directory; metrics, và probe-catalog nếu schema v2; các trường budget giao nhau |
| `alert-worker` | `node workers/alert-runtime.mjs` | Directory; pool, instances và otherAllocatedConnections |
| `provisioning-worker` | `node workers/setup-runtime.mjs` | Directory; pool, instances, otherAllocatedConnections và mã instance riêng |
| `external-notifications` | `node workers/booking-external-runtime.mjs --config-file /etc/roomqc/booking-external.json` | Exact business DB; pool 2, workerInstances và otherConnections |
| `summary-credential-rotation` | `node workers/summary-rotation-runtime.mjs --config-file /etc/roomqc/rotation.json` | Cùng tiến trình tính một pool max1 ở directory và exact business DB; metadata consumer/replicas/hash phải khớp cả hai |

Adapter summary là PLAN. `databaseId` của service là business DB ID; directory lấy từ đúng budget có duy nhất một directory. Projection `resources.schemaVersion:2` chứa `databases[]`, không được chỉ lấy một DB hoặc coi metadata thiếu là0. Chỉ đọc policy/config/budget, không mở DSN, signer, trust hoặc credential output; không xác minh approval từ bước này. Runtime issuer vẫn phải kiểm chữ ký/quyền/identity hiện hành.

Projection v2 hiện có thêm `configurationSha256`, hash canonical policy+installer metadata theo đường dẫn bên trong container. [Runtime checker](roomqc-resource-deployment-runtime-runbook.md) so fingerprint này với endpoint loopback8097 giữ snapshot từ startup. Hash không chứa nội dung DSN/secret và không thay kiểm physical identity, TLS, quyền DB hoặc readiness.

Summary dùng đúng profile [summary-rotation](../../../deploy/monitoring/summary-rotation.compose.yml): UID1000, root read-only, cap_drop ALL, no-new-privileges, bốn bind mount riêng. Policy file/private chỉ đọc; journal/output ghi được và không trùng hoặc nằm trong nhau sau khi resolve đường dẫn host. File config/budget/DSN/signer/trust đều là tên trực tiếp trong private directory; output cố định `/run/roomqc/summary/summary.json`. Metadata chưa điền trong template bị từ chối.

Một service summary phải có đúng một replica. Muốn hai rotator thường trực, khai báo hai service với policy/instanceId và cặp issuer/observer LOGIN riêng, budget `summary-credential-rotation.replicas:2` trong cả hai DB. Không dùng Compose scale2 với một cặp login CONNECTION LIMIT1. Các LOGIN được so theo systemIdentifier+role, vì một PostgreSQL role dùng chung nhiều database trên cùng server. Các CLI issuer/installer đã giữ chỗ trong budget nhưng chưa có adapter vẫn phải hiện unresolved; không tắt để lấy kết quả xanh.

Working directory phải là `/app`. Entrypoint mặc định của image được kế thừa; `null` do Compose normalize cũng được nhận, override khác bị từ chối. Không nhận loader injection, code mount, lifecycle hook hoặc healthcheck command tùy ý. Healthcheck native phải dùng đúng lệnh fetch loopback của template. Đây không phải bộ quét an ninh tổng quát của Docker/image/host.

Budget và worker metadata dùng bind mount file readonly, `create_host_path:false`, target file trực tiếp dưới `/etc/roomqc/`. Không cho mount code hay thư mục cha; secret target chỉ dưới `/run/secrets` hoặc basename tương ứng. Việc xác minh secret, TLS, provider và quyền DB thực vẫn do loader/readiness và nghiệm thu môi trường tương ứng.

## 3. Chạy kiểm tra

Worker khởi tạo dùng [profile setup-worker](../../../deploy/monitoring/setup-worker.compose.yml), working directory `/app`, UID1000, root read-only, drop ALL và no-new-privileges. Có ba file metadata/public trust readonly, một thư mục recovery credential readonly riêng và đúng một secret `setup-dsn`. Planner chỉ mở metadata và public trust; kiểm chữ ký target theo trust đã cung cấp nhưng không mở DSN/recovery credential, không kiểm quyền directory hiện hành hoặc gọi database/cụm. Các nguồn mount không được lồng nhau; đường dẫn credential chỉ là file trực tiếp trong `/run/roomqc/setup/`.

Mỗi service provisioning phải có đúng một replica và instanceId riêng. Muốn hai worker, khai báo hai service/config có instanceId khác nhau và `connectionBudget.instances`/consumer replicas tổng bằng2. Không dùng scale2 với cùng instanceId. Khớp instanceId không chứng minh các SQL LOGIN hoặc đích vật lý khác nhau; kiểm binding database và quyền vẫn là việc riêng.

Chạy bằng Node >=22, từ checkout được review:

```text
node scripts/control-backend-resource-preflight.mjs --manifest ABSOLUTE_MANIFEST_JSON
```

Chương trình gọi `docker compose ... config --format json` với đúng project/files/envFiles/profiles. JSON đã resolve có thể chứa secret nên chỉ xử lý trong bộ nhớ; không in stdout/stderr của Docker hoặc lỗi parser. Không chạy `up`, `run`, `exec`, `build`, `pull`, không mở kết nối DB hoặc gọi provider. Lỗi chỉ trả mã trong danh sách cho phép.

| Exit | Ý nghĩa và bước tiếp |
|---|---|
| `0` | Các adapter native khai báo đã khớp và mọi consumer đang bật trong **budget được cung cấp** có mapping. Chỉ kết quả plan; `deploymentReady:false` vẫn giữ |
| `2` | Phần native khớp nhưng có `unresolvedConsumers`. Bổ sung adapter/inventory/cap đã xác minh; không coi là toàn stack đạt |
| `1` | Manifest/resolve/profile/process/mount/pool/replica không khớp. Sửa nguồn cấu hình và kiểm lại; không bỏ guard hoặc giảm số consumer để lấy kết quả xanh |

Trong mỗi project được khai báo, mọi service **đang được chọn theo profiles** phải có mapping. Không tự kích hoạt profile khác. Cộng `scale`/`deploy.replicas` xuyên project theo DB + consumer; mặc định một replica. Hai cách khai báo lệch nhau, global mode hoặc container_name không hỗ trợ scale đều bị chặn. Hai pool của health v2 được tính riêng.

Các file ở đường dẫn host khác nhau chỉ được chấp nhận nếu bytes trùng hash chung. Hash này không chứa secret và không chứng minh các DB ID khác nhau thực sự trỏ tới các PostgreSQL khác nhau.

## 4. Dấu vân tay đã nạp của tiến trình

Native entrypoint lưu hash trong context bất biến khi khởi động. `resources` trên API `/api/control/livez` và worker `/livez` trả projection cho phép: phiên bản, hash, môi trường, DB ID, consumer/pool/replica đã nạp. Worker health/alert cũng có projection trên `/readyz`. Local không cấu hình budget trả `null`.

Không đọc lại mount để tạo projection. File bị thay hoặc trở thành JSON lỗi sau startup không làm tiến trình tự nhận cấu hình mới. Sau rollout, công cụ kiểm runtime cần so projection **trong bộ nhớ** với manifest, đồng thời kiểm container/image/command/replica thực. Liveness và hash khớp không chứng minh readiness, quyền/identity DB, provider delivery hoặc sức chứa.

## 5. Việc bắt buộc trước khi dùng làm preflight toàn hệ thống

| Phần còn thiếu | Kiểm cần đạt |
|---|---|
| Inventory đang chạy | Tất cả container theo project label, gồm orphan/one-off/stopped/restarting; image ID/digest, command, mounts, env; kiểm projection đã nạp; thiếu/thừa replica hoặc stale process bị chặn |
| Ngoài các project được khai báo | Phát hiện/cross-check process khác cùng dùng DB; không suy từ manifest rằng không có project khác |
| Vendor và pooler | Auth/REST/Realtime/Storage/functions/meta/Supavisor theo release pin; phân biệt client slots với server sessions; chưa biết cap thì không cho đạt |
| Process còn lại | In-app notifier, provisioner, exporter/operator, migration/backup/restore/maintenance/custom consumers; cap và lịch chạy đồng thời có proof |
| DB thực | Binding DB ID → endpoint/database thực, topology pooler/direct, max/reserve của directory và business, tránh hai ID trỏ cùng một DB để cộng thiếu |
| Host và workload | T10.c–f/T23: RAM/CPU/IO/disk/inode/egress/headroom, fairness, upload/report/Realtime/job, usage/quota và tải/soak |

Kết quả hiện tại là snapshot thời điểm đọc, chưa khóa cấu hình giữa kiểm và start. Không dùng exit 0 thay cho bộ cài release, runtime attestation hoặc quyền phát hành. [Bản bàn giao](roomqc-vps-signup-handoff-2026-10-28.md) giữ toàn bộ dependency, bộ 70 ca và các môi trường cần nghiệm thu.
