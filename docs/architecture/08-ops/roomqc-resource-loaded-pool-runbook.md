# Kiểm tra mẫu kết nối từ pool ứng dụng đang chạy

Bước opt-in của BG03/T10.b, sau [kiểm cấu hình credential](roomqc-resource-consumer-target-runbook.md). [Báo cáo ngày30/10](roomqc-resource-loaded-pool-local-2026-10-30.md) phân biệt proof thật và phần dùng doubles. Bước này lấy mẫu từ pool thực trong tiến trình ứng dụng, không đọc DSN mới rồi tạo một pool kiểm thay thế.

## Bật đúng phạm vi

Trong từng service native đã review, đặt `ROOMQC_RESOURCE_POOL_OBSERVATIONS: "true"`. Mặc định không có listener; giá trị khác true/false bị từ chối. Đây là thay đổi cấu hình triển khai cần recreate tiến trình theo quy trình vận hành; sửa file không tự bật trên container cũ.

Listener riêng chỉ bind `127.0.0.1:8098` bên trong container; **không publish cổng này hoặc đưa vào reverse proxy**. Main API không có route này. Chỉ Docker exec với quyền quản trị daemon mới gọi được đầu kiểm bên trong namespace ứng dụng. GET chính xác `/resource-targets`, không query string, không POST và không caller SQL/URL/DSN. Không chứa token, password, tên database hoặc LOGIN; vẫn coi fingerprint là thông tin vận hành nội bộ.

| Adapter | Pool được mượn |
|---|---|
| Control API | `ControlStore.pool` hiện hành |
| Health schema1 | Pool metrics của worker |
| Health schema2 | Pool metrics và probe-catalog riêng |
| Alert | Pool của AlertDeliveryStore |
| Provisioning | Pool của SetupWorkerStore |
| External notifications | Pool của BookingExternalWorker |

Summary rotator dùng phiên ngắn theo vòng installer nên chưa có adapter pool. Đặt true cho summary bị PLAN từ chối; cần giữ phần này chưa được phủ. Vendor, CLI bảo trì và các process ngoài native inventory chưa được kiểm qua đầu này. Không giảm inventory để có kết quả xanh.

## Tác động và giới hạn tài nguyên

Sampler giữ tham chiếu getter tới pool đang được runtime sử dụng, xác nhận pool max khớp resource projection startup. Nó mượn lần lượt một client từ mỗi pool, chạy transaction `REPEATABLE READ READ ONLY`, query catalog cố định và ROLLBACK. Không SET ROLE, đọc tệp credential, tạo pool/client mới, DDL hoặc ghi bảng nghiệp vụ. Tùy chọn read-only chỉ áp dụng transaction kiểm, không thay chế độ session của công việc khác.

Đầu status giới hạn một sample đang xử lý; request đồng thời nhận503/busy. Deadline tổng mặc định4giây. Nếu chờ pool quá hạn, giữ busy latch tới khi acquire muộn đã kết thúc và client được hủy; không xếp thêm hàng chờ vô hạn. Client gặp lỗi, quyền ngoài dự kiến, pool thay giữa lúc đọc hoặc timeout bị loại khỏi pool. Thành công thì trả client về pool sau ROLLBACK. Shutdown đóng listener, hủy sample và có thời gian chờ hữu hạn.

Kiểm này dùng slot trong pool runtime hiện có, **không tăng max pool**. Khi pool bận, mẫu có thể không đạt; không tăng cap để tránh lỗi kiểm. So sánh độc lập vẫn sử dụng attestor riêng được tính trong budget. Chạy các công cụ kiểm tuần tự theo quy trình đã review.

Quyền catalog của attestor không tự truyền sang LOGIN ứng dụng. Khi bật listener, phải review riêng quyền EXECUTE `pg_catalog.pg_control_system()` của từng LOGIN/pool trong đúng database. Thiếu quyền thì sample trả503 và loại client lỗi; công cụ không tự cấp quyền. Các bài native local dùng grant tường minh chỉ trên fixture sở hữu riêng, không phải migration hay bằng chứng cấu hình production đã sẵn sàng. Không thêm nhóm `pg_monitor`, quyền bảng nghiệp vụ hoặc quyền quản trị để làm sample đạt. Catalog200 vẫn không thay kiểm quyền nghiệp vụ, khóa phục hồi hoặc cấu hình kênh thông báo.

## Manifest và lệnh

Manifest gốc có đúng bốn trường:

| Trường | Nội dung |
|---|---|
| `schemaVersion` | `1` |
| `nativeManifest` | Toàn bộ manifest cho [runtime inventory](roomqc-resource-deployment-runtime-runbook.md), chứa các project native |
| `databaseManifest` | Toàn bộ [manifest attestor/database](roomqc-resource-database-runbook.md) được review độc lập |
| `bindings` | Tối đa128 mapping có đúng `project`, `service`, `databaseId`, `consumerId`, `role` |

Hai manifest cùng môi trường, file budget tuyệt đối và hash. Database manifest phải đủ mọi database trong budget. Bindings không chứa DSN; role là LOGIN dự kiến có nguồn review. Health schema2 cần hai binding của hai consumer. Mỗi replica được kiểm riêng bằng containerId dù mapping cùng service.

```text
node scripts/control-backend-resource-pool-check.mjs --help
node scripts/control-backend-resource-pool-check.mjs --manifest /etc/roomqc/review/native-pool-targets.json
```

Windows local dùng đường dẫn tuyệt đối tương ứng. CLI dùng cấu hình Compose đã resolve, inventory container/image/process/mount/network và loopback projection hiện hành; không start/stop/pull/build/deploy container. Tiếp theo kiểm reference database bằng attestor, lấy hai sample/pool bằng chương trình Node cố định qua Docker exec, rồi kiểm lại reference và toàn inventory. Không in Docker/driver error nguyên bản.

Report mẫu có process nonce mới mỗi lần khởi động listener, timestamp, resource profile startup và hash LOGIN/lineage/database identity/server settings. Inspector kiểm schema đóng, thời gian trong cửa sổ hữu hạn, đúng profile/pool max, LOGIN/database đã review, server settings/restart khớp reference. Thay process, pool, identity, reference hoặc container giữa lượt kiểm sẽ làm kiểm thất bại.

| Exit | Ý nghĩa |
|---|---|
| `0` | Các pool native được mapping có hai sample đạt; đọc cả `fullyCovered` và `unresolvedConsumers` vì inventory toàn stack vẫn có thể thiếu |
| `2` | Còn pool adapter chưa hỗ trợ, listener chưa bật hoặc thiếu expected LOGIN |
| `1` | Mismatch, không truy cập được, drift, quyền hoặc cấu hình không đạt |

## Phạm vi kết luận

`loadedPoolSamplesVerified:true` và `sampleExecutedInApplicationProcess:true` chỉ chứng minh **các session đã lấy mẫu** từ đối tượng pool thực, trong tiến trình và network namespace của ứng dụng. Hai sample có thể lấy lại cùng một client rảnh. Không chứng minh mọi client đã mở, mọi kết nối tương lai, pooler/direct topology hoặc proxy không định tuyến theo LOGIN/transaction. Attestor có thể dùng namespace khác; hash reference chỉ là đối chiếu identity/settings tại thời điểm đọc.

`system_identifier` vẫn là lineage, không phải host identity duy nhất. Docker daemon và image được tin cậy theo quy trình; chưa có chứng thực nguồn→image đầy đủ. Full-schema/readiness/signup/provider/backup và host capacity không được suy ra từ catalog query. Các cờ `allPoolConnectionsVerified`, `endpointDirectnessVerified`, `sourceToImageProvenanceVerified`, `runtimeVerified`, `databaseIdentityVerified`, `capacityProven`, `deploymentReady` và nghiệm thu sản phẩm vẫn false.

Health/probe/alert đã có [kiểm native schema/role và image local](roomqc-resource-worker-pools-local-2026-10-30.md):21 directory migration, hai LOGIN metrics/probe và LOGIN alert riêng; catalog thành công không thay readiness hoặc review quyền. Image đối chiếu241 file và lưu content ID; config là named-volume fixture, chưa chứng minh live Compose secret/bind hoặc TLS.

Setup/booking đã có [kiểm native trên đầy đủ schema](roomqc-resource-setup-booking-pools-local-2026-10-30.md): pool thực max2, profile/database/LOGIN khớp, catalog denial/restore và không bỏ qua readiness credential/channel. Setup chạy HTTP runtime trong runner; booking chạy daemon con thực; chỉ receiver local, budget và catalog grant thuộc fixture scope. Không suy thành live Compose/TLS hoặc total host capacity.

Tiếp theo: worker live Compose và TLS/custom CA; inventory vendor/maintenance/summary; topology/proxy và tổng server; RAM/CPU/disk/inode/WAL/IO/network, quota/admission/fairness và tải. Theo kế hoạch VPS/signup, chưa mở nhận khách public từ một exit0 của checker local.
