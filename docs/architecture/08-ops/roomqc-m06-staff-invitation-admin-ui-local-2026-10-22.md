# M06 — management UI lời mời nhân viên: local checkpoint751/544

Ngày22/10/2026, Asia/Bangkok. Phạm vi là lát T01/T03/T04/T08 trong kế hoạch
toàn bộ VPS + signup; **scoped local verification, chưa phải release acceptance**.
[Evidence đã làm sạch](../../../artifacts/roomqc-m06-staff-invitation-admin-ui-local-2026-10-22.json).
Implementation chỉ ở integration; primary nhận docs/artifacts. Không thay
serving DB/RoomQC/CRM/VPS/DNS/provider hoặc gửi email Internet.

## 1. Kết quả đã bàn giao

- Client admin riêng gọi create-user/staff-invitations theo exact native session,
  actor/tenant/runtime/selected hotel; kiểm session trước/sau HTTP và receipt
  version/context/target. List selected hotel/all mode, validate từng row,
  timestamp/UUID/level, chống trùng, giới hạn100.
- Hook tách cache theo identity/runtime/hotel/authority; không có bearer/key
  trong query key. Abort khi đổi context/unmount, epoch chặn ABA/reply cũ,
  synchronous single-flight; retry mutation tự động bị tắt.
- Create/resend/revoke chỉ dùng context hợp lệ; target lấy từ list đã kiểm,
  không act trên list fetching/error. Chưa rõ kết quả chỉ invalidate/refetch
  list captured; list vắng không được diễn giải là thành công.
- UserFormDialog chụp identity và open generation; response của phiên/form cũ
  không đóng form mới. Parent desktop/mobile không tự đóng sau await.
  useCreateUser dùng client mới và mutation observer có scope.
- UI ghi “Đã yêu cầu gửi”, không hứa delivery; cảnh báo giới hạn100 và hướng
  dẫn chọn khách sạn. Chưa triển khai phân trang vượt100.
- Deadline nội bộ20s, giới hạn response131072 bytes, abort được giữ cả khi
  transport không tuân thủ, no cookie/no redirect và lỗi được làm sạch.
- Migration544 forward-only giữ lock order/live authority/recipient binding/CAS/
  audit/grants từ543; kiểm expected tenant/hotel trước writes và lọc hotel ở
  server, trả tenant/hotel receipt. Adapter public service-only INVOKER không
  đổi. Edge send receipt bổ sung invitation/tenant/hotel; UI mới fail closed
  khi gặp Edge cũ không đủ receipt. Không đổi password/cấp membership ở reserve.

## 2. Nguồn và môi trường đóng băng

Source751 files/544 migrations, SHA256 trước và sau toàn bộ run:
`db73f8a203025c7e43860815a9070d1f92cb3eca2d5565842507eae35c728137`.
Manifest có công thức tái tính trong artifact, không dùng số file thay identity.
Migration mới: `supabase/migrations/20261021215113_staff_invitation_management_context_receipts.sql`,
tạo bằng native CLI;543 giữ nguyên.

Backend run `004c25879bff`, terminal exit0/stderr0, replay544 migrations.
Schema trước/sau/sau advisors cùng:
`db11204c04a942af484af78c42aec1109b41d571d0925e5545c2576982cacf75`.
Có actual Auth/Edge/RPC và compiled production caller; SMTP sink nội bộ.
Đây là staff-invitation diagnostic, **không default full integrated backend A/B**.
Auth image/build provenance và compiled/Edge hashes được ghi trong artifact;
không nâng vendor hoặc thay image phục vụ.

## 3. Kiểm chứng đã kết thúc

| Tập kiểm thử | Kết quả | Giới hạn bằng chứng |
|---|---|---|
| Compiled production admin client |8/8|Selected hotel loại hotel khác; all mode thấy cả hai; sai tenant/hotel denied/no effects; old session không dispatch; resend cooldown; exact revoke và read-only replay. Chưa successful create/resend qua compiled admin |
| Management RPC/Edge |31/31|Giữ atomic authority/reservation/audit và denial/recovery hồi quy; chưa full role matrix |
| Actual Auth/SMTP nội bộ |19/19|Create-user alias/create/resend/confirmed-recipient recovery/refusal/accept;6 thư capture,1 refusal, real cooldown62753ms; không external delivery |
| Server acceptance |22/22|Pre-profile/native receipt/session/replay/no-regrant/concurrent accept; chưa full cross-operation observed locks |
| Compiled acceptance caller |7/7|Exact-session/status/adapter post-commit loss; không browser/network E2E |
| Frontend25 files |363/363|Client/hook/component mocks và regression; không browser/Android. Expected synthetic “Owned save refusal” stderr, không failure |
| Full control, DB opt-in |225/225,0 fail/skip/cancel|ROOMQC_CONTROL_DB_TEST=true; Docker Desktop VM. Chưa five-service probes/timed Linux health; admission chưa mở |
| Default control trước opt-in |175 pass/50 skip,225 total|Không gọi225passed; không dùng làm full control proof |
| TypeScript / targeted ESLint |exit0 /17 files,0 warnings|Không thay full-repo lint hoặc browser tests |
| Structural / MJS syntax / whitespace |10/10 /exit0 /exit0|10 structural là subset của225, không cộng thêm; LF/CRLF warnings thông thường không fail |

Không cộng các tập test thành tỷ lệ ổn định hoặc số case release đã nghiệm thu.

## 4. Lỗi phát hiện và xử lý, giữ lịch sử

1. Focused4 files77 tests ban đầu:76pass/1fail. Test list chứng minh handler
   bỏ tenant/hotel đã validate khi gọi RPC bằng object rỗng. Đã chuyển đúng
   payload, giữ nguyên assertion; kết quả cuối đạt.
2. TSC ban đầu phát hiện Zod UserFormData optional không khớp strict draft.
   Adapter chuẩn hóa required strings; final TSC exit0.
3. ESLint ban đầu có React ref cleanup warning. Chụp lifecycle reference ổn
   định; final0 warning.
4. Backend `69ec0af6d33f` exit1 sau544 migrations/31 management pass, trước
   admin/delivery/server/caller: fixture hotel thứ hai vi phạm23514
   hotels_code_format. Sửa fixture thành INV- + uppercase12-character run ID,
   không sửa constraint hoặc giảm expected. Source thay trong exploratory run,
   không coi đó là frozen final proof. Cleanup15, exact leftovers0.
5. Run cuối004c25879bff dùng frozen source đã ghi và tất cả tập ở mục3 đạt.
   Không ghi đè proof744/741/738 hoặc xóa failed attempts.

## 5. Advisors và cleanup

CLI2.121.0 thực chạy:653 findings =19 no-policy INFO +8 unindexed FK INFO +
491 unused-index INFO +135 permissive WARN,0 ERROR. **Không phải sạch**.
19-target current-schema disposition/policy/FK còn mở; số unused bằng744
không chứng minh reachability/audit/index đã giải quyết.

Cả failed run69ec0af6d33f và final004c25879bff: cleanup15 exact-owned objects/
run; kiểm tra độc lập exact run label còn container0/network0/volume0.
Không cleanup tài nguyên phục vụ, broad Docker prune hay reset DB.

## 6. Còn mở và cách nghiệm thu tiếp

1. Full inviter-role/capability/membership/report/position/recipient/offboarding
   matrix: khóa identity/allowed effects; positive → denied/no effects → recovery.
   Successful create/resend qua compiled admin và email nhận thực tế tách riêng.
2. Observed locks/barriers accept-password-revoke hai thứ tự. Source lock order
   khác chưa phải deadlock tái hiện; timeout/5xx không tính denial pass.
3. Phân trang thực vượt100, filter/cursor và response bounds; cảnh báo100 hiện
   tại không hoàn tất yêu cầu xem mọi lời mời.
4. Browser two-tab/reload/network-before-headers/after-commit, dialog desktop/
   mobile thật và Android; component ABA tests không thay các hành trình này.
5. Fresh frozen-source default full backend A/B, recovery/advisors/cleanup và
   reviewer. Hai rebuild tuần tự không thay simultaneous A/B ởT21.
6. Đi tiếp EC10–EC15/workflow/19-target/policy/FK →issuer/trust/timed health →
   alerts/admission/connection budget →signup/reconcile →admin consoles →
   Linux/TLS/offsite DR/on-call →E2E/load/RC/pilot. Không dừng toàn roadmap ở
   invitations; thực hiện theo dependency T01–T25 hiện có.

Triển khai sau này: backend migration544/Edge receipt phải tương thích trước
UI mới; preflight exact source/image/schema/contract trên staging. Nếu backend
cũ trả thiếu receipt, UI phải báo không xác nhận, không lách parser. Rollback
binary/config chỉ khi tương thích; không down-migrate/reset/xóa invitations
hoặc grant rộng để làm test xanh.

## 7. Điều kiện ký và liên kết kế hoạch

8 đợt/27 gói/25 task/70 case giữ nguyên;122 releaseAcceptance vẫn unverified,
gates L/S/P/U/B không mở. Reviewer/signoff null; chưa có độc lập nghiệm thu.
Các mục cần VPS/secret/DNS/email/offsite/on-call được gom trong
[bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md#7-đầu-vào-cần-chốt-đúng-thời-điểm).
Không lưu secret/token/password/PII trong report hoặc artifact.

- [Plan đầy đủ](roomqc-vps-signup-preparation-plan-2026-10-21.md)
- [Phiếu triển khai và dependency](roomqc-vps-signup-launch-checklist-2026-10-21.md)
- [Bộ nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md)
- [Tiến độ](roomqc-vps-signup-progress.md)
- [Advisors còn mở](roomqc-m06-advisor-triage-2026-10-19.md)
