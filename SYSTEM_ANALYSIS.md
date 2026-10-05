# Phân tích hệ thống RoomQC

## Trạng thái hiện tại

RoomQC là ứng dụng React/Vite dùng Supabase cho Auth, Postgres, Storage,
Realtime và Edge Functions. Môi trường local hiện chạy tách biệt ở cổng
`8082`; cổng `8080` dành cho CRM-JolieFam và `8081` dành cho Hotel Data Engine.

### Kết quả xác minh ngày 2026-09-20

- 211/211 test pass khi bật RPC integration (195 unit/route + 16 RPC).
- TypeScript/Vite build và `verify:build` pass.
- `npm audit --omit=dev --audit-level=high`: 0 lỗ hổng.
- ESLint: 0 error; còn 1.505 warning, tất cả là `@typescript-eslint/no-explicit-any`,
  không bị che bằng cấu hình tắt rule.
- RoomQC container `healthy`; `/healthz` trả `200`.
- GoTrue/Auth health trả `200`; lỗi credentials sai trả lỗi Auth chuẩn thay vì
  lỗi kết nối.
- 491 migration trong source đã có đủ 491 bản ghi trong
  `supabase_migrations.schema_migrations` của local DB.
- DB lint ứng dụng (`npm run db:lint`) pass trên `public` và `private`; các
  helper vendor của `pgtap` trong schema `extensions` được loại khỏi phạm vi
  lint vì CLI báo false positive trên các hàm test nội bộ.
- DB security advisors sạch; `auth_rls_initplan` và foreign key chưa index đều
  đã về 0. Còn 177 cảnh báo multiple permissive policies và 394 thông tin
  unused index cần đánh giá theo workload production.

## Database và dữ liệu

Database local đang ở trạng thái sạch để kiểm thử schema:

| Đối tượng | Số lượng |
| --- | ---: |
| System tenant | 1 |
| Hotel | 0 |
| User profile | 0 |
| Item category | 0 |
| Item | 0 |
| Room | 0 |

Việc chưa có hotel/item/room là chủ ý, không phải migration lỗi. Dữ liệu demo
chỉ được tạo khi người vận hành xác nhận và đã backup. Dữ liệu Auth, Storage và
lịch sử nghiệp vụ không nằm trong migration schema; muốn khôi phục phải có quy
trình backup/restore riêng.

## Các lớp bảo vệ đã hoàn tất

### Auth/runtime

- Initial session check có đường thoát khi Auth API timeout/outage.
- Frontend chỉ nhận publishable/anon key; service-role/secret key bị từ chối.
- VPS build bắt buộc Supabase URL HTTPS public và tắt demo data.
- Login route chỉ redirect sau khi `loading=false`, tránh redirect sớm hoặc
  spinner vô hạn.

### Database/RPC

- RPC public giữ chữ ký tương thích với frontend, phần implementation nhạy cảm
  nằm trong schema private.
- Wrapper kiểm tra tenant, hotel và actor trước khi parse payload hoặc ghi dữ
  liệu.
- Quyền execute cho anonymous/public đã được thu hẹp; RLS và policy tenant vẫn
  là lớp kiểm soát chính.
- Quote checkout đơn/nhóm được lưu bằng RPC trước khi tạo payment; payment
  settlement và group checkout đều atomic, dùng cùng tolerance theo tenant.
- Migration cleanup legacy đã chạy và migration history local đã được đồng bộ
  sau khi xử lý lệch trạng thái.

### Seed data

- Kiểm tra cờ `VITE_ENABLE_DEMO_DATA` và các ID bắt buộc.
- Category có sẵn được reuse thay vì insert trùng.
- Lỗi Supabase được gắn tên bước để hiển thị thông báo có thể xử lý.

## Điểm cần theo dõi

1. **Lint technical debt:** còn 1.505 warning, tất cả là `no-explicit-any`.
   Không ảnh hưởng build/test hiện tại, nhưng nên xử lý theo module.
2. **Bundle size:** vendor chunk khoảng 14 MB do cấu hình gom dependency nhằm
   tránh TDZ/circular import. Cần benchmark và tách chunk có kiểm soát trước
   khi tối ưu production; không nên đổi `manualChunks` hàng loạt mà chưa smoke
   test login và các route lazy.
3. **VPS smoke test:** local đã xác minh, nhưng domain/HTTPS, SMTP, Storage,
   Edge Function secrets và reverse proxy thật vẫn cần kiểm tra sau khi cung cấp
   credentials production.
4. **Backup/restore:** trước khi rebuild hoặc seed production phải có dump
   Postgres, kế hoạch Auth users và Storage objects; không dùng `db reset` trên
   project linked.
5. **Database advisor warnings:** chỉ còn policy permissive trùng vai trò và
   unused index. Không gộp/xóa hàng loạt trước khi đo workload production để
   tránh thay đổi quyền hoặc làm rộng phạm vi migration.

## Quy trình kiểm thử chuẩn

```text
validate env
  -> unit/route tests
  -> RPC integration tests (explicit env)
  -> production build + verify-build
  -> Docker health + Auth health
  -> smoke test browser trên /auth/login và một route protected
```

Lệnh RPC integration dùng `npm run test:integration`; runner tự dùng system
tenant nil UUID khi URL là Supabase local, còn remote/VPS vẫn yêu cầu
`SUPABASE_TEST_URL`, publishable key và tenant UUID rõ ràng.

## Quyết định triển khai

- **Local:** đã sẵn sàng sử dụng ở `http://127.0.0.1:8082`.
- **VPS:** dùng [docs/deploy-vps.md](docs/deploy-vps.md), `.env.vps` và
  `docker compose --env-file .env.vps -f docker-compose.roomqc.yml up -d --build`.
- **Production:** chỉ đánh dấu hoàn tất sau smoke test domain thật và xác nhận
  log Auth/Storage/Edge Functions không có lỗi.
