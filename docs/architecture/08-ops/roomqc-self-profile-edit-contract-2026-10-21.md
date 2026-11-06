# RoomQC — hợp đồng tự sửa hồ sơ và avatar

Ngày 21/10/2026; lát 15.2.4 / T03 T04 T08, không thêm case release.
Input: [baseline actual API](roomqc-m06-self-profile-baseline-local-2026-10-21.md).

Self-profile lưu full_name/phone/avatar_url. Role/cấp bậc/tenant/hotel/phân công,
status/account_locked/is_super_admin/is_primary_owner và các trường quản trị khác
không được đổi qua self metadata. Owner cũng không tự chuyển khách sạn bằng PATCH
profile. Phân công/quản lý nhân viên tiếp tục theo contract riêng và quyền hiện có.

Lưu thành công phải có đúng một returned row thuộc actor, đúng các giá trị gửi;
HTTP không lỗi hoặc upload Storage thành công riêng lẻ không chứng minh profile
đã lưu. Zero rows, malformed result, wrong identity và server errors không có toast
thành công. Desktop/mobile cần cùng đường lưu, giữ text đang nhập khi refetch,
hydrate profile đến muộn và reset khi đổi danh tính.

Avatar: upload mới đúng thư mục actor, rồi lưu URL vào profile và xác nhận row.
Chỉ cập nhật ảnh đã lưu trên form sau xác nhận. Không xóa ảnh cũ hoặc tự xóa object
mới khi kết quả save chưa rõ: response có thể mất sau commit. Orphan cleanup cần
inventory/reference/retention riêng, không suy failure là chưa commit.

Server: role thật từ PostgREST, live confirmed/nonbanned/nondeleted Auth + session
khóa trước users row; self-row active/unlocked/nondeleted kiểm sau khi khóa row.
Không gắn nguyên business trigger profile SHARE lên users (tránh self lock upgrade).
Managed edit RPC/RLS/constraints giữ nguyên. First-owner registration chỉ giữ
transaction-local exception đã có, đúng actor và pending_setup/tenant NULL.

**Ngoại lệ tương thích chưa nghiệm thu:** ChangePasswordPage hiện PATCH
must_change_password từ true xuống false sau Auth update. Migration giữ đúng hướng
đó để không phá caller đã tồn tại; không coi client acknowledgement là bằng chứng
đổi mật khẩu. EC05/current-password/force-change/Auth trigger và invitation setup
vẫn phải baseline riêng. Không dùng lát self metadata để ký toàn bộ column hoặc
password/invitation/legacy Edge authority matrix.

Kiểm required: actual owner/manager/staff positives, optional clearing, no-row,
locked/inactive/revoked-session negatives + recovery; protected fields; concurrent
self edits và hai thứ tự revoke; real Storage bytes/URL/profile nếu chạy; UI mocks
khác browser/Android E2E. Kèm full regression/manifest/advisors/cleanup/reviewer.
Không deploy serving, không đổi 122 releaseAcceptance hoặc gate từ một diagnostic.
