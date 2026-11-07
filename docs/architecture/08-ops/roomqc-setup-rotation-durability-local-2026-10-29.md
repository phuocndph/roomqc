# RoomQC — phục hồi daemon tại journal, publication và archive

Ngày: 29/10/2026. Run native: **a4cb64dd5c4c**, terminal exit **0**. [Packet công khai](../../../artifacts/roomqc-setup-rotation-durability-a4cb64dd5c4c-local-2026-10-29.json) giữ metadata đã lọc; log/fixture refs riêng nằm trong packet. Đây là diagnostic local phục vụ BG02/T03/T08/T12, chưa phải nhận toàn BG02 hoặc nghiệm thu release.

Kết quả: **25 kiểm đạt**, gồm **19 kiểm rotation durability**, qua **23 process** UID/GID10001, CapEff0, no-new-privileges và source read-only. Tám cửa sổ dừng/kill được quan sát trong daemon sản phẩm; recovery dùng PostgreSQL và PostgREST thật. Không phát hiện lỗi sản phẩm trong phạm vi vừa chạy. Đợt này bổ sung harness/bằng chứng, không đổi logic cấp khóa, policy hay schema sản phẩm.

## 1. Nguồn và cách chạy

Backend: **316 tệp**, SHA256 `003fd7d7a94f136aabdf06dd8e2dbbe9b4a73c14078dd10d0343378c414d6753`.

- Business migrations: **585**; directory migrations: **19**.
- Migration set hash: `8e55f912d34a1401096d5417c2e82d02af91313cb82efcfe03fb4c55cc894d42`.
- Schema trước/sau: `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`.
- Source được kiểm đầu/cuối; không đổi trong lúc chạy.

```powershell
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-rotation-durability
```

Sandbox dựng toàn bộ schema bằng vendor stack đã pin, mạng nội bộ, không public port/provider. DB/roles/files/container/network/volume của bài thử có ownership riêng; không dùng DB nghiệp vụ đang phục vụ. Issuer/daemon là entrypoint thật; recovery dùng daemon định kỳ, lượt restart lần hai dùng `--once` để xác nhận idle.

Fixture giữ TTL180 giây, overlap10 giây, rotateBefore120 giây và interval1000ms theo policy hợp lệ. Giữa các vòng đợi mốc đến hạn/overlap qua DB clock; không sửa expiry, bỏ qua live-head fence hoặc dùng response giả để ép rotation.

## 2. Phạm vi thay đổi

| File | Thay đổi |
|---|---|
| [Native durability harness](../../../server/control/testing/setup-rotation-durability-native.mjs) | Thêm positive, barrier, kill/signal, exact-command recovery, immutable receipt, file/DB effects, session/mutex/canary assertions |
| [Filesystem preload](../../../server/control/testing/setup-installer-fs-preload.mjs) | Bổ sung observer sau directory sync thật, khi rename=1 và directorySync=2; giữ bốn phase cũ |
| [Installer native harness](../../../server/control/testing/setup-installer-native.mjs) | Nối nhánh diagnostic riêng, dùng cùng fixture issuer/native DB/CLI identity và cleanup |
| [Sandbox runner](../../../scripts/test-control-backend-sandbox.mjs) | Thêm diagnostic vào allowlists, source snapshot/nonroot/exposure/input/phase; budget native hữu hạn600s như rotation hiện có |

Không thêm product flag để bỏ qua security/fence. Journal barrier dùng hook hiện có sau sync thật; filesystem preload gọi syscall gốc rồi quan sát. Với kill, marker và trạng thái `/proc` T được chứng kiến trước SIGKILL. Với SIGTERM, chờ lifecycle stopping rồi mới nhả barrier. Không dùng mock lỗi hệ thống để nhận durability thật.

## 3. Tám cửa sổ đã chạy

| Cửa sổ | Tác động trước dừng | Expected đã quan sát khi phục hồi |
|---|---|---|
| `command_synced`, trước pending rename — SIGKILL | Command/context đã sync trong prepare-stage; pending rỗng; zero command DB | Stage nguyên bytes/context; chưa thể dispatch nên restart được lập command mới. Key của stage bỏ dở không bao giờ xuất hiện trong DB; không gọi stage này là remote outcome chưa biết |
| `pending_synced` — SIGTERM | Pending đã sync; chưa dispatch; lifecycle nhận stop | Exit0 trong deadline55s, zero DB effects, cùng caller/key/body/context còn nguyên |
| `pending_synced` — SIGKILL | Pending đã sync; chưa dispatch; `/proc` T | Restart dùng chính pending, không key mới; đúng một command/audit/credential khi tiếp tục |
| Publication `before_rename` — SIGKILL | DB đã commit; intent/stage hợp lệ; output còn predecessor | Cùng receipt/ID/iat/exp; công bố đúng file, native RPC200; không cấp thêm khóa |
| Publication `after_rename` — SIGKILL | DB đã commit; output mới hoàn chỉnh; directory sync cuối chưa chạy | Replay giữ inode/hash/mode/bytes output mới, hoàn tất xác minh cùng receipt; không đổi expiry |
| Publication `directory_synced` — SIGKILL | Rename thật xong, directory sync thật lần2; daemon chưa công bố rotated | Replay giữ output/receipt, RPC xác minh; không nhận thành công trước khi luồng gốc hoàn tất |
| Journal `before_archive` — SIGKILL | Publication/native RPC đã đạt; command vẫn pending | Restart đối soát cùng command rồi archive một lần; không thêm credential/audit |
| Journal `archive_synced` — SIGKILL | Command đã nằm trong published history, pending rỗng; chưa emit rotated | Restart idle, không dispatch lại; history giữ exact command/context và kết quả DB gốc |

Sau mỗi cửa sổ publication/archive, recovery daemon và restart lần hai đều giữ immutable receipt, credential ID/iat/exp, predecessor và effect counts. File output mode0600/nlink1/owner10001; output đã rename giữ nguyên inode/hash khi replay. Canary thuộc fixture nhưng nằm ngoài publication directory không đổi.

Các publication barriers ghi số syscall thật:

| Phase | Intent sync | Directory sync | Stage sync | Rename |
|---|---:|---:|---:|---:|
| before_rename | 1 | 1 | 1 | 0 |
| after_rename | 1 | 1 | 1 | 1 |
| directory_synced | 1 | 2 | 1 | 1 |

Tổng12 observation gồm8 cửa sổ dừng và4 lần chờ mốc DB. Đây không phải12 ca nghiệm thu release mới.

## 4. Hồi quy và thu dọn

```powershell
node --test --test-reporter=spec server/control/setup-rotation-journal.test.mjs server/control/setup-credential-publication.test.mjs server/control/setup-credential-rotation.test.mjs server/control/setup-rotation-runtime.test.mjs server/control/backend-source-binding.test.mjs scripts/roomqc-sandbox-state.test.mjs
```

**47 tổng,46 pass,0 fail,1 skip**, exit0. Skip là bài monitoring renderer/Compose opt-in chưa bật, không được nhận từ lượt này. Packet có log hash và skip disposition.

Native có **15 lần** xác nhận issuer/observer sessions0, business mutex727012 và directory mutex727001 nhả được, canary ngoài output không đổi. Fixture cuối xóa24 role và private root;11 bảng nghiệp vụ bảo vệ không đổi. Outer harness dọn12 Docker objects; kiểm độc lập theo ownership label còn **0 container/0 volume/0 network**.

Giữ nguyên hash ledger, worksheet và execution matrix. Không đổi8đợt/25task/27gói/70ca/124lượt/122mục unverified, actual/reviewer/signoff/gates. Test count không được quy thành phần trăm hoàn thành hoặc số release case đã pass.

## 5. Đối chiếu phạm vi và việc còn lại

| Phạm vi | Trạng thái sau run này |
|---|---|
| Mục10.3 dòng3/4 hồ sơ nghiệm thu | Có proof `command_synced` SIGKILL và `pending_synced` SIGTERM/SIGKILL với recovery. Không suy thành mọi biến thể signal/IO đều đã phủ |
| Mục10.3 dòng5 | Ba cửa sổ daemon publication trước/sau rename/sau directory sync có actual local |
| Mục10.3 dòng6 | `before_archive` và `archive_synced` có actual local |
| Mục10.3 dòng7/8 | **Còn mở:** native corrupt/partial journal, lỗi write/sync/rename/đĩa và full contention tại các barrier, chung journal/riêng journal |
| R11 | **Còn mở:** thu hồi actor Auth→directory→business, JWT còn hạn và các race claim/RPC/settle. Credential revoke không thay actor revoke |
| Runtime/staging | Packet mount313 giữ scope riêng. UID1000, filesystem/ACL/VPS thật, lỗi/hỏng storage hardware chưa được chứng minh tại đây |
| Toàn sản phẩm | Còn BG03–BG11: resource/quota/fairness, signup/email, console, exact integrated candidate, VPS/TLS, offsite DR/on-call, web/Android E2E, tải/chi phí và pilot≥7 ngày |

[Startup/periodic315](roomqc-setup-rotation-startup-local-2026-10-29.md) và [mount313](roomqc-setup-runtime-mount-local-2026-10-29.md) là bằng chứng lịch sử đúng source của chúng. Source316 chỉ thêm diagnostic; không tự kế thừa full proof của nguồn khác. Full BG02 và product release vẫn mở.

Nhận việc tiếp ở [board mục10.2](roomqc-vps-signup-implementation-board-2026-10-28.md#102-các-việc-nhận-tiếp-sau-checkpoint315) và [hồ sơ nghiệm thu mục10.3](roomqc-vps-signup-master-acceptance-2026-10-28.md#103-phiếu-startup-và-journal-cần-bổ-sung). Không lặp các cửa sổ đã đạt khi chưa có delta, failure hoặc khoảng trống cụ thể cần kiểm.
