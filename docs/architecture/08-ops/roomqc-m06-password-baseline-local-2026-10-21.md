# RoomQC — EC05 password/forced-change: baseline actual Auth

Ngày 21/10/2026; 15.2.4/T01/T03/T04/T08. **Confirmed local failures, fix pending**.
[Artifact đã lọc](../../../artifacts/roomqc-m06-password-baseline-local-2026-10-21.json).
[Expected contract](roomqc-password-change-contract-2026-10-21.md).

## Kết quả quan sát

Exact-owned diagnostic 017ef7649ae0, session 8348, terminal exit 1, cleaned 11 objects.
**33/33 observations đã chạy, 12 đạt / 21 fail**, complete=true, không setup error.
Mỗi label chạy owner/manager/staff; không thiếu label/actor và không đổi expected.
Schema trước/sau khớp. Đây không phải passing full A/B reference, không tới final
full-run permission recovery và không là E2E/release acceptance.

| Nhóm | Đạt / tổng | Actual và ảnh hưởng |
|---|---|---|
| Profile flag-only | 0/3 | Browser tự PATCH must_change_password=false được dù hash Auth không đổi; compatibility exception không còn chỉ là source concern |
| User metadata không là authority | 3/3 | Chỉ đổi Auth user_metadata không bỏ cờ trong public.users |
| Sai current password | 0/3 | Auth vẫn đổi hash khi server policy chưa bật; input client không đủ bảo vệ |
| Thiếu current password | 0/3 | Auth vẫn chấp nhận ordinary update không có current password |
| Đổi hợp lệ + server completion | 0/3 | Auth đổi mật khẩu thật nhưng public.users.must_change_password vẫn true |
| Login/session sau đổi | 3/3 | Mật khẩu mới đăng nhập được, cũ không được; phiên thực hiện giữ, phiên khác bị thu hồi trong đối chứng |
| Admin reset | 3/3 | Không tự hoàn tất yêu cầu user đổi mật khẩu |
| Session đã xóa | 3/3 | Password update bị từ chối, không đổi hash/cờ |
| Profile locked | 0/3 | Password vẫn đổi; profile lock chưa fence Auth update |
| Profile inactive | 0/3 | Password vẫn đổi; profile status chưa fence Auth update |
| Recovery thật | 0/3 | Recovery token verify và password update hợp lệ; cờ server vẫn chưa hoàn tất |

Không diễn giải fail valid/recovery thành Auth đã từ chối: lỗi ở completion flag,
actual password hash đổi. Không tính server 5xx/timeout/fixture lỗi là deny pass.
Audit labels thực có user_updated_password/user_modified; không xuất payload,
email/password/token/hash. Recovery dùng admin generate_link + verify nội bộ,
không gửi inbox hay kết nối email provider thật.

## Candidate và client baseline

Source khóa trước launch: **697 files / 538 migrations**,
SHA256 723800f297a2b801d2581675156fb68d799c43bcc54e64fdd43f9e32eb77f026;
recompute sau terminal khớp. Có manifest recipe trong artifact, không whole release.
Vendor self-hosted/v0.8.3, GoTrue v2.197.0; SDK 2.80.0. Env yêu cầu current password
chưa được cấu hình ở baseline; không đổi serving Auth hoặc nâng dependency.

Form baseline session 13804: **3/3 fail**, exit 1. Form không gọi awaited operation
với current password, reset input trước khi có kết quả và không giữ input đúng khi
operation lỗi. Source hook thực chỉ nhận newPassword, không dùng currentPassword.
Bảy structural backend tests đạt, không thay actual Auth proof hoặc E2E.

## Nhận sửa tiếp — không chỉ vá UI

1. Giữ 33 identity/expected và failed evidence này bất biến. Sửa form truyền
   current password, await kết quả, không reset khi pending/error; settings không
   sign-in vào global session chỉ để kiểm mật khẩu. Có client regression riêng.
2. Bật/ghi rõ policy current password trong candidate self-hosted được kiểm soát,
   kiểm actual SDK 2.80 wire giữ field và pinned GoTrue thực từ chối sai/thiếu.
   Thiếu policy ở serving/VPS không được gọi client parameter là server fix.
3. Bỏ browser authority cho forced-change acknowledgement. Cơ chế server phải
   phân biệt user password change với admin reset, không dựa user_metadata hoặc
   mọi encrypted_password update. Kiểm atomic failure và cấu hình Auth audit nếu
   chọn audit path; database audit có thể bị tắt ở vendor nên phải fail-closed/
   kiểm deployment assumptions, không suy từ action label có trong source.
4. Fence locked/inactive và session/revoke races theo contract ở endpoint thật.
   DB-trigger exception gây GoTrue 5xx không được đổi thành authorization pass;
   cần API/error mapping/authority boundary phù hợp. Không tự đồng bộ lock thành
   Auth ban hoặc nới contract recovery để làm test xanh.
5. Thêm fault/lost-response/concurrency, refresh-token và full ordinary/forced/
   recovery/invitation coverage; fresh full A/B/control/FE/advisors/cleanup sau sửa.
   33 controls này không chứng minh các phần chưa chạy.

Không có container/network/volume còn lại theo exact label. Chỉ integration source
và synthetic backend; không deploy serving/CRM/VPS/DNS/provider hoặc email thật.
Giữ 8 đợt/27 packages/25 tasks/70 cases, 122 releaseAcceptance unverified và gate
L/S/P/U/B. Previous self-profile A/B là scoped proof trên source cũ, không gán cho
candidate password mới. Reviewer/browser/Android/Linux/load/pilot vẫn pending.
