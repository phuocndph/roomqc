# T12 — dispatch/job và API cấp phát, kiểm thử local 28/10/2026

## 1. Kết quả

Đã nối control POST → directory dispatch + job → fenced RPC adapter → atomic
activation/job settlement. Hai API nhận cùng yêu cầu chỉ phát một mutation.
API chết hoặc mất response sau remote commit có thể bootstrap/đối soát cùng
dispatch, không tạo lại business data. Đây là triển khai local tiếp sau
[protocol database](roomqc-setup-dispatch-local-2026-10-28.md).

[Artifact run 5de3cffd4d60](../../../artifacts/roomqc-setup-dispatch-api-5de3cffd4d60-local-2026-10-28.json)
ghi 25/25 backend, 13/13 HTTP + PostgreSQL, 43/43 frontend; TypeScript/lint exit 0;
hồi quy directory 578 tổng / 576 pass / 0 fail / 2 skip. Source 237 file cùng
18 file frontend/config/orchestrator không đổi. Các số kiểm có chồng nhau,
không cộng thành tổng ca nghiệm thu sản phẩm.

**Chưa hoàn tất T12.** Worker nền, backfill/recheck, credential recovery và
runtime/cutover vẫn còn mở. Cờ `ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED` mặc định
false; chưa bật hoặc chuyển đổi database đang phục vụ. Không có fallback POST
sang provisioning cũ khi đường mới tắt hoặc mất kết nối.

## 2. Thay đổi và hành vi

| Tình huống | Hành vi đã nối |
|---|---|
| Bắt đầu | Một transaction kiểm owner/email/binding/routing/admission, ghi journal + job + owner/no-expiry + audit trước network |
| Gửi trùng | Cùng payload đang pending trả 202/Retry-After, chỉ đọc tiến độ; payload khác trả conflict, không mutation mới |
| Payload | JSON theo thứ tự field cố định, hash đúng byte; chỉ business fields, slug do server; không lưu nội dung form/JWT/password trong job/journal |
| Directory lỗi trước commit | Rollback dispatch/job/owner/audit; không có remote call |
| Remote trả committed | Đúng dispatch/workspace/owner/cluster/routing/hash và tenant/hotel mới settle cùng transaction với active + audit |
| Remote trả closed | Job thành waiting_owner; lần gửi đã đóng bất biến. Chỉ proof này mới cho tạo dispatch mới sau đó |
| Mất response sau commit | Bootstrap đọc receipt thật theo adapter, gọi close RPC theo dispatch và settle; không phát provision lần nữa |
| Job leased hoặc routing/owner đổi | Phản hồi đồng bộ cũ bị chặn; không ghi đè worker hoặc activate mapping cũ |
| Lỗi lịch sử đến muộn | Ghi attempt, không thay workspace/job của đăng ký đã áp dụng dispatch |
| Legacy chưa rõ kết quả | Không tự cấp lại; cần backfill/đối soát. Generic activate và beginProvision cũ bị chặn trên workspace đã áp dụng |
| 202 trên onboarding | Giữ form, đọc lại tiến độ, chặn gửi lặp; không báo đăng ký thất bại hoặc redirect như đã thành công |

Directory migration `0014-setup-dispatch-journal.sql` thêm journal identity
bất biến và FK ghép dispatch/workspace/routing từ job. Grant runtime không cho
đổi identity hoặc xóa journal; trigger giữ terminal evidence bất biến. Migrations
0001–0013 giữ checksum. Migration này không sửa database Supabase/nghiệp vụ.

File chính: `server/control/setup-dispatch.mjs`, `provisioning.mjs`, `store.mjs`,
`app.mjs`, `cluster.mjs`, `config.mjs`, contract OpenAPI và onboarding. Control
REST vẫn 24 operation: 8 foundation / 12 local / 3 planned / 1 partial. POST bổ
sung response 202 và schema ProvisionPending, không thêm operation.

API close adapter hiện dùng credential của control API. **Chưa phải adapter
hay credential giới hạn quyền của worker**; không dùng nó để lách phần rà PUBLIC
RPC/SECURITY DEFINER và cấp credential recovery còn thiếu.

## 3. Kiểm thử và giới hạn bằng chứng

Chạy lại từ integration:

```powershell
node scripts/test-control-setup-dispatch.mjs --directory-regression
```

Các fixture có ownership và cleanup; không dùng DB đang phục vụ. PostgreSQL
directory và HTTP loopback là thật, gồm hai API với hai store/pool riêng, runtime
login thuộc nhóm roomqc_control_api. **Auth và remote receipt/RPC là doubles**
trong packet này. Protocol remote có proof Auth/REST/PG thật riêng trên 578
migration không đổi; hai packet chưa thay bằng chứng tích hợp toàn tuyến trong
một run. Frontend là jsdom và mock native transport, chưa phải E2E thiết bị.

13 ca PG gồm 11 ca T12 và 2 ca T11: tranh 20 POST; rollback job insert; response
mất rồi API restart; fault audit sau activation; closed→fresh dispatch; identity,
routing, owner và lease denial; flag tắt/legacy unknown; DB grant/FK/immutability;
drain admission; late error; needs_review/unproven waiting_owner. Đối soát effects
trước/sau bằng query độc lập trong database riêng.

Hồi quy có hai skip được giữ rõ: Windows không cho tạo file symlink của fixture;
kiểm mode file notification production cần Linux. Không ký thay hai kiểm này.

Lịch sử: scoped run c41e752c4d70 đạt trước hai guard cuối. Hồi quy toàn bộ đầu
tiên exit 1: 573 pass / 1 fail / 2 skip tại đối chiếu RAM; chạy giám sát riêng
không sửa source đạt 1/1. Sau đó đã đổi bài RAM sang một OS observation window
chứa scrape mới, giữ dung sai 5%, ghi range/timestamp để kiểm tra. Lượt 5de3cffd4d60
chạy lại toàn bộ trên source mới đạt 576 pass / 0 fail / 2 skip; không lấy lượt
riêng để đổi kết quả full run cũ thành pass.

Backend SHA256 `e2fbaba389413c0c962c6361c4e79e89ef7f228bc10a83af7dc7e081a6209304`.
Artifact giữ manifest/hash, lệnh, thời gian, terminal, skip và ranh giới adapter.
Docker của scoped run đã còn 0 container/volume/network; kiểm bổ sung label
directory và monitoring được ghi trong packet. Không coi directory regression
là full-native Supabase backend/rebuild của release candidate.

## 4. Cutover và nghiệm thu

Giữ flag false đến khi directory 0014, protocol remote, worker/credential và fault
proof tích hợp đã đủ. Đóng nhận dispatch mới và drain RPC cũ trước khi áp dụng
migration/giao thức; xác nhận release/schema/resource budget rồi mới bật có
kiểm soát. Receipt recovery của dispatch đã gửi vẫn chạy khi flag tạo mới tắt.

Rollback ứng dụng giữ journal/tombstone và job; không drop bảng, xóa receipt
hoặc quay lại entry cũ trên workspace đã áp dụng. Lỗi unknown giữ đối soát,
không cho nút tạo khách sạn lại. Chưa thực hiện cutover/rollback trên VPS thật.

70 ca worksheet vẫn not_run, 122 mục release unverified; gates/reviewer/signoff
giữ nguyên. T10.b, T11 live resume, T12 và VPS chưa được nghiệm thu toàn phần.

## 5. Đầu việc nhận tiếp

| Thứ tự / vai trò | Việc và file liên quan | Đầu ra, điều kiện nhận |
|---|---|---|
| 1 / BE+QA | Rà catalog callable PUBLIC/SECURITY DEFINER cho recovery role trên đủ schema; gateway/config riêng cho worker | Không có đường tạo business data/đọc nhạy cảm gián tiếp. Secret file, TTL/rotation/revocation rõ; không dùng service-role fallback hoặc JWT owner |
| 2 / BE+QA | Worker/store claim, lease, settle theo DB clock; `setup-dispatch.mjs`, jobs và worker mới | Bounded batch/concurrency/attempt/backoff/deadline; busy/unavailable→retry; closed→waiting_owner; matching committed→atomic active+job. Hai worker, lease hết hạn, stale token/routing/owner và kill windows có effects proof |
| 3 / BE+FE+QA | `support.mjs`, admin contract/client và trang Đăng ký mới | Backfill dry-run/count/classification rồi apply theo version; recheck có key/reason/authority, enqueue idempotent và theo dõi job; không impersonate hoặc tạo tenant thay chủ |
| 4 / BE+OPS+QA | resource-runtime, Compose/secrets, T10.b vendor/DSN binding | Provisioning worker hiện replicas=0; chỉ bật sau cùng budget/rolling-overlap/role/secret/readiness. Linux thiếu đầu vào ghi backlog, không tự mở đường dùng thật |
| 5 / BE+FE+QA | Full-backend harness, signup/onboarding, browser/Android | Auth→control→directory→RPC→business→receipt→active một run thật, response-loss/kill/reload/relogin/callback. Freeze candidate rồi full-default + independent rebuild; D07–D11/A07 đúng môi trường mới đề nghị nghiệm thu |

Tiếp theo giữ [plan tổng](roomqc-vps-signup-plan-current-2026-10-26.md) và
[T01–T25](roomqc-vps-signup-detailed-delivery-2026-10-26.md), không giao lại
atomic dispatch/job/API như chưa triển khai. VPS/DNS/TLS, inbox provider, offsite
restore/key, người trực, A/B, tải/soak và pilot ≥7 ngày vẫn cần bằng chứng riêng.
