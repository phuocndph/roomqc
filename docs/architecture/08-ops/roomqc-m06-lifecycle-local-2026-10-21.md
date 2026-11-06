# RoomQC — lifecycle service: local proof có phạm vi

Ngày 21/10/2026, Asia/Bangkok. Trạng thái: **local_verified_scoped**.
[Artifact đã lọc](../../../artifacts/roomqc-m06-lifecycle-local-2026-10-21.json).
Đây là lát R4-a trong T03/T08/P1-03/P3-01, **không đóng R4-a tổng/R4/T08
hoặc bất kỳ gate release nào**. Giữ toàn bộ 27 gói/25 bước/70 case.

## 1. Kết quả xác định

- Fresh full-vendor A **41f2b3011bc6**, B **9b6a13ced16e** đều exit 0,
  kết thúc permission_controls_verified và cleaned=true, 16 owned objects/run.
- Cả hai áp **531 migrations**, cùng image digests/migration-set/pre-init schema/
  initialized schema/init-spec/lifecycle source và compiled eszip. B tham chiếu
  ownership của A đã thành công và cleanup, không tham chiếu run thất bại.
- Scoped backend **647 files/531 migrations**, SHA256
  **0f14369ae81c0dcaad55a8b9548b1095ad7ed83ce933ac6cc530789f9aa857ab**. Phạm vi có caller check-subscription-status; không dùng
  643-file email-admin manifest hoặc HEAD đơn lẻ làm identity candidate này.
- Full control **154/154**, 0 fail/skip/cancel, exit 0; focused 2/2 là subset.
  Vitest worker/email **27/27**, hai file, exit 0; không cộng vào control.
- Mỗi run: **89 recorded checks / 82 nhãn khác nhau**. Một số postcondition grace
  chạy lặp cho các fixture khác nhau. Không gọi đây là 89 acceptance case.
- Global Edge scan thực chạy **105 transitions và 105 thông báo in-app/outbox**,
  qua nhiều batch 50; không phải 105 email ngoài hệ thống.
- Docker inventory read-only theo exact run label sau A/B: container/volume/
  network đều 0. Dọn tổng 32 đối tượng test hiện tại; raw log/private state giữ riêng.

## 2. Đã sửa gì, không sửa gì

1. Helper expired không còn ép grace timestamp trái trigger. End date hôm qua
   dành cho còn grace; quá hạn mười ngày dành cho grace đã hết. Trigger thật
   calculate_grace_period_end vẫn tự tính end_date + 7 ngày.
2. Assert ngay sau setup: status, end_date, derived grace và past/future eligibility;
   ngày hôm nay được kiểm riêng. Pool SQL fixture dùng UTC như batch RPC.
3. Owner thật gọi create_subscription_quote rồi create_subscription_checkout_draft.
   Có đúng một hàng fixture trong mỗi invoices/payment_transactions/
   subscription_quotes/subscription_checkout_drafts trước snapshot. Draft vẫn
   non_payable=true/checkout_enabled=false, không thanh toán hoặc cấp quyền.
4. Bỏ fixtureClose SQL adapter. Khi deadline hết trong lúc chờ tenant lock,
   anon/owner/staff/service không được recover; super-admin live gọi
   admin_recover_subscription_status_run thành công, có before/after và actor.
   Replay không đổi 14-table snapshot; worker cũ bị chặn, run mới tiếp tục.
5. Structural tests bắt buộc các điểm trên và không cho quay lại fixtureClose.
   Giữ runner actual Edge/internal network/mandatory lifecycle stage đã thêm trước đó.

Lượt tiếp tục này **không thay product handler/RPC/trigger/migration**. Các lỗi
dừng ở ba probe trước là fixture chưa tuân schema đầy đủ, chưa phải lỗi nghiệp vụ
sản phẩm đã chứng minh. Không tắt guard hoặc nới expected để làm test pass.

## 3. Kịch bản có bằng chứng

| Nhóm | Bằng chứng ở cả A/B |
|---|---|
| Authority | Edge thiếu/sai cron secret hoặc owner/staff bị chặn; anon/owner/staff không gọi được ba service RPC; service hợp lệ chạy, không giữ phiên owner |
| Scope | Chín scope invalid không side effect; tenant allowlist và đối chứng ngoài scope; trial/today boundary và ngày trial không bị kéo dài |
| Run và batch | Begin cùng run replay; scope rebind bị chặn; run chồng busy; batch đầy chưa được suy exhausted |
| Replay/cursor | 20 concurrent replay cùng request/index không đổi snapshot; stale/future index, đổi payload/limit bị chặn; terminal receipt replay không ghi lại |
| Atomic rollback | Fault ở notification outbox của transition thứ hai rollback cả batch; bỏ trigger fault rồi cùng request hồi phục một lần |
| Deadline | Có pg_blocking_pids/Lock wait thực; deadline đi qua khi chờ tenant row → PT409, không business effect |
| Renewal | Gia hạn commit trước khi transition lấy khóa; eligibility được đọc lại → not_eligible và không gửi thông báo |
| Recovery | RPC sản phẩm có live super-admin authority, immutable recovery receipt/actor/before-after; replay không đổi, worker cũ không ghi sau recovery |
| Hai worker | Cùng cursor hai request: một 200, một 409; một command duy nhất |
| Mất response | Relay chỉ trả lỗi sau upstream HTTP 200 và durable batch/finish commit; Edge retry đúng request/index/run, không nhân effect |
| Batch nhiều trang | Actual Edge xử lý 105 transitions và delivery qua nhiều batch, không coi batch đủ 50 là hết scope |
| Tiền/draft | Snapshot toàn hàng của bốn bảng tài chính không đổi; mỗi bảng có hàng fixture thực, không phải bảng rỗng |

Hai race có timeline row-lock được ghi riêng: deadline-during-row-lock và
renewal-before-transition. Các tranh chấp/replay khác nằm trong recorded checks,
không cộng chúng hoặc A/B thành số acceptance case.

## 4. Hồi quy tích hợp và fingerprint

| Hạng mục | Mỗi run |
|---|---|
| Email-admin | 114 checks, 7 races, actual Edge/service context |
| Actor/session | 4 roots × 11 invalid states = 44 denials; positive trước/sau |
| Email-ready | 20 fresh events, 18 invalid states, 23 positive queue controls; rollback/dedupe |
| Chín root mutation | 294 recorded checks, 162 matrix denials, 29-table snapshots, 15 revocation races |
| Service protocols | 11 healthy/fault/recovery probe invocations, năm service; permission controls 13 checks |
| Probe privilege | Không direct business tables/definers; không suy đủ mọi authority gián tiếp |
| Advisors | **634 = 17 no-policy INFO + 8 FK INFO + 474 unused-index INFO + 135 permissive WARN** |

Unused-index INFO từ baseline 480 xuống 474 do workload mở rộng. Không thêm/xóa
index hoặc sửa 135 policy trong lượt này. Access catalog vẫn **allSafe=false /
transitiveReachabilityProven=false**.

Fingerprints:

- Migration set: eafe2cb85f766c8b0ed55a1dd95c0a0a8f4fd2456d48cc528c469237ffe9ccf9
- Trước initialization: 52367314d2060a984e01b8ec914297325cf0fbdfaf44ceda364f972f29ca3eee
- Schema initialized: 11f9b8a2695df4ce8e79ed66ee46f85734f084d72cc38e5ed550a00158fec5a4
- Initialization specification: 66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae
- Lifecycle eszip: 1ab9e43c47515365e4dc1973f7e7426677e88a9f4f3a434c1cc6e41d69e3cb2f

Vendor pinned self-hosted/v0.8.3 / bc27d2661edd09a5d0b8d76ce33da6d4071a756e; digest từng image
và hash từng entry source ở artifact. Equality A/B không giải quyết import
supabase-js@2 chưa pin hoặc thay approved manifest/issuer/trust của R3/R5.

## 5. Lịch sử thất bại giữ lại

| Run | Kết quả | Nguyên nhân fixture và xử lý |
|---|---|---|
| 66f4c8b69998 | exit 1, cleaned 16 | Profile staff thiếu created_by/hotel binding; đã sửa |
| 7484cdf77b5c | exit 1, cleaned 16 | Trigger user đã tạo staff_status; chuyển INSERT trùng sang UPDATE exact-owned row |
| 5d7164bc0295 | exit 1, cleaned 16 | End date hôm qua vẫn còn grace; sửa ngày setup và assert trigger-derived postconditions |

Không dùng run fail làm reference cho B; log cũ không bị xóa. Source trước sửa
fixture có hash 5815f5d7… giữ làm lịch sử, không dùng thay successful candidate.

## 6. An toàn và giới hạn

Mọi DB/Auth/REST/Storage/Realtime/Edge/fault chỉ thuộc sandbox có ownership label,
network internal, không public port. Scheduler/provider tắt; không gửi Internet
email, đổi DNS, mutate business Supabase/CRM hoặc deploy runtime đang phục vụ.
Primary chỉ nhận docs/artifacts đã lọc; index SHA256 giữ
72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f.

Không chạy frontend/Android build trong lát fixture-only này; không có claim UI/
native E2E mới. Hai rebuild tuần tự là repeatability, **không phải hai cụm cùng
hoạt động, HA, load capacity hoặc E2E 70 case**. Five-service protocol fault drill
không thay atomic health-store revision fencing và pipeline runtime R6/R7.

<a id="provider-handoff"></a>

## 7. Đầu việc nhận tiếp — không dừng toàn plan tại lifecycle

1. Provider queue/webhook actual Edge trên signing key/sink fixture riêng: raw
   signature/timestamp/body bounds, exact replay, out-of-order/unknown-before-bind,
   lease/retry/commit-response-loss và effect allowlist.
2. Tái hiện giả thuyết cùng signed event ID nhưng đổi provider/type trước khi sửa.
   SQL hiện dùng ON CONFLICT DO NOTHING rồi xử lý incoming fields; chưa có repro
   nên chưa gắn severity hoặc gọi đây là exploit. Nếu cần fix, phân tích lock
   order vì finish_email_delivery đã khóa delivery trước gọi record event.
3. Khép 17-target indirect authority disposition, 135 policy semantics và tám FK;
   không nâng allSafe chỉ vì browser direct grants = 0.
4. Tiếp R3 issuer/R5 trust → R6 atomic health → gateway/runtime/pipeline R7,
   alert/admission/budget → durable signup/resume/reconcile/abuse → hai màn admin.
5. Sau đó Linux/TLS/offsite restore/external alerts → A/B đồng thời/browser/Android/
   E2E/load/RC → pilot ≥7 ngày → public/billing chỉ khi duyệt riêng.

[Phiếu điều phối đầy đủ](roomqc-vps-signup-launch-checklist-2026-10-21.md) và
[ledger 27/25/70](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json).
