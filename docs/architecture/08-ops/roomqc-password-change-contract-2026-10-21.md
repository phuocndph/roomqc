# RoomQC — hợp đồng đổi mật khẩu và forced-change (EC05)

Ngày 21/10/2026; một lát 15.2.4/T03/T04/T08, không thêm release case.
Trạng thái: expected giữ nguyên; đã có [baseline actual Auth](roomqc-m06-password-baseline-local-2026-10-21.md)
và [policy/SDK diagnostic partial](roomqc-m06-password-policy-diagnostic-local-2026-10-21.md).
18/33 controls đạt; server completion/live-state và fault/races còn mở, chưa nghiệm
thu implementation. Việc kế tiếp ở plan15.7; không thay contract theo actual fail.

## Hành vi cần đạt

- Đổi mật khẩu thông thường phải gửi current password tới Auth để server kiểm tra;
  không chỉ có một input không được sử dụng hoặc sign-in làm thay session toàn app.
- Mật khẩu sai/thiếu ở ordinary flow không được thay hash, cờ bắt buộc đổi hoặc
  quyền. Recovery đã xác minh là ngữ cảnh khác, dùng phiên recovery thật của Auth;
  không tự suy từ query string/user_metadata hoặc thông báo của client.
- must_change_password trong public.users là authority của ứng dụng. Browser
  không được tự bỏ cờ bằng PATCH hoặc user_metadata. Chỉ có password change thật
  của đúng identity qua Auth mới hoàn tất yêu cầu; metadata update riêng không đủ.
- Admin đặt lại mật khẩu tạm thời không tự hoàn thành yêu cầu user đổi mật khẩu.
  Không dùng mọi encrypted_password UPDATE như bằng chứng user đã đổi mật khẩu.
- Password change theo pinned vendor giữ phiên đang thực hiện và thu hồi phiên
  khác; phải kiểm DB sessions, refresh và sensitive API theo scope, không suy JWT
  đang còn hạn là toàn bộ session còn sống hoặc hứa hủy mọi in-flight request.
- Profile locked/inactive hoặc session đã thu hồi không được dùng ordinary
  password-change để thực hiện sensitive mutation; recovery/offboarding policy
  đầy đủ vẫn cần kiểm trong invitation và recovery workflow riêng.
- UI chỉ hoàn tất sau khi Auth result và trạng thái server được xác nhận. Nếu
  response mất hoặc bước acknowledgement lỗi: thông báo kết quả chưa xác nhận,
  giữ đường đọc lại trạng thái, không toast success/navigate hoặc retry mù.
- Form giữ input khi lỗi, ngăn submit cạnh tranh, reset chỉ sau thành công và
  không áp kết quả user A lên form user B. Không log password/token/PII fixture.

## Ranh giới vendor và bằng chứng

Không nâng self-hosted/v0.8.3 hay GoTrue v2.197.0/SDK 2.80.0 để test xanh.
GoTrue pinned có current_password và policy yêu cầu current password; SDK hiện
chưa khai báo field này. Phải xác minh actual wire/server behavior và config
đúng candidate; typed transport adapter không được silently drop field.

Tài liệu hiện hành nêu current_password ở JS 2.102.0+, nên không sao chép chữ ký
API mới vào SDK cũ. Changelog API_EXTERNAL_URL/TLS được xem xét riêng cho T18;
không đổi serving origins, auth configuration hoặc runtime trong lượt local.

Baseline phải ghi actual Auth status, hash-changed boolean, profile flag,
auth-audit action labels, session effects và login trước/sau. Chỉ dùng exact-owned
backend/fake accounts. Admin installer không thay positive của user. Giữ fail và
setup/not-run riêng; actual current password và token chỉ ở private fixture memory.

Sau baseline mới chọn cơ chế server acknowledgement: phải phân biệt user password
change với admin reset, giữ atomicity/fault recovery, có source/config assumptions
đã kiểm. Auth và Postgres không tự thành transaction nếu chỉ gọi hai API nối tiếp.

## Điều kiện nghiệm thu

Actual ordinary/forced/recovery controls, actor/live-state/revoke/recovery,
wrong/missing current password, admin reset, concurrent request/response loss,
fault giữa Auth và profile và client identity/form controls. Candidate thay phải
giữ self-profile/avatar, employee, hotel-scope/account-session regression và full
A/B/control/FE/advisors/cleanup. Browser/Android, deployment config Linux, external
email, full invitation/recovery và reviewer vẫn là các proof riêng.

Nguồn: [passwords](https://supabase.com/docs/guides/auth/passwords),
[sessions](https://supabase.com/docs/guides/auth/sessions),
[pinned user endpoint](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go),
[pinned password transaction](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go).
