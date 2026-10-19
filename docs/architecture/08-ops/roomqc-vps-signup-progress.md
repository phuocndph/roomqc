# Tiến độ thực hiện VPS/signup

Cập nhật 19/10/2026. Mục tiêu giữ nguyên toàn bộ [27 gói](roomqc-vps-signup-work-packages-2026-10-19.md)
và [70 kịch bản nghiệm thu](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
Không coi đợt nền tảng local là hoàn tất plan hoặc sẵn sàng mở cho khách thật.

Kế hoạch thực thi đã cụ thể hóa tại [25 bước / 8 đợt](roomqc-vps-signup-execution-plan-2026-10-19.md).
Lượt cập nhật plan ban đầu quan sát runtime `0003`. Đợt tiếp theo đã triển khai
control local `0005`, kiểm tra 44/44 test, lệnh admin/allocation và health snapshot;
xem [báo cáo đợt admin/health](roomqc-control-admin-health-local-2026-10-19.md).
Kế hoạch P2 đã chia nhỏ thành [M01–M10](roomqc-p2-monitoring-delivery-plan-2026-10-19.md),
gắn file/test/phụ thuộc và gate; các mã M không thêm scope hoặc acceptance case.
Collector thường trực, probe/manifest backend và các gate release còn thiếu; không tính
hoàn tất P1-03/P2/P3 chỉ vì các phần nền này đã được kiểm chứng local.

Lượt chuẩn bị triển khai tiếp theo đã bổ sung [phiếu giao việc mục 18–23](roomqc-vps-signup-execution-plan-2026-10-19.md#18-điểm-bắt-đầu-đã-đối-chiếu-và-thứ-tự-giao-việc):
manifest/schema fingerprint và quyền probe; đủ năm service; pipeline/fault thực;
alert/outbox; signup/resume/lease; hai màn admin; VPS/offsite/E2E/tải/pilot.
Mỗi bước có dependency, file/đầu ra, negative control và acceptance liên quan;
đầu vào external gom tại mục 22. Không tạo thêm roadmap hoặc tăng 27/25/70.
Kiểm tra read-only lúc 18:24 +07:00 ngày 19/10 xác nhận readyz direct/proxy 200,
runtime `0005`, image control/frontend không đổi và signup false. Lượt này chỉ
cập nhật tài liệu; không nâng trạng thái implementation/acceptance của gói nào.

[Manifest kết quả](../../../artifacts/roomqc-control-foundation-2026-10-19.json)
ghi source base/hash, image, schema, command và trạng thái riêng từng acceptance ID.

## Trạng thái từng gói

| Gói | Trạng thái | Bằng chứng / phần tiếp theo |
|---|---|---|
| P0-01 | Đã lập baseline local | [Inventory và ma trận route](roomqc-vps-signup-baseline.md); browser cutover vẫn thuộc P7 |
| P0-02 | Đã chốt thiết kế pilot | [ADR D01–D08](../adr/roomqc-control-v3.md); OpenAPI 3.1 có schema/enum/quyền và đánh dấu endpoint planned |
| P0-03 | Một phần | Sandbox DB directory có ownership/cleanup và race thật; fixture Auth/staff/email/hai backend còn phải mở rộng |
| P1-01 | Đã triển khai và kiểm chứng nền tảng local | Migration history/checksum/lock; 15 bảng nghiệp vụ directory; baseline cũ được bảo vệ; grant ba group role; chưa phải nghiệm thu release |
| P1-02 | API + DB local đã chạy | Volume/restart/proxy/health/shutdown đạt; worker được nối ở P4, chưa tính worker runtime đã triển khai |
| P1-03 | Một phần đã kiểm chứng local | Command/version/receipt/audit và HTTP authority boundary đạt; còn Auth thật/revoke/MFA và support/recheck identity |
| P2-01 | Một phần đã kiểm chứng local | Exporter/Prometheus riêng tư đã chạy trên DB fixture, đối chiếu filesystem/OS/DB và lỗi quyền/password/down; chưa có đủ năm service probe hoặc bằng chứng Linux staging |
| P2-02 | Một phần đã kiểm chứng local | Worker/config/entrypoint/target binding và timeout/race/stale đã test; chưa bật thường trực, thiếu M06/T08/full backend pipeline và metric VPS |
| P2-03 | Chưa triển khai | Deduplicate/ack/resolve/heartbeat ngoài máy |
| P3-01 | Một phần đã kiểm chứng local | Registry draft/secret resolver/pinned DNS có test; thiếu manifest RPC/full validation/rotation/TLS môi trường thật |
| P3-02 | Một phần đã kiểm chứng local | Gate/reservation race/close/version/expiry/affinity đạt trên fixture directory; chưa E2E backend, signup vẫn đóng |
| P3-03 | Chưa triển khai | Pool/job/report budget và noisy-neighbor có số đo |
| P4-01 | Một phần | Affinity đã nối reserve/expiry và có test; private setup-status/resume/UI chưa nối |
| P4-02 | Chưa triển khai | Job table đã có; enqueue/claim/fencing/reconcile worker chưa nối |
| P4-03 | Chưa triển khai | Trusted proxy/anti-abuse/direct Auth/email callback |
| P5-01 | Chưa triển khai | Entry admin authority, client/query key/routes |
| P5-02 | Chưa triển khai | Màn hình hạ tầng và command dialog |
| P5-03 | Một phần API đọc | Workspace list/detail + timeline cursor đã test 1.005 metadata; chưa console/recheck/tenant-summary |
| P5-04 | Chưa triển khai | Keyboard/mobile/contrast/Back/scroll và thao tác admin |
| P6-01 | Chưa hoàn tất | Có local directory/control compose; chưa có bộ cài full Supabase VPS/TLS/manifest |
| P6-02 | Chưa triển khai | Backup ngoài máy và restore directory+cluster+objects+secret |
| P6-03 | Chưa hoàn tất | [Runbook local](roomqc-control-local-runbook.md); ứng cứu staging/production còn thiếu |
| P7-01 | Chưa triển khai | Hai backend thật, mỗi cụm Auth/DB/key riêng |
| P7-02 | Chưa triển khai | Browser E2E/signup/invite/mobile/cutover/fault |
| P7-03 | Chưa triển khai | Capacity profile trên cấu hình VPS có tên/digest |
| P7-04 | Chưa triển khai | Full release candidate và đối chiếu tất cả gate |
| P8-01 | Chưa triển khai | Pilot có người dùng được chọn và ít nhất 7 ngày quan sát |

## Bằng chứng kiểm chứng mới

Đợt M05 worker/target binding: suite cuối **87/87 test đạt, 0 fail, 0 skip**, có
log đầy đủ và manifest/hash riêng tại [báo cáo M05](roomqc-p2-health-worker-local-2026-10-19.md).
Hai worker trên DB fixture đã kiểm tra đổi target khi collect, mẫu cũ bị reject;
definition scope/mount/budget, audit rollback, role boundary và DB transaction
timeout thật. Process container offline đã test SIGTERM/restart và fail-closed.
M05 vẫn partial: entrypoint thiếu adapter M06 không được ready hoặc tạo mẫu khỏe;
còn full service pipeline và fault/10-phút drill. Source có migration `0006`,
runtime vẫn `0005`, image thường trực không đổi/signup đóng. [Runbook worker](roomqc-health-worker-runbook.md).

Đợt M04 exporter/config: suite control **66/66 test đạt, 0 skip**, gồm stack
Prometheus/node_exporter/postgres_exporter và PostgreSQL disposable thực. Nguồn đo
kiểm tra exporter up/collector success/permission/scrape error; mất quyền thống kê,
DB down và mật khẩu cũ đều không được tạo mẫu khỏe. File secret Unix được kiểm tra
quyền đọc của UID/GID container. [Báo cáo](roomqc-p2-exporter-local-2026-10-19.md)
và [runbook](roomqc-monitoring-operator-runbook.md) ghi giới hạn. Không cộng 66 với
59/44 đợt cũ; không quy đổi thành 66/70 acceptance. Chưa deploy monitoring thường
trực hoặc đổi image control. Năm probes fixture vẫn false, không gán fixture cho
local-a hoặc mở signup. M05/M06/T08/M07–M10 còn phải triển khai/nghiệm thu.

Plan đã bổ sung [phiếu chuẩn bị mục 17](roomqc-vps-signup-execution-plan-2026-10-19.md#17-phiếu-chuẩn-bị-triển-khai-tiếp-theo--chốt-ngày-19102026),
gồm đầu vào/đầu ra từng bước, ranh giới dữ liệu, điều kiện dừng, checklist signup/UI
và phần external giữ riêng. Các cổng staging/pilot/public chưa được mở bằng plan này.

Đợt P2 multi-mount/source: **59/59 test đạt, 0 skip**, gồm PostgreSQL disposable và
Prometheus `promtool` chạy biểu thức thực với 14 nguồn timestamp lần lượt bị cũ.
Đây là suite mới chứa test hồi quy cũ, không cộng 59 với 44 và không đổi thành
59/70 acceptance release. [Báo cáo và giới hạn](roomqc-p2-source-local-2026-10-19.md).
Code đợt này chưa deploy vào control image thường trực; source adapter chưa phải
health worker chạy nền, nguồn fixture không được gán cho cụm local-a.

### Đợt admin/health trước đó

Đợt admin/health mới: **44/44 test đạt, 0 skip** với directory sandbox độc lập;
runtime local `0005`, signup đóng. [Báo cáo](roomqc-control-admin-health-local-2026-10-19.md)
ghi phạm vi, giới hạn và việc còn lại; [artifact](../../../artifacts/roomqc-control-admin-health-2026-10-19.json)
giữ bằng chứng cho source/image mới. Không cộng 44 với 17 của bản nền.

### Bằng chứng lịch sử của đợt nền tảng

Lệnh `npm run test:control:db`: **17 test đạt, 0 fail, 0 skip**. Trong đó 6 test
Postgres container độc lập bao phủ:

- DB trống; hai migrator thực sự cùng chờ advisory lock; tổng apply một lần;
  rerun no-op, history không đổi và import không ghi đè hạn mức/policy.
- DB directory v2 có tenant/hotel/owner binding, audit và lịch sử expired;
  nâng cấp giữ dữ liệu; email từng xuất hiện ở hai cụm tạo conflict, không tự chọn.
- Schema lạ, sai type/default và backend có Auth bị từ chối trước history.
- Checksum khác bị chặn; migration thử lỗi rollback cả DDL và history.
- API login thật được reserve nhưng bị DB từ chối DDL, sửa history, xóa audit,
  đọc pg_authid; metrics không đọc workspace và worker/metrics không DDL.
  Login superuser không được readiness; bảng thiếu làm readiness lỗi.
- HTTP livez còn hoạt động khi schema chưa migrate; explicit migration/grant xong
  readyz thành 200. Healthz giữ payload compatibility `status=ok`.

Ba runtime test kiểm tra phân biệt live/ready, drain chờ request đã nhận, request
bị treo không vượt deadline shutdown. Các test config/gateway/support cũ chạy lại
trong cùng suite; không cộng lặp kết quả qua nhiều lượt để tăng số test.

`npm run control:local -- restart-check` trên stack thường trực đã đạt:

- Dừng DB điều phối: livez=200, readyz=503.
- Khởi động DB/API lại: sẵn sàng, hash history/registry/workspace/attempts không đổi.
- API dùng runtime role, database không public, signup vẫn đóng.
- HTTP qua proxy 8082 trả JSON/no-store; gateway tới Auth local qua internal URL
  được kiểm tra bằng health read-only, không tạo tài khoản/tenant/email.

OpenAPI đã kiểm tra parse, local references, operation IDs và admin security;
đây là kiểm tra tài liệu, không thay thế API integration của 14 operation planned.
Các kiểm tra trên không chứng minh Linux host metric, email thật, backup ngoài
máy, hiệu năng VPS, browser E2E hoặc hành vi pilot.

## Đối chiếu một số acceptance ID

| Case | Kết luận hiện tại |
|---|---|
| A01 | Có bằng chứng runtime/inventory local |
| A02 | Một phần: chỉ kiểm kê counts/port và phạm vi lệnh; chưa fingerprint đủ dữ liệu hệ thống khác |
| A03 | Chưa chạy browser/cutover đầy đủ |
| A04 | Đạt cho migration directory trống/v2 trong sandbox; production chưa chạy |
| A05 | Đạt local cho lock/rerun/checksum/rollback |
| A06 | Đạt các kiểm tra grants local nêu trên; role/secrets trên VPS phải kiểm tra lại |
| A07 | Đạt API/DB/shutdown local; worker chưa triển khai nên case tổng thể chưa đóng |
| A08–A11 | Command/version/replay/race/audit boundary có bằng chứng local ở `d0f9b7b`; còn Auth/revoke thật và browser reload, không đóng tổng thể |
| B01–G08 | Chưa đóng theo release mới; các assertion nền tảng không thay nghiệm thu riêng |

## Thứ tự làm tiếp

1. P2: exporter + collector/multi-mount + cảnh báo, đối chiếu metric với nguồn thật.
   M04 local và phần source/runtime M05 đã test; tiếp theo M06/T08 đủ probe/manifest,
   rồi khép pipeline và fault/drill M05/M10,
   rồi M07/M08/M09 (alert/delivery/external heartbeat), theo run sheet P2.
2. P1-03/P3: Auth thật, manifest RPC/full validation và credential/TLS rotation.
3. P3: nghiệm thu gate đã nối DB qua backend thật; mới xét mở signup trong sandbox.
4. P4/P5: recovery worker/resume và UI admin; P6/P7 trước triển khai staging/pilot.

VPS/domain/DNS/TLS, email delivery thực và đích backup ngoài máy chưa được cung
cấp/kiểm chứng trong đợt này. Chúng chặn gate external tương ứng, không chặn các
gói code/local ở trên. Không yêu cầu người dùng gửi credential trong chat.
