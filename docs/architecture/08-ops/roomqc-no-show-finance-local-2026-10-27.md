# RoomQC — no-show, tiền cọc và phục hồi lệnh: bằng chứng local

Ngày 27/10/2026. Phạm vi tổng: **toàn bộ VPS + signup; plan + nghiệm thu**.
Đây là bàn giao có phạm vi của Q02/RW5.5–RW5.6, không phải nghiệm thu toàn
VPS/signup. [Artifact đã lọc dữ liệu](../../../artifacts/roomqc-no-show-finance-local-2026-10-27.json)
ghi run, candidate, kết quả và kiểm tra độc lập. Việc nhận tiếp nằm ở
[mục 19.14](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1914-điểm-nhận-sau-no-show-tiền-cọc-và-caller-912b).

## Kết quả và ranh giới bằng chứng

Candidate **912B**, SHA
`bfaf2b8e0d499ac74b15de4edb5b10fe19a3fde41ca486538745314ce5e3a47c`:
912 file phạm vi, 566 business + 12 directory migrations, runtime 181 file.

| Kiểm tra | Kết quả thực tế | Phạm vi |
|---|---|---|
| Native writers | 536/536, exit 0 | Auth/REST/Postgres thật trong fixture Docker cách ly; 441 hồi quy + 32 baseline + 27 command cờ + 36 no-show |
| Tranh khóa | 37/37 | Tất cả có barrier khóa thật; đã gồm các race trong tổng native, không cộng lần hai |
| Nguồn phòng | 77/77, exit 0 | Regression cùng candidate/schema/runtime |
| Frontend liên quan | 122/122, 5 file test, exit 0 | Unit/hook/component; có mocks, chưa browser/Android |
| TypeScript | Exit 0 | Project ứng dụng |
| Lint | 0 lỗi, 28 cảnh báo, 16 file; exit 0 | Cảnh báo còn giữ nguyên; không báo code hoàn toàn sạch |
| Full control | 440/440, exit 0; không fail/skip/cancel | Chạy tuần tự sau native fixtures, giữ threshold hiện có |

Native có actual application client no-show qua REST thật: bỏ response sau
commit, giữ pending key và tra lại đúng financial receipt. Đây là fault injection
ở client; chưa chứng minh proxy/mạng thật bị ngắt. Metadata client hồi quy cũ
chỉ phủ 6 operation trước đó; operation booking flag mới có unit và native RPC,
chưa thêm native application-client path. Không suy 8 operation đều được kiểm
qua cùng client hoặc mọi caller đã ngừng endpoint legacy.

## Thay đổi nghiệp vụ và mã nguồn

`deposit_amount` đã được tính vào khoản khách trả. Báo cáo dòng tiền cộng
completed `booking_payments`; tạo một completed payment để giữ lại khoản cọc
đã thu sẽ đếm hai lần. Vì vậy bản sửa dùng private resolution ledger để phân
loại khoản đã có, với `cash_movement = 0`.

- **Giữ cọc:** ghi retained amount, không tạo receipt thu tiền lần hai; giữ
  nguyên deposit/amount_paid và trạng thái vật lý phòng.
- **Cần hoàn cọc:** ghi nghĩa vụ `refund_due`; UI không báo đã chuyển tiền.
- Status booking, resolution, audit và receipt được ghi cùng transaction.
  Một booking có một resolution; cùng key/payload replay ổn định, khác payload
  conflict, hai actor/hai key không có hai quyết định tài chính.
- RPC legacy forward về command có guard. Lệnh legacy đã hủy trả conflict,
  không HTTP 200 với null. No-show cũ chưa có resolution yêu cầu đối soát,
  không được backfill hoặc phân loại âm thầm khi nâng cấp.
- Guard chặn đổi status/tiền/tenant/hotel/room sau resolution và chặn thu thêm
  vào terminal no-show. Scope resolution phải khớp booking khi đọc; mismatch
  legacy trả null, không lộ dữ liệu tenant khác.

Migration mới trong worktree integration:
`supabase/migrations/20261027042128_booking_no_show_deposit_resolution_commands.sql`.
Không sửa migration 565 để che lịch sử. Private ledger bật RLS, revoke trực
tiếp cả service role; chỉ RPC có live actor/capability được dùng. API đọc giữ
quyền bookings update/manage hiện thời, chưa cấp cho vai trò chỉ đọc tài chính.
Snapshot theo private-command pattern hiện có; chưa có cross-table FK trong
private ledger, nên guard/scope controls không thay quy trình đối soát legacy.

Client `src/lib/room-operation-command.ts` trong integration
thêm normalizer/receipt validation cho no-show và booking flag; kiểm context
và invariant tiền. Hook/dialog dùng executor/recovery, bỏ toast trùng, giữ
unknown intent và chỉ đóng khi còn đúng view. Booking history hiển thị quyết
định ngay cả khi không có payment, phân biệt pending refund. Hai RPC có types;
không đưa direct private ledger vào client.

## Đối chiếu baseline, không viết lại lịch sử

903B có 497/500: 3 assertions giữ cọc/retry chưa đạt. Candidate này giữ 441
controls hồi quy và 27 command cờ. 32 nhãn baseline giữ nguyên, nhưng expected
tài chính/retry được thay có chủ đích theo contract:

1. `no_show_fees` đếm **retained classification** trong private resolution,
   không yêu cầu fake completed payment.
2. Rollback được kiểm bằng deliberate ledger fault; không dựa vào lỗi CHECK
   23514 tình cờ trong implementation cũ.
3. Hai lần gọi legacy cho cùng ý định đều trả outcome ổn định, một resolution,
   thay expectation một lần thành công và lần sau conflict.

Đây là điều chỉnh bài kiểm theo contract mới, không tuyên bố toàn bộ assertions
cũ không đổi và tự chuyển xanh. Các reports/artifacts 902, 903A/903B giữ nguyên.

Candidate trung gian **912A**, SHA `d60a8570…`, có 530/530 native, 77/77 nguồn
phòng, 122/122 frontend, TypeScript đạt, lint 0 lỗi/28 cảnh báo. Sau review thêm
scope/locator immutability, legacy cancelled guard và 6 native controls;
912A không được dùng làm bằng chứng cho các phần thêm ở 912B. Không chạy full
control 912A. Một lần frontend thăm dò trước đó lỗi collection do mock import
Supabase config; sửa fixture mock rồi kiểm lại. Không có source SHA của lượt
thăm dò, không gắn nó vào candidate giả định.

## Quyền, advisors và tính toàn vẹn môi trường

Pinned Supabase CLI **2.121.0**, advisor scan 728 findings: 35 INFO RLS bật
không policy, 7 INFO unindexed FK, 503 INFO unused index, 183 WARN multiple
permissive policies. Chưa disposition theo đối tượng; unused index phụ thuộc
workload không tự là vấn đề bảo mật. Thêm ledger private giải thích số direct
ACL target tăng 34→35; không phải bằng chứng đã khép quyền gián tiếp.

35 direct ACL targets đã kiểm; fixture writers có dữ liệu 15 bảng, nguồn
phòng 6 bảng. Harness kiểm source/migrations/runtime/guard/worksheet và schema
trước-sau. Cleanup theo exact run label được xác minh lại bằng truy vấn độc
lập container/volume/network; artifact ghi kết quả. Chỉ dùng fixture thuộc
run; không chạm DB đang phục vụ, CRM, VPS/DNS/provider/email thật.

Chỉ 6 tài liệu và artifact đã lọc được đồng bộ về thư mục dự án chính;
implementation vẫn ở integration. Index chính và hai delivery ledgers giữ
nguyên; không commit/stage/reset/merge. 70 hàng nghiệm thu `not_run`, 122
entries `unverified`, gates/reviewers/signoff không đổi.

## Việc còn thiếu và ảnh hưởng

- **RW5.7 upgrade 564→566 có dữ liệu/rollback:** fresh 566 không chứng minh
  dữ liệu khách đang chạy được nâng cấp an toàn. Nhận trước khi deploy.
- **Legacy, tiền trả trước và báo cáo:** không tự phân loại no-show cũ;
  `amount_paid` khác cọc chỉ được giữ snapshot. `useRevenueReport` vẫn chỉ
  tổng hợp checked_out, chưa đưa doanh thu giữ cọc vào báo cáo tổng.
- **Hoàn tiền/cancellation:** `refund_due` chưa có luồng hoàn tất hoàn tiền
  thực tế. Cancellation command/caller và nghĩa tài chính vẫn cần xử lý riêng.
- **Read-only finance:** API lịch sử hiện cần quyền sửa/manage booking;
  cần chốt ma trận trước mở vai trò kế toán chỉ đọc.
- **Writer graph:** flagged transfer, group pending payment, staged quote/
  payment/correction/retention và RW6–RW8 chưa khép. Group pending payment
  có thể neo booking khác chứa member no-show; guard chặn áp tiền vào member
  no-show, chưa thay kiểm toàn đồ thị tạo yêu cầu.
- **Toàn nền và vận hành:** Q03 configured workflow/dispatcher/indirect/advisors;
  Q04 freeze/default-full/rebuild; cảnh báo/admission/budget/signup/jobs/abuse,
  hai console, Linux/TLS/offsite restore/on-call, A/B/E2E/tải/RC và pilot ≥7 ngày.

Chưa browser/Android, proxy transport fault thật, production UID/mounts,
provider/device, deployment hoặc xác nhận sức chứa. Chưa mở signup public.
