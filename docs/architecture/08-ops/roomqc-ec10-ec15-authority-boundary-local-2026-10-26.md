# RoomQC — sửa ranh giới cấp quyền nhân viên, kiểm chứng API local

Ngày 26/10/2026, Asia/Bangkok. Việc con T03/T04/T08 trong
[plan toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
[Artifact đã lọc](../../../artifacts/roomqc-ec10-ec15-authority-boundary-local-2026-10-26.json)
ghi source hiện hành và kết quả. **Tám lỗi scope/live authority của baseline
không còn tái hiện; phần quyền chưa hoàn tất.** Diagnostic cuối vẫn native
exit1 vì lỗi lưu custom quyền nhiều request còn tồn tại; detail readback còn1
mismatch. Đây không phải full backend hoặc nghiệm thu release.

## 1. Thay đổi sản phẩm và phạm vi

Migration mới được tạo bằng CLI có sẵn2.121.0:
`supabase/migrations/20261026141917_employee_authority_scope_live_boundary.sql`.
Không sửa546migrations lịch sử. Chỉ sửa thêm inventory assertion trong
`scripts/control-backend-hotel-scope-checks.mjs` để kiểm riêng hai authority
triggers mới; năm business triggers/policies cũ vẫn được assert đầy đủ.

- Thêm restrictive INSERT/UPDATE/DELETE policies cho user_permissions và
  user_hotels. Kiểm actor-target thật, cùng tenant, hierarchy, target được bảo
  vệ, role nhất quán, users.update và scope hotel; không thêm permissive policy
  hoặc quyền ghi bảng cho browser.
- Statement guard khóa Auth → profile → roles → session → capability trước
  authority row locks. Kiểm session bằng clock database hiện thời sau chờ khóa,
  không dùng thời điểm bắt đầu transaction để cho qua phiên vừa hết hạn.
- Row guard kiểm user/tenant/hotel thật cho writer đặc quyền; authenticated
  writer được kiểm lại target sau lock wait, cả old/new UPDATE và DELETE. Giữ
  ngoại lệ hẹp cho membership owner của guarded registration root đã có; trusted
  cleanup được xóa quan hệ cũ không hợp lệ, không tự sửa dữ liệu lịch sử.
- Bốn function mới nằm private, search_path rỗng, ACL tối thiểu. Browser chỉ
  thực thi hai predicate đọc boolean theo caller; không trực tiếp gọi trigger
  functions. Giữ semantics additive của quyền vai trò/custom.

Source quan sát mới: **791file /547business +12directory migrations**. Đây là
delta sau checkpoint790; control358/358 và full backend790 là proof lịch sử,
không được gán cho source mới. Proof trước-sau của lượt này ràng buộc runtime
source và547migration files; manifest791được quan sát khi publish, không tuyên
bố đã capture toàn bộ791file trước lượt chạy.

## 2. Actual API và kiểm tra cạnh tranh

Fixture cuối `5f7097b48c87`, backend `f7faa39ac80d`: Auth login/token thật, REST
thật, full547migrations trên Docker fixture exact-owned/internal, không xuất
cổng Docker và không dùng provider Internet. Không thay DB đang phục vụ.

| Nhóm | Kết quả có bằng chứng |
|---|---|
| Đối chiếu9fail của baseline | 8scope/live failures nay bị chặn; grant chéo tenant, membership chéo tenant và6locked/inactive/deleted-session writes không có effects. Lưu custom bị ngắt vẫn fail |
| Ma trận mở rộng | 55controls: **54đạt/1không đạt**, fixture executionComplete=true, không fixtureError; mọi intended deny được giữ, không đổi thành allow để đạt |
| Biến đổi đích và xóa | Đổi user/tenant/hotel khi PATCH, self/protected target, service cross-tenant INSERT và locked/inactive/revoked DELETE có denial/no-effects và recovery |
| Năm lock barriers thật | Session deletion, actor role withdrawal, target offboarding và session expiry ở hai điểm chờ (trước xác thực và khi chờ target) đều403/42501, authority rows/audit/receipts không đổi; recovery hợp lệ đạt |
| Sửa hồ sơ cũ | **30controls và4races đạt**, gồm command/audit/receipt, valid manager và owner paths; đây là hồi quy metadata, chưa là membership save UI |
| Đọc quyền | 4HTTP readbacks, **1mismatch vẫn còn** ở role grant + custom false; chưa sửa detail RPC hoặc active UI |
| Schema và source | Schema fingerprint không đổi qua advisor/diagnostic; outer driver xác minh runtime và547migration files không đổi. Inner runner chưa tới verifySource vì assertion tổng vẫn red |

Trong role/target/expiry races, fault authority được phép thay đổi đúng profile,
role hoặc session theo fixture; no-effects đo permission/membership/audit/receipt.
Không gộp intentional revocation vào business-write effects. Expiry barrier xác
nhận phiên còn hạn khi request đã bị giữ, rồi đợi DB clock qua hạn trước thả khóa.

## 3. Advisor mới và failed history

Native CLI2.121.0 đã scan full schema hiện hành qua tunnel loopback tạm tới đúng
DB fixture; Docker không publish port. Schema trước-sau khớp. Có **665findings**:

| Loại | Số lượng | Cách nhận tiếp |
|---|---|---|
| INFO rls_enabled_no_policy | 19 | Đối chiếu current19 grants/definer/trigger/caller, không suy mọi đường đều an toàn từ direct ACL |
| INFO unindexed_foreign_keys | 7 | Đối chiếu workload, parent-delete/update locks và query plan trước thêm index |
| INFO unused_index | 504 | Fixture ít workload không đại diện production; không xóa index chỉ để giảm count |
| WARN multiple_permissive_policies | 135 | Review semantics/độ phủ/plan từng bảng; không xóa policy hoặc coi count cũ là scan mới |

CLI dùng fail-on none để lấy đủ inventory; exit0 chỉ xác nhận scan chạy, **không
xác nhận665findings đã xử lý**. Không có ERROR được CLI báo trong kết quả này.

Giữ bốn attempts: `1db4675fec58` dừng trước controls vì fixture còn expected năm
generic live triggers; lúc đó implementation thử gắn thêm hai. Đã sửa contract
inventory để authority có trigger riêng và assertion riêng. `99aaf87ab3cb`
hoàn tất47controls, còn lỗi atomic save; là checkpoint trung gian. Sau hardening
role/target/clock wait, `3060f5b08b4f` hoàn tất53controls. Lượt cuối
`f7faa39ac80d` thêm kiểm expiry sau khi đã xác thực nhưng còn chờ target lock,
hoàn tất55controls. Không xóa failed attempts hoặc gán proof của checkpoint
trung gian sang source cuối.

Một lần thử scan riêng từ ngoài runner bị chặn vì fixture đã terminal trước
kết nối; không scan serving DB thay thế. Scan cuối được nối trước diagnostic
ngay trong derived owned runner, có source/target/schema binding.

## 4. Cleanup và việc nhận tiếp

Cả bốn attempts cleaned=true. Mười hai kiểm tra Docker độc lập theo ownership label
cho từng run xác nhận container/network/volume đều0, mọi lệnh exit0. Index cây
chính và hai delivery ledgers giữ nguyên. Chỉ docs/artifacts đã lọc được chuyển
sang cây chính; code migration và harness nằm ở integration, chưa deploy live.

Tiếp theo phải làm **command atomic cho custom grants và membership+cờ**, version,
stable key/receipt/audit và lost-response recovery; đồng bộ effective/provenance
read model và chuyển active callers/cache. Sau đó khép indirect/workflow/advisor
disposition và freeze/full control/full backend/independent rebuild trên candidate
mới. Chưa có các full runs cho source791. Không mở gate từ packet này.

**122release entries vẫn unverified;70worksheet rows vẫn not_run.** Chưa đủ
browser/Android, Linux/TLS, email Internet, offsite DR, A/B đồng thời, tải và pilot.
Plan vẫn giữ đủ8đợt/27gói/25task/70ca; không thu hẹp thành chỉ sửa quyền.
