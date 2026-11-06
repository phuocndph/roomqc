# RoomQC — quyền quản trị hiện hành và COMMIT lock timeout, local29/10/2026

Đã kiểm local đúng source323/SHA256 `35cc701645cdc0f05c8ca899a83b945906d91467d65760ee8be8a6908716f71b`,585 business/19 directory migrations. [Artifact](../../../artifacts/roomqc-support-authority-a70e1e0cf697-local-2026-10-29.json) giữ source/schema, native controls, failed history, regression và cleanup. Đây là bằng chứng một phần R11, chưa đóng R11/BG02 hoặc nghiệm thu sản phẩm.

## 1. Lỗi và thay đổi

- HTTP từng kiểm quyền ở đầu request; khi lệnh chờ directory lock hoặc audit trigger, quyền có thể đã bị thu hồi trước khi commit. Các đường execute/register/alert acknowledgement/recheck/support reconciliation nay bắt buộc callback kiểm quyền hiện hành, đúng actor+authority cluster; có fresh checks trong transaction thay vì tin actor cũ từ entrypoint.
- Helper chặn missing authorizer, đổi actor/cluster và authority unavailable, dùng timeout5giây cho observation. Fixture doubles được tách rõ, chỉ import từ test/case files; runtime vẫn gọi gateway RPC thật.
- Đã tái hiện `statement_timeout=5s` không tự hủy deferred trigger đang đợi advisory lock tại COMMIT. Bổ sung transaction-local `lock_timeout=5s`; giữ statement5s và idle-transaction6s. Ca thật nhận SQLSTATE55P03 trước harness deadline, rollback toàn policy/version/command/event, timeout không rò sang request kế và same-key recovery/replay đúng một effect.
- Harness deadline luôn nhả blocker thuộc fixture và thu pending outcome. Harness tự nhả khóa hoặc hủy thủ công không được tính là product timeout proof. CLI observer cũng phát hiện child kết thúc trước barrier, tránh chờ vô ích120giây khi barrier không thể tới.

Code: [authority helper](../../../server/control/support-authority.mjs), [admin](../../../server/control/admin.mjs), [alerts](../../../server/control/alert-commands.mjs), [recheck](../../../server/control/setup-recheck.mjs), [support](../../../server/control/support.mjs), [store](../../../server/control/store.mjs), [HTTP wiring](../../../server/control/app.mjs), [DB cases](../../../server/control/support-authority-cases.mjs), [Auth/HTTP diagnostic](../../../server/control/testing/setup-support-authority-native.mjs).

## 2. Kết quả thực thi cùng bản nguồn

| Run | Actual | Giới hạn |
|---|---|---|
| Control suite |705 tests:516 pass/0fail/189skip; terminal0 |189skip không tính đạt; không thay full backend integration |
| Directory PostgreSQL suite |157/157pass,0fail/0skip; terminal0 |Postgres16 container riêng, gồm5 ca authority và CLI response-loss/SIGKILL/resume |
| Native Auth/HTTP `a70e1e0cf697` |14 checks,3 observed barriers,3 revoke scenarios; terminal0 |API child bằng LOGIN runtime thật, Auth/REST thật; fixture approval/health và tài khoản confirmed do GoTrue admin tạo |

Nguồn giữ nguyên từ snapshot trước ba run tới lúc ghi packet. Schema nghiệp vụ trước/sau `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`; full schema khớp. Các run scoped trước và run thất bại được giữ riêng trong `.local/`; không cộng count giữa source hoặc sửa lịch sử fail.

## 3. Ba cửa sổ revoke qua Auth/HTTP thật

| Cửa sổ và thay đổi fixture | Đối chứng thực tế |
|---|---|
| Account locked trong lúc lệnh đợi advisory727001 |JWT vẫn còn hạn; HTTP read mới và lệnh đang chờ đều bị từ chối; policy/version/command/event không đổi |
| Gỡ role super_admin khi INSERT audit đang chờ barrier |Lệnh đã tới transaction/audit thật nhưng rollback toàn mutation; không có receipt thành công; role được khôi phục trong fixture |
| Xóa auth.sessions khi INSERT audit đang chờ barrier |Không đổi JWT; lệnh đang chờ bị từ chối, phiên đã revoke không đọc được receipt cũ; operator khác còn quyền vẫn ghi được |

Mỗi ca quan sát lock trong pg_locks/pg_stat_activity theo exact database+API LOGIN, kiểm mutex được giải phóng và không còn API session active/idle-in-transaction. Có positive cùng operator và same-key replay trước fault, positive operator còn quyền sau fault.

11 bảng nghiệp vụ được so sau explicit Auth fixture mutation nhưng trước khi nhả blocker, rồi so sau lệnh bị từ chối. Vì bài thử chủ động lock/unlock profile, gỡ/thêm role và xóa session của fixture, không tuyên bố toàn database không có bất kỳ thay đổi nào. Bằng chứng là **command bị từ chối không tạo thêm business effect**.

## 4. Hồi quy lỗi và cleanup

Run directory đầu có155pass/2fail: assertion HTTP còn đếm10 thay vì13 authority checks, và CLI observer hết thời gian chờ post-commit barrier. Đã sửa counter cho ba fresh checks và observer để race child exit; hai ca riêng đạt lại, rồi full157/157 trên nguồn khóa. Run đầu có source edits đồng thời, không dùng làm acceptance nguồn hiện tại; nguyên nhân gốc của timeout CLI lúc đó chưa được chứng minh. Giữ nguyên failed log thay vì gọi một lần retry xanh là đủ giải thích nguyên nhân.

Native dọn16 role do fixture thêm và khôi phục role catalog baseline; DB/drop và child shutdown nằm trong finally. Kiểm Docker độc lập cho exact project:0container/0volume/0network; fixture directory của full run cũng0container. Đây không phải kiểm hoặc dọn toàn bộ Docker của người dùng. Ba tệp protected ledger/worksheet/execution-plan giữ hash gốc.

## 5. Phần chưa hoàn tất và việc tiếp theo

1. Chốt protocol điểm hiệu lực revoke/fencing giữa Auth, directory và business. Fresh RPC là observation, không giữ Auth row lock tới directory COMMIT; revoke sau final check vẫn chưa được chứng minh ngăn commit.
2. Bổ sung Auth/HTTP thật cho register, alert acknowledgement, support reconcile, recheck và lookup đang chờ; proof ba ca hiện tại tập trung cluster command. Rà lại vị trí final authority check cạnh các truy vấn budget/release của recheck.
3. Thử các cửa sổ trước claim/trước remote RPC/trước settle, phân biệt fresh authorization với hoàn tất receipt/history đã được nhận trước revoke. Không tự bắt service recovery cấp lại tenant hoặc yêu cầu owner đăng ký lại.
4. Cần Linux VPS/UID/mount/TLS proof, full-default/fresh rebuild, offsite DR, hai cụm độc lập, browser/Android, tải/chi phí và pilot theo [hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md). Không thay staging bằng Docker local.

Giữ70ca/124lượt chính thức,122mục unverified,actual/reviewer/signoff/gates không đổi. Goal toàn bộ plan vẫn đang thực hiện; đây không là đề nghị mở đăng ký công khai hoặc thu phí.
