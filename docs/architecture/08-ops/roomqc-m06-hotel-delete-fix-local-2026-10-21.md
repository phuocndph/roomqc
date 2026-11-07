# RoomQC — bảo vệ receipt và quyền xóa hotel: kết quả local sau sửa

Ngày 21/10/2026, Asia/Bangkok. Trạng thái: **đạt kiểm thử local có phạm vi**,
không phải nghiệm thu toàn bộ VPS + signup hoặc phê duyệt phát hành.

## 1. Kết luận và phạm vi

Hai finding High của [baseline](roomqc-m06-hotel-delete-baseline-local-2026-10-21.md)
đã có bản sửa và proof local trước/sau: hotel gắn receipt không bị xóa thông
thường; owner không còn quyền/session hợp lệ không thực hiện được sensitive DELETE.
Giữ baseline làm lịch sử, không overwrite run thất bại thành pass.

A `cc7ac134fa74` và B `60177c26f522` đều kết thúc exit 0,
`permission_controls_verified`, cleaned=true, dọn 18 owned objects/run.
B tham chiếu A đã thành công/cleaned; source/migration/image/schema/build khớp.
Đây là **hai rebuild tuần tự**, không thay E2E hai backend cùng chạy.

Implementation chỉ tại `roomqc-worktrees/integration`; checkout chính chỉ nhận
tài liệu/artifact đã lọc. Không deploy DB nghiệp vụ/CRM, không gửi email thật,
đổi DNS hoặc mở signup/billing. [Artifact JSON](../../../artifacts/roomqc-m06-hotel-delete-fix-local-2026-10-21.json) lưu
hash/build, command/result, giới hạn và failure history; private logs/env/catalog
không mirror.

## 2. Thay đổi

- Migration `20261021045309_protect_workspace_receipt_hotel_delete.sql`:
  receipt hotel FK chuyển CASCADE → NO ACTION. Không thay tenant offboarding
  hoặc mọi FK CASCADE; room draft vẫn theo contract cũ khi hotel không gắn receipt.
- Private helper chỉ có quyền thực sự cần; fixed search_path, kiểm live owner
  và tenant. Restrictive RLS chỉ thu hẹp DELETE, không mở rộng SELECT/INSERT/UPDATE.
  Tái dùng lock boundary Auth → profile → owner role → session trước mutation.
- Hook xóa hotel từ chối khi đọc assigned users lỗi, kiểm row thực sự trả về;
  không toast/audit thành công khi RLS lọc hết. Thông báo refusal/quyền/lỗi chung
  bằng tiếng Việt và invalidate hotel/hotels sau kết quả hợp lệ.
- Harness giữ partial evidence khi throw, có quota fixture riêng hữu hạn,
  không tăng quota dùng chung/tắt trigger. Provider drill chạy trước hotel stage
  vì provisioning hợp lệ sinh welcome queues.

## 3. Expected/actual đã kiểm

| Control | Kết quả A và B |
|---|---|
| Receipt + room draft có hàng; owner chuyển hotel trong cùng tenant | Fixture hợp lệ, không dựa vào assigned-user FK che lỗi |
| Owner xóa hotel gắn receipt | 23503 đúng constraint workspace receipt; receipt/draft/snapshot ổn định |
| 10 DELETE đồng thời + provisioning replay | Tất cả bị chặn; một receipt ổn định, replay không tạo lại |
| Staff / tenant khác / anon | Deny, không effect ngoài contract |
| Locked / inactive / Auth deleted / ban / unconfirmed / expired session / role revoked | Deny hotel không gắn receipt; không dựa vào receipt FK để che quyền |
| Actual GoTrue global logout, JWT cũ | Deny sensitive DELETE |
| Live owner relogin, hotel trống không gắn receipt | Xóa được; có positive trước/sau khôi phục |
| Revoke commit trước DELETE | Lock wait thật; sau revoke DELETE denied |
| DELETE lấy quyền/khóa trước revoke | Revoker chờ; mutation tuần tự commit trước, request sau revoke denied |

Mỗi run có 19 recorded labels, hai lock races và so sánh 29 bảng.
Đây không phải 21 case release; không khẳng định 29 bảng đều có dữ liệu.
Browser thao tác UI xóa hotel chưa chạy trong lát này: hook tests không thay UI E2E.

## 4. Hồi quy thực chạy trên candidate

| Lệnh / phạm vi | Kết quả |
|---|---|
| `npm run test:control:db`, terminal 47682 | 167 pass, 0 fail/skip/cancel, exit 0 |
| Vitest sáu file hotel/distribution/email/lifecycle, terminal 17299 | 54/54, sáu file, exit 0; tách khỏi control |
| Focused hotel/provider structural tests | 8/8, subset của 167, không cộng thêm |
| Fresh full-vendor A/B, terminal 56503 / 8944 | 533 migrations/run, toàn bộ runner exit 0 và cleanup |
| Build trước đó + verify lại | Exit 0, 378 web assets; process-only public fixture env |

Source scope 660 files / 533 migrations:
`d9fed0f0e749167a849717fd773105bd23395777b3ce84d128bc6132cd605710`.
Đây không là full release manifest. Fingerprint lấy sau khi A bắt đầu, đối chiếu
không đổi trước B và lúc bàn giao; không gọi là immutable whole-tree snapshot
được capture trước A.

Initialized schema:
`6865bafdd73485d65bfaf764918cc958bc53e13508e6ae994c13a1c11503c396`.
Probe privilege audit cả hai run: business tables=0, business definers=0.
Lifecycle/provider/email-admin/registration/mutation/session/direct-controls và
năm protocol probes/fault-recovery được chạy lại trong cùng runner, không thừa kế
pass của source cũ. Tuy nhiên pipeline registry → collector → persisted health →
admission và các yêu cầu R3/R5/R6/R7 vẫn chưa đóng.

Build dùng URL/key công khai fixture chỉ trong process; không đổi env file,
không xác minh production credentials. Cảnh báo chunk lớn vendor/docs còn đó;
không kết luận performance production đạt.

## 5. Các lần fail được giữ lại

- `9e188362ef94`: quota fixture max_hotels=2 bị cạn; exit 1/cleaned 13 objects.
  Đã dùng plan fixture riêng bounded, không thay quota thật.
- `505287678e25`: hotel stage đạt, toàn run fail do provider drill thấy hai
  welcome queues từ stage trước; exit 1/cleaned 18 objects. Đã sửa thứ tự.
  Không dùng run này làm expected-build reference.
- `bfa836ffd49f`: Docker chưa chạy, chưa áp migration; exit 1, recovery cleanup
  xác nhận 0 objects. Khởi động engine không reset/xóa volume.
- Baseline `d178a0bedd10` giữ nguyên hai findings và lỗi cuối fixture lịch sử.

Failure/harness evidence không được xóa chỉ vì hai lượt cuối xanh.

## 6. Còn phải làm và nghiệm thu

Advisors CLI 2.121.0: **605 issues/run**, gồm 17 no-policy, 8 unindexed FK,
445 unused-index và 135 multiple-permissive-policy. Exit 0 không có nghĩa clean.
Unused-index giảm từ 473 xuống 445 do workload có thể thay đổi thống kê, không
phải đã tối ưu hay sửa index.

Nhận tiếp T08: disposition quyền gián tiếp từng 17 target → semantics 135 policy →
8 quyết định FK có workload/EXPLAIN → issuer/release trust → revision-atomic health/
timed pipeline. Tiếp tục alerts/admission/budget, signup/status/resume/reconcile/
abuse/email, console, Linux/offsite/restore/on-call, simultaneous A/B/browser/
Android/load/RC và ≥7 ngày pilot.

Giữ **27 gói / 25 bước / 70 case**, toàn bộ 122 releaseAcceptance entries vẫn
unverified; không đóng R4/T08 hoặc gate L/S/P/U/B. Chưa có independent reviewer
signoff. [Plan](roomqc-vps-signup-preparation-plan-2026-10-21.md) và
[protocol](roomqc-vps-signup-acceptance-protocol-2026-10-21.md) là nguồn giao việc.
