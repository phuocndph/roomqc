# M06/R4-a — kiểm chứng guard đăng ký local

**Bổ sung sau báo cáo này:** High Auth-soft-delete mô tả bên dưới đã được sửa
và kiểm chứng ở [source 633/527](roomqc-m06-auth-soft-delete-local-2026-10-20.md).
Báo cáo này vẫn là bằng chứng lịch sử 632/526; không sửa hash/count gốc.
Current A/B giữ nguyên 94 HTTP/39 SQL registration controls và hai lock races.
R4/T08 cùng toàn bộ plan vẫn mở; chưa deploy hay nâng gate.

Ngày 20/10/2026, Asia/Bangkok. **Lát guard đăng ký đã kiểm chứng local;
R4/T08 vẫn mở, chưa staging/pilot.** Giữ nguyên 27 gói P0–P8, T01–T25 và 70 case.
[Artifact đã lọc](../../../artifacts/roomqc-m06-registration-local-2026-10-20.json).

## Kết quả

- Source integration, HEAD 5cb5837 + working tree; chưa sync implementation/deploy.
- Full control **142/142**, 0 fail/skip/cancel, exit 0, 127402.5401 ms.
  Focused registration/gateway **7/7 là subset**, không cộng vào 142.
- Fresh A **4317f0ce9c62** và B **0fe112b0e675** đều exit 0,
  phase permission_controls_verified, 526 migrations, cleanup 14 owned objects/lượt.
  B.buildRepeatability.matched=true; kiểm lại label: còn 0 container/volume/network.
- Mỗi backend: **94 kiểm tra registration HTTP/Auth, 7 actor**, **39 SQL denials /
  3 roots / 13 invalid states**, positive trước/sau và directory gate.
  Giữ regression 176 application checks/8 actor/4 orders + 20 SQL session denials;
  Edge provider-disabled, năm service/fault/recovery, Janitor, 13 permission controls.
- Build+verify local synthetic loopback exit 0, 378 web assets. Lượt đầu build được
  nhưng verify exit 1 vì thiếu VITE_SUPABASE_URL; đã sửa cách chạy, không sửa env
  hoặc deploy. Vendor chunk lớn vẫn là follow-up T17/T23, không nhận định UI nhanh.

## Đã thay đổi

1. Migration 20261020041251_registration_owner_live_guards.sql thêm internal live
   owner guard; browser registration_actor dùng auth.uid + session_id + live Auth/
   profile/role/invitation state, không dựa GoTrue /user một mình.
2. Legacy complete_registration guard trước mutation/replay, giữ directory_required.
   Service wrapper kiểm owner và optional initiating session ngay transaction write;
   trusted service session-free vẫn hợp lệ. Internal impl không là alternate API;
   EXECUTE của service_role trên hai impl được quan sát false ở sandbox B.
3. Gateway lấy actor từ RPC bằng caller token + public key; server ghi đè workspace/
   session fields, không lưu token vào directory/job và không đổi 403 thành 401.
4. Harness giữ missing-profile positive cho signup mới. Pending-profile fixture
   được tạo qua provision thật rồi chuyển pending_setup **có binding hợp lệ**;
   test khóa/unlock/replay cùng receipt. Không insert profile tenant=NULL hoặc sửa
   quota/staff/Auth trigger để test xanh.
5. Pending/revoked staff invitation chặn cả actor/legacy/service. Replay đồng thời
   bốn HTTP call chỉ có một binding, không thêm tenant/hotel/trial/mail.
6. Hai race có HTTP/PostgreSQL thật: writer giữ row profile hoặc session; gateway
   transaction được quan sát wait_event_type=Lock qua pg_blocking_pids; writer commit
   khóa/revoke rồi request nhận 403. Snapshot không có provisioning/business side effect;
   trusted service vẫn phục hồi được khi interactive session đã bị revoke.

Snapshot gồm IDs tenant/hotel/room_types/mail/invitation, user binding/role/level/
primary-owner, trial/subscription dates và receipt của workspace fixture. Không
khẳng định so sánh mọi cột hoặc directory jobs: full cluster fixture không có
directory job runtime. Race này không chứng minh toàn bộ lock ordering/deadlock
của invitation/admin hoặc mọi interleaving; những phần đó tiếp tục R4/T12.

## Lỗi mới đã tái hiện — phải sửa tiếp, không đóng R4

**R4-AUTH-SOFT-DELETE / High.** Trong exact-owned B, transaction rollback dùng
owner/session GoTrue thật: positive private.room_setup_owner và
private.subscription_quote_actor trước đó đạt; sau UPDATE auth.users.deleted_at,
cả hai vẫn không deny. JSON kiểm tra:
`{"roomDenied":false,"quoteDenied":false,"positiveBefore":true,"authSoftDeleted":true}`.

Đây là bằng chứng fixture về thiếu điều kiện Auth xóa mềm, không phải bằng chứng
đã có sự cố ở business DB/production. Profile deleted_at đã có guard; không nhầm
hai trường với nhau. Rà thêm platform/email/distribution guard cùng semantics;
chưa gắn kết luận runtime cho các root chưa thử. Việc kế tiếp: forward migration,
mở rộng HTTP/SQL positive-negative Auth-deleted và null-state; giữ receipt/
membership/role/session behavior; chạy fresh current-source A/B sau sửa.
Không chuyển lỗi quyền này thành performance follow-up hoặc chấp nhận để mở signup.

## Advisors và giới hạn

A/B: **649 findings = 17 no-policy INFO + 8 FK INFO + 489 unused-index INFO +
135 permissive-policy WARN**. 489 so với 490 trước đó do workload/statistics,
không phải đã sửa index. Catalog: 472 functions, 11 views, 358 policies, 149 triggers,
25 candidate entry paths; graph 1007 nodes/884 edges. Browser direct grant
violations=0, **allSafe=false/transitiveReachabilityProven=false**.
Không dùng graph/grant count để đóng quyền gián tiếp.

Hai fresh builds là tuần tự; không thay E2E hai backend đồng thời G01/G02. Canonical
schema/migration/images/init-spec khớp không đồng nghĩa compose có secret/path/run
name byte-identical hoặc production release artifact đã tin cậy. Janitor controlled
drill không thay scheduled soak staging. Provider tắt, không gửi mail tới người thật.

## Source và bằng chứng

Scoped manifest **632 files / 526 migrations**, ordinal POSIX path sort,
entries {path,sha256(file bytes)}; SHA256(JSON.stringify(entries)):
`bf7895a55c5b08ae7b81bf79eccd3a480d70a74ce8bbbcf4c2a4d93d54809e32`.

- Pre-init schema: `c142134fa1b9f6d45c2a56b636d23594309e1005c930579ccb0bf030b379b184`.
- Initialized schema: `2c28e9a7a83803324f4c944d923e1ef8590971f0790e091799ff0bd93459585a`.
- Migration set: `0936b2719e92c177a5829405a8cef3ed35d5f360383cd5f4b54580a44d8a02bb`.
- Init spec: `66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae`.

Log/state hashes, case counts và boundaries ở artifact; raw private logs/env/catalog
ở .local, không publish DSN/token/function bodies. Lượt failed 9492813fbaa2 giữ lịch
sử fixture invalid, không dùng làm proof source cuối. Các failure trước đó do staff
created_by thiếu hoặc PATCH 0 row cũng là fixture failures đã sửa, không gán lỗi
production. Intermediate success a5100051530f không chứng minh source hiện hành.

## Runtime và việc kế tiếp

Read-only 14:56:42 +07 ngày 20/10: direct/proxy readyz 200/schema 0005; inspect
đúng container control thấy signup=false/image a65408e9… giữ nguyên. Chưa áp migration
vào backend nghiệp vụ, nâng runtime, đổi DNS hoặc mở signup; CRM không trong phạm vi.

1. Sửa R4-AUTH-SOFT-DELETE; mở rộng trigger/checkout/admin/session và ledger 17 bảng.
2. R4-b policy semantics / R4-c tám FK workload; không xóa index từ fresh stats.
3. R3 issuer/R5 trusted artifact → R6 credential-revision check nguyên tử trong
   HealthStore.record + gateway/runtime → R7 full pipeline timed drill.
4. Alert → authority/admission/budget → signup/reconcile → hai màn admin → Linux/
   offsite/restore → A/B browser E2E/load/cutover → pilot ít nhất 7 ngày.

Xem [plan thực thi](roomqc-vps-signup-execution-plan-2026-10-19.md) và
[ma trận 70 case](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
Đây là proof local có phạm vi; không đóng acceptance release hoặc toàn goal.
