# ADR — RoomQC native password-change transaction boundary

Ngày 22/10/2026 (Asia/Bangkok). Trạng thái: **candidate đang được kiểm chứng local**,
không là phê duyệt triển khai serving/staging/pilot.

**Checkpoint build/config717:** [actual evidence](../08-ops/roomqc-m06-password-build-config-local-2026-10-22.md).
Hai independent uncached builds và diagnostic rebuild cùng exact image trên
linux/amd64, builder đã ghi. Pin commit epoch, chuẩn hóa timestamps khi export;
full A/B image equality không bị nới. Seven actual config/helper/grant/invalid
contract faults rollback toàn bộ và restored positives đạt. Không gán nguyên
nhân cho historical705/706 thiếu image đối chứng; registry/cross-builder/Linux/
reviewer và full integrated proof còn mở. SDK-only EmailAuthFlow và full
invitation/observed lock-order matrix vẫn nhận tiếp.

## Vấn đề và bằng chứng đầu vào

[Baseline](../08-ops/roomqc-m06-password-baseline-local-2026-10-21.md) có 21/33 fail.
[Policy/SDK diagnostic](../08-ops/roomqc-m06-password-policy-diagnostic-local-2026-10-21.md)
đã sửa sáu sai/thiếu current-password controls nhưng còn 15 fail: browser tự bỏ cờ,
Auth đổi password chưa complete server flag, locked/inactive vẫn đổi được.
GoTrue2.197 không có before-password-update hook được tài liệu hóa. Audit record
không có current-session ID; trigger đọc “bất kỳ phiên nào còn sống” không đủ.
Không coi hai HTTP calls Auth rồi PATCH public.users là atomic.

## Candidate được chọn để kiểm chứng

Giữ vendor self-hosted/v0.8.3, GoTrue2.197.0 source commit
4eee58f296d9698a1c2c0ae14d7a0b379c7622d3 và SDK2.80; không upgrade để test xanh.
Build một RoomQC image từ source pin với extension nhỏ tại native UserUpdate.
Builder/runtime base được pin digest. Không có secret/fixture env/DB trong build.

Luồng transaction:

1. Native GoTrue vẫn xác minh JWT/session, MFA, strength, current password hoặc
   recovery context và hash mật khẩu bằng code vendor.
2. Lưu snapshot hash cũ trước SetPassword. Trong DB transaction, gọi private
   begin_password_change bằng actor/session lấy từ native Auth context, không
   nhận actor hoặc session do body browser chọn.
3. Khóa Auth identity → profile → exact initiating session. Kiểm live state,
   expiry và snapshot cũ vẫn khớp; snapshot đã đổi trả conflict, không ghi đè reset
   hoặc password change khác dựa trên current-password check đã stale.
4. Native UpdatePassword lưu hash và thu hồi phiên khác; Auth audit vẫn trong
   cùng transaction.
5. Private complete_password_change xác nhận trusted transaction context, hash
   thực đã thay và exact session còn hợp lệ; ghi server completion và receipt.
6. Mọi error sau đó rollback cả password/session/audit/flag/receipt. Domain
   refusals được native handler map 401/403/409; lỗi SQL hạ tầng vẫn 5xx, không
   được tính là permission-denial pass.

Extension luôn chạy trên image này, không có env flag để âm thầm bỏ qua guard.
Nếu current-password policy hoặc Postgres audit bị tắt, password update trả 503
không có mutation. Thiếu private SQL function cũng fail-closed.

Admin reset dùng native admin endpoint riêng, không gọi begin/complete và không
được tính hoàn tất yêu cầu user đổi mật khẩu. user_metadata không là authority.
Browser PATCH không được đổi must_change_password ở bất kỳ target nào.

## Readback và retry

Body có optional roomqc_password_change_id (UUID); nếu thiếu, native Auth tạo ID.
Receipt private không lưu password, token hoặc hash. ID đã complete bị từ chối
409 khi dùng lại, không thực hiện mutation lần hai; đây **không** là replay-success
contract hoặc bằng chứng cùng payload.

password_change_status chỉ trả receipt của actor và **đúng phiên** còn sống,
optionally đúng change ID. Client phải kiểm actor/change ID/completed_at/flag,
không coi RPC200 với change_id=null là success. Response loss cần readback trước
khi quyết định; không tự retry password mutation. Caller durable/remount/new-tab
reconciliation đã có engine/caller scoped proof trong report liên kết; browser/
multi-tab/Android và actual pre-header loss còn kiểm riêng. EmailAuthFlow
invitation/recovery riêng vẫn cần inventory/fix, không suy từ shared callers.

## Ranh giới quyền và tương thích

Private helper chỉ grant cho supabase_auth_admin và kiểm session_user thật;
PUBLIC/anon/authenticated/service_role không có EXECUTE. SECURITY DEFINER chỉ
dùng để cập nhật flag/receipt của actor cố định, search_path rỗng. Không grant
Auth-table access cho browser, không dùng service role giả user.

Active profile phải còn active/unlocked/not deleted. Pending owner trước setup
và verified identity chưa có profile được giữ theo pre-registration contract
hiện hành; invitation pending cần đúng email/expiry. Không suy từ khả năng này
rằng mọi hard-delete/offboard/legacy path đã an toàn. Full invitation acceptance,
revocation và lock-order matrix còn mở, đặc biệt accept_staff_invitation hiện
lấy invitation trước Auth, cần controlled concurrency disposition.

## Nghĩa vụ triển khai và bảo trì

Đây là **custom Auth build**, không phải migration-only fix. T18 phải dùng đúng
image digest từ reviewed build, kiểm migration/helper/policy và smoke test trước
admission. Dùng lại pristine vendor image sẽ không có native transaction guard;
không được tuyên bố source SQL tự bảo vệ direct Auth update.

Giữ source commit, patch points, source hashes, builder/runtime digests, image ID
và Go test result trong evidence. Mỗi vendor upgrade cần review lại patch, build,
Auth regression/fault/race và invitation/recovery; patch point mismatch phải dừng.
Local image ID chưa là registry-published production digest.

Triển khai theo thứ tự compatible candidate/schema/image/client, giữ password
mutation đóng nếu thiếu guard, và có rollback được duyệt. Không rollback về
pristine Auth rồi mở password updates khi lỗi bảo mật cũ còn tồn tại.
Serving/CRM/VPS/DNS/provider không đổi trong thử nghiệm này.

## Nghiệm thu còn phải có

Giữ nguyên 33 expected identities và positives. Kiểm actual Auth ordinary/forced/
recovery/admin reset, current-session binding, profile/session revocation cả hai
thứ tự lock, old-snapshot conflict, completion/audit fault, response loss, receipt
privacy, reused-ID refusal, invitation/pre-profile, policy disabled và missing SQL.
Sau đó fresh full A/B/control/FE/advisors/final recovery/cleanup, caller/browser/
Android/Linux và reviewer đúng scope. Không ký release từ unit tests hoặc ADR.
