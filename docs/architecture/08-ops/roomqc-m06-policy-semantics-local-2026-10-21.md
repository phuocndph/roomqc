# RoomQC — parent A/B và rà soát cấu trúc 135 policy warnings

Ngày 21/10/2026, Asia/Bangkok. **Có tiến triển local; chưa đóng R4/T08/release.**
[Artifact đã lọc](../../../artifacts/roomqc-m06-policy-semantics-local-2026-10-21.json) /
[plan toàn bộ VPS + signup](roomqc-vps-signup-preparation-plan-2026-10-21.md) /
[protocol nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).

## 1. Vòng B đã hoàn tất, không còn là việc chờ

A `a65154d44e98` / B `7e7c0927ec04`: exit 0, final phase
permission_controls_verified, cleaned=true, 18 owned objects/run.
B dùng ownership của A thành công/cleaned; schema/migration/image digests,
parent harness và cả bốn compiled Edge build fingerprints khớp.

Backend scoped source **662 files/533 migrations**:
`32917b3fc123ecf9fcbfd9aef722839b2001fa2442c83f793d1b755c3aa5dd35`.
Fingerprint được chụp sau A bắt đầu, giữ nguyên trước/sau B; không là immutable
whole-repo snapshot lúc launch. Hai file analyzer/test mới là scope riêng,
không được nói backend A/B đã chạy source 664-file.

Mỗi run có 22 FK populated × bốn actor × DELETE/primary-key UPDATE = **176
denials**, findings=0, missingFixtures=0; 32 bảng giữ nguyên sau rollback.
Hotel REST regression có 20 nhãn, gồm owner unbound room-draft cascade positive
và hai actual lock races. Trusted service tenant cascade chỉ là transaction
rollback với năm nhóm fixture có dữ liệu, không phê duyệt offboarding production.

Raw runtime Compose hash khác giữa hai run vì chứa tên/fixture secrets riêng.
Một phép đối chiếu bổ sung ban đầu yêu cầu raw hash bằng nhau đã fail; kiểm
source runner line 278 xác định đó là invariant sai của phép đối chiếu, không
phải schema drift. Đã đối chiếu rõ immutable digests/schema/migration/harness
và compiled bundle objects, tất cả khớp; không nới expected trong runner.
Không nhầm raw Compose hash với compiled Edge bundle hash.

## 2. Tool phân tích policy mới và kết quả thực

Đã thêm:

- scripts/control-backend-policy-review.mjs
- server/control/backend-policy-review.test.mjs

Tool chỉ đọc snapshot catalog/advisors/role-USAGE của sandbox; không kết nối
runtime, cấp quyền, sửa policy hoặc sinh migration. Role snapshot thu bằng
installer SELECT trong BEGIN READ ONLY/ROLLBACK, trong lúc B đang sống;
32 roles và 59 effective pg_has_role(USAGE) pairs. Không suy inheritance từ
tên role hoặc closure đơn giản.

| Phần | Kết quả quan sát |
|---|---|
| Policy catalog | 359 |
| Advisor permissive warnings | 135/135 matched |
| Phạm vi warning | 50 bảng / 6 roles |
| Mixed hotel/tenant scope candidates | 5 nhóm, chưa xác minh allowed rows |
| Focused tests | 6/6, subset của control |
| Full control DB | 177/177, 0 fail/skip/cancel/todo; exit 0 |
| Advisors A/B | 604/run = 17 no-policy + 8 FK + 444 unused-index + 135 permissive |

Các rule đã test: PERMISSIVE/RESTRICTIVE là **chuỗi enum**, không dùng truthiness;
ALL/PUBLIC/effective inherited roles được xét; permissive kết hợp OR và
restrictive kết hợp AND; thiếu WITH CHECK kế thừa USING; INSERT không có
old-row visibility. Unknown/duplicate/stale input fail-closed. Output chỉ giữ
hash predicate, không đánh giá SQL hay phán “safe”.

Một thống kê nhóm thô theo role/table/operation, nhất là coi chuỗi RESTRICTIVE
là truthy, **không tương đương** 135 cảnh báo. platform_settings SMTP guard
là RESTRICTIVE; không kết luận nó mở quyền chỉ vì xuất hiện cạnh ALL policy.

## 3. Đầu việc quyền cần kiểm chứng tiếp, không gộp policy mù

Năm bảng: inventory_transactions, items, laundry_batches, maintenance_requests,
rooms. Các nhóm có tenant lookup cùng hotel-scoped policy. Riêng rooms/laundry
còn ALL policy tham gia SELECT; chỉ bỏ một SELECT policy không bảo đảm đổi đúng
allowed set.

[Contract phân quyền](../06-permissions/permission-matrix.md) quy định owner trong
tenant và manager/staff theo hotel được giao. Source items có nhánh hotel helper
ngoài nhánh tenant guard; helper có owner-role allowance. Đây là quan sát source,
**chưa xác minh thực bằng đọc hàng cross-tenant/khác hotel**, không báo đã có fix.

Nhận tiếp exact-owned fixture: own hotel positive, same-tenant other hotel,
cross-tenant owner/staff, assigned/unassigned manager, anon và live/revoked actor;
kiểm cả direct REST và các RPC liên quan, counts/checksums/allowed effects.
Sau khi xác nhận expected/actual mới tạo forward migration nếu cần. Không giảm
warnings bằng cách gộp/xóa policy hoặc xóa index unused.

## 4. Những gì vẫn chưa hoàn thành

- Full indirect disposition của 17 target; parent boundary không thay mọi RPC/
  view/trigger/dynamic path. Candidate users trigger → complete_registration
  có match từ comment, cần giữ semantic disposition, không gọi là thực thi.
- Runtime allowed-row review/so sánh trước–sau cho policy và 8 FK workload decisions.
- Issuer/release trust, revision-atomic health và timed admission pipeline.
- Signup/resume/abuse, hai console, Linux/TLS/DR/external on-call, simultaneous
  A/B, browser/Android E2E/load/RC và pilot ≥7 ngày.

Hai rebuild tuần tự không thay simultaneous-cluster E2E. Không có product/schema
change, deploy, provider/email thật hoặc business/CRM DB mutation trong lát này.
Control suite mới có log terminal riêng; focused 6 không cộng thành 183 tests.
Giữ nguyên 27 gói/25 bước/70 case, 122 releaseAcceptance và L/S/P/U/B chưa ký.
