# M06/R4-a — sửa và kiểm chứng Auth xóa mềm

**Bằng chứng kế tiếp:** [email-ready/profile RLS 637/529](roomqc-m06-email-ready-local-2026-10-20.md)
đã xử lý thêm trigger workspace-ready và recursion users UPDATE. Proof 633/527
dưới đây giữ lịch sử; “trigger cần test” là next action tại thời điểm report này,
không nhận lại như lỗi chưa sửa. Caller/policy/FK và R4/T08 vẫn mở.

Ngày 20/10/2026, Asia/Bangkok. **R4-AUTH-SOFT-DELETE đạt local; R4/T08 và toàn
plan vẫn mở. Chưa deploy/staging/pilot.** [Artifact đã lọc](../../../artifacts/roomqc-m06-auth-soft-delete-local-2026-10-20.json).

## Kết quả

- Forward migration `20261020082007_active_auth_soft_delete_guards.sql` bổ sung
  `auth.users.deleted_at IS NULL` cho năm guard: room setup, subscription quote,
  platform support, email admin và distribution active actor.
- Giữ nguyên role/profile authority khác nhau, session/ban/lock/membership,
  signature/EXECUTE/search_path và trusted service behavior. Không đổi policy,
  giá/trial/settlement hay historical migration để test xanh.
- Full control **142/142**, 0 fail/skip/cancel, exit 0, 126957.999 ms.
  Focused actor/registration **4/4 là subset**, không cộng vào 142.
  Node syntax checks ba harness/runner đạt.
- Fresh A **0d7e8d8f07ca** / B **850b5d52cc1d** đều exit 0,
  permission_controls_verified, **527 migrations**. B repeatability matched=true;
  cùng initialized schema/migration-set/init-spec/eight vendor image digests.
- Mỗi lượt: **210 application API checks / 8 Auth actors / 4 distribution orders**;
  **44 SQL denials / 4 roots / 11 invalid states**, positive trước/sau và rollback.
  Registration regression **94 HTTP/Auth / 7 actors + 39 SQL denials / 3 roots /
  13 states**, giữ hai race profile/session thật.
- Năm service healthy/fault/recovery, real Edge provider-disabled, 13 permission
  controls và Janitor controlled drill đạt. Scheduled maintenance soak vẫn chưa có.
- Build+verify **local synthetic loopback** exit 0, **378 web assets**; không sửa
  .env business. Vendor JS vẫn ~14.158 MB trước gzip: T17/T23 còn performance work.
- Cleanup **14 exact-owned objects mỗi run**, read-only kiểm theo run labels lúc
  2026-10-20T08:32:20.692Z: còn **0 container/volume/network** của cả A và B.

## Proof về lỗi đã sửa

Reproduction trước sửa trên fixture có hash
`fa48eef79c20dd27c79111f65b0033b0581b5ae9ba1c21fdb112019fc58edfba`
đã được đối chiếu lại. Hai helper room/quote từng không deny sau Auth soft-delete.
Ba guard khác có cùng thiếu sót trong source; không khẳng định đã từng bị khai
thác hoặc đã xảy ra incident trên production.

Harness mới dùng caller JWT từ GoTrue thật. Chỉ installer của sandbox được sửa
Auth.deleted_at cho bốn identity synthetic; chứng minh public profile vẫn active,
không khóa/xóa. Denials đi qua REST/RPC hoặc actual Edge, không giả JWT claims.

| Luồng | Khi Auth đã xóa mềm | Positive sau restore |
|---|---|---|
| Room setup | Get và save draft bị từ chối | Đọc lại đúng version/draft |
| Quote | Read, create mới và replay bị từ chối | Read/replay cùng quote |
| Checkout nháp không thanh toán | Get, replay và new request bị từ chối | Replay cùng draft, checkout_enabled=false |
| Platform/email admin | Actor RPC deny; actual email Edge 401/403, không logs | Actor/Edge hoạt động lại; provider vẫn disabled |
| Distribution | Create/edit RPC và assigned direct note deny | Owner edit/assigned note hợp lệ lại |

Đối chiếu đầy đủ hàng của **20 bảng allowlisted** trước/sau chuỗi denial:
room draft, quote/checkout, workspace receipt, tenant/hotel/rooms/room_types,
profiles/roles/hotel memberships, invoices/payment drafts, items và distribution
aggregate/supplements/email deliveries. Không có business mutation trong phạm vi
snapshot; Auth mutation fixture cố ý không nằm trong snapshot. Không suy thành
đã so sánh mọi bảng, directory jobs, audit hoặc toàn bộ database.

SQL matrix bổ sung Auth-deleted, profile-deleted, locked, inactive/null-status và
session bị xóa, bên cạnh unconfirmed/ban/expired/wrong/missing session. Mỗi state
rollback riêng và positive được gọi lại. Đây không thay HTTP actor proof, grant
audit hoặc chứng minh mọi race. Registration lock races giữ regression riêng.

## Advisors, catalog và giới hạn

Native CLI 2.121.0 được chạy read-only trên **B đã initialized**, qua tunnel
loopback vào DB exact-owned. Không chạy advisors trên A; không ghi A là đã chạy.

B có **646 findings = 17 no-policy INFO + 8 FK INFO + 486 unused-index INFO +
135 permissive-policy WARN**. So với 649/489 của proof trước là thay đổi
statistics/workload; migration này không thêm/xóa index, không phải performance fix.

A/B catalog vẫn: 472 functions, 11 views, 358 policies, 149 triggers;
candidate graph 1007 nodes/884 edges/25 entry paths. Direct browser table/column
grant violations=0, nhưng **allSafe=false/transitiveReachabilityProven=false**.

Lát này chưa chứng minh room complete, mọi checkout/reconciliation/lifecycle
admin action, trigger readiness email hoặc tất cả interleaving revoke-before-
commit. Không đóng ledger 17 bảng/policy semantics/tám FK hoặc toàn T08.
Hai builds tuần tự không thay G01/G02 hai backend cùng chạy/browser E2E.

Lần gọi B đầu dùng expected-build-state tương đối bị preflight từ chối, exit 1,
trước tạo tài nguyên. Đã sửa **lệnh gọi sang absolute path**, không đổi code hay
nới validator; lượt B current thành công. Log failed được giữ, không tính là bug
production hoặc giấu khỏi artifact.

## Source và canonical hashes

Source integration HEAD 5cb5837 + working tree; **633 scoped files / 527 migrations**.
Algorithm giữ ordinal POSIX paths và SHA256(JSON.stringify(entries)):
`4e15a7895f37b2b84dc94740d363230e5bda42dfb378c9b0798342ffbf873cff`.

| Phần | SHA256 |
|---|---|
| Pre-initialization schema | `0055a44d090ffa11a646639ff0fe552f559725c07381c4b4291f63c9386224f1` |
| Initialized schema | `245e79fcfe9e152038f3eae2a18bf66d59dc9868379a9bd271faf3710adf3282` |
| Migration set | `f19ecdce83395524dec89fe28e1fc1046f2ae9e3b3b619a0d9b64b01cfe2f7b5` |
| Init spec | `66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae` |

Log/state/private catalog/advisors file hashes và eight image digests có trong
artifact. Raw .local có synthetic credential, không publish. Proof 632/526 và
registration report trước đó giữ làm lịch sử, không dùng hash cũ cho source mới.

## Runtime và việc tiếp theo

Read-only lúc **15:24:54 +07**: direct 8091/proxy 8082 readyz 200,
schema 0005; exact container signup=false, image a65408e9… giữ nguyên.
Không migrate business Supabase/CRM, nâng runtime, đổi DNS/gửi mail thật/mở signup.
Implementation chỉ ở integration; primary chỉ nhận docs/artifact, Git index giữ
`72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f`.

1. Tiếp R4-a: trigger workspace-ready email, room complete/checkout/admin/session,
   ledger 17 bảng. Trigger source còn cần kiểm null/live actor/scope/dedupe trên
   fresh event, không lấy mail đã tồn tại để che nhánh tạo mới. Đây là review
   candidate, chưa có runtime reproduction đầy đủ cho trigger trong lượt này.
2. R4-b semantics 135 policy WARN, R4-c tám FK workload; không xóa index từ fresh stats.
3. R3 installer/issuer + R5 approved artifact → R6 atomic health credential revision/
   gateway/runtime → R7 timed pipeline.
4. Alert → authority/admission/budget → signup/resume/reconcile → hai màn admin →
   Linux/offsite/restore/external alert → simultaneous A/B/browser E2E/load/cutover →
   pilot ít nhất 7 ngày. Giữ đủ **27 gói/25 bước/70 case**, không nâng release gate.

[Run sheet hiện hành](roomqc-vps-signup-deployment-plan-2026-10-20.md#implementation-ready)
và [ma trận nghiệm thu](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
