# RoomQC — vận hành worker cảnh báo control

Phạm vi: backend local của T07, migration directory `0013-alert-lifecycle-outbox.sql`. Chưa mount/start worker trên stack chính hoặc VPS. Không áp dụng migration này vào Supabase business database. [Plan](roomqc-vps-signup-handoff-2026-10-28.md) và [bộ ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) giữ điều kiện nghiệm thu riêng.

**Cấu hình khởi chạy hiện hành 28/10:** [common resource budget](roomqc-control-shared-resource-runtime-local-2026-10-28.md)
bắt buộc `ROOMQC_RESOURCE_BUDGET_FILE` ở staging/production; môi trường và pool/replica/
otherAllocatedConnections phải khớp profile chung. Đã có template opt-in
`deploy/monitoring/alert-worker.compose.yml`, chưa start/deploy. Đoạn mẫu số dưới đây
chỉ minh họa schema, phải thay bằng inventory thực và không là capacity proof.

## Luồng và trách nhiệm

HealthStore ghi snapshot, latch chặn nhận khách, sự kiện và outbox trong cùng transaction. Lỗi lặp chỉ cập nhật lần thấy cuối; một episode còn mở có đúng một fingerprint. Health phục hồi đủ cửa sổ mới ghi resolved; lần lỗi sau tạo episode mới và liên kết episode cũ. Cảnh báo legacy được giữ nguyên khi nâng cấp, không tự gửi lại toàn bộ lịch sử.

API nhận xử lý lưu actor, reason, version, command receipt, event và outbox trong một transaction. Nhận xử lý không ghi `resolved_at`, không sửa health/admission hoặc bỏ `operator_reopen_required`. Receipt giữ kết quả tại thời điểm lệnh, ngay cả khi cảnh báo đã phục hồi sau đó.

Dispatcher có DB login riêng kế thừa `roomqc_control_alerts`. Login này chỉ đọc outbox/history schema/attempt và cập nhật trạng thái giao hàng; không đọc workspace, secret canary hoặc sửa lifecycle cảnh báo. Không dùng login API, metrics, postgres hay service role thay thế. Readiness từ chối quyền quá rộng.

## Cấu hình trước khi chạy

1. Sao lưu directory và xác minh release/migration hiện hành. Dùng installer có quyền nâng cấp để áp dụng migration directory theo thứ tự/checksum; giữ API chưa sẵn sàng cho đến khi history và shape đủ. Không sửa checksum/history của migration đã phát hành.
2. Tạo login gửi cảnh báo và cấp membership `roomqc_control_alerts` qua quy trình quản lý secret. Mật khẩu không đặt trong command line, chat hoặc repository. DB production cần TLS `sslmode=verify-full` và trust store hợp lệ.
3. Chuẩn bị bốn regular file tuyệt đối, không symlink; Linux secret mode/owner/group phải đáp ứng loader. Windows cần ACL riêng do installer kiểm. Ba file DB URL/endpoint/token phải được bảo vệ, endpoint path có thể chứa thông tin nhạy cảm.
4. Biến môi trường chỉ chứa đường dẫn: `ROOMQC_ALERT_CONFIG_FILE`, `ROOMQC_ALERT_DATABASE_URL_FILE`, `ROOMQC_ALERT_ENDPOINT_FILE`, `ROOMQC_ALERT_TOKEN_FILE`. Production đặt `NODE_ENV=production`. Không đưa token vào JSON cấu hình công khai.

Ví dụ nội dung config, cần thay budget theo tổng pool của deployment thực:

```json
{
  "schemaVersion": 1,
  "instanceId": "operations-alerts-01",
  "poolMax": 2,
  "concurrency": 2,
  "intervalMs": 1000,
  "requestTimeoutMs": 10000,
  "leaseMs": 60000,
  "shutdownTimeoutMs": 15000,
  "approvedAddresses": [],
  "connectionBudget": {
    "maxConnections": 100,
    "otherAllocatedConnections": 70,
    "instances": 1,
    "reservedConnections": 10
  }
}
```

`otherAllocatedConnections` phải gồm API, reconcile, metrics, probe, exporter và installer. Budget kiểm `other + instances × poolMax + reserved ≤ max`. Cần đo DB thực; config không thay capacity proof. Concurrency không vượt poolMax; lease lớn hơn hai lần request timeout cộng 8 giây để settle.

Endpoint là URL tĩnh do operator duyệt, không nhận từ payload, khách hàng hoặc API. Production chỉ HTTPS, không userinfo/query/fragment, không redirect; DNS được kiểm và ghim địa chỉ cho từng request. IP private cần liệt kê trong approvedAddresses; metadata/link-local luôn bị chặn. Local HTTP chỉ loopback khi `ROOMQC_ALERT_ALLOW_LOCAL=true` và không production.

Chạy từ root checkout đã cài dependencies `server/control`:

```powershell
node server/control/workers/alert-runtime.mjs --help
node server/control/workers/alert-runtime.mjs
```

Chạy service manager/container bằng identity riêng, mount file read-only, không publish status ra internet. Status chỉ bind `127.0.0.1:8094`: `/livez` xác nhận tiến trình, `/readyz` xác nhận DB role/schema và chu kỳ làm việc còn mới. Ready không bảo đảm kênh bên ngoài đã nhận mọi thông báo; lỗi/dead-letter phải được giám sát riêng. Template Compose mới được dẫn ở đầu tài liệu; systemd/VPS rollout và kênh ngoài host chưa được nghiệm thu.

## Hợp đồng giao hàng và phục hồi

POST JSON v1 gồm `deliveryId`, `eventId`, `alertId`, `resourceId`, `type`, `severity`, `transition`, `occurredAt`, `rowVersion`. Không có email khách, bearer owner hoặc secret DB. Header dùng `Authorization: Bearer …`, `Idempotency-Key` và `X-RoomQC-Delivery-Id`; hai mã delivery giữ nguyên qua retry/restart. Receiver phải kiểm token, lưu dedupe theo delivery ID trước khi phản hồi 2xx, và xử lý version khi thông báo đến khác thứ tự.

2xx nghĩa endpoint chấp nhận thông báo. 429/408/5xx, timeout hoặc mạng lỗi được retry với backoff 1s, 2s… tối đa 5 phút, tối đa 8 attempt. 401/403, 4xx khác và đích/redirect bị từ chối vào dead-letter. Lỗi chỉ lưu mã cố định, không lưu response/raw exception/token. Response body tối đa 4KiB.

Lease và attempt bền vững. Worker khác có thể nhận lease hết hạn; token cũ không được settle. Khi lease cuối hết hạn, outbox vào dead-letter và không gửi lần thứ chín. Shutdown hủy request, ghi retry nếu còn lease; tiến trình mất đột ngột để lease hết hạn và được phục hồi. Không có network call trong transaction DB.

Timeout có thể xảy ra sau khi receiver đã xử lý. Hệ thống không hứa giao đúng một lần; nó retry cùng ID để receiver dedupe. Nhiều worker có thể giao khác thứ tự, dùng event/version để xử lý. Không tự xóa delivered/dead-letter hoặc viết lại payload/attempt history. Chưa có lệnh/UI redrive đã nghiệm thu; khi dead-letter, bảo toàn bằng chứng, sửa cấu hình và xử lý theo runbook phục hồi được duyệt, không reset attempt bằng SQL tùy tiện.

## Điều kiện còn mở trước production

- Kênh thật ngoài host, người trực chính/phụ, escalation, xác minh token/TLS và ngữ nghĩa 2xx/dedupe của receiver.
- Monitor nằm ngoài failure domain của VPS control/monitoring: mất cả host thì worker bên trong không thể tự gửi cảnh báo. B09 phải diễn tập từ ngoài host trên staging.
- Kết nối console list/ack, lưu journal key và tra receipt khi mất response; browser/Android và live canonical Auth.
- Bundle service/restart/reboot trên Linux, retention/backup directory, kiểm DB outage, rolling restart và ngân sách kết nối trên máy thực.
- Dashboard/alert riêng cho queue age, dead-letter, heartbeat vắng và delivery failure. Chưa coi readyz là bằng chứng provider hoạt động.

Không mở admission/signup hoặc thay gate chỉ vì bài thử HTTP sink local đạt.
