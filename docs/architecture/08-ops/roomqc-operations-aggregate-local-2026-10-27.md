# RoomQC — tổng hợp báo cáo vận hành tại server

Ngày 27/10/2026. Bàn giao có phạm vi Q02/F2, T03/T04/T08 trong kế hoạch **toàn bộ
VPS + signup**. Chưa nối giao diện, nghiệm thu toàn sản phẩm hoặc triển khai VPS.

## 1. Vấn đề và phần triển khai

Overview/insights hiện lấy tối đa 5.000/10.000 dòng rồi cộng ở client. Các đường
này còn sai kỳ trước, YoY cộng gross thay net, công suất đếm đêm ngoài kỳ,
chart thiếu mua sắm/no-show và dùng ngày giặt khác báo cáo tài chính. API mới
giải quyết nguồn tổng hợp; **caller cũ chưa được chuyển sang nguồn mới**.

Migration CLI tạo `20261027074647_operations_report_scoped_aggregates.sql`
thêm `get_operations_report_scoped` với hợp đồng sau:

- Không nhận tenant do caller chọn. Kiểm live actor/session, reports.view và
  hotel assignment cùng guard tài chính. Owner chỉ tenant của mình, all-hotels
  chỉ các khách sạn được giao. Public wrapper invoker/search_path rỗng;
  anon/service key bị chặn, helper tổng hợp private không cấp browser.
- Một DTO có current, explicit previous hoặc mặc định liền trước cùng số ngày,
  year_ago và daily đủ cả ngày không giao dịch. Giới hạn 3.661 ngày; kiểm ngày,
  timezone, kỳ trước và biên. YoY dịch hai đầu ngày lịch: 29/02 một ngày so với
  28/02 năm trước, không tạo khoảng rỗng.
- Recognized revenue = net của checked_out không refunded + phí giữ cọc theo
  ngày ledger no-show. Refund due khác tiền đã hoàn và cash movement. Purchase
  nhận theo transaction, laundry theo delivery, maintenance completed theo
  completed_at; cùng financial report. Profit chưa trừ labor/fixed budget.
- Daily group từng nguồn theo khoảng, không quét lại từng nguồn cho mỗi ngày;
  tổng daily khớp current. Ngày DATE của checkout không bị dịch timezone;
  timestamp nhận theo nửa khoảng ngày địa phương, kể cả microsecond/DST.
- ADR dùng đêm của cùng earned checkout cohort, tối thiểu một cho day-use hợp
  lệ. Công suất dùng unique room-days cắt trong kỳ, hợp nhất nhiều booking cùng
  phòng/ngày; ngày checkout không chiếm thêm đêm. checked_in/checked_out và
  sleep_out/skipper chiếm phòng; confirmed/no-show/refunded không tự thành
  doanh thu hoặc công suất. Ngày legacy sai được đếm ở
  `invalid_checkout_dates_count`, giữ tiền để đối soát, không bịa một đêm.
- Capacity là số phòng hiện được đăng ký; công suất từ ngày lưu trú đã ghi.
  **Cả hai là ước tính** khi đánh giá lịch sử, chưa tái dựng lifecycle phòng,
  chuyển phòng/OOS hay ngày ở thực tế từ event. DTO ghi phương pháp rõ.

## 2. Kết quả kiểm chứng

| Mục | Kết quả |
|---|---|
| Candidate | 961 file có phạm vi, SHA `974514cbaefa00ce3fc4d0affde5b16f2f723bb59ea97df38d65659eed41dd1f` |
| Schema/runtime | 570 business + 12 directory migrations; 183 file backend runtime |
| Native Auth/REST/PostgreSQL | **153/153**, exit 0; giữ đủ 109 kiểm tra trước, thêm 44 |
| Race | 9 race khóa thật nằm trong 153; operations thêm hết phiên khi chờ hotel lock và thu hồi grant trước reader lock |
| Dataset vượt cap | 10.021 lượt trả phòng; thêm 10.020 khoản bảo trì. Room net 300.200; no-show fees 100.000; recognized 400.200; cost 18.520; profit 381.680 |
| Phân biệt mẫu số | Cùng dataset: 10.064 checkout-cohort nights, 15 unique occupied room-days |
| Kỳ/ngày | Explicit previous khác độ dài, leap YoY, local midnight/microsecond, DST 25 giờ, DATE checkout, ngày zero, legacy sai |
| Quyền/effects | Foreign/unassigned hotel, owner/all-assigned, revoked grant/session/assignment, inactive/locked, anon/service; reads/denials giữ snapshot tiền/phiếu thu/lệnh/audit/chi phí/ca/lương |
| Bảo toàn | Source/runtime/migrations/schema trước-sau không đổi; primary implementation/index, hai ledger, 70 hàng nghiệm thu giữ nguyên |
| Run cuối | `e01c8840be78`, kết thúc 08:02:39 UTC ngày 27/10/2026 |
| Cleanup | 12 truy vấn độc lập exact ownership label cho container/volume/network của cả bốn run đều còn 0 |

Artifact: [bằng chứng đã lọc](../../../artifacts/roomqc-operations-aggregate-local-2026-10-27.json).
Không đưa raw log, ACL fixture, mật khẩu, JWT, env hoặc DSN vào hồ sơ.

Giữ lịch sử: run đầu exit 1 sau 121 kiểm tra đã đạt; fixture tạo hai booking
active trùng phòng, trigger overlap trả P0001. Chuyển confirmed sang phòng riêng,
giữ ràng buộc sản phẩm. Run kế đạt 151/151; thêm cờ occupied đạt 152/152; thêm
legacy sai ngày đạt 153/153. Không cộng các lượt xanh cũ vào tổng cuối.

## 3. Giới hạn và việc nhận tiếp

Đây là fresh replay 570 trên Docker riêng; **chưa populated upgrade
566→567→568→569→570**, fault rollback hoặc binary rollback delta mới. Không chạy
lại writer/room-source/full-control/default-full/rebuild/frontend ở961. Proof
frontend 247/247, UTC subset41/41 thuộc960, không gán sang961. Advisors còn cần
disposition. Dataset >10.000 dòng không chứng minh 10.000 user đồng thời.

Nhận theo [mục19.21](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1921-phiếu-nhận-sau-server-aggregate961):

1. Validator/query scoped cho DTO mới; identity/session/runtime/hotel/kỳ,
   abort/unmount/A→B→A, lỗi/denial khác0 và giữ explicit previous.
2. Overview recognized revenue/profit, RevPAR room-only, occupancy từ occupied
   days/capacity từng kỳ; chart cùng kỳ chọn, đủ nguồn/ngày, không giấu lỗi.
3. Insights bỏ raw caps/gross YoY; ADR và occupancy dùng mẫu số riêng, số ngày
   từng kỳ; P&L tách no-show, UI thể hiện estimate và legacy cần đối soát.
4. Target/cache/mutations, advice server, mobile cash/receivable, generic export;
   populated upgrade tới candidate cuối; writer Q02 → Q03 → Q04.
5. T07 cảnh báo → admission/budget → signup/status/jobs/abuse → hai console →
   Linux/TLS/offsite restore/on-call → A/B E2E/tải/RC → pilot ít nhất7ngày.

Không sửa serving DB/CRM, mirror implementation, deploy VPS/DNS/provider hoặc
gửi email thật. **70 ca not_run / 122 entries unverified**, reviewer/signoff/gates
giữ nguyên; toàn mục tiêu vẫn active.
