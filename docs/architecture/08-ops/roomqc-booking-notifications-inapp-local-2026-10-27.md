# RoomQC — nguồn thông báo nhận/trả phòng và xử lý trong ứng dụng

Ngày: **27/10/2026, Asia/Bangkok**. Đây là phần việc Q02 trong
[kế hoạch toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
**Chỉ nguồn thông báo và kênh trong ứng dụng có bằng chứng local; Push và
Telegram còn mở. Q02 và toàn bộ sản phẩm chưa nghiệm thu.**

## 1. Thay đổi và giới hạn bàn giao

Nhận/trả phòng đơn và từng thành viên trả phòng nhóm lưu một sự kiện thông
báo cùng transaction booking, phòng, ghi chú, phiếu thu, audit và command
receipt. Không lưu được nguồn hoặc hàng đợi thì toàn bộ giao dịch hoàn tác.
Hủy thắng trước thì không tạo sự kiện; giao dịch đã commit thì tra cứu hoặc
gửi lại cùng key trả đúng sự kiện cũ, không tạo thông báo lần hai.

Worker trong ứng dụng dùng tài khoản database riêng, chỉ được gọi hàm xử lý
lô có giới hạn. Nó kiểm tra lại khách sạn, trạng thái và phân công hiện thời
của người nhận trước khi ghi thông báo. Thông báo từng người, receipt chống
trùng và trạng thái công việc được commit cùng nhau. Lỗi ở người nhận sau
không để lại một nửa lô đã gửi; giữ nguồn và lịch thử lại với mã lỗi an toàn.

Ba màn booking không còn gọi gửi thông báo nhận/trả phòng sau core. Receipt
mới ghi rõ `notification_event_id` và `notification_state=queued`; giao diện
phân biệt “đã xếp hàng” với “đã gửi thành công”. Receipt lịch sử không có hai
trường này vẫn đọc được, không tự tạo bù hoặc gửi lại thông báo cũ.

**Push và Telegram chỉ có công việc đang chờ, chưa có adapter gửi trong lần
bàn giao này.** Worker luôn báo `external_dispatcher_ready=false`. Không dùng
kết quả kênh trong ứng dụng để đánh dấu các kênh ngoài đã gửi, thiết bị đã nhận
hoặc người dùng đã đọc. Module worker chưa cài vào runtime đang phục vụ.

## 2. Candidate và kiểm thử

Candidate **879 file**, SHA-256
`339fc646682b8633134bdcfd91fd42f6e3af5531837bb34d24903dc9e13dc042`;
**563 business + 12 directory migrations**, runtime binding **166 file**.
Migration mới `20261027005109_booking_notification_atomic_outbox.sql` được
tạo bằng CLI 2.121.0. Chỉ dựng và thử trên Docker fixture riêng.

| Bằng chứng | Kết quả | Phạm vi |
|---|---|---|
| Native room writers | **340/340** | Giữ đủ 288 controls notes876, thêm 52 notification controls; Auth/REST/Postgres thật |
| Tranh khóa thật | **25 races đạt** | Giữ 23 races, thêm hai worker tranh cùng nguồn và thu hồi phân công trong lúc worker chờ |
| Client ứng dụng | Giữ 31 controls cũ, 3 notes và thêm **3 notification recovery** | Chạy client thật với native fixture, mất response rồi phục hồi checkin/checkout/group |
| Frontend | **171/171, 13 file** | Có mocks; thêm kiểm queue receipt sai/thiếu, event trùng và chống browser gửi lại |
| TypeScript ứng dụng | **Exit 0** | Kiểm toàn project app |
| ESLint | **0 lỗi / 59 cảnh báo, 33 file** | Chưa warning-free |
| Full control, có DB opt-in | **389/389**, không fail/skip/cancel | Gồm 5 bài worker mới và direct ACL drill 30 bảng; chưa default full backend |
| Hồi quy nguồn phòng | **77/77** | Cùng candidate cuối; source/runtime/migrations/schema không đổi sau fault |
| Direct ACL native | **30 bảng**, 360 browser/probe + 108 private-service denials, 63 positives | Riêng 3 bảng thông báo có 36 + 12 denials; fixture native chỉ populate một phần |

[Artifact máy đọc](../../../artifacts/roomqc-booking-notifications-inapp-local-2026-10-27.json)
giữ terminal, từng control/race, số đo advisors và cleanup. Count advisors vẫn
là đầu vào review; chưa disposition theo object/workload. Publisher chỉ bàn
giao khi mọi bài của cùng candidate đạt, guards và 70 dòng nghiệm thu không
đổi, đồng thời truy vấn độc lập xác nhận không còn tài nguyên fixture.

## 3. Tình huống đã kiểm

- Checkin có một công việc Telegram; checkout có ba kênh; group chỉ dùng sự
  kiện của từng child, không tạo thêm một nguồn ở parent.
- 20 lần gửi lại và lookup giữ nguyên event, không thêm nguồn hoặc effects.
  Mất response trên client thật vẫn phục hồi được nguồn bền vững.
- Lỗi INSERT nguồn hoặc outbox ở nhận/trả phòng đơn và group hoàn tác cả
  booking, tiền, phòng, ghi chú, phiếu thu, audit và receipt.
- Cancellation không tạo công việc; kết quả status không lộ command của
  tenant khác; anonymous, service key và owner bị khóa không đọc được status.
- Browser/service role không gọi được producer/dispatcher private. Không
  cấp DML trên ba bảng mới; RLS và thu quyền mặc định được giữ.
- Worker thật dùng login hạn chế. Từ chối login quản trị, quyền SELECT bảng
  nghiệp vụ được cấp thêm và vai trò thừa hưởng ngoài vai trò chuyên dụng.
  Bài login không an toàn dùng installer của fixture; tên bài có chữ
  superuser không thay bằng chứng riêng cho một login superuser thực sự.
- Thu hồi phân công, khóa người nhận và khách sạn ngừng hoạt động được kiểm
  lại khi gửi; lần lượt không gửi cho người bị loại, kết thúc no_recipients
  hoặc obsolete. Không lấy JWT cũ làm quyền hiện thời.
- Lỗi ở người nhận sau hoàn tác cả batch; backoff chặn gửi lại ngay. Khi lỗi
  được gỡ, thử lại một lần ghi đủ thông báo và receipts, giữ nguyên nguồn.
- Chạy lại/khởi động lại worker không trùng thông báo. Hai worker sau barrier
  khóa thật chỉ tạo một lần và bộ đếm chỉ ghi một lần delivery mới.
- Status thể hiện in_app delivered riêng với push/telegram pending; logs
  worker chỉ có count và mã an toàn, không chứa thông tin đăng nhập/người nhận.

## 4. Lịch sử lỗi được giữ

Baseline đạt **288/291**: ba thao tác thiếu receipt nguồn thông báo. Lượt đầu
có migration mới dừng ở SQLSTATE42601 do CASE chưa đặt trong ngoặc ở IF;
fixture parser riêng xác nhận bản sửa. Lượt sau chạm quota200 của gói dữ liệu
thử, rồi một bài kiểm thử không được cấp vai trò hệ thống Postgres. Đã nâng
gói clone riêng lên300 phòng và dùng vai trò NOLOGIN tạm do fixture sở hữu;
không nới quota hoặc quyền production.

Lượt native chạy đủ đầu tiên đạt **329/340**, không đạt11 bài dispatcher:
`user_hotels` có khóa `(user_id,hotel_id)`, không có `id`. Đã sửa thứ tự khóa
theo đúng composite key và chạy lại đầy đủ. Tất cả288 controls cũ vẫn đạt
trong lượt đỏ. Artifact giữ các lỗi và các lần full/source/frontend trước;
không kế thừa kết quả xanh của candidate cũ làm bằng chứng bản cuối.

Lượt kế tiếp đạt **339/340**. Bài zero-recipient chỉ khóa owner và manager,
nhưng các bài trước đã tạo thêm nhân viên hợp lệ. Đã khóa toàn bộ candidate
snapshot của chính sự kiện; vẫn giữ assertion không có delivery và trạng
thái phải là no_recipients. Không loại người nhận hợp lệ để làm xanh kiểm thử.

## 5. Việc nhận tiếp theo và tiêu chí nhận

1. **Push/Telegram:** chốt nội dung và cấu hình từng kênh, recipient/target
   snapshot, kiểm quyền/cấu hình sống trước gửi, trạng thái theo target,
   retry có giới hạn, lỗi vĩnh viễn và unknown outcome khi provider nhận mà
   response bị mất. Dùng đích nội bộ trước; chưa gọi dịch vụ thật.
2. **Nghiệm thu thông báo toàn kênh:** fault từng target, worker chết sau gửi,
   response mất, hai worker, offboarding/config đổi trong lúc chờ và restart.
   Không đánh dấu delivered từ HTTP200 đơn thuần; phải định nghĩa chính xác
   receipt nào chứng minh việc gì. Có trang/CLI đối soát an toàn trước triển khai.
3. **Q02 còn lại:** staged quote/payment, legacy/manual receipts, sửa sai,
   retention và RW5–RW8. Không suy từ phiếu thu issued sang đã thu tiền,
   hóa đơn thuế hoặc đã kiểm phòng.
4. **Theo roadmap hiện hành:** Q03 workflow/config/dispatcher và advisors →
   Q04 freeze/default full/rebuild → cảnh báo/admission/signup/jobs/consoles
   → Linux/restore/offsite → browser/Android E2E, tải, RC và pilot.

Không đổi 8 đợt/27 gói/T01–T25/70 ca. **70 ca vẫn not_run, 122 mục release
vẫn unverified; gates/reviewer/signoff không đổi.** Chưa migrate database đang
phục vụ, chưa triển khai VPS, DNS, provider, email Internet hoặc worker daemon.
Primary chỉ nhận tài liệu/artifact đã lọc; implementation vẫn ở integration.
