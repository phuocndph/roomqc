# RoomQC — thực thi advice trên Edge và phục hồi local

27/10/2026. Thực hiện E1 và một phần E2 của [phiếu 19.28](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1928-phiếu-nhận-sau-advice-core1000), trong kế hoạch toàn bộ VPS + đăng ký tự động. Chưa hoàn tất A1–A6 hoặc nghiệm thu phát hành.

Source1001: `a0796daca081df66d6ada2c4dd24b5b6791b750ada71713c3d1a8fc3236466ba`, gồm 1.001 file có phạm vi, backend binding187 file. Fresh database có 573 migration nghiệp vụ và 12 migration directory. Manifest không đại diện toàn repository hoặc bản đang phục vụ localhost/VPS.

## Thay đổi và kết quả

Runner bundle đúng entrypoint `operations-advisor/index.ts`, bốn shared advice và CORS thành eszip. Ba container cùng image Edge được cố định bằng digest: hai instance dùng AI giả lập và một instance disabled. Build không có khóa hoặc database fixture; runtime chỉ nằm trong network nội bộ, không mở cổng host. Chỉ sáu biến môi trường cần thiết được cấp cho runtime. Chưa nối diagnostic này vào bài default-full.

Harness mới chạy HTTP thật → Auth → REST → journal/dispatch → AI sink nội bộ cố định → finish → lookup. Sink kiểm owner và command thuộc fixture; không nhận API key hoặc bearer. Relay kiểm anon key cho Auth/user RPC, service key chỉ cho dispatch/finish. Request gửi snapshot kiểu cũ bị từ chối.

Nguồn có dữ liệu khác 0: doanh thu phòng 200.000, phí giữ cọc no-show 100.000, khoản cần hoàn 100.000, chi phí bảo trì 1.000, nhân sự ước tính 100 và mục tiêu ADR 123,45. Payload gửi sink có doanh thu ghi nhận 300.000, tách khoản cần hoàn; đối chiếu operations/labor RPC thực tế. Projection không có UUID, thông tin khách, liên hệ, tên bộ phận hoặc lương từng người. Đây là dữ liệu tổng hợp giả lập, chưa là đánh giá chất lượng lời khuyên từ provider thật.

| Bài kiểm thử ở source1001 | Kết quả | Phạm vi chứng minh |
|---|---|---|
| Native Auth/REST/database |39/39|Rerun core authority/journal/quota; race 4 yêu cầu, 1 nhận/3 từ chối, quan sát ít nhất 2 transaction chờ khóa DB |
| HTTP trên Deno + AI sink |59/59|Disabled/default deny, input/Auth/scope, dữ liệu tiền, replay/conflict, quyền nhân viên, lỗi và rollback |
| Sau restart container Edge |6/6|Thực sự restart cả 3 container, cùng image, StartedAt thay đổi; đăng nhập lại và đọc completed/unknown/cancelled, không gửi sink |
| Backend binding + Compose renderer |13/13, không skip|Ràng buộc 187 file backend và renderer thực tế; không phải full backend |
| Direct ACL |39 bảng|468 browser/probe và 144 private service denials; 81 positive, 39 snapshot giữ nguyên; indirect paths chưa khép |
| Source/schema/cleanup |Đạt|Không drift, container/volume/network thuộc lần thử còn 0; primary implementation/index/ledger/worksheet giữ nguyên |

Hai Edge cùng command được đồng bộ bằng barrier tại sink: instance thứ hai trả unknown; chỉ một lần gọi sink và một kết quả completed. Trong toàn bài có 18 lần gọi sink nội bộ, mỗi command gửi tối đa một lần. Không dùng số này để suy ra tải đồng thời hoặc bảo đảm exactly-once của provider.

Provider500, JSON sai, response quá lớn, DTO sai và mất kết nối sau khi sink nhận đều giữ unknown cùng quota units; retry không gửi lại. Mất phản hồi finish sau khi database đã commit phục hồi completed bằng lookup. Cancel trước generate tạo tombstone và chặn request tới muộn.

Đã kiểm thu hồi profile ngay sau durable claim trước provider, profile/session/policy/deadline khi provider đang chờ, assignment của nhân viên khi đang chờ, và profile sau commit trước lookup trả về. Kết quả bị chặn theo quyền hiện thời; khôi phục quyền chỉ đọc lại kết quả, không phát sinh lần gọi sink mới. Deadline được điều chỉnh có kiểm soát trong database; chưa là bài chờ timeout 45 giây bằng đồng hồ thực.

Fault tại audit của cả reserved/dispatched/completed chứng minh rollback trong cùng transaction. Sau bỏ fault, reserved/dispatched có thể tiếp tục cùng key; kết quả không rõ sau provider tiếp tục unknown. Trigger và function fault đều được gỡ; fingerprint schema khớp trước/sau.

Adapter79/79, TypeScript/lint/esbuild và independent ACL drill4/4 thuộc [mốc999/1000](roomqc-operations-advice-core-local-2026-10-27.md), không chạy lại ở1001. Đối chiếu source1000 bằng runner gốc chứng minh TS/SQL/index không đổi; chỉ thêm harness Edge và nối runner.

Advisors1001 có730 finding với CLI2.121.0:39 no-policy,7 unindexed FK,501 unused index,183 multiple permissive policies. Chưa disposition. Chênh so732 ở1000 phụ thuộc workload, không coi là đã sửa2 lỗi.

## Lần thất bại và sửa harness

Attempt đầu: native39 và binding13 đạt, Edge có3 ca đạt rồi fail ca machine bearer. Relay kiểm thử tự chặn bearer trước Auth, trả503 thay401. Sửa relay để chuyển bearer không tin cậy tới Auth bằng anon key; giữ expected401 và không cho gọi nghiệp vụ khi bị từ chối. Không sửa product TS/SQL hoặc hạ expected. Fresh rerun đạt59+6. Cả hai attempt đều cleanup0; failed history được giữ trong artifact.

## Phần nhận tiếp theo

E1 đạt ở môi trường cô lập; E2 mới đạt một phần. Còn kill process trong lúc provider đang xử lý, clock/quota UTC rollover, policy hết hạn bằng đồng hồ thực, offboarding đủ loại actor, độ mới snapshot và policy/budget/retention/abuse cần đóng bằng proof hoặc quyết định rõ ràng. Restart sau trạng thái đã ghi không thay thế kill giữa I/O.

E3: client/hook/UI vẫn dùng contract cũ, tự query và retry. Cần manual generate, scope/key, pending lưu bền vững trước I/O, lookup/cancel, single-flight/identity epoch, cùng actor đăng nhập lại/hai tab và chặn kết quả cũ khi đổi quyền/phạm vi. Lỗi/unknown không được hiển thị “vận hành đang ổn định”. E4: populated upgrade572→573, fault sau toàn body/history trước COMMIT và compatibility chung caller/API/database. **Không triển khai migration573 hoặc Edge riêng khi caller cũ còn gửi snapshot.**

Sau advice: mobile money → F3 → writerQ02 còn lại → Q03 indirect/workflow/advisors → Q04 freeze/full/default-full/rebuild → các đợt VPS/signup T07, T09–T25 theo dependency ledger. Provider thật/secret/policy production giữ ở danh sách làm sau; local code/proof vẫn tiếp tục.

Chưa browser/Android/full-control1001/default-full/rebuild/deploy/VPS/DNS/email/offsite/load/pilot. Giữ70 worksheet not_run,122 release entries unverified, reviewer/signoff/gates không đổi. Chỉ tài liệu và artifact đã lọc được mirror về bản giao chính.

[Artifact đã lọc](../../../artifacts/roomqc-operations-advice-edge-local-2026-10-27.json) chứa source, kết quả, failed history và cleanup. Đọc [phiếu19.29](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1929-phiếu-nhận-sau-advice-edge1001) để tiếp tục.
