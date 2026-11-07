# P2 multi-mount và source adapter — kiểm chứng local

Ngày 19/10/2026. Phạm vi: một phần M02/M03 trong
[run sheet P2](roomqc-p2-monitoring-delivery-plan-2026-10-19.md), thuộc T05/T06.
Không đánh dấu hoàn tất P2, không mở signup hoặc triển khai production.

## Kết quả

`npm run test:control:db`: **59 đạt, 0 lỗi, 0 skip**. Suite gồm hồi quy của đợt
44 test và phần mới; không cộng 44+59 hay coi đây là 59/70 acceptance release.
Đã chạy PostgreSQL disposable có nhãn sở hữu và Prometheus `promtool` bản pin.
Container test và thư mục fixture tạm đã dọn theo ownership; không xóa dữ liệu người dùng.

Trong lần tích hợp đầu có một test mới fail: fixture đã warmup nhưng chưa có
lệnh admin mở lại, nên reserve bị `NO_CAPACITY` đúng thiết kế. Đã sửa test dùng
lệnh `open_admission` thật sau warmup; không sửa guard để làm test pass.

## Đã thay đổi và đã chứng minh

1. Sample v2 bắt buộc target fingerprint, scope và đầy đủ ổ dữ liệu; từ chối
   thiếu/trùng/sai range/compat fields trộn hai ổ và downgrade version âm thầm.
2. Disk/inode xét độc lập từng ổ. Storage critical không bị DB còn trống che;
   không tạo một tỷ lệ sai từ free của ổ A và total của ổ B.
3. Evaluator persist schema/identity/scope/mount/window; đổi identity hoặc schema
   phải warmup lại, recovery cũ không đi theo nguồn mới. Latch admin vẫn bảo toàn.
4. HealthStore qua login metrics thật lưu đầy đủ v2, restart giữ dữ liệu, mẫu bị
   từ chối không tăng generation; critical chặn reserve mới, bản ghi workspace
   active và mapping cũ không đổi trong sandbox.
5. Source adapter chỉ dựng template từ inventory đã validate và copy/freeze;
   có fingerprint canonical. Query cùng evaluation time, tối đa 4 request đồng
   thời, timeout query 3s, trần toàn lượt 12s kể cả khi caller có signal khác.
6. Sửa union timestamp: `timestamp()` mất tên metric nên các series cùng label
   có thể che nhau. Gắn nhãn nguồn duy nhất trước `or` và lấy thời gian cũ nhất.
   Prometheus engine thật kiểm tra 14 nguồn lần lượt last-sample 60s thay vì 120s,
   cùng CPU rate và selector disk. Không chỉ so sánh text query.
7. Empty/multiple vectors, invalid scalar/time, readonly/inode không hợp lệ,
   timeout/cancel đều bị từ chối; không trả 0 hoặc healthy để che dữ liệu thiếu.
8. Loopback HTTP thật dùng pinned transport, reject redirect và response >128 KiB.
   Unit/contract/DB test kiểm tra DTO chỉ trả mount ID/values, không path/device/ref;
   scope VM rõ ràng, stale giữ số đo cũ nhưng status unknown. OpenAPI đã cập nhật.

Hướng dẫn Supabase ảnh hưởng phần compatibility/grants trong plan; hướng dẫn
PostgreSQL được dùng khi rà role tối thiểu, pool bounded và transaction ngắn.
Không thêm HTTP call vào transaction hoặc cấp quyền mở admission cho metrics.

## Runtime và giới hạn bằng chứng

Đã chạy read-only `npm run control:local -- verify`: live/ready/health đạt,
schema `0005`, signup closed, directory private/persistent và API least privilege.
Đây vẫn là control image của đợt trước. Code/source adapter đợt này **chưa deploy**
vào image thường trực và chưa có worker chạy source adapter theo lịch.

Prometheus dùng engine thật với series tổng hợp và HTTP transport dùng fixture
server; chưa phải scrape node_exporter/postgres_exporter của VPS. Boolean probe
trong test là fixture có kiểm soát, không phải bằng chứng năm dịch vụ đang khỏe.
Không ghi fixture health vào cụm local-a, không tạo role/user/tenant hay áp migration
ở business Supabase, không gửi email thật và không thay frontend/CRM.

Fingerprint mới hiện reset khi nhận sample v2. Việc buộc snapshot khớp target
inventory đang deploy *trước* nhận sample tiếp theo còn phải nối ở M05/T08; không
vì unit test này mà mở admission từ snapshot v2 cũ sau đổi cấu hình.

## Bàn giao và việc tiếp theo

- [Manifest mới](../../../artifacts/roomqc-p2-source-local-2026-10-19.json) giữ base
  commit, source hashes, image quan sát, command/result và giới hạn acceptance.
- [Log suite cuối](../../../artifacts/roomqc-p2-source-local-2026-10-19.log) không
  chứa credential. Artifact admin/health cũ giữ nguyên, không sửa kết quả lịch sử.
- M04: private exporter/Prometheus compose, role DB sandbox, mapping filesystem,
  budget/overhead và đối chiếu số đo thật.
- M05/M06 + T08: worker thường trực/watchdog, target binding, manifest server-only,
  probe đủ năm dịch vụ theo release; sau đó alert lifecycle/delivery/heartbeat.
- VPS staging metric/TLS, external alert và offsite/pilot vẫn `not_run` hoặc chờ
  đầu vào external; chưa có căn cứ công bố capacity hay mức sẵn sàng production.
