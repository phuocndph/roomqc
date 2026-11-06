# T10.b — đích database thực và ngân sách chung PostgreSQL

Ngày 28/10/2026, Asia/Bangkok. Phạm vi toàn VPS + signup, đầu ra plan + nghiệm thu. **T10 vẫn partial.** [Artifact](../../../artifacts/roomqc-resource-database-local-2026-10-28.json) giữ source, proof và giới hạn; [runbook](roomqc-resource-database-runbook.md) giữ schema, quyền, cách chạy và xử lý lỗi.

## 1. Thay đổi đã triển khai

Bổ sung checker chỉ đọc và CLI cho identity/settings của đích attestor. Manifest đóng gắn với exact budget hash, ánh xạ đủ mọi database. Tài khoản kiểm phải được tính vào ngân sách, không dùng một kết nối kiểm không được khai báo.

Mỗi đích được đọc hai lượt tuần tự bằng role riêng có connection limit 1, trong transaction chỉ đọc và truy vấn catalog cố định. Xác nhận lineage/database OID/tên/role, không recovery, cờ quyền và max/reserved thực. Kết nối có deadline và session/TLS tường minh; `PG*` môi trường hoặc URL options không được đổi target/role/SQL. Trả lỗi an toàn, không đưa DSN/password/tên database vật lý/role vào report.

Khắc phục thiếu sót của tính ngân sách theo từng database: `max_connections` dùng chung theo máy chủ PostgreSQL. Cùng lineage phải cộng allocation của mọi database, lấy cap khai báo nhỏ nhất và reserve chung lớn nhất. Hai ID cùng OID bị từ chối. Không coi `system_identifier` là danh tính host duy nhất: bản sao/clone bị nhóm hoặc từ chối bảo thủ khi chưa chứng minh độc lập.

Đổi identity/settings, restart trong lúc đọc, đổi budget hoặc DSN file làm lượt kiểm bị từ chối. Đây là snapshot kiểm có phạm vi, không bảo đảm cấu hình sẽ không đổi sau đó. Checker không thực hiện DDL, cấp quyền, migration, restart hoặc sửa dữ liệu.

## 2. Bằng chứng cùng source

Backend **225 file**, SHA-256 **ba466d2e39e35803ac59f8f4dbbcfec6b7741d795ddf18242cc5c9d29e8e2940**. Các proof dưới giữ source trước/sau không đổi và native exit 0.

| Proof | Kết quả và giới hạn |
|---|---|
| [Directory + PostgreSQL riêng](../../../artifacts/roomqc-resource-database-directory-1b85d9ae8ca2-local-2026-10-28.json) | 536 tổng / **534 pass / 0 fail / 2 skip**, gồm 14 ca unit mới và 11 ca PostgreSQL mới; không thay full native business sandbox |
| [Linux resource regression](../../../artifacts/roomqc-resource-database-linux-c09c6d21e437-local-2026-10-28.json) | **62/62**, 0 skip; non-root, readonly, network none; observation doubles cho checker mới, không phải PostgreSQL TLS/VPS |

Hai Windows skip về symlink và quyền secret Unix được kiểm bằng suite Linux. Không cộng hai tổng thành số ca sản phẩm được nghiệm thu. [Live API trước đó](roomqc-resource-deployment-runtime-local-2026-10-28.md) vẫn là checkpoint đúng source cũ; chưa gọi đó là live proof mới cho toàn source225.

PostgreSQL thật là hai instance riêng trong Docker, mỗi instance có database fixture và marker riêng. Đã kiểm:

- Hai database cùng instance được cộng chung; hai instance có lineage khác được tách; aliases cùng đích và tổng vượt cap bị từ chối.
- Role riêng, chỉ đọc; CREATE TABLE bị PostgreSQL từ chối; marker và số bảng nghiệp vụ thử giữ nguyên.
- Max/reserved sai, thiếu EXECUTE tại đúng database, role membership và connection limit sai bị từ chối; khôi phục cấu hình đúng kiểm lại đạt.
- Endpoint dừng bị từ chối; khởi động lại kiểm đạt. Restart PostgreSQL thật giữa hai lượt đọc bị phát hiện; lượt kiểm mới ổn định đạt.
- CLI thật dùng secret files; môi trường `PGHOST/USER/DATABASE/PASSWORD/OPTIONS/SSLMODE/SSLNEGOTIATION/CLIENT_ENCODING/REPLICATION` giả không đổi đích/role; report không có thông tin xác thực.

## 3. Lịch sử chưa đạt và sửa fixture

Lượt diễn tập fixture đầu có 11 ca, 7 pass/4 fail. Một ca đổi ACL trong database `postgres`, trong khi đích cần kiểm là database khác và vẫn có PUBLIC grant. Các ca restart dùng tmpfs và host port Docker tự cấp, nên không giữ được điều kiện dữ liệu/endpoint để kiểm phục hồi.

Đã sửa **fixture sở hữu riêng**: đặt ACL tại đúng database, dùng named volume có nhãn sở hữu và host port loopback được cố định. Sau sửa 11/11 và full536 đạt. Không nới checker, không dùng role mạnh hơn, không bỏ ca restart, không suy lỗi fixture này thành lỗi dữ liệu primary. Lịch sử fail giữ trong artifact; không gộp vào kết quả final hoặc gán source mới cho lượt cũ.

## 4. Cleanup và trạng thái nghiệm thu

Kiểm theo cả nhãn directory và nhãn database-resource: **0 container / 0 volume / 0 network** còn lại. Linux cũng0. Chỉ xóa tài nguyên Docker có nhãn chính xác; không dùng recursive filesystem deletion. Các file fixture thử giữ lại có chủ ý theo giới hạn cleanup đã ghi trước đó; đây không phải container/volume đang chạy.

Không thay ledger/worksheet: **70 ca vẫn `not_run`, 122 release entries vẫn `unverified`**, reviewer/signoff/gate giữ nguyên. Hai hash được bảo vệ vẫn khớp. Không đụng dữ liệu primary, deploy VPS, gọi email/provider thật hoặc ký nghiệm thu thay người review.

`databaseTargetsVerified` và `observedServerBudgetsVerified` là đầu ra có phạm vi. **`databaseIdentityVerified`, `runtimeVerified`, `capacityProven`, `deploymentReady` vẫn false.** Hiện chưa bind DSN thực của native/vendor vào identity đã kiểm; chưa khép toàn T10.b, C09/C10 hoặc G05/G06.

## 5. Phiếu nhận tiếp theo

| Thứ tự | Việc làm và file đầu vào | Điều kiện nhận |
|---|---|---|
| 1 — vendor/pooler | Pinned Supabase Compose, `.env.example` và cấu hình từng image; inventory Auth/REST/Realtime/Storage/Functions/meta/Supavisor, tools/report/exporter/migration/backup | Mỗi consumer có cap server connections theo đúng release; tách client slots và PG server pools, nhân replica và pool theo database/role; thiếu cap không được coi đã phủ |
| 2 — consumer DSN binding | `resource-deployment*.mjs`, checker mới, native config/secret references và vendor adapter | Dùng đúng đường DSN mà process đã nạp, xác nhận pooler/direct target và target identity; credential rotation/restart/race có positive/negative/recovery; không chỉ so database ID tự khai báo |
| 3 — native worker live | Health/probe, alert và external booking entrypoint; migration/role/config của worker | Linux secret mode đúng; actual DB readiness, worker cached projection, sai pool/replica/role và restart/recovery trên fixture đầy đủ; live API cũ không thay proof worker |
| 4 — ghép deployment | Plan, runtime inventory, DB identity, vendor adapters và manifest cùng candidate | Tất cả consumer/instance/đích và hash liên kết được; không bỏ consumer để lấy exit 0; Linux TLS/topology vẫn phải kiểm đúng môi trường |
| 5 — T10.c–f | Host RAM/disk/IO/inode/headroom, queue/fairness, usage/quota và T23 workload | Policy/limit có version được duyệt; counters theo dữ liệu thực và atomic mutation; overload không chiếm hết tenant khác; operating limit chỉ chốt từ số đo |
| 6 — signup và vận hành | T11–T13 → T14–T17 → T18–T20 → T21–T25 theo dependency trong ledger | Setup-status riêng owner/resume, recovery, abuse/proxy; đủ đường click; installer/TLS/offsite restore; E2E web/Android, tải/soak, review và pilot ít nhất7ngày |

VPS/provider/key/quyết định thương mại chưa có giữ trong mục10 [bản bàn giao](roomqc-vps-signup-handoff-2026-10-28.md), tiếp tục phần độc lập. Không tự mở signup public hoặc đổi gate từ một bộ test local xanh.
