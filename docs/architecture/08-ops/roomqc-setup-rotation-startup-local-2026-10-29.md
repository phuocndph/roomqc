# RoomQC — sửa SIGTERM trong startup và giữ pending để phục hồi

Ngày29/10/2026. BG02-03/04/07, hỗ trợ R05/R12; **chưa nghiệm thu toàn BG02 hoặc sản phẩm**. [Packet native db40d4b8c62b](../../../artifacts/roomqc-setup-rotation-startup-db40d4b8c62b-local-2026-10-29.json).

## Lỗi đã tái hiện và thay đổi

Entrypoint cũ đăng ký SIGTERM/SIGINT sau `await startSetupRotation()`. Run6af38e94db73 giữ tiến trình thật tại startup journal initialize, gửi SIGTERM và chứng kiến exit do signal sau23ms, không có `setup_rotation_stopping`. Bài kiểm thất bại đúng expected, không có cycle hoặc tác động mới lên các bảng credential. Đây là product defect được tái hiện, không còn là giả thuyết đọc source.

Đã sửa [runtime](../../../server/control/workers/setup-rotation-runtime.mjs) để đăng signal handler trước async startup. Stop latch truyền qua config load, journal initialize và rotator trước tick/start; SIGTERM đóng readiness/timer trước khi chờ I/O đang chạy. `--once` cũng nhận stop khi đang đọc pending; lỗi startup thật vẫn exit1 khi signal đến cùng lúc. Listener được thu dọn khi once/start failure/dừng xong; hard deadline giữ55giây. Cơ chế không hủy/đoán rollback một remote request đã gửi: pending còn nguyên để đối soát cùng caller/key/body.

Không đổi schema, quyền database, TTL/overlap policy hoặc installer fence. [Native harness mới](../../../server/control/testing/setup-rotation-faults-native.mjs) chỉ đặt barrier/quan sát ở fs open hoặc journal method; không giả response, signer, installer hay PostgreSQL. Diagnostic mới là `setup-rotation-faults`.

## Kết quả đã kiểm

Nguồn **315tệp**, SHA256 `861de21bb7bda63ba5ab0419d3fb548e4513a68ddb070d028af7e9aecaaeba96`;585 business/19 directory migrations. Source đầu–cuối khớp; schema trước–sau cùng `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`.

| Phạm vi | Actual run db40d4b8c62b |
|---|---|
| Native |16 kiểm đạt, gồm6 nền installer và10 startup/pending/recovery; terminal exit0 |
| Process |13 process thật,13 witness UID/GID10001,CapEff0,no-new-privileges,source read-only |
| Startup initialize |SIGTERM được nhận; exit0 sau84ms, không cycle hoặc DB effect mới |
| Startup config |Dừng khi đang mở file thật; exit0 sau63ms, không cycle/effect mới |
| Config lỗi + SIGTERM |File JSON sai vẫn exit1 sau65ms và báo mã an toàn; không che lỗi thành success |
| Pending/durable prepare |SIGTERM trước đọc pending, sau durable prepare và khi once đọc pending có sẵn; lần lượt85/63/64ms, cycle kết thúc `stopping`, không dispatch mới |
| Restart |Giữ nguyên key/body/context; restart tạo đúng1 command/1 audit, archive đúng bytes và native scoped RPC trả200 |
| Restart lần2 |Idle, cùng receipt và effect counts; không tăng thời hạn do replay |
| Cleanup |Issuer sessions về0 trước fixture cleanup;24 role và private root bị dọn. Kiểm độc lập cả red/green run đều0 container/volume/network |
| Hồi quy |54 bài:53 pass/0 fail/1 skip, terminal0. Skip là monitoring renderer/Compose opt-in, không được nhận từ lượt này |

Timing là số đo sandbox sau khi gửi signal và nhả barrier, không phải SLA shutdown trên VPS. Native positive là credential publication/RPC; chưa phải owner signup hoặc hotel active E2E.

```powershell
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation-faults
node --test --test-reporter=spec server/control/setup-rotation-runtime.test.mjs server/control/setup-credential-rotation.test.mjs server/control/setup-runtime.test.mjs server/control/setup-worker.test.mjs server/control/backend-source-binding.test.mjs scripts/roomqc-sandbox-state.test.mjs
```

## Phần chưa được nhận

Chưa khép publication/archive interruption, corrupt/partial/disk fault đủ cửa sổ hoặc hai daemon cùng tranh yêu cầu ở mọi barrier. Bài kiểm `prepare` giữ sau khi method thật trả về; không chứng minh riêng mọi mốc `command_synced`/`pending_synced`. Actor revoke Auth→directory→business vẫn chưa có protocol/actual đầy đủ. UID1000 của Compose và môi trường VPS staging chưa được kiểm từ packet UID10001 này.

[Worker mount nguồn313](roomqc-setup-runtime-mount-local-2026-10-29.md) giữ phạm vi lịch sử của chính nó, không tự thành proof315. Periodic nguồn310 đã được kiểm lại trên315 như mục dưới; không sửa packet310 hoặc gán lại nguồn lịch sử.

## Hồi quy periodic trên cùng nguồn315

[Run19d9702d9487](../../../artifacts/roomqc-setup-rotation-periodic-19d9702d9487-local-2026-10-29.json) chạy `node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation`, terminal exit0:17 kiểm (11 rotation) qua20 process UID10001/CapEff0, cùng SHA256315 ở trên. Source/schema đầu–cuối khớp,24 role/private root bị dọn và kiểm độc lập còn0 container/volume/network.

Đã kiểm lại SIGKILL sau durable prepare và sau DB commit/mất response, replay cùng receipt một effect, mutex contender, shared journal khi idle, cutoff/expiry theo DB khi mọi daemon đã dừng và automatic path không hồi sinh expired/revoked head. Periodic chạy timer/backoff thật: retry đầu1201ms, retry sau2168ms,2 idle cycles; SIGTERM khi idle thoát0. SIGTERM sau commit trong khi giữ response gốc chờ publication/archive cùng receipt xong rồi exit0,3527ms từ khi nhả response; không mở tick mới.

Run này là hồi quy phạm vi của suite periodic đã có, không khép mọi contention/sync/publication/archive/corruption/disk fault. Số kiểm của hai run được giữ riêng; không cộng thành số ca nghiệm thu release. Mốc nguồn315 mới có actual periodic, nhưng vẫn chưa VPS, actor revoke xuyên DB hoặc owner signup E2E.

Tiếp [phiếu startup/journal](roomqc-vps-signup-master-acceptance-2026-10-28.md#103-phiếu-startup-và-journal-cần-bổ-sung), khép phần fault chưa kiểm rồi protocol actor revoke, sau đó BG03–BG11. Giữ nguyên8đợt/25task/27gói/70ca/124lượt/122mục,actual/reviewer/signoff/gates. Packet local không tự ký nghiệm thu release.
