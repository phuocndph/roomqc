# RoomQC — health worker và duyệt nguồn đo

**Điểm nhận hiện hành 28/10:** [shared resource startup](roomqc-control-shared-resource-runtime-local-2026-10-28.md)
bắt buộc file ngân sách chung cho staging/production; health và probe tính pool riêng,
budget con phải khớp profile. [Managed probes](roomqc-t06-managed-runtime-local-2026-10-22.md)
đã có source/proof local. Nội dung ghi ngày19/10, runtime0005 và thiếu M06 bên dưới
là checkpoint lịch sử, không đại diện source hiện tại; không tự dùng để rollout.

Ngày 19/10/2026. Phạm vi M05/T06, đi cùng [run sheet P2](roomqc-p2-monitoring-delivery-plan-2026-10-19.md).
Đã có worker/config/entrypoint và kiểm thử riêng; **chưa bật monitoring thường trực**.
Entrypoint hiện không có adapter năm service probe M06: trả `HEALTH_PROBES_UNCONFIGURED`,
không ghi mẫu khỏe và `/readyz` không thành công. Không bỏ probe để chạy qua gate.

## 1. Điều kiện trước khi bật service

1. Đóng public signup; chụp baseline directory/image/config và backup đã kiểm chứng.
2. Áp migration directory qua migrator riêng sau review; source mới có `0006`.
   Không chạy migration này trên Supabase nghiệp vụ. Runtime hiện tại vẫn `0005`.
3. Cụm phải gắn `hosts.id` thật. Legacy import có `host_id=NULL` không được duyệt
   target cho đến khi hoàn tất mapping host bằng quy trình được audit; không tự suy
   ra host từ tên cụm. Fixture có mapping riêng, không dùng để backfill dữ liệu thật.
4. Inventory API và worker phải cùng cluster/host/environment/mount/device/fstype,
   measurementScope và budget DB backend. VPS/staging dùng `linux-host`, không VM scope.
5. Đủ adapter M06 + manifest T08 và canary đã review. Đợt M05 chưa đáp ứng điều này.
6. Chỉ nối network directory và metrics đã duyệt; kiểm tra network isolation thực tế.
   Không publish cổng exporter/Prometheus/worker, không thêm Docker socket hoặc quyền root.

## 2. Duyệt/đổi nguồn đo

Inventory API có `telemetryTarget` được validate và freeze. Admin chỉ gửi hash của
target trong inventory server, không gửi URL/path/device hoặc số đo từ browser.
Hàm server `telemetryTargetFingerprint(target)` trả hash canonical; không tự hash
JSON chưa normalize bằng công cụ khác. Payload command:

```json
{
  "operation": "bind_telemetry_target",
  "expectedVersion": 1,
  "reason": "Duyệt nguồn đo theo inventory đã đối chiếu",
  "payload": {"targetFingerprint": "<64 ký tự hex từ server>"}
}
```

Dùng endpoint command quản trị đã có, actor từ authority cố định và Idempotency-Key
UUID ổn định. Recheck version khi mở dialog; retry mất response giữ nguyên key/payload.
Đổi payload phải tạo lệnh mới. UI command tương ứng còn thuộc P5, chưa có nút ở đợt này.

Giao dịch chung allocation lock gồm: desired hash/definition/version/thời điểm DB,
vô hiệu health cũ, tăng generation, đóng admission + operator latch, receipt và audit.
Audit lưu hash/version trước–sau, không lưu mount path/device/secret. Audit lỗi rollback
toàn bộ. Duyệt lại cùng hash không sửa boundAt/version hoặc reset window.

API nạp inventory mới khác desired hash sẽ chặn nhận mới và hiển thị health unknown;
replica còn inventory cũ cần được rollout/kiểm tra riêng. Sau khi binding commit trong
directory, mọi worker đều phải khớp desired hash và số đo sau boundAt. Dữ liệu cũ,
scope/mount/budget sai bị từ chối. Đổi A→B→A cũng không dùng lại mẫu A trước lần duyệt mới.
Backend đang active giữ nguyên mapping. Mẫu mới warmup ít nhất 5 phút; healthy không
tự mở gate. Admin chỉ mở lại sau toàn bộ điều kiện policy/backup/release/credential đạt.

Trigger invalidation là SECURITY DEFINER hẹp trong schema private, search_path cố định,
mọi bảng/sequence fully qualified, PUBLIC không EXECUTE, không phải RPC. Chỉ có tác dụng
giảm mức tin cậy/đóng gate; không có đường tạo mẫu khỏe. Role metrics không ghi clusters,
không tắt trigger, không gọi function hoặc gỡ operator latch. Review lại quyền trên VPS.

## 3. Cấu hình worker tách biệt

Chỉ hai đường dẫn absolute: `ROOMQC_HEALTH_CONFIG_FILE` metadata và
`ROOMQC_HEALTH_DATABASE_URL_FILE` chứa DSN login chỉ thuộc `roomqc_control_metrics`.
Không tái dùng `.env.control`, email key, migrator DSN, API role hoặc service_role.
Production DB dùng `sslmode=verify-full`; Prometheus HTTPS có TLS verify và DNS/IP pin.
Local HTTP chỉ khi development + flag allow-local và origin loopback được hỗ trợ.

Metadata có cấu trúc sau, **chỉ là ví dụ, phải thay bằng inventory đã kiểm chứng**:

```json
{
  "schemaVersion": 1,
  "instanceId": "health-shard-a",
  "targets": [{
    "target": {
      "clusterId": "cluster-a", "hostId": "host-a", "environment": "production",
      "measurementScope": "linux-host", "dbConnectionBudget": 80,
      "dataMounts": [{"id": "data", "mountpoint": "/var/lib/roomqc", "device": "/dev/vda1", "fstype": "ext4"}]
    },
    "prometheus": {"url": "https://monitor-a.internal", "approvedAddresses": ["10.0.0.12"]}
  }],
  "connectionBudget": {
    "maxConnections": 30, "reservedConnections": 5,
    "apiInstances": 2, "apiPoolMax": 5, "reconcileInstances": 1, "reconcilePoolMax": 2,
    "healthInstances": 2, "healthPoolMax": 2, "exporterConnections": 1, "migrationConnections": 1
  }
}
```

Budget trên là **directory**, không phải backend DB budget 80. Công thức tổng:
replica API×pool + reconcile×pool + health×pool + exporter + migrator + dự phòng ≤max.
Ví dụ tổng 23/30; chưa phải số đo capacity hay xác nhận inventory fleet thực tế T10.
Replica/shard tăng phải cập nhật toàn fleet; cấu hình mỗi process không tự phát hiện
orchestrator đã chạy thêm replica ngoài budget.

Mỗi process tối đa 4 target, xử lý đồng thời đúng số target; thêm shard khi cần.
Pool metrics 1–4, acquire 2s, statement 3s, lock 2s, idle transaction 5s. Toàn giao dịch
HealthStore ≤8s, quá hạn đóng kết nối thật thay vì để promise trả muộn tiếp tục commit.
Mỗi target có deadline 25s; Prometheus nguồn có deadline riêng 12s. Vòng khoảng 30s
start-to-start, jitter ±10%, không overlap; khi lỗi backoff tối đa khoảng 66s gồm jitter.
Stale sweep trước collection, batch 100; reserve/read API kiểm expiry trực tiếp ngay
cả khi watchdog ngừng. Không dùng sweep làm điều kiện duy nhất để chặn stale >120s.

File DSN Linux: UID/GID 1000 đọc được, không world access hoặc group write; ví dụ
1000:1000 mode 0600 hay root:1000 mode 0640. Không symlink, file ≤8 KiB; metadata
≤64 KiB. Windows cần ACL phù hợp; test permission Unix riêng không thay kiểm tra ACL.

## 4. Process, health và compose

```powershell
node server/control/workers/health-runtime.mjs --help
node scripts/test-health-process.mjs --help
```

Runtime `/livez` và `/readyz` ở `127.0.0.1:8093`, chỉ cho kiểm tra trong process/container.
Không proxy ra frontend. Ready nghĩa pipeline cycle gần nhất hoàn tất/sweep thành công,
không có target collection lỗi và heartbeat <120s; không có nghĩa tất cả backend khỏe.
Backend probe false là dữ liệu đánh giá health, khác thiếu adapter/probe throw.
Status chỉ gồm timestamp/count/error code, không URL, DSN, payload hoặc mount path.

SIGTERM/SIGINT ngừng vòng mới, abort công việc mạng, drain có deadline, đóng pool/server.
Hard deadline CLI 22s, compose grace 25s. Readiness chuyển false khi dừng. Restart không
được xóa window/latch trong database; không tự mở admission. External heartbeat M09
còn thiếu: loopback endpoint trên cùng VPS không phát hiện được VPS mất hoàn toàn.

File `deploy/monitoring/health-worker.compose.yml` có profile opt-in `health-worker`.
Các biến cần điền qua file vận hành riêng: project sở hữu, image immutable đã review,
metadata path, secret path, hai network chính xác. Không chạy compose up ở đợt này:
thiếu M06/T08 là gate chưa đạt. Dockerfile đã COPY workers; pin base không thay security
scan release hoặc bằng chứng network/TLS trên VPS.

## 5. Kiểm thử và phần còn lại

`npm run test:control:db` chạy unit/contract + DB disposable + exporter/Prometheus thật.
`test-health-process.mjs --image sha256:<local-image-ID>` kiểm image hash/source hiện tại,
network none, non-root/read-only/no ports, live200/ready503 khi DB fixture không tồn tại,
SIGTERM exit0 và restart vẫn fail-closed; cleanup kiểm nhãn ownership trước rm.
Đây không phải positive probe Supabase hay kiểm thử mất VPS thật.

Còn trước khi đóng M05/P2: M06/T08 đủ năm dịch vụ, nguồn thật → worker → snapshot trên
full backend sandbox; restart/kill và DB down/up thực cho worker pipeline; quan sát
10 phút + stale/recovery drill M10; Linux staging/TLS/network; M07–M09 alert/delivery/
external heartbeat. Không mở public signup, gửi email thật hoặc áp fixture vào local-a.
