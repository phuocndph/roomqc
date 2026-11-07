# M06 — phân trang lời mời và actual compiled admin send

Checkpoint752 files/545 migrations;22/10/2026, Asia/Bangkok.
[Evidence đã làm sạch](../../../artifacts/roomqc-m06-staff-invitation-pagination-local-2026-10-22.json).
Đây là scoped local proof, **không nghiệm thu toàn bộ VPS/signup hoặc production**.

## Kết quả sử dụng

Danh sách không còn cắt ở100 lời mời trong UI mới. Người dùng có Trang trước/
Trang sau, mỗi trang50 mục, đếm số mục trên trang (không giả tổng toàn bộ).
Khách sạn/phiên/runtime/quyền đổi thì về trang đầu, không thao tác bằng row
trang cũ. Lỗi hoặc trang trống sau thu hồi vẫn có thể quay lại; kiểm tra lời mời
từ trang sau sẽ tải từ đầu để thấy mục mới.

Theo hướng dẫn Supabase/Postgres đã đối chiếu, dùng keyset(created_at,id) thay
OFFSET, giữ microseconds và thứ tự UUID khi timestamp bằng nhau; cursor không
cấp quyền. Mỗi trang đi qua live native-session/tenant/hotel/capability check.
Server lấy thêm1 mục để xác định next cursor, trả page_size/page_cursor/next_cursor;
client fail closed nếu metadata, scope, thứ tự, duplicate hoặc bounds sai.
Một partial tenant/created_at/id index hỗ trợ pending keyset. Chưa đo latency
trên workload lớn, không tuyên bố hiệu năng100.000 user.

Đây là danh sách pending thay đổi trực tiếp, không snapshot lịch sử bất biến.
Insert mới có thể chỉ thấy khi tải lại đầu; revoke/xóa làm trang sau rỗng là
trạng thái hợp lệ, không phải receipt thành công của mutation. Không tự gửi lại.

## Mã nguồn và rollout

Implementation chỉ ở integration. Migration545:
`supabase/migrations/20261021221928_staff_invitation_keyset_pages.sql`, tạo bằng native CLI2.121.0.
Forward-only, giữ nguyên544; giữ transaction authority/lock/CAS/audit từ nền,
không mở SELECT cho browser hoặc thêm broad grant. Legacy list100 giữ để tương
thích; hook/UI mới bắt buộc paginated receipt, không fallback sang legacy100.

Các file chính: staff-invitation-admin client/hook/PendingInvitations, shared
management Edge, migration545 và actual backend/delivery harness.
Client sản phẩm tạo qua create-user, gửi lại qua staff-invitations; URL adapter
test chỉ ánh xạ hai endpoint vào đúng dịch vụ nội bộ, không giả response/status.

Triển khai thực sau này phải rollout backend contract trước UI mới; nếu backend
cũ trả thiếu paging receipt, UI không xác nhận thành công. Không reset DB,
down-migrate, tạo tenant lại hoặc grant rộng để vượt kiểm tra.

## Kết quả thực tế đã kết thúc

Run `981105145983`, terminal exit0; replay545 migrations. Frozen source trước/
sau: `ae85df9666130d0e2a3372f5bfb1fcc1d74b3295562fd47d00c9afaebeac81f8`.
Schema trước/sau/sau advisors cùng `04b13d0e42b0b08768656509c3b1b47b537075e123c43a0195a2269a672f4e24`.

| Bộ kiểm tra | Kết quả | Phạm vi chứng minh |
|---|---|---|
| Compiled production admin |15/15|Giữ8 trước; thêm7 paging/authority/recovery.125 visible rows/3 pages, exact DB ID order,0 duplicate; selected/all hotel; mất capability trang sau trả0/no effects; expired session denied; invalid cursor400 |
| Actual delivery |19/19|Create và resend nay đi qua compiled admin, exact receipt;2 send observations là subset của19, không cộng thêm.6 SMTP captures/1 refusal nội bộ, cooldown63852ms, native identity giữ nguyên |
| Management / server / compiled acceptance caller |31/31 +22/22 +7/7|Giữ atomic/authority/receipt/no-regrant/recovery regressions; không suy full matrix |
| Frontend25 files |388/388|Client/hook/component mocks, page navigation/reset/old-page action/failure; expected synthetic save-refusal stderr; không browser E2E |
| Full control, DB opt-in |228/228,0 fail/skip/cancel|ROOMQC_CONTROL_DB_TEST=true;129475.3016ms. Monitoring Docker Desktop VM, five-service probes false/admission closed |
| TypeScript / targeted ESLint |exit0 /8 files,0 warning|Không thay browser/Android/full-repo lint |
| Structural+SMTP / syntax / whitespace |18/18 /exit0 /exit0|18 là subset của228. Syntax preflight kiểm3 script trước replay; không cộng số test |

Intermediate control227/227 có trước khi thêm syntax-preflight; giữ đúng số,
không đổi nhãn thành228. Không cộng các tập test để tính phần trăm sản phẩm ổn định.

## Failure history và cleanup

1. Run c76137591ab9 exit1, replay544/545, SQL42601: replacement-string trong
   công cụ tạo mã diễn giải dấu kết thúc regex thành suffix, làm hỏng function.
   Sửa bằng ghép slice trực tiếp, không giảm expected hoặc sửa schema constraint.
   Cleanup11 exact-owned objects, leftovers0.
2. Run6c45c6d35fa2 exit1,545 migrations đã qua; harness trùng const malformed,
   node --check xác nhận. Sửa tên biến và thêm syntax preflight3 scripts;
   cleanup15, leftovers0. Không có actual invitation proof ở failed run này.
3. Run cuối981105145983 dùng frozen source trên, tất cả tập actual đạt;
   cleanup15. Kiểm độc lập đúng label roomqc.control-backend-test cho cả3 runs:
   container0/network0/volume0. Không prune hoặc đụng serving resources.

## Advisors và phần chưa khép

Native CLI2.121.0:652=19 no-policy INFO +7 unindexed FK INFO +491 unused-index INFO
+135 permissive WARN,0 ERROR. Snapshot trước751 có653/8FK; **không gọi report
sạch hoặc coi count giảm là đã audit toàn bộ FK/19 targets**. Chưa full current
indirect/policy/FK disposition, full inviter-role/capability/membership/report/
position/recipient/offboarding và observed accept/password/revoke locks.

Còn browser/multi-tab/reload/network-before-headers/after-commit/Android; full
default frozen-source backend A/B; query-plan/latency lớn; external email,
Linux/TLS/offsite restore/load/RC/pilot và reviewer. Native SMTP proof không
chứng minh inbox Internet, GET/deep-link hoặc durable exactly-once delivery.

## Tiếp tục toàn bộ kế hoạch

Giữ pagination125/3 pages, compiled successful create/resend và captured-context
UI làm hồi quy, không giao lại như chưa có. Nhận full invitation/authority matrix
và observed locks; full frozen backend A/B; đi tiếp EC10–EC15/workflow/19-target/
policy/FK →issuer/trusted release/timed health →alerts/admission/budget →signup
setup-status/reconcile →consoles →Linux/DR/E2E/load/RC/pilot theo dependency.

8 đợt/27 gói/25 task/70 cases/122 releaseAcceptance unverified và gates L/S/P/U/B
giữ nguyên; reviewer/signoff null. Không thay serving DB/RoomQC/CRM/VPS/DNS/
provider hoặc gửi email Internet. Primary chỉ nhận docs/artifacts đã làm sạch.

- [Bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md)
- [Plan](roomqc-vps-signup-preparation-plan-2026-10-21.md)
- [Phiếu triển khai](roomqc-vps-signup-launch-checklist-2026-10-21.md)
- [Nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md)
- [Proof751 giữ lịch sử](roomqc-m06-staff-invitation-admin-ui-local-2026-10-22.md)
