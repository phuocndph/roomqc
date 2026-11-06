# RoomQC — nguồn chi phí và so sánh tài chính trên dashboard

Ngày 27/10/2026; Q02/F2, T03/T04/T08. Bản tích hợp có thêm thay đổi frontend;
không cập nhật implementation primary hoặc runtime đang phục vụ người dùng.

## 1. Những hành vi đã sửa

| Điểm sử dụng | Trước sửa | Hành vi mới |
|---|---|---|
| FinancialOverview và MobileOwnerDashboard | Đổi khoảng ngày chọn thành số tháng 30 ngày gần đúng rồi lấy các tháng cuối hiện tại | Đọc FinancialReport scoped theo chính ngày bắt đầu/kết thúc đã chọn; dùng cost_summary trực tiếp, không cộng lại tháng hoặc giả 0 khi lỗi |
| Biểu đồ ExpenseChart qua useMonthlyExpenses | Legacy tenant-param RPC, nhãn tháng thiếu năm, cache chưa gắn phiên | Financial scoped RPC cho 1–120 tháng lịch, giữ MM/YYYY; kiểm số tháng, DTO, abort và identity/epoch. API lỗi không trở thành danh sách 0 |
| useLaborCost | Legacy tenant-param RPC, ngày bị cắt theo UTC và fallback payload thiếu thành 0 | Scoped RPC với calendar date/timezone, cache actor/session/tenant/runtime/hotel/kỳ, từ chối phản hồi muộn/unmount/abort. Kiểm phương pháp/metadata ước tính, khoảng ngày, timezone và các số aggregate |
| OwnerProfitOverview | Headline dùng paid, tăng trưởng/chart dùng revenue khác và hôm nay từ nguồn bookingStats riêng | Headline/tăng trưởng/so sánh/ngày hiện tại/chart cùng recognized revenue từ RevenueReport; ghi rõ không phải dòng tiền thực thu. Số lượt và giá trị gộp trả phòng có nhãn riêng |
| FinanceKpiStrip | Doanh thu previous tự suy ra theo custom length, chi phí previous lấy period.previous khác | Cả doanh thu/paid/nợ/chi phí/profit/margin dùng hai FinancialReport theo chính current/previous được chọn; phí no-show vẫn hiển thị cùng DTO |
| useOperationsInsights và advice | Thiếu labor/targets vẫn có thể dùng 0/empty; YoY failure bị bắt thành 0; cache chỉ khóa vài con số | Chờ đủ nguồn; source failure hiển thị lỗi và bỏ cached result; không giả YoY=0; key bao gồm scope và đầy đủ nguồn, capture từ chối kết quả muộn. Advice partition theo scope và nguồn đầy đủ |
| OperationsInsightsTab | Gọi chi phí ca × cấu hình lương là lương; suy ra tổng 0 nghĩa là chưa cấu hình | Ghi rõ ước tính từ ca theo ngày bắt đầu, chưa là payroll/tiền đã trả; 0 có thể do ca hoặc mức lương, không kết luận thay dữ liệu |

Inventory trên thẻ chi phí được ghi là **tồn kho hiện tại**, không ngụ ý giá trị
trong kỳ chọn. Thay đổi này không chứng minh inventory/bookingStats/pending
receivables trên toàn dashboard đã được audit hết.

## 2. Bằng chứng của candidate 960

Manifest có phạm vi 960 file, SHA
`e22d9a45ddf291135d661c9228033f174f6f96150f9069ac79df77d558fd1ab8`.
15 file trong tập thay đổi/kiểm lint; 10 code/type và 5 test mới.
569 business + 12 directory migrations và runtime 183 file giữ nguyên 952.

- Frontend: **247/247, 18 file**, TZ Asia/Ho_Chi_Minh. Giữ đủ 195 ca ở 13
  file của 944; thêm 52 ca. Không cộng subsets thành acceptance case mới.
- UTC: **41/41, 3 file**, chạy lại monthly/labor/financial query để bắt lỗi
  local midnight bị chuyển lùi ngày. Đây là subset kiểm timezone, không phải
  thêm 41 kịch bản độc lập vào 247.
- TypeScript project app: exit 0. Lint 15 file: 0 lỗi, 14 cảnh báo.
- Có checks exact selected range, tháng qua năm, invalid month count,
  current/previous calendar mismatch, recognized headline/chart/growth,
  error khác 0, breakdown đổi nhưng total không đổi, identity A→B→A,
  unmount/abort và advice source/scope.
- Source/runtime/migration và protected primary/index/ledger/70 hàng giữ nguyên
  trong lần chạy cuối. Không deploy và không có fixture Docker mới ở đợt này.

Giữ hai lần thất bại làm lịch sử: lần đầu 237 ca chạy được đạt nhưng hai
component suites không nạp do test mock chưa cô lập client khởi tạo Supabase;
lần hai 246/247, một matcher không giữ NBSP trong số tiền. Sửa mocks và matcher,
không đổi env ứng dụng, cách tính tiền hoặc nới điều kiện sản phẩm để test đạt.

Chi tiết: [artifact bàn giao](../../../artifacts/roomqc-dashboard-cost-consumers-local-2026-10-27.json).
Backend monthly/labor/revenue/financial/export có 109/109 native ở
[952](roomqc-monthly-labor-scope-local-2026-10-27.md), không chạy lại native
ở 960 vì runtime/migrations không đổi. Writer/full/default-full/rebuild không
được chạy lại hoặc gán kết quả lịch sử cho candidate này.

## 3. Phần chưa khép và công việc kế tiếp

**F2 chưa hoàn tất.** Nhận aggregate server cho OverviewKpiStrip/OverviewChart
và OperationsInsights: bỏ cap 5.000/10.000 và implicit API row limits; thống nhất
checked_out/non-refunded, ngày/múi giờ, room-nights theo kỳ, purchase/laundry/
maintenance/no-show theo cùng recognition contract; sửa YoY hiện còn gross
được gọi là net. Overview headline/profit còn phải đổi sang recognized revenue,
ADR/RevPAR giữ room-only. Lỗi YoY nay không bị che nhưng phép tính YoY chưa sửa.

Phải có native dataset vượt cap, quyền assigned-only/all-hotels/tenant/live
session, denial không effects và lock races; rồi nối hook/UI và kiểm so sánh
cùng khoảng ngày. Target reader/cache và quyền mutation, advice server/provider,
mobile tiền hôm nay/công nợ/dự kiến và các consumer còn lại cần inventory riêng;
scope/cache client trong bản này không thay kiểm quyền server.

Sau F2: F3 generic exports còn lại → populated upgrade 566→567→568→569 và
candidate cuối → cancel/refund/prepayment/group/staged quote/payment/transfer/
correction/retention, RW6–RW8 → Q03 → Q04 → T07 và toàn bộ tám đợt VPS/signup.
Browser/Android, download/render file, E2E, VPS/TLS/offsite restore/tải/pilot chưa
được chứng minh ở đây. Advisors 725 thuộc workload native 952 chưa disposition;
không chạy advisor mới ở 960.

Chỉ mirror sanitized docs/artifact sang primary. 70 ca not_run, 122 release
entries unverified và reviewers/signoff/gates giữ nguyên. Toàn mục tiêu còn mở.
