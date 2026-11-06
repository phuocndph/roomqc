# M06 — lời mời nhân viên: caller và bằng chứng local

Ngày 22/10/2026, Asia/Bangkok. Phạm vi: T01/T03/T04/T08 trong kế hoạch toàn bộ
VPS + signup; không thêm task hoặc release case. Đây là scoped diagnostic,
**không** phải nghiệm thu toàn bộ lời mời, full integrated A/B hoặc production.

- [Artifact đã lọc](../../../artifacts/roomqc-m06-staff-invitation-caller-local-2026-10-22.json)
- [Bản bàn giao toàn bộ](roomqc-vps-signup-delivery-brief-2026-10-22.md)
- [Phiếu nhận tiếp](roomqc-vps-signup-preparation-plan-2026-10-21.md#162-phiếu-nhận-việc-ngay-từ-checkpoint-717540)
- [Triage advisors](roomqc-m06-advisor-triage-2026-10-19.md)

## 1. Kết quả và identity

Candidate738 files/541 migrations, SHA256 trước/sau:
`01ab0ed5abba1aaa1989699ab1a689a3a0bffc84caa81d1c485489b877cab3d9`.
Đây là manifest các đường source liên quan, không phải tổng mọi file trong repo.
Manifest kế thừa732 và thêm6 paths; recipe/path list truy nguyên trong artifact.
Không dùng proof730 hoặc caller725 làm current-source proof.

Run `c2de47239a7d`, phase `staff_invitation_diagnostic_verified`,
terminal exit0, stderr0;541 migrations replayed. Actual native Auth, compiled
Edge và RPC chạy trong sandbox dùng riêng; provider bị tắt, không gửi mail thật.
Native Auth image:
`sha256:5501a98d4819812bca0acdf2a28677bf5779ae4e34ab2e11f021320b8e5da7c8`.

Schema trước/sau và sau advisors cùng:
`65f47b96b4c781944ce1b2c6e0a630dd25c1ace96657e669d1a476159b30640a`.

22/22 server checks gốc và7/7 compiled production caller checks đạt. Frontend
focused238/238 trong21 files; full control/database214/214,0 fail/skip/cancel.
TypeScript và targeted ESLint đạt;4 structural checks là subset của full
control, không cộng thêm thành218. Diagnostic không chạy toàn bộ suite backend
mặc định, không thay reference full A/B.

## 2. Thay đổi đã ghép, không giao lại như chưa làm

- staff-invitation core kiểm receipt version/UUID/actor/native session/
  invitation/tenant/hotel/status/timestamp đầy đủ, không nhận boolean success.
  Target được chụp trước await; bearer chỉ dùng trong operation, không persist.
- Runtime adapter chặn thay endpoint/key/cluster/workspace/tenant/routingVersion.
  Query key theo actor/session/runtime scope, không chứa token/API key.
- useMyStaffInvitation sử dụng production client, query abort và current-context
  fencing; disabled query không làm lộ retained data theo scope cũ.
- ResumeStaffInvitation đọc status trước accept, kể cả remount/kết quả chưa rõ;
  một accept đang xử lý, không nhập/PUT lại mật khẩu. Expired/revoked không có
  link đặt mật khẩu/accept. Refetch profile và đối chiếu id/tenant/hotel trước
  xóa cache/chuyển trang; chưa là bằng chứng đã kiểm đủ role list.
- EmailAuthFlow lấy exact mine sau OTP/native recovery và trước password write;
  acceptance dùng invitation đã chụp. Khi chưa rõ kết quả đọc status, accepted
  không accept lần2; unknown/revoked không ghi mù. Giữ native password receipt,
  logout và stale context fencing.
- Harness biên dịch core và production EmailAuthCoordinator, lưu source/compiled
  hashes. Giữ22 expected checks gốc; full reference phải khớp caller build.
  Advisors thực chạy khi được chỉ định CLI, rồi kiểm schema không thay đổi.

Không có migration mới ở lát caller này; migration541 là server contract đã có.
Implementation chỉ ở integration worktree; primary chỉ nhận docs/artifacts đã lọc.

## 3. Bằng chứng server22 và caller7

Server controls: pre-profile mine; native password prerequisite (admin reset
không thay native receipt); OTP setup; pending/accepted status; expired/revoked/
wrong workspace/inactive hoặc banned inviter; expired/signed-out session;
resume phiên mới; hai accepts chỉ một profile/role/membership/audit; không
regrant role/membership đã xóa; profile locked; restored replay; retired RPC/
service adapter deny; malformed và oversized body. Expected/actual/effects
từng label giữ nguyên trong artifact.

| Caller thực đã biên dịch | Expected/actual đạt |
|---|---|
| compiled-client-pre-profile-mine | Đúng invitation, profile vẫn chưa tồn tại |
| compiled-client-new-session-resume | Phiên mới nhận pending đúng target |
| compiled-client-old-session-no-dispatch | identity_changed,0 dispatch |
| compiled-client-accepted-replay | Idempotent, DB effects không đổi |
| compiled-client-accepted-status | accepted, read-only |
| actual-email-invitation-loss-after-commit | Adapter bỏ reply sau commit thật;1 password PUT/1 accept,1 profile/1 audit, không pending secret |
| actual-email-invitation-status-recovery | Đọc status hoàn tất kết quả trước; vẫn1 PUT/1 accept, DB snapshot không đổi, session revoked |

Hai dòng cuối dùng synthetic employee thứ hai và actual OTP/Auth/Edge/RPC.
Transport fixed-origin nội bộ và memory storage; không chứng minh gateway thật,
durable browser storage hoặc lỗi mạng trước headers. Abort/response-loss ở
adapter chỉ được gọi đúng là adapter post-commit response loss.

## 4. Kiểm thử và failure history

Lệnh chính: `node scripts/test-control-backend-sandbox.mjs --run --diagnostic staff-invitation --advisors-cli <native-cli>`.
Chỉ chạy bằng exact-owned sandbox wrapper; không sao chép vào DB đang phục vụ.
Full control: `node scripts/test-control-directory.mjs`.
Focused UI: Vitest trên21 files đã liệt kê trong artifact.
TypeScript: `npx tsc --noEmit -p tsconfig.app.json`; ESLint targeted13 files.
Structural: `node --test server/control/backend-staff-invitation.test.mjs`.

Lần đầu108 tests/8 files:104 đạt,4 fail, exit1 (03:20:26 local).
Fixture component dùng gcTime0 khiến invitation query không có observer bị xóa
trước assertions giữ cache. Sửa fixture gcTimeInfinity theo active parent
observer; **không bỏ/nới assertions**. Sau sửa108/108, rồi expanded238/238 đạt
(bắt đầu03:25:19). Không gọi lỗi fixture này là defect runtime đã tái hiện.
Expected synthetic “Owned save refusal” stderr ở UserFormDialog không làm fail.
Giữ lịch sử này, không chỉ ghi lần xanh cuối.

Full control214/214, duration127696ms; monitoring fixture thuộc Docker Desktop
VM, fiveServiceProbesVerified=false/admissionOpened=false ở drill đó. Không
suy từ control pass thành Linux host/five-service pipeline/admission đã đạt.

## 5. Advisors và cleanup

Native CLI2.121.0 thực chạy: **656 =19 no-policy INFO +8 FK INFO +
494 unused-index INFO +135 permissive-policy WARN**,0 ERROR. Exit0 không phải
“không còn finding”. Không drop index vì thống kê fresh sandbox.

19 targets gồm17 legacy +private.employee_profile_edit_receipts +
private.password_change_receipts. Cần supplemental direct/effective grants,
exposure và caller/view/definer/trigger/FK disposition cho schema hiện hành;
không lấy audit17 cũ làm chứng cứ19 đều safe. R4/T08 vẫn mở.

Diagnostic cleanup ghi13 owned objects; kiểm độc lập exact run labels sau run:
containers0/networks0/volumes0. Không xóa dữ liệu serving/CRM. Schema không đổi
sau advisors, không dùng cleanup để che failure hoặc tạo trạng thái đạt giả.

## 6. Phần nhận tiếp và ranh giới nghiệm thu

1. Khóa expected trước run cho create-user/create/resend/revoke, full inviter
   role/capability/hotel membership, recipient offboarding và accepted replay.
2. Actual Auth/Edge/RPC positives, deny/no-side-effects, recovery từng identity;
   expired/revoked/role removed không regrant. Provider thật là mục riêng.
3. Accept-vs-password/revoke với observed lock barriers ở cả hai thứ tự; source
   lock graph chỉ là concern đến khi có reproduction, không khẳng định deadlock.
4. Browser reload/two-tab/remount, actual pre-header network loss, Android
   deep-link/back/logout/revoke; DTO/query/mock tests không thay E2E.
5. Fresh default full backend A/B trên frozen source cùng exact image/schema/
   contract/caller build, full FE/control/advisors/final recovery/cleanup/reviewer.
   A/B tuần tự không thay simultaneous clusters T21.
6. Tiếp EC10–EC15/workflows,19-target disposition/policy/FK, issuer/trust và
   timed health rồi đủ8 đợt toàn bộ VPS/signup; không dừng ở invitation.

122 releaseAcceptance vẫn unverified; gates L/S/P/U/B và named owner/reviewer/
signoff không thay đổi. Không deploy phục vụ/VPS/DNS/provider, gửi email thật,
mở public signup/billing hoặc xác nhận sức chứa từ lát proof này.

## 7. Bàn giao plan và kiểm tra tài liệu

Phạm vi/đầu ra theo xác nhận: toàn bộ VPS + signup, Plan + nghiệm thu.
8 đợt/27 packages/25 tasks/70 cases giữ nguyên;122 releaseAcceptance vẫn
unverified. Bộ plan có input/dependency/owner-role/reviewer-role/deliverable/
case/môi trường, acceptance thresholds và stop/rollback; tên người nhận/chữ ký
chưa có thì giữ null, không xem agent/worktree là reviewer độc lập.

Static validation:20 documents,370 local links,80 anchors hợp lệ; mapping hai
chiều và dependency acyclic. Protected ledger hash không đổi. Đây là nghiệm thu
tính nhất quán tài liệu, không chuyển thành70 product cases pass. Chỉ mirror
docs/artifacts đã lọc vào primary, không implementation hoặc private evidence.

Đã đọc changelog/self-hosting/session docs hiện hành: self-hosted không phải CLI
local production; RoomQC chịu backup/DR/monitoring. Managed HTTP TLS sunset
không tự áp cho reverse proxy self-hosted; inventory TLS/browser/Android thật.
Postgres upgrade cần inventory extension/index/crypto/operator và upgrade/restore
proof theo pinned version. Không nâng vendor hoặc áp các truy vấn/sửa index
chỉ vì thông báo latest.


