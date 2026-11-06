# RoomQC — contract lưu cấu hình quyền nhân viên

Ngày: 26/10/2026. Thuộc T03/T04/T08 và EC10–EC15 của
[kế hoạch hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md).
Đây là contract của candidate trong integration, chưa là nghiệm thu web/Android
hoặc bản đang phục vụ. Báo cáo chạy phải ghi riêng source, môi trường và giới hạn.

## 1. Phạm vi và quyền thực hiện

Hai aggregate độc lập: `grants` thay toàn bộ quyền bổ sung của một nhân viên;
`hotels` thay danh sách khách sạn cùng đủ năm cờ quyền trong một lần lưu.
Chỉnh hồ sơ chính/vai trò/vị trí là nghiệp vụ riêng. Không cho client gửi tenant,
actor, role, assigned_by, trial hoặc service key để quyết định quyền.

Mọi read/command/result trong contract này yêu cầu Auth đã xác minh, profile
active, không khóa/xóa, vai trò nhất quán, session hiện còn trong auth.sessions,
quyền users.update, đúng hierarchy/tenant/hotel/department và target không phải
bản thân hoặc tài khoản được bảo vệ. Manager chỉ cấp thêm quyền mình đang có;
cờ khách sạn không vượt cờ của chính manager trên khách sạn đó.

Command mới kiểm trạng thái gói/read-only trước mutation. Tra kết quả đã commit
vẫn có thể dùng khi gói vừa chuyển read-only, nhưng vẫn phải qua quyền hiện thời.
Không dùng JWT user_metadata làm nguồn quyền hoặc lưu owner token trong receipt.

## 2. API và DTO

Public wrappers là SECURITY INVOKER, chỉ gọi implementation private có kiểm
quyền. Anon/service_role không được gọi các endpoint này. Không có grant mới
cho browser trên bảng authority, versions hoặc receipts.

| RPC | Input | Output |
|---|---|---|
| get_employee_authority_configuration | p_target_id UUID | target_id, versions.grants/hotels dạng chuỗi, grants, hotels, primary_hotel_id, actions và semantics=additive |
| replace_employee_authority | p_target_id, p_kind, p_entries, p_expected_version, p_request_id | state=completed, target_id, kind, request_id, version và entries đã commit |
| get_employee_authority_command_result | p_target_id, p_request_id | Receipt completed của đúng actor+target hoặc state=not_found |

Mỗi grant có đúng module/action/enabled; enabled phải là boolean. Chỉ chấp nhận
module/action trong catalog server, edit được chuẩn hóa thành update. Hai phần
tử trùng sau chuẩn hóa bị từ chối. Custom false không phủ định quyền vai trò.

Mỗi membership có đúng hotel_id và năm boolean: can_create_managers,
can_create_staff, can_view_reports, can_export_data, can_approve_requests. UUID
được chuẩn hóa, không trùng; không bỏ membership của primary_hotel_id bằng
command này. Đổi khách sạn chính dùng nghiệp vụ hồ sơ riêng đã được kiểm quyền.

Giới hạn input: tối đa 256 phần tử và 131072 byte JSON; không nhận object lồng
tùy ý hoặc field thừa. Danh sách được sắp để thứ tự phần tử không tạo command
khác. Version là chuỗi số nguyên tăng dần; không ép sang JavaScript Number.

## 3. Atomic, version và đồng thời

Mutation, revision, activity_logs action=update và durable receipt nằm cùng
transaction. Bất kỳ lỗi audit/receipt/constraint nào rollback cả aggregate và
version. Danh sách hotel được remove/upsert cùng transaction; các membership
còn lại giữ assigned_at/assigned_by đã có.

Private revision được khởi tạo cho dữ liệu hiện có và trước khi tạo user mới.
Row trigger tăng revision cho cả legacy và trusted writers; UPDATE đổi target
làm tăng cả target cũ/mới. Lưu aggregate thành công luôn tăng revision, kể cả
payload không thay đổi. Hai request khác key dùng cùng expected version: chỉ
một request commit, request còn lại conflict; không tự ghi đè hoặc merge ngầm.

Thứ tự command: Auth → actor profile → actor roles → session → capability →
actor memberships → request-key advisory lock → target SHARE/roles → revision
UPDATE → tenant/hotel → relation writes → audit/receipt. Kiểm expiry bằng wall
clock sau các cửa chờ key/target/revision; row guard kiểm tiếp khi ghi.

Legacy writer có thể đã giữ row trước BEFORE ROW trigger, nên revision guard
dùng NOWAIT. Nếu command đang giữ revision, legacy statement bị PT409 và rollback
thay vì chờ theo thứ tự khóa đảo ngược. Đây không phải cho phép UI retry key mới;
caller legacy phải chuyển sang command trước khi đóng compatibility path.

Revision chỉ phiên bản hóa aggregate có thể sửa; không phải phiên bản toàn bộ
quyền kế thừa. Vai trò/capability/scope vẫn được kiểm theo trạng thái hiện thời
trong transaction. Thay đổi catalog/vai trò cần invalidate read model tương ứng.

## 4. Request key và phục hồi

Client tạo UUID một lần cho một lần lưu có chủ ý, giữ payload/expected version
theo actor+session+workspace+cluster+target+kind trước gửi. Không lưu token trong
pending record. Cùng actor+key+payload canonical trả lại đúng kết quả cũ và không
ghi audit/mutation lần hai, kể cả expected version lúc này đã cũ. Cùng key nhưng
khác target/kind/payload/expected version trả conflict.

Khi mất response hoặc F5: khóa thao tác lưu mới, đọc command-result. Completed
là kết quả xác định; not_found không chứng minh request cũ đã dừng, nên chỉ gửi
lại chính key/payload cũ. Không tạo key mới để đoán kết quả request cũ. Lookup
không lấy receipt theo UUID đơn lẻ; kiểm actor/target hiện tại và tenant thật.

| Kết quả | Hành vi client cần triển khai |
|---|---|
| 401/403 | Dừng thao tác, không tự thử lại dưới context khác; xử lý session/quyền |
| PT409 REQUEST_CONFLICT | Giữ bản pending để đối soát; không đổi payload trên cùng key |
| PT409 STALE_VERSION | Refetch, hiển thị thay đổi, người dùng quyết định bản sửa mới |
| PT409 BUSY | Chờ/đọc kết quả và thử lại có giới hạn theo contract; không lặp vô hạn |
| 400 validation | Chỉ rõ trường cần sửa; lỗi đã xác định không được báo thành công |
| Mất mạng/5xx/timeout | Giữ trạng thái chưa rõ kết quả; tra receipt trước hành động tiếp |

## 5. Read model và chuyển caller

Actions trả custom/inherited/effective riêng, tính trên catalog server và giữ
alias edit/update, role tenant/system theo enforcement hiện hành. UI chỉ chỉnh
quyền bổ sung; quyền kế thừa luôn có nhãn giải thích. Không hiển thị bỏ tick là
đã thu hồi quyền vai trò. Các quyền ngoài catalog giao diện phải được bảo toàn
hoặc đưa vào review, không âm thầm xóa khi thay toàn aggregate.

Các caller phải chuyển: useUserPermissionConfiguration/UserPermissionPanel
(web và mobile), useUserHotels/HotelAssignmentSection và legacy dialog nếu còn
entry thực. Cache/draft/pending theo actor+session+workspace+cluster+target;
hủy request cũ và bỏ callback cũ khi context đổi, không để refetch ghi đè draft.

Chưa đóng direct writes cho đến khi caller/compatibility được kiểm. Backend
command có mặt không có nghĩa UI đang dùng nó. Legacy detail RPC và quyền
hiển thị cũ cần đối chiếu riêng trước khi xác nhận toàn bộ readback đã sửa.

## 6. Nghiệm thu trong các ca hiện hữu

Áp dụng các phép kiểm con A08–A11/E08 và workflow trong phiếu EC10–EC15; không
tạo task/case release mới. Actual Auth/REST + DB snapshot/audit/receipt/version
phải chứng minh positive, denial không effects, lỗi audit/receipt rollback,
20 replay, canonical conflict, stale editor, hai tab, all-five hotel flags,
legacy version fence, revoke và expiry khi chờ lock, recovery hợp lệ.

Discard response ở test client chỉ chứng minh lookup/replay server; chưa thay
network fault ở browser, F5/pending durable hoặc Android. Chạy scoped fixture
không thay full control/backend/rebuild của candidate, Linux staging hoặc
người review/signoff. Kết quả và các phần chưa đạt phải ghi trong report riêng.
