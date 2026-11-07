# RoomQC — overview và insights dùng nguồn vận hành tại server

Ngày 27/10/2026. Bàn giao có phạm vi Q02/F2, T03/T04/T08/T22 trong kế hoạch
**toàn bộ VPS + signup; đầu ra plan + nghiệm thu**. Code ở integration; bản
chính chỉ nhận tài liệu và artifact đã lọc. Chưa triển khai runtime đang phục vụ.

## 1. Hành vi đã sửa

- `operations-report.ts` kiểm version, ngày lịch/múi giờ, phương pháp, số hữu
  hạn, độ dài/ngày liên tục, tổng daily và các đẳng thức tiền của DTO.
  `useOperationsFinancialReport` gọi RPC scoped, giữ explicit previous,
  cache theo actor/session/runtime/hotel/kỳ, abort/epoch/unmount và che dữ
  liệu cached khi nguồn bị từ chối. Không gửi tenant do client chọn.
- Overview dùng một snapshot cho sáu KPI và chart. Doanh thu ghi nhận gồm
  checkout net và phí giữ cọc no-show; lợi nhuận ghi rõ trước lương/ngân sách
  cố định. Công nợ chỉ của lượt trả phòng. RevPAR dùng checkout net.
- Công suất dùng unique occupied room-days chia số phòng hiện có và số ngày
  của từng kỳ. So sánh công suất ghi **điểm %**, không gắn nhãn phần trăm tăng
  trưởng cho hiệu hai tỷ lệ. Capacity/công suất ghi ước tính; không tự dựng
  lại lịch sử chuyển phòng/phòng ngừng bán.
- Chart dùng ngày server đã zero-fill trong đúng kỳ chọn, có purchase/laundry/
  maintenance/no-show. Không tự fill quanh ngày hôm nay; lỗi nguồn có trạng
  thái riêng. Tổng chart lấy cùng DTO với KPI.
- Insights bỏ raw caps và gross YoY; current/previous/year_ago cùng DTO,
  ADR dùng checkout-cohort nights riêng với occupied days. P&L tách no-show,
  không trừ phụ thu thêm lần nữa; không gắn revenue growth vào thẻ GOP.
  Có legacy sai ngày thì giữ tiền để đối soát và không hiển thị ADR/CostPOR
  như số liệu đáng tin. Labor vẫn là ước tính; không thay bảng lương chốt.
- Target reader có identity cache, abort/epoch và kiểm metric/value.
  Overview chỉ hiển thị mục tiêu tháng hiện tại; insights chỉ áp mục tiêu
  khi kỳ bắt đầu ngày 1 và nằm trong cùng tháng. Authority/mutation phía
  server, advice và mobile cash/debt vẫn là công việc tiếp.
- Hook báo cáo kho `useOperationsReport.ts` được giữ nguyên nội dung chuẩn
  hóa LF. Hook tài chính dùng tên/cache prefix riêng; không chuyển các caller
  kho sang DTO tài chính.

## 2. Kiểm chứng có phạm vi

| Mục | Kết quả |
|---|---|
| Candidate | 979 file có phạm vi; SHA `3ff92cd34ce8c304b2263cb5913ba38d6176082e20bafa1e1d2b735a06c6ace4` |
| Schema/runtime | 570 business + 12 directory migrations; 183 file backend giữ nguyên961 |
| Frontend mocks | **330/330**, 25 file; exit0, không fail/pending |
| UTC subset | **76/76**, 5 file nằm trong tập330; không cộng thành406 ca độc lập |
| TypeScript | `tsconfig.app.json`, noEmit, exit0 |
| Lint | 24 file, 0 lỗi/44 cảnh báo `no-explicit-any`; chưa xóa hết cảnh báo |
| Hồi quy identity | Giữ234/247 tên test trước;13 ca insights nguồn cũ được thay16 ca theo DTO;96 identity được đưa thêm vào tập chạy, gồm9 test advisor có sẵn trước đó |
| Bảo toàn | Source trước/sau không đổi; backend binding/migrations, primary implementation/index, hai ledger và70 hàng worksheet không đổi |
| Native trước đó | 153/153 gồm9race thật thuộc backend961; không có native/full run mới979 |
| Run cuối | Kết thúc08:37:35UTC ngày27/10/2026; tất cả bốn bước exit0 |

Artifact: [bằng chứng đã lọc](../../../artifacts/roomqc-operations-consumers-local-2026-10-27.json).
Mô phỏng components/hooks không chứng minh browser render, file tải về, Android,
load hoặc end-to-end với runtime đang chạy.

Lịch sử giữ nguyên: candidate975 có325/326, TypeScript exit2. Test tìm tab bằng
role button và hook tài chính trùng tên hook kho; sửa role đúng semantic,
khôi phục nội dung hook kho từ bản có hash trước sửa và tách tên hook mới.
Candidate976 đạt326/326, UTC76/76, TS0; sau đó phát hiện đơn vị so sánh công suất
và bổ sung bản sửa/4 kiểm tra, tạo candidate979. Không xóa các lượt chưa đạt
hoặc cộng các lượt đạt cũ vào tổng cuối.

## 3. Việc nhận tiếp và giới hạn

Nhận [mục19.22](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1922-phiếu-nhận-sau-frontend-operations979):
target mutation/server authority; advice server/privacy/provider; mobile cash/
receivable/projected; generic exports; upgrade có dữ liệu566→567→568→569→570
và delta mới, rồi graph writer Q02→Q03→Q04. Không mở lại aggregate/caller đã có
proof nếu không có delta/failure mới; kết thúc các lát đúng điều kiện rồi chuyển
T07 và đủ tám đợt VPS/signup.

F3 generic export chưa được bảo vệ toàn bộ chỉ vì PDF insights đã sửa label ADR.
Còn kiểm mới quyền/nguồn trước dựng/lưu, click lặp, font/download/render.
Advisors721 của961 chưa disposition. Chưa populated upgrade570, writer/
room-source/full-control/default-full/rebuild979, browser/Android E2E hoặc deploy.
Không từ330tests suy ra sức chứa VPS hoặc100.000 user đồng thời.

Giữ70ca not_run/122release entries unverified; reviewer/signoff/gates chưa ký.
Không sửa serving DB/CRM hoặc VPS/DNS/provider, không gửi email thật.
Mục tiêu toàn VPS/signup vẫn active.
