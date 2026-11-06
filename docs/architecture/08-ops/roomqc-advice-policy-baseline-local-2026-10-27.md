# RoomQC — baseline API quản lý policy tư vấn trước khi sửa

Ngày27/10/2026, phiếu19.37 P1/P2. **Chạy đủ14 kiểm tra:7 đạt,7 chưa đạt.**
Không sửa policy sản phẩm trong lát này; kết quả đỏ được giữ làm đầu vào
triển khai. Không ghi đây là checkpoint nghiệm thu đạt hoặc tính ổn định.

## Phát hiện và ảnh hưởng

| Mục chưa đạt so với đích của plan | Actual từ Auth/REST/Postgres thật | Việc phải sửa |
|---|---|---|
| Live operator | Service key không kèm phiên người quản trị vẫn200 và tạo policy | Đóng legacy machine config, nối live platform actor |
| Read contract mới | get_operations_advice_policy trả404/PGRST202 cho admin hợp lệ | Thêm scoped read, missing khác lỗi kết nối |
| Command mới | set_operations_advice_policy trả404/PGRST202 | Thêm stable key, expected version, atomic policy/audit/receipt |
| Lookup mới | get_operations_advice_policy_command trả404/PGRST202 | Phục hồi outcome bằng mã gốc, không ghi lại khi timeout |
| Lặp payload legacy |20 request cùng payload tạo version20 và20 audit | Command idempotent; đây chưa phải thử same-key vì legacy không có trường key |
| Hai editor legacy | Cùng đọc version1; hai request đều200, kết thúc version3 và thêm2audit | CAS: một thắng, một409. Legacy không nhận expected version nên đây là khoảng trống contract |
| Expiry qua audit wait | Sau barrier thật3,568giây,200; policy đã hết hạn vẫn được lưu cùng1audit | Recheck clock ngay trước commit;4xx và rollback toàn bộ |

Service-role configuration hiện là hành vi được migration573 cho phép;
finding đầu là thiếu live operator theo plan mới, **không chứng minh owner
hoặc người chưa đăng nhập có quyền sửa**. Owner bị từ chối đúng. Tương tự,
20 payload legacy không có command key và hai editor không gửi expected
version vì endpoint chưa hỗ trợ; không gọi chúng là20 replay cùng key hoặc
CAS đã được triển khai nhưng lỗi.

Policy hết hạn được advice entitlement chặn khi sử dụng. Bằng chứng đỏ này
chứng minh đã lưu cấu hình không hợp lệ sau wait, chưa chứng minh provider
được gọi vượt hạn hoặc đã có thất thoát tiền. Không gọi provider trong run.

## Những ranh giới đã đạt

Có owner qua Auth thật và một platform admin có live session, được
platform_support_actor nhận đúng. Thiếu policy mặc định disabled; owner không
cấu hình legacy được; budget sai bị chặn không effects. Fault activity_logs
rollback policy hiện hữu. Sau cửa sổ clock, cấu hình hợp lệ hoạt động lại;
tenant/trial/profile và advice journal giữ nguyên trong bài thử.

Hai barrier có quan sát waiter: hai REST request chờ khóa policy cùng đọc
phiên bản cũ; một request chờ activity_logs qua expiry theo clock thực.
Không chỉnh clock host, không dùng sleep để đoán đã tới barrier; pg_sleep chỉ
để đi qua expiry sau khi waiter đã được quan sát. Trigger fault được gỡ và
schema fingerprint trở lại đúng đầu vào.

## Nguồn, trạng thái run và giới hạn

Source1.019file, SHA-256
`a02a941a5c478474098a0c1195c0f282902d5858dc293127ccce4c75571eff08`;
backend binding196file;576 business+12directory migrations. Chỉ thêm baseline
module và diagnostic runner; code sản phẩm, migration, frontend chưa đổi.
[Artifact đã lọc](../../../artifacts/roomqc-advice-policy-baseline-local-2026-10-27.json)
giữ14 expected/actual,7finding và hai barrier. Native diagnostic exit1 đúng
kết quả đỏ; driver xác nhận đã chạy đủ, không biến exit1 thành suite pass.

Source binding/renderer13/13 đạt; direct ACL39bảng đạt. Schema/source cuối run
khớp;3 kiểm container/volume/network exact-owned còn0. Advisors737 chưa
disposition, không diễn giải count tăng là thêm lỗi hoặc giảm là sửa xong.
Không chạy lại ma trận Edge1018 hoặc frontend1014; chúng giữ đúng source cũ.

Không chạm DB đang phục vụ/CRM/VPS/DNS/email/provider thật. Chỉ mirror
sanitized docs/artifact; primary implementation/index và ledger/worksheet
được bảo vệ. Chưa full-control/default-full/rebuild/browser/Android/upgrade
policy mới/load/pilot;70ca not_run,122mục unverified và mọi chữ ký/gate giữ nguyên.

## Nhận bước sửa

[Contract và inventory](roomqc-advice-policy-command-contract-2026-10-27.md)
cụ thể hóa P1/P2, gồm cả cancel tombstone để không mất pending khi conflict
hoặc timeout. Chưa có bốn RPC trong tài liệu này; cancellation là yêu cầu
thiết kế mới, chưa được baseline gọi/test. Tiếp19.37 P3/P4/P8: migration tiến
tới, live command/read/lookup/cancel, atomic audit/receipt, clock-after-wait,
đóng legacy bypass và populated upgrade từ576. Sau đó client/UI, freshness/
retention/abuse và thiết bị; tiếp các task toàn VPS/signup theo plan hiện hành.
