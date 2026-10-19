# RoomQC — kế hoạch thực thi chi tiết quản lý VPS và đăng ký tự động

Ngày cập nhật: 19/10/2026, Asia/Bangkok. Trạng thái: **chuẩn bị triển khai**.
Tài liệu này cụ thể hóa thứ tự thực hiện trên hiện trạng đã quan sát, không ghi nhận
các đầu việc dưới đây là đã hoàn thành. Mỗi mã T là bước con của 27 gói P0–P8,
không tạo thêm một roadmap độc lập hoặc thay đổi tổng 70 tình huống nghiệm thu.

- Phạm vi và kiến trúc: [kế hoạch tổng thể](roomqc-vps-signup-implementation-plan-2026-10-19.md).
- Phân công và phụ thuộc: [27 gói công việc](roomqc-vps-signup-work-packages-2026-10-19.md).
- Điều kiện đạt: [70 tình huống và các cổng phát hành](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
- Kết quả thực hiện: [tracker](roomqc-vps-signup-progress.md), không suy ra từ tài liệu thiết kế.

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
Commit nền gần nhất: `8d0628e`. Checkout chính là `room-weave-pro-main`, có nhiều
thay đổi từ trước; chỉ đồng bộ file đúng phạm vi sau kiểm tra, bảo toàn index và
các thay đổi nghiệp vụ khác.

| Phần | Bằng chứng hiện có | Cách tính trong kế hoạch này |
|---|---|---|
| Control API + directory riêng | Container healthy; GET `8091/api/control/livez` và `/readyz` trả 200; readyz ghi `0003-runtime-grants.sql` | Giữ nền, kiểm tra hồi quy khi đổi schema/runtime |
| Proxy frontend | GET `8082/api/control/healthz` trả 200 JSON `status=ok` | Chứng minh proxy local; chưa chứng minh luồng khách đăng ký |
| Migration, grants, restart | Artifact nền ghi 17/17 test đạt ở phiên bản trước | Bằng chứng lịch sử; không gán kết quả đó cho mã đang sửa |
| Admin command, registry, evaluator, admission | Có thay đổi chưa commit trong `server/control/` và migration `0004` | `in_progress_unverified`; phải có test trước đồng bộ/deploy |
| Kiểm tra release cụm | Gateway có gọi `control_cluster_manifest`; tìm trong source chưa có migration định nghĩa RPC này | Phải bổ sung và kiểm tra trong backend sandbox |
| Giám sát | Có evaluator thuần mới; chưa có bộ collector/exporter/alert runtime tương ứng | Chưa nghiệm thu P2 |
| Giao diện hạ tầng/đăng ký mới | Có super-admin và tenant console cũ | Tái sử dụng layout; bổ sung API/client/routes, không coi đã có console hạ tầng |
| VPS/TLS/email thật/offsite/pilot | Chưa có bằng chứng triển khai tương ứng trong đợt này | Giữ `not_run` ở môi trường thật; tiếp tục phần code/local độc lập |

Lượt lập plan này chỉ đọc mã nguồn, tài liệu và health; không chạy lại full test,
không áp `0004`, không bật signup, không restart hay thay đổi DB nghiệp vụ.

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

File dự kiến mới: `deploy/monitoring/compose.yml`, `prometheus.yml`, `rules/`,
`exporter-roles.sql`. Đường dẫn mới là thiết kế, chưa phải công cụ đã có.

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

Ưu tiên thực thi tiếp theo là **T01–T04**: khép thay đổi control đang dở và kiểm
chứng bản mới. Sau đó **T05–T10** làm cho quyết định nhận khách dựa trên tài nguyên
thật. Đây là nền bắt buộc trước khi mở luồng signup và console cho người dùng thực tế.
