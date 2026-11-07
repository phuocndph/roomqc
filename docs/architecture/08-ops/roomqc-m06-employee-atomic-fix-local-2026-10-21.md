# RoomQC — sửa hồ sơ nhân viên: tích hợp local A/B

Ngày 21/10/2026. T01/T03/T04/T08; scoped local verified, chờ reviewer độc lập.
[Artifact đã lọc](../../../artifacts/roomqc-m06-employee-atomic-fix-local-2026-10-21.json).

## Kết luận

Candidate scoped **682 files/537 migrations** đã qua full runner trên hai backend
dựng lại độc lập: **A 5b6633559ee1 / B dea1abeb5dfb**, đều **exit 0**, cleaned
**18 objects/run**. Không dùng diagnostic làm A reference. B tham chiếu đúng A
terminal thành công/cleaned; source trước A, sau A và sau terminal B không đổi.

Mỗi run giữ **280/280 hotel-scope**, **1.764/1.764 account/session**, **20/20 scoped
races**, đồng thời đạt **30/30 employee checks và 4/4 employee races**. Final
permission recovery 13 checks và schema freeze cuối đạt. Full control DB chạy
lại **194/194, 0 fail/skip/cancel**, exit 0; focused backend 19 là subset của control.
Frontend 51/51, TypeScript, ESLint touched frontend và diff-check đều exit 0.

Đây không phải full employee permission matrix, browser/Android E2E, môi trường
VPS/Linux, kiểm tải hoặc giấy phép mở signup. Hai rebuild **tuần tự**, không thay
T21 hai backend chạy đồng thời. Reviewer và các gate vẫn pending.

## Bản sửa và lịch sử lỗi

Giữ bất biến [baseline partial commit](roomqc-m06-employee-workflow-baseline-local-2026-10-21.md)
và [hai failed attempts](roomqc-m06-employee-atomic-attempt-local-2026-10-21.md).
Atomic RPC gộp metadata/membership/audit/receipt; caller không ghi role thừa.
Failed positive 400/23514 đã được [diagnostic](roomqc-m06-employee-audit-fix-diagnostic-local-2026-10-21.md)
xác nhận là action `updated` sai constraint activity_logs_action_check. Forward
migration 20261021143251 chỉ sửa thành `update`, không bỏ constraint hoặc nới quyền.

Migration metadata 20261021133739 và audit fix ở integration; không sửa historical
migration. Desktop/mobile self-edit về workspace-scoped /profile; owner/platform/
unsupported target có giải thích thay vì mở form employee không dùng được. Chỉ
navigation/component proof, không tự chứng minh actual self-profile API đã đúng.
Lượt A/B này không sửa implementation hoặc serving runtime.

## Phạm vi được chứng minh

| Nhóm | Kết quả mỗi run | Giới hạn cần giữ |
|---|---|---|
| Hotel scope | 280 pass; giữ toàn identity/expected/pass của source trước, baseline 180/47 positives | Năm bảng, chưa task/capability/null-shared full matrix |
| Account/session | 1.764 pass; 588 negative + 1.176 before/restored positive, completeness không thiếu/thừa/trùng | Known direct actions; wrong/missing claims ký bằng sandbox issuer, không gọi GoTrue nguyên bản |
| Races cũ | 20 pass, actual barriers và next-deny/recovery | Owner POST/năm bảng/lock hoặc session-delete/hai thứ tự |
| Employee positive | Owner/manager sửa staff: metadata lưu, authority không đổi, audit+1/receipt+1, action update | Đúng fixture theo contract, không mọi role/column/department |
| Employee negative | Capability, tenant read-only/suspended, wrong scope/staff, invalid/stale/conflict không effect trái contract | Không dùng constraint lỗi/5xx/timeout làm permission-deny pass |
| Replay/fault | Exact replay không nhân effect; payload đổi conflict; audit fault rollback profile/membership/receipt | Retry close/remount/tab mới chưa proven |
| Concurrent edit/revoke | Hai edit cùng version một commit/một conflict; 4 lock/session races có barriers, next-deny/recovery | Không hứa hủy in-flight GET hoặc bao phủ mọi endpoint |
| Membership transfer | Primary hotel chuyển/hoàn nguyên, giữ flags và assignment ngoài primary | Không là toàn luồng gán quyền/offboarding |

Receipt/hotel-delete, lifecycle service, email-admin/provider, registration/
access, no-policy direct controls và parent FK boundary đều verified ở scope
harness sẵn có. Không suy các suite này thành invitation/update-user Edge proof:
các entry đó chưa bundle ở runner. 11 service-probe rounds/fault recovery không
thay timed collector → persisted health → admission proof.

## Candidate và repeatability

Source SHA256: `5e5f10c331760a3cd4886deb52b4dcdfad22cb6cac9914d361a5d182a9b19d93`.
Schema SHA256: `9663cd8e082e5cc87484e2c2294caf52f4c80d67bc88a2685cd4ba2766be3309`.
Manifest có path list/recipe trong artifact, **không** là whole-release manifest.
Branch codex/roomqc-parallel-integration, HEAD 5cb583729ce055db64df8b192f10476db1fa99b8;
dirty tree được giữ. Full vendor pin self-hosted/v0.8.3/commit bc27d2661edd09a5d0b8d76ce33da6d4071a756e.

Đối chiếu ngoài runner: schema/migration/pre-init/partition, harnesses, image
digests, compiled functions/email/lifecycle/provider builds khớp A/B. Scope/actor
identities+expected+pass khớp cả A/B và successful source cũ; employee checks/races
khớp nhau. Raw Compose hash chứa per-run identity/path không yêu cầu bằng nhau.
Final schema freeze chạy sau permission recovery; không còn fault-trigger drift.

Advisors **606**: 18 no-policy (17 legacy + private employee receipt), 8 FK,
445 unused index, 135 permissive-policy warnings. Direct denial không chứng minh
mọi indirect path safe; receipt mới cần disposition riêng. Không tự drop index
hoặc tắt RLS vì advisors count. Chưa hoàn tất 135 allowed-row/8-FK workload review.

## Cleanup và bước nhận tiếp

Theo mỗi exact run label, container/network/volume đều rỗng sau terminal. Serving
names/images/ports trước/sau không đổi; đây không phải snapshot business-data audit.
Không deploy 8082/8091/CRM/VPS, không đổi DNS, không email/provider thật. Credential
tổng hợp chỉ trong private .local, không copy env/raw ownership/log vào tài liệu.

Nhận [inventory 16 caller ban đầu](roomqc-m06-employee-caller-inventory-local-2026-10-21.md)
trong phiếu 15.2.4: actual self-profile/mobile avatar → permission/membership
replacement → invitation/legacy Edge reachability và controlled baseline. Không
tự đổi inherited permission semantics hoặc mở rộng employee metadata contract.
Full department/offboarding/durable retry/browser/Android còn riêng.

Sau đó vẫn 17 legacy + receipt indirect/policy/FK → issuer/trust/atomic timed
health → alerts/admission/budget → signup/status/resume/reconcile/abuse/email →
hai consoles → Linux/TLS/offsite restore/on-call → simultaneous A/B/E2E/load/RC →
pilot ≥7 ngày. Giữ **27 packages/25 tasks/70 cases, 122 releaseAcceptance unverified**,
gate L/S/P/U/B không đổi. Đây là một lát local có proof, không thu nhỏ toàn plan.
