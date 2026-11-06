# RoomQC — self-profile forward fix: diagnostic local

Ngày 21/10/2026; 15.2.4 / T03 T04 T08. Đây là diagnostic, không phải passing
full A/B reference, staging, E2E hoặc release acceptance.

## Đối chứng trước/sau

Baseline [51089654c247](roomqc-m06-self-profile-baseline-local-2026-10-21.md)
giữ bất biến: 58 observations / 18 failures. Diagnostic mới ae5e059556dc có
66/66 observations, 4/4 revocation races, upload/public-read/profile save và hai
self updates đồng thời đạt. Đủ 58 identity/expected gốc, không missing hoặc đổi
expected; 18 failures đã đạt, 40 kết quả đúng trước đó giữ nguyên. 8 observations
thêm là next-request denial và recovery của bốn cuộc đua, không là case release mới.

Session 45853, exit 0; cleaned 11 objects. Source 687 files / 538 migrations khóa
trước launch, recompute sau terminal khớp:
`841bc21c139d62cf252fcf34f540551482b5b623c94ce8dabb166612879a5b3b`.
Đây là scoped backend/harness manifest, không bao phủ các FE production files
được sửa sau diagnostic. Schema trước/sau khớp sau gỡ test-only barrier.

## Bản sửa và phạm vi

Forward migration 20261021153825 thêm hai private trigger functions, không cấp
EXECUTE cho browser/service/probe, không đổi RLS/grants/constraint sẵn có.
Auth/session được khóa trước users rows; self profile live-state kiểm trên OLD
đã khóa, không giữ SHARE trên own profile rồi upgrade. Managed-edit RPC giữ
authority/receipt/audit hiện có. First-owner context chỉ giữ exception đã khóa
trong [contract](roomqc-self-profile-edit-contract-2026-10-21.md).

Storage fixture: upload 200, public read 200, 68 bytes khớp, object đúng owner và
profile URL được lưu. Không phải external origin/TLS/Android proof. Hai self
updates đều 200, đúng row và final khớp một write đã commit; không hứa optimistic
versioning cho self metadata. Bốn races là staff × locked/deleted-session × hai
thứ tự; DB lock barriers thật, effects đúng, next request deny và recovery đạt.
Không suy thành mọi Auth state, role, offboarding hoặc endpoint khác.

**Còn mở:** EC05 must_change_password true→false acknowledgement được giữ để
không phá caller hiện hữu, chưa chứng minh Auth/password-change contract. Invitation
acceptance/legacy Edge, effective permissions/membership và full matrix vẫn mở.
Reviewer độc lập, full integrated regressions, fresh A/B cùng candidate và
browser/Android còn cần trước khi đóng lát tương ứng.

Artifact [đã lọc](../../../artifacts/roomqc-m06-self-profile-diagnostic-local-2026-10-21.json)
ghi exact ownership/source/schema/effects. Không có token/password/PII fixture.
Không deploy serving/VPS/DNS/provider, không đổi 122 releaseAcceptance hoặc gate.
