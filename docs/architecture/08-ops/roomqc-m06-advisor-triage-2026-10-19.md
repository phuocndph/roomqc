# M06 — triage ban đầu database advisors

**Snapshot hiện hành — current19/direct/FK boundary, sourcef7da974… /22-10:**
[report current19](roomqc-m06-current19-direct-local-2026-10-22.md) /
[artifact](../../../artifacts/roomqc-m06-current19-direct-local-2026-10-22.json).
A d6d4cddd7fe4/B0678a65fb125 terminal0, cleaned23/run và independent leftovers0, source/build/schema khớp.
Schema94118376… khớp; CLI2.121.0: A603/B604 findings.
A603/B604=19 no-policy INFO +7 FK INFO +442/443 unused-index INFO +135 permissive WARN,0 ERROR.
Harness19-target direct và23 FK parent boundary đạt đúng scope; không đổi schema,
thêm policy hoặc drop index để làm findings giảm. Current19 indirect/policy OR/
FK workload disposition và R4/T08 vẫn mở; hai receipts chưa được suy allSafe.

**Snapshot lịch sử — full attempt754/546, source472b98…:**
Run b23d3bbad9c1 exit1/no_policy_controls/P0001, cleanup/independent leftovers0.
Log không cho exact allowlisted reason. Red trên schema synthetic19 tái hiện
inventory mismatch của harness cũ; không đổi failed history thành pass.
Diagnostic d117652 khác603 ở49 unused theo workload/stats, không là49 lỗi đã sửa.

**Snapshot lịch sử — invitation pagination752/545:**
[report](roomqc-m06-staff-invitation-pagination-local-2026-10-22.md), run981105145983,
652=19 no-policy +7 FK +491 unused-index +135 permissive WARN; schema match,
cleanup15/leftovers0.751 có653/8FK. Giữ inventory8 FK lịch sử để đối chiếu từng
entry với7 current findings; count giảm không thay workload/disposition proof.
R4/T08/gates vẫn mở; không gán proof lịch sử cho source khác.

**Snapshot lịch sử — invitation caller738/541 /22-10:**
[report](roomqc-m06-staff-invitation-caller-local-2026-10-22.md) /
[artifact](../../../artifacts/roomqc-m06-staff-invitation-caller-local-2026-10-22.json),
run c2de47239a7d, native CLI2.121.0 thực chạy:
**656=19 no-policy INFO +8 FK INFO +494 unused-index INFO +135 permissive WARN**,
0 ERROR. Schema trước/sau/advisors khớp; diagnostic exit0/cleaned13/leftovers0.
Đây là scoped diagnostic, không fresh default full A/B hoặc current19-target audit.
Exit0 không là report sạch; unused count khác phản ánh workload/fresh stats,
không phải đã thêm/xóa index. R4/T08 vẫn mở.

### Supplemental disposition trong T08 — không đổi17-target lịch sử

19 bảng hiện hành gồm17 legacy +hai receipts mới. Audit17 cũ vẫn đúng identity/
source/môi trường lịch sử; phải refresh current effective grants, exposure và
transitive paths trên545 migrations hiện hành, không tự thừa kế allSafe.

| Target bổ sung | Thiết kế đã thấy trong source | Việc cần chứng minh trước disposition |
|---|---|---|
| private.employee_profile_edit_receipts | Receipt cho atomic employee edit; đã có scoped local workflow proof ở report employee | Current table/column/inherited grants và schema exposure; mọi RPC/view/definer/trigger/FK entry; live actor/session/tenant scope, negative/no-effects và recovery |
| private.password_change_receipts | RLS enabled, REVOKE PUBLIC/anon/authenticated/service_role/supabase_auth_admin; helper narrow grants theo source | Actual effective privileges/reachability trên current schema; exact-session readback, revoked/wrong actor/operation denied và transaction rollback; source REVOKE không thay runtime audit |

Trạng thái cả hai: **unresolved for full current indirect disposition**.
Không thêm permissive policy để xóa INFO hoặc mặc định server-only là an toàn.
Giữ trongT08/R4 hiện có, không thêm task/case thứ71 và không nâng gate.

Danh sách19 theo snapshot (16 private +3 public):

- private.employee_profile_edit_receipts, private.password_change_receipts,
  private.hotel_room_setup, private.roomqc_cluster_config;
- private.subscription_checkout_drafts, private.subscription_lifecycle_batch_receipts,
  private.subscription_lifecycle_commands, private.subscription_lifecycle_notification_outbox,
  private.subscription_lifecycle_progress, private.subscription_quotes;
- private.subscription_reconciliation_case_events, private.subscription_reconciliation_case_receipts,
  private.subscription_reconciliation_cases, private.subscription_status_job_recoveries,
  private.subscription_status_job_runs, private.workspace_provisioning;
- public.email_admin_actions, public.email_deliveries, public.email_provider_events.

Tiếp: disposition từng entry/role/allowed effect và recovery; review135 WARN
theo semantics,8 FK bằng workload/EXPLAIN/lock/write cost; fresh full frozen-source
A/B/advisors sau thay đổi. Không xóa494 indexes theo nhãn unused trong sandbox.

**Snapshot lịch sử — lifecycle A/B / 21-10:** [report/artifact](roomqc-m06-lifecycle-local-2026-10-21.md),
A 41f2b3011bc6 / B 9b6a13ced16e, 647 files/531 migrations, native CLI 2.121.0.
Cả hai **634=17 no-policy INFO +8 FK INFO +474 unused-index INFO +135 permissive WARN**.
474 thay 480 do workload, không index fix; allSafe/transitiveReachabilityProven
vẫn false. Lifecycle/service/recovery có proof local, còn provider/17-target/
policy/FK rồi issuer/trust/atomic health/pipeline; chưa đóng R4/T08.

**Snapshot trước lifecycle, 531 migrations / 21-10:**
[email-admin local report/artifact](roomqc-m06-email-admin-local-2026-10-21.md):
A dbbf929824ec / B 36a0835d1dc3, native CLI 2.121.0, cả hai
**640=17 no-policy INFO +8 FK INFO +480 unused-index INFO +135 permissive WARN**.
Catalog 476 functions/11 views/358 policies/13 FK, graph 1011 nodes/899 edges/
149 triggers/25 candidate paths; allSafe/transitiveReachabilityProven vẫn false.
Email-admin có proof phạm vi; service/provider/17-target disposition, policy/FK
vẫn mở. Counts không đổi không chứng minh mọi finding đã được xử lý.

**Snapshot lịch sử 530 migrations / 20-10:**
[Mutation local report/artifact](roomqc-m06-mutation-local-2026-10-20.md)
ghi A 6eade27a974f / B f2025aa52f13, native CLI 2.121.0:
**640=17 no-policy INFO +8 FK INFO +480 unused-index INFO +135 permissive WARN**.
480 thay 485 do workload, không index fix. Catalog 474 functions/358 policies,
graph 1009 nodes/894 edges/149 triggers/25 candidate paths; allSafe và
transitiveReachability vẫn false. Chín root có proof, caller/service/provider/
17-target disposition và R4-b/c vẫn mở.

**Snapshot lịch sử 529 migrations / 20-10:**
[email-ready/profile RLS report/artifact](roomqc-m06-email-ready-local-2026-10-20.md)
ghi native CLI 2.121.0 ở cả A 95d9560fba65 và B 91373e6a5871:
**645 = 17 no-policy INFO + 8 FK INFO + 485 unused-index INFO + 135 permissive WARN**.
485 thay 486 do workload/statistics, không index fix. Catalog 473 functions,
149 triggers/25 candidate entry paths; allSafe/transitiveReachability vẫn false.
Hai fix local đã có proof; R4-a caller còn lại/R4-b semantics/R4-c workload vẫn mở.

**Snapshot lịch sử 527 migrations / 20-10:** [Auth-soft-delete report/artifact](roomqc-m06-auth-soft-delete-local-2026-10-20.md)
ghi native CLI 2.121.0 read-only trên initialized B 850b5d52cc1d: **646 findings =
17 no-policy INFO + 8 FK INFO + 486 unused-index INFO + 135 permissive WARN**.
A 0d7e8d8f07ca không chạy advisors. 486 thay 489 theo statistics/workload, không
là index fix; migration chỉ sửa năm guard Auth deleted_at. High đã local_verified;
R4/T08 vẫn mở caller/trigger/checkout/admin, policy semantics và FK workload.
Catalog 472 functions/149 triggers/25 candidate paths vẫn allSafe=false.
Các snapshot 526/649 và 525/650 phía dưới là lịch sử.

**Snapshot lịch sử 526 migrations / 20-10:** [registration report/artifact](roomqc-m06-registration-local-2026-10-20.md)
ghi 649 findings ở cả A 4317f0ce9c62 và B 0fe112b0e675: 17 no-policy INFO,
8 FK INFO, 489 unused-index INFO, 135 permissive WARN. 489 giảm từ 490 do workload,
không có index fix; 472 functions/149 triggers/25 candidate paths vẫn không chứng
minh allSafe. R4 còn mở; ưu tiên High Auth-soft-delete đã tái hiện ở room setup/
quote, rồi caller/trigger/checkout/admin, policy semantics và FK workload.
Những counts 650/679 phía dưới là lịch sử có phạm vi.

Ngày 19/10/2026. Phạm vi: full upstream sandbox, không DB khách sạn đang phục vụ.
R4 **chưa đóng**. Báo cáo này không xác nhận toàn schema an toàn/đủ hiệu năng.

## Caller audit mới ngày 20/10 — chưa đóng R4

[Report/ledger/artifact](roomqc-m06-callers-local-2026-10-20.md) bổ sung candidate
graph contract v2, metadata cho 17/17 target và 149 triggers. A 55a4b60c80b1 /
B 0dbf25756725 đều exit 0/cleaned, 525 migrations, canonical hashes khớp;
full control 139/139 (14 focused audit+graph là subset). Advisors vẫn 650,
browser direct grant violations=0; allSafe/transitiveReachability vẫn false.

25 candidate entry paths không là 25 lỗ hổng: source-name matching có comment/
overload và thiếu semantic/runtime proof. Dismissal comment ở privilege trigger
đã ghi nguồn; trigger public.users→workspace-ready email là đường có lời gọi
thật cần kiểm row policy/side effect/dedupe. 25 dependencies ngoài target graph
không có nghĩa database thiếu bảng. Dynamic generate_unique_code là INVOKER;
monthly_expenses là materialized view, không áp sửa view/definer hàng loạt.

Ưu tiên tiếp: đồng nhất live guard đăng ký legacy/service/gateway (source gap,
chưa tái hiện khai thác), rồi trigger email/checkout/admin/session; R4-b semantics
135 WARN và R4-c tám FK/workload. Không xóa 490 unused-index vì fresh stats.
[Phiếu nhận việc](roomqc-vps-signup-execution-plan-2026-10-19.md#phiếu-r4-a--quyền-gián-tiếp-và-các-lệnh-nghiệp-vụ-chưa-được-phủ)
ghi actor contract, ma trận test/no-side-effect và gate.

## Cập nhật direct-write trước caller audit ngày 20/10/2026 — lịch sử có phạm vi

Đã bổ sung forward migration 20261020031717_distribution_direct_write_boundaries.sql
sau migration actor/session 20261019161809. Source hiện có 525 migrations; không
sửa checksum lịch sử hoặc áp lên backend nghiệp vụ.

- Browser không còn INSERT/DELETE/table UPDATE ở bốn bảng distribution; đã revoke
  cả column grants cũ. Authenticated chỉ được UPDATE(notes) của order, với guard
  live actor/session và membership hotel. RPC quản lý nghiệp vụ vẫn là đường ghi.
- Đã bỏ bước PATCH link sau create ở hook bổ sung và seed demo; reverse link của
  một yêu cầu bổ sung được commit trong chính create RPC.
- Hai fresh backend A dd45e76bae82 / B 0e3ec605323b đạt, mỗi lượt 176 application
  checks (8 actor, 4 order), 20 SQL session denials, Edge thật/provider disabled,
  năm service/fault/recovery/permissions và Janitor controlled drill; cleanup 14
  owned objects/lượt. Canonical schema/migration/images/init-spec khớp.
- Catalog A: 17 no-policy tables, 469 functions, 11 views, 358 policies, 13 FK;
  browserDirectGrantViolations=0, allSafe=false, transitiveReachabilityProven=false.
  Advisors: 650 findings (17 no-policy, 8 FK, 490 unused-index, 135 permissive WARN).
  Đây là số quan sát của fresh fixture, không phải số lỗi đã được giải quyết.
- R4 vẫn mở: server callers/transitive views/definers của 17 bảng, policy semantics/
  query plans ngoài direct-write scope, FK workload và những RPC workflow chưa có
  negative/session coverage đầy đủ. Không coi REVOKE table thay guard mọi definer.
- Report đã đối chiếu full A/B/source/log proof tại
  [báo cáo access local](roomqc-m06-access-local-2026-10-20.md).
  Các sections ngày 19/10 bên dưới là baseline lịch sử, không dùng số 679/523 làm
  current-schema evidence. Không xóa findings hoặc index chỉ để giảm tổng.

## Nguồn và cách hiểu

CLI 2.121.0, `db advisors --type all --level info --fail-on none --output-format json`
trên hai owned runs `1d2e7d793b84`/`7bbeec983dbf` cùng 523 migration đã tái hiện
679 findings: 17 SECURITY INFO no-policy, 8 PERFORMANCE INFO FK, 501 PERFORMANCE
INFO unused-index, 153 PERFORMANCE WARN permissive policies. Exit 0 chỉ nghĩa
report chạy thành công, không nghĩa không có finding. Artifact/test/source:
[manifest local](../../../artifacts/roomqc-m06-partition-local-2026-10-19.json).

## 17 RLS-no-policy — đã kiểm tra quyền trực tiếp, chưa đóng reachability toàn bộ

Read-only catalog audit ở run `7bbeec983dbf`, lúc
`2026-10-19T15:07:12.917Z`: 14 bảng private và ba public, RLS bật; cả anon và
authenticated đều **không có bất kỳ table/column privilege**. Schema usage được
ghi riêng, không dùng schema usage=false để che table grant. Dữ liệu/table owner
và từng role giữ trong [audit 17 bảng](../../../artifacts/roomqc-m06-rls-nopolicy-audit-2026-10-19.json).

Kết luận có giới hạn: không cần thêm policy cho browser chỉ để xóa INFO; direct
grant boundary phù hợp server-only. Vẫn phải review các server function/view
reachable, effective execution grants và metadata từng bảng trước chấp nhận R4
toàn bộ. Các bảng public email không được mặc định an toàn chỉ vì RLS bật.

Owner: reviewer DB/quyền. Next: map caller server, SECURITY DEFINER/search_path/
EXECUTE grants, views và test deny người dùng thật; mọi sửa có migration/test.
Không cấp policy `USING(true)` để biến deny-all thành browser access.

## 8 foreign keys — cần đánh giá theo workload

| Bảng | Constraint chưa có supporting index theo advisor | Hành động |
|---|---|---|
| `private.hotel_room_setup` | `hotel_room_setup_confirmed_by_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `private.subscription_status_job_runs` | `subscription_status_job_runs_blocked_by_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `private.workspace_provisioning` | `workspace_provisioning_hotel_id_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `public.staff_invitations` | `staff_invitations_hotel_id_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `public.staff_invitations` | `staff_invitations_invited_by_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `public.staff_invitations` | `staff_invitations_position_id_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `public.staff_invitations` | `staff_invitations_reports_to_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |
| `public.staff_invitations` | `staff_invitations_tenant_id_fkey` | Review existing composite indexes/query/deletes; chưa thêm index |

Owner: reviewer DB/hiệu năng, T10/T23. Các attnum từ advisor chưa được dùng làm
column identity trong artifact nghiệp vụ. Đối chiếu catalog cột và query thật;
chọn index còn thiếu theo leading-column coverage/chi phí ghi, kiểm EXPLAIN trên
dataset mẫu. Migration mới đổi migration-set/hash nên phải tái lập artifact và
backend proof phù hợp. Không dùng fixture rỗng làm cơ sở capacity.

## Baseline lịch sử schema 523: 153 permissive-policy WARN — 51 bảng

Tất cả thuộc PERFORMANCE, không phải 153 bằng chứng rò dữ liệu. Cũng không có
cơ sở kết luận vô hại: policy chồng có thể tăng query cost và thay đổi semantics
khi gộp. Một bảng có nhiều finding theo role/operation; count không bằng số policy.

| Bảng | Số finding | Trạng thái / bước bắt buộc |
|---|---|---|
| `public.announcements` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.batch_inventory` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.custom_fields` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.distribution_orders` | 18 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.email_templates` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.financial_targets` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.hotel_settings` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.hotels` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.in_app_notifications` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.inventory_transactions` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.invoice_vat_claims` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.invoices` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.item_categories` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.item_units` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.items` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.laundry_batches` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.laundry_categories` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.laundry_vendors` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.maintenance_categories` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.maintenance_requests` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.payment_methods` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.platform_settings` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.positions` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.purchase_order_items` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.purchase_orders` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.qc_sla_settings` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.rate_plan_daily_prices` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.rate_plans` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.role_permissions` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.roles` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.room_pricing_rules` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.room_type_rates` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.room_type_standards` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.room_types` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.rooms` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.seasonal_rate_overrides` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.shift_history` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.shift_reminders` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.staff_status` | 2 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.stock_adjustment_items` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.stock_adjustments` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.subscription_plans` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.telegram_connections` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.telegram_groups` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.tenants` | 2 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.user_hotels` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.user_permissions` | 6 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.user_roles` | 9 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.vendors` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.workflow_actions` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |
| `public.workflows` | 1 | Open: review role × operation, USING/WITH CHECK và query plan |

Owner: reviewer quyền + DB, deadline trước nghiệm thu R4/release schema. So policy
cùng role/operation, grant/membership và tenant predicate; tạo truth table cho
owner/staff/anon/khác tenant trước gộp. SELECT/UPDATE cần kiểm cùng dữ liệu;
WITH CHECK không bỏ để tối ưu. Query plan/dataset chứng minh lợi ích trước đổi.
Người thực hiện ghi action/accepted reason/test và người review từng object;
bảng trên chỉ là backlog có định danh, chưa là acceptance.

## 501 unused-index INFO — không xóa từ fresh fixture

Thống kê của database mới chưa có workload sử dụng không chứng minh index thừa.
Giữ toàn bộ, theo dõi usage/size/write cost/query plan trên dataset/tải đại diện.
Không bỏ PK/unique/supporting FK index hoặc giảm số finding bằng xóa hàng loạt.

Owner: reviewer hiệu năng/T23. Quyết định drop cần observation window/dataset và
query dependency rõ; migration/rollback/rebuild cost phải được review riêng.

## Điều kiện đóng R4

- Mỗi group/object có kết luận, impact, owner/action hoặc accepted reason cùng
  thời điểm rà lại; không coi bảng Open là đã duyệt.
- Kiểm reachability/no-policy qua API thật và server callers, xử lý finding mới
  do M06 trước release; performance decisions có dataset/EXPLAIN khi cần.
- Rerun native advisors sau thay đổi; giữ baseline/report raw riêng, artifact công
  khai lọc credential/PII. Không sửa raw report hoặc ép tổng về 0.
- Source/migration-set/artifact hiện hành đồng bộ; current suite và backend
  proofs phải còn giá trị sau mọi sửa. M06/T08 và các gate external vẫn độc lập.
