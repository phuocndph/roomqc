# T06 — pipeline managed health thực tế, 22/10/2026

Đã hoàn tất **một lượt local tích hợp đầy đủ**, không phải toàn bộ VPS + signup.
Implementation chỉ ở integration; primary chỉ nhận tài liệu/artifact đã sanitize.
Không deploy, không đổi DB đang phục vụ, DNS, provider, email Internet hoặc gate.

## 1. Kết quả và candidate

- Candidate: **768 file / 546 business migrations / 8 directory migrations**.
- SHA256: `a3aaf6b3288364305b331004bf8f7a58c7732a7c6f8af8c511ae6315e76a8b0a`.
- Manifest kế thừa [T06 managed runtime](roomqc-t06-managed-runtime-local-2026-10-22.md)
  và thêm ba file. Không là hash mọi file repo hoặc release đang deploy.
- Full control: `node scripts/test-control-directory.mjs`, session87030,
  exit0; **270/270, 0 fail/skip/cancel**,135614.6897ms.
- Focused5/5 là subset của270, không cộng thành275.
- Syntax5, lint5 với0 errors/warnings, tracked whitespace:exit0.
- Default full backend: run`d740b6b38de9`, session43570, terminal **exit0**,
  phase`permission_controls_verified`; không dùng diagnostic thay full run.
- Full backend giữ các kiểm provider/invitation/lifecycle/registration/session/
  quyền, parent-FK/hotel scope, hồ sơ/mật khẩu và negative probe. Không bỏ bước
  nghiệp vụ để rút thời gian bài managed.
- Source được hash lại không đổi sau hồi quy/full run. Đây là một build, chưa có
  independent A/B current-candidate rebuild hoặc simultaneous-cluster proof.

[Artifact chi tiết](../../../artifacts/roomqc-t06-managed-timed-local-2026-10-22.json)
chứa timeline sanitize, source/image/schema hashes, terminal results và giới hạn.
Các checkpoint cũ giữ nguyên source/phạm vi, không relabel kết quả sang candidate này.

## 2. Đã nối thực tế những gì

Luồng installer cấp canary → directory PostgreSQL riêng → worker CLI managed →
năm probe mặc định thật → Prometheus/node_exporter/postgres_exporter thật →
HealthStore → publicCluster/admission. Không inject collector, số đo khỏe hoặc
clock giả; không backdate binding/sample, không rút ngắn policy.

Directory nằm trên **PostgreSQL instance khác** business backend: role PostgreSQL
là instance-wide, một database khác trên cùng instance chưa đủ tách topology.
Exporter role được installer có thẩm quyền cấp trước schema attestation;
worker không có tài khoản installer/service-role.

| Boundary | Chứng cứ trong lượt chạy |
|---|---|
| Nguồn đo | Mount chứa volume DB thực, fixed production queries và nhãn inventory |
| Scope | Docker Desktop VM, không gọi là Linux VPS proof |
| Worker | UID1000, read-only, cap-drop ALL, không Docker socket/public port |
| Installer | Riêng container/input, chỉ thêm CHOWN khi ghi exact-owned runtime volume |
| File runtime | Mode0600/chủ UID1000, worker mount readonly; kiểm trực tiếp có cleanup0 |
| Database | Metrics và probe login/pool riêng, bounded connections/query/shutdown |
| Canary | Real Auth user/session/refresh, private Storage bytes, nonce manifest và Realtime |
| Trust | Approval trong fixture là synthetic; không thay trusted issuer/provenance |
| Admission | Luôn manual_closed, không có backup evidence giả hoặc thao tác mở nhận mới |

Relay fixture chỉ chuyển bytes tới directory/Prometheus cố định trong private
network để tuân loopback origin policy; không tạo metric hoặc đích tùy ý.

## 3. Timeline thực — 17 mốc, khoảng34 phút giữa hai snapshot đầu/cuối

| Bước | Kết quả quan sát |
|---|---|
| Mẫu đầu | Worker ready,5 probe tốt; health degraded/warming, admission đóng |
| Warmup |324965ms mẫu liên tục; health healthy, manual/backup gate vẫn chặn |
| Auth fault |4 mẫu lỗi, BACKEND_UNREACHABLE latch, worker vẫn ready |
| Restart giữa Auth fault | Mốc firstValidAt và latch không mất,5 mẫu lỗi |
| Auth phục hồi | Probe tốt nhưng latch chưa xóa |
| REST fault/phục hồi |3 mẫu lỗi rồi tốt; latch giữ |
| Storage fault/phục hồi |3 mẫu lỗi rồi tốt; latch giữ |
| Realtime fault/phục hồi |3 mẫu lỗi rồi tốt; latch giữ |
| Functions fault/phục hồi |3 mẫu lỗi rồi tốt; latch giữ |
| Phục hồi liên tục |624927ms mới xóa latch; healthy nhưng không mở admission |
| Dừng Prometheus | Worker không ready; mẫu cuối quá136658ms thì health unknown/stale |
| Metrics trở lại | Worker ready, firstValidAt mới; bắt buộc warmup lại |
| Warmup cuối |301286ms; healthy, admission vẫn đóng |
| Shutdown | Exit0, cả2pool đóng; không lộ refresh token trong log kiểm |

Mỗi fault được giữ tối thiểu60s và ít nhất3 mẫu lỗi; không chỉ kiểm một HTTP fail.
Sau khi dịch vụ lên, probe recovery không đồng nghĩa được xóa latch ngay.
Ready của worker, health của cluster và admission là ba trục được đọc cùng timeline.

**Chưa thực hiện trong timed drill:** rotate/revoke canary, đổi approved catalog/
policy/target giữa lượt thu thập. Hồi quy unit/DB hiện có giữ các fence tương ứng,
nhưng không được dùng thay bước10 trong [thiết kế packet](roomqc-vps-signup-execution-ready-2026-10-22.md#14-packet-tích-hợp-tiếp-theo--t05t06t08-không-thêm-task-hoặc-case).
Vì vậy packet hỗ trợ scoped local B02/B04–B07/C01–C04, chưa đóng toàn các case.

## 4. Lịch sử lỗi và sửa đúng boundary

| Run/source | Thất bại | Sửa và kiểm lại |
|---|---|---|
|e1efe55ca018 /1f68f18… | SQLSTATE42501 ở exporter setup; chưa xác định độc lập exact statement | Dùng asserted supabase_admin installer trước schema freeze; không nâng worker |
|d2ef0b7ac572 /aa14c17… | ERR_MODULE_NOT_FOUND:pg từ entry ngoài control package | Import dependency của /control, thêm readonly/network-none link preflight |
|45daadd8dcad /763ecbd… | EPERM khi installer chown secret file dưới cap-drop ALL | Chỉ install-mode/exact volume thêm CHOWN; worker vẫn0capabilities |
|aff17f5ca0e3 | Kiểm trực tiếp ownership sau sửa | UID1000/mode0600, reader readonly/non-root đọc được; cleanup0 |
|d740b6b38de9 /a3aaf6b… | Không fail | Full control270 và default backend terminal0; timed17 mốc đạt |

Không lặp lại cùng lỗi bằng cách nới quyền runtime. Các run fail đều terminal1,
đã dọn và kiểm độc lập container/network/volume0; private diagnostics giữ trong
thư mục ACL riêng, không xuất vào artifact công khai.

Lịch sử lệnh hồi quy: `npm test --prefix server/control` fail vì subprocess dùng
relative scripts từ sai cwd; không tính là passing run. Lượt
`node --test server/control/*.test.mjs` thiếu DB flag chỉ206 pass/63 skip trên
269tests, không dùng nghiệm thu DB. Đã dùng đúng runner đầy đủ cho candidate cuối.
Hai full control trước sửa lần cuối269/269 và270/270 giữ đúng source, không thừa kế.

## 5. Advisors và giới hạn chưa được xử lý

Native Supabase CLI2.121.0 trả620 finding; exit0 chỉ có nghĩa chạy thành công:

- 151 WARN multiple_permissive_policies.
- 7 INFO unindexed_foreign_keys.
- 443 INFO unused_index.
- 19 INFO rls_enabled_no_policy.

Nineteen-table direct-denial test và populated parent boundaries đã đạt trong
full run; không suy tất cả quyền gián tiếp an toàn. Policy, inherited roles,
RPC/Edge/view/definer/trigger/FK workload cần disposition theo actual caller.
Không tự xóa policy/index hoặc tạo index chỉ để advisor về0.
Count151 khác checkpoint cũ135: giữ actual count/candidate, không sửa lịch sử.

Các phần còn mở:

1. Trusted issuer/provision/rotate/revoke và cross-replica approval provenance;
   timed trust/config/revision change và recovery.
2. Binding bộ source runtime/orchestrator/rendered monitoring vào independent A/B
   acceptance; hiện comparison đã ràng buộc client/exporter nhưng chưa đủ bộ.
3. Quyền gián tiếp/workflow/recipient/offboarding và policy/FK disposition.
4. Linux/TLS, Internet email, offsite restore, host-loss/on-call; không có production proof.
5. Simultaneous A/B, frontend/TypeScript/browser/Android trên candidate hiện hành,
   tải/soak, RC và pilot. Không dùng270tests thay toàn bộ E2E/sức chứa.

## 6. Cleanup, rollback và nghiệm thu

Runner cuối dọn32objects; kiểm độc lập tất cả container/network/volume của4run
backend và fixture ownership đều0. Năm family control-directory/monitor/
probe-auth/no-policy/release-manifest cũng0. Không dọn resource phục vụ/CRM.
Private diagnostic roots giữ lại để điều tra, không coi là deployed runtime.

Delta chỉ5file harness/setup/tests, không thêm migration hoặc đổi schema sản phẩm.
Rollback: ngừng dùng harness candidate, giữ private evidence; nếu cần rollback
worker sau rollout tương lai phải theo runbook, không down-migrate/reset DB,
xóa mapping/receipt hoặc đặt healthy thủ công. Không có serving rollout để rollback
trong lượt này.

Primary index SHA và hai raw delivery ledger không đổi. **122release entries vẫn
unverified; L/S/P/U/B không đổi; reviewer/signoff null.** Đây là scoped local
evidence, chưa ký toàn T06/T08 hoặc70case.

Tiếp theo giữ roadmap hiện hữu: disposition quyền/workflow + issuer/trust →
alert/outbox → admission/budget → private setup-status/resume/durable reconcile →
hai admin console → Linux/DR/on-call → simultaneous clusters/E2E/load/RC → pilot.

## 7. Bộ kế hoạch đã xác nhận

Phạm vi: **toàn bộ VPS + signup**; đầu ra: **plan + nghiệm thu**.

- [Bản điều hành dễ đọc](roomqc-vps-signup-delivery-brief-2026-10-22.md).
- [Kế hoạch chi tiết25task/8đợt](roomqc-vps-signup-execution-ready-2026-10-22.md).
- [Phiếu70ca theo từng môi trường](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md).
- [Protocol chứng cứ/reviewer/gate](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).

Giữ27gói/25task/70case và dependency hiện hữu; không thêm roadmap vì harness delta.
Kiểm cuối:16 tài liệu/408 liên kết/80 anchors đạt, mapping/dependency đúng,
mirrors khớp và protected guards không đổi. Không coi kiểm tài liệu là nghiệm thu sản phẩm.

Hướng dẫn Supabase/PostgreSQL đã ảnh hưởng trực tiếp việc tách instance, quyền
installer/runtime, file secrets, pool budget và pin vendor. Đã đối chiếu
[changelog](https://supabase.com/changelog.md),
[role model](https://supabase.com/docs/guides/database/postgres/roles),
[self-host Docker](https://supabase.com/docs/guides/self-hosting/docker).
Giữ self-hosted/v0.8.3/commitbc27d266…, không tự nâng vendor.

