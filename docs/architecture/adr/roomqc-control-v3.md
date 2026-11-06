# ADR — RoomQC control v3 và cụm VPS do RoomQC quản lý

Ngày 19/10/2026. Trạng thái: quyết định triển khai cho pilot; thay phương án ưu tiên
managed trong roadmap 15/10 đối với phạm vi VPS/signup này.

## Quyết định

| ID | Quyết định thực hiện | Giới hạn |
|---|---|---|
| D01 | Supabase self-host trên VPS RoomQC; khách đăng ký nhận workspace trong cụm đã chuẩn bị | Không tạo VPS/database riêng theo mỗi lần đăng ký. Tài liệu managed cũ là lịch sử; không trộn provider metrics với host metrics |
| D02 | Giữ Node control và Postgres directory riêng, giao diện dùng chung | Migration directory bị chặn khi thấy Auth/Supabase migration/tenant schema; không reset DB nghiệp vụ |
| D03 | Một data cluster/host ở v1; pilot có thể chung host control nhưng cộng đủ overhead | Host thực tế/VPS chưa được cung cấp. Chưa chứng minh HA, giới hạn số khách hoặc RTO production |
| D04 | Prometheus/node_exporter/postgres_exporter/Alertmanager; UI đọc snapshot | Exporter riêng tư, không Docker socket; collector chuẩn hóa metric ở P2 |
| D05 | Job bền vững trong directory, lease/fencing và SKIP LOCKED | Không lưu password/access token trong job; worker đối soát receipt, không tự chạy lại biểu mẫu |
| D06 | Thêm cụm đã chuẩn bị để nhận khách mới | Chuyển tenant cũ hoặc thuê VPS tự động thuộc dự án sau |
| D07 | Authority admin là cụm cấu hình cố định; RPC xác nhận role/session/khóa hiện hành | Không chọn authority từ request hoặc user_metadata; authority mất kết nối thì lệnh admin bị chặn |
| D08 | Trạng thái phục vụ, sức khỏe, nhận đăng ký và thuê bao là bốn nguồn riêng | Gate tài nguyên chỉ chặn cấp phát mới; không khóa khách đang dùng hoặc đổi billing |

## Nguồn chuẩn và quyền sở hữu

- Directory DB giữ registry/policy/health/admission/mapping/command/job/audit. Secret
  chỉ nằm phía server, tham chiếu bằng credential_ref. Trong đợt nền tảng, gateway
  vẫn dùng registry env cũ để giữ tương thích; P3 chuyển sang registry DB và kiểm
  chứng rotation trước mở signup. Không đánh dấu chuyển đổi đó đã hoàn thành.
- `cluster_policies.tenant_limit` sẽ là nguồn duy nhất sau P3; `max_workspaces`
  tạm giữ compatibility. Import khởi tạo chỉ INSERT, không ghi đè chỉnh sửa admin.
- API/worker/metrics dùng group role riêng. Migration dùng login quản trị riêng,
  không truyền database superuser credential vào API container.
- Một đầu mối kiểm soát số migration. File đã áp dụng bất biến, checksum UTF-8/LF.
  Binary cũ không được dùng để chạy lại schema.sql sau cutover.

## Hợp đồng và trạng thái

Hợp đồng máy đọc: `server/control/contracts/control-v3.openapi.json`. Từng operation
ghi `x-implementation`: `implemented-foundation` hoặc `planned`. Đây không phải
danh sách endpoint đã chạy thật. Health và API cũ được giữ; receipt/idempotency
v3 của admin vẫn cần P1-03/P3/P4.

- Snapshot thiếu dữ liệu là null; quá `validUntil` là stale, không thành healthy.
- `source_generation`, `row_version`, `expectedVersion` chống ghi đè. Client giữ
  UUID Idempotency-Key qua reload; payload khác cùng key trả 409. Response 202 chỉ
  xác nhận enqueue, không khẳng định cấp phát hoặc sửa lỗi đã xong.
- Claim DB ngắn; không giữ transaction trong thời gian HTTP. HTTP deadline 20s;
  worker lease 90s và fencing phải được kiểm thử khi P4 triển khai.
- Pagination `(created_at,id)` giảm dần, mặc định 25, tối đa 100; filter allowlist.
- Metric time series dự kiến giữ 15 ngày; health snapshot chỉ giữ bản hiện tại,
  event/audit/command 180 ngày; job hoàn tất 30 ngày. Chỉ chạy retention có manifest
  backup và policy được chốt; chưa áp dụng chính sách xóa ở đợt này. Hồ sơ khách,
  chứng từ và backup kinh doanh không theo retention log vận hành này.

## Host/mạng và release hiện tại

Local dùng Docker Desktop. Stack `roomqc-control-local` có network directory nội
bộ, volume riêng không publish 5432; API chỉ publish 127.0.0.1:8091. Frontend 8082
tham gia network access bằng compose override và proxy `/api/control/` tới API.
Gateway dùng URL public 127.0.0.1:54321 cho mapping; đường server nội bộ tới
`host.docker.internal:54321` không xuất ra browser.

Data backend hiện tại vẫn là stack Supabase local được kiểm kê trong baseline,
không phải release production được đóng gói. P6 phải khóa manifest full Supabase
compose tương thích và kiểm tra Linux/TLS/Storage/Realtime/Functions; không dùng
CLI local làm bộ cài production.

Đã đối chiếu changelog Supabase 19/10: thông báo 12/10 loại TLS 1.2 CBC cũ từ 10/11;
Node 22/OpenSSL hiện đại và cấu hình proxy không ghim cipher CBC. Khi lên VPS vẫn
phải chạy kiểm tra TLS thật, không coi nhận định này thay cho nghiệm thu.

## Cutover và rollback

Đợt nền tảng giữ server signup đóng, frontend directory chưa bật, và cờ
`private.roomqc_cluster_config.directory_required=false` ở DB nghiệp vụ hiện có.
P7 phải kiểm thử route callback/invite/mobile/global admin và thiết kế đường legacy
trước bật directory. Khách đã có mapping không đổi cụm khi đóng gate. Rollback
proxy bằng compose frontend cơ sở; dừng stack control giữ volume. Không chạy down -v,
không hạ schema bằng migration cũ, không xóa mapping để thử lại signup.

## Tài liệu đối chiếu

- [Kế hoạch](../08-ops/roomqc-vps-signup-implementation-plan-2026-10-19.md)
- [Baseline](../08-ops/roomqc-vps-signup-baseline.md)
- [Tiến độ và bằng chứng](../08-ops/roomqc-vps-signup-progress.md)
- [Self-host Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [TLS changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
