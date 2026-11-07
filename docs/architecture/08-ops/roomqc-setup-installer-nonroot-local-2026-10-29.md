# RoomQC — kiểm bộ cài thực tế bằng tài khoản không đặc quyền

Ngày 29/10/2026. Phạm vi toàn VPS + signup; checkpoint này chứng minh local IF14/FS05–FS06 cùng candidate, chưa là nghiệm thu sản phẩm hoặc toàn bộ BG01.

## Kết quả và phiên bản

Backend 295 file/SHA256 bf2ddd26bb2a7b6ad467680d31abff91b39e26ccb83cad1c734b21932d8d179d. Source snapshot public được kiểm hash và gắn read-only. Không đưa .local, dữ liệu khách, operational DSN hoặc signer thật vào fixture.

| Bộ kiểm | Actual | Giới hạn |
|---|---|---|
|[Actual CLI không đặc quyền](../../../artifacts/roomqc-setup-installer-nonroot-native-da08c248d5ea-local-2026-10-29.json)|170/170 controls; 49 ca IF14; 238 CLI process có identity witness; terminal0, source/schema đầu–cuối khớp, cleanup0|Diagnostic setup-installer-nonroot; không phải full setup-dispatch/full-default hoặc VPS|
|[Hồi quy control](../../../artifacts/roomqc-workspace-recheck-2eda91b19a6f-local-2026-10-29.json)|676 tổng/674 pass/0 fail/2 skip; terminal0/source unchanged/cleanup0|Hai skip: Windows không cho symlink và mode production notification kiểm trên Linux; không quy đổi thành ca release đã đạt|
|[Chuẩn bị lỗi volume thật](../../../artifacts/roomqc-installer-volume-topology-8149ffff280e-local-2026-10-29.json)|5 kiểm topology: ENOSPC tại write intent/stage, EACCES tại open/rename, EROFS tại create; UID10001/CapEff0, bounded tmpfs256KiB, networknone, cleanup0|Không có product CLI hoặc DB; IF15Verified=false; chưa có fsync failure thật và recovery cùng mount read-only|

Native diagnostic dùng 584 migration nghiệp vụ và 19 directory migrations trong DB disposable. Schema không đổi cuối run; private files và roles được dọn theo ownership. Hồi quy này không bổ sung full-native dispatch 382 trên source294 vào số170 của source hiện hành.

## 49 ca IF14 đã chạy qua CLI thật

| Nhóm | Lỗi thực tế | Số ca |
|---|---|---:|
|8 private inputs: config, command, business DSN, directory DSN, budget, trust, signer, publishable key|Mỗi loại: symlink, hardlink, mode0644, owner10002/mode0600|32|
|Input nằm trong runtime subtree|Signer private nằm cùng subtree output|1|
|Output, intent, stage|Mỗi loại: symlink, hardlink, mode0644, owner10002/mode0600|12|
|Runtime directory|Symlink và owner10002|2|
|Output thuộc credential khác|Real signed credential khác receipt và predecessor|1|
|Directory được UID khác ghi|Tiến trình UID/GID10002 thực sự ghi marker vào directory0770; CLI phải từ chối dùng directory đó|1|

Mỗi ca: positive CLI/native REST trước lỗi → gây lỗi bằng inode/owner/mode thật → CLI từ chối, không thêm DB effect, canary ngoài output giữ nguyên → bỏ fault → cùng key/receipt phục hồi qua CLI/native REST. Giữ nguyên credential ID/iat/exp, đúng một command/audit/credential. Có147 lần kiểm session kết thúc, business mutex và directory exclusive mutex đều được nhả.

CLI sản phẩm chạy UID/GID10001, CapEff0, NoNewPrivs1, không supplementary root group. Mọi CLI, kể cả tiến trình bị kill, phải có witness kiểm source hash và read-only source trước import CLI. Không giả lập kết quả syscall.

Coordinator chuẩn bị fixture chạy UID0 với CHOWN/FOWNER/SETUID/SETGID/DAC_OVERRIDE/KILL trong container cap-drop-ALL/read-only/no-new-privileges. Coordinator không phải CLI sản phẩm; chỉ tạo và sửa file thuộc exact-owned temporary fixture. Trường filesystemKills.fixture.uid=0 mô tả coordinator, còn cliIdentity.witnesses chứng minh CLI10001. Các file private nằm trong leaf0700; /tmp sticky1777 không thay leaf private.

## Hồi quy crash và deadline trong cùng run

IF12: bốn actual CLI SIGSTOP có /proc witness rồi SIGKILL tại intent_synced, stage_synced, before_rename, after_rename. Replay cùng key giữ ID/iat/exp, một command/audit/credential, native REST thực và16 lần cleanup. IF11 giữ13 lần kiểm session/mutex và timeout sản phẩm45 giây.

Fixture nonroot có thêm147 invocation nên suite dùng deadline hữu hạn30 phút; từng command sản phẩm giữ nguyên deadline. Receipt phục vụ chuỗi hồi quy dùng TTL1800 giây hợp lệ theo policy, không được gia hạn trong replay; các bài expiry/deadline chuyên biệt vẫn giữ TTL ngắn.

## Lỗi fixture đã sửa, giữ lịch sử

- [Run91a40262ed75](../../../artifacts/roomqc-setup-installer-nonroot-native-91a40262ed75-local-2026-10-29.json) terminal1/cleanup0/verified=false. Dừng sau119 controls ở chmod inode thuộc UID10001, trước khi hoàn tất49 ca. Không gọi119 control dở là toàn run đạt.
- [Chẩn đoán](../../../artifacts/roomqc-setup-installer-nonroot-fixture-diagnostic-91a40262ed75-local-2026-10-29.json): EPERM/chmod do root fixture thiếu FOWNER; timedOut=false. Chỉ thêm FOWNER cho coordinator; không nâng quyền CLI hoặc đổi expected denial.
- [Run8cf024036d62 bị suite timeout](../../../artifacts/roomqc-setup-installer-nonroot-suite-timeout-8cf024036d62-local-2026-10-29.json):164 control quan sát/47 trên49 ca nonroot; terminal1/cleanup0/verified=false sau1200005ms. Không nhận partial run là IF14 đạt. Candidate hiện hành tăng riêng fixture thành1CPU/deadline30phút; deadline sản phẩm giữ nguyên.
- Hồi quy source7a5d [674 pass/2 skip](../../../artifacts/roomqc-workspace-recheck-59cacb625248-local-2026-10-29.json) giữ đúng source lịch sử, không xác nhận source2fb1 mới.
- [Checkpoint source294](roomqc-private-input-hardlinks-local-2026-10-28.md) giữ native382/382/control674 pass và topology3/3; không cộng các số giữa source.

## Nhận việc tiếp và điều kiện nghiệm thu

1. Reviewer đọc49 observation,147 cleanup và mọi identity witness, đối chiếu exact candidate. IF14 có local proof; BG01/T01/T08/T12 và gate vẫn chưa đóng.
2. IF15/FS07: nối bounded volume vào actual CLI, chặn trước write intent/stage thật; tạo ENOSPC qua filler có giới hạn; giữ DB outcome, receipt và file layout; bỏ filler rồi same-key recovery. Topology5/5 phía trên chỉ chuẩn bị.
3. IF15/FS08: actual CLI gặp EACCES/EROFS/rename ở syscall thật. Fsync failure cần filesystem tạo lỗi thật được giới hạn; nếu chưa có, ghi rõ chưa kiểm và giữ IF15 mở. Không ném errno từ preload để lấy pass.
4. Sau BG01: rotation/hai rotator/overlap/expiry, directory mount read-only và reload inode ở worker thật, Auth→directory revoke; rồi BG03–BG11 theo dependency trong [blueprint](roomqc-vps-signup-deployment-blueprint-2026-10-28.md).

Kiểm plan và packet hiện hành bằng [verifier nonroot](../../../scripts/verify-vps-signup-plan-nonroot.mjs). Verifier [plan-current source294](../../../scripts/verify-vps-signup-plan-current.mjs), deadline291 và handoff293 giữ pin lịch sử và phải từ chối source hiện hành; không thay pin cũ để viết lại bằng chứng.

Giữ nguyên ledger/worksheet:25 task/27 gói/70 ca not_run/122 mục unverified/124 lượt (54local,69staging,1pilot). Runner/reviewer/signoff và quyết định L/S/P/U/B không được tự gán. Full fault matrix, rotationDaemonVerified, runtimeMountReloadVerified và productAccepted còn false. Chưa có capacity proof cho1.000 khách sạn/100.000 user đồng thời.

Đầu vào chưa có khóa/quyền tập hợp tại Q01–Q10 của blueprint. Không mở signup/dispatch/worker hoặc chạm DB đang phục vụ từ checkpoint này.
