# RoomQC — vận hành daemon thay khóa setup

Ngày 29/10/2026. Thuộc BG02/T03/T08/T12. Đây là runbook cho candidate đang kiểm local; chưa cho phép bật worker/issuer phục vụ khách hoặc ký gate. Xem [plan](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#bg021-phiếu-việc-kế-tiếp-có-thể-giao-ngay) và [12 subchecks](roomqc-vps-signup-master-acceptance-2026-10-28.md#10-bài-kiểm-chi-tiết-cho-bg02).

## 1. Ranh giới

Daemon chỉ thay head credential đang ready và gần hết hạn. Không bind cụm, bootstrap, khôi phục khóa hết hạn/bị revoke, tự mở admission hoặc chuyển workspace sang cụm khác. Operator dùng installer riêng để bootstrap/recovery/revoke sau khi kiểm target và authority. Client nghiệp vụ không nhận signer, issuer DSN hoặc quyền maintenance.

`roomqc_setup_admin.rotate(jsonb)` kiểm head còn hiệu lực bằng DB clock dưới mutex và khóa hàng trước khi cấp lần mới. Quyền EXECUTE chỉ cấp cho capability issuer, schema không đưa lên Data API. Replay một yêu cầu đã commit trả cùng receipt trước kiểm head mới; publication vẫn kiểm current authority/head và RPC native. Không dùng cơ chế này để kết luận thu hồi actor Auth đã nguyên tử với directory.

## 2. Chuẩn bị

1. Linux target/DB system identifier/OID/name/LOGIN/release/hash/trust đã được review. Thêm migration mới bằng phiên maintenance riêng, không nâng quyền runtime. Cấu hình installer phải dùng consumer `setup-credential-rotation`; budget ở cả business và directory tính đủ replica, mỗi process một kết nối mỗi DB.
2. Chuẩn bị private input directory chứa installer config, DSN issuer/observer, signer, publishable key, trust và budget theo đường dẫn container. Không để input hoặc journal trong cây output credential. Root directory không symlink; owner/mode riêng, file nlink=1; dùng đúng UID/GID của process. Local Windows ACL chỉ là bài component, không thay proof Linux.
3. Bootstrap head qua installer thủ công và kiểm credential native thành công. Khóa đã revoked/expired giữ nguyên để review; daemon không tự sửa trạng thái đó.
4. Dùng policy mẫu [setup-rotation.example.json](../../../deploy/monitoring/setup-rotation.example.json): TTL300s, overlap20s, rotate-before120s, interval10s là giá trị mẫu, cần review theo target. Loader chặn ngoài contract TTL120–3600s/overlap10–60s, thiếu margin deadline45s + interval +10s, hoặc chu kỳ mới chồng predecessor còn sống.

## 3. Mount và lệnh

Compose: [setup-rotation.compose.yml](../../../deploy/monitoring/setup-rotation.compose.yml). Image từ `server/control/Dockerfile` chạy `node workers/setup-rotation-runtime.mjs`; không giả định image có thư mục scripts của repository.

| Mount | Daemon issuer | Worker tiêu thụ |
|---|---|---|
| `/etc/roomqc/private` | Chỉ đọc, gồm các input riêng đã review | Không mount |
| `/var/lib/roomqc/setup-rotation-journal` | Đọc/ghi, giữ qua restart | Không mount |
| `/run/roomqc/setup` | Đọc/ghi để fsync và atomic rename | Chỉ đọc **directory**, không bind một file inode cũ |
| DSN directory của worker | Không dùng thay issuer/observer | Secret riêng hạn quyền theo setup-worker compose |

Các biến cần cấp bằng cấu hình host: `ROOMQC_SETUP_ROTATION_PROJECT`, `ROOMQC_SETUP_IMAGE`, `ROOMQC_SETUP_ROTATION_CONFIG_FILE`, `ROOMQC_SETUP_INSTALLER_PRIVATE_DIR`, `ROOMQC_SETUP_ROTATION_JOURNAL_DIR`, `ROOMQC_SETUP_CREDENTIALS_DIR`, `ROOMQC_SETUP_DIRECTORY_NETWORK`, `ROOMQC_SETUP_EGRESS_NETWORK`. Không đặt secret trực tiếp vào lệnh hoặc env JSON hiển thị trong log. Đường dẫn input trong installer JSON phải khớp mount thực; không có giá trị ngầm trỏ local.

Chạy kiểm cú pháp compose trước. Kiểm một lượt trong container đã cấu hình bằng cùng entrypoint thêm `--once`; chỉ sau khi lượt đó, mount/quyền và target được nhận mới chạy lâu dài bằng profile `setup-rotation`. CLI repository tương đương:

```powershell
node scripts/control-setup-credential-rotation.mjs --help
```

Trên Linux, thêm `--config-file /đường-dẫn-riêng/rotation.json` và `--once` để chạy một lượt; bỏ `--once` để chạy daemon. `--allow-local` chỉ cho fixture không production; không dùng nó để hạ điều kiện HTTPS/platform trên VPS thật.

## 4. Kết quả và restart

Event chỉ có instance/action/mã lỗi/ID/thời hạn; không raw JWT/DSN/signer/provider body. `idle` nghĩa là chưa đến lịch thay theo status DB, không thay readiness của worker hoặc chứng minh output file còn đọc được. `rotated` chỉ sau publication và native RPC đạt. `superseded` chỉ cho CAS/head refusal xác định; không chứng minh credential worker usable. Các lỗi còn lại giữ pending và báo review. `--once` trả exit1 khi review/start thất bại.

Mỗi target có một tick trong process. Lỗi dùng retry tăng dần có jitter và trần30s; không tạo command mới để vượt lỗi. Signal handler được đăng trước async startup; SIGTERM/SIGINT khi load config, initialize journal hoặc đọc pending chốt dừng và không mở tick/dispatch mới. Lỗi cấu hình thật vẫn exit1 dù có signal cùng lúc. Nếu đã dispatch thì chờ in-flight/giữ pending để đối soát; hard stop55s. `--once` cũng theo stop latch và thu dọn listener. SIGKILL hoặc mất máy để lại spool cho restart. Không xóa spool để chữa lỗi.

`pending/<key>/command.json` và context được ghi/sync trước dispatch. Archive giữ command bất biến ở `history/published/<key>` hoặc `history/superseded/<key>`; biên nhận chuẩn nằm trong DB theo caller/key/body. Restart cùng instance/config/context đọc pending trước khi lấy status hoặc phát key mới. Partial/corrupt pending bị chặn; không chỉnh hash/body hoặc đoán rollback. Thư mục prepare chưa công bố chưa từng được dispatch qua đường này; giữ để điều tra, số lượng bị giới hạn.

Khi đổi config/caller/signer/release mà còn pending: giữ nguyên hồ sơ cũ, đối soát bằng cấu hình/caller được review cho yêu cầu đó. Không chép pending sang context mới hoặc tự archive outcome chưa biết. Nếu authority đã bị rút, dừng và giao operator; không khôi phục authority để làm test xanh.

## 5. Sự cố

| Tình huống | Hành động |
|---|---|
| Timeout/mất response/sau commit process chết | Restart cùng journal/config; replay chính request. Đối chiếu DB command/audit/credential ID/iat/exp, không tăng TTL |
| Hai daemon tranh target | Giữ business mutex/CAS/DB head; process thua chờ/review có hạn. Không tăng connection limit hoặc đổi key để né contention; budget phải tính cả hai process |
| Journal thiếu quyền/hỏng/đầy đĩa | Dừng phát mới, giữ bytes/inode/ownership và yêu cầu đang chờ. Sửa filesystem trong scope rồi đối soát, không xóa history |
| Credential expired/revoked/unbound | Daemon review; operator kiểm nguyên nhân và dùng đường installer thủ công được duyệt. Worker phải unready nếu không còn credential hợp lệ |
| Khóa bị nghi lộ | Dừng thành phần chịu ảnh hưởng; revoke qua installer, ghi DB mốc hiệu lực và thử RPC khóa cũ. Cấp khóa mới theo quy trình riêng; không chỉ xóa file hoặc chờ refresh JWT |
| Cần rollback | Dừng daemon, giữ pending/history/output; binary/config cũ chỉ dùng nếu tương thích RPC/schema và exact context. Không down-migrate phá dữ liệu, xóa receipt/audit hoặc tự mở admission |

## 6. Điều kiện trước vận hành

Native local có [startup/pending run db40d4b8c62b/source315](roomqc-setup-rotation-startup-local-2026-10-29.md):16 kiểm/13 process, config/init/pending/durable prepare/once stop và restart một effect;53 pass/0 fail/1 skip hồi quy. [Run23f18d88c646/source310](roomqc-setup-rotation-local-2026-10-29.md#periodic-daemon-và-sigterm-native--run-23f18d88c646) giữ proof timer/backoff, idle/post-commit/kill/replay/expiry/revoke theo nguồn riêng. [Worker mount source313](roomqc-setup-runtime-mount-local-2026-10-29.md) đã có diagnostic local, profile UID1000/staging còn mở. Chưa nhận full race/journal/publication/archive/SIGTERM matrix, actor revoke xuyên Auth→directory, staging/TLS/secret custody hoặc BG02. Không lấy compose parse, unit hoặc bài đồng hồ giả làm proof các phần thiếu; giữ quyết định vận hành mở.

## Native journal/publication/archive — run a4cb64dd5c4c

[Durability local316](roomqc-setup-rotation-durability-local-2026-10-29.md) đã kiểm8cửa sổ bằng daemon thật UID10001: command_synced SIGKILL; pending_synced SIGTERM/SIGKILL; publication trước/sau rename/sau directory sync; before_archive/archive_synced. Khôi phục pending cùng caller/key/body/receipt, không gia hạn ID/iat/exp; request đã archive khởi động lại idle. Stage prepare chưa dispatch được phân biệt với pending/outcome chưa biết.

25kiểm/23process, exit0/source/schema khớp, cleanup0. Chưa full corrupt/partial journal/native disk fault/contention, actor revoke xuyênDB hoặc profile VPS UID1000. Đây là lệnh sandbox riêng, không phải lệnh sửa journal đang phục vụ:

```powershell
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation-durability
```

Khi journal/output đang lỗi và outcome chưa rõ, giữ nguyên file/evidence/caller/key/body; không xóa pending hoặc issue khóa mới chỉ vì timeout. Dùng receipt và runbook hiện hành để đối soát, giữ scope/operator review. Các phase đã kiểm local không chứng minh hỏng đĩa phần cứng hoặc toàn BG02.


## Diagnostic journal corruption và IO local

Lệnh sandbox: `node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation-storage`. [Báo cáo318](roomqc-setup-rotation-storage-local-2026-10-29.md) có10corruption/8FUSE EIO, positive/fault/recovery và restart lần2; daemon UID10001, kernel/syscall witness thật. Không chạy lên serving DB hoặc dùng fault-control ngoài sandbox có ownership. FUSE parent có quyền mount riêng, sản phẩm không có capability.

Record hỏng phải dừng dispatch và giữ forensic bytes; không xóa pending để phát yêu cầu mới. Stage chưa công bố chỉ được bỏ qua sau khi xác định chưa dispatch; pending/outcome chưa rõ giữ caller/key/body và đọc receipt. Sau archive rename, history có thể đã có key dù sync lỗi; kiểm layout thật và live head, không tạo lại issue chỉ vì pending rỗng. Chi tiết expected ở hồ sơ nghiệm thu10.4. Phần contention, actor revoke và profile VPS vẫn cần packet riêng.

## Kiểm tranh chấp local 319

[Run5c839bfe5602](roomqc-setup-rotation-contention-local-2026-10-29.md) có3interleaving active với journal chung/riêng, CAS loser/unknown replay/archive race và native RPC/overlap. Source319/hash `44442d6d9e35e5dd845c30a2780cdb0b6664e8afd5efb2f74b1aea9aec7610f4`,exit0,cleanup0. Không mở rộng context để chia sẻ journal giữa caller/config khác. Cùng spool phải giữ đúng policy/config/instance; journal riêng vẫn chịu DB mutex/version/head. Lỗi connection limit của cùng LOGIN khác với BUSY của peer LOGIN. Giữ pending đến khi phân loại được outcome; kill/disconnect không chứng minh rollback. Chưa có protocol actor revoke xuyên Auth/directory/business hoặc nghiệm thu VPS từ diagnostic này.
