# RoomQC — baseline quyền thực tế năm bảng, chưa sửa policy

Ngày 21/10/2026. **Đã xác nhận lỗi trong fixture sở hữu; chưa đạt nghiệm thu.**
[Artifact 180 observations đã lọc](../../../artifacts/roomqc-m06-hotel-scope-baseline-local-2026-10-21.json) /
[plan VPS + signup](roomqc-vps-signup-preparation-plan-2026-10-21.md) /
[protocol nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).

## 1. Kết quả và tác động

Run `ebc16a5e968a` gọi GoTrue + REST thật, hai tenant/bốn hotel, owner A/B,
manager, department manager, staff được gán, staff không được gán và anon.
Năm bảng đều có fixture hợp lệ, profile/role/assignment đã assert trước test.

| Nhóm | Quan sát fail | Tác động đã thấy |
|---|---:|---|
| Owner đọc items khác tenant | 4 | REST trả đúng hàng fixture của doanh nghiệp khác |
| Đọc hotel ngoài assignment | 25 | Manager/department/staff thấy hotel khác; staff chưa gán vẫn thấy dữ liệu tenant |
| Manager ghi ngoài assignment | 16 | POST/PATCH/DELETE hoặc đổi hotel_id thực sự làm đổi dữ liệu fixture |

Đây là **45 tình huống fail trong ba nhóm**, không phải 45 lỗi độc lập.
Mức đề xuất High, chưa có reviewer ký. Không có bằng chứng dữ liệu khách thật
đã bị truy cập; kiểm thử chỉ trong backend disposable không published ports.

Tổng **180 observations: 135 đạt, 45 fail**. Toàn bộ **47 positive controls đạt**;
133 negative controls có 88 đạt và 45 fail. Có 140 reads (29 fail) và 40 writes
(16 fail). Snapshots 15 bảng được so trước/sau mỗi request; finding ghi sai phạm
đọc riêng với mutation thật, không coi 409 FK/timeout/5xx là permission-deny pass.

| Bảng | Tổng observations | Fail |
|---|---:|---:|
| rooms | 38 | 9 |
| items | 38 | 13 |
| inventory_transactions | 35 | 8 |
| laundry_batches | 38 | 9 |
| maintenance_requests | 31 | 6 |

## 2. Source và trạng thái terminal

Scope **666 files/533 migrations**, SHA256 `98ffe3ac46731eab4e6ae9e99a12f0757eb82265432155bca017e65499be3dbc`.
Chụp trước corrected run và recompute sau terminal không đổi; recipe trong artifact.
Không là full release manifest. New scope đã tính hai file policy analyzer/test
và hai file scope harness/test, không thừa kế proof A/B 662-file trước.

Run `ebc16a5e968a`: **exit 1**, phase hotel_scope_checks, cleaned=true,
18 exact-owned objects được dọn. Harness lưu đủ 180 rows trước mandatory assert.
Không được dùng failed run làm B reference. Stage permission recovery cuối chưa chạy;
không nói full backend pass hoặc A/B repeatability đã đạt ở source mới.

Các lát provider/hotel-delete/lifecycle/email-admin/access/registration/mutation,
no-policy/parent-boundary trước điểm dừng có kết quả verified riêng theo ownership.
Parent boundary vẫn chỉ 176 SQL denials/22 FK và rollback 32 bảng, không thay API
proof hoặc full indirect disposition. Advisors còn **604**: 17 no-policy, 8 FK,
444 unused-index, 135 permissive; không giảm vì lượt này không đổi schema/policy.

## 3. Lỗi fixture và các lệnh test

Run đầu `9a661bfcdd3f` exit 1/cleaned 18, **0 scope observations**. HTTP 409 /
SQLSTATE 23503 ở users vì fixture nhầm legacy app_role hotel_manager với cấp
user_level_code manager. Đã đối chiếu user_levels và staff-invitation mapping,
sửa fixture, thêm postconditions/regression; không tắt FK/trigger hoặc sửa expected.
Giữ ownership/log lịch sử; đây không phải finding quyền sản phẩm.

- Corrected focused: **5/5**, subset của full control.
- Corrected `npm run test:control:db`, session 29333: **182/182**, exit 0,
  fail/skip/cancel/todo=0, 129654.7322ms.
- Control trước sửa fixture: 181/181; giữ lịch sử, không cộng thành tổng mới.
- `npm test` trong server/control từng fail do cwd sai khi resolve scripts;
  không sửa code để hợp thức hóa invocation sai. `npm run test:control` từ root
  có 131 pass/50 skip, không tính là full DB proof; entry DB đúng đã chạy ở trên.

## 4. Phạm vi chưa được chứng minh

Đây là baseline **hotel-bound scope**, không phải toàn ma trận quyền. Chưa ký:
platform cross-tenant/direct-table vs RPC contract; task-level capabilities;
hotel_id NULL/shared rows; stale/revoked account/session trên mọi operation và
concurrent revoke fencing; mọi RPC/view/trigger path; UI/browser/Android/Linux/
offsite restore/load/pilot. Một số operation trực tiếp không có policy phải
review workflow RPC riêng, không mặc định tạo quyền mới để làm positive pass.

ActorFixture trong artifact được bổ sung từ thứ tự loop ở source khóa: 140 rows
đầu = 7 actors × 4 contexts × 5 tables; 40 rows sau chỉ manager. Không ghi token,
password, email, raw row/predicate hoặc DSN vào artifact public.

## 5. Việc nhận tiếp và gate

Giữ baseline này. Review ALL/permissive OR/restrictive AND và helper branch rồi
forward-fix phạm vi năm bảng: owner chỉ own tenant; manager/staff đúng assignment;
giữ positives và capabilities hiện hành. Không globally rewrite user_has_hotel_access,
không mở thêm quyền super-admin/RPC hoặc blanket drop policy để giảm warnings.
NULL/shared và platform contracts phải có disposition/đối chứng riêng.

Sau fix: focused → full control → fresh A/B cùng source → advisors → cleanup →
report/reviewer. Sau đó tiếp tục 17-target/policy/FK, issuer/trust/atomic health/
pipeline, alerts/admission/budget, signup, hai console, Linux/DR, E2E/load/RC/pilot.
Không dừng toàn plan ở lát quyền này. Giữ **27 gói/25 bước/70 case**, toàn bộ 122
releaseAcceptance unverified và các gate L/S/P/U/B không đổi.

Lượt này chỉ sửa harness/runner/test trong integration. **Chưa sửa policy sản phẩm,
chưa deploy hoặc mở signup/billing**. Primary chỉ nhận docs/artifacts đã lọc.

