# RoomQC — bộ cài khóa phục hồi đăng ký, kiểm thử local

Checkpoint lịch sử cho source7b7fb7 và16 installer controls. Đợt fault mới hơn nằm ở [báo cáo IF01–IF05](roomqc-setup-installer-faults-local-2026-10-28.md); không dùng các số còn thiếu bên dưới như trạng thái hiện tại của source mới.

Ngày 28/10/2026. Phạm vi là lần bàn giao 1 trong [bảng triển khai toàn bộ VPS + signup](roomqc-vps-signup-implementation-board-2026-10-28.md). Đây là bằng chứng kỹ thuật local; chưa nghiệm thu VPS hoặc cho phép mở đăng ký công khai.

## 1. Phần đã triển khai và lỗi đã sửa

[CLI](../../../scripts/control-setup-credential.mjs) đọc config/command và secrets từ file private, kiểm signed approval, target, identity của hai DB, budget, capability và live directory authority trước khi thực hiện check/bind/issue/publish/revoke. Issuer và installer dùng LOGIN riêng; observer directory chỉ đọc metadata. Mỗi kết nối có pool/connection limit 1, timeout và deadline; các session giữ lock được hủy khi kết thúc.

- Ràng buộc expected với fingerprint trong approval đã ký, chặn thay release/hashes qua config.
- Giữ nguyên operation và key khi cần phục hồi bind/issue/publish/revoke. Lỗi PostgreSQL được lọc thành mã an toàn, không xuất chi tiết kết nối.
- Ép tên role trong truy vấn membership sang `text[]` để driver PostgreSQL đọc đúng; `name[]` trước đó khiến LOGIN hợp lệ bị từ chối.
- Bổ sung quyền phân giải namespace Realtime cho helper catalog; không cấp quyền đọc bảng nghiệp vụ.
- Thêm policy SELECT trên singleton release manifest cho NOLOGIN function owner. Grant SELECT riêng lẻ bị RLS lọc hết bản ghi nên preflight không đọc được release; vẫn giữ RLS, không cấp BYPASSRLS hay quyền trực tiếp cho issuer/installer.
- Sửa fixture đọc binding từ bảng authority, và hồi quy upgrade directory so sánh với manifest hiện hành thay số 18 cố định.

Business migration584 là [preflight](../../../supabase/migrations/20261028101638_setup_credential_target_preflight.sql); directory migration0019 là [observer](../../../server/control/migrations/0019-setup-credential-observer.sql). Chỉ áp vào database thử nghiệm disposable. Hướng dẫn cấu hình, quyền, thao tác và phục hồi nằm trong [runbook](roomqc-setup-credential-installer-runbook.md).

## 2. Bằng chứng hiện tại

Backend **287 files**, SHA256 `7b7fb7ddd8f126875160323e409e441d855646b61788abb7189ea7972a3f4224`. Candidate có584 business +19 directory migrations. Hash không bao gồm migration nghiệp vụ; từng packet ghi riêng hash migration chain và schema trước/sau.

| Bài kiểm | Kết quả | Giới hạn |
|---|---|---|
| [Focused installer native](../../../artifacts/roomqc-setup-installer-focused-native-4f9f1916c66d-local-2026-10-28.json) | 16/16; terminal0, end-source verified, schema trước/sau khớp, cleanup containers/volumes/networks0 | Actual CLI/PG/REST, fixture signed release/HS256; không thay full-default/rebuild hoặc VPS |
| [Control regression](../../../artifacts/roomqc-workspace-recheck-d37e46ed33db-local-2026-10-28.json) | 672 tổng,670 pass,0 fail,2 skip;16 recheck cases, terminal0, cùng source, cleanup0 | Hai skip: symlink Windows thiếu quyền và POSIX notification modes chỉ kiểm Linux; Auth/remote authority trong bộ này có fixture |
| [Native API/worker/CLI tích hợp](../../../artifacts/roomqc-setup-installer-native-1e8bf074990e-local-2026-10-28.json) | 278/278 controls;584+19 migrations, terminal0, end-source verified, schema không đổi, cleanup0 | Diagnostic local, fixture release/health/confirmed Auth; chưa default-full/rebuild hoặc VPS |
| Installer + signer unit | 14/14, không skip | Không thay native DB/role/process proof |

Native278 gồm184 API/worker/CLI nền và94 credential/status/attestation/publication/installer;16 installer mới nằm trong94. Giữ riêng một installer SIGKILL, bốn publisher component SIGKILL, hai SQL-writer SIGKILL, mười API/worker SIGKILL và một backfill CLI SIGKILL nền; không cộng chúng thành số ca nghiệm thu. Có ba attestation upgrade rollback từ581/582/583, gồm denial ordinary migrator cho584. Advisors là phép đo, chưa security disposition hoặc signoff.

Focused native đã kiểm upgrade directory18→19 có dữ liệu và rerun; observer không đọc workspace hoặc ghi authority; check read-only; bind; issue bị từ chối trước effects khi sai physical DB/signed expected/budget; TCP mất phản hồi tại ReadyForQuery idle sau commit; replay đúng key xuất file và gọi RPC thật; publish lại dùng đúng file/expiry; file Linux0600; revoke rồi check thấy revoked; SIGKILL CLI sau issue commit tại barrier và restart chỉ một effect; live authority bị withdrawn;11 bảng nghiệp vụ không đổi; output không chứa DSN/bearer/signing material. Snapshot negative còn bao gồm authority, management, credentials, commands và audit.

## 3. Lỗi thử nghiệm đã giữ lại

Các lần thất bại vẫn có packet riêng, terminal1 và cleanup0: [631ecfaca770](../../../artifacts/roomqc-setup-installer-focused-native-631ecfaca770-local-2026-10-28.json) và [50ca9f7737df](../../../artifacts/roomqc-setup-installer-focused-native-50ca9f7737df-local-2026-10-28.json). Lần50 xác nhận capability/membership/live fingerprint đều khớp nhưng manifest không đọc được vì RLS. Không thay observed hash để làm kiểm tra qua. Các packet trước đó giữ lịch sử lỗi privilege và giải mã membership; chúng không phải proof của source cuối.

## 4. Phần chưa hoàn tất của lần bàn giao 1

16 controls không đóng toàn fault matrix ở §4.1 bảng triển khai. [Phiếu17ca còn thiếu](roomqc-setup-installer-fault-matrix-2026-10-28.md) ghi rõ barrier, cách gây lỗi và expected cho CLI trước commit, bind/revoke mất phản hồi, xung đột caller/key/body, đổi role/config/approval giữa các fence, hai installer, timeout/deadline và filesystem faults. Bốn publisher component kill/resume đã có proof riêng, chưa thay kiểm toàn tuyến CLI tại các điểm file.

Sau khi khép phần trên mới chuyển lần2: rotation daemon, hai rotator/deadline/expiry, mount thư mục read-only và UID/reload thật, thu hồi actor xuyên Auth→directory. Tiếp theo là inventory/budget/quota, signup/email/callback, hai console, full-default/rebuild, VPS/TLS, offsite restore/on-call, A/B và browser/Android E2E, load/soak/RC, pilot≥7 ngày. Đầu vào cần secret/quyền tiếp tục ghi chờ trong plan.

## 5. Trạng thái nghiệm thu

Không migrate database phục vụ, không đổi DNS/secret/flags, không bật worker/signup/dispatch. Hai file acceptance gốc giữ nguyên;70ca not_run,122mục release unverified,124lượt môi trường chưa có actual nghiệm thu, reviewer/signoff/gates không đổi. Goal toàn bộ VPS + signup vẫn mở.
