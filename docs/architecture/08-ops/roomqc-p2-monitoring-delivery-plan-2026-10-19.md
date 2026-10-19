# RoomQC P2 — run sheet triển khai giám sát và cảnh báo

Ngày 19/10/2026. Đây là kế hoạch thực hiện T05–T07, không phải báo cáo pass.
Đi cùng [plan 25 bước](roomqc-vps-signup-execution-plan-2026-10-19.md),
[27 gói](roomqc-vps-signup-work-packages-2026-10-19.md) và
[70 case](roomqc-vps-signup-acceptance-rollout-2026-10-19.md). Tiến độ thực lấy
ở [tracker](roomqc-vps-signup-progress.md). Chưa mở public signup.

## 1. Mục đích và hiện trạng

Đội vận hành cần biết đúng máy/ổ/dịch vụ nào đang có vấn đề, dữ liệu đo lúc nào,
vì sao không nhận thêm khách và phải làm gì. Khách đang dùng không bị tự khóa hay
chuyển cụm chỉ vì metric xấu. Một dashboard đẹp không thay được nguồn số đo thật.

Nền đã kiểm chứng: `d0f9b7b`, directory `0001`–`0005`, 44/44 test ở đợt trước.
HealthStore đã có window/generation/stale và cờ bắt buộc admin mở lại. Thay đổi
multi-mount ở `health-policy.mjs`, `telemetry.mjs`, `admin.mjs` và file mới
`telemetry-source.mjs` còn chưa test/sync tại lúc lập run sheet này. Không lấy
44 test cũ làm bằng chứng cho mã mới, không gán fixture health cho backend đang dùng.

Sau khi lập run sheet, phần M02/M03 đã tiến triển qua suite 59/59 test; xem
[báo cáo đợt source](roomqc-p2-source-local-2026-10-19.md). Không suy ra toàn bộ
M02/M03 hoặc runtime P2 đã đóng: còn worker target binding và số đo exporter thật.

Đợt M04 tiếp theo đã có kiểm chứng exporter/config local trong suite **66/66**;
xem [báo cáo M04](roomqc-p2-exporter-local-2026-10-19.md) và
[runbook operator](roomqc-monitoring-operator-runbook.md). Role/query/config và
Prometheus/exporter đã chạy thật trong fixture riêng, có đối chiếu OS/DB, revoke,
DB down/password rotate và cleanup. Không phải Linux VPS/staging proof; M05 worker,
M06 năm service probes/T08 manifest và M07–M10 vẫn chưa đóng. Không mở admission
hoặc triển khai monitor thường trực chỉ vì suite đạt; artifact 59-test cũ giữ nguyên.

M01–M10 chỉ chia nhỏ P2, không đổi tổng 27 gói/70 acceptance case. Owner thực thi
là kỹ sư nhận đợt; review/acceptance cần người đối chiếu artifact. Chưa phân công
song song hay tạo thêm nhánh chỉ bằng việc có bảng công việc này.

## 2. Ranh giới dữ liệu và hợp đồng

Luồng: exporter riêng tư → Prometheus → collector có query cố định → HealthStore
→ snapshot/admission/alert → Control read API → UI admin. Browser không được gọi
Prometheus, truyền query, URL hoặc credential. Không scrape khi người dùng mở trang.

| Dữ liệu | Nguồn chuẩn | Yêu cầu |
|---|---|---|
| Target đo | Inventory server đã duyệt | host/cluster/environment/scope/mount/device/fstype; không lấy từ query browser |
| CPU/RAM/ổ/inode | node_exporter trên đúng host | CPU idle rate 1 phút; MemAvailable; ổ thực chứa DB/Storage, không overlay/tmpfs |
| Kết nối DB | postgres_exporter, query cố định | Số client backend và budget đã tính; role không ghi dữ liệu nghiệp vụ |
| Năm service | Probe theo release đã pin | Auth/REST/Storage/Realtime/Functions; xác nhận nội dung/hợp đồng, không coi port mở là khỏe |
| Freshness | Timestamp gốc của tất cả series bắt buộc | Không dùng evaluation timestamp mới để che series cũ; thiếu series phải reject |
| Quyết định | Policy + snapshot trong directory | Generation/policyVersion/validUntil; stale/unknown không được coi là healthy |
| Alert | Directory và outbox notification | Fingerprint/version/open/lastSeen/ack/resolved; không chứa PII/secret |

Sample v2 có `schemaVersion=2`, `requiredMountIds`, `dataDisks[]` và metrics/probes.
Một mount bắt buộc thiếu/read-only/không xác minh → không tạo sample hợp lệ; snapshot
cũ tự hết hạn. DB và Storage cùng filesystem được map rõ hai vai trò tới một
mount; không duplicate series để cộng dung lượng. Cấu hình không hỗ trợ phải lỗi
rõ, không đo thư mục root khác để thay thế.

Compat v1 chỉ phục vụ test/đường cũ; worker v2 phải yêu cầu đúng schema/target.
Khi đổi target/policy phải vô hiệu hóa bằng chứng cũ và warmup lại; đổi mount
không được giữ cửa sổ khỏe của ổ cũ. Mapping/schema version cần được fingerprint
trong snapshot, không chỉ trong log. OpenAPI phải mô tả disk null/stale và scope.

## 3. Ticket triển khai theo thứ tự

### M01 — khóa baseline, inventory và test scope (T05/P2-01)

1. Ghi commit/diff/image/schema/flags, fingerprint source cần bảo vệ và tên sandbox.
2. Liệt kê host → cụm → DB volume/Storage volume → filesystem/device thật.
3. Tách `docker-desktop-vm` và `linux-host`; staging/production bắt buộc host Linux
   thật. Số đo Windows qua VM không phải capacity của Windows host hay VPS.
4. Target config chỉ có metadata/ref, không password; validate ID/path/type/count.
5. Exporter test dùng PostgreSQL sandbox có nhãn sở hữu, không thêm role vào DB
   nghiệp vụ hiện tại. DB fixture và backend local-a phải có ID khác nhau.

File: telemetry config/source tests, công cụ prepare/cleanup sandbox. Đạt khi
target sai host/mount/env bị từ chối; interruption dọn được theo manifest sở hữu.
Artifact: inventory đã lọc bí mật, before/after fingerprint. Case: A01/A02/B01.

### M02 — khép multi-mount và public DTO (T06/P2-02)

1. Review/hoàn thiện draft v2: danh sách mount duy nhất, đầy đủ, 1–16 ổ;
   bytes/count safe integer; không NaN/Infinity/âm/free lớn hơn total.
2. Xét ngưỡng riêng từng ổ: storage critical vẫn chặn dù DB còn trống; không ghép
   minimum free của ổ A với maximum total của ổ B. Ghi affectedMounts đúng ID.
3. Persist schema/target fingerprint và mọi disk cùng window/generation; restart,
   đổi mount/policy và mẫu cũ không được giữ recovery giả.
4. Giữ API cũ tương thích nhưng DTO mới không lộ host path/device/credential;
   hiển thị ID/nhãn ổ, free/total/inode, scope, observedAt/validUntil và reason.
5. Update OpenAPI/client fixture; nếu cần đổi schema DB thì tạo migration directory
   kế tiếp theo history thực, không sửa file `0001`–`0005` đã áp.

Test: DB tốt/Storage đầy và đảo lại; thiếu/trùng/extra mount, readonly, inode,
ngay bằng/ngay dưới ngưỡng, v1→v2, restart/target change, DTO stale/null.
Đạt: test v2+regression và DB serialization qua role metrics thật. Case B04–B07.

### M03 — adapter Prometheus đáng tin cậy (T05/T06)

File: `telemetry-source.mjs` và `telemetry-source.test.mjs`.

1. Query template theo đúng host/cluster/environment/job/mount/device/fstype;
   escape label bằng serializer, không nối input tùy ý từ API.
2. Freshness lấy minimum timestamp từ *mọi* series bắt buộc. Review PromQL set
   union/label matching: `or` trên label giống nhau có thể làm mất một metric.
   Test bằng Prometheus thật với một series cũ trong nhóm có label giống nhau.
3. Reject empty/multi-vector/NaN/Inf/giá trị rỗng, thiếu source timestamp, invalid
   ISO date hoặc sample tương lai/quá cũ. Lỗi trả code an toàn, không RangeError thô.
4. Pinned DNS transport với URL/IP đã duyệt, TLS verify, không redirect; query
   timeout 3s, toàn lượt 12s, tối đa 4 query song song, response tối đa 128 KiB.
   Signal caller không được vô tình bỏ deadline nội bộ; cancel phải ngừng fanout.
5. Một target lỗi không làm dừng toàn vòng. Không có dữ liệu hợp lệ thì không ghi
   sample healthy và không sửa observedAt cũ thành now.

Đạt: unit malformed/timeouts/fanout + integration PromQL/old-series thật;
artifact query template không credential, timestamps expected/actual. B02–B06.

### M04 — compose/exporter riêng tư, role tối thiểu (T05)

File đã có ở đợt M04: `deploy/monitoring/compose.yml`, `queries.yml`,
`exporter-roles.sql`, `scripts/render-monitoring-config.mjs` sinh `prometheus.yml`,
config/stack tests và runbook operator. Đã test fixture local, chưa deploy thường
trực; alert runtime vẫn ở M07/M08 và Linux/network/TLS vẫn cần staging.

1. Chọn/pin digest Prometheus/node_exporter/postgres_exporter/Alertmanager theo
   architecture và quét tương thích; không dùng `latest` hay tải script chạy thẳng.
2. Exporter node chỉ mount host filesystem read-only cần thiết, không Docker socket.
   Tài liệu nêu rõ host namespace/capability thực cần; không cấp privileged mặc định.
3. Role DB LOGIN riêng được provision bởi migrator/operator trên sandbox/staging;
   quyền thống kê đủ dùng, không DDL/DML/schema nghiệp vụ hoặc superuser. Password
   từ secret file, có rotate; không in DSN/config secret trong log.
4. Chỉ bật query thống kê cố định cần cho metric; mặc định tắt query dư. Đối chiếu
   số kết nối với OS/DB và giải thích connection exporter phát sinh.
5. Không publish Prometheus/exporter/Alertmanager/Grafana/DB ra public. Kênh quản trị
   qua mạng riêng/tunnel đã duyệt, auth phù hợp; container chạy read-only khi hỗ trợ.
6. Đặt memory/CPU, log rotation và retention theo budget; dự kiến time series 15 ngày
   theo ADR nhưng phải có size cap. Không tự xóa volume/backup của stack khác.

Test: scrape thật, thiếu quyền/down/password rotate, bên ngoài không truy cập
được, no socket/secret leak, verify mapping. B01–B03 local; Linux đối chiếu ở staging.

### M05 — worker thường trực và stale watchdog (T06)

File mới dự kiến: `server/control/workers/health-worker.mjs`, config/entrypoint,
compose worker, tests. Không nhét vòng scrape vào handler HTTP.

Cập nhật M05: đã có worker/config/entrypoint/compose opt-in và directory migration
`0006` cho desired-target binding. Runtime thường trực chưa thay schema/image;
entrypoint thiếu adapter M06 sẽ fail-closed, không sinh mẫu khỏe. Xem
[runbook worker](roomqc-health-worker-runbook.md). M05 vẫn partial đến khi đạt
full probe/backend pipeline + fault/restart/10-phút drill ở M06/M10.

1. Pool riêng role metrics, budget tổng gồm API/reconcile/monitor/exporter; vòng 30s
   có jitter, không chồng vòng trên cùng instance. Giới hạn số target đồng thời.
2. Collect/probe ngoài transaction, record ngắn qua HealthStore; stale sweep vẫn
   chạy khi Prometheus lỗi. DB unavailable không làm báo ready hoặc drop task im lặng.
3. Process heartbeat/ready/failure counter có timestamps; không log payload/secret.
   Worker bị treo/mất phải được external heartbeat nhận ra ở M09.
4. Hai instance dùng generation/time/fingerprint để không ghi lùi. Shared allocation
   lock chỉ giữ transaction ngắn; đo lock wait, không giữ khi chờ HTTP.
5. SIGTERM ngừng vòng mới, hủy/chờ công việc trong deadline, đóng pool; hard kill
   restart giữ window và không tự mở lại admission.

Test: hai worker thật, hang/timeout, DB down/up, missing target/probe, kill/restart,
stale >120s vẫn chặn ở reserve ngay cả watchdog ngừng. A07/B05–B07/C07.

### M06 — probe có ý nghĩa cho năm dịch vụ (T05; phụ thuộc T08)

Phiếu giao việc chi tiết, quyền/schema drift/transport và tiêu chí khép pipeline
ở [mục 19 của kế hoạch thực thi](roomqc-vps-signup-execution-plan-2026-10-19.md#19-phiếu-triển-khai-gần-nhất--m06t08-và-khép-giám-sát).
Không coi các endpoint dự kiến dưới đây là đã được xác minh trên release hiện tại.

1. Chốt probe matrix theo image/release: endpoint/protocol/credential ref, payload
   tối thiểu, response shape, deadline, quyền và canary resource IDs.
2. Auth phải chứng minh DB/session hoạt động theo image đã pin; REST gọi manifest/
   canary có nonce và đúng identity; Storage đọc object private tổng hợp rồi kiểm
   bytes/hash. Health version, REST limit zero hoặc Storage process status riêng
   lẻ chưa đủ; endpoint không có/không đủ nghĩa thì probe unconfigured, không pass.
3. Realtime phải handshake ứng dụng và round-trip nonce đúng cụm trên kênh canary
   có quyền riêng, đóng kết nối sau kiểm tra; Functions
   chạy canary nhỏ trả cluster/release nonce, không gọi tác vụ/email nghiệp vụ.
4. Canary ở sandbox/staging riêng, role tối thiểu, cleanup allowlist. Không dựng
   kết quả `true` cố định để qua gate khi chưa có function hay credential.
5. Chốt typed result phân biệt missing config/unreachable/denied/invalid/stale;
   boolean cho evaluator được derive, chi tiết đã lọc dùng giải thích vận hành.
6. T08 manifest RPC server-only chưa có phải làm trước khi đóng validation đầy đủ.
   Tạo migration Supabase bằng CLI đã kiểm tra `--help`, kiểm tra grants/RLS và advisors.
   Fingerprint schema thực so với build artifact tin cậy; không chỉ trả hash do
   operator nhập. Worker dùng credential probe riêng, không business service_role.

Test: từng service tắt/sai release/sai key/response, timeout tổng có trần, canary
positive ở đúng cụm. B02/C01; test TLS/rotation thật tiếp T08/P6. Chưa có probe
đủ thì P2-01 vẫn partial dù đã có CPU/RAM thật.

### M07 — alert lifecycle bền vững và API (T07)

File dự kiến: alert store/router/tests và migration directory nếu cần version/
ack reason/outbox. Rà grants: metrics được lifecycle, admin chỉ ack qua command.

1. Fingerprint môi trường/resource/type/ổ liên quan; một lỗi liên tục một alert.
   Disk DB và Storage lỗi là hai resource xác định, không dùng path/PII trong label.
2. Save open/update/resolve cùng event phù hợp; lastSeen tăng đơn điệu, replay không
   nhân bản. Recovery/unknown là hai nghĩa khác nhau; mất mẫu không resolve lỗi.
3. Ack có actor/reason/command/version/receipt+audit atomic; ack không mở gate hoặc
   tắt lỗi. Hai admin ack và mất response dùng quy tắc idempotency hiện có.
4. Read API allowlist filter, cursor 25/100, DTO không secret; deep link alert tới
   cụm/đăng ký, không tạo thêm sidebar trùng chức năng.

Test race dedup/resolve/reopen/ack/version/audit rollback; auth denial; pagination.
Đạt B08 local; không gọi B09 pass bằng việc thấy alert trong dashboard cùng host.

### M08 — notification retry/cooldown không gửi trùng vô hạn (T07)

1. Lưu outbox cùng alert transaction; dispatcher dùng lease/fencing và provider
   idempotency khi có. Ack xử lý timeout provider chưa rõ outcome bằng delivery ID.
2. Chốt route severity; một open notification, nhắc lại có cooldown cấu hình và
   trần; resolution gửi một lần khi đủ điều kiện. Restart không reset cooldown.
3. Network retry backoff/budget; dead-letter có người nhận. Không hứa exactly-once
   trên provider không có receipt; ghi duplicate window và xử lý rõ.
4. Local chỉ sink/inbox thử. Không gửi email thật, thêm địa chỉ nhận hoặc gọi
   webhook Internet chưa được user đặt trong phạm vi.

Đạt: restart/lost response/retry/cooldown/failed delivery được quan sát và audit;
không lộ secret kênh nhận. B08 phần local; outbound thật thuộc đầu vào external.

### M09 — external heartbeat và drill mất host (T07/T20)

1. Dùng hệ theo dõi nằm ngoài failure domain VPS; check frontend/control và
   heartbeat từng worker, không chỉ process Prometheus trên chính máy đó.
2. Cấu hình đích/kênh do RoomQC quản lý, timeout/cadence, downtime window, runbook.
3. Ngắt kết nối host staging thử; ghi thời gian detection → notification → ack →
   recovery. Mục tiêu phát hiện ≤180s, giao thông báo ≤300s là đề xuất cần đo/duyệt.
4. Thử cảnh báo provider mất riêng; không dùng cùng SMTP/VPS làm kênh duy nhất.

Đạt B09/F09 chỉ khi nhận thông báo ngoài host thật. Chưa có quyền/đích thì ghi
`deferred_external`, tiếp tục M10; không tạo tài khoản nhà cung cấp thay user.

### M10 — tích hợp, bằng chứng và handoff P3 (T06/T07)

1. Chạy unit/contract/DB riêng; lỗi test/fixture không được bỏ skip để đạt số đẹp.
2. Build control/worker đã review, verify source hashes trong image và schema;
   sandbox trước, không deploy collector fixture vào local-a rồi báo backend khỏe.
3. Đo 10 phút scrape đúng target; stop source >120s, restart và recovery 10 phút;
   gate stale/critical đúng, operator latch vẫn cần admin. Chứng minh khách active
   giữ mapping; không thực hiện fault trên DB nghiệp vụ đang dùng.
4. Lưu manifest/log mới: commit/tree hash, images/schema/config fingerprints,
   fixture IDs, B01–B09 expected/actual và phần local/staging/not-run riêng.
5. Fingerprint dữ liệu cần bảo vệ không đổi, cleanup riêng. Đồng bộ từng file
   đã kiểm chứng sang checkout chính, không đụng index hay thay đổi ngoài phạm vi.
6. Cập nhật tracker, OpenAPI, runbook và backlog lỗi; bàn giao điều kiện T08–T10.

## 4. Phụ thuộc và dự toán

M01 → M02/M03/M04 → M05; M06 phối hợp T08. M05/M06 → M07 → M08;
M09 cần quyền external; M10 tổng hợp sau các phần local. Đây là phụ thuộc công việc,
không phải yêu cầu tạo agent tự động. Không trì hoãn collector/test vì thiếu kênh alert.

Dự toán P2 hiện tại 3–4 ngày công là khoảng ban đầu của plan, không phải deadline.
Chốt lại sau M03/M04 khi biết chi phí probe Realtime/Functions và mapping Linux;
scope phát sinh hoặc không đạt phải ghi lại, không âm thầm cắt bớt probe để giữ lịch.

## 5. Cổng bàn giao

| Cổng | Phải có | Không được kết luận |
|---|---|---|
| P2 local partial | M02/M03 test + source thật trong sandbox xác định | Chưa gọi là giám sát đủ cụm hoặc VPS |
| P2 local integrated | M01–M08/M10 đạt tương ứng; M06 đủ năm dịch vụ và manifest; lifecycle/restart có bằng chứng | Chưa đạt Linux metric/offsite/external alert hoặc capacity production |
| P2 staging | Linux B01–B08, network/TLS/overhead và đủ probe; M09 đạt B09 | Chưa tự mở public/pilot nếu P3–P7 chưa đạt |

Đầu vào external gom lại: VPS Linux staging/inventory, DNS/TLS, đích alert và
heartbeat ngoài máy. Không yêu cầu secret trong chat; cấu hình qua secret store.
Lệnh runner mới chỉ công bố sau khi đã có implementation, `--help` và test target
guard. Các lệnh đã có như `npm run test:control:db` vẫn theo runbook, không chạy
`test:control:local` trên backend nghiệp vụ hiện tại.
