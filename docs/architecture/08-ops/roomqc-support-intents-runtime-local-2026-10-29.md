# RoomQC — tích hợp nhật ký lệnh và phục hồi local

Ngày: 29/10/2026. Phạm vi người dùng xác nhận: **toàn bộ VPS + signup; plan + nghiệm thu**. Đây là checkpoint thành phần trong BG02, chưa nhận R11/BG02 hoặc sản phẩm. [Kế hoạch để nhận việc](roomqc-vps-signup-execution-dossier-2026-10-29.md), [nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md#125-nghiệm-thu-phục-hồi-cùng-mã-lệnh-và-legacy-replay), [packet](../../../artifacts/roomqc-support-intents-runtime-b3e1f84b1812-local-2026-10-29.json).

## 1. Kết quả và phạm vi

Đã nối coordinator bền vững vào admin execute/register, alert acknowledgement và setup recheck. Lệnh gốc giữ nguyên actor, authority, operation, target, key và payload hash. Intent được commit trước khi gọi Auth; effect, audit, consumption và result commit cùng nhau. Khi kết quả đã commit, replay không xin biên nhận mới để thực hiện lại. Legacy reconcile/store.activate vẫn cần chuyển sang giao thức này.

Native run `b3e1f84b1812` đạt **113/113 controls**, 34 barrier witnesses và 3 lần SIGKILL API; exit0. Đây là số kiểm cơ chế, không phải 113 hành trình khách hàng. Bài mới dùng Auth/PostgREST/HTTP/PostgreSQL thật và API LOGIN riêng; không thay receipt/expiry bằng double. Proof phục hồi mới chỉ áp cho cluster command `close_admission`:

- Mất phản hồi sau Auth commit: giữ một intent bền vững, chưa có directory effect; cùng key đổi body bị từ chối.
- SIGKILL API, chứng kiến receipt hết hạn bằng canonical DB clock rồi gửi 8 HTTP retries đồng thời: một generation phục hồi có predecessor, một final command/effect/audit/consumption/result; biên nhận cũ bất biến.
- Mất HTTP response sau directory commit rồi SIGKILL: GET result và POST replay trả original command, không tạo acceptance hoặc generation mới.
- Gỡ quyền sau Auth orphan: từ chối recovery, không thêm generation/effect. Session đã hết hiệu lực cũng không được nhận vòng phục hồi mới.

Lệnh chính xác đã được Auth nhận trước revoke có thể hoàn tất trong cửa sổ handoff gốc tối đa5 giây; command mới và đọc/replay vẫn cần quyền hiện hành. Không có transaction nguyên tử chung giữa Auth và directory. Journal identity không thay operational writer fencing khi restore host.

## 2. Nguồn và kết quả kiểm tra

Algorithm `sha256-path-lf-v1`; cả hai source dưới đây có334 tệp. Business587/directory21 migrations, không sửa checksum migration0021 đã công bố.

| Run / lát kiểm | Exact source / kết quả | Giới hạn |
|---|---|---|
| Native `b3e1f84b1812` | `243567b958546ba259948a97e7f4ac4c686d52b4c701c625b27ed0cabed8f446`;113/113,exit0 | Diagnostic Auth/HTTP/SQL; chưa full-default/rebuild, populated upgrade hoặc staging |
| Control r2 | Cùng source243567;730 total,529 pass,0 fail,201 skip;exit0 | Skip không là pass; không thay directory DB hoặc hành trình UI |
| Directory r2 | Cùng source243567;169 total,168 pass,1 fail;exit1 | Failure ở expected số lượt callback trong một test HTTP; test mong18 trong khi replay qua API đọc trước chỉ cần2 lượt nên actual14 |
| Focused directory r3 | `6d7d491550eb9258865a2fa26eeae0a0e0934f7a8a5a2e6e8455da0ce24a8dac`;1/1,exit0 | Đã sửa đúng ba assertion/comment của test HTTP và kiểm lại test đó. Chưa có full169/169 trên exact source mới này; không cộng hai run thành một full pass |

Source hiện hành6d7d khác source native243567 **chỉ ở `server/control/admin-cases.mjs`**: expected callback của replay/restart/denial và comment; runtime, migration và native harness byte-equivalent theo LF. Packet kiểm delta bằng snapshot native và full source manifests. Không tự chuyển full-run proof sang source mới hoặc coi đây là final candidate BG06.

Preflight19/19 unit/contract đã kiểm canonical expiry mapping: chỉ exact RPC/SQLSTATE55000/message cho phép recovery; generic503, scope mismatch, malformed error,401/403 và transport failure không mở vòng mới. Decode `session_id` chỉ dùng binding, không cấp quyền nếu live authority RPC từ chối.

Native schema trước/sau khớp; hash và snapshot gốc được ghi trong packet từ state của run.

## 3. Failure history và khắc phục

- Native r1 `0d3f911b3f01`,exit1: expected cũ23505 cho receipt của attempt khác. Migration0021 nay fence attempt sai trước UNIQUE, thực tế42501/`SUPPORT_INTENT_ATTEMPT_FENCED`. Giữ test duplicate nguyên receipt23505; bổ sung expected chính xác cho attempt sai, không nới quyền/constraint hoặc cho phép receipt thứ hai.
- Directory r1:168/169,exit1; callback expected7 nhưng luồng durable mới có10. Directory r2 sửa đầu vào đó nhưng tính nhầm replay thành18; actual14 do API trả receipt trước coordinator. Đã đọc lại `app.mjs`, giữ hai ranh giới kiểm quyền của replay, sửa ba absolute counts và chạy focused r3 đạt1/1. Assertions một command/event, result sau restart và revoked denial giữ nguyên.

Mọi log thất bại giữ riêng trong `.local/`; packet chỉ phát hành hash, code đã lọc, scope và refs. Các DB/container là fixture riêng, không chạy migration/reset trên database phục vụ. Cleanup kiểm độc lập theo exact labels; directory roles đã phục hồi. Advisor native:809 findings, gồm247WARN `multiple_permissive_policies`; disposition security rộng còn mở.

## 4. Phần nhận tiếp và nghiệm thu

1. **RF06 legacy:** stable intent/key trước POST của CLI; server nhận key riêng requestId; cùng coordinator, scoped result lookup và một support action xuyên restart/response loss. Rà caller thực tế trước tạo giao diện mới; hiện tìm được CLI/test callers, chưa tìm thấy web caller của legacy route trong `src/`.
2. **RF05/07:** native expired/commit-loss/revoke recovery cho register, alert ack, recheck và legacy; hai API process độc lập, writer cũ/late reply, poolMax1 và disconnect windows. Native8retries hiện tại dùng một API process, không thay bài hai process.
3. **RF08:** populated business585/586→587, directory20→21 với command cũ, orphan/unknown/revoked state; app rollback tương thích hoặc mutation đóng/read-only. Không tạo receipt giả cho dữ liệu lịch sử.
4. Worker owner/service claim→RPC→business commit→settle: revoke/lease expiry/two workers/late reply; một tenant/hotel/trial. Review writer/role/trigger/definer graph và advisor disposition.
5. Khép R11/BG02 theo reviewer, rồi BG03 tài nguyên/admission/quota → BG04 signup/BG05 consoles → BG06 candidate full-default+independent rebuild → Linux staging/offsite DR → A/B web/Android → tải/chi phí/RC → pilot≥7 ngày.

Mỗi phiếu có expected/fault/effects/cleanup tại RF01–RF09 và RX01–RX12. Các subchecks không tăng25 task/27 package/70 ca/124 lượt. Ba tệp ledger/worksheet/matrix được giữ byte-identical; actual/reviewer/signoff và L/S/P/U/B không thay đổi. Phần cần VPS, DNS, Resend, offsite key hoặc người trực tiếp tục ghi đúng input đang chờ tại mục9 dossier.
