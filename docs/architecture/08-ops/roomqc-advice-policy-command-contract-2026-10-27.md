# RoomQC — contract triển khai lệnh quản lý policy tư vấn

Ngày 27/10/2026. Đầu vào P1/P2 của phiếu19.37, thuộc T03/T04/T08/T10/T13.
Đây là đặc tả để triển khai, **chưa phải API đã kiểm chứng hoặc quyết định đã
được review/ký**. Bản nháp migration577 đã có bốn RPC/journal/helper; chưa replay
hoặc chạy native/upgrade và chưa nối runner. Nhận theo [phiếu19.38](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1938-phiếu-bắt-đầu-và-bàn-giao-plan--nghiệm-thu).
Inventory ở mục1 mô tả baseline1019 trước sửa; giữ làm đối chiếu, không là trạng
thái triển khai của bản nháp. Baseline1019 xác nhận các khoảng trống trước sửa.
Không bật tenant thật, chốt giá/quota thương mại hoặc triển khai VPS ở bước này.

## 1. Inventory đã đối chiếu

| Thành phần hiện hữu | Đường dùng / quyền hiện tại | Delta cần làm |
|---|---|---|
| Migration573 configure_operations_advice_policy | Bảy tham số, service_role-only, kiểm tenant/limits/expiry; upsert tăng version và activity_logs cùng transaction | Thiếu live operator, command key, expected version và lookup; expiry chỉ kiểm trước các điểm chờ |
| private.operations_advice_policy | Private, RLS, không có policy, không grant DML cho anon/authenticated/service_role | Giữ nguyên mặc định disabled; quyền sửa chỉ qua command mới |
| private.operations_advice_commands | Advice reservation/dispatch/result/closure và charge/fence | Không dùng bảng này làm journal sửa policy; không xóa hoặc hoàn lượt khi đổi policy |
| platform_support_actor | Quyền platform theo user_roles.super_admin cùng Auth/profile/session hiện hữu | Helper mới phải khóa/live-check và dùng clock_timestamp sau wait; không tin user_metadata, body hoặc JWT role tự nhận |
| server/control/admin.mjs | platform-read/infra-operate/support-reconcile, theo support cluster | Chưa có advice-policy operation/remote receipt. Control integration phải kiểm mapping/cụm; không đưa service key xuống browser |
| AISettingsPage.tsx | Editor OCR, upsert ai_settings và chọn model đọc giấy tờ | Không dùng làm editor bật/quota tư vấn vận hành |
| useOperationsAdvice/client/OperationsInsightsTab | Caller tư vấn thủ công và pending recovery | Chưa có policy admin editor; thêm đường click sau backend contract và client đã kiểm |

Tìm trong source local thấy configure_operations_advice_policy chỉ được gọi
từ các fixture/harness advice (native, Edge, authority, UTC và seed upgrade).
Không thấy production caller trong src, Edge hoặc control server. Kết quả
này không chứng minh không có deployment/script ngoài repository; inventory
vận hành và compatibility vẫn phải kiểm trước rollout.

## 2. Ranh giới quyền và scope

- V1 dùng platform super-admin của backend đích, kiểm canonical user_roles
  hiện hành như platform_support_actor. Cần Auth đã xác minh, không banned/
  deleted; profile active/không locked/deleted; session đúng actor, chưa hết
  hạn và JWT chưa hết hạn. Token service_role hoặc probe không thay người dùng.
- Owner/staff khách sạn không được tự bật dịch vụ, tăng quota hoặc sửa policy
  của tenant mình/người khác. Không mở delegated capability mới trong migration.
- Mỗi command ràng actor, tenant, runtime/cụm ở caller và payload chuẩn hóa.
  ID tenant phải tồn tại ở backend đích. Control plane không được tùy chọn
  URL hoặc chuyển sang cụm khác khi mất mạng.
- Các RPC mới là wrapper mỏng; private helper với search_path rỗng làm phần
  cần quyền đặc biệt. REVOKE EXECUTE mặc định và table/column DML; chỉ GRANT
  wrapper authenticated. RLS không có public policy cho journal nội bộ.

## 3. Contract RPC cần xây

| RPC theo contract, có bản nháp577 chưa kiểm | Tham số | Response v1 |
|---|---|---|
| get_operations_advice_policy | p_tenant_id | tenant_id, revision, policy; missing row: revision0/policy null, nghĩa disabled; không tự tạo limits |
| set_operations_advice_policy | p_tenant_id, p_command_id, p_expected_version, p_policy | command_id, tenant_id, state succeeded và result chứa snapshot policy/revision lúc commit |
| get_operations_advice_policy_command | p_tenant_id, p_command_id | Cùng actor/tenant đọc terminal receipt; không có: not_found. Không trả receipt người khác |
| cancel_operations_advice_policy_command | p_tenant_id, p_command_id, p_expected_version, p_policy | cancelled tombstone nếu chưa apply; đã succeeded trả receipt gốc; key khác payload conflict |

Envelope có version1 riêng với revision của policy. Chỉ trả cấu hình/metadata
cần cho operator, không raw provider key, command advice, snapshot nghiệp vụ
hoặc JWT. Read hiện tại và receipt lịch sử là hai loại dữ liệu khác nhau:
replay receipt cũ không khẳng định policy hiện tại vẫn giống snapshot đó.

p_policy chỉ nhận enabled, daily_limit, daily_budget_units, units_per_request,
valid_until và reason; reject key thừa/type sai/null/oversize. Giữ bounds
hiện tại 1..100000 lượt, 1..100000000 units và units/request không vượt budget;
đây là bounds kỹ thuật, không phải giá hay gói được bán. Reason trim5..1000.
Enabled yêu cầu expiry tương lai, không quá366ngày, kiểm lại ngay trước commit.
Tắt policy hết hạn phải làm được mà không bịa hạn mới; contract validation
cho disabled cần thể hiện điều này rõ trong test và client.

Expected version0 chỉ tạo row chưa có; version hiện tại phải khớp để sửa.
Hai editor cùng version: một succeeded, một409 và không ghi đè. Cùng actor/
command/payload replay trả receipt gốc, không tăng version/audit. Cùng key
khác tenant/expected version/nội dung:409. Canonical digest dùng dữ liệu đã
chuẩn hóa, timestamp cùng thời điểm có biểu diễn nhất quán, không phụ thuộc
key order của JSON hoặc timezone session.

Cancellation là phần bắt buộc của recovery: not_found không chứng minh write
cũ không còn tới. Mã bị cancel phải là tombstone bền vững trước khi UI bỏ
pending hoặc tạo mã mới. Cancel không đảo apply đã thành công. Conflict được
xử lý bằng đọc hiện trạng, giữ draft và hành động bỏ/tạo lại rõ ràng; không
tự thay expected version và ghi lại. Không được lặp lại lỗi terminal recovery
đã sửa ở employee authority/report targets.

## 4. Transaction, clock và audit

Thứ tự khóa cần cố định và kiểm trong implementation: live Auth/profile/role/
session → actor-command advisory → target tenant → tenant-policy advisory →
policy row → mutation/audit/command receipt. Cancel/apply/lookup cùng key dùng
cùng serialization rule. Không gọi HTTP/provider trong transaction.

Sau mọi điểm chờ và ngay trước trả dữ liệu/commit, kiểm lại session/JWT clock,
quyền platform và expiry của policy bật. Lỗi expiry/session/audit/receipt phải
rollback policy, revision, audit và command mới. Baseline thật ở audit barrier
phải chuyển từ200/expired persisted sang4xx/no mutation, giữ expected cũ.

Audit ghi actor thật, command, tenant, reason, before/after revision và values
an toàn. Command receipt, audit và policy commit cùng transaction; không ghi
receipt succeeded trước network hoặc suy succeeded từ HTTP202. Metadata query
phải giữ cùng live authority; revoke chặn cả replay/read/lookup/cancel.

Chặn cấu hình qua legacy service-role RPC trong migration tiến tới, giữ rõ
compatibility break. Điều chỉnh setup fixture hiện hành; không giữ bypass cũ
chỉ để bộ test xanh. Database installer vẫn là kênh đặc quyền riêng, không
phải browser/operator API. Không sửa migration573 hoặc history.

## 5. File và nghiệm thu trước khi bàn giao backend

| Phần phải sửa | Evidence cần có |
|---|---|
| Migration kế tiếp bằng CLI pin2.121.0 | Journal policy commands riêng, RLS/revoke/grants, private live helper, bốn wrapper và đóng legacy path; không enable tenant có sẵn |
| Native policy diagnostic mới | Positive operator; owner/staff/service/probe/anon denial; auth/profile/role/session offboarding; two editors,20 same-key replay, payload conflict, lookup/cancel race |
| Fault/clock tests | Audit/receipt fault rollback; observed policy/command/audit wait; JWT/session/policy hết hạn theo clock thực; recovery dùng mã gốc |
| Advice integration | Đổi policy khi reserved/dispatch/provider/final release, quota mới nhỏ hơn usage, disabled/re-enabled; không resend/refund/xóa charge hoặc tombstone |
| Setup fixture active | native/Edge/authority/UTC helpers không coi service-role config là positive sau khi đường cũ bị đóng; seed historical upgrade giữ đúng source cũ |
| ACL inventory | Bổ sung đúng bảng journal mới; direct DML/column grants và tamper drill; expected target count tăng có lý do, không dùng allowlist tự phát hiện để bỏ qua bảng mới |
| Populated upgrade | Seed576 có money/policies/advice receipts/unknown/closed/trial; fault sau body/history trướcCOMMIT rồi forward; kiểm grants/schema/history/data và new caller |
| Compatibility và UI | Old/new client×Edge×schema đầy đủ, binary thực trước rollout; typed pending recovery/editor/route và browser/Android có proof riêng |

Không cần provider key thật để làm phần này. Freshness/retention/abuse có
quyết định riêng ở19.37 P5/P6; chưa tự chọn TTL, retention xóa dữ liệu hoặc
quota thương mại. Linux/TLS/offsite/load/pilot vẫn theo các task toàn VPS/signup.
Chưa reviewer/signoff/gate;70ca not_run và122mục unverified giữ nguyên.
