# RoomQC — bàn giao backend đầu tiên cho cờ booking và quyền hiện thời

Phạm vi toàn dự án giữ nguyên **VPS + signup / plan + nghiệm thu**. Bản này
chỉ bàn giao một phần RW5 trong Q02/T01,T03,T04,T08. Có sửa backend và types
trong worktree integration; chưa triển khai lên app8082, database đang phục
vụ hoặc VPS. [Artifact đã loại dữ liệu riêng tư](../../../artifacts/roomqc-booking-flags-core-local-2026-10-27.json)
ghi kết quả, source, lịch sử không đạt và kiểm tra cleanup.

## 1. Kết quả trên cùng candidate

Candidate **903B**, SHA
`afd1413c0642083ca13a205793b0fdf5ce894adcd917de739d72400b9fb407ba`:
903 file trong manifest, 565 business + 12 directory migrations và 181 file
runtime. Số file không phải phiên bản duy nhất; dùng SHA để phân biệt 903A.

| Kiểm tra | Kết quả và giới hạn |
|---|---|
| Native Auth/REST nghiệp vụ | **497/500**, exit1; còn3assertions no-show không đạt |
| Hồi quy trước RW5 | **441/441**, giữ đủ labels của checkpoint external |
|32controls baseline RW5 | **29/32**, trước sửa là10/32;19assertions chuyển đạt, không phải19bug riêng |
| Command/guard mới | **27/27**; gồm6REST trực tiếp thật và2SQL actor assumption, phân biệt trong artifact |
| Tranh khóa thực |34barriers đã quan sát,33đạt/1không đạt; nhánh giữ cọc vào được cửa sổ khóa nhưng vẫn lỗi ledger |
| Nguồn trạng thái phòng | **77/77**, exit0 |
| Full control | **440/440**, exit0, không skip/cancel; không thay default full backend hoặc rebuild độc lập |
| TypeScript app | `tsc -p tsconfig.app.json --noEmit`, exit0; không có thay đổi hook/UI trong bản này |
| Native advisors CLI2.121.0 |727findings:34INFO RLS no-policy,7INFO FK,503INFO unused-index,183WARN multiple-permissive; disposition chưa khép |

Schema/source/runtime/migrations trước-sau của hai diagnostic khớp; full
control giữ source/runtime/migrations và các guard. Không suy cả hệ thống
an toàn từ34bảng direct ACL: fixture writers có14bảng được populate, fixture
room-source có6; `indirectPathsProven=false`. Count unused-index phụ thuộc
workload, không được coi thay đổi số lượng là bản sửa bảo mật.

## 2. Đã sửa và đã kiểm được gì

- Cờ sleep_out/skipper đi qua live actor/session/capability, tenant/hotel và
  room scope. Nhân viên đúng quyền vẫn thao tác được; thiếu quyền, sai khách
  sạn/tenant, locked/expired/inactive bị chặn. Có kiểm khách sạn bị vô hiệu
  hóa trong lúc request thực sự chờ khóa phòng.
- `transition_booking_flag` giữ booking, room, nguồn sự kiện, audit và result
  trong cùng transaction. Prepared command private gắn transaction hiện tại;
  GUC chỉ trỏ đến record đó. Receipt đã commit không cho phép ghi lần khác.
- Bỏ sleep_out giữ trạng thái sạch/bẩn trước cờ; dữ liệu cũ thiếu chứng cứ
  trở về occupied_dirty. Chặn lệch booking/room và trạng thái DND/OOO/OOS
  theo các controls baseline; không tự sửa sạch để vượt state machine.
- Cùng key/payload trả receipt ổn định, khác payload conflict; lookup tách
  tenant/actor, hủy terminal chặn writer muộn và commit trước thắng hủy.
  Fault khi lưu result hoàn tác toàn bộ; cùng key có thể phục hồi sau rollback.
- Checkout core nhận checked_in/sleep_out/skipper, giữ invoice/notes/nguồn
  đã có. Lối legacy chỉ đổi status thành checked_out bị chặn; checkin và
  conflict chuyển phòng tính cả booking còn chiếm phòng do cờ.
- Hủy reservation chưa lưu trú kiểm live authority và giữ nguyên phòng dùng
  chung. Sáu request REST trực tiếp chứng minh owner/staff/service không thể
  PATCH lách checkout, sửa provenance vệ sinh hoặc tạo các trường/trạng thái
  được bảo vệ trong những đường đã kiểm. Chưa đóng mọi privileged writer.

Migration565 bổ sung guard cho cả status và provenance vệ sinh; public RPC
chỉ cấp EXECUTE cần thiết, helper private bị revoke. Hai body private checkin/
checkout cũ trở thành forwarding wrappers. Types Supabase đã cập nhật column
và RPC; caller legacy vẫn được inventory, chưa coi đã retirement.

## 3. Ba assertions còn không đạt và tác động

| Assertion | Thực tế | Việc phải làm |
|---|---|---|
| No-show quá hạn giữ cọc |HTTP400/SQLSTATE23514, booking vẫn confirmed,0phí | Chốt nghĩa chuyển khoản cọc thành phí/công nợ; tránh ghi thu tiền hai lần |
| Retry no-show không ghi phí |Lần đầu200, lần sau409; không thêm effect | Stable command/result và caller recovery, không báo lỗi giả sau thành công |
| Hai no-show giữ cọc tranh khóa |Hai request thực sự chờ khóa, sau đó đều400/23514,0phí | Sau sửa ledger phải chứng minh đúng một kết quả tài chính; hiện chưa chứng minh chống thu trùng cho nhánh này |

Không thêm `deposit` vào CHECK chỉ để xanh test. `deposit_amount` đã tham
gia tổng tiền trả; cần inventory settlement, refund/report/history trước
quyết định schema. Không giữ cọc không được diễn đạt là đã hoàn tiền. Legacy
cancel có pending_refund, chưa chứng minh hoàn tiền thực hoặc stable receipt.

## 4. Lịch sử kiểm tra và cleanup

903A SHA `a77eb38e…` có494controls/491đạt/3không đạt, full control440/440 và
room-source77/77. Review sau đó phát hiện provenance mới cũng cần guard và
raw REST cần controls riêng; 903B bổ sung6controls, không đổi failed history.

Lần full control903B chạy cùng hai fixture native đạt439/440; ca monitoring
không đạt phép so sánh available RAM giữa Prometheus và OS, lệch ít nhất5%
RAM tổng. Chạy lại tuần tự cùng source đạt440/440, giữ nguyên threshold/test.
Tương quan với tải đồng thời chưa đủ kết luận nguyên nhân gốc. Artifact giữ
cả lần fail và lần rerun; nếu lặp lại ở T05/T23 phải điều tra độ mới của mẫu.

Ba run903A và bốn run903B đều terminal;21query độc lập theo exact ownership
label đối chiếu container/volume/network còn0. Không dùng prune hoặc dừng
dịch vụ dự án khác. Fault/trigger test đã gỡ; source và schema được đối chiếu.
Index primary, hai ledger,70hàng worksheet, reviewer/gates/signoff giữ nguyên.

## 5. Điểm nhận tiếp trong kế hoạch toàn phạm vi

[Mục19.13 của plan](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1913-điểm-nhận-sau-bàn-giao-backend-rw5-đầu-tiên)
ghi trạng thái từng bước. Nhận RW5.5 tiền cọc → RW5.6 command/caller/recovery
→ RW5.7 upgrade564→565 có dữ liệu. Bổ sung kiểm flag transfer, toàn graph
legacy/service và cancel refund; không đánh dấu RW5.1–RW5.4 khép toàn diện
chỉ từ scoped proof này. Chưa chạy lại frontend171, lint hoặc browser/Android
trên903B; không gán các kết quả source900 sang bản này.

Sau RW5 còn RW6–RW8, quote/payment/correction/retention trong Q02; Q03workflow/
dispatcher/indirect/advisors; Q04freeze/default-full/independent rebuild. Rồi
cảnh báo → admission/budget → signup/jobs/abuse → hai console → Linux/TLS/
offsite restore/on-call → A/B/E2E/tải/RC → pilot ít nhất7ngày. Các đầu vào
VPS/DNS/provider/quyền còn thiếu giữ danh sách riêng; tiếp phần độc lập.

**Chưa nghiệm thu toàn sản phẩm:**70ca vẫn `not_run`,122release entries vẫn
`unverified`; chưa deploy, gọi provider thật hoặc mở signup public. Chỉ tài
liệu và artifact đã lọc được mirror về thư mục giao; implementation ở integration.
