# RoomQC — phiếu thu checkout bền vững trong transaction server

Ngày: **27/10/2026, Asia/Bangkok**. Phạm vi: phần hóa đơn của Q02 trong
[kế hoạch toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
Không xác nhận Q02, E2E hoặc sản phẩm đã hoàn tất.

## 1. Kết quả và candidate

Server tạo phiếu thu cùng transaction với checkout, room transition, audit và
command receipt. Trình duyệt đóng hoặc mất response không làm mất bước tạo
phiếu thu. Group checkout có invoice ID của từng thành viên; replay dùng lại
đúng receipt và không tạo thêm hóa đơn. Phiếu thu đã phát hành không chứng
minh đã thu đủ tiền hoặc đã phát hành hóa đơn điện tử qua nhà cung cấp.

Candidate có phạm vi **875 file**, SHA-256
`4a5fe80d25af4d1b5bd8bcb7c5d3b0be0896e64f4d4be194a8058c966c223263`;
**561 business + 12 directory migrations**, runtime binding **164 file**.
Migration mới: `20261026235327_checkout_invoice_atomic_receipt.sql`, được tạo
bằng CLI. Không sửa lịch sử migration cũ hoặc database đang phục vụ.

| Bằng chứng local | Kết quả | Phạm vi thực sự |
|---|---|---|
| Native room writers | **242/242**, exit 0 | Giữ 219 controls trước và thêm 23 invoice controls; Auth/REST/DB fixture thật |
| Frontend | **152/152, 13 file** | 137 hồi quy cũ + 10 bài invoice helper/print mới + 5 bài danh sách hóa đơn đã có; có mocks |
| TypeScript app | Exit 0 | Không thay bằng kiểm kiểu một file riêng |
| ESLint | **0 lỗi / 59 cảnh báo**, 33 file | 50 cảnh báo trong phạm vi trước; hai file hóa đơn được bổ sung có 9 cảnh báo `no-explicit-any` |
| Full control với DB opt-in | **384/384**, 0 fail/skip/cancel | Cùng candidate; không thay default full backend hoặc rebuild độc lập |
| Hồi quy nguồn phòng | **77/77**, exit 0 | Source, runtime và migrations khớp candidate cuối; schema sau fault không đổi |

CLI advisors **2.121.0** đã hoàn tất: **667 findings**, gồm 27 INFO về RLS
không có policy, 7 INFO về FK chưa có index, 498 INFO về index chưa dùng và
135 WARN về nhiều permissive policies. Đây là đầu vào review theo object và
workload, chưa phải disposition hoàn tất hoặc bằng chứng mọi finding là lỗi.

Publication bắt buộc đối chiếu source/runtime/migrations, guards và 70 hàng
worksheet không đổi; kiểm cleanup độc lập đủ 27 lần và không còn tài nguyên
owned. Chỉ kết quả publication thành công mới xác nhận hai điều kiện cuối;
artifact giữ counts và kết quả từng lần kiểm.

## 2. Lỗi trước sửa được tái hiện

[Checkpoint caller867](roomqc-room-operation-callers-local-2026-10-27.md) vẫn
để invoice ở client. Baseline mới trên 560 business migrations đạt **219/223**:
219 controls cũ giữ nguyên, 4 controls invoice thất bại. Server đã checkout
nhưng chưa có phiếu thu khi không chạy browser helper; không có invoice ID,
snapshot tài chính hoặc số hóa đơn để đối chiếu sau replay/hai tenant.

Helper cũ đọc rồi chèn nên không có ràng buộc chống tranh chấp transaction.
Generator thủ công đếm theo tenant trong khi invoice number là UNIQUE toàn
bảng. Màn in còn tự đổi VAT/tổng tiền trên DB trước khi in, làm lệch phiếu thu
khỏi giao dịch checkout. Group UI đánh dấu inspection completed dù checkout
không phải bằng chứng đã kiểm phòng.

## 3. Thay đổi server và giao diện

- Hóa đơn tự động có actor/command provenance, snapshot và FK về command
  receipt. FK deferred cho phép lưu hóa đơn và command trong cùng transaction.
  Unique index bảo đảm một hóa đơn tự động cho booking; thêm index tra cứu
  theo booking và source FK. Chưa có benchmark sức chứa từ các index này.
- `private.save_booking_room_command` chỉ tạo hóa đơn cho checkout **thành
  công**; terminal cancellation không tạo invoice. Group parent giữ kết quả
  con; hủy thắng không phát sinh hóa đơn, core thắng trả kết quả đã commit.
- Số hóa đơn tự động dùng sequence toàn hệ thống với prefix `RQC-HD`, không
  đếm các row đang có. Không cắt giá trị sequence dài; khoảng trống sau
  rollback là chủ ý, không có nghĩa đã phát hành hóa đơn.
- Phiếu thu chụp subtotal, VAT, service fee, damage, deposit và amount paid
  từ booking sau pricing trigger. Tối đa hai dòng tổng hợp cộng đúng subtotal;
  component rates/charges được chụp riêng, không tính lại số đêm/giờ để giả
  chi tiết khác quote đã chốt. Chi tiết service/consumption và quy tắc quote
  còn phải đối soát trong phần tài chính/legacy của Q02.
- Guard chặn sửa tài chính, source, line items, trạng thái hoặc xóa phiếu thu
  tự động, kể cả qua service role và đường definer gián tiếp. Các metadata
  email, bên mua VAT và e-invoice được giữ tương thích theo quyền hiện có;
  không cấp thêm quyền table/function/sequence cho client.
- Ba màn checkout bỏ tạo invoice từ browser. Helper cũ chỉ còn kiểm tra đọc,
  có tenant/hotel/booking/type filter và không nuốt lỗi hoặc tự tạo bản thay.
- Màn in đọc đúng receipt theo tenant/hotel/booking, dùng tiền đã lưu; không
  sửa VAT/tổng khi in, không lấy quote prop làm giá cuối. Poll tự động hữu
  hạn, có đường kiểm tra lại và không mời checkout lại khi thiếu phiếu thu.
- Menu hóa đơn không mời hủy trực tiếp phiếu trả phòng đã chốt. Nhân bản tạo
  bản nháp độc lập; quy trình điều chỉnh/đảo hóa đơn cần triển khai riêng.
- Group UI bỏ thao tác giả hoàn tất inspection. Việc hoàn tất kiểm phòng
  thuộc workflow kiểm phòng thực tế, không được suy từ checkout.

## 4. Những bài kiểm mới chứng minh điều gì

23 invoice controls gồm: có invoice ngay sau commit mà không cần browser;
snapshot và tổng dòng khớp tài chính; 20 replay giữ một invoice; hai tenant
có số khác nhau; các checkout độc lập gửi REST đồng thời không trùng số;
manager đúng hotel có positive control; group có đủ invoice IDs và replay
không effects; lỗi invoice đơn hoặc thành viên thứ hai rollback cả core;
phiên hết hạn sau chèn invoice vẫn rollback; sequence dài không bị cắt.

Negative controls kiểm chặn sửa/xóa/giả provenance, service key ghi đè tiền,
liên kết booking khác tenant và chèn thêm receipt cho booking đã có invoice.
Metadata email, tạo VAT claim và gửi dữ liệu bên mua VAT dùng DB/API local;
không gửi email Internet hoặc gọi nhà cung cấp hóa đơn thuế.

Giữ **31 controls pure client ứng dụng** và **20 lock races cũ** trong 219
controls hồi quy. Các request invoice gửi đồng thời không được gọi là race
có barrier thật mới. Unit/hook/component có mocks không thay bằng chứng click
đủ các màn, lifecycle SDK hay browser/Android E2E.

## 5. Lịch sử lỗi trong quá trình sửa

Giữ đầy đủ terminal theo từng source, không kế thừa bản giữa làm bản cuối:

1. Baseline: **219/223**, thiếu 4 bằng chứng hóa đơn khi không có browser.
2. Bản đầu có migration: **230/234**. Cancellation cũng đi qua hàm save chung;
   materializer đã chạy nhầm cho lệnh hủy và làm hủy bị từ chối. Đã sửa để chỉ
   materialize kết quả checkout success không có terminal state. Không nới
   assertion; các bài cancellation/recovery/race cũ đạt lại.
3. Các bản giữa đạt **239/239**, sau đó **241/241**; full control từng bản đạt
   384/384. Giữ source riêng, không dùng thay kết quả cuối 242/242.
4. Frontend ban đầu **146/147** do matcher khoảng trắng tiền tệ. Lượt tiếp
   unit đạt147 nhưng TypeScript tìm lỗi `abortSignal` sau `maybeSingle`.
   Sau sửa builder, unit152 đạt nhưng kiểu hotel cho thấy fallback không có
   cột `tax_code`; chỉ dùng tax code từ hotelInfo prop khi được cung cấp.
   Candidate cuối unit152/152, TS và lint exit0; không thêm `any` để che lỗi.

## 6. Phần còn mở và cách giao bước kế

**Q02 còn mở**: adjustment notes vẫn được ghi ở client; thông báo chưa có
durable outbox/dispatch/receipt cho toàn luồng. Đóng browser vẫn có thể mất
hai phần này. Cần transaction/outbox theo command ID, retry và trạng thái để
đối soát; không tự chạy lại core đã commit để bù việc phụ.

Staged quote/payment, generator hóa đơn thủ công, service/consumption details,
legacy invoices và RW5–RW8 còn phải đối chiếu. Migration không xóa, sửa số,
dedup hoặc tự gắn provenance cho invoice cũ. Receipt cũ xung đột với booking
sẽ dừng checkout để review thay vì ghi đè dữ liệu tài chính; cần luồng xử lý
legacy, điều chỉnh/đảo và retention trước khi phát hành.

Tiếp theo: khép notes/notification và writer graph Q02; Q03 configured
workflow/dispatcher/recipient/offboarding; Q04 freeze/default full/rebuild.
Toàn bộ alerts, admission/budget, signup/jobs, hai console, Linux/offsite,
E2E/load và pilot vẫn theo 8 đợt của plan. Không dùng phần invoice này thay
nghiệm thu VPS hoặc khả năng phục vụ 1.000 khách sạn.

## 7. Hồ sơ và bảo toàn môi trường

[Artifact đã loại dữ liệu nhạy cảm](../../../artifacts/roomqc-checkout-invoice-local-2026-10-27.json)
chứa source/build binding, từng control, failures, frontend, advisor summary và
cleanup. Publication kiểm container/volume/network bằng exact ownership label
cho cả baseline, failed/interim/final runs; không xóa theo tên chung.

Chỉ report, bốn tài liệu điều phối và artifact được đồng bộ sang cây chính;
implementation giữ tại integration. Không deploy vào runtime localhost đang
phục vụ, không đổi VPS/DNS/provider, không gửi Internet email.

**70 hàng `not_run`, 122 mục `unverified`, gates/reviewer/signoff giữ nguyên.**
Đây là bằng chứng local có phạm vi; [worksheet](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md)
vẫn yêu cầu đúng môi trường trước khi ký nghiệm thu sản phẩm.
