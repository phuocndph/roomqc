# M06 — current19 direct ACL và23 FK parent boundary, local

Ngày22/10/2026, Asia/Bangkok. Checklist con T01/T03/T04/T08, không thêm task/case.
Phạm vi người dùng chọn: toàn bộ VPS +signup; đầu ra plan +nghiệm thu.
Đây là checkpoint kiểm chứng có phạm vi, **không là nghiệm thu phát hành**.

## 1. Candidate và kết luận

754 files/546 migrations; source trước/sau:
`f7da974ae2d22637cc5c7653370941eb0af9df3321087a104925475faa26846e`.
Manifest giải đệ quy từ artifact authority754, cùng tập path nhưng hash nội dung
mới; không relabel artifact source472. Chỉ sửa5 file harness/tests hiện có,
không sửa product SQL/policy/grants/schema/migration, không chạm DB đang phục vụ.

Fresh default full A d6d4cddd7fe4/B0678a65fb125 đều terminal0, cleaned23 mỗi run,
independent leftovers0; source/build/schema và final recovery khớp. A/B tuần tự
không thay T21 simultaneous hoặc nghiệm thu release.

[Artifact đã lọc](../../../artifacts/roomqc-m06-current19-direct-local-2026-10-22.json)
giữ hashes, counters, source/run, cleanup, failed history và giới hạn.
Raw ownership/env/log riêng không được đưa vào artifact hoặc primary.

## 2. Lỗi được tái hiện và thay đổi kiểm thử

Run b23/source472 trước đây exit1 ởno_policy_controls/P0001. Log riêng chỉ có
SQLSTATE, không đủ kết luận exact allowlisted reason của run đó. Capture catalog
cho thấy19 no-policy tables nhưng helper kỳ vọng18; thiếu password receipt đã
có trong migration539. FK target inventory23 nhưng parent helper kỳ vọng22.

Thêm actual PostgreSQL test trong container exact-owned, pinned16, network none,
không published ports. Fixture **synthetic** có danh mục19 bảng độc lập với
builder, hàng trong từng bảng, roles/grants/RLS và auth session giả lập. Trước
sửa builder:2 structural pass/1 actual fail, NO_POLICY_CONTROL_COUNT_MISMATCH;
source red04a1983… và exit1 được giữ. Đây không phải tái chạy nguyên backend cũ.

Sau sửa inventory theo identity, actual test phải:

1. Pass trên19 synthetic populated targets.
2. Grant SELECT authenticated vào password receipt →NO_POLICY_UNEXPECTED_ALLOW.
3. Revoke đúng grant →restored pass.
4. Thêm bảng RLS/no-policy ngoài inventory →inventory mismatch.
5. Drop đúng owned bảng lạ →restored pass; auth fixture row không đổi.
6. Kiểm tên/label/network/ports rồi cleanup container trongfinally.

Không tăng count mù: giữ204/56 legacy denials,12/4 employee receipt và thêm12/4
password receipt riêng. Runner binds helper hashes với source và reference A;
no-policy errors chỉ xuất8 allowlisted labels, chi tiết SQL vẫn riêng tư.

## 3. Bằng chứng actual full-schema trên candidate hiện hành

| Kiểm tra | Expected/actual trong mỗi run đạt | Giới hạn |
|---|---|---|
| Direct grants |19 identities,228 browser/probe +64 private-service denials;41 installer/service reads;19 unchanged snapshots;3 dynamic invoker denials | SQL role assumption, không exhaustive indirect/API proof |
| Dữ liệu no-policy |18/19 bảng có hàng trong full fixture; employee receipt chưa populated | Không gán synthetic19-populated thành19 real application tables populated |
| Parent boundaries |23 FK/184 denials;34 snapshot tables;0 missing/findings | Parent DELETE/key update boundary, không toàn bộ offboarding |
| Password FK delta |1 FK/8 denials; exact actor_id→auth.users(id), ON DELETE CASCADE/UPDATE NO ACTION | Legacy22 FK/176 denials giữ nguyên |
| Trusted cascade | Positive tenant cascade quan sát trong transaction; rollback và snapshots không đổi | Không cấp quyền production offboarding hoặc expose service delete |
| Final recovery | Permission controls13/13; kiểm services/schema cuối trước terminal thành công | Không thay timed health→admission/Linux |
| Provider/invitation | Provider44 checks/3 races; invitation15 admin/31 management/19 delivery/22 acceptance/7 caller/34 authority/6 observed races | SMTP nội bộ; không Internet inbox/exactly-once ngoài provider |
| Hồi quy | Hotel280/account1764/20 races; employee30/4; self66/4; password33 +7fault/4races +7caller +7config | Actor/workflow scope của từng harness, không full business matrix |

Các số là quan sát/đối chứng, không cộng vào70 release cases hay coi100% quyền an toàn.

## 4. Verification ngoài full backend

- DB-opt-in control: `node scripts/test-control-directory.mjs`,233/233,
  fail0/skip0/cancelled0, terminal0.
- Focused24/24 (no-policy/parent/invitation) là **subset** của control233.
- Frontend chọn25 file auth/profile/invitation:388/388, terminal0 trên freeze này;
  không phải mọi frontend module hoặc browser/Android E2E.
- TypeScript `npx tsc --noEmit`, ESLint5 file/0 warnings, syntax và diff whitespace
  đều exit0. Stderr “Owned save refusal” của frontend là negative fixture có chủ ý.
- Source được kiểm lại sau run; không sửa source trong A/B. Docs không thuộc
  candidate source manifest này. Final artifacts chỉ chứa projections đã lọc.

Lệnh full runner: `node scripts/test-control-backend-sandbox.mjs --run` cùng
native `--advisors-cli` đã kiểm version/help. B dùng `--expected-build-state`
trỏ ownership A terminal thành công/cleaned; private path không phải artifact
phát hành. Hai run rebuild tuần tự, không thay T21 A/B độc lập cùng chạy.

## 5. Advisors và giới hạn chưa đóng

Native CLI2.121.0: A603/B604 =19 no-policy INFO +7 FK INFO +442/443 unused-index
INFO +135 permissive WARN,0 ERROR. Khác1 unused phản ánh thống kê/workload;
source và static schema hash vẫn khớp, không là đã thêm/xóa hoặc sửa1 index.
19 no-policy INFO/135 permissive WARN không được xử lý bằng mở policy/grants.
FK workload/index disposition, effective indirect entry và policy OR semantics
vẫn cần review. Unused count theo workload/stats; không drop index theo count.
R4/T03/T08 chưa được đóng chỉ bằng direct19 hoặc parent23.

Chưa có proof toàn recipient/offboarding/EC10–EC15/workflow, issuer/release trust/
revision-atomic timed pipeline đủ end-to-end; thiếu handlers/callers setup-status,
tenant-summary/recheck/alerts/backups, command-result đọc và hai admin entries.
Linux/TLS/email Internet/offsite clean-host restore/on-call/simultaneous A/B/
browser/Android/load/soak/pilot chưa nghiệm thu ở checkpoint này.

## 6. Kế hoạch nhận tiếp và nghiệm thu

[Bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md),
[plan16.2](roomqc-vps-signup-preparation-plan-2026-10-21.md#162-phiếu-nhận-việc-ngay--candidate754546-sourcef7da974),
[phiếu T01–T25](roomqc-vps-signup-launch-checklist-2026-10-21.md#5-bảng-điều-phối-đủ-t01t25)
và [protocol70 case/diễn tập](roomqc-vps-signup-acceptance-protocol-2026-10-21.md#20-phiếu-diễn-tập-vận-hành-đăng-ký-và-vps)
là nguồn giao việc. Giữ8 đợt/27 gói/25 việc/70 case/122 release entries unverified.

Current19 indirect/policy/FK workload và workflow còn thiếu →issuer/trust/timed
health →alerts/admission/budget →signup private status/resume/reconcile →consoles
→Linux/TLS/DR/on-call →simultaneous A/B/E2E/load/RC/pilot. Không chạy lại source
không đổi chỉ để tăng số test; delta mới mới cần regression và freeze lại trước gate.

Nghiệm thu mỗi case: source/target →populated positive →negative allowed/no-effects
→fault/race →recovery →HTTP/DB/receipt/audit →owned cleanup →reviewer. Thiếu secret/
quyền giữ not-run/deferred đúng phần, không đổi tiêu chí hoặc giả lập thành external pass.

Owner/reviewer/signoff cònnull; gates L/S/P/U/B không đổi. Chỉ mirror docs/artifacts
đã lọc vào primary, không source. Không deploy/apply VPS, sửa DNS/provider, gửi
email Internet hoặc thay data đang phục vụ. Checkpoint này không là mở gate L.

## 7. Lịch sử giữ nguyên

- [Authority754/source472 và default full failure](roomqc-m06-invitation-authority-local-2026-10-22.md).
- [Planning baseline trước checkpoint current19](../../../artifacts/roomqc-vps-signup-planning-baseline-2026-10-22.json).
- Pagination752/UI751/delivery744/management741/caller738 và build717 giữ source,
  expected/actual, thất bại và giới hạn tại đúng report lịch sử; không rewrite
  theo sourcef7 hoặc dùng chúng để ký staging/pilot.
