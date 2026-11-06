# RoomQC — self-profile/avatar: bản sửa tích hợp local A/B

Ngày 21/10/2026. Lát 15.2.4 thuộc T01/T03/T04/T08; scoped local verified,
**chờ reviewer độc lập, không phải nghiệm thu toàn bộ VPS + signup**.
[Artifact đã lọc](../../../artifacts/roomqc-m06-self-profile-fix-local-2026-10-21.json).

## Kết luận và đối chứng

Candidate **694 files / 538 migrations** đã qua default full runner trên hai
backend dựng lại độc lập: **A a04e60eefc89 / B 9ff0e50deda8**, đều exit 0,
stderr 0 bytes, cleaned **18 objects/run**. B tham chiếu đúng A thành công/cleaned;
không dùng diagnostic hoặc failed attempt làm reference. Source trước A, sau A/
trước B và sau terminal B khớp. Hai rebuild tuần tự, không thay simultaneous A/B T21.

[Baseline](roomqc-m06-self-profile-baseline-local-2026-10-21.md) có 58 observations,
18 failures được giữ bất biến. Cả A/B đều giữ 58 identity/expected, **18 lỗi cũ
đã đạt, 40 kết quả đúng giữ nguyên**; thêm 8 next-request/recovery observations
cho 4 races. Mẫu số self-profile 66 được đối chiếu độc lập: không thiếu/thừa/trùng.
Giữ [diagnostic](roomqc-m06-self-profile-diagnostic-local-2026-10-21.md) đúng scope
và [full attempt thất bại](roomqc-m06-self-profile-full-attempt-local-2026-10-21.md)
bất biến; không sửa lịch sử để báo mọi lần chạy đều xanh.

## Implementation và phạm vi đã chứng minh

Implementation chỉ ở integration worktree. Forward migration
20261021153825_self_profile_live_update_boundary.sql thêm hai private trigger
functions: kiểm Auth/session sống trước UPDATE và kiểm OLD profile sống cùng
self column boundary. Không đổi RLS/grants/constraint hiện có; không SHARE-lock
own profile trước UPDATE để tránh lock upgrade giữa hai self edits.
[Contract](roomqc-self-profile-edit-contract-2026-10-21.md) giữ exception
first-owner registration theo transaction-local context đã khóa.

**Ngoại lệ còn mở:** must_change_password true→false được giữ để tương thích
caller. Bộ này **không** chứng minh Auth/password/current-password/forced-change
acknowledgement an toàn. EC05 phải có contract và actual Auth baseline riêng;
không gọi toàn bộ authority/column/password contract đã đóng.

| Nhóm | Kết quả mỗi run | Giới hạn |
|---|---|---|
| Self metadata | 66/66: owner/manager/staff, optional clearing, no-row, locked/inactive/deleted-session, protected fields và recovery | Chỉ các actor/state/column của harness, không full caller matrix |
| Self races | 4/4: staff × locked/deleted-session × revoke-first/mutation-first; DB barriers, effects, next-deny và recovery | Không mọi role/revoke state hoặc hủy in-flight GET |
| Avatar | Actual Storage upload 200, public read 200, 68 bytes khớp, object owned và profileSaved | Local bucket/origin, không external TLS/Android |
| Hai self writes | 200/200, exact row, final là một write đã commit, không deadlock ở đối chứng này | Serialized last-committed-write, không optimistic versioning |
| Hotel scope | 280/280, identity/expected/pass giữ từ source trước | Năm bảng và scoped matrix đã ghi |
| Account/session | 1.764/1.764, identity/expected/pass giữ từ source trước | Không full capability/workflow/other-table authority |
| Races cũ | 20/20 và recovery | Owner POST/năm bảng/lock hoặc session-delete/hai thứ tự |
| Employee atomic | 30 checks/4 races giữ đạt | Không full role/department/offboarding/durable remount retry |
| Final recovery | 13 checks và schema freeze đạt sau gỡ test barriers | Không timed health/admission end-to-end |

Frontend dùng helper bounded metadata, UPDATE.select.single và xác minh đúng
row/value trước success. Zero/malformed/wrong row không success giả; giữ empty
phone/avatar để xóa. Upload có UUID/MIME-derived extension, không upsert; chỉ
đổi form/toast sau saved row. Response ambiguous không xóa object có thể đã được
tham chiếu; **orphan retention/reference reconciliation chưa triển khai**.
Shared form hydrate late data, giữ dirty cùng user, reset khi đổi user; mobile
ngăn save/upload cạnh tranh và có hidden registered avatar field. Lỗi hiển thị
an toàn, không đưa raw DB message cho người dùng.

## Hồi quy, schema và repeatability

Control DB **199/199**, fail/skip/cancel/todo 0, exit 0. Frontend hồi quy
**79/79 trong 8 file**, gồm subset self-profile 28; pre-fix subset 8 có 7 fail/1 pass.
TypeScript, ESLint touched FE và diff-check touched implementation đều exit 0.
Đây là test local/component, **không** browser hoặc Android E2E.

Source SHA256:
e219c67119bc65f6afae35390f051d898fa28d708c361be8a92c415fbd3d9201.
Schema SHA256:
3c0dae2148ef03aa9fc02d1518eac79d3607d2d8d6ab1aa8b818e277ef6d4c96.
Manifest có recipe/base + added paths trong artifact, không là whole-release manifest.
Branch codex/roomqc-parallel-integration, HEAD
5cb583729ce055db64df8b192f10476db1fa99b8; giữ dirty tree, không commit/reset/merge.

Schema/migration/pre-init/partition, image digests, harness và compiled
Functions/email/lifecycle/provider builds khớp A/B. Raw Compose hash khác nhau
do identity/path riêng mỗi run; không coi nó là source/harness hash.
Full vendor vẫn self-hosted/v0.8.3, commit
bc27d2661edd09a5d0b8d76ce33da6d4071a756e. Controlled partition-maintenance đạt,
scheduled partition soak chưa đạt/chưa được chứng minh.

Advisors **606**: 18 no-policy (17 legacy + private employee receipt), 8 FK,
445 unused index, 135 permissive-policy warnings. Không drop index hoặc coi direct
deny là transitive authority đã an toàn. Indirect/policy/FK dispositions còn mở.

Full attempt trước thất bại vì fixture tự PATCH users.hotel_id bằng owner token.
UI chọn khách sạn qua user_preferences.current_hotel_id, không phải self assignment.
Harness nay assert self hotel PATCH denied/no effects trước, rồi exact-owned
installer chuyển fixture và kiểm DB. Đây **không** là positive quyền chuyển
primary hotel của user. Các receipt/DELETE/rollback/race assertions giữ nguyên.

## Caller delta và nhận việc tiếp

[Inventory 16 caller ban đầu](roomqc-m06-employee-caller-inventory-local-2026-10-21.md)
giữ nguyên như lịch sử. Artifact mới ghi đủ 19 source-file hashes hiện tại,
**3 file cũ đổi** (useProfile/ProfileForm/MobileUserProfilePage), 16 file giữ.
Các helper/tests/migration mới nằm trong manifest candidate; không sửa fingerprint
inventory cũ để làm validator cũ xanh.

EC03/EC04 nay có scoped actual API/Storage + client/component proof. EC05 vẫn mở;
tiếp theo EC10–EC15 effective permissions/atomic memberships, EC06–EC08/EC16
invitation/legacy Edge controlled bundle và EC01/EC09/full workflow. Không thấy
frontend reference không chứng minh endpoint không thể gọi. Runner chưa bundle
invitation/update-user để ký các endpoint đó.

Thứ tự cụ thể và điểm dừng nằm trong [15.2.4 của plan](roomqc-vps-signup-preparation-plan-2026-10-21.md#1524-phiếu-kế-tiếp--caller-capability-và-luồng-nghiệp-vụ).
Sau caller vẫn 17 legacy + receipt/policy/FK → issuer/trust/timed health →
alerts/admission/budgets → signup/resume/reconcile/abuse/email → hai consoles →
Linux/TLS/offsite restore/on-call → simultaneous A/B/browser/Android/load/RC →
pilot ≥7 ngày. Không thu nhỏ roadmap về hồ sơ nhân viên.

## An toàn và trạng thái nghiệm thu

Container/network/volume theo exact label cả A/B đều 0 sau cleanup. Chỉ disposable
synthetic environment; không deploy serving/CRM/VPS, không DNS/provider/email thật.
Đây là phạm vi lệnh đã thực hiện, không phải audit toàn bộ business data của runtime.
Primary chỉ nhận docs/artifacts đã lọc; raw .local/env/ownership không publish.

Giữ **8 đợt / 27 packages / 25 tasks / 70 acceptance cases** và **122
releaseAcceptance unverified**. Gate L/S/P/U/B không đổi; owner/reviewer/signoff
chưa có tên. Scoped local proof không thay Linux, external inbox, clean-host
restore, browser/Android, tải, pilot hoặc phê duyệt mở đăng ký công khai.
