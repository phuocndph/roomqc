# RoomQC — bản sửa audit hồ sơ nhân viên: bằng chứng diagnostic local

Ngày 21/10/2026. Phạm vi T03/T04/T08, phiếu 15.2.5; không thêm task hoặc case.
[Artifact đã lọc](../../../artifacts/roomqc-m06-employee-audit-fix-diagnostic-local-2026-10-21.json).
Đây là cập nhật bằng chứng đã chạy trong lượt thực hiện trước, không phải lệnh
triển khai mới hoặc nghiệm thu toàn bộ VPS/signup. Reviewer độc lập còn pending.

## 1. Kết luận và nguyên nhân

Đã tái hiện lỗi product: employee RPC ghi activity action `updated`, trong khi
constraint `activity_logs_action_check` chỉ nhận `update` cho thao tác này.
Constraint có từ migration 20251108024814; không phải lỗi mạng hoặc thiếu quyền
cần được chữa bằng nới grant. Baseline diagnostic 3b2317503033 qua Auth/REST thật:
positive manager trả 400/23514, profile chưa lưu, authority không đổi, audit/receipt
delta đều 0. Run exit 1, cleaned 11 owned objects, schema trước/sau khớp.

Giữ bất biến [baseline partial commit](roomqc-m06-employee-workflow-baseline-local-2026-10-21.md)
và [hai failed attempts](roomqc-m06-employee-atomic-attempt-local-2026-10-21.md).
Diagnostic baseline là lần tái hiện mới, không thay thế hoặc sửa các kết quả cũ.

## 2. Bản sửa đã có source

- Forward migration `20261021143251_employee_profile_audit_action.sql`: chỉ đổi
  action `updated` thành `update` trong implementation riêng. Giữ authority,
  lock order, effects, ACL và constraint; không sửa historical migration.
- Desktop/mobile đưa self-edit về workspace-scoped `/profile`; self deep link
  replace history để tránh vòng lặp Back. Owner/platform/target ngoài contract
  có giải thích, không mở form employee không dùng được. Đây là navigation,
  không thay server authorization và chưa chứng minh self-profile PATCH chạy đúng.
- Runner có diagnostic employee riêng, full schema nhưng bỏ các suite không
  liên quan; diagnostic không được làm passing A hoặc tham chiếu B cho full run.

Candidate trước fixed diagnostic và sau terminal cùng **682 files/537 migrations**,
SHA256 `5e5f10c331760a3cd4886deb52b4dcdfad22cb6cac9914d361a5d182a9b19d93`.
Đây là manifest source giới hạn được liệt kê trong artifact, không phải toàn bộ
release manifest. Branch codex/roomqc-parallel-integration, HEAD 5cb583729ce055db64df8b192f10476db1fa99b8;
dirty tree được giữ nguyên, không commit/reset/merge.

## 3. Kết quả diagnostic sau sửa

Run **eb009460eaef**, exit **0**, cleaned **11** owned objects. Full schema 537
migrations trên vendor pin self-hosted/v0.8.3, commit bc27d2661edd09a5d0b8d76ce33da6d4071a756e.
Mạng nội bộ, không public port/provider, Auth/REST thật. Schema fingerprint
trước/sau khớp; fault trigger được gỡ, không để drift.

| Bằng chứng | Kết quả | Giới hạn |
|---|---|---|
| Recorded employee checks | 30/30 | Không phải 30 release cases hoặc toàn ma trận nhân viên |
| Revoke/lock races | 4/4; locked/deleted-session × hai thứ tự DB lock | Không chứng minh mọi API/role hoặc hủy in-flight GET |
| Manager/owner positive | 200; đúng metadata, authority không đổi; audit+1/receipt+1, action update | Fixture được quản lý theo contract |
| Replay/concurrent edit | Không duplicate effect; hai edit cùng version một thành công/một conflict | Chưa durable client retry sau close/remount/tab mới |
| Capability/scope/tenant/invalid/stale | Từ chối đúng loại, không effect ngoài contract; recovery positive | Chưa full department/offboarding matrix |
| Audit fault/transfer | Rollback profile/membership/receipt; primary hotel chuyển/hoàn nguyên giữ flags | Không là proof mọi membership workflow |

Focused tests được ghi ở lượt trước: backend 19/19; frontend 51/51 (helper 15,
desktop/mobile entry 12, hook 13, form 11). TypeScript session 52957 exit 0;
ESLint các file FE chạm và diff-check implementation exit 0. Không cộng các số
này thành độ hoàn thiện sản phẩm. Chúng không được chạy lại ở lượt chốt plan này.

Lượt chốt plan nhận terminal còn chạy từ trước của `npm run test:control:db`,
session 86635: **exit 0**. Output cuối bị cắt khi thu nhận nên không công bố lại
count; không đoán 194 từ số test mới. Suite này không thay full-vendor A/B.

## 4. Việc kế tiếp và điều kiện khép lát

1. Freeze candidate/harness/config; chạy full vendor A, đủ final permission
   recovery và cleanup. Chỉ A terminal thành công, cleaned và đúng invariant
   mới được dùng làm B reference; diagnostic tuyệt đối không thay A.
2. Rebuild B độc lập cùng candidate; giữ 280 scope/1.764 actor/20 scoped races,
   thêm 30 employee checks/4 races cùng các regression đã có. Source đổi thì
   đối chiếu lại, không kế thừa passing A/B của source 668/535.
3. Advisors/disposition và reviewer; actual self-profile/legacy caller, retry
   remount/tab mới, department/offboarding và browser/Android còn cần proof riêng.
4. Tiếp caller/17-target + receipt/policy/FK → issuer/trust/atomic timed health
   rồi đủ tám đợt của [kế hoạch](roomqc-vps-signup-preparation-plan-2026-10-21.md).

Hiện **chưa có full A/B sau bản sửa**, chưa deploy Linux/VPS, chưa gửi email thật,
chưa có browser/Android E2E, load, RC hay pilot. 122 releaseAcceptance và gate
L/S/P/U/B không đổi; không gọi diagnostic thành scoped full-integration accepted.
Raw ownership/secrets không đưa vào docs; artifact chỉ giữ hash và trường đã lọc.
