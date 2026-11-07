# RoomQC — kiểm thử Edge worker thật qua HTTP

Ngày chốt: 19/10/2026, Asia/Bangkok. Đã hoàn thành phần kiểm thử local tiếp
theo của worker `check-subscription-status`. Không tìm thấy lỗi ứng dụng mới
trong phạm vi này. Không thay runtime 8082, migration, chính sách hết hạn hoặc
bật scheduler/provider. Đây chưa phải nghiệm thu production hay toàn A0–A4.

## Cách chạy và phạm vi

Luồng thật: HTTP loopback → gateway nginx riêng → entrypoint Edge hiện có →
supabase-js → PostgREST → bản restore đầy đủ. Dùng chính `index.ts`, helper
xác thực và batch handler của ứng dụng, không mock RPC hoặc bỏ xác thực.

Runtime `public.ecr.aws/supabase/edge-runtime:v1.77.4`, image ID
`sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8`.
Bundle offline từ cache dependency sao chép read-only, SHA256
`8711b02dc751f6b445373b0cbbf5dab476e537c8d814a179c947f0ae29036218`.
Container bundle không có mạng hoặc khóa database. Worker chỉ nối network
internal của sandbox, không publish cổng, dùng khóa riêng của bản restore.
Gateway phục vụ tại 127.0.0.1:18921; frontend 8082 không tham gia phép thử.

Lượt thành công `d5278f82bbba`, xác minh lúc `2026-10-19T01:54:55.781Z`.
Restore độc lập trước thử khớp 203 bảng/dữ liệu, 385 policy, 903 constraint,
460 function. Snapshot `2026-10-19T01:53:59.712Z`, restore khoảng 3,8 giây;
không dùng con số này làm RTO production. Backup giữ tại thư mục cha chung:
`backups/roomqc-restore-d5278f82bbba.local/`. SHA256 dump:
`96743d27a6a783c3fb30f954595c48ef9db508f7718bb330a6fa92066760ed29`.

Tạo thêm 58 tenant mẫu: 56 trong lượt đầu, một tenant thiếu owner để thử lỗi
giao thông báo và một tenant đủ điều kiện nhưng ngoài scope làm đối chứng.
Mỗi POST được cấp quyền đều chỉ gửi danh sách UUID mẫu, không gửi cluster.

## Kết quả

23/23 kiểm tra HTTP/DB thật và 13/13 Node regression công cụ đạt. Cú pháp,
ESLint bốn script thay đổi và diff whitespace đạt. Không chạy lại full suite
ứng dụng/browser; không cộng các kết quả cũ vào số kiểm tra mới.

| Kiểm tra | Bằng chứng |
|---|---|
| Phương thức/xác thực | GET 405; thiếu khóa, khóa sai, anon và phiên owner thật đều 403 |
| Scope đầu vào | Thiếu scope, danh sách rỗng, body dư trường đều 400; không tạo run |
| Xử lý nhiều lô | 53 active/trial → grace, 1 grace → suspended; 54 thông báo |
| Receipt thật | 6 batch, số dòng xử lý 50/3/1/50/4/1; hai batch đủ 50 cho transition và delivery |
| Ngày biên và dữ liệu thiếu | Hết hạn hôm nay và null grace không đổi, giữ nguyên policy hiện tại |
| Giới hạn tenant | Tenant đủ điều kiện ngoài scope và mọi tenant không nằm trong tập thử giữ nguyên |
| Trạng thái nhân viên | Người quá 30 phút trong scope thành offline; đối chứng ngoài scope còn available |
| Gọi lại HTTP | Run mới thành công với 0 transition/0 thông báo; command/outbox/notification không đổi |
| Thiếu owner | HTTP 500, run failed, 1 outbox pending, mã NOTIFICATION_FAILED; không báo thành công giả |
| Bổ sung owner rồi thử lại | Bearer service-role sandbox được chấp nhận; giao nốt 1 thông báo, không transition thêm |
| Chống trùng sau sửa owner | Đúng 1 command, 1 outbox delivered và 1 notification cùng ID |
| Tài chính | Toàn bộ invoice/payment của bản restore không đổi |
| Database chính | Hash nội dung 9 bảng tenant/user/staff/tài chính/thông báo/run/command/outbox không đổi |
| Cleanup | Container bundle/worker/API/Auth/REST/restore, network và khóa tạm đã dọn; chạy lần hai no-op |

Run đầu `24e9847c-5e1e-4f2c-bdc0-c47a4c48df46`; run gọi lại
`1e5dcf81-44f6-45ba-9f71-bd22d21de98b`; thiếu owner
`2e0a5df0-dc82-47ea-99a5-32dee31059bd`; giao lại
`8881d203-d622-461b-9ddd-b04b13e4d26d`.
Kết quả máy đọc được giữ tại
`artifacts/roomqc-edge-http-result-d5278f82bbba.local`, không chứa khóa và không
đưa vào Git. Backup của các lần thử trước được giữ, không tự xóa.

Hai lần đầu dừng do dữ liệu mẫu không phù hợp trigger đầy đủ, đã sửa bộ thử:
user tự sinh staff_status nên phải cập nhật thay vì chèn trùng; trigger tenant
tính grace từ end date nên dùng end date quá 10 ngày cho mẫu hết grace và đặt
null-grace sau INSERT. Có assertion trạng thái mẫu sau trigger, không tắt
trigger hoặc sửa quy tắc ứng dụng để làm test đạt. Các lượt thất bại đã dọn.

## Công cụ và chạy lại

```powershell
node scripts/test-roomqc-backup-restore-isolated.mjs --keep-sandbox
node scripts/setup-roomqc-browser-sandbox.mjs --prepare-only
node scripts/test-roomqc-edge-http-sandbox.mjs
node scripts/cleanup-roomqc-browser-sandbox.mjs
```

Nếu harness lỗi, giữ sandbox để đọc bằng chứng rồi cleanup và tạo lượt mới;
không chạy lại harness trên worker còn tồn tại. Setup vẫn tiếp tục được theo
cơ chế cũ. Cleanup mở rộng allowlist tên/nhãn sở hữu cho bundle và Edge, kiểm
tra toàn bộ trước khi xóa; regression thêm trường hợp Edge mang nhãn khác.
Không xóa cache dependency của runtime chính, host backup hoặc ảnh ứng dụng.

## Giới hạn và bước tiếp

Entrypoint chạy làm main-service của runtime qua eszip để kiểm chứng handler
và HTTP thật. Chưa thử dispatcher per-worker/Kong/TLS/reverse proxy của VPS,
cắt mạng giữa commit và HTTP response, timeout triển khai hoặc failover máy.
Mất phản hồi sau commit đã có kiểm tra SQL-adapter/browser ở đợt trước, không
gọi đó là bằng chứng fault injection của runtime trong đợt này. Đây cũng không
phải thử tải; 58 tenant mẫu không chứng minh số user đồng thời.

Runtime chính vẫn healthy, image `roomqc-local:review-fixes-20261018`, ID
`sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b`;
520 migration, 5 cron có sẵn, 0 lịch lifecycle. Không triển khai lại ứng dụng.

Tiếp theo: chốt chính sách expiry/anomaly còn thiếu; nghiệm thu cùng worker
trên staging/VPS với scope fixture trước khi bật lịch; backup offsite và
Storage/Vault; đo thử tải, cảnh báo và diễn tập vận hành. Các mục cần khóa/quyền
và quyết định sản phẩm tiếp tục theo
[danh sách để sau](roomqc-deferred-access-and-decisions-2026-10-17.md).
