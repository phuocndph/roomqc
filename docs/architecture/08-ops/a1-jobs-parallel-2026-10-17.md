# A1 — bounded reliability slice, parallel worktree

Ngày: 17/10/2026. Nhánh `codex/roomqc-a1-jobs-monitoring`.
**Chưa hoàn tất A1, chưa triển khai runtime và chưa bật lịch.**

## Đã sửa trong mã nguồn

- `check-subscription-status` chỉ nhận POST; OPTIONS trả 204, method khác trả
  405/Allow, không chạy DB. Giữ `requireCronAuth` hiện có; anon key không hợp lệ.
- Lỗi chuyển grace/suspended, query owner thiếu/multiple/lỗi và insert thông
  báo đều được kiểm tra. Không còn đường báo `success: true` cho các lỗi này.
  Kết quả trả HTTP 500, mã lỗi an toàn; không trả/log thông báo SDK thô, tên
  tenant, email, token hay connection string.
- Kết quả `subscription` và `staff_presence` độc lập. Staff maintenance vẫn
  được giữ để không âm thầm bỏ hành vi cũ. Lỗi staff không ngăn chạy thuê bao;
  lỗi thuê bao đã được xử lý không ngăn chạy staff; lỗi bất kỳ không bị che bởi
  `success` chung. Đây là **cô lập**, chưa tách lịch/endpoint staff riêng.
- Giữ nguyên predicate grace/suspended và trạng thái gói, không tự đổi chính
  sách. Nội dung thông báo không khẳng định cứng “còn 7 ngày” khi không biết
  thời hạn thực tế; hướng người dùng xem thời hạn tại mục gói.
- Run ID, thời điểm đầu/cuối, tên job, phạm vi cluster và số lượng được trả/log.
  Run ID **chỉ ở request/log**, không phải durable run history hoặc bằng chứng
  lần thành công gần nhất. Không có monitor/backlog API trong đợt này.

## Hợp đồng lỗi / chạy lại

`to_grace_period` và `to_suspended` là số dòng đã xác nhận trả về từ UPDATE.
Nếu transport thất bại sau commit hoặc kết quả sai định dạng, số 0 **không chứng
minh không có thay đổi**: `transition_outcome_unknown: true` và
`recovery_required: true`. Khi đã biết có transition, HTTP có
`partial_work_committed: true` kể cả notification thất bại sau đó.

Mọi execution failure của lần chạy trả `retry_policy: manual_review_before_replay`.
**Không cấu hình tự động replay toàn job dựa trên HTTP 500.** Chưa có transaction
gộp lifecycle/notification hoặc outbox: tenant đã đổi trạng thái có thể không
được chọn lại khi rerun. Chưa có bảo đảm tự retry thông báo hoặc exactly-once.

Điều tra bằng run ID + mã lỗi; chỉ đối chiếu các tenant được phép trong môi
trường thử riêng. Không chạy global sweep để “kiểm tra nhanh”, không chỉnh
gói/insert lại notification hàng loạt. Cần outbox/audit transition bền vững
trước khi có quy trình phục hồi tự động an toàn.

## Kiểm chứng trong worktree, không dùng secrets

- `npm ci --no-audit --no-fund`: đạt, không đổi package/lock. Có các cảnh báo
  deprecation từ dependency hiện có; không xử lý dependency chung trong scope.
- `npx vitest run src/lib/subscription-job.test.ts src/lib/subscription-expiry.test.ts`:
  **47/47 đạt** (34 test mới + 13 expiry hiện có). Ports dùng fixture/mock;
  đây không phải tích hợp DB, chạy cron thật hoặc browser E2E.
- `npx eslint supabase/functions/_shared/subscription-job.ts supabase/functions/check-subscription-status/index.ts src/lib/subscription-job.test.ts`:
  đạt, không warning.
- `npx tsc -p tsconfig.app.json --noEmit`: đạt.
  App typecheck có kiểm tra shared module qua import test, không thay thế
  Deno check của Edge entrypoint.
- Deno không có trên PATH ở kiểm tra ban đầu; bổ sung kiểm chứng bằng
  `npx --yes deno@2.9.6 test --no-config --no-lock --deny-net --deny-env --deny-write --deny-run --deny-ffi supabase/functions/check-subscription-status/handler.deno-test.ts`:
  **8/8 đạt**, có typecheck Deno. Harness gọi actual `requireCronAuth` với
  `Deno.env.get` được thay tạm bằng dictionary fixture, không đọc env thật;
  handler, orchestration và Response chạy trên Deno, store/staff là mock.
  Không import entrypoint, SDK hoặc `Deno.serve`; không mở listener/fetch.
  Package runner có thể tải binary Deno nhưng test runtime bị deny network.
  Không chạy job global, DB/provider/email và không đổi lịch. Không cần dọn fixture DB.

Các test gồm: thành công/0 rows; transition lỗi/throw/response malformed;
owner thiếu/lỗi/throw; notification lỗi/throw và partial work; không retry mù;
staff lỗi độc lập; HTTP method/config/auth guards; thông tin nhạy cảm không lọt
vào result/log lỗi; timestamp nhất quán. Vitest stub auth boundary; Deno harness
bổ sung actual auth helper với credential fixture (noauth/wrong key/service key/
cron secret), method guard, thiếu config, authorized POST store mock và partial
notification failure. Không coi đây là DB integration hay Edge isolate deployed.

## Còn phải làm trước nghiệm thu A1

1. Durable run start/finish, kết quả interrupted/busy, phạm vi cluster/tenant
   fixture đúng và grants/RLS; không lấy request log làm last-success bền vững.
2. Transaction/audit cho transition; lock và kiểm tra lại để không ghi đè
   settlement/gia hạn vừa commit; outbox chống trùng/retry thông báo. Đây vẫn
   là rủi ro cũ của worker, không được coi đã sửa bởi error reporting.
3. Tách lịch staff nếu cần sau khi kiểm kê scheduler thực tế. Source có RPC
   nhưng không chứng minh có lịch staff riêng; chưa thay lịch trong đợt này.
4. Monitor/backlog có thời điểm đo, last-success đúng scope, busy không đánh
   dấu thành công; alert scheduler không chạy và timeout/interrupted.
5. Test DB scoped fixture cho lỗi sau commit, concurrent/retry/batch backlog;
   Deno runtime check và nghiệm thu deploy trong môi trường riêng. Không bật
   production schedule trước duyệt policy lifecycle và hoàn tất các bước này.

Đã đọc Supabase skill và đối chiếu changelog/docs error-handling hiện hành.
Thay đổi TLS hosted API sắp tới không được dùng để suy diễn về local runtime.
Không có schema/migration trong slice này nên không chạy DB advisors/history.
