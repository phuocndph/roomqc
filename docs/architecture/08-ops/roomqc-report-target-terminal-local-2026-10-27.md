# RoomQC — hủy an toàn lần lưu mục tiêu chưa xác nhận

Ngày 27/10/2026, Asia/Bangkok. Phạm vi Q02/F2 trong T03/T04/T08/T22 của
kế hoạch toàn bộ VPS + signup. Đây là kết quả kiểm thử local có phạm vi;
chưa phải nghiệm thu phát hành hoặc xác nhận bản đang chạy trên VPS.

## Kết quả sử dụng

Lần lưu bị xung đột không còn bắt buộc phải thử lại vô hạn. Giao diện có
“Hủy lần lưu chưa áp dụng”, gửi đúng mã lệnh và nội dung đã lưu để server
quyết định. Nếu lệnh lưu đã thành công, server trả lại kết quả thành công gốc.
Nếu hủy thắng, server lưu kết quả hủy bền vững, chặn lệnh lưu cùng mã đến muộn.

Client chỉ bỏ thông tin chờ sau khi xác thực kết quả completed hoặc cancelled
khớp lệnh. Timeout, lỗi quyền, phản hồi sai hoặc không rõ kết quả vẫn giữ
thông tin để phục hồi. Nút đóng trang không có nghĩa là hủy lệnh.

| Phần thay đổi | Hành vi |
|---|---|
| Migration 572 | `20261027094448_report_target_terminal_cancellation.sql`: RPC cancellation dùng cùng khóa actor/key và scope với writer; tái sử dụng journal hiện có, không thêm bảng |
| Quyền | Public wrapper là invoker; chỉ authenticated được gọi và vẫn phải qua live session, tenant, vai trò quản lý, assigned hotel và scope hiện thời; anon/service bị từ chối |
| Dữ liệu | Hủy lệnh chưa áp dụng không đổi target rows hoặc revision. Audit và kết quả cùng transaction; lỗi một phần rollback toàn bộ |
| Replay | Hủy/lưu/lookup cùng key đọc kết quả terminal đã có; payload hoặc scope khác bị conflict. Không xóa journal theo thời hạn khi client offline còn có thể phát lại |
| Client | Phân biệt completed/cancelled; kiểm ID, reason, toàn bộ request identity và giá trị trước khi bỏ pending; không tạo key mới từ not_found |
| Giao diện | Nút hủy có giải thích; giữ bản nhập để đối chiếu; lệnh bị tab khác hủy không đóng form như vừa lưu thành công |
| Hook | Tải lại cấu hình hiện thời sau terminal; không dùng receipt lịch sử ghi đè cache mới. Đổi actor/session/runtime/hotel hoặc A→B→A không nhận thông báo/kết quả cũ |

Writer hiện kiểm giới hạn nghiệp vụ trước journal: replay một lệnh đã hủy
nhưng có giá trị nghiệp vụ không hợp lệ vẫn có thể trả 400. Lookup/cancel
trả cancelled; request đó không thể ghi dữ liệu. Client hiện chỉ tạo và phục
hồi pending có giá trị đúng contract; không tuyên bố mọi invalid request đều
trả một HTTP/result giống nhau trên tất cả endpoint.

## Bằng chứng cùng source 991

SHA `4a84d794ab35c6fb29a61df333f3de5021dccc88ae8120ad81923837c31d0ba8`;
991 file có phạm vi, backend binding 183 file, 572 business + 12 directory
migrations. Migration lịch sử giữ nguyên. Tất cả tiến trình kiểm thử kết thúc
exit 0; source và schema giữ ổn định trước–sau.

| Kiểm thử | Kết quả và phạm vi |
|---|---|
| Auth/REST thật trong backend Docker riêng | 248/248, giữ 214 ca trước và thêm 34 ca; 18 race khóa thật, gồm 4 race mới |
| Frontend unit/hook/component | 454/454 trên 28 file; giữ toàn bộ 424 identities ở 990 và thêm 30 |
| Frontend UTC subset | 200/200; khác bộ chính ở cấu hình múi giờ, không cộng thành số tính năng |
| Full control suite có directory DB riêng | 440/440, không skip/cancel/todo |
| TypeScript / lint | TypeScript exit 0; lint 13 file: 0 lỗi, 2 cảnh báo no-explicit-any |
| Direct ACL | 37 bảng không policy được giữ snapshot; 444 browser/probe và 136 private service denials; target 24 + 8 nằm trong các tổng tương ứng |
| Advisors CLI 2.121.0 | 722 finding: 37 no-policy, 7 unindexed FK, 495 unused index, 183 multiple permissive policies. So với 980 thêm 1 INFO unused_index; chưa disposition toàn bộ |
| Cleanup | Container, volume và network theo hai exact fixture labels đều còn 0; không dọn tài nguyên dự án khác |

Native controls gồm cancel-first/save-first, 12 lần hủy đồng thời cùng key,
payload conflict, stale revision, quyền sai, rollback khi audit/result lỗi,
thu hồi assignment và hết phiên trong lúc chờ. Bài notes đổi rồi trở lại
khôi phục chính xác fingerprint/revision cũ trước khi phát lại lệnh; lệnh
đã hủy vẫn bị chặn. Frontend mô phỏng mất phản hồi trước/sau cancellation,
reload, lookup, hai tab và kết quả đến sau đổi phạm vi.

## Giới hạn và việc nhận tiếp

- Chưa cắt phản hồi TCP thật giữa caller và backend; mocks không thay bài đó.
- Fresh replay 572 chưa chứng minh populated upgrade 566→571→572, giữ legacy
  duplicate/notes/receipt/pending và khả năng phục hồi khi từng migration lỗi.
- Chưa browser/Android, tải thực, Linux/TLS, independent rebuild hoặc default
  full của candidate cuối. Full control suite khác full backend integration.
- Advisors và indirect paths vẫn thuộc Q03; không suy ra an toàn mọi đường
  ghi từ direct ACL hoặc số lượng test.
- Chỉ mirror tài liệu/artifact đã lọc sang bản bàn giao. Implementation,
  primary index, hai ledger, 70 dòng worksheet, reviewer/signoff/gates giữ nguyên;
  không đổi database đang phục vụ, VPS/DNS/email/provider thật.

Tiêu chí nhận tiếp ở [mục 19.25](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1925-phiếu-nhận-sau-terminal-recovery991):
khép transport/upgrade evidence rồi advice/mobile, generic export, các writer
Q02 và workflow/indirect/advisors Q03; Q04 freeze/full/default-full/rebuild.
Sau nền tiếp đủ tám đợt VPS/signup tới pilot ít nhất 7 ngày. 70 ca vẫn not_run,
122 release entries vẫn unverified; chưa có quyết định nghiệm thu sản phẩm.
