# RoomQC — thu hồi khóa phê duyệt và rollback bộ cài

Ngày 28/10/2026. Phạm vi toàn VPS+signup; đây là bước triển khai local của lần1/T08/T12, chưa là nghiệm thu sản phẩm. [Kế hoạch](roomqc-vps-signup-master-plan-2026-10-28.md) và [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md) tiếp tục toàn phạm vi.

## 1. Thay đổi và điều được chứng minh

[Fixture giao dịch](../../../server/control/testing/setup-installer-transaction-native.mjs) nối vào [CLI harness](../../../server/control/testing/setup-installer-native.mjs). Không đổi SQL migration, quyền runtime, timeout hoặc mã installer sản phẩm. Tạo hook bằng phiên bảo trì trong DB disposable trước khi tính approved fingerprint; không lấy hash drift sau lỗi làm approval mới. Hook được gỡ trước khi đối chiếu schema cuối.

| Phần | Đối chứng thực tế |
|---|---|
| IF10 — thu hồi khóa | Envelope ký bằng khóa fixture thứ hai qua actual CLI check trước khi thu hồi. LOGIN API thật gọi ReleaseApprovalStore.withdrawKey: một command/event/revocation; authority withdrawn, admission đóng. Issue bằng envelope đó bị chặn trước mutation và output |
| IF10 — replay và cô lập predicate | Replay withdrawal cùng key không thêm effect. Ca adversarial riêng dùng superuser fixture chỉ đổi pointer active/epoch; revocation không bị xóa và CLI vẫn từ chối. Đây không phải đường reactivation hợp lệ. Khóa baseline khác không bị revoke hoặc revive |
| IF16 — command insert lỗi | Trigger fixture trước INSERT command chỉ ném lỗi sau khi đã thấy predecessor retirement, credential mới, management head/version trong cùng transaction. Sequence witness không transaction chứng minh ca đã tới mutation, không chỉ bị preflight chặn |
| IF16 — audit insert lỗi | Trigger trước INSERT audit thấy command vừa được chèn và các mutation trước đó. Sau server session terminal, authority/management/predecessor/credentials/commands/audit bằng snapshot cũ; output giữ nguyên |
| IF16 — phục hồi | Tắt flag dữ liệu, giữ nguyên command/caller/key/body; CLI tạo đúng một credential/command/audit và gọi native REST thật. Replay giữ file và expiry; witness không tăng nữa. Không sửa lịch sử audit hoặc tăng quyền ứng dụng |

Tăng9 controls so checkpoint66:5 withdrawal và4 rollback/recovery. Chỉ test schema/flag trong owned DB; sequence là witness của fixture, không là journal sản phẩm. Hai insert faults cùng replay một command; không coi lỗi generic hoặc client exit tự nó là bằng chứng rollback.

## 2. Candidate và kết quả

Backend289 files/SHA256 `6802f300c3c4232e8e649f039aaf5be285da92f8b0a2116c0308318de3c16e14`;584 business+19 directory migrations, chuỗi business không đổi. Source288/3ddefd tại [checkpoint fences](roomqc-setup-installer-fences-local-2026-10-28.md) giữ proof lịch sử riêng.

| Packet cùng candidate | Actual | Giới hạn |
|---|---|---|
| [Focused883ffcf86d26](../../../artifacts/roomqc-setup-installer-transactions-focused-native-883ffcf86d26-local-2026-10-28.json) |75/75, terminal0;2 SIGKILL và9 barrier giữ hồi quy; cleanup0|CLI/PG/REST local, không full API/worker journey hoặc VPS|
| [Nativefed613ef070e](../../../artifacts/roomqc-setup-installer-transactions-native-fed613ef070e-local-2026-10-28.json) |337/337 gồm184 nền+153 credential/status/publication/installer; installer75 nằm trong153; terminal0/schema/source đầu-cuối khớp; cleanup0|Diagnostic: signed release/HS256/health/confirmed Auth còn fixture; chưa full-default/rebuild|
| [Control11397d6033eb](../../../artifacts/roomqc-workspace-recheck-11397d6033eb-local-2026-10-28.json) |673 tổng/671 pass/0 fail/2 skip;16 recheck; terminal0, cùng source; cleanup0|Chạy --test-concurrency=4 sau một lượt lỗi môi trường; skip symlink Windows và POSIX notification mode vẫn mở|

Native giữ API45/backfillCLI16, ba upgrade rollback581/582/583 và denial ordinary migrator584. Advisor808 findings/247WARN là số đo, chưa disposition hoặc security signoff. Không dùng control hoặc native count của source cũ áp cho candidate này.

## 3. Failed và interrupted runs được giữ

- [157d54518b3a](../../../artifacts/roomqc-setup-installer-transactions-focused-native-157d54518b3a-local-2026-10-28.json): source2173b2, terminal1/cleanup0. Chuẩn bị hook bằng ordinary postgres bị42501 tại bảng protected; sửa fixture để dùng maintenance riêng, không nới product grants.
- [460ce0ffbbae](../../../artifacts/roomqc-workspace-recheck-460ce0ffbbae-local-2026-10-28.json): source2173b2,673 tổng/659pass/12fail/2skip, cleanup0. Một barrier40ms không quan sát kịp,11 ca có readiness hook thất bại; chạy cùng quá trình dựng stack khác. Không kết luận lỗi sản phẩm đã tái hiện từ các lỗi setup này; chạy lại riêng với concurrency4, giữ product timeout.
- [b991083c9952 bị ngắt](../../../artifacts/roomqc-setup-installer-interrupted-b991083c9952-local-2026-10-28.json): Windows reboot; exec session mất, Docker dừng, không observed terminal. Cleanup recovery thu hồi12 owned objects, còn0. Packet correction ghi terminalExitCode=null và thay thế claim synthetic exit1 trong wrapper cũ; không dùng wrapper làm actual terminal proof.

## 4. Phần tiếp theo và nghiệm thu

IF11 nhận8ca DL01–DL08 ở [phiếu deadline](roomqc-vps-signup-implementation-board-2026-10-28.md#44-phiếu-tiếp-theo-cho-deadline--if11-chưa-có-actual); chưa có actual. Sau đó actual CLI kills tại fsync/rename(IF12), Linux UID/mode/link(IF14) và filesystem volume faults(IF15). Chưa đủ full fault matrix để đóng lần1. Rotation daemon/two rotators/expiry, read-only mount reload và Auth→directory revoke là lần2; T10/signup/console/full-default/rebuild/VPS/DR/E2E/tải/RC/pilot vẫn phải triển khai.

70ca not_run/122mục unverified/124lượt môi trường giữ nguyên; reviewer/signoff=null, gates không đổi. Không migration serving DB, không key vận hành, không bật signup/dispatch/worker; goal toàn plan vẫn active.
