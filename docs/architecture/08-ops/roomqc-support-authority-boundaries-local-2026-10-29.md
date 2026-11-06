# RoomQC — quyền quản trị sau chờ SQL và đọc kết quả, local 29/10/2026

Đã kiểm cùng source324/SHA256 `155f197c07839ba0535ac68f94f37898c89ee61375892f1646139b013c796556`,585 business/19 directory migrations. [Packet](../../../artifacts/roomqc-support-authority-boundaries-2765aadfaabb-local-2026-10-29.json) giữ actual/source/schema/failed runs/cleanup. Đây là kết quả scoped của R11; **chưa đóng R11/BG02 hoặc nghiệm thu toàn sản phẩm**. [Checkpoint323](roomqc-support-authority-local-2026-10-29.md) giữ bằng chứng timeout COMMIT và3scenarios ở hash riêng.

## 1. Ba lỗi được tái hiện và sửa

1. GET command-result và GET admin list từng chỉ kiểm quyền trước khi đọc. Khi SELECT bị khóa, quyền có thể bị thu hồi nhưng response vẫn200. Nay các admin read/result kiểm lại quyền hiện hành ngay trước gửi dữ liệu; POST replay và legacy lookup cũng được kiểm sau đọc.
2. Recheck từng kiểm Auth trước truy vấn release cuối. Nếu truy vấn này chờ và quyền bị thu hồi trong lúc chờ, command vẫn có thể commit. Nay kiểm lại Auth sau SQL đó, rồi xét expiry bằng thời gian đơn điệu, không thêm remote/SQL await trước COMMIT ngoài chính COMMIT.
3. Ba ca đỏ ban đầu đều tái hiện hành vi cũ; đã xanh sau sửa. SQL release/approval/job vẫn phải hợp lệ; không mở rộng quyền runtime hoặc gỡ assertion effects để làm test đạt.

Fresh checks vẫn là quan sát. Chúng không giữ quyền Auth xuyên directory COMMIT và không chứng minh atomic revocation giữa hai database. Giới hạn này giữ nguyên.

Code: [HTTP](../../../server/control/app.mjs), [recheck](../../../server/control/setup-recheck.mjs), [DB cases](../../../server/control/support-authority-cases.mjs), [native boundaries](../../../server/control/testing/setup-support-boundaries-native.mjs), [native API](../../../server/control/testing/setup-api-native.mjs).

## 2. Kiểm chứng cùng candidate

| Lượt | Actual | Giới hạn |
|---|---|---|
| Control regression |708 tổng,516pass/0fail/192skip; exit0 |Skip không tính đạt; không thay full backend integration |
| Directory PostgreSQL |160/160pass,0fail/0skip; exit0 |DB/container fixture riêng, runtime LOGIN theo scope |
| Native Auth/REST/HTTP 2765aadfaabb |63checks,14revoke scenarios,16barriers và1API SIGKILL; exit0 |Approval/health và tài khoản confirmed là fixture; chưa web/inbox/Android |

Source giữ nguyên từ snapshot tới cuối các run. Schema nghiệp vụ đầu–cuối `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`; không có migration sản phẩm mới hoặc ghi vào DB đang phục vụ. Temporary directory RLS/trigger chỉ định vị final release query, được bỏ trước cleanup; schema cuối khớp.

## 3. Coverage Auth thật và effects

| Cửa sổ | Bằng chứng |
|---|---|
| Cluster execute chờ lock/audit |Account lock, bỏ super_admin và xóa Auth session; JWT còn hạn, lệnh đang chờ bị từ chối, không mutation/receipt thành công |
| Register chờ cluster_events |Khóa account trước nhả barrier; draft cluster/host/command/event không được thêm; same key sau khôi phục tạo đúng một effect |
| Alert acknowledgement chờ outbox |Rollback alert/version/event/outbox/receipt; same key sau khôi phục chạy được |
| Legacy reconcile chờ final audit UPDATE |Không activation/binding/job/business effect; đúng một audit failed bền vững được phép và khai báo từ đầu; sau khôi phục reconcile thành công |
| Recheck chờ event và chờ release SQL cuối |Rollback command/event/cycle/job/workspace; cùng key sau khôi phục tái sử dụng job gốc |
| Result/replay/admin-list/support-lookup chờ table lock |6đường đã qua entry Auth, rồi account bị khóa khi SELECT đang chờ; response401/403, không effects; unlock/khôi phục đọc lại được |

Barriers quan sát pg_locks/pg_stat_activity theo exact DB+API LOGIN; không thay Auth bằng boolean ở native. Mỗi lần revoke xác nhận JWT còn hạn và HTTP mới đã bị từ chối trước nhả SQL blocker. So17bảng directory và11bảng nghiệp vụ; explicit Auth fixture mutations được đo riêng trước khi nhả blocker. Audit thất bại của legacy support là ngoại lệ duy nhất đã định nghĩa; không gọi toàn bộ database bất biến.

Registration fixture chỉ có hai draft inventory entries, chưa backend thứ hai. Legacy fixture dùng HTTP reserve + SQL đưa directory về trạng thái legacy với receipt từ RPC thật; không dùng làm proof signup E2E. Recheck dùng HTTP provision rồi SIGKILL API trước remote call, giữ dispatch/job ban đầu.

## 4. Failed history và cleanup

- Baseline3/3fail được giữ trong packet; scoped green và full regression không xóa lịch sử đó.
- Full directory lần đầu159/160pass: assertion đếm20 lần Auth nhưng thực tế23 do3successful result reads được kiểm lại. Đã sửa expected có giải thích, thêm per-boundary assertions, kiểm2ca riêng rồi chạy full160/160 trên nguồn khóa.
- Native lần đầu dừng khi reserve nhận503: ca execute trước đó cố ý đóng admission. Fixture nay mở lại qua HTTP command có quyền trước chuẩn bị signup cases. Không sửa điều kiện admission của sản phẩm. Run lỗi được giữ với source/hash và terminal1, không tính là native pass.
- Native bỏ16role thêm và khôi phục baseline; không API session active/idle-in-transaction còn lại. Kiểm Docker độc lập hai native projects và4directory run labels:0objects đúng scope. Không dọn Docker toàn máy. Protected ledger/worksheet/execution-plan giữ nguyên3hash.

## 5. Việc còn lại theo kế hoạch

1. Thực hiện [phiếu chốt protocol revoke](roomqc-vps-signup-execution-dossier-2026-10-29.md#51-phiếu-chốt-giao-thức-thu-hồi-quyền-còn-thiếu): điểm nhận lệnh/điểm hiệu lực, cơ chế thực thi, partition/crash/recovery và bằng chứng sau final observation. Không suy từ63checks rằng R11 đã đóng.
2. Kiểm worker claim→RPC→settle và service recovery của receipt đã nhận trước revoke. Recovery không được tạo tenant/hotel/trial mới hoặc buộc owner đăng ký lại vì logout.
3. BG03 inventory/budget/quota/admission; BG05 backup và tenant-summary vẫn planned. Tiếp BG04–BG11 theo dependency: full-default/fresh rebuild, Linux VPS/TLS, offsite DR/on-call, hai cụm, browser/Android, measured capacity/cost và pilot≥7ngày.

Giữ70ca/124lượt chính thức và122release entries chưa nhận; actual/reviewer/signoff/gates không đổi. Người dùng xác nhận phạm vi plan+nghiệm thu, không phải ký nhận sản phẩm. Goal toàn bộ plan vẫn active.
