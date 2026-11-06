# RoomQC — rà soát quyền gián tiếp và authority trên candidate98b

Ngày26/10/2026. Checklist con T03/T08 của
[plan toàn bộ VPS + signup](roomqc-vps-signup-execution-ready-2026-10-22.md).
[Artifact có cấu trúc, đã lọc](../../../artifacts/roomqc-t08-current-source-review-2026-10-26.json).
Đây là kiểm kê và đối chiếu source/database, chưa là nghiệm thu toàn bộ quyền.

## 1. Nguồn bằng chứng

Default full backend343bb7abed65 đã native exit0, final phase
permission_controls_verified, source binding đầu/cuối khớp và cleaned=true.
Scoped source98b07138… gồm773file/546business+9directory migrations;
runtime142file/b57144a5…. Independent rebuild380159ba6e22 sau đó cũng terminal0,
source/schema/runtime khớp và cleanup độc lập0; không sửa source trong lượt đo.
Không truy vấn hoặc thay DB đang phục vụ khách.

Đọc catalog của chính full run trên từ file private, kiểm SHA bằng ownership
record trước khi phân tích. SHA catalog:
`6fa87474ddcea725d0204215c22a32f9e2afc855299bc2be6abebf6cad77ddbe`.
Catalog chụp2026-10-26T09:01:28.614176+00:00. Báo cáo chỉ lấy tên đối tượng,
privilege flags, counts và digest; không xuất function body/raw ownership/token.

## 2. Phạm vi thực tế đã kiểm kê

| Nhóm | Số lượng / ý nghĩa |
|---|---|
| Bảng nội bộ RLS không policy |19; không có table/column grant trực tiếp cho anon/authenticated |
| Functions / views / policies |492 /11 /369 trong public/private; không đồng nghĩa đã review hết |
| Triggers |159 trong graph, gồm2trigger ngoài public/private |
| Candidate graph |1.050nodes,936edges,28candidate entry paths tới19targets |
| Dynamic SQL candidate |1function generate_unique_code,4candidate ancestors |
| Foreign keys |13FK thuộc inventory workload;23target-boundary FK là inventory riêng |
| Unresolved graph edges |25catalog view→base relation edges; giải thích ở dưới |

28paths được phát hiện bằng dependency/name matching để giao review. Một bảng
không có candidate path vẫn cần kiểm Edge/service/dynamic/trigger/FK; không
đánh dấu an toàn vì graph có0entry. Browser roles trên trigger chỉ nói role có
base-table privileges, chưa chứng minh RLS cho phép chạm hàng.

Đã disposition một source-name edge là comment-only: đường
trg_prevent_user_priv_esc→prevent_user_privilege_escalation→complete_registration
→roomqc_cluster_config được discovery nối vì comment trong body trigger nhắc
`complete_registration()`. Body hiện hành có1comment reference và0reference
ngoài comment tới hàm đó; source body khớp migration20260919181626. Giữ graph28
đúng kết quả discovery, ghi false-positive riêng thay vì sửa count để giả an toàn.
Đường gọi complete_registration trực tiếp và quyền tổng thể của trigger vẫn cần
review; việc này không chứng minh không có dynamic/indirect path khác.

Cả25unresolved edges là dependency lấy từ pg_rewrite/pg_depend qua pg_class
đến các base relations không thuộc node set gồm19no-policy tables và11views.
Ví dụ dashboard_stats→rooms/hotels/items và v_user_effective_roles→user_roles.
Đây không là25table bị thiếu trong database. Row-policy, view security và
quyền trên các base relations này vẫn chưa được disposition bởi giải thích đó.

## 3. Đối chiếu source thật và giới hạn từng đường

Đã đối chiếu body của cả 19 hàm xuất hiện trên candidate paths và 8 hàm kiểm
authority phụ thuộc với migration; tất cả trùng body database sau chuẩn hóa
CRLF/trim. JSON ghi từng digest, migration khớp và effective EXECUTE/search_path
tại thời điểm chụp catalog. Đây là provenance, chưa là kết luận authorization.
Bốn đường trong bảng dưới có review cụ thể hơn; không suy current source từ
migration cũ chỉ vì cùng tên.

| Đường / source đã đối chiếu | Kết quả hiện có | Còn phải chứng minh |
|---|---|---|
| public.generate_unique_code — migration20251108024651, search_path được ALTER sau đó | SECURITY INVOKER, format%I quote identifier; full run có3role denials khi nhắm email_deliveries, positive trước/sau, snapshots không đổi | Không là proof mọi dynamic table/column/caller, schema hoặc workload đều an toàn |
| private.edit_employee_profile — migration20261021143251 | SECURITY DEFINER/search_path rỗng; kiểm live Auth/profile/roles/session/module permission, target/hotel scope trước replay/effects; actual REST/Auth30checks đạt | Harness tự ghi fullEmployeeAuthorityMatrix=false, browserAndroidE2e=false; không đóng toàn quyền nhân viên |
| private.queue_owner_workspace_ready — migration20261020085628 | Explicit EXECUTE bị từ chối cho cả4runtime roles nhưng trigger vẫn là đường vào; kiểm owner/recipient/tenant/hotel.20fresh events,18invalid-state denials,23positive queues và dedupe đạt trong full run | Local consumer disabled; Internet email và toàn recipient/offboarding/workflow vẫn mở |
| public.prevent_user_privilege_escalation — migration20260919181626 | Body hiện hành có provisioning-context exception và nhánh bảo vệ role/tenant; khớp current DB | Standalone EXECUTE ACL không thay trigger semantics. Cần review guarded registration roots, context setters và base-table policies, kể cả stale/revoked actor |

Full run còn có44denials qua4actor/session roots×11invalid states; mutation
caller294checks gồm162matrix denials qua HTTP và29business snapshot tables.
Những số này là phạm vi của harness hiện hữu, không tự phủ hết28candidate paths
hoặc toàn369policies. Direct no-policy proof là228browser/probe denials,
64private-service denials,41installer/service read positives,19unchanged
snapshots.18/19targets có hàng ở thời điểm direct audit; employee receipt được
kiểm bằng caller phase sau đó. Không đổi thành19real tables populated ở cùng mốc.

### 3.1. Những helper phải theo tới gốc authority

| Helper / migration body hiện hành | Trạng thái đã đối chiếu | Giới hạn kết luận |
|---|---|---|
| private.lock_live_role_actor — 20261020093925 | INVOKER; cả bốn runtime roles không có explicit EXECUTE | Public callers vẫn gọi nội bộ; phải kiểm live actor và thứ tự khóa trong transaction |
| private.room_setup_owner / private.subscription_quote_actor — 20261020082007 | DEFINER, search_path rỗng; không cấp explicit EXECUTE cho bốn runtime roles | Quyền module, workspace, hotel và session phải theo từng caller; ACL helper không thay proof caller |
| private.require_reconciliation_case_actor — 20261017145741 | DEFINER, search_path rỗng; explicit EXECUTE bị từ chối | Có gọi public.platform_support_actor, cần theo helper hiện hành ở dòng kế |
| public.platform_support_actor — 20261020082007 | DEFINER, search_path rỗng; chỉ authenticated trong bốn roles được EXECUTE; body kiểm Auth/profile/superadmin/session hiện thời | Đã đọc source nhưng chưa disposition toàn bộ root và policy; stale JWT và Auth/session revocation cần proof theo transaction |
| private.registration_owner / public.registration_actor / public.provision_workspace_registration — 20261020041251 | Body khớp; private helper không cấp explicit EXECUTE, public actor chỉ authenticated và provision chỉ service_role trong bốn roles | Service entry, provisioning context, owner verification và trigger/base-row policies còn phải review cùng nhau |

Không xuất body function hoặc dữ liệu người dùng vào artifact. Trường
semanticAuthorizationReviewed=false trong provenance nhắc rằng so khớp body
không đồng nghĩa đã đóng semantic review của từng hàm.

### 3.2. Đối chiếu bằng chứng API thực với từng nhóm thao tác

Đọc nhãn assertion đã lưu trong full run 343bb7abed65, không chạy lại hay tăng
số test. Cả 18 thao tác dưới đây đều có denial cho đủ 9 trạng thái: chưa xác
minh email, Auth ban, Auth soft-delete, profile soft-delete, khóa tài khoản,
inactive, status null, thu hồi role và session hết hạn. Tổng là 162 denial.

| Actor | RPC / thao tác trong harness | Số thao tác |
|---|---|---|
| Owner | get/save/complete_hotel_room_setup: đọc, lưu, hoàn tất phòng | 3 |
| Owner | get_subscription_quote / create_subscription_quote: đọc, replay, tạo mới | 3 |
| Owner | get_subscription_checkout_draft / create_subscription_checkout_draft: đọc, replay, tạo mới | 3 |
| Owner | cancel_subscription_payment | 1 |
| Platform admin | admin_manage_tenant / settle_subscription_payment | 2 |
| Platform admin | admin_subscription_reconciliation / admin_subscription_reconciliation_case | 2 |
| Platform admin | admin_mutate_subscription_reconciliation_case: replay và note | 2 |
| Platform admin | admin_subscription_job_monitor / admin_recover_subscription_status_run | 2 |

Harness so hash của 29 bảng **sau mỗi nhóm actor/trạng thái**, không chụp
snapshot riêng sau từng RPC. Sau phục hồi authority, owner kiểm đọc phòng và
checkout replay; admin kiểm case replay và monitor. Không suy mỗi thao tác
đều có một bài recovery riêng hoặc mọi đường phụ thuộc của RPC đều đã phủ.

Scope matrix còn có staff bị từ chối 10 thao tác owner, owner bị từ chối 8
thao tác platform admin, owner tenant khác bị từ chối 8 thao tác owner. Hai
thao tác tạo/replay quote không nằm trong other-tenant matrix. Browser gọi
lock_live_role_actor bị từ chối 404/PGRST202. Snapshot sau nhóm scope không đổi.

Có 14 lần thu hồi quyền commit trước mutation đang chờ khóa thực và một lần
mutation giữ khóa trước lệnh thu hồi. Lần thứ hai cho phép mutation hoàn tất
trước khi thu hồi, rồi từ chối lệnh tiếp theo. Ngoài ra, global logout thực qua
GoTrue từ chối 12 thao tác dùng session cũ; snapshot hai nhóm không đổi, có
positive bằng session mới. Không suy hiệu lực thu hồi ngược thời gian.

JSON ánh xạ từng function entry sang các operation đã có proof. Entry không
có operation trong mapping này chỉ có nghĩa harness mutation không phủ nó;
employee profile, password và registration có harness riêng. Cả các entry có
mapping vẫn giữ allPathsAccepted=false: workflow, trigger, Edge, dynamic SQL,
base-row policy và browser/Android E2E chưa được nghiệm thu toàn bộ.

## 4. Khoảng trống authority đã đối chiếu caller

| Vị trí hiện hành | Authority đang dùng | Delta T08 cần thực hiện sau khi rebuild kết thúc |
|---|---|---|
| config.mjs→ReleaseValidationCatalog | File do installer nạp vào process; catalog v1, get kiểm hạn credential | Signed envelope và trust keyring riêng; hạn approval không lấy từ credential |
| ClusterGateway.validateCluster→releaseValidationContext | Expected identity+canary hiện từ catalog/config và manifest gateway | Kiểm approval provenance/binding/expiry/epoch trước remote collection và lúc commit kết quả |
| AdminDirectory.execute(validate)→assertReleaseValidation | Transaction recheck cấu hình và bằng chứng, manifest age30s | Đọc durable approval/withdrawal state trong cùng transaction, giữ audit/receipt/version/replay |
| withCredential→expectation→admissionDecision | Identity snapshot trong process, probe binding/health expiry trong directory | Admission/reserve/first provision cần approval hiện thời; cache/notification không thay primary authority |
| ManagedHealthCatalog→ProbeSessionManager | Metadata expected readonly; credential revision và binding trong DB | Managed metadata phải gắn approval identity/epoch; worker cũ không tự chấp nhận approval mới |
| HealthStore.record→assertHealthProof | Kiểm credential/policy/target/release binding ở transaction, clock DB | Thêm durable approval freshness/epoch vào commit guard; không giữ transaction qua HTTP |

Chưa có signed issuer approval, expiry riêng hoặc withdrawal epoch trong catalog
v1. Lượt release/catalog đã đạt dùng synthetic approval; actual release mutation
fencing không được relabel thành issuer/cross-replica withdrawal proof. Phiếu
thiết kế chi tiết ở [plan16.6](roomqc-vps-signup-execution-ready-2026-10-22.md#166-phiếu-thiết-kế-t08-kế-tiếp--phê-duyệt-có-hạn-và-thu-hồi-xuyên-replica).

## 5. Nhận việc tiếp và điều kiện đóng

1. Independent rebuild đã có native terminal0 và cleanup0; giữ proof98b là lịch sử,
   candidate runtime mới cần kiểm chứng riêng.
2. Khép T08 signed approval/expiry/durable withdrawal, thử hai API/worker process
   trên cùng directory, giữ actual response qua commit và kiểm no-effects/recovery.
3. Review từng28candidate paths cùng các Edge/service paths ngoài graph. Tách
   source review, direct SQL role test, actual API/trigger proof và browser E2E.
4. Hoàn tất full employee authority matrix, recipient/offboarding/workflow và
   disposition policy/FK theo workload;620advisor findings lịch sử vẫn mở.
   Lượt này không có native advisor rescan, không tự ghi count mới bằng graph.
5. Tiếp T07 alerts/outbox → T09/T10 admission/budget → T11–T13 signup/recovery →
   T14–T17 consoles → T18–T24 Linux/DR/E2E/load/RC → T25pilot theo dependency.

Đây là progress của source audit. Không tăng số task/case/package;70worksheet
vẫn not_run,122release entries unverified, reviewer/signoff null và các gate
L/S/P/U/B giữ nguyên. Quyền/khóa external thiếu được hoãn đúng case, không làm
thay đổi tiêu chí nghiệm thu hoặc ngăn phần local tiếp tục.
