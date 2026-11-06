# M06 — email-admin: quyền nguyên tử tại thao tác thực tế

Ngày 21/10/2026. Trạng thái: **local_verified có phạm vi**, thuộc R4-a/T03/T08.
Không đóng R4-a tổng, T08 hoặc toàn bộ kế hoạch VPS/signup.

- [Artifact đã lọc](../../../artifacts/roomqc-m06-email-admin-local-2026-10-21.json)
- [Kế hoạch triển khai hiện hành](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-2026-10-21)
- [Bằng chứng trước — chín root ghi](roomqc-m06-mutation-local-2026-10-20.md)
- [Sổ 27 gói/25 bước/70 case](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json)

## 1. Kết quả

Đã tái hiện và sửa **R4-EMAIL-ADMIN-TOCTOU / High** trên fixture riêng:
Edge đã xác thực caller nhưng các thao tác service sau đó không kiểm lại phiên
trong cùng transaction. Xóa phiên thật sau preflight vẫn nhận HTTP 200 ở status,
retry và test; retry/test ghi thêm email/PGMQ, retry còn ghi admin audit.

Candidate mới đưa ba action qua service-only RPC, khóa/recheck Auth → profile →
session tại transaction thực thi. Cả ba trả **403** nếu phiên đã bị xóa sau
preflight, không đổi business snapshots. Không có căn cứ nói đã xảy ra incident
production hoặc đã gửi email thật.

Quyền email vẫn là profile.is_super_admin, **không** hợp nhất với platform
user_roles. Profile email-admin không có platform role vẫn thành công; platform
role-only không có cờ email bị từ chối.

## 2. Source và thay đổi

Implementation chỉ ở worktree integration, branch codex/roomqc-parallel-integration,
HEAD 5cb583729ce055db64df8b192f10476db1fa99b8, có diff/untracked; HEAD không là
release identity đầy đủ.

Scoped backend: **643 file / 531 migrations**, SHA256:

```text
4334aef4f09c6f867346f8e4ca7c4a8a2408efdcf410f6536989b97538d7c493
```

Đây không là manifest toàn frontend/mobile/deploy. Snapshot 640/530 trước đây
vẫn giữ proof lịch sử, không dùng thay source candidate mới.

| File | Thay đổi |
|---|---|
| supabase/migrations/20261021012120_email_admin_atomic_action_context.sql | Forward migration tạo private live helper + service-only action wrapper; không sửa migration cũ |
| supabase/functions/email-admin/index.ts | Status/retry/test dùng cùng action RPC; context lấy từ verified caller, bỏ direct service reads/enqueue/retry tại Edge |
| supabase/functions/_shared/email/authorization.ts | Context extractor bounded, sub phải khớp independently verified user và session UUID |
| scripts/control-backend-email-admin-checks.mjs | Real Edge relay, live-state matrix, snapshots, duplicate/replay và race hai thứ tự |
| scripts/test-control-backend-sandbox.mjs | Dedicated internal-only Edge clone; orchestration/ownership/cleanup, không production hooks |
| server/control/backend-email-admin.test.mjs | Bốn structural/regression tests |
| src/lib/email-admin-authorization.test.ts | Bổ sung ba context tests, tổng bảy test trong file |

Migration được tạo bằng native CLI 2.121.0 sau đọc help. Context extractor
**không xác thực chữ ký JWT**: handler chỉ gọi sau Auth getUser, profile và
caller-bound email_admin_actor preflight. DB revalidates live context; body
actor/session/role không được dùng làm authority.

Private helper SECURITY INVOKER, search_path rỗng, ba FOR SHARE; không cấp
EXECUTE cho PUBLIC/anon/authenticated/service_role. Public wrapper SECURITY DEFINER
chỉ service_role được EXECUTE và kiểm trusted-service; không có browser enqueue API mới.
Mọi khóa giữ trong DB transaction, không kéo qua HTTP.

## 3. Kiểm thử và giới hạn cách đếm

| Phạm vi | Kết quả hiện hành |
|---|---|
| Full control DB suite | **152/152**, 0 fail/skip/cancel, exit 0 |
| Structural email tests | 4/4, là subset của 152, không cộng lần hai |
| Vitest authorization/context | **7/7**, exit 0, chạy lại có log riêng |
| Fresh backend A | dbbf929824ec, 531 migrations, exit 0, phase permission_controls_verified, cleaned 15 |
| Fresh backend B | 36a0835d1dc3, cùng source/531 migrations, exit 0, phase tương tự, cleaned 15 |
| Email action proof mỗi run | **114 named checks**, chín invalid states, 27 Edge +27 service state denials, snapshot đầy đủ hàng ở 10 bảng |
| Race mỗi run | **7 scenarios**: ba cửa sổ preflight/session-delete, ba profile row-lock waits, một retry mutation-first |

114 checks không là số HTTP requests; 54 state denials là subset, không là
54 acceptance cases. Các test phía trên không thay ma trận 70 case release.

Ma trận giữ positive trước/sau restore; thử unconfirmed, ban, Auth/profile
deleted, locked, inactive, NULL status, email-admin revoked và session expired.
Có wrong/nonexistent/null/cross-user session context, anon, platform-role-only,
body giả authority và browser gọi service-only RPC.

Status DTO giữ limit 100, pending count và cấu hình hiển thị; provider-disabled
vẫn 409; email ngoài allowlist vẫn 400. Hai retry đồng thời: một 200, một 409,
đúng một queue message và một audit. Retry tiếp không đổi dữ liệu. Hai test cùng
phút trả cùng delivery và một queue message.

### Race được chứng minh

1. Real Edge chạy Auth/profile/session preflight; relay giữ service request.
   SQL DELETE actual auth.sessions commit trước release request. Cả ba action
   phải 403, full-row hashes của 10 bảng không đổi.
2. Sau preflight, writer khóa profile và đổi account_locked nhưng chưa commit.
   Action thật phải chờ row lock trong RPC; writer commit thì action 403 và
   không đổi business. Có pg_blocking_pids/wait_event_type, không lấy timeout làm pass.
3. Retry giữ authority locks trước, chờ email row đang bị khóa; revoker profile
   phải chờ retry. Retry commit trước rồi revocation mới commit; command kế tiếp
   bị chặn. Đây là serialization hợp lệ, không hứa hủy giao dịch đã có khóa/commit.

Không suy từ bảy scenario rằng mọi trạng thái × action × race đều đã được phủ.

## 4. Repeatability và regression

| Identity | A và B |
|---|---|
| Migration-set | eafe2cb85f766c8b0ed55a1dd95c0a0a8f4fd2456d48cc528c469237ffe9ccf9 |
| Pre-initialization schema | 52367314d2060a984e01b8ec914297325cf0fbdfaf44ceda364f972f29ca3eee |
| Initialized schema | 11f9b8a2695df4ce8e79ed66ee46f85734f084d72cc38e5ed550a00158fec5a4 |
| Init-spec | 66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae |
| Email Edge eszip | b4437c9d3aa02e365c079b9eb759780e99a414a3446f474925a4ab41060292be |

B dùng expected-build-state của A đã hoàn tất và cleanup. Image digests và
email source hashes cũng khớp. Đây là hai rebuild **tuần tự độc lập**, không
thay nghiệm thu hai data cluster cùng chạy ở T21.

Giữ và chạy lại registration/session/email-ready/distribution cùng chín root:
162 mutation denials, snapshot 29 bảng, 15 race mỗi run và actual recovery/replay.
Five service/fault/recovery, initialized schema/Janitor controlled drill,
probe least-privilege và Realtime protocol denial/positive cũng đạt.

Frontend build không chạy lại ở lát không đổi UI implementation này; Edge
eszip được compile và handler thực thi thật. Không dùng build 378 assets cũ như
bằng chứng frontend candidate mới.

## 5. Advisors và phần còn mở

Native CLI 2.121.0 ở cả A/B: **640 findings = 17 no-policy INFO +8 FK INFO
+480 unused-index INFO +135 permissive WARN**. Không thêm/xóa index hoặc gộp policy
trong lát này; tổng không đổi không là chứng minh đã giải quyết tất cả findings.

Catalog: 476 functions, 11 views, 358 policies, 13 FK; candidate graph 1011 nodes/
899 edges/149 triggers/25 candidate entry paths. Browser direct-grant violations=0;
**allSafe và transitiveReachabilityProven vẫn false**.

Tiếp R4-a service lifecycle begin/batch/finish/outbox và provider metadata/
webhook; final disposition 17 targets. Sau đó R4-b semantics 135 WARN, R4-c
workload tám FK → R3/R5 issuer/trust → R6 atomic health/gateway → R7 timed pipeline.

Vẫn phải alert/admission/budget, durable signup/resume/reconcile/abuse, admin UI,
Linux/TLS/offsite/restore/external alert, A/B đồng thời/browser/Android/E2E/tải/RC
và pilot ≥7 ngày. Gate local-integrated/staging/pilot/public/paid không tự nâng.

## 6. Lịch sử fail và an toàn dữ liệu

- fd582e1c371f: fixture race v1 nhầm Promise field bị callback cùng tên ghi đè;
  dừng trước bước thu hồi. Đã sửa synchronization harness; không coi là product repro.
- 7b92e64746b5: fixture v2 tái hiện ba action 200 sau actual session DELETE;
  retry/test có changed-table evidence như mục 1. Đây là original-source repro.
- Cả hai exit 1 có diagnostic được giữ; A/B sau sửa exit 0. Raw logs, catalog và
  fixture credentials chỉ trong .local, không publish. Hash log/ownership ở JSON.

Inventory read-only lúc 2026-10-21T01:33:51.0073193Z: cả bốn run còn **0 container,
0 volume, 0 network** theo exact ownership labels; mỗi run đã dọn 15 owned objects.
Không xóa checkout hoặc dữ liệu business/CRM.

Primary chỉ nhận docs/artifacts đã lọc; index giữ SHA256
72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f.
Không commit/reset/merge, không migrate runtime đang phục vụ, không DNS/provider
delivery/public signup/billing. Runtime schema/flag lịch sử không được dùng làm
bằng chứng source 531 đã deploy.
