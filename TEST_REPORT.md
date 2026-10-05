# Báo cáo kiểm thử RoomQC

> Cập nhật: 2026-09-24. Báo cáo này phản ánh đúng trạng thái của source tree
> và Supabase local stack, không dùng các checklist cũ đã hoàn tất.

## Kết luận

RoomQC đã vượt qua toàn bộ kiểm tra blocking trên môi trường local. Database
local đã đồng bộ đủ 498 migration, Auth/API, Edge Functions và container đều
phản hồi bình thường. Vector/Logflare được tắt có chủ đích vì không cần cho
RoomQC local. Chưa thể gọi là đã xác nhận production/VPS cho đến khi thay credentials
thật và chạy smoke test trên domain VPS.

**Trạng thái:** ✅ Đã triển khai và xác nhận local; chưa triển khai VPS/production

## Browser E2E local (2026-09-24)

Đã chạy trên `http://127.0.0.1:8082` bằng đủ 7 tài khoản demo (finance,
housekeeping, inventory, maintenance, manager, operations, reception). Các tài
khoản demo local được tắt cờ `must_change_password` trong lúc test để không
đi qua bước đổi mật khẩu bắt buộc; không thay đổi VPS/production.

| Luồng | Kết quả |
| --- | --- |
| Login/logout 7 role demo | Pass; không có console error |
| Dashboard, housekeeping, rooms/my-tasks, inventory, maintenance, reports, chat | Pass theo quyền từng role |
| Inventory transaction route (`tab=operations&sub=transactions`) | Pass |
| Maintenance search + status tabs | Pass |
| Tạo maintenance request có mã đánh dấu E2E, đọc lại DB, cleanup | Pass; record và dữ liệu liên quan đã xóa |
| Browser console errors/warnings trong các route đã kiểm tra | Không ghi nhận lỗi ứng dụng |

### Kết quả E2E sau triển khai

- Đăng nhập/đăng xuất đủ 7 tài khoản demo: Pass; không ghi nhận console error.
- `reception`, `manager`, `operations`: `/bookings` mở đúng quyền.
- `finance`, `housekeeping`, `inventory`, `maintenance`: `/bookings` bị chặn.
- Các role không có quyền settings: `/settings/general` hiển thị Access Denied ổn định.
- Staff chỉ có quyền xem kho: đường nhập kho trực tiếp không có form và bị chặn bởi route guard.
- RLS booking: role không có `bookings.create` bị PostgreSQL từ chối; lễ tân insert được.
- Trigger front-desk: đổi department sang `front_desk` trong transaction tạo đủ 4 quyền booking; rollback sau kiểm tra.

**Đánh giá sau E2E local:** 96/100. Chức năng và phân quyền blocking đã ổn định;
4 điểm còn lại dành cho technical debt lint/performance và chưa có smoke test trên VPS.

## Ma trận kiểm tra

| Hạng mục | Kết quả |
| --- | --- |
| Unit + route tests (`npm test`) | 195 pass; 16 integration tách riêng để tránh phụ thuộc môi trường |
| RPC integration (`npm run test:integration`) | 16/16 pass |
| Tổng test khi có local Supabase | 211/211 pass |
| ESLint | 0 error; 1.540 warning, đều là `@typescript-eslint/no-explicit-any` |
| Dependency install (`npm ci`) | Pass không cần `--legacy-peer-deps`; `date-fns` khớp peer của `react-day-picker` |
| Production build | Pass |
| Build verification | Pass, 364 web assets |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerability |
| Environment validation | Pass cho local build |
| RoomQC container | `healthy`, `http://127.0.0.1:8082/healthz` trả `200` |
| Nginx cache policy | App shell, route fallback và `sw.js` trả `no-store`; hashed assets trả `public, max-age=31536000, immutable` |
| Nginx security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` và `Permissions-Policy` có trên health/app/assets |
| Supabase Auth health | GoTrue trả `200` |
| DB migration history | 498 file / 498 bản ghi, không còn migration unrecorded |
| DB lint (`npm run db:lint`) | Pass; `public` và `private` không có schema error |
| DB security advisors | `auth_rls_initplan` và mutable search path đã về 0 |
| DB advisors | 0 ERROR; 134 cảnh báo hiệu năng legacy (multiple permissive policies/unused index), 0 `room_bookings` initplan |
| Architecture snapshot | 138 bảng vật lý, 10 view, 369 app RPC, 343 RLS policy, 180 trigger |

## Các lỗi đã xử lý

### Authentication và khởi động

- `AuthContext` luôn thoát trạng thái loading khi Auth API tạm thời mất kết
  nối, tránh màn hình đăng nhập treo vô hạn.
- Runtime config kiểm tra URL/key trước khi tạo Supabase client và từ chối
  `service_role`/secret key trong frontend.
- Bộ nhớ runtime `supabase/.temp/` (chứa JWT local do Supabase CLI sinh) đã bị
  loại khỏi Git và Docker build context.
- Auth endpoint local đã được kiểm tra thực tế: request hợp lệ tới được GoTrue;
  credentials sai trả lỗi `400 invalid_credentials`, không phải lỗi mạng.

### Database và migration

- Các RPC hardened được tách khỏi schema public, có tenant/actor guard và
  quyền execute tối thiểu.
- Migration cleanup legacy đã chạy; lịch sử migration local được đồng bộ để
  `db push` không cố chạy lại các migration đã áp dụng.
- Integration guard kiểm tra các RPC critical, gồm quote staging và atomic
  group checkout, cùng các biến thể của `get_laundry_batches_filtered`; tất cả
  16 case pass.
- Checkout đơn/nhóm đã staging quote authoritative trước payment; settlement
  cash/QR dùng đường `pending -> settle` atomic và group payment rollback toàn
  bộ khi một booking lỗi.
- `sync-sepay-transactions` yêu cầu user active có quyền owner/super-admin,
  chỉ đọc payment theo tenant, hỗ trợ nhiều tài khoản ngân hàng, và claim
  payment ở trạng thái `pending` để chống xử lý trùng khi chạy đồng thời.
- Bổ sung migration `20260924083926_fix_front_desk_permissions.sql` cho ma trận
  booking và `20260924094647_optimize_room_booking_rls_auth_calls.sql` để cache
  `auth.uid()` trong RLS policy.

### Frontend ổn định dữ liệu

- Sửa dependency của `HotelContext` để đổi hotel không giữ danh sách cũ.
- Sửa đồng bộ category filter trên mobile mà không ghi đè thao tác lọc thủ
  công.
- Đổi các `useMemo` có side effect trong danh sách room thành `useEffect` và
  bổ sung dependency cần thiết.
- Realtime notification listener cập nhật đúng khi router thay đổi.
- Cả browser window và main content viewport tự cuộn về đầu mỗi lần chuyển
  route, tránh trang đích ngắn bị hiển thị như màn hình trắng do giữ lại scroll
  offset của trang trước.

### Seed/demo data

- Seed kiểm tra tenant/hotel/user và cờ môi trường trước khi chạy.
- Category đã tồn tại được tái sử dụng, tránh duplicate key.
- Local database hiện có bộ demo để kiểm thử (8 Auth users, 2 tenants, 1 hotel);
  không dùng dữ liệu này để triển khai production.

### Local Supabase runtime

- Edge Runtime đã khởi động ổn định và endpoint `create-user` trả lỗi nghiệp vụ
  `400` khi thiếu dữ liệu thay vì `503`.
- Vector/Logflare được loại khỏi lệnh khởi động local bằng
  `npm run supabase:start`; Docker Desktop không bật Docker API TCP nên hai
  container này trước đó bị restart loop.

## Cách chạy lại đầy đủ

Unit/route suite:

```powershell
npm test
```

RPC integration suite (local tự dùng system tenant nil UUID; remote thiếu biến
sẽ báo lỗi rõ ràng):

```powershell
$env:SUPABASE_TEST_URL="http://localhost:54321"
$env:SUPABASE_TEST_ANON_KEY="<publishable-or-anon-key>"
$env:SUPABASE_TEST_TENANT_ID="<tenant-uuid>"
npm run test:integration
```

Build và smoke test:

```powershell
npm run validate:env
npm run build
npm run verify:build
docker compose --env-file .env -f docker-compose.roomqc.yml ps
npm run verify:container
```

## Tồn đọng không blocking

- ESLint còn 1.540 warning, tất cả là `no-explicit-any`. Đây là technical debt
  cần tách thành các PR riêng; không được tắt rule để che lỗi.
- `auth_rls_initplan` và mutable search path đã được xử lý. Còn 134 cảnh báo
  multiple permissive policies và 480 thông tin unused index; cần đánh giá theo
  workload production trước khi gộp/xóa policy hoặc index.
- Production bundle vẫn có vendor chunk khoảng 14 MB vì cấu hình đang gom
  dependency để tránh lỗi TDZ/circular import đã gặp trước đó. Đây là việc tối
  ưu hiệu năng, không phải lỗi chức năng.
- Chưa chạy end-to-end trên VPS/domain thật; cần dùng `.env.vps`, Supabase
  project thật và reverse proxy HTTPS trước khi công bố production.
- Seed demo chưa chạy trên database sạch. Chỉ chạy sau khi đã backup và xác nhận
  muốn tạo dữ liệu mẫu.

## Triển khai VPS

Xem hướng dẫn đầy đủ tại [docs/deploy-vps.md](docs/deploy-vps.md). Luôn chạy
RoomQC ở cổng `8082`; `8080` dành cho CRM-JolieFam và `8081` dành cho Hotel
Data Engine.
