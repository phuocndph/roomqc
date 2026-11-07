# A3 — Màn giám sát tác vụ thuê bao (17/10/2026)

Nhánh `codex/roomqc-a3-job-monitor`, baseline `c1d67f3`. Frontend chỉ đọc;
phụ thuộc RPC `admin_subscription_job_monitor()` của nhánh DB tương ứng.

## Đã triển khai

- Panel tối giản trên trang tổng quan super-admin; chỉ có **Tải lại giám sát**.
  Không có nút chạy, retry tác vụ, sửa lịch, đổi trạng thái tenant hay ghi DB.
- Hiển thị riêng lần thành công gần nhất, lượt đang chạy, lỗi/gián đoạn gần
  nhất và tối đa 25 lượt trong lịch sử thu gọn. Busy/interrupted không phải
  thành công. Không có last success hiện rõ chưa ghi nhận, không hiện số 0.
- Luôn ghi “Chưa xác minh lịch chạy” cho scheduler `not_observed`; lịch sử
  thành công không phải bằng chứng cron đang hoạt động.
- Backlog có thời điểm đo và định nghĩa **điều kiện cũ**, phân biệt eligible
  grace/suspend với active hết hạn chưa được bao phủ. Không gọi đây là toàn
  bộ backlog hoặc kết quả của job gần nhất.
- Tổng kết chỉ trình bày số đã xác nhận. Cờ unknown/recovery có cảnh báo chưa
  đầy đủ; staff `not_run` hiện “chưa chạy”, không giả thành lỗi hoặc thành công.
  Interrupted ghi “Cần kiểm tra thủ công, không tự chạy lại”. Không lộ nội
  dung mã lỗi/raw error từ server; chỉ đếm số mã lỗi để hướng tới log vận hành.
- Validate DTO bằng Zod: job/scope/scheduler/definition cố định, ISO time,
  UUID, count nguyên an toàn không âm, tối đa 25 lượt, ID không trùng,
  active/failure đúng loại, thời điểm không nghịch, success không mâu thuẫn
  với failed/not_run/unknown/recovery/notification failures.
- Phân biệt thiếu schema, thiếu quyền/phiên và kết nối/server. Lỗi không trở
  thành empty success hoặc số 0. Mọi lỗi revalidation đều ẩn cache bảo vệ và
  báo rõ dữ liệu cũ không dùng để kết luận hiện tại. Logout cũng ẩn dữ liệu,
  query cache GC ngay khi không còn observer. Không dùng token làm query key.
- Tự đọc lại 60 giây khi panel đang mount/hoạt động; không poll background.
  Request có AbortSignal; retry tự động tắt. Server vẫn chịu trách nhiệm
  live-session/admin authorization, UI không thay thế quyền DB.

## Kiểm chứng / giới hạn

- `npm ci --ignore-scripts --no-audit --no-fund` trong worktree riêng, không
  đổi package/lock/env hoặc copy khóa.
- Vitest focused **2 file, 23 test đạt**: DTO, no-history, active/busy/
  interrupted, partial summary, staff not_run, backlog hiện tại, lỗi thiếu
  schema/access/network, ẩn stale evidence, tải lại chỉ RPC read, logout/GC,
  timer 60s dừng sau unmount. Không có React DOM nesting warnings ở lượt cuối.
- ESLint source/test/page scope: đạt không lỗi/cảnh báo. `git diff --check` đạt.
- TypeScript ứng dụng `tsc --noEmit -p tsconfig.app.json`: đạt.
- Đã đọc skill Supabase, changelog và tài liệu Functions/Sessions hiện hành.
  Test client dùng mock RPC theo contract, **không chạy query main DB**.
  Ghép nhánh DB, integration RPC thực và full regression do root thực hiện.
- Chưa browser E2E/ảnh UI thực, screen reader thật, build/deploy, load test,
  cron runtime hoặc quyền VPS. Không suy ra capacity/schedule từ unit tests.
- Không sửa layout/router/App, migration/runtime/worker, dữ liệu DB, provider,
  gói phụ thuộc, chính sách grace hoặc workflow recovery/outbox.
