# RoomQC — journal hỏng và lỗi IO của daemon rotation, local 29/10/2026

Đã kiểm **10 biến thể journal hỏng và 8 điểm EIO** bằng daemon sản phẩm, PostgreSQL/PostgREST thật và filesystem FUSE riêng. Không phát hiện lỗi sản phẩm trong phạm vi18biến thể này. Thay đổi ở harness/observer/FUSE và wiring diagnostic; không sửa hành vi sản phẩm hoặc thêm migration. Đây là diagnostic local, chưa nhận toàn BG02 hoặc release.

## 1. Nguồn và lần chạy

- [Packet đã lọc](../../../artifacts/roomqc-setup-rotation-storage-ceaeeeb36691-local-2026-10-29.json); run **ceaeeeb36691**, terminal exit0, ownership cleaned=true.
- Backend318tệp, SHA256 `d1cb480efd7729006752894521109579585ea497a728eca88a1f950d6a5335a1`;585 migration nghiệp vụ/19 directory.
- Schema trước/sau `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`; migration set `8e55f912d34a1401096d5417c2e82d02af91313cb82efcfe03fb4c55cc894d42`.
- Lệnh: `node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation-storage`.
- 28kiểm native tổng,22storage checks;62process có witness UID/GID10001,CapEff0,no-new-privileges và source read-only. 11bảng nghiệp vụ bảo vệ không đổi.
- 48lần kiểm session issuer/observer về0, business mutex727012 và directory mutex727001 tự do, canary ngoài output/journal giữ nguyên. Role/private files thu dọn; kiểm độc lập Docker còn0container/volume/network.

Lượt đầu73e92de897d3 bị gián đoạn hạ tầng: exec handle/parent process không còn, Docker API tạm unavailable;7core container được quan sát exited255, producer không còn. Không có terminal result hợp lệ. Cleanup qua ownership manifest exit0 và đã kiểm0objects trước chạy lại. Lượt gián đoạn không được tính product pass/fail.

## 2. Mười biến thể journal hỏng

Dataset là pending đã sync, chưa dispatch; giữ key/body/context gốc. Mỗi lỗi có positive đọc pending trước/sau, daemon thật từ chối với SETUP_ROTATION_JOURNAL_INVALID, ready=false, DB effects mới0 và forensic bytes/metadata giữ nguyên trong cửa sổ fault.

| Biến thể | Actual local |
|---|---|
| JC01/JC02 | Thiếu riêng command.json hoặc context.json đều bị từ chối |
| JC03/JC04 | Command hoặc context JSON ghi dở đều bị từ chối |
| JC05 | Command đổi bytes mà không khớp hash bị chặn |
| JC06 | configurationSha256 trong context sai bị chặn |
| JC07 | commandSha256 trong manifest sai bị chặn |
| JC08 | Entry ngoài allowlist bị chặn |
| JC09 | Hardlink/nlink2 bị chặn bằng file thật |
| JC10 | Mode000 khiến UID sản phẩm không đọc được; không chạy sản phẩm bằng root |

Sau phục hồi cuối, cùng caller/key/body/context tạo đúng1command/audit/credential, dùng immutable receipt và native RPC200; history giữ command/context gốc. Restart daemon lần2 idle, DB và output không đổi. Positive đọc pending dừng có kiểm soát trước dispatch; không gọi các lần positive đó là signup E2E.

## 3. Tám điểm EIO qua kernel

Mỗi lượt chỉ bật một cờ của filesystem fixture; đối chiếu sự kiện FUSE operation/kind/errno5 với lỗi EIO từ syscall mà daemon gọi. Observer gọi original Node/kernel functions và chỉ ghi sự kiện; không thay kết quả để giả errno.

| Điểm | Actual tại fault và recovery |
|---|---|
| JI01 — write command | Không pending dispatchable, DB effects0; stage không được gửi |
| JI02 — fsync command | Ghi bytes chưa đủ để dispatch; DB effects0 |
| JI03 — fsync context | Context chưa sync không được công bố; DB effects0 |
| JI04 — fsync prepare directory | Stage chưa công bố, không gửi remote request |
| JI05 — rename prepare→pending | Rename bị từ chối; không pending đã công bố, DB effects0 |
| JI06 — fsync pending sau rename | Pending giữ cùng key/body; gỡ fault/restart phục hồi đúng pending, không dùng key thay thế |
| JI07 — rename pending→published history | DB/publication đã commit; daemon unready, pending/receipt giữ nguyên; recovery không tăng effects |
| JI08 — fsync history sau rename | History đã có key, pending rỗng; daemon unready tại lỗi. Recovery kiểm live head và idle; harness đối chiếu history/receipt, ID/iat/exp/output không đổi |

Năm điểm trước pending cho phép tạo key mới sau khi đã chứng minh chưa dispatch; stage bỏ dở không phải yêu cầu remote. Từ pending hoặc outcome có thể đã remote, luôn giữ identity/receipt. JI07/JI08 giữ cả output inode/hash đã công bố qua phục hồi. Mọi recovery có RPC thật và lần restart thứ2 idle.

Timing dùng DB clock, seed TTL1800giây, successor TTL3600/rotateBefore3540/overlap10giây; chờ head thực đến hạn và overlap cũ kết thúc. Không giả clock/expiry hoặc nới policy. Harness budget20phút, deadline installer45giây/shutdown55giây giữ nguyên.

## 4. Hồi quy và giới hạn

Hồi quy6file journal/publication/rotation/runtime/source binding/sandbox-state: **47tổng,46pass,0fail,1skip**, exit0. Kết quả được quan sát từ terminal session91372; không có raw regression log riêng. Skip là renderer/Compose opt-in, chưa được nhận. Native log/ownership nằm private theo reference/hash trong packet.

Không suy rộng sang mọi journal fault: symlink/owner/mode khác, ENOSPC/EROFS cho journal, IO tại các phase khác, hardware durability và profile VPS chưa được chứng minh bởi8EIO này. FUSE EIO qua kernel chứng minh đường xử lý lỗi filesystem; không là thử mất điện/đĩa vật lý. Local UID10001 không chứng nhận UID1000 trong Compose staging. Full contention và actor revoke xuyên Auth/directory/business còn mở.

Không có public owner signup/email/browser/Android, integrated product candidate, VPS/TLS, clean-host offsite DR, tải/chi phí hoặc pilot được nhận từ diagnostic này. Giữ70ca/124lượt và122mục release cùng reviewer/signoff/gates.

## 5. Việc nhận tiếp

1. Review22storage checks theo [ma trận10.4](roomqc-vps-signup-master-acceptance-2026-10-28.md#104-ma-trận-journal-hỏng-và-lỗi-io-cần-thực-hiện); chỉ bổ sung biến thể/proof thiếu hoặc delta, không giao lại18biến thể đã đạt như chưa chạy.
2. BG02-04: hai daemon ở barrier, journal chung rồi journal riêng cùng target; winner/loser,CAS/lock,overlap,unknown replay và archive race. Không dùng hai process tuần tự thay contention.
3. BG02-06/R11: chốt commit hiệu lực revoke actor qua Auth/directory/business; JWT còn hạn tại claim/RPC/settle, đo độ trễ. Credential revoke local không thay bài actor revoke.
4. Review profile UID1000/mount/budget/secret/runbook và candidate chịu ảnh hưởng; trình nhận phần đủ proof. Sau BG02 tiếp BG03–BG11 theo [phiếu toàn tuyến](roomqc-vps-signup-start-pack-2026-10-28.md#02-thứ-tự-bàn-giao-toàn-phạm-vi).
