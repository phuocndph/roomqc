# A3 — Console quản trị, lát cắt song song ngày 17/10/2026

Nhánh `codex/roomqc-a3-admin-console`, tách từ baseline `d42427291fae73314a28c50ed1375bd08a467345`.
Đây là cải thiện frontend có phạm vi giới hạn, **không đóng toàn bộ A3**.

## Đã sửa

- Giữ đúng trạng thái server `trial`, `grace_period`, `suspended`, `cancelled`;
  không đổi khách dùng thử thành “Chưa đăng ký” chỉ vì chưa có phòng trả phí.
  Nhãn “Hết hạn” suy từ ngày chỉ áp dụng với trạng thái active, chỉ để trình bày,
  không cấp quyền hoặc thay đổi entitlement.
- Bộ lọc gói thực sự lọc theo ID gói đã tải; bỏ ba lựa chọn tier cố định không
  khớp dữ liệu. Bộ lọc active không còn bao gồm dòng đã hiển thị expired.
  “Sắp hết hạn” chỉ lấy active, không lấy suspended/cancelled/trial.
- Hiển thị/tìm kiếm/xuất email từ trường thật `tenants.email`, thay vì trường
  `primary_contact_email` không có trong schema hiện tại.
- Xuất Excel chỉ xuất kết quả lọc hiện tại; vô hiệu hóa khi lỗi/đang tải/rỗng.
  Thay bộ lọc sẽ bỏ lựa chọn hàng cũ. Không thay đổi workflow mutation hàng loạt.
- Lỗi query tenant, invoice hoặc activity được đưa lên trạng thái lỗi, không
  giả thành thành công với doanh thu 0. Bảng ẩn các dòng cache khi refetch lỗi,
  có “Thử lại”; không ghi số khách 0 như một kết quả hợp lệ khi lỗi.
- Ghi rõ phạm vi dữ liệu đã tải ở bộ lọc, tổng dòng và file xuất. Cột “Doanh thu
  trọn đời” đổi thành “Đã thu (đã tải)” kèm cảnh báo chưa đối soát: query cũ vẫn
  chịu giới hạn hàng Data API, không thể khẳng định là tổng toàn hệ thống.
- Menu mobile/tablet dùng Radix Sheet có focus trap, đóng bằng Escape, quay
  focus về nút mở, tên nút và tên dialog. Đóng menu sẽ không còn link offscreen
  trong accessibility tree. Có `aria-current` cho route đang chọn. Khi đổi sang
  desktop từ 1024px, menu thường xuất hiện và drawer cũ đóng, không tự mở lại
  khi quay về tablet.

## Kiểm chứng

- `npm ci --no-audit --no-fund` trong worktree riêng; không đổi package/lock.
- Vitest focused: **7 file / 34 test đạt**, gồm 28 test mới và 6 test
  TenantActions hiện có. Bao gồm helper trạng thái/lọc, hook lỗi cả ba query,
  bảng cache/error/retry, export đúng bộ lọc, drawer/Escape/focus và breakpoint
  thật 390/768/1023/1024px bằng jsdom.
- ESLint toàn bộ file source/test sửa: **0 lỗi / 0 cảnh báo**.
- TypeScript `tsc --noEmit -p tsconfig.app.json`: đạt trên bản cuối, kể cả
  các type bảng suy từ hook thay cho `any` cũ.
- `git diff --check`: đạt.
- Đã đối chiếu Supabase changelog và tài liệu joins/nesting hiện hành. Không
  đổi cú pháp query, schema/RLS/grants hay quyền auth. Test hook dùng mock, chưa
  chạy query với phiên admin thật trong worktree này.

## Chưa hoàn tất / giới hạn

- Chưa có phân trang/tìm kiếm/sort/count phía server cho danh sách cũ. Chưa
  sửa aggregation invoice/activity phía server; cảnh báo phạm vi không thay thế
  công việc này. Bộ lọc gói chỉ liệt kê gói xuất hiện trong dữ liệu đã tải.
- Chưa kiểm định số liệu TenantAnalytics/dashboard/biểu đồ nguồn cũ; tab đó
  ghi rõ không theo bộ lọc danh sách. Nút placeholder ở các trang quản trị khác
  không nằm trong lát cắt này.
- Chưa tối ưu bundle/vendor hoặc đo p95, dung lượng tải và số user đồng thời.
- Chưa browser E2E, chụp ảnh responsive, kiểm tra screen reader thiết bị thật,
  build/deploy hoặc full regression sau ghép; root integration thực hiện riêng.
- Không thay TenantBillingDialog, reconciliation, job, migration, App/router,
  file môi trường hoặc provider. Không DB mutation/reset, không Docker deploy,
  không copy khóa, không gửi email/SePay hoặc bật thanh toán thật.

Skill Supabase được dùng để giữ truy vấn và xử lý lỗi theo hợp đồng SDK;
không dùng UI thay thế kiểm soát quyền server.
