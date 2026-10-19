# RoomQC — báo cáo hiện trạng và kế hoạch triển khai tiếp theo

Ngày lập: 17/10/2026. Phạm vi: quản lý khách hàng đăng ký RoomQC, gói sử dụng,
thanh toán thuê bao và vận hành nền tảng. Không phải kế hoạch mở rộng toàn bộ
nghiệp vụ khách sạn, ứng dụng mobile hoặc 100.000 người đồng thời.


## Cập nhật mới nhất: Edge worker HTTP local — 19/10/2026

Đã chạy entrypoint worker thật qua HTTP/supabase-js/PostgREST trên bản restore
độc lập: 23/23 kiểm tra với 58 tenant mẫu đạt, gồm batch đủ 50, scope, từ chối
owner/anon, không trùng khi gọi lại và giao lại outbox sau sửa owner. 13 Node
regression công cụ đạt. Đã dọn sandbox/khóa tạm, giữ backup; DB chính không đổi.

Không sửa runtime/policy, không bật lịch/provider. Bước actual Edge local đã
xong; còn staging với dispatcher/proxy thực tế, chính sách expiry, backup
offsite/Storage/Vault và thử tải. Không đóng toàn A0–A4 hoặc nghiệm thu production.
[Báo cáo và giới hạn](roomqc-edge-http-local-2026-10-19.md).

## Mốc E2E và khôi phục — 19/10/2026

Đã kiểm tra browser các luồng directory, hồ sơ đối soát và phục hồi job với
mất phản hồi sau commit/F5/retry trên DB sao chép. Đã restore độc lập 203 bảng
cùng dữ liệu, 385 policy, 903 constraint và 460 function; bổ sung backup PGMQ.
Sửa công cụ giữ lượt thử, tiếp tục setup và cleanup dở dang; 12 Node regression
và kiểm tra Auth/HTTP/DB thật đạt. Sandbox và khóa tạm đã dọn, backup giữ nguyên.

Runtime 8082 vẫn image review-fixes-20261018 healthy; không áp migration hoặc
bật lịch/provider. Chưa đóng A0–A4 hay nghiệm thu production. Bước tiếp: chính
sách expiry → actual Edge worker/staging → backup offsite/Storage/Vault,
giám sát và thử tải. [Bằng chứng và giới hạn](roomqc-e2e-restore-local-2026-10-19.md).

## Mốc sửa lỗi review — 18/10/2026

Đã cutover worker atomic theo scope, batch/cursor/receipt/outbox; phục hồi
interrupted có audit; bảo toàn lệnh đối soát qua tải lại tab; directory phân
trang/tìm kiếm/tổng hợp tại server. Đây là bản local 8082 healthy,
image review-fixes-20261018, history 520 migration. Dữ liệu nghiệp vụ không đổi.

Kiểm chứng: 823 Vitest đạt/16 skip; worker DB 131, recovery DB 54, directory DB
32 đạt; TypeScript/lint/Deno entrypoint/build/container đạt; DB lint và security
advisors sạch ở mức warning/error. Có 5 HTTP kiểm tra từ chối trái quyền.
Không gọi job được cấp quyền trên DB chính, không bật lịch hoặc triển khai VPS.

Các mốc foundation/giám sát phía dưới là lịch sử tại thời điểm ghi; không còn
mô tả runtime mới nhất. Không đóng toàn A0–A4 hoặc nghiệm thu production.
Tiếp theo: browser E2E workflow mới → chốt chính sách expiry chưa được điều
kiện cũ bao phủ → backup/restore độc lập và staging trước lịch/provider.
Chi tiết: [báo cáo sửa lỗi local](roomqc-review-fixes-local-2026-10-18.md).


## Mốc nền giao dịch và outbox — 18/10/2026

Đã áp migration `20261018010625` trên DB local: lệnh nội bộ theo một tenant,
transition/audit/outbox nguyên tử, retry in-app chống trùng và bỏ qua thông báo
cũ sau gia hạn. 70 kiểm tra DB riêng + 25 monitor đạt; lint/advisors warn/error
đạt, history 516 version khớp, dữ liệu nghiệp vụ không đổi và DB thử đã dọn.

**Đây là foundation private, worker Edge chưa chuyển sang dùng nó.** Hiệu lực
runtime mới trong đợt này chỉ là sửa monitor đếm ngày hết hạn hôm nay cho đúng
cột DATE/UTC. Image 8082 vẫn `a1-monitor-e237786`, healthy; lịch vẫn chưa bật.
Không đánh dấu race/outbox của worker hiện tại hoặc toàn A1 đã hoàn thành.

Bước kế: batch/receipt/cursor và fencing scope → nối worker/dispatcher cùng
monitor backlog outbox → test actual worker scoped fixture → cutover đường
legacy và phục hồi interrupted có audit. Không làm lại foundation hoặc mở
settlement để kiểm thử. Chi tiết:
[báo cáo nền lifecycle](roomqc-lifecycle-foundation-local-2026-10-18.md).


## Mốc giám sát tác vụ — 18/10/2026

Bản local 8082 hiện chạy image `roomqc-local:a1-monitor-e237786`, healthy.
Đã áp migration `20261017155727`: durable admission/history, busy/interrupted
và monitor super-admin chỉ đọc. Không có authorized global job hoặc lịch mới.
Kiểm chứng: 769 Vitest đạt/16 skip, 67 DB độc lập, 14 Auth HTTP/rollback-only,
11 Deno; TypeScript/lint/build/container đạt. Fixture/candidate đã dọn.

A1 vẫn còn transition/renewal locking, audit/outbox/retry, phục hồi interrupted
và harness worker chỉ chạy tenant fixture. A2 còn workflow hồ sơ; A3 còn
pagination/aggregation server; A4 còn E2E rộng. Không đóng toàn A0–A4.
Chi tiết, bằng chứng và thứ tự tiếp theo:
[báo cáo giám sát local](roomqc-job-monitor-local-release-2026-10-18.md).

Các trạng thái “chưa có durable history/monitor”, “chưa áp migration” hoặc
“chưa deploy” trong các phần ghi ngày 17/10 dưới đây là lịch sử tại mốc đó.
Cập nhật 18/10 này là nguồn hiện trạng mới nhất.


## Cập nhật triển khai local — 17/10/2026

Bản tích hợp ứng dụng 9886e86 đã triển khai healthy tại RoomQC 8082.
Migration A2 20261017145741 đã áp dụng lên DB local sau kiểm tra độc lập.
Kết quả cuối: 724 Vitest đạt/16 skip, 73 kiểm tra DB độc lập, 9 kiểm tra
Auth HTTP/transaction rollback và 8 Deno đạt; TypeScript/lint/container đạt.
Browser đã kiểm tra đăng nhập, menu, tìm khách, mở/đóng hồ sơ và focus;
chưa thực hiện committed browser-write E2E. Đã dọn fixture/candidate.

Đây là các lát cắt đầu A1/A2/A3, không đóng toàn A0–A4 hoặc phát hành VPS.
Các mô tả cũ về chưa áp DB/chưa deploy là trạng thái lịch sử, không còn
là trạng thái mới nhất. Chi tiết và backlog còn lại tại
[báo cáo bàn giao local](roomqc-parallel-local-release-2026-10-17.md).

Tài liệu này bổ sung thứ tự công việc gần nhất cho
[kế hoạch tổng thể](customer-lifecycle-management-audit-plan-2026-10-17.md).
**Cập nhật thực hiện:** A0 đã bắt đầu, có bản sửa và kiểm thử local tại
[báo cáo baseline](a0-browser-baseline-2026-10-17.md). Chưa đóng toàn bộ A0;
Ở mốc lập plan, A1–A4 chưa triển khai; trạng thái mới ở cập nhật trên.
Không gọi cron toàn hệ thống hoặc bật thu tiền.

Bổ sung cùng ngày: đã kiểm thử browser mất phản hồi POST sau commit/retry
không trùng đơn, thu hồi phiên owner trước submit, khóa admin khi đang mở
đối soát, đối chiếu đủ 27 đơn ở filter legacy. Đã gỡ sync SePay khỏi lịch sử
thuê bao và sửa trạng thái lỗi/cache/nhãn hủy tại đó. A0 vẫn còn ngoại lệ
browser ghi rõ trong báo cáo; chưa coi là nghiệm thu production.

## 1. Kết luận điều hành

Đã có nền tảng local để kiểm tra đăng ký/cấp phát, phân quyền quản trị, báo
giá server, đơn nháp và tra cứu đối soát. **Chưa đủ bằng chứng nghiệm thu
khách trả phí hoặc vận hành production.** Không quy đổi số test thành phần
trăm hoàn thiện hay cam kết số người đồng thời.

Ưu tiên gần nhất: xác lập baseline E2E trình duyệt → làm đáng tin cậy tác vụ
tự động/giám sát → hồ sơ đối soát có lịch sử → dọn console cũ và kiểm thử lại.
Thanh toán thật, chính sách hết hạn/hủy và phát hành VPS có cổng duyệt riêng.

## 2. Báo cáo phần đã làm

| Hạng mục | Đã có | Giới hạn hiện tại |
|---|---|---|
| Đăng ký/cấp phát | Directory/control, request ID, receipt, hỗ trợ tra cứu và các suite local | Chưa nghiệm thu staging; không coi control test tạm là runtime thường trực |
| Quyền gói sử dụng | Chặn browser tự ghi trường gói/quota và xóa cứng tenant; lệnh admin có lý do/audit | Cần tiếp tục kiểm tra mọi đường API cũ và trạng thái read-only theo nghiệp vụ |
| Báo giá/đơn | Giá từ server, snapshot, tạo nháp nguyên tử, retry chống trùng | Nháp không được thanh toán; đơn legacy chưa được giải phóng để settle |
| Hủy/expiry đơn chờ | Kiểm tra parent/sibling, xử lý payment + invoice nguyên tử, không đổi entitlement | Không đồng nghĩa đã xử lý vòng đời trial/active/grace/suspended; chưa xác nhận lịch production |
| Đối soát mới | Tab theo từng tenant, bộ lọc/phân trang server, quyền/session admin | Chỉ đọc; chưa có hồ sơ, phân công, chứng từ, quyết định hoặc settlement |
| Đóng gói | Build và cập nhật riêng RoomQC local 8082 | Chưa phát hành VPS, TLS/domain, email Internet, backup/restore độc lập hoặc thử tải |

**Kết quả từ lần chạy triển khai gần nhất, không phải chạy lại trong lượt
lập kế hoạch này:** Vitest 628 đạt/16 skip; đối soát 48, checkout/expiry/hủy
96, quyền tenant 56 kiểm tra tích hợp đạt. TypeScript ứng dụng, lint phần sửa,
security advisors/DB lint, Docker build và container smoke đạt. Còn 3 cảnh báo
`any` trong dialog lịch sử và cảnh báo bundle vendor lớn (~14,16 MB minified,
4,72 MB gzip). Không tính unit/component/API test là browser E2E.

Nguồn: [báo cáo đối soát local](subscription-reconciliation-local-validation-2026-10-17.md)
và [báo cáo checkout](subscription-checkout-review-fixes-2026-10-17.md).

## 3. Vấn đề còn lại và tác động

| Ưu tiên | Vấn đề / bằng chứng | Tác động / cách kiểm soát |
|---|---|---|
| P0 trước thu phí | Chưa có payable order/settlement từ snapshot được nghiệm thu | Chưa thể nhận tiền và tự kích hoạt một cách đáng tin cậy; tiếp tục giữ checkout tắt |
| P0 trước dữ liệu thật | Policy giấy tờ khách tenant-wide đang trong backlog | Cần duyệt phạm vi theo hotel/vị trí trước dùng giấy tờ thật, không chỉ kiểm tra UI |
| P1 trước lịch production | Đã sửa success giả và có durable monitor; transition/notification chưa nguyên tử, chưa khóa cùng gia hạn và chưa có outbox/retry | Admission không ngăn race với settlement/gia hạn; notification có thể thiếu sau commit. Giữ lịch tắt, không replay tự động; xem cập nhật 18/10 |
| P1 | Chưa có baseline browser E2E của phần quản trị/checkout mới | Component/API đạt nhưng thao tác thật, điều hướng, reload, hai tab hoặc mất mạng vẫn có thể lỗi |
| P1 | Chưa có hồ sơ đối soát có người xử lý, lý do và lịch sử bất biến | Phát hiện được nhưng chưa theo dõi trách nhiệm/kết luận; không được tự đổi trạng thái tài chính để hết cảnh báo |
| P1 | Đã tồn tại `payment_anomalies`, `/finance` reconciliation và SePay sync cũ; UI cũ ghi trạng thái anomaly trực tiếp | Phải phân định phạm vi và audit quyền DB thực tế trước tái sử dụng; không kết luận có bypass quyền chỉ từ mã UI |
| P1 | Grace/read-only, thanh toán đến muộn, hủy/xuất/lưu dữ liệu chưa chốt đầy đủ | Có nguy cơ khóa sai, cấp gói sai hoặc giữ/xóa dữ liệu không đúng thỏa thuận |
| P2 | Tab lịch sử/console cũ còn query chưa phân trang, bộ lọc gói cũ và nút placeholder | Số liệu không đầy đủ, thao tác gây hiểu nhầm, chậm khi dữ liệu tăng |
| P2 | Bundle lớn; cảnh báo performance/RLS cũ theo backlog | Cần đo rồi tối ưu, chưa có cơ sở cam kết 1.000 khách sạn hoặc 100.000 user đồng thời |

P0 là điều kiện chặn phát hành tương ứng, không có nghĩa đang xảy ra mất tiền
hoặc rò rỉ dữ liệu. Không mở những tính năng đó trong lúc chưa nghiệm thu.

## 4. Các đợt làm được local, không cần khóa dịch vụ mới

Ước lượng sơ bộ cho một người triển khai, gồm kiểm thử và sửa lỗi trong phạm
vi từng đợt. Không phải cam kết ngày giao; sẽ cập nhật sau baseline E2E.

### Đợt A0 — Baseline trình duyệt và rà đường cũ (0,5–1 ngày công)

1. Tạo danh mục route/nút/RPC của cổng quản trị, checkout và hai màn đối soát.
   Phân biệt thuê bao RoomQC với khoản thu của khách sạn; xác minh endpoint
   SePay nào đang phục vụ phạm vi nào, không suy đoán từ tên trang.
2. Kiểm thử trình duyệt bằng tài khoản fixture owner, staff, admin và tenant
   thứ hai: đăng nhập → mở khách hàng → Xem hóa đơn → Đối soát; lọc, qua trang,
   đổi khách hàng, đóng/mở dialog và quay lại.
3. Owner xem báo giá → tạo nháp → tìm nháp → hủy → tải lại; kiểm tra nhấn lặp,
   hai tab, mất phản hồi sau commit và hết phiên. Không có chuyển khoản thật.
4. Kiểm tra quyền trực tiếp qua REST/RPC, không chỉ nút ẩn. Rà grants/RLS hiện
   tại của anomaly cũ và các entry point settlement; ghi lỗi có bằng chứng.
5. Nếu gặp lỗi quyền, sai tiền, trùng dữ liệu hoặc mất dữ liệu: sửa và chạy
   lại trước mở rộng. Không làm thao tác phá hủy để kiểm thử trên khách có sẵn.

**Bàn giao:** ma trận E2E pass/fail/not-run, ảnh/bằng chứng đã bỏ bí mật, danh
sách lỗi theo mức độ, bản đồ trách nhiệm của hai màn đối soát.

**Nghiệm thu:** mọi luồng trên có kết quả thực; fixture không tạo chứng từ
trùng/cấp gói; lỗi mạng không báo thành công; không gọi provider Internet.

### Đợt A1 — Job đáng tin cậy và giám sát local (1–2 ngày công)

1. Sửa cách phản ánh lỗi ở worker thuê bao cũ: lỗi bước quan trọng không trả
   thành công; phân biệt thất bại chuyển trạng thái với thông báo đang chờ
   retry. Không chạy job global hay thay chính sách grace trong đợt này.
2. Tách hoặc cô lập thao tác auto-offline nhân viên khỏi trách nhiệm job gói;
   không để lỗi của nghiệp vụ khác che kết quả kiểm tra thuê bao.
3. Ghi mỗi lần chạy bằng run ID, tên job, phạm vi tenant/cluster, thời gian,
   kết quả `success/failed/busy`, số lượng xử lý/bỏ qua và mã lỗi an toàn.
   Có trạng thái riêng cho lần chạy bị gián đoạn/không kết thúc.
4. `busy` không cập nhật mốc thành công; lượt chỉ xử lý fixture không được
   coi là sweep toàn cụm. Không lưu token, payload chứa PII hoặc secrets.
5. Màn giám sát đơn giản: lần thành công gần nhất đúng phạm vi, lỗi mới nhất,
   backlog eligible và anomaly bị loại khỏi expiry. Không dùng riêng
   `skipped_count` để suy ra toàn bộ backlog; ghi rõ thời điểm đo.
6. Mô phỏng job lỗi/timeout/retry/chạy đồng thời, backlog vẫn còn sau một
   batch và trường hợp scheduler không chạy. Chỉ dùng tenant fixture.

**Bàn giao:** schema/API tối thiểu cho lịch sử job, monitor nội bộ, worker đã
sửa và runbook. Khi triển khai phải đối chiếu changelog/docs hiện hành,
tạo migration qua CLI và kiểm tra grants/RLS/advisors theo hướng dẫn Supabase.

**Nghiệm thu:** không có lỗi quan trọng bị báo success; lần chạy không có
quyền bị chặn; monitor phân biệt chưa có lịch, busy, thất bại và thành công.
**Không cài lịch production hoặc mặc nhiên đổi gói khách trong đợt này.**

### Đợt A2 — Hồ sơ đối soát có trách nhiệm và lịch sử (2–3 ngày công)

1. Từ một giao dịch có dấu hiệu, tạo/mở hồ sơ. Nguồn server xác định đúng
   tenant/payment/invoice; không tin ID hoặc số tiền browser gửi lên.
2. Tái sử dụng dữ liệu/provider anomaly hiện có nếu phù hợp. Nếu cần bảng
   hồ sơ thuê bao riêng, ghi rõ khác biệt nghiệp vụ và liên kết với nguồn;
   không sao chép payload ngân hàng hay tạo hai danh sách độc lập cùng việc.
3. Trạng thái hồ sơ đề xuất: mới → đang kiểm tra → chờ bổ sung → đã kết luận;
   cho mở lại với lý do. Mỗi hồ sơ có người nhận, ghi chú và nguồn tham chiếu.
   “Đã kết luận” chỉ là trạng thái công việc, **không có nghĩa đã thu tiền**.
4. Chỉ quản trị nền tảng đủ quyền/phiên còn hiệu lực được xử lý; kiểm tra
   người nhận còn hợp lệ. Ghi actor, thời gian server, lý do, trước/sau và
   request ID cùng transaction; không sửa/xóa lịch sử từ browser.
5. Unique key cho hồ sơ đang mở của cùng nguồn và request ID chống trùng;
   version check chống hai admin ghi đè quyết định. Retry trả kết quả đã commit.
6. Bước đầu chỉ lưu ghi chú/tham chiếu chứng từ an toàn. Chức năng upload thật
   là hạng mục riêng sau kiểm tra bucket/policy/loại tệp/dung lượng/link hết
   hạn; không có ô URL tùy ý khiến server tự tải tài nguyên bên ngoài.
7. Khi dấu hiệu nguồn thay đổi hoặc trở lại bình thường, giữ lịch sử hồ sơ
   và chỉ rõ thời điểm snapshot; không auto-đóng hay che cảnh báo do đóng case.

**Bàn giao:** thao tác tạo/nhận/ghi chú/kết luận/mở lại trong tab Đối soát hiện
có, lịch sử, bộ lọc người nhận/trạng thái và phân trang server. Không thêm
menu phụ trùng lặp. UI nói rõ quyết định nào chưa có hành động tài chính.

**Nghiệm thu:** 20 lần tạo/retry cùng nguồn chỉ một hồ sơ; hai admin cập nhật
đồng thời không mất lịch sử; đóng/mở hồ sơ không đổi invoice/payment/gói;
khóa tài khoản/bỏ role/logout mất quyền ở server. Không mở settle legacy.

### Đợt A3 — Dọn console cũ và đo hiệu năng (1–2 ngày công)

1. Phân trang server cho lịch sử payment/invoice và danh sách khách; thống
   kê tính tại server, không cộng từ trang dữ liệu hiện thấy.
2. Chuẩn hóa bộ lọc gói theo dữ liệu thật, email/slug và tìm kiếm có giới hạn;
   lỗi tải không hiển thị thành 0 hoặc danh sách rỗng. Kiểm tra tổng số và ngày.
3. Nút xem/tải/xuất phải có hành vi thật và đúng quyền; nút chưa hỗ trợ phải
   bỏ hoặc vô hiệu hóa kèm giải thích, không hiện toast thành công giả.
4. Đo thời gian mở dashboard/khách/đối soát trên fixture kích thước tăng dần,
   ghi CPU/RAM và p95 của luồng đo. Kiểm tra query plan/index trên truy vấn
   chậm; không xóa/gộp hàng loạt RLS policy chỉ vì cảnh báo performance.
5. Chẩn đoán bundle và lên bản sửa code-splitting riêng nếu vượt phạm vi;
   không tăng ngưỡng cảnh báo để coi như đã tối ưu.

**Nghiệm thu:** filter và tổng số đúng qua nhiều trang; không tải toàn bộ
lịch sử để lọc tại browser; không mất điểm vào chức năng; số đo có môi
trường/cỡ dữ liệu kèm theo, chưa quy đổi ra cam kết user đồng thời.

### Đợt A4 — Hồi quy và nghiệm thu local (1–2 ngày công)

- Chạy lại browser E2E A0 cùng các màn case/job; desktop và viewport mobile.
- API/Auth/RLS/Storage/Realtime đúng phạm vi thay đổi; race, retry, mất mạng,
  hai tab, phản hồi lỗi và stale data. Các nhánh chưa chạy ghi `not-run`.
- TypeScript app, lint, unit/component, integration có fixture, DB advisors,
  migration history, Docker build và container smoke.
- Chỉ cập nhật RoomQC 8082; không đụng CRM 8090, reset DB hoặc xóa fixture
  ngoài danh sách ID đã tạo. Có bản image/cấu hình trước để quay lại frontend;
  thay đổi DB ưu tiên additive/forward-fix, không rollback bằng reset.

**Bàn giao:** báo cáo lỗi đã sửa/còn lại, bằng chứng, giới hạn, hướng dẫn
vận hành và danh sách quyết định/khóa còn thiếu. A0–A4 dự kiến khoảng **6–10
ngày công**, chốt lại sau A0. Không cộng máy móc vào ước lượng roadmap cũ.

## 5. Việc có thể chuẩn bị nhưng chưa được bật

### B1. Thanh toán thuê bao thật — sau duyệt chính sách (ước lượng 3–5 ngày công)

- Chốt hiệu lực đổi phòng trong kỳ, tính bù/trừ, thời hạn giá, múi giờ, tiền
  đến muộn, hoàn tiền và định nghĩa đơn được phép thanh toán. Không dùng
  cửa sổ nháp 15 phút/expiry pending 24h làm chính sách thương mại mặc định.
- Server phát hành payable order chứa snapshot, currency, ngân hàng/reference
  và thời hạn. Một đường settlement kiểm tra tenant/invoice/amount/currency;
  gateway event được nhận một lần, payment và entitlement commit nguyên tử.
- Local dùng nguồn sự kiện giả lập có kiểm soát và test fixture. 20 replay,
  webhook + sync đồng thời, sai/thiếu/thừa tiền, sai reference, hủy/expired,
  thay gói trong lúc chờ, payment đến muộn và retry sau commit đều có kết quả rõ.
- Không coi sự kiện giả lập là provider E2E; cần staging/provider và duyệt
  mới bật cờ checkout thật. Hồ sơ đối soát không tự trở thành lệnh cấp gói.

### B2. Vòng đời gói/hủy/xuất dữ liệu — sau duyệt chính sách (2–4 ngày công)

- Đối chiếu các cột ngày/trigger và job cũ, chọn nguồn trạng thái chuẩn; thống
  nhất cách biểu diễn grace ở DB, UI và email. Không tạo thêm một cơ chế hết
  hạn chạy song song mà không tắt/cutover cơ chế cũ.
- Cấu hình đã duyệt cho trial → active → grace → suspended/read-only và
  recovery; lock/recheck để job hết hạn không ghi đè thanh toán vừa thành công.
  Một RPC/transaction có audit cho thay đổi trạng thái, outbox chống trùng
  thông báo; thông báo thể hiện số ngày thật, không hard-code 7 ngày.
- Chốt read-only cho từng mutation, quyền xem/xuất, ngày hủy hiệu lực, thời
  hạn lưu/xóa và cách phục hồi; tách đình chỉ quản trị với hết hạn vì thanh toán.
  Không xóa dữ liệu thật khi chưa có duyệt pháp lý và backup đã restore thử.

Có thể viết ma trận/test/dry-run theo cấu hình; **không sweep dữ liệu khách
hiện có theo chính sách tự suy đoán**. Quyền giấy tờ khách phải được chốt và
test độc lập trước dùng giấy tờ thật.

## 6. Staging/VPS và pilot — cần quyền/cấu hình ngoài

Sau A và phần B liên quan, ước lượng 3–5 ngày công kỹ thuật ban đầu, chưa
gồm thời gian chờ domain/provider hoặc 7 ngày quan sát pilot:

1. Chốt máy staging và triển khai control runtime + directory DB riêng bền
   vững; proxy/TLS, health, volume/secret store và lịch có xác thực. Giữ origin
   local/production riêng; không lấy port CRM 8090, không chuyển khách cũ tự động.
2. Xác minh roomqc.com/Resend/SMTP và callback; email Auth/mời/reset/giao dịch
   đi tới hộp thử kiểm soát, kiểm tra bounce/retry. Không gửi khóa vào chat/Git.
3. Cấu hình provider thanh toán và chạy toàn bộ kịch bản staging; chỉ sau
   nghiệm thu mới có giao dịch thật trong phạm vi được cho phép.
4. Backup directory, DB/Auth, Storage objects và cấu hình; diễn tập restore
   độc lập, đo RPO/RTO. Mục tiêu đề xuất ≤24h/≤4h chỉ được công bố khi đo đạt.
5. Kiểm tra alert thật tới người trực, lịch bị dừng, job lỗi, backlog và
   thiếu sức chứa. Có runbook và phương án rollback/cutover không mất dữ liệu.
6. Pilot 1 khách sạn nội bộ, sau đó 5–10 khách có kiểm soát; đo 7 ngày rồi
   quyết định tăng tải. Chống bot/rate limit trước signup công khai; test tải
   nghiệp vụ theo cấu hình thật, không nhận 1.000 khách cùng lúc ngay ngày đầu.

Khóa/quyền/quyết định chi tiết tiếp tục ở
[danh sách deferred](roomqc-deferred-access-and-decisions-2026-10-17.md).

## 7. Điều kiện không được bỏ qua

1. Không mở thu tiền khi chưa có payable snapshot/settlement và provider E2E.
2. Không mở signup công khai khi control runtime/staging/email/routing chưa đạt.
3. Không dùng dữ liệu nhạy cảm thật khi phạm vi quyền chưa được chốt và test.
4. Không vận hành trả phí thiếu restore/alert/lịch đã kiểm chứng.
5. Lỗi sai tiền, rò dữ liệu, trùng cấp phát hoặc mất dữ liệu chặn phát hành;
   không bỏ qua để đạt mốc thời gian. Test skip/not-run không được tính pass.

**Đợt tiếp theo sau mốc foundation 18/10:** làm batch/receipt/cursor, nối worker
và dispatcher/monitor outbox, test actual worker scoped fixture rồi cutover các
đường cũ; tiếp theo phục hồi interrupted có kiểm soát. Tiếp tục workflow A2,
pagination A3 và hồi quy A4. Durable history/monitor và foundation private đã
có local; không làm lại hoặc bật checkout/scheduler trước các cổng nghiệm thu.
