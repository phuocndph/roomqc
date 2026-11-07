# T10 — kiểm danh tính đích PostgreSQL và ngân sách chung máy chủ

**Bổ sung ngày30/10:** có [công cụ kiểm đích từ credential cấu hình của dịch vụ](roomqc-resource-consumer-target-runbook.md) và [proof local](roomqc-resource-consumer-targets-local-2026-10-30.md). Đây là bước opt-in mở session chỉ đọc riêng sau PLAN; không chứng minh pool đang chạy, namespace mạng hoặc topology. Các giới hạn của bước hiện tại dưới đây giữ nguyên.

Phạm vi là đích kết nối của tài khoản kiểm tra, tiếp sau [plan native](roomqc-resource-deployment-preflight-runbook.md) và [runtime native](roomqc-resource-deployment-runtime-runbook.md). Không dùng ba kết quả rời nhau để tự kết luận DSN của dịch vụ nghiệp vụ đã nối đúng đích. Phần nối đó vẫn phải triển khai và kiểm riêng.

## 1. Vì sao cần kiểm theo máy chủ

`max_connections` là giới hạn của một máy chủ PostgreSQL, dùng chung cho các database trên đó. Mỗi database có một ngân sách hợp lệ riêng chưa đủ: nếu hai database cùng máy chủ được phép 40 kết nối mỗi bên và máy chủ chỉ có 70 slot, tổng 80 đã vượt trước khi tính dự phòng.

Checker đọc `system_identifier`, OID và tên database, role hiện tại/session role, max/reserved connections, recovery và thời điểm PostgreSQL khởi động. `system_identifier` nhận diện dòng dữ liệu PostgreSQL, có thể trùng ở bản sao vật lý/clone. Nó không phải bằng chứng mỗi host là một instance độc lập. Vì vậy:

- Cùng lineage và cùng OID: từ chối ánh xạ hai database ID vào một đích.
- Cùng lineage, khác database: cộng tất cả allocated connections; dùng mức cap nhỏ nhất đã khai báo và mức reserve lớn nhất, chỉ tính reserve chung một lần.
- Cùng lineage nhưng max/reserve/thời điểm khởi động khác nhau: từ chối vì topology chưa rõ. Không tự cấp thêm capacity cho clone.
- Standby/recovery: từ chối trong phiên bản này. Hai lineage khác nhau có nhóm ngân sách riêng.

Công thức mỗi nhóm: `sum(allocatedConnections) + max(reservedConnections) <= min(declaredMaxConnections) <= observedMaxConnections`. Mọi reserve khai báo phải phủ tổng slot superuser và reserved thực. Reserve là headroom chung; kết nối định kỳ cho backup/migration/monitor phải khai báo ở consumer, không giấu trong reserve.

## 2. Chuẩn bị

Chỉ dùng trên fixture được sở hữu hoặc môi trường đã được phép. Không chạy vào database primary để thử lỗi. Operator phải lấy identity từ inventory đáng tin và ghi source/config/manifest hash trong hồ sơ, không chép kết quả sai đích thành expected để vượt kiểm.

1. Chốt resource budget hiện hành và SHA-256 đúng bytes. Bổ sung consumer `resource-attestor` cho **mọi database**: replicas 1, đúng một pool max 1, fixed connections 0; phần tổng phải còn đủ chỗ.
2. Tạo tài khoản kiểm riêng tại từng máy chủ: LOGIN, CONNECTION LIMIT 1, không SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS và không thuộc role khác. Cấp CONNECT và quyền EXECUTE `pg_catalog.pg_control_system()` nếu ACL của database yêu cầu; không cấp bảng nghiệp vụ hay `pg_monitor` để chữa lỗi. ACL function là theo database. PUBLIC/default grants khác cần được review theo baseline triển khai, checker không chứng nhận toàn bộ ACL.
3. Tạo DSN file riêng cho từng database ID, ở ngoài repo. Linux yêu cầu quyền đọc đúng UID/GID chạy checker, không world read, không group/other write; không nới quyền để vượt kiểm trên Docker Desktop. Windows cần ACL phù hợp, kiểm POSIX mode không áp dụng ở đây.
4. DSN phải có host, user, password và database trùng manifest. Chỉ có một tham số `sslmode`. Local chỉ nhận host loopback/host.docker.internal và `disable` hoặc `verify-full`. Staging/production bắt buộc `verify-full`, certificate chain và hostname được kiểm; phiên bản này không nhận đường dẫn CA/cert trong URL. CA riêng phải được quản lý bằng trust store đã review.
5. Ghi manifest theo schema ở mục 3. Không sử dụng DSN qua transaction pooler để thay identity của từng dịch vụ. Checker chưa chứng minh một endpoint được gọi là direct thực sự bypass mọi proxy.

Không cung cấp mật khẩu, DSN hoặc khóa qua chat. Không dùng role API/worker/service_role làm tài khoản attestor. Checker cũng không phải daemon: hai operator chạy đồng thời có thể chạm connection limit 1 và phải chạy lại tuần tự.

## 3. Manifest và cách chạy

Manifest JSON đóng, không nhận trường lạ; 2–32 database và ánh xạ đầy đủ resource budget, không thừa/thiếu ID. Tất cả đường dẫn phải tuyệt đối:

```json
{
  "schemaVersion": 1,
  "environment": "staging",
  "budgetFile": "/etc/roomqc/resource-budget.json",
  "budgetSha256": "REPLACE_WITH_REVIEWED_EXACT_64_LOWERCASE_HEX",
  "databases": [
    {
      "databaseId": "directory-main",
      "dsnFile": "/run/secrets/resource-directory-dsn",
      "expected": {"systemIdentifier":"1","databaseOid":"1","databaseName":"roomqc_directory","role":"roomqc_resource_attestor"}
    },
    {
      "databaseId": "business-main",
      "dsnFile": "/run/secrets/resource-business-dsn",
      "expected": {"systemIdentifier":"1","databaseOid":"2","databaseName":"roomqc_business","role":"roomqc_resource_attestor"}
    }
  ]
}
```

Đây là cấu trúc minh họa, không phải identity hoặc profile triển khai hợp lệ. Thay toàn bộ giá trị từ inventory được review, không chỉ hash. Consumer trong example budget cũ chưa có attestor; phải khai báo và tính lại trước khi dùng checker.

```text
node scripts/control-backend-resource-database-check.mjs --help
node scripts/control-backend-resource-database-check.mjs --manifest /etc/roomqc/resource-database-manifest.json
```

Exit 0 chỉ có nghĩa đích attestor, settings quan sát và ngân sách nhóm bảo thủ khớp. Exit 1 là từ chối/không kiểm được; stdout chỉ trả mã lỗi cho phép. Không có chế độ tự sửa, tạo role, migration, restart, deploy hoặc cấp quyền.

Mỗi phiên dùng một `pg.Client`, không dùng pool, tối đa một phiên checker tại một thời điểm. Trước lần kết nối đầu tiên, tất cả DSN/metadata phải hợp lệ. Truy vấn catalog cố định chạy trong transaction READ ONLY, có connect/query/statement/lock/deadline bound; đóng phiên xong mới mở phiên tiếp. Cấu hình session/TLS/target được cung cấp tường minh, không để `PGOPTIONS`, `PGHOST`, `PGUSER` hay tùy chọn URL đổi role/đích/truy vấn.

Đọc hai lượt tuần tự; identity, quyền, settings hoặc postmaster timestamp đổi thì từ chối. Kiểm lại hash budget và DSN file sau lượt đọc. Đổi secret/profile trong lúc chạy cần một lượt kiểm mới; checker không tự đồng bộ hay áp cấu hình mới cho process đang chạy.

## 4. Đọc kết quả và xử lý lỗi

Report chỉ xuất database ID, lineage hash và số ngân sách. Không xuất DSN, password, tên database vật lý, role hoặc raw lỗi PostgreSQL. `databaseTargetsVerified` và `observedServerBudgetsVerified` có thể true. **`databaseIdentityVerified`, `runtimeVerified`, `capacityProven`, `deploymentReady` vẫn false** vì consumer chưa nối tới identity đã đo và chưa có proof toàn stack/tải.

| Nhóm mã | Xử lý |
|---|---|
| MANIFEST / MAPPING / PROFILE / ENVIRONMENT | Sửa inventory đã review; ghi lại profile/manifest/source; không bỏ database để lấy exit 0 |
| ATTESTOR_UNACCOUNTED | Bổ sung consumer kiểm và tính lại ngân sách, không dùng slot dự phòng ngầm |
| DSN / SECRET / READ_FAILED | Kiểm secret reference, ACL, TLS, quyền catalog, đường mạng và endpoint; không in DSN/raw error ra báo cáo |
| IDENTITY_MISMATCH / DUPLICATE_TARGET / LINEAGE_AMBIGUOUS | Dừng chứng nhận topology; xác minh cùng host/lineage/database, standby/clone và inventory; không tự tăng cap |
| ROLE / SETTINGS / SERVER_OVERCOMMITTED | Điều chỉnh đúng role/giới hạn deployment được review hoặc giảm allocation; checker không sửa database |
| OBSERVATION_DRIFT / SECRET_DRIFT | Chờ hoàn tất thao tác vận hành rồi kiểm lại từ đầu; giữ lịch sử lượt chưa đạt |

## 5. Nghiệm thu phần này và việc tiếp theo

[Bằng chứng local](roomqc-resource-database-local-2026-10-28.md) phải giữ source trước/sau, lệnh/exit/count, kiểm marker không đổi, role denial, stop/restart/recovery và cleanup exact-owned. Các unit/double khác kiểm SQL thực. Chứng chỉ TLS/VPS và vendor/consumer binding chưa được nghiệm thu từ fixture local.

Thứ tự còn lại T10.b: release-bound vendor/server-pool accounting → bind DSN native/vendor tới target identity → live health/probe/alert/external worker → Linux secret/TLS/topology → ghép plan/runtime/database proof theo cùng candidate. T10.c–f tiếp host RAM/IO, fairness/backpressure, usage/quota và workload. Bộ 70 ca, 122 release entries, người review/signoff và gates giữ nguyên cho tới đủ bằng chứng đúng môi trường.

Tham khảo PostgreSQL 16 đã đối chiếu: [connection settings](https://www.postgresql.org/docs/16/runtime-config-connection.html), [control data functions](https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-PG-CONTROL).
