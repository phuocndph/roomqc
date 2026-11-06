# RoomQC — quyền đọc tài chính và nguồn dữ liệu xuất báo cáo, local 27/10/2026

Phạm vi toàn mục tiêu vẫn là **VPS do RoomQC quản lý + signup tự động**.
Đợt này khép một phần Q02/T01,T03,T04,T08: backend báo cáo chi phí/tài chính và
API dữ liệu xuất có kiểm quyền hiện thời. Chưa nghiệm thu toàn Q02 hoặc sản phẩm.

## Kết quả và lỗi đã xác nhận

Baseline Auth/REST riêng trên candidate929 đã thêm ba probe: **35/37 đạt**.
Hai probe sai phạm vi đều nhận HTTP 200: owner tenant B gọi báo cáo tenant A,
và staff gọi khách sạn chưa được giao. Request không đăng nhập nhận 401.
Baseline được giữ nguyên; đây là lỗi đọc dữ liệu, không phải lỗi fixture.

Migration mới **20261027060731_financial_report_live_scope_and_export.sql**:

- Giữ API get_financial_report bốn tham số nhưng đối chiếu tenant với actor,
  chỉ lấy khách sạn active được giao; owner chỉ tổng hợp tenant của mình.
- API mới get_financial_report_scoped tự suy tenant. reports.view là điều kiện
  đọc; p_for_export=true còn cần reports.export hiện thời.
- export_revenue_report lấy lại báo cáo theo ngày/múi giờ/scope sau kiểm quyền
  xuất, không chỉ tin quyền đã cache ở frontend.
- Khóa actor/session/direct grants/effective role grants và scope khách sạn;
  kiểm session sau chờ khóa và trước trả kết quả. Có proof thu hồi quyền export
  trực tiếp và qua vai trò phụ, không chỉ primary role.
- Public wrappers là security invoker; phần privileged ở private với search_path
  rỗng. Anon và service_role không được dùng API này thay tài khoản người dùng;
  private no-show ledger vẫn không được mở.

## Contract số liệu đã kiểm

Chi phí mua chỉ lấy purchase/in; giặt là ưu tiên actual, fallback estimate và
loại cancelled; bảo trì chỉ completed. Timestamp dùng khoảng ngày địa phương
nửa mở, gồm microsecond cuối ngày và ngày DST dài 25 giờ.

summary và cost_summary là hai alias cùng DTO để giữ client cũ. Monthly trend
bị chặn đúng ngày bắt đầu/kết thúc được chọn, không lấy cả tháng ngoài kỳ.
Phí no-show cộng vào recognized_revenue, tách khỏi net_revenue phòng và số
đã thanh toán của lượt trả phòng. refund_due vẫn chưa phải tiền đã hoàn.

Fixed costs là **ước tính phân bổ theo số ngày lịch từng tháng**, có method và
is_estimate rõ. Khoảng hai ngày qua hai tháng không bị tính nguyên tháng.
net_profit giữ ý nghĩa lợi nhuận vận hành sau ba chi phí trực tiếp;
after_allocated_fixed_cost là ước tính sau phần fixed costs phân bổ.
Đây không phải xác nhận dòng tiền hoặc thay quy định kế toán/thuế.

## Bằng chứng cùng candidate930

SHA **64aef734dfc062f0f002ea5a22445bd088460083e4a9f10341b2e8e7c5f3efde** — 930 file trong phạm vi,
568 business + 12 directory migrations, runtime 183 file.

| Run | Kết quả | Giới hạn |
|---|---|---|
| Auth/REST report + finance + export | 75/75; 5 race khóa thật | Fixture synthetic; chưa browser/download |
| Writer phòng/booking | 536/536 | Hồi quy native theo phạm vi suite |
| Nguồn phòng | 77/77 | Chưa ký mọi deployed/service caller |
| Full control | 440/440, exit 0, fail/skip/cancel 0 | Không thay default full vendor/rebuild cuối |

Source/schema/runtime và protected guards trước–sau khớp từng run.
Không sửa 567 migration cũ. Không có thay đổi frontend trong đợt này;
157 frontend tests và TypeScript ở report929 là lịch sử, không chạy lại.
Các native reads/exports được đối chiếu không tạo hoặc sửa payment/invoice/
resolution/command/audit và ba bảng chi phí cùng fixed-cost budget.

Advisors workload hiện tại có **726 findings**; direct ACL35
bảng đạt. Count không thay disposition từng object hoặc proof quyền gián tiếp.
Ba index mới phục vụ scope/period; không kết luận các findings cũ đã được sửa.

## Lịch sử và cleanup

Giữ baseline đỏ35/37, intermediate67/67 và lượt fixture sau đó lỗi catalog vai
trò phụ: 56 controls đã đạt trước assertion, không có control sản phẩm đỏ được
ghi ở lượt này. Fixture đã được sửa để tạo tenant role hotel_manager hợp lệ
theo enum có thật, không nới quyền sản phẩm hoặc bỏ phép kiểm.

Cả bảy run đều terminal và đã dọn. Publication kiểm độc lập **21 truy vấn
container/volume/network theo exact label**, còn 0; không dọn rộng hoặc tác động
DB đang phục vụ/CRM. Không thay runtime thường trực, VPS, DNS, provider/email.

## Việc nhận tiếp và giới hạn phát hành

1. Nối typed RPC/client, hook/cache identity và nguồn export mới vào financial
   desktop/mobile, revenue export/generic export. Không dùng loaded data và
   cached capability để tự kết luận server đã cho phép xuất; không hứa chặn
   người dùng sao chép dữ liệu đã được phép xem.
2. Thống nhất financial/overview/owner/operations insights; giữ room-only
   ADR/RevPAR, kỳ/múi giờ/error/refresh và kết quả export đúng. UI cũ còn phép
   tính/đường tải cần thay; backend endpoint đạt không ký thay UI.
3. Populated upgrade566→567→568, fault rollback và compatibility sau ghi mới.
   Đợt này chỉ có fresh replay568; proof913 của564→566 không thay upgrade này.
4. Cancel/refund, trả trước/group/staged quote/payment/transfer/correction/
   retention và RW6–RW8; Q03 workflow/recipient/offboarding/indirect/advisors,
   Q04 freeze/default-full/independent rebuild candidate cuối.
5. Tiếp đủ T07→T09/T10→T11–T13→T14–T17→T18–T20→T21–T24→T25: alerts,
   admission/budget, signup/jobs/abuse, hai console, Linux/restore/on-call,
   A/B/E2E/load/RC rồi pilot ít nhất 7 ngày.

70 ca vẫn not_run, 122 release entries unverified, gates/reviewers/signoff
giữ nguyên. Chưa deploy bản sửa hoặc nghiệm thu browser/Android, tải, restore
ngoài host/pilot; toàn mục tiêu vẫn đang thực hiện.
