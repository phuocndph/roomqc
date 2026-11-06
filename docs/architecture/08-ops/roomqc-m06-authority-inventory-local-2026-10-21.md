# RoomQC — authority inventory v3 và kiểm tra trực tiếp 17 bảng

Ngày 21/10/2026, Asia/Bangkok. **local_verified_scoped**, không đóng R4-a/R4/T08
hoặc gate L/S/P/U/B. Giữ nguyên 27 gói / 25 bước / 70 case.
[Artifact có phạm vi](../../../artifacts/roomqc-m06-authority-inventory-local-2026-10-21.json).

## 1. Kết quả đã kiểm chứng

- A `9b888d4f2817`, B `ac789c7b53f4`: exit 0, phase
  `permission_controls_verified`, cleaned=true, 18 owned objects/lượt.
- Mỗi lượt dựng full-vendor riêng, áp 532 migration; migration, schema, init-spec,
  image và Edge bundles khớp. B dùng A đã thành công/cleanup làm reference.
- Control **162/162**, 0 fail/skip/cancel, exit 0. Focused **19/19** là subset.
  Vitest email/admin/lifecycle **34/34**, ba file, không cộng vào control.
- Chỉ đổi catalog/harness/tests; **không đổi product/migration**, không deploy.
- Internal Docker network, không public port/provider/scheduler. Hai rebuild
  tuần tự không thay proof hai cluster chạy đồng thời.

## 2. Khoảng trống audit được bổ sung

Catalog cũ chỉ thu FK phục vụ workload trên bốn bảng, tổng 13 constraint; nó
không phải inventory đầy đủ mọi FK chạm tập 17 bảng. Trigger cũ chỉ thu relation
trong public/private, bỏ hai trigger Auth gọi function public/private.

Catalog v3 hiện thu:

| Phần | Số lượng / ý nghĩa |
|---|---|
| No-policy target | 17 |
| FK chạm target ở ít nhất một đầu | 22 distinct: 21 outbound, 9 inbound, overlap 8 |
| Delete action của 22 FK | 10 CASCADE, 4 SET NULL, 8 NO ACTION |
| Trigger | 151; có thêm 2 trên auth.users |
| Function / view / policy | 476 / 11 / 358 |
| Authority roles | postgres, anon, authenticated, service_role, roomqc_control_probe |
| Candidate graph | 1.013 nodes / 901 edges / 25 candidate entry paths / 25 outside-scope dependencies |

Hai tập 13 và 22 có scope khác nhau, **không cộng hoặc so như số finding tăng/giảm**.
Query thu cả FK referencing và referenced target; thu trigger trên public/private
hoặc gọi function public/private ở schema khác. Table privilege inventory bao gồm
MAINTAIN của Postgres 17 bên cạnh DML/TRUNCATE/REFERENCES/TRIGGER.

Legacy capture thiếu trường FK/role mới hiển thị missing/null, không giả thành
zero findings. Validator từ chối FK action sai, constraint trùng và role metadata
sai. Inventory không chứng minh row policy hoặc implicit side effect là an toàn.

## 3. Kiểm tra SQL thực trên đủ 17 bảng có dữ liệu

| Kiểm tra mỗi lượt | Kết quả |
|---|---|
| 17 bảng × SELECT/INSERT/UPDATE/DELETE × anon/authenticated/probe | 204 lần SQLSTATE 42501 |
| 14 bảng private × bốn DML × service_role | 56 lần 42501; service dùng RPC, không direct table |
| Installer đọc trước/sau + service đọc ba bảng email public | 37 positive controls |
| generate_unique_code invoker truy vấn email_deliveries | Ba role bị 42501; installer positive trước/sau |
| Snapshot | 17/17 bảng không đổi, tất cả có hàng thật |
| Transaction | ROLLBACK thành công; không tạo policy/grant hay fixture schema bền vững |

Tổng 263 denials là các assertion trong harness, không phải 263 release case.
Authenticated actor dùng subject/session của owner do GoTrue fixture đã tạo;
SET ROLE nằm ngoài exception block và kiểm current_user, không tính lỗi assume
role là lỗi của thao tác. Chỉ 42501 được tính; timeout, FK/check violation hoặc
undefined table không được coi là chặn quyền thành công.

Đây là SQL actor assumption, **không là HTTP/browser E2E mới**. Snapshot chỉ có
17 target; các hồi quy mutation/lifecycle/provider tiếp tục có phạm vi riêng.

Run thử `c5ab2f21f955` thất bại 42P01 do bài test truyền sai thứ tự tham số
`generate_unique_code(prefix, table_name, column_name)`. Positive control bắt lỗi,
sandbox đã cleanup; sửa call order và thêm regression. Đây là lỗi harness, không
là lỗi product và không được dùng làm reference cho A/B.

## 4. Sổ 17 target: direct đã có proof, indirect chưa được duyệt

Mỗi target trong artifact có entry function/browser candidate, nhóm runtime proof,
FK liên quan và reviewer còn trống. Tất cả `finalIndirectDisposition=open`.

| Target (private nếu không ghi public) | Nhánh đã có hồi quy trong A/B | Việc còn phải kết luận |
|---|---|---|
| hotel_room_setup | owner get/save/complete; live actor và mutation races | hotel/tenant cascade, Auth SET NULL, parent-delete authority |
| roomqc_cluster_config | legacy directory gate, registration live/session | chốt toàn caller/service chain; bỏ false edge từ comment có giải thích |
| subscription_checkout_drafts | quote actor, checkout replay/revoke | invoice/payment/quote/tenant CASCADE, created_by SET NULL |
| subscription_lifecycle_batch_receipts | service batch/replay, browser/private-table deny | run FK NO ACTION; duyệt service callers |
| subscription_lifecycle_commands | atomic worker và admin recovery | run FK NO ACTION; receipt/audit chain |
| subscription_lifecycle_notification_outbox | worker/outbox, admin monitor/recover | command FK NO ACTION; notification side effects |
| subscription_lifecycle_progress | begin/batch/finish và admin recovery | run FK NO ACTION; cursor/lease semantic review |
| subscription_quotes | owner quote/get/checkout; cross-tenant/live guard | tenant cascade, created_by SET NULL, child draft/invoice effects |
| subscription_reconciliation_case_events | admin case read/mutate/revoke | case FK NO ACTION; timeline side effects |
| subscription_reconciliation_case_receipts | admin idempotency/version/race | caller/receipt semantics; absence of FK không là proof |
| subscription_reconciliation_cases | platform support guard và case mutations | incoming events FK và toàn chain authority |
| subscription_status_job_recoveries | admin recovery/monitor; old worker fencing | run FK NO ACTION; recovery ordering |
| subscription_status_job_runs | atomic service, legacy denial, recovery | self blocked_by + incoming FKs, service/admin boundary |
| workspace_provisioning | guarded service provision/get receipt, owner conflict | **hotel/tenant CASCADE có thể làm mất receipt: ưu tiên tái hiện** |
| public.email_admin_actions | actual Edge + atomic service action context | service/direct caller trust, idempotent action chain |
| public.email_deliveries | profile trigger, queue/admin/provider | tenant CASCADE; implicit Auth/profile paths và service trust |
| public.email_provider_events | signed webhook, tuple conflict/replay/bind races | enclosing provider/service paths và final independent review |

14 function source/guard đã đọc có hash riêng trong artifact; không tuyên bố đã
review mọi nhánh của cả 476 function. Hai trigger Auth mới:
`on_auth_user_created → handle_new_user` hiện chỉ RETURN NEW; trigger password
update ghi timestamp cho invitation matching/pending/chưa hết hạn. Source review
này không thay proof GoTrue signup/password reset/invite qua HTTP.

Cạnh `prevent_user_privilege_escalation → complete_registration` đến từ comment,
không phải lời gọi; giữ raw count 25 và ghi dismissal, không sửa graph thành allSafe.
Dynamic helper generate_unique_code là invoker, dùng quoted identifiers; ba denial
mới không tự chứng minh quyền của mọi caller definer bao ngoài.

## 5. Điểm nhận việc tiếp theo

<a id="authority-handoff"></a>

1. **Tái hiện hotel-delete → receipt** trên backend exact-owned. FK
   workspace_provisioning.hotel_id và hotel_room_setup.hotel_id đều ON DELETE
   CASCADE. hotels có owner ALL policy và DELETE grants; useDeleteHotel chỉ kiểm
   assigned users ở client. Đây là **source/catalog risk, chưa xác nhận product
   defect**. Thử owner/staff/khác tenant/revoked, receipt trước/sau, retry/reconcile,
   có allowed control và rollback. Không sửa hàng loạt FK chỉ từ catalog.
2. Kết luận từng đường FK/trigger/service và reviewer của đủ 17 target; kiểm
   cả trường hợp parent được phép đổi nhưng child private không được direct grant.
3. Review 135 permissive-policy WARN theo role/table/operation; tám FK index dùng
   workload/EXPLAIN, không xóa index từ thống kê unused của fixture mới.
4. R3 issuer/R5 trust → R6 atomic health revision/R7 timed pipeline → alert/admission/
   budget → signup/resume/reconcile/abuse → hai console → Linux/TLS/offsite/restore/
   on-call → simultaneous A/B/browser/Android/load/RC/pilot ≥7 ngày.

## 6. Fingerprints, advisors và runtime

- Source 655 files / 532 migration:
  `2dfc41d47d47e26cf0f79d894d5920e592f6e7245ff49970a513daec568f701e`.
- Path manifest = sorted distinct union của source.paths trong artifact provider
  653-file và hai file mới; artifact này ghi base-artifact hash, addedPaths và
  thuật toán để rehash current source. Không dùng hash source 653-file cho source mới.
- Migration: `8e65ada26296f04c5a1538fa795f236a4b370754bcf6d8216de614a46d0d8a1b`.
- Initialized schema: `9345305496824b37e5387092e4c4dec851a94b690daae46ec3b5e16d1fdec544`.
- Vendor self-hosted/v0.8.3 / bc27d2661edd09a5d0b8d76ce33da6d4071a756e.
- Advisors A/B: 633/633 = 17 no-policy INFO + 8 FK INFO + 473 unused-index INFO
  + 135 permissive-policy WARN. Không có index/schema fix trong lượt này.
- Giữ `allSafe=false`, `transitiveReachabilityProven=false` và
  `foreignKeyEffectsProven=false`.
- Runtime read-only: readyz 200, schema 0005-health-snapshot-guard.sql,
  roomqc-control:foundation-v3, signup=false; candidate chưa deploy.
- Primary chỉ nhận docs/artifacts; index vẫn 72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f.

Không thay DB nghiệp vụ/CRM, DNS, provider/email thật, public signup hay billing.
Không chứng minh VPS Linux/TLS/offsite restore, E2E browser/Android, capacity/soak
hoặc pilot từ kết quả local này. 122 releaseAcceptance entries và năm gate giữ nguyên.
