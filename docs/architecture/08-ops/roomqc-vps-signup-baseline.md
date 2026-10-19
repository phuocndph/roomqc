# Baseline VPS/signup — 19/10/2026

Nguồn tích hợp: `roomqc-worktrees/integration`, nhánh
`codex/roomqc-parallel-integration`, bắt đầu từ `6f8511e` (plan). Checkout chính có
nhiều thay đổi từ trước; chỉ đồng bộ file xác định, giữ nguyên index checkout đó.

## Runtime được quan sát

| Đối tượng | Trước đợt nền tảng | Sau triển khai local |
|---|---|---|
| Frontend | `room-weave-pro-main-roomqc-1`, 127.0.0.1:8082, healthy | Cùng image `sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b`; chỉ thêm mount nginx/proxy/network |
| Control | Không có service thường trực tại 8091 | `roomqc-control-local-roomqc-control-1`, 127.0.0.1:8091, restart unless-stopped, healthy |
| Directory | Không dùng schema directory trong backend nghiệp vụ | `roomqc-control-local-directory-1`, Postgres 16, volume `roomqc-control-local_directory-data`, cổng DB không publish |
| API proxy 8082 | `/api/control/healthz` trả 503 | livez/readyz/healthz trả 200 JSON, Cache-Control no-store |
| Supabase nghiệp vụ | `supabase_db_ehjtoajnlnuvuiwkpmbp`, 520 migration, 3 tenant | Vẫn 520 migration, 3 tenant; directory_required=false |
| Dịch vụ khác | CRM PostgreSQL 55432; dự án khách sạn khác 8081/3000/5434; scraper 8080 | Không có lệnh ghi/cấu hình/restart nhắm các dịch vụ này trong đợt nền tảng |

Counts trên DB nghiệp vụ là kiểm tra dấu hiệu thay đổi, không là fingerprint đầy
đủ mọi bản ghi. Không dùng chúng để tuyên bố A02 đã nghiệm thu toàn bộ. Migration,
role và dữ liệu test chỉ ghi vào directory riêng hoặc DB container disposable.

Image nền control Node 22 digest
`sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85`.
Directory Postgres 16 digest
`sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383`.
Digest image control build phải lấy bằng `docker image inspect roomqc-control:foundation-v3`
ở từng lần build; mã nguồn đang phát triển không được gán giả vào image cũ.

## Ranh giới đọc/ghi và cờ

- API runtime: directory login thuộc `roomqc_control_api`; không DDL hoặc xóa audit.
- Migrator: credential riêng chỉ qua stdin job một lần, không nằm trong API env.
- Metrics/worker: group role riêng đã tạo; worker nghiệp vụ chưa chạy trong gói này.
- Source Supabase: chỉ đọc health/status/schema/counts để kiểm kê, không sửa cờ,
  tạo user/tenant, gửi email hoặc chạy lifecycle trong kiểm thử nền tảng.
- `ROOMQC_CONTROL_SIGNUP_ENABLED=false`. Test API xác nhận SIGNUP_CLOSED.
- Frontend directory chưa cutover; việc proxy hoạt động không đồng nghĩa bật flow mới.
- Secret local nằm `.local/control/`, bị Git/Docker context loại; ACL Windows chỉ
  user hiện hành và SYSTEM. Không copy giá trị vào artifact/report/chat.

## Ma trận route phải bảo vệ trước cutover

| Luồng | Code hiện tại | Điều kiện cần test ở P4/P5/P7 |
|---|---|---|
| Legacy `/auth/login`, `/auth/register` | Khi directory bật, root chuyển về `/start` | Có đường legacy hoặc pilot host; không ép khách cũ mở tenant mới |
| Workspace `/app/:slug/...` | Bootstrap trước singleton, basename riêng | Allowlist/CSP đúng cụm, không chéo session hoặc hotel preference |
| Callback `/auth/callback` | Giữ workspace prefix khi có | Email verification/reset trả đúng origin+slug; hết hạn/replay rõ ràng |
| Invite `/auth/accept-invite` | Luồng riêng với provisioning owner | Tắt public signup không làm hỏng lời mời nhân viên |
| Mobile | PKCE + native origin; chỉ cho control bootstrap/provision/signup hiện tại | Setup-status mới phải bổ sung native allowlist có kiểm thử, không wildcard |
| Global admin | Hiện chưa có login root riêng cho authority | P5 bổ sung `/super-admin/login`; không gắn workspace basename hoặc dùng owner session |
| Chi tiết tenant cụm khác | Admin hook hiện chủ yếu default backend | P5 tenant-summary đúng cụm; không trỏ ID khách sang backend mặc định |

Đây là inventory dựa trên source; A03 vẫn cần browser E2E, không đánh dấu passed.

## Nâng cấp directory

`schema.sql` giữ làm fixture legacy v2. Runtime chỉ dùng `migrations/`:
0001 baseline → 0002 infra/recovery → 0003 grants. History/checksum và advisory
lock kiểm soát thứ tự; schema lạ/tenant backend bị từ chối trước history. Không
reset DB. Import registry chỉ khởi tạo, rerun giữ nguyên limit/policy đã sửa.

Affinity backfill chỉ chọn cụm khi lịch sử email có đúng một cụm; nhiều cụm ghi
conflict riêng. P4 còn phải tích hợp affinity vào reservation/resume. P3 còn phải
dùng policy/health/backup để gate. Vì vậy signup vẫn đóng trong giai đoạn chuyển.
