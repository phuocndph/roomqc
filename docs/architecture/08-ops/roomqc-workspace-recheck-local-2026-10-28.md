# RoomQC — kiểm tra lại đăng ký bền vững, checkpoint local

Ngày 28/10/2026. Thuộc T02/T03/T04/T12/T16 của [kế hoạch toàn VPS + signup](roomqc-vps-signup-master-plan-2026-10-28.md). Đây là bàn giao code và bằng chứng local có phạm vi; **chưa nghiệm thu cả T12 hoặc sản phẩm trên VPS**.

## 1. Kết quả và giới hạn bằng chứng

| Packet | Kết quả đã chạy | Phạm vi thực tế |
|---|---|---|
| [Control `97692c70846d`](../../../artifacts/roomqc-workspace-recheck-97692c70846d-local-2026-10-28.json) | 656 tổng, 654 pass, 0 fail, 2 skip; 16 ca recheck đạt; terminal exit0 | PostgreSQL disposable, API LOGIN, HTTP thật, migration/upgrade/race/atomic rollback; Auth authority và remote receipt là fixtures |
| [Native `199db27bff23`](../../../artifacts/roomqc-workspace-recheck-native-199db27bff23-local-2026-10-28.json) | 580 business + 18 directory migrations; 123/123 controls, 4 protocol barriers; terminal exit0 | Hồi quy nền Auth/PostgREST/PostgreSQL, worker/reader/writer với role thật sau migration18. **Không chạy platform recheck API với live Auth** |
| [Frontend `53e4109dfa35`](../../../artifacts/roomqc-workspace-recheck-frontend-53e4109dfa35-local-2026-10-28.json) | 66/66 tests; TypeScript và lint exit0; 14 file source/test không đổi trong run | Client, journal, hook, component, regression console và Capacitor HTTP mock; chưa browser hoặc Android E2E |

Backend của hai packet đầu khớp **272 files**, SHA256 `fd4a4e833863d46b7454d2550eadefc9fa62a4f51d580b72471d10e59e77a9df`. Hai bài skip do quyền tạo symlink của Windows và kiểm POSIX file mode dành cho Linux; không phải recheck test bị bỏ. Frontend packet ghi phạm vi file riêng, không tự chứng minh toàn bộ frontend dependency graph đã freeze.

Docker cleanup độc lập theo nhãn sở hữu của cả hai run: **0 container, 0 volume, 0 network**. Không migrate database phục vụ, cấp credential vận hành, apply backfill dữ liệu thật hoặc bật signup/dispatch/worker. Worker example vẫn replicas0. Advisor native còn **762 findings / 199 WARN**, catalog `reviewedSafe=false`; chưa được disposition toàn bộ.

## 2. Hành vi đã triển khai

Quản trị mở **Đăng ký mới → chi tiết → Kiểm tra lại → nhập lý do → xác nhận**. Danh sách có đường mở lại đăng ký đang giữ yêu cầu chưa xác định kết quả. Nút bị khóa khi không có fingerprint, quyền hoặc trạng thái phù hợp.

POST `/api/control/admin/workspaces/{id}/recheck` nhận `Idempotency-Key` UUID và body riêng: `expectedVersion`, `expectedSnapshotSha256`, `reason` (5–1.000 ký tự). GET `/api/control/admin/workspaces/{id}/recheck-result` dùng key gốc trong header, không nhận query. Cả hai kiểm live support authority, scope actor + authority-cluster + workspace và trả no-store.

Kết quả command `succeeded` xác nhận quyết định đối soát đã lưu, không đồng nghĩa workspace đã active:

| Outcome | Ý nghĩa |
|---|---|
| queued / reused_job / running | Đã xếp lịch, dùng lại job hoặc đang giữ lease; HTTP202, UI tiếp tục theo dõi trạng thái |
| activated / verified_active | Có proof khớp để cập nhật hoặc xác nhận active; HTTP200 |
| waiting_owner | Có terminal proof closed và không có receipt mâu thuẫn; owner cần tiếp tục thiết lập |
| needs_review / unavailable | Cần kiểm lịch sử hoặc chưa đọc được kết quả tin cậy; không provision lại |

Detail đọc workspace/job/timeline/fingerprint trong cùng `REPEATABLE READ READ ONLY` snapshot, nhả connection trước remote receipt. Client chỉ nhận receipt khớp key/target/version. Receipt tổng quát có thể hiện “đã xác minh” khi directory còn provisioning và chưa gắn tenant/hotel; điều này không tự đổi workspace thành active.

Journal trình duyệt có namespace recheck riêng, scope runtime/actor/authority. Intent/key/payload phải lưu và đọc lại được trước POST. Sau F5/mất response, tra GET trước; 404 giữ outcome unknown, chỉ cho gửi lại cùng key/payload sau một lần tra cứu nữa. Chỉ rejection CAS/not-found xác định dưới khóa mới được ghi not_applied. Đổi phiên/cụm/epoch, logout hoặc response muộn không áp kết quả sang identity mới.

## 3. Transaction, quyền và recovery budget

Replay đã commit được đọc trước snapshot/remote access; request cạnh tranh vẫn khóa cùng command rồi kiểm replay trước definitive CAS rejection. Thứ tự khóa: release727001 shared → command727005 → workspace → ordered jobs → ordered dispatches → cluster. Remote observation và Auth checks có timeout5s; observation phải còn mới sau khi chờ khóa. Mutation, command, cycle/event và audit commit cùng transaction; final release/config/clock fences có thể rollback toàn bộ.

Giữ lease/job live đủ điều kiện và attempts/deadline cũ. Một dispatch chỉ có **một recovery cycle mới**, tối đa **3 attempts trong 15 phút**; không mở cycle tiếp để gia hạn vô hạn. Job cũ được giữ nguyên history, attempt và deadline; succeeded/cancelled không bị mở lại. Recheck không gọi provision, không đổi owner/cluster, không reset trial hoặc tạo dispatch thay owner.

**Ranh giới còn mở:** các lần kiểm Auth là live RPC có giới hạn thời gian. Chưa có epoch/fencing hoặc protocol thu hồi quyền atomic xuyên Auth và directory. Không tuyên bố revoke tức thời trên hai database chỉ từ các bài fixture. T03/T08 và kiểm tích hợp thực còn phải chốt điểm hiệu lực rồi đo các cửa sổ revoke/lock/commit.

## 4. Lỗi đã tái hiện và sửa

[Run đỏ `fc49a91f3ce1`](../../../artifacts/roomqc-workspace-recheck-fc49a91f3ce1-local-2026-10-28.json) giữ nguyên lịch sử: unique index cũ chỉ cho một job/dispatch nên chặn recovery cycle mới khi đã giữ job lịch sử. Migration18 đổi uniqueness thành **một job nonterminal/dispatch**, cùng ràng buộc live workspace/kind sẵn có. Cũng sửa fixture HTTP chưa xác minh email; đây là lỗi fixture, không gọi là lỗi đăng nhập sản phẩm.

Migration0001–0017 không sửa; populated0017→0018, concurrent migrators và rerun đã kiểm. Đường owner reply đến muộn chọn live/newest job của dispatch: không ghi đè lease worker đang giữ và có thể settle đúng recovery job hiện hành. Generic/missing/conflicting receipt không tự activate hoặc suy ra closed.

**Điều kiện rollback binary:** sau khi có nhiều job lịch sử trên cùng dispatch, chỉ rollback tới bản đã chọn live/newest job tương thích. Binary cũ chọn job tùy ý không đủ điều kiện. Giữ index/schema/journal/history mới; không down-migrate hoặc xóa job để ép binary cũ chạy.

16 ca recheck gồm parser/receipt filter, API role/history bất biến, concurrent replay, commit giữa optimistic lookup và stale preflight, microsecond CAS, receipt classifications, protected terminal, cycle budget, hai actor/held lease/revoke/audit fault, signed runtime mismatch, late owner reply, final approval drift, detail snapshot, HTTP lookup/no-query/no-store và populated upgrade. 66 frontend tests kiểm client, journal/hook/UI, reload/lost response, phiên đổi, storage lỗi, pending list và native allowlist.

## 5. Thực hiện lại và phần nhận tiếp

Local harness chỉ dùng target disposable do nó tạo:

```powershell
node .local/test-workspace-recheck-20261028.mjs --all
node .local/verify-workspace-recheck-frontend-20261028.mjs
```

Native regression dùng `scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-dispatch` và CLI advisors đã pin theo runbook hiện hành. Phải ghi terminal exit, source/schema trước–sau và cleanup theo ownership; không lấy `--diagnostic setup-dispatch` làm full-default hoặc recheck live E2E.

[Bộ kiểm tính nhất quán của plan](../../../scripts/verify-vps-signup-plan.mjs) kiểm packet/source hiện hành,14 file frontend,17 migration directory cũ,580 migration nghiệp vụ, link/anchor,124 lượt môi trường và cleanup Docker chỉ đọc theo nhãn hai run. Bộ kiểm này không chạy lại product tests hoặc cấp nghiệm thu. Packet frontend trước240c8492e1e5 giữ lịch sử12 file; packet53e4109dfa35 đã chạy lại và bind thêm hai file regression, tổng14 file.

| Thứ tự | Đầu ra cần tiếp tục | Điều kiện nhận |
|---|---|---|
| 1 | Public control API → worker → native remote, real owner/platform Auth | Cùng run có API/session/DB/receipt/audit; success, unknown, closed→owner resume; không seed directory thay toàn journey |
| 2 | Process-fault và native CLI toàn tuyến | Kill trước/sau dispatch/remote commit/directory settle, API/worker restart, lost response và cùng key replay; không tạo business/trial/outbox trùng |
| 3 | Điểm hiệu lực revoke và installer/secret target | Cửa sổ revoke thực được kiểm; cấp/rotate/revoke scoped credential bằng flow installer có maintenance role và ACL đúng |
| 4 | T10, freeze/full-default/rebuild | Vendor/consumer DSN, pool/worker/rolling overlap/host budget đủ; toàn candidate có proof mới, không cộng diagnostic thành full |
| 5 | VPS/DR/A-B/web/Android/tải/RC/pilot | Theo đúng dependency và 124 cặp ca–môi trường trong hồ sơ tổng thể |

Hai artifact nghiệm thu gốc giữ hash: ledger `612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63`, worksheet `e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7`. Vẫn **70 ca not_run, 122 mục release unverified, 124 lượt chưa ký**, không reviewer/signoff/gate mới. Toàn plan tiếp tục active.
