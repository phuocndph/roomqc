# RoomQC — nền nhật ký phục hồi cùng mã lệnh, local

Ngày 29/10/2026. Source334/hash `d30e5ee5908404ed2da8d64ddc955305e98c273086bfe119334fac39b623dcf7`, 587 business/21 directory migrations. Đây là bước triển khai RF02/RF03 còn giới hạn; R11/BG02 và toàn bộ VPS+signup chưa được nghiệm thu. Không dùng DB phục vụ làm fixture.

| Phạm vi | Kết quả và giới hạn |
|---|---|
| PostgreSQL thật/API LOGIN |169/169, 0 skip, exit0; 9 ca mới cho journal/coordinator. Receipt và expiry trong 9 ca này dùng provider thử tường minh; chưa chứng minh phục hồi qua Auth thật |
| Full control |728 total, 527 pass/0 fail/201 skip, exit0. Directory169 là lượt opt-in riêng; không cộng chồng |
| Native Auth/REST/HTTP/PG hiện có |104/104 controls, 28 barriers, 1 API SIGKILL, exit0. Chứng minh tương thích schema21 với đường runtime cũ; chưa dùng coordinator mới. Witness/barrier không là business journeys độc lập |
| Nguồn/schema |Source đầu–cuối khớp; business schema và migration chain giữ nguyên; directory role baseline phục hồi |
| Cleanup |Exact-label Docker readback0 cho failed và green native/directory runs; không dọn object ngoài ownership |

## 1. Đã triển khai và kiểm được

- Directory0021 thêm intent immutable, attempt generations, predecessor closures và result reference. Receipt cũ không bị sửa hoặc gia hạn. Unique namespace bám control command thực, không tách key theo target để né conflict.
- Coordinator giữ một client với session advisory fence qua intent commit và effect transaction; không mượn pool lần hai. Generic503 giữ attempt; chỉ expiry explicit hoặc session reauthorization có quyền hiện hành và no-effect/fence mới tạo vòng liên kết. Tối đa một vòng retry nội bộ mỗi request.
- DB closure/consumption cùng khóa intent row, kiểm parent/result/consumption và chặn round cũ sau closure. API chỉ SELECT/INSERT journal và UPDATE(id) tối thiểu để row-lock; immutable trigger từ chối cả id=id. Không cấp UPDATE nội dung/DELETE/TRUNCATE.
- 9 ca DB chứng minh rollback vẫn giữ intent; pool một kết nối hoạt động; hai caller thực sự chờ khóa PostgreSQL; retry chỉ có một effect; lỗi mạng503 không đổi vòng; scope sai bị conflict; lịch sử không sửa được; vòng cũ bị chặn; kiểm quyền lại khi đổi session; ngắt backend rồi phục hồi cùng mã lệnh. Nâng cấp directory20→21 giữ command cũ, rerun không có effect và không tạo receipt giả.
- Coordinator chưa được nối vào admin/alert/recheck/legacy runtime. Adapter session/attempt, mapping expiry và tích hợp các mutator là việc tiếp theo.

## 2. Failure giữ lại và sửa

- Focused r1: 8 pass/1 fail khi pg_terminate_backend phát error sau query reject. Coordinator giờ nhận lỗi của client đang được giữ, hủy session hỏng và tránh trả khóa không chắc chắn về pool. Focused r2 đạt9/9.
- Full DB r3: 155 pass/14 fail với SQLSTATE53300; fixture mới giữ quá nhiều kết nối nhàn rỗi. Đóng các pool mới sau từng ca, giữ nguyên max_connections và mức tranh chấp của bài thử; r4 đạt169/169.
- Native ada71089dbad exit1 vì harness cố định migration count20. Đổi sang so tên/checksum toàn manifest thực trên DB; r4 207ce2e0ad48 exit0. Giữ failed logs/proof riêng; kiểm tra vẫn yêu cầu đầy đủ migration mới.
- Một chuỗi limitations trong native component vẫn ghi nhãn lịch sử directory20. Manifest và database thực của lượt này đều21; không dùng nhãn cũ để suy phiên bản đã chạy.

## 3. Nhận tiếp

1. RF04: bind session từ canonical verified gateway, adopt original attempt đúng scope, mapping expiry cụ thể và không rotate generic503. Nối consumption/result cùng effect transaction; receipt double không đủ đóng việc.
2. RF05: admin execute/register, alert ack, recheck dùng coordinator; giữ lookup/replay quyền hiện hành và mọi lock order. RF06: legacy stable client key/journal/result qua F5/restart.
3. Native canonical Auth/HTTP cho RX01–RX12 và mọi mutation family; worker claim/RPC/settle, populated business upgrade/security rồi review R11/BG02. BG03–BG11 và staging/offsite DR/Android/load/cost/pilot≥7 ngày giữ nguyên.

[Phiếu thực hiện](roomqc-vps-signup-execution-dossier-2026-10-29.md#54-phiếu-chi-tiết-để-khép-expired-attempt-recovery-và-legacy-replay). [Nghiệm thu RX](roomqc-vps-signup-master-acceptance-2026-10-28.md#125-nghiệm-thu-phục-hồi-cùng-mã-lệnh-và-legacy-replay). [Packet đã lọc](../../../artifacts/roomqc-support-intents-foundation-207ce2e0ad48-local-2026-10-29.json). Diagnostic này không thay124 actual,122 release entries hoặc gates. Hash tài liệu trong packet là snapshot trước lượt biên tập cuối; audit xuất bản lưu hash hiện hành, bằng chứng kiểm thử không đổi.
