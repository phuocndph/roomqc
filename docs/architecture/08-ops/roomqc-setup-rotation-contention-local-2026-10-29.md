# RoomQC — hai daemon rotation tranh chấp, local 29/10/2026

Đã bổ sung và chạy diagnostic **hai daemon sản phẩm thực** trong ba interleaving: journal chung đang có hai prepare; journal riêng trước commit; journal riêng sau commit. Không phát hiện lỗi sản phẩm trong phạm vi này. Thay đổi chỉ ở harness và wiring runner, không đổi hành vi sản phẩm hoặc migration. Actor revoke xuyên database và toàn bộ release vẫn mở.

## 1. Nguồn và thực thi

- [Packet đã lọc](../../../artifacts/roomqc-setup-rotation-contention-5c839bfe5602-local-2026-10-29.json), run **5c839bfe5602**, terminal exit0 và cleanup đã xác minh.
- Backend319tệp, SHA256 `44442d6d9e35e5dd845c30a2780cdb0b6664e8afd5efb2f74b1aea9aec7610f4`;585 business/19 directory migrations.
- Schema trước/sau `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`; migration set `8e55f912d34a1401096d5417c2e82d02af91313cb82efcfe03fb4c55cc894d42`.
- Lệnh: `node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation-contention`.
- 17kiểm native tổng/11contention checks;22barrier observations;25process có witness UID/GID10001,CapEff0,no-new-privileges,source read-only. Coordinator chuẩn bị fixture riêng, không chạy product daemon bằng root.
- 9lần kiểm session issuer/observer về0, business mutex727012 và directory mutex727001 tự do, canary ngoài journal/output không đổi. 11bảng nghiệp vụ bảo vệ giữ nguyên;24role và private root đã thu dọn; kiểm Docker độc lập còn0container/volume/network.

## 2. Journal chung: cùng caller và cấu hình

Hai daemon dùng chính xác cùng policy/config/instance/context, không thay caller hoặc nới context binding. Mỗi tiến trình dừng sau command_synced trong khi chưa pending nào công bố; database chưa có effect. Tiếp tục cả hai đến pending_synced, rồi đến dispatch: có hai key bền vững và cả hai chọn cùng pending key theo thứ tự của journal.

1. Cho bên thứ nhất gọi rotate; giữ các frame PostgreSQL gốc sau ReadyForQuery idle. Database độc lập chứng kiến một command/audit/credential. SIGSTOP giữ tiến trình tại cửa sổ đó để query timer không biến bài tranh chấp thành timeout ngẫu nhiên.
2. Bên thứ hai dùng cùng LOGIN bị connection limit từ chối, action review/sameCommandRequired=true; pending key/body/context không đổi, không thêm effects. Đây là kết quả connection-limit thực, không trình bày thành BUSY của mutex.
3. Kill bên thứ nhất, giải phóng session rồi khởi động lại hai daemon. Cả hai replay cùng key và dừng trước archive sau publication/RPC thật; receipt và file output giữ nguyên.
4. Cho cả hai cùng tiếp tục archive rename. Hai tiến trình kết thúc rotated cùng command, một history entry, một DB effect, output inode/hash không đổi.
5. Key còn lại được replay, nhận version conflict, chuyển superseded với0command/0audit/0credential. Restart lần2 idle, pending rỗng.

Đây là active prepare/dispatch/archive contention, không phải hai tiến trình chỉ kiểm head idle.

## 3. Journal riêng: hai caller, cùng target/version/head

| Interleaving | Barrier và actual |
|---|---|
| Trước commit | Hai prepare/dispatch pending khác key cùng version/predecessor. Giữ management row bằng transaction fixture; pg_stat_activity chứng kiến rotate thực đang chờ Lock. Peer LOGIN khác nhận SETUP_INSTALLER_BUSY, pending không đổi và0effect |
| Sau commit | Giữ frame PG gốc sau commit/idle, pause process. Peer LOGIN khác nhận BUSY, không thêm effect và output vẫn là file trước publication |

Mỗi vòng kill writer, đợi session/mutex sạch rồi replay đúng caller/key/body. Sau row unlock ở bài precommit, harness đọc actual outcome0hoặc1 trước phục hồi; không giả định client chết đồng nghĩa rollback. Cả hai vòng cuối cùng đều chỉ thêm1command/1audit/1credential/version+1.

Writer phục hồi công bố credential, native RPC200 và dừng trước archive. Lúc này peer replay key riêng bị CAS version conflict, chuyển superseded rồi idle mà không tạo khóa thứ ba. Kill writer sau publication, khởi động lại giữ receipt/ID/iat/exp/output inode/hash; lần restart thứ2 idle. Journal và history được đối chiếu theo bytes gốc.

Tại commit có2credential live trong overlap policy. Chờ cutoff bằng database clock: predecessor RPC403, successor RPC200 và còn1credential live. Không fake thời gian hoặc giảm overlap. Seed TTL1800, successor TTL3600/rotateBefore3540/overlap10; giữa các vòng chờ head thực đến hạn. Deadline installer45giây giữ nguyên.

## 4. Hồi quy và phạm vi

Sáu file journal/publication/rotation/runtime/source binding/sandbox-state: **47tổng/46pass/0fail/1skip**, terminal exit0. Raw regression log và hash được lưu private trong packet. Skip là renderer/Compose opt-in chưa bật, không tính nghiệm thu.

Preload chỉ quan sát original journal methods rồi SIGSTOP tại barrier. SQL/PostgREST, DB CAS/lock, receipt, publication và RPC thật không bị thay bằng kết quả giả. Connection limit1/LOGIN, context binding và policy được giữ nguyên.

Ba interleaving không chứng minh mọi race, mọi lỗi filesystem, storage hardware hoặc profile VPS UID1000. Bài thử này cung cấp proof local cho BG02-R03/R04 và một phần R05/R06/R07; chưa là reviewer/signoff của các ca gốc. Không gán proof storage318 hoặc mount313 cho toàn bộ nguồn mới.

Không có owner signup/email/browser/Android, full integrated candidate, Linux VPS/TLS, offsite DR, tải/chi phí hoặc pilot được nghiệm thu trong diagnostic này. Giữ70ca/124lượt/122mục và các gate.

## 5. Việc tiếp theo

1. Review packet, ba interleaving và giới hạn; chỉ thêm race khi có case/defect/rủi ro cụ thể, không lặp vô hạn diagnostic đã có.
2. Khép **BG02-R11/BG02-06**: chọn protocol và commit hiệu lực thu hồi actor Auth→directory→business; kiểm JWT còn hạn tại claim/RPC/settle. Service credential CAS/revoke không thay actor revoke.
3. Giữ kiểm profile mount/UID/quyền thực cho BG07; sau dependency của BG02 tiếp BG03 inventory/budget/admission, BG04 signup và BG05 console, rồi tích hợp/VPS/DR/E2E/tải/pilot theo [phiếu toàn tuyến](roomqc-vps-signup-start-pack-2026-10-28.md#02-thứ-tự-bàn-giao-toàn-phạm-vi).
