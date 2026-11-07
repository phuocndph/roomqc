# RoomQC — worker đọc khóa qua mount chỉ đọc và reload khi đang chạy

Ngày29/10/2026. Phần BG02-05, hỗ trợ R02/R08/R09/R10/R12; diagnostic local, chưa nhận toàn BG02 hoặc mở gate sản phẩm.

## Kết quả đã kiểm

[Packet run57bad49c6aea](../../../artifacts/roomqc-setup-runtime-mount-57bad49c6aea-local-2026-10-29.json) đạt **27/27 kiểm native**, gồm21 kiểm worker và6 kiểm nền installer. Command kết thúc exit0;9 process CLI issuer/installer và1 container worker thật đều có witness UID/GID10001, CapEff0, no-new-privileges. Producer chuẩn bị fixture chạy UID0 riêng, không được tính là process sản phẩm không đặc quyền.

Nguồn integration **313 tệp**, SHA256 `d17734a0a3c1076f8ef2de2e8913494af85be9126863e898e642804119eb374a`;585 migration nghiệp vụ/19 directory. Nguồn đầu–cuối khớp; schema đầu–cuối `58ab6ef3183167e27a5107ae46cebbf7e5759569d4360ac2b1c81d78e93eafde`. Bộ hồi quy chịu ảnh hưởng có49 kiểm: **48 pass,0 fail,1 skip**. Skip là bài monitoring renderer/Compose opt-in, không được nhận từ lượt này.

| Bài thử thực tế | Kết quả và giới hạn |
|---|---|
| Container và quyền | Worker chạy entrypoint sản phẩm, source/input/output directory read-only; thử ghi thực nhận EROFS. Không đọc được signer, DSN issuer và file journal fixture tồn tại ở private root của producer. Worker có DSN directory hạn quyền riêng |
| Đường thành công | Worker dùng native REST và PostgreSQL, claim/settle job thật bằng LOGIN riêng CONNECTION LIMIT1; closed-dispatch thành `waiting_owner`, một attempt và một tombstone |
| Thay file đang chạy | Issuer CLI thay credential qua rename; inode đổi, worker đọc khóa mới và xử lý job tiếp. Container ID/StartedAt giữ nguyên, RestartCount0 |
| Hết overlap | Quan sát retirement bằng clock_timestamp của DB; RPC bằng khóa cũ bị403, khóa mới còn dùng được; không có rotator chạy để cưỡng chế cutoff |
| Lỗi file/binding | Missing, unreadable, malformed, wrong cluster, wrong issuer: readiness đóng; job,attempt,deadline,history trước–sau giữ nguyên trong cửa sổ pre-batch bị chặn. Phục hồi rồi mỗi job được xử lý đúng một lần |
| RPC unavailable | Relay fixture chuyển tiếp native request/response bình thường; lúc fault đóng socket thật. Worker đóng readiness và không tiêu thụ job; khi mở lại tiếp tục cùng container |
| Hết hạn | Chờ expiry thật theo DB, không sửa token để giả hết hạn. Native RPC trả403, queued job giữ nguyên; manual issuer recovery theo protocol làm worker hoạt động lại |
| Revoke còn hạn | Installer CLI revoke live head khi file còn hạn. Native RPC và readiness từ chối; job giữ nguyên; explicit manual issue mới khôi phục mà không restart |
| Shutdown và cleanup | Producer yêu cầu SIGTERM, chờ HTTP ngừng và session worker về0 trước drop fixture DB. Consumer exit0;24 role fixture và private root đã dọn. Outer harness dọn15 objects; kiểm độc lập còn0 container/volume/network đúng label run |

Các job positive dùng owner UUID fixture và closed-dispatch tombstone để không tạo dữ liệu khách sạn;11 bảng nghiệp vụ được snapshot và giữ nguyên. Đây **không phải** owner signup/hotel active E2E. Readiness là kiểm trước batch; không suy thành thu hồi actor nguyên tử xuyên Auth/directory/business DB.

## Thay đổi đã thực hiện

- [Outer sandbox](../../../scripts/test-control-backend-sandbox.mjs) có diagnostic `setup-runtime-mount`; mọi source/ownership/migration/final-schema checks vẫn áp dụng. Nhánh này không làm diagnostic thành full-build reference.
- [Container helper](../../../scripts/control-backend-setup-mount.mjs) tạo input/output volumes sở hữu riêng; source snapshot công khai và dependency mounts chỉ đọc; consumer không có private inputs của issuer. Kiểm container identity, StartedAt, RestartCount, exit và mount flags sau run.
- [Native fixture](../../../server/control/testing/setup-runtime-mount-native.mjs) thử cả positive,negative,recovery và expiry DB; không thay gateway/store của worker bằng mock. [Preload observer](../../../server/control/testing/setup-runtime-mount-preload.mjs) chỉ chứng kiến UID/capability/mount và chuyển tín hiệu dừng tới entrypoint thật.
- [Installer fixture](../../../server/control/testing/setup-installer-native.mjs) dùng issuer/installer/observer/worker LOGIN riêng, budget worker1 replica/pool1 trong bản fixture; chỉ đổi output sang volume khi chọn diagnostic mới. Không đổi schema hoặc cấu hình vận hành.

Lệnh tái hiện sau khi khóa candidate:

```powershell
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-runtime-mount
```

Lệnh dựng backend disposable và nạp585 migration, mất vài phút; phần expiry cần chờ đồng hồ DB. Không dùng DB đang vận hành để rút thời gian. Secret chỉ nằm trong private fixture và named volumes thuộc run; packet công khai chỉ giữ identity/hash/result đã lọc.

## Lần chạy lỗi đã giữ lại

Run`d764bdb09f04`, source313/hash`6a2577a0e815c4ad126242b522b4c0910ac05531087dfa65771e606b5c4378c0`, exit1 vì fixture dùng email_hash cố định, vi phạm `workspaces_live_email_idx`/SQLSTATE23505. Sửa fixture sinh hash riêng theo workspace; không đổi ràng buộc sản phẩm. Run lỗi đã cleanup và không được tính là pass. Packet thành công dẫn ownership ref và phân loại của run này.

## Phần tiếp theo

1. Review phạm vi R09/R10 local và packet; profile compose UID1000, Linux VPS thật, ACL và volume thật vẫn cần BG07.
2. Khép các cửa sổ SIGTERM trước dispatch, race/journal/publication còn thiếu theo [BG02-R03–R08/R12](roomqc-vps-signup-master-acceptance-2026-10-28.md#10-bài-kiểm-chi-tiết-cho-bg02); không dùng packet mount thay packet periodic khác source.
3. Tách credential service khỏi quyền actor; chốt và kiểm mốc revoke xuyên Auth/directory/business DB ở R11.
4. Tiếp BG03–BG11: tài nguyên/gói,signup/email,console,candidate tích hợp,VPS/DR,E2E web/Android,tải/chi phí,RC và pilot≥7ngày.

Giữ nguyên8đợt/25task/27gói/70ca/124lượt;122 release items unverified, actual/reviewer/signoff và L/S/P/U/B chưa đổi. Native diagnostic này không chứng minh staging,full fault matrix,offsite restore,capacity hoặc production readiness.
