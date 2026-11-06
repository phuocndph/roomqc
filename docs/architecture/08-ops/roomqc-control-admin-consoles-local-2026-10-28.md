# RoomQC — hai console quản trị đã nối dữ liệu đọc local

Ngày 28/10/2026. [Artifact](../../../artifacts/roomqc-control-admin-consoles-local-2026-10-28.json) giữ source, exit và giới hạn. Đây là T14 triển khai local cùng phần đọc T15/T16 và điều hướng T17; chưa nghiệm thu trọn các task.

**Cập nhật sau packet này:** [T07 backend](roomqc-control-alerts-local-2026-10-28.md) và
[client/UI cảnh báo](roomqc-control-alert-ui-local-2026-10-28.md) đã có proof local.
Phần còn thiếu và native allowlist bên dưới mô tả thời điểm packet đọc này;
nhận việc hiện hành từ [bản bàn giao](roomqc-vps-signup-handoff-2026-10-28.md).

## Đầu ra

- Menu chính có Hạ tầng và Đăng ký mới; route tương ứng đã nối trong App. Layout chỉ mount child sau khi auth/session/profile khớp, tài khoản active và có quyền platform. Server vẫn kiểm live authority trên mỗi request.
- Hạ tầng đọc cụm/list/detail, trạng thái nhận khách, số đã cấp/giới hạn, health/metric và timestamp. Null hoặc số đo hết hạn không thành 0% hoặc tiếp tục báo đang nhận khách; UI tự đổi khi hết hạn snapshot.
- Đăng ký mới tìm/lọc phía server, cursor, chi tiết job/receipt/timeline; unavailable khác missing/conflict. Không có nút tạo lại provisioning.
- Client chặn response cũ theo actor/session/runtime/target và epoch; có abort/deadline, không lưu bearer vào query key. Native chỉ thêm allowlist GET đã có handler, giữ public origin cấu hình và cấm mutation admin.
- Mở chi tiết đưa nội dung lên đầu; trở lại giữ URL/bộ lọc/cursor và phục hồi vị trí cuộn sau khi danh sách tải xong.

## Bằng chứng

| Phạm vi | Kết quả |
|---|---|
| Client, hook, guard, component, transport, hồi quy workspace | 79/79, 8 file, 0 skip, exit 0 |
| Client production biên dịch → web transport mặc định → HTTP → PostgreSQL riêng | 12/12, exit 0 |
| Dataset/phân trang | 1.000 metadata, 40 trang, không lặp hoặc thiếu |
| Tác động đọc | 46 GET; snapshot 6 bảng trước/sau khớp |
| Runtime/cleanup | Role API không superuser; kiểm độc lập 0 container/volume/network của run |
| TypeScript/lint file sửa | Exit 0 |
| Production/PWA build | Exit 0; còn cảnh báo shared chunk lớn |

Bài HTTP dùng database và server thật, adapter quyền/remote receipt giả lập và shim origin cho URL tương đối của Node. Không thay live Supabase Auth/RPC hoặc E2E browser/Android. Chi tiết: [run79b83b93a8bd](../../../artifacts/roomqc-control-admin-read-79b83b93a8bd-local-2026-10-28.json). Lượt9847070c3b33 trước đó dùng injected request adapter; giữ artifact làm lịch sử, không cộng hai lượt thành thêm ca nghiệm thu.

## Còn phải triển khai và kiểm

T07: lifecycle cảnh báo, outbox cùng transaction, dispatcher lease/retry/dead-letter và API list/ack. T15: thao tác cụm + tra kết quả lệnh, cảnh báo/sao lưu và ưu tiên cụm lỗi theo server. T16: totals, tenant-summary và durable recheck. A03/E08 cần live authority/canonical cluster và browser/Android; E01/E02 cần bài tìm ca kẹt có người thao tác. Scroll được kiểm DOM, chưa chứng minh hình học trình duyệt thật hoặc zoom 200%.

70 ca vẫn not_run, 122 mục release vẫn unverified, reviewer/signoff/gate không đổi. Parent-boundary đã có scoped diagnostic đạt; default full và independent rebuild của candidate cuối vẫn mở. Chưa triển khai lên VPS hoặc sửa database chính.

**Việc nhận tiếp:** T07 lifecycle/outbox/API cảnh báo; chuẩn bị theo dependency T06, không tự ký T06 hoặc mở admission/signup. Cảnh báo mất host phải có kênh ngoài host trên staging.
