# RoomQC — phục hồi lần lưu quyền có kết quả chưa rõ

Ngày kiểm: **27/10/2026, Asia/Bangkok**. Đây là bằng chứng local có phạm vi cho
T03/T04 trong đợt 1 của [kế hoạch VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
Chưa nghiệm thu toàn bộ sản phẩm hoặc VPS.

## Kết quả đã kiểm

Candidate **813**, source
`9dc826f33b26f7eae62690896bfa1c3a00fa1262bc63d8b7f72b3aed8a92d7d6`,
**552 migration nghiệp vụ + 12 migration directory**.

- Actual Auth/REST: **125 mục kiểm + 7 tình huống tranh chấp**, đạt, native exit 0.
- Hồi quy metadata nhân viên: **30 mục kiểm + 4 tình huống tranh chấp**, đạt.
- Client/hook/panel: **58/58 kiểm thử**, đạt; TypeScript và lint các file thay đổi đạt.
- Source/runtime trước–sau và fingerprint schema cuối lượt khớp; fixture được dọn.

Lượt API dùng fixture `7b54b3ab89c7`, backend run `b29b9a9c4230`. Database dựng
mới từ toàn bộ migrations; dùng tài khoản và dữ liệu thử, không gửi email Internet.
Không áp migration vào database đang phục vụ hoặc VPS thật.

## Cách xử lý

Trước đây, một phản hồi 400 có thể giữ lần lưu ở trạng thái chờ vô hạn. Bỏ ngay
trạng thái đó cũng không an toàn: tab khác dùng cùng mã yêu cầu có thể đã ghi
thành công hoặc vẫn đang chờ ghi.

Migration `20261026172330_employee_authority_pending_terminal_outcomes.sql`
thêm kết quả hủy bền vững theo actor và mã yêu cầu. Save và cancel dùng cùng
khóa giao dịch. Server xác thực lại phiên, người thao tác và nhân viên đích:

| Tình trạng tại thời điểm giữ khóa | Kết quả | Hiệu ứng |
|---|---|---|
| Đã có receipt thành công cùng nội dung | Trả kết quả thành công đã có | Không hủy hoặc ghi lại |
| Chưa ghi thành công | Ghi `cancelled / not_applied` và audit cùng giao dịch | Không đổi quyền, membership hoặc version |
| Đã hủy cùng nội dung | Trả lại kết quả hủy | Không thêm audit hoặc ghi nghiệp vụ |
| Cùng mã nhưng khác nội dung | 409 conflict | Không thay đổi |
| Phiên/quyền/nhân viên đích không hợp lệ | Từ chối | Không thay đổi |

Sau khi đã hủy, yêu cầu lưu đến muộn dùng mã đó không được ghi. Nếu save thắng
trước cancel, cancel trả receipt thành công. Hàm ghi bên trong không còn được
gọi trực tiếp bằng role client; bảng lưu kết quả không cấp quyền trực tiếp cho
anon/authenticated/service_role.

Client giữ nguyên key/payload khi chưa rõ kết quả. Với lỗi kiểm tra dữ liệu 400,
client yêu cầu server kết thúc đúng lần lưu cũ; chỉ xóa pending khi kết quả
thành công hoặc hủy khớp đầy đủ danh tính và nội dung. Timeout, lỗi xác thực,
khác payload, kết quả malformed hoặc kết thúc chưa được xác nhận vẫn giữ pending.
Lookup sau F5/đăng nhập lại cùng người nhận được cả kết quả thành công và kết quả hủy.

Hook cập nhật lại cấu hình sau hủy, giải phóng trạng thái đang lưu và cho phép
sửa/lưu bằng mã mới. Không hiển thị toast thành công cho kết quả hủy hoặc thay
cache bằng dữ liệu của lần lưu chưa được áp dụng.

## Kiểm thử lỗi và tranh chấp

Đã kiểm 20 lần replay hủy và 20 lần save đến muộn không thêm hiệu ứng; cùng key
khác payload bị từ chối; canonical alias/thứ tự/UUID và đủ 5 cờ membership giữ
đúng danh tính. Một mã mới vẫn lưu được sau hủy mà không cần tăng version giả.

Hai bài tranh chấp cancel trước/save trước dùng khóa advisory thực trong DB,
quan sát hai waiter rồi mới nhả khóa. Chỉ một outcome hợp lệ và một audit được
ghi theo bên thắng. Lỗi insert audit hoặc insert kết quả hủy rollback toàn bộ;
retry cùng mã phục hồi được. Phiên hết hạn khi đang chờ khóa bị chặn sau khi
nhả khóa; không ghi tombstone hoặc nghiệp vụ.

Kiểm thử client/hook còn bao gồm mất phản hồi cancel, đăng nhập lại, sai identity
trong kết quả, lỗi settlement 401/403/409/503, đổi actor và malformed HTTP 200.
Hook save/recover không báo thành công khi hủy, refetch và lưu mới được.
Đây là kiểm thử client mô phỏng transport và actual API bỏ qua phản hồi đã nhận;
chưa có browser/Android E2E hoặc proxy làm rơi gói mạng thật.

## Giới hạn và việc tiếp theo

Native advisors ghi **668 findings**, chưa có disposition từng object; không suy
số findings thành số lỗi sản phẩm. Bảng kết quả hủy cố ý chưa có TTL/GC: xóa
tombstone có thể cho yêu cầu offline cũ ghi lại. Retention, kích thước và bảo vệ
khỏi lạm dụng cần được review cùng T08/T10/T19 trước release.

Legacy service-role Edge `update-user`, các đường gián tiếp/workflow/offboarding
và disposition advisors vẫn mở. Invitation diagnostic cùng source thuộc 812;
không gọi kết quả đó là đã chạy lại trên 813. Full control 358/358 thuộc 811.
Chưa chạy full control, default full backend hoặc rebuild độc lập trên 813.

Tiếp theo: khép writer đặc quyền và quyền gián tiếp → đóng băng candidate →
full control/backend/rebuild → T07 cảnh báo → các đợt còn lại của kế hoạch.
Kiểm thử này không tự đóng toàn bộ T03/T04/T08.

[Artifact đã lọc](../../../artifacts/roomqc-authority-terminal-outcomes-local-2026-10-27.json)
ghi source, native exits, các assertions và cleanup độc lập. **70 ca worksheet
vẫn `not_run`, 122 mục release vẫn `unverified`, gate và chữ ký giữ nguyên.**
Chỉ chuyển tài liệu/artifact đã lọc sang cây chính; implementation vẫn ở integration.
