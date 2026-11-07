# RoomQC M06/R4-a — audit caller và chuẩn bị phần còn lại

**Cập nhật lifecycle/recovery, 531 migrations / 21-10:** [local proof](roomqc-m06-lifecycle-local-2026-10-21.md)
trên 647 files, control 154/154, unit riêng 27/27; A/B exit 0/cleaned 16/run.
Begin/batch/finish/outbox/service authority và recovery sản phẩm đã có proof;
provider/webhook và 17-target final disposition vẫn mở. Ledger dưới giữ snapshot
lịch sử; không tự đổi allSafe=true. [Nhận tiếp](roomqc-vps-signup-execution-plan-2026-10-19.md#lifecycle-handoff).

**Cập nhật email-admin, 531 migrations / 21-10:** [local proof](roomqc-m06-email-admin-local-2026-10-21.md)
trên 643 backend files; control 152/152, Vitest riêng 7/7, fresh A/B exit 0/cleaned.
Status/retry/test đã có proof live context tại transaction và race; không còn
là lát chưa thực hiện. Provider/service paths và 17-target final disposition
vẫn mở; ledger bên dưới giữ nguyên snapshot lịch sử, không gắn allSafe=true.
[Nhận tiếp](roomqc-vps-signup-execution-plan-2026-10-19.md#email-admin-handoff).

**Snapshot mutation trước email-admin, 530 migrations:** [chín root ghi đã local_verified](roomqc-m06-mutation-local-2026-10-20.md),
source 640 files, control 148/148, fresh A/B hoàn tất/cleanup/canonical khớp.
162 denials/29 bảng/15 race mỗi run và actual recovery/replay bổ sung proof cho
room setup/quote/checkout/admin/case/job-recovery. Đây không đóng mọi service
path ở các bảng lifecycle/outbox hoặc email-admin/provider. Ledger dưới vẫn là
snapshot lịch sử 628/525; 17-target final disposition/allSafe chưa khép.
[Nhận tiếp](roomqc-vps-signup-execution-plan-2026-10-19.md#mutation-handoff).

**Cập nhật sau audit:** [email-ready/profile RLS local proof](roomqc-m06-email-ready-local-2026-10-20.md)
trên 637 files/529 migrations có hai fix phạm vi đường public.users → workspace-ready
email (ledger dòng 16); fresh event và HTTP profile regression đạt. Chưa là
disposition tất cả caller/service/provider vào email_deliveries hoặc trigger races.
Ledger/source/counts bên dưới giữ snapshot 628/525; **không chuyển 17/17 thành safe**,
allSafe/transitiveReachability vẫn false.
[Caller/policy/FK tiếp theo](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-current).

Ngày 20/10/2026, Asia/Bangkok. **R4/T08 chưa đóng; chưa staging/pilot**.
Bản này bổ sung audit caller/trigger cho [proof direct-write trước đó](roomqc-m06-access-local-2026-10-20.md);
không thay proof frontend đã có hoặc tạo roadmap mới. [Artifact đã lọc](../../../artifacts/roomqc-m06-callers-local-2026-10-20.json).

## Kết quả đã kiểm chứng

- Source ở integration, HEAD 5cb5837 + working tree chưa commit; không sync implementation/deploy.
- Audit contract v2 bổ sung return type, pg_depend function/relation, view→function
  và trigger modes/events/grants. Candidate graph mới có bounded traversal/cycle
  handling, phân biệt schema/overload; không coi trigger return type là RPC browser.
- Full control 139/139, 0 fail/skip/cancel, exit 0; 143600.8268 ms.
  Focused audit+graph 14/14 là subset, không cộng vào 139; kết quả terminal,
  không lưu log riêng. Node syntax check graph/audit đạt trong lượt implementation.
- A 55a4b60c80b1 và B 0dbf25756725 đều exit 0, phase
  permission_controls_verified, cleaned=true; replay 525 migrations/lượt.
  B.buildRepeatability.matched=true. Canonical schema/init-spec/migrations/images
  khớp; compose digest riêng từng run không phải production release digest.
- Mỗi lượt 176 API checks, tám Auth actor thật, bốn distribution orders;
  20 SQL session denials với positive trước/sau; real Edge provider-disabled;
  năm service/fault/recovery, Janitor controlled drill, 13 permission controls.
- Mỗi lượt cleanup 14 owned objects. Read-only kiểm Docker theo chính label run:
  không còn container/volume/network của cả A/B. Giữ raw logs/state private ở .local.
- Runtime read-only 11:03 +07: direct 8091 và proxy 8082 /api/control/readyz
  đều 200/schema 0005. Không suy source 0007 thành runtime đã nâng cấp.
  Signup=false là quan sát trước đó; readyz này không trả flag, không tự chứng
  minh lại flag. Không mở đăng ký, gửi mail thật hay đổi DNS.

## Những con số này không chứng minh điều gì

Catalog mỗi lượt: 17 no-policy tables, 469 functions, 11 views, 358 policies,
13 FK; 0 browser direct table/column grant violations. Advisors vẫn 650:
17 no-policy INFO, 8 FK INFO, 490 unused-index INFO, 135 permissive-policy WARN.

Candidate graph: **1004 nodes / 880 edges / 149 triggers / 25 candidate entry
paths / một dynamic SQL candidate / 25 outside-scope relation dependencies**.

Đây là công cụ tìm đường cần review, không phải bộ phân tích SQL hoàn chỉnh.
Role/grant của trigger chỉ cho biết khả năng thao tác bảng ban đầu, chưa chứng
minh row policy cho phép hoặc side effect xảy ra. Catalog dependencies được
kết hợp với source-name matching; comment/literal/overload có thể trùng tên.
Không có cạnh không có nghĩa an toàn. **allSafe=false và
transitiveReachabilityProven=false**, không nâng acceptance/gate nào.

## Ledger 17 bảng — đầu vào cho ticket, không phải bảng pass

Cột số là direct-function candidates / candidate entry paths tới từng bảng;
không là số đường khai thác. Tên signature, EXECUTE role, INVOKER/DEFINER,
search_path và candidate paths đã lọc nằm trong artifact. “Guard” là điều đã
quan sát trong source, chưa thay runtime proof đủ mọi nhánh.

| # | Bảng | Direct / entry | Guard/source đã thấy | Bằng chứng còn phải làm |
|---|---|---|---|---|
| 1 | `private.hotel_room_setup` | 3 / 3 | room_setup_owner; owner/session/membership | Get/save/complete đủ actor và room limits |
| 2 | `private.roomqc_cluster_config` | 1 / 2 | Legacy complete_registration; còn thiếu live guard đồng nhất | R4-a phần đăng ký browser/service/gateway |
| 3 | `private.subscription_checkout_drafts` | 3 / 2 | subscription_quote_actor trong source | Create/get draft và quote khác owner/tenant/session |
| 4 | `private.subscription_lifecycle_batch_receipts` | 1 / 0 | Batch service-only; cần rà toàn chain | Service allow; browser deny; replay không lặp receipt |
| 5 | `private.subscription_lifecycle_commands` | 5 / 1 | Service transition; admin recovery có actor guard | Recovery/replay/revoke; command+receipt+audit |
| 6 | `private.subscription_lifecycle_notification_outbox` | 6 / 2 | Service/outbox; admin recovery/monitor | Monitor/recover đúng quyền; không nhân bản notification |
| 7 | `private.subscription_lifecycle_progress` | 4 / 1 | Service begin/finish/batch; admin recovery | Lease/version/restart; không lùi tiến trình |
| 8 | `private.subscription_quotes` | 4 / 4 | subscription_quote_actor trong source | Create/get/checkout đầy đủ live actor + idempotency |
| 9 | `private.subscription_reconciliation_case_events` | 2 / 2 | require_reconciliation_case_actor → platform_support_actor | Read/mutate case; timeline/revoke và no side effect |
| 10 | `private.subscription_reconciliation_case_receipts` | 1 / 1 | require_reconciliation_case_actor → platform_support_actor | Replay key/payload/version; denied không ghi receipt |
| 11 | `private.subscription_reconciliation_cases` | 2 / 2 | require_reconciliation_case_actor → platform_support_actor | Role-only/profile-only; cross-tenant; live admin |
| 12 | `private.subscription_status_job_recoveries` | 2 / 2 | Admin monitor/recovery qua actor guard | Recovery race/revoke; một kết quả |
| 13 | `private.subscription_status_job_runs` | 8 / 2 | Service begin/finish và admin recovery/monitor | Crash/lease/fencing và authority thật |
| 14 | `private.workspace_provisioning` | 2 / 0 | Service provision/read receipt; guard owner cần bổ sung | Owner eligibility + workspace binding/replay/conflict |
| 15 | `public.email_admin_actions` | 1 / 0 | Service retry, Edge guard đã có proof có phạm vi | Retry admin/revoke/idempotency; không tự gửi thật |
| 16 | `public.email_deliveries` | 5 / 1 | Service RPC + đường trigger public.users thực sự cần rà | Trigger live owner/scope/destination/dedupe; provider tắt |
| 17 | `public.email_provider_events` | 2 / 0 | Service finish/provider events | Webhook trust/event dedupe; reject không sửa delivery |

Nguồn guard quan trọng: migration 20261019161809_access_actor_and_distribution_guards.sql
(room/quote/live actor); reconciliation/job/lifecycle migrations ngày 17–18/10;
email/registration migration 20261016072409_email_delivery_and_staff_invitations.sql.
Các private helper không có browser EXECUTE không tự chứng minh caller-chain an toàn.

## Kết luận review thủ công và giới hạn

1. Đường trigger public.users → queue_owner_workspace_ready → enqueue_roomqc_email
   → email_deliveries có lời gọi thật trong source (migration email:274).
   Phải test row policy/owner live/đúng tenant-hotel/email đã xác minh/dedupe;
   provider giữ tắt. Service-only RPC không loại trừ side effect qua trigger.
2. Cạnh prevent_user_privilege_escalation → complete_registration đến từ comment
   (migration 20260919181626:81), không phải lời gọi. Giữ raw graph 25, ghi dismissal
   có source; không sửa count để biến toàn graph thành proof.
3. generate_unique_code là SECURITY INVOKER, dynamic SQL candidate chưa là lỗ hổng
   definer được xác nhận. Review caller/grants/input có phạm vi, không revoke mù.
4. monthly_expenses là materialized view; không áp ALTER VIEW security_invoker
   như view thường. View grant/policy/dependency cần review riêng.
5. 25 unresolved dependencies là view references đến bảng nghiệp vụ nằm ngoài
   tập 17 target, không phải bằng chứng database thiếu/hỏng 25 object.

## Khoảng trống cần ưu tiên ở luồng đăng ký

Source legacy complete_registration (email migration:368) kiểm auth.uid/service,
directory_required, khóa auth.users và invitation, nhưng chưa có guard live
session/ban/confirmation/profile eligibility đồng nhất trước provision/replay.
provision_workspace_registration (:309) kiểm confirmed owner/receipt/exclusivity
nhưng cần bổ sung điều kiện owner bị ban/khóa/xóa/inactive. ClusterGateway.user
(server/control/cluster.mjs:24) gọi GoTrue /user và kiểm email-confirmed, chưa có
strict session RPC/profile guard tương đương.

Đây là **gap được thấy trong source, chưa tái hiện khai thác** và không khẳng định
production đã gặp sự cố. Next action nằm ở
[phiếu R4-a](roomqc-vps-signup-execution-plan-2026-10-19.md#phiếu-r4-a--quyền-gián-tiếp-và-các-lệnh-nghiệp-vụ-chưa-được-phủ):
tách interactive-session validation khỏi service job, giữ pending_setup hợp lệ,
invitation/directory gate, idempotent receipt, không yêu cầu worker có session
người dùng và không dùng service_role fallback để sửa login.

## Source và hashes để kiểm tra lại

Scoped backend manifest: 628 files / 525 migrations.
Algorithm: ordinal POSIX path sort, entries {path,sha256(file bytes)};
SHA256(JSON.stringify(entries)) =
dd3534ee685f888d0f2450d95dc950151f634394b61b2cba899b86a25af478f8.
Không dùng manifest 626-file của báo cáo trước để chứng minh audit graph mới.

| Chứng cứ private | SHA256 |
|---|---|
| A log .local/roomqc-r4-caller-graph-a-2026-10-20.log | d762a97620fd6687652a7f7fe2dcc40ddd450867dc27804808b11b352e9734cd |
| B log .local/roomqc-r4-caller-graph-b-2026-10-20.log | 3f50941fee1ff270b10f3ff1d9b5fbc60280d5db517f921eaf6323d712a375c8 |
| Control log .local/roomqc-r4-caller-graph-control-2026-10-20.log | ed80a43b834551744ba93c212e7df4d55c87e31f2d896896492b57db5a50a862 |
| A ownership.json | b558c354ac7fd6c6d28ea46939cca81eef0c665b76695642149563e3386c4f90 |
| B ownership.json | 100127f7eacc781a97110f15a4a1977b7410d5ca527ba8c86048780fb42742f4 |
| A private catalog | 39f924b6bd39f574bc799f65afd6015b2b353f919757b0b20cce10507ef4573b |
| B private catalog | 7f5a8d1f965df9d8f3ef72783b1d666e2c530d5d70be576f38e99384bb9c17c1 |

Không publish raw function bodies/Auth token/DSN/env. Catalog raw hash giữa A/B
có thể khác do timestamps và dữ liệu mỗi run; bằng chứng repeatability dựa vào
canonical schema/init-spec/migration/image, không yêu cầu raw catalog byte-identical.

## Việc kế tiếp và cổng còn mở

1. R4-a: harmonize registration guard, mở rộng trigger/checkout/admin actor proof;
   ledger 17/17 có disposition+source+test, không gắn safe từ graph.
2. R4-b: 135 WARN theo semantics/operation; R4-c: tám FK bằng workload/EXPLAIN,
   không xóa 490 index chỉ vì fresh stats.
3. R3 issuer/R5 trusted artifact → R6 atomic credential revision check trong
   HealthStore.record + gateway/runtime → R7 regression/pipeline timed drill.
4. Alert → Auth/admission/budget → signup/reconcile → hai màn admin → Linux/
   offsite/restore → A/B browser E2E/load → RC/pilot; đủ 27 gói/25 bước/70 case.

Lượt chuẩn bị plan chỉ tiếp nhận kết quả process đang chạy, đọc source/runtime
và cập nhật hồ sơ; không sửa tiếp implementation hoặc triển khai thường trực.
Toàn hệ thống chưa được nghiệm thu. Bản kế hoạch không cho phép thay đổi DB
nghiệp vụ/CRM, mở public signup hoặc bỏ qua các gate external.
