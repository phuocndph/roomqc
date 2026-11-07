# A1 — durable run history và monitor, DB isolation

Ngày 17/10/2026. Worktree `a1-monitor`, nhánh
`codex/roomqc-a1-durable-history`, baseline `c1d67f3`.
Đây là SQL/API và kiểm thử độc lập, **không phải nghiệm thu A1 toàn phần**.

## Phạm vi bàn giao

Migration được tạo qua `supabase migration new` sau đọc `--help`:
`20261017155727_subscription_status_job_history.sql`.

- Bảng private `subscription_status_job_runs`: RLS bật, revoke toàn bộ quyền
  trực tiếp của PUBLIC/anon/authenticated/service_role; không policy browser.
  Chỉ lưu job cố định `check-subscription-status`, scope cố định `cluster`.
- Begin/finish RPC chỉ grant service_role, SECURITY DEFINER có search_path rỗng,
  dùng cùng advisory transaction lock và unique partial index active để một
  run được nhận. Fresh cạnh tranh ghi durable `busy`; cùng run ID không bao
  giờ acquire lại, kể cả terminal hoặc busy.
- Thời gian/deadline do server cấp, deadline cố định 15 phút. Quá hạn thành
  `interrupted` và tiếp tục chặn, **không auto takeover**. Timeout có thể là
  commit muộn, không đủ an toàn để cấp run tiếp theo.
- Finish trước deadline ghi success/failed và summary 9 trường whitelisted:
  status subscription/staff (`not_run` chỉ cho staff), 4 số nguyên không âm
  tối đa int32, 2 boolean, danh sách error code đã biết không trùng. Cấm extra
  keys, raw DB payload, token, PII hoặc error code tùy ý.
- Finish với `transition_outcome_unknown=true` ghi `interrupted` có summary và
  finished_at, tiếp tục chặn begin. Replay finish phải cùng JSONB summary mới
  trả recorded:true. Timeout interrupted chưa có summary không nhận late finish
  (`recorded:false`); không biến timeout thành last-success bằng phản hồi muộn.
- Monitor RPC authenticated kiểm live platform admin bằng helper A2 hiện có,
  bao gồm session, role, account status/lock, confirmed email và ban. Không
  grant service_role/anon. Không tạo quyền theo user_metadata.
- Monitor trả last full success, active/latest failure, 25 run gần nhất; project
  overdue running thành interrupted nhưng **không ghi** DB. `scheduler_status`
  luôn `not_observed`: lịch sử run không chứng minh cron đã được cài/bật.
- Backlog dùng đúng predicate worker legacy, có measured timestamp và nhãn
  `legacy_predicates_only`. `unhandled_expired_active` đếm active/trial đã hết
  hạn với grace null/quá hạn, không coi là full entitlement/backlog audit.

## Kiểm thử an toàn

`node scripts/test-subscription-job-history-db-isolated.mjs`: **67 kiểm tra đạt**.
`node --check` và `git diff --check`: đạt.

Harness chỉ tạo DB tên `roomqc_a1_verify_<UUID32hex>` từ template0. Đọc DDL
schema-only của 7 bảng phụ thuộc và các helper cần thiết từ RoomQC local;
không copy data, env, trigger vận hành, vault, cron hay provider config.
Mọi mutation/test nằm trong DB UUID. PostgreSQL chính chỉ bị CREATE/DROP chính
DB UUID đã xác thực; các truy vấn nguồn khác đặt transaction READ ONLY.
Kết thúc đã DROP chính DB phát sinh và query xác nhận không còn. Không FORCE
drop, không terminate session của ứng dụng hay reset Supabase.

Các kiểm tra bao gồm:

- Migration compile với dependency schema, 20 begin đồng thời → 1 running và
  19 durable busy; rebegin running/busy/failed không acquire lại.
- Finish success/failure/mixed staff failure; replay giống nhau không thêm run,
  khác summary trả conflict. Failed known-work cho phép run mới; failed unknown
  trở thành interrupted và chặn run mới, giữ summary an toàn.
- Deadline/late finish; read-only monitor không đổi stored running; interrupted
  và busy không đổi timestamp last_success (so sánh chính xác).
- Summary null/extra keys/null fields/số âm/lẻ/overflow/code lạ/trùng/trạng thái
  không nhất quán đều bị từ chối; invalid finish không làm mất blocker.
- SELECT/INSERT/UPDATE/DELETE/TRUNCATE trực tiếp bị chặn với cả 3 client roles.
  Begin/finish bị chặn anon/authenticated; monitor chặn anon/service/no actor,
  owner/staff và admin locked/revoked/role removed/unconfirmed/banned/inactive/
  session hết hạn.
- Bounded monitor 25 rows; không lộ tenant email/raw errors; backlog đúng 1
  eligible grace, 1 eligible suspend, 2 unhandled expired active ở fixture.
  Snapshot đầy đủ tenant/payment/invoice trong DB thử không đổi sau toàn bộ RPC.

Đã đối chiếu Supabase changelog/functions docs và skills Supabase/Postgres
(advisory lock, partial index, least privilege). CLI `db advisors --help` đã
xác minh. Catalog kiểm RLS và table privileges trong isolated DB đạt; **chưa
chạy hosted/full-stack advisors/DB lint/history repair** hoặc apply migration
trên PostgreSQL chính trong nhánh này. Root tích hợp phụ trách kiểm tra đó sau
khi duyệt SQL. Không ghi claim “advisor sạch” từ catalog check giới hạn.

## Giới hạn / bước tích hợp

Root cần ghép adapter Edge và UI monitor theo contract, chạy Deno/TypeScript/
browser/integration và áp migration theo quy trình local đã duyệt. Nhánh này
không sửa Edge runtime, UI, lịch production, package/lock hoặc dữ liệu khách.
Không có fixture Auth HTTP hay provider/email nào được tạo/gọi.

Admission control là **at-most-one start**, không atomic lifecycle transaction:
chưa giải quyết race settlement/renewal hoặc outbox notification. Failed known
notification không tự retry, không đảm bảo delivery exactly-once. Job chưa chạy
không có timestamp success; monitor không suy diễn scheduler từ đó.

Interrupted block không có release RPC/UI tự động trong slice này. Cần người
vận hành review commit/outcome và phê duyệt quy trình phục hồi riêng; không sửa
SQL production bằng mẫu mutation fixture của test để “giải phóng nhanh”. Timeout
15 phút là watchdog/admission deadline, không phải cancellation of running DB
work hoặc recovery guarantee. Vẫn phải hoàn tất outbox, alert, scheduler audit,
scope fixture và nghiệm thu runtime trước coi A1 xong/bật lịch.
