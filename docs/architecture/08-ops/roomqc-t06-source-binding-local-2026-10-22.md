# T06/T08 — ràng buộc nguồn và cấu hình, local 22/10/2026

> Packet này giữ lịch sử candidate770. Delta mới hơn là
> [installer-only disable771](roomqc-t08-probe-disable-local-2026-10-22.md),
> full control288/288; không thừa kế full-backend770 sang nguồn mới.

Đã triển khai phần source/config binding của plan mục14.4. Đây là checkpoint
local có phạm vi, **không đóng toàn T06/T08 hoặc roadmap VPS + signup**.
Implementation ở integration; primary chỉ nhận tài liệu/artifact sanitize.

## 1. Candidate và kết quả đã kết thúc

- Candidate **770 file / 546 business migrations / 8 directory migrations**.
- SHA256 `39d3efd3bfe30b13416d74efed5b0314b219b1a090eac99b50c9a86aaa0abfc5`; manifest kế thừa packet timed-local và thêm module/test mới.
- Runtime/source-set riêng: **139 file**, SHA256 `d91024cb78dd7daf3057937b1602badb95899ac0096d29038265e078126d5d15`.
  Bao gồm control runtime/tests/migrations, package/lock, orchestrator/setup,
  renderer/monitoring compose/queries; không là hash toàn repository.
- Full control: `node scripts/test-control-directory.mjs`, session26272,
  **283/283, 0 fail/skip/cancel, exit0**,128640.0058ms.
- Focused18 là subset của283, gồm hai lần renderer + Compose config thật;
  không cộng thành301. Lint/syntax4 đạt; tracked whitespace exit0.
- Source hash lại sau full control không đổi. Kiểm độc lập15 tổ hợp family/kind:
  directory/monitor/probe-auth/no-policy/release-manifest × container/network/volume,
  tất cả0.

[Artifact](../../../artifacts/roomqc-t06-source-binding-local-2026-10-22.json)
ghi nguồn, kết quả đã terminal và run đang chạy riêng; không chứa private state,
DSN, keyring, token hoặc logs.

## 2. Đã thay đổi gì

| Boundary | Hành vi và bằng chứng |
|---|---|
| Bộ nguồn | Danh sách bắt buộc + discovery scope; sort path và chuẩn hóa LF. Test root khác/CRLF khớp; sửa runtime/package/migration/contract/renderer/orchestrator/compose/query bị mismatch |
| Bỏ sót hoặc thêm file | Thiếu file bắt buộc fail trước chạy; thêm/bỏ runtime mới không âm thầm kế thừa bằng chứng. Manifest sai version/order/digest/duplicate bị từ chối |
| Đọc nguồn | Chặn symlink/junction cả segment, file quá cỡ, non-file hoặc UTF-8 lỗi; không đọc .env/node_modules/private runtime vào manifest |
| Reference độc lập | Kiểm exact-owned path/run, terminal phase, non-diagnostic, no failure/cleanup failure, source cuối và rendered evidence trước khi tạo root/resource của lần mới |
| Rendered monitoring | Hash composed JSON, Prometheus thật, target và health budget; chỉ normalize exact run/project/host/owned-root/repository. Không normalize image/rights/mount/network/cadence/pool |
| Đối chứng thật | Hai renderer + Docker Compose config không tạo resource cho digest khớp; đổi readonly và file Prometheus đã render bị từ chối |
| Full runner | Chụp nguồn đầu/cuối; kiểm render trước/sau managed drill; independent comparison yêu cầu cả source-set và render-set thay vì chỉ managed client/exporter |

Giữ pins, quyền installer/runtime, thời gian warmup/recovery và mọi business
check trong default full backend. Không migration/schema/grant sản phẩm mới.
Digest không phải chữ ký issuer, phê duyệt release hoặc quyền mở signup.

Đã gọi **runner CLI thật** với reference full-backend cũ d740b6b38de9 không
có source-binding mới: exit1 / BACKEND_BUILD_REFERENCE_INVALID, trước sự kiện
prepare, không tạo owned backend root mới. Đây là negative preflight có chủ đích,
không phải lỗi run d4feca68d43b đã terminal0; stdout trống, không xuất stderr private.

## 3. Default full backend — đã terminal, scoped local

Lệnh **default**, không diagnostic:
`node scripts/test-control-backend-sandbox.mjs --run`.

- Session69733, run`d4feca68d43b`, project`roomqc-probe-d4feca68d43b`.
- **Terminal exit0**, phase `permission_controls_verified`, failed=false,
  cleaned=true, cleanupFailed=false. Đối chiếu state sanitize lúc
  22/10/2026 05:27:40 UTC (12:27:40 Asia/Bangkok).
- Source-set139 khớp đầu/cuối; `sourceBindingVerifiedAtEnd=true`.
  Candidate770 SHA256 vẫn `39d3efd…`; không sửa nguồn trong lượt chạy.
- Monitoring render-set khớp trước/sau drill; combined SHA256
  `36bb052588b7a39357ece333b0c956b4c50eadde49d00212c40cdf7cc95ce7db`.
- Pipeline **17 mốc**, năm dịch vụ thật + metrics thật + directory riêng,
  measurementScope=docker-desktop-vm; không fake clock hoặc payload khỏe.
  Warmup đầu308266ms, recovery liên tục603236ms, warmup sau mất metrics324972ms,
  tính từ các trường persisted firstValidAt/recoverySince/lastObservedAt.
- Từng Auth/REST/Storage/Realtime/Functions được dừng/khôi phục; restart giữ latch.
  Metrics stale chuyển unknown/readiness=false; metrics lên lại phải warming.
  Kết thúc health=healthy, admission vẫn manual_closed; không mở signup.
- Hai pool đóng, worker exit0. Kiểm độc lập exact-run container/network/volume:
  **0/0/0**, không chỉ tin cờ cleaned của runner.
- Các mandatory checks đã kết thúc gồm provider/lifecycle/admin email, mutation,
  no-policy19, FK parent boundaries, hotel scope, account/session, employee/self
  profile/password và permission recovery; xem boolean phạm vi trong artifact.
  Không suy thành full indirect/workflow matrix hoặc production offboarding.
- Positive reference preflight thật bằng `readBackendBuildReference` đã nhận
  run này trên đúng source/render-set, exit0, không tạo resource. Đây không là
  independent full rebuild. Negative CLI reference cũ ở mục2 vẫn giữ nguyên.
- Invocation này **không có --advisors-cli**; không tuyên bố audit advisors mới.
  Disposition của findings lịch sử vẫn mở.

[Packet timed-local cũ](roomqc-t06-managed-timed-local-2026-10-22.md) giữ17mốc
trên768/sourcea3aaf. Run770 có bằng chứng riêng, không kế thừa pass từ768.
Chưa có independent full rebuild; sau delta live credential/config tiếp theo
phải freeze candidate mới và regression/rebuild đúng nguồn, không mượn pass770.

## 4. Còn thiếu và thứ tự tiếp tục

1. Đã nhận terminal0, mandatory workflow/schema và independent cleanup của770;
   giữ packet này làm lịch sử đúng nguồn, không chạy lặp bản sắp thay để tăng count.
2. Tiếp live credential/config/catalog/policy/target changes giữa collection và
   recovery theo [plan14.4](roomqc-vps-signup-execution-ready-2026-10-22.md#144-lượt-thực-hiện-kế-tiếp--khép-khoảng-trống-của-packet).
   Không gọi helper recover là admin revoke, không giả định logout làm JWT cũ
   hết hiệu lực ngay; contract installer/live session còn cần chứng minh.
3. Sau delta đó freeze candidate kết hợp rồi dựng đối chứng độc lập với
   reference đủ điều kiện; so source/image/schema/config và recovery. Không
   chạy lại bản trung gian sắp thay chỉ để tăng count. Hai run tuần tự không thay T21.
4. Khép issuer/cross-replica, indirect/workflow/policy/FK rồi alert/admission/
   budget/signup/resume/reconcile/console/Linux/DR/on-call/E2E/load/RC/pilot theo
   dependency. Chưa kết luận sức chứa hoặc production readiness.

Rollback delta: ngừng dùng harness candidate; không down-migrate/reset DB/xóa
mapping/receipt. Run770 đã cleanup exact-owned và kiểm độc lập0/0/0;
các run tiếp cũng không dùng lệnh dọn toàn Docker hoặc đụng serving/CRM.

## 5. Trạng thái nghiệm thu và giới hạn

Primary index và hai raw ledger giữ nguyên. **122 release entries unverified;
L/S/P/U/B không đổi, reviewer/signoff null**. Không deploy VPS, thay serving DB,
DNS/provider, gửi Internet email hoặc mở admission/signup thật.

Local control có PostgreSQL/GoTrue/REST thật và full backend770 đã terminal
với timed five-vendor/metrics/directory pipeline. Phạm vi là Docker Desktop VM;
chưa thay issuer automation, Linux/TLS/offsite, browser/Android hoặc tải/pilot.
Không dùng283tests hoặc17mốc thay70ca sản phẩm; chưa ký toànT06/T08/roadmap.

Review hiện hành: source-set hash package/lock input, **không hash mọi byte đã
cài trong node_modules**; dependency/image provenance vẫn phải có tại release.
Test GoTrue revoke hiện dùng JWT TTL ngắn để refresh bị từ chối sau logout;
chưa chứng minh token còn xa expiry gọi /user bị từ chối tức thời. Drill kế tiếp
phải đo hành vi thực và fencing credential riêng, không suy rộng từ test đó.

Hướng dẫn Supabase/PostgreSQL tiếp tục giữ dedicated role/pool, pin vendor,
live-session semantics và fail-closed; không nới runtime hoặc service-key fallback.
[Plan toàn bộ](roomqc-vps-signup-execution-ready-2026-10-22.md) /
[phiếu70ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md).
