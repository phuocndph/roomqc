# Tiến độ thực hiện VPS/signup

Cập nhật 19/10/2026. Mục tiêu giữ nguyên toàn bộ [27 gói](roomqc-vps-signup-work-packages-2026-10-19.md)
và [70 kịch bản nghiệm thu](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
Không coi đợt nền tảng local là hoàn tất plan hoặc sẵn sàng mở cho khách thật.

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
| P1-03 | Chưa hoàn tất | Authority support cũ giữ nguyên; command identity/version/audit nguyên tử và admin operation map cần triển khai tiếp |
| P2-01 | Chưa triển khai | Exporter riêng tư, map host/disk, probe dịch vụ thật |
| P2-02 | Chưa triển khai | Snapshot/freshness/generation/window/hysteresis |
| P2-03 | Chưa triển khai | Deduplicate/ack/resolve/heartbeat ngoài máy |
| P3-01 | Chưa triển khai | Registry DB, credential resolver/inventory/validation/rotation |
| P3-02 | Chưa triển khai | Admission thật; hiện global signup đóng để bảo vệ giai đoạn chuyển |
| P3-03 | Chưa triển khai | Pool/job/report budget và noisy-neighbor có số đo |
| P4-01 | Chưa triển khai | Affinity backfill đã có; reservation/resume/setup-status/private ownership chưa nối |
| P4-02 | Chưa triển khai | Job table đã có; enqueue/claim/fencing/reconcile worker chưa nối |
| P4-03 | Chưa triển khai | Trusted proxy/anti-abuse/direct Auth/email callback |
| P5-01 | Chưa triển khai | Entry admin authority, client/query key/routes |
| P5-02 | Chưa triển khai | Màn hình hạ tầng và command dialog |
| P5-03 | Chưa triển khai | Đăng ký/timeline/recheck và tenant-summary đúng cụm |
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
| A08–A11 | Command/admin v3 chưa xong; không lấy support test cũ làm bằng chứng đóng |
| B01–G08 | Chưa đóng theo release mới; các assertion nền tảng không thay nghiệm thu riêng |

## Thứ tự làm tiếp

1. P1-03: command receipt, expected version và authority/capability cho API admin.
2. P2: exporter + collector/evaluator + cảnh báo, đối chiếu metric với nguồn thật.
3. P3: registry/policy/admission nối nguồn DB; mới xét mở signup trong sandbox.
4. P4/P5: recovery worker/resume và UI admin; P6/P7 trước triển khai staging/pilot.

VPS/domain/DNS/TLS, email delivery thực và đích backup ngoài máy chưa được cung
cấp/kiểm chứng trong đợt này. Chúng chặn gate external tương ứng, không chặn các
gói code/local ở trên. Không yêu cầu người dùng gửi credential trong chat.
