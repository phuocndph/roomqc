# RoomQC — preflight, quyền và publication fences của installer

Ngày 28/10/2026. Tiếp lần1 của [bảng triển khai](roomqc-vps-signup-implementation-board-2026-10-28.md), giữ nguyên [fault matrix](roomqc-setup-installer-fault-matrix-2026-10-28.md) và bộ nghiệm thu release. Checkpoint IF01–IF05 tại [báo cáo trước](roomqc-setup-installer-faults-local-2026-10-28.md) vẫn áp đúng source1f576b của nó.

## 1. Thay đổi và phạm vi kiểm

[Harness fences](../../../server/control/testing/setup-installer-fences-native.mjs) chạy CLI thật và PostgreSQL thật trên database/role/output directory riêng. Không thay SQL migration hoặc đặc quyền runtime. Các role fixture được tạo trước khi tính approved schema fingerprint; sau can thiệp vào role, kiểm lại **hash đã được duyệt từ trước**, không lấy hash drift làm approval mới.

| Phần | Đối chứng phải có |
|---|---|
| Identity/role | Wrong system ID qua native preflight; name/LOGIN mismatch qua DSN validation; connection limit2, CREATEDB, service membership, mixed issuer/installer và extra membership đều bị chặn. Sau restore fixture, role graph khớp baseline |
| Manifest/approval | Manifest v1/v2/missing, signature sai, signed approval hết hạn và endpoint substitution; trước dispatch không thay authority/management/credentials/commands/audit và không tạo file |
| Budget | Digest tính đúng cho từng budget thiếu consumer, pool2, replica mismatch, fixed connection và rolling overflow. Native identity kiểm observed max_connections thấp hơn budget hoặc reserve cao hơn approved |
| Maintenance surface | LOGIN riêng API, setup worker, service, anon, authenticated và ordinary postgres gọi preflight/bind/issue/revoke; observer thật thử đọc workspaces và ghi authority. Không bổ sung runtime grants |
| File fences | Giữ response thật của receipt ở ReadyForQuery idle; thay riêng bytes config/command/trust hoặc signer cùng/sai algorithm. Output directory riêng mỗi ca; không publication, receipt/expiry và file đã xuất trước đó giữ nguyên |
| Authority fences | Chứng minh writer hợp lệ không lấy được exclusive727001 khi CLI giữ shared lock. Ca khác dùng fixture superuser bypass trigger trong transaction riêng để rút authority giữa fences; đây là can thiệp adversarial, không phải đường writer hợp lệ |
| Expiry | Envelope thật được ký trước startup. Quan sát receipt barrier trước expiry, chờ thời gian thực qua hạn rồi tiếp tục; publication bị chặn và replay expired không kéo dài receipt. Không đổi đồng hồ hoặc timeout của sản phẩm |

[Harness chính](../../../server/control/testing/setup-installer-native.mjs) giữ hồi quy bind/issue/revoke TCP loss, conflict, hai CLI, hai SIGKILL và native REST. Progress chỉ ghi nhãn an toàn ra stderr; stdout vẫn là packet JSON cuối. [Sandbox runner](../../../scripts/test-control-backend-sandbox.mjs) lưu exit/signal/timeout/elapsed của command thất bại, không lưu argv hoặc secrets vào public packet. Suite focused có budget hữu hạn10 phút cho66 controls; deadline45 giây mỗi CLI và query/lock/statement timeout không đổi.

## 2. Candidate và kiểm chứng

Backend288 files, SHA256 `3ddefd9ddc068cbf097331f3f708fee790e7b5bfe27075148f450bd8681d7b22`;584 business+19 directory migrations. Không đổi migration ở đợt này.

| Bằng chứng cùng candidate | Actual | Giới hạn |
|---|---|---|
| [Focused fd153222f1b0](../../../artifacts/roomqc-setup-installer-fences-focused-native-fd153222f1b0-local-2026-10-28.json) | 66/66 controls, terminal0,9 barrier quan sát được,2 SIGKILL; source/schema đầu-cuối khớp, cleanup0 | CLI/PG/REST thật với fixture release/HS256; chưa API/worker full integration hoặc VPS |
| [Control2cd9b9169ff3](../../../artifacts/roomqc-workspace-recheck-2cd9b9169ff3-local-2026-10-28.json) | 673 tổng/671 pass/0 fail/2 skip,16 recheck cases; terminal0, source khớp, cleanup0 | Hai skip Windows symlink/POSIX notification mode; Auth/remote receipts có fixture |
| [Native51f2a15b16c2](../../../artifacts/roomqc-setup-installer-fences-native-51f2a15b16c2-local-2026-10-28.json) | 328/328 controls, terminal0; source/schema đầu-cuối khớp, cleanup0; API45 và backfill CLI16 được giữ | Diagnostic local; release/health/confirmed Auth vẫn có fixture, chưa full-default/rebuild/VPS |

Focused tăng39 controls so checkpoint27:30 preflight/budget/permission và9 publication/authority/expiry. Có26 SQL calls bằng LOGIN thật bị từ chối:6 profile×4 hàm và2 observer actions. Các nhóm IF01–IF09,IF13,IF17 có proof local trong scope; IF10 mới legacy/invalid/expired/endpoint, chưa key withdrawal.

Actual expiry của focused: fixture validity5694ms, tới receipt sau4133ms, còn1552ms tại barrier; barrier trước expiry, sau chờ thời gian thực thì publication bị chặn. CLI/query/credential TTL không bị kéo dài. Các assertion timing được lưu trong packet, không suy từ tên test. Không dùng packet source964d7e hoặc36c377 thay candidate này.

Native328 gồm184 controls API/worker/CLI nền và144 credential/status/attestation/publication/installer;66 installer controls nằm trong144. Native cũng có9 installer barriers và2 SIGKILL, expiry validity5700ms/receipt3799ms/còn1890ms tại barrier. `precommitObservedEffects=1` được đối soát thành đúng1 command/audit sau replay; không suy rollback từ client chết. Bốn publisher component kills và hai SQL-writer kills giữ proof riêng. Ba upgrade rollback từ581/582/583 và denial ordinary migrator của584 vẫn đạt. Advisors đo808 findings/247WARN; chưa disposition hoặc security signoff.

Đối chiếu bằng `node scripts/verify-vps-signup-installer-fences-checkpoint.mjs`: audit chỉ đọc source/public packets/docs, không chạy lại product tests, nối DB hoặc đổi gates. Audit fault trước vẫn pin1f576b và phải từ chối source mới; không nới pin để nhận packet lịch sử.

## 3. Các lượt thất bại được giữ lại

- [Focused14e9bec3cc79](../../../artifacts/roomqc-setup-installer-fences-focused-native-14e9bec3cc79-local-2026-10-28.json): source964d7e, terminal1, cleanup0. Client run kết thúc trùng giới hạn240 giây; output riêng rỗng nên chưa đủ chứng minh nguyên nhân tại một ca cụ thể. Chưa có progress/failed-command metadata ở source này. [Control0f872fb8123c](../../../artifacts/roomqc-workspace-recheck-0f872fb8123c-local-2026-10-28.json) có673 tổng/671 pass/0 fail/2 skip ở source đó, chỉ giữ làm lịch sử.
- [Focused23aa7e2eb51b](../../../artifacts/roomqc-setup-installer-fences-focused-native-23aa7e2eb51b-local-2026-10-28.json): source36c377, terminal1, cleanup0; failed command208226ms, timedOut=false. Có53 safe progress labels trước lỗi `INSTALLER_NATIVE_TIMEOUT_publication-actual-approval-expiry`. Fixture ký approval chỉ1,8 giây nên không tới được receipt barrier cần kiểm. Đây không là proof lỗi cấp quyền của sản phẩm hoặc pass cho ca expiry.

Sửa fixture expiry bằng thời gian tới receipt quan sát ở CLI trước cộng margin; vẫn bắt buộc receipt barrier xảy ra trước actual expiry và phần thời gian còn lại nằm trong query timeout hiện hành. Nếu CLI kết thúc trước barrier thì fail ngay; không đợi hết60 giây hoặc coi denial startup là denial giữa fences. Authority baseline được restore chỉ để teardown/cách ly fixture; không khôi phục envelope đã hết hạn để ép replay thành công.

## 4. Phần chưa được nhận

IF10 còn nhánh signing-key withdrawal toàn tuyến; IF11/IF12/IF14/IF15/IF16 và full fault matrix chưa khép. Rotation daemon, mount/UID/reload, Auth→directory revoke, default-full/rebuild và staging/VPS vẫn mở. Các kiểm HS256 local không nhận thuật toán hoặc topology production khác.

Ledger/worksheet gốc giữ70ca not_run,122mục unverified,124lượt môi trường, reviewer/signoff/gates không đổi. Không cấp khóa vận hành, áp migration serving DB hoặc bật signup/dispatch/worker từ các diagnostic này. Goal toàn plan tiếp tục active.
