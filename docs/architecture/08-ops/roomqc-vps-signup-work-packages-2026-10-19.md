# RoomQC — công việc triển khai VPS và đăng ký tự động

Ngày 19/10/2026. Đi cùng [kế hoạch chính](roomqc-vps-signup-implementation-plan-2026-10-19.md).
Mọi ticket dưới đây ở trạng thái **planned** khi lập tài liệu. Tên file mới là dự
kiến, không khẳng định đã tồn tại. Mỗi ticket đóng bằng artifact và bằng chứng
nghiệm thu, không đóng chỉ vì đã có code hoặc đã mock thành công.

Chi tiết thực hiện theo hiện trạng: [25 bước trong 8 đợt](roomqc-vps-signup-execution-plan-2026-10-19.md).
Trạng thái hiện tại lấy từ [tracker](roomqc-vps-signup-progress.md); các nhãn planned
khi lập gói không phủ nhận nền local đã có bằng chứng. Mã P0–P8 giữ nguyên.

## 1. Quy tắc thực hiện

- Source tích hợp hiện tại: worktree `roomqc-worktrees/integration`, baseline `b95fc86`.
  Checkout chính có nhiều thay đổi sẵn có; phải bảo toàn và chỉ đồng bộ file đúng phạm vi.
- P0 xác nhận integration/base trước khi tạo nhánh; không lấy main cũ làm nền mặc định.
- Một đầu mối sở hữu migration directory, hợp đồng API và thứ tự version; các nhánh
  khác đề xuất thay đổi qua contract trước khi merge, tránh cùng chỉnh schema.sql.
- Dùng sandbox có nhãn/tên sở hữu và allowlist fixture; không bật signup toàn hệ thống,
  chạy job toàn cụm hoặc reset database đang phục vụ để kiểm thử.
- File manifest kết quả chứa commit/image/schema, command, thời gian, pass/fail/not-run;
  bỏ credential và dữ liệu cá nhân. Script hỏng giữ trạng thái đủ để cleanup tiếp.
- Chỉ test lại phần thay đổi và các luồng liên quan; full suite/build ở cổng tích hợp.
- Việc cần quyền VPS/provider tách rõ; bản local vẫn phải cụ thể, kiểm thử được và sẵn
  sàng triển khai. Không đánh dấu external check là passed khi mới có test giả lập.

## 2. P0 — chốt thiết kế có thể triển khai (1–2 ngày công)

### P0-01 — lập baseline và sổ hiện trạng

**Đầu vào:** code control/signup, báo cáo 15–19/10, compose và runtime 8082.

**Thực hiện:**

1. Ghi commit, image, schema DB nghiệp vụ và directory nếu có; chỉ ghi tham chiếu,
   không xuất toàn bộ env. Liệt kê endpoint đang thực sự được proxy.
2. Kiểm tra control port, flag frontend/server/cluster, DB directory/volume và owner.
   Không bật flag để làm kiểm tra hiện trạng đạt.
3. Lập bảng luồng legacy, directory, callback, invitation, mobile, deep link admin;
   chỉ ra route nào chịu ảnh hưởng khi bật directory.
4. Tách nguồn trạng thái gói, cấp phát, cụm và sức khỏe; đóng dấu tài liệu cũ là lịch sử.

**Bàn giao:** `docs/architecture/08-ops/roomqc-vps-signup-baseline.md` và inventory
đã lọc bí mật. **Đạt khi:** người triển khai biết backend nào được ghi, DB nào chỉ đọc,
và rollback frontend không làm mất mapping. Kiểm tra A01–A03 trong ma trận nghiệm thu.

### P0-02 — ADR triển khai và hợp đồng

**Thực hiện:** chốt D01–D08; sơ đồ host/mạng; schema request/response; trạng thái/error
code; quyền từng operation; source-of-truth registry/secret; retention dữ liệu vận hành.
Với self-host, đọc changelog compose Supabase và chọn release/digest tương thích trước
khi cố định bộ cài. Xác định data mount và số đo đúng host/cluster.

**Bàn giao dự kiến:** `docs/architecture/adr/roomqc-control-v3.md`,
`server/control/contracts/` và OpenAPI. **Đạt khi:** hợp đồng mô tả null/stale/version,
idempotency, expiry/affinity, failure/retry; FE không phải tự đoán trạng thái backend.

### P0-03 — bàn giao fixture và quy trình phát triển

Mở rộng công cụ sandbox hiện có theo module, có hai cụm thực sự độc lập khi cần.
Không sửa script `test:control:local` để tùy tiện tác động DB chính: nó hiện có bước
đổi directory_required tạm thời nên cần chuyển acceptance mới sang môi trường riêng.
Tài khoản owner/staff/admin, email Mailpit, dữ liệu tổng hợp và cleanup có danh sách
ID xác định. Xác minh stale lock, interruption và credential cleanup.

**Bàn giao:** lệnh chuẩn bị/kiểm tra/dọn sandbox và runbook ngắn. **Đạt khi:** người
khác chạy lại được, không cần tự tìm/xóa container hoặc copy secret vào chat.

## 3. P1 — control thường trực, dữ liệu và quyền (3–4 ngày công)

### P1-01 — migration directory có history

**File hiện có:** `server/control/schema.sql`, `store.mjs`, `server.mjs`.
**File dự kiến:** `server/control/migrations/`, `migrate.mjs`, migration tests.

1. Baseline schema cũ; chạy trên DB trống và DB directory có dữ liệu.
2. Bảng history version/checksum; migration lock; mismatch checksum báo lỗi.
3. Thêm hosts/policy/health/admission/commands/jobs/affinity/events/alerts/backup metadata
   theo contract P0, bằng các migration nhỏ theo dependency.
4. Backfill cụm/limit giữ nguyên giá trị; nếu email có lịch sử khác cụm, lập conflict
   để đối soát, không chọn ngẫu nhiên một cụm làm affinity.
5. Tách registry import ban đầu khỏi migration mỗi lần; không ghi đè policy admin.
6. Tạo role migration, API runtime, worker, metrics reader với quyền vừa đủ; không
   PUBLIC access, DDL hoặc DELETE audit cho runtime.

**Đạt khi:** A04–A07; chạy lại không đổi dữ liệu, migration lỗi rollback rõ ràng,
DB đang dùng không bị reset; legacy record có đường nâng cấp hoặc báo conflict.

### P1-02 — dịch vụ local bền vững và health

**File:** `docker-compose.control.yml`, `server/control/server.mjs`, `app.mjs`,
`config.mjs`; thêm compose local override và script preflight.

1. DB directory volume riêng, secret sinh local qua công cụ, không hard-code production.
2. Control API/worker restart policy, healthcheck; DB ready trước API ready.
3. `/livez` chỉ process; `/readyz` kiểm tra DB/schema/config; `/healthz` giữ compatibility.
4. Graceful shutdown: ngừng nhận request/claim, chờ việc đang xử lý trong deadline,
   trả lease cho lần tiếp theo; process bị kill vẫn có job/receipt đối soát được.
5. Cấu hình pool tổng có budget; readiness không thực hiện migration hoặc gọi job business.
6. Proxy `/api/control` tới 8091; kiểm tra port trước start, log rotation, cấu hình no-store.

**Đạt khi:** restart container/máy giữ directory, health không báo ready khi schema
thiếu; 8082 và dịch vụ khác không trùng cổng; signup vẫn gated trong quá trình dựng.

### P1-03 — quyền admin và receipt lệnh

**File:** `cluster.mjs`, `support.mjs`, `app.mjs`; thêm command store/router tests.

1. Tái sử dụng `platform_support_actor` từ authority cố định; không cho client chọn
   cụm để tự chứng minh quyền. Chốt global admin login khi directory bật.
2. Permission map cho read/reconcile/infra-operate; v1 super-admin bao phủ nhưng mỗi
   endpoint vẫn kiểm tra operation phía server.
3. Command ID + payload hash + expected version + reason; audit và mutation cùng transaction.
4. Mất response sau commit trả lại kết quả cũ; khác payload hoặc stale version trả 409.
5. Giới hạn request body/fields; redaction log; session revoked/locked bị từ chối.

**Đạt khi:** A08–A11, lệnh thất bại không ghi success, request ID log không lộ token.

## 4. P2 — quan sát tài nguyên (3–4 ngày công)

### P2-01 — exporters và nguồn probe

**File mới dự kiến:** `deploy/monitoring/compose.yml`, `prometheus.yml`,
`rules/`, `exporter-roles.sql`, mẫu cấu hình TLS/tunnel.

1. node_exporter đọc metric host thật; postgres_exporter chỉ quyền cần thiết.
2. Mapping đúng host/cluster/environment; không chọn filesystem overlay/tmpfs làm disk DB.
3. Probe Auth/REST/Storage/Realtime/Functions bằng hợp đồng health được kiểm chứng.
4. Không public port exporter/Grafana hoặc mount Docker socket. Pin images/digests.
5. Đo overhead scraping và giới hạn series; không gắn tenant/user/email vào label.

**Đạt khi:** B01–B03; số đo đối chiếu được với OS/DB, endpoint nội bộ không mở Internet.

### P2-02 — snapshot và health evaluator

**File mới dự kiến:** `server/control/telemetry.mjs`, `health-policy.mjs`,
`workers/health-worker.mjs` và tests.

1. Chuẩn hóa units/finite values/time; thiếu dữ liệu khác 0; reject timestamp bất hợp lệ.
2. Query template Prometheus cố định với cluster ID registry, không nhận PromQL từ client.
3. Ghi generation/valid_until; process thứ hai không ghi đè bằng mẫu cũ.
4. Evaluate window/hysteresis; phân biệt unavailable và unknown; lưu lý do chuyển trạng thái.
5. Timeout Prometheus không treo API; dashboard đọc snapshot, không gọi exporter trên mỗi page load.

**Đạt khi:** B04–B07; tắt collector làm metric stale, không biến thành healthy và
không khóa nghiệp vụ khách đang active.

### P2-03 — cảnh báo vận hành

Deduplicate fingerprint, severity, opened/acknowledged/resolved, cooldown và liên kết
runbook. Luồng cảnh báo ngoài máy thử với đích do người dùng kiểm soát khi đã cấu hình;
local chỉ inbox thử. Cảnh báo trước hết cho stale metrics, disk/DB critical,
provisioning kẹt, backup trễ và control unavailable. Theo dõi chính worker giám sát
bằng heartbeat từ hệ thống độc lập, không chỉ dashboard của cùng process.

**Đạt khi:** B08–B09; acknowledge không tự mở gate; resolved dựa trên dữ liệu thật.

## 5. P3 — quản lý cụm và admission (3–4 ngày công)

### P3-01 — registry API và credential resolver

**File:** `config.mjs`, `cluster.mjs`, `store.mjs`; thêm registry service/admin routes.

1. Metadata/policy trong DB là nguồn chuẩn; secret refs chỉ resolve ở server.
2. Đăng ký cluster ở trạng thái chưa nhận khách; kiểm tra release, schema và endpoint.
3. Endpoint phải thuộc inventory/domain/network đã duyệt; redirect bị từ chối;
   không để validation/probe thành SSRF tới cloud metadata hoặc địa chỉ tùy ý.
4. Credential mismatch, TLS lỗi và manifest thiếu phải trả lỗi cụ thể nhưng an toàn.
5. Cấu hình Gateway phải phản ánh registry được kích hoạt, không còn phụ thuộc danh
   sách env cũ làm nguồn thứ hai. Cache có version/invalidation rõ; secret rotation
   không đổi workspace binding.
6. Đổi endpoint/cluster_id khi đã có khách bị chặn; thay limit không bị migrate ghi đè.

**Đạt khi:** C01–C04; thêm cluster không tự khiến nó nhận khách, không lộ secret.

### P3-02 — admission policy và khóa phân bổ

**File:** `store.mjs::reserve/beginProvision`, policy evaluator và command handlers.

1. Dùng gate của kế hoạch chính: flags/status/credential/release/freshness/resource/backup/slots.
2. Policy updates và reservation dùng khóa/version thống nhất; 20 request tranh suất
   cuối chỉ một workspace mới được nhận.
3. Reserve retry trả bản cũ; expiry và count cùng transaction, không giải phóng provisioning.
4. Affinity email được quyết định cùng reservation; không reassign khi cụm lỗi.
5. Recheck trước first provision, đọc receipt cho lượt đã bắt đầu; không nhận thêm suất.
6. Gate đóng tự động ghi event; mở lại theo chính sách manual pilot. Error codes
   tách closed/full/stale/unhealthy/incompatible; UI khách dùng lời giải thích ngắn.

**Đạt khi:** C05–C10; đầy/stale/draining không nhận mới, khách cũ vẫn resolve đúng cụm.

### P3-03 — ảnh hưởng tải từ khách đang hoạt động

Lập budget cho pool và concurrency report/background job; kiểm tra room quota đã có,
upload size/rate và API timeout ở các đường liên quan. Test một tenant chạy report
nặng trong khi tenant khác đặt phòng và signup. Chỉ sửa bottleneck có số đo; không
tuyên bố admission alone bảo vệ mọi noisy-neighbor hoặc thay toàn bộ RLS.

**Đạt khi:** số đo latency/error theo tenant đối chứng và ngưỡng tải được ghi vào
capacity profile; có runbook khi cần tăng cụm, chưa tự chuyển tenant.

## 6. P4 — hành trình đăng ký và phục hồi (3–5 ngày công)

### P4-01 — affinity, tiếp tục và trạng thái riêng tư

**File:** control store/API, `WorkspaceStart.tsx`, `Onboarding.tsx`, Auth callback.

1. Cùng email đăng ký lại sau expired giữ cụm đã gán cho tới khi có bằng chứng đủ
   để đổi; xung đột lịch sử báo hỗ trợ. Slug có thể tái sử dụng theo policy cũ nhưng
   UUID cũ không bao giờ được activate lại.
2. Setup-status xác thực email/session đúng cụm; public bootstrap không lộ thông tin này.
3. Chờ email/cấp phát/lỗi rõ ràng; polling backoff và deadline; tab mới, reload và
   thiết bị mới có đường resume qua phiên xác thực, không phụ thuộc sessionStorage.
4. Giữ dữ liệu form chưa xác định kết quả, chỉ reset sau xác nhận commit; sửa field
   sau đã active không biến thành một lần tạo mới.
5. Thông báo lỗi hiển thị request ID, không yêu cầu khách nhập key hoặc thông tin VPS.

**Đạt khi:** D01–D06; một owner/workspace/tenant/hotel/trial ổn định qua retry và đổi tab.

### P4-02 — worker đối soát receipt

**File mới:** `workers/provisioning-reconcile.mjs`, job store/CLI và tests.

1. Enqueue atomically trước RPC tại beginProvision; hỗ trợ backfill job cho workspace
   provisioning cũ đã xác minh owner, theo allowlist và dry-run.
2. Lease/fencing, SKIP LOCKED, retry có jitter/max attempts; cùng workspace không
   có hai job active cùng loại. Không giữ DB transaction khi gọi HTTP.
3. Verified receipt activate; missing → waiting_owner; conflict → needs_review;
   unavailable → retry. Log an toàn có workspace/job/request ID.
4. Worker bị kill giữa remote commit và local ack vẫn đối soát được; worker cũ hết
   lease không đổi kết quả mới. Hỗ trợ close/drain worker khi deploy.
5. API recheck có command receipt; UI 202 là “đã yêu cầu kiểm tra”, không “đã hoàn tất”.

**Đạt khi:** D07–D11; retry không tạo tenant/gia hạn trial hoặc đổi tiền.

### P4-03 — signup abuse, email và proxy

**File:** app limiter, reverse proxy config, Register/WorkspaceStart, Auth settings,
email template/callback config; dùng adapter provider test khi chưa có key thật.

1. Trusted proxy policy và IP parsing; backend không public bypass proxy.
2. Hạn mức theo endpoint/tổng/email; chống bot server-side cho public signup, tách
   login/reset/invitation để không khóa nhân viên cùng mạng khách sạn.
3. Direct Auth calls cũng được kiểm soát; xác minh việc tắt public signup không
   phá lời mời nhân viên. Không chỉ đặt flag ở frontend.
4. Email xác thực/reset/invitation luôn đúng staging/production origin và slug;
   resend cooldown, link hết hạn/dùng lại; không gửi Internet trong local test.

**Đạt khi:** D12–D15. Chưa có key provider thì local đạt có thể đóng phần code,
nhưng ticket external/email-delivery phải còn not-run trước public gate.

## 7. P5 — giao diện quản trị (3–5 ngày công)

### P5-01 — khung điều hướng và dữ liệu

**File:** `src/App.tsx`, `SuperAdminLayout.tsx`, hooks/control API client,
locale superAdmin; thêm route hạ tầng/đăng ký.

Hợp nhất entry point theo mục 8 kế hoạch chính; auth authority ổn định khi đang ở
workspace khác; query keys có authority/cluster/filter; cursor/search trong URL;
error/loading/stale riêng. Nút Back, focus dialog và scroll vị trí đúng.

### P5-02 — danh sách/chi tiết hạ tầng

Bảng cô đọng, số đo còn khả dụng, freshness, gate và lý do; detail có timeline,
doanh nghiệp cùng cụm, backup và runbook. Dialog đổi policy hiển thị trước/sau,
expected version, số khách mới bị ảnh hưởng; giữ command ID khi F5/mất response.
Không có shell console, root credential form, restart DB hoặc restore production
trong UI v1. Thêm cluster yêu cầu checklist pipeline đã hoàn thành, không giả lập cài VPS.

### P5-03 — đăng ký và công cụ hỗ trợ

Danh sách server pagination, filter bước/lỗi/cụm; chi tiết timeline và receipt.
Tái sử dụng support lookup/reconcile; người dùng biết cần “chờ chủ tiếp tục” hay
“cụm chưa kết nối”, không bị hướng dẫn tạo lại workspace. Liên kết hồ sơ khách theo
cluster+tenant ID, không query tenant ID đó ở default cluster khác.

Bổ sung API tenant-summary server-to-server tối thiểu ở đúng cụm cho trang này;
không cho nút billing cũ gọi hook của cụm mặc định. Admin authority không được dùng
làm phiên owner của khách. Trường hợp một cụm lỗi phải thể hiện unavailable, không
tự tổng hợp thành số 0 hoặc bỏ cụm khỏi danh sách mà không báo.

### P5-04 — accessibility và review với kịch bản vận hành

Desktop/mobile 390px, bàn phím, tương phản; màu thường dùng; không menu phụ trùng.
Các ca: tìm đăng ký lỗi dưới 30s; chỉ ra lý do VPS không nhận khách; đóng/mở nhận mới;
F5 sau lệnh commit; hai admin thay limit; API lỗi không hiển thị trạng thái khỏe cũ.

**Đạt chung P5:** E01–E08; quyền bị chặn ở API thật, không chỉ ẩn nút ở giao diện.

## 8. P6 — bộ cài VPS, backup và vận hành (3–5 ngày công)

### P6-01 — bundle triển khai và preflight

**File dự kiến:** `deploy/vps/`, scripts deploy/verify, compose profiles, env examples,
release manifest, runbook domain/TLS. Dựa trên Dockerfile/compose hiện có.

1. Cài đủ backend Supabase đã pin đúng phiên bản; service names/volumes/secrets
   độc lập staging/production. Bỏ defaults/dev credentials trước production.
2. Preflight chỉ đọc và phase prepare/apply/verify tách rõ. Phát hiện volume đã có
   dữ liệu hoặc host không đúng; không tự format, xóa hay init DB vào mount sai.
3. Migration account riêng; runtime role ít quyền; public port tối thiểu; DB/exporter
   chỉ mạng riêng. Quản trị SSH không đi qua app khách.
4. Reverse proxy, WebSocket, upload limits/timeouts, TLS renewal, CSP/redirect/VAPID
   phù hợp cụm; build-time flags được kiểm tra từ bundle đang phục vụ.
5. Giới hạn resource/log/disk; restart và deploy lại idempotent, lưu image rollback.

**Đạt khi:** F01–F04 trên VPS staging; local Docker chỉ đóng phần local packaging.

### P6-02 — backup nhất quán và restore sạch

Mở rộng backup hiện có cho directory và Storage, cấu hình/secret references,
PGMQ, Vault. Manifest/checksum/version/watermark; mã hóa và offsite; retention có
dry-run trước xóa artifact hết hạn. Giữ key phục hồi ngoài cùng failure domain.
Pilot snapshot trong cửa sổ maintenance đã khóa mutation/upload phù hợp; kiểm tra
objects orphan/missing trước kết thúc restore. Test mở lại Auth và mapping sau restore.

**Đạt khi:** F05–F08; restore vào máy/volume khác, không vào DB đang phục vụ; đo
RPO/RTO và có bằng chứng login, rooms, staff, file bytes và receipt.

### P6-03 — runbook cảnh báo và ứng cứu

Tối thiểu: control down, DB đầy, metrics stale, credential hết hiệu lực, TLS hết hạn,
provisioning kẹt, backup thất bại, cụm mất kết nối. Mỗi loại có tác động, cách xác
nhận, bước khôi phục, người chịu trách nhiệm và điều kiện mở lại nhận khách.
Alert từ hệ thống ngoài host; thử đường nhận ở nơi được cấp phép, lưu acknowledgement.

**Đạt khi:** F09; người vận hành thực hiện được mà không cần sửa SQL ngẫu nhiên.

## 9. P7 — nghiệm thu và đo tải (3–5 ngày công)

### P7-01 — integration hai backend thật

Hai Auth/DB/Storage/Realtime/Functions riêng, JWT/secret/volume/network khác nhau;
một directory chung. Đăng ký A/B, route đúng, token A không dùng ở B, data isolation,
callback/reset/invite đúng backend, drain A chỉ đưa khách mới sang B. Không dùng
hai registry trỏ cùng Supabase rồi gọi đó là bằng chứng đa cụm.

### P7-02 — browser E2E và lỗi có kiểm soát

Chạy D/E và các ca đồng thời/mất response/kill worker/server restart trên sandbox.
Giữ raw results có redaction và ảnh quan trọng. Sau đó chạy lại trên staging domain
với hộp email thử kiểm soát; không dùng fixture khách thật để thử phá kết nối.

### P7-03 — capacity profile

Dataset 1.000 workspace metadata để đo console; dữ liệu nghiệp vụ tổng hợp tăng theo
10/50/100 khách sạn, 10–50 tài khoản/khách sạn nhưng tải hoạt động được mô tả riêng.
Mức đồng thời đo 10 → 25 → 50 → 100 phiên có think time, dừng khi chạm ngưỡng;
không mặc định VPS đạt được mức cuối. Thử login/rooms/bookings/write/realtime/upload/
report và signup dưới tải, đo p50/p95/p99, 5xx, pool, CPU/RAM/disk/IO và event lag.
Viết profile rõ hardware/image/data/concurrency/workload và ngưỡng nhận mới đề xuất;
không suy ra 100.000 đồng thời bằng cách nhân số cụm.

### P7-04 — đóng release candidate

Chạy checks theo phạm vi, full suite/build ở integration, schema/grants/advisors,
secret scan artifact và smoke container. Duyệt defect list; mọi P0/P1 ảnh hưởng
quyền/dữ liệu/cấp phát/khôi phục phải đóng hoặc giữ gate tương ứng tắt.

**Đạt chung P7:** G01–G08, ma trận còn not-run có lý do và không vượt gate release.

## 10. P8 — pilot và mở rộng có số liệu (1–2 ngày công + quan sát)

### P8-01 — vận hành pilot và quyết định mở rộng

1. Chọn một khách sạn nội bộ, một cụm; whitelist, limit thấp, email thật đã kiểm chứng.
2. Theo dõi 24–48h trước thêm 5–10 khách pilot; chỉ tăng nếu không còn lỗi nghiêm trọng.
3. Quan sát tối thiểu 7 ngày, gồm backup/restore drill, cảnh báo, giờ cao điểm và thao
   tác của owner/nhân viên; báo cáo thời gian đăng ký đến phòng/nhân viên đầu tiên.
4. Kiểm tra support/rollback/runbook bằng người vận hành; tập hợp UX thực tế.
5. Chốt quyết định: tiếp tục pilot, mở thêm có giới hạn, bổ sung cụm hoặc sửa bottleneck.
   Public signup/paid launch có checklist riêng, không tự bật khi hết 7 ngày.

## 11. Các luồng làm song song và thứ tự ghép

| Luồng | Phạm vi sở hữu | Có thể bắt đầu | Điểm ghép |
|---|---|---|---|
| A — Control/DB | P1, P3 registry/admission, command/authority contracts | Sau P0 | Migration/API version trước UI tích hợp |
| B — Telemetry/Deploy | P2, P6, exporter/proxy/backup | Sau ADR P0 | Chuẩn metric của A; không tự đổi schema |
| C — Signup/Console | P4 frontend, P5; tham gia contract worker | Sau contract P0; API stub để phát triển | Nghiệm thu bằng API thật A/D, không chỉ mock |
| D — Recovery/QA | P4 worker, P7 harness và fault injection | Sau schema/contract P1; thiết kế test từ P0 | Báo cáo trên commit integration sau ghép |

Nhánh dự kiến: `codex/control-runtime`, `codex/cluster-metrics`,
`codex/registration-console`, `codex/provisioning-recovery-tests`.
Đây là tổ chức công việc dự kiến, không có agent/worktree mới được tạo bởi tài liệu.

Thứ tự ghép: contracts → migration/runtime/authority → metrics → admission → worker
và signup → admin UI → deployment/backup → acceptance. Giao diện có thể phát triển
sớm nhưng không triển khai nút ghi khi backend chưa có kiểm tra quyền/audit.

## 12. Gói công việc đầu tiên khi bắt đầu implementation

Đây là thứ tự khởi đầu khi lập gói. Nền local đã có bằng chứng riêng; bước thực tế
tiếp theo chuyển sang T01–T04 trong plan thực thi: kiểm chứng thay đổi control đang
dở, command/authority và migration mới trước khi làm telemetry/admission.

Thực hiện P0-01/02/03 và P1-01/02 trước. Bàn giao một control runtime local thường
trực, directory riêng giữ dữ liệu sau restart, health/proxy đúng và migration có
history. Chưa cần số đo VPS production hoặc khóa email để hoàn thành gói này.

Sau gói đầu: P2 collector/evaluator và P1-03 authority/commands có thể đi song song;
tiếp theo P3 gate. Không đi thẳng vào biểu đồ dashboard khi nguồn số liệu và cơ chế
đóng nhận khách chưa có tiêu chí đúng/sai.
