# A2 — kiểm chứng PostgreSQL độc lập trước tích hợp local

Ngày 17/10/2026. Tiếp nối báo cáo first slice
[A2 source](a2-cases-parallel-2026-10-17.md).

## Kết quả

**73 kiểm tra PostgreSQL độc lập đạt**, bao gồm race/retry thật qua nhiều
connection. Không phát hiện lỗi trong migration A2 ở phạm vi đã chạy.
Migration `20261017145741_subscription_reconciliation_cases_foundation.sql`
**chỉ áp trong database thử độc lập**, không áp vào database `postgres` chính.

Lệnh tái chạy:

```powershell
node scripts/test-subscription-reconciliation-cases-db-isolated.mjs
```

Không cần `.env`, API key, mật khẩu trong script hoặc cài dependency mới.
Cần Docker CLI và container local đã chạy
`supabase_db_ehjtoajnlnuvuiwkpmbp`, tài khoản PostgreSQL local qua socket.
Script không start/reset/stop container và không sửa role toàn instance.

## Phương pháp / ranh giới cô lập

1. Đọc cấu hình project ID và allowlist chính xác local stack.
2. Đọc **schema-only pre-data** của đúng bảy dependency table bằng pg_dump:
   `auth.users/sessions`, `public.users/user_roles/tenants/invoices/payment_transactions`.
   Không sao chép hàng dữ liệu, mật khẩu, token, vault hay settings khách.
3. Đọc enum dependency và các primary/unique constraints từ catalog. Tạo các
   định nghĩa cột/default/check chính xác và khóa p/u của các table trên.
   Đọc nguyên định nghĩa thực tế của `auth.uid`, `auth.jwt`, hai overload
   `is_super_admin`, `platform_support_actor`; không stub logic quyền của A2.
4. Tạo database mới duy nhất `roomqc_a2_verify_<random UUID hex>` từ template0.
   Không clone trigger/FK/RLS app nghiệp vụ hay function cron/provider/network.
   Do đó đây là **focused dependency-schema integration**, không phải full-stack
   clone. `public` ACL từ template0 và ACL helper liên quan được thiết lập theo
   hợp đồng RPC; private case grants/RLS/trigger là migration A2 thật.
5. Áp A2 chỉ ở database mới, tạo fixture SQL riêng. Claims/session là dữ liệu
   mô phỏng đường request PostgREST: `SET LOCAL ROLE` và
   `request.jwt.claims`, có hàng auth.sessions thật trong DB thử. Không đăng ký
   hoặc đăng nhập qua GoTrue HTTP, không gửi email và không cần API secrets.
6. Mọi query nguồn chính chạy `BEGIN READ ONLY`. Ngoại lệ DDL duy nhất trên
   main connection là CREATE/DROP đúng database thử được script tạo và đã
   kiểm tra chưa tồn tại. Không sửa schema/data main, không ghi migration history.
7. `finally` xóa đúng tên database sinh mới, không FORCE, không terminate session
   khác; xác minh database không còn. Tất cả lần chạy gồm các lần sửa harness
   đã dọn database thử và kiểm tra vắng mặt.

## Ma trận đã đạt

| Phạm vi | Bằng chứng thực thi PostgreSQL |
|---|---|
| Migration | Tạo được tables/indexes/functions/triggers với `check_function_bodies=true` |
| Quyền gọi | Anonymous/service role không actor, owner, staff bị từ chối read/write |
| Live admin | Đọc capability nguồn server đúng tenant và tạo hồ sơ |
| Exact retry | 20 connection cùng actor/request trả một receipt; một case/create event |
| ID conflict | Cùng request ID khác note bị PT409 |
| Create race | Hai admin khác nhau tạo cùng nguồn: một created:true, một created:false, một event |
| Lost response | Ghi note đã commit, retry exact ID/old version trả receipt, không thêm event |
| Note race | Hai admin cùng expected version: một thành công, một PT409; không mất audit |
| Snapshot | Không copy invoice ID/trạng thái khác tenant, raw metadata hoặc nội dung hóa đơn khác |
| Source eligibility | Nguồn failed capability false và create bị từ chối |
| History | 58 event qua trang 50 + 8; cursor đúng, không thiếu/trùng version |
| Direct DML | Admin/owner SELECT/UPDATE/DELETE/TRUNCATE private tables bị chặn |
| Direct INSERT | anon/authenticated/service_role đều không có INSERT grants vào ba table |
| Immutable history | UPDATE/DELETE/TRUNCATE event/receipt bị trigger chặn kể cả privileged query |
| Revocation | Lock/inactive/bỏ role/ban/chưa confirm/hết not_after/xóa session: read và replay receipt cũ bị chặn |
| Financial invariant | So sánh toàn bộ cột tất cả tenant/invoice/payment trước/sau toàn bộ case commands không đổi |
| Deleted source | Case/audit giữ nguyên và vẫn tra được theo payment ID, capability create false |
| Changed tenant | Nguồn đổi tenant: read và note mới đều PT409 |
| RLS | Ba private case tables đều bật RLS |

`node --check`, scoped ESLint và `git diff --check` cũng đạt.

## Không được suy rộng kết quả

- Chưa chạy Auth HTTP/JWT ký thật/PostgREST schema cache/browser A2.
- Không clone đầy đủ FK/trigger/RLS/business integrations của ứng dụng; không
  dùng kết quả này thay security advisor/DB lint trên deployment đầy đủ.
- Không áp migration chính, không build/deploy, không provider/settlement,
  không scheduler/job runtime. Root quyết định tích hợp và apply additive sau
  review, rồi cần kiểm tra grants/schema-cache/Auth/browser trong local thật.
- Chưa nghiệm thu cả A2; assignment/conclusion/reopen, case-list point of entry,
  snapshot diagnostic flags, pending recovery qua reload/unmount vẫn còn như
  báo cáo source. Các giới hạn đó không được che bằng số check đã đạt.

## Ghi nhận sửa harness (không phải lỗi sản phẩm)

Các lần đầu dừng ở cloning/output assertions: tên constraint cần schema-qualified
vì pg_dump đặt search_path rỗng; pg_get_functiondef cần dấu kết thúc; psql output
phải dùng quiet thay vì lọc dòng `BEGIN` vì có trong body function; RLS catalog
assertion phải loại index (`relkind='r'`). Đã sửa và chạy lại toàn bộ; không đổi
migration A2. Mỗi DB test từ các lần dừng đều được cleanup xác minh.
