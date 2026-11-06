# RoomQC — lỗi kết nối, tranh chấp và phục hồi installer

Ngày 28/10/2026. Tiếp lần1 của [kế hoạch toàn VPS + signup](roomqc-vps-signup-implementation-board-2026-10-28.md), theo [ma trận IF01–IF17](roomqc-setup-installer-fault-matrix-2026-10-28.md). Không thay ca nghiệm thu hoặc gate gốc. [Checkpoint installer trước](roomqc-setup-credential-installer-local-2026-10-28.md) giữ đúng source7b7fb7 và16 controls; không lấy packet đó áp cho candidate mới.

## 1. Thay đổi

[Installer](../../../server/control/setup-credential-installer.mjs) phân biệt `SETUP_INSTALLER_COMMAND_CONFLICT` khi PostgreSQL trả đúng SQLSTATE P0001 và message `SETUP_CREDENTIAL_KEY_CONFLICT`. Refusal này xuất từ guard immutable caller/key/body trước effects. Generic SQL error, lỗi transport hoặc text gần giống vẫn giữ unknown sau dispatch; không suy ra rollback từ việc client chết. Recovery giữ original operation/key. [Runbook](roomqc-setup-credential-installer-runbook.md) đã bổ sung cách xử lý.

[Harness native](../../../server/control/testing/setup-installer-native.mjs) thêm mất TCP response sau bind và revoke commit; replay khác body/caller; publish receipt của issuer khác; hai process/LOGIN/observer riêng trong budget issuer2 replicas, mỗi LOGIN connection limit1/pool1. Với cạnh tranh, một CLI thật được SIGSTOP sau DB commit khi proxy đang giữ response để không biến bài contention thành query timeout trên host chậm; sau đó SIGKILL/restart. Không mở endpoint debug hoặc thêm quyền cho runtime.

Ca trước commit giữ đúng row management bằng phiên fixture maintenance, quan sát actual CLI query wait trên `pg_stat_activity`, SIGKILL client, thả khóa, chờ backend terminal rồi đọc số command thật. Chấp nhận0 hoặc1 effects tại thời điểm client chết, ghi rõ actual, sau replay bắt buộc đúng1 command/audit và RPC thật thành công. Kiểm mutex từ session độc lập sau terminal. Không có trigger/schema hook hoặc giả response PG cho barrier này.

## 2. Candidate và kiểm chứng

Backend287 files, SHA256 `1f576b109c6c5665a2dec4e4e0aa06e818a246a872c384b1b226d84eadc612dc`;584 business+19 directory migrations. Không đổi migration nghiệp vụ hay directory ở đợt này.

[Focused4027dc8db932](../../../artifacts/roomqc-setup-installer-faults-focused-native-4027dc8db932-local-2026-10-28.json) đạt27/27, terminal0, schema trước/sau khớp, end-source verified, cleanup containers/volumes/networks0. Hai actual SIGKILL và hai barrier, ba TCP response drops sau bind/issue/revoke commit; IF01–IF05 có proof trong phạm vi native local. Actual `precommitObservedEffects=1`: DB tiếp tục commit sau client SIGKILL; sau replay vẫn đúng1 command/audit, không cấp thêm credential và RPC thật thành công.

| Bằng chứng cùng candidate | Actual | Giới hạn |
|---|---|---|
| [Native API/worker/CLI](../../../artifacts/roomqc-setup-installer-faults-native-d32aa8428523-local-2026-10-28.json) | 289/289 controls, terminal0, end-source verified, schema trước/sau không đổi, cleanup0 | Diagnostic local; release/health/confirmed Auth có fixture, chưa full-default/rebuild/VPS |
| [Control regression](../../../artifacts/roomqc-workspace-recheck-e2407c296c38-local-2026-10-28.json) | 673 tổng/671 pass/0 fail/2 skip,16 recheck cases; terminal0, source khớp, cleanup0 | Hai skip do symlink Windows và POSIX notification modes chỉ kiểm Linux; Auth/remote receipts có fixture |
| Installer+signer | 15/15 nằm trong hồi quy trên; thêm actual caller/key conflict ở native | Unit không thay DB/CLI/fault proof |

289 controls gồm184 API/worker/CLI nền và105 credential/status/attestation/publication/installer;27 installer controls nằm trong105, tăng11 so checkpoint16. Hai installer SIGKILL tách riêng bốn publisher component kills, hai SQL-writer kills, mười API/worker kills và một backfill CLI kill. Native tích hợp quan sát precommit effects=1 trước replay; sau replay một command/audit và RPC thành công. Không dùng số kill làm số ca nghiệm thu. Advisors đo808 findings, gồm247 WARN; chưa disposition/security signoff.

## 3. Lần thất bại và sửa fixture

[Focused f3a1a6a6a451](../../../artifacts/roomqc-setup-installer-faults-focused-native-f3a1a6a6a451-local-2026-10-28.json) terminal1, cleanup0. LOGIN quan sát thiếu UPDATE để lấy FOR UPDATE trên management; đổi thao tác tạo barrier sang session maintenance có sẵn trong fixture. Không tăng quyền installer hoặc observer. [Control2fe5ba57e299](../../../artifacts/roomqc-workspace-recheck-2fe5ba57e299-local-2026-10-28.json) đạt673 tổng/671 pass/0 fail/2 skip trên sourcefd6d6 trước sửa fixture; packet này giữ lịch sử, không nhận thay candidate1f576b hiện tại.

## 4. Giới hạn và việc tiếp

IF01–IF05 có focused/native tích hợp/hồi quy cùng source, terminal0 và cleanup0; chưa có reviewer để đóng lần bàn giao. IF06–IF17, rotation daemon, mount/UID/reload, thu hồi actor xuyên Auth→directory, default-full/rebuild và nghiệm thu VPS vẫn mở. Cạnh tranh2 CLI không là load test hoặc proof sức chứa khách sạn. Signer/release authority có fixture; không dùng để nhận khóa vận hành thật.

Giữ ledger/worksheet gốc:70ca not_run,122mục unverified,124lượt môi trường chưa ghi actual nghiệm thu, reviewer/signoff/gates không đổi. Không migrate database phục vụ, đổi DNS/secret/flags hoặc bật worker/signup/dispatch. Goal toàn bộ plan tiếp tục active.
