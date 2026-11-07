# M06 — quản lý lời mời: quyền hiện thời và giao dịch server

22/10/2026, Asia/Bangkok. T01/T03/T04/T08, caller EC06/EC07/EC08; không tạo task/
case mới. **Scoped local proof**, không đóng full invitation, EC05/R4/T08 hoặc
release. [Artifact đã lọc](../../../artifacts/roomqc-m06-staff-invitation-management-local-2026-10-22.json)
giữ toàn bộ labels/expected/actual và failure history.

## 1. Kết quả trên source hiện hành

Candidate741 files/542 migrations, trước/sau SHA256:
`d13c8cb6b6c9665f68c3e979627c38f8de70968fbb16ad892cee4276279ba28f`.
Manifest scope kế thừa [caller738](roomqc-m06-staff-invitation-caller-local-2026-10-22.md)
và thêm migration quản lý, shared module, unit test; không là tổng file repo.

Run `83ed9d410088`, terminal exit0/stderr0,542 migrations replayed:
**31/31 management checks +22/22 server acceptance +7/7 compiled caller**.
Source trước/sau không đổi; schema trước/sau/sau advisors:
`e554183cb9c347397e2cde2e78ef9b797a755af0f8c671ec93e59c49b70fd150`.

Frontend focused277/277,22 files; full control/database216/216,0 fail/skip/cancel,
126029ms.6 structural là subset control, không cộng thêm. TypeScript/targeted
ESLint3 files đạt,0 warnings; tracked diff whitespace check đạt.
Expected synthetic UserFormDialog save-refusal stderr vẫn là test đạt.

## 2. Thay đổi thực hiện

Migration542 tạo private.staff_invitation_manage và thin public INVOKER adapter,
chỉ service_role được gọi với actor/exact session đã Auth xác minh tại Edge.
Giao dịch kiểm live Auth/profile/session/role/tenant/hotel/position/capability
và report context, khóa rows theo thứ tự; không dựa user_metadata/JWT role cũ.

Create và revoke commit cùng audit. Create replay trả cùng invitation không
thêm audit/profile/quyền. Reserve dùng server timestamp và row lock; finish/
release phải khớp exact reserved timestamp. Một phút cooldown không phải receipt
mail delivered. Recipient chỉ gắn đúng Auth identity/email, không đổi mật khẩu,
không tạo membership hoặc lấy UUID tùy ý của tài khoản đã provision.

Shared module tách dependency để kiểm safe errors/receipt binding/thứ tự
create→reserve→send→finish. Chỉ public actions list/create/resend/revoke được
chọn qua Edge; finish/release là server-only nội bộ. Không direct UPDATE từ Edge.

Config/provider disabled bị từ chối trước Auth dispatch và có thể release đúng
reservation. Transport/SDK error hoặc mất reply sau send giữ reservation/kết quả
chưa rõ, không release và gửi lại tự động. Post-send finish sai receipt không
báo success. Đây là cooldown + conservative uncertainty, **chưa là durable
end-to-end send command receipt hoặc chứng minh exactly-once external mail**.

Revoke vẫn dùng current authority nhưng không đòi position còn active/report
còn đủ điều kiện cấp quyền: operator hợp lệ vẫn thu hồi được lời mời cũ.
Inactive position không được reserve/send mới.

Retire EXECUTE service_role của legacy prepare_staff_invitation; helper còn là
private transaction dependency. Revoke browser SELECT invitation table; actual
REST/column grants check xác nhận authenticated không đọc trực tiếp. List qua
verified-session RPC trả DTO giới hạn100, không trả Auth identity/secret.
Không thêm policy rộng để né quyền.

## 3. Bằng chứng thực31 và giới hạn

| Nhóm | Đã chạy thực | Chưa được suy ra |
|---|---|---|
| Create/replay | Service RPC qua REST, một pending/audit, không profile; replay không effect | Chưa actual create-user alias hoặc successful Auth send |
| List/revoke | Actual compiled Edge, versioned actor/session receipt; revoke một audit, replay read-only; inactive position vẫn revoke | Chưa browser interaction/captured-context UI |
| Send reservation | Hai reserve chỉ một thắng; actual Edge cooldown429; exact release/finish, wrong recipient/stale timestamp no-effects | Chưa actual successful resend hoặc network-loss delivery |
| Authority | Manager→staff/department, department→own staff positives; peer manager/other department/staff/wrong tenant negatives | Chưa full role×target×state, every permission/path |
| Live changes | Capability/role removed, account locked, expired session deny/no effects; list hides lost capability, logout và new-session recovery | Chưa every offboard/revoke/banned/deleted/report/position combination |
| Boundaries | User direct RPC denied, retired prepare denied, direct table/column SELECT denied | Chưa full19-target indirect audit |
| Provider disabled | Actual Edge create503, reservation released, native password unchanged, no membership/profile | Provider off không là mail delivery success |
| Retained22+7 | Native OTP/password prerequisite, mine/status/accept/replay/no-regrant và production caller post-commit adapter recovery đạt | Không thay default full backend A/B, observed cross-operation locks hoặc browser/Android |

31 label checks đầy đủ trong artifact. Role/authority failures kiểm DB snapshots
không đổi, không tính500/setup failure là403 pass. SQL snapshots chỉ là observer,
không thay actual authorization call.

39 pure management tests kiểm malformed input/receipt/identity, safe errors,
disallowed internal actions, exact send orchestration, disabled/config failure
và transport/finish uncertainty; mock tests không được relabel thành actual send.

## 4. Failure history và recovery

- Run8b2a3eaa324c, initial741 hash592a7137…: tạo atomic đạt, snapshot query lỗi
  42702 vì role mơ hồ sau JOIN. Qualify r.user_id/r.role; giữ assertions.
- Run933045a1c015, hash3036fd65…:11 management đạt, fixture position department
  dùng reception không nằm trong constraint,23514. Đổi fixture sang maintenance
  có sẵn; không nới schema hoặc tiêu chí quyền.
- Runce9bb3f60b78, hash6ae6eb84…:29 management +22+7 đạt; schema1d77591b…,
  advisors653, cleanup13. Đây là intermediate proof, không gán cho final source.
- Final83ed9d410088 bổ sung conservative delivery errors, same-order hints và
  inactive-position revoke checks,31+22+7 đạt.

Cả4 runs cleanup13 owned objects/run; kiểm độc lập exact labels đều
container0/network0/volume0. Không xóa dữ liệu serving/CRM; private ownership/
env/provider credentials không đưa vào public report.

## 5. Advisors và triển khai tương thích

CLI2.121.0 thực chạy: **653=19 no-policy INFO +8 FK INFO +491 unused-index INFO
+135 permissive WARN**,0 ERROR.491 thay494 ở738 do workload/statistics, không
index fix. R4/T08 và current19-target disposition/policy/FK còn mở.

Migration được tạo bằng native CLI migration new, chỉ replay trên disposable
sandbox. Chưa áp trên app đang phục vụ/VPS. Khi staging cần matched migration+
Edge release, giữ chức năng mời ở maintenance trong cửa sổ rollout; old Edge
sau migration sẽ fail-closed do legacy prepare/table read bị retire. Preflight
kiểm new RPC, grants/schema/build và config trước bật lại. Không rollback bằng
down-migration hoặc cấp lại rộng để old client chạy; rollback binary tương thích
hoặc giữ invite disabled và đối soát. Đây là yêu cầuT18/T24, chưa Linux rollout proof.

Lệnh thực chạy: owned backend wrapper diagnostic staff-invitation +advisors CLI;
node scripts/test-control-directory.mjs; Vitest22 files trong artifact;
npx tsc --noEmit -p tsconfig.app.json; ESLint3 files; structural6 checks.
Monitoring drill của control thuộc Docker Desktop VM; five-service/admission flags
trong drill đó false, không suy timed health pipeline hoặc Linux đã nghiệm thu.

## 6. Nhận tiếp đúng toàn bộ plan

1. Actual successful create-user alias/create/resend bằng isolated mail sink,
   same Auth identity, không Internet/provider thật; kiểm body/receipt/audit/
   duplicate send/revoked recipient và unknown outcome.
2. Full inviter-role/capability/hotel membership/report/position/offboarding,
   recipient mismatch và hierarchy matrix; positive→negative/no-effects→recovery.
3. Observed barriers hai thứ tự accept/password/revoke, không kết luận deadlock
   từ source graph; bounded terminal/final recovery.
4. Management client/PendingInvitations scoped cache, abort/stale-response/
   single-flight/readback và browser/Android/network E2E.
5. Fresh default full frozen-source A/B/FE/control/advisors/recovery/cleanup/
   reviewer; hai lần tuần tự không thayT21 hai cụm đồng thời.
6. EC10–EC15/workflow/19-target/policy/FK →issuer/trust/timed health →alerts/
   admission/budgets →signup/reconcile →console →Linux/DR/on-call →E2E/load/RC/
   pilot ≥7 ngày. Không dừng ở lời mời.

Kiểm tĩnh gói bàn giao:21 tài liệu,370 local links và80 anchors hợp lệ;
mapping hai chiều27 gói/25 việc/70 case và dependency DAG hợp lệ. Source741/542
khớp manifest; ledger protected hash giữ nguyên,122 releaseAcceptance unverified.
Secret scan chỉ áp cho tập plan và evidence đã lọc, không là audit toàn repo.
Đây là kiểm tính nhất quán tài liệu, không thêm product test hoặc chữ ký nghiệm thu.

8 đợt/27 packages/25 tasks/70 cases và122 unverified releaseAcceptance/gates
L/S/P/U/B giữ nguyên. Reviewer/signoff vẫn null. Implementation chỉ integration;
primary nhận sanitized docs/artifacts. Không deploy serving/VPS/DNS/provider,
gửi mail thật, mở public signup/billing hoặc tuyên bố capacity từ slice này.
