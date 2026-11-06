# RoomQC — tư vấn AI chủ động và phục hồi yêu cầu local

27/10/2026. Thực hiện E3a/E3b của [phiếu 19.29](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1929-phiếu-nhận-sau-advice-edge1001), thuộc kế hoạch toàn bộ VPS + đăng ký tự động. Client, hook và UI đã có bằng chứng local; browser/Android và nghiệm thu phát hành còn mở.

Source1006: `19eed90b44f17f023e968716514a42f76af07b755c818ea8702840d67d9a1a3e`, gồm 1.006 file có phạm vi, backend binding187 file. Fresh database có 573 migration nghiệp vụ và 12 migration directory. Manifest không đại diện toàn repository hoặc bản đang phục vụ localhost/VPS.

## Hành vi đã thay đổi

Trang đánh giá vận hành chỉ gửi yêu cầu AI khi người dùng bấm **Tạo phân tích AI**. Mount, tải lại dữ liệu nguồn hoặc query invalidation không tự tạo yêu cầu. Client chỉ gửi action, mã yêu cầu, kỳ báo cáo, khách sạn và múi giờ; dữ liệu báo cáo được server đọc theo quyền hiện thời. Không gửi snapshot từ browser hoặc cấp service key cho client.

Trước I/O, client lưu mã và phạm vi phục hồi theo runtime/actor/tenant/kỳ/khách sạn/múi giờ. Không lưu bearer, JWT, lời khuyên, snapshot tài chính hoặc thông tin khách. Session cũ được giữ trong record để đối chiếu; khóa lưu trữ không chứa session, cho phép cùng actor đăng nhập lại và kiểm tra yêu cầu trước.

Mất mạng, timeout, lỗi quyền hoặc kết quả unknown giữ mã cũ. **Kiểm tra kết quả** chỉ lookup; not_found không tự generate. **Tiếp tục yêu cầu cũ** là thao tác riêng, lookup trước và chỉ tiếp tục not_found/reserved bằng cùng mã. Unknown không gửi lại. **Hủy yêu cầu chưa gửi** chỉ xóa pending sau receipt completed/cancelled hợp lệ; tombstone phía server chặn generate tới muộn.

Hook dùng epoch cho identity/phạm vi/dữ liệu nguồn, abort khi đổi context và chặn kết quả cũ quay lại khi A→B→A. Đổi actor, session, runtime, public key, khách sạn, kỳ hoặc quyền đều che advice cũ. Lỗi nguồn cũng không cho dùng advice cũ. Storage event từ tab khác làm mới trạng thái pending và che kết quả không còn phù hợp.

UI hiển thị cách kiểm tra, tiếp tục hoặc hủy yêu cầu cũ; không kết luận “vận hành đang ổn định” từ danh sách rỗng hoặc lỗi AI. Gợi ý tính từ chỉ số được ghi riêng là **Gợi ý cơ bản từ chỉ số**. Phần PDF tổng thể vẫn thuộc F3, chưa khép ở lần này.

## Bằng chứng tại source1006

| Bài kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| Client/hook/adapter/consumer, 5 file |182/182, không skip|48 client,26 hook,79 adapter server,12 source,17 consumer; Vitest/jsdom, chưa browser thật |
| TypeScript toàn ứng dụng |Đạt|tsconfig.app.json; chưa build web hoặc Android |
| Lint 9 file mới/sửa |0 lỗi,14 cảnh báo|Cảnh báo trong test; không tuyên bố warning-free |
| Client product bundle → HTTP → Deno/Auth/REST/DB → sink nội bộ |16/16|Storage Map và lock dùng chung trong process; không thay fetch của client |
| Client phục hồi sau restart và đăng nhập lại |2/2|Journal được serialize rồi rehydrate vào Map trong process mới; chưa localStorage thực |
| Hồi quy Deno Edge |59/59|Thực thi lại cả authority, tiền khác0, lỗi provider, revoke, race và audit rollback |
| Hồi quy sau restart Edge |6/6|Restart cả3 container thật, cùng image; phiên mới; không gọi sink |
| Native Auth/REST/database |39/39|Chạy lại core/journal/quota; chưa toàn bộ backend |
| Backend binding + Compose renderer |13/13, không skip|Binding187 file; chưa default-full |
| Direct ACL |39 bảng|468 browser/probe +144 private service denials;81 positive;39 snapshot giữ nguyên; indirect paths còn mở |
| Source/schema/cleanup |Đạt|Không drift; container/volume/network thuộc lần thử còn0; primary implementation/index/ledgers/worksheet giữ nguyên |

Runner bundle đúng `src/lib/operations-advice-client.ts` cùng shared contracts và session parser bằng esbuild0.28.2, ghi hash nguồn/bundle. Client dùng fetch thật tới relay cố định tại endpoint function; relay chỉ chuyển tới Edge thuộc fixture, kiểm anon key/bearer và command đã sở hữu. Auth/RPC/provider vẫn đi đường thật của bài Edge1001. Không có endpoint chuyển tiếp tùy ý hoặc provider ngoài.

16 ca client chứng minh: payload chỉ scope; journal ghi trước I/O; mất response sau completed giữ mã và lookup phục hồi; mất request trước Edge không có DB write; not_found giữ mã; cancel chặn request muộn; explicit resume cùng mã; unknown giữ quota và resume chỉ lookup; cùng actor đăng nhập lại; hai client dùng chung lock chỉ một HTTP; đổi context trong I/O không nhận kết quả cũ rồi lookup phục hồi. Sau restart, hai journal completed/unknown được đọc đúng, completed xóa pending và unknown giữ pending.

Toàn bài có26 lần gọi sink nội bộ, mỗi command tối đa1 lần. Sau restart có0 lần gọi sink. Số ca và số call này không chứng minh sức chứa VPS hoặc exactly-once ở provider thật.

Advisors730, CLI2.121.0:39 no-policy,7 unindexed FK,501 unused index,183 multiple permissive policies. Chưa disposition. SQL/Edge product giữ nguyên từ1001; thay đổi gồm client/hook/UI/tests và harness/runner để kiểm client thật. Báo cáo1001 được giữ lịch sử theo source riêng.

## Failed history và giới hạn còn lại

Attempt frontend đầu đạt180/182; hai failure do fixture dùng Asia/Bangkok và Asia/Ho_Chi_Minh khác nhau. Sửa timezone của fixture, không đổi product hoặc hạ expected; rerun182/182 đạt, rồi rerun lại trên source1006 cùng native đạt182/182. TypeScript/lint đều đạt trong hai lượt sau. Lỗi TypeScript sơ bộ vì fixture thiếu các trường LaborCostResult cũng đã được bổ sung trước lượt182 ca; không tính lượt lỗi này là proof đạt.

Lock mặc định của product dùng Web Locks, exclusive/ifAvailable theo phạm vi, và fail closed nếu thiết bị không hỗ trợ. Bài Node dùng lock in-process được inject; **chưa chứng minh hai tab thật, localStorage thật, reload browser, Android WebView hoặc iOS**. Phải kiểm khả năng hỗ trợ và luồng thông báo trước phát hành; không coi Map/lock của harness là bằng chứng mobile.

E1 đã có local proof; E3a/E3b đạt ở lớp unit/hook/HTTP, còn nghiệm thu browser/Android. E2 vẫn một phần: chưa kill process trong provider I/O, UTC rollover, hết hạn bằng đồng hồ thực, offboarding đủ matrix, quyết định freshness/retention/abuse và tích hợp cấu hình policy. E4 populated572→573 chưa chạy. Không triển khai migration573/Edge riêng khi caller cũ vẫn gửi snapshot; caller/API/database cần cùng compatibility policy.

Chưa full-control1006/default-full/independent rebuild/web build/browser/Android/deploy/VPS/DNS/email/offsite/load/pilot. Giữ **70 worksheet not_run,122 release entries unverified**, reviewer/signoff/gates không đổi. Chỉ tài liệu và artifact đã lọc được mirror về bản giao chính; implementation không mirror.

[Artifact đã lọc](../../../artifacts/roomqc-operations-advice-caller-local-2026-10-27.json) giữ manifest, kết quả, failed history và cleanup. Nhận [phiếu19.30](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1930-phiếu-nhận-sau-advice-caller1006) cho upgrade/E2 và browser/Android, rồi mobile money → F3 → writerQ02 → Q03 → Q04 → các đợt VPS/signup. Goal toàn bộ plan còn active; chưa nghiệm thu sản phẩm.
