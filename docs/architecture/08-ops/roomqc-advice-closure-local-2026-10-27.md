# RoomQC — đóng yêu cầu tư vấn chưa rõ kết quả, bằng chứng local

Ngày 27/10/2026. Phiếu12.5 thuộc T03/T04/T08/T13 trong kế hoạch toàn bộ
VPS + signup; nghiệm thu thiết bị vẫn ở T22. Implementation ở integration,
chưa đưa lên database đang phục vụ, bản delivery hoặc VPS thật.

## Hành vi đã bổ sung

Người dùng có thể chọn **Đóng yêu cầu cũ** khi server xác nhận yêu cầu đã qua
deadline. Hộp xác nhận giải thích kết quả cũ chưa được xác nhận và hạn mức đã
dùng vẫn giữ. Đóng thành công chỉ kết thúc việc chờ trên giao diện; tạo tư vấn
mới là một hành động riêng, dùng mã mới và chịu kiểm hạn mức bình thường.

Migration575 `20261027140057_operations_advice_unknown_closure_receipts.sql`
được tạo bằng CLI pin2.121.0. Bản ghi vẫn có state unknown, giữ dispatch fence,
context, quota_day và units; thêm closed_at/closed_by cùng constraint. Receipt
cho client là closed_unknown. can_close do database tính theo clock hiện tại;
client không quyết định quyền đóng bằng đồng hồ máy người dùng.

RPC close_operations_advice dùng SECURITY INVOKER và search_path rỗng, chỉ
authenticated được EXECUTE. Hàm điều phối private dùng khóa actor/command,
kiểm live actor/session/quyền/tenant/hotel/policy sau chờ; đóng và audit cùng
transaction. Đóng lại trả receipt gốc, không tạo audit thứ hai. Reserved chưa
được đóng; completed/cancelled giữ kết quả cũ. Late provider output không được
ghi đè closure; machine observation cũng không mở lại lệnh.

Edge nhận action close bằng bearer người dùng, không chạy provider và dùng
được khi provider bị tắt. Client giữ pending khi mất response, bị từ chối hoặc
receipt lỗi; chỉ xóa sau terminal receipt hợp lệ đúng actor/runtime/tenant/scope.
Hook giữ lock/epoch/abort và dialog gắn với scope để tránh kết quả cũ xuất hiện
khi người dùng chuyển phạm vi.

## Kiểm chứng và giới hạn

| Bộ kiểm tra | Kết quả theo source1014 |
|---|---|
| Unit server/client/closure/hook | 166/166 qua 4 file; chạy trước bổ sung delta harness quota, code TypeScript liên quan giữ nguyên sau đó |
| TypeScript và lint | TypeScript exit0; lint 9 file liên quan exit0, không cảnh báo |
| Native Auth/REST/Postgres | 76/76; hai closers sau khóa thật trả một receipt, một audit; audit fault rollback |
| Clock ở closure | Trial/session/policy hết hạn thật trong lúc chờ audit lock, 3 trường hợp; deny và journal/audit giữ nguyên, phục hồi đạt |
| Hết quota sau closure | Đóng vẫn được; không hoàn lượt/ngân sách; kiểm riêng từng giới hạn; replay cũ terminal và yêu cầu mới tính phí nội bộ riêng khi tăng hạn mức |
| Edge và client HTTP | 59 Edge +28 production client; mất response sau close commit, relogin/lookup phục hồi, hai Edge/provider-disabled không resend |
| Restart | 8 Edge +2 client; restart process thật giữ completed/unknown/cancelled/closed_unknown |
| Interruption | 13; SIGKILL khi sink đã nhận, timeout thực45s và policy/session hết hạn trong I/O vẫn giữ fence/charge |
| Upgrade574→575 có dữ liệu | 41 native +8 Edge; fault SQLSTATE22012 sau body/history trước COMMIT, rollback schema/history/data rồi forward |
| Binding và renderer | 13/13, không fail/skip/cancel |
| Direct ACL | 39 bảng mỗi run; 468 browser/probe denial, 144 service denial, 81 positive, 39 snapshot giữ |

Upgrade seed giữ hai tenant, owner/staff, checkout/invoice/payment200.000 đồng,
trial/policy, completed/unknown/cancelled và reservation cũ. Closure trên lệnh
cũ giữ nonce và charge; lệnh mới lấy đúng revenue200.000 đồng tới sink nội bộ.
Fault là rollback transaction; **chưa chạy binary cũ sau khi bản mới phục vụ**.

Các trường hợp sau deadline dùng fixture SQL rút deadline. Chỉ ba race expiry
nêu trên dùng thời gian chờ thật; không coi fixture này là chờ deadline60s hay
UTC midnight thực. Bài timeout provider45s là bằng chứng riêng của interruption.
Không gọi provider Internet. HTTP client dùng Map và lock trong process, chưa
kiểm localStorage/Web Locks, dialog trên browser hoặc Android WebView thật.

Compatibility được rà ở contract, chưa nghiệm thu mọi cặp binary:

| Client / Edge / schema | Hành vi cần giữ và bằng chứng hiện có |
|---|---|
| Bản mới / bản mới /575 | Native, Edge và client HTTP ở bảng trên; có receipt terminal và recovery |
| Client cũ / Edge mới /575 | Parser cũ không hiểu closed_unknown phải từ chối và giữ pending; suy từ code, chưa chạy binary cũ |
| Client mới / Edge cũ /575 | Edge cũ không hỗ trợ close; không coi là đường rollout được chấp thuận; chưa chạy binary cũ |
| Bản mới / bản mới /574 | Thiếu RPC/metadata closure; chưa chạy rehearsal hỗn hợp, không rollout riêng schema/Edge/client |

Phải phát hành schema, Edge và client theo một candidate đã kiểm compatibility.
Không suy từ lỗi parser an toàn thành UX phục hồi đã được nghiệm thu.

## Nguồn và lịch sử chạy

Source1.014 file, SHA-256
`3e8fba30bacbbf85ab8fd576c953d377f2390d43797fa6289bc78ea8edee9238`;
backend binding192 file, 575 business +12 directory migrations.
[Artifact đã lọc](../../../artifacts/roomqc-advice-closure-local-2026-10-27.json)
giữ expected/actual, command/exit, source/schema, cleanup và giới hạn.

Lần đầu source070dd830… không đạt: harness upgrade dùng sai tên migration574
nên dừng trước replay; native yêu cầu anonymous403 trong khi ACL trả401 kèm
SQLSTATE42501. Sửa đúng tên và chấp nhận401 hoặc403 chỉ khi SQLSTATE42501 và
journal giữ nguyên. Giữ failed history, không đổi điều kiện chặn truy cập.
Lần97b360a5… đạt69 native/41upgrade/8upgradeEdge và hồi quy; sau đó thêm7 kiểm
quota rồi chạy lại source ở trên. Các lần đều kiểm cleanup đúng ownership.

Hai run terminal ở source này kiểm schema/source cuối run giữ nguyên; cleanup
container/volume/network đúng ownership còn0. Bản delivery, Git index, hai
ledger và toàn worksheet giữ nguyên ngoài docs/artifact được mirror có kiểm
hash. Không mirror implementation hoặc private log.

Advisors regression730, upgrade725 chưa disposition: 39 bảng RLS không policy,
7 foreign key thiếu index, 183 multiple permissive policy; unused index501/496
khác nhau theo workload. Không diễn giải chênh lệch là đã sửa finding. Proof
119 authority và11 clock của1011 vẫn là lịch sử theo source của báo cáo gốc,
không tự gán là đã chạy lại trên1014.

## Việc tiếp theo và nghiệm thu phát hành

Nhận [phiếu19.35](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1935-phiếu-nhận-sau-closure1014):
UTC quota sau các điểm chờ; full Edge offboarding matrix; policy control,
freshness/retention/abuse; browser/Android và compatibility thực. Sau đó mobile
money → F3 → Q02 → Q03 → Q04, rồi đủ tám đợt VPS/signup theo dependency.

Phiếu12.5 có bằng chứng local nêu trên; chưa đóng toàn T03/T04/T08/T13 hoặc
gate. **70 ca not_run,122 mục unverified**, reviewer/signoff/gates giữ nguyên.
Chưa full/default-full/rebuild/web build/browser/Android/VPS/TLS/offsite/load/
pilot hoặc nghiệm thu toàn sản phẩm. Mục tiêu toàn bộ plan vẫn đang thực hiện.
