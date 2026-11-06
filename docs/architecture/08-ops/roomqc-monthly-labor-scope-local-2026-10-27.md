# RoomQC — quyền đọc chi phí tháng và chi phí nhân sự

Ngày 27/10/2026. Phần việc Q02/F2 thuộc T03/T04/T08 trong kế hoạch toàn bộ
VPS + signup. Đây là bằng chứng backend local có phạm vi; chưa nghiệm thu
frontend, sản phẩm, VPS hoặc đăng ký public.

## 1. Lỗi được xác nhận và bản sửa

Baseline trước sửa chạy trên Auth/REST/PostgreSQL riêng: 76/79 kiểm tra đạt,
exit 1. Ba yêu cầu gọi `get_monthly_expenses` bằng tài khoản tenant khác,
khách sạn chưa được giao và service key đều nhận HTTP 200. Giữ nguyên kết quả
đỏ; không dùng bản chạy sau để viết lại lịch sử. Audit cũng tìm thấy
`get_labor_cost` cũ tin tenant/hotel do caller truyền vào.

Migration mới `20261027070034_monthly_and_labor_report_live_scope.sql`:

- API tháng cũ giữ dạng bảng và tên cột, nhưng dùng chung nguồn chi phí và kiểm
  phiên/quyền/khách sạn hiện thời của financial report. Chấp nhận 1–120 tháng;
  kỳ tương thích API cũ là các tháng lịch ở Asia/Ho_Chi_Minh.
- API nhân sự cũ được bảo vệ; thêm `get_labor_cost_scoped` để caller mới không
  truyền tenant. Chỉ cộng ca thuộc tenant và các khách sạn đang được giao;
  join nhân viên/vị trí cũng giới hạn tenant, không trả lương từng người.
- Public wrapper dùng invoker, search_path rỗng, không cho anon/service_role.
  Phần private cần quyền cao kiểm live actor/session và reports.view trước đọc,
  khóa cùng chuẩn tài chính và kiểm lại phiên trước trả kết quả.
- Nhân sự trả tổng theo bộ phận cùng `is_estimate=true` và phương pháp tính.
  Đây là ước tính thời lượng ca nhân mức lương cấu hình, nhận theo ngày bắt đầu
  ca trong múi giờ yêu cầu; chưa là bảng lương chốt, tiền đã trả hoặc phân bổ
  ca giao ngày. Không cấp quyền SELECT cột lương cho browser.

## 2. Kết quả kiểm chứng

| Mục | Kết quả thực tế |
|---|---|
| Candidate | 952 file trong manifest có phạm vi, SHA `139a23d3aefe6f19dc118e743609a081f22027fb83830377b4df3684a8662e44` |
| Schema/runtime | 569 migration nghiệp vụ + 12 directory; 183 file backend runtime |
| Native API | 109/109 đạt, exit 0; 7 race có khóa thật nằm trong số kiểm tra, không cộng thêm vào 109 |
| Run cuối | `3e6d9ca1871f`, 07:07:28–07:08:57 UTC ngày 27/10 |
| Phạm vi hồi quy | Revenue, financial, nguồn xuất, monthly và labor trong diagnostic này |
| Kiểm dữ liệu | Denial/read không đổi snapshot tiền/phiếu thu/lệnh/audit/chi phí/ca/lương |
| Ngày và biên | Kỳ đảo/không hợp lệ, ngày địa phương, microsecond, DST và exclusive end |
| Quyền | Tenant/hotel khác, chỉ hotel được giao, owner đúng tenant, revoked grant/session/assignment, anon/service key |
| Race | Thu hồi grant trực tiếp/vai trò phụ và hết phiên khi chờ lock; có 2 race mới cho monthly/labor |
| Bảo toàn | Source, runtime, migrations và schema trước/sau run không đổi; index/ledger/70 hàng nghiệm thu giữ nguyên |
| Cleanup | Fixture tự dọn; ba truy vấn độc lập theo exact ownership label cho container/volume/network đều còn 0 |

Artifact chi tiết: [kết quả được lọc](../../../artifacts/roomqc-monthly-labor-scope-local-2026-10-27.json).
Không đưa raw response, log riêng, mật khẩu, JWT hoặc DSN vào hồ sơ này.

## 3. Giới hạn và việc nhận tiếp

Chỉ fresh replay chain 569 trên fixture riêng; **chưa populated upgrade
566→567→568→569**, fault rollback từng migration mới hoặc binary rollback.
Không chạy lại writer, room-source, full-control, default-full hay independent
rebuild ở candidate 952. Proof các suite đó ở 930 và frontend 195/195 ở 944
giữ nguồn lịch sử tương ứng, không gán sang 952. Advisor findings vẫn cần
disposition theo đối tượng/workload; diagnostic exit 0 không tự xóa findings.

F2 chưa khép. Nhận theo thứ tự:

1. Nối monthly/labor consumers vào nguồn scoped; FinancialOverview và mobile
   phải đọc đúng ngày người dùng chọn, không thay bằng số tháng tròn gần đúng.
   Cache và response muộn bị ràng buộc actor/session/tenant/hotel/kỳ.
2. Đồng nhất headline/profit/growth/chart theo recognized financial DTO;
   ADR/RevPAR vẫn room-only. Chi phí nhân sự ghi rõ ước tính; API lỗi hoặc
   thiếu quyền phải hiển thị lỗi, không giả thành 0.
3. Thay aggregate insights còn cap 5.000/10.000 dòng bằng truy vấn server đúng
   phạm vi; sửa period/YoY, xử lý lỗi và kiểm dataset vượt cap. Chưa được đóng
   F2 chỉ từ hai API được bảo vệ trong báo cáo này.
4. Các generic export còn lại, upgrade có dữ liệu tới 569; rồi cancel/refund,
   prepayment/group/staged quote/payment, RW6–RW8 và các writer Q02 còn mở.
5. Q03 workflow/dispatcher/recipient/offboarding/indirect/advisors → Q04
   freeze/full/rebuild → T07 và đầy đủ các đợt VPS/signup.

Không sửa serving DB/CRM, implementation primary, VPS/DNS/provider hoặc gửi
email thật. 70 ca vẫn not_run; 122 release entries vẫn unverified;
reviewer/signoff/gates giữ nguyên. Toàn mục tiêu còn mở.
