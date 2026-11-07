# Vận hành thông báo booking bằng Push và Telegram

Tài liệu dành cho người trực RoomQC. Các lệnh bên dưới là quy trình triển khai
sau khi đã duyệt đúng môi trường; việc thêm tài liệu không bật provider hoặc
migrate database đang phục vụ. Kết quả local và các giới hạn được ghi tại
[biên bản kiểm chứng](roomqc-booking-notifications-external-local-2026-10-27.md).

**Bổ sung901:** [diễn tập563→564 có dữ liệu](roomqc-booking-notifications-upgrade-local-2026-10-27.md)
đã đạt27/27local với rollback/backlog/replay. Các mục nói upgrade chưa kiểm
dưới đây là điều kiệnproduction hoặc lịch sử trước901; không suy đã nghiệm thu
host/OS/mount/backup, lịch sửschema khác563 hoặc nâng cấp khi có tải.

## 1. Phạm vi và các trạng thái cần hiểu

Nguồn thông báo được ghi cùng giao dịch nhận/trả phòng. Worker xử lý bản chụp
đích nhận theo từng sự kiện; kiểm lại quyền, khách sạn, đích và cấu hình trước
HTTP. Kênh trong ứng dụng có dispatcher riêng. Đây chưa phải dispatcher tổng
quát cho mọi workflow, email hoặc webhook của sản phẩm.

| Trạng thái đích | Ý nghĩa | Việc người trực làm |
|---|---|---|
| pending | Chờ xử lý hoặc tới hạn thử lại | Kiểm readiness, bộ đếm và availableAt; không tự tạo thêm sự kiện |
| leased | Worker đang giữ công việc | Chờ hết thời gian hữu hạn; kiểm tiến trình và lease, không sửa SQL thủ công |
| accepted | Provider đã chấp nhận yêu cầu | Không gửi lại; chưa chứng minh thiết bị nhận hoặc người dùng đọc |
| rejected | Bị từ chối rõ ràng hoặc hết ngân sách thử | Xem mã an toàn; sửa nguyên nhân, đối soát trước khi retry |
| blocked | Kênh chưa được cấu hình/bật đúng | Cấu hình rồi xử lý từng đích đủ điều kiện; enable không tự hồi sinh toàn bộ |
| obsolete | Quyền, khách sạn hoặc đích đã thay đổi | Không gửi sang đích mới ngoài bản chụp; đối soát nghiệp vụ |
| unknown | Không biết provider đã nhận hay chưa | Không tự retry; người trực chọn suppress hoặc chấp nhận nguy cơ trùng |
| resolved | Người trực đã kết thúc xử lý đích | Giữ bằng chứng quyết định; không đổi tên thành accepted/delivered |

429 là phản hồi từ chối có thể thử lại: tối đa5attempts, Retry-After bị chặn
trên3600giây. DNS/preparation có ngân sách riêng tối đa5lần, chưa tính là đã
gửi. Timeout, mất kết nối, 5xx hoặc response không xác minh được thành unknown.
Push410 chỉ vô hiệu subscription vẫn khớp bản chụp đã khóa.

## 2. Đầu vào phải chuẩn bị trước khi bật trên Linux

- Candidate/schema đúng phiên bản; đã diễn tập upgrade có dữ liệu và rollback.
  Không chỉ dựa vào replay schema mới. Theo dõi nguồn cũ external_plan_version0
  riêng; hiện không tự backfill hoặc tự gửi lại chúng.
- Image được build từ source đã review và khóa bằng digest. Dockerfile hiện có
  tại `server/control/Dockerfile`, context là gốc repository; image đặt code
  phẳng tại `/app`, gồm thư mục `workers/`. Không nhầm đường dẫn repository
  `server/control/...` với đường dẫn trong image.
- Hai login database khác nhau: worker chỉ kế thừa
  `roomqc_booking_external_notifier`; operator chỉ kế thừa
  `roomqc_booking_notification_operator`. Login không SUPERUSER, CREATEDB,
  CREATEROLE, REPLICATION, BYPASSRLS; không thêm role khác hoặc quyền table,
  column, CREATE schema. Không cấp service_role cho hai công cụ này.
- Mật khẩu/DSN do quản trị tạo và lưu qua kênh secret. Không đưa mật khẩu vào
  shell arguments, command JSON, git, chat hoặc báo cáo. Giới hạn mạng kết nối
  database theo host cần thiết; TLS verify-full và CA tin cậy bắt buộc production.
- Push cần cặp VAPID khớp cấu hình frontend/subscription; Telegram cần bot token,
  appOrigin HTTPS đúng và nhóm đích đã được phép nhận. Không dùng khóa thử của
  fixture. Chọn kênh đã sẵn sàng; kênh còn thiếu giữ disabled.
- Ngân sách connection phải tính tổng API/Auth/REST/workers/monitoring/operator,
  phần dự phòng và mọi replica. Worker dùng pool2; không chỉ tính process hiện tại.
- Backend network và egress network đã được quản lý. Template không mở host
  port. Kiểm egress/DNS/HTTPS tới provider; không mở database ra Internet.

Login có thể được tạo bởi installer đã được giao quyền cấp đúng role; đặt mật
khẩu qua secret tooling hoặc prompt tương tác của quản trị. Không sao chép login
quản trị thành credential runtime. Kiểm role của công cụ sẽ từ chối credential
có quyền thừa thay vì âm thầm dùng quyền đó.

## 3. Quyền file và cấu hình worker

Mọi đường dẫn trong JSON phải là đường dẫn tuyệt đối **bên trong container**.
Private files phải là regular file, nlink1, không symlink ở file hoặc thư mục
cha. Thư mục cha không cho group/other ghi, trừ thư mục sticky do root sở hữu.
Với user1000:1000, DSN/keys cần owner1000/mode0400 hoặc0600, hay root:1000/
mode0440. Không chấp nhận world-readable secret; root:root/mode0400 cũng không
đọc được bằng user1000. Metadata JSON cần được user runtime đọc được và không
cho group/other ghi.

Compose file secrets có uid/gid/mode trong template, nhưng Compose có thể bind
mount từ host mà không remap quyền. Phải kiểm quyền của **file host thật và
mount thật bằng UID1000** tại T18; render config đạt không thay kiểm tra đó.
Không in nội dung secret khi chẩn đoán. Đổi owner/mode đúng file cụ thể, tránh
chmod/chown đệ quy toàn thư mục hệ thống.

Ví dụ metadata cho cả hai kênh (các số budget chỉ minh họa, cần thay bằng số đo):

```json
{
  "version": 1,
  "instanceId": "booking-node01",
  "databaseUrlFile": "/run/secrets/booking-dsn",
  "channels": ["push", "telegram"],
  "connectionBudget": {
    "maxConnections": 100,
    "reservedConnections": 10,
    "otherConnections": 70,
    "workerInstances": 1,
    "workerPoolMax": 2
  },
  "push": {
    "publicKeyFile": "/run/secrets/booking-vapid-public",
    "privateKeyFile": "/run/secrets/booking-vapid-private",
    "subject": "mailto:ops@roomqc.com"
  },
  "telegram": {
    "botTokenFile": "/run/secrets/booking-telegram-token",
    "appOrigin": "https://roomqc.com"
  }
}
```

Push-only: channels chỉ có push, bỏ hoàn toàn telegram. Telegram-only làm tương
tự. Loader từ chối trường thừa và inline secret. Nếu database dùng CA riêng,
thêm databaseCaFile và mount CA read-only bằng overlay đã review. DSN file dùng
sslmode=verify-full; không chấp nhận URL options để thay đổi hành vi connection.

Production không bật ROOMQC_BOOKING_ALLOW_LOCAL. Fixture có chế độ development
riêng; apiOrigin Telegram chỉ được đổi sang loopback đã khai báo trong chế độ
này. Không đưa developmentOrigins/apiOrigin thử nghiệm vào cấu hình production.

## 4. Kiểm cấu hình rồi mới bật kênh

Trong repository:

```text
node server/control/workers/booking-external-runtime.mjs --check --config-file ABSOLUTE_WORKER_JSON
node server/control/booking-notification-operator.mjs --config-file ABSOLUTE_OPERATOR_JSON --command-file ABSOLUTE_COMMAND_JSON
```

Trong image, bỏ tiền tố server/control/ ở cả hai lệnh. Operator metadata chỉ có
version1, databaseUrlFile và databaseCaFile nếu cần; DSN phải dùng login operator.
Công cụ nhận file, không nhận password/token/DSN trên command line.

`--check` không claim/gửi việc và dùng port0 nên có thể chạy cùng daemon.
Kết quả gồm requiredConfigurationId của từng adapter. Exit0 là enabled và khớp
cấu hình; exit2 là đọc được nhưng chưa ready; exit1 là lỗi/credential/metadata.
Chưa ready vẫn có thể cung cấp ID cần cấu hình. Copy ID của đúng kênh vào một
command configure có UUID mới, enabled và reason rõ ràng. Không tạo ID tùy ý.

Mỗi command ghi được lưu riêng để truy lại đúng ý định. Các mẫu sau mô tả schema;
UUID/ID/hash phải lấy từ lần vận hành hiện tại, không dùng placeholder khi chạy.

| operation | Các trường ngoài version1 và operation |
|---|---|
| channels | Không có |
| list | state: null hoặc trạng thái cụ thể; eventId: null hoặc UUID; after: null hoặc UUID; limit:1–50 |
| receipt | commandId: UUID của configure/resolve cần đọc lại |
| configure | commandId: UUID; channel: push/telegram; configurationId:64ký tự hex từ check; enabled:boolean; reason:5–1000ký tự |
| resolve | commandId: UUID; targetId: UUID từ list; resolution:retry/suppress; reason:5–1000ký tự; acceptDuplicateRisk:boolean |

Configure chỉ đổi trạng thái kênh; không tự retry các đích blocked. Chạy lại
`--check`, yêu cầu exit0. Cùng commandId và payload trả replay; đổi payload
trên key đã dùng bị conflict. Mỗi ý định mới dùng key mới.

## 5. Compose và bắt đầu chạy

Dùng base `deploy/booking-notifications/compose.yml` cùng push.compose.yml,
telegram.compose.yml hoặc cả hai overlay tương ứng với channels trong metadata.
Các biến metadata: ROOMQC_BOOKING_PROJECT, ROOMQC_BOOKING_IMAGE (digest đã duyệt),
ROOMQC_BOOKING_CONFIG_FILE, ROOMQC_BOOKING_BACKEND_NETWORK,
ROOMQC_BOOKING_EGRESS_NETWORK. Các biến tham chiếu file secret:
ROOMQC_BOOKING_DATABASE_URL_FILE, ROOMQC_BOOKING_VAPID_PUBLIC_FILE,
ROOMQC_BOOKING_VAPID_PRIVATE_FILE, ROOMQC_BOOKING_TELEGRAM_TOKEN_FILE; chỉ khai
báo phần kênh dùng. Tên biến chứa đường dẫn file, không chứa nội dung khóa.

Render với `docker compose ... --profile booking-external config` rồi review
đúng project/image/networks/mounts/UID/budget. Template readonly, cap-drop ALL,
no-new-privileges, giới hạn memory/CPU/pid, log rotation và không host ports.
Chưa có env-file hoặc provider secret production nào được tạo bởi tài liệu này.

Sau khi gate staging và mount check đạt, operator bật đúng configuration ID,
người triển khai chạy dịch vụ bằng project được duyệt. `/livez` và `/readyz`
chỉ nghe127.0.0.1:8094 trong container; không dùng địa chỉ host để suy readiness.
Healthcheck tự chạy bên trong container. Không publish cổng để tiện kiểm.

`/readyz` cần metadata enabled/khớp, cycle thành công không quá180giây, không có
lỗi cycle đang tồn tại. `/livez` chỉ cho biết process còn sống. Cả hai no-store,
chỉ GET. Queue sạch, provider khỏe, thiết bị nhận và người dùng đọc là các
chỉ số khác; HTTP200 của health không chứng minh những điều đó.

## 6. Đối soát, mất phản hồi và đổi cấu hình

1. Dùng list với state cần xử lý, limit≤50. Theo hasMore/nextAfter đến hết,
   giữ eventId/state không đổi giữa các trang. Cursor theo UUID; không suy đây
   là snapshot bất biến nếu đồng thời có đích mới. Quét lại khi đối soát live.
2. Đọc state, attempts, prepareFailures và lastErrorCode; không cần endpoint,
   token/chat ID hoặc raw body để xem queue. List giới hạn theo role platform,
   không phải API cho nhân viên khách sạn.
3. Với unknown, xác minh khả năng đã gửi. Chọn suppress để dừng có ghi lý do,
   hoặc retry với acceptDuplicateRisk:true sau khi chấp nhận nguy cơ trùng.
   Không bypass attempt budget5 hoặc sửa trạng thái trực tiếp.
4. Nếu CLI trả BOOKING_OPERATOR_OUTCOME_UNCONFIRMED, giữ nguyên command file,
   đọc receipt bằng **cùng login và commandId**. Receipt completed thì dùng kết
   quả đã ghi. Receipt missing không chứng minh request cũ không còn bay; retry
   đúng payload/key để database xử lý replay. Không đổi sang UUID mới để thử.
5. Receipt bị ràng buộc session_user. Đổi login không đọc được receipt cũ;
   giữ bàn giao login metadata/commandID đúng quy trình, không chia sẻ password.
6. Muốn dừng gửi mới: configure enabled:false với ID kênh hiện tại và reason,
   đọc receipt rồi kiểm /readyz503. Một send đã giữ live locks có thể kết thúc
   trước lệnh disable lấy được khóa; disable có bounded lock timeout, không
   phải hủy một request provider đã nhận.
7. Đổi VAPID/bot hoặc subscription cần kế hoạch tương thích. Đích cũ có
   fingerprint/config khác bị blocked/obsolete; không tự chuyển sang đích mới.
   Người trực đối soát các nguồn cũ trước khi retry.

## 7. Dừng, lỗi và các cổng còn mở

SIGTERM/SIGINT dừng nhận việc mới, abort HTTP đang chờ và đóng pool; runtime
chờ tối đa20giây, process force-exit sau22giây, Compose grace25giây. Crash sau
journal/HTTP có thể để lease tới hạn rồi thành unknown; không tăng replica để
gửi lại mù. Crash trước journal có thể reclaim an toàn sau lease hết.

Nếu start lỗi, chỉ dùng code an toàn để phân loại: CONFIG_INVALID kiểm đường
dẫn/quyền/TLS/schema; ROLE_UNSAFE kiểm quyền login; UNCONFIGURED kiểm cặp key
hoặc metadata. Không paste secret hoặc raw logs vào issue. Hết budget, unknown
tồn kéo dài, backlog, readiness lỗi và tác động giữ lock cần nối cảnh báo tại
T07/T20/T23; hiện chưa có dashboard vận hành hoàn chỉnh cho các chỉ số này.

Trước production còn phải có: upgrade563→564 với dữ liệu, runtime UID1000 và
mount thật, TLS/CA/egress thật, nguồn legacy version0 được disposition, đo tác
động lock/tải, provider thật và browser/Android nhận trên thiết bị. Các bước
này cùng Q02 còn lại, Q03/Q04 và toàn bộ VPS/signup theo
[plan hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md); không tự đóng
70ca nghiệm thu hoặc mở signup từ kết quả kiểm local.
