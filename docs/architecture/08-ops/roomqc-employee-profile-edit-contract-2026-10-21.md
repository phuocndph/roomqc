# RoomQC — hợp đồng sửa hồ sơ nhân viên

Phạm vi: T03/T04/T08, phiếu 15.2.5; một phần của toàn bộ VPS + signup.
Candidate 682/537 có [full A/B sau sửa đạt local](roomqc-m06-employee-atomic-fix-local-2026-10-21.md):
30 employee checks/4 races, 280/1.764/20 regression và final recovery/schema freeze;
A/B exit 0/cleaned 18/run. Action update sửa đúng constraint, không nới quyền.
Failed attempts giữ nguyên. Đây chưa là full role/caller matrix, browser/Android
hoặc release acceptance; reviewer còn pending.

## API và caller

Desktop UserManagementTab và MobileUserListTab dùng chung useUpdateUser.
Operation: public.edit_employee_profile qua Supabase RPC, wrapper invoker;
private implementation cần privileged Auth lookup và multi-table transaction.

Input cố định: target UUID, changes gồm đúng full_name/hotel_id/position_id/
reports_to, expected_updated_at lấy từ hồ sơ đã mở, request UUID. Không nhận
tenant/actor/role/level/status/capability từ client. Tên trim, dài 2–150 ký tự.
Email chỉ đọc trong form; đổi email/role/status là luồng khác, không suy quyền từ edit.

## Quyền và scope

- Caller là Auth đã xác thực email, chưa banned/deleted; profile active, không
  locked/deleted, tenant thật; session_id còn tồn tại/chưa hết hạn.
- Profile level/role phải khớp authoritative user_roles; không dùng metadata
  JWT do người dùng chỉnh làm authority.
- Owner/manager/department manager có users.update theo helper hiện hành;
  hierarchy dùng can_manage_user, cùng tenant. Đây không phải quyền quản trị platform.
- Non-owner phải có membership ở cả hotel hiện tại và hotel đích.
  Department manager chỉ sửa cấp dưới đúng department.
- Target là employee manager/department_manager/staff, không primary owner hoặc
  super-admin. Primary hotel/position phải active, đúng tenant và cấp bậc.
- Supervisor nullable; nếu có phải active/unlocked, đúng hotel/tenant, cấp cao
  hơn target và là manager/department manager.
- Tenant chỉ được mutation khi không read-only và gói active/trial còn hạn.

## Atomic effects và concurrency

Auth → actor/profile/roles/session → request-key lock → target → tenant/hotel/
position/supervisor. Permission source rows được khóa trước kiểm capability.
Đây là lock order trong scope operation, chưa chứng minh mọi API hệ thống.

Một transaction ghi profile + primary membership transfer + activity_logs +
private receipt. Không role write, không audit HTTP/client bắt buộc, không
transaction qua network. Cùng hotel giữ flags/membership cũ; chuyển hotel thay
chỉ membership primary cũ, giữ assignment ngoài primary; flags cũ đi theo nếu
đích chưa có membership, membership đích có sẵn giữ nguyên flags của nó.

Request key gắn actor và payload/target/version. Exact retry trả original receipt
không ghi lại; khác payload trả conflict. Kiểm actor/live scope trước replay.
Nếu version đã thay đổi thì conflict, không silently overwrite. Receipt giữ
metadata tối thiểu và kết quả, không token/password. Bảng private RLS bật,
không có browser/service generic table grants; chỉ operation đã guard ghi được.
Retention/purge cần chính sách operator được duyệt, chưa chạy tự xóa dữ liệu.

## Lỗi và client

Invalid fields/name/hotel/position/supervisor: từ chối, không partial effects.
Forbidden/live/session/capability/tenant: từ chối, không đổi quyền để cứu thao tác.
Stale version/request conflict: HTTP 409. Audit/receipt failure rollback toàn bộ.
Network/response ambiguous: giữ request ID trong cùng instance hook; click lại
cùng payload/version đối soát receipt. Close/remount/tab mới chưa được coi có
durable client retry identity; trường hợp này và UX recovery phải kiểm ở E2E.

Sau success invalidate user/users/user-hotels/managers/permissions; không tự ghi
client audit hoặc tiếp tục upsert role. Không show success khi RPC lỗi/null/sai ID.

## Phần còn phải rà, không được suy là đã hoàn tất

- Chưa full employee role/capability/column/hotel matrix hoặc browser/Android E2E.
- Direct users PATCH và update-user Edge cũ vẫn là caller riêng; operation mới
  không tự sửa các đường đó. Chưa bundle Edge thì giữ not-run.
- UI self-edit đã đưa về workspace-scoped /profile; owner/platform/unsupported
  target có lý do không mở employee form. Unit/component proof không thay actual
  self-profile PATCH hoặc browser/Android E2E; server không dựa helper navigation.
- Derived department trigger có thể áp template quyền front-desk hiện hành;
  test housekeeping metadata không chứng minh chuyển bộ phận/offboarding mọi quyền.
- Helper has_user_permission hiện hành dùng grant-positive semantics; không tự
  đổi thành deny-override trong lát này. Revoke capability cần actual API/race proof.
- Review 17 target legacy + receipt target mới, policy/FK, issuer/trust, health,
  alerts/admission/signup/consoles/Linux/DR/E2E/load/RC/pilot vẫn tiếp theo roadmap.
