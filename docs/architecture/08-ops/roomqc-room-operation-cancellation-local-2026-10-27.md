# RoomQC — hủy an toàn lệnh kiểm phòng và booking, bằng chứng local

Ngày27/10/2026, Asia/Bangkok. Phần thực hiện Q02/T03/T04/T08 theo
[phiếu18.6](roomqc-vps-signup-detailed-delivery-2026-10-26.md#186-hợp-đồng-bàn-giao-caller-và-kết-quả-chưa-rõ--q02).
**Backend đã có hủy terminal; giao diện chưa nối. Q02 và toàn VPS/signup chưa
hoàn tất.** Đây là kết quả fixture local, không phải nghiệm thu phát hành.

## 1. Thay đổi và hành vi được kiểm

Migration tạo qua native CLI:
`supabase/migrations/20261026224150_room_operation_terminal_cancellation.sql`.
Không thêm bảng. Hai RPC mới và types tương ứng:

| RPC | Phạm vi | Hành vi |
|---|---|---|
| `cancel_room_check_command(p_command_id,p_operation,p_request)` | `quick_check`, `undo_quick_check` | Actor/session/hotel hiện thời; undo kiểm thêm người kiểm/quyền. Khóa cùng actor+key và ghi kết quả terminal vào receipt mà writer đang đọc |
| `cancel_booking_room_command(p_command_id,p_operation,p_request)` | `transfer`, `checkin`, `checkout`, `group_checkout` | Kiểm capability booking, tenant/hotel và quan hệ booking/phòng; dùng lại replay/scope/save helper của writer; nhóm chuẩn hóa thứ tự booking như writer |

Hủy thắng: lưu `state=cancelled`, không đổi check/booking/phòng/phí/audit/event;
writer đến muộn dùng cùng key/payload đọc cancellation, không thực hiện nghiệp
vụ. Writer thắng: cancellation trả receipt đã commit với `replayed=true`, không
báo đã hủy. Khác operation hoặc payload cùng key trả409. Các endpoint chỉ cấp
EXECUTE cho authenticated; anonymous và service-key không được gọi. Receipt
vẫn yêu cầu quyền hiện thời; không dùng cancellation để vượt quyền đã mất.

Hủy có kiểm clock sau chờ khóa và sau INSERT receipt. Lỗi ghi receipt hoặc phiên
hết hạn tại trigger phải rollback; retry cùng key sau phục hồi vẫn hủy được.
Input có kiểm operation, cấu trúc và giới hạn2MiB; các trường notes/ảnh/nhóm theo
giới hạn được ghi trong migration. Validation400/lookupnull/timeout không tự
cho phép client bỏ key; client mới phải nhận terminal/result đã khớp trước.

## 2. Phiên bản và kết quả chạy

Source có phạm vi **853file**, SHA256:
`d6e15d3084c7562a3d352df2839578f8c1e5fa7d9b0127d260b97431fff745dd`.
**560business+12directory migrations**, runtime binding164file. Ba lượt kiểm
cùng source; source/runtime/schema phù hợp và guard trước-sau đều khớp.

| Lượt | Fixture / backend run | Kết quả |
|---|---|---|
| Writer và cancellation Auth/REST thật | `d7506efc8afb` / `cc4bf5afb492` | **188/188, native exit0**; giữ119controls852, thêm69cancellation;20race chờ khóa thật gồm14bài mới |
| Hồi quy lệnh phòng | `a872f15fa9c7` / `290165c42995` | **77/77, native exit0**;6race và actual client của transition phòng hiện có |
| Full control, bật DB fixture | `88b3ba530ae4` | **384/384, exit0**;0fail/cancel/skip |
| TypeScript ứng dụng | `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` | exit0; đây là project ứng dụng, không suy từ root tsconfig có files rỗng |
| Lint/syntax/diff | Writer harness và phần tracked tác động | Không có lỗi được ghi nhận |

69bài mới phủ sáu operation:20cancel cùng key chỉ1receipt;20writer muộn không
effects; lookup terminal; cùng key khác payload/operation; hủy sau commit trả
completed receipt. Mỗi operation có hai thứ tự tranh khóa qua hai REST requests
thật; quan sát wait barrier tại đúng command lock trước thả. Có denial owner
khác, anonymous/service, khóa tài khoản, hotel chưa gán; expiry sau chờ room
lock và sau receipt INSERT. Fault dùng sequence witness để chứng minh trigger
đã tới, rồi kiểm rollback và phục hồi cùng key.

Các bài mới kiểm cancellation trực tiếp qua Auth/REST, **chưa dùng client UI
cancellation mới hoặc browser/Android**. 77controls kiểm actual client của họ
transition đã có; không coi đó là proof cho client booking chưa viết. Không
gọi việc bỏ qua response rồi lookup trong harness là đã cắt transport thực.

## 3. ACL, advisors và cleanup

Direct ACL vẫn27bảng:324browser/probe denials,96private-service denials và
57positive grants. Writer fixture populate7/27, source fixture5/27. Full control
có fixture adversarial27/27 với drift/recovery. Đây là SQL role-assumption/direct
grant proof; không khép quyền gián tiếp/dispatcher/recipient/offboarding.

Native advisors665findings:27INFO RLS-no-policy,7INFO unindexed FK,496INFO unused
index,135WARN multiple permissive policies. Chưa có disposition đầy đủ từng
đối tượng; không coi số lượng không đổi là đã xử lý chúng.

Sau ba lượt, kiểm độc lập container/volume/network theo exact ownership labels:
**9kiểm tra,0còn lại**. Không đụng database đang phục vụ, CRM, VPS/DNS/provider
hoặc email Internet. Primary index, hai ledger,70hàng nghiệm thu và gates giữ
nguyên; chỉ mirror tài liệu và artifact đã lọc sang thư mục bàn giao.

## 4. Phần còn lại và bước nhận tiếp

1. Nối10caller/6file theo18.6: stable key/payload trước gửi, validate result,
   lookup/retry/hủy có scope và epoch; có đường click phục hồi pending. Bảo vệ
   thông tin trong storage và xử lý lỗi storage; chưa hứa xuyên tab/thiết bị.
2. Quick toast/type đúng; core checkout và notes/inspection/notification/invoice
   có trạng thái riêng. Chốt staged quote/payment và durable follow-up; receipt
   core không chứng minh mọi phần sau đã hoàn tất.
3. Khép RW5–RW8, legacy/service/deployed consumers, retention/abuse; Q03 workflow
   cấu hình/dispatcher/indirect; Q04 final default full backend/rebuild và advisors.
4. Tiếp tục cảnh báo, admission/budget, signup/jobs, hai console, Linux/offsite,
   E2E/tải và pilot. Khóa/quyền bên ngoài gom đúng phần theo plan hiện hành.

**70case vẫn `not_run`,122release entries `unverified`, không ký L/S/P/U.** Full
control không phải default full backend/rebuild853; toàn Q02 và phát hành chưa
được nghiệm thu. [Proof852 trước thay đổi](roomqc-booking-room-commands-local-2026-10-27.md)
giữ nguyên các failed/interim runs của nó; lần này không relabel bằng chứng cũ.
