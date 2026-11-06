# RoomQC — baseline thực tế RW5: cờ booking và no-show

**Kết luận: RW5 chưa đạt; phải sửa trước khi chốt nền cho VPS/signup.**
Kiểm tra bằng Auth/REST thật trên backend Docker dùng một lần, không chạm
database đang phục vụ hoặc VPS thật. Đây là đầu vào của Q02/T01,T03,T04,T08
trong kế hoạch toàn bộ VPS + signup, chưa phải nghiệm thu sản phẩm.

## 1. Kết quả và phạm vi bằng chứng

| Hạng mục | Kết quả |
|---|---|
| Candidate kiểm cuối | 902file; SHA256 `e4facf4013b0b596bb0a159c29f8b36b2f29f53ea95ba2d5b9ff6c7c071cd719` |
| Schema/runtime | 564business +12directory migrations; runtime181file |
| Hồi quy đã có | 441/441controls vẫn đạt trên chính candidate này |
| Baseline RW5 mới | 32controls:10đạt,22không đạt; gồm2assertions tranh khóa giữ cọc bị chặn ở lỗi CHECK trước cửa sổ khóa |
| Toàn diagnostic | 473controls:451đạt,22không đạt; exit1, không gọi là suite xanh |
| Khóa đồng thời | Giữ29races cũ đạt; thêm2barriers thật: session hết hạn vẫn ghi được là lỗi, no-show không ghi phí được tuần tự hóa |
| No-show giữ cọc | HTTP400/SQLSTATE23514, booking giữ confirmed,0fee và không có effects nửa chừng |
| Direct ACL | Diagnostic đạt; không chứng minh mọi đường RPC/definer gián tiếp an toàn |
| Bảo toàn | Source/runtime/migrations/schema và guard index/ledger/70hàng khớp trước-sau; fixture đã dọn |

Lần chạy cuối: fixture `21daa67cd63b`, backend `d8df7fdac4b2`, từ
03:28:41Z đến03:31:48Z ngày27/10/2026. JSON đã lọc trong
[artifact](../../../artifacts/roomqc-booking-flags-baseline-local-2026-10-27.json).
Số22 là số assertions không đạt, không phải22lỗi độc lập hoặc22ca release.
Hai assertions giữ cọc/concurrency chưa vào cửa sổ khóa do lỗi23514; chưa có
bằng chứng duplicate fee hoặc chống duplicate fee cho nhánh đó.

## 2. Những vấn đề đã tái hiện và ảnh hưởng

| Nhóm / mức ưu tiên | Expected → actual | Ảnh hưởng và việc nhận |
|---|---|---|
| F1 — High, quyền hiện thời | Staff được xác nhận không có bookings update/manage vẫn checked_out/cancelled/no_show, HTTP200 và có effects. Manager không được giao hotel vẫn hủy được. Owner locked, session hết hạn, hotel inactive hoặc session hết hạn trong lúc chờ booking lock vẫn ghi được; active no-show không ghi phí cũng chấp nhận locked owner | Có đường gọi vượt quyền cùng tenant dù UI ẩn nút. Khép actor/session/capability/assignment tại server cho mọi trạng thái, kiểm lại sau khóa |
| F2 — High, trả phòng bỏ core | Legacy transition checked_in→checked_out trả200; booking checked_out nhưng phòng occupied_clean,0invoice,0canonical room event | Trạng thái và tài chính không thống nhất; không được để lối tắt tránh core checkout |
| F3 — High, checkout sau cờ | Owner đánh sleep_out/skipper thành công; gọi core checkout trả409, booking/phòng giữ cờ và0invoice | Luồng hợp lệ có thể kẹt không trả phòng được; sửa contract occupancy và core, không ép trạng thái bằng request client riêng |
| F4 — High, đồng bộ và nguồn sự kiện | Sleep_out không tăng canonical room event; audit ghi sleep_out→sleep_out. Bỏ cờ trả200, booking checked_in nhưng phòng vẫn sleep_out. DND cũng nhận cờ booking mà không đổi phòng | Workflow và màn phòng có thể hiểu khác booking; cần cùng transaction, source canonical và old/new đúng |
| F5 — High, no-show giữ cọc | Booking overdue hợp lệ bị400/23514,0fee. Source RPC chèn payment_method deposit trong khi CHECK được khai báo với cash/bank_transfer/pending_refund | Tùy chọn đang dùng trên UI không hoàn tất. Cần đối chiếu constraint và ý nghĩa nhận/giữ/hoàn cọc; không chỉ nới CHECK mà bỏ đối soát tiền |
| F6 — Medium, policy và kết quả retry | Legacy gọi no_show cho booking tương lai vẫn200. Active no-show không ghi phí lần đầu200, lặp cùng ý định trả400 dù effects lần đầu đã commit | Có thể vượt điều kiện quá giờ; mất response khiến người dùng tưởng thao tác thất bại. Đưa overdue và stable command/result vào mọi đường gọi |
| F7 — Medium, kiểm đầu vào | Skipper debt âm được200 và ghi dữ liệu | Số công nợ không hợp lệ; validate numeric/đơn vị/biên tại server và client |

Các mức trên dùng để xếp thứ tự sửa trong local review; chưa thay đánh giá
release của reviewer. Không tái hiện việc đọc/ghi chéo tenant ở ca foreign
tenant đã thử; không suy từ một negative control rằng toàn bộ tenant isolation
đã được nghiệm thu.

## 3. Những điều đạt và giới hạn phải giữ

- Owner checkin canonical rồi sleep_out chạy được; fixture staff không quyền
  có đối chiếu capability riêng, không dùng tài khoản owner để thử negative.
- Staff không quyền sleep_out và foreign tenant hủy booking đều bị chặn,
  snapshot effects không đổi. Các negative khác ởF1 vẫn hở.
- Fault audit sau ghi booking/phòng hoàn tác toàn bộ; gỡ fault rồi gọi lại
  chạy được. Lỗi no-show giữ cọc cũng không để lại trạng thái/fee nửa chừng.
- No-show không ghi phí có positive200. Hai request thực cùng chờ khóa booking
  cho kết quả200/400, booking no_show và0fee. Điều đó chỉ chứng minh nhánh này
  tuần tự hóa được; retry thành công vẫn thiếu stable receipt.
- Khóa owner của no-show được kiểm ở nhánh không ghi phí. Lỗi23514 của nhánh
  giữ cọc không được tính làm bằng chứng chặn tài khoản locked.

Hook `useBookingFlagTransition.ts` hiện chỉ có định nghĩa khi tìm literal trong
source; chưa thấy UI import khác. `useMarkBookingNoShow.ts` có caller thật là
`MarkNoShowDialog.tsx`. Endpoint vẫn gọi được qua REST; không coi một hook ít
dùng là endpoint đã retirement trên môi trường triển khai. Deployed consumers
và function/trigger graph còn cần disposition theo kế hoạch.

## 4. Lịch sử lần chạy và chất lượng fixture

1. Preflight của driver ban đầu trỏ nhầm tên helper mới; bị chặn trước khi
   tạo fixture. Sửa đường dẫn driver, giữ kiểm syntax bắt buộc.
2. Fixture `ebf485c76524`, backend `d737b48f3b81`, SHA `efe18eb6…` dừng tại
   barrier hai request no-show giữ cọc chưa quan sát được. Chưa xuất controls
   và chưa đối chiếu schema cuối; không gọi là proof đạt hoặc schema drift.
3. Fixture `6bae200994f5`, backend `737a0eeeac53`, SHA `9c474520…` ghi được
  470controls,441hồi quy đạt,21assertions không đạt. Review phát hiện negative
  locked no-show bị lỗi23514 che mất, nên chưa dùng assertion đó làm proof quyền.
4. Candidate cuối tách positive/locked/retry và race không ghi phí, thêm kiểm
   rollback lỗi giữ cọc. Vẫn giữ assertions giữ cọc và barrier ở trạng thái
   không đạt; không giảm expected để làm xanh. Kết quả cuối473/451/22 ởmục1.

Cả ba fixture terminal exit1 và đã cleanup theo ownership. Không có lần nào
được đổi thành pass hoặc dùng thay default full/rebuild. Artifact giữ từng
source và kết quả, không ghi đè lịch sử.

## 5. Kế hoạch nhận và nghiệm thu tiếp theo

Thực hiện [RW5.1–RW5.7 tại19.12](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1912-rw5--kế-hoạch-sửa-sau-baseline-api-thật):
chốt compatibility → quyền hiện thời → canonical phòng/checkout → no-show và
cọc → command/caller/recovery → upgrade dữ liệu cũ và hồi quy. Chưa có sửa
function/schema/frontend trong lượt baseline này; delta chỉ ở native harness
và tài liệu. Không báo các lỗiF1–F7 đã được khắc phục.

Sau RW5 còn RW6–RW8, staged quote/payment/legacy/correction/retention trong
Q02, Q03workflow/advisors và Q04freeze/full/independent rebuild. Sau nền mới
tiếp cảnh báo, admission/budget, signup/jobs, console, Linux/restore, E2E/tải
và pilot theo roadmap hiện có. Toàn bộ scope vẫn là VPS + signup.

Full control440 thuộc901; frontend171/room-source77 thuộc900. Không chạy lại
chúng ở902 trong lượt baseline và không gán sang source mới. Không native
advisor scan mới; scan720cũ vẫn cần disposition. Chưa E2E browser/Android,
production Linux/mount/restore/load, real email/provider/device hoặc deploy.

Giữ70hàng worksheet `not_run`,122release entries `unverified`, reviewers và
gates/signoff. Không mở đăng ký public hoặc ký nghiệm thu từ diagnostic này.
