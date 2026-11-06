# RoomQC — bằng chứng local cho client và phục hồi lệnh phòng/booking

Ngày chốt: **27/10/2026, Asia/Bangkok**. Đây là một phần Q02/T01/T03/T04/T08
trong [kế hoạch toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
Không phải biên bản nghiệm thu sản phẩm, trình duyệt, Android hoặc VPS.

## 1. Candidate và kết quả được chứng minh

Candidate có phạm vi **867 file**, SHA-256
`fe6afafc8be269c786191a10d11273bdbf851e4054af077e572f6a61e18d0d15`;
**560 business + 12 directory migrations**, runtime binding **164 file**.
Không thêm hoặc sửa schema trong lượt nối caller này. Mã thực hiện nằm ở
integration; chỉ tài liệu và artifact đã loại dữ liệu nhạy cảm được đồng bộ
sang cây giao chính. Chưa triển khai vào localhost đang phục vụ hoặc VPS.

| Phạm vi | Kết quả | Giới hạn của bằng chứng |
|---|---|---|
| Native room writers | **219/219**, exit 0 | Giữ đủ 188 controls trước và thêm 31 controls dùng pure client ứng dụng cho sáu thao tác; 20 lock races là hồi quy đã có |
| Native nguồn phòng | **77/77**, exit 0 | Giữ sáu race và client transition trước đó; không phải thêm 77 ca sản phẩm |
| Full control với DB opt-in | **384/384**, 0 fail/skip/cancel | Không thay default full backend hoặc dựng lại độc lập candidate867 |
| Frontend unit/hook/component và hồi quy | **137/137, 10 file** | Có mocks; chưa chứng minh thao tác trên các màn trong trình duyệt |
| TypeScript app project | Exit 0 | Chỉ xác nhận kiểu trong phạm vi project |
| ESLint 26 file | Exit 0, **0 lỗi / 50 cảnh báo** | Cảnh báo `no-explicit-any` còn tồn tại; không gọi là lint sạch cảnh báo |

50 cảnh báo thuộc GroupCheckoutDialog (10), RoomTransferDialog (1),
RoomBookingDialog (11), QuickOkButton (2), BookingsPage (26). Không sửa rộng
các kiểu chưa liên quan chỉ để che số cảnh báo.

Source/runtime/migrations giữ nguyên trong từng lượt kiểm; các lượt thành
công đối chiếu cùng scoped source. Giữ nguyên primary index, hai delivery
ledger, 70 hàng worksheet và quyết định gates/signoff.

## 2. Thay đổi người dùng sẽ nhận được sau khi tích hợp

Sáu thao tác quick check, undo, chuyển phòng, nhận phòng, trả phòng và trả
phòng nhóm dùng client chung. Client lưu payload đã chuẩn hóa và key trước
network; giới hạn theo actor/tenant/runtime. Khi chưa rõ kết quả, tra receipt
trước khi gửi lại đúng body/key. Timeout hoặc mất response không tự xóa pending.
Hủy chỉ kết thúc khi server xác nhận cancellation hoặc trả receipt đã commit.

Executor và recovery panel có kiểm session/profile/scope, deadline, abort và
epoch để response cũ không làm thay đổi giao diện sau logout hoặc đổi ngữ cảnh.
Giao diện cho kiểm tra lại hoặc hủy an toàn; thông báo kết quả lấy từ server.
SessionStorage chỉ giữ phạm vi tab còn dữ liệu, chưa bảo đảm phục hồi xuyên
tab/thiết bị hoặc sau khi người dùng xóa storage.

| File | Số điểm gọi core đã nối |
|---|---|
| `src/hooks/useQuickRoomCheck.ts` | 1 quick check |
| `src/hooks/useUndoQuickRoomCheck.ts` | 1 undo |
| `src/components/bookings/RoomTransferDialog.tsx` | 1 chuyển phòng |
| `src/components/rooms/RoomBookingDialog.tsx` | 1 nhận phòng, 2 trả phòng |
| `src/pages/bookings/BookingsPage.tsx` | 1 nhận phòng, 2 trả phòng |
| `src/components/bookings/GroupCheckoutDialog.tsx` | 1 trả phòng nhóm |

Inventory source xác nhận **10/10 điểm trong 6 file**, không còn gọi trực tiếp
sáu core RPC tại các điểm đó. Bốn payload damage items đã truyền mảng JSON.
Đây là đối chiếu source, không phải bằng chứng đã click đủ mười đường UI.
Receipt dùng subtotal server; không gọi checkout thành công là đã thu tiền.
Đã bỏ timeout 800 ms từng được dùng để giả định hóa đơn sẵn sàng.

## 3. Native client proof và bài kiểm frontend

Harness bundle **pure core client ứng dụng thật**, giữ source hash và compiled
hash trước/sau, rồi dùng native Auth/REST và DB fixture. 31 controls gồm năm
bài cho từng sáu thao tác và một bài xung đột group body:

1. Core commit nhưng response bị giữ lại: lỗi trả về là outcome unknown,
   pending vẫn giữ đúng key và payload.
2. Client mới với phiên Auth mới tra receipt trước resend; nhận kết quả đã
   commit, không tạo thêm core effects.
3. Ngắt trước fetch: chưa có receipt; phục hồi gửi đúng payload/key đã lưu.
4. Hủy trước gửi lại: writer muộn cùng body bị chặn, không effects.
5. Commit trước hủy: cancellation trả completed receipt; không giả đã hủy.
6. Riêng nhóm: raw body khác body client đã lưu vẫn conflict, không effects.

Lỗi trước fetch hoặc sau khi đọc native response được chèn bởi fixture,
không phải cắt mạng vật lý. Đây không phải native E2E của SDK/session adapter,
hook React hoặc các màn ứng dụng. 20 lock races giữ từ bộ backend trước, không
được báo là 20 race mới của client ứng dụng.

137 frontend tests gồm core command (53), follow-ups (5), executor (7),
recovery panel (11) và hồi quy transition command (28), transition client (5),
transition executor (3), recovery cũ (10), useRooms (9), bulk actions (6).
Chúng kiểm payload/key/result binding, storage/deadline, pending/cancel,
scope/ABA và follow-up; mocks không thay browser/Android acceptance.

## 4. Lịch sử lần fail và sửa fixture

Lần đầu candidate có SHA
`3e818cb65cbe4f0ddc9d5be61bffd55e776c4c1243dfc2fd29b27205d7a8f1c9`:
**215/218, exit 1**. Ba failure được giữ trong artifact:

- Hai ca overlap chuyển phòng hourly/daily nhận HTTP400/no-effects thay vì
  conflict mong đợi. Fixture dùng giờ hiện tại cộng 1–2 giờ có thể qua ngày
  UTC; đã đổi sang ngày tương lai cố định chung và khoảng 10–11 UTC để bảo đảm
  overlap. Candidate cuối trả conflict và đạt. Lần fail chưa ghi safe reason,
  vì vậy chưa chứng minh chính xác SQL nào gây HTTP400 lúc đó.
- Writer muộn của group cancellation đã dùng raw body tối giản khác body
  chuẩn hóa client lưu, nên conflict409/no-effects. Fixture sửa để resend
  đúng captured body; thêm bài riêng giữ yêu cầu khác body phải conflict.

Không đổi backend/migration hoặc nới assertion để sửa các ca trên. Full
control chạy sớm hơn đạt384/384 nhưng source khác, không kế thừa làm bằng
chứng candidate cuối. Các lượt thành công cuối được ghi riêng trong artifact.

## 5. Follow-up chưa bền vững và phần Q02 còn mở

`runBookingOperationFollowUps` tách core receipt khỏi notes/invoice/inspection/
notification. Task lỗi không biến core thành thất bại; replay core không tự
chạy lại task; kiểm scope trước từng task và deadline tổng 10 giây. Deadline
không hủy task đã chạy. Invoice helper có thể tự nuốt lỗi, nên await helper
không chứng minh hóa đơn tồn tại.

Đây vẫn là **best effort trên client**. Đóng browser có thể mất việc phụ;
chưa có durable server queue/ID/receipt/retry cho cả chuỗi. Cần chốt transaction
hoặc outbox bền vững, đường xem trạng thái và đối soát/retry theo quyền hiện
thời. Chưa nghiệm thu staged quote/prepare-payment, legacy/service consumers,
RW5–RW8, configured workflow/dispatcher, recipient/offboarding và advisors.

Vì vậy **Q02 vẫn chưa hoàn tất**. Bước tiếp theo là phần bền vững và inventory
còn thiếu của Q02, rồi Q03; Q04 mới freeze/default full backend/independent
rebuild trên candidate cuối. Browser/Android, Linux/VPS, backup ngoài host,
load và pilot thuộc các đợt tiếp theo của cùng kế hoạch.

## 6. Cleanup, hồ sơ và nghiệm thu

Harness đã cleanup fixture; bước xuất bản kiểm độc lập container/volume/network
của lần writer fail và ba lượt native/control cuối bằng ownership label chính
xác. **12 phép kiểm, 0 tài nguyên còn lại** là điều kiện bắt buộc trước xuất
bản artifact. Không xóa theo tên chung hoặc tác động DB đang phục vụ.

[Artifact đã loại dữ liệu nhạy cảm](../../../artifacts/roomqc-room-operation-callers-local-2026-10-27.json)
ghi candidate, kết quả, build binding, failures, cleanup và giới hạn. Tài liệu
này cùng bốn plan/worksheet được đồng bộ; implementation không được mirror.

**70 ca `not_run`, 122 mục `unverified`, reviewer/signoff/gates giữ nguyên.**
Nghiệm thu từng môi trường vẫn theo [worksheet](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md):
54 local / 69 staging / 1 pilot. Scoped proof không tự ký nghiệm thu sản phẩm
hoặc xác nhận bản đang mở trong browser dùng candidate này.
