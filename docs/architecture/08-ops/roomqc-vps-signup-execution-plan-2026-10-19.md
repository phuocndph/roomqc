# RoomQC — kế hoạch thực thi chi tiết quản lý VPS và đăng ký tự động

Ngày cập nhật: 19/10/2026, Asia/Bangkok. Trạng thái: **đang triển khai, nền đã kiểm chứng local; chưa đạt staging/pilot**.
Tài liệu này cụ thể hóa thứ tự thực hiện trên hiện trạng đã quan sát, không ghi nhận
các đầu việc dưới đây là đã hoàn thành. Mỗi mã T là bước con của 27 gói P0–P8,
không tạo thêm một roadmap độc lập hoặc thay đổi tổng 70 tình huống nghiệm thu.

- Phạm vi và kiến trúc: [kế hoạch tổng thể](roomqc-vps-signup-implementation-plan-2026-10-19.md).
- Phân công và phụ thuộc: [27 gói công việc](roomqc-vps-signup-work-packages-2026-10-19.md).
- Điều kiện đạt: [70 tình huống và các cổng phát hành](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
- Kết quả thực hiện: [tracker](roomqc-vps-signup-progress.md), không suy ra từ tài liệu thiết kế.
- Phiếu giao việc cho phần còn lại: [mục 18–23](#18-điểm-bắt-đầu-đã-đối-chiếu-và-thứ-tự-giao-việc),
  bổ sung sau đợt M05; giữ nguyên 27 gói, 25 bước và 70 case.
- Điểm bắt đầu trước lượt code kế tiếp: [mục 18.3](#183-cập-nhật-chuẩn-bị-m06-và-điều-kiện-bắt-đầu-kế-tiếp);
  backend sandbox chưa khởi động đạt, không dùng bản nháp manifest để mở signup.

## 1. Đích bàn giao và ranh giới phiên bản đầu

Chủ khách sạn vào RoomQC → đăng ký → xác thực email → khai báo khách sạn → có
không gian sử dụng và gói thử theo chính sách hiện hành → thêm phòng → mời nhân viên.
Khách chỉ làm việc với ứng dụng; việc chọn cụm, cấu hình máy, database và backup do
RoomQC vận hành. Khi mất mạng hoặc đóng trình duyệt, khách tiếp tục cùng đăng ký.

Quản trị RoomQC có hai mục mới trong `/super-admin`: **Hạ tầng** và **Đăng ký mới**.
Từ đây phải trả lời được: cụm nào còn nhận khách, đang thiếu điều kiện gì, khách
đang kẹt bước nào và hành động tiếp theo là gì. `/settings/audit-log` vẫn là nhật ký
nghiệp vụ của khách sạn, không phải trang quản lý VPS toàn nền tảng.

Đơn vị phân bổ là workspace/doanh nghiệp; một workspace có thể chứa nhiều khách sạn.
Mỗi khách sạn có nhiều nhân viên. Không dùng số nhân viên đăng ký làm số phiên đồng
thời; không dùng số khách sạn làm số workspace nếu doanh nghiệp có nhiều cơ sở.

Phiên bản đầu cấp workspace trong cụm Supabase self-host đã chuẩn bị trên VPS do
RoomQC quản lý. Việc thuê máy tự động, di chuyển tenant đang dùng, đăng nhập chung
nhiều cụm, HA nhiều vùng và thanh toán thật là phạm vi sau. Các chức năng gói/trial
hiện có được nối lại đúng backend; không tự thay giá, thời gian dùng thử hoặc chính
sách giữ/xóa dữ liệu để hoàn thành luồng kỹ thuật.

## 2. Điểm xuất phát đã kiểm tra

Nguồn tích hợp: `roomqc-worktrees/integration`, nhánh `codex/roomqc-parallel-integration`.
Commit đã kiểm chứng gần nhất: `a3c17c6` (M05; M04: `a34f3b6`, multi-mount: `dec5fdf`,
admin/health: `d0f9b7b`, nền directory: `8d0628e`). Checkout chính là `room-weave-pro-main`, có nhiều
thay đổi từ trước; chỉ đồng bộ file đúng phạm vi sau kiểm tra, bảo toàn index và
các thay đổi nghiệp vụ khác.

| Phần | Bằng chứng hiện có | Cách tính trong kế hoạch này |
|---|---|---|
| Control API + directory riêng | Báo cáo admin/health ghi runtime `0005`, image và fingerprint 16 bảng | Bằng chứng local của đợt đã hoàn tất, không coi là health VPS hiện tại |
| Proxy frontend | GET `8082/api/control/healthz` trả 200 JSON `status=ok` | Chứng minh proxy local; chưa chứng minh luồng khách đăng ký |
| Migration, grants, restart | Đợt `d0f9b7b` ghi 44/44 test, 0 skip; gồm migration, restart, role grants và race | Không phải 44/70 acceptance release, không cộng lặp 17 test nền |
| Admin command, registry, evaluator, admission | Receipt/version/audit atomic, gate DB/affinity, HTTP pinned DNS và snapshot đã kiểm chứng local | Còn Auth/revoke thật, manifest/probes và E2E; chưa đóng toàn bộ P1/P3 |
| Kiểm tra release cụm | Gateway cũ có gọi `control_cluster_manifest`; lượt chuẩn bị M06 đã có migration/verifier bản nháp riêng | Chưa nối verifier mới vào gateway/worker; phải kiểm chứng full backend trước đóng T08 |
| Giám sát | Source/exporter local M04 và worker/target binding M05 đã kiểm chứng; suite gần nhất 87/87 | Chưa có đủ năm service probe; worker chưa bật thường trực; chưa chứng minh tài nguyên hoặc sức chứa VPS |
| Giao diện hạ tầng/đăng ký mới | Có super-admin và tenant console cũ | Tái sử dụng layout; bổ sung API/client/routes, không coi đã có console hạ tầng |
| VPS/TLS/email thật/offsite/pilot | Chưa có bằng chứng triển khai tương ứng trong đợt này | Giữ `not_run` ở môi trường thật; tiếp tục phần code/local độc lập |

Hiện trạng đối chiếu source/tracker/artifact. Đợt P2 sau khi cập nhật plan đã chạy
suite 59 test trong sandbox riêng; xem [báo cáo P2](roomqc-p2-source-local-2026-10-19.md).
Sau đó M04/M05 có báo cáo riêng; [báo cáo M05](roomqc-p2-health-worker-local-2026-10-19.md)
là bằng chứng nguồn mới nhất. Lượt chuẩn bị kế hoạch lúc 18:24 +07:00 ngày 19/10
kiểm tra read-only: direct/proxy readyz đều 200, schema thường trực vẫn `0005`,
image control/frontend giữ nguyên như mục 18, signup vẫn false.
Không suy ra vừa đo VPS hoặc image thường trực đã đổi theo source. Artifact gốc
được giữ nguyên, không áp migration hay thay đổi DB nghiệp vụ và không bật signup.

### Phần đã làm không lặp lại và thứ tự còn lại

T02–T04 đã có một phần quan trọng đạt local ở đợt admin/health; giữ test làm hồi quy,
không viết lại để khớp mô tả cũ. T01 vẫn kiểm tra phạm vi mỗi đợt; P1-03 còn Auth
thật/revoke/MFA và support command identity. Bước ngay tiếp theo là M06/T08, khép
M05/M10 trên full backend rồi M07/M08; sau đó khép T03/T09/T10 và P4–P8.
Danh sách thao tác nhỏ, file/test và tiêu chí đóng đợt P2 ở
[run sheet giám sát](roomqc-p2-monitoring-delivery-plan-2026-10-19.md).

### Quy tắc ghi nhận tiến độ

Mỗi bước có trạng thái, môi trường, người phụ trách, commit/image/schema, case ID,
expected/actual và đường dẫn artifact. Dùng các nhãn:

`planned` → `in_progress_unverified` → `local_verified` → `staging_verified` → `pilot_verified`.

`deferred_external` ghi rõ đầu vào cần thiết và gate bị chặn; không đồng nghĩa done.
Một gói có thể đạt local nhưng chưa đạt staging. Không dùng số dòng code, số test
assertion hoặc điểm phần trăm để thay nghiệm thu vận hành.

## 3. Thứ tự thực hiện và mốc kiểm tra

| Đợt | Gói chính | Kết quả có thể kiểm tra | Phụ thuộc | Ước lượng ngày công còn lại |
|---|---|---|---|---|
| 1 | P0 bổ sung, P1-03, hồi quy P1-01/02 | Lệnh quản trị có quyền/version/receipt/audit; nền mới chạy được trong sandbox | Hiện trạng trên | 2–3 |
| 2 | P2-01/02/03 | Số đo thật, dữ liệu cũ bị nhận diện, alert có vòng đời | Schema và hợp đồng đợt 1 | 3–4 |
| 3 | P3-01/02/03 | Cụm đã xác minh mới nhận khách; giữ suất và affinity an toàn | Đợt 1–2 | 3–4 |
| 4 | P4-01/02/03 | Signup tiếp tục được; worker đối soát kết quả; kiểm soát lạm dụng | Đợt 3; authority/receipt tại backend | 3–5 |
| 5 | P5-01/02/03/04 | Quản trị dùng hai màn chính để vận hành, có trạng thái lỗi thật | API đợt 1–4 | 3–5 |
| 6 | P6-01/02/03 | Bộ cài VPS, backup/restore và runbook | Local đã đạt; quyền staging cho bước thật | 3–5 |
| 7 | P7-01/02/03/04 | Hai backend độc lập, E2E/fault/load, release candidate | Đợt 1–6 | 3–5 |
| 8 | P8-01 | Pilot có giới hạn, báo cáo vận hành và quyết định mở rộng | Gate staging/pilot đạt | 1–2 + ít nhất 7 ngày quan sát |

Tổng dự kiến **21–33 ngày công kỹ thuật**, cộng thời gian quan sát/chờ nhà cung cấp
và sửa lỗi phát sinh. Đây là dự toán để tổ chức công việc, chưa phải lịch cam kết;
chốt lại sau đợt 1. Thay ước lượng 23–36 ngày công lúc lập plan gốc cho phần việc
còn lại, không cộng hai con số. Các đoạn độc lập có thể làm song song sau khi chốt
contract; không chia tổng ngày công cho số nhánh để suy ra ngày bàn giao.

Trong lúc code tiếp tục, signup của stack đang phục vụ vẫn đóng. Chỉ mở ở sandbox
khi đủ gate local; staging, pilot và public là các mốc riêng.

## 4. Đợt 1 — khép phần nền và quản trị đang dở

### T01 — khóa baseline, phạm vi và quyền ghi (P0-01/03)

1. Ghi `git status`, commit, diff các file control, image/schema đang chạy; ghi rõ
   mã chưa commit chưa nằm trong image. Kiểm tra trạng thái các nhánh/worktree cũ
   trước dùng lại, không ghép thay đổi không rõ nguồn.
2. Ghi tên project/container/network/volume sở hữu của sandbox. Chọn port trống;
   không chiếm 8080/8081/8082 của ứng dụng khác hoặc 8090 của CRM.
3. Tạo fixture tổng hợp cho platform admin, owner, staff, email chưa xác minh,
   workspace reserved/provisioning/active/expired và cụm đóng/đầy/stale. Secret chỉ
   vào secret file hoặc stdin; báo cáo chỉ ghi ID và trạng thái.
4. Chụp fingerprint phần cần bảo vệ ở checkout/DB nguồn. Cleanup nhận run ID và
   manifest target cụ thể, dừng khi target không thuộc sandbox.

**Bàn giao:** cập nhật baseline và công cụ sandbox có prepare/verify/cleanup.
**Đạt:** A01/A02 và phần fixture của P0-03; Ctrl+C hoặc test lỗi vẫn dọn tiếp được.
A03 chỉ đóng sau browser/cutover, không đóng bằng việc đọc route.

### T02 — sửa tương thích test với migration mới (P1-01)

File: `server/control/directory-db.test.mjs`, `migrations/0004-admin-policy-guards.sql`.

1. Rà schema/grants/constraint/index của `0004` trước lần áp đầu. Chỉ file chưa áp
   mới được chỉnh; các migration đã có history giữ nguyên checksum.
2. Đổi rollback-probe test từ số `0004` sang số kế tiếp, tránh trùng migration thật.
   Kiểm tra số/version migration từ manifest thay vì giữ giả định luôn có ba file.
3. Test nâng cấp DB cũ so sánh từng trường cần bảo toàn; không coi cột nullable mới
   là mất dữ liệu do `SELECT *` trả shape khác.
4. Fixture reserve phải chủ động có credential/release/frontend/health/backup hợp
   lệ. Không mở mặc định cụm mới hoặc bỏ điều kiện an toàn để test cũ pass.
5. Chạy DB trống, upgrade từ v2/v3, rerun, hai migrator đồng thời, checksum mismatch,
   migration lỗi và grant denial. Chỉ dùng PostgreSQL container disposable.

**Đạt:** A04–A07 phần liên quan; mọi test bắt buộc chạy, không skip để đạt số đẹp.
**Artifact:** schema versions trước/sau, dữ liệu giữ nguyên, kết quả runner mới.

### T03 — hoàn chỉnh quyền và lệnh quản trị nguyên tử (P1-03)

File đang dở: `admin.mjs`, `admin-read.mjs`, `app.mjs`, `errors.mjs`, `support.mjs`.

1. Mỗi request xác nhận actor tại authority cố định qua `platform_support_actor`.
   Không nhận authority/role từ request, `user_metadata` hoặc cache quyền frontend.
2. Lập bảng operation → capability: đọc, thao tác hạ tầng, đối soát hỗ trợ. V1 có thể
   cùng super-admin nhưng handler vẫn kiểm tra capability cụ thể. Session bị khóa,
   revoke hoặc thu hồi role phải mất quyền ở request kế tiếp.
3. Mutation bắt buộc UUID `Idempotency-Key`, `expectedVersion`, reason 5–1.000 ký
   tự và payload allowlist. Hash gồm operation, target, version và payload chuẩn hóa.
4. Trong một transaction ngắn: khóa phù hợp → tìm replay → kiểm tra version → ghi
   mutation + audit/event + receipt → commit. Audit lỗi phải rollback mutation.
5. Cùng key/actor/operation và cùng payload trả receipt cũ; thay target/payload trả
   409. Hai admin sửa cùng version chỉ một bên thắng. Không giữ transaction khi
   gọi HTTP xác minh backend; kiểm tra lại version/fingerprint trước khi commit.
6. Chốt `set_serving` vào contract như lệnh đưa cụm draining về phục vụ, vẫn đóng
   nhận mới; không để enum OpenAPI và implementation lệch nhau.
7. Lỗi 401/403/409/429/503 có mã ổn định, request ID mới cho từng attempt; receipt
   giữ command ID. 429 trả Retry-After. Không ghi raw token/SQL/payload khách.

**Test:** 20 request thật cùng key; mất response sau commit; hai actor cùng version;
audit insert thất bại; owner/staff/anon gọi từng route; actor bị revoke giữa hai request.
**Đạt:** A08–A11. Test phải xác nhận số mutation/event/receipt, không chỉ HTTP 200.

### T04 — khép read API, contract và bàn giao đợt (P0-02, P1-03)

1. Đối chiếu từng operation trong `contracts/control-v3.openapi.json` với router.
   Endpoint chưa làm giữ `planned`; file có parser chưa đồng nghĩa implemented.
2. Hoàn thiện filter/cursor/schema/error DTO; mặc định 25, tối đa 100. Cursor ràng
   buộc route/filter và giữ chính xác timestamp PostgreSQL, gồm phần microsecond.
3. Workspace detail không trả email hash, token, secret ref hay payload form. Nếu
   timeline dài phải có phân trang thật; không hard-code 20 dòng rồi báo hết dữ liệu.
4. Dùng ít nhất 1.000 metadata với timestamp trùng/sát nhau để kiểm tra không mất,
   trùng bản ghi khi đi trang; test cursor sai, filter đổi và query thừa/nhân đôi.
5. Chạy suite control/DB liên quan, viết artifact mới; giữ artifact nền làm lịch sử.
   Review diff rồi đồng bộ file xác định sang checkout chính, không ghi đè cả cây.

**Cổng kết thúc đợt 1:** quyền và lệnh đạt trong sandbox; snapshot mã/schema rõ ràng;
signup của stack chính vẫn đóng. Chưa tuyên bố tài nguyên VPS đã được giám sát.

## 5. Đợt 2 — nguồn số đo, quyết định sức khỏe và cảnh báo

### T05 — dựng monitoring riêng tư, đo đúng tài nguyên (P2-01)

Thực hiện theo M01–M04/M06 trong run sheet P2; M05/M07–M10 khép T06/T07. Mã M
chỉ chia nhỏ T05–T07, không thêm gói hay đổi 70 acceptance case.

M04 đã có `deploy/monitoring/compose.yml`, `queries.yml`, `exporter-roles.sql` và
renderer sinh `prometheus.yml`; đã kiểm chứng fixture local, chưa deploy thường
trực. `rules/` và alert runtime còn thuộc M07/M08. Xem báo cáo M04 trong tracker.

1. Pin version/digest node_exporter, postgres_exporter, Prometheus, Alertmanager.
   Ghi overhead CPU/RAM/disk; giới hạn scrape/retention. Grafana chỉ mạng quản trị.
2. Inventory nối host → cluster → mount DB/Storage. Nếu DB và Storage khác ổ, đo
   từng mount và chặn khi bất kỳ ổ bắt buộc nào critical; không ghép số free của
   ổ A với total của ổ B để tạo một phần trăm không có thật.
3. Exporter DB dùng role giám sát tối thiểu; không quyền sửa dữ liệu nghiệp vụ.
   Port exporter/DB không public; không mount Docker socket.
4. Probe Auth/REST/Storage/Realtime/Functions bằng request có ý nghĩa. HTTP port
   mở hoặc một 401 tùy ý chưa chứng minh service hoạt động. Canary cần resource
   tổng hợp riêng và cleanup; không ghi dữ liệu vào khách đang dùng.
5. Đối chiếu Linux `MemAvailable`, filesystem thực và `pg_stat_activity` với metric.
   Công bố dung sai trước test: CPU ±5 điểm %, bytes/counts chênh do thời điểm đo
   phải giải thích; không áp dung sai để bỏ qua sai mount hoặc sai đơn vị.

**Đạt:** B01–B03. Local Docker Desktop chỉ đạt integration; đối chiếu host thật ở VPS staging.

### T06 — persist snapshot và kiểm thử evaluator (P2-02)

Tận dụng `health-policy.mjs` đang dở; bổ sung telemetry adapter, snapshot store và
health worker. Chu kỳ scrape/worker 30s; dữ liệu hết hạn 120s, dựa thời gian server.

| Số đo | Hợp đồng đầu vào | Cảnh báo / chặn nhận mới mặc định để đo staging |
|---|---|---|
| CPU | % busy 0–100; nguồn `rate` cửa sổ 1 phút | ≥70% trong 5 phút / ≥85% trong 5 phút |
| RAM | Available và total bằng byte | Còn <25% trong 5 phút / <15% trong 2 phút |
| Disk từng mount bắt buộc | Free/total byte và inode free % | <25% hoặc <20 GiB / <15% hoặc <10 GiB; critical chặn ngay |
| Inode | % còn lại trên từng mount | <20% / <10%; critical chặn ngay |
| DB connections | Used và budget kết nối thực | ≥70% trong 5 phút / ≥85% trong 2 phút |
| Probe | Năm service bắt buộc, kết quả typed | Lỗi cảnh báo; 3 mẫu liên tiếp và ≥60s lỗi thì chặn |
| Freshness | Observed/received/validUntil, generation | Không có mẫu hợp lệ >120s thì chặn |

1. Chốt CPU như bảng: cửa sổ tính rate 1 phút, cửa sổ duy trì ngưỡng 5 phút. Cập
   nhật các tài liệu nguồn tương ứng; không vô tình thêm hai lần cửa sổ 5 phút.
2. Reject NaN/Infinity/âm/sai range; bytes/counts là safe integer; mẫu tương lai >5s
   hoặc đã quá 120s bị từ chối. Không có dữ liệu là unknown/null, không phải 0.
3. Mở rộng schema sample cho nhiều mount nếu cần; nâng version contract. Không dùng
   evaluator một ổ hiện tại để tuyên bố đã bảo vệ đủ DB và Storage khác filesystem.
4. Query Prometheus theo template cố định + registry ID. Browser không truyền PromQL.
   Timeout/backoff có giới hạn; UI đọc snapshot, không scrape trên mỗi lần mở trang.
5. Ghi sample/state/generation cùng transaction; mẫu cũ không ghi đè mẫu mới. Hai
   worker đua nhau vẫn giữ thời gian tăng đúng. Không có mẫu mới vẫn phải phát hiện
   snapshot stale và ghi sự kiện đóng nhận; admission recheck freshness độc lập.
6. Persist các mốc sustained/probe failures/recovery qua restart. Có gap >120s thì
   bắt đầu warmup lại; policy version đổi cần evaluate theo policy mới trước mở.
7. Có số đo hợp lệ liên tục 5 phút trước khi đủ điều kiện mở lần đầu. Sau critical,
   cần 10 phút khỏe với CPU/connection <65%, RAM >25%, disk >25% và >20 GiB,
   inode >20%, probes tốt; pilot vẫn cần admin mở lại có lý do.
8. Unit test ranh giới bằng fake clock; DB test worker cạnh tranh, restart/gap,
   policy đổi và stale. API/client không tự chuyển snapshot cũ thành healthy.

**Đạt:** B04–B07; có artifact đối chiếu từng ngưỡng, thời gian và reason code.

### T07 — cảnh báo có vòng đời và tín hiệu ngoài máy (P2-03)

1. Fingerprint theo môi trường/resource/type; một lỗi liên tục chỉ một alert mở.
   Lưu opened/lastSeen/ack/resolved và audit actor/reason; tránh label user/email.
2. Severity/runbook: disk/DB critical, metric stale, backend unreachable, backup
   quá hạn, job provisioning kẹt, control/worker heartbeat mất.
3. Acknowledge chỉ xác nhận đã thấy; không đổi metric, resolve hoặc mở admission.
   Resolution dựa điều kiện phục hồi đã kiểm chứng; cooldown chống gửi dồn.
4. API alerts/backups/audit có phân trang và DTO an toàn. Ack dùng command/version
   như thao tác admin khác, không có đường ghi bỏ qua receipt/audit.
5. Local gửi tới inbox thử. Đích cảnh báo thật được cấu hình sau; heartbeat từ hệ
   thống ngoài VPS mới chứng minh phát hiện mất cả máy.

**Đạt:** B08 local; B09 chỉ đạt khi ngắt host thử và nhận được cảnh báo bên ngoài.

## 6. Đợt 3 — registry và điều kiện nhận khách đáng tin cậy

### T08 — ràng buộc endpoint, credential và manifest (P3-01)

File: `registry.mjs`, `cluster.mjs`, `config.mjs`, `admin.mjs`; thêm HTTP transport
an toàn và migration Supabase cho manifest, tên migration do CLI sinh.

1. DB giữ metadata/policy; secret phía server resolve theo ref. UI chỉ chọn entry
   trong inventory duyệt sẵn; không nhận URL bất kỳ, SSH key hay service key.
2. Cụm mới là pending validation + đóng nhận. Trùng ID/host, endpoint sai và sửa
   endpoint cụm có workspace bị từ chối. Đổi ref secret không đổi tenant binding.
3. Trước request, resolve và kiểm tra toàn bộ A/AAAA theo inventory; xử lý IPv4,
   IPv6 và IPv4-mapped IPv6. Cấm metadata/link-local, redirect và DNS tới đích ngoài
   tập cho phép. IP nội bộ chỉ dùng nếu được duyệt chính xác trong môi trường đó.
4. Pin địa chỉ đã kiểm tra vào kết nối thực tế, vẫn xác minh certificate/hostname
   TLS và SNI. Không chỉ validate DNS rồi gọi `fetch` resolve lại. Test DNS rebinding,
   mixed allowed/forbidden answers và redirect không được mang credential đi nơi khác.
5. Đọc changelog/docs Supabase đúng version trước triển khai RPC manifest. RPC chỉ
   server được gọi; anon/authenticated không được execute. Manifest phản ánh release,
   schema/contract thực tế theo artifact triển khai, không là chuỗi UI tự nhập.
6. Validation đủ Auth/REST/Storage/Realtime/Functions, schema compatibility, secret,
   public key, CSP/frontend version. Kiểm tra lại registry version sau remote probe
   trước lưu validation, tránh chứng nhận một endpoint đã bị đổi giữa chừng.
7. Test rotate credential, ref mất/sai, TLS lỗi, release lệch và frontend cũ. Lỗi
   đóng nhận mới, hiển thị thiếu điều kiện; không tự đổi workspace sang cụm khác.

**Đạt:** C01–C04; thiếu RPC/SSRF protection là lỗi phải đóng, không phải việc chờ API key.

### T09 — admission và phân bổ có khóa (P3-02)

1. Gate chỉ mở khi đồng thời: global signup cho phép trong môi trường đó; cụm
   serving/active; credential đúng; manifest/frontend hợp lệ; metric mới/đủ warmup;
   không critical; backup đã verify; chưa hết limit; admin chưa đóng và đã cho mở.
2. Mặc định staging/pilot: backup bundle ≤24h, restore proof ≤30 ngày, manifest
   checksum hợp lệ. Thông tin do pipeline tin cậy ghi, không cho UI tự đánh dấu pass.
3. Trong transaction phân bổ: khóa dùng chung với policy/close; xử lý expiry đúng
   trạng thái; kiểm tra retry/affinity; tính active + provisioning + reserved chưa
   hết hạn; chọn cụm đủ điều kiện; giữ suất + affinity + event nguyên tử.
4. `cluster_policies.tenant_limit` là nguồn chuẩn. Hạ dưới số đã giữ/dùng chỉ chặn
   nhận thêm, không xóa khách/reservation đang provisioning. Import/restart không
   ghi đè limit; `max_workspaces` compatibility không là API ghi thứ hai.
5. Retry cùng đăng ký giữ ID/expiry/suất; affinity email tồn tại sau expiry. Cụm
   affinity đang blocked thì trả hướng tiếp tục/chờ hỗ trợ, không tự chọn cụm B.
6. Trước first provision recheck gate, nhưng suất đã giữ không tính thành suất mới.
   Khi RPC đã bắt đầu, tiếp tục đối soát receipt dù gate đổi; không expire theo tuổi.
7. Lưu generation/policy version đã dùng; admission snapshot phục vụ giải thích,
   không thay cho kiểm tra freshness/count trong transaction phân bổ.
8. Bài test thật: 20 khách tranh một suất; 20 retry cùng khách; close và reserve
   chồng lấn; đổi limit khi đang cấp phát; clock expiry; stale sau reserve; affinity
   sau restart/expiry. Xác nhận cả số dòng, audit và thứ tự commit.

**Đạt:** C05–C10. Đóng nhận mới không khóa login/nghiệp vụ khách active.

### T10 — budget để một khách không chiếm hết cụm (P3-03)

1. Liệt kê pool/concurrency của control, health worker, reconcile worker, Auth,
   REST, Realtime, Functions, exporter và backup; cộng budget theo từng database.
2. Giữ phần kết nối vận hành dự phòng; pool bounded, timeout/queue có giới hạn.
   Không giải quyết quá tải bằng tăng `max_connections`/`work_mem` không đo RAM.
3. Kiểm tra report nặng, upload size/rate, job batch, room quota đang có; thêm giới
   hạn server tại đường gây nghẽn có số đo. Kèm lỗi có thể thử lại và request ID.
4. Tải tenant A nặng đồng thời tenant B đặt phòng và tenant C signup; ghi riêng
   latency/error/pool/IO theo profile tổng hợp, không log dữ liệu khách thật.

**Đạt:** G05 cùng capacity profile P7; có hạn mức vận hành và hành động tăng cụm.
Admission một mình không được coi là bảo vệ mọi tải nghiệp vụ đang hoạt động.

## 7. Đợt 4 — khách tự đăng ký và tiếp tục được khi có lỗi

### T11 — trạng thái thiết lập riêng tư và resume (P4-01)

File: `app.mjs`, `store.mjs`, `src/pages/auth/WorkspaceStart.tsx`, `Onboarding.tsx`,
`AuthCallback.tsx`, `src/lib/workspace.ts` và phần bootstrap runtime hiện có.

1. Thêm setup-status xác thực đúng backend và owner. Khi chưa có tenant, kiểm tra
   email đã xác minh + binding owner; khi có tenant, kiểm tra mapping/version.
   Người khác biết slug/UUID vẫn không xem được tiến độ riêng tư hoặc job.
2. Public bootstrap chỉ trả metadata định tuyến tối thiểu; không email/hash, job,
   lỗi nội bộ hoặc token. Chuyển side effect activate/reconcile hiện nằm trong GET
   bootstrap sang luồng đã định quyền/worker; request đọc công khai không trở thành
   công cụ kích hoạt cấp phát. Giữ tương thích luồng khôi phục cũ qua test hồi quy.
3. Bước UI có mã ổn định: nhập thông tin → chờ xác thực → chờ khai báo khách sạn →
   đang thiết lập → đã sẵn sàng / cần chủ tiếp tục / cần hỗ trợ. Các bước UI không
   tự thêm trạng thái thanh toán hoặc sửa enum DB ngoài contract.
4. Refresh, hai tab và thiết bị mới đọc lại từ server bằng phiên hợp lệ; không chỉ
   dựa sessionStorage. Poll backoff có trần và dừng khi logout, active hoặc lỗi quyền.
5. Khi submit chưa biết kết quả, giữ form và mã hỗ trợ. Sau server xác nhận active,
   chuyển đúng workspace/hotel. Không reset form rồi khuyến nghị tạo đăng ký khác.
6. Email quay lại/callback hết hạn có đường gửi lại/đăng nhập; cùng email đã có
   workspace được hướng về tài khoản cũ hoặc thêm cơ sở trong doanh nghiệp.
7. Native Android bổ sung allowlist đúng setup-status/callback, PKCE và deep link
   workspace; không mở wildcard origin để sửa lỗi mobile.

**Đạt:** D01–D06; record owner/workspace/tenant/hotel/trial ổn định qua các lần thử.

### T12 — job đối soát, lease và khôi phục kết quả (P4-02)

File mới dự kiến: `workers/provisioning-reconcile.mjs`, job store/CLI/tests.
Job giữ workspace/cluster/owner/routing version và mã lỗi; không lưu password,
access token hoặc biểu mẫu khách để tự đăng ký thay họ.

| Kết quả đọc receipt tại đúng cụm | Chuyển trạng thái job / UI | Không được làm |
|---|---|---|
| Verified, khớp workspace/owner/tenant/hotel/version | Activate mapping nguyên tử; completed | Tạo thêm tenant hoặc kéo dài trial |
| Missing, backend trả lời được | waiting_owner; hướng dẫn chủ tiếp tục | Coi missing là lỗi mạng hoặc tự chạy lại form |
| Unavailable/timeout | Retry có backoff và mã hỗ trợ | Kết luận không có tenant rồi chuyển cụm |
| Conflict hoặc binding/version lệch | needs_review; hiển thị bằng chứng đã lọc | Ghi đè mapping bằng ID browser cung cấp |

1. `beginProvision` ghi job đối soát cùng transaction trước RPC ngoài cụm. Backfill
   cho trạng thái cũ chỉ qua dry-run, allowlist workspace và owner đã đối chiếu.
2. Claim ngắn bằng SKIP LOCKED; partial unique cho một job chưa kết thúc cùng
   workspace/kind; lease 90s, remote timeout 20s. Commit claim trước gọi HTTP.
3. Mọi ack/retry/activation kiểm tra fencing token và expected routing version.
   Worker lease cũ trả muộn không được sửa kết quả worker mới; receipt tại backend
   vẫn là hàng rào chống trùng khi RPC đã chạy dù HTTP client timeout.
4. Retry đề xuất 30s, 2m, 5m, 15m, 30m có jitter; tối đa 5 lượt tự động rồi hỗ trợ.
   Counter chỉ tăng khi thật sự attempt; restart không reset budget hay mất job.
5. API recheck yêu cầu capability support-reconcile, command ID/version/reason;
   trả 202 + job/command ID. Bấm lại trả công việc cũ, không tạo nhiều job active.
6. Worker shutdown ngừng claim mới và chờ deadline; hard kill được lease phục hồi.
   Không tự expire/xóa Auth/tenant của workspace đã bắt đầu provisioning.
7. Fault test tại bốn điểm: sau claim; trước RPC; remote đã commit nhưng mất response;
   trước local ack. Thử hai worker, lease hết, active đã xong và version conflict.

**Đạt:** D07–D11, A07 phần worker; count tenant/hotel/trial và binding trước/sau khớp.

### T13 — proxy, chống lạm dụng và email (P4-03)

1. Proxy ghi đè forwarded headers; backend chỉ tin IP từ proxy nằm trong allowlist.
   Parse IPv4/IPv6 chuẩn và chain đúng topology; direct request không giả được IP.
2. Limiter intent/email/global dùng trạng thái bền vững dùng chung nhiều API instance.
   Tách signup, login/reset, invitation và polling; không gộp mọi người qua cùng
   reverse proxy vào một bucket socket. Có trần dung lượng và Retry-After.
3. Thêm adapter chống bot kiểm tra server-side cho public signup. Challenge sai,
   hết hạn hoặc replay không được giữ suất. Local dùng fixture/provider test key;
   production thiếu cấu hình thì gate public vẫn đóng.
4. Thử gọi thẳng Supabase Auth: không được vượt quota/challenge/cấp tenant qua RPC.
   Chốt policy Auth signup tương thích lời mời; tắt đăng ký mới không làm hỏng
   login, reset mật khẩu và invitation nhân viên hiện hữu.
5. Email xác thực/reset/invite dùng origin + workspace đã duyệt, không URL browser
   tùy ý. Resend cooldown, link expired/replay, callback tab mới và device mới có test.
6. Local dùng inbox kiểm soát. Staging kiểm tra SPF/DKIM/DMARC theo provider, Gmail/
   Outlook thử, bounce/complaint/webhook và chống gửi trùng. Không coi Mailpit/Inbucket
   là bằng chứng gửi Internet; không test bằng địa chỉ khách thật.

**Đạt:** D12–D14 bằng môi trường tương ứng; D15 cần domain/provider thật. Khóa email
chưa có không chặn hoàn thiện limiter, callback, template và provider adapter local.

## 8. Đợt 5 — giao diện quản trị để vận hành hằng ngày

### T14 — login quản trị và lớp dữ liệu (P5-01)

File: `src/App.tsx`, `SuperAdminLayout.tsx`, auth/hook hiện có; thêm client control
typed và hooks riêng. Không dùng hook default tenant backend cho dữ liệu đa cụm.

1. Entry `/super-admin/login` ở root dùng authority cố định, hoạt động cả khi
   frontend bật directory. Workspace owner không mặc nhiên có quyền platform.
2. Điều hướng từ `/app/:slug` tới admin bằng root URL đã duyệt; không thêm basename
   workspace trước `/super-admin`. Login thất bại có cách thử lại, không về onboarding.
3. Query keys có authority identity/session scope và cluster/filter/cursor. Logout,
   đổi quyền/cụm xóa cache nhạy cảm và hủy request cũ; không cache token trong key.
4. Các mutation dùng command identity lưu bền cho payload đang chờ. Chỉ bỏ identity
   khi có receipt/outcome rõ; 409 đọc lại version và yêu cầu người dùng xem thay đổi.
5. Phân biệt initial loading, empty, unavailable và stale. Dữ liệu cũ vẫn xem được
   có nhãn nhưng không dùng làm bằng chứng cho phép lệnh nhạy cảm.

**Đạt:** A03 phần admin, E05/E08; server auth denial vẫn đúng khi tự gọi API.

### T15 — hai màn hạ tầng, tránh dashboard dư thừa (P5-02)

| Route | Nội dung trên vùng đầu màn hình | Thao tác có chỗ click |
|---|---|---|
| `/super-admin/infrastructure` | Tổng cụm/đang nhận/bị chặn; mỗi dòng tên cụm, máy, số workspace đã giữ/dùng, gate + lý do, RAM/disk còn lại, thời điểm đo | Xem chi tiết, ngừng nhận mới, thêm cụm đã chuẩn bị |
| `/super-admin/infrastructure/:id` | Một banner nguyên nhân + việc cần làm; tài nguyên, trạng thái dịch vụ, limit/suất, backup/restore và release | Kiểm tra lại, mở/đóng nhận mới, draining/serving, đổi policy |

1. Trạng thái serving, sức khỏe, nhận khách và gói thuê bao có nhãn riêng; không dùng
   một dấu chấm xanh cho bốn nghĩa. Metric thiếu không hiển thị 0%.
2. Dùng chữ đậm trên trắng/xám, xanh dương cho hành động, cam/đỏ cho cảnh báo/lỗi;
   chữ/icon đi kèm màu, tương phản đủ WCAG AA cho text và control liên quan.
3. Dialog lệnh cho xem trước/sau, số workspace bị ảnh hưởng, version và lý do.
   `open_admission` liệt kê mọi điều kiện còn thiếu; không có nút bỏ qua critical.
4. `set_draining` chỉ ngừng phân bổ mới và giữ route cũ; `set_serving` không tự mở
   admission. Không thêm nút restart DB/restore production hoặc shell console.
5. Alert/backup nằm trong detail/section có deep link, không thêm menu phụ lặp.
   Alert ack không tự chuyển banner thành khỏe nếu metric vẫn xấu.

**Đạt:** E03–E05; toast chỉ báo kết quả đã commit hoặc yêu cầu nền đã được enqueue.

### T16 — danh sách đăng ký, timeline và dữ liệu đúng cụm (P5-03)

1. `/super-admin/registrations`: tìm slug/workspace/request ID, filter trạng thái,
   lỗi/cụm/tuổi đăng ký; count server, cursor 25/100 và filter trong URL.
2. `/super-admin/registrations/:id`: bước hiện tại, owner đã verify hay chưa trong
   phạm vi được phép, timeline intent/Auth/provision/receipt/active, job/attempt gần
   nhất, lý do lỗi, mã hỗ trợ và hành động tiếp theo. Không hiện secret/raw payload.
3. Phân biệt “Chủ cần tiếp tục”, “Không kết nối được cụm” và “Cần đối soát”; nút
   “Kiểm tra lại” hiển thị pending job, không hứa đã sửa ngay khi nhận 202.
4. Tenant-summary do control đọc server-to-server tại cluster đã gán, quyền đọc tối
   thiểu. ID toàn nền tảng là cluster + tenant, không chỉ UUID tenant.
5. Có liên kết hai chiều tới khách hàng/cụm tương ứng. Nếu backend kia unavailable,
   hiển thị lỗi tại cụm đó; không fallback sang dữ liệu default hoặc hiển thị số 0.
6. Billing/gói chỉ bật thao tác đã hỗ trợ đúng backend. Không lấy authority session
   giả danh chủ khách; không mở quyền settlement nhờ có quyền vận hành hạ tầng.

**Đạt:** E01/E02/E08, G01; không chức năng nào chỉ có API mà bị mất đường truy cập
trong UI đã bàn giao. Timeline dài phải đọc tiếp được, không giấu lịch sử sau trang đầu.

### T17 — nghiệm thu usability bằng việc thật (P5-04)

1. Người thử chưa biết bản ghi mẫu tìm đăng ký lỗi và chọn hành động đúng trong
   30s; ghi thời gian, bước click và điểm gây nhầm, không chỉ người viết code tự demo.
2. Desktop, 390px, zoom 200%, tab/shift-tab/enter/escape; dialog giữ/trả focus đúng,
   nhãn screen reader và vùng báo lỗi rõ. Không tràn ngang giấu hành động chính.
3. Scroll menu xuống cuối rồi đổi trang: nội dung mới hiện từ đầu. Back trả đúng
   filter/trang/vị trí trước; direct link có fallback hợp lý, không về trang bất kỳ.
4. Hai tab/admin thay policy, F5 sau mất response, API 503, session revoke và query
   trả muộn khi đổi cụm: không hiện success/cached data của cụm khác.

**Đạt:** E01–E08 với browser kết nối API thật; component mock chỉ là lớp hỗ trợ.

## 9. Đợt 6 — bộ cài VPS, backup ngoài máy và ứng cứu

### T18 — bundle có thể cài lại và nâng cấp an toàn (P6-01)

File mới dự kiến: `deploy/vps/`, release manifest, preflight/deploy/verify scripts
và env examples. Giữ `control-local.mjs` cho phát triển, không dùng CLI Supabase
local làm bộ cài production.

1. Pin bộ Supabase self-host đầy đủ, frontend/proxy/control/worker/directory và
   monitoring; ghi image digests, schema/contract, host architecture và data mounts.
   Trước khi chọn bundle, qua bảng tương thích ở mục 16: không lấy compose upstream
   mới nhất để vô tình nâng PG major, đổi Kong/Envoy hoặc callback Auth của hệ hiện có.
2. Preflight read-only kiểm tra OS/RAM/disk/inode/clock/Docker/port/DNS/TLS/secret,
   tên môi trường/volume hiện có. Sai host, thiếu secret hoặc volume mismatch phải
   dừng trước prepare/apply; không tự format, đổi ownership rộng hoặc tạo DB rỗng.
3. Tách prepare → migrate bằng account riêng → deploy → verify. Runtime không có
   migration credential; secret nằm file quyền hạn chế/secret store, không build args.
4. Public chỉ proxy/TLS cần thiết; DB/control/exporter riêng tư hoặc loopback tùy
   topology. Đường SSH/quản trị giới hạn riêng, không đi qua chức năng khách hàng.
5. Kiểm tra TLS renewal, WebSocket Realtime, upload limit/timeouts, CSP/allowlist,
   redirect/callback, VAPID và Android deep link trên chính release được phục vụ.
6. Resource limits, restart, healthcheck, log rotation, disk alert và bounded pools.
   Ghi đường dẫn volume thật; deploy lại không tạo volume mới che khuất dữ liệu.
7. Upgrade theo expand/contract, compatibility matrix binary/schema; giữ image cũ.
   Migration không tương thích thì forward-fix hoặc quy trình restore riêng, không
   chạy binary cũ kèm schema.sql để hạ DB hoặc xóa history.

**Đạt:** F01–F04 trên Linux staging; restart VPS thực và xác nhận dữ liệu còn nguyên.

### T19 — backup theo bộ nhất quán và restore sang máy sạch (P6-02)

1. Inventory đầy đủ directory mapping/affinity/command/job/audit; DB tenant/Auth/
   Storage metadata/PGMQ; Storage object bytes; release manifest; cấu hình và các
   secret/Vault key cần khôi phục. Không coi backup DB là backup đủ ứng dụng.
2. Mỗi backup set có ID, scope/cluster/environment, UTC time window, schema/image,
   checksum từng phần, số object/bytes, trạng thái verify và secret-reference version.
3. Pilot dùng maintenance window quiesce mọi writer liên quan: app/API, jobs,
   uploads và dịch vụ nền/Auth có ghi. Xác nhận không còn writer trước tạo snapshot
   DB + objects cùng bộ; chỉ một cờ frontend không được coi là đã ngừng ghi.
4. Dùng công cụ backup/mã hóa chuẩn đã pin; upload tới kho ngoài failure domain
   VPS, verify đọc/checksum sau upload. Secret giải mã giữ kho/quyền tách biệt nhưng
   có break-glass đã thử; không lưu key duy nhất cùng máy hay cùng backup ciphertext.
5. Lịch khởi đầu đề xuất mỗi 12h để có dư địa với RPO ≤24h. Retention backup phải
   duyệt theo chi phí/nghĩa vụ dữ liệu; cleanup có dry-run + ownership + manifest,
   chưa tự xóa backup đang có theo thời hạn suy đoán.
6. Restore vào host/volume mới có nhãn; từ chối source/live target. Verify đủ parts,
   key/checksum/version trước mở dịch vụ; thiếu object hoặc sai key phải fail rõ.
7. Kiểm tra login owner/staff, workspace routing, rooms/bookings mẫu, invitation,
   file bytes/hash, receipt/trial và khả năng xử lý queue theo semantics cũ. Đối
   soát job/payment có thể đã chạy ngoài snapshot; không tự replay tác vụ tài chính.
8. Drill mất host gốc: chỉ dùng offsite + secret store độc lập. Đo thời điểm dữ liệu
   gần nhất (RPO) và thời gian tới phục vụ lại (RTO); mục tiêu pilot ≤24h/≤4h chỉ
   được công bố khi đo đạt với dataset đã ghi.

**Đạt:** F05–F08. Bản sao cùng ổ hoặc dump đọc được chưa đóng được mục mất cả máy.

### T20 — runbook đủ dùng khi không có người viết code (P6-03)

Mỗi runbook ghi: dấu hiệu → mức ảnh hưởng → kiểm tra read-only → khôi phục theo
target xác định → kiểm tra dữ liệu/health → điều kiện mở nhận mới → người trực.

| Tình huống | Xử lý ban đầu | Bằng chứng để kết thúc |
|---|---|---|
| Control/directory down | Đóng signup; giữ mapping và data clusters; kiểm tra volume/DB/pool | Ready đúng schema, mapping/receipt đối soát, alert resolved |
| Metrics stale/worker mất | Admission blocked, báo unknown; sửa nguồn/collector | Fresh đủ warmup, recovery đúng cửa sổ, admin mở lại |
| Disk/inode/connection critical | Dừng nhận mới; khoanh vùng WAL/log/object/query/pool | Số đo giảm bền vững; không xóa dữ liệu khách để chữa nhanh |
| Backend unreachable | Giữ cluster mapping, kiểm tra mạng/TLS/service | Đúng backend phục hồi, probe và dữ liệu canary đạt |
| Credential/TLS lỗi | Đóng nhận mới, rotate/renew theo release refs | Secret không lộ; workspace không đổi cụm; auth/requests đạt |
| Provisioning kẹt | Đọc job/receipt, phân biệt missing/unavailable/conflict | Cùng binding hoặc waiting_owner/needs_review có người nhận |
| Backup/offsite thất bại | Cảnh báo, không tự đánh dấu verified/mở cụm | Bộ backup mới verify và restore proof còn hạn |
| Mất cả VPS | Nhận cảnh báo ngoài máy, phục hồi host sạch | RPO/RTO, data checks và đường truy cập được ghi nhận |

**Đạt:** F09/B09; người vận hành khác thực hiện một drill theo tài liệu và nhận
được cảnh báo thử ở đích được kiểm soát. Không dùng sửa SQL tùy ý như thao tác thường ngày.

## 10. Đợt 7 — chứng minh sản phẩm trước pilot

### T21 — hai backend độc lập thật (P7-01)

1. Hai bộ Auth/DB/Storage/Realtime/Functions, key/secret/volume/network riêng; một
   directory chung. Nếu máy local không đủ RAM, dùng hai host thử hoặc staging;
   không đổi sang hai URL trỏ cùng DB rồi gọi đó là đa cụm.
2. Signup mới ở A/B, token A không dùng ở B; đồng thời token A ở A vẫn chạy, tránh
   kết luận security pass vì cả hai backend đều hỏng. Test rows/object/channel/RPC.
3. Cố ý có tenant UUID giống nhau trong fixture độc lập nếu phù hợp, để chứng minh
   console/routing dùng cluster+tenant. Callback/reset/invite/mobile về đúng cụm.
4. Drain A, khách mới chưa có affinity sang B; khách A vẫn vào A. A down không làm
   khách đã gán A rơi sang DB B hoặc tạo lại Auth/tenant.

**Đạt:** G01–G03 và phần data isolation D/E liên quan; lưu positive/negative controls.

### T22 — browser E2E và fault injection (P7-02)

1. Seed dữ liệu tổng hợp theo run ID, email inbox thử; kiểm tra exact schema/images.
   Browser test thao tác qua UI và API thật, không thay network bằng mock khi nghiệm thu.
2. Chạy owner signup → email → onboarding → tạo phòng → mời staff → staff đăng nhập
   đúng quyền → nghiệp vụ room/booking cơ bản → logout/reset → mở lại workspace.
3. Chạy admin tìm đăng ký → xem cụm → close/open/đổi limit → recheck → kiểm tra audit.
   Kèm quay lại/scroll/mobile, hai admin, session revoke và dữ liệu stale.
4. Chặn response chỉ sau khi có bằng chứng remote/local commit, kill worker tại
   các điểm đã định, mất DB/metrics/backend trong sandbox. Không fault inject trên
   container dự án khác hoặc dữ liệu khách đang dùng.
5. Sau từng lỗi, đếm owner/tenant/hotel/trial/job/receipt, kiểm tra mapping không
   đổi và không mất bản ghi. Có screenshot/trace quan trọng đã lọc thông tin nhạy cảm.

**Đạt:** các case A–F/G liên quan môi trường được chạy lại trên release candidate;
not-run được giữ nguyên cùng lý do, không chuyển thành pass bằng demo tay.

### T23 — capacity profile và limit có căn cứ (P7-03)

1. Ghi VPS CPU/RAM/disk/IOPS/region, Docker/kernel, image digests, DB settings,
   lượng dữ liệu, kích thước file và toàn bộ service cùng máy.
2. Dataset console ít nhất 1.000 workspace. Dataset nghiệp vụ theo profile
   10/50/100 khách sạn và 10–50 tài khoản/khách sạn; số tài khoản khác số đang hoạt động.
3. Tăng 10 → 25 → 50 → 100 phiên đồng thời có think time 3–10s và workload được
   ghi trước: login, rooms, bookings read/write, realtime, uploads, report, signup.
   Không bắt buộc đạt mức cuối; dừng khi lỗi/critical/pool/IO vượt tiêu chí.
4. Đo p50/p95/p99, 5xx, DB pool/wait/locks, CPU/RAM/disk/IO, realtime delay, job age,
   RSS/leak và tác động tenant nặng lên tenant đối chứng. Warmup tách khỏi sample.
5. Target staging: bootstrap/setup-status server p95 ≤500ms; reserve ≤1s; provision
   hợp lệ đến active ≤10s không tính email; admin page ≤1s với limit chuẩn.
6. Soak ít nhất 60 phút ở operating profile đề xuất; 5xx không chủ ý <1%, không
   memory/queue tăng vô hạn hay connection leak. Ghi cả request bị gate từ chối
   theo kỳ vọng, không gộp với outage để che hoặc thổi error rate.
7. Báo maximum tested và operating limit có headroom. Lấy điểm bắt đầu suy giảm để
   đặt giới hạn bảo thủ, đo lại ở giới hạn đó; không chọn số tenant chỉ từ RAM trống.
   Chi phí gồm VPS, backup, bandwidth/email/monitoring và vận hành.

**Đạt:** G04–G06, P3-03. Mục tiêu 1.000 khách sạn được phục vụ bằng nhiều cụm đã
đo; chưa có cơ sở cam kết một VPS hoặc toàn hệ thống đạt 100.000 phiên đồng thời.

### T24 — release candidate, cutover và rollback (P7-04)

1. Đối chiếu 70 case: pass/fail/not-run theo môi trường, không cộng lại test cũ.
   G08 là pilot đợt 8 nên chưa pass ở release candidate; không vì vậy giả đóng case.
2. Full suite/build ở integration; contract parse/refs/security, schema/grants,
   Supabase advisors đúng CLI đã kiểm tra `--help`/version, secret/artifact scan và
   container smoke. Legacy warning có owner/ảnh hưởng, không lẫn với lỗi mới.
3. Không còn lỗi Critical/High ảnh hưởng quyền, dữ liệu, phân bổ hoặc restore trước
   gate liên quan. Test hỏng do fixture/runner cũng phải sửa hoặc ghi không kiểm
   chứng được; không gọi đó là lỗi môi trường để cho qua.
4. Cutover trên staging host trước: control sẵn sàng, signup đóng; frontend hỗ trợ
   legacy/workspace/admin; CSP/redirect đúng; mapping khách cũ đối soát theo inventory.
   Chưa có đường legacy đạt thì không bật directory toàn cục trên host có khách cũ.
5. `directory_required=true` chỉ tại cụm đã nghiệm thu; rollback không tắt tùy tiện
   để mở lại đường bypass provisioning. Lưu cờ trước/sau, release/backup/command IDs.
6. Rollback frontend/control bằng image tương thích, giữ directory/mapping/receipt;
   đóng signup/claim mới trước khi khôi phục. Không `down -v`, reset DB, xóa workspace
   hoặc đổi cluster endpoint để che sự cố. Schema không tương thích thì forward-fix.

**Đạt:** G07 và release checklist; gate pilot chỉ mở khi staging/backup/alert/capacity đạt.

## 11. Đợt 8 — pilot có người dùng được chọn (P8-01)

### T25 — giới hạn ban đầu, quan sát và quyết định

1. Trước ngày 0: chỉ định người trực, giờ hỗ trợ, kênh sự cố, allowlist khách pilot,
   limit từ profile, backup/offsite/restore proof và kill switch signup đã thử.
2. Ngày 0: một khách sạn nội bộ, đi hết owner/staff/rooms/booking/upload/callback.
   Ghi thời gian đến khách sạn, phòng và nhân viên đầu tiên; mọi lỗi có ticket/owner.
3. Sau 24–48h ổn định mới xem xét thêm từng khách, tối đa nhóm 5–10 khách pilot
   đã chọn. Có sự cố Critical/High thì ngừng tăng, đóng nhận mới khi cần.
4. Quan sát ít nhất 7 ngày; gồm giờ cao điểm, backup hằng kỳ, một restore drill,
   một alert drill, vận hành recheck và feedback UX thực tế.
5. Mục tiêu theo dõi API quan trọng ≥99,5% trong cửa sổ pilot; ghi cách đo, outage,
   provider lỗi và tác động riêng. Không cam kết SLA dài hạn từ một tuần dữ liệu.
6. Báo cáo quyết định: tiếp tục pilot / mở thêm có giới hạn / thêm cụm / sửa trước.
   Public signup và thu phí cần gate U/B riêng, không tự mở khi đủ bảy ngày.

**Đạt:** G08; không rò/mất dữ liệu, không cấp phát trùng, có số đo vận hành và người
chịu trách nhiệm. Hết thời gian quan sát mà chưa đủ bằng chứng thì kéo dài pilot.

## 12. Bảng đối chiếu đủ 27 gói công việc

| Gói | Bước thực thi | Bằng chứng bắt buộc / case chính |
|---|---|---|
| P0-01 | T01 | Baseline nguồn/runtime/port/flags; A01–A03 theo môi trường |
| P0-02 | T04, T08 | ADR và contract khớp implementation, version/state/error rõ |
| P0-03 | T01, T21, T22 | Fixture ownership, email/accounts, hai backend, cleanup an toàn |
| P1-01 | T02 | Upgrade/rerun/checksum/lock/grants; A04–A06 |
| P1-02 | T02, T04, T12 | Restart/drain/readiness API+DB+worker; A07 |
| P1-03 | T03, T04 | Authority, command/version/receipt/audit; A08–A11 |
| P2-01 | T05 | Linux metric đúng host/mount, mạng riêng; B01–B03 |
| P2-02 | T06 | Sample/generation/freshness/window/restart; B04–B07 |
| P2-03 | T07, T20 | Alert lifecycle và heartbeat ngoài host; B08–B09 |
| P3-01 | T08 | Registry/credential/manifest/SSRF/rotation; C01–C04 |
| P3-02 | T09 | Slots/retry/close race/affinity/first provision; C05–C10 |
| P3-03 | T10, T23 | Budget và noisy-neighbor có số đo; G05 |
| P4-01 | T11 | Owner/setup-status/resume/forms/privacy; D01–D06 |
| P4-02 | T12 | Receipt/job/lease/fencing/kill recovery; D07–D11 |
| P4-03 | T13 | Proxy/Auth/abuse/email; D12–D15 |
| P5-01 | T14 | Root admin login, cache/authority/routes; A03/E08 |
| P5-02 | T15 | Hạ tầng và command dialog; E03–E05 |
| P5-03 | T16 | Registrations/timeline/recheck/tenant-summary; E01/E02/E08 |
| P5-04 | T17 | Usability/scroll/Back/mobile/keyboard; E01–E08 |
| P6-01 | T18 | Linux deploy/redeploy/restart/TLS/secret; F01–F04 |
| P6-02 | T19 | Full offsite backup/restore/failure/host loss; F05–F08 |
| P6-03 | T20 | Runbook người khác thực hiện được; F09 |
| P7-01 | T21 | Backend A/B thực sự cách ly; G01–G03 |
| P7-02 | T22 | Browser E2E + faults trên source/image xác định |
| P7-03 | T23 | Capacity/soak/dataset/noisy-neighbor; G04–G06 |
| P7-04 | T24 | Full release, defects, gate/cutover/rollback; G07 |
| P8-01 | T25 | Báo cáo pilot ít nhất 7 ngày; G08 |

70 case giữ nguyên định nghĩa tại tài liệu nghiệm thu. Bảng này là đường thực thi,
không phải báo cáo pass. Mỗi case nhiều assertion vẫn chỉ là một case khi tổng hợp.

## 13. Kiểm tra và báo cáo sau từng đợt

### Lệnh đã có trong repository

Chạy tại integration sau khi hoàn thành thay đổi tương ứng, không coi danh sách
lệnh là kết quả đã chạy trong lượt lập plan:

```powershell
npm run test:control
npm run test:control:db
npm run build
npm run verify:build
npm run control:local -- preflight
npm run control:local -- verify
```

`test:control:db` dùng PostgreSQL disposable riêng. Frontend build/full suite chạy
ở cổng tích hợp khi có thay đổi FE hoặc release; backend-only kiểm tra đúng phần
liên quan trước. `control:local -- up` và `restart-check` chỉ chạy sau review/migrate
sandbox đạt, dùng state local đang có và signup vẫn false.

Không dùng `test:control:local` trên backend nghiệp vụ đang dùng: script cũ có thay
đổi `directory_required`. E2E mới phải trỏ sandbox có ownership/fixtures rõ ràng.
Script monitoring/worker/VPS mới chỉ được ghi lệnh chính thức sau khi đã triển khai,
có `--help`, kiểm tra input/target và runbook; không để lệnh dự kiến trông như có sẵn.

### Nội dung báo cáo bắt buộc

1. Đã thay đổi gì, ở nhánh/commit nào, đã đồng bộ/deploy tới đâu.
2. Case đạt/lỗi/chưa chạy, command thực tế, môi trường và artifact mới.
3. Image/schema/policy versions và cờ signup/directory liên quan.
4. Ảnh hưởng khách đang dùng, rollback và lỗi còn mở với mức độ/người phụ trách.
5. Việc tiếp theo có thể làm ngay và việc cần đầu vào bên ngoài.

Artifact không có credential/raw email/payload. Có source tree hash cho mã chưa
commit, image digest thực chạy, schema history và run ID; không gán hash code mới
cho image cũ hoặc sửa artifact nền để tạo cảm giác test mới đã chạy.

## 14. Đầu vào bên ngoài để riêng, chưa cần để làm code/local

| Đầu vào | Cần khi nào | Có thể hoàn thiện trước | Chứng minh khi đã có |
|---|---|---|---|
| VPS staging, SSH/CI, OS/IP/tài nguyên | T05 đối chiếu Linux, T18 deploy, T23 capacity | Compose/preflight/verify và sandbox | F01–F04, B01, capacity đúng cấu hình máy |
| DNS roomqc.com, staging/app/API origins và TLS | Callback/CSP/mobile staging, T18/T22 | Origin allowlist, template, test local | Browser/Auth/Realtime/Storage qua domain thật |
| Resend/SMTP, miền verified, webhook secret | T13 email thật | Queue/templates/provider adapter/inbox thử | D15, bounce/retry/callback đúng; tình trạng tài khoản phải kiểm tra lại |
| Chống bot production | Gate public | Adapter/server verification/test fixtures | Challenge fail/replay/direct Auth và hạn mức đạt |
| Kho offsite và khóa phục hồi | T19 backup thật, gate pilot | Manifest/encryption/restore pipeline local | F05–F08 bằng bản lưu ngoài máy |
| Đích alert và hệ thống heartbeat độc lập | T07/T20, gate pilot | Alert lifecycle/runbook/inbox local | B09/F09 khi host thử mất kết nối |
| Operator/MFA và khách pilot | Lệnh production/T25 | Capability server, UI, checklist | Người trực xử lý drill; khách được chọn hoàn tất hành trình |

Không yêu cầu gửi secret trong chat. Khi tới bước cấu hình, nhập vào server/secret
store được quản trị; báo cáo chỉ giữ tên ref và trạng thái. Thiếu các đầu vào trên
không phải lý do bỏ dở T01–T17 hay đánh dấu triển khai VPS/email/offsite đã hoàn tất.

## 15. Điều kiện chuyển cổng

| Cổng | Điều kiện tối thiểu | Phạm vi cho phép |
|---|---|---|
| Local | Nền/control/commands đạt, fixture tách biệt; gate đúng nguồn, worker/flow local đạt theo đợt | Dùng tài khoản/dữ liệu tổng hợp trong sandbox |
| Staging | T05–T20 đạt trên cấu hình staging; callback/TLS/email/backup và A–F liên quan có bằng chứng | Khách thử kiểm soát, chưa mở rộng công khai |
| Pilot | E2E đa cụm/fault/load/cutover phù hợp đạt; restore offsite/alert/người trực sẵn sàng; không còn lỗi nghiêm trọng liên quan | Một khách nội bộ rồi nhóm 5–10 khách được chọn |
| Public | Anti-abuse/Auth/proxy/monitoring/support đã nghiệm thu, pilot đủ bằng chứng, limit/kill switch đã thử | Đăng ký công khai có hạn mức |
| Paid | Gate thanh toán/settlement/provider/chính sách gói và quyền dữ liệu riêng đã đạt | Thu phí/cấp gói thật theo backlog billing |

Ưu tiên thực thi tiếp theo là **T05–T07**: nối collector/exporter/probe/cảnh báo
dựa trên multi-mount/source adapter đã test. Tiếp theo **T08–T10**, cùng phần Auth
còn lại ở T03, trước luồng signup và console. Các test T01–T04 vẫn là hàng rào hồi quy.

## 16. Tương thích Supabase phải khóa trước bộ cài và cutover

Đã đọc changelog và tài liệu Docker ngày 19/10/2026; chưa nâng cấp dịch vụ theo các
thông báo này. Áp dụng tùy release self-host đã chọn, không mặc định chính sách
Supabase Cloud đã có hiệu lực trên container local đang dùng.

| Thay đổi cần rà | Bước chịu trách nhiệm | Kiểm tra và cách xử lý |
|---|---|---|
| Gateway mặc định chuyển Kong → Envoy | T08/T18/T22 | Inventory release/config hiện có; chốt gateway trong manifest. Test toàn bộ route/RPC/WebSocket/headers. Giữ bản cũ đã pin nếu chưa kiểm chứng chuyển đổi; không phụ thuộc service name `kong` trong bộ cài mới |
| `API_EXTERNAL_URL` có hậu tố `/auth/v1` ở cấu hình mới | T13/T18/T22 | Đối chiếu release/template; test xác thực/reset/invite/mobile, không nối hậu tố hai lần; không sửa URL production chỉ vì default upstream đổi |
| Postgres major 15 → 17 không tự nâng volume | T18/T19 | Ghi major/extension/collation. Cài mới chọn bộ tương thích; nâng dữ liệu cũ thành đợt có backup/restore/upgrade test riêng, không đổi tag rồi mount volume cũ |
| Minor PostgreSQL 15.19/17.11: ltree, btree_gist/NaN, pgcrypto legacy cipher và custom operator | T18/T19/T24 | Kiểm tra extension/index/cipher/operator theo changelog cho từng release đích; reindex/chuyển mã hóa/restore compatibility chỉ trong đợt nâng cấp có bằng chứng. Chưa chạy các thao tác này trên DB nghiệp vụ trong lượt lập plan |
| Bảng mới không mặc định được Data API expose | T08/T11/T24 | Kiểm tra grants/privileges và RLS trên release đích. Manifest server-only phải từ chối anon/staff; endpoint nghiệp vụ chỉ cấp đúng role/policy, không mở toàn schema để hết lỗi |
| TLS 1.2 CBC cũ bị loại ở HTTP API Cloud từ 10/11 | T18/T22 | Test trust/cipher bằng client web/Android và proxy thật; không gán lịch Cloud thành việc đã cập nhật self-host |

Nguồn đối chiếu:

- [Self-host Docker và lựa chọn bộ release](https://supabase.com/docs/guides/self-hosting/docker).
- [Thay đổi gateway](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b).
- [Thay đổi Auth external URL](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1).
- [Nâng major PostgreSQL](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change).
- [Tương thích minor PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- [Quyền Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- [TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).


## 17. Phiếu chuẩn bị triển khai tiếp theo — chốt ngày 19/10/2026

Đây là run sheet bổ sung, không thay 27 gói, 25 bước hoặc 70 case bên trên.
Mục 17.1–17.3 giữ mốc lịch sử trước khi M04/M05 hoàn tất kiểm chứng nguồn local;
điểm bắt đầu mới dùng mục 18 và tracker, không triển khai lại các phần đã đạt.
Tình trạng công việc lấy ở tracker; việc có tên file, script hoặc cấu hình chưa
chứng minh đã deploy. Lượt rà này không mở signup, đổi DNS, gửi email thật hoặc
ghi vào Supabase nghiệp vụ. M04 được tiếp tục trong sandbox riêng theo mục 17.3.

### 17.1. Mốc nguồn và runtime phải phân biệt

- Nguồn đã kiểm chứng trước lượt này: dec5fdf, suite 59/59; artifact source cũ giữ nguyên.
- Runtime quan sát 15:19 +07:00: /api/control/livez và /api/control/readyz tại
  8091 trả 200; readyz qua proxy 8082 trả 200, schema 0005-health-snapshot-guard.sql.
- Image control đang chạy:
  sha256:a65408e99b5cc9f012c582be7e0c46b211d089e605c44335e194e38dc73136e1.
  Image frontend:
  sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b.
- Nhánh integration có M04 đang hoàn thiện: compose, DB queries/role, renderer,
  monitoring-config và thay đổi telemetry-source. Không gán hash image trên cho mã mới.
- Bộ unit/DB hiện tại đã chạy 64/64 trước khi thêm kiểm thử stack monitoring thật.
  Kết quả này không chứng minh exporter chạy được, không là 64/70 acceptance.
- Tài nguyên Docker Desktop chỉ phản ánh Linux VM; B01 Linux VPS vẫn cần staging.

### 17.2. Điều kiện bắt đầu mỗi ticket

1. Ghi ID T/M/P và acceptance ID liên quan, phạm vi môi trường và người nhận việc.
2. Ghi git diff/source hash, image/schema/config trước khi chạy; nhận diện phần đang dở.
3. Fixture phải có run ID và manifest tên container/network/volume/temp directory;
   không nhận tên project/DB nghiệp vụ làm fixture hoặc tự fallback khi thiếu config.
4. Chỉ chạy một migrator với quyền phù hợp tại target được duyệt; runtime không giữ
   quyền DDL. Không chỉnh checksum file đã có history.
5. Chốt contract trước API/UI: dữ liệu nào server sở hữu, version/idempotency, lỗi,
   timeout, pagination và DTO không chứa bí mật.
6. Ghi trước expected/actual, negative control và điều kiện cleanup. Test lỗi vẫn
   phải thu hồi đúng tài nguyên đã tạo, không down -v hoặc xóa theo glob.
7. Thiếu secret bên ngoài thì ghi deferred_external đúng gate; tiếp tục phần local
   độc lập. Không dùng fixture success hoặc nới quyền để lấp thiếu cấu hình.
8. Người thực hiện có thể là cùng một kỹ sư qua nhiều đợt; review, người trực và
   người duyệt pilot/public phải được chỉ định trước cổng tương ứng.

### 17.3. Đợt gần nhất: M04 → M05 → M06/T08 → M07/M08 → M10

| Bước con | Việc cụ thể theo thứ tự | File/đầu ra | Đóng bước bằng bằng chứng |
|---|---|---|---|
| M04-a | Rà digest, UID, resource/log limits, private network và host mount; xác nhận không cần privileged/PID host/Docker socket | deploy/monitoring/compose.yml và test config | Compose chạy được trên môi trường đã ghi; exporter/DB không publish port |
| M04-b | Áp role thống kê mới trong PostgreSQL disposable; cấp LOGIN/password qua secret channel; kiểm tra quyền PUBLIC không cho đọc/ghi business fixture | exporter-roles.sql, queries.yml | Đọc thống kê đúng; business SELECT/DML/DDL và tự tăng quyền đều bị từ chối |
| M04-c | Render bundle mới từ target inventory; không ghi đè thư mục có sẵn, không in DSN/password | monitoring-config.mjs, render-monitoring-config.mjs | --help không ghi; input sai dừng; bundle readable đúng container UID; rerender cùng thư mục bị chặn |
| M04-d | Discover filesystem thực chứa volume fixture; đối chiếu CPU, MemAvailable, disk/inode và số client DB | monitoring-stack.test.mjs, log mới | Sai mount/unsupported FS phải fail; không thay bằng ổ bất kỳ để lấy số |
| M04-e | Thu hồi quyền thống kê, dừng DB, dùng mật khẩu cũ và rotate có chủ đích | Cùng integration test | Nguồn từ chối mẫu lỗi; sau sửa có mẫu thật mới; không mở admission |
| M04-f | Kiểm tra socket qua các đường symlink, non-root/capabilities; dọn tài nguyên theo ownership | Runtime inspect + cleanup guard | Không còn container/network/volume/temp fixture, không ảnh hưởng stack khác |
| M05-a | Thêm entrypoint worker riêng, pool metrics, chu kỳ 30s và giới hạn target/fanout | workers/health-worker.mjs và compose, dự kiến | Không scrape trong HTTP handler; không chồng vòng hoặc queue vô hạn |
| M05-b | Khóa snapshot vào expected target fingerprint hiện hành; đổi cấu hình làm bằng chứng cũ mất hiệu lực ngay | Config/HealthStore + migration nếu cần | Chưa có mẫu target mới vẫn không được dùng snapshot target cũ để nhận khách |
| M05-c | Sweep stale độc lập với source collect; heartbeat/readiness; SIGTERM/kill/restart | Worker tests + DB tests | >120s chặn tại reserve dù worker ngừng; window/generation không lùi |
| M06/T08 | Triển khai manifest server-only và canary của đủ Auth/REST/Storage/Realtime/Functions | Migration Supabase bằng CLI, probe adapter/tests | Key sai/release sai/service down bị phân biệt; không hard-code năm probe true |
| M07/M08 | Alert lifecycle + ack command/audit + notification outbox/cooldown/retry | Store/API/dispatcher tests | Một lỗi một alert; ack không mở gate; mất response/restart không gửi dồn vô hạn |
| M10 | Suite hồi quy + runtime sandbox + source/image/schema manifest và handoff | Artifact mới, tracker, runbook | Pass/fail/not-run riêng; M09/external còn thiếu không bị đánh dấu pass |

M04 dùng fixture PostgreSQL riêng; chưa phải full Supabase và chưa chứng minh năm
service hoạt động. Chu kỳ scrape local có thể 5s để kiểm thử; staging/production
không lấy cấu hình test này làm chuẩn. Nếu host bind không hỗ trợ propagation,
chọn cấu hình tối thiểu đã thử, không sửa mount propagation toàn host hoặc cấp
privileged. Khi thay mount/inventory phải kiểm tra lại exporter và warmup.

### 17.4. Hợp đồng phải khép trước signup/UI

| Ranh giới | Nội dung bắt buộc | Trường hợp phải chặn |
|---|---|---|
| Registry → backend | Cluster ID/endpoint trong inventory, DNS/IP pinning, TLS đúng hostname, credential ref, release/schema manifest | Endpoint lạ, ref mất, version lệch, manifest không xác minh |
| Metrics → admission | Target/schema/policy version, generation, observedAt/validUntil; xét từng mount | Unknown/stale/sai target/critical/không đủ warmup |
| Reserve → Auth | Workspace UUID/slug, affinity và expiry gốc; cluster do server chọn | Retry muốn đổi cụm, body tự gán role/tenant/gói |
| Provision → receipt | Workspace/cluster/owner/tenant/hotel/routing version khớp toàn bộ | Email chưa verify, token sai cụm, receipt conflict |
| Worker → activation | Job lease/fencing + receipt hợp lệ; local commit nguyên tử | Worker cũ trả muộn; routing version đã đổi; outcome chưa rõ |
| Admin → mutation | Authority cố định kiểm tra mỗi request, capability, command ID, expectedVersion/reason | Quyền bị revoke, stale dialog, cùng key khác payload |
| Console → tenant summary | Control server đọc đúng cluster+tenant, DTO tối thiểu, cache có authority scope | Không fallback tenant ID sang backend mặc định |
| Backup → gate | Backup set nhất quán, checksum/offsite verified, restore proof còn hạn | File dump đơn lẻ, thiếu objects/key hoặc backup cùng host |

T03 còn phải kiểm tra Auth/revoke/MFA thật. T09 đã có race ở directory, nhưng phải
chạy lại với backend thật sau M06/T08. Không bật nút mở admission chỉ vì API 200.

### 17.5. Run sheet T11–T17: đăng ký và giao diện

1. Cài GET /api/control/workspaces/{slug}/setup-status theo OpenAPI; chỉ owner/session
   đúng cụm được xem trạng thái riêng tư. Không làm public bootstrap lộ email/job.
2. Hợp nhất UI chờ email → khai báo → đang xử lý → active. Đây là trạng thái hiển
   thị, không tự thêm mọi nhãn UX vào enum workspace.
3. Reload/hai tab/thiết bị mới phải resume bằng phiên và binding server, không chỉ
   sessionStorage. Timeout không xóa form hoặc hướng dẫn tạo khách sạn lần nữa.
4. Khi bắt đầu provision, ghi job cùng transaction. Claim/lease ngắn; gọi backend
   ngoài transaction; activate/ack chỉ sau kiểm tra fencing và receipt.
5. Receipt verified → activate; missing → chủ tiếp tục; unavailable → retry;
   conflict → needs_review. Mỗi nhánh phải có negative test, không gộp thành network error.
6. Limiter bền vững qua restart/nhiều API instance; tách signup/login/invite/reset.
   Kiểm thử direct Auth và forwarded headers, không chỉ nút frontend.
7. Tái sử dụng /super-admin layout: chỉ thêm Hạ tầng và Đăng ký mới; alert/backup
   là section/deep link. /settings/audit-log vẫn là nhật ký khách sạn.
8. Registrations UI đọc workspace API, không tạo thêm nguồn dữ liệu song song.
   Cursor 25/100 và filter trong URL; count server; Back giữ ngữ cảnh.
9. Close/open/limit/recheck dùng dialog có ảnh hưởng/lý do/version; giữ command ID
   khi F5 hoặc mất response. 202 chỉ nghĩa đã nhận công việc.
10. Nghiệm thu 390px/zoom 200%/bàn phím/scroll và session revoke; màu thông dụng,
    có chữ/icon, không pastel khó đọc hoặc menu phụ trùng.

### 17.6. Budget, nghiệm thu và quyết định lên VPS

- T10 lập bảng pool thực tế theo database: số replica × pool mỗi service + kết nối
  tạm (exporter/backup/migrator) + phần dự phòng vận hành không vượt budget đã đo.
  Không coi 1 user = 1 DB connection; không tăng max_connections để thay load test.
- T18 chỉ nhận inventory có OS/architecture/RAM/CPU/disk/inode và mount thật; pin
  full Supabase release. Cài lại/restart không đổi volume hoặc che dữ liệu cũ.
- T19 phải khôi phục directory + Auth/DB + object bytes + cấu hình/key liên quan
  từ bản ngoài host; kiểm tra file hash, login, mapping, receipt và queue.
- T21 dùng hai backend có DB/Auth/key riêng. Hai URL cùng DB không phải đa cụm.
  Token sai cụm bị chặn đồng thời positive control ở đúng cụm vẫn hoạt động.
- T22 test browser với API thật: owner → email → onboarding → phòng → mời staff →
  phân quyền → nghiệp vụ → admin xử lý lỗi, kèm kill/lost-response có kiểm soát.
- T23 tăng tải 10/25/50/100 phiên có think time; soak ít nhất 60 phút. Công bố
  maximum tested và operating limit có headroom; không cam kết 100.000 đồng thời.
- T24 kiểm tra đủ A01–G08 theo môi trường; G08 thuộc pilot, không pass ở staging.
  Lỗi Critical/High về quyền, dữ liệu, phân bổ hoặc restore chặn cổng liên quan.
- T25 một khách nội bộ trước, rồi nhóm 5–10 khách được chọn khi đủ bằng chứng;
  quan sát ít nhất 7 ngày. Public và thu phí vẫn là hai cổng riêng.
- Khách sạn active không bị khóa hoặc tự đổi cụm khi đóng nhận mới. Với lỗi dữ
  liệu/quyền: dừng mở rộng, giữ bằng chứng, đóng signup/claim mới theo runbook;
  rollback image tương thích, không xóa binding/volume để thử lại.

### 17.7. Báo cáo và phần cần RoomQC cung cấp sau

Mỗi đợt ghi: T/M/P IDs → commit/tree hash → image/schema/config thực dùng → lệnh
và expected/actual → acceptance pass/fail/not-run → lỗi/owner → cleanup/rollback.
Không cộng số test qua các lượt, không dùng số assertion làm phần trăm sản phẩm.

Đầu vào gom một lượt theo gate: VPS Linux staging/đường CI hoặc SSH; DNS/TLS của
roomqc.com và origin được duyệt; email provider/domain verified; chống bot production;
kho offsite + khóa khôi phục độc lập; alert/heartbeat ngoài host; operator/MFA và
danh sách khách pilot. Không yêu cầu gửi bí mật trong chat. Thiếu các mục này không
chặn code/test local, nhưng chặn công bố đã nghiệm thu môi trường thật.

Dự toán 21–33 ngày công tại mục 3 là khoảng kế hoạch còn lại ở mốc trước; phải
re-estimate sau M04/M06 và sau kiểm thử hai backend. Không đổi thành lịch cam kết,
không chia theo số nhánh; chờ external và ít nhất 7 ngày pilot tính riêng.

### 17.8. Cập nhật thực hiện M05 — không thay scope/gate

Đợt [M05 local](roomqc-p2-health-worker-local-2026-10-19.md) thêm worker/config/
entrypoint/compose opt-in và directory target binding `0006`; 87/87 test + process
offline SIGTERM/restart đã đạt. Runtime vẫn `0005`, signup đóng; M05/T06 partial,
không coi worker có source là hoàn tất monitoring. [Runbook worker](roomqc-health-worker-runbook.md)
ghi điều kiện bật, quyền, budget và thao tác đổi target.

Thứ tự tiếp theo: M06/T08 đủ release manifest + năm probe có ý nghĩa trên full
Supabase sandbox riêng; khép pipeline thật/restart/kill/DB down-up/10 phút drill
M05/M10; rồi alert lifecycle M07/M08 và external M09. Legacy cluster chưa có host
mapping phải xử lý bằng quy trình audit trước binding, không tự điền host theo tên.
Tiếp tục P3–P8 và đủ 70 case; 87 test local không phải số acceptance đã đóng.

## 18. Điểm bắt đầu đã đối chiếu và thứ tự giao việc

Phần 18–23 là phiếu chuẩn bị thực hiện trên code hiện tại. Các hậu tố T08-a,
T11-b… chỉ chia việc trong T01–T25; không thêm gói P hoặc acceptance ID mới.
Mọi file ghi **dự kiến** đều chưa được coi là đã tồn tại hoặc đã chạy.

### 18.1. Baseline để người nhận việc không triển khai nhầm

| Hạng mục | Quan sát/bằng chứng ngày 19/10 | Hệ quả khi bắt đầu |
|---|---|---|
| Source integration tại baseline M05 | `a3c17c65bdfef6e50ba8864e230aed7693d13c91`; plan tiếp theo commit `6b91fd6` | Bản nháp M06 chưa commit ghi riêng ở mục 18.3; không nhầm với image đang chạy |
| Source directory | Đã có `0006-telemetry-target-binding.sql` | Không sửa nội dung các migration cũ để né checksum |
| Directory thường trực | `/api/control/readyz` trả schema `0005-health-snapshot-guard.sql` | Chưa áp `0006` vào stack thường trực; có source không đồng nghĩa đã deploy |
| Control thường trực | Image `sha256:a65408e99b5cc9f012c582be7e0c46b211d089e605c44335e194e38dc73136e1`; 8091 ready 200 | Không gán kết quả M05 cho image cũ |
| Frontend thường trực | Image `sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b`; proxy 8082 ready 200 | Giao diện mới phải build/deploy riêng sau nghiệm thu |
| Signup | `ROOMQC_CONTROL_SIGNUP_ENABLED=false` trong container control | Giữ đóng ngoài sandbox trong các đợt code/local |
| Monitoring | Có source/config/exporter/worker test; chưa có monitoring/health worker thường trực của release mới | Không trình bày trạng thái mẫu như số đo VPS thật |
| Test gần nhất có artifact đầy đủ | 87/87, 0 fail/skip trong artifact M05, có PostgreSQL/exporter thật và process smoke | Lượt terminal M06 ghi riêng ở mục 18.3; không phải 87/70 case hoặc toàn bộ E2E |
| Backend nghiệp vụ | Project `ehjtoajnlnuvuiwkpmbp` đang phục vụ local | Không dùng làm nơi thử migration, fault, demo signup hoặc reset dữ liệu |
| Trang đang mở | `/settings/audit-log` thuộc khách sạn | Hai màn quản trị nền tảng nằm ở `/super-admin`, không ghép tài nguyên VPS vào nhật ký khách sạn |

Trước mỗi lệnh ghi phải nhận diện đúng repository, Compose project, cluster,
environment và ownership manifest. Thiếu một mục thì dừng lệnh ghi đó; tiếp tục
công việc đọc/thiết kế độc lập. Các sandbox browser cũ có thể dùng fixture trong
backend nghiệp vụ; phải đọc target guard, không tái sử dụng chỉ dựa vào tên script.

### 18.2. Các đợt bàn giao tiếp theo và trách nhiệm

| Thứ tự | ID trong plan | Sản phẩm bàn giao để review | Điều kiện bắt đầu | Người chịu trách nhiệm |
|---|---|---|---|---|
| 1 | T01, T08/M06 | Full backend sandbox + manifest tin cậy + adapter đủ năm dịch vụ | Baseline/ownership, release và probe contract đã chốt | Kỹ sư backend; người review quyền dữ liệu |
| 2 | T05/T06, M05/M10 | Pipeline metrics → probes → snapshot → admission, chạy thật qua restart/fault | Đợt 1 và source M05 | Kỹ sư backend/vận hành |
| 3 | T07, M07/M08 | Alert bền vững, ack có audit, notification outbox tới sink local | Snapshot/policy/reason codes ổn định | Kỹ sư backend |
| 4 | T03/T04/T08/T09/T10 | Auth/revoke thật, validation đầy đủ, reservation/gate và budget | Full sandbox/probes; authority fixture thật | Kỹ sư backend; review quyền và race |
| 5 | T11/T12/T13 | Khách đăng ký và tiếp tục được, worker tự đối soát, chống abuse local | Gate/reservation và receipt đã đạt | Kỹ sư backend + frontend |
| 6 | T14–T17 | Hạ tầng/Đăng ký mới, command dialog, tìm lỗi và xử lý qua UI | API/authority/schema DTO ổn định | Kỹ sư frontend; người thử thao tác |
| 7 | T18–T20, M09 | Bộ cài Linux, offsite/restore, alert ngoài máy, runbook | Code local đạt; đầu vào external của mục 22 | Vận hành; người kiểm chứng restore độc lập |
| 8 | T21–T24 | A/B thật, browser E2E, tải, release/cutover/rollback | Hai backend + staging release xác định | Kỹ sư kiểm thử/vận hành |
| 9 | T25 | Pilot 1 nội bộ → 5–10 khách, quan sát ít nhất 7 ngày | Gate P được duyệt trên bằng chứng | RoomQC duyệt; operator trực và người hỗ trợ |

Các vai trò có thể do cùng kỹ sư thực hiện ở local. Trước staging phải có tên
người duyệt release; trước pilot có tên operator/người thay ca. Review restore
và thử usability cần người khác làm theo tài liệu. Bảng này không tự phân agent,
tạo worktree hoặc cấp quyền deploy.

Đợt 1–2 là đường phụ thuộc chính cần khép trước khi nối signup. Trong thời gian
đó có thể chuẩn bị UI skeleton, inventory VPS và runbook; không dùng mock UI để
tuyên bố API/E2E hoàn tất. Ước lượng 21–33 ngày công ở mục 3 là dự toán lịch sử:
chốt lại phần còn lại sau đợt 1–2, dựa trên chi phí full stack và lỗi thực tế;
không suy ra ngày hoàn thành từ số test hoặc số nhánh. Ít nhất 7 ngày pilot và
thời gian chờ nhà cung cấp vẫn tính riêng.

### 18.3. Cập nhật chuẩn bị M06 và điều kiện bắt đầu kế tiếp

Ngày 19/10, sau commit tài liệu `6b91fd6`, integration có các file bản nháp
chưa commit: `release-manifest.mjs`, hai file test tương ứng, migration
`20261019114214_control_cluster_release_manifest.sql` và runner
`scripts/test-control-backend-sandbox.mjs`. Tên migration đã sinh qua CLI.
Đây là công việc đang dở trong integration, chưa đồng bộ mã sang checkout chính
hoặc đưa vào image thường trực.

| Việc đã thử | Kết quả thực tế | Cách tính khi nhận việc |
|---|---|---|
| Manifest/role/fingerprint trên PostgreSQL + PostgREST fixture | Có positive/negative và schema-drift tests; terminal full control ghi 92/92, 0 fail/skip | Chưa có log toàn lượt đóng gói thành artifact; chưa phải full app role audit, năm probes hoặc acceptance release |
| Dựng backend rỗng từ bộ self-host chính thức | Upstream `self-hosted/v0.8.3`, commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`; runner đặt mạng internal, không publish port | Tag/commit upstream chưa thay bộ khóa image digest và release artifact của RoomQC |
| Lượt sandbox `roomqc-probe-251c7aae4879` | Dừng ở phase `start`, `applied=0`; cleanup báo 9 Docker objects, state `cleaned=true`; kiểm tra theo project label không còn container/network/volume | Chưa chứng minh cài mới hoặc toàn bộ migration chain; chưa xác định nguyên nhân khởi động từ log riêng |
| Nối runtime | Gateway vẫn dùng validation cũ; health entrypoint chưa cấu hình đủ probe | T08/M06 vẫn `in_progress_unverified`; không đổi thành `local_verified` |

**Lượt triển khai đầu tiên sau plan này:**

1. Nhận diện năm file bản nháp và ownership state; đọc chẩn đoán riêng của lượt
   khởi động lỗi, ghi nguyên nhân đã xác nhận. Không mặc định lỗi nằm ở migration:
   lượt đó chưa chạy SQL ứng dụng. Không dump env/rendered Compose/secret vào báo cáo.
2. Khép runner full backend: preflight tài nguyên, pull/build images, start core,
   SQL replay đầy đủ, chuẩn bị Functions/canaries, verify rồi cleanup. Mỗi phase có
   deadline riêng và trạng thái phục hồi; lỗi ở đâu ghi rõ ở đó.
3. Giữ self-host Compose sandbox không publish port; chạy kiểm tra từ container
   probe cùng mạng được sở hữu. Không chuyển sang CLI dev rồi chấp nhận bind
   `0.0.0.0` để đi qua lỗi sandbox.
4. Khóa digest các image đã kiểm; runner replay SQL không thay bằng chứng đường
   migration production. Lỗi lịch sử khi cài mới phải có bước sửa/upgrade rõ,
   không bỏ qua file, đổi checksum migration đã áp hoặc đánh dấu cài mới thành công.
5. Chỉ tạo expected schema hash từ fresh build tin cậy đã đạt; rà quyền role probe
   trên toàn bộ app, chuẩn bị dependencies Functions không cần Internet lúc chạy.
6. Nối năm probe và validation chống race; sau đó mới thực hiện pipeline/drill
   mục 19.5. Lưu log đầy đủ, artifact và cập nhật tracker khi có bằng chứng mới.

**Điều kiện ra khỏi lượt này:** full backend cài được, manifest/grants đúng,
năm probe có positive/negative control và cleanup đúng phạm vi. Nếu mới đạt một
phần thì bàn giao phần đó với trạng thái thực; không mở gate signup.

## 19. Phiếu triển khai gần nhất — M06/T08 và khép giám sát

### 19.1. T08-a — khóa release, sandbox và hợp đồng probe

**Sửa/đọc:** `cluster.mjs`, `safe-http.mjs`, `registry.mjs`, `health-config.mjs`,
`health-runtime.mjs`; `deploy/monitoring/`; ADR hiện có. File dự kiến:
`scripts/test-control-backend-sandbox.mjs`, probe adapter và bộ test tương ứng.

1. Đọc docs/changelog hiện hành rồi khóa một bộ image/config tương thích. Lưu
   version và digest Auth, REST, DB, Storage, Realtime, Functions, gateway. Không
   ghép image mới nhất riêng lẻ; không coi image cache là release đã kiểm chứng.
2. Sandbox dùng official self-host Compose pinned, project mới, working directory
   tuyệt đối, config/migrations/volume riêng, mạng internal và không publish port;
   probe container trong cùng mạng. Guard từ chối project nghiệp vụ, đường dẫn bên
   ngoài run root, volume đã tồn tại không có ownership hoặc cleanup manifest
   không khớp. CLI chỉ dùng đúng tác vụ đã khám phá `--help`/version, ví dụ sinh
   migration; không chạy `supabase start` ở root nghiệp vụ hoặc lấy dev CLI làm
   bộ cài production.
3. Khởi tạo từ migrations/release artifact tin cậy, dữ liệu tổng hợp và inbox thử;
   không dump tài khoản/email/password của khách sang fixture. Khi cần hai backend,
   A/B phải có key/DB/volume riêng; thiếu RAM thì kiểm tra tuần tự hoặc staging,
   không thay bằng hai URL cùng database.
4. Ghi probe spec cho từng dịch vụ: public/internal origin, protocol, quyền,
   resource ID tổng hợp, expected payload/hash, deadline, cleanup, log allowlist.
   Mọi URL/credential ref từ inventory server; browser không chọn target.
5. Khóa schema result dự kiến: `service`, `status`, `checkedAt`, `durationMs`,
   `reasonCode`, `clusterId`, `releaseId`, `targetFingerprint`. Status tối thiểu
   phân biệt ok/unconfigured/unreachable/denied/invalid_response/timeout. Đây là
   DTO dự kiến phải review OpenAPI trước viết UI, không phải API đang có.
6. Boolean cho evaluator chỉ được derive từ kết quả hợp lệ đúng identity và
   thời hạn; thiếu bất kỳ service nào không đủ điều kiện healthy/nhận mới.

**Nghiệm thu:** prepare/verify/cleanup có target guard; chạy lại không ghi đè sandbox
khác; lỗi/Ctrl+C vẫn có manifest để dọn chính xác. Log chỉ ID/hash/status; không
in `supabase status` chứa key hoặc toàn bộ container env. Liên quan A01/A02, B02,
C01/C04 và fixture P0-03, chưa đóng toàn bộ các case này.

### 19.2. T08-b — manifest server-only và kiểm chứng schema thực

**Đầu ra:** migration Supabase do CLI sinh tên; định nghĩa RPC
`control_cluster_manifest`; công cụ tạo release artifact; tests grants/drift.

1. Tạo migration qua `supabase migration new` sau kiểm tra help, không tự đặt
   timestamp. Chỉ thử SQL trên database sandbox được nhận diện, không áp lên
   backend nghiệp vụ. Directory migrations và Supabase migrations là hai hệ riêng.
2. Deployment metadata trong schema private: cluster ID, release ID, contract
   version, migration set hash, frontend compatibility và artifact digest.
   Chỉ migrator/operator pipeline được ghi. Runtime/browser không được tự khai
   một hash rồi đánh dấu valid.
3. RPC trả thêm challenge/nonce từ request để đối chiếu phản hồi; xác nhận chính
   xác cluster/release/contract/schema, không chỉ so một chuỗi hash. Cấm response
   bị cache dùng lại; lưu expected/observed đã lọc để giải thích lỗi.
4. Phải kiểm tra schema thực với artifact build tin cậy. Định nghĩa fingerprint
   canonical có version: tên/type/nullable/default cột, constraint/index, function
   definition, RLS/policies, trigger và quyền app liên quan; thứ tự ổn định, không
   phụ thuộc OID, dữ liệu hoặc extension nội bộ. Bao gồm tập migration ứng dụng.
   Schema fingerprint hiện tại không được tự trở thành expected artifact của cụm.
5. Tạo expected fingerprint từ fresh build bằng đúng migrations; chứng minh fresh
   build lặp lại cho cùng hash. Thay cột/function/policy/ACL có chủ đích phải bị
   phát hiện. Khôi phục schema rồi hash trở về; không cần sửa bảng manifest để pass.
6. Ưu tiên RPC `SECURITY INVOKER`, role NOLOGIN chuyên probe có quyền đúng phần
   metadata/canary, không đọc business tables hoặc DDL. Revoke EXECUTE mặc định
   từ PUBLIC/anon/authenticated; RLS cho bảng exposed và defense-in-depth private.
   Không thêm SECURITY DEFINER chỉ để chữa lỗi quyền. Nếu có nhu cầu khác, phải
   ghi ADR riêng và review grants/search_path trước triển khai.
7. Worker giám sát không nhận business `service_role`, API migrator DSN, SMTP key
   hoặc quyền root. Probe credential là secret ref riêng; token có scope, expiry
   và rotation được test. API validation cũng dùng quyền cần thiết, không mở rộng
   quyền cho browser để gọi manifest.
8. Đo thời gian/lock/chi phí fingerprint trên schema đầy đủ. Giữ trong deadline
   validation; nếu cần cache/background verification phải có version và TTL rõ,
   drift/stale phải chặn. Không dùng cache hash vô hạn để bỏ qua drift.

**Rà quyền trên full app trước khi nối worker:** liệt kê toàn bộ effective grants
của role probe, gồm quyền kế thừa từ PUBLIC, role membership và EXECUTE của mọi
function trong schema exposed. Đặc biệt kiểm tra các SECURITY DEFINER có sẵn:
role không được đọc/ghi nghiệp vụ gián tiếp qua RPC dù bảng đã bị revoke.
Test quyền trên fixture nhỏ chỉ là điều kiện đầu; chưa thay audit full schema.
Các quyền PUBLIC quá rộng cần migration mới có test hồi quy cho owner/staff,
không sửa migration lịch sử hoặc thu hồi đại trà làm hỏng nghiệp vụ.

**Test bắt buộc:** dedicated role thành công; anon/owner/staff bị từ chối; dedicated
role không SELECT/DML/DDL business; sai cluster/release/nonce/hash/migration/ACL
bị reject; DB down không trả manifest valid. Run advisors và kiểm tra quyền SQL
trên sandbox trước đóng ticket. Chạy positive control ở đúng role cùng lượt với
negative control, tránh test pass vì cả database đều hỏng. Liên quan A06/C01/C04.

### 19.3. M06-a — đủ năm probe, có positive/negative control

Endpoint chi tiết phải khớp version đã pin ở T08-a. Ma trận sau là hành vi cần
đạt; không giả định mọi release có cùng health endpoint hoặc JSON shape.

| Dịch vụ | Bằng chứng khỏe phải lấy | Resource/quyền | Negative control |
|---|---|---|---|
| Auth | Health đúng version và kiểm tra có chạm Auth DB/session thật | Endpoint được xác minh từ source/docs; nếu health chỉ chứng minh process thì dùng canary identity riêng không có hotel/role nghiệp vụ | DB/Auth dừng, session bị revoke/hết hạn, sai key; HTTP 200 process đơn thuần không đủ |
| REST | RPC manifest/canary đọc DB trả nonce + đúng cluster/release/hash | Role probe chỉ đọc metadata/canary, không business | Schema drift, sai role/key, REST/DB down, nonce cũ |
| Storage | Đọc object canary private có bytes/hash đã biết qua Storage API | Object tổng hợp tạo khi deploy; quyền chỉ bucket/path canary, không public business bucket | Storage down, backend object mất, bytes sai, key hết quyền; status process không thay file read |
| Realtime | WebSocket join ứng dụng thành công và round-trip nonce giữa client canary gửi/nhận trên topic riêng | Kênh private/policy canary; hai kết nối ngắn có bound; không join channel khách | Sai token/topic quyền, join error, DB/Realtime down, nonce không khớp, handshake chỉ 101 |
| Functions | Invoke function canary trả challenge + cluster/release đúng | Function riêng, chỉ probe credential; không mail/payment/nghiệp vụ | Runtime/function mất, sai key/release, response cache/nonce cũ |

Đối với Auth, ticket phải chốt một trong hai cách dựa trên source của image:
endpoint có kiểm tra DB thật, hoặc canary session. Nếu cần session, quy định rõ
ai tạo/refresh, chỗ giữ refresh token, khóa chống hai worker rotate cùng lúc,
hạn chế quyền và xử lý hết hạn/revoke. Chưa chứng minh nhánh nào thì Auth probe
là unconfigured, không lấy `/health.version` thay kiểm tra database.

Canary được tạo ở lúc deploy/migration hoặc fixture setup, không tạo owner/hotel
mới mỗi 30 giây. Object không có PII; topic chỉ run ID/nonce; function không có
side effect. Không có cleanup nào được xóa bucket/user/object ngoài manifest sở hữu.

**Chuẩn bị Functions khi runtime không có Internet:** inventory tất cả import
remote/JSR/npm của main handler và canary, khóa version/lockfile và chuẩn bị
dependency cache hoặc bundle trong build phase được kiểm soát. Runtime chỉ dùng
artifact đã chuẩn bị; chứng minh cold start và invoke khi egress bị chặn.
Không mở Internet thường trực, bỏ signature/auth hoặc trả kết quả giả để né
dependency chưa có. Image/cache/bundle hashes phải nằm trong release manifest.

**Thực hiện transport:**

1. Mở rộng HTTP bounded transport khi cần đọc binary/headers; giữ DNS/IP pinning,
   TLS hostname/SNI, cấm redirect và body limit. Header/token chỉ gửi đúng origin.
2. WebSocket dùng cùng destination policy và IP đã duyệt trong kết nối thực tế.
   Không validate HTTP rồi để WebSocket tự resolve DNS khác. Test rebinding,
   mixed A/AAAA, IPv4-mapped IPv6, TLS sai và redirect upgrade.
3. Mỗi probe có deadline riêng dự kiến tối đa 5s; cả remote validation tối đa
   20s, target health không vượt 25s hiện có. Thiết kế fanout/metrics/persist để
   tuân deadline tổng; không cộng tuần tự năm timeout 20s. Request abort phải
   đóng socket/timer/listener, không có callback ghi kết quả muộn.
4. Body object canary nhỏ, text/JSON có max bytes; không ghi raw WS frames/token
   hoặc signed URL vào log. Result trả reason code ổn định; lỗi không thành true.
5. Unit/protocol test hỗ trợ phân nhánh; bằng chứng đóng M06 phải có full backend
   thật, từng service được tắt/làm sai độc lập và được khôi phục sau test.

**Nghiệm thu:** năm service tốt cùng lúc ở đúng backend; từng negative bị phát hiện;
quyền tối thiểu; deadline thật; không file descriptor/connection leak qua nhiều
vòng. B02/C01/C04 tương ứng, chưa chứng minh Linux capacity hay Internet TLS.

### 19.4. T08-c — validation không dùng kết quả của cấu hình đã đổi

**Sửa:** `ClusterGateway.validateCluster`, nhánh validate trong `app.mjs`,
`AdminDirectory.execute`, registry DTO và contract tests.

1. Trước probe chụp cluster row version, inventory fingerprint, endpoint, release,
   credential version và expected probe identity. Không giữ DB transaction lúc HTTP.
2. Sau probe mở transaction ngắn, kiểm tra lại đủ identity/version với inventory
   hiện hành và command expectedVersion; thay đổi ở giữa trả 409, không lưu valid.
3. Chỉ persist manifest/validation khi đủ năm probe + schema + frontend/CSP/public
   key đúng; lưu checkedAt/identity để chỉ ra release nào đã được xác minh.
4. Đổi target/credential/release phải vô hiệu bằng chứng cũ theo contract được
   review; gate vẫn đóng tới khi có validation/snapshot mới. Không làm mất mapping
   workspace active hoặc tự chuyển backend khi validation thất bại.
5. Lệnh validate vẫn command/version/receipt/audit nguyên tử; cùng key trả receipt
   cũ, không chạy probe/mutation lần hai vô hạn. Audit insert lỗi rollback kết quả.

**Test:** thay inventory/credential khi probe đang chờ; hai admin cùng version;
remote thành công nhưng local audit lỗi; response mất sau commit; replay cùng key;
ref mất/TLS lỗi/frontend cũ. C01–C04, A10/A11 theo phạm vi validation.

### 19.5. M05/M10 — nối pipeline và drill đủ thời gian thật

1. Nối adapter M06 qua config secret riêng vào `health-runtime.mjs`, bỏ trạng thái
   unconfigured chỉ khi cấu hình đủ. Thiếu một ref vẫn live nhưng không ready/healthy.
   Cập nhật help/compose/runbook; không gắn `true` mặc định trong entrypoint.
2. Dựng directory + monitoring + full backend sandbox riêng; approve telemetry
   target qua command có audit. Chứng minh source mount/DB budget/cluster đúng.
3. Thu thập liên tục ít nhất 10 phút bằng nhịp thật; đủ warmup 5 phút, ghi generation,
   freshness, probes và chi phí worker. Nếu test accelerated clock thì ghi riêng,
   không lấy thay bằng chứng thời gian thật này.
4. Stop nguồn metric >120s; source hang không ngăn stale sweep. Admission đóng
   dù worker đang dừng; workspace active vẫn giữ mapping và đọc nghiệp vụ được
   nếu data backend còn hoạt động.
5. Dừng/khởi động DB directory của sandbox; hard kill worker rồi restart; hai worker
   tranh nhau, một mẫu cũ về muộn. Kiểm tra state/window/generation và role boundary.
6. Tắt từng backend service, đổi target khi collect, key hết quyền và DB lock thật;
   socket bị abort không được commit sample muộn. Ghi fault start/end và reason.
7. Khôi phục nguồn, quan sát đủ recovery 10 phút; operator latch vẫn đóng tới khi
   admin duyệt. Không tự mở nhận vì một sample khỏe hoặc process vừa restart.
8. Build image mới từ source đã review; so hash file trong image, runtime schema,
   không nhầm image offline M05 với image pipeline mới. Dọn fixture theo ownership.

**Đóng phần local của M05/M06/M10:** có log toàn lượt, dữ liệu raw đã lọc, source/
image/config/schema và bảng B02/B04–B07 expected/actual. M10 tổng thể vẫn cần
M07/M08; B01 Linux và B09 external chưa chạy giữ not_run/deferred_external.

### 19.6. M07/M08 — cảnh báo và giao thông báo local

1. Rà bảng `alerts` đã có, chỉ thêm migration directory kế tiếp khi thật sự thiếu
   reason/audit/version/outbox. Không reset bảng hoặc đổi checksum migration cũ.
2. Với mỗi environment/resource/type/mount có tối đa một alert mở. Ghi lifecycle
   open → lastSeen → acknowledge tùy chọn → resolved; recurrence sau resolve tạo
   lần mới liên kết được. Unknown/stale không được dùng để resolve lỗi cũ.
3. Lifecycle + event + notification outbox trong transaction; unique delivery key
   theo alert/lifecycle/route. Dự kiến dispatcher riêng dùng lease/fencing và trần
   retry; schema/grants review trước code. Không cấp email key cho metrics worker.
4. Bổ sung `GET /admin/alerts`, `POST /admin/alerts/{id}/acknowledge` theo OpenAPI.
   Ack cần command/version/reason, actor live; ack không resolve hoặc mở admission.
5. Severity tới destination ref đã duyệt; local sink chỉ thu payload tổng hợp. Có
   open message, nhắc theo cooldown có trần, resolution một lần. Retry có backoff;
   khi provider không hỗ trợ idempotency phải ghi nhận cửa sổ có thể gửi trùng.
6. Test hai worker cùng mở/resolve, ack stale, mất response khi sink đã nhận, process
   restart, provider timeout/rate-limit và retry budget hết. Dead-letter có API/UI
   hiển thị, không bị mất vì app đã toast thành công.

**Đạt local:** B08 và API/auth/pagination tương ứng. Không gửi email thật ở bước này.
M09/B09 chỉ đóng sau heartbeat bên ngoài host ở mục 22, không từ sink local.

## 20. Phiếu nối đăng ký và giao diện — T03/T09–T17

### 20.1. Quyền quản trị và ngân sách trước khi mở flow

1. Khép T03 trên Auth thật: platform admin/owner/staff/anon, session revoke/role
   removed/account locked và authority down. Chốt chính sách MFA cho lệnh nhạy cảm
   trong ADR, kiểm chứng AAL/phiên hiện hành; không tin user_metadata hoặc chỉ route guard.
2. `requireCapability` v1 hiện cho super-admin sau RPC live; không quảng bá như đã
   có bộ vai trò hạ tầng/support độc lập. Nếu tách vai trò trong release này, map
   capability server phải có contract và negative test cho từng operation.
3. Support recheck/reconcile phải đi cùng command/version/receipt/audit; loại đường
   mutation cũ không có cùng boundary, giữ tương thích bằng contract/test rõ ràng.
4. T09 kiểm tra lại gate với backend thật: release/credential/frontend, health đúng
   target/fresh/warmup, backup proof, serving, quota và operator latch. Một điều
   kiện thiếu là blocked với reason; không có nút UI bỏ qua.
5. Chạy lại race 20 khách/1 suất, retry, close/limit, expiry và affinity. Mẫu khỏe
   hết hạn sau reserve phải được recheck trước first provision; RPC đã chạy thì
   tiếp tục reconcile, không reassign hoặc tự xóa danh tính.
6. T10 lập hai bảng budget riêng directory và data DB: service/replica/pool max/
   queue timeout/statement timeout/kết nối nền và dự phòng operator. Cộng đủ Auth,
   REST, Realtime, Functions, exporter, backup/migrator, control/worker. Budget
   arithmetic M05 chưa thay load test hoặc số kết nối thực tế.

**Đầu ra:** bảng quyền operation, policy backup/validation, gate reason DTO, budget
được kiểm chứng và bảng A08–A11/C05–C10. Không tự mở public signup từ bước này.

### 20.2. T11-a — chuẩn hóa luồng khách và trạng thái riêng tư

| Bước khách nhìn thấy | Điều kiện và nguồn chuẩn | Hành động UI | Khi có lỗi |
|---|---|---|---|
| Đăng ký doanh nghiệp | Intent đã giữ suất/affinity tại control | Nhập email/slug/thông tin tối thiểu, gửi một request có identity ổn định | Giữ form; lỗi có request ID; không tự chọn cụm |
| Xác thực email | Auth tại cụm được gán; chưa có phiên xác minh thì không mở dữ liệu riêng | Hướng dẫn mở email, gửi lại theo cooldown, sửa thao tác qua flow được phép | Thông báo chung, không public lookup tiến độ theo email |
| Khai báo khách sạn | Owner/session/email binding đúng backend; chưa có receipt hoàn tất | Submit field allowlist đã validate | 401/403 hướng đăng nhập/xác minh; không gửi lại tự động khi outcome chưa rõ |
| Đang thiết lập | Directory provisioning + receipt job | Poll setup-status có backoff, hiện mã hỗ trợ | Mất mạng giữ ngữ cảnh; reload lấy lại từ server |
| Chủ cần tiếp tục | Receipt missing và backend trả lời được | Mở lại form đúng workspace, giữ giá trị hợp lệ | Không thông báo đã tạo thành công hoặc tạo intent mới |
| Cần hỗ trợ | Receipt conflict/routing version lệch | Hiện mã hỗ trợ, đường liên hệ được cấu hình | Không sửa mapping hoặc chọn cluster khác trên browser |
| Sẵn sàng | Directory active khớp receipt owner/tenant/hotel/version | Đi đúng workspace/hotel → thêm phòng → mời nhân viên | Không thêm trial/tenant lần nữa khi reload |

**Các bước code cụ thể:**

1. Thêm setup-status vào router, store/gateway và typed client theo OpenAPI; mọi
   private read kiểm tra phiên đúng cụm và owner binding. UUID/slug không là quyền.
2. Chốt xử lý `waiting_email`: với cấu hình mặc định chưa có session sau signUp,
   UI hiển thị hướng dẫn từ thao tác vừa gửi, không gọi anonymous private status.
   Setup-status/provision chỉ mở cho phiên owner đã xác minh. Không nới quyền GET
   để tiện vẽ bước chờ email; đồng bộ mô tả/enum contract trước code.
3. Public bootstrap chỉ metadata định tuyến, không job/owner/email. Chuyển side
   effect activate/reconcile trong GET hiện tại sang worker/luồng được định quyền;
   rollout có test tương thích, không cắt cơ chế recover trước khi worker sẵn sàng.
4. Khi phiên hợp lệ, refresh/hai tab/new device lấy nguồn server. Query key có
   workspace/cluster/identity scope; logout/hủy component abort request và polling.
5. Poll đề xuất 2s → 5s → 10s → tối đa 30s, jitter và Retry-After; dừng khi active,
   logout, lỗi quyền hoặc needs_review. Không poll vĩnh viễn sau trang đã đóng.
6. Cập nhật `WorkspaceStart.tsx`, callback/onboarding/bootstrap; giữ đúng basename
   `/app/:slug`, allowlist origin/CSP và native `workspace-transport`. Android chỉ
   thêm endpoint/setup deep link cần thiết, không wildcard.
7. Với lỗi không xác định sau submit, hỏi server bằng status cùng đăng ký; không
   tự submit lại form, tăng trial hoặc khuyên tạo tài khoản khác.

**Đạt:** D01–D06/A03 và mobile/callback tương ứng trên API thật. Cùng một luồng
phải đối chiếu số owner/workspace/tenant/hotel/trial trước/sau, không chỉ route UI.

### 20.3. T12-a — enqueue, lease, fencing và kết quả job

**Sửa:** `store.mjs`, `app.mjs`, `support.mjs`; file dự kiến
`workers/provisioning-reconcile.mjs`, job store/config/runtime/tests và compose riêng.

1. Trong transaction beginProvision: kiểm tra owner/routing version/gate → chuyển
   provisioning → enqueue đúng một receipt_reconcile job → event → commit. HTTP
   tới backend nằm ngoài transaction; unique live job là hàng rào chống trùng.
2. Job giữ IDs/routing version, attempt/error/lease; không password/access token,
   thông tin payment hoặc form. Worker chỉ đọc receipt server-to-server tại đúng cụm.
3. Claim bằng `FOR UPDATE SKIP LOCKED`, update lease token mới, commit ngay. Lease
   90s, remote deadline 20s; concurrency/pool/queue có trần và shutdown ngừng claim.
4. Retry đề xuất 30s/2m/5m/15m/30m có jitter, tối đa 5 attempt tự động; định nghĩa
   attempt tại lúc thực sự bắt đầu gọi remote. Reclaim lease không tự reset budget.
   Không gọi HTTP trong DB transaction để giữ lease bằng lock dài.
5. Mọi ack/retry/activate kiểm tra lease token, job state và expected routing version.
   Đọc receipt verified phải đối chiếu workspace/cluster/owner/tenant/hotel/version;
   transaction local gồm activate + job success + event. Audit lỗi thì rollback.
6. Missing → waiting_owner; unavailable → retry; conflict → needs_review. Chốt
   attempt/error code và nextAction trước UI; không retry form thay khách.
7. Recheck admin trả 202/job/command ID; cùng idempotency key không enqueue thêm.
   Recheck active trả trạng thái đã hoàn tất hoặc conflict có hướng xử lý; không
   dùng công cụ support làm đường thay owner, gia hạn trial hay sửa billing.
8. Graceful shutdown có deadline; hard kill chỉ để lease hết và worker mới đối soát.
   Không dọn Auth/tenant dựa vào tuổi provisioning. Bổ sung readiness đúng schema/
   quyền và kiểm tra process không có DDL credentials.

**Fault matrix bắt buộc:** kill sau claim; trước remote; backend commit rồi mất
response; trước local ack; lease cũ về muộn sau worker mới; hai worker cùng job;
audit fail; already active; routing version đổi. Mỗi dòng ghi row counts/lease/
receipt trước-sau và expected outcome. D07–D11, A07 phần worker chỉ đóng bằng
process+database thật, không chỉ fake clock.

### 20.4. T13-a — chống lạm dụng và email có đường quay lại đúng

1. Định nghĩa topology proxy và `trustedProxies`; direct client không tự khai
   forwarded headers. Proxy ghi đè chain; test IPv4/IPv6/NAT/chain sai và request
   đi thẳng API. Không áp bucket IP socket của proxy cho toàn bộ khách.
2. Thay limiter `Map` process hiện có bằng state dùng chung bền vững có bound/
   TTL/index; tách intent/Auth/resend/reset/invite/status. Chốt threshold trong
   config và đo; response 429 có Retry-After, restart không xóa quota.
3. Anti-bot kiểm tra phía server trước reserve, ràng buộc action/origin/expiry và
   replay; local provider fixture. Thiếu production config giữ gate U đóng.
4. Kiểm thử gọi thẳng Auth/RPC không vượt quyền/quota tạo tenant. Tắt public signup
   vẫn cho khách cũ login/reset/invite; không dùng tắt Auth signup bừa để làm hỏng staff.
5. Xác thực/reset/invite dùng redirect allowlist + workspace binding. Link expired,
   replay, mở tab/thiết bị mới và Android phải về đúng cụm; không tin return URL
   browser tùy ý. Không log URL chứa token hoặc dùng analytics ghi callback token.
6. Local inbox kiểm soát để kiểm template/link/cooldown/duplicate. Resend/domain
   `roomqc.com` chỉ chuyển sang gửi thật khi đã verify DNS/provider và đích thử
   được chỉ định; trạng thái đã mở dashboard không chứng minh deliverability.
7. Webhook verify signature/raw body/time window/replay key; bounce/complaint đưa
   vào trạng thái quan sát được, retry có trần. Cấu hình email tập trung, không
   dùng email key trong frontend/control health worker.

**Đạt local:** D12–D14 và nhánh callback/template. D15 phải thử Gmail/Outlook ở
staging qua domain thật và kiểm bounce; không đánh dấu pass từ Mailpit/Inbucket.

### 20.5. T14–T17 — từng màn hình và hành động phải có chỗ truy cập

Giữ sidebar chính, chỉ thêm **Hạ tầng** và **Đăng ký mới**. Không tạo menu phụ
trùng, dashboard thứ ba hoặc nút shell/restart database cho người dùng ứng dụng.

| Màn/route dự kiến | Dữ liệu/API | Thao tác và điều kiện |
|---|---|---|
| `/super-admin/login` | Authority cố định, kiểm live role/session | Login/MFA; 401/403/503 rõ; owner không vào được |
| `/super-admin/infrastructure` | Cluster list/snapshot/admission từ control | Tìm/lọc, mở detail, thêm cụm từ inventory đã duyệt; count không lấy từ một page |
| `/super-admin/infrastructure/:id` | Cluster/detail/events, probe status, backup/release/policy | Validate, bind target được duyệt, đóng/mở nhận mới, draining/serving, sửa limit |
| Section cảnh báo trong detail | Alert list + ack endpoint | Ack có lý do/version; trạng thái lỗi còn thì banner vẫn còn; deep link truy cập trực tiếp |
| Section backup/release trong detail | Metadata backup/manifest đã lọc | Xem bằng chứng/thời điểm; không checkbox tự nhận backup pass hoặc nút restore production |
| `/super-admin/registrations` | Workspace list/filter/cursor/count | Tìm slug/request ID, lọc trạng thái/cụm, đi detail; URL giữ bộ lọc |
| `/super-admin/registrations/:id` | Workspace/detail/timeline/job + tenant-summary đúng cluster | Recheck có job status; mở cụm/khách tương ứng; không giả danh owner |
| Tenant console hiện có | Chỉ phần đã hỗ trợ đúng backend | Các thao tác billing không hỗ trợ đa cụm giữ disabled có giải thích; không fallback default DB |

**Thứ tự code và kiểm tra:**

1. Typed `control-client`/hooks dự kiến, schema/error parsing và query key có
   authority/user/cluster/workspace/filter/cursor; không token trong key/storage.
   Logout/revoke/đổi workspace xóa cache nhạy cảm và hủy response cũ.
2. Root admin router phải hoạt động khi directory bật/tắt; không được chèn workspace
   basename vào global admin. Menu không tạo đường tới trang chưa có API mà không
   báo trạng thái rõ; phần chưa deploy không quảng bá như chức năng đã sẵn sàng.
3. Màn danh sách trước, detail sau; mỗi view có loading/empty/unavailable/stale.
   Unknown là “Chưa có dữ liệu”, không 0% hoặc khỏe. Có timestamp/nguồn đo và lý do.
4. Mutation dialog có ảnh hưởng, trước/sau, expectedVersion, lý do và command ID.
   Chỉ lưu metadata pending cần thiết qua F5; không lưu token/PII. Khi mất response
   hỏi receipt cùng key; 409 tải lại và cho xem thay đổi, không tự đổi key retry lệnh.
5. Với 202 hiển thị “Đã nhận yêu cầu” và theo dõi job; chỉ báo hoàn tất khi server
   xác nhận. Nút disabled nói điều kiện thiếu, không để người dùng bấm rồi toast giả.
6. Màu thông dụng trên trắng/xám, chữ/icon cho trạng thái; WCAG AA; 390px, zoom 200%,
   keyboard/focus. Click menu dưới phải thấy đầu nội dung; Back giữ filter/trang/
   vị trí, direct link có fallback đúng danh sách.
7. Audit reachability: liệt kê mọi command/section API đã bàn giao → route → nút/
   menu → quyền → disabled reason → test. Không bỏ một chức năng khi gỡ menu phụ.
8. Người thử chưa biết fixture tìm một signup lỗi và hành động đúng trong 30s.
   Test trên browser nối API thật gồm F5/mất response/hai admin/revoke/503/query
   trả muộn; component test không thay E01–E08.

**Đầu ra:** bản build, ảnh desktop/mobile, log thao tác, bảng API↔nút, các lỗi và
test liên quan. UI chỉ được coi bàn giao khi thao tác thật cập nhật đúng directory/
cluster và audit, không chỉ có trang đẹp hoặc mock data.

## 21. Phiếu lên VPS, nghiệm thu và mở khách thật — T18–T25

### 21.1. T18 — bundle và đường triển khai xác định

1. Tạo `deploy/vps/` dự kiến gồm compose pinned, env/secret-ref examples, release
   manifest, preflight/prepare/migrate/deploy/verify và rollback instructions.
   Script mới có --help không side effect và target guard; chưa công bố lệnh
   như đã chạy được trước khi implementation/test hoàn tất.
2. Inventory Linux ghi provider/region/OS/architecture/vCPU/RAM/disk/IOPS/mount,
   host ID/cluster ID, IP/origin, firewall, data volumes, budget và người phụ trách.
   Cấu hình VPS chỉ chọn làm profile thử; không cam kết sức chứa từ RAM/vCPU.
3. Pin full Supabase self-host release, không dùng CLI dev làm production installer.
   Kiểm gateway Kong/Envoy và `API_EXTERNAL_URL` theo đúng bundle; local CLI hiện có
   không tự chứng minh cấu hình self-host. Không tự nâng PG major khi đóng gói.
4. Cổng public chỉ HTTP redirect/HTTPS theo topology; DB/control/exporter/Prometheus/
   Studio/admin interface riêng tư. SSH qua đường quản trị được duyệt. Verify từ
   phía ngoài host, không chỉ xem Compose không publish port.
5. Preflight read-only fail trước thay đổi khi sai host/volume/secret/DNS/port/clock/
   dung lượng. Prepare không format/xóa/init đè volume; migration credential chỉ
   job một lần; verify luôn kiểm image/schema/config/volume thực tế.
6. Chạy cài mới → redeploy no-op → reboot host → verify dữ liệu/callback/Realtime/
   upload/Functions. Chạy secret/TLS rotation và renewal, Android deep link/CSP.
7. Nâng cấp theo compatibility matrix; backup verified trước bước rủi ro. Rollback
   binary chỉ khi schema tương thích; nếu không forward-fix/restore có quy trình,
   không hạ schema bằng file cũ hoặc `down -v`.

**Đạt:** F01–F04 trên Linux staging với release manifest và log đầy đủ.

### 21.2. T19 — bộ backup thực sự khôi phục được

1. Inventory backup set: directory + cluster DB/Auth + queue/receipt + Storage
   metadata và object bytes + release/config + key cần giải mã/vận hành. Dùng
   backup tooling chuẩn đã pin; không tự viết thuật toán mã hóa.
2. Với pilot dùng cửa sổ maintenance quiesce đủ writers; xác nhận DB/app/jobs/
   Auth/Storage không ghi trong snapshot. Chốt time window và sequence; DB dump
   độc lập giữa lúc upload vẫn chạy không đủ nhất quán.
3. Manifest set ghi parts/checksum/object count/bytes/key version/UTC/schema/image/
   cluster/scope; upload offsite ở failure domain khác, verify đọc lại. “Uploaded”
   khác “verified”; không cho UI tự ghi verified/restore_test_at.
4. Backup dự kiến mỗi 12h để có dư địa RPO≤24h; retention/quota/chi phí phải được
   RoomQC duyệt trước cleanup. Key khôi phục tách nơi lưu ciphertext, có người
   giữ/break-glass; backup cùng VPS không tính offsite.
5. Restore vào host/volume sạch được gán ownership, từ chối nguồn/live target.
   Test từng lỗi thiếu part/checksum/key/version/object rồi bảo đảm không mở route.
6. Verify login owner/staff, đúng workspace/cụm, phòng/booking mẫu, receipt/trial,
   file bytes và pending jobs. Chặn tự replay payment/email tác vụ ngoài snapshot
   cho tới đối soát; ghi rõ cách xử lý queue khi phục hồi.
7. Drill mất host gốc chỉ từ offsite + secret store độc lập. Đo RPO/RTO thực với
   dataset ghi rõ; mục tiêu pilot ≤24h/≤4h chưa thành cam kết tới khi drill đạt.

**Đạt:** F05–F08. Bộ backup không verify hoặc restore proof quá hạn giữ gate nhận
mới đóng theo policy; không tự khóa khách đang active.

### 21.3. T20/M09 — cảnh báo ngoài máy và người trực

1. Cấu hình heartbeat/probe độc lập failure domain, không đặt watchdog duy nhất
   cùng host đang giám sát. Destination và người nhận được RoomQC chỉ định.
2. Ngưỡng ban đầu phát hiện ≤120s, thông báo ≤180s là mục tiêu đo; ghi thực tế
   khi cắt kết nối host staging. Phân biệt control down, backend down, exporter
   stale và provider cảnh báo down.
3. Runbook mỗi lỗi gồm dấu hiệu/ảnh hưởng/kiểm tra read-only/target/khôi phục/
   data verify/điều kiện mở lại/người trực. Thử do người khác làm theo, không dựa
   vào người viết code nhớ lệnh riêng.
4. Dọn dung lượng không được xóa dữ liệu/WAL/volume khách tùy ý. Credential mất
   phải rotate theo ref, không sửa mapping. Signup kẹt phải đọc receipt/job, không
   tạo lại tenant. Mất host dùng bộ restore đã thử.

**Đạt:** B09/F09 khi có thông báo thực ngoài host và log phục hồi; thiếu provider
giữ deferred_external, không cản code/local khác.

### 21.4. T21/T22 — E2E có định danh và fault kiểm soát

1. Hai backend A/B full service, Auth key/DB/object/network riêng. Fixture có
   platform admin, owner, staff đủ quyền, email chưa xác minh, revoked session,
   cụm closed/full/stale và các receipt missing/unavailable/conflict.
2. Journey thuận: start → Auth/email → onboarding → active → thêm phòng → invite
   staff → staff chỉ thao tác đúng quyền → logout/login/reset → admin tìm được
   workspace và đúng cluster. Đối chiếu DB rows/audit/receipt cùng lượt.
3. Token/data/object/channel A không dùng ở B; positive control ở đúng A/B phải
   vẫn chạy. Có thể dùng UUID tenant giống nhau ở fixture để bắt lỗi thiếu cluster
   scope. Admin tenant-summary không fallback backend mặc định.
4. Journey lỗi: refresh/hai tab/new device/timeout, mất response sau remote commit,
   kill worker, lease cũ, directory/source/backend down, stale dialog, revoke và
   thiếu CSP/callback. Fault chỉ nhắm tài nguyên sandbox/staging đã allowlist.
5. Cụm A draining/down: khách mới chưa affinity có thể sang B; khách active A giữ
   A, không lộ dữ liệu hoặc tạo lại khách ở B. Global signup closed không chặn
   login/reset/invite khách hiện hữu.
6. Browser desktop + Android theo release, viewport/mạng ghi rõ. Capture console/
   network có redaction; callback tokens không vào artifact. Test runner lỗi
   hạ tầng là fail/not_run có lý do, không skip để báo xanh.

**Đạt:** D/E và G01–G03/A03 liên quan bằng case thật, không chỉ unit test.

### 21.5. T23 — tìm sức chứa an toàn, không đoán 1.000 khách sạn

1. Profile ghi CPU/RAM/IOPS/mạng/digests, số workspace/hotel/room/bookings/objects,
   mix tác vụ và think time. Phân biệt tài khoản đã đăng ký, người online, người
   đang thao tác và request/s; không dùng một con số thay bốn nghĩa này.
2. Chạy mức 10→25→50→100 phiên có kịch bản; có đối chứng tenant nhẹ, report/upload
   nặng và signup đồng thời. Đo latency/error riêng mỗi nhóm, CPU/MemAvailable/IO/
   inode/connection/pool wait/queue lag và chi phí monitor/backup.
3. Soak ít nhất 60 phút tại mức đề nghị; dừng theo ngưỡng an toàn công bố trước
   khi chạy, giữ log cả mức không đạt. Kiểm leak/budget/lock và dữ liệu sau tải.
4. Đối chiếu mục tiêu p95 server: bootstrap/status ≤500ms, reserve ≤1s, provision
   ≤10s không tính chờ email, admin list 1.000 metadata ≤1s; 5xx ngoài fault <1%.
   Không gộp thời gian API với tải trang. Không đạt thì tối ưu/giảm limit rồi đo lại.
5. Capacity report ghi maximum tested và operating limit thấp hơn có headroom.
   Chốt tenant_limit/resource budget và runbook thêm cụm trước khi đầy; không lấy
   1.000 khách sạn × 50 nhân sự làm số người dùng đồng thời đã kiểm chứng.
6. Thêm cụm đã chuẩn bị cho khách mới ở v1; chưa tự migrate tenant cũ, autoscale
   hoặc cam kết 100.000 người đồng thời. Các mục đó cần thiết kế/nghiệm thu riêng.

**Đạt:** G04–G06. Phải có dataset/config/result để tái lập, kể cả khi operating
limit đo được thấp hơn mục tiêu kinh doanh.

### 21.6. T24/T25 — cutover, pilot và dừng mở rộng

1. Release candidate khóa commit/tree/image/schema/config; đối chiếu đủ 70 case
   theo môi trường. Không còn lỗi Critical/High về quyền, dữ liệu, cấp phát,
   isolation hoặc restore trước cổng tương ứng.
2. Cutover rehearsal giữ đường legacy: login/reset/invite/mobile/global admin và
   khách chưa mapping. Không bật flag rồi ép khách cũ tạo workspace. Frontend
   rollback phải tương thích schema và mapping mới đã được ghi.
3. Phiếu duyệt gate S/P ghi người duyệt, scope, limit, backup/restore/alert proof,
   operator, kill switch và rollback. Local pass không tự là authority deploy.
4. Pilot một khách nội bộ trước; chỉ tăng 5–10 khách được chọn khi luồng và hỗ trợ
   ổn định. Quan sát ít nhất 7 ngày, đo API quan trọng mục tiêu ≥99,5%, lỗi signup,
   email, worker, tài nguyên, backup, hỗ trợ và chi phí theo dataset thực.
5. Lỗi quyền/rò/mất dữ liệu/cấp phát trùng/restore không đạt: dừng mở rộng và đóng
   cấp phát mới theo runbook, bảo toàn bằng chứng; xử lý ảnh hưởng khách active
   riêng. Không rollback bằng xóa workspace/volume hoặc đổi khách sang DB khác.
6. Chỉ duyệt U khi anti-abuse/Auth/proxy/support/monitoring/backup đạt. Gate B thu
   phí là backlog riêng, không tự bật settlement/gia hạn gói sau khi signup xong.

**Bàn giao cuối:** release manifest, bảng 70 case, defects còn lại, capacity,
backup/restore/alert drill, runbook và báo cáo pilot; RoomQC quyết định mở rộng.

## 22. Đầu vào ngoài mã nguồn — gom theo cổng, không xin khóa trong chat

| Khi cần | Đầu vào cần chuẩn bị | Được tiếp tục khi chưa có | Cách cung cấp an toàn / bằng chứng |
|---|---|---|---|
| Trước T18 staging | VPS Linux riêng cho test, inventory cấu hình/IP/mount, đường deploy/SSH/CI và người có quyền | M06, alert local, signup/UI, bundle/preflight local | Secret file/store/CI secret; inventory không có password; xác nhận đúng host trước lệnh ghi |
| Trước TLS/callback thật | Quyền DNS `roomqc.com`, origin/subdomain staging/API đã chọn | Allowlist/redirect tests trên local | Thao tác DNS trong tài khoản được cấp; verify record/cert/renewal, không gửi DNS token qua chat |
| Trước D15 | Resend/provider account, domain sender verified, FROM/REPLY-TO, hai inbox thử kiểm soát | Template/inbox local/callback/cooldown/webhook adapter | API key trong secret store; SPF/DKIM/DMARC và message/bounce evidence; không mail khách thật |
| Trước gate U | Anti-bot production config và chính sách rate-limit/support | Fixture test và limiter bền vững | Secret server; test wrong/expired/replay và direct Auth |
| Trước T19/gate P | Kho offsite độc lập, quyền read/write tối thiểu, key recovery riêng, retention/ngân sách được duyệt | Backup/restore local trên target sạch | Upload/readback checksum và host-loss drill; key không nằm cùng backup duy nhất |
| Trước M09/gate P | Dịch vụ heartbeat/kênh cảnh báo ngoài host, người nhận/người trực | Outbox/sink local và runbook | Destination ref; thử gửi/cắt host có phạm vi được duyệt, lưu receipt/thời gian |
| Trước P/U | Admin/MFA, operator/người thay ca, khách pilot, thời gian hỗ trợ | Code/test và diễn tập tổng hợp | Danh sách vai trò/contact trong nơi nội bộ; không đưa mật khẩu/PII vào repo |

Những dòng này là dependency external, không phải kết luận đã thiếu quyền của
phiên hiện tại. Khi thực hiện phải kiểm tra khả năng truy cập hiện có trước;
chỉ yêu cầu đầu vào còn thiếu tại đúng cổng. Không bắt khách sạn đăng ký VPS,
cài Docker hoặc cung cấp key hạ tầng cho RoomQC để dùng sản phẩm.

## 23. Quy tắc đóng ticket và mẫu bàn giao có thể kiểm tra

### 23.1. Mỗi ticket phải đi qua cùng một chuỗi

1. **Ready:** ID P/T/M, acceptance liên quan, input/dependency, target ownership,
   contract và expected outcome đã chốt; không còn quyết định quyền dữ liệu mơ hồ.
2. **Implemented:** diff đúng phạm vi, migrations có nguồn/version và grants; không
   credential trong Git/bundle/log; script có help và guard trước mutation.
3. **Verified local:** test có positive/negative/fault cần thiết trên môi trường
   nhận diện; không skip bắt buộc; cleanup proof và dữ liệu cần bảo vệ được đối chiếu.
4. **Reviewable:** commit/tree hash, artifact/log, expected/actual, giới hạn và rollback
   đủ để người khác đọc; trạng thái OpenAPI khớp handler/runtime thực tế.
5. **Deployed/verified môi trường tiếp theo:** image/schema/config của môi trường
   đó được kiểm tra riêng. Chỉ cập nhật staging/pilot_verified bằng bằng chứng tại đó.

Một ticket local hoàn tất không đóng gói P tổng thể nếu còn Linux/provider/browser/
pilot acceptance. Không đổi `not_run` thành passed vì chưa gặp lỗi trên trình duyệt.
Không dùng phần trăm ước lượng để che việc chưa test backup/isolation/recovery.

### 23.2. Mẫu ghi nhận sau từng đợt

| Trường | Nội dung bắt buộc |
|---|---|
| Phạm vi | P/T/M IDs, file thay đổi, cái gì chưa triển khai |
| Nguồn và runtime | Source base/commit/tree; image digest; schema/config/inventory fingerprint |
| Môi trường | local/staging/pilot, host/project/cluster/run IDs, dataset và thời gian |
| Kiểm thử | Command thực đã chạy, exit code, pass/fail/skip; acceptance ID expected/actual |
| Bằng chứng | Log đầy đủ và checksum, manifest, ảnh/traces đã lọc; không token/DSN/PII |
| Rủi ro/lỗi | Severity, ảnh hưởng, owner, bước sửa hoặc external dependency; không trộn done/not-run |
| Bảo toàn | Fingerprint/index file ngoài phạm vi; ownership cleanup; không thay DB nghiệp vụ |
| Vận hành | Signup flag, worker/monitor có thực sự deploy không; rollback và lệnh verify |
| Bước kế tiếp | Ticket ready tiếp theo và gate nào vẫn đóng |

Những lệnh đã có (`npm run test:control:db`, các test control/source/worker) chạy
đúng runbook. Runner full backend, dispatcher, VPS deploy/restore mới phải được
viết/verify rồi mới thêm vào danh sách lệnh vận hành. Không chạy script tên “local”
hoặc “sandbox” trên backend nghiệp vụ nếu chưa kiểm tra guard/target.

### 23.3. Thứ tự bắt tay vào code sau kế hoạch này

1. T01/T08-a: nhận diện full sandbox, pin release và khóa probe/result contract.
2. T08-b: manifest/quyền/schema fingerprint, tests thật trên backend sở hữu.
3. M06-a/T08-c: năm probe/pinned transport và validation chống race cấu hình.
4. M05/M10: pipeline/thời gian thật/restart/kill/recovery, artifact mới.
5. M07/M08, rồi T03/T09/T10 và T11–T17 theo dependency ở mục 18.
6. T18–T25 khi đủ đầu vào external; gate S/P/U/B giữ độc lập như mục 15.

Đây là kế hoạch chuẩn bị triển khai. Lượt cập nhật này chỉ sửa tài liệu, đọc source/
artifact và kiểm tra runtime read-only; không áp migration, deploy worker, gửi email,
đổi DNS, chạy fault trên backend đang dùng hoặc mở signup.
