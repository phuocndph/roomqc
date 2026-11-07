# RoomQC — CLI đối soát đăng ký theo lô, bằng chứng local

Ngày28/10/2026. Đã thêm writer config/budget riêng, manifest được ký cho đúng target/report/dòng được chọn, CLI apply riêng, quyền file Windows/POSIX và output JSONL exclusive/fsync. Bằng chứng tập trung có process SIGKILL giữa lô và mất response PostgreSQL sau commit; chạy lại cùng batch giữ đúng một command/audit mỗi dòng. Chưa cấp credential, ký lô vận hành, apply database đang phục vụ hoặc bật worker/dispatch production.

## 1. Thay đổi và mục đích

| Thành phần | Hành vi |
|---|---|
| `setup-backfill-batch.mjs` | Domain/chữ ký Ed25519; trust scope environment+server+database+reader+writer; batch/report/source/budget/cluster bindings và1–100 dòng chính xác |
| `setup-backfill-apply-config.mjs` | DSN file writer riêng, write-session rõ ràng; max1; không thừa kế PG* env để chọn target/role/SQL; resource consumer writer riêng |
| `setup-backfill-files.mjs` | Chặn symlink/junction, file/thư mục không riêng tư; kiểm Windows ACL thực và POSIX owner/mode; output exclusive, append/fsync |
| `scripts/control-setup-backfill-apply.mjs` | Bốn file tuyệt đối; reserve output trước DB; pin session/advisory lock; kiểm lại input/source/phê duyệt trước ghi; key ổn định và kết quả đã lọc |
| `setup-backfill-config.mjs`, `resource-runtime.mjs` | Dùng chung signed-target parser; writer có validator/budget riêng, reader giữ semantic chỉ đọc |
| `setup-backfill.mjs` | Chuẩn hóa expected/binding theo thứ tự các trường đã chốt để report scope ổn định khi JSON key order thay đổi; không thêm quyền |
| `setup-backfill-batch.test.mjs`, `setup-backfill-cli-cases.mjs` | Signature/target/drift/budget/file/CLI negatives; LOGIN thật + CLI child processes + wire response loss + interruption/resume |
| Backend source binding | Thêm CLI và template writer vào bộ source được hash; không bỏ file cũ |

Không có migration mới. Directory0001–0017 và580 migration nghiệp vụ giữ nguyên. Template writer cố tình thiếu identity/approval; example ngân sách chung không tự thêm writer và provisioning-worker vẫn replicas0. Reader CLI không có `--apply`, không có ghi ngầm.

## 2. Hành vi vận hành cần giữ

Approver giữ private key ngoài runtime. Runtime chỉ có public trust ràng buộc environment và directory identity gồm hai LOGIN khác nhau. Chữ ký chốt batch UUID, reviewer/change refs, source, report hash, resource budget hash, target/release bindings và workspace/routing/fingerprint/group được chọn. Không dùng một JSON tự điền tên reviewer làm bằng chứng phê duyệt.

Input sai hoặc output đã tồn tại dừng trước kết nối database. Writer dùng pool1 và một session giữ advisory727004/1; SQL apply kiểm thêm backendPID+lock, không tự reconnect. Trong lúc đọc remote, không giữ transaction/row lock. Config/trust/budget/DSN/report/manifest/source được kiểm lại trước mỗi ghi, kể cả sau remote observation. Credential scoped được reload và vẫn chỉ gọi receipt, không close/provision.

Mỗi dòng kết quả được lọc và fsync; output không là authority. Mất response hoặc SIGKILL dùng cùng approved manifest và file output mới, gửi lại cùng key batch+workspace. Database replay command đã commit trước CAS mới; journal/audit/business/job không bị tạo lại. Header/count/exit0 chỉ xác nhận đã ghi nhận kết quả của lô, không xác nhận mọi workspace active.

TTL lô tối đa24h, report quá24h bị từ chối; sau expiry/input drift phải đối soát và review lại theo runbook, không đổi key để vượt kết quả cũ hoặc kéo dài job. Replay qua CLI vẫn cần phê duyệt hiện hành và quyền database. Source/target/release thay đổi không được nối mặc nhiên vào lô cũ.

Hướng dẫn schema trust/payload, file modes, lệnh và phục hồi tại [runbook mục8](roomqc-setup-backfill-runbook.md#8-cli-apply-theo-lô-được-phê-duyệt).

## 3. Bằng chứng gắn source

- [Tập trung4513ad9c50fa](../../../artifacts/roomqc-setup-backfill-cli-4513ad9c50fa-local-2026-10-28.json):6/6, exit0, cleanup exact label0. PostgreSQL16 thật, reader/writer LOGIN, child CLI và private files thực; remote receipt là HTTP fixture, signer là fixture.
- [Native08c5dccb4388](../../../artifacts/roomqc-setup-backfill-cli-native-08c5dccb4388-local-2026-10-28.json):123/123 controls,580 business+17 directory migrations, exit0, cleanup0. Gồm17 worker,8 reader,8 apply với Auth/PostgREST/PostgreSQL và role thật; chưa chạy toàn CLI qua native remote ở run này.
- [Linux container764e41eb82ef](../../../artifacts/roomqc-setup-backfill-cli-linux-764e41eb82ef-local-2026-10-28.json):14/14, không skip, exit0, cleanup0; kiểm logic/file POSIX bằng image Node22 pin digest, network none, read-only source. Không là VPS acceptance.
- [Full control340a4cba244d](../../../artifacts/roomqc-setup-backfill-cli-340a4cba244d-local-2026-10-28.json):640 tổng/638 pass/0 fail/0 cancelled/2 skip, exit0, cleanup0. Toàn bộ control tests gồm13 PostgreSQL core apply/CLI và5 batch/file unit mới. Hai skip giữ riêng: fixture symlink Windows và production notification POSIX modes. Linux14/14 của lượt này không thay kiểm notification bị skip.

Backend268 file, SHA256:

    2ab1e4848ee4b40b5c77e9caafe227e0e5ad6fa40ae71498a1f96d3394779ac2

Business migration hash580 file vẫn:

    77b385945e7b223a44a6ea98bb42ff19204aa5dd687fbbf317601c570c3b3b1d

Schema native trước/sau vẫn:

    553e8e5f781edcb188df30a1cd8174e099d8251bce7892cab6c547216c6965b3

## 4. Các tình huống mới đã kiểm

1. Sửa bytes report, giả signature, đổi target/role/source/scope/budget/group/fingerprint hoặc selected workspace bị từ chối. Manifest dư trường, trùng workspace, hơn100 dòng, cùng reader/writer role hoặc TTL quá24h không hợp lệ.
2. Windows ACL cho đúng user/SYSTEM đọc được; thêm Everyone-read bị chặn. POSIX private file đọc được, đổi0644 bị chặn. Tạo output lần hai giữ file cũ. Lỗi ban đầu do PowerShell Security module không load được: chuyển sang Windows ACL API qua .NET, không bỏ kiểm quyền.
3. CLI thật đọc report3 workspace: hai dispatch closed và một pending. HTTP fixture không có close; response từ receipt là missing, không tạo business data. Chữ ký thử được tạo trong test, private key không lưu hoặc in.
4. Wire proxy của fixture giữ response apply tới PostgreSQL ReadyForQuery sau commit rồi ngắt hai phía. CLI exit1 và chưa có dòng result, nhưng database có một command+waiting_owner đã commit. Chạy lại cùng batch lấy kết quả gốc, không thêm audit.
5. Lần chạy thứ hai xử lý tiếp dòng thứ hai rồi bị SIGKILL khi receipt dòng thứ ba đang chờ. Lần thứ ba dùng cùng signed manifest và output mới hoàn tất3 dòng. Lần thứ tư replay giữ nguyên cả command rows và đúng3 audit backfill; không có remote close.
6. stdout/output đã lọc không chứa password, token, tên owner hoặc tên hotel của fixture. File riêng và toàn bộ fixture được dọn sau kiểm; không dọn stack đang phục vụ.

## 5. Giới hạn và nhận tiếp

Đây là CLI local proof. Native run kiểm core applier/scanner/worker với Auth/REST thật; bài CLI end-to-end dùng HTTP receipt double và directory administrator seed. Chưa ghép hai run thành public signup API/worker/native CLI journey. SIGKILL là CLI process, chưa đủ tất cả cửa sổ D10 API/worker; Linux file check không thay Linux installer/UID/GID/key custody/TLS hoặc target rotation.

Native vẫn hai DB trên cùng PostgreSQL sandbox, chưa hai failure domain A/B. Advisor762 findings:43 no-policy INFO,7 FK INFO,513 unused-index INFO,199 permissive-policy WARN; catalog reviewedSafe=false và disposition quyền gián tiếp còn mở. Không dùng123 controls để ký thay.

Nhận tiếp **durable platform recheck4.4**: live session/capability support-reconcile, command/result contract riêng theo actor và workspace, routing/snapshot CAS, finite recovery budget, atomic receipt/audit/enqueue, GET outcome và UI/journal qua F5/lost response. Không tái dùng operator LOGIN receipt làm platform actor. Tiếp đó process-fault/public signup E2E, installer/T10, default-full/rebuild, VPS/backup/restore/A-B/web/Android/load/RC/pilot theo dependency.

70 ca vẫn not_run,122 release entries unverified và124 lượt môi trường chưa có actual/reviewer/signoff. Không đổi gate hoặc tuyên bố hoàn tất toàn bộ plan.
