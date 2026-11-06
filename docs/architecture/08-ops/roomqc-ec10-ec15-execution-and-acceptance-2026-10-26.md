# RoomQC — phiếu thực hiện EC10–EC15 và nghiệm thu quyền nhân viên

> **Cập nhật793:** [backend aggregate command](roomqc-ec10-ec15-atomic-commands-local-2026-10-26.md) đã đạt43actual API checks+3concurrency checks, metadata30+4, native0/source/schema/cleanup đúng. Nhận chuyển caller web/mobile, durable pending/recovery và detail readback theo [contract](roomqc-employee-authority-command-contract-2026-10-26.md); backend command không còn là việc chưa viết. UI chưa chuyển, legacy save/readback defects chưa khép; advisor667findings và full pipeline793 còn mở. Các bảng baseline/checkpoint bên dưới giữ lịch sử đúng source; chưa ký70ca.

> **Nhận tiếp sau boundary fix791:** [report API/lock/expiry và advisor mới](roomqc-ec10-ec15-authority-boundary-local-2026-10-26.md).8scope/live failures đã bị chặn;55controls có54pass/1atomic fail,1readback mismatch còn mở. Tiếp command atomic grants/membership+cờ và read model/caller/cache. Chưa toàn EC10–EC15, chưa full pipeline791 hoặc ký release.

Ngày 26/10/2026, Asia/Bangkok. Đây là việc con của **T03/T04/T08** trong
[plan toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md).
Giữ nguyên 8 đợt, 27 gói, 25 task và 70 ca nghiệm thu; không tạo roadmap mới.
BE thực hiện contract/database/API, FE nối caller, QA kiểm chứng; tên người và
signoff chưa được phân công. Phiếu này chưa xác nhận quyền sản phẩm an toàn.

## 1. Điểm xuất phát đã kiểm chứng và giới hạn

[Artifact quyền đã lọc](../../../artifacts/roomqc-ec10-ec15-permission-baseline-local-2026-10-26.json) và
[artifact caller gián tiếp](../../../artifacts/roomqc-current19-indirect-caller-disposition-2026-10-26.json)
phân biệt các lớp bằng chứng:

| Bằng chứng | Quan sát | Giới hạn |
|---|---|---|
| PostgreSQL16 cách ly, hàm SQL lấy từ source | Run `de2a7413ff6c`:22truth và6readback controls,5mismatch; cleanup0 | Summary lấy từ migration tháng4 đã bị tháng5 ghi đè; không đại diện summary của full schema hoặc API hiện hành |
| Đọc transaction read-only trên full schema 546 migrations | Run `ce2e6829dae8`: 3 manager tổng hợp cùng trả false/false/false; 0 mismatch trong dữ liệu đang có | Không seed các tổ hợp kế thừa; không phải negative proof cho toàn permission model; không xác nhận terminal backend |
| Catalog caller gián tiếp current19 | 19 đích / 1.050 nút / 936 cạnh / 28 entry paths; dismiss 1 cạnh comment-only; 4 đích không có browser candidate | Candidate discovery; chưa gọi actual endpoint, chưa chứng minh reachability hoặc no-effects |
| Source caller web/mobile | Có các chuỗi lưu nhiều request và readback chỉ đọc custom grant | Rủi ro từ source review; chưa tái hiện một phiên người dùng thực bị lưu dở |
| Actual Auth/REST sau full546 migrations | [Baseline red527a92ead3d6](roomqc-ec10-ec15-api-red-baseline-local-2026-10-26.md):26controls/9fail,4readbacks/1mismatch, native exit1; source giữ nguyên, cleanup độc lập9checks0 cho3attempts | Đã tái hiện scope/live-session/write-interruption; chưa sửa, chưa browser journey hoặc whole-endpoint closure |

Lần quan sát full schema đầu tiên đặt assertion phải có mismatch; assumption đó
thất bại vì dataset không có tình huống cần tái hiện. Giữ lịch sử lỗi assumption,
không trình bày nó là lỗi sản phẩm hoặc thay dataset hiện có để làm assertion xanh.

**Đính chính sau baseline API:** hai derived diagnostics đầu dừng trước khi chạy
ma trận quyền. Lượt thứ hai cho thấy API role-only trả effective/summary/detail
đều true. Đối chiếu source xác nhận migration
`20260528152148_2018282f-4a4a-4769-b6e8-ec7ce61e8ef5.sql` đã thay summary tháng4:
có role hệ thống/tenant, additive semantics, alias và owner bypass. Vì vậy không
coi5mismatch ở fixture summary tháng4 là5lỗi API hiện tại. Phần action checkbox
vẫn đọc custom-only trong active hook; detail RPC và save paths cần kiểm riêng.
Giữ hai failed attempts, sửa expected dựa trên definition mới nhất và giữ mọi
expected authorization-deny. Lượt thứ ba đã hoàn tất ma trận có phạm vi với
9controls không đạt; xem report red liên kết ở trên. Không biến exit1 thành pass.

Các baseline trên là local controls trước sửa, không cộng thành release cases
hoặc phần trăm ổn định. Bản sửa791 nay có migration mới và policy/trigger guards
trong integration; không thay dữ liệu đang phục vụ hoặc gate. Report fix giữ
baseline trước sửa, intermediate attempts và native exit1 do atomic save còn lỗi.

## 2. Quy tắc hiện tại và quyết định phải giữ rõ

`has_user_permission` hiện cộng quyền custom bật với quyền từ vai trò; custom
`enabled=false` không phủ định quyền vai trò. Vai trò hệ thống và alias edit/update
cũng có trong helper. Owner/super admin có bypass theo semantics của helper đó;
điều này không tự chứng minh họ được phép thực hiện mọi endpoint hoặc sửa mọi user.

| Tổ hợp dựa trên definition hiện hành | Helper quyền hiệu lực | Summary tháng5 | Detail hiện tại |
|---|---|---|---|
| Chỉ tenant role grant | true | true | true |
| Chỉ system role grant | true | true | false |
| Tenant role grant + custom false | true | true | false |
| Custom true | true | true | true |
| Xóa custom, còn tenant role grant | true | true | true |
| Owner không có role grant | true | true | false |

Bốn tổ hợp tenant-role/custom false/custom true/xóa custom đã chạy actual HTTP
trong report red; system-role và owner ở bảng này vẫn là contract/source review,
chưa gán là HTTP đã chạy. Truth table lịch sử tháng4 giữ trong artifact.

Hướng sửa dự kiến là đồng bộ phần đọc và giao diện với quyền hiệu lực hiện có,
hiển thị nguồn kế thừa và quyền bổ sung riêng. Không mô tả bỏ tick custom là đã
thu hồi một quyền kế thừa. Nếu cần deny-override, phải có quyết định policy/version,
impact và migration riêng; chưa tự đổi enforcement trong lát này.

Chốt intended-access matrix trước baseline: actor/target level, tenant/hotel,
action, live session, capability/AAL nếu contract yêu cầu, trạng thái bị khóa và
quyền tự sửa. Một helper trả true không thay các kiểm tra này.

## 3. Caller và file phải nhận khi triển khai

| Nhánh | Source hiện có | Thay đổi cần thiết sau baseline |
|---|---|---|
| Web/mobile cấu hình quyền | `src/components/users/PermissionConfigurationTab.tsx`, `src/components/users/mobile/MobilePermissionConfigurationTab.tsx` → `src/components/permissions/UserPermissionPanel.tsx` | Dùng quyền hiệu lực và provenance; chọn user/actor mới không mang draft hoặc response của user cũ |
| Readback và lưu custom grant | `src/hooks/useUserPermissionConfiguration.ts`, `src/hooks/useUserPermissions.ts` | Loại DELETE rồi INSERT qua nhiều HTTP requests khỏi save path; lỗi DELETE phải được xử lý; typed result/unknown outcome; cache có scope và version |
| Membership và cờ theo khách sạn | `src/components/permissions/HotelAssignmentSection.tsx` → `src/hooks/useUserHotels.ts` | Một lần lưu membership cùng các cờ tương ứng trong một transaction; không remove rồi add rồi PATCH từng hotel độc lập |
| SQL đọc/enforce | `get_user_permissions_summary`, `get_user_permissions`, `has_user_permission` và mọi migration ghi đè chúng | Đối chiếu definition sau toàn bộ migrations; giữ compatibility cho caller cũ; không sửa migration lịch sử |
| Legacy dialog | `src/components/users/UserPermissionsDialog.tsx` | Chưa thấy reference ngoài definition trong source đã tìm; xác minh entry/legacy callers trước giữ, chuyển hoặc bỏ; không coi đây là active UI exposure đã chứng minh |

Đường lưu custom nhiều request đã tái hiện DELETE200 rồi không gửi INSERT,
khiến1row đã lưu còn0row. Chưa chạy ngắt browser thực hoặc toàn bộ membership
replacement; cần giữ các phép kiểm đó khi sửa. Cache
`staleTime: Infinity` và key thiếu authority/workspace cần được kiểm khi logout,
đổi tenant, đổi role và remount. Không chỉ thêm invalidate vào tab của người quản lý.

## 4. Trình tự giao việc và đầu ra để review

| Bước | Thao tác cụ thể | Đầu ra / điều kiện chuyển |
|---|---|---|
| Khóa inventory và expected | Liệt kê mọi caller đang dùng RPC/REST/Edge, bảng authority, policy/grant/trigger, các field membership hiện có; ghi source và aggregate boundary | Caller matrix có mẫu số, expected allowed/denied/unresolved; không suy API an toàn từ direct ACL |
| Baseline và boundary proof đã có, bổ sung coverage còn thiếu | Giữ red26controls/4readbacks, scoped fix55controls/54pass/1fail, failed attempts và5lock barriers; bổ sung system-role/owner/alias, toàn membership fields và atomic fault/recovery | Không chạy lại baseline chỉ để tăng count; giữ8scope/live fixes và đối chiếu1atomic fail/1mismatch, không seed hoặc đổi run timed health |
| Chốt contract lưu | Xác định scope một lần lưu custom grants hoặc membership+cờ, expected version, stable client key, canonical payload digest, response/recovery và quyền actor-target | Contract/DTO/error mapping; public wrapper nếu cần chỉ gọi implementation private có quyền tối thiểu; mọi endpoint mới ghi planned |
| Viết command atomic | Kiểm live authority và target hierarchy trong transaction; kiểm scope/module/action/flags allowlist; lock theo thứ tự; mutation+version+audit+receipt cùng commit | Sai field/khác tenant/revoked/stale version không có business effects; audit/receipt fail rollback toàn bộ; không blanket grant hoặc dùng service key ở client |
| Đồng bộ read model | Từ catalog action hợp lệ tính effective/custom/inherited/source theo enforcement; không hardcode mọi module có cùng action | API readback khớp quyền thực ở những endpoint đã kiểm; alias/backward compatibility có test; false vẫn có nguồn giải thích |
| Chuyển caller | Một save gọi một command; lưu pending key/payload theo actor+target, không lưu token; response không rõ thì đọc kết quả đúng scope trước retry | F5/hai tab/mất response không tạo key thay thế hoặc ghi lần hai; chỉ báo thành công khi result xác định; draft không bị refetch ghi đè |
| Cập nhật cache và UX | Scope actor/authority/workspace/cluster/target/version, hủy request cũ; nhãn quyền kế thừa, quyền thêm và quyền thực; lỗi/recovery dễ hiểu | Đổi user/logout/revoke không nhận response cũ; người dùng không bị báo đã tắt quyền vai trò khi enforcement vẫn bật |
| Freeze và tích hợp | Focused baseline/fix/regression, full control và frozen full backend/rebuild trên source mới; lint/typecheck các caller bị đổi | Packet có source/runtime/schema trước-sau, native exit, failed history, cleanup và reviewer; proof790 trở thành lịch sử nếu source đổi |

Không bỏ direct-write path trước khi caller cần giữ đã chuyển và proof recovery
đạt. Cũng không để direct-write cũ trở thành đường vượt guard của command mới;
cần inventory đầy đủ và chuyển quyền theo contract, có compatibility được kiểm.

## 5. Tiêu chí nghiệm thu trong các ca hiện hữu

Các hàng dưới là phép kiểm con cho các ca đã mapping trong worksheet, chủ yếu
A08–A11 và luồng UI/workflow liên quan. Không thêm mã ca release hoặc tự đổi
requiredEnvironments của ledger.

| Tình huống phải chạy | Kết quả và effects phải đo | Recovery bắt buộc |
|---|---|---|
| Đúng actor/target; role-only và custom-only | Actual API cho phép đúng action; readback/UI cùng quyền thực và nguồn; chỉ scope đã chọn đổi | Remount/đăng nhập lại đọc cùng version và quyền |
| Custom false hoặc xóa custom trong khi còn role grant | Giữ semantics hiện tại; UI không báo thu hồi quyền kế thừa; không xóa role để làm test pass | Xóa role grant theo contract rồi kiểm quyền thực và readback lại |
| Khác tenant/hotel; staff tự nâng quyền; sửa protected user/field | Authorization-deny đúng loại; grant/membership/role/version/receipt nghiệp vụ không đổi; denial audit nếu contract cho phép phải tách riêng | Actor hợp lệ lưu được sau denial, chứng minh fixture không hỏng |
| Lỗi giữa replacement và commit; audit/receipt write fail | Rollback toàn bộ grant hoặc membership+cờ; snapshot trước-sau khớp | Cùng command hợp lệ retry theo contract và chỉ một commit |
| Mất response sau commit, F5, retry cùng key | Cùng receipt/version, không thêm lần audit hoặc mutation thứ hai; cùng key khác payload conflict | Đọc result đúng actor/target; key khác không được dùng để đoán kết quả cũ |
| Hai editor cùng expected version; revoke khi chờ lock | Một version thắng; editor cũ conflict; revoke-before-authorization thắng thì command bị chặn; thứ tự commit được ghi | Refetch và sửa lại có chủ ý; không tự ghi đè bên thắng |
| Bỏ hotel hoặc khóa/offboard nhân viên | Actual API tiếp theo phản ánh quyền hiện thời đúng contract, kể cả token cũ; rows/receipt/tasks cần giữ không mất | Restore assignment hợp lệ và positive lại; không xóa user/data để cleanup |
| Chuyển user/workspace, logout, hai tab và mobile390 | Response/cache cũ không ghi vào context mới; inherited label, focus/loading/error/unknown rõ; Back giữ ngữ cảnh | Mở lại đúng target và recovery pending command, không duplicate save |

Đối chiếu HTTP, DB row snapshots, receipt/audit/version và UI. SQL `SET ROLE`
không thay actual Auth/API proof. 5xx, timeout hoặc fixture hỏng không tính là
authorization-deny. Mỗi combination applicable cần result; unresolved/N/A có lý do.

## 6. Packet bàn giao và phần tiếp theo

Packet gồm caller/intended-access matrix; contract và schema refs; red baseline;
delta; command run/time/exit; effects và recovery; source/image/runtime binding;
cleanup; các endpoint/role chưa kiểm và external inputs. Giữ reviewer/signoff
trống khi chưa có người nhận. Local evidence không đóng T03/T08 hoặc gate release.

[Full timed backend790](roomqc-installer790-full-backend-local-2026-10-26.md) nay
đã terminal0, source binding cuối và cleanup độc lập đạt. Actual API baseline
EC10–EC15 chạy bằng derived diagnostic riêng, giữ nguyên source sản phẩm/harness.
Baseline trước sửa native exit1 có hai lỗi scope, sáu lỗi live authority và một
lỗi lưu custom bị ngắt. [Fix791](roomqc-ec10-ec15-authority-boundary-local-2026-10-26.md) chặn8scope/live failures, còn atomic fail và1readback mismatch. Tiếp
bước3–5 của [phiếu giao mục17](roomqc-vps-signup-plan-current-2026-10-26.md#17-lệnh-giao-việc-đầu-tiên-sau-baseline-api-red); native advisor665findings đã scan, disposition còn mở.
Independent rebuild chỉ lấy reference full run thành công đã cleanup và cùng
source; không lấy diagnostic hoặc run dở. Delta sản phẩm mới cần checkpoint mới.

Sau lát này tiếp review indirect current19/policy/FK/advisor còn lại rồi **T07
alerts → T09/T10 admission/budget → T11/T12/T13 signup → hai console → Linux/DR/
on-call → simultaneous A/B/E2E/load/RC/pilot** theo dependency plan. Không lặp lại
scope đã có proof chỉ để tăng count; việc cần khóa/quyền ngoài host tiếp tục gom
theo case, không đổi chúng thành pass.
