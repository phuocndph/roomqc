# RoomQC — giao diện tài chính và xuất báo cáo, local 27/10/2026

Phạm vi mục tiêu: **toàn bộ VPS do RoomQC quản lý + signup tự động**.
Đợt này xử lý thêm một lát Q02/T01,T03,T04,T08; không đóng toàn Q02.

## Thay đổi đã hoàn thành trong cây tích hợp

- useFinancialReport chuyển từ get_financial_report có tenant do client gửi sang
  get_financial_report_scoped. Ngày lịch và múi giờ được truyền rõ; không dùng
  toISOString để cắt ngày. Request hủy được, cache tách actor/session/tenant/
  runtime/profile/hotel/kỳ; kết quả cũ bị bỏ khi scope đổi, kể cả đổi đi rồi về.
- Thêm typed RPC cho financial scoped và export_revenue_report; kiểm DTO version2
  và kỳ/múi giờ, không thay lỗi server/permission bằng báo cáo 0.
- Financial desktop và mobile dùng cost/revenue/profit/fixed-cost DTO từ server.
  Doanh thu ghi nhận gồm phí no-show, số tiền đã thanh toán của lượt trả phòng
  vẫn khác dòng tiền. Chi phí cố định là ước tính phân bổ theo ngày lịch trong
  từng tháng; không lấy nguyên tháng bắt đầu cho cả khoảng chọn.
- Financial export lấy lại DTO với p_for_export=true; revenue export dùng
  export_revenue_report. Payload đã tải chỉ cung cấp kỳ cho revenue export,
  không cung cấp số liệu file. Cả hai lấy lại quyền/dữ liệu trước dựng và trước
  lưu. Cache quyền frontend chỉ giúp hiển thị nút, không ký thay quyền server.
- Excel đợi tạo buffer rồi mới chạy beforeSave. PDF cũng kiểm trước doc.save.
  Đổi phiên/hotel/runtime/kỳ, unmount hoặc server từ chối thì không lưu và không
  báo thành công. Không hứa ngăn sao chép dữ liệu người dùng đã được phép xem.
- Generic exporter nhận thêm nguồn async và trả boolean hoàn tất, khóa click
  trùng; các caller hai tham số/payload cũ còn hoạt động. Nhãn footer PDF là
  RoomQC. Các export generic khác chưa được tự động coi là đã có server gate.
- Bỏ toast thành công sớm của mobile; refresh lỗi báo lỗi. Xu hướng mobile dùng
  đúng monthly_trend trong kỳ, không đọc thêm useMonthlyExpenses(12). Nút xuất
  có đường click tại tab financial/revenue trong hub và revenue mobile.
  Hai trang responsive không chạy query desktop khi chỉ hiển thị mobile.

## Kết quả kiểm chứng

Source **944 file**, SHA **38602811857cc282fd4e61cf219ecdf435d8240348bb5bd4ce5c1761c32a27ac**.

| Kiểm tra | Actual | Phạm vi |
|---|---|---|
| Vitest | 195/195, 13 file; 0 fail/pending | Hook/component với mocks, gồm 38 kiểm tra mới |
| TypeScript app | exit0 | Không đồng nghĩa production build/browser |
| Lint | 19 file, 0 lỗi / 14 cảnh báo | Cảnh báo được giữ trong evidence, chưa tuyên bố hết nợ lint |
| Source trước–sau | khớp | Cùng source cho ba bước trên |
| Backend runtime | 183 file giữ nguyên930 | Không chạy lại native suites hoặc full control |
| Migration | 568 business + 12 directory, hash khớp930 | Không thêm/sửa migration trong lát frontend |
| Primary implementation/index, ledger và worksheet | giữ nguyên | Chỉ mirror docs/artifact đã làm sạch |

Các kiểm tra mới bao gồm 12 financial query, 17 export authority, 3 workbook
beforeSave và 6 desktop/mobile consumer. Kiểm tra concurrency UI dùng render đã
commit, kể cả A→B→A; không coi hai cập nhật state chưa render là hai scope thực.
Mocks PDF/XLSX chỉ chứng minh đường gọi và chặn save, **chưa mở file để kiểm
font/tiếng Việt, phân trang, layout hoặc công thức**. Chưa browser download/E2E,
Android, chạy trên backend thật qua UI hoặc deploy.

[Backend930](roomqc-financial-scope-export-local-2026-10-27.md) đã ghi riêng
75/75 Auth/REST,5race khóa thật, writer536/536, nguồn phòng77/77 và control440/440.
Các số này thuộc source930; đợt944 chỉ đối chiếu runtime/migration giữ nguyên,
không ghi chúng thành run mới cùng SHA944. Giữ nguyên baseline đỏ và lịch sử.

## Điểm nhận tiếp, không giao lại lát vừa hoàn tất

| Việc | Thực hiện cụ thể | Điều kiện nhận |
|---|---|---|
| F2 — insights và financial consumers còn lại | Inventory useOverviewKpiStrip, OwnerProfitOverview, useOperationsInsights và mọi useMonthlyExpenses/get_monthly_expenses caller. Tách financial headline khỏi room-only ADR/RevPAR; kiểm kỳ, status checked_out, lỗi, cap và cache identity. Inventory RPC thực tế trước khi kết luận có bypass | So sánh desktop/mobile/dashboard cùng scope; số no-show không vào room numerator; lỗi/permission không thành lợi nhuận 0; native proof nếu sửa API |
| F3 — export generic còn lại | Inventory inventory/maintenance/rooms/cash-flow/room-revenue/operations/stock-audit caller; xác định dữ liệu và quyền server thực, không kế thừa gate financial | Mỗi report có server authority tương ứng hoặc limitation ghi rõ; test initial/final denial và scope change theo caller |
| F4 — upgrade có dữ liệu | Tạo diagnostic mới cho566→567→568; seed lịch sử thật trong fixture, fault từng bước, đối chiếu số dư/receipt/permission/index; giữ diagnostic564→566 nguyên vẹn | Fresh replay568 không thay populated upgrade; fault rollback và API compatibility có actual. Binary rollback cần proof riêng |
| F5 — Q02 còn lại | Cancel/refund, trả trước ngoài cọc, group/staged quote/payment, flagged transfer/correction/retention; RW6timer/cron→RW7safe/service→RW8full-check/reopen | Graph writer đủ scope/idempotency/không ghi muộn và regression phù hợp |
| Toàn roadmap | Q03 workflow/dispatcher/recipient/offboarding/quyền gián tiếp/advisors; Q04 freeze/default-full/rebuild, rồi alerts→admission/budget→signup/jobs/abuse→hai console→Linux/TLS/offsite restore/on-call→A/B/E2E/load/RC→pilot≥7ngày | Nhận đúng T01–T25, dependency, 70 ca và các gate L/S/P/U/B; không cộng unit tests thành ca nghiệm thu |

VPS/DNS/provider/email thực và DB đang phục vụ không bị thay đổi. Các mục cần
mã khóa/cấp quyền tiếp tục gom cho đợt tích hợp thật; không chặn việc local độc
lập. 70 ca vẫn not_run, 122 release entries unverified, reviewer/signoff/gates
giữ nguyên. Toàn mục tiêu còn đang thực hiện.
