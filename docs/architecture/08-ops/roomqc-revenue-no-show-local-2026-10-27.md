# RoomQC — báo cáo phí no-show và quyền đọc tài chính, local 27/10/2026

Đây là bàn giao có phạm vi trong **Q02/T01/T03/T04/T08**, thuộc mục tiêu toàn
bộ VPS + signup. Bản sửa nằm trong worktree integration; chỉ tài liệu và artifact
đã lọc được đồng bộ sang dự án chính. Chưa cập nhật runtime đang phục vụ hoặc VPS.

Candidate **929**, SHA `c57281e37a34cc5833fbc5030351c8f5299f3f7b28567e71e442af6be2097be4`,
gồm 567 business + 12 directory migrations, runtime 183 file. Migration mới
được tạo bằng CLI 2.121.0; giữ nguyên 566 migration nghiệp vụ cũ. Đây là scoped
manifest của đợt kiểm, chưa là manifest phát hành toàn sản phẩm.

## 1. Hành vi đã thay đổi

`useRevenueReport` gọi RPC tổng hợp `get_revenue_report`, thay truy vấn booking
giới hạn 10.000 dòng và khoảng lấy dữ liệu sáu tháng. Server tính đủ kỳ hiện
tại, kỳ trước, hôm nay, sáu tháng xu hướng và các nhóm phòng/loại hình/kênh.
Kỳ năm so được đầy đủ năm trước; kỳ tùy chọn so với khoảng liền trước cùng số
ngày. Ngày trả phòng là ngày lịch; thời điểm xử lý no-show dùng `recorded_at`
và múi giờ hợp lệ, khoảng đầu bao gồm/cuối loại trừ.

| Số liệu | Cách ghi nhận | Điều không được suy ra |
|---|---|---|
| Doanh thu phòng | Booking đã trả phòng; booking đã hoàn tiền không góp vào doanh thu, hoa hồng, VAT hoặc phụ thu được ghi nhận | Không phải toàn bộ tiền thực thu theo ngày thanh toán |
| Phí giữ cọc no-show | Chỉ số tiền đã phân loại trong ledger, theo ngày xử lý | Không tạo phiếu thu hoặc dòng tiền mới |
| Cọc cần hoàn trong kỳ | Nghĩa vụ hoàn được ghi nhận trong kỳ xử lý | Chưa chứng minh đã hoàn tiền; không gọi là tổng dư nợ hiện tại |
| Legacy chưa có phân loại hợp lệ | Hiện số booking cần đối soát trên toàn lịch sử được phép xem | Không đoán doanh thu từ cột cọc cũ |
| Tiền trả trước ngoài cọc | Hiện khoản chưa phân loại để đối soát | Không tự giữ lại hoặc tự coi đã hoàn |

Finance Hub, trang doanh thu desktop/mobile và Excel/PDF có các mục phí, khoản
cần hoàn, đối soát và ngày/múi giờ. Doanh thu ghi nhận của phần này cộng phí giữ
cọc vào doanh thu phòng sau hoa hồng. Các trường phòng trong hook giữ riêng để
ADR, RevPAR, số lượt ở và giá trị booking không bị cộng phí khách không đến.
Tổng phòng đứng đầu không cộng phụ thu lần hai. Cache báo cáo phân biệt runtime,
actor, session, tenant, khách sạn và kỳ; đổi phiên rồi quay lại vẫn chặn kết quả
cũ. Thao tác no-show hoặc phục hồi lệnh làm mất hiệu lực cache báo cáo.

Đây chưa là kết luận mọi màn tài chính/lợi nhuận hoặc mọi đường export đã thống
nhất. Các consumer chi phí, dashboard và báo cáo độc lập còn phải kiểm theo
inventory trước khi đóng toàn bộ hạng mục tài chính.

## 2. Quyền đọc và ranh giới server

Người chỉ có `reports.view` đọc được báo cáo và phân loại no-show trong khách
sạn được giao; không cần `bookings.update/manage`. Chủ tenant đọc được các
khách sạn thuộc tenant. Chế độ mọi khách sạn của nhân viên chỉ tổng hợp các
assignment hiện thời. Staff có quyền xem tìm thấy các hub trong catalog; module
báo cáo hiện dùng capability chung, chưa thêm phân quyền riêng từng hub.

RPC kiểm Auth/user/session còn sống, profile/role nhất quán, quyền và hotel
scope tại server; khóa grant trực tiếp lẫn mọi role grant có hiệu lực, kiểm
expiry sau chờ khóa và trước trả kết quả. Không dùng user_metadata để cấp quyền.
Wrapper báo cáo public là security invoker; implementation đặc quyền nằm ở
private, search_path rỗng và grant execute giới hạn. Không cấp SELECT ledger
private hoặc cấp API đọc này cho anon/service_role.

Nút xuất Excel/PDF kiểm riêng `reports.export`. Đây là kiểm UI trên báo cáo
đã tải, chưa là server-gated download hoặc cam kết chặn xuất tức thời sau thu
hồi quyền khi dữ liệu đã có trong trình duyệt. Giữ giới hạn này để xử lý ở đợt
kiểm các đường báo cáo/export còn lại.

## 3. Kết quả kiểm trên cùng candidate

| Kiểm tra | Kết quả | Phạm vi |
|---|---:|---|
| Auth/REST báo cáo | 34/34, exit 0 | Kế toán chỉ đọc; owner/staff/tenant/hotel; múi giờ/kỳ; legacy; 10.021 lượt trả phòng |
| Khóa thật | 2/2 | Hết hạn session khi chờ hotel; grant bị thu hồi trước reader lấy khóa |
| Writer phòng/booking | 536/536, exit 0 | Hồi quy command, no-show, tiền, source và phục hồi |
| Nguồn sự kiện phòng | 77/77, exit 0 | Hồi quy quyền, giao dịch, caller và recovery |
| Unit/hook/component liên quan | 157/157, không fail/skip | Tính số liệu, cache/late response, UI nghĩa vụ hoàn, export và catalog; giữ hồi quy no-show cũ |
| TypeScript ứng dụng | exit 0 | `tsconfig.app.json` |
| Lint | 0 lỗi, 33 cảnh báo trên 30 file | Gồm cảnh báo cũ và kiểu any của test/export |
| Full control | 440/440, exit0, không fail/skip/cancel | Directory/control hồi quy trên cùng candidate; không thay default-full backend/rebuild |

Các ca đọc, từ chối và replay đối chiếu payment/invoice/command/audit/ledger
trước-sau; phân loại cọc không tạo thêm tiền. Dữ liệu lớn 10.021 booking chứng
minh aggregate không bị cắt theo giới hạn Data API/client, **không phải bài đo
sức chứa, latency, 100.000 user hoặc soak**. Native cùng fixture kiểm thực
Auth/REST; chưa có browser/Android E2E hoặc fault proxy thật trong đợt này.

## 4. Lịch sử lỗi và giới hạn kiểm chứng

Ba lượt chưa đạt được giữ nguyên:

1. Fixture `041e16352c46`: thiếu tenant trong seed direct permission, code42501,
   dừng trước các ca sản phẩm. Đã sửa fixture; không sửa hàng rào tenant.
2. Fixture `904a6ab19b6b`: 31/33 ca đạt, hai expected số tiền của seed còn áp
   VAT/phí mặc định. Hai race đều đạt. Fixture sau ghi rõ thuế/phí bằng0; không
   hạ expected để che thiếu doanh thu. Đồng thời sửa ngày trả phòng thành ngày
   lịch độc lập múi giờ và thêm ca America/New_York.
3. Fixture `c1e17ebbb6f9`: 34/34 ca sản phẩm đạt nhưng harness direct ACL nhận
   `actorId` thay trường `id` bắt buộc, terminal1. Đã sửa gói fixture; chỉ lượt
   `75259b89d4e0` có terminal0 và đầy đủ ACL/advisors được dùng làm proof cuối.

Advisors trên fixture cuối có **726**: 35 RLS no-policy INFO,7 FK INFO,
501 unused-index INFO,183 multiple-permissive-policy WARN. Có thêm ba index
phục vụ phạm vi/ngày; tổng finding thay đổi theo index/workload, không chứng
minh đã xử lý các advisor cũ. Direct ACL kiểm35bảng không thay kết luận mọi
đường RPC/trigger/FK gián tiếp. Disposition theo từng đối tượng vẫn mở.

Migration567 đã replay trên DB mới có toàn chain; chưa chạy nâng cấp567 có dữ
liệu cũ, default-full/rebuild độc lập, Linux/TLS/offsite restore, tải hoặc pilot.
Proof upgrade564→566 thuộc candidate913 vẫn giữ đúng phạm vi, không kế thừa
thành proof upgrade567. Chưa có hoàn tiền thực tế hoặc đối soát legacy tự động.

## 5. Hồ sơ và việc tiếp theo

Implementation chính trong integration:
`supabase/migrations/20261027051801_booking_finance_report_live_read.sql`,
`scripts/control-backend-revenue-report-checks.mjs`,
`src/hooks/useRevenueReport.ts`, `src/components/reports/NoShowFinanceSummary.tsx`
và các điểm dùng Finance Hub/doanh thu/export/catalog. Đường dẫn source ghi
dạng văn bản vì implementation không được mirror sang primary trong đợt này.

[Artifact](../../../artifacts/roomqc-revenue-no-show-local-2026-10-27.json) lưu
source binding, controls đã lọc, terminal, failed history và cleanup độc lập.
Nhận việc theo [mục19.16](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1916-điểm-nhận-sau-báo-cáo-và-quyền-đọc-tài-chính-929):
thống nhất các consumer tài chính/đường export còn lại; hoàn tiền/cancel và
tiền trả trước; các writer Q02; Q03 configured workflow/quyền gián tiếp/advisors;
Q04 freeze/default-full/rebuild rồi cảnh báo→admission/budget→signup/jobs/abuse→
console→Linux/restore/on-call→A/B/E2E/tải/RC→pilot tối thiểu7ngày.

**70 hàng nghiệm thu vẫn not_run,122release entries vẫn unverified; không ký
gate/reviewer/signoff, chưa mở public và chưa hoàn thành toàn bộ mục tiêu.**
