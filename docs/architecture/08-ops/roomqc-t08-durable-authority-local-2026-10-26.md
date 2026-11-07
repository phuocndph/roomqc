# RoomQC — authority phê duyệt triển khai T08 tại local

Ngày 26/10/2026. Tiếp phần T03/T08 trong [kế hoạch toàn bộ VPS và signup](roomqc-vps-signup-execution-ready-2026-10-22.md).
Giữ nguyên 8 đợt, 27 gói, T01–T25, 70 ca và các gate nghiệm thu.
[Artifact kiểm chứng](../../../artifacts/roomqc-t08-durable-authority-local-2026-10-26.json).

## 1. Trạng thái hiện hành

Đã bổ sung lớp authority bền vững trên directory database, nối với bộ xác minh
Ed25519 của checkpoint775. **Các caller của ứng dụng chưa chuyển sang lớp này**;
catalog v1 hiện vẫn được dùng. Đây là bước triển khai T08, chưa hoàn tất T08,
signup tự động hoặc khả năng vận hành trên VPS thật.

Source779, 546 business migrations và 10 directory migrations; digest source
790912a0a09d9a5d37d0512fbcd0752c0e2a88ab089737b47f1fc9b7529d090b.
Runtime/orchestrator148, digest
6e258121110a2689a23f80f3d0f2a640917c16c0215d7690f80530d499e370aa.
Phạm vi manifest được ghi trong artifact; đây không phải toàn repository hoặc
bằng chứng runtime đã triển khai. Các kết quả full343/rebuild380 chỉ thuộc
[baseline98b](roomqc-t06-release-catalog-local-2026-10-26.md).

## 2. Thay đổi đã có

Migration0010 thêm ba bảng: lịch sử approval bất biến đối với runtime, authority
hiện thời theo cụm, và biên nhận lệnh theo DB login/client key. Không sửa checksum
chín migration cũ, không đưa directory schema vào business/Supabase database.

Role installer riêng xác minh chữ ký/public trust và gọi command cài approval.
API chỉ được thu hồi qua command giới hạn; worker, metrics và probe không có
quyền cài/thu hồi. Tất cả các role này không có quyền ghi trực tiếp authority,
lịch sử hoặc biên nhận. Role writer NOLOGIN sở hữu đúng boundary này, không có
membership; migration từ chối role có đặc quyền hoặc membership không an toàn.

Hai hàm SECURITY DEFINER đặt trong schema private, search_path cố định pg_catalog,
owner là writer có quyền hẹp; PUBLIC không được EXECUTE. Đây là boundary cho API
thu hồi mà không được quyền INSERT/UPDATE authority. Quyền dựa trên session_user
của kết nối database, không dựa JWT, trường HTTP hoặc biến session tự đặt.
Chưa có route HTTP/CLI installer mới; installer hiện được gọi bằng module server.

Mọi command và DML authority lấy lock727001 trước row lock. Cài hoặc thu hồi tăng
epoch/version, giữ approvalId cũ trong lịch sử. ApprovalId đã dùng không được
tái cài, kể cả sau thu hồi. Một lệnh cùng caller/key/payload trả biên nhận cũ
không tác động trạng thái mới; đổi payload với cùng key bị conflict. Biên nhận
đọc được chỉ trong phạm vi DB login gốc, không hàm ý approval đó còn hiện hành.

Command mới kiểm thời gian bằng clock_timestamp của primary, sau khi lấy lock;
cài đặt ở tương lai, hết hạn hoặc hết hạn lúc chờ lock đều bị chặn. Store xác minh
chữ ký tại signed not-before để có thể đối soát lệnh cũ đã hết hạn; thời điểm này
không cấp quyền cài mới, vì SQL luôn kiểm lại clock thật cho lệnh mới.

Store kiểm proof theo approval ID/digest, key, epoch, full release fingerprint,
inventory/host/environment và thời gian DB. Thiếu lock cùng kết nối thì assertion
từ chối. Binding host/inventory hiện thời thay đổi cũng chặn proof cache cũ.
Sau khi được nối, caller phải giữ assertion và effect trong cùng transaction.

Cài và thu hồi đều đóng manual gate, giữ operator_reopen_required. Không tự mở
signup, bỏ backup gate, đổi routing hoặc khẳng định hủy được một remote write
đã được cho phép trước khi thu hồi. Không lưu private signing key hoặc canary
credential trong các bảng mới. Ghi audit thất bại rollback cả authority, history,
command và gate trong cùng transaction.

## 3. Kiểm thử và giới hạn bằng chứng

Lượt directory đầu tiên c7ea885cb04e đạt59/60, lỗi ở kỳ vọng migration cũ chỉ có
0009; đã sửa thành kiểm toàn bộ phần manifest còn lại. Lượt12e189769f46 đạt60/60,
không fail/skip/cancel, exit0; Docker kiểm độc lập exact label container/network/
volume đều0. Sau đó thêm ca expiry/replay và kiểm role an toàn; lượt full control
a7990ea675da trên source779 đạt326/326, không fail/skip/cancel, native exit0,
duration139615.5878ms. Chín ca authority đều chạy, không bị lọc/bỏ qua. Kiểm độc
lập theo exact label của lượt này: container/network/volume đều0, ba lệnh exit0.
Source được ghi nhận khi lượt còn sống và kiểm lại ở cuối; không có capture trước
lúc spawn. Đây không phải bằng chứng full backend hoặc independent rebuild779.

Chín ca authority kiểm: upgrade9→10 và checksum; quyền tối thiểu/audit giả/thiếu
lock; replay và chống tái kích hoạt; rollback khi audit fail; hai lệnh thực sự chờ
cùng lock; clock DB/future/expiry khi chờ lock; process giữ proof cache và process
restart cũ; binding sống thay đổi; expiry chặn effect nhưng vẫn đọc/replay được
biên nhận lịch sử. Chữ ký fixture dùng key sinh trong memory, không ghi/in private
key. Child process nhận thông tin kết nối qua IPC riêng, chỉ trả outcome đã lọc.

Ca process chứng minh **assertion của store** chống cache cũ qua hai Node process.
Chưa có held HTTP health response, worker thu metrics thật, reservation hoặc
provision dispatch dùng authority mới. Không được nâng bằng chứng này thành
cross-process fence cho toàn sản phẩm, E2E signup hoặc kiểm thử VPS Linux.

## 4. Việc tiếp theo theo đúng scope T08

1. Chuyển catalog và managed metadata sang signed approval + public trust; hoàn
   thiện loader/config và installer entry point có kiểm role/readiness. Không cho
   catalog v1 trở thành đường bỏ qua chữ ký sau cutover.
2. Nối assertion vào validate/health commit, admission/open gate, reserve và mọi
   quyền gửi provisioning write mới, kể cả retry khi status=provisioning. Đọc
   receipt đã có vẫn phải hoạt động khi dừng cấp mới; T11/T12 giữ contract riêng.
3. Hoàn thiện thu hồi theo issuer/key trên tất cả approval bị ảnh hưởng; kiểm
   hai API/worker thật, giữ response, mất notification, expiry, restart và phục
   hồi bằng approval mới. Không tự mở lại gate sau cài approval mới.
4. Đóng băng candidate tích hợp rồi chạy full control, default full backend và
   independent rebuild cùng source. Không kế thừa full backend/rebuild baseline98b.
5. Tiếp các mục còn lại: quyền nghiệp vụ gián tiếp/policy/FK; alerts/outbox;
   admission/budget; signup/resume/reconcile; console; Linux/TLS/offsite/on-call;
   A/B đồng thời, browser/Android E2E, tải, RC và pilot được duyệt.

DB restore vẫn có thể làm lùi cả epoch và lịch sử. Anti-rollback sau restore cần
cách ly, đóng gate và kiểm checkpoint thu hồi ngoài failure domain theo T19;
chưa có bằng chứng đó. Các ca cần khóa/provider/VPS thật được giữ pending theo
case, không lặp lại yêu cầu cấp quyền trong lượt này.

70 worksheet vẫn not_run; 122 release entries vẫn unverified; reviewer/signoff
null và gate L/S/P/U/B không được mở bởi báo cáo local này.
