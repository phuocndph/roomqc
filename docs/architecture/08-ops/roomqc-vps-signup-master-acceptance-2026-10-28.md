# RoomQC — hồ sơ thực thi và nghiệm thu VPS + signup

**Cập nhật nhận việc 29/10/2026 — bản RF06 đang sửa:** phạm vi toàn bộ VPS + signup; đầu ra plan + nghiệm thu. Xem [hồ sơ hiện hành, mục2/5.6/11–12](roomqc-vps-signup-execution-dossier-2026-10-29.md) và [snapshot kế hoạch](../../../artifacts/roomqc-vps-signup-plan-handover-2026-10-29.json). Các checkpoint ghi bên dưới là bằng chứng đúng nguồn riêng; chưa nhận source RF06 hoặc cấp gate từ lần lập kế hoạch này.

**Điểm nhận việc hiện tại — đã nối runtime, 29/10/2026:** phạm vi toàn bộ VPS + signup; đầu ra plan + nghiệm thu. Bản đang sửa334 tệp/hash 6d7d491550eb9258865a2fa26eeae0a0e0934f7a8a5a2e6e8455da0ce24a8dac,587 business/21 directory migrations. [Báo cáo runtime](roomqc-support-intents-runtime-local-2026-10-29.md) và [packet](../../../artifacts/roomqc-support-intents-runtime-b3e1f84b1812-local-2026-10-29.json): native113/113,34barriers/3SIGKILL,exit0 trên source243567; control529pass/201skip/0fail cùng nguồn. Directory r2 có168pass/1fail do expected callback; đã sửa ba assertion và focused r3 đạt1/1 trên source hiện hành. Không cộng thành full169/169 cùng nguồn. Runtime bốn nhóm mutator đã nối journal; native expired recovery mới chỉ chứng minh close_admission,8HTTP retries cùng một API process. Nhận tiếp RF06 legacy,all-family/two-process recovery,worker,populated upgrade/security; R11/BG02 vàBG03–BG11 còn mở. Giữ25task/70ca/124lượt/122mục unverified; actual/reviewer/signoff/gates không đổi.

<details>
<summary>Lịch sử checkpoint — chỉ áp dụng đúng nguồn của từng báo cáo</summary>

**Checkpoint nền journal334/d30e — lịch sử, 29/10/2026:** source334/hash `d30e5ee5908404ed2da8d64ddc955305e98c273086bfe119334fac39b623dcf7`, 587 business/21 directory migrations. [Báo cáo](roomqc-support-intents-foundation-local-2026-10-29.md) và [packet](../../../artifacts/roomqc-support-intents-foundation-207ce2e0ad48-local-2026-10-29.json): directory 169/169 (9 ca journal mới), control 527 pass/0 fail/201 skip; native 104/104 kiểm tương thích Auth/HTTP hiện có, exit0. Journal giữ identity/generation/predecessor bền vững, khóa trên một connection và chặn vòng cũ; đã sửa xử lý backend termination và fixture pool cleanup. **Chưa nối coordinator vào mutator runtime hoặc chứng minh expired recovery qua canonical Auth.** Nhận tiếp RF04/RF05/RF06 tại mục5.4 dossier; R11/BG02, worker, populated business upgrade/security và BG03–BG11 còn mở. Giữ 25 task/70 ca/124 lượt/122 mục unverified, actual/reviewer/signoff/gates không đổi.

**Checkpoint331 — lịch sử consumption, 29/10/2026:** source331/hash `a700ff658818a1f0b8b43420cf120d93768f0fedc34b8b3de32f56a7d7a5ef1f`,587 business/20 directory migrations. [Báo cáo](roomqc-support-consumption-local-2026-10-29.md) và [packet](../../../artifacts/roomqc-support-consumption-331212d94761-local-2026-10-29.json): native104/104,28 barriers/1API SIGKILL; directory160/160; control527pass/0fail/192skip,exit0. Có proof Auth→command→consumption thật, rollback/mất phản hồi/expiry và3 cửa sổ accept-before-revoke cho cluster command. Source/schema đầu–cuối khớp,role baseline phục hồi,cleanup độc lập0. **R11/BG02 còn mở:** expired-attempt recovery,legacy same-key replay,worker,đủ mutation families,populated upgrade và security review; chưa full-default/rebuild/staging/nghiệm thu sản phẩm. [Phiếu nhận tiếp](roomqc-vps-signup-execution-dossier-2026-10-29.md#53-thứ-tự-triển-khai-bản-tích-hợp-source330) và [nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md#124-thực-thi-bản-tích-hợp-source330). Giữ toàn bộ VPS+signup,8đợt/11BG/25task/27package/70ca/124lượt; actual/reviewer/signoff/gates không đổi.

**Bản nháp source330 — lịch sử, 29/10/2026:** phạm vi **toàn bộ VPS + signup**, đầu ra **plan + nghiệm thu**. Source330, SHA256 `ca77f438a4db58ad9843a7beceaeddec39a4b04d70179fb4c81bfd4417d6bc70`; 587 migration nghiệp vụ/20 directory. Đã viết bước tiêu thụ biên nhận quyền trong giao dịch quản trị; **chưa kiểm tích hợp Auth/HTTP/SQL và nâng cấp dữ liệu cũ cho bản này**. Preflight unit 15/15, exit0 chỉ chứng minh phạm vi helper/gateway/support; native90/90 và control520pass của source327 là lịch sử riêng. Nhận [phiếu R11 bản tích hợp](roomqc-vps-signup-execution-dossier-2026-10-29.md#53-thứ-tự-triển-khai-bản-tích-hợp-source330) và [bài nghiệm thu bổ sung](roomqc-vps-signup-master-acceptance-2026-10-28.md#124-thực-thi-bản-tích-hợp-source330). Hết hạn biên nhận và phục hồi cùng mã lệnh còn cần xử lý; R11/BG02 và các mốc L/S/P/U/B chưa được nhận. [Hồ sơ toàn phạm vi](roomqc-vps-signup-execution-dossier-2026-10-29.md) giữ 8 đợt/11 gói bàn giao/25 task/27 package/70 ca/124 lượt; actual/reviewer/signoff/gates không đổi.

**Checkpoint source327 — lịch sử, 29/10/2026:** [Báo cáo](roomqc-support-acceptance-component-local-2026-10-29.md) và [packet](../../../artifacts/roomqc-support-acceptance-component-4661134f0654-local-2026-10-29.json):source327/hash `e45b9fb53499c81fc65e8fd9af426307cf8c312dd698d10ef68f0051a87aa189`,586 business/19 directory migrations;control520pass/0fail/192skip,native90/90 gồm20 acceptance checks/6 interleaving,23 barriers/1API SIGKILL toàn run;exit0,source/schema khớp,cleanup độc lập0. Đã sửa migration guard và kiểm rollback schema/ACL/history. **Command directory chưa tiêu thụ acceptance**; chưa populated585→586/full-default/rebuild hoặc nghiệm thu sản phẩm. Nhận [R11-04–08](roomqc-vps-signup-execution-dossier-2026-10-29.md#52-phiếu-triển-khai-r11-theo-nguồn327),giữ các giới hạn và [RA01–RA18](roomqc-vps-signup-master-acceptance-2026-10-28.md#12-nghiệm-thu-protocol-r11-và-thành-phần-acceptance-mới). [Plan toàn VPS/signup](roomqc-vps-signup-execution-dossier-2026-10-29.md),25task/27gói/70ca/124lượt,actual/reviewer/signoff/gates không đổi. Audit kế hoạch r2 và checkpoint324 giữ hash/phạm vi lịch sử riêng.

**Checkpoint đã kiểm theo source324 — lịch sử:** [Quyền sau chờ SQL và đọc kết quả local](roomqc-support-authority-boundaries-local-2026-10-29.md) đã kiểm source324/hash `155f197c07839ba0535ac68f94f37898c89ee61375892f1646139b013c796556`:control516pass/0fail/192skip,directory160/160,native Auth/HTTP63checks/14revoke scenarios; terminal0,source/schema khớp và cleanup đúng ownership0. [Packet](../../../artifacts/roomqc-support-authority-boundaries-2765aadfaabb-local-2026-10-29.json). Đã sửa3lỗi late read/final release observation. R11/BG02 vẫn mở protocol revoke xuyênDB và claim/RPC/settle;63checks không thay full-default/rebuild hoặc nghiệm thu VPS. [Plan toàn VPS/signup](roomqc-vps-signup-execution-dossier-2026-10-29.md) có11BG,25task,70ca/124lượt; actual/reviewer/signoff/gates giữ nguyên. Checkpoint323/319 giữ hash/phạm vi riêng.

**Checkpoint local hiện hành — hai daemon tranh chấp, 29/10/2026:** source319/SHA256 `44442d6d9e35e5dd845c30a2780cdb0b6664e8afd5efb2f74b1aea9aec7610f4`,585 business/19 directory migrations. [Run5c839bfe5602](../../../artifacts/roomqc-setup-rotation-contention-5c839bfe5602-local-2026-10-29.json) đạt17 kiểm native, gồm11 contention checks/22 barrier observations qua25 process UID10001/CapEff0/source read-only. Journal chung có hai prepare đang hoạt động, mất phản hồi sau commit và hai replay tranh archive; journal riêng có row wait trước commit và mất response sau commit. Một command/audit/credential mỗi vòng, CAS loser không effects, recovery giữ ID/iat/exp, RPC/overlap và restart lần2 idle. Exit0,source/schema đầu–cuối khớp,9 kiểm session/mutex/canary, role/private files và Docker cleanup0. Hồi quy46pass/0fail/1skip. [Phạm vi và giới hạn](roomqc-setup-rotation-contention-local-2026-10-29.md): ba interleaving local, chưa mọi race hoặc actor revoke xuyên Auth/directory/business. Nhận tiếp R11, rồi BG03–BG11 theo dependency; chưa nhận toàn BG02/sản phẩm. Giữ70ca/124lượt/122mục,reviewer/signoff/gates. Proof storage318/durability316/startup315/mount313 giữ hash riêng.

**Checkpoint local trước — journal corruption/IO, 29/10/2026:** source318/SHA256 `d1cb480efd7729006752894521109579585ea497a728eca88a1f950d6a5335a1`,585 business/19 directory migrations. [Run ceaeeeb36691](../../../artifacts/roomqc-setup-rotation-storage-ceaeeeb36691-local-2026-10-29.json) đạt28 kiểm native, gồm22 storage checks: 10 kiểu journal hỏng và8 điểm FUSE EIO qua syscall thật,62 process UID10001/CapEff0/source read-only. Fault đóng readiness; phục hồi giữ pending/receipt đúng quy tắc, ID/iat/exp và một effect/key; restart lần2 idle/native RPC. Exit0,source/schema đầu–cuối khớp,48 kiểm session/mutex/canary và cleanup Docker0. Hồi quy46pass/0fail/1skip; skip không được nhận. [Báo cáo và giới hạn](roomqc-setup-rotation-storage-local-2026-10-29.md): chưa mọi errno/biến thể filesystem, đĩa vật lý, contention shared/separate journal, actor revoke xuyên DB hoặc VPS UID1000. Nhận tiếp contention và R11; không nhận toàn BG02/sản phẩm. Giữ8đợt/25task/27gói/70ca/124lượt/122mục,reviewer/signoff/gates. Packet316/315/313 giữ hash và phạm vi riêng.

**Phạm vi đã xác nhận:** toàn bộ VPS + signup; đầu ra plan + nghiệm thu. Điểm nhận việc là [phiếu tổng hợp](roomqc-vps-signup-start-pack-2026-10-28.md#0-bản-nhận-việc-đã-chốt). Snapshot lập kế hoạch hash316/1b28aa30 trước khi nối harness giữ trong [audit kế hoạch](../../../artifacts/roomqc-vps-signup-scope-reply-handoff-2026-10-29.json); không là actual của318.

**Checkpoint local đã kiểm — daemon durability, 29/10/2026:** source316/SHA256 `003fd7d7a94f136aabdf06dd8e2dbbe9b4a73c14078dd10d0343378c414d6753`,585 business/19 directory migrations. [Run a4cb64dd5c4c](../../../artifacts/roomqc-setup-rotation-durability-a4cb64dd5c4c-local-2026-10-29.json) đạt25 kiểm native (19 durability),23 process UID10001/CapEff0/source read-only: command_synced SIGKILL; pending_synced SIGTERM/SIGKILL; daemon trước/sau publication rename/sau directory sync và trước/sau archive sync. Recovery giữ cùng pending/receipt/ID/iat/exp, đúng1 command/audit/credential; restart lần2 idle. Exit0,source/schema khớp,24role/private root và Docker objects sạch; hồi quy46pass/0fail/1skip. [Actual và giới hạn](roomqc-setup-rotation-durability-local-2026-10-29.md): chưa full corrupt/partial journal/native disk fault/contention, actor revoke xuyênDB hoặc profile VPS staging; chưa nhận toàn BG02/sản phẩm. Giữ8đợt/25task/27gói/70ca/124lượt/122mục,actual/reviewer/signoff/gates. Packet315/313 giữ nguồn và phạm vi riêng.

**Checkpoint local trước — startup SIGTERM/pending, 29/10/2026:** source315/SHA256 `861de21bb7bda63ba5ab0419d3fb548e4513a68ddb070d028af7e9aecaaeba96`,585 business/19 directory migrations. [Run db40d4b8c62b](../../../artifacts/roomqc-setup-rotation-startup-db40d4b8c62b-local-2026-10-29.json) đạt16 kiểm native (10 startup/pending),13 process UID10001/CapEff0; đã tái hiện baseline chết do SIGTERM khi initialize, sửa handler trước async startup và stop latch. Config/init/pending/durable prepare/once stop không dispatch mới; restart giữ key/body/context, đúng1command/1audit/nativeRPC, lần2 idle. Exit0,source/schema khớp,24role/private root và Docker objects dọn sạch; hồi quy53pass/0fail/1skip. [Periodic19d9702d9487 cùng315](../../../artifacts/roomqc-setup-rotation-periodic-19d9702d9487-local-2026-10-29.json) đạt17 kiểm/20 process, timer/backoff/kill/replay/cutoff/expiry/revoke và idle/postcommit SIGTERM, exit0/source/schema khớp/cleanup0. [Actual và giới hạn](roomqc-setup-rotation-startup-local-2026-10-29.md): còn publication/archive/corruption/disk/full contention, actor revoke xuyênDB và profile staging; chưa nhận toàn BG02 hoặc sản phẩm. Giữ8đợt/25task/27gói/70ca/124lượt/122mục,reviewer/signoff/gates. Packet310/313 dưới đây là lịch sử đúng nguồn riêng.

**Checkpoint local trước — worker container mount/reload, 29/10/2026:** nguồn313 tệp/backend SHA256 `d17734a0a3c1076f8ef2de2e8913494af85be9126863e898e642804119eb374a`,585 migration nghiệp vụ/19 directory. [Run57bad49c6aea](../../../artifacts/roomqc-setup-runtime-mount-57bad49c6aea-local-2026-10-29.json) đạt27 kiểm native (21 worker),9 CLI và1 worker container UID10001/CapEff0; input/output/source read-only, rename→reload không restart, missing/unreadable/malformed/wrong binding/RPC unavailable/expiry/revoke đóng readiness và giữ job/attempt trước batch. Native RPC cũ bị từ chối theo cutoff DB; phục hồi xử lý mỗi job đúng1lần. Exit0,source/schema không đổi,cleanup0; hồi quy48 pass/0 fail/1 skip. [Báo cáo và giới hạn](roomqc-setup-runtime-mount-local-2026-10-29.md): positive là closed-dispatch/waiting_owner, chưa signup E2E; UID1000/VPS staging, full fault windows và actor revoke xuyên DB còn mở. Giữ8đợt/25task/27gói/70ca/124lượt/122mục,reviewer/signoff/gates. Các checkpoint310 phía dưới là lịch sử đúng source riêng, không gán lại cho313.


**Checkpoint local trước — periodic daemon và SIGTERM, 29/10/2026:** nguồn integration 310 tệp/backend SHA256 `7e41e984c100e1db977d1da7bf232fe847ac5296d146beadd38a6f4f26401abd`, 585 migration nghiệp vụ/19 directory. [Run native 23f18d88c646](../../../artifacts/roomqc-setup-rotation-periodic-23f18d88c646-local-2026-10-29.json) đạt 17 kiểm (11 rotation) qua 20 process UID10001/CapEff0: timer/backoff thật, phục hồi sau mất response, SIGTERM khi idle và sau DB commit; exit0, source/schema không đổi, cleanup0. Control cùng nguồn: 511 pass/0 fail/184 skip. [Báo cáo và giới hạn](roomqc-setup-rotation-local-2026-10-29.md#periodic-daemon-và-sigterm-native--run-23f18d88c646). BG02 còn các cửa sổ SIGTERM/race/journal, container worker mount/reload và revoke Auth→directory; chưa nghiệm thu toàn BG02 hoặc sản phẩm. [Audit kế hoạch trước lượt native](../../../artifacts/roomqc-vps-signup-plan-review-2026-10-29.json) là snapshot tài liệu lúc lập plan. Giữ nguyên 8 đợt, 25 task, 27 gói, 70 ca/124 lượt, actual/reviewer/signoff và gate.

**Checkpoint local lịch sử — rotation 29/10/2026:** backend310 tệp, SHA256 `314c1ec4b68fec86b5cf49aedf6d328555e4545f7d934520989b362fca74cb4a`;585 business+19 directory. [Daemon/journal và DB ready-head fence](roomqc-setup-rotation-local-2026-10-29.md) có14 kiểm native (8 rotation),18 process UID10001/CapEff0, kill/replay/overlap/expiry/revoke; unit509 pass/184 skip/0 fail. Run1c06a184f980 exit0, source/schema không đổi, cleanup0. Phạm vi entrypoint `--once`; chưa periodic daemon lâu/SIGTERM, full race/fault matrix, runtime container read-only mount/reload hoặc actor revoke xuyên hai DB. [Runbook mới](roomqc-setup-credential-rotation-runbook.md). Tiếp BG02 phần còn thiếu; BG06 phải khóa candidate mới. Các checkpoint301 phía dưới giữ lịch sử, không phải nguồn hiện hành. Không đổi70ca/124lượt/122mục, reviewer/signoff/gates.

**Checkpoint local trước — 29/10/2026:** backend301 tệp, SHA256 `2ec50f6dd1e473a45a54636594d6fd59451c452eb1f5d0f1a375bd1795b371d0`. [Runtime kiểm khóa live trước nhận việc](roomqc-setup-runtime-readiness-local-2026-10-29.md) đã sửa lỗi file còn hạn nhưng khóa đã revoke vẫn vượt readiness. Native run39f0f08155b0 đạt38 kiểm (22 worker,8 backfill,8 apply), source/schema không đổi và cleanup0; unit495 pass/184 skip/0 fail. Đây là diagnostic local; chưa daemon rotation, runtime UID/mount read-only hoặc thu hồi quyền nguyên tử xuyên hai database.

**Nhận tiếp BG02:** scheduler/journal, hai rotator và overlap/expiry khi daemon chết; container runtime chỉ mount output read-only; chốt điểm hiệu lực Auth→directory. R4 là [snapshot kế hoạch](../../../artifacts/roomqc-vps-signup-execution-plan-audit-r4-2026-10-29.json) của source301/ede96e trước sửa runtime, verifier r4 phải từ chối nguồn mới; giữ nguyên lịch sử, không nới pin. Các packet rebuild/filesystem/restore phía dưới có phạm vi nguồn riêng. Giữ8đợt/25task/27gói/70ca/124lượt,70ca not_run/122mục unverified, reviewer/signoff/gates chưa đổi.

**Checkpoint local lịch sử — timeout bộ cài:** [Báo cáo deadline](roomqc-setup-installer-deadlines-local-2026-10-28.md), [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md). Backend291 files/hash `bb21bef86c200d3d09c950b11c96417710bb9a9a47af7af0d3a0200caec2a367`;584+19 migrations. Focused100/100, native362/362 và control673 tổng/671 pass/0 fail/2 skip; terminal0, cùng source/schema tương ứng, cleanup0. IF11 có SQLSTATE thật, witness rollback, deadline45giây và13 lần kiểm session/mutex. IF01–IF11,IF13,IF16,IF17 có local proof đúng scope; tiếp IF12/IF14/IF15 rồi rotation/mount/Auth→directory. Lần1/T08/T12,70ca/124lượt/122mục,reviewer và gates vẫn mở.

Lịch sử theo source riêng: [fences](roomqc-setup-installer-fences-local-2026-10-28.md), [faults](roomqc-setup-installer-faults-local-2026-10-28.md), [installer ban đầu](roomqc-setup-credential-installer-local-2026-10-28.md), [publisher](roomqc-setup-publication-local-2026-10-28.md). Các báo cáo này giữ bằng chứng cũ; kế hoạch nhận việc nằm ngay bên dưới.

Ngày 28/10/2026. Đi cùng [kế hoạch tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md). **Đây là kế hoạch nghiệm thu chưa thực thi**, không phải biên bản sản phẩm đã đạt.

</details>

## 1. Nguồn chuẩn và trạng thái

| Nguồn | Dùng để làm gì | Quy tắc giữ |
|---|---|---|
| [Ledger gốc](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json) | ID, expected, dependency, môi trường và gate | 25 task, 27 gói, 70 ca; không đổi expected để hợp thức kết quả |
| [Worksheet gốc](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) | Phiếu actual/evidence/defect/review | 70 ca vẫn not_run, chưa có signoff mới |
| [Ma trận thực thi](../../../artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json) | Từng cặp case–environment | 124 lượt: 54 local, 69 staging, 1 pilot; actual/reviewer để trống cho tới khi chạy |
| [Protocol](roomqc-vps-signup-acceptance-protocol-2026-10-21.md) | Cách ghi và review proof | Không quy đổi số unit thành ca nghiệm thu |
| [Kế hoạch tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md) | Delta và thứ tự triển khai | Recheck có proof local riêng; packet CLI cũ không áp cho source mới |

SHA256 ledger: `612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63`.

SHA256 worksheet: `e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7`.

Lượt lập plan không thay hai file này. 122 release entries còn unverified; không có quyết định L/S/P/U/B mới.

**Bằng chứng nền lịch sử, chưa ghi actual nghiệm thu:** [recheck local](roomqc-workspace-recheck-local-2026-10-28.md) đạt control654 pass/0 fail/2 skip, frontend66/66 + TS/lint, native nền123/123 sau580+18 migration. PG/HTTP recheck dùng authority/receipt fixtures; native nền tại checkpoint đó chưa chạy platform recheck/live Auth, client là jsdom/Capacitor mock. Packet mới ở đầu tài liệu bổ sung native API/Auth/process, CLI và credential/status. Không chuyển count giữa các source hoặc tự đóng A/D/E/staging/pilot. Advisor hiện hành có808 findings/247 WARN; số762/199WARN thuộc checkpoint nền, không dùng làm tồn đọng hiện tại.

## 2. Chuẩn bị trước mỗi lần chạy

Người chạy và reviewer kiểm đủ bảy đầu vào dưới đây. Thiếu key/quyền thì ghi blocked external trong báo cáo dự kiến và input cần bổ sung; tiếp tục phần độc lập. Không ghi pass hoặc bỏ môi trường bắt buộc vì đang thiếu quyền.

1. **Candidate:** source/dirty manifest, exact image/vendor versions, contract/config hashes, migration checksums, trust/credential refs đã lọc. Ghi rõ freeze hay còn đổi.
2. **Target:** environment/host/cluster/DB/volume/network/port allowlist; phân biệt serving/test/ngoài phạm vi. Người có quyền môi trường xác nhận target trước ghi.
3. **Dataset:** fixture/run ID, ownership IDs, before-state, rows/checksums và cleanup allowlist. Không dùng dữ liệu thật cho bài phá lỗi khi chưa có scope tương ứng.
4. **Expected:** ID/expected nguyên văn từ ledger; subchecks gắn cùng ca, không sinh case release mới. Chốt effects được phép và zero-effect boundaries.
5. **Run:** harness/exact command, tham số, deadline và stop thresholds. Command kế hoạch chưa là lệnh deploy vận hành.
6. **Proof:** UI/network/API/DB/receipt/OS time series; log riêng được lọc. Không xuất token/password/DSN/secret.
7. **Recovery:** kill switch, rollback tương thích, người trực; giữ terminal history và cleanup chỉ theo ownership.

Source/config/schema đổi giữa run thì ghi drift, không gán pass cho candidate mới. Giữ failed evidence và chạy lại phần chịu ảnh hưởng sau freeze.

## 3. Bộ dữ liệu có đáp án

| Dataset | Tình huống tối thiểu | Đối chứng cần lưu |
|---|---|---|
| Quyền | anon, owner A/B, staff đủ/thiếu quyền, admin A/B, locked/revoked/logout | Actor/authority/target, positive và effect counts |
| Cụm | active/full/draining/offline/manual_closed/stale/unknown/release expired | Policy/version/sample và reserved+active counts |
| Đăng ký | Intent đúng/sai chủ/hết hạn, callback cũ; workspace đang tạo/active/protected | Mapping/owner/cluster/routing/trial trước–sau |
| Dispatch | committed/closed/pending; receipt missing/unavailable/conflict/identity lệch | Directory journal và business terminal proof |
| Job | queued/retry/leased/terminal; lease live/expired, attempts/deadline hết | IDs/history/deadline; token chỉ lưu hash |
| Console | 1.000 metadata, đáp án slug/request/filter/cursor/totals | Expected IDs qua các trang, không duplicate/missing |
| A/B | Hai backend đồng thời, identity riêng; UUID trùng có kiểm soát | Positive mỗi cụm và cross-token/data/storage/realtime denials |
| Restore | Auth/rooms/staff/permissions/objects/jobs/receipts/queue/revocation | Consistency point, object checksums, routing và revoked access |
| Tải | Hotel/room/staff distribution, object/report sizes, request mix/think time | Seed version, tenant đối chứng, resource baseline |

Dữ liệu demo có nhãn/ownership/cleanup. Object bytes phải có trong dataset restore; metadata riêng không đủ. Gửi email chỉ đến inbox được phép.

## 4. Nhóm ca và môi trường gốc

| Nhóm | Ca | Số ca | Nội dung | Môi trường |
|---|---|---|---|---|
| A | A01–A11 | 11 | Baseline, upgrade, quyền live, replay/atomic recovery | Local+staging |
| B | B01–B09 | 9 | Metric/probe/health/incident/mất host | B01,B09 staging; còn lại local+staging |
| C | C01–C10 | 10 | Registry/trust/admission/reservation/affinity | Local+staging |
| D | D01–D15 | 15 | Signup/resume/recovery/abuse/email | D15 staging; còn lại local+staging |
| E | E01–E08 | 8 | Console/action/result/Back/mobile/authority | Local+staging |
| F | F01–F09 | 9 | Linux/TLS/rotation/offsite restore/on-call | Staging |
| G | G01–G08 | 8 | A/B/E2E/load/cutover/pilot | G01–G03,G07 local+staging; G04–G06 staging; G08 pilot |

Tổng 70 ca/124 cặp môi trường. `requiredEnvironments` từng ID trong ledger là chuẩn cuối. Local Linux container không thay Linux VPS staging.

## 5. Buổi demo và bài thử xuyên luồng

Các buổi sau gom subchecks vào ca gốc, không giảm expected hoặc số lượt môi trường.

### 5.1. Baseline, migration và quyền — A01–A11

**Vào:** candidate/target/fixture đã nhận; directory trống và populated 0017 ở sandbox riêng.

1. So source/image/runtime, ports/flags/volumes; thử legacy/directory/global-admin/deep link; fingerprint hệ thống ngoài scope trước–sau.
2. Migrate/rerun/hai process/checksum sai/schema sai. API role thử DDL/DELETE audit/đọc secret; fail không effects.
3. Từng endpoint thử anon/owner/staff/legitimate admin; actor/authority/target khác; logout/khóa/revoke lúc mở dialog và đợi lock.
4. Replay 20 lần, cùng key khác body, hai admin cùng version, commit rồi cắt response và GET kết quả.

**Nhận:** dữ liệu/history giữ đúng; denial không effects; một command effect/audit/receipt; lookup đúng scope. Fault audit/receipt rollback; HTTP status không thay DB assertions.

### 5.2. Recheck cần proof mới — D07–D11,A07,A09–A11,E05,E08

**Vào:** review migration 0018/source/authority protocol, chưa dùng serving DB.

| Tình huống | Kết quả cần chứng minh |
|---|---|
| Request đầu commit giữa lookup/snapshot của request cùng key | Request sau replay cùng command, không definitive stale làm mất pending intent |
| Snapshot đổi giữa remote read và lock | CAS từ chối lệnh mới, zero partial mutation/audit/job |
| Worker cập nhật lúc detail được đọc | Workspace/job/timeline/fingerprint cùng DB snapshot; remote read tách transaction |
| Hai actor kiểm cùng workspace | Receipt riêng, reuse job live, không tạo hai dispatch hoặc recovery cycle |
| Lease live/expired, worker cũ trả muộn | Không cướp live lease; token cũ không settle sau fencing |
| Attempts/deadline hết | Không reset history; bounded cycle đã review, hết budget chuyển cần hỗ trợ |
| Generic/missing/unavailable/conflicting receipt | Không activate thiếu proof hoặc gọi provision; missing khác closed |
| Committed/closed khớp toàn identity | Terminal đúng, không tạo tenant/hotel/trial lại |
| Role/release/credential đổi khi chờ hoặc trước commit | Chặn đúng protocol hiệu lực đã chốt; RPC cuối không tự bảo đảm atomic xuyên hệ thống |
| Audit/command/cycle trigger lỗi | Toàn transaction rollback, giữ key/payload khi chưa rõ |
| Commit rồi mất response/F5/restart | Journal lưu trước POST, GET đọc cùng receipt, một effect |
| GET 404/timeout/key conflict/response sai target | Unknown/pending được giữ, không tự đổi key hoặc xóa intent |
| Journal storage không ghi được | Không POST trước khi lưu intent, lỗi có hướng xử lý |
| Logout/đổi runtime/actor/route và response muộn | Không toast/cache/apply kết quả sang phiên hoặc workspace khác |

**Đường demo:** Đăng ký mới→tìm workspace→chi tiết→Kiểm tra lại→lý do/xác nhận→pending/kết quả→F5→kết quả cũ. Lặp browser và Android transport thật ở T22. Receipt command succeeded và workspace active là hai assertions riêng.

### 5.3. Hạ tầng và admission — B01–B09,C01–C10

1. So OS/DB Linux với dashboard đúng host/mount; sai unit/NaN/future timestamp/sample cũ đến muộn không healthy.
2. Dừng exporter/probe/collector, đợi stale theo clock thật; manual-close không tự mở vì CPU xanh. Lỗi TLS/secret/release có recovery.
3. 20 request tranh suất cuối/retry/expiry; admin close lúc commit; gate xấu sau RPC in-flight. Lưu từng outcome và tổng effects.
4. A drain/down, B còn chỗ: khách cũ và Auth history giữ affinity, không fallback.
5. Incident dedupe/ack/resolved/reopen, outbox restart; mất toàn host vẫn có người nhận ngoài host/ack.

**Nhận:** không oversell/duplicate; metric thiếu/stale không là healthy; private endpoints không public. Threshold/version khóa trước run; timeline cảnh báo có actual.

### 5.4. Signup và email — D01–D15

1. Browser sạch start→reserve→Auth→inbox→verify→hotel/rooms→status→workspace; đúng owner/cluster và một tenant/hotel/trial.
2. Email/owner/token/cụm sai, body thừa ID/gói/quyền, slug/rooms sai bị chặn, zero effects ngoài scope.
3. F5/hai tab/new device/intent expiry/callback replay; resume đúng bước, unknown không buộc đăng ký lại.
4. Mất response sau remote commit trước activate; kill worker sau claim/trước call/sau call/trước ack, hai worker và late reply; DB/journal sau hồi phục khớp.
5. Shared limiter đa replica, forged forwarding/NAT/direct Auth bypass/spam/resend/challenge replay; signup-off giữ login/reset/invite.
6. Gmail/Outlook kiểm soát, verify/reset/invite đúng domain/origin/workspace/HTTPS/deep link, expiry/replay rõ.

**Nhận:** UI/API/DB/receipt thống nhất; inbox thật cho D15. Local sink, provider accepted, adapter double hoặc bỏ qua return value không thay delivery/network-fault proof.

### 5.5. Console và UX — E01–E08

1. 1.000 metadata: tìm slug/request, filter/cursor/totals có đáp án; không dùng count một trang làm tổng.
2. Hạ tầng→cụm→metric/cảnh báo/backup/command/result; Đăng ký mới→detail→tenant-summary/recheck/result. Mỗi chức năng có route/nút từ menu chính.
3. Lỗi cụm/503/stale/thiếu backup có nhãn đúng; pending/unknown dùng lookup, không báo số 0 hoặc an toàn giả.
4. Sidebar cuối→trang mới→Back: khôi phục list/filter/tab/scroll, trang mới có nội dung đầu; không vùng trắng.
5. Keyboard/focus/dialog/screen reader cơ bản, 390px/zoom 200%, contrast và nhãn chữ; không chỉ phân biệt bằng màu.
6. Switch workspace/authority/logout/hai tab; request/cache/journal scope đúng runtime+actor+target.

**Nhận:** người thử tìm đăng ký kẹt <30 giây, hoàn tất thao tác không SQL; task timing/video/ảnh và network/effect proof.

### 5.6. Linux và thảm họa — F01–F09,B01,B09

1. Host/port/volume/secret/budget sai: dừng trước init. Cài/rerun/reboot/upgrade và binary rollback không xóa dữ liệu.
2. TLS/renewal/CSP/WS/upload/Functions/callback/Android; private ports và POSIX permissions thật.
3. Backup consistency point, directory/receipts/DB/Auth/queue/object bytes, encrypt/checksum/upload/readback offsite, khóa failure domain riêng.
4. Host gốc mất: restore host/volume sạch, fence writer cũ, cập nhật revoke checkpoint; kiểm rooms/staff/login/files/trial/jobs/routing.
5. Key/checksum/schema/object/ref/cert lỗi phải chặn routing, có hồi phục. Đo RPO từ checkpoint cuối, RTO tới khi dữ liệu/dịch vụ đã kiểm.
6. Người trực nhận/ack và chạy runbook cho host/control/DB/disk/cert/backup/signup kẹt.

**Nhận:** dữ liệu nhất quán, một writer, revoked access không sống lại. Backup log xanh không thay offsite restore proof.

### 5.7. A/B, tải và RC — G01–G07

1. A/B đồng thời độc lập; positive mỗi cụm, cross-token/data/storage/Realtime denial; A down không fallback B.
2. Web/Android journey/fault trên cùng candidate; ghi OS/build/device/keyboard/Back/deep link/offline/background/resume.
3. Khóa workload/hardware/images/data/stop thresholds; ramp 10→25→50→100 phiên có think time, mức trước đạt mới tăng.
4. Soak ≥60 phút; noisy tenant + tenant đối chứng + report/upload/signup burst/backup overlap. Đo errors/latency/RPS/pool/locks/RAM/IO/WAL/queue/recovery/cost.
5. Báo max_tested khác operating_limit/headroom; metadata 1.000 workspace không chứng minh 1.000 khách sạn đang hoạt động.
6. RC freeze/rebuild/security review; legacy cutover và application rollback giữ mapping/receipt/trial, đủ ca pre-pilot; G08 chờ pilot.

**Nhận:** không Critical/High scope về quyền/dữ liệu/cấp phát/restore; đề nghị P có exact target/cohort/limit và reviewer, chưa U/B.

### 5.8. Pilot — G08

Một khách sạn nội bộ trước; ổn định 24–48h mới đề nghị cohort 5–10 được duyệt. Ít nhất 7 ngày với external probes, backup/alert drills, support/incidents/maintenance log. Báo lỗi, availability/latency/capacity/cost và phản hồi.

**Nhận:** actual/reviewer/signoff theo protocol; quyết định U riêng. Lỗi nghiêm trọng kích hoạt kill switch và sửa trước mở rộng, giữ lịch sử fail.

### 5.9. Bộ cài cấp và thay khóa — A06,B02,C01–C04

Đây là subchecks nghiệm thu kế hoạch của T08/T12 và các ca gốc liên quan; actual nghiệm thu chưa chạy, không tăng số70 ca hoặc thay requiredEnvironments. Khi chạy staging, thêm F01–F04 theo ledger. Giao thức DB/status/fingerprint, [publisher nội bộ](roomqc-setup-publication-local-2026-10-28.md) và installer/target/budget/live authority đã có diagnostic proof local theo đúng candidate tại đầu tài liệu. Full fault matrix, rotation scheduler, mount/UID/reload và target VPS vẫn chưa được nghiệm thu; không dùng mô tả checkpoint cũ để kết luận installer hoàn toàn chưa làm hoặc đã hoàn tất.

**Vào:** source/image/schema/config được khóa cho run; approved release v3, trust và directory authority đúng target; issuer/installer LOGIN riêng; target DB identity đã duyệt; private config/signing refs, thư mục đích thuộc run; consumer budget và rollback owner đã review. Giữ signer/release fixture được gắn nhãn trong local; nghiệm thu vận hành phải dùng target và cơ chế giữ khóa thật. Không chép observed fingerprint thành approved release.

| Bài thử bắt buộc | Actual cần ghi và điều kiện đạt |
|---|---|
| Target và capability sai | Lần lượt sai DB system identifier/OID/name/role, cluster/host/endpoint, release/expiry/authority, v2 metadata, budget hoặc ACL. Không có issue/bind/revoke mới, không file được publish; catalog và dữ liệu ngoài scope giữ nguyên. Issuer không bind/revoke; runtime không nhận quyền maintenance |
| Đường thành công | CLI đọc private config, kiểm target, commit issue, đọc receipt, ký đúng claims và publish file; native RPC dùng file mới thành công. Một command/result/audit và credential đúng binding; hạn từ DB, algorithm/fingerprint khớp. Ghi refs/hash và effect counts, không ghi bearer |
| Mất response sau commit | Cắt response thật sau DB commit, chạy lại cùng caller/key/body. Receipt và credential ID không đổi; không cấp thêm hoặc kéo dài expiry. Cùng key khác body/login bị chặn; receipt đã hết hạn không thể làm runtime ready |
| Process kill tại các điểm DB/file | Có barrier quan sát được trước commit, sau commit trước đọc receipt, trước/sau fsync file tạm, trước/sau rename. Kill CLI thật, không chỉ SQL writer; restart xác định đúng giai đoạn, không thêm effect ngoài policy, không mất journal hoặc ghi nửa file |
| Lỗi quyền, symlink và ghi file | File/thư mục không private, symlink/reparse point, đường dẫn ngoài target, file tạm đã tồn tại, lỗi ghi/fsync/rename/disk-full. Dừng với mã lỗi đã lọc; không đè file ngoài scope. Nếu DB đã commit, giữ receipt để đối soát; không báo success hoặc tự mint credential khác |
| Hai rotator và giới hạn tài nguyên | Chạy hai process cùng target, cả instance cũ và mới trong rolling overlap; chỉ một process cấp theo protocol. Pool mỗi consumer không quá1, không vay migration reserve, không có credential thứ ba cùng live; lease/lock mất phải dừng ghi |
| Overlap, revoke và rotator chết | Chọn TTL120–3.600 giây và overlap10–60 giây được duyệt; tắt rotator sau issue/publish, kiểm RPC trước/sau retirement. Khóa cũ hết hiệu lực đúng hạn dù daemon không chạy. Revoke/đổi binding không hồi sinh sau restart; publish/verify thất bại quá overlap dẫn tới ngừng phục hồi và cảnh báo |
| Runtime và readiness | Mount thư mục output riêng read-only, tách khỏi signer/DSN/config; thay file qua rename rồi gọi RPC bằng runtime/container/UID thật để kiểm thấy inode mới. Thiếu/hỏng/hết hạn/revoked file không claim thêm job; job/attempt/deadline/history giữ nguyên. Status là snapshot hiện hành; receipt lịch sử hoặc chữ ký hợp lệ riêng lẻ không chứng minh ready. Cảnh báo có mã lỗi, không secret |
| Hồi quy và bàn giao | Cùng candidate chạy bộ CLI fault mới và regression chịu ảnh hưởng; lưu failed runs, terminal exit, before/after DB/file, source cuối run, cleanup có ownership. Full-default/rebuild và VPS staging là các mốc riêng; hai skip Windows/Linux hiện có không tự đóng từ packet này |

DB và filesystem không commit atomic cùng nhau. Bằng chứng phải thể hiện rõ state của cả hai; sau rename, file hoàn chỉnh vẫn cần khớp authority và native RPC trước khi báo usable. Với filesystem hỗ trợ, phải fsync thư mục sau rename; nền tảng khác ghi cơ chế đảm bảo bền vững và giới hạn, không suy từ Linux sang Windows. File/journal private bị loại khỏi snapshot mã nguồn và báo cáo công khai.

**Đóng gói:** CLI/help/strict args, config example không secret, runbook cài–thay–revoke–khôi phục, manifest nguồn, budget delta, fault packet và danh sách còn chờ quyền. Giữ signup/dispatch false và worker replicas0 trong example. Rollback không xóa credential/receipt/job/history hoặc phục hồi khóa cũ; nếu không chứng minh được file/DB đồng nhất thì đóng phục hồi, giữ dịch vụ khách đang hoạt động theo policy và báo người trực.

Hiệu lực revoke actor giữa Auth và directory là bài protocol riêng tại T03. Bài revoke credential cùng business DB ở đây không thay nghiệm thu ranh giới hai hệ thống.

### 5.10. Nhận nháp installer và bàn giao toàn phạm vi

[Bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md#3-bảng-bàn-giao-theo-điều-kiện) chia phần còn lại thành11 lần bàn giao, vẫn dùng25 task/27gói/70ca gốc. [Phiếu đầu](roomqc-vps-signup-implementation-board-2026-10-28.md#4-phiếu-giao-việc-đầu-tiên-có-thể-bắt-đầu-ngay) tách review→migration/preflight→CLI→fault→hồi quy; tám nhóm kiểm native ở4.1 phải có actual/effects, không chỉ help hoặc syntax. Harness hiện dùng584+19 migrations. Mô tả source284 chưa có packet thuộc baseline lập kế hoạch trước đây; candidate và bằng chứng đang được nhận nằm ở đầu tài liệu, không chuyển số test giữa các source.

Trước pilot cần123 cặp local/staging đã review; lượt thứ124 làG08/pilot, không được ký trước khi quan sát≥7ngày. Mỗi lần giao phải dẫn tới packet/source/target và người review; mọi skip/chờ quyền giữ rõ. Những phát hiện đọc mã tại2.1 của bảng triển khai là đầu việc cần xác minh, chưa là defect đã tái hiện hoặc proof sửa xong.

### 5.11. Lịch demo theo các lần bàn giao

Dùng [bảy buổi demo và tiêu chí nhận](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#7-hồ-sơ-và-buổi-nghiệm-thu-bắt-buộc) để điều phối. Mỗi buổi có positive → negative → recovery,UI/API/DB/file/receipt và cleanup; mapping sang ca gốc không thay124lượt. BG01 phải đối soát run dở rồi sửa công cụ quan sát trước actualCLI filesystem faults; nháp293 chưa có proof nên không điền actual từ checkpoint291.

Q01–Q10 trong phiếu thiết kế là đầu vào có owner/mốc cần; thiếu key/quyền giữ chờ theo chỉ dẫn,không giả pass. BG10 chỉ đề nghị pilot khi123lượt local/staging đã review; G08 cần≥7ngày lịch và quyết định U riêng. Lượt này hoàn thành tài liệu kế hoạch; chưa là biên bản nghiệm thu sản phẩm.

## 6. Record bắt buộc của một kết quả

Mỗi cặp case–environment có record chính và subchecks/evidence liên quan. Mẫu chưa chạy:

```json
{
  "caseId": "D07",
  "environment": "staging",
  "status": "not_run",
  "runner": null,
  "reviewer": null,
  "candidateRef": null,
  "targetRef": null,
  "datasetRef": null,
  "exactCommand": null,
  "startedAt": null,
  "finishedAt": null,
  "expectedFromLedger": null,
  "actual": null,
  "exitCode": null,
  "effectsBeforeAfter": null,
  "faultBarrierRef": null,
  "evidence": [],
  "defects": [],
  "cleanup": null,
  "limitations": [],
  "reviewDecision": null,
  "signoff": null
}
```

Pass cần actual khớp expected, positive/negative/recovery đúng scope, terminal exit/cleanup, source/schema/config trước–sau và reviewer. not_run/blocked/skip/harness fail chưa là pass. Scoped diagnostic chỉ là proof hỗ trợ.

Reviewer kiểm source/target/environment, exact command, effects/zero-effect boundaries, positive đối chứng, fault đúng cửa sổ, drift/skip/unresolved, rollback/cleanup và secret scan. Người triển khai chạy test phải ghi đúng vai trò, không giả independent reviewer.

## 7. Lệnh có sẵn và giới hạn

Kiểm harness/target và fixture sở hữu trước khi chạy. Lượt lập plan **không chạy các bài sản phẩm sau**:

```powershell
node scripts/test-control-backend-sandbox.mjs --help
node scripts/test-control-setup-dispatch.mjs --directory-regression
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-dispatch
npm run test:control
npm run test:mobile
```

Diagnostic không thay full-default/VPS/E2E. test:control cần cấu hình DB opt-in/isolated directory tương ứng; suite có skip không nhận tất cả A–G. Giữ các hồi quy recheck/API/worker/CLI của packet hiện tại khi triển khai phần tiếp theo; candidate cuối vẫn cần tích hợp đúng môi trường và reviewer. Không chạy CLI apply trên dữ liệu vận hành chỉ để kiểm plan.

## 8. Dừng, sửa, chạy lại và ký

Dừng phần ghi khi cross-tenant access, duplicate tenant/hotel/trial, receipt conflict, split-brain, target sai, leak secret, restore không nhất quán hoặc vượt stop threshold. Đóng nhận mới/claim theo runbook; giữ mapping/journal và đối soát dispatch đã gửi an toàn. Không reset DB/xóa audit để đổi kết quả.

Defect có severity/impact/reproducer/source/environment/expected/actual/effect proof/owner/fix/regression scope. Sau sửa chạy lại phần liên quan; candidate cuối freeze mới integrated/full-default/rebuild. Không chạy lại lát đã đạt chỉ để tăng count.

| Quyết định | Đề nghị | Review/quyết định | Hồ sơ |
|---|---|---|---|
| Scoped local verified | BE/FE/OPS | QA/reviewer scope | Source/test/effects/cleanup/limitations |
| L/S | Người giao candidate/OPS | Reviewer và người có quyền môi trường theo ledger | Current-source integration hoặc staging/TLS/rollback |
| P | QA/OPS | RoomQC và reviewer | RC/pre-pilot cases/DR/on-call/limits/killswitch/cohort |
| U | OPS/QA | RoomQC | G08 actual/capacity/cost/anti-abuse/support, quyết định riêng |
| B | Chủ billing | RoomQC và review nghiệp vụ/bảo mật | Provider/payment/business acceptance riêng |

Chưa có tên người/actual thì để trống. `node scripts/verify-vps-signup-plan-checkpoint-r4.mjs` chỉ kiểm snapshot lịch sử source301/ede96e và tài liệu lúc r4; nó phải từ chối nguồn mới, không phải lệnh kiểm hồ sơ hiện hành. Các verifier handoff/transactions/fences/preparation/installer/publisher/volume cũng giữ pin lịch sử riêng; không nới pin để hợp thức nguồn mới. Với hồ sơ mới, kiểm source/protected hashes, coverage/dependency/link và delta tài liệu riêng; không coi việc kiểm tài liệu là product test, nghiệm thu phần mềm hoặc đổi gate. Goal hoàn thành toàn plan còn mở.


## 9. Nhận bản 301 và ghi biên bản theo từng lượt môi trường

Tên mục giữ bản301 để không mất liên kết lịch sử; đầu vào hiện hành **316 tệp/hash `003fd7d7a94f136aabdf06dd8e2dbbe9b4a73c14078dd10d0343378c414d6753`**,585 business/19 directory. [Durability a4cb64dd5c4c](roomqc-setup-rotation-durability-local-2026-10-29.md) có25kiểm/23process cho8cửa sổ journal/publication/archive. Startup và periodic315, mount313 giữ nguồn/phạm vi riêng. Còn corrupt/partial journal, native IO/disk fault, full contention, actor revoke xuyênDB và staging; chưa nhận toàn BG02 hoặc candidate tích hợp.

Giữ riêng bằng chứng lịch sử: [runtime 39f0f08155b0](../../../artifacts/roomqc-setup-runtime-readiness-39f0f08155b0-local-2026-10-29.json) có 38 kiểm native trên nguồn301/2ec50, reload trong runner nhưng chưa container mount; [filesystem f9b57c8fb3f6](../../../artifacts/roomqc-backend-installer-filesystem-f9b57c8fb3f6-local-2026-10-29.json) có 181 kiểm/4 mốc kill/49 ca quyền/11 ca volume/271 CLI process trên nguồn301/ede96e, `fullFaultMatrixVerified=false`; [rebuild afe3e00ebfa2](../../../artifacts/roomqc-backend-independent-rebuild-afe3e00ebfa2-local-2026-10-29.json) là backend sandbox cùng nguồn301/ede96e; [restore 9f03b89d7f0f](../../../artifacts/roomqc-backup-restore-rehearsal-9f03b89d7f0f-local-2026-10-29.json) là snapshot DB local riêng, chưa offsite. Không chuyển count hoặc nâng phạm vi chứng minh giữa các nguồn.

[Checklist thực thi r4](../../../artifacts/roomqc-vps-signup-execution-checklist-r4-2026-10-29.json) có đủ25task,27gói,70ca,124lượt từ nguồn gốc, kèm expected và trường actual/reviewer/signoff chưa điền. Mỗi lượt là một bản ghi caseId+environment; không gộp kết quả local vào staging. Ca not_run khác với phần implementation đã có bằng chứng hỗ trợ.

| Đề mục biên bản | Cần điền trước chạy | Cần ghi sau chạy |
|---|---|---|
| Nhận diện | BG/task/case/environment, owner/reviewer và thời gian | Run ID, thời gian bắt đầu/kết thúc và terminal |
| Bản chạy | Source/image/schema/config/budget/contract, target và dataset sở hữu | Hash/fingerprint cuối, drift hoặc unchanged |
| Kịch bản | Positive, negative/fault window, expected từ ledger, recovery, điều kiện dừng | Actual UI/API/DB/file/job/receipt và zero effects ngoài scope |
| Bằng chứng | Exact command hoặc bước UI/device/build, nơi ghi log riêng | Artifact refs đã lọc secret, trace/video/screenshot cần thiết |
| Thu dọn | Ownership allowlist và cách giữ dữ liệu ngoài scope | Container/volume/network/file/session/lock trước–sau; chưa xác minh ghi unknown |
| Quyết định | Reviewer và người có quyền quyết định môi trường | pass/fail/blocked/skip/harness_failure, impact, defect, review và signoff thật |

**Buổi demo cuối trước pilot:** người thử bắt đầu từ trình duyệt/Android sạch; đăng ký, verify, tạo khách sạn/phòng, mời nhân viên, đăng nhập và thử quyền đúng/sai; ngắt mạng sau commit rồi tiếp tục; dùng console tìm/đối soát ca kẹt; đóng nhận mới khi khách cũ vẫn dùng được; thử A/B deny và positive; xem alert ngoài host, restore host sạch và capacity report. Mỗi phần gắn ca A–G và môi trường theo mục5, có UI/network/DB/receipt cùng run. Demo không thay các124lượt và không tự đóng gate.

**Điều kiện nhận hồ sơ kế hoạch:** đủ phạm vi toàn VPS+signup, task/dependency/ca/môi trường không mất, link hợp lệ, source được phân biệt với lịch sử, đầu vào chờ có bước tiếp tục và không tạo actual/reviewer giả. **Điều kiện nhận sản phẩm:** actual đạt expected ở đúng môi trường, defect được xử lý, review và quyết định L/S/P/U/B tương ứng. Lượt rà hồ sơ kế hoạch trước không ký nhận sản phẩm; diagnostic local316 được bổ sung riêng, không đổi release acceptance.

## 10. Bài kiểm chi tiết cho BG02

Nhận việc tại [BG02.1](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#bg021-phiếu-việc-kế-tiếp-có-thể-giao-ngay). Đây là12subchecks T03/T08/T12, không thêm70ca/124lượt hoặc sửa expected/môi trường. [Durability316](roomqc-setup-rotation-durability-local-2026-10-29.md) có25kiểm/23process cho command/pending sync và daemon publication/archive; startup/periodic315 và mount313 là proof riêng. Còn corrupt/partial journal, native IO/disk fault, full contention và actor revoke; UID1000/VPS staging chưa kiểm. Mỗi subcheck cần actual/reviewer theo phạm vi trước khi dùng làm evidence; chưa nhận trọn12dòng.

Trước run: source/image/schema/config/target/dataset/clock policy được khóa; hai process là chương trình daemon sản phẩm thật; runtime container không đặc quyền; DB và output thuộc sandbox; có positive đối chứng, barrier được chứng kiến và baseline DB/file. Không dùng mock transport để kết luận hai process hoặc độ bền journal đã đạt.

| Subcheck | Cách thử | Điều kiện đạt và evidence phải ghi |
|---|---|---|
| BG02-R01 — status/config | Check đúng target; sau đó sai target/role/budget/release, config drift và clock lệch | Status được kiểm qua installer; sai preflight không issue/publish. DB observedAt/expiry/version có identity đúng, log không có key/DSN; không lấy client clock để gia hạn |
| BG02-R02 — vòng bình thường | Start → issue/publish → runtime dùng → rotate → hết overlap | Đúng credential head/ID/iat/exp và receipt; runtime nhận inode mới không restart; predecessor bị từ chối ở RPC sau cutoff DB, positive khóa mới vẫn chạy |
| BG02-R03 — hai daemon, chung journal | Start hai process tại barrier cùng target/journal | Không ghi đè intent, không torn record được coi hoàn tất; process thua trả busy/đợi có hạn; một issue effect, có exit và holder/lock witness |
| BG02-R04 — hai journal, một target | Hai daemon dùng journal riêng tranh cùng expectedVersion/head | DB mutex/CAS/overlap giữ đúng head, không có khóa thứ ba ngoài policy; conflict/unknown được phân loại theo response thực. Snapshot commands/credentials/audit và receipt độc lập |
| BG02-R05 — kill trước dispatch | SIGKILL sau durable intent, trước network call; khởi động lại | Journal còn nguyên caller/key/body/hash; restart cùng yêu cầu; một command/credential/audit, không key mới vì không thấy response |
| BG02-R06 — commit rồi mất response | Chứng kiến DB commit, chặn response rồi kill; restart | Outcome cũ được replay/read đúng receipt; giữ ID/iat/exp và predecessor retirement; không gia hạn/issue thêm hoặc trả ready giả |
| BG02-R07 — publish gián đoạn | Kill trước rename, sau rename và sau directory sync; restart | Cùng receipt phục hồi đúng bytes/inode/mode theo cửa sổ; không đổi credential để chữa file lỗi; pending publication không biến thành known failure hoặc thành công thiếu probe |
| BG02-R08 — daemon chết qua cutoff | Dừng toàn bộ rotator, chờ qua overlap rồi expiry theo DB | Khóa cũ và khóa hết hạn bị RPC thật từ chối dù không có daemon; runtime unready khi không còn khóa dùng được. Ghi DB time/cutoff/request outcome, không suy từ sleep đơn thuần |
| BG02-R09 — quyền mount | Runtime UID/GID thật, output directory read-only; thử ghi và tìm signer/private journal/issuer DSN | Không ghi được; không truy cập private issuer inputs. Rename bởi issuer được consumer đọc thấy; quyền Linux/ACL và container mount được chứng kiến. Consumer DSN hạn quyền riêng không bị nhầm với issuer DSN |
| BG02-R10 — credential không dùng được | Missing/unreadable/expired/revoked/wrong issuer hoặc cluster; RPC unavailable; phục hồi credential đúng | Readiness đóng, không claim/consume attempts ở bước pre-batch bị chặn; positive phục hồi không restart và xử lý đúng một dispatch. Race sau readiness được kiểm ở R11, không suy atomic từ bài này |
| BG02-R11 — revoke cạnh tranh | Actor JWT còn hạn và service credential riêng; pause sau kiểm quyền/trước claim/trước remote RPC/trước settle rồi revoke | Ghi điểm hiệu lực ở DB theo protocol đã review. Không tác động mới trái phép sau mốc đó; request in-flight được phân loại và đối soát đúng receipt. Nếu chỉ có bounded delay, đo và ghi giới hạn; chưa chứng minh xuyên DB thì giữ fail/blocked, không ghi instant revoke |
| BG02-R12 — lỗi và vận hành | Journal hỏng/partial, disk lỗi, timeout, SIGTERM, drift binding/signer; thử resume bằng runbook | Không bỏ pending để phát key mới; retry/shutdown có hạn, một tick/target, status có lý do và next action. Secret scan sạch; session/mutex/process/container/volume/network/private-file cleanup xác nhận đúng ownership |

**Gói nhận BG02:** config/protocol đã review; positive→fault→recovery của 12 dòng; exact commands/process/build/target; timeline DB và file; effects trước–sau; packet source-bound; defect/skip/limits; runbook và người nhận. Runner không tự đóng vai reviewer độc lập. Lỗi quyền, duplicate issue, journal mất yêu cầu, khóa cũ còn tác động ngoài protocol, secret leak hoặc không kiểm chứng được cleanup phải dừng phần ghi chịu ảnh hưởng.

### 10.1. Phần còn thiếu của R12: daemon định kỳ và dừng process

Hồi quy315 giữ11/11unit rotator và5/5unit lifecycle; startup/periodic315 có packet riêng. [Durability316](roomqc-setup-rotation-durability-local-2026-10-29.md) bổ sung25kiểm native cho8cửa sổ; hồi quy47tổng/46pass/0fail/1skip. Còn corrupt/partial journal, native IO/disk fault và full contention; không ghi toàn R12pass. Bảng dưới giữ expected, chỉ chạy biến thể chưa phủ hoặc delta. Recovery chính dùng daemon thật; --once lần2 chỉ kiểm idle, không thay periodic. Fixture/UID/config/budget/source phải khóa.

| Biến thể | Thao tác và bằng chứng | Expected |
|---|---|---|
| Định kỳ | Quan sát ít nhất hai chu kỳ bằng timestamp/event từ process thật; barrier ở status và dispatch; đo số kết nối | Mỗi target tối đa một tick chạy; lịch/backoff/deadline đúng config; không overlap tự phát hoặc dùng thêm pool ngoài budget |
| SIGTERM trước dispatch | Gửi tại barrier load config, đọc pending, sau durable prepare và lúc chờ timer; ghi thời điểm signal/DB effects/exit | Không bắt đầu check/issue/claim mới sau điểm dừng được quan sát; journal pending giữ nguyên; ready=false; không tạo request key thay thế |
| SIGTERM khi đã gửi | Gửi sau witness dispatch nhưng trước response; thử positive và mất response | Chờ hoặc kết thúc trong shutdown deadline; kết quả unknown giữ pending để restart đọc cùng receipt; response muộn không mở readiness hoặc đặt timer mới |
| Restart và thu dọn | Khởi động lại cùng target/caller/journal; kiểm DB command/credential/audit, output bytes và session/mutex/process/container trước–sau | Effect hợp lệ duy nhất theo policy; ID/iat/exp không gia hạn do replay; không orphan lock/process hoặc xóa dữ liệu ngoài ownership |

Actual phải ghi mốc thời gian, command/exit, clock policy, source/image/schema/config, effects và cleanup. Chưa có process proof ghi not_run; harness lỗi giữ harness_failure, không đổi thành product pass. Bài mount container R09 và actor revoke R11 phải có hồ sơ riêng.

Sau khi đổi product source: kiểm phần delta trước, rồi candidate cuối tích hợp/rebuild theo BG06. Kiểm link của tài liệu này chỉ xác nhận hồ sơ đọc được, không chứng minh 12 subchecks đã chạy, không chuyển local thành staging và không đổi gate.

### 10.2. Bài nghiệm thu worker đọc khóa trong container

**Trạng thái: đã có diagnostic local run57bad49c6aea; chưa review/nhận trên staging.** Xem [actual và giới hạn](roomqc-setup-runtime-mount-local-2026-10-29.md). Phần việc BG02-05; hỗ trợ R02/R08/R09/R10/R12 và ca gốc T03/T08/T12 theo ma trận, không tạo ca release mới. Mục tiêu là chứng minh worker sản phẩm sử dụng file được issuer thay khi đang chạy, với quyền mount thực; kiểm cấu hình compose hoặc đọc file trong cùng process issuer chưa đủ.

**Đầu vào:** candidate/source/image/config/schema đã khóa; sandbox có ownership riêng; output/input volumes và producer/consumer containers có tên/label thuộc run; budget tính cả issuer/rotation/worker và phiên kiểm. Directory LOGIN của worker riêng, hạn quyền/pool/concurrency theo profile. DSN issuer, signer và journal chỉ có ở producer; trust public/target metadata và DSN worker ở input riêng. Không mount thư mục chứa dữ liệu vận hành hoặc cả repository có `.env` vào consumer.

| Bước | Thực hiện | Evidence và điều kiện đạt |
|---|---|---|
| 1 — tạo fixture | Chụp baseline business/directory; tạo role và dataset gắn run; tạo output và input volumes riêng. Chuẩn bị source snapshot công khai đã hash | Ownership manifest, schema/source hash, row/attempt/audit baselines, target allowlist và budget. Cleanup không dựa vào tên gần giống |
| 2 — producer | Chạy CLI issuer thật với signer/DSN riêng, publish vào output directory qua protocol hiện có; giữ private journal ngoài output | Có immutable receipt và file hoàn chỉnh đúng identity/expiry; không đưa private input vào shared directory |
| 3 — consumer | Chạy entrypoint `server/control/workers/setup-runtime.mjs` trong container riêng; root filesystem/source/input/output read-only, cap-drop ALL/no-new-privileges, UID/GID không đặc quyền, RAM/CPU/PIDs/tmpfs hữu hạn | Ghi image/container ID/StartedAt, PID/UID/GID/CapEff, mountinfo và role của worker. Instrumentation chỉ quan sát/barrier, không thay store/gateway/transport bằng mock |
| 4 — cách ly | Thử tạo probe vô hại ở input/output/source; thử mở đúng path private signer/journal/DSN issuer của producer từ consumer | Ghi bị từ chối do mount; private inputs không truy cập được. Worker vẫn đọc được DSN hạn quyền của chính nó. Lọc nội dung lỗi, không in secret |
| 5 — positive ban đầu | Gọi readiness và native scoped RPC; tạo một dispatch/job fixture đã biết đáp án, để worker xử lý | Readiness thành công khi live authority hợp lệ; job/effects đúng đáp án. Nếu dùng closed-dispatch tombstone để giữ nguyên business snapshot, kết quả `waiting_owner` chỉ chứng minh worker path; không được gọi là signup/hotel active E2E |
| 6 — rotate đang chạy | Giữ nguyên consumer, rotate bằng CLI/daemon thật; ghi receipt/version/ID/iat/exp và inode/hash file trước–sau rename | Consumer nhận file mới qua directory mount, container ID/StartedAt không đổi; không restart hoặc remount để làm test xanh |
| 7 — qua overlap | Dừng mọi rotator, dùng DB clock quan sát retirement; thử RPC bằng credential cũ và dùng worker với file mới | RPC cũ bị từ chối sau cutoff; worker mới vẫn ready và xử lý đúng fixture. Không suy từ sleep hoặc chữ ký hợp lệ; không ghi bearer vào evidence |
| 8 — negative/recovery | Thực hiện từng biến thể ở bảng dưới, mỗi biến thể có positive trước/sau và baseline riêng | Readiness đóng khi thiếu capability; ở pre-batch bị chặn không claim/consume attempts. Phục hồi file đúng nhận lại mà không restart; tác động/race sau readiness thuộc R11 riêng |
| 9 — shutdown trước DB cleanup | Phát tín hiệu dừng có ownership cho consumer trong khi fixture DB/role còn tồn tại; quan sát shutdown, kiểm session về0, sau đó mới drop role/database fixture | Consumer terminal exit và timeout nếu có; không để `DROP DATABASE` treo vì worker còn kết nối. Outer harness vẫn stop/inspect exact-owned consumer khi producer lỗi |
| 10 — nhận packet | Chụp effects/schema/source cuối run; đối chiếu limits/secret scan; dọn đúng objects và private files thuộc run | Exit thật, before/after hashes, object/session/process cleanup độc lập. Lỗi/harness failure giữ lại evidence đã lọc, không ghi pass hoặc mở gate |

**Biến thể của bước8:** thực hiện độc lập để biết nguyên nhân nào làm readiness đóng; không làm mất file hợp lệ duy nhất mà không có phương án khôi phục thuộc fixture.

| Biến thể | Cách tạo lỗi trong sandbox | Expected cần quan sát |
|---|---|---|
| Missing | Producer tạm đổi tên file đúng path | Consumer báo unready theo mã an toàn; queued job/attempt/deadline/history không bị tiêu thụ trong cửa sổ pre-batch đóng |
| Unreadable | Đổi owner/mode fixture khiến UID consumer không đọc được | Lỗi được đo từ UID thật, không từ root runner; dừng nhận việc rồi phục hồi sau khi sửa quyền |
| Malformed/wrong binding | Công bố fixture bytes hỏng, wrong issuer hoặc wrong cluster riêng từng lượt | Không thử credential của cụm khác, không fallback hoặc báo ready bằng receipt lịch sử; không claim mới |
| Expired | Tắt rotator, đợi expiry theo DB clock rồi gọi RPC/readiness | Native RPC từ chối; worker không claim từ file vẫn đúng chữ ký nhưng hết hạn; reissue khôi phục chỉ qua protocol được phép |
| Revoked | File còn hạn, revoke live head qua credential command thật | Readiness/RPC đóng đúng quy tắc hiện hành; chụp version/DB time; không đổi file hoặc giả hết hạn để thay bài live revoke |
| RPC unavailable | Ngắt riêng transport fixture ở ranh giới đã định, không tác động dịch vụ khác | Readiness không coi lỗi mạng là quyền hợp lệ; timeout có hạn, không claim thêm khi pre-batch chưa đạt |
| Restore | Sau từng lỗi, phục hồi live credential đúng binding qua issuer protocol | Cùng consumer/PID hoặc container identity, readiness trở lại, đúng một dispatch fixture được xử lý; effect counts không trùng |

**Khớp với staging:** compose hiện khai báo user1000:1000, còn native fixture trước dùng10001:10001. Run phải ghi UID/GID thực và quyền file được chọn; trước BG07 phải thử profile/image/volume thật của staging. Không gọi kết quả sandbox là chứng nhận filesystem/ACL/renewal trên VPS. Các lỗi quyền cho thấy trong lúc chạy phải sửa rồi kiểm lại nhánh chịu ảnh hưởng.

**Biên bản để trống đến khi chạy:** run ID/target/source/image/config; runner/reviewer; actual từng bước/biến thể; timeline DB/process/file; terminal exit; cleanup; defects/limits và quyết định nhận. Artifact kế hoạch chỉ kiểm cấu trúc và đường dẫn. Bài này không thay full fault matrix, revoke actor xuyên DB, owner signup E2E, restore offsite hoặc124lượt nghiệm thu gốc.

### 10.3. Phiếu startup và journal cần bổ sung

**Mục đích:** kết thúc phần còn thiếu của BG02-03/04/07, hỗ trợ R05/R07/R12; không tăng70ca/124lượt. [Startup/periodic315](roomqc-setup-rotation-startup-local-2026-10-29.md) giữ proof dòng1/2 và phần read-pending/prepare. [Durability316](roomqc-setup-rotation-durability-local-2026-10-29.md) bổ sung command_synced SIGKILL/pending_synced SIGTERM+SIGKILL, toàn ba phase publication dòng5 và hai phase archive dòng6. Đúng25kiểm/23process, recovery cùng receipt. Native corruption/disk và full contention dòng7/8 vẫn mở; không suy các phase đã kiểm thành mọi biến thể signal/IO. Reviewer/signoff release chưa có; ca gốc không đổi thành pass từ diagnostic.

Baseline6af38e94db73/source314 đã tái hiện handler SIGTERM/SIGINT đăng sau async startup: process chết do signal, không qua stop lifecycle. Đã sửa và kiểm source315: handler trước startup, stop latch/cancellation, không dispatch sau stop; lỗi config cùng signal vẫn exit1. Giữ baseline đỏ và phạm vi green trong packet, không suy thành mọi dòng dưới đã đạt. Khi có delta mới, chỉ tái hiện/kiểm lại phần chịu ảnh hưởng.

**Phạm vi file:** [entrypoint](../../../server/control/workers/setup-rotation-runtime.mjs), [rotator](../../../server/control/setup-credential-rotation.mjs), [journal](../../../server/control/setup-rotation-journal.mjs), [native harness](../../../server/control/testing/setup-rotation-native.mjs). Preload chỉ đặt barrier/quan sát tại các hàm hoặc phase hiện có; việc issue/revoke/replay/publish vẫn đi qua installer và PostgreSQL thật. Consumer, role, target, private file và Docker object đều thuộc ownership của run.

| Thứ tự | Cửa sổ phải quan sát được | Thực hiện và expected để nhận |
|---|---|---|
| 1 | Config load đang chờ, runtime chưa được trả về main | Giữ barrier, gửi SIGTERM, ghi signal/exit và effects DB/file. Sau khi quan sát yêu cầu dừng không được bắt đầu dispatch mới. Nếu cần sửa, nối cơ chế dừng từ trước async startup qua load/initialize; không chờ tới khi runtime đã start mới cài handler |
| 2 | Journal initialize đang chờ | Gửi SIGTERM rồi nhả barrier. Không start timer/issue sau stop; thoát trong deadline, giữ các file đã bền vững. Startup error thật vẫn phải báo mã an toàn/exit lỗi, không bị biến thành thành công vì signal đến cùng lúc |
| 3 | Đọc pending và sau `command_synced`, trước rename vào pending | Dừng process rồi restart cùng context. Phân biệt stage chưa thể dispatch với pending đã công bố; không khẳng định một stage bỏ dở là remote command đã gửi. Chụp exact bytes/context/hash và effect0 trước network |
| 4 | `pending_synced`, trước dispatch | SIGTERM và SIGKILL ở hai lượt riêng; restart bằng cùng journal/caller/key/body. Pending vẫn đối soát được; có đúng một command/credential/audit theo policy. Không tạo key mới để chữa outcome chưa biết |
| 5 | Publication trước/sau rename và sau directory sync | Chạy daemon thật; giữ immutable receipt, chụp inode/hash/mode trước/sau. Kill/restart phục hồi cùng credential ID/iat/exp và native RPC; không gọi publisher component proof là proof daemon. Tận dụng syscall barrier đã có, không thay publisher bằng mock |
| 6 | `before_archive` và `archive_synced` | Kill/restart riêng từng cửa sổ; pending/history vẫn xác định được cùng command. Archive hoàn tất không làm phát lại thành issue mới; archive chưa rõ kết quả được đọc lại, không tự xóa journal để đi tiếp |
| 7 | Journal thiếu file/hỏng hash; ghi/sync/rename bị lỗi thực | Mỗi lỗi có positive trước/sau, canary ngoài owned root giữ nguyên. Không dispatch từ record hỏng, không bỏ pending hợp lệ hoặc báo ready giả. Giữ private forensic data theo ownership; public report chỉ có mã và hash. Phục hồi theo runbook rồi kiểm cùng identity |
| 8 | Hai process tranh cùng yêu cầu ở barrier | Thử journal chung rồi journal riêng/same target; ghi winner/loser, CAS/lock và state DB. Một kết quả hợp lệ theo policy, không credential thứ ba ngoài overlap; process thua/busy và retry có hạn. Khác với hai process chỉ chạy tuần tự hoặc đang idle |

**Điều kiện kết thúc gói:** mỗi dòng có positive/fault/recovery, process exit thật, DB/file timeline, effect counts và cleanup; shutdown không vượt55giây theo entrypoint hiện tại hoặc deadline mới được review. Với request đã dispatch trước stop, đối soát riêng outcome known/unknown; không yêu cầu xóa commit hợp lệ. Sau sửa, kiểm cancellation/timer/signal-listener cleanup ở cả daemon, `--once` và startup failure; chạy hồi quy phần chịu ảnh hưởng rồi khóa nguồn cuối. Code thay đổi phải có hash/candidate mới, không kế thừa packet313 như đã kiểm nguồn mới.

**Tách việc kế tiếp:** phiếu này không thay R11. Sau khi khép fault windows, chốt protocol actor revoke Auth/directory/business, thử claim/RPC/settle bằng JWT còn hạn và đo độ trễ thực. Chỉ trình nhận BG02 khi phạm vi thiếu đã được review; BG03–BG11 vẫn theo [phiếu toàn tuyến](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#9-phiếu-thực-hiện-bg01bg11-từ-bản-301). Khóa/quyền VPS, DNS, email và offsite tiếp tục gom chờ theo bước cần dùng.

### 10.4. Ma trận journal hỏng và lỗi IO cần thực hiện

**Trạng thái: đã có diagnostic local source318/run ceaeeeb36691; chưa nhận release.** Xem [actual và giới hạn](roomqc-setup-rotation-storage-local-2026-10-29.md). Đây là các biến thể con của dòng7 mục10.3, R05/R07/R12 và BG02-02/03/07/08; không thêm/đổi 70 ca hoặc 124 lượt gốc. Fixture C/binary/harness đã chạy thật cho10corruption+8EIO trên318; packet có syscall/FUSE witness. Bảng dưới giữ expected để review hoặc kiểm delta; không suy thành mọi lỗi filesystem.

**Thứ tự thực hiện:** khóa source/schema/image/C/binary/config; compile C với `-Wall -Wextra -Werror`; nối harness actual daemon và observer chỉ quan sát syscall; chạy từng variant với baseline riêng; hồi quy lát chịu ảnh hưởng. Diagnostic `setup-rotation-storage` đã được nối vào runner và chạy exit0 trên318; lệnh thật ở báo cáo actual. Phạm vi file dự kiến: `server/control/testing/setup-rotation-storage-native.mjs`, observer journal riêng hoặc mở rộng an toàn, `setup-installer-native.mjs`, `setup-installer-faultfs.c`, `scripts/test-control-backend-sandbox.mjs`; thêm nguồn vào binder nếu cần, không nới pin packet cũ.

#### 10.4.1. Dataset và ràng buộc chạy

- Tạo một pending hợp lệ bằng CLI/daemon sản phẩm, barrier ở pending_synced rồi dừng trước dispatch; DB command/audit/credential delta = 0. Lưu exact bytes/context/hash/key và baseline riêng có ownership.
- Với mỗi biến thể hỏng: chạy positive xác thực pending nhưng dừng trước dispatch; chỉ đổi file fixture; chạy actual daemon, ghi lỗi an toàn và effects; giữ bytes forensic; phục hồi đúng bytes/quyền/path của fixture rồi positive lại. Chỉ cuối chuỗi mới dispatch cùng yêu cầu và restart lần hai kiểm idle.
- FUSE parent riêng có quyền mount trong sandbox; CLI/daemon UID10001/CapEff0/no-new-privileges, source read-only. Không chạy sản phẩm bằng root để vượt lỗi quyền. `/fault-control`, backing, journal và mọi Docker object phải có ownership của run.
- Harness tổng dự kiến ≤20 phút, từng process/DB call có timeout hữu hạn. Giữ deadline sản phẩm hiện tại (installer45 giây, shutdown55 giây); không tăng deadline sản phẩm để làm test xanh. Dùng DB clock/TTL thật, không giả expiry hoặc bỏ overlap policy để rút thời gian.

#### 10.4.2. Mười biến thể corruption

Mỗi biến thể chạy độc lập trên **pending đã sync nhưng chưa dispatch**. Expected chung: từ chối đọc/dispatch record không hợp lệ, readiness đóng, DB effects mới = 0, không phát key mới, không xóa bytes điều tra hoặc chạm canary. Nếu runtime không được tạo thì ghi startup rejected, không bịa một response readiness đã đo.

| Mã phụ | Biến thể fixture | Điều kiện phục hồi để nhận |
|---|---|---|
| JC01 | Thiếu command.json | Phục hồi đúng file/key/body/hash gốc, pending đọc lại được |
| JC02 | Thiếu context.json | Phục hồi context gốc, không suy context từ config để bỏ qua mất file |
| JC03 | command.json ghi dở/JSON thiếu đoạn | Từ chối parse; bytes gốc khôi phục rồi kiểm lại |
| JC04 | context.json ghi dở/JSON thiếu đoạn | Từ chối parse/binding; không dispatch bằng command riêng lẻ |
| JC05 | Command bị đổi bytes, hash không khớp | Phát hiện mismatch trước network; không tính lại hash để hợp thức hóa record |
| JC06 | Context binding/configuration hash sai | Không gửi sang target/config khác; phục hồi context đúng |
| JC07 | commandHash trong context sai | Không coi context là nguồn chân lý độc lập; so lại exact command bytes |
| JC08 | Có entry/file ngoài allowlist trong pending | Không bỏ qua entry để tự chữa; phục hồi đúng cấu trúc rồi kiểm |
| JC09 | File có hardlink/nlink >1 | Từ chối bằng stat của UID thực; canary/link target không bị sửa |
| JC10 | File owner/mode làm UID thực không đọc được | Quan sát lỗi quyền hoặc private-file validation thật; phục hồi owner/mode rồi positive. Symlink là biến thể bổ sung riêng, không suy từ hardlink |

Sau phục hồi cuối: cùng caller/key/body/context/target tạo đúng1 command/audit/credential theo policy; ID/iat/exp theo immutable receipt; native RPC dùng credential hợp lệ; lịch sử đúng pending gốc; restart lần hai idle. Nếu một biến thể không thể tạo trên FUSE hiện có, ghi blocked/harness limitation và bổ sung backing fixture kiểm soát; không thay bằng mock rồi ghi native pass.

#### 10.4.3. Tám điểm lỗi IO thực

Mỗi điểm có positive trước/sau, chỉ bật một cờ trong fault-control của run. Chỉ nhận khi có cả sự kiện FUSE đúng operation/kind/errno và kết quả lỗi từ syscall kernel mà daemon thật gọi; observer không thay return của fs. Loại lỗi được đưa vào là EIO, chưa chứng minh ENOSPC/EROFS hoặc mất điện phần cứng cho journal.

| Mã phụ / cờ fixture | Điểm lỗi | Expected tại fault và sau gỡ lỗi |
|---|---|---|
| JI01 / fault-journal-command-write | write command.json | Chưa có pending dispatchable; DB effects0; stage giữ để điều tra. Sau sửa có thể tạo key mới vì đã chứng minh chưa dispatch |
| JI02 / fault-journal-command-sync | fsync command.json | Như JI01; không coi write thành công là command đã durable |
| JI03 / fault-journal-context-sync | fsync context.json | Như JI01; context chưa bền vững không cho dispatch |
| JI04 / fault-journal-prepare-sync | fsync prepare directory | Như JI01; stage chưa công bố, không gửi request từ stage |
| JI05 / fault-journal-pending-rename | rename prepare → pending | Rename bị từ chối thật, không pending đã công bố; DB effects0; không suy lỗi rename là đã dispatch |
| JI06 / fault-journal-pending-sync | fsync pending directory sau rename | Có pending cùng key/body; không dispatch sau lỗi; gỡ fault rồi restart đối soát đúng pending, không tạo yêu cầu thay thế |
| JI07 / fault-journal-archive-rename | rename pending → history/published | DB/publication đã commit; vẫn giữ pending và receipt; không báo ready từ bước archive lỗi. Recovery dùng cùng receipt, effects không tăng |
| JI08 / fault-journal-archive-sync | fsync published history sau rename | History có thể đã chứa key, pending đã rỗng. Ghi chính xác layout; recovery đọc lịch sử và không issue mới, ID/iat/exp/effects không đổi |

Điểm trước pending và điểm sau pending có quy tắc key khác nhau: chỉ được dùng key mới khi đã chứng minh stage chưa dispatch. Khi pending/outcome có thể đã remote, bắt buộc giữ identity và tra receipt. Với lỗi sync sau rename, không được yêu cầu pending vẫn ở đường cũ nếu rename đã xảy ra; kiểm layout thật và phục hồi theo journal protocol.

**Mỗi lượt cần ghi:** DB time/policy/expiry/head trước–sau; CLI/process exit và readiness thực đo; syscall/FUSE witness; pending/history/stage bytes/hash/mode/inode/nlink; command/audit/credential counts; original key/receipt invariants; native RPC; business session về0 và mutex/canary không bị chiếm; source/schema đầu–cuối; role/private file/container/volume/network cleanup độc lập. Evidence public không chứa secret hoặc raw credential; bytes điều tra nằm private đúng owner.

**Điều kiện nhận phần storage:** đủ10biến thể corruption+8điểm IO với positive/fault/recovery và restart kiểm chứng, reviewer nhận đúng scope. Không nhận full BG02 từ phần này: contention shared/separate journal, R11 actor revoke, profile UID1000 trên VPS và các mốc BG03–BG11 còn hồ sơ riêng. FUSE EIO qua kernel chứng minh đường xử lý lỗi filesystem, không chứng minh độ bền đĩa vật lý hay staging production.

## 11. Checklist nhận bộ kế hoạch và chuyển sang thực hiện

Phạm vi người dùng xác nhận: **toàn bộ VPS + signup**. Đầu ra: **plan + nghiệm thu**. Checklist này dùng nhận tài liệu; không thêm ca vào ma trận sản phẩm hoặc tự đóng L/S/P/U/B.

| Kiểm hồ sơ | Đầu ra bắt buộc | Nơi đối chiếu |
|---|---|---|
| Phạm vi và kiến trúc | Khách chỉ đăng ký; RoomQC chuẩn bị/quản lý cụm; dữ liệu/quyền cách ly; khách cũ giữ affinity | Master mục0.4/1; blueprint mục1/5 |
| Công việc có thể giao | 25 task, dependency không vòng lặp, 27 gói và 8 đợt giữ nguyên; 11 BG có đầu vào/file/API/việc làm/đầu ra/điều kiện dừng | Master mục4; blueprint mục9; ledger gốc |
| Trạng thái có bằng chứng | Checkpoint331:control527pass/0fail/192skip,directory160/160,native104/104 controls gồm witness/barrier; R11 còn expired/legacy recovery, worker, populated upgrade/security và all-family | [Báo cáo local hiện hành](roomqc-support-consumption-local-2026-10-29.md); checkpoint cũ giữ scope riêng, không cộng số test hoặc chuyển proof sang nguồn khác |
| Việc làm tiếp | R11: thực thi protocol điểm hiệu lực revoke và kiểm claim/RPC/settle; sau đó BG03–BG11 theo dependency | [Phiếu cụ thể](roomqc-vps-signup-execution-dossier-2026-10-29.md#51-phiếu-chốt-giao-thức-thu-hồi-quyền-còn-thiếu) |
| Tài nguyên và gói | configured/observed/reserved/usable/overlap/headroom; quota/fairness; last-slot race; capacity/cost cần đo | T09/T10/T23; BG03/BG10; Q05/Q06 |
| Signup và console | Intent/Auth/verify/setup/resume/invite; quyền từ server; backup và tenant-summary còn planned phải nối đầy đủ | T11–T17; blueprint mục5/9; D01–D15/E01–E08 |
| VPS và phục hồi | Install/rerun/reboot/TLS/upgrade/rollback; offsite clean-host restore gồm object bytes, một writer, quyền revoke; on-call | T18–T20; F01–F09/B09 |
| E2E và pilot | Hai cụm độc lập; web/Android thật; ramp/soak/noisy neighbor/cost; pilot ≥7 ngày | T21–T25; G01–G08 |
| Nghiệm thu thực thi | 70 ca/124 lượt, requiredEnvironments/expected gốc, mẫu run/actual/exit/evidence/defect/reviewer/signoff và stop/rollback | Ma trận thực thi; hồ sơ này mục2–8 |
| Đầu vào/lịch | Q01–Q10, vai trò và bước cần dùng; phần thiếu key/quyền gom chờ; dự toán38,5–68 ngày công chưa là lịch cam kết | Blueprint mục3/10; board mục9/11 |

**Trước khi giao mỗi BG:** điền tên người làm/reviewer, source/image/config/schema/dataset/target refs, giờ công còn lại, ngày có đầu vào, bài kiểm và stop thresholds. Review có thể nhận một phần theo proof và liệt kê phần thiếu; không sửa expected/môi trường gốc để hợp thức hóa kết quả.

**Sau khi chạy:** mỗi case+environment ghi actual, exact command/bước UI, terminal exit, evidence đã lọc, effects/cleanup, defect/disposition và reviewer thật. Source đổi thì kiểm lại phần chịu ảnh hưởng; candidate cuối theo BG06. Trạng thái dùng pass/fail/blocked/skip/harness_failure đúng nguyên nhân; elapsed time không là approval.

**Điểm dừng phát hành:** diagnostic local hỗ trợ triển khai, chưa là release acceptance. Hiện70ca/124lượt chính thức chưa chạy,122mục release vẫn unverified, reviewer/signoff/gates giữ nguyên. Khi đủ actual và review mới đề nghị L (tích hợp local), S (staging), P (pilot), U (mở đăng ký công khai); B (thu phí thật) có nghiệm thu riêng. Không tự điền người duyệt hoặc mở gate từ lượt rà tài liệu này.

## 12. Nghiệm thu protocol R11 và thành phần acceptance mới

**Checkpoint consumption331 — lịch sử:** source331/hash `a700ff658818a1f0b8b43420cf120d93768f0fedc34b8b3de32f56a7d7a5ef1f`,587 business/20 directory migrations. Native104/104,directory160/160,control527pass/192skip/0fail,exit0. Đã có proof canonical Auth→cluster command consumption,grants/constraints/rollback,response loss,same-key retry còn hạn và3 accept-before-revoke windows. Điểm runtime mới hơn và giới hạn theo từng nguồn nằm ở đầu trang và mục12.5; scoped evidence không điền actual chính thức hoặc đóng BG02.

Các dòng sau là **subcheck bổ sung của A08–A11,D07–D11 và A04–A07 khi liên quan upgrade**, không tạo case release mới, không đổi requiredEnvironments hoặc expected gốc. Nếu protocol được chọn làm thay đổi expected, phải ghi quyết định và đối chiếu cam kết gốc trước khi chạy; không tự đổi expected sau khi thấy actual.

### 12.1. Chuẩn bị và luồng demo

1. R11-01/02 ở [phiếu triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md#52-phiếu-triển-khai-r11-theo-nguồn327) được review: version protocol, điểm nhận/revoke, expiry/recovery và audience do server cấu hình. Ghi source/config/contract cùng hash chuỗi587 business/20 directory và từng SQL586/587/0020 riêng; source backend binder không thay checksum business migrations.
2. Fixture có operator hợp lệ, operator bị revoke, owner/staff A và B, account/profile/role/session riêng; dữ liệu Auth/directory/business có đáp án và ownership. Trước run lưu effect counts, session/lock baseline, migration/schema và object checksum liên quan.
3. Demo positive: operator gửi lệnh→Auth acceptance→directory command/audit/consumption/result→lookup với quyền hiện hành. Hiển thị cùng key,attempt,scope và IDs đã lọc; không hiển thị JWT/DSN/private key.
4. Đảo thứ tự revoke và acceptance bằng row-lock/HTTP barriers thật. QA phải thấy blocker và mốc commit; gọi mock authorizer không thay proof này. Tiếp tục với response loss→restart→same-key recovery.
5. Kết thúc kiểm before/after,effects,deadline và cleanup process/transaction/session/lock/Docker đúng ownership. Không tự xóa resource ngoài run. Lưu failure và run thay thế riêng.

### 12.2. Ma trận bài kiểm bắt buộc

Trạng thái của các dòng dưới là **cần chạy theo candidate tích hợp mới**, kể cả khi unit cho helper đã có kết quả. Ghi actual vào run mới; không tự điền pass từ plan.

| Subcheck | Thao tác / lỗi chủ động | Expected cần chứng minh |
|---|---|---|
| RA01 — quyền và ACL | Gọi RPC qua JWT thật với anon,service,owner,staff,operator hợp lệ; giả metadata super_admin; thử private table và public RPC | Chỉ operator có canonical role/account/profile/session sống được nhận đúng lệnh; metadata không nâng quyền; private table không mở; public wrapper invoker,definer ở schema không expose |
| RA02 — scope và nơi dùng | Sai actor/session/attempt/audience/op/target/exact key/payload hash; gửi receipt giả từ client hoặc dùng receipt A ở directory B | Không sử dụng receipt lệch; audience do server quyết định; command/directory/business không effects thành công; key giữ nguyên cả chữ hoa/thường |
| RA03 — đồng thời và replay | Ba request acceptance cùng attempt đồng thời; replay receipt và command20 lần; cùng key/body khác scope | Một receipt ID/thời hạn, một consumption/command/effect; conflict rõ ràng; replay không renew hoặc tạo job/trial mới |
| RA04 — account/profile revoke trước | Giữ lock cập nhật account/profile, gửi acceptance đang chờ rồi commit khóa/vô hiệu; JWT còn hạn | Acceptance không được nhận sau revoke; số receipt/command/mutation thành công không tăng |
| RA05 — role/session revoke trước | Xóa canonical role hoặc Auth session trong transaction giữ lock; gửi acceptance rồi commit revoke | Cùng kết luận RA04; session metadata/token cũ không vượt canonical state |
| RA06 — acceptance trước revoke | Giữ acceptance tại barrier khi đang giữ Auth row locks; gửi revoker; nhả barrier rồi xác nhận thứ tự commit | Revoker chờ đúng locks; acceptance có thể hoàn tất trước revoke. Chỉ command chính xác đã nhận được hoàn tất theo protocol; acquisition mới sau revoke bị chặn |
| RA07 — mất response ở Auth | TCP drop sau Auth commit; retry cùng attempt khi còn hạn, sau expiry và sau revoke | Nếu còn quyền/hạn thì cùng receipt; không renew. Sau expiry/revoke không acquisition mới; orphan receipt là audit, không chứng minh directory effect |
| RA08 — hết hạn trước bàn giao | Delay transport/SQL đủ qua expiry; kiểm DB clock và elapsed monotonic theo protocol | Không sử dụng receipt ngoài cửa sổ được chốt; rollback directory effect nếu chưa nhận hợp lệ. Không tuyên bố5giây giới hạn mọi CPU/IO/COMMIT hoặc toàn bộ job |
| RA09 — SQL/audit lỗi | Trigger audit/receipt/consumption phát lỗi trước commit; rollback có witness; gỡ fixture fault và retry nguyên key/body | Không partial directory command/mutation; Auth orphan nếu có được ghi đúng trạng thái; retry positive không tạo effect trùng |
| RA10 — revoke trong cửa sổ directory | Revoke sau Auth acceptance,trước directory commit; delay khóa/COMMIT; kiểm thêm revoke sau directory commit | Actual khớp điểm hiệu lực đã chốt RA06; không dùng RPC cuối để giả cam kết atomic xuyênDB. Sau commit không báo zero effects hoặc xóa receipt vì revoke |
| RA11 — result/list sau revoke | Chặn read ở SQL barrier, revoke rồi nhả; đọc result/replay/legacy lookup với actor khác | Quyền đọc hiện hành được kiểm; không rò DTO/results. Giữ command cũ; denial đọc không đảo effect đã commit |
| RA12 — kill và unknown | SIGKILL API trước/sau acceptance, trước/sau directory commit, trước HTTP response; restart | Lookup/recovery giữ key/body/identity; chưa commit không báo success, đã commit không ghi lại. Không tự tạo attempt mới để né unknown |
| RA13 — claim→RPC | Revoke owner trước claim,sau claim/trước RPC và khi remote transaction giữ lock; hai worker tranh lease | Chưa có dispatch được phép thì không provision mới. Khi đã có dispatch được phép, xử lý theo protocol/fence; không dùng admin acceptance làm owner credential |
| RA14 — remote commit→settle | Business commit rồi mất response,revoke owner,kill worker; restart cùng dispatch; lease hết hạn/reply cũ | Service chỉ đối soát receipt cũ; đúng một tenant/hotel/trial và activation; late worker bị fence, không yêu cầu owner đăng ký lại |
| RA15 — Auth partition/restart | Auth unavailable trước acceptance,trong response loss,sau directory commit và lúc service recovery | Không mở quyền dự phòng bằng service key; phân biệt denied/unknown/committed; recovery hữu hạn đúng allowlist, không tự gia hạn receipt/dispatch |
| RA16 — nâng cấp và quyền mới | Fresh587/20,populated585→586→587 và586→587,directory19→20; rerun,checksum sai,two migrators; advisor object mới | Dữ liệu/lease/trial/history và receipts giữ đúng; schema/role readiness đúng; API không sửa/xóa receipt/identity; kiểm app rollback tương thích riêng, không mượn superuser runtime |
| RA17 — tài nguyên và thời hạn | Timeout/lock error,cancel,late response; lặp các cửa sổ đã chọn; kiểm active/idle-in-transaction và pool | Không request/promise/session/lock fixture bỏ lại; finally nhả barrier. Harness tự nhả khóa không được tính product timeout pass |
| RA18 — báo cáo và giới hạn | Đối chiếu run,source/schema/config/contract,effect counts,terminal,cleanup,skip/failure và reviewer | Mọi dòng có evidence hoặc gap cụ thể; không chuyển proof327 sang330, không dùng unit15/15 thay native. Chưa đủ thì R11/BG02 mở; full candidate vẫn theo BG06 |

### 12.3. Mẫu kết quả và quy tắc nhận

Dùng record ở mục6 cho từng case+environment; thêm `protocolVersion`,subcheck IDs,actor/session refs,audience,acceptance/consumption/command/dispatch refs,thứ tự commit quan sát được,expected/actual effects và expiry/recovery disposition. Chỉ phát hành refs/hash đã lọc; log private không đưa vào report.

Người triển khai và QA đối chiếu từng dòng, ghi nhận phần được kiểm và phần thiếu. Reviewer chỉ nhận R11 khi protocol đã được nối vào mọi đường bắt buộc và actual đủ positive/negative/fault/recovery; không nhận từ việc chỉ có migration hoặc test source. Phê duyệt protocol không tự mở signup,deploy VPS hoặc cấp gate L/S/P/U/B. Các mốc toàn phạm vi vẫn theo mục8 và hồ sơ tổng hợp.

<a id="124-thực-thi-bản-tích-hợp-source330"></a>

### 12.4. Thực thi và bằng chứng sau checkpoint331

Theo [chín bước triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md#53-thứ-tự-triển-khai-bản-tích-hợp-source330). Đây là bổ sung cách chạy RA07–RA17 trong70 ca hiện có; **đã có scoped native331 cho RA02/09,RA03/07a,RA10 cluster command vàexpiry trong RA08; RA07b,legacy restart/replay,worker,populated upgrade/all-family còn mở**. Không tăng70 ca/124 lượt hoặc tự điền worksheet. Các ca local đạt cũng chưa thay staging.

| Bài bổ sung | Setup và thao tác chính xác | Expected / evidence để nhận |
|---|---|---|
| RA02/09 — consumption DB thật | API role LOGIN thật; original parent command hợp lệ rồi thử sai actor/audience/op/target/exact key/hash; dùng lại receipt hoặc gắn vào parent thứ hai; fault audit/insert trước COMMIT | Chặn bằng ACL/constraint/trigger đúng nơi; effect/command/audit/consumption rollback cùng transaction; Auth orphan giữ lịch sử. UPDATE/DELETE receipt và đổi directory identity bị chặn; kiểm cả positive |
| RA03/RA07a — mất response còn hạn | Drop HTTP sau Auth acceptance commit trong original admin request; quan sát receipt bằng maintenance connection fixture; bỏ drop và retry cùng key/body/attempt trước expiry | Lần đầu không có directory effect thành công; retry trả original acceptance ID và original expiry, một command/audit/consumption/effect. Không tính fixture receipt double là native |
| RA07b/08 — hết hạn sau rollback | Commit Auth receipt, buộc directory rollback; xác nhận expiry bằng canonical DB time rồi retry cùng key/body sau5giây; làm lại với actor bị revoke | Current code có nguy cơ kẹt; bài giữ mở tới khi có recovery đã review. Sau sửa: no-effect được đối soát/fence trước vòng quyền phục hồi, key/body giữ nguyên, receipt cũ liên kết; revoked actor không có effect mới |
| RA10 — accept-first trong directory | Pause tại BEFORE INSERT consumption bằng advisory lock riêng; chứng kiến API role đang block và Auth receipt đã commit; revoke role/session/profile rồi kiểm GET kết quả; nhả lock trong finally và await request | Theo Q04: chỉ exact command được nhận trước revoke có thể hoàn tất một lần; lệnh mới/current-authority reads bị chặn. Đo elapsed nếu barrier vượt cửa sổ thì phải rollback expiry, không tùy tiện kéo dài TTL để đạt |
| RA11/12 — directory đã commit nhưng response mất | Drop HTTP sau directory commit, restart API, current-authority GET/result rồi gửi lại original key; sau đó revoke và đọc/replay tiếp | Không duplicate effect hoặc xin acceptance để thực thi lại; GET đúng result khi còn quyền; sau revoke không rò result. Lưu DB parent/consumption/audit IDs trước–sau |
| RA07/12 — legacy reconcile | Từ UI/CLI lưu stable intent trước POST, cắt response sau commit, restart/F5 rồi lookup/retry cùng original key | Một support action/effect/result; không phát server requestId mới để thực hiện lại. Endpoint/body/client/native phải cùng protocol; code331 chưa có đủ đường này |
| RA13/14 — owner và service | Revoke ở từng cửa sổ claim→RPC→business commit→settle; kill worker, hai worker/expired lease/late reply; restart cùng dispatch | Một tenant/hotel/trial; không provision mới ngoài quyền; allowed service recovery chỉ đối soát dispatch cũ và settle có fence. Không dùng operator acceptance thay owner credential |
| RA16 — upgrade populated | Snapshot có command lịch sử chưa có consumption, support_actions cũ null context, mapping/lease/trial/session và revoked state; nâng cấp587/20, rerun rồi chạy app tương thích | Dữ liệu cũ đọc đúng; constraint không ép backfill receipt giả. Giữ audience qua backup/restart; host restore vẫn cần writer fencing riêng ở BG08. History/checksum/two-migrator và SQL rollback/app rollback có evidence riêng |

**Trình tự chạy:** syntax/focused unit→directory migrations và cases trên fixture riêng→native Auth/HTTP/SQL→regression chịu delta→review R11. Chốt source trước native run, không sửa backend khi đang chạy; lưu terminal exit và before/after manifest. Full-default/independent rebuild và frontend/business journey vẫn là phần bắt buộc của candidate BG06 sau đó. Phải tra CLI `--help` trước chọn cờ chạy thật; dùng runbook/harness hiện có, không chạy lệnh migrate lên DB phục vụ.

**Biên bản tối thiểu từng bài:** case+environment+subcheck; candidate/backend/business/directory/config hashes; target/dataset/runner; exact command; protocol decision; barrier/commit order; before/after IDs/effect counts; expected/actual; exit; defect; deadline/session/lock/process/Docker cleanup; secret scan; reviewer và phạm vi thực sự nhận. Log private chỉ phát hành ref/hash đã lọc. Preflight unit15/15 không điền actual cho các bài trên.

### 12.5. Nghiệm thu phục hồi cùng mã lệnh và legacy replay

**Trạng thái:** runtime đã nối execute/register/alert/recheck. Native113/113 trên source243567 có expired/response-loss recovery thật cho close_admission;8retries trong một API process. Đây là actual thành phần,không thay expected RX dưới đây hoặc actual chính thức. Legacy/two-process/all-family/worker/populated còn thiếu; xem báo cáo runtime vàphiếu5.5 dossier. Không tăng70ca/124lượt.

**Fixture bắt buộc:** canonical Auth với operator hợp lệ và operator/session bị revoke; directory API LOGIN thực; các command đã commit và chưa commit; Auth orphan còn hạn/hết hạn; legacy action cũ; hai API process; poolMax1 và cấu hình vận hành; dữ liệu có known IDs/counts/hash. Chốt source/business+directory migrations/config và Q04 protocol trước run. Dùng maintenance connection riêng do harness sở hữu để quan sát, không cấp quyền này cho runtime.

| Subcheck | Thao tác và fault window | Expected/effect assertions để nhận |
|---|---|---|
| RX01 — positive + retry còn hạn | Tạo intent gốc, chặn/mất response sau canonical acceptance commit; retry còn hạn cùng actor/key/body qua API thật | Một original intent và acceptance ID/hạn không đổi; đúng một effect/command/audit/consumption/result. Lưu cả journal commit và effect commit order |
| RX02 — hết hạn và phục hồi | Auth commit; buộc directory rollback; đợi canonical DB chứng kiến receipt hết hạn; restart API rồi retry cùng key/body | Đối soát dưới fence chứng minh no-effect; generation kế tiếp có predecessor và quyền canonical mới. Original key/hash giữ nguyên; receipt cũ bất biến; chỉ một final effect và result, không kẹt vô hạn ở attempt hết hạn |
| RX03 — kill trước/sau durable intent | SIGKILL trước intent commit, sau intent commit/trước Auth, sau Auth commit/trước lưu response; restart và đối soát từng biến thể | Chỉ gửi Auth sau intent durable; nếu response mất thì truy original attempt, không tự phát replacement. Không có effect trước quyền hợp lệ; orphan/unknown có trace và bước xử lý |
| RX04 — hai caller, cùng key | Hai API process đồng thời retry expired original intent; pause ở no-effect check và generation publication | Một generation phục hồi thắng CAS/fence; caller thua replay/wait/conflict theo contract, không nhận vòng quyền thứ hai để ghi trùng. Kiểm cả lock waits hữu hạn và final IDs |
| RX05 — writer cũ và phản hồi muộn | Giữ transaction cũ đang in-flight khi caller phục hồi bắt đầu; release/kill writer cũ; thêm late Auth/HTTP reply sau generation mới | Không lấy timeout làm no-effect. Recovery chờ writer cũ terminal/fenced rồi tra committed result hoặc mở vòng mới. Late reply sai generation không commit; không có hai successful effects |
| RX06 — namespace/body/scope | Cùng key đổi body/target/actual operation theo namespace hiện hành; đổi actor/cụm/workspace/audience; body field order thay đổi nhưng canonical payload không đổi | Conflict/denial giữ semantics đã chốt RF01. Không né conflict bằng target hoặc session mới; hash canonical tương đương không tạo intent thay thế; không đọc result chéo actor/cụm |
| RX07 — revoke/ban/expiry khi phục hồi | Receipt cũ hết hạn rồi revoke profile/role/session hoặc khóa account; thử recovery; thử session mới hợp lệ riêng sau đó | Actor không còn quyền không được nhận vòng mới hoặc có effect mới. Session mới chỉ theo protocol explicit, cùng original identity/result và kiểm quyền thực; JWT decode không là authority |
| RX08 — response mất sau directory commit | Drop HTTP sau final directory commit; restart/hai tab; GET result và retry original request; tiếp đó revoke và đọc/replay lại | Trả original result khi còn quyền, không re-execute hoặc tạo generation để ghi lại. Sau revoke chặn current-authority read/replay; lịch sử DB còn nguyên và counts không tăng |
| RX09 — pool/lock/cleanup | poolMax1, hai request tranh key, cùng lúc command khác đang chờ global/shared/per-key locks; DB disconnect và SIGTERM ở mỗi đoạn giữ fence | Không tự deadlock vì giữ client rồi mượn pool lần hai; lock order thống nhất. Mọi lần lỗi kết thúc theo deadline; connection/fence/transaction về baseline. Nếu unlock không chắc thì client bị destroy, không trả session bẩn vào pool |
| RX10 — legacy UI/transport | Ghi stable client intent trước POST reconcile; cắt response sau commit; F5/restart/Back/hai tab rồi lookup cùng intent | Một support action/result; requestId mới chỉ là trace. UI có một next action dễ hiểu và không hướng dẫn tạo key hoặc đăng ký lại; evidence UI+network+DB cùng run |
| RX11 — populated upgrade/rollback | Seed command/result cũ, expired orphan, unknown, revoked session và legacy row trước migration; upgrade/rerun; restart; thử rollback app được chọn | Counts/IDs/history/ACL/unique giữ đúng; không fabricated receipts. App cũ không hiểu journal phải đóng mutation/read-only; runtime không được bypass fence. Không xóa volume/down-migrate để đạt |
| RX12 — toàn họ lệnh và bàn giao | Áp dụng positive/deny/expired/commit-loss cho execute/register/alert/recheck/legacy; faults audit/consumption/journal commit; cuối run đối soát và cleanup độc lập | Mỗi họ lệnh có mapping expected/actual riêng; rollback effect không mất durable intent. Unknown không trả suất/cấp lại tenant/trial. Source/schema không drift; failed history còn; reviewer nhận đúng phạm vi |

**Bằng chứng mỗi biến thể:** original intent/key hash, actor/authority cluster/session refs đã lọc; generation/predecessor/acceptance IDs và original expiry; Auth và directory commit/barrier witnesses; parent/result/effect counts; current permission checks; command/exit/signal/deadline; locks/sessions/processes/Docker cleanup theo exact ownership. Không phát hành raw JWT, DSN hoặc journal chứa bí mật. Maintenance observer không được tự ghi result để làm bài đạt.

**Trình tự và điểm kết thúc:** review RF01/02 → focused logic/constraints → directory DB thật → native canonical Auth/HTTP → legacy UI/transport → populated upgrade/rollback → regression chịu delta → review. Có thể dùng native barrier thời gian hữu hạn và DB clock thực; không kéo dài TTL5giây hoặc sửa expected sau failure. Nhận gap recovery khi RX đủ actual trên candidate và không còn lỗi quyền/duplicate/fence/cleanup trong scope. Worker/service recovery, security review rộng, full-default/rebuild, VPS staging và pilot vẫn là các điều kiện riêng; RX đạt không tự đóng toàn R11/BG02 hoặc cấp gate.

**Ghi kết quả:** dùng [mẫu124 lượt](../../../artifacts/roomqc-vps-signup-acceptance-run-template-source331-2026-10-29.json), tạo run mới và gắn RX vào `subchecks` của case+environment tương ứng. Mẫu giữ actual/reviewer/signoff trống. Trạng thái `pass/fail/blocked/skip/harness_failure` chỉ điền sau thực thi; phần môi trường chưa có key/quyền ghi đúng đầu vào thiếu, không chuyển thành pass.

## 13. Nhận bản kế hoạch và chuẩn bị buổi nghiệm thu

Phạm vi người dùng đã xác nhận: **toàn bộ VPS + signup; plan + nghiệm thu**. Đây là kiểm chất lượng hồ sơ chuẩn bị. Bằng chứng thực thi sản phẩm vẫn phải chạy theo 70 ca/124 lượt gốc; không chuyển trạng thái chỉ vì tài liệu hoặc script audit đạt.

### 13.1. Checklist nhận tài liệu

| Nội dung | Đối chiếu bắt buộc | Đạt khi |
|---|---|---|
| Đúng baseline | Manifest hiện hành, nguồn checkpoint cũ, log focused, contract/handler và code chưa chạy | Phân biệt RF06 đang sửa với native 113/113 lịch sử; không đổi log cũ thành proof mới |
| Đúng toàn phạm vi | 8 đợt,25 task,27 package,11 BG; đủ tài nguyên/quyền/signup/gói/console/VPS/DR/E2E/tải/pilot | Từng task giữ dependency/ca/môi trường; có đầu vào, file/API, đầu ra, người làm/kiểm theo vai trò |
| Có việc bắt đầu được | Dossier 5.6: contract→caller→native→RF06 proof→hai process/toàn họ lệnh→worker→populated/security | Không giao lại code đã viết như chưa làm; mỗi lượt có điểm kết thúc và lỗi nào phải chặn bàn giao |
| Đủ hành trình và vận hành | Dossier 11–12; 25 phiếu task ở master; Q01–Q10 và budget/SLO/rollback | Khách đăng ký là dùng được theo luồng đích; OPS biết xử lý kẹt/full/upgrade/restore; phần chưa có nút/API nằm trong backlog |
| Không bỏ ca | So task/case/dependency và từng cặp case+environment với định nghĩa được bảo vệ | 54 local + 69 staging + 1 pilot = 124; expected/môi trường giữ nguyên; không tính skip thành pass |
| Có chỗ ghi actual | Mẫu RF06 mới, metadata/run IDs, source/target/dataset/fault/effects/exit/cleanup, defects/reviewer/signoff | Cả 124 dòng vẫn not_run và trường actual/người ký trống; khi chạy tạo run mới, không ghi đè định nghĩa |
| Đầu vào và lịch rõ | Q01–Q10, owner vai trò, bước cần dùng; dự toán lịch sử và cách ước lượng delta | Chưa có VPS/key ghi chờ đúng phần; không cần gửi secret vào chat. Không hứa ngày từ 38,5–68 ngày công lịch sử; pilot vẫn ≥7 ngày lịch |
| Liên kết và bảo toàn | Hash 3 định nghĩa gốc, source trước–sau, file/anchor trong các tài liệu bàn giao | Tất cả link nội bộ kiểm được; không sửa migration/runtime/ledger; productAccepted=false, các gate chưa cấp |

Audit chuẩn bị: [snapshot handover](../../../artifacts/roomqc-vps-signup-plan-handover-2026-10-29.json). Mẫu dùng để chạy: [124 lượt RF06 chưa chạy](../../../artifacts/roomqc-vps-signup-acceptance-run-template-rf06-2026-10-29.json). Manifest trong mẫu chỉ là ảnh chụp lúc chuẩn bị; candidate thật phải ràng buộc lại sau sửa code trước thực thi.

### 13.2. Kịch bản demo liền mạch để người quản lý nhận sản phẩm

Chuẩn bị run riêng: hai cụm A/B đồng thời, hai owner, nhân viên lễ tân/buồng phòng/kỹ thuật và operator; fixture IDs/counts/checksums biết trước. Email chỉ đến inbox thử được phép. Demo dưới đây gom các subchecks vào ca gốc, không tạo thêm ca release. Dừng khi phát hiện sai quyền/duplicate/mapping/receipt; giữ evidence trước sửa.

| Thứ tự | Thao tác thực tế | Kết quả và ca gốc phải đối soát |
|---|---|---|
| 1 | Hạ tầng xem cụm A có chỗ; đặt B full/closed, rồi gửi signup | Server chỉ reserve cụm đủ điều kiện; không oversell. C05–C10, B01–B09 |
| 2 | Owner nhập thông tin, nhận email, xác minh; thử link hết hạn và callback ngoài allowlist | Auth/workspace đúng, một intent; callback sai bị chặn, không lộ secret. D01–D03, D12–D15 |
| 3 | Submit hotel, giữ response sau business commit; F5/hai tab và tiếp tục | Một tenant/hotel/trial/receipt; UI đọc kết quả gốc, không đăng ký lại. D04–D11 |
| 4 | Mời từng vị trí và chọn hotel/quyền; staff nhận mời rồi đăng nhập | Đúng quyền ngay khi tạo/nhận mời; API chặn thao tác/hotel vượt quyền. A08–A11, D15, G07 |
| 5 | Cắt mạng/offline, background Android, quay lại; kiểm Back, keyboard và deep link | Giữ workspace và context; stale response không đè actor mới; Android có build/OS/device evidence. A03, E01–E08, G07 |
| 6 | Dùng owner/token A truy dữ liệu/object/Realtime B; làm A lỗi rồi mở app khách A | Cross-tenant bị deny, khách A không bị đưa sang B. G01–G03 |
| 7 | Tạo ca setup kẹt; operator tìm/lọc, xem detail, gửi Kiểm tra lại rồi cắt response | Tra original key/result; một effect; thiếu quyền/revoke lúc đọc hay recovery đều bị chặn. A09–A11, D07–D11, E01–E05, E08/RX |
| 8 | Hai request tranh quota cuối; operator đổi gói có lý do rồi thử lại cùng lệnh | Không vượt quota; audit/version/result đúng, không trial mới hoặc thu tiền thật. C05–C10, G05–G06; policy Q05 phải được chốt |
| 9 | Reboot/nâng cấp canary trên VPS; diễn tập app rollback | Giữ dữ liệu/historical receipts, private ports/TLS đúng. F01–F04, G07 |
| 10 | Backup offsite; làm host gốc unavailable; restore host sạch, kiểm object bytes/login/permissions/jobs | Một writer, revoked quyền không sống lại, RPO/RTO actual; người trực nhận alert ngoài host. F05–F09, B09 |
| 11 | Chạy workload đã khóa, ramp/soak/noisy neighbor/backup overlap; đối chiếu chi phí | Báo max_tested riêng operating_limit/headroom; lỗi/latency/resource có actual. G04–G06 |
| 12 | Review RC, chạy pilot có giới hạn ≥7 ngày, tổng hợp lỗi/phản hồi/support/cost | G07/G08 có reviewer thật; quyết định P rồi U theo phạm vi. Gate B thu phí được xét riêng |

Mỗi bước cần cả UI/network và effect readback phù hợp; ảnh màn hình không thay SQL/receipt, log SQL không thay thao tác browser/Android. Các bài fault sâu vẫn chạy theo RX/RA và expected gốc; demo không thay 124 lượt. Nếu chưa có VPS/provider thì chỉ nhận phần local được chứng minh và ghi đầu vào còn thiếu.

### 13.3. Biên bản bàn giao và sửa lỗi

Kết thúc từng BG ghi: phần demo được; source/target/environment; task/case/subchecks; actual và exit; evidence đã lọc; defects/severity/owner; phục hồi/cleanup; phạm vi reviewer nhận; input đang chờ; lượt tiếp theo. Tên runner/reviewer và signoff là người thực tế, không tự điền từ vai trò.

Lỗi quyền/dữ liệu/cấp phát/restore nghiêm trọng chặn mở nhận mới trong scope. Sửa xong chạy lại bài lỗi và hồi quy chịu ảnh hưởng; giữ cả failure cũ. Chỉ BG06/BG10 hoặc delta mới có lý do mới mở rộng full run/rebuild. Mọi gate L/S/P/U/B giữ điều kiện gốc tại mục 8, không được cấp bằng audit tài liệu.
