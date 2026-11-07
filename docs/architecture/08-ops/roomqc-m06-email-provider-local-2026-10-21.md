# RoomQC — provider queue/webhook: local proof có phạm vi

Ngày 21/10/2026, Asia/Bangkok. Trạng thái: **local_verified_scoped**.
[Artifact đã lọc](../../../artifacts/roomqc-m06-email-provider-local-2026-10-21.json).
Lát R4-a thuộc T03/T08/P1-03/P3-01; **không đóng R4-a tổng/R4/T08 hoặc gate
L/S/P/U/B**. Giữ nguyên 27 gói / 25 bước / 70 case.

## 1. Kết quả đã kiểm chứng

- Fresh full-vendor A `1165686c47ee`, B `b3b0352a9c2e`: exit 0, kết thúc
  `permission_controls_verified`, cleaned=true, 18 owned objects/run.
- Mỗi lượt áp 532 migration. Migration set, initialized schema, image digests,
  init specification, provider source và hai compiled Edge eszip khớp nhau.
  B tham chiếu ownership của A đã thành công và cleanup, không dùng run thất bại.
- Provider: 44 recorded checks / 43 nhãn khác nhau / ba race mỗi lượt. Nhãn
  retryable được dùng cho cả HTTP 500 và 429; đây không phải 44 case release.
- Actual Edge `email-provider-webhook` và `process-email-queue` chạy trong mạng
  Docker internal, không publish port, không email/provider Internet hoặc scheduler.
- 30 delivery fixture/run; callback/queue không đổi snapshot tám bảng nghiệp vụ,
  có owner/tenant/hotel/receipt thực trước snapshot, không chỉ bảng rỗng.
- Full control DB cuối: **157/157**, 0 fail/skip/cancel. Focused 3/3 là subset.
  Vitest email/admin/lifecycle: **34/34**, ba file, không cộng vào control suite.

## 2. Lỗi gốc đã tái hiện và sửa

Run `1039e6e0bbbe` chạy mã gốc:

1. Callback có chữ ký hợp lệ ghi event E1 / provider P1 / delivered.
2. Callback khác cũng có chữ ký hợp lệ dùng E1 nhưng đổi sang P2 / bounced.
3. HTTP 200, delivery của P2 bị thay đổi dù hàng event E1 vẫn thuộc P1.

Nguyên nhân: INSERT ON CONFLICT DO NOTHING không làm bất biến dữ liệu được xử lý
tiếp; function vẫn dùng provider/type của request mới. Đây là lỗi toàn vẹn có
điều kiện **chữ ký provider hợp lệ**, không phải proof caller không quyền có thể
bỏ qua xác thực webhook.

Forward migration do native Supabase CLI 2.121.0 tạo:
`20261021032705_email_provider_immutable_event_identity.sql`.

- So sánh tuple event_id / provider_id / event_type đã lưu; khác tuple → PT409.
- Handler trả HTTP 409 an toàn; không trả provider payload hoặc thông tin khách.
- Exact replay không cập nhật lại timestamp, delivery hay suppression.
- Empty provider ID bị từ chối trước RPC.
- Quyền hai RPC vẫn service-only, search_path rỗng; không thêm quyền browser.

## 3. Race trong bản sửa thử nghiệm đã được chặn trước deploy

Run `95f6ed07e131` đã chặn identity rebind nhưng phát hiện race khi đổi thứ tự
khóa: callback đọc chưa có binding, bị giữ tại BEFORE INSERT event, worker finish
commit binding, rồi callback mới lưu event. Delivery còn accepted thay vì delivered.
Đây là regression của bản sửa thử nghiệm, **không gán bằng chứng này cho mã gốc**.

Bản cuối dùng cùng thứ tự tại cả hai entry:

    provider-scoped advisory transaction lock → delivery row → event uniqueness

Hash key có namespace `roomqc-email-provider:`. Không giữ transaction qua HTTP.
Không khóa event trước delivery. Worker finish lấy provider lock trước delivery;
callback tới sớm cũng dùng cùng lock kể cả chưa tìm được delivery.

Ba race trong mỗi A/B:

| Race | Bằng chứng |
|---|---|
| Finish và replay event tới sớm | Cả hai hoàn tất, delivery delivered, không deadlock |
| Callback giữ provider trước, binding chưa có | Trigger installer giữ callback trước event insert; pg_blocking_pids chứng minh finish chờ callback; cuối cùng delivered |
| Finish giữ provider trước | Installer giữ delivery row; finish chờ row và callback chờ finish theo pg_blocking_pids; cuối cùng delivered |

Trigger/function fault chỉ tồn tại trong sandbox sở hữu, được DROP sau test;
schema fingerprint không drift. Không dùng sleep đơn thuần để tuyên bố race đạt.

## 4. Ma trận provider/consumer đã chạy

| Nhóm | Kiểm tra thực |
|---|---|
| Chữ ký và body | Thiếu/sai signature, raw body sửa, timestamp cũ/tương lai, >64 KiB, JSON lỗi, thiếu/rỗng provider ID |
| Event | Unsupported type ignored không side effect; valid signed event; delivered/delayed/bounced/complained/failed/suppressed |
| Identity | Đổi provider/type cùng ID → 409 và snapshot không đổi; exact replay và 20 concurrent replay không đổi; field tenant/workspace/role/plan thừa bị bỏ qua |
| Tới sớm/precedence | Unknown provider lưu event, finish replay sau bind; terminal negative/delivered/delayed giữ precedence cũ, không tự đổi business priority |
| Quyền | Worker thiếu/sai internal secret hoặc owner JWT → 403; anon/owner gọi service RPC → 42501, không coi timeout là denial |
| Claim/lease | Claim thứ hai không lấy lease còn hiệu lực; fixture cho lease hết hạn rồi reclaim; worker cũ không finish được claim mới |
| Queue | Enqueue dedupe, accepted không bị gửi lại, HTTP 500 retry, HTTP 422 terminal, HTTP 429 global cooldown, retry limit |
| Không gửi | Suppressed/expired không gọi sink; legacy payload chuyển DLQ chỉ có reason/queue ID, không mang token cũ |
| Mất phản hồi | Sink đã accepted nhưng mất response → retry cùng delivery; finish đã durable commit nhưng mất response → worker 503, lần sau không gửi lại |
| Hai consumer | Consumer thứ hai bị global worker lease chặn trong khi consumer đầu đang ở sink |
| Giới hạn effect | users/roles/hotel membership/tenant/hotel/usage/workspace receipt/audit không bị thay đổi |

Sink là HTTP server fixture theo contract Mailpit, **không phải Mailpit service
thật hay Resend thật**. Nó mô hình hóa dedupe theo delivery ID để kiểm recovery.
Hai provider call sau mất phản hồi không chứng minh exactly-once ngoài hệ thống.
Không ghi D15/inbox delivery là passed từ kết quả này.

## 5. Hồi quy và advisors

| Hạng mục | A | B |
|---|---|---|
| Lifecycle | 89 checks, 105 transitions, bốn bảng tài chính có hàng thật không đổi | Như A |
| Email-admin | 114 checks / 7 race | Như A |
| Service | Năm service + fault/recovery và 13 permission checks | Như A |
| No-policy INFO | 17 | 17 |
| Unindexed FK INFO | 8 | 8 |
| Unused-index INFO | 474 | 473 |
| Multiple permissive policy WARN | 135 | 135 |
| Tổng advisors | 634 | 633 |

Chênh một unused-index là thống kê sử dụng phụ thuộc workload/timing, không là
index fix và không là schema drift. Không thêm/xóa index trong lát này.
Access catalog vẫn `allSafe=false`, `transitiveReachabilityProven=false`.
Graph chỉ discovery: 17 target, 149 trigger, 25 candidate entry paths; chưa là
disposition được duyệt của từng đường quyền gián tiếp.

## 6. Identity và ranh giới runtime

- Scoped source 653 files / 532 migration:
  `4ee4a4f80401a1c6fe7a4ef57bd57c73e96f3ba296757136c779037db3e01a39`.
- Migration set:
  `8e65ada26296f04c5a1538fa795f236a4b370754bcf6d8216de614a46d0d8a1b`.
- Initialized schema:
  `9345305496824b37e5387092e4c4dec851a94b690daae46ec3b5e16d1fdec544`.
- Vendor `self-hosted/v0.8.3`, commit bc27d2661edd09a5d0b8d76ce33da6d4071a756e.
- Artifact liệt kê phạm vi/thuật toán hash/source paths và hashes entry files;
  không thay full trusted release manifest R5 hoặc dùng hash source 647-file cũ.
- Read-only runtime: readyz 200, directory `0005-health-snapshot-guard.sql`, image
  `roomqc-control:foundation-v3`, signup=false. Source mới **chưa deploy**.
- Primary chỉ nhận docs/artifacts đã lọc. Hash primary index vẫn
  `72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f`.

Các run thất bại và A/B đều đã cleanup exact-owned container/volume/network;
raw log giữ trong thư mục private có ACL. Không thay business Supabase/CRM,
không gửi email thật, đổi DNS, mở signup, billing hoặc chạy frontend/Android build.

## 7. Điểm nhận việc tiếp theo

<a id="provider-handoff"></a>

1. Lập disposition từng target trong tập 17: browser/service/worker, RPC/Edge/view/
   definer/trigger/FK, quyền thực, tenant/session guard, positive/negative/race proof,
   verdict/reviewer/residual risk. Không gọi direct grants=0 là allSafe.
2. Review semantics 135 permissive-policy WARN theo effective role/table/operation;
   giữ allowed rows và deny cross-tenant/hotel, kể cả UPDATE WITH CHECK/revoke.
3. Tám FK: dataset/workload, EXPLAIN/BUFFERS, lock/write cost và add/retain/no-change.
4. R3 issuer/R5 trusted artifact → R6 atomic health revision → R7 timed pipeline.
5. Alert/admission/budget → signup/resume/reconcile/abuse → hai màn console →
   Linux/TLS/offsite/restore/on-call → A/B đồng thời/browser/Android/load/RC/pilot ≥7 ngày.

Không nhận lại provider như một giả thuyết chưa tái hiện; giữ bộ test này làm
regression trên candidate sau. Toàn bộ releaseAcceptance/gate vẫn chưa nâng.
