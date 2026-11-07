# EC05 — native Auth: fault/concurrency diagnostic local

Ngày 22/10/2026, Asia/Bangkok. Kết quả **scoped diagnostic đạt**, chưa hoàn tất EC05,
không là full A/B hoặc nghiệm thu phát hành.
[Artifact đã lọc](../../../artifacts/roomqc-m06-password-adversarial-local-2026-10-22.json).
[ADR custom Auth](../adr/roomqc-native-password-transaction-boundary.md).

## 1. Candidate và terminal

- Run `4ab8ebbe05c0`, handle 53147, exit 0/stderr 0, cleaned 11 objects.
- Source **706 files / 539 migrations**, SHA256
  `abf5082f6fad5846e6c713610c37f909d7f4db2487734229fe42e0a3dba56b23`.
  Chụp trước/sau run và recompute khi cập nhật plan khớp; không là full release manifest.
- Schema trước/sau khớp; exact run-label container/network/volume còn **0/0/0**.
  Build image local giữ lại, không là container serving hoặc registry production.
- Full control DB handle **87371** đã terminal: **206/206**, 0 fail/skip/cancel,
  exit 0/stderr 0. Không dùng số này thay actual Auth/E2E.
- Không chạy lại FE trên candidate này; 90/90 đã ghi nhận trước đó là lịch sử.

## 2. Kết quả có thể dùng làm bằng chứng

| Nhóm | Đối chứng thực chạy | Kết quả |
|---|---|---|
| Bộ gốc | Cùng 33 identities/expected của owner/manager/staff, actual installed SDK/Auth/REST | 33/33; giữ 18 positives policy candidate, giải quyết 15 failures cũ |
| Private ACL | Browser/service không có quyền helper/table, native Auth role được gọi | Đạt |
| Completion fault | Lỗi 500 tại completion | Hash/session/audit/flag/receipt rollback cùng transaction |
| Audit fault | Lỗi 500 tại audit | Cùng tập effect rollback; 5xx là fault expected, không tính permission-denial |
| Response-body loss | Abort sau response headers, trước đọc body; đọc receipt đúng actor/change ID | Commit xác nhận, không gửi mutation lại; chưa chứng minh mất response trước headers |
| Receipt privacy/reuse | Actor khác không đọc receipt; dùng lại completed ID | Hidden; 409 và không effect mới. Không gọi đây là replay-success |
| Same-current-password concurrency | Hai call qua observed recursive DB barriers | 200/409, một receipt, không lost update |
| Revocation races | Locked/deleted-session × revoke-first/mutation-first | 4/4 có barrier, session/audit/effect assertions và recovery positive |

Giữ nguyên [failed attempt](roomqc-m06-password-adversarial-attempt-local-2026-10-22.md):
33/33 và sáu check đã đạt nhưng harness dừng ở direct-blocker barrier, không phải
passing full run. Bản sửa harness quan sát blocking graph bắc cầu; không nới
expected một thành công/một conflict. Coverage mới lấy từ check/race thực ghi nhận.

## 3. Ranh giới build cần xử lý trước full A/B

GoTrue2.197.0 source commit và SDK2.80 giữ pin. Extension sourceHash
`00782a18fdb1ebc00f4dd062bc418c48c38ed2757de707ae18230a612cf61264`,
ba extension files và original/patched native UserUpdate source hashes **khớp**
diagnostic705. Tuy nhiên image ID khác:

- Diagnostic705: `sha256:f39b2f63eda3934f8acbc9199c293eb32d4139d78749f943408c3780523553b3`.
- Run này: `sha256:64579a4e85f1c144c381075fba55031d51684e638006c9811d7f39e879ebb25f`.

Inspect hiện tại chỉ tìm được image mới; image705 không còn để so binary.
Chưa xác định nguyên nhân, không kết luận do code drift hoặc build timestamp.
Trước full A/B phải kiểm reproducibility/provenance và freeze **một exact reviewed
immutable image** cho cùng candidate; không bỏ invariant exact image để test xanh.
Go build chỉ chạy hai targeted tests, không là upstream full Go suite.

## 4. Việc phải nhận tiếp trong toàn bộ plan

1. Hoàn thiện forced page/AuthContext và ordinary/settings/recovery callers: current
   password, operation UUID, captured actor/exact session, status readback trước success.
   RPC200/null/wrong receipt không được success; không client PATCH cờ hoặc sleep/toast.
2. Lưu intent ID/context không chứa password/token; remount/hai tab/identity switch,
   unknown outcome và logout phải được kiểm. Recovery cần native context, không
   tin query string/user_metadata. Map cả `current_password_invalid`.
3. Actual tests cho policy/audit disabled/missing helper, response loss trước headers,
   refresh/recovery/pre-profile/invitation/offboarding và lock order invitation/Auth.
   Quan sát đảo thứ tự khóa là source concern, chưa là deadlock đã tái hiện.
4. Fresh frozen-source full A/B/control/FE/advisors/final recovery/cleanup, giữ mọi
   passing regression cũ trên candidate mới. Scoped source694 proof không tự chuyển.
5. Tiếp permission/membership → invitation/legacy Edge → 17-target/policy/FK →
   issuer/trust/health → alerts/admission/signup/console → Linux/DR/E2E/load/pilot.

Không serving/VPS/CRM/DNS/provider hoặc email thật thay đổi. **27 gói / 25 tasks /
70 cases**, 122 releaseAcceptance vẫn unverified; gate L/S/P/U/B và reviewer chưa đổi.
