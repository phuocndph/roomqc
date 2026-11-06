# RoomQC — Email Auth caller: biên nhận, đúng phiên và vòng đời

Ngày22/10/2026, Asia/Bangkok. Đây là tiến độ EC05/T01/T03/T04/T08 trong toàn bộ
VPS + signup; không nghiệm thu toàn release hoặc thu hẹp mục tiêu thành password.

## 1. Kết quả kiểm chứng

[Artifact đã lọc](../../../artifacts/roomqc-m06-email-auth-caller-local-2026-10-22.json).
Nguồn cuối **725 files / 540 migrations**, trước/sau run không đổi:
`ffd28fd1f1de95c0f1cefd1f87db8acbf0d41c2c95a58b6de05ab26d4cb85f67`.
Run **887dff2b95b3**, handle95097 terminal **exit0/stderr0**; schema trước/sau khớp.
Dọn13 đối tượng exact-owned; kiểm độc lập còn0 container/network/volume đúng label.
Image Auth giữ đúng image717 đã pin/kiểm local; không nâng vendor hoặc thêm migration.

| Bộ kiểm chứng trên nguồn cuối | Kết quả | Giới hạn |
|---|---|---|
| Compiled production email coordinator + Auth/RPC thật | **6/6**: OTP, password/receipt/logout, unknown outcome, password-free reconcile, late OTP disposal, duplicate finish | Recovery only; không là invitation Edge hoặc browser proof |
| Bộ mật khẩu cũ |33/33 cùng identities/expected;7 fault checks/4 races;7 actual caller;7 config checks | Giữ scoped regression, không mọi quyền/workflow |
| Frontend liên quan | **169/169**,16 files, exit0 | Có component mocks/transport fixtures; không E2E browser/Android |
| Control/database | **210/210**,0fail/skip/cancel, exit0/stderr0 |11 structural password tests là subset, không cộng thành221 |
| TypeScript / targeted ESLint / syntax / diff check | exit0 | Không thay runtime proof hoặc supply-chain approval |

Run đầu **b0edfbd63fd2** cũng terminal exit0/stderr0,6/6 mới và các bộ cũ đạt,
cleaned13/leftovers0; source trước/sau cùng hash63cf37f8… . Sau đó chỉ sửa
khai báo kiểu OTP mock và bodyless204 trong test fixture. TypeScript trước sửa
báoTS2739; giữ lịch sử lỗi. Nguồn cuối được chạy lại diagnostic/frontend/control/
TypeScript; compiled password/email builds của hai run khớp. Hai diagnostic
không gọi là fresh full A/B hoặc hai backend đồng thời.

## 2. Đã sửa gì

- Thêm coordinator thuần có dependency injection, dùng chung password operation/
  native receipt; bỏ booleanpasswordUpdated làm căn cứ hoàn tất mật khẩu.
- Giữ isolated OTP client; snapshot endpoint/key/tenant/redirect tại lúc tạo.
  Mọi bước dùng đúng actor/native session và token khởi đầu; JWT decode chỉ
  correlation, quyền do native Auth/RPC kiểm. Không dùng user_metadata làm quyền.
- Thêm confirm() để đọc lại exact receipt trước retry nhận lời mời; lỗi acceptance
  không PUT password lần2. Unknown outcome giữ ID và chỉ readback, không retry mù.
- Invite/logout gọi endpoint bằng captured Authorization; response body có giới
  hạn, no-store/no redirect. Lỗi không hiển thị raw SQL/PII; logout401/timeout không
  được gọi là đã revoke tất cả refresh sessions.
- Single-flight và generation fencing; verification mới thất bại không giữ quyền
  cũ. Dispose chờ verifyOtp ghi xong isolated SDK session rồi cleanup, tránh OTP
  trả muộn để lại session sau unmount.
- Form thêm “Kiểm tra kết quả / tiếp tục lời mời” không cần mật khẩu. Kết quả
  previous nói rõ dùng mật khẩu lần trước; mode switch/unmount không nhận response cũ.
- Default full runner và diagnostic đều bundle coordinator thực, ghi source/
  compiled/harness hashes, so cùng build khi chạy reference. Không thay bằng mock
  để tuyên bố native proof.

Implementation chỉ ở integration. Primary nhận tài liệu/artifact đã lọc; không
commit/reset/merge, không thay serving/CRM/VPS/DNS/provider hay gửi email thật.

## 3. Sáu kiểm chứng Auth/PostgreSQL thật

| Scenario | Expected và actual |
|---|---|
| OTP recovery | Native verify tạo exact live session đúng actor trước mutation |
| Đặt mật khẩu + logoutglobal | Một PUT, exact actor/session receipt, hash đổi, old login400/new login200 và OTP session bị thu hồi |
| Adapter readback503 sau native commit | outcome_unknown, một PUT, giữ đúng operation ID; không lưu password/token |
| Kiểm tra không cần password | Exact native receipt trảcompletionprevious, không PUT lần2, pending ID được dọn |
| Dispose trong lúc OTP response bị giữ | identity_changed, session OTP thực được revoke, không PUT thêm |
| Hai finish cạnh nhau | flow_busy cho lần2, chỉ một native PUT và completion đúng |

Barriers dùng tín hiệu request/response thật trong harness; readback503 là lỗi
adapter có chủ đích, không là mất mạng trước headers. Native verify dùng OTP
fixture do admin generate_link, không gửi thư ra ngoài. Frontend runtime adapter
SDK có kiểm thử riêng; native harness injection không tự chứng minh mọi SDK race.

## 4. Còn mở, không được suy đã sửa

1. staff-invitations/create-user nhận lời mời qua service-role, response idempotent
   và live exact-session contract cần rà/kiểm thật. ResumeStaffInvitation và
   useMyStaffInvitation là caller riêng, chưa được đổi chỉ vì EmailAuthFlow đã đổi.
2. Full invitation/pre-profile/inviter mất quyền/membership/offboarding/recovery/
   resend/expiry/replay matrix; receipt sau nhận lời mời không là quyền duy trì mãi.
3. Khác thứ tự lock invitation/password là source concern; phải controlled
   concurrent baseline/observed barriers trước kết luận deadlock hoặc thêm migration.
4. OTP client cố ý không persist session/token. Same-page check/retry có proof;
   browser reload/two-tab/new OTP/native-session disposition còn phải thiết kế/
   kiểm đúng contract, không được hứa readback của phiên cũ bằng token phiên mới.
5. Actual loss-before-headers, browser/localStorage/Android và fresh default full
   frozen-source A/B/control/FE/advisors/final all-permission recovery/cleanup.
   Giữ hồi quy280scope/1.764actor/20races +employee30/4 +self66/4/Storage/parallel.
6. Registry/cross-builder/wrong-image Linux preflight, maintainer/SBOM/upstream
   Auth full suite, VPS/TLS/real inbox/offsite restore/on-call/load/RC/pilot/reviewer.

169 frontend tests và210 control tests không đóng122 releaseAcceptance/gate.
Không suy actual recovery proof thành mọi invitation path hoặc release-ready.

## 5. Bàn giao tiếp và toàn roadmap

Nhận server/caller contractstaff-invitations +ResumeStaffInvitation; định nghĩa
expected trước baseline cho pre-profile/offboarding/inviter/membership và lock/
network faults; sửa đúng boundary đã chứng minh rồi fresh full regression.
Sau đó EC10–EC15 permissions/membership →legacy Edge/fullworkflow/indirect/
policy/FK →issuer/trust/atomic timedhealth →alerts/admission/budgets →signup/
reconcile/abuse →consoles →Linux/DR/on-call →simultaneous A/B/browser/Android/
load/RC →pilot≥7ngày. Giữ đủ8đợt/27gói/25task/70case.

Phần cần khóa/quyền giữ deferred đúng bước, không tính pass. Gate L/S/P/U/B và
reviewer/signoff không đổi; không deploy serving để chứng minh local.

- [Plan và phiếu điều hành](roomqc-vps-signup-preparation-plan-2026-10-21.md)
- [Phiếu nhận việc](roomqc-vps-signup-launch-checklist-2026-10-21.md)
- [Protocol nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md)
- [Build/config trước đó](roomqc-m06-password-build-config-local-2026-10-22.md)
- [Supabase signout](https://supabase.com/docs/guides/auth/signout)
