# RoomQC — inventory bước đầu của các caller quản lý nhân viên

Ngày 21/10/2026. Input cho phiếu 15.2.4/T03/T04/T08, không thêm release case.
[Artifact nguồn, hash và việc kiểm từng đường](../../../artifacts/roomqc-m06-employee-caller-inventory-local-2026-10-21.json).
Phạm vi chỉ là **16 đường nghiệp vụ trong nhóm nhân viên**, đọc 19 file; không
phải inventory đầy đủ mọi caller của RoomQC hoặc ma trận quyền đã nghiệm thu.

## Phân loại hiện tại

| ID | Đường thao tác | Backend/effect | Bằng chứng còn cần |
|---|---|---|---|
| EC01 | Danh sách nhân viên desktop/mobile | get_users_by_hotel | Actual actor/scope/client-authority contract |
| EC02 | Sửa metadata nhân viên | edit_employee_profile, atomic receipt/audit | Scoped A/B đạt; reviewer, full matrix và UI E2E còn riêng |
| EC03 | Hồ sơ cá nhân | users PATCH theo self id | Positive + no-row + protected columns/live state/recovery |
| EC04 | Upload avatar mobile | Storage rồi users PATCH | Phân biệt object upload với profile đã lưu; lỗi bước sau không success giả |
| EC05 | Đổi mật khẩu | GoTrue updateUser | Session/reauth/revoke contract và UI completion |
| EC06 | Tạo lời mời | create-user alias → shared handler | Bundle Edge thật; creator/capability/scope/email fault |
| EC07 | Danh sách/gửi lại/thu hồi lời mời | staff-invitations | Mỗi action có authority/effect/race proof |
| EC08 | Nhận/tiếp tục lời mời | accept_staff_invitation + Auth | Đúng recipient/tenant, revoke/expiry, replay và callback |
| EC09 | Xóa nhân viên | GET/DELETE profile rồi client audit | Contract offboarding/session/retention, FK thật và no-effect denies |
| EC10 | Gán khách sạn | Đọc rồi delete/insert user_hotels | Atomic replacement, giữ primary/flags, fault và concurrent edits |
| EC11 | Cờ quyền từng khách sạn | PATCH user_hotels | Đúng scope/authority, returned row và quyền thực tế |
| EC12 | Dialog lưu quyền | Delete rồi insert user_permissions | Không partial replacement; effective-role/custom semantics |
| EC13 | Panel lưu toàn bộ quyền | Delete rồi insert actions enabled | Contract explicit deny/inherited allow, atomic fault/retry |
| EC14 | Bật/tắt module | Delete custom rows, insert nếu bật | Tắt custom không tự chứng minh tắt quyền kế thừa |
| EC15 | Bật/tắt action | Upsert enabled true/false | Kiểm action API thực trước/sau thay quyền, revoke race |
| EC16 | update-user Edge cũ | Service-mediated nhiều write | Chốt deploy/reachability, controlled baseline nếu giữ lại |

## Quan sát source, chưa gọi là defect runtime đã xác nhận

EC03/EC11 và delete chỉ kiểm error, chưa xác minh có hàng thực sự bị sửa/xóa.
EC04 không kiểm kết quả PATCH profile trước toast upload thành công. EC10 và
EC12–EC14 có nhiều request độc lập; một số bước delete/lookup bỏ qua error. Các
đường này cần actual API/no-effect/fault proof; chưa thay đổi code khi source đang
freeze cho A/B. Không suy mọi user đã bị mất dữ liệu từ source observations.

EC13–EC15 cần khóa contract quyền hiệu lực trước sửa: xóa custom grant không
đồng nghĩa bỏ role grant; enabled=false chưa tự chứng minh deny override. Không
tự thay chính sách để test xanh. Owner/manager/staff/platform là các authority
khác nhau, không dùng service-role thay positive của actor cần kiểm.

EC16 chưa thấy frontend hiện tại gọi bằng text search; điều đó **không chứng
minh endpoint không thể gọi hoặc không deploy**. Source dùng service client,
can_manage_user, nhiều write riêng và legacy membership fields; phân loại là
source-review concern. Runner A/B hiện không bundle update-user, create-user
hoặc staff-invitations để nghiệm thu các entry này; SQL-only không thay Edge proof.

## Thứ tự nhận tiếp và bằng chứng

1. EC03/EC04: actual self-profile positive của owner/manager/staff, no-row/error,
   protected fields và live-state/revoke/recovery, avatar chỉ dữ liệu tổng hợp.
2. EC10–EC15: expected role/capability/action/target matrix trước chạy; controlled
   second-write fault và concurrency; đối chiếu effective API access, không chỉ UI.
3. EC06–EC08/EC16: xác định endpoint nằm trong release; bundle allowlist cố định,
   Auth/Edge thật, synthetic sink không Internet, service credentials chỉ server.
4. EC09: product quyết định disable/offboard/delete và giữ lịch sử trước thay code;
   populated FK/receipt/tasks/session test, không “xóa tất cả” để cleanup.
5. Mỗi dòng cần positive → đổi một state/fault → actual API/effects → recovery,
   identity/expected/denominator rõ; unresolved/not-run không tính pass. Source
   thay thì cập nhật manifest và regression, không gán proof A/B cũ cho candidate mới.

Reviewer còn pending. Inventory này không đóng T03/T08, 17-target + receipt
indirect, 135-policy allowed-row review, 8-FK workload hoặc bất kỳ gate nào.
Sau caller slice vẫn tiếp issuer/trust/atomic health và đủ tám đợt VPS/signup.
