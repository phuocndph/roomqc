# T12 — worker đối soát đăng ký, local 28/10/2026

## 1. Kết quả bàn giao

Đã triển khai store, worker, cấu hình/runtime, kiểm ngân sách và Compose opt-in cho phục hồi dispatch đã lưu. Worker gọi adapter scoped thật, không giữ owner JWT hoặc service-role, không phát lại dữ liệu nhập khách sạn. Matching committed kích hoạt workspace đúng tenant/hotel một lần; matching closed mới đưa job sang waiting_owner. Busy và lỗi mạng giữ retry; sai identity/credential/release giữ kết quả an toàn hoặc needs_review.

Đây là checkpoint lập trình và bằng chứng local cho [kế hoạch toàn bộ VPS + signup](roomqc-vps-signup-next-delivery-2026-10-28.md), mục4.2/4.5. Chưa nghiệm thu toàn bộ T12 hoặc sản phẩm; chưa chạy worker trên VPS phục vụ. [Runbook](roomqc-setup-worker-runbook.md) ghi quyền, transition, khóa, cấu hình, rollout và rollback.

## 2. Thay đổi thực tế

| Phần | Cách xử lý |
|---|---|
| Directory migration0015 | Deadline mỗi job mặc định24h từ created_at; max_attempts mặc định8, bound1–30; journal mỗi attempt/token, trạng thái/kết quả/code không chứa session hoặc thông tin nhập |
| Runtime role | roomqc_control_setup_runtime chỉ history SELECT và hai SQL RPC claim/settle; không đọc/ghi bảng nghiệp vụ control trực tiếp. Chủ hàm NOLOGIN/NOINHERIT roomqc_control_setup_writer có grants cột hữu hạn, không có member |
| Claim | Shared advisory727001 → workspace SKIP LOCKED → job → dispatch → cluster FOR SHARE; token mới, attempt+audit+journal commit trước HTTP; không giữ kết nối qua network |
| Fencing | Settle đọc lại lease/token/attempt/deadline, owner/cluster/routing/hash/URL/credential-ref, release authority/key revocation. Kiểm DB clock sau audit; hết hạn rollback toàn bộ activation/terminal/job/journal/audit |
| Worker | Một tick tối đa concurrency job, không chồng tick; timeout/abort, backoff+jitter có trần; shutdown dừng claim và abort in-flight; crash để lease cho lần sau tiếp quản |
| Config/runtime | Exact shape, signed release/target, file-only secret, reload credential, HTTPS/TLS ngoài local, loopback livez/readyz8095, no-store/redacted; readiness kiểm quyền/history/signature/credential |
| Resource | assertProvisioningResources bind pool/replicas/max/reserve/other allocation với ngân sách chung. Example replicas vẫn0; template approval=null nên không thể bật bằng copy mặc định |
| Deploy | Profile setup-worker, non-root1000:1000/read-only/cap-drop/no published ports, bind/secret riêng và giới hạn CPU/RAM/PIDs. Mới render Compose, chưa triển khai Linux/VPS |

File chính: server/control/setup-worker-store.mjs; workers/setup-worker.mjs, setup-config.mjs, setup-runtime.mjs; migrations/0015-setup-recovery-worker.sql; resource-runtime.mjs. Kiểm thử nằm trong setup-worker-cases.mjs, setup-worker.test.mjs, setup-runtime.test.mjs và testing/setup-worker-native.mjs. 0001–0014 và580 migration nghiệp vụ giữ nội dung; không có migration nghiệp vụ mới.

## 3. Bằng chứng ở source cuối

| Lượt | Kết quả | Phạm vi thực |
|---|---|---|
| [Control regression b5fd87bf47ff](../../../artifacts/roomqc-setup-worker-b5fd87bf47ff-local-2026-10-28.json) | 609 tổng /607 pass /0 fail /2 skip;13/13 ca worker PostgreSQL;11/11 unit config/loop/runtime | Directory PostgreSQL16 và role riêng thật. Unit runtime dùng store double; ca loop directory ghi rõ remote double |
| [Native 35fff02ffce3](../../../artifacts/roomqc-setup-worker-native-35fff02ffce3-local-2026-10-28.json) | 580 migration nghiệp vụ +15 migration directory;107/107 controls, gồm17 worker;4 barrier protocol +2 tình huống credential và remote busy thật; exit0 | Auth/PostgREST/PostgreSQL, SetupRecoveryGateway, SetupWorkerStore/loop và hai runtime role thật cùng run |
| [Compose render](../../../artifacts/roomqc-setup-worker-compose-6dc09d957b26-local-2026-10-28.json) | exit0, read-only/non-root/no ports; template thiếu approval và example replicas0 giữ nguyên | docker compose config; chưa build/start image hoặc kiểm UID/mounts trên VPS |

Hai packet control/native cùng backend source **250 file**, SHA256 **d4b127798aa871db050a1d8ee9ebd3f8cbdfae30b9458cb631e25dcf60a518f4**. Migration set nghiệp vụ **77b385945e7b223a44a6ea98bb42ff19204aa5dd687fbbf317601c570c3b3b1d**; schema trước/sau **553e8e5f781edcb188df30a1cd8174e099d8251bce7892cab6c547216c6965b3**. Source và schema được đối chiếu trước/sau, không đổi giữa lúc chạy; cleanup exact labels độc lập0 container/volume/network ở cả hai run. Fixture directory có 11 role mới được dọn trước advisor; baseline/restored role count cùng36, hash được lưu trong packet.

Native directory và nghiệp vụ là hai database **trong cùng PostgreSQL sandbox**, chưa chứng minh hai host/failure domain. Directory/dispatch được seed bằng SQL quản trị, approval ký bằng fixture; Auth owner và RPC remote thật. Đây chưa là hành trình public control signup API → web/Android toàn tuyến hoặc phê duyệt target production. Phiên chuẩn bị directory dùng supabase_admin riêng; worker dùng LOGIN setup_runtime không có quyền quản trị.

Hai skip được giữ đúng lý do: Windows không cho tạo fixture symlink, và POSIX secret permissions cho booking notification cần Linux. Không quy đổi skip thành pass. Không có frontend thay đổi trong checkpoint; chưa có browser/Android E2E mới.

## 4. Các tình huống đã kiểm

| Tình huống | Expected/actual local |
|---|---|
| Hai worker tranh job, synchronous API trả muộn | Một claim; API không settle leased job; một activation/audit terminal |
| Lease cũ trả sau takeover | Token/attempt cũ settled=false, snapshot directory/audit không đổi; journal cũ lease_expired |
| Worker đóng dispatch chưa provision | Native close → waiting_owner, không tạo business data; owner RPC muộn bị tombstone chặn |
| Remote commit nhưng response chưa activate directory | Native loop lấy đúng receipt → active; tick lại không tăng tenant/hotel/trial/email |
| Remote đang giữ advisory lock | Native busy → retry, terminal chưa đóng; hết bận → proof closed |
| Owner/routing/URL/credential-ref/release hoặc signing key đổi | SQL từ chối stale settle; revoked release claim → needs_review, không activate |
| Receipt sai identity/hash/state, credential bị thu hồi | Invalid receipt SQL không ghi; adapter/reconciler review. Native revoked credential → needs_review, business snapshot không đổi |
| Fault job/journal/audit | Rollback toàn bộ kết quả. Native audit fault giữ lease, worker instance mới takeover và phục hồi cùng receipt |
| Lease hết hạn trong claim hoặc final audit wait | PostgreSQL barrier xác nhận rollback token/journal/audit hoặc activation/dispatch/job; không partial success |
| Timeout, ignored abort, shutdown, overlapping tick | Unit xác nhận giới hạn thời gian, một settle, bỏ phản hồi muộn, không claim mới sau stop; không giữ raw lỗi/secret trong event |

Dữ liệu so sánh native gồm11 bảng business/trial/email/binding; journal tombstone theo protocol là tác động được phép và kiểm riêng. Các kiểm kill ở đây gồm mô phỏng lease bị bỏ dở, takeover và worker instance mới; **chưa có SIGKILL tiến trình thật tại đủ các cửa sổ D10**.

## 5. Lịch sử lỗi và advisor

[ec58ccd99ff8](../../../artifacts/roomqc-setup-worker-ec58ccd99ff8-local-2026-10-28.json) thất bại10 ca do alias a của release SQL trùng biến attempt. Đã đổi alias; [d07fab2cf8c6](../../../artifacts/roomqc-setup-worker-d07fab2cf8c6-local-2026-10-28.json) đạt13/13 và các regression sau đạt. [18bb6a891a21](../../../artifacts/roomqc-setup-worker-18bb6a891a21-local-2026-10-28.json) và [167904699c4e](../../../artifacts/roomqc-setup-worker-167904699c4e-local-2026-10-28.json) là các source lịch sử, không thay packet cuối.

[Native7aaa82ab3285](../../../artifacts/roomqc-setup-worker-native-7aaa82ab3285-local-2026-10-28.json) đạt107 controls, nhưng directory fixture để role tồn tại tới khi cleanup toàn sandbox, khiến advisor có922 findings/359 permissive-policy WARN. Đã thêm cleanup chính xác các role mới và so baseline. [Nativeeeebff9e2ad5](../../../artifacts/roomqc-setup-worker-native-eeebff9e2ad5-local-2026-10-28.json) exit1 vì biến result của fixture che biến packet và gây TypeError; giữ nguyên là lượt thất bại. Đã đổi tên biến; packet cuối xác nhận source và cleanup mới. Các lượt lỗi đều đã cleanup Docker0, không đổi thành pass.

Advisors CLI2.122.0 ở source cuối: **762 findings**,43 RLS-no-policy INFO,7 unindexed-FK INFO,513 unused-index INFO,199 permissive-policy WARN,0 ERROR. Recovery catalog vẫn3.098 ordinary functions gồm2 application wrappers, public/net không USAGE, không app table/column/sequence grants; **reviewedSafe=false**. Cần disposition aggregate/window/dynamic/transitive và từng finding; số0 ERROR không đóng audit.

## 6. Việc tiếp theo và tiêu chí nhận

1. **Backfill mục4.3:** dry-run dataset active/committed/pending/closed/legacy/conflict/unavailable; kiểm upgrade14→15 có job cũ queued/leased, apply batch expected version + audit, rerun idempotent và không reset trial. Legacy unknown giữ manual review; không suy receipt missing là chưa từng provision.
2. **Durable recheck mục4.4:** contract/API/job/audit idempotent, platform authority live, UI chi tiết→Kiểm tra lại→kết quả bền vững khi F5/mất response. Worker hiện không tự requeue needs_review hoặc giả owner.
3. **Process fault và tích hợp:** SIGKILL sau claim/trước call/sau receipt/trước ack, restart process và directory, then control signup API/session thật→worker→remote→status; browser/Android A/B. Các packet hiện chưa khép A07/D07–D11 ở mọi môi trường gốc.
4. **Installer/T10:** signing-key custody, cấp/rotate/revoke secret target thật, Linux UID/GID/Windows ACL, phiên maintenance owner extension; consumer DSN/budget/vendor/rolling-overlap/quota. Chỉ sau gate mới tăng replicas/bật dispatch trên target.
5. **Gate cuối:** full-native default và independent rebuild trên candidate freeze; Linux/TLS, backup ngoài host/restore host sạch, on-call, tải/soak/RC/pilot≥7ngày theo dependency của plan toàn bộ.

**8 đợt /25 task /27 gói /70 ca not_run /122 mục release unverified; reviewer/signoff/gates giữ nguyên.** Chưa cấp credential vận hành, migrate database phục vụ hoặc bật worker/dispatch production. Goal hoàn thành toàn bộ plan vẫn active.
