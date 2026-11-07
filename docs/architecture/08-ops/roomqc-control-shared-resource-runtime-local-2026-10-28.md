# T10 — ràng buộc ngân sách chung tại lúc khởi chạy

Ngày 28/10/2026, Asia/Bangkok. Tiếp sau [HTTP bounds và kế toán connection](roomqc-control-resource-bounds-local-2026-10-28.md). Báo cáo trước ghi đúng checkpoint budget còn optional; **source hiện tại đã bắt buộc budget ở các entrypoint native nêu dưới khi staging/production**. Đây vẫn là T10 partial, chưa nghiệm thu tổng VPS hoặc sức chứa người dùng.

[Artifact tổng hợp](../../../artifacts/roomqc-control-shared-resource-runtime-local-2026-10-28.json) giữ source và bằng chứng riêng từng nhóm kiểm. [Plan hiện hành](roomqc-vps-signup-handoff-2026-10-28.md) giữ toàn bộ phạm vi VPS + signup.

## 1. Thay đổi đã triển khai

| Thành phần | Kiểm bắt buộc trước pool/socket/công việc |
|---|---|
| Control API / ControlStore / startControl | Budget tồn tại; môi trường đúng; pool/replica API khớp; tổng directory gồm reserve nằm trong pool budget. Inject store cũng không bỏ được guard của startControl khi config production |
| Health worker / createHealthPool / startHealthRuntime | Pool và replica health, API, provisioning; tổng exporter/migration; max/reserve đều khớp common profile. Schema v2 tính probe catalog thành pool riêng; v1 không được khai báo probe đang chạy |
| Managed health probe | Shared profile ràng buộc pool/replica probe từ health config; wiring hiện có tiếp tục kiểm pool probe thực và metrics/probe phải tách role/pool |
| Alert worker / startAlertRuntime | Pool/replica khớp; `otherAllocatedConnections` phải bằng toàn bộ allocated trừ chính alert workers; không chỉ kiểm một phép cộng tự khai báo |
| External booking notification loader / startBookingExternalRuntime | Chọn exact business DB ID; pool thật của worker là 2, đúng replica; `otherConnections` bằng tổng các consumer khác của DB đó |

Guard chạy trước khi tạo pool hoặc lấy quyền sở hữu các dependency được truyền vào. Thiếu/mismatch không gọi readiness hay provider. Metadata được freeze sau khi đọc; sửa object đã load không làm thay đổi snapshot ngân sách. Summary giữ từng pool, nên hai pool 1+1 không được nhận là một pool 2 của worker.

Health config cho phép `reconcileInstances: 0` khi provisioning worker chưa triển khai; số pool và trạng thái không chạy vẫn phải khớp profile. Không giả một worker đang chạy để vượt validator cũ.

## 2. Biến cấu hình chuẩn

| Biến | Cách dùng |
|---|---|
| `ROOMQC_RESOURCE_BUDGET_FILE` | Đường dẫn tuyệt đối đến metadata chung. Bắt buộc ở staging/production của các entrypoint trên; loader giới hạn 128 KiB, regular file và không symlink leaf |
| `ROOMQC_RESOURCE_ENVIRONMENT` | `local`, `staging` hoặc `production`. Nếu không đặt: NODE_ENV=production chọn production, các trường hợp khác chọn local |
| `ROOMQC_RESOURCE_DATABASE_ID` | Bắt buộc cho external booking worker; phải trỏ đúng một business entry. Nếu đặt trên directory service, phải khớp exact directory ID |
| `ROOMQC_CONTROL_RESOURCE_BUDGET_FILE` | Alias cũ chỉ của API. Nếu đồng thời đặt biến chuẩn thì hai đường dẫn phải giống nhau sau normalize; không là ngân sách thứ hai |

NODE_ENV=production không được ép về resource environment local. Staging bật các kiểm TLS/HTTPS của production và chỉ nhận profile staging. Production chỉ nhận production; example không được chấp nhận. Local vẫn chạy không file cho development/fixture; khi có file, chỉ nhận local/example và vẫn kiểm pool/replica.

Những trường connectionBudget cũ của health/alert/booking vẫn tồn tại, nhưng loader đối chiếu các trường liên quan với common profile. Khai báo nhiều file cùng đúng riêng lẻ chưa chứng minh các container đang dùng cùng một profile; việc đối chiếu deployment thực còn ở bước tiếp theo.

## 3. Compose và rollout có điều kiện

Đã cập nhật API, health và external booking Compose để mount metadata readonly vào `/etc/roomqc/resource-budget.json`; `create_host_path: false`, thiếu source thì Compose từ chối. Managed health/provider overlays giữ cùng mount. Thêm [template alert worker](../../../deploy/monitoring/alert-worker.compose.yml), opt-in bằng profile, chạy non-root/read-only/cap-drop, chỉ status loopback, có giới hạn CPU/RAM/PID/log và secret file riêng. Chưa start template nào lên stack chính/VPS.

| Template | File |
|---|---|
| API | `docker-compose.control.yml` |
| Health / managed health | `deploy/monitoring/health-worker.compose.yml`, `health-worker.managed.compose.yml` |
| Alerts | `deploy/monitoring/alert-worker.compose.yml` |
| External booking / provider overlays | `deploy/booking-notifications/compose.yml`, `push.compose.yml`, `telegram.compose.yml` |

Khi chuẩn bị staging, operator thực hiện theo thứ tự:

1. Resolve inventory đúng release/host và tính mọi consumer, pooler/direct sessions, maintenance/backup cùng lúc. Chốt profile riêng từ cấu hình thực; không đổi nhãn example thành production để coi là đã đo tải.
2. Đặt biến chuẩn trong env file do operator quản lý. Với Compose, truyền env file cho CLI bằng `--env-file`; chỉ dùng `env_file` ở service không cung cấp giá trị để Compose nội suy host mount.
3. Cập nhật các budget con cho đúng profile, gồm replica, max/reserve, probe pool và tổng consumer còn lại. Business worker cần exact business DB ID. Bỏ alias API cũ nếu nó trỏ host path khác container path.
4. Kiểm metadata bằng `node scripts/check-control-resource-budget.mjs ABSOLUTE_METADATA_FILE`; kiểm Compose config mà không in env/secret ra log. Lệnh này chưa đối chiếu tất cả service config hoặc actual replica count.
5. Dựng candidate từ source đã review; kiểm image/config/source, migrate bằng quyền riêng, start theo drain và readiness; chỉ bật dispatch khi đúng đích/provider. Luồng release/gate vẫn cần quyết định riêng, không được suy từ báo cáo local này.
6. Khi sai budget: giữ admission đóng, sửa đúng file và cấu hình đã review, drain/restart rồi kiểm lại. Giữ mapping/job/receipt và retry theo key cũ; không bỏ mount hoặc set development để vượt guard.

## 4. Bằng chứng đã thu

| Nhóm kiểm | Kết quả | Giới hạn |
|---|---|---|
| Full directory suite | Run `08b80b8a982d`: 481 bài, 479 pass, 0 fail, 2 skip, exit 0 | PostgreSQL disposable; có readiness/overload thật. Không là full native business sandbox |
| Linux loader/runtime guards | Run `c02f6fd667b5`: 18/18 pass, 0 skip, exit 0 | Node image pin digest, non-root, readonly workspace, network none; phủ symlink và production booking file modes bị skip trên Windows |
| Compose config | Run `ba1a0c019cdf`: 5 matrix hợp lệ, 5 trường hợp thiếu source đều bị từ chối | API, health, managed health, alert, booking+provider overlays; chỉ resolve config, không start/pull/build/deploy; không đọc service env file thật |
| Cluster client/journal → HTTP → PG | Run `930591a8dc8f`: 17/17, exit 0 | Hồi quy sau đổi startup; remote Auth/release/health dùng adapter tổng hợp |
| Alert client → HTTP → PG | Run `8f95719e9f15`: 13/13, exit 0 | Hồi quy acknowledge/unknown result; không gửi provider thật |

Các kiểm mới gồm missing budget, environment mismatch/downgrade, alias conflict, exact business ID, pool/replica sai, stale otherConnections, split pool, frozen context, guard trước dependency và các đường khởi chạy hợp lệ. Test factory có dependency adapter để chứng minh thứ tự guard; không suy đó là SQL/provider production đã chạy.

Backend 215 file, SHA `024f9749de973542291029dfc36cbb226fe77f8262db951b8aff40e5eabe6fa1`, không đổi trong directory và Linux runs. API Compose/env mẫu được hash bổ sung vì không nằm trọn trong backend binding. Cleanup độc lập còn 0 container/volume/network theo từng label sở hữu. Không dùng database chính, không gửi thông báo thật, không commit/deploy hoặc đổi gate.

## 5. Phần còn thiếu và việc nhận tiếp

**Việc nhận tiếp duy nhất: T10.a và phần còn lại T10.b — deployment inventory/preflight đúng bản chạy.** Đây là bước bổ sung vào sáu gói T10.a–f, không thêm task/case vào ledger.

| Cần làm | Đầu vào / cách triển khai | Điều kiện nhận |
|---|---|---|
| Đếm replica và profile thực | Inventory từng Compose project/service/image; đối chiếu deploy.replicas/scale/one-off, đúng process command và hash metadata trong từng container; giữ thống nhất cùng DB | Tăng scale thiếu ngân sách, dùng profile khác giữa project, missing service hoặc image/command sai đều bị preflight chặn trước start; không in DSN/token |
| Vendor và pooler | Pin vendor release; đọc các pool Auth/REST/Realtime/Storage/functions; phân direct/session/transaction và server sessions theo DB, không cộng hai lần client qua pooler | Phiếu có nguồn config cho từng số; thiếu/unknown không được nhận. Xác minh actual PostgreSQL max/reserve và DB target; worker hiện chưa tự kiểm toàn bộ actual business settings |
| Các process chưa nối common context | In-app notifier, provisioning worker tương lai, operator, exporter, migration/backup/restore/maintenance và custom consumers | Mỗi process có launch/binding hoặc cap vận hành được kiểm; backup song song tính đủ sessions; không gọi T10.b hoàn tất khi còn đường đi ngoài budget |
| Host và tải | Sau inventory: RAM/CPU/IO/disk/inode/egress/headroom; upload/report/Realtime/job/fairness và usage/quota | T10.c–f/T23 theo plan; không có số user/VPS được chứng minh chỉ từ connection budget |

Chưa chứng minh cùng một file trên nhiều host/project, số replica live, DB endpoint identity, vendor server pools, actual business DB max/reserve, preflight production toàn hệ thống hoặc capacity. Còn Linux VPS/TLS/DNS, email inbox, offsite restore, mất host/on-call, live Auth/browser/Android, full native/rebuild, load/soak và pilot theo [plan](roomqc-vps-signup-detailed-delivery-2026-10-26.md).

**Nghiệm thu giữ nguyên:** 70 case `not_run`, 122 release entry `unverified`; reviewer/signoff/gates chưa thay. Bản này khép packet shared native startup local, không khép T10 hay toàn bộ VPS/signup.
