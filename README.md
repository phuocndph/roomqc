# RoomQC

> Hệ thống quản lý khách sạn, tài sản, phòng, giặt là và housekeeping.

## Chạy local

Yêu cầu Node.js 22+, npm và Docker (nếu dùng Supabase local).

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 8082
```

Mở `http://127.0.0.1:8082/auth/login`. RoomQC cố định ở cổng `8082` để không
đụng `8080` (CRM-JolieFam) hoặc `8081` (Hotel Data Engine). Nếu dùng Supabase
local, API mặc định là `http://localhost:54321` theo `.env`.

Khởi động Supabase local bằng script của dự án:

```powershell
npm run supabase:start
```

Script chủ động bỏ `vector` và `logflare`. Hai dịch vụ thu thập log này không
cần cho Auth/Database/Storage/Realtime/Edge Functions và trên Docker Desktop
có thể lặp khởi động khi Docker API TCP không được bật.

## Kiểm tra trước khi dùng

```powershell
npm run validate:env
npm test
npm run db:lint
npm run build
npm run verify:build
```

RPC integration cần publishable key; với Supabase local, runner tự dùng system
tenant nil UUID. Khi chạy project VPS/remote, phải chỉ rõ tenant UUID:

```powershell
$env:SUPABASE_TEST_URL="http://localhost:54321"
$env:SUPABASE_TEST_ANON_KEY="<publishable-or-anon-key>"
$env:SUPABASE_TEST_TENANT_ID="<tenant-uuid>"
npm run test:integration
```

Runner integration sẽ báo lỗi cấu hình rõ ràng; nó không coi việc toàn bộ test
bị skip là thành công.

## Docker local

```powershell
docker compose --env-file .env -f docker-compose.roomqc.yml up -d --build
docker compose --env-file .env -f docker-compose.roomqc.yml ps
npm run verify:container
```

## Cấu hình VPS

RoomQC là frontend tĩnh chạy Nginx; Postgres/Auth/Storage/Realtime/Functions
nên đặt trong Supabase project quản lý. Xem [docs/deploy-vps.md](docs/deploy-vps.md)
để tạo `.env.vps`, push migrations, deploy Edge Functions và cấu hình reverse
proxy HTTPS.

```bash
cp .env.vps.example .env.vps
# điền URL HTTPS, project ref và publishable key thật
docker compose --env-file .env.vps -f docker-compose.roomqc.yml up -d --build
ROOMQC_BASE_URL=http://127.0.0.1:8082 npm run verify:container
```

Không đưa `service_role`/secret key vào frontend hoặc `.env.vps`.

## Tài liệu vận hành

- [Báo cáo kiểm thử](TEST_REPORT.md)
- [Phân tích hệ thống](SYSTEM_ANALYSIS.md)
- [Rebuild database](docs/database-rebuild.md)
- [Triển khai VPS](docs/deploy-vps.md)
