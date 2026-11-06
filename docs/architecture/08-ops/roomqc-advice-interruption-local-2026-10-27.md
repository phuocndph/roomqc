# RoomQC — kill Edge giữa I/O và hết hạn bằng đồng hồ thực

27/10/2026. Thực hiện phần E2 của [phiếu19.31](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1931-phiếu-nhận-sau-advice-upgrade1007),trong toàn bộ VPS + signup. E2 có thêm bằng chứng,nhưng chưa khép toàn bộ advice hoặc nghiệm thu phát hành.

Source1008: `d2684ec8dbc555cef62acbbc880fb926c9cc658f9b663d16b5f689b42aab81c0`,1.008file có phạm vi;backend binding189file. Fresh573migration nghiệp vụ+12directory. Product TS/SQL/Edge giữ nguyên1007/1006;thêm coordinator exact-owned và mở rộng harness/runner. Manifest không đại diện toàn repository hoặc bản phục vụ localhost/VPS.

## Gián đoạn thực tế được kiểm

Production client generate và lưu journal trước I/O. Sink nội bộ nhận đúng command,DB đã ghi dispatched/units5/adviceNULL rồi harness mới phát marker. Coordinator chỉ nhận marker cố định theo run,không nhận containerID/URL/command tùy ý;kiểm owner labels,project,image và network nội bộ trước thao tác.

Coordinator gửi **SIGKILL** đúng container Edge đang xử lý,quan sát Running=false và exit137,sau đó start lại cùng container/image,Running=true và StartedAt thay đổi. Chỉ sau đó mới giải phóng barrier của sink. Không kill database,API gateway hoặc dự án đang phục vụ;fixture không mở cổng host.

Request bị mất trả outcome_unknown;client giữ mã và phạm vi cũ. DB giữ dispatched/units5/adviceNULL;receipt công khai là unknown. Lookup,explicit resume,cancel và gọi qua Edge thứ hai đều không phát sinh provider call mới. Cancel không xóa journal hoặc charge của request đã dispatch. Sink đã nhận1lần trước kill;không thể suy provider thật đã hoàn thành hay bị hủy.

Ba bài đồng hồ thực dùng timer và DBclock thật của fixture,không đặt deadline về quá khứ:

| Ca | Thời gian quan sát | Kết quả |
|---|---|---|
| Provider không trả response |45,474giây|Timer45giây của product thực sự hết hạn;DB unknown/units5/adviceNULL,pending giữ;resume chỉ lookup |
| Policy có valid_until sắp hết hạn |3,571giây|Provider đang chờ đến deadline;DB xác nhận policy đã hết hạn;client permission_denied,không nhận advice,units5/pending giữ |
| Session có not_after trong tương lai |3,936giây|Giữ sink3,5giây rồi thả;DB xác nhận session đã hết hạn;finish/release bị chặn,không nhận advice,units5/pending giữ |

Policy/session được khôi phục trong fixture rồi lookup chỉ đọc unknown,không gửi lại. Dòng chưa xác nhận có thể còn dispatched thay vì unknown trong DB khi finish bị quyền chặn;receipt vẫn unknown và fence chống resend giữ hiệu lực. Không sửa DBclock hoặc giả lập hết hạn bằng unit. Chưa kiểm UTCmidnight/đổi ngày sau lock.

## Kết quả source1008

| Bài kiểm | Kết quả | Phạm vi |
|---|---|---|
| Kill/timeout/policy/session I/O |13/13|Production client qua HTTP,Deno/Auth/REST/Postgres,sink nội bộ;process kill thực |
| Hồi quy native |39/39|Authority/journal/quota;chưa toàn backend |
| Hồi quy Edge |59/59|Tiền khác0,input/scope/PII,revoke/race/fault/audit rollback |
| Production client HTTP hồi quy |16/16|Storage Map/lock in-process;chưa browser/Android |
| Restart terminal state và relogin |6/6 Edge+2/2client journal|Restart cả3container,cùngimage;rehydrate Map;0sinkcall |
| Backend binding + Compose renderer |13/13,không skip|189file backend |
| Direct ACL |39bảng|468browser/probe+144private service denials;81positive;39snapshot giữ nguyên;indirect chưa khép |
| Source/schema/cleanup |Đạt|Không drift;container/volume/network thuộc run còn0;primary implementation/index/ledgers/worksheet giữ nguyên |

Exercise thường có26sinkcalls,interruption có4;mọi command trong từng phase tối đa1lần. Không có provider ngoài. Đây không phải đo tải,không chứng minh100.000user hoặc exactly-once của provider thật.

Advisors730 với CLI2.121.0:39no-policy,7unindexed FK,501unused index,183multiple permissive policies,chưa disposition. Chênh so724 trong [upgrade1007](roomqc-advice-upgrade-local-2026-10-27.md) phụ thuộc workload;không coi là6lỗi mới. Populated572→573 có29native+6Edge+16client ở1007,không rerun tại1008.182frontend/TypeScript/lint14warnings thuộc1006;productsource không đổi,không gán thành lần chạy1008. Node syntax của ba file harness/runner/coordinator đã kiểm.

## Phần chưa hoàn tất

E2 còn UTCrollover sau lock,offboarding đủ actor/role/hotel/tenant matrix,freshness/retention/abuse,unknown lâu ngày và cấu hình policy control. **Unknown hiện giữ pending và chặn tạo yêu cầu mới trong cùng phạm vi.** Cần luồng đối soát/đóng yêu cầu rõ ràng trước phát hành;không được xóa fence hoặc tự hoàn quota rồi gửi lại khi chưa biết provider đã xử lý chưa.

E1/E4 có local proof;E3 có unit/hook/HTTP proof,chưa hai tab thật,Web Locks/localStorage/browser/Android/iOS. Bộ Node inject storage/lock in-process và không chứng minh khả năng hỗ trợ của WebView. Còn default-full/full/independent rebuild theoQ04;chưa build web/mobile hoặc deploy. Caller/API/database vẫn cần cùng compatibility policy,không triển khai573/Edge riêng với caller cũ gửi snapshot.

Chưa VPS/DNS/email/provider thật/offsite/load/pilot.70worksheet not_run,122release entries unverified,reviewer/signoff/gates không đổi. Chỉ sanitized docs/artifact được mirror;implementation giữ ở integration. Goal toàn bộ plan còn active.

[Artifact đã lọc](../../../artifacts/roomqc-advice-interruption-local-2026-10-27.json) giữ manifest,controls/processproof,elapsed vàcleanup. Nhận [phiếu19.32](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1932-phiếu-nhận-sau-advice-interruption1008):UTC/authority/policy và browser/Android→mobilemoney→F3→Q02→Q03→Q04→các đợt VPS/signup.
