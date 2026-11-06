# RoomQC — ghi chú điều chỉnh cùng giao dịch nhận/trả phòng

Ngày: **27/10/2026, Asia/Bangkok**. Phạm vi: phần ghi chú của Q02 trong
[kế hoạch toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
Đây là bằng chứng local có phạm vi; Q02 và sản phẩm chưa nghiệm thu.

## 1. Kết quả và candidate

Ghi chú điều chỉnh được gửi trong lệnh nhận/trả phòng và lưu cùng transaction
với booking, room transition, audit, command receipt và phiếu thu checkout.
Server nối vào ghi chú hiện thời của booking đã khóa. Không cần trình duyệt
chạy thêm UPDATE sau khi core thành công; đóng tab hoặc mất response không
làm mất riêng bước lưu ghi chú. Replay dùng lại receipt, không nối lần hai.

Candidate **876 file**, SHA-256
`4a586c4b1d3d8413e114df6e1b547835aa376279105fee3542db11fd4f442037`;
**562 business + 12 directory migrations**, runtime binding **164 file**.
Migration mới `20261027002802_booking_adjustment_notes_atomic.sql` được tạo
bằng CLI 2.121.0; không sửa lịch sử migration hoặc database đang phục vụ.

| Bằng chứng local | Kết quả | Phạm vi thực sự |
|---|---|---|
| Native room writers | **288/288**, exit 0 | Giữ 242 controls invoice875 và thêm 46 adjustment controls, Auth/REST/DB thật |
| Tranh khóa | **23 races đạt**, có barrier thật | Giữ 20 races cũ; thêm 1 concurrent note edit và 2 thứ tự writer/cancel |
| Application client | Giữ 31 controls cũ + **3 controls note mới** | Client ứng dụng được build và chạy với Auth/REST fixture thật; chưa browser/Android |
| Frontend | **164/164, 13 file** | 152 hồi quy trước + 12 bài normalization, intent/recovery và xác nhận ghi chú; có mocks |
| TypeScript app | Exit 0 | Toàn project ứng dụng, không thay bằng kiểm một file |
| ESLint | **0 lỗi / 59 cảnh báo, 33 file** | Cảnh báo `no-explicit-any` còn tồn tại; chưa warning-free |
| Full control với DB opt-in | **384/384**, 0 fail/skip/cancel | Cùng candidate cuối; chưa default full backend hoặc rebuild độc lập |
| Hồi quy nguồn phòng | **77/77**, exit 0 | Cùng candidate cuối; source/runtime/migrations và schema sau fault không đổi |

CLI advisors2.121.0 đã hoàn tất trên cùng candidate: **667findings**, gồm
27INFO RLS không có policy,7INFO FK chưa có index,498INFO index chưa dùng,
135WARN nhiều permissive policies. Count là đầu vào review theo object và
workload, không chứng minh mọi finding đã được disposition hoặc là lỗi.

Publisher bắt buộc kiểm các kết quả terminal, source/runtime/migrations,
guards/worksheet không đổi và cleanup độc lập18lần. Artifact chỉ được tạo
khi tất cả điều kiện đều đạt; không đổi trạng thái nghiệm thu từ suite xanh.

## 2. Lỗi trước sửa và lịch sử thử nghiệm

[Invoice875](roomqc-checkout-invoice-local-2026-10-27.md) đã tạo phiếu thu ở
server nhưng ghi chú vẫn là client follow-up. Hai màn đơn lấy booking.notes
đã tải từ trước rồi ghi đè cả cột; group cũng nối và UPDATE sau core. Mất tab
có thể mất ghi chú; một ghi chú ca trước vừa thêm có thể bị bản tải cũ ghi đè.

Baseline giữ 561 business migrations và đạt **242/245**, không đạt ba bài mới:
RPC nhận/trả phòng đơn có trường notes mới trả404 vì chưa có contract; group
trả200 nhưng không lưu ghi chú. Cả242controls cũ vẫn đạt. Không gọi group200
là thành công đầy đủ và không bỏ ba assertion để suite xanh.

Bản migration đầu đạt **244/245**: nhận phòng và group lưu được ghi chú; bài
checkout đơn trả400. Fixture positive này không có room rate và không truyền
monetary quote, làm bước invoice tổng tiền không hợp lệ. Đã cấp room_price và
subtotal hợp lệ cho fixture, giữ nguyên financial guards và assertion note.
Các bài mở rộng nằm sau early return chưa chạy ở lượt244/245; không dùng lượt
này làm proof cho46controls. Full control384/384 và frontend164/164 bản giữa
giữ source riêng, không kế thừa làm bằng chứng bản cuối.

## 3. Contract và thay đổi

- `perform_checkin` và `perform_checkout` có optional `p_adjustment_notes`.
  Chỉ một public signature cho mỗi RPC; các body cũ được giữ private và thu
  quyền PUBLIC/anon/authenticated/service_role. Không cấp thêm quyền bảng.
- Request không có ghi chú giữ nguyên canonical JSON cũ. Ghi chú mới là text
  có nội dung, tối đa10000ký tự; nằm trong request của actor+command. Cùng
  key khác nội dung bị conflict, không âm thầm nối lý do khác vào core cũ.
- Cancellation hiểu request có ghi chú. Fence thắng thì writer muộn không
  thêm ghi chú/invoice/core; writer thắng thì hủy trả committed receipt.
- Group giữ ghi chú của từng member trong parent request, truyền cho child
  command và giữ `adjustment_notes_applied` của từng child. Lỗi member sau
  rollback cả group, bao gồm notes và invoices của member đã chạy trước đó.
- Private save helper chỉ nối notes cho checkin/checkout success, không cho
  terminal cancelled. Dùng giá trị notes hiện thời của row đã khóa, không
  dùng snapshot text từ browser. Sau mọi chờ/trigger vẫn kiểm live session.
- Hai màn đơn nối **6điểm gọi** và group nối **1điểm** vào contract mới. Bỏ
  UPDATE notes trong client follow-up; format lý do dùng chung. Các chỉnh sửa
  booking thông thường ngoài command này chưa được coi đã khép writer graph.
- Client validate text trước gửi, giữ nguyên trong pending intent; khi có
  notes phải nhận `adjustment_notes_applied=true` mới xác nhận thành công.
  Server cũ bỏ qua notes không được client coi là thành công đầy đủ.

## 4. Bài kiểm mới chứng minh điều gì

46controls kiểm notes có ngay sau commit mà không có browser, giữ notes cũ,
request/receipt gắn đúng text;20replay và lookup từng họ lệnh không nối lại;
cùng key khác note conflict. Có positives manager đúng hotel và negatives
khác tenant/hotel, text quá dài, chỉ khoảng trắng hoặc tab/xuống dòng.

Fault ở UPDATE notes của checkin, checkout và member cuối group được quan
sát bằng sequence riêng: không còn booking/room/audit/receipt/invoice/note
nửa chừng. Gỡ fault rồi cùng key phục hồi đúng một lần. Ba actual-client
controls cắt response sau commit rồi dựng client mới đọc receipt; không gửi
core lần nữa và giữ đúng notes. Chúng không phải browser đóng/mở thực tế.

Ba race mới dùng barrier xác nhận request đang chờ khóa: ghi chú ca trước
được commit trước khi nhả row lock vẫn giữ nguyên; hai thứ tự cancellation
và checkout có terminal đúng, late replay không thêm effect.20races cũ và
toàn242controls trước giữ hồi quy. Temporary faults được gỡ trước schema
fingerprint cuối; publisher kiểm không còn tài nguyên owned của sáu runs.

## 5. Giới hạn và công việc tiếp theo

**Q02 còn mở.** Thông báo checkin/checkout/group vẫn là client best effort;
phải bổ sung server outbox/dispatch/receipt, recipient/offboarding và retry
đúng scope. Không chạy lại core đã commit để bù thông báo; không gọi toast
thành công là bằng chứng push/Telegram/email đã đến người nhận.

Notes là nội dung lý do do người có quyền gửi, chưa chứng minh quote/giảm phí
được server phê duyệt. Staged quote/payment, service/consumption, manual/legacy
receipt, correction/retention và RW5–RW8 vẫn theo inventory Q02. Không sửa,
xóa, backfill hoặc dedup dữ liệu cũ trong migration này.

Sau Q02 nhận Q03 configured workflow/action/config/dispatcher, quyền gián tiếp,
recipient/offboarding và disposition advisors; rồi Q04 freeze/default full
backend/rebuild độc lập. Tiếp các đợt alerts, admission/budget, signup/jobs,
hai console, Linux/offsite, browser/Android E2E, tải và pilot theo plan gốc.

## 6. Hồ sơ và bảo toàn môi trường

[Artifact đã lọc dữ liệu nhạy cảm](../../../artifacts/roomqc-booking-adjustments-local-2026-10-27.json)
giữ source binding, controls/races, terminal, failed history, advisors và cleanup.
Publication kiểm container/volume/network bằng exact ownership labels cho
baseline, first attempt, intermediate full, final writer/source/full:18queries,
không xóa theo tên chung hoặc đụng CRM/database đang phục vụ.

Chỉ report, bốn tài liệu điều phối và artifact được đồng bộ sang cây chính.
Implementation giữ ở integration, chưa deploy localhost/VPS, không đổi DNS
hoặc provider, không gửi Internet email hay thông báo ra ngoài.

**70 hàng `not_run`, 122 mục `unverified`, gates/reviewer/signoff giữ nguyên.**
Đọc [worksheet](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) để nghiệm
thu đúng môi trường; kết quả local này không ký E2E hoặc sản phẩm.
