# Runbook — native và vendor consumer plan

Phạm vi T10.b, kiểm chỉ đọc. [Kết quả local](roomqc-resource-vendor-local-2026-10-28.md) ghi source, bài thử, rehearsal chưa đạt và giới hạn.

## 1. Đầu vào

Manifest JSON theo `resourceConsumerManifest` trong `server/control/resource-vendor.mjs`: `schemaVersion`, `environment`, `budgetFile` absolute, `budgetSha256`, `vendorCatalogId`, `nativeProjects`, `vendorProjects`. Project có `id`, danh sách absolute `files`/`envFiles`, `profiles`, `services`; service có `name`, `adapter`, `databaseId`, `image` dạng digest. Không ghi credential trong manifest; file Compose/env được resolve có thể chứa secret và phải được quản lý như cấu hình riêng.

Budget theo `deploy/control-resource-budget.example.json`. Bản example không phải cấu hình VPS đã được duyệt. Dùng đúng catalog và image; tag hoặc image khác không được mượn kết quả của release cũ.

## 2. Chạy và đọc kết quả

```powershell
node scripts/control-backend-resource-consumer-preflight.mjs --help
node scripts/control-backend-resource-consumer-preflight.mjs --manifest 'C:\roomqc-private\consumer-manifest.json'
```

Đường dẫn trên là ví dụ; thay bằng file thực trong môi trường đang kiểm.

| Exit | Ý nghĩa và thao tác |
|---|---|
| 0 | Các consumer được khai báo đã map đủ vào budget plan. Vẫn chưa phải runtime, DB identity, capacity hoặc deployment acceptance |
| 2 | Đã kiểm nhưng còn `unresolvedServices`/`unresolvedConsumers`; giữ danh sách còn thiếu, chưa ký toàn T10.b |
| 1 | Manifest/budget/config/recipe/replica/target không hợp lệ; xử lý mã lỗi an toàn và chạy lại sau sửa có căn cứ |

CLI không start/build/pull/exec container, không query DB hoặc gọi provider. Không publish raw `docker compose config`: kết quả resolve có thể chứa DSN/password. Đầu ra đã lọc chỉ có hash đích cấu hình, không chứng minh đích DB thực.

## 3. Điều kiện riêng của adapter

Auth cần `GOTRUE_DB_DRIVER=postgres`, `GOTRUE_DB_CONN_PERCENTAGE=0`, max pool dương và idle cap không vượt max. PostgREST cần pool dương, `PGRST_DB_CONFIG=false`, channel true/false tường minh; channel true cộng 1 fixed connection/replica. Manifest chỉ hỗ trợ shape image/command/config đã review; mount/entrypoint/loader hoặc override ngoài recipe bị từ chối.

Các URI được kiểm có `sslmode` tường minh; staging/production cần `verify-full`. Kiểm cú pháp không kiểm được certificate, CA, hostname hoặc quyền truy cập thực; các phần đó thuộc runtime/DB binding và nghiệm thu Linux.

### Storage: một project cố định, nhiều khách sạn RoomQC

Catalog hiện hành `supabase-selfhosted-v0-8-3-resource-review-realtime-20261030` giữ recipe Storage v1.81.0 theo image digest đã review. Chỉ hỗ trợ entry point mặc định `node dist/start/server.js`, một worker, backend file và đúng một volume/bind dữ liệu tại `/var/lib/storage`. Không mount source, `.env`, loader hoặc đổi thư mục chạy. Single-tenant của Storage là một Supabase project, không giới hạn một khách sạn trong RoomQC.

Khai báo `DATABASE_ENGINE=postgres`, `WORKERS_NUM=1`, `DATABASE_MAX_CONNECTIONS` nguyên dương. Đặt **cả tên chính và alias** thành `false`: `MULTI_TENANT`, `IS_MULTITENANT`, `PG_QUEUE_ENABLE`, `ENABLE_QUEUE_EVENTS`; thêm `PG_QUEUE_WORKERS_ENABLE`, `VECTOR_ENABLED`, `VECTOR_STORE_MIGRATIONS_ENABLED`, `ICEBERG_ENABLED`, `DATABASE_ENABLE_QUERY_CANCELLATION`, `DATABASE_TLS_SESSION_RESUMPTION` đều `false`. Không có URL pool/metadata/queue/vector khác hoặc discovery ECS/EKS. `STORAGE_BACKEND=file`, `FILE_STORAGE_BACKEND_PATH=/var/lib/storage`. Đây là recipe giới hạn hiện tại; không tắt tính năng đang dùng trong triển khai thật chỉ để được kiểm đạt.

Consumer `storage` phải có pool `main` đúng max cấu hình và **2 fixed connections/replica**: một pubsub và một migration khởi động. Migration diễn ra trước HTTP/pubsub nhưng được dự phòng riêng một cách bảo thủ; steady state dự kiến là `max + 1`, allocation là `max + 2`. Không dùng riêng `DATABASE_MAX_CONNECTIONS` làm tổng.

Recipe chỉ xác nhận **allocation cấu hình**, không là trần tuyệt đối của session trên server: pg-listen 1.7.0 gọi `end()` của client cũ mà không await khi reconnect. Session đang đóng, sự cố mạng, triển khai chồng phiên bản và tác vụ bên ngoài phải được kiểm riêng trong inventory/runtime/server. Các cờ `runtimeVerified`, `databaseIdentityVerified`, `capacityProven`, `deploymentReady` vẫn false. Cấu hình Storage ngoài recipe giữ unresolved hoặc bị từ chối rõ ràng.

Kiểm tích hợp có thể chạy bằng `node scripts/test-control-backend-sandbox.mjs --run --diagnostic storage-resource`. Chỉ dùng sandbox mới có ownership: đầy đủ schema, actual Storage HTTP/file backend, lock để bão hòa pool, header tenant giả, terminate listener và restart container. Budget trong diagnostic chỉ là projection Storage, không tính đủ các dịch vụ khác vẫn chạy trong sandbox. Không chạy trên database đang phục vụ.

### Realtime: kiểm kê một phần, chưa có tổng kết nối được nhận

Image v2.143.3 đã pin và 27 nguồn công khai được ghi trong catalog. PLAN trả `inventory` cho process mặc định hoặc `/app/bin/server`; cấu hình process/mount/loader ngoài recipe bị từ chối. `poolPlanVerified=false`, `plannedServerConnections=null`, `fullyCovered=false` và exit2 được giữ cho Realtime; không lấy pool metadata để khớp budget toàn dịch vụ.

`DB_POOL_SIZE` chỉ là metadata Repo (mặc định5); `DB_REPLICA_POOL_SIZE` cấu hình read replica (mặc định5). Application chỉ khởi chạy Repo được chọn, không khởi chạy cả danh sách module replica. Khi khác master region, PLAN chưa xác minh được lựa chọn thực tế nên `activePoolMax=null`. PostgreSQL discovery, release migration, seed và các đường tác vụ khác phải kiểm riêng.

Tenant Realtime là một Supabase project, không phải mỗi khách sạn RoomQC. Các pool dữ liệu lấy từ hàng `postgres_cdc_rls` đã lưu, có thể khác cấu hình seed/Compose. Với một cây process có đủ đường dữ liệu: Connect dùng `db_pool` (mặc định1), subscription manager1, subscriber pool lấy đúng khóa vendor **`subcriber_pool_size`** (mặc định4), RLS poller1 và broadcast replication1. API công khai dịch `postgres_changes_pool` sang khóa này; trường `subs_pool_size` đã lưu bị SubscriptionManager ghi đè. Trường vắng dùng4; nếu khóa có giá trị null/false thì helper vendor rơi về1. Không tự sửa chính tả tên khóa trong dữ liệu.

Ví dụ mặc định có7 client sessions và1 replication session theo cấu hình của một cây process. Không nhân thành tổng toàn cụm nếu chưa biết tenant/process thực, triển khai chồng phiên bản và số tác vụ đồng thời. Probe1, migration2, Janitor1 mỗi tác vụ, teardown và truy vấn dashboard còn cần kiểm concurrency. Health dùng pool Connect đã có; không cộng thêm một pool chỉ vì helper có tên `realtime_health_check`. Health cũng có thể yêu cầu migration khi tenant chưa được nâng cấp, nên vẫn phải tính phần migration riêng.

Riêng `tenant_pool_requirements` dùng **`subs_pool_size`**, không phải khóa `subcriber_pool_size` của manager. Inventory tách `vendorReadinessEstimate` khỏi cấu hình cây process thực. Ví dụ `db_pool=3/subcriber_pool_size=2/subs_pool_size=99` có8 sessions dữ liệu theo cấu hình nhưng helper ước lượng110, nhân95% làm tròn thành105 rồi yêu cầu available>105. Đây không phải kiểm admission toàn cụm. Không bỏ hoặc tăng max_connections để che sự lệch khóa; trước triển khai cần cấu hình tenant và lifecycle được kiểm thống nhất. Cả hai giá trị được quan sát riêng, không tự chép cấu hình seed vào chỗ dữ liệu đã lưu.

`SEED_SELF_HOST=true` chạy seed mỗi lần container khởi động; nguồn vendor xóa rồi tạo lại tenant cùng external_id và có thể mất tùy chỉnh đã lưu. PLAN ghi `self_host_seed_deletes_and_recreates_existing_tenant`; cần lifecycle bootstrap riêng và kiểm bảo toàn cấu hình trước nghiệm thu triển khai. Không tắt seed trên backend rỗng rồi coi việc khởi tạo đã hoàn thành. `ssl_enforced=true` của tenant đi qua `verify_none` ở phiên bản này; không coi `DB_SSL=true` hoặc CA metadata là bằng chứng TLS xác minh peer cho tenant.

`realtimeResourceSnapshotSource()` dùng `rpc` của node đang chạy để đọc tenant settings hiện có, chỉ xuất pool, boolean và hash; không xuất password, host, tên DB hoặc tenant ID. Không dùng `eval` để vô tình chạy thêm application/pool. Parser giới hạn256 tenant và từ chối dữ liệu thiếu, trùng hoặc chứa trường ngoài hợp đồng. Snapshot cấu hình không tự chứng minh pool đã nạp, DB identity hoặc trần session.

Kiểm tích hợp riêng: `node scripts/test-control-backend-sandbox.mjs --run --diagnostic realtime-resource`. Chỉ dùng database/container fixture có ownership. Giữ Janitor/discovery/seed của baseline; kiểm actual WebSocket, các pool quan sát trên PostgreSQL, health, thay cấu hình đã lưu, reload và restart. Diagnostic không thay full E2E, hard ceiling hoặc triển khai VPS. [Kết quả và giới hạn](roomqc-resource-realtime-local-2026-10-30.md).

## 4. Xử lý phần chưa biết

Không đặt replica 0 hoặc xóa consumer để lấy exit 0 khi service thực còn chạy. Không dùng max client connection của pooler làm giới hạn kết nối PostgreSQL. Realtime/Meta/Functions/Supavisor, Storage ngoài recipe và công cụ chưa review giữ unknown, có người nhận và proof cần bổ sung.

Khi đổi image, config, source, process count hoặc budget, phải tạo packet đúng candidate mới. Giữ proof cũ theo source cũ. Các file verifier mới không tự bật admission/public signup, sửa thương mại hay thay quyết định gate.

### Image RoomQC Realtime giữ cấu hình

[Bootstrap đã kiểm local](roomqc-realtime-bootstrap-local-2026-10-30.md) có builder và overlay riêng; giữ seed/migration/Janitor với create-if-missing. [Runbook](roomqc-realtime-bootstrap-runbook.md) mô tả adoption và giới hạn. Image dẫn xuất không được mượn recipe/digest vendor cũ: managed-image PLAN/full inventory/TLS vẫn mở; không tự bỏ qua kiểm image hoặc nhận sức chứa từ bản sửa này.

### Kiểm image dẫn xuất trong PLAN

[Managed image đã kiểm local](roomqc-realtime-managed-image-local-2026-10-30.md) nhận riêng image bằng no-cache rebuild/immutable ID, từ chối label giả. [Runbook](roomqc-realtime-managed-image-runbook.md) giữ opt-in, mã kết quả và giới hạn. Các đoạn trước mô tả checkpoint lịch sử; toàn inventory/TLS/host capacity vẫn mở.
