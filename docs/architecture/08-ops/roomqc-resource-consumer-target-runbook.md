# Kiểm tra đích database từ cấu hình của từng dịch vụ

**Tiếp theo ngày30/10:** [kiểm mẫu từ pool đang chạy](roomqc-resource-loaded-pool-runbook.md) đã có proof container thật cho Control API. Đây là bước opt-in riêng, mượn pool hiện hành trong namespace ứng dụng; chưa phủ mọi session/vendor/topology hoặc thay các giới hạn của bước dưới đây.

Đây là bước chỉ đọc của BG03/T10.b, bổ sung sau [ngân sách database](roomqc-resource-database-runbook.md) và [PLAN native/vendor](roomqc-resource-vendor-runbook.md). [Bằng chứng local ngày 30/10](roomqc-resource-consumer-targets-local-2026-10-30.md) ghi nguồn, kết quả và giới hạn. Chưa phải nghiệm thu kết nối đang được ứng dụng sử dụng, topology hoặc sức chứa VPS.

## Chuẩn bị

1. Chốt cùng một ngân sách cho hai manifest `consumerManifest` và `databaseManifest`: cùng môi trường, đường dẫn tuyệt đối và SHA256 của đúng bytes. Manifest database phải phủ đúng tất cả database trong ngân sách và có identity đã được review độc lập; không tự lấy identity mới từ đích cần kiểm rồi coi là đúng.
2. Mỗi database phải khai báo consumer `resource-attestor`, một replica, một pool max1, fixed0. Checker chỉ mở tối đa một session tại một thời điểm, dùng suất này kể cả khi kiểm bằng LOGIN ứng dụng. Không chạy đồng thời nhiều checker hoặc mượn pool runtime; công cụ hiện chưa có khóa ngăn các lần gọi từ những tiến trình khác nhau.
3. Rà các project Compose, file nội suy, profile, image và adapter theo runbook PLAN. Công cụ vẫn kiểm PLAN trước khi mở credential. Không bỏ consumer chưa được phủ để lấy kết quả xanh.
4. Chuẩn bị quyền đọc file cho người chạy. Các file nhạy cảm phải là file thường, không symlink/hardlink; trên Linux phải đạt kiểm owner/group/mode. Credential Compose/file được giữ riêng; không lưu JSON Compose đã resolve vào báo cáo hoặc terminal.
5. Tài khoản attestor riêng phải đạt ràng buộc cũ: LOGIN, CONNECTION LIMIT1, không membership hoặc cờ quản trị. LOGIN ứng dụng được phép có membership hợp lệ và connection limit khác1; checker vẫn từ chối các cờ superuser/createdb/createrole/replication/bypassrls. Điều này không thay review quyền gián tiếp.

Truy vấn catalog cố định cần đọc `pg_control_system()` tại đúng database. Thiếu quyền thì công cụ từ chối; không fallback sang postgres/service-role hoặc tự cấp quyền. Quyết định quyền nào được cấp ở môi trường triển khai phải được review riêng. Các quyền trong bài kiểm PostgreSQL chỉ được tạo trên fixture sở hữu riêng.

## Manifest

Tệp JSON gốc có đúng bốn trường:

| Trường | Nội dung |
|---|---|
| `schemaVersion` | `1` |
| `consumerManifest` | Toàn bộ manifest native/vendor đã review, không phải đường dẫn tới manifest |
| `databaseManifest` | Toàn bộ manifest database/attestor đã review |
| `bindings` | Tối đa128 mapping, mỗi mapping có đúng `project`, `service`, `databaseId`, `consumerId`, `role` |

`role` là tên SQL LOGIN dự kiến được review, không phải mật khẩu hoặc role tự đổi qua URL. Không có trường DSN ứng dụng thứ hai trong mapping. Selector phải khớp dịch vụ đang bật trong PLAN; selector thừa hoặc trùng bị từ chối. Thiếu mapping được báo `expected_login_missing`, không lấy credential attestor thay cho ứng dụng.

Với health schema2, khai báo hai binding cùng service nhưng hai consumer `health-worker` và `probe-catalog`, mỗi consumer có LOGIN/secret riêng. Với summary rotator, khai báo hai binding cùng service/consumer nhưng hai databaseId directory/business; LOGIN phải khớp `expected.role` trong installer metadata tương ứng.

## Nguồn kết nối được hỗ trợ

| Dịch vụ/consumer | Credential được đọc |
|---|---|
| Control API | `ROOMQC_CONTROL_DATABASE_URL` trong service Compose đã resolve |
| Health worker | File được chỉ bởi `ROOMQC_HEALTH_DATABASE_URL_FILE` |
| Probe catalog | File được chỉ bởi `ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE` |
| Alert worker | File được chỉ bởi `ROOMQC_ALERT_DATABASE_URL_FILE` |
| Provisioning worker | File được chỉ bởi `ROOMQC_SETUP_DATABASE_URL_FILE` |
| Booking external notifications | `databaseUrlFile` trong metadata `/etc/roomqc/booking-external.json`; không đọc provider token |
| Summary rotator | Policy → installer metadata → hai `dsnFile` directory/business; không đọc signer/recovery credential |
| Auth/REST được catalog hỗ trợ | `GOTRUE_DB_DATABASE_URL` / `PGRST_DB_URI` của service đã resolve |

File phải đi qua đúng bind readonly `create_host_path:false` hoặc Compose secret có `file` tuyệt đối. Summary chỉ cho file con trực tiếp trong private directory đã kiểm. Secret external hoặc mapping không xác định bị từ chối. Booking có `databaseCaFile` hiện được giữ `connection_recipe_unresolved`; không bỏ CA rồi tuyên bố đã tái hiện TLS. Vendor/consumer khác vẫn được báo chưa hỗ trợ theo PLAN.

Local chỉ nhận endpoint loopback/host.docker.internal và sslmode rõ ràng. Staging/production yêu cầu `verify-full`, xác minh certificate/hostname; không nhận URL options tùy ý hoặc session/role injection. Các quan sát sẽ được thực hiện từ network namespace của **checker**. Docker DNS riêng chỉ truy cập được nếu người vận hành bố trí namespace/phương thức truy cập phù hợp đã review; không đổi `db` thành `localhost` để lấy kết quả đạt rồi coi là chứng minh cho ứng dụng.

## Chạy và đọc kết quả

Từ đúng checkout được review, Node >=22 và Docker Compose:

```text
node scripts/control-backend-resource-consumer-target-check.mjs --help
node scripts/control-backend-resource-consumer-target-check.mjs --manifest /etc/roomqc/review/consumer-targets.json
```

Windows local sử dụng đường dẫn manifest tuyệt đối của Windows. Công cụ resolve Compose theo các file/profile đã khai báo và môi trường tối thiểu; không tự lấy `.env` hoặc các biến ROOMQC/COMPOSE tùy ý từ terminal. Chỉ chạy `compose config`, không start/build/pull/exec container.

Sau khi kiểm toàn bộ file/DSN/mapping, chương trình đọc catalog hai lượt tuần tự: attestor riêng cho từng database rồi các LOGIN ứng dụng. Đối chiếu lineage, database OID/tên, current/session role, recovery, read-only, cờ quyền, max/reserved và thời điểm PostgreSQL khởi động. Cộng ngân sách mọi database dùng chung lineage theo cách bảo thủ. Cuối lượt đọc lại hash credential/metadata/budget và resolve lại Compose; drift bị từ chối.

| Exit | Ý nghĩa |
|---|---|
| `0` | Tất cả đích cấu hình được khai báo của các recipe hỗ trợ đã được kiểm; **không** có nghĩa toàn inventory, runtime hoặc VPS đạt |
| `2` | Đã kiểm nhưng còn mapping/recipe đích chưa được phủ; đọc `unresolvedTargets` |
| `1` | Cấu hình, file, credential, quyền, quan sát, ngân sách hoặc drift không đạt; chỉ có mã lỗi an toàn, không in lỗi driver/Docker nguyên bản |

Report chỉ công bố selector và hash identity/role, không trả DSN/password/tên database vật lý/LOGIN. `unresolvedServices` và `unresolvedConsumers` giữ nguyên từ PLAN; đọc chúng cùng `configuredPlanFullyCovered`. `allConfiguredTargetsVerified:true` không xóa các thiếu sót inventory này.

## Giới hạn phải giữ khi nghiệm thu

- Không kiểm pool đã nạp trong tiến trình đang chạy hoặc chứng minh cùng namespace mạng với ứng dụng. File đúng không bảo đảm container hiện hành đã reload credential.
- Không chứng minh endpoint trực tiếp, không loại trừ proxy chọn đích theo LOGIN/transaction. `system_identifier` là lineage, không phải danh tính host duy nhất.
- Hai quan sát và hash phát hiện một số thay đổi trong lượt kiểm; không khóa cấu hình, bảo đảm sau khi kết thúc hoặc thay thế kiểm luân chuyển credential khi đang phục vụ.
- Query dùng tùy chọn session chỉ đọc do checker đặt. Không khẳng định ứng dụng thường trực cũng luôn read-only.
- Không review đầy đủ role graph/definer/trigger, đo host/workload, thử email/provider hoặc triển khai release.

Các cờ `applicationConnectionNamespaceVerified`, `sourceToImageProvenanceVerified`, `runtimeVerified`, `databaseIdentityVerified`, `capacityProven`, `deploymentReady` và nghiệm thu sản phẩm vẫn false. Việc tiếp theo: nối identity với pool đã nạp và namespace ứng dụng, khép vendor/maintenance inventory, sau đó ghép kiểm host/quota/tải theo kế hoạch toàn phạm vi.
