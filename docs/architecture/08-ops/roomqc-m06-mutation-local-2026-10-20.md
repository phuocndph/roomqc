# RoomQC M06/R4-a — live actor tại chín lệnh ghi: proof local

Ngày 20/10/2026. **Scope chín root ghi đã local_verified; R4-a tổng/R4/T08 và
mọi gate phát hành vẫn mở.** Implementation chỉ ở integration, không triển khai
lên runtime hoặc DB nghiệp vụ.

- [Artifact đã lọc](../../../artifacts/roomqc-m06-mutation-local-2026-10-20.json)
- [Kế hoạch và phiếu nhận việc hiện hành](roomqc-vps-signup-deployment-plan-2026-10-20.md#pre-implementation-current)
- [Ledger 17 target, snapshot có giới hạn](roomqc-m06-callers-local-2026-10-20.md)

## 1. Lỗi tái hiện và điều không được suy rộng

| Lượt | Kết quả có bằng chứng | Kết luận |
|---|---|---|
| ed9209ebf519 | Assertion tenant-admin-auth-deleted thất bại, chưa có status diagnostic | Chưa đủ để tự suy HTTP 200 từ lượt này |
| fc4c01bdd5cf | Auth xóa mềm, admin_manage_tenant trả HTTP 200 trong fixture | Guard cũ cho phép lệnh quản lý tenant; migration cuối thứ 530 lúc này còn rỗng |
| afbdfa2380d7 | Auth xóa mềm, settlement trả HTTP 409 / PT409 | Đi qua authorization rồi dừng ở draft non-payable; không chứng minh đã thu tiền/cấp gói |
| 124d3e7ce697 | Candidate đi qua matrix và mười race rồi dừng ở completion-and-cancel; actual active, expected trial | Kỳ vọng fixture sai: reactivation có subscription_end_date hợp lệ phải active; sửa test, không nới nghiệp vụ |

Không có căn cứ kết luận production đã gặp incident. Cả bốn run thất bại được
giữ log/hash/cleanup trong artifact; không xóa thất bại khỏi lịch sử. First run
candidate 0c849de1… khác source cuối fe82269a…, không dùng nó làm proof hiện hành.

## 2. Thay đổi và phạm vi quyền

Forward migration
`supabase/migrations/20261020093925_platform_mutation_live_session_fencing.sql`
thêm private helper invoker, search_path rỗng, không cấp EXECUTE cho browser/
service. Chín public root vẫn giữ signature/grants và body nghiệp vụ đã review.

Helper lấy SHARE locks theo thứ tự **Auth → profile → required role → session →
business**. Kiểm Auth confirmed/live/not banned, profile active/not deleted/not
locked, role owner/super_admin đúng contract và session thực thuộc subject,
not_after NULL hoặc còn hạn. Không lấy quyền từ user_metadata.

| Authority | Root ghi đã kiểm |
|---|---|
| Owner | save_hotel_room_setup; complete_hotel_room_setup; create_subscription_quote; create_subscription_checkout_draft |
| Owner hoặc service theo contract hiện hành | cancel_subscription_payment |
| Platform admin | admin_manage_tenant; admin_mutate_subscription_reconciliation_case; admin_recover_subscription_status_run |
| Platform admin hoặc trusted service hiện hành | settle_subscription_payment |

Guard chạy trước mutation/replay và trước các business locks cần thiết.
Checkout/settlement vẫn non-payable, không mở thanh toán thật. Service branch
đã có giữ nguyên, không bắt worker dùng session owner hoặc thêm service fallback
cho browser.

Regression structural so chín body với source trước, chỉ chấp nhận các thay đổi
authorization đã review; không ALTER/DROP/rename function hoặc sửa migration lịch sử.

## 3. Source và kiểm chứng cuối

Scoped source: **640 files / 530 business migrations**; integration branch
codex/roomqc-parallel-integration, HEAD 5cb5837 + diff/file mới chưa commit.

`fe82269a2737a0a7e654fca8cc0ffbc1ca86626e525ad60b7cab12aafdfe8274`

Phạm vi/thuật toán manifest ở artifact; không phải full-release identity.
Kiểm lại sau A/B vẫn cùng hash.

| Bài kiểm tra | Kết quả |
|---|---|
| Focused mutation/actor-session/email-ready/registration | 10/10, subset của control, không cộng vào full suite |
| Full control DB | 148/148, 0 fail/skip/cancel, exit 0; 125775.146 ms |
| Fresh backend A | 6eade27a974f, 530 migrations, permission_controls_verified, exit 0, cleaned |
| Fresh backend B | f2025aa52f13, cùng source; reference ownership A đã completed/cleaned; matched=true, exit 0, cleaned |
| Application/registration regression mỗi run | 212 application checks/8 actors; 106 registration checks/8 actors +39 SQL denials |
| Actor/session regression | 44 SQL denials, 4 roots/11 states, positive trước/sau và rollback |
| Email-ready regression | 20 fresh events/18 invalid/23 positive queues; 10-table rollback, consumer/provider tắt |
| Permission/service | 13 permission controls; năm service healthy/fault/recovery, Edge provider-disabled, Janitor controlled drill |
| Frontend build | Không chạy lại ở lát backend-only này; 378 assets ở report trước là proof lịch sử, không phải full release mới |

### Mutation caller harness — thực sự đã chạy ở cả A và B

Bốn Auth actors thật: owner A, owner B, platform admin và staff. HTTP gọi RPC
thật trong Docker network riêng; không provider/key/email Internet.

- 10 owner operations +8 admin operations; chín invalid states mỗi nhóm:
  unconfirmed, banned, Auth-deleted, profile-deleted, locked, inactive, NULL
  status, role-revoked và expired-session. **162 matrix denials/run**.
- **29 bảng snapshot full-row hash** cho Auth/session/profile/roles/membership,
  rooms/prices, tenant/trial, quote/draft/invoice/payment, job/case/history/audit,
  lifecycle/outbox, email và PGMQ. Claim no-side-effects giới hạn ở tập đã review.
- 294 named checks/run gồm HTTP controls và checkpoint snapshot/assertion;
  không gọi đây là 294 HTTP requests, acceptance cases hoặc cộng hai run thành coverage mới.
- Staff, owner-not-platform, cross-tenant và private helper boundary có negative
  và positive controls. Denial phải đúng HTTP/SQLSTATE; 500/timeout/business 409
  không được tính như permission denial.
- Complete và cancel có positive/replay, replay không đổi snapshot; checkout
  mới sau cancel hợp lệ. Suspend/reactivate không gia hạn subscription/trial.
- Job recovery dùng begin atomic service RPC và explicit tenant scope trên
  fixture; expired deadline giữ đầy đủ microsecond precision. Recovery đầu
  trả released=true/replayed=false; chỉ job run và recovery receipt đổi trong
  29 bảng; replay không đổi snapshot. Missing-run 404 vẫn kiểm riêng.
- Logout thật rồi replay token cũ bị chặn; login mới có positive/replay, gồm
  recovery receipt. Không dựng JWT session giả để thay kiểm Auth thật.

### 15 race/run — ghi rõ cả hai thứ tự serialization

| Thử đồng thời | Coverage thực tế | Kết quả |
|---|---|---|
| Profile lock commit trước | Cả chín root ghi | HTTP request thực chờ lock, rồi deny, business snapshot không đổi |
| Auth ban commit trước | admin_manage_tenant | Chờ lock rồi deny |
| Role DELETE commit trước | save_hotel_room_setup và admin_manage_tenant | Chờ lock rồi deny; restore role, positive sau |
| Session DELETE commit trước | Hai root ở dòng trên | Chờ lock rồi deny; tạo login/session mới, không phục hồi session đã revoke |
| Mutation giữ authority lock trước | admin_manage_tenant | HTTP chờ business lock; revocation chờ mutation thật; mutation commit rồi revocation commit; command tiếp theo deny |

Có pg_stat_activity/pg_blocking_pids và overlap thực; không chỉ sleep/timestamp.
Không suy Auth ban/role/session race đã chạy riêng trên mọi root. Không hứa hủy
transaction đã lấy authority lock chỉ vì người quản trị vừa bấm thu hồi ở UI.

## 4. Repeatability và advisors

| Identity chung A/B | SHA256 |
|---|---|
| Migration set | 9e9e6de928d2aa32f17184eb584743a1b42ea442cf11119cc77042c61aaaee5a |
| Pre-initialization schema | c682747de4c4c25c0c0fb6a81a228ac1ad09c86026b3e47f73eaf61597ce8f48 |
| Initialized schema | e0d79d36c0864f35cdcf3a3643108f3b5f7739fc50b6997f8cf7ae67685f6cc7 |
| Initialization specification | 66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae |

Vendor image digests khớp, nằm trong artifact. Compose bundleHash riêng run không
là approved production release digest.

Cả A và B: native CLI 2.121.0, **640 findings =17 no-policy INFO +8 FK INFO
+480 unused-index INFO +135 permissive WARN**. 480 thay 485 do workload/statistics,
không có xóa/thêm index hoặc proof performance mới.

Catalog 474 functions/11 views/358 policies/13 FK; candidate graph
1009 nodes/894 edges/149 triggers/25 entry paths. Browser direct grant violations
bằng 0 nhưng allSafe=false/transitiveReachabilityProven=false. Graph chỉ discovery.

## 5. Cleanup và bảo toàn

Sáu runs reproduction/intermediate/A/B đều cleaned 14 owned objects/run.
Inventory read-only lúc 2026-10-20T10:32:37.730Z theo exact label từng
run cho **0 container/volume/network**. Không xóa file/log hoặc dữ liệu người dùng.

Primary chỉ nhận docs/artifacts đã lọc; index SHA256 giữ
`72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f`.
Không migrate business Supabase/CRM, không đổi runtime/signup flag, deploy,
DNS, provider hoặc billing. Raw .local/catalog/token không publish.

## 6. Điểm nhận việc tiếp theo — chưa đóng R4-a tổng

1. Hoàn thiện disposition 17 targets với source/callsite/grants/guard/test:
   registration, email-ready và scope chín root có proof; service lifecycle
   begin/batch/finish/outbox, email-admin test/retry và provider metadata còn
   phải kiểm các chain/side effects chưa phủ. Không tự tick safe từ graph.
2. Phân biệt guard preflight ở Edge và authorization tại transaction mutation;
   review race thu hồi quyền giữa hai mốc. Nguồn gap chưa là defect được tái hiện.
3. R4-b 135 policy WARN: operation/effective role/USING/WITH CHECK; R4-c tám FK:
   workload/EXPLAIN/write cost. Không xóa unused index từ fresh statistics.
4. R3 issuer/R5 trust → R6 atomic health/gateway → R7 timed pipeline; sau đó
   alert/authority/admission/budget, durable signup/resume/abuse, hai màn admin,
   Linux/offsite/restore, A/B cùng chạy/E2E/tải/cutover và pilot ≥7 ngày.

Bảo toàn đủ 27 gói/25 bước/70 case. Local scope này không đóng release gate,
không thay Linux/email thật/offsite restore/E2E/load/pilot hoặc scheduled soak.
