# T10 — giới hạn xử lý HTTP và ngân sách kết nối local

Cập nhật 28/10/2026, Asia/Bangkok. Đây là **một phần T10** trong phạm vi toàn bộ VPS + signup; chưa đóng task, chưa nghiệm thu production. [Bằng chứng máy đọc](../../../artifacts/roomqc-control-resource-bounds-local-2026-10-28.json) giữ source, lệnh, kết quả, cleanup và giới hạn.

## 1. Kết quả đã có

API có giới hạn số handler đang chạy, số yêu cầu được chờ và thời gian chờ. Khi hết suất, API trả `503 CONTROL_OVERLOADED` kèm `Retry-After: 1` trước khi gọi store/gateway. Client phải giữ nguyên idempotency key và tra kết quả theo hợp đồng hiện có.

Yêu cầu bị ngắt khi còn trong hàng đợi được bỏ khỏi hàng đợi. Yêu cầu đang xử lý vẫn chiếm suất đến khi công việc thật kết thúc, kể cả client đã mất kết nối: mất response không có nghĩa database chưa commit. Khi shutdown, API ngừng nhận và từ chối các yêu cầu còn chờ.

`livez` không dùng database. `readyz`/`healthz` có làn riêng tối đa một handler, không hàng chờ, cùng dùng pool hiện có của API. Làn này không tạo thêm pool. Đây là giới hạn theo process, không phải limiter dùng chung nhiều replica hay giới hạn toàn bộ socket ở edge.

Bộ kiểm ngân sách cộng rõ pool của tất cả replica, kết nối cố định và dự phòng PostgreSQL. Phải khai báo một directory và ít nhất một business DB; mỗi DB có các consumer bắt buộc, kể cả consumer không mở kết nối trực tiếp. Thiếu consumer, trùng ID, field lạ, số sai kiểu hoặc tổng vượt giới hạn đều bị từ chối.

Khi API được cấp file ngân sách, pool và số replica trong cấu hình API phải khớp metadata. Readiness đối chiếu directory với `max_connections` và các kết nối PostgreSQL dành riêng. Khai báo lớn hơn max thực hoặc dành dự phòng ít hơn reserve thực làm readiness trả lỗi. Business DB, worker và số process thực tế **chưa được runtime đối chiếu** trong packet này.

## 2. Cấu hình và cách kiểm

File: [mẫu metadata](../../../deploy/control-resource-budget.example.json), [cấu hình API mẫu](../../../.env.control.example), [CLI kiểm](../../../scripts/check-control-resource-budget.mjs).

| Biến | Mặc định / khoảng hợp lệ | Ý nghĩa |
|---|---|---|
| `ROOMQC_CONTROL_POOL_MAX` | 5 / 1–30 | Max connection một API process |
| `ROOMQC_CONTROL_POOL_BUDGET` | 20 / 2–1.000.000 | Trần tổng directory đã khai báo, có reserve; không là capacity user |
| `ROOMQC_CONTROL_API_INSTANCES` | 1 / 1–1.024 | Số replica dự kiến; chưa tự phát hiện process ngoài inventory |
| `ROOMQC_CONTROL_RESOURCE_BUDGET_FILE` | Optional, đường dẫn tuyệt đối | JSON metadata tối đa 128 KiB; file thường, không symlink ở leaf |
| `ROOMQC_CONTROL_MAX_ACTIVE_REQUESTS` | 16 / 1–256 | Handler nghiệp vụ tối đa mỗi process |
| `ROOMQC_CONTROL_MAX_QUEUED_REQUESTS` | 32 / 0–1.024 | Hàng chờ mỗi process; 0 nghĩa từ chối ngay khi bận |
| `ROOMQC_CONTROL_QUEUE_TIMEOUT_MS` | 1.000 / 1–10.000 | Hết thời gian thì từ chối trước tác động store/gateway |

```powershell
node scripts/check-control-resource-budget.mjs deploy/control-resource-budget.example.json
```

Lệnh chỉ đọc metadata và in tổng không chứa credential. Mẫu dùng `environment: example`, directory 12 allocated + 5 reserved = 17; business 32 + 10 = 42. Những số này chỉ dùng kiểm công thức. **Không sao chép thành profile production hoặc hứa số khách sạn/user từ chúng.** Giá trị vendor trong mẫu chưa phải pool cấu hình triển khai.

Consumer `replicas: 0` có nghĩa không tính instance mở DB trực tiếp trong profile đó. Phải ghi rõ đó là dịch vụ chưa chạy hay đang truy cập qua REST/pool chung. Không được dùng 0 để che pool đang tồn tại. Không tính hai lần một connection qua pooler: cần cộng server sessions của pooler vào PostgreSQL, đồng thời kiểm client limits ở tầng riêng. Kết nối direct đi ngoài pooler vẫn cộng riêng; `LISTEN`, replication/Realtime và backup song song cần inventory cụ thể.

File ngân sách hiện **vẫn optional, kể cả production**. Compose API chưa mount file này; health/alert worker còn dùng budget riêng. Khả năng kiểm metadata chưa tương đương đã có cưỡng chế tổng tài nguyên trên VPS.

## 3. Inventory source đã đối chiếu

| Consumer | Pool / concurrency / deadline có trong source | Khoảng trống cần khép |
|---|---|---|
| Control API | Pool mặc định 5; connect 3s, statement 8s, idle transaction 10s; handler 16 + queue 32, readiness 1 | Replica thực, session/direct URL, edge connection bounds và deadline toàn request |
| Cluster gateway | Timeout 20s mỗi HTTP call | Nhiều call nối tiếp không là deadline tổng; phải đo signup recovery |
| Health worker | Pool 1–4; connect 2s, statement 3s, lock 2s, idle transaction 5s; tối đa 4 target, deadline 25s/target | Budget health chưa cộng mọi consumer hiện hành vào một nguồn chung |
| Managed probe catalog | Pool riêng 1–4, cùng các DB timeout ngắn; schema v2 ràng buộc probe instances = health instances | Phải cộng pool này ngoài pool health, không gộp nhầm |
| Alert worker | Pool 1–4, concurrency ≤ pool; request 0,1–15s; lease và shutdown kiểm theo request timeout | `otherAllocatedConnections` còn phải đối chiếu inventory chung; cần mount và attest số replica |
| In-app notification worker | Pool 1, batch 1–50 mặc định 20, chu kỳ 5s; connect 3s, statement 12s, query/idle transaction 15s | Business pool aggregate, queue age/fairness và workload cùng tenant khác |
| External notification worker | Pool 2, batch 1–50; loop không chồng; statement 12s, query 15s, idle transaction 20s | Mọi channel/replica phải tính riêng; provider/queue headroom còn đo |
| DB exporter | Role monitor connection limit 3; statement 3s, idle transaction 5s | Khai báo tối đa sessions thực của từng exporter; limit role nhóm không tự là tổng deployment |
| Auth / REST / Realtime / Storage / functions | Có vendor harness pin release; compose production business chưa có inventory được nghiệm thu trong packet | Ghi image digest, pool server/client, replicas và DB direct/session/transaction; đọc cấu hình đã resolve thay vì đoán defaults |
| Report / migration / backup / maintenance | Một số report đi qua REST; migration/backup cần kết nối thích hợp với session/direct | Phải tính độ song song `pg_dump -j`, restore, lịch chạy trùng và connection phục vụ vận hành |

Tài nguyên container đã thấy: health worker 256 MiB/0,5 CPU; Prometheus 512 MiB/0,75 CPU; node/postgres exporter mỗi service 128 MiB/0,25 CPU; notification compose cơ sở 192 MiB/0,5 CPU. Đây là giới hạn từng template. API/frontend/directory và toàn bộ business vendor chưa có tổng host được nghiệm thu; không lấy các số này làm dự toán VPS hoàn chỉnh.

Nguồn chính: `server/control/store.mjs`, `cluster.mjs`, `workers/*`, `docker-compose.control*.yml`, `docker-compose.roomqc*.yml`, `deploy/monitoring/*`, `deploy/booking-notifications/*`, `supabase/config.toml`. File `supabase/config.toml` hiện không khai báo đủ pool production.

Đã đọc [changelog Supabase](https://supabase.com/changelog), [hướng dẫn self-host Docker](https://supabase.com/docs/guides/self-hosting/docker), [chế độ kết nối Postgres](https://supabase.com/docs/guides/self-hosting/accessing-postgres). Changelog có thay đổi gateway mặc định sang Envoy; chọn vendor release phải đối chiếu template đúng release, không tự đổi bản pin đang dùng. Migration/advisory lock/backup không được chuyển tùy tiện sang transaction pool. Không nâng vendor hoặc chỉnh database chính trong packet này.

## 4. Kiểm chứng và giới hạn

| Bài kiểm | Kết quả | Phạm vi |
|---|---|---|
| Directory suite đầy đủ | 471 bài: 470 pass, 0 fail, 1 skip, exit 0; run `9124340cdc68` | Gồm PG readiness bằng API role và HTTP overload có tác động DB thật trên database riêng |
| Resource loader Linux | 8/8 pass, 0 skip, exit 0 | Container Node pin digest; readonly workspace, network none; phủ bài symlink Windows không có quyền tạo |
| Compiled cluster client/journal → HTTP → PG | 17/17, exit 0; run `bd199be07522` | Mất socket sau commit, replay, receipt recovery giữ nguyên key |
| Compiled alert client → HTTP → PG | 13/13, exit 0; run `06def0e15a0a` | Hồi quy nhận xử lý/tra kết quả; authority adapter tổng hợp |
| Metadata CLI và whitespace các file tracked sửa | Exit 0 | JSON mẫu kiểm công thức, không là deployment attestation |

Test HTTP chứng minh cả queue full, timeout, queued disconnect, active disconnect, FIFO/recovery, livez và shutdown. Bài PG dùng khóa thật giữ DB work: overflow không tạo row; thả khóa thì các yêu cầu hợp lệ tiếp tục, row counts đúng. Bài readiness dùng role API không superuser, từ chối cả max cao hơn thực và reserve thấp hơn thực, rồi phục hồi khi sửa metadata.

Source backend 212 file: `5f1bc498db636c1f8da8ee0bf636c4467c9f20de9748f539dabcea815f36feb8`. Hash không đổi trong full suite. Metadata mẫu và CLI được bind thêm riêng trong artifact. Các packet trước dùng backend 208 file là lịch sử; không khẳng định hash cũ đại diện source hiện tại.

Cả bốn nhóm kiểm cleanup độc lập còn 0 container/volume/network theo label của run. Không dùng database chính, không gửi provider notification thật. Test local không thay full native business sandbox, independent rebuild, live Auth/browser/Android, Linux VPS hoặc load/soak. Không cộng các số test thành số case sản phẩm đạt.

## 5. Phần T10 tiếp theo, thứ tự và điều kiện nhận

Các hàng dưới là chia nhỏ công việc của T10, không thêm task/case vào ledger gốc. BE/OPS/QA là vai trò cần phân công; chưa có reviewer ký nhận.

| Gói tiếp nhận | Đầu vào và cách triển khai | Bằng chứng bắt buộc để nhận | Phụ thuộc / vai trò |
|---|---|---|---|
| T10.a — inventory đúng bản chạy | Resolve compose bằng bộ biến thử không secret; liệt kê mọi service/image/replica/DB endpoint/pooler path; ghi rõ pool shared và direct, exporter, maintainer, backup/restore parallelism | Mỗi consumer có nguồn cấu hình và tổng theo từng DB; thiếu/sai môi trường/replica bị preflight chặn; không log env/DSN | Làm được local với fixture; OPS+BE, QA đối chiếu |
| T10.b — một budget ràng buộc mọi process | Dùng metadata chung đối chiếu API, health, probe, alert, business notifier và vendor; file mount readonly; production/staging không được dùng example hoặc bỏ budget qua preflight | Thử đổi pool/replica từng service, thiếu file, role/pooler sai, DB max thấp; deployment từ chối, không ảnh hưởng mapping cũ | Sau a; BE+OPS; không gọi là production enforced trước khi các đường launch đều kiểm |
| T10.c — budget host | Ghi host vCPU/RAM/disk/inode/IOPS/egress; cộng worst-case container limits, PG memory và connection work, OS/cache, logs, backup temp; đặt kill/close thresholds có version | Validator bằng fixture + số đo VPS thực; hết disk/inode, swap/OOM và backup peak dẫn tới đóng nhận mới/alert, không xóa dữ liệu | Validator local trước; số đo cần VPS; OPS+QA |
| T10.d — upload/report/Realtime và công bằng tenant | Inventory tất cả entrypoint kể cả gọi Auth/REST trực tiếp; server limits cho size/concurrency/channel/job/queue age; cancellation/deadline; tenant và global limits cùng áp | Tenant A chạy export/upload dày, B vẫn hoạt động trong ngưỡng đã chốt; overload không nhân job; recovery không tạo thao tác mới khi commit unknown | Sau inventory nghiệp vụ; BE+FE+QA; policy tham số khi chưa duyệt thương mại |
| T10.e — usage counter và quota đúng dữ liệu | Tìm writer/trigger hotel/room/staff/storage; tính trên dữ liệu thật; lock tenant/policy theo thứ tự, counter và audit cùng giao dịch; sửa lệch bằng đường reconcile có kiểm | Xóa→tạo lại; hai lệnh tranh suất; rollback; đổi gói khi chờ khóa; số counter = số thực, không cần refresh fixture để pass | Native business sandbox riêng; BE+QA; chưa áp limit mới cho khách thật |
| T10.f — workload và operating limit | Chốt manifest workload/SLO/error/headroom/cost trước run; ramp→burst→soak→recovery, cùng backup/report; ghi user active so với session | T23 đo ≥60 phút theo kế hoạch, p95/error/queue/CPU/RAM/IO/DB connections/cost đủ; báo số khách sạn ở tải đã đo | Sau a–e, Linux staging; OPS+QA; chưa hứa 100.000 concurrent |

Sau phần T10 local độc lập, tiếp tục T11 private `setup-status`/resume và T12 durable provisioning recovery/recheck theo dependency trong [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md). Đầu vào VPS/key/provider còn thiếu được giữ trong backlog, không bỏ qua các kiểm thử local có thể làm được.

## 6. Vận hành và rollback

Giữ public signup đóng cho đến khi các gate tương ứng được chấp thuận. Khi chuẩn bị staging: tạo profile riêng từ inventory thực; chạy CLI; mount readonly đường dẫn tuyệt đối; đối chiếu API pool/replica và actual directory max/reserve; sau đó mới chạy overload/recovery có fixture. Không gắn nhãn production cho example để vượt kiểm tra.

Nếu cấu hình queue/budget sai: đóng admission, sửa cấu hình đã review và restart theo drain; giữ workspace, routing, journal và receipt. Kiểm kết quả lệnh cũ trước retry cùng key/body. Không xóa reservation đã dispatch, không reset directory, không giảm limit dưới allocation để làm bài test xanh. Readiness fail không đồng nghĩa được bỏ mount hoặc bỏ kiểm budget.

**Nghiệm thu:** 70 case vẫn `not_run`, 122 release entry vẫn `unverified`; reviewer/signoff/gates giữ nguyên. Linux container test không chứng minh TLS/DNS, email inbox, offsite restore, cảnh báo mất host, công bằng tenant, pilot hoặc capacity trên VPS thật.
