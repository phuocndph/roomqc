# T06/T08 — vô hiệu credential giám sát, local 22/10/2026

Đã triển khai installer-only **disable**, không dùng refresh quarantine để giả
làm revoke. Đây là checkpoint local có phạm vi của T01/T06/T08, chưa khép toàn
task/70ca/roadmap. Implementation chỉ ở integration; primary nhận docs/artifact.

## 1. Candidate và kiểm thử đã kết thúc

- **771 file / 546 business migrations / 9 directory migrations**.
- SHA256 `01ac08e19734824b3968e1c98dffab4b4de4ef288814a4b6a84f15fff5d1f1d4`.
- Runtime source-set140 file, SHA256
  `caa7a9b8f37b858e239e0c1b5801839360e2dacb5ab951838f3379f0caa904f2`.
  Không là fingerprint mọi file/node_modules trong repository.
- `node scripts/test-control-directory.mjs`, session71010:
  **288/288,0fail/skip/cancel,exit0**,122834.8486ms.
- Focused DB + actual GoTrue12/12 là subset của288, không cộng thành300.
  Preliminary source-binding12pass/1skip là invocation không DB; full control
  đã chạy lại real renderer/Compose và không có skip.
- Syntax6/lint6 đạt, không warning/error. Scoped source trước/sau suite khớp.
- Independent cleanup6label families × container/network/volume = **18 checks0**,
  gồm cả label Compose monitoring; không chỉ tin teardown của test.

[Artifact JSON](../../../artifacts/roomqc-t08-probe-disable-local-2026-10-22.json)
ghi actual commands/outcomes/limits và source riêng của bản sửa.

## 2. Hành vi và ranh giới đã kiểm

| Ranh giới | Hành vi / bằng chứng |
|---|---|
| Quyền thao tác | `disable(binding,{expectedRevision})` chỉ cho login có installer role; worker bị403 trước no-op. Direct SQL từ runtime bị42501 |
| Giao dịch | Advisory lock727001 trước row lock, revision+1 và audit cùng transaction; audit failure rollback toàn bộ. Không giữ transaction qua HTTP |
| Khẩn cấp | Không giải mã envelope/đọc key hoặc gọi Auth để disable. Kiểm cả expiry đã qua và envelope hỏng |
| Chống tự bật lại | SECURITY INVOKER trigger chặn runtime vào/ra/sửa disabled, kể cả helper recover hoặc SQL trực tiếp; runtime không giả audit seeded/rotated/disabled |
| Phục hồi | Cùng canary user, session khác và revision+1; store và database đều từ chối session vừa disable. Không tạo tài khoản khác để né |
| Kết quả cũ | Acquire trả PROBE_CREDENTIAL_DISABLED; completion/manager/health write/admission không nhận proof cũ |
| Retry/race | Hai lệnh cùng expectedRevision chỉ một thắng; retry có current revision khi đã disabled là no-op, không thêm event. Retry stale trả conflict, không giả success |
| Health | Old proof bị409 HEALTH_PROOF_CHANGED, snapshot/policy/generation/collector audit không đổi; không reserve mới. Phiên mới phải warmup |
| Upgrade | Directory8 có credential được migrate lên9, giữ row và8checksum; rerun no-op, không reset. Bộ nguồn bắt buộc và mutation test có migration9 |

Migration0009 thuộc `migrateDirectory`/history riêng, **không** là migration
Supabase của khách sạn. Không sửa0001–0008 hoặc546business migrations. Không
thêm runtime grant/service-role fallback hay public EXECUTE cho trigger mới.

## 3. Đối chứng Auth thật, không suy từ JWT expiry

Fixture dựng PostgreSQL và pinned GoTrue thật, chỉ dùng một danh tính synthetic
exact-owned, không SMTP/provider/khách thật. Đã quan sát /user trả200 đúng user
rồi giữ response ở callback collection; installer disable khi lượt đó đang chờ.

- Kết quả sau thả bị PROBE_RESULT_FENCED; lượt kế tiếp không refresh hoặc probe.
- JWT cũ còn >30s và **vẫn gọi /user được** vì bài thử không logout ở vendor.
  Điều đó không cho phép kết quả cũ ghi health hoặc mở admission.
- Installer không dùng lại session vừa disable; đăng nhập thật lấy session mới
  cùng user, install và probe thành công.
- Một connection khác lấy được advisory lock trong lúc response đang chờ:
  không có transaction database giữ qua remote call. Audit không chứa token/PII.

Đây là **directory authority disable**, không phải tuyên bố remote Auth logout
làm mọi unexpired JWT vô hiệu tức thời. Revoke ở vendor và kiểm session live là
hợp đồng riêng, không đổi tên helper needs_recovery thành revoke.

## 4. Full backend và bước tiếp theo theo plan14.4

[Full backend770](roomqc-t06-source-binding-local-2026-10-22.md) run
d4feca68d43b đã terminal0/17mốc/cleanup0 trước delta này. Đó là lịch sử đúng
source39d3efd, **không thừa kế pass sang771**. Chưa chạy default full backend hoặc
independent rebuild cho771; không chạy bản trung gian sắp thay chỉ để tăng count.

CLI thật đã thử reference770 trên nguồn mới: expected exit1 /
BACKEND_SOURCE_BINDING_INVALID, stdout trống, trước prepare và **0root mới**.
Đây là negative preflight đúng chủ đích, không phải full backend771 thất bại.

Tiếp tục checklist con T01/T05/T06/T08, không thêm task/case:

1. Fixed private loopback relay giữ một response Prometheus **thật** sau manager
   assertion. Quan sát overlap rồi rotate/disable bằng installer; thả trong
   finally và có auto-deadline. Không fake payload/clock hoặc nới collector timeout.
2. Chứng minh old proof bị fence tại HealthStore commit/admission, không chỉ
   manager assertion đã đạt. Actual policy/target/catalog/release changes trong
   collection/restart và recovery/warmup theo đúng policy còn phải kiểm.
3. Hoàn thiện issuer/cross-replica provenance, không dùng fixture approval như
   phê duyệt phát hành; chưa có HTTP admin revoke hoặc workflow issuer hoàn chỉnh.
4. Freeze candidate kết hợp, focused/full control rồi default full backend và
   independent rebuild trên cùng source/image/schema/rendered config.
5. Tiếp indirect/workflow/policy/FK, alert→admission/budget→signup/status/resume/
   reconcile→hai console→Linux/TLS/offsite/on-call→simultaneousA/B/E2E/load/RC/pilot
   theo dependency. Không thu hẹp mục tiêu ở credential hoặc count test.

## 5. Giới hạn, rollback và gate

288tests không thay70ca sản phẩm. Real Auth/DB/monitoring control không thay
timed combined full-vendor drill, Linux/TLS, offsite restore, Internet email,
browser/Android, load/soak, RC hoặc pilot. Không có advisor audit mới; findings
lịch sử vẫn cần disposition. Chưa kết luận sức chứa hoặc production readiness.

Rollback binary/config tương thích, giữ disabled state và audit; installer cũ
không được phép đưa session cũ trở lại bằng UPDATE. Không down-migrate, reset DB,
xóa mapping/receipt hoặc xóa dữ liệu để dashboard xanh.

Primary index và hai raw ledger không đổi; **122entries unverified, L/S/P/U/B
không đổi, reviewer/signoff null**. Không deploy VPS, sửa servingDB/CRM/DNS/
provider, gửi Internet email hoặc mở signup thật.

Hướng dẫn Supabase/PostgreSQL đã giữ quyền current session thay claim cũ,
installer/runtime tách biệt, transaction ngắn và thứ tự lock nhất quán.
