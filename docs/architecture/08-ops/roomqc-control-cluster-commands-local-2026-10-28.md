# RoomQC — thao tác cụm VPS và phục hồi kết quả lệnh local

Ngày 28/10/2026. [Artifact](../../../artifacts/roomqc-control-cluster-commands-local-2026-10-28.json) giữ source và kết quả. Packet này nối năm lệnh vận hành hiện có vào typed client, journal và UI Hạ tầng của T04/T09/T15/T17. Không đánh dấu toàn bộ T09/T15 đã nghiệm thu.

## Đường sử dụng và tác động

Hạ tầng → Cụm dữ liệu → Xem chi tiết → Quản lý cụm. Bước xác nhận hiển thị tác động, cụm, phiên bản, số workspace đã cấp và yêu cầu lý do 5–1.000 ký tự.

| Thao tác | Hành vi đã nối và kiểm local |
|---|---|
| Đóng nhận khách mới | Đóng cấp phát mới; giữ workspace, mapping và dữ liệu khách đang dùng |
| Mở nhận khách mới | Server kiểm lại health/release/backup/capacity; UI không cho mở từ số đo thiếu/hết hạn hoặc cụm không active |
| Bắt đầu rút tải | Đánh dấu draining và đóng nhận mới; không tự di chuyển hoặc xóa dữ liệu |
| Chuyển sang hoạt động | Đặt active và vẫn đóng nhận mới; mở admission là lệnh riêng |
| Đổi giới hạn không gian | Gửi tenantLimit 1–1.000.000, giữ thresholds hiện tại; đóng nhận mới và yêu cầu proof health mới theo policy version |

Giới hạn này là số workspace của cụm, không phải số người online hoặc số phòng khách sạn. Nếu hạ dưới số đã cấp, dữ liệu cũ vẫn giữ và không còn chỗ cho đăng ký mới. Thao tác không khởi động/tắt máy VPS hoặc di chuyển khách giữa cụm.

## Lệnh bền vững và phạm vi phiên

Client lưu lệnh riêng vào localStorage và đọc lại trước POST. Bản ghi gồm target, operation, expectedVersion, reason, payload và key gốc, tách theo tài khoản/runtime. Key của lệnh cụm là TEXT phân biệt hoa thường trên server; client giữ nguyên qua POST và GET, không dùng cách chuẩn hóa UUID của lệnh cảnh báo.

Lệnh chưa rõ kết quả chặn lệnh mới cùng cụm và vẫn xuất hiện ở danh sách sau F5/đăng nhập lại. Kiểm tra kết quả gửi GET `/admin/clusters/{id}/command-result?operation=...`. 404 không chứng minh chưa commit và không tạo key mới. Chỉ sau khi tra không thấy, người dùng mới được chọn Gửi lại cùng lệnh; client tra lại rồi POST nguyên mã/nội dung.

Receipt phải khớp target, phiên bản tăng một và tác động của operation. Đây là snapshot lịch sử; UI tải lại chi tiết trước lệnh kế tiếp, không dùng receipt cũ làm trạng thái health hiện tại. Chỉ VERSION_CONFLICT/ADMISSION_BLOCKED/CLUSTER_NOT_FOUND được trả từ đường từ chối không commit mới cho phép đóng yêu cầu chờ. Denial/rate limit/malformed/conflict/network vẫn giữ journal.

Guard bảo vệ actor/session/profile/runtime và target, kể cả A→B→A. Ngân sách 30 giây bao gồm tra phiên và transport; native thêm đúng route command/result đã có handler, giữ Origin và không theo redirect. Chưa mở UI register/validate/bind telemetry hoặc chỉnh thresholds trong packet này.

## Bằng chứng

| Phạm vi | Kết quả |
|---|---|
| Client/journal/hook/UI/guard/transport và hồi quy workspace/cảnh báo | 155/155, 14 file, 0 skip, exit 0 |
| Client/journal production biên dịch → web transport → HTTP → PostgreSQL riêng | 17/17, exit 0; run `081d60716a31` |
| Hồi quy client cảnh báo qua HTTP/database | 13/13, exit 0; run `58782d180fa9` |
| TypeScript, lint file sửa, production/PWA build | Exit 0; còn cảnh báo vendor chunk lớn |
| Cleanup độc lập | Cả hai run không còn container/volume/network theo ownership label |

Relay đóng socket sau khi upstream trả xong: DB đã đóng nhận khách, journal giữ lại; API restart và session mới tra đúng receipt/key hoa. 12 POST replay chỉ một command/event. Sai actor, key sai chữ hoa/thường, body đổi cùng key, stale version và Origin sai được kiểm. Mở sau đổi policy bị từ chối, không tăng version hoặc tạo receipt; thresholds và workspace trước/sau giữ nguyên.

Chi tiết: [17 kiểm tra lệnh cụm](../../../artifacts/roomqc-control-cluster-client-081d60716a31-local-2026-10-28.json), [13 kiểm tra cảnh báo](../../../artifacts/roomqc-control-alert-client-58782d180fa9-local-2026-10-28.json). Lượt `5e4a6a620858` là kiểm trước thay đổi export constant; giữ làm lịch sử, không cộng số ca. HTTP/database là thật; authority/release/health là fixture giả lập. Journal của bài HTTP dùng Storage adapter bộ nhớ; bài component dùng localStorage jsdom.

## Còn phải khép

T09 còn expiry/close/first-dispatch và overload theo dependency T06/T07/T08; proof tranh suất trước đó vẫn có phạm vi riêng. T15 còn ưu tiên cụm lỗi, backup proof và các đường cấu hình nâng cao register/validate/bind telemetry/thresholds; OpenAPI vẫn giữ partial-local. Live Supabase authority, browser/Android, keyboard/390px/zoom và timed operator drill chưa nghiệm thu.

Nhận tiếp T10 budget tổng cụm: inventory replicas/pool/worker/queue/deadline → validator/headroom → overload/recovery local. Sau đó khép private setup-status/resume T11 và durable jobs/recheck T12 theo dependency; T16 totals/tenant-summary phải nối handler, client và UI. Các việc thiếu VPS/provider/khóa tiếp tục ghi đầu vào để làm sau.

Backend không đổi: 208 file, binding `33a58bbbb3df1891ea1ff70753b2b23d57cb206d9cada205261d8010fc9857e3`. Full native backend và independent rebuild vẫn cần ở candidate cuối. Giữ nguyên 70 ca `not_run`, 122 mục `unverified`, reviewer/signoff/gate. Chưa triển khai VPS hoặc thay database chính.
