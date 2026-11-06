# EC05 — password callers và native session readback: diagnostic local

Ngày22/10/2026, Asia/Bangkok. **Có implementation và scoped actual proof; EC05
vẫn mở**, chưa full integrated A/B hoặc release acceptance.
[Artifact](../../../artifacts/roomqc-m06-password-caller-local-2026-10-22.json).
[Native transaction ADR](../adr/roomqc-native-password-transaction-boundary.md).
[Plan nhận tiếp](roomqc-vps-signup-preparation-plan-2026-10-21.md#157-phiếu-ec05-hiện-hành--hoàn-tất-server-sau-policysdk-diagnostic).

## Đã thay đổi

- Shared engine src/lib/password-change.ts chụp actor/exact session/token/target;
  decodeJWT chỉ correlation, quyền do Auth và status RPC kiểm. PUT không dùng
  global SDK session có thể đổi trong lúc request.
- OperationUUID được persist trước PUT; durable record chỉ version/ID/time, key
  scope theo endpoint/actor/session. Không mật khẩu/token/hash. Mất kết quả phải
  readback, không blind retry. Receipt phải đúng actor/session/changeID/time/cờfalse;
  HTTP200/null/wrong receipt không success.
- Ordinary/profile/settings/mobile và AuthContext dùng engine. Forced page bỏ
  browser metadata/PATCH cờ/sleep300ms/early-success. Có nút kiểm tra không cần
  nhập mật khẩu; pending/error giữ input, identity switch không áp old result.
- Mobile profile sửa truyền sai argument và reset quá sớm; giờ await hai password.
- Forward migration540 thêm session_id và recovery context từ exact live native
  auth.mfa_amr_claims; theo pinned GoTrue IsRecovery gồm otp/magiclink/recovery.
  Không dùng query string/user_metadata để bỏ current-password requirement.
- Actual engine được esbuild compile và chạy vào Auth/REST thật trong owned runner;
  source/harness/compiled hashes gắn state, so với reference full candidate.

## Test thực đã terminal

| Bằng chứng | Kết quả / giới hạn |
|---|---|
| Run741ca907795f, handle70454 | Exit0/stderr0,540 migrations, cleaned11; exact leftover containers/networks/volumes0 |
|33 identities/expected gốc |33/33 giữ, actual installed SDK/Auth/REST |
| Native fault/race regression |7/7 checks và4/4 races đạt |
| Actual application engine |7/7: ordinary context, vendor current_password_invalid/no hash effect, onePUT/receipt/flag, adapter readback fault after real commit, new-instance reconcile/no secondPUT, recovery context và recoveryPUT |
| Frontend13files |128/128, gồm mobile password argument/pending/failure/readback; component mocks không là browser E2E |
| ControlDB handle30836 |207/207,0skip/cancel, exit0/stderr0; không thay Auth/E2E |
| TypeScript và targeted ESLint handle9461 |Exit0; không gọi đây là whole-repo lint |
| Structural backend |8/8; không tự là actual API proof |

Run source715files/540migrations:
`5a5cc6f6bea59b582e610e23bb2c089979d666dd8c155beefc71020619ceacef`,
trước và lần recompute đầu sau terminal khớp, schema trước/sau khớp.
Sau đó **chỉ thêm hai mobile component tests**, source hiện tại:
`92532b78067237e0a43aef404665aae21c36d2485bad7c1560b226a3c8854148`.
Không gán diagnostic hash cũ thành current-source full proof. Runtime/engine/migration
không đổi sau run; final full candidate vẫn phải freeze/rerun.

## Không được suy rộng

Adapter503 readback được inject sau Auth commit thật, **không là actual pre-header
network loss**. Mảng storage test trong Node không là browser localStorage/Android/
multi-tab race proof. Prior body-abort test sau headers vẫn giữ giới hạn riêng.
Raw pending IDs không có payload equality; existing completedID reuse là409,
không replay-success. Unknown outcome mà session mất cần login/recovery rõ ràng.

Image mới `sha256:3fdb1b60b42d3ebc9e1e4183c0f4ca36fa6911974a8711a4de72fb38b630b27b`;
extension sourceHash vẫn như705/706 nhưng imageID khác. Chưa rõ root cause;
phải resolve provenance và freeze exact reviewed immutable image cho full A/B,
không bỏ check equality. Không deploy vào serving/VPS.

## Nhận tiếp

1. Image freeze/reproducibility và actual policy/audit-disabled/missing-helper fault.
2. Invitation/pre-profile/offboarding/recovery và controlled lock-order matrix;
   email-auth.ts còn SDK-only finish, chưa được sửa/chứng minh bởi các page ở đây.
3. Fresh full frozen-source A/B/control/FE/advisors/final recovery/cleanup. Giữ
   280scope/1.764actor/20races +employee30/4 +self66/4/Storage/parallel.
4. EC10–EC15 permission/membership →invitation/legacy Edge →17-target/policy/FK
   →issuer/trust/timed health →alerts/admission/signup/console →Linux/DR/E2E/load/pilot.

Reviewer pending;27packages/25tasks/70cases và122releaseAcceptance/gates chưa đổi.
Không khách hàng/CRM/VPS/DNS/provider hoặc email thật bị thay trong lượt này.
