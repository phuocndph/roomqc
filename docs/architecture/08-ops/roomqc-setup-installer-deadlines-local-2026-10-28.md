# RoomQC — timeout bộ cài và phục hồi cùng yêu cầu

Ngày 28/10/2026. Đây là diagnostic local của lần1/T08/T12; không phải nghiệm thu VPS hoặc sản phẩm. [Kế hoạch tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md).

## 1. Thay đổi

[Proxy PG](../../../server/control/testing/setup-installer-pg-proxy.mjs) chỉ giữ/chuyển frame thật, ghi SQLSTATE và timing đã lọc; sửa handshake release và theo dõi query còn chờ. [Deadline harness](../../../server/control/testing/setup-installer-deadline-native.mjs) chạy actual CLI với connect/query4s, statement3s, lock1s và session45s. [Hook giao dịch](../../../server/control/testing/setup-installer-transaction-native.mjs) tạo trước approved fingerprint trong DB sở hữu riêng; PgSleep nằm sau mutation witness, được statement_timeout thật hủy. Hook được gỡ trước đối chiếu schema cuối. Không đổi timeout, quyền hoặc migration sản phẩm.

## 2. Actual theo từng cửa sổ

| Ca | Barrier / SQLSTATE | Thời gian quan sát |
|---|---|---|
| DL01 | Authentication R | 9259 ms |
| DL02 | Original PG response held | 8683 ms |
| DL03 | 55P03 | 1006 ms |
| DL04 | 57014 | 3001 ms |
| DL05 | Original PG response held | 9592 ms |
| DL06 / before-receipt | Original PG response held | 7985 ms |
| DL06 / after-rename | Original PG response held | 14769 ms |
| DL07 | Original PG response delay | 48765 ms |

Elapsed CLI gồm cả startup/đọc cấu hình; không đồng nhất với timeout network. Riêng DL03/DL04 là elapsed server statement. DL07: hai kết nối sống 44986/44587ms; 27/28 response được chuyển, query đã chuyển lâu nhất 1908ms. Mọi query đã chuyển và query đang chờ lúc disconnect đều dưới4s. Timer45s bắt đầu sau khi đọc cấu hình; không gọi đây là giới hạn toàn bộ thời gian đọc file.

- DL01/DL02: không command/credential/audit hoặc file mới; DB/file trước–sau giữ nguyên.
- DL03/DL04: thấy Lock/PgSleep và SQLSTATE55P03/57014; sequence witness đã thấy mutation trước khi statement bị hủy. Sau backend terminal, authority/management/predecessor/credential/command/audit rollback toàn bộ.
- DL05: giữ response sau issue commit; đúng một credential/command/audit, output chưa có. Replay cùng caller/key/body phục hồi file và native RPC; không đổi ID/iat/exp.
- DL06: trước receipt chưa có output; sau rename có file hoàn chỉnh nhưng CLI không báo verified. Publish lại cùng receipt giữ file/expiry và native RPC, không mint thêm.
- DL07: nhiều query riêng lẻ dưới4s nhưng tổng chạm45s, hai session bị discard, không false success. Replay issue gốc giữ credential/expiry và đúng một effect.
- DL08:13 lần sau fault/recovery dùng phiên độc lập kiểm LOGIN session đã hết và try-lock business727012/directory727001 thành công; không trả lock-bearing client về pool.

## 3. Candidate và bằng chứng

Backend291 files/hash `bb21bef86c200d3d09c950b11c96417710bb9a9a47af7af0d3a0200caec2a367`;584 business+19 directory migrations. Chuỗi migration không đổi. IF11 thêm25 kiểm có phạm vi;75 kiểm installer cũ được giữ trong100 kiểm hiện tại.

| Packet | Actual | Giới hạn |
|---|---|---|
| [Focused4ff9679f0f8a](../../../artifacts/roomqc-setup-installer-deadlines-focused-native-4ff9679f0f8a-local-2026-10-28.json) |100/100, terminal0, schema/source đầu–cuối khớp, cleanup0|Actual CLI/PG/REST local; signed release và signer fixture|
| [Nativee43c766bd1ab](../../../artifacts/roomqc-setup-installer-deadlines-native-e43c766bd1ab-local-2026-10-28.json) |362/362=184 nền+178 credential/status/publication/installer; installer100 nằm trong178; terminal0/cleanup0|Diagnostic, chưa full-default/rebuild/VPS|
| [Controlfa4c0b00f1f2](../../../artifacts/roomqc-workspace-recheck-fa4c0b00f1f2-local-2026-10-28.json) |673 tổng/671 pass/0 fail/2 skip,16 recheck; terminal0/source/cleanup0|Skip symlink Windows và notification POSIX mode còn mở|

Các packet trước giữ nguồn riêng, không ghi đè hoặc chuyển count sang source mới. Scoped local proof không đổi70ca not_run/122mục unverified/124lượt môi trường. Reviewer/signoff=null, không quyết định gate mới. Không phục vụ credential fixture hoặc migration trên serving DB; signup/dispatch/worker examples vẫn đóng.

Advisor của lượt native hiện tại ghi808 findings:561INFO và247WARN. Đây là số đo còn chờ disposition/reviewer, không phải chứng nhận an toàn hoặc lý do để mở gate.

Lượt đầu trên source dd631e được giữ riêng: [focused1714b9632eab](../../../artifacts/roomqc-setup-installer-deadlines-focused-native-1714b9632eab-local-2026-10-28.json)100/100 và [control37ff54ec5c22](../../../artifacts/roomqc-workspace-recheck-37ff54ec5c22-local-2026-10-28.json)671pass/0fail/2skip; đều terminal0/cleanup0. Lượt đó chưa lưu tổng thời gian từng query từ lúc gửi đến chuyển tiếp và chưa tách query đang chờ với kết nối nhàn rỗi. Candidate mới bổ sung phép đo và assertion này; không gọi lượt cũ là failed hoặc dùng nó thay proof của source mới.

## 4. Nhận tiếp

IF12: actual CLI SIGKILL tại intent/stage/trước–sau rename, barrier và recovery cùng key. IF14/IF15: UID không đặc quyền, mode/owner/link/canary và lỗi filesystem/volume thật. Chưa đóng full fault matrix hoặc lần1. Tiếp rotation/two-rotator/expiry, read-only directory mount/reload, Auth→directory revoke, T10, signup/email, hai console, full-default/rebuild, VPS/TLS/offsite DR/on-call, A/B/browser/Android/tải/RC/pilot≥7ngày. Goal toàn plan giữ active.
