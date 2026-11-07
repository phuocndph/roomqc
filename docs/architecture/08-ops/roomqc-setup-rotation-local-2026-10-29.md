# RoomQC — thay khóa setup và phục hồi daemon, kiểm native local

Ngày 29/10/2026. BG02/T03/T08/T12 có tiến triển code và proof local; **chưa nghiệm thu BG02 hoặc toàn sản phẩm**. [Packet kiểm](../../../artifacts/roomqc-setup-rotation-1c06a184f980-local-2026-10-29.json), [runbook](roomqc-setup-credential-rotation-runbook.md).

## Kết quả

Đã đưa delta rotation từ worktree riêng sang `roomqc-worktrees/integration`, rà và sửa tại đây. Không lấy kết quả unit/component của checkout kia để nhận candidate này.

| Phạm vi | Bằng chứng của run1c06a184f980 |
|---|---|
| Native |14 kiểm đạt, gồm6 kiểm nền installer và8 kiểm rotation; PostgreSQL/PostgREST thật, directory DB riêng |
| Process |18 CLI/rotation process, từng process có witness UID/GID10001, nhóm10001, CapEff0, no-new-privileges và source read-only |
| Gián đoạn |SIGKILL sau durable prepare/trước dispatch; SIGKILL sau DB commit/trước response; restart cùng caller/key/body |
| Effects |Một command/audit/credential cho yêu cầu đã commit; ID/iat/exp giữ nguyên;11 bảng nghiệp vụ đối chứng không đổi |
| Cạnh tranh |Hai process khác caller/journal tranh target và bị mutex chặn trước effects; hai process chung journal khi head chưa đến lịch không phát lệnh mới |
| Thời hạn |RPC khóa cũ bị403 sau overlap DB; head mới bị403 khi hết hạn thật với toàn bộ rotator đã dừng; daemon không tự hồi sinh expired/revoked head |
| Migration |585 business +19 directory; migration mới bị ordinary migration login từ chối, fault22012 rollback function/history/schema, phiên maintenance áp thành công |
| Nguồn |310 file, SHA256 `314c1ec4b68fec86b5cf49aedf6d328555e4545f7d934520989b362fca74cb4a`; nguồn đầu–cuối khớp |
| Schema |Đầu–cuối `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde` |
| Terminal/cleanup |Exit0, phase `setup_rotation_diagnostic_verified`;24 role fixture xóa, private files xóa; container/volume/network theo label run còn0 |
| Unit |693 tổng,509 pass,0 fail,184 skip; opt-in DB/engine bị skip, không gọi693 pass |

Số8 rotation không cộng vào14 để báo22. Các số chỉ thuộc run/source này; không gán rebuild301/ede96e, runtime301/2ec50 hoặc restore snapshot độc lập cho nguồn310 mới.

## Thay đổi và nguyên nhân

1. `setup-credential-rotation.mjs` giữ một tick/target trong process, policy strict và retry có backoff/jitter hữu hạn. TTL/overlap theo DB status, trừ cả elapsed monotonic của lần check; lệch đồng hồ máy không kéo dài quyền. Bootstrap/revoked/expired head chuyển review.
2. `setup-rotation-journal.mjs` ghi/sync exact command+context trước dispatch, phục hồi pending trước phát yêu cầu mới, archive nguyên command sau kết quả xác định. Unknown transport/publication không đổi key; context/config/caller lệch, file hardlink hoặc bytes hỏng bị chặn.
3. Installer trả metadata status đã lọc/kiểm target; pin hash config khi daemon gọi. Chỉ exact SQLSTATE/message CAS refusal đã review được coi known refusal; lỗi tổng quát sau dispatch vẫn unknown.
4. Migration `20261029005352_setup_credential_rotation_ready_fence.sql` thêm `roomqc_setup_admin.rotate(jsonb)`. Dưới cùng mutex và khóa hàng, DB kiểm predecessor live trước cấp mới. Replay command đã commit vẫn lấy immutable receipt, không gia hạn. Đường issue thủ công giữ riêng; native kiểm manual recovery còn dùng được sau expired head.
5. Compose dùng entrypoint tồn tại trong image control, mount private inputs chỉ đọc, journal/output của issuer có quyền ghi. Worker consumer dùng output directory chỉ đọc trong compose riêng. Parse compose và kiểm entrypoint đã đạt; đây chưa là proof mount/reload của container worker.

Quyền function mới đã đọc catalog khi sandbox còn live: owner `roomqc_setup_credential_owner`, SECURITY DEFINER/search_path rỗng, chỉ issuer capability có EXECUTE. PUBLIC/anon/authenticated/service_role/recovery/installer không có EXECUTE. Đây là kiểm ACL hẹp; chưa thay advisors/disposition toàn callable surface.

## Lệnh và đầu vào bằng chứng

```powershell
node --test --test-reporter=spec server/control/*.test.mjs
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation
```

Ownership riêng: `.local/roomqc-backend-1c06a184f980-w2wxT4/ownership.json`. Log unit: `.local/setup-rotation-control-unit-2026-10-29.log`; ACL projection riêng: `.local/setup-rotation-function-acl-1c06a184f980.json`. Các file này không đưa secret/config riêng vào repo artifacts. Packet công khai ghi hash/ref và kết quả đã lọc.

Đã kiểm output packet không có chuỗi bearer/JWT/DSN/private key; nguồn/protected ledger/worksheet không bị sửa bởi run. Full backend, frontend, E2E, staging và gates không được nhận từ diagnostic này.

## Khoảng trống sau run 1c06a184f980

- Ở run1c06a184f980 mới có `--once`. Run23f18d88c646 bên dưới đã bổ sung timer/backoff và SIGTERM idle/post-commit; soak dài và các cửa sổ shutdown còn thiếu vẫn mở.
- Hai journal cùng tranh stale head qua CAS sau khi cùng lấy status, journal filesystem fault matrix và kill ở mọi mốc publish/archive; cạnh tranh đã kiểm lần này không thay các cửa sổ đó.
- Worker container thực chỉ mount output directory read-only, reload inode mới và không thấy issuer signer/DSN/journal; runtime kiểm live ở source301 là proof hỗ trợ riêng, chưa chứng minh điều này.
- Protocol actor revoke xuyên Auth→directory, pause giữa check/claim/RPC/settle và disposition đầy đủ. Credential DB fence không thay actor/session revocation.
- Candidate mới cần kiểm các delta kế tiếp và integration/rebuild BG06, Linux VPS/TLS/secret custody, offsite restore/on-call, A/B/web/Android, tải/RC/pilot và reviewer độc lập.

Giữ25task/27gói/70ca/124lượt;70ca gốc not_run/122mục unverified, actual/reviewer/signoff/gates không tự cập nhật. Mục tiêu toàn plan vẫn active.

## Bổ sung hồi quy shutdown ngày 29/10/2026

Nguồn sau sửa shutdown có 310 tệp backend, SHA256 `7e41e984c100e1db977d1da7bf232fe847ac5296d146beadd38a6f4f26401abd`; 585 migration nghiệp vụ và 19 directory. Run native `1c06a184f980` ở trên thuộc hash `314c1ec4…`; không gán kết quả native đó cho nguồn sau sửa.

Hai lỗi đã được tái hiện và sửa trong `server/control/setup-credential-rotation.mjs`:

1. Shutdown đến trong lúc chờ nạp cấu hình hoặc đọc pending journal nhưng vòng xử lý vẫn có thể gọi check/replay tiếp. Nay kiểm trạng thái dừng sau từng điểm chờ trước khi dispatch. Intent còn nguyên để process kế tiếp phục hồi.
2. Request đã gửi hoàn tất sau khi bắt đầu shutdown có thể bật lại readiness. Nay nhánh hoàn tất và shutdown đều giữ ready=false; request đã gửi vẫn được chờ/ghi receipt theo giao thức, không tự phát thêm tick.

Lượt kiểm lại hiện tại: `node --test --test-reporter=spec server/control/setup-credential-rotation.test.mjs`, **11 test, 11 pass, 0 fail, 0 skip, exit 0**. Các barrier kiểm dừng lúc load/pending, yêu cầu đang in-flight và tick sau shutdown. Đây là **unit test với adapter giả lập**, không có DB/container hoặc tín hiệu OS thật. [Audit hiện hành](../../../artifacts/roomqc-vps-signup-plan-review-2026-10-29.json) lưu source-bound kết quả kiểm lại và coverage hồ sơ.

Phần nhận tiếp BG02-R12 tại thời điểm chạy unit: gọi daemon sản phẩm không dùng `--once`, quan sát tối thiểu hai chu kỳ, gửi SIGTERM tại các barrier load/pending/in-flight/timer rồi kiểm không check/issue/claim mới, readiness đóng, thoát trong deadline cấu hình và khởi động lại cùng pending key. Lượt native bên dưới đã bổ sung timer/backoff, idle và in-flight; chưa bao phủ trọn matrix này. R09 mount/reload và R11 revoke xuyên Auth→directory vẫn mở. Kiểm tích hợp của nguồn cuối thuộc BG06; chưa nghiệm thu BG02 hoặc mở gate.

## Periodic daemon và SIGTERM native — run 23f18d88c646

Lượt hiện hành đã chạy `node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation` và nhận **terminal exit 0**. [Packet đầy đủ đã lọc](../../../artifacts/roomqc-setup-rotation-periodic-23f18d88c646-local-2026-10-29.json) ghi source, schema, witness process, clock timeline và phạm vi còn thiếu. Đây là fixture local dùng release signer thử, không deploy VPS hoặc bật signup vận hành.

| Phạm vi | Actual của lượt này |
|---|---|
| Nguồn | 310 tệp, SHA256 `7e41e984c100e1db977d1da7bf232fe847ac5296d146beadd38a6f4f26401abd`; source đầu–cuối khớp |
| Database | 585 migration nghiệp vụ +19 directory; fingerprint trước–sau cùng `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde` |
| Native | **17 kiểm đạt**, gồm 6 kiểm nền và **11 kiểm rotation**; không cộng hai con số thành 28 |
| Process thật | 20 lần chạy CLI/daemon; từng process có UID/GID10001, CapEff0, no-new-privileges và source read-only |
| Timer/backoff | Chặn hai handshake PostgreSQL thật để gây timeout; timer retry quan sát được 1.227ms rồi 2.163ms; phục hồi chỉ issue một lần, sau đó có 2 chu kỳ idle |
| SIGTERM idle | Daemon thoát code0, có event stopping→stopped; không tự đặt tick mới |
| SIGTERM sau commit | Giữ frame gốc từ PostgreSQL sau commit, gửi SIGTERM, xác nhận process đang chờ; mở response thì publication/archive hoàn tất, thoát code0, cùng receipt và đúng một command/audit |
| Thời gian drain | 3.331ms tính từ khi mở response đang giữ tới lúc nhận terminal; đây không phải tổng thời gian của mọi nhánh shutdown |
| Kill/replay | Hai mốc kill trước dispatch/sau commit, phục hồi nguyên caller/key/body/ID/iat/exp; không tạo thêm command/audit hoặc gia hạn TTL |
| Expiry/revoke | RPC khóa cũ bị từ chối sau overlap và head hết hạn theo DB khi rotator đã dừng; đường tự động không hồi sinh head expired/revoked |
| Hồi quy control | 695 tổng: **511 pass, 0 fail, 184 skip**, exit0; không gọi là 695 test đạt |
| Thu dọn | 24 role fixture và file riêng đã xóa; kiểm độc lập label run còn 0 container/volume/network |

Lượt này giữ snapshot 11 bảng nghiệp vụ và không đổi schema ngoài fixture. Log control ở `.local/setup-rotation-periodic-control-2026-10-29.log`; ownership tại `.local/roomqc-backend-23f18d88c646-fDrL0L/ownership.json`. Packet chỉ chứa metadata và kết quả đã lọc, không JWT/DSN/private key.

**Bàn giao có phạm vi:** timer/backoff và SIGTERM idle/post-commit đã có proof native, thay cho trạng thái chỉ unit trước đó. BG02-R12 vẫn còn SIGTERM ở load/pending/prepare, journal filesystem fault và timeout toàn matrix. Tranh chấp hiện có mutex và shared-journal idle; chưa là full barrier race cùng stale head. R07 publish/archive windows, R09 mount/reload container và R11 actor revoke xuyên Auth→directory chưa khép. Full product candidate/rebuild, Linux staging, offsite restore, E2E, tải và pilot vẫn theo các BG còn lại; 70 ca/124 lượt release và reviewer/signoff không tự đổi.

**Việc tiếp:** bổ sung fixture worker riêng chỉ mount directory output read-only, dùng DSN runtime hạn quyền riêng; kiểm issuer rename→worker reload→RPC native sau cutoff, UID/mount/private-input isolation và missing/expired/revoked credential. Giữ journal/signer/issuer DSN ngoài mount của worker. Không dùng proof source301 hoặc unit transport để đóng R09.
