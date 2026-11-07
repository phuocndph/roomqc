# RoomQC — sửa giữ hạn mức sai ngày UTC và bằng chứng local

Ngày 27/10/2026. Phiếu19.35 bước1–2 thuộc nền T03/T04/T08/T13 của toàn bộ
VPS + signup. Implementation ở integration; chưa triển khai database đang
phục vụ hoặc VPS thật. Không đổi trạng thái phát hành hoặc ký thay reviewer.

## Lỗi, ảnh hưởng và bản sửa

Baseline source9d8d5513… chạy đủ27 kiểm tra,25 đạt và2 không đạt. Khi đổi ngày
UTC mô phỏng trong lúc prepare chờ đọc nguồn hoặc ghi activity_logs, API trả
HTTP200 reserved và quota_day vẫn là ngày cũ, dù ngày mới đã hết lượt hoặc
ngân sách. Mong đợi409/429, không có journal/audit mới. Đây là lỗi giữ suất
không hợp lệ; dispatch hiện có vẫn kiểm lại quota ngày mới, nên bằng chứng
này **không chứng minh provider đã bị gọi vượt ngân sách**.

Migration576 `20261027144833_operations_advice_quota_day_commit_fence.sql`
được tạo bằng CLI pin2.121.0, thay private.request_operations_advice bằng
CREATE OR REPLACE. Sau kiểm session/tenant/policy và các điểm chờ, ngay trước
trả lần giữ suất mới, hàm kiểm lại ngày UTC. Ngày đổi thì trả PT409 với
ADVICE_DAY_CHANGED; reservation và audit trong transaction bị rollback.
Đây là cùng contract lỗi đã dùng ở dispatch, không thêm trường ngày từ client.

Giữ nguyên SECURITY DEFINER hiện hữu ở hàm private, search_path rỗng và các
EXECUTE grants cũ. Không thêm hàm/bảng/cấu hình clock trong migration, sửa
history hoặc đổi logic charge của completed/unknown/closed_unknown. Lệnh cũ
đã dispatch giữ ngày gốc; lần retry sau rollback dùng cùng command và kiểm
hạn mức ngày hiện tại. Provider I/O vẫn ở ngoài transaction database.

## Bằng chứng theo source1017

| Bộ kiểm tra | Kết quả và phạm vi |
|---|---|
| UTC native Auth/REST/Postgres | 27/27;9 barrier khóa thật, gồm policy/advisory/source/audit/command và hai dispatch tranh1 suất ngày mới |
| Hai lỗi baseline | Source/audit crossing giờ trả409; journal, nonce, charge và audit mới không tồn tại sau rollback |
| Quota ngày mới | Kiểm riêng giới hạn lượt/ngân sách; dispatch sau chờ khóa dùng ngày mới; ngày mới hết quota từ chối mà giữ reservation cũ |
| Replay và terminal | Dispatch replay không phát nonce lần hai; completed/closed/cancelled giữ ngày gốc; finish qua ngày mới không chuyển charge; reservation hết hạn không chiếm lượt mới |
| Timezone từ client | Hai recognition timezone khác nhau không tạo ngày quota riêng hoặc reset giới hạn UTC |
| Hồi quy tư vấn | 76native,59Edge,28 production clientHTTP,restart8+client2,interruption13 đạt |
| Upgrade575→576 có dữ liệu | 50native +8Edge; fault SQLSTATE22012 sau body/history trướcCOMMIT, rollback schema/history/data rồi forward |
| Binding và Compose renderer | 13/13, không fail/skip/cancel |
| Direct ACL | 39 bảng mỗi run;468 browser/probe denial,144 service denial,81 positive và39 snapshot không đổi |

Fixture thay đúng biểu thức ngày quota trong hai function body của database
dùng riêng. Ba biểu thức ở request và ba ở dispatch được thay bằng clock
private của fixture; clock session/trial/policy/deadline vẫn là clock thực.
Lần lượt mô phỏng2040-01-01/02/03; **không chỉnh đồng hồ host và chưa kiểm
qua UTC midnight thực**. Chỉ fixture dùng clock này; original definitions được
phục hồi, helper/table bị xóa và schema fingerprint được đối chiếu độc lập.

Waiter được quan sát bằng pg_blocking_pids, gồm cả chuỗi chờ khóa gián tiếp;
không dùng sleep để giả định request đã tới barrier. Khóa policy vẫn tuần tự
hóa reserve/rebind theo tenant. Không thêm network call trong transaction.
Đây là kiểm chức năng/race local, chưa phải đo throughput hoặc tải VPS.

Upgrade seed có hai tenant, owner/staff, invoice/payment/checkout200.000 đồng,
trial/mapping/permission/policy, reserved/unknown/completed/cancelled và một
closed_unknown có sẵn ở575. Snapshot giữ đầy đủ closure metadata và nonce;
rollback kiểm definition cũ phục hồi, forward kiểm definition mới. Receipt
đã đóng đọc được và row/charge giữ chính xác qua rollback/forward/Edge.
Edge vẫn dùng money200.000 đồng tới sink nội bộ, không resend command cũ.
Chưa chạy binary cũ sau khi bản mới phục vụ; fault là rollback transaction.

Hồi quy giữ SIGKILL khi sink đã nhận và restart process thật, timeout provider
thực45s, policy/session expiry trong I/O. Client HTTP dùng Map/lock trong
process; không thay nghiệm thu localStorage/Web Locks/browser/Android.
Frontend166/TypeScript/lint là bằng chứng1014, code liên quan giữ nguyên;
không chạy lại hoặc gán chúng là frontend acceptance1017.

## Nguồn, lịch sử và vận hành

Source1.017 file, SHA-256
`17c4c152df6e4c30e376f4e6ed480f3d061917165e4bafd8c35ddf32751cbe6e`;
backend binding194 file;576 business +12 directory migrations.
[Artifact đã lọc](../../../artifacts/roomqc-advice-utc-quota-local-2026-10-27.json)
ghi expected/actual, command/exit, barriers, lịch sử lỗi và các giới hạn.

Giữ cả lần baseline đầu7ff43f91…: đã phát hiện hai lỗi trên nhưng dừng thêm ở
observer bài hai waiter. Fixture sửa cách quan sát từ direct blocker sang
transitive blocking graph. Baseline9d8d5513… sau đó chạy đủ27 và chỉ còn đúng
hai lỗi sản phẩm; không đổi expected. Cả hai run đều phục hồi function/schema
và cleanup đúng ownership còn0. Lỗi tạo patch của công cụ local trước khi sửa
runner không ghi implementation; không được coi là một lần kiểm sản phẩm.

Ở bản sửa, ba run UTC/regression/upgrade đều exit0, source binding và schema
cuối run giữ nguyên;9 kiểm tra container/volume/network đúng ownership còn0.
Không chạm DB đang phục vụ/CRM, provider Internet, VPS, DNS hoặc email thật.
Chỉ mirror docs/artifact đã lọc; primary implementation, Git index, hai ledger
và toàn worksheet được bảo vệ bằng hash, private log không mirror.

Advisors UTC731/regression730/upgrade725 chưa disposition:39 RLS no-policy,
7 foreign key thiếu index,183 multiple permissive policy; unused index tương
ứng502/501/496 phụ thuộc workload. Không coi chênh lệch là sửa finding hoặc
dùng direct ACL để ký hết quyền gián tiếp.

## Việc nhận tiếp

Nhận [phiếu19.36](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1936-phiếu-nhận-sau-utc-quota1017):
full Edge offboarding matrix, policy control/freshness/retention/abuse,
browser/Android và compatibility thực. UTC midnight thực còn chưa chạy.
Giữ closure1014 và clock1011 đúng source/phạm vi lịch sử; không giao lại
phần đã có proof khi không có delta.

Sau đó mobilemoney→F3→Q02→Q03→Q04 rồi đủ tám đợt VPS/signup theo dependency.
**70ca not_run,122mục unverified**,reviewer/signoff/gates giữ nguyên. Chưa
default-full/full/rebuild/VPS/TLS/offsite/tải/pilot hoặc nghiệm thu toàn sản phẩm.
Mục tiêu toàn bộ plan vẫn đang thực hiện.
