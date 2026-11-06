# RoomQC — kiểm thu hồi quyền qua Edge API cho tư vấn vận hành

Ngày 27/10/2026. Hoàn thành phiếu 19.36 về quyền trong đường Edge thuộc nền
T03/T04/T08/T13 của kế hoạch toàn bộ VPS + signup. Đây là bằng chứng local
trên fixture Docker riêng; chưa nghiệm thu sản phẩm hoặc triển khai VPS.

## Kết quả và thay đổi

54 tình huống đều từ chối trả advice sau thu hồi quyền. Mỗi tình huống kiểm
đúng số lần gọi provider, journal/quota/audit, nguồn tiền trước–sau và phục hồi
bằng cùng command trên Edge thứ hai. Không phát hiện lỗi sản phẩm mới trong
phạm vi này; chỉ bổ sung harness và diagnostic, không đổi migration, Edge
sản phẩm hoặc frontend.

| Bộ kiểm tra cùng source | Expected / actual |
|---|---|
| Edge authority | 274/274 assertions; 17 trường hợp × 3 cửa sổ + 3 hard-delete = 54 quan sát |
| Native authority | 119/119; 17 trường hợp × 4 đường và 11 race hết hạn theo clock thực |
| Hồi quy advice | 76 native, 59 Edge, 28 production-client HTTP đạt |
| Restart process | 8 Edge + 2 client rehydrate đạt |
| Gián đoạn | 13/13, có SIGKILL và timeout provider thực 45 giây |
| Source binding / renderer | 13/13; không fail, skip hoặc cancel |
| Direct ACL | 39 bảng và 39 snapshot không đổi ở từng fixture |
| Cleanup | 9 kiểm độc lập container/volume/network; tất cả còn 0 |

Các suite có phạm vi chồng nhau, không cộng thành số ca nghiệm thu sản phẩm.
Client HTTP vẫn dùng Map và khóa trong process; chưa chạy localStorage,
Web Locks, browser hoặc Android thật ở checkpoint này.

## Ma trận Edge và điểm chặn

17 trường hợp gồm Auth soft-delete/chưa xác minh email/banned; profile
inactive/soft-delete/locked/super-admin; role mất/level không khớp; session
hết hạn/bị xóa; mất reports.view; mất assignment khách sạn; khách sạn
inactive; tenant read-only/trial hết hạn/subscription hết hạn. Xóa cứng khách
sạn là trường hợp thứ 18 riêng, chạy ở cả ba cửa sổ.

| Cửa sổ có barrier được quan sát | Kết quả bắt buộc đã đạt |
|---|---|
| Sau dispatch bền vững, trước provider | 18 denial HTTP 401/403, 0 provider call mỗi command; dispatched chuyển unknown, các trường khác và audit giữ đúng |
| Provider I/O sau sink nhận | 18 denial, 1 provider call mỗi command; không ghi result mới; charge/fence giữ, unknown không tự gửi lại |
| Sau commit completed, trước final user receipt query | 18 denial, 1 provider call mỗi command; row completed và audit giữ nguyên; không trả advice cho người đã mất quyền |

Barrier cuối nằm **trước truy vấn REST kiểm quyền cuối cùng**. Bài thử không
chứng minh có thể thu hồi bytes đã được cho phép và trả khỏi truy vấn đó.
Revoke sau thời điểm cho phép trả dữ liệu là ranh giới khác, không gán kết
quả này thành bảo đảm thu hồi tức thời mọi response đang truyền.

Setup có nguồn doanh thu khác 0. Staff chỉ có reports.view được cấp rõ ràng,
được gán khách sạn phụ và có khách sạn mặc định khác; quyền report mặc định
của role được bỏ trong fixture để tránh positive giả. Mỗi case dùng command
mới, chụp toàn row advice và audit riêng khi tới barrier. Sau restore quyền,
Edge thứ hai lookup/resume cùng mã trả đúng unknown hoặc completed, không
resend, thêm charge hay audit. Nguồn tài chính không đổi.

37 lần gọi sink nội bộ gồm một setup positive và 18 lần ở mỗi cửa sổ sau;
không có provider Internet. Hard-delete phục hồi hotel/assignment qua trigger
quota hiện có sau refresh usage của fixture; không tắt trigger. Đây không
phải bằng chứng đã sửa hoặc nghiệm thu usage/quota sản phẩm ở T10.

## Nguồn và đối soát

Source 1.018 file, SHA-256
`c41b0e96aa1e85694a5277d28d45c0514bb42078a5e310072a71bd0026b365f2`;
backend binding 195 file; 576 business + 12 directory migrations.
[Artifact đã lọc](../../../artifacts/roomqc-advice-edge-authority-local-2026-10-27.json)
ghi từng observation, expected/actual, lệnh, native exit và giới hạn.

Ba run matrix/native/regression đều exit 0, schema và source binding cuối run
khớp đầu vào. Native authority chạy lại 11 race thật: trial/session/policy
hết hạn trong khi chờ policy/command/audit lock, denial không đổi journal.
Hồi quy có kill khi sink đã nhận, restart process cùng image, timeout 45 giây
và session/policy expiry trong I/O. Các kết quả này thuộc source 1018.

Advisors ở matrix/native/regression lần lượt 703/704/730, chưa disposition:
39 RLS no-policy, 7 foreign key thiếu index, 183 multiple permissive policies;
unused index 474/475/501 phụ thuộc workload. Chênh lệch count không chứng
minh đã sửa finding. Direct ACL không thay kiểm đường quyền gián tiếp.

UTC mô phỏng và populated upgrade 575→576 thuộc checkpoint 1017, không chạy
lại ở 1018; frontend 166/TypeScript/lint thuộc 1014. Giữ lịch sử hai lỗi UTC
và bản sửa trong báo cáo gốc; không gán các proof cũ thành full run mới.

Chỉ mirror tài liệu/artifact đã lọc. Implementation/index cây chính,
ledger và worksheet được bảo vệ bằng hash. Không chạm DB đang phục vụ/CRM,
VPS, DNS, email hoặc provider thật; private logs không mirror.

## Việc nhận tiếp và nghiệm thu

Nhận [phiếu 19.37](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1937-phiếu-nhận-sau-edge-authority1018):
policy control/live capability/audit/default-disabled, freshness/retention/
abuse, browser/Android và binary compatibility. UTC midnight thực còn chưa
chạy. Không giao lại ma trận 54 quan sát khi không có delta hoặc concern mới.

Sau đó mobile money → F3 exports → Q02 writers → Q03 workflow/indirect/
advisors → Q04 freeze/full/default-full/rebuild; rồi T07 → T09/T10 → T11–T13
→ T14–T17 → T18–T20 → T21–T24 → T25 pilot ít nhất 7 ngày theo dependency.

Giữ **70 ca not_run, 122 mục unverified**, reviewer/signoff/gates không đổi.
Chưa full/rebuild, Linux/TLS/offsite, E2E thiết bị, tải hoặc pilot của candidate
này; không có claim sức chứa hay 100.000 user đồng thời. Mục tiêu toàn bộ
plan vẫn đang thực hiện.
