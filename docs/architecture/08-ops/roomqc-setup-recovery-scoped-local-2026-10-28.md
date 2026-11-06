# T12 — credential và adapter phục hồi riêng, local 28/10/2026

## 1. Đã hoàn thành trong checkpoint này

Đã có đường phục hồi riêng gồm hai RPC trong schema `roomqc_setup`: `receipt` đọc binding và `close_dispatch` đối soát/đóng lần gửi. Role `roomqc_setup_recovery` không còn USAGE/CREATE ở public hoặc net, không được gọi hai RPC public cũ, không có quyền bảng/cột/sequence trong các application schemas được truy cập. Hai RPC mới kiểm credential tại database trước và sau thao tác.

Credential gắn với cụm và hash của đích kết nối/bản phát hành; có thời hạn tối đa một giờ, trạng thái thu hồi và thời điểm bắt đầu hiệu lực. Thu hồi một credential chặn JWT đó dù chữ ký và `exp` vẫn hợp lệ. Có thể cấp credential mới trong khoảng giao nhau rồi thu hồi credential cũ. Runtime không giữ khóa ký JWT, service-role hoặc phiên owner.

Adapter `server/control/setup-recovery.mjs` chỉ có `receipt` và `close`. Nó kiểm workspace/dispatch/target/release, đọc lại file credential mỗi lần gọi, xác thực hình dạng/thời hạn, gửi qua transport kiểm DNS/TLS/đích, timeout 5 giây, không redirect và giới hạn phản hồi. Phản hồi sai identity/binding không được dùng. Transport giữ bản sao tối thiểu, bất biến của inventory đã duyệt; không giữ cấu hình API có service key hoặc nhận thay đổi đích qua tham chiếu sau khi đã bind. Ca HTTP loopback thật đã kiểm cấu hình gốc bị thay đổi sau constructor. Local JWT parsing không thay kiểm chữ ký PostgREST hoặc kiểm trạng thái sống ở database.

**Đây chưa phải worker hoặc T12 hoàn chỉnh.** Chưa cấp credential vận hành, thay database phục vụ, bật worker/flag hoặc nghiệm thu VPS. Installer ký/cấp file và quyền filesystem thực tế vẫn cần hoàn thiện. [Artifact native đã lọc](../../../artifacts/roomqc-setup-recovery-scoped-7c8e154cda7f-local-2026-10-28.json) là bằng chứng checkpoint; [plan hiện hành](roomqc-vps-signup-next-delivery-2026-10-28.md) giữ toàn bộ phạm vi.

## 2. Schema và quyền

Migration CLI mới `20261028012429_setup_recovery_scoped_credentials.sql` chạy bằng role migration nghiệp vụ `postgres`. Nó giữ hash của 70 mục kiểm USAGE/CREATE public ở 35 role khác rồi thu hồi PUBLIC/direct recovery schema grants. Các role hiện có giữ hành vi trước đây, gồm Auth, service role và canary probe. Role SQL mới phải được cấp quyền schema tường minh; cập nhật extension/ACL phải kiểm lại. Không sửa 579 migration trước.

Hai bảng private có RLS và không grant cho browser/service/recovery:

- `setup_recovery_authority`: một binding cụm/target/release hiện hành, chỉ phiên bảo trì được thiết lập.
- `setup_recovery_credentials`: ID, binding, thời điểm hiệu lực/hết hạn/thu hồi. Không lưu token, khóa ký hoặc mật khẩu.

`private.assert_setup_recovery_credential` kiểm role đang được PostgREST sử dụng, issuer/audience/JTI, cluster/hash và bản ghi live. Hai wrapper SECURITY DEFINER có search_path rỗng, tham chiếu object đầy đủ và chỉ chạy guard → close/read đã có → guard. Guard giữ SHARE lock trên authority/credential đến hết transaction. Revocation commit phải chờ close đã được cho phép hoàn tất; sau khi revocation commit, lời gọi tiếp bị từ chối. Revocation không hoàn tác một tombstone đã commit. Hết hạn trong lúc chờ ghi journal làm guard cuối từ chối và rollback tombstone mới.

Inventory sau migration: 3.098 ordinary functions/procedures callable, gồm 3.085 pg_catalog, 11 information_schema và đúng 2 application RPC ở roomqc_setup. Public/net/other application schemas không còn callable cho role. Catalog vẫn `reviewedSafe=false`: chưa phải review toàn bộ aggregate/window/dynamic paths hoặc disposition mọi advisor. PostgreSQL built-ins còn callable không được đồng nhất với RPC đang expose; REST allowlist và permission phải được giữ khi triển khai.

## 3. Thứ tự triển khai bắt buộc

1. Dừng nhận mới/worker và drain writer theo cutover plan; xác nhận exact target, backup, source/schema/release và quyền phiên bảo trì. Không dùng secret từ HTTP body hoặc nâng quyền runtime.
2. Replay schema: migration net `20261028010321` dùng owner extension `supabase_admin` của bundle đã pin; migration credential `20261028012429` dùng `postgres`. Nối hai phiên này vào installer trước rollout thật.
3. **Sau khi schema tồn tại**, thêm `roomqc_setup` vào `PGRST_DB_SCHEMAS`, giữ các schema nghiệp vụ đã duyệt, rồi reload/recreate REST có kiểm readiness. Bật exposure trước migration làm PostgREST không nạp được schema cache.
4. Phiên bảo trì nhận binding từ inventory và release artifact đã phê duyệt, seed authority, thêm credential ID/TTL bằng DB clock, ký JWT ở installer riêng, xuất file private bằng atomic replace. Token phải mang role/issuer/audience/JTI/cluster/hash/thời hạn đúng contract trong mã. Không đưa khóa ký sang worker.
5. File runtime là JSON version1 với `clusterId`, `bindingSha256`, `publishableKey`, `token`; loader từ chối trường dư/owner/service/probe token hoặc đích khác. Linux kiểm UID/GID/mode; Windows ACL phải được installer kiểm, không suy luận từ Unix mode. Mount read-only và loại secret khỏi log/artifact.
6. Smoke đúng target: read/close hợp lệ, wrong binding/role, hết hạn, rotate overlap, revoke JWT còn hạn và khôi phục bằng credential mới. Kiểm schema/ACL sau upgrade và restart. Chỉ tăng replica sau khi T10 budget/readiness và các gate liên quan đủ.

Bước4–6 trên target thật là việc còn lại của installer/ops, chưa được chứng nhận chỉ từ fixture. Binding/release trong fixture được tạo riêng cho kiểm thử; không phải phê duyệt một bản phát hành hoặc VPS thực.

## 4. Kết quả kiểm thử đã quan sát

| Phần | Bằng chứng |
|---|---|
| Native run `7c8e154cda7f` | Terminal exit0, replay580 migration nghiệp vụ, 90/90 controls; Auth/PostgREST/PostgreSQL thật |
| Tương thích và nâng cấp | Rehearsal net và credential đều có injected fault22012 rồi rollback. Matrix net3.045 mục giữ hash; public70 mục giữ hash; schema/ACL/history rollback khớp |
| Quyền thực tế | Chỉ2 application RPC cho recovery; anonymous/owner/service không gọi wrapper được; unknown/missing JTI, issuer/cụm/binding sai và lifetime vượt record đều bị chặn |
| Rotation/revocation | Hai credential cùng hợp lệ trong overlap; thu hồi một ID chặn read/close JWT còn hạn, credential kia tiếp tục dùng được |
| In-flight | Bốn barrier protocol cũ và hai tình huống journal/credential thực: revoker bị block bởi close đang được phép; expiry trong lúc chờ journal làm rollback tombstone |
| Adapter thật | `SetupRecoveryGateway` gọi read/close qua gateway/REST thật bằng scoped credential; không dùng adapter remote giả trong nhóm kiểm này |
| Nghiệp vụ | 11 bảng business/trial/email/binding được so snapshot; 20 replay, close trước request muộn, terminate, mất response, owner hết phiên và receipt fault vẫn đạt |
| Unit | 16/16 pass, exit0, không skip: 6 bài credential/adapter, 10 bài setup-status; các bài có nhóm negative/race, không cộng thành native controls |
| Kết thúc | Source240 file và schema không đổi trước/sau; cleanup độc lập exact labels0 container/volume/network; hai protected artifacts giữ hash |

Backend source SHA256 `e95b1fa828b702e1dad810f0fdb91f59802a055adacd3967375848b308d451fb`; migration set `77b385945e7b223a44a6ea98bb42ff19204aa5dd687fbbf317601c570c3b3b1d`; schema trước/sau `553e8e5f781edcb188df30a1cd8174e099d8251bce7892cab6c547216c6965b3`. Native command vẫn là `node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-dispatch --advisors-cli <native-cli-2.122.0>`. Đây là diagnostic riêng, chưa chạy default full/rebuild ở source mới.

Advisors2.122.0:762 findings, gồm43 RLS-no-policy INFO,7 unindexed-FK INFO,513 unused-index INFO,199 permissive-policy WARN,0 ERROR. Hai INFO mới là bảng capability private chủ đích không có policy/grant cho runtime. Không đóng toàn bộ finding từ count hoặc native denial; review theo object còn trong kế hoạch.

Run lỗi `4a2dd0a91198` dừng ở startup trước migration0 vì exposure schema chưa tồn tại, exit1 và đã cleanup. Đã sửa thứ tự migrate→expose. Không đổi run lỗi thành pass; chỉ run7c8e154cda7f chứng minh source checkpoint này. Run6a5d069e3f7b trước đó cũng đạt90 native controls ở source trước khi siết snapshot transport, được giữ làm lịch sử và không thay proof source cuối. [Checkpoint net trước](roomqc-setup-recovery-boundary-local-2026-10-28.md) giữ source và lịch sử riêng.

## 5. Phần nhận tiếp

1. Worker/store directory: DB-clock claim/lease, fencing token, deadline/concurrency/retry hữu hạn; khóa workspace → job → dispatch khi settle, transaction ngắn, không giữ kết nối qua network. Kết quả worker chỉ settle bằng lease còn hiệu lực; sync API không ghi đè leased job.
2. Worker sử dụng adapter riêng này; readiness xác nhận file/target/release/quyền/budget. Chưa dùng `ClusterGateway` service-role của API hoặc owner JWT làm fallback.
3. Backfill dry-run/apply, legacy unknown cần review; durable admin recheck và UI đọc kết quả khi mất response/F5.
4. Installer cấp/rotate/revoke secret và exposure trên target thật; T10 vendor/DSN/rolling-overlap trước bật worker. Thêm schema/credential permission checks vào default suite và review nâng cấp/khách legacy.
5. Một run Auth→control→directory→business→receipt thật; default full và rebuild sau freeze, rồi Linux/TLS/offsite restore/web-Android/load/soak/RC/pilot theo dependency.

**70 ca nghiệm thu vẫn not_run,122 mục release unverified; reviewer/signoff/gates không đổi.** Chưa có worker đang vận hành hoặc chấp thuận signup production. Goal hoàn tất toàn bộ plan vẫn active.
