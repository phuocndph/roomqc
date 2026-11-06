# RoomQC — phiếu nhận việc triển khai VPS và đăng ký tự phục vụ

> Checkpoint disable771/22-10: [report](roomqc-t08-probe-disable-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t08-probe-disable-local-2026-10-22.json).
> Source01ac08e…/771file,546business+9directory migrations; full control288/288,
> 0fail/skip,exit0; migration8→9 giữ dữ liệu/checksum, Auth thật late-response
> bị fence và installer-only disable không bị runtime bật lại; cleanup18checks0.
> Chưa combined full-vendor metrics/config drill hoặc independent rebuild771.
> Backend770 bên dưới giữ lịch sử, không thừa kế pass;122entries/gates không đổi.

> **Điểm đọc hiện hành 22/10:** [plan điều phối](roomqc-vps-signup-execution-ready-2026-10-22.md)
> và [report timed-local](roomqc-t06-managed-timed-local-2026-10-22.md) là checkpoint
> candidate768/sourcea3aaf6b, full control270/270 có phạm vi. Các checkpoint dưới
> giữ lịch sử; không dùng count/source cũ làm dispatch hoặc nghiệm thu mới.
> [Phiếu70ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) chưa chạy/ký;
> Linux/issuer/rotation/offsite/E2E/tải/pilot vẫn phải có evidence riêng.

> Checkpoint T08 local22/10: [report](roomqc-t08-release-validation-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t08-release-validation-local-2026-10-22.json).
> Source757/546,2495ee9… full control243/243,0 fail/skip,exit0; lint/syntax10 đạt.
> Đã tái hiện và sửa2 fail fixture thiếu exp của source6f3, giữ negative expiry
> và timeout assertions. Source trước/sau run không đổi, cleanup6 label families0.
> Đây là registry release validation có phạm vi; issuer/cross-replica trust,
> revision-atomic health/timed pipeline và indirect audit vẫn mở, không đóng toànT08.
> T04/sourcee5 và A/B/FE/sourcef7 giữ lịch sử, không thừa kế sang2495.
> Primary chỉ nhận docs/artifact; không deploy hoặc mở signup/gate/122 entries.

Phạm vi đã xác nhận: **toàn bộ VPS + signup; Plan + nghiệm thu**. Xem
[bảng điều hành hiện hành](roomqc-vps-signup-preparation-plan-2026-10-21.md#16-bảng-điều-hành-hiện-hành--toàn-bộ-vps--signup)
cho dispatch, xử lý từng đăng ký và vận hành định kỳ; mục16 dưới đây giữ lịch sử
caller725; dispatch mới ở plan16.2 sau T04/candidate755, phần đã có proof giữ hồi quy.

**Checkpoint T04 trước T08 — candidate755/546, sourcee5c5deb…:**
[Đọc kết quả lệnh](roomqc-t04-command-result-local-2026-10-22.md) /
[artifact](../../../artifacts/roomqc-t04-command-result-local-2026-10-22.json).
Handler primary read bằng client key đã kiểm chứng local: full control237/237,
0 skip/fail; lint/syntax đạt; không schema/grant/runtime change. Chưa typed
client/admin UI/browser E2E hoặc VPS. Full-vendor A/B/FE388 của sourcef7 dưới
đây giữ lịch sử, không gán sang755.122 release entries/gates/signoff không đổi.

**Checkpoint nền sourcef7 — lịch sử hồi quy22/10, không là source755:**
[bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md), T01–T25 theo
dependency. Candidate754/546, sourcef7da974…; xem
[report current19](roomqc-m06-current19-direct-local-2026-10-22.md) /
[artifact](../../../artifacts/roomqc-m06-current19-direct-local-2026-10-22.json).

Harness đã cập nhật identity19 bảng và23 FK; không sửa schema/grants sản phẩm.
Có red→green trên PostgreSQL cô lập, negative unauthorized-grant/unknown-table
và restored positives. Direct ACL:228 browser/probe +64 private-service denials;
parent boundaries:23 FK/184 denials/34 snapshots,0 missing/findings. SQL role
proof không thay full indirect/API/workflow audit; full fixture có18/19 bảng có
dữ liệu, không tuyên bố19 bảng ứng dụng đều populated.

Fresh default full A d6d4cddd7fe4/B0678a65fb125 đều terminal0, cleaned23 mỗi run,
independent leftovers0; source/build/schema và final recovery khớp. A/B tuần tự
không thay T21 simultaneous hoặc nghiệm thu release.
Control DB-opt-in233/233 và frontend388/388 (25 files) đều terminal0 trên freeze
hiện hành; TypeScript/lint/syntax đạt. Không cộng subsets thành acceptance.
Giữ invitation15 admin/31 management/19 delivery/22 acceptance/7 caller và34
authority/6 observed races; hotel280/account1764/20 races, employee30/4,
self66/4, password33 +7fault/4races +7caller +7config là hồi quy có phạm vi.

**Nhận tiếp:** current19 indirect +policy135 WARN/FK workload và workflow/
recipient/offboarding/EC10–EC15 chưa có proof →issuer/trust/timed health →
alerts/admission/budget →private signup status/resume/reconcile →hai màn admin →
Linux/TLS/offsite DR/on-call →simultaneous A/B/browser/Android/load/RC/pilot.
Không chạy lại lát đã đạt như việc mới; khi source đổi mới rerun phần liên quan
và freeze candidate tích hợp trước gate. Chi tiết dispatch ở plan16.2.

Advisors A603/B604:19 no-policy INFO +7 FK INFO +442/443 unused-index INFO +135
permissive WARN; harness pass không làm findings biến mất hoặc khép R4/T08.8 đợt/27 gói/
25 việc/70 case/122 unverified và gate L/S/P/U/B, owner/reviewer/signoff giữ nguyên.
Chỉ docs/artifacts được mirror vào primary; không deploy/đổi serving DB/DNS/provider.

**Lịch sử:** [authority754/source472](roomqc-m06-invitation-authority-local-2026-10-22.md)
giữ run b23 thất bạiP0001; private log không cho biết exact label. Synthetic red
tái hiện inventory mismatch riêng, không viết lại nguyên nhân log cũ.
Pagination752/UI751/delivery744/management741/caller738 và các checkpoint dưới
giữ source/proof riêng; không gán lịch sử cho candidate hiện hành.

**Mốc build/config717 — lịch sử, giữ hồi quy:**
[Auth build/config diagnostic](roomqc-m06-password-build-config-local-2026-10-22.md).
Candidate717/540, source trước/sau run khớp. Hai checkout/build --no-cache cùng
exact image/config/7layers/binary; actual diagnostic rebuild cũng khớp image.
Run c3048071d3e0:33/33 gốc +7fault/4races +7actual caller +7config checks đạt;
mỗi config fault no-effect và restored positive. Exit0/stderr0, cleaned13,
exact leftovers0; control209/209. FE128 là lịch sử, không rerun trên717.

**Phiếu tại mốc717 — lịch sử:** EmailAuthFlow invitation/recovery còn SDK-only và full
invitation/pre-profile/offboarding/recovery/observed lock-order matrix; actual
pre-header loss/browser multi-tab/Android; fresh full frozen-source A/B/FE/
advisors/final recovery/cleanup. Build/config đã có scoped local proof, không
giao lại như chưa làm. Cross-builder/registry/wrong-image deployment preflight/
Linux/reviewer còn mở. Tiếp permission/membership, workflow/indirect/policy/FK,
issuer/trust/timed health và đủ tám đợt VPS/signup.122 releaseAcceptance/gates
không đổi, không deploy. Các checkpoint bên dưới chỉ giữ lịch sử/hồi quy.

**Mốc caller715 trước build/config — lịch sử, giữ hồi quy:** [password caller diagnostic](roomqc-m06-password-caller-local-2026-10-22.md).
Ordinary/profile/settings/mobile/forced page/AuthContext đã chuyển sang captured-session
operationID + exact server receipt; không browser PATCH cờ hoặc success trước readback.
Native540 recovery context từ AMR đã có actual proof. Run741ca907795f:
33/33 gốc +7fault/4races +7actual caller checks đạt, exit0/cleaned11/leftovers0;
control207/207, FE128/128. Đây là **diagnostic**, chưa full integrated A/B.
Sau run chỉ thêm hai mobile tests; hai source hashes tách trong report, không gán
proof cũ cho hash mới.

**Phiếu tại mốc715, không thay checkpoint hiện hành:** exact reviewed Auth image freeze/provenance (source hashes khớp
nhưng imageID khác, nguyên nhân chưa rõ), config-disabled/missing-helper faults,
invitation/pre-profile/offboarding/recovery và EmailAuthFlow riêng còn SDK-only,
rồi fresh full A/B/advisors/final recovery/cleanup. Receipt retry/remount đã có
engine/component và actual adapter proof; browser multi-tab/Android/pre-header
network loss/full matrix/reviewer còn mở. Sau đó tiếp permissions/membership và
toàn bộ tám đợt VPS/signup.122 releaseAcceptance/gate chưa đổi, không deploy.
Các mốc705/706 và bảng công việc bên dưới giữ làm lịch sử/contract hồi quy,
không giao lại caller đã triển khai như chưa làm hoặc coi toàn EC05 đã đóng.

Mốc server 706 trước caller diagnostic, chỉ giữ lịch sử/hồi quy: [EC05 native Auth/fault/concurrency diagnostic](roomqc-m06-password-adversarial-local-2026-10-22.md).
Candidate 706/539: 33/33 cùng controls/expected +7/7 checks + 4/4 races,
run 4ab8ebbe05c0 exit 0/cleaned 11/leftovers 0; control 206/206 handle 87371 đã terminal.
Tại mốc 706 chưa fresh full A/B hoặc hoàn tất caller. Phiếu khi đó là forced page/AuthContext,
captured-session/receipt readback/durable unknown-outcome, config/invitation
matrix và image reproducibility ở
[plan mục 15.7](roomqc-vps-signup-preparation-plan-2026-10-21.md#157-phiếu-ec05-hiện-hành--hoàn-tất-server-sau-policysdk-diagnostic).
FE 90/90 trước đó là historical, không là rerun706; Linux/E2E/reviewer/gate riêng.
Tám đợt/27–25–70 và122 releaseAcceptance không đổi; không deploy từ diagnostic.

Mốc self-profile đã đạt local, source cũ giữ hồi quy: [self-profile/avatar full A/B local](roomqc-m06-self-profile-fix-local-2026-10-21.md).
Candidate 694/538, A a04e60eefc89 / B 9ff0e50deda8 exit 0/cleaned 18/run;
66 self observations/4 races, Storage/parallel và các hồi quy cũ đạt; control
199/199, FE 79/79. Nhận EC05 password/forced-change acknowledgement rồi
permissions/membership và invitation/legacy Edge ở plan 15.2.4. EC05 exception,
full matrix/reviewer/browser/Android/VPS/load/pilot còn mở. Không đổi 27/25/70,
122 releaseAcceptance hoặc gate; không phát hành từ một lát local.

Mốc employee trước đó, giữ hồi quy: [employee atomic fix đạt full A/B local](roomqc-m06-employee-atomic-fix-local-2026-10-21.md)
→ caller 15.2.4 trong [plan điều hành](roomqc-vps-signup-preparation-plan-2026-10-21.md).
Candidate 682/537, A 5b6633559ee1 / B dea1abeb5dfb đều exit 0/cleaned 18/run;
280 scope/1.764 actor/20 scoped races + 30 employee checks/4 races và final recovery
đạt. Control 194/194, frontend 51/51; source khớp trước/sau A/B. Nhận
[inventory ban đầu 16 caller](roomqc-m06-employee-caller-inventory-local-2026-10-21.md),
không giao lại diagnosis/RPC/A/B như chưa làm. Reviewer/full matrix/E2E còn mở;
giữ immutable failed attempts, 17 legacy + receipt indirect review vẫn chưa đóng.
Không thay roadmap 27/25/70 hoặc nghiệm thu các đợt phía sau.

**Điểm hiện hành — toàn bộ VPS + signup, Plan + nghiệm thu:**
[kế hoạch chi tiết](roomqc-vps-signup-preparation-plan-2026-10-21.md) và
[quy trình nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).
**A/B thành công gần nhất, source cũ:** [bản sửa account/session năm bảng — A/B local](roomqc-m06-business-actor-fix-local-2026-10-21.md).
Source **668 files/535 migrations**, fingerprint trước A/sau A/B không đổi.
A f1381bbb5dbe / B e2ab861d76b4 đều **exit 0**, cleaned 18 objects/run.
Mỗi run: **1.764/1.764 account/session**, **280/280 hotel scope**, **20/20 races**.
588 negative failures baseline đã đạt; 1.176 before/restored positives giữ nguyên.
Tập identity/expected không đổi; actual Auth/logout/recovery và no-effect assertions.
Race chỉ owner POST/năm bảng, profile lock/session deletion/hai thứ tự lock;
không suy thành mọi role/action/workflow hoặc hủy in-flight GET.
Full control DB **189/189**, 0 skip; 12 focused là subset. 364 policy có trước
không đổi/xóa, thêm đúng 5 restrictive actor policies và 5 statement triggers.
Advisors 605 (17 no-policy/8 FK/445 unused/135 permissive); không drop index theo count.
Tiếp caller/capability/workflow/RPC/Edge/other-table matrix, 17-target/policy/FK →
issuer/trust/atomic timed health và toàn bộ các đợt VPS/signup còn lại.
Hai rebuild tuần tự không thay simultaneous A/B hoặc Linux/E2E/load/pilot.
Chưa đóng R4/T03/T08/122 releaseAcceptance hoặc gate L/S/P/U/B; reviewer còn pending.

**Các handoff bên dưới là lịch sử; không thay điểm hiện hành đầu trang.**

**Cập nhật thực hiện mới nhất:** [lifecycle service A/B đã đạt local](roomqc-m06-lifecycle-local-2026-10-21.md).
Control 154/154, unit riêng 27/27; A 41f2b3011bc6 / B 9b6a13ced16e exit 0,
cleaned 16/run; source 647/531, hash 0f14369a…; không đóng R4/T08/gate release.
Nhận tiếp provider queue/webhook rồi 17-target/policy/FK; không làm lại fixture grace.

Cập nhật 22/10/2026, Asia/Bangkok. Trạng thái: kế hoạch chuẩn bị triển khai;
chưa là phê duyệt deploy, mở signup công khai hoặc thu tiền.

Đây là **điểm đọc đầu tiên hiện hành**, gom thứ tự nhận việc từ các đặc tả đã có,
không mở thêm roadmap. Giữ nguyên **27 gói P0–P8, 25 bước T01–T25, 70 case A–G**.
Các checklist nhỏ bên dưới là phần việc trong T hiện có, không cộng thành case mới.

- [Đặc tả triển khai chi tiết](roomqc-vps-signup-deployment-plan-2026-10-20.md#execution-checklist-2026-10-21)
- [Sổ công việc và phụ thuộc](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json)
- [Ma trận 70 case nghiệm thu](roomqc-vps-signup-acceptance-rollout-2026-10-19.md)
- [Hiện trạng và bằng chứng lịch sử](roomqc-vps-signup-progress.md)

## 1. Kết quả cuối cùng và những gì V1 không làm

Khách chỉ cần: mở RoomQC → đăng ký → xác thực email → khai báo khách sạn →
thêm phòng → mời nhân viên → sử dụng. Khách không thuê VPS, không cài Docker,
không nhập địa chỉ database hoặc khóa Supabase.

RoomQC phải quản lý được: khách thuộc cụm nào; cụm còn nhận mới không và vì sao;
đăng ký kẹt ở bước nào; kết quả tạo dữ liệu đã commit chưa; ai được phép xử lý;
backup khôi phục được không; khi nào phải đóng nhận mới hoặc bổ sung cụm.

V1 cấp workspace trong **cụm đã chuẩn bị sẵn do RoomQC quản lý**. Một workspace
có thể gồm nhiều khách sạn. Không đồng nhất workspace, khách sạn, nhân viên,
phiên hoạt động và kết nối database.

Luồng chính:

    Khách → ứng dụng chung → Control API → Directory DB riêng
                                  ├→ registry / health / admission / affinity
                                  ├→ chủ tài khoản submit tạo dữ liệu ở đúng cụm
                                  └→ worker đối soát receipt, không tạo thay chủ
    Cụm A/B đã chuẩn bị → Auth + DB + Storage + Realtime + Functions
    /super-admin → Hạ tầng | Đăng ký mới
    Ngoài host → backup mã hóa + khóa khôi phục + giám sát/người trực

Một VPS không nhất thiết tương đương một cụm. Phải ghi topology/failure domain.
Hai cụm cùng host không tạo HA khi host hỏng. V1 chưa tự thuê máy theo signup,
chưa tự chuyển khách đang dùng giữa cụm, chưa HA đa vùng, chưa đăng nhập chung
đa cụm, chưa billing thật và **chưa cam kết 100.000 người dùng đồng thời**.

## 2. Baseline lịch sử: đọc cùng handoff hiện hành đầu trang

Bảng dưới giữ lịch sử lifecycle 647-file, không thay baseline parent A/B 662-file
và analyzer/control mới nhất. Điểm nhận việc hiện tại ở mục 16; không dùng số test
hoặc chỉ dẫn nhận provider cũ trong lịch sử để giao lại việc đã khép local.

| Phần | Bằng chứng hiện có | Trạng thái dùng để giao việc |
|---|---|---|
| Email-admin | [Report local](roomqc-m06-email-admin-local-2026-10-21.md): hai rebuild tuần tự A/B đạt, source 643 files/531 migrations | Đã khép lát local có phạm vi; giữ hồi quy, không làm lại từ đầu |
| Source lifecycle đã đạt A/B | 647 files/531 migrations, scoped hash 0f14369ae81c0dcaad55a8b9548b1095ad7ed83ce933ac6cc530789f9aa857ab | Không phải full release manifest hoặc proof cùng phạm vi 643-file cũ |
| Full control DB | Lần chạy đã kết thúc exit 0: 154/154, 0 fail/skip/cancel | Đạt suite này; không thay kiểm thử backend lifecycle thực hoặc 70 case |
| Unit worker/email | Log hiện có: 27/27; hai file test, không cộng vào control suite | Regression đã chạy; chưa thay E2E |
| Lifecycle full-vendor | A 41f2b3011bc6 / B 9b6a13ced16e exit 0, cleaned 16/run; schema/eszip match; 89 recorded checks/run | **Đạt lát local**; ba probe fail trước đó giữ ở report, không thay nghiệm thu toàn R4/T08 |
| Runtime đang phục vụ | Không kiểm lại trong lượt lập plan này; schema 0005/signup=false là quan sát lịch sử | Phải kiểm lại read-only ở T01, không nói đã deploy source mới |
| Console / đăng ký / VPS / offsite | Còn phần API, worker, UI và nghiệm thu đúng môi trường chưa khép | Không mở staging/pilot/public/billing bằng số test xanh |

Sai lệch fixture lifecycle đã xác định:

1. Profile nhân viên cần created_by/hotel binding; harness đã chỉnh.
2. Trigger schema đầy đủ tự tạo staff_status; harness đã chuyển sang UPDATE
   đúng hàng fixture thay vì INSERT trùng.
3. **Đã sửa và kiểm A/B:** helper expired trước đây đặt subscription_end_date = current_date - 1,
   nhưng trigger calculate_grace_period_end tính grace = end_date + 7 ngày.
   Fixture đòi suspended vì vậy thực tế chưa hết grace. Đây chưa là bằng chứng
   lỗi sản phẩm. Fixture nay dùng -10 ngày cho hết grace và assert postcondition;
   không tắt trigger hoặc đổi expected để làm test pass.

Lượt lập plan ban đầu chỉ đọc source/docs/log/ownership, nhận kết quả terminal của
suite đã chạy trước đó và sửa tài liệu/ledger. Không chạy lại backend, không sửa
implementation, không đổi runtime hoặc tác động business Supabase/CRM.
Lượt thực hiện sau đó đã sửa harness và chạy A/B theo report mới; không sửa
handler/RPC/migration sản phẩm, không deploy hoặc tác động dữ liệu đang phục vụ.

## 3. Quy tắc giao việc và quản lý thay đổi

- Implementation chỉ ở roomqc-worktrees/integration, nhánh
  codex/roomqc-parallel-integration. Primary chỉ nhận docs/artifacts đã lọc.
  Không reset/checkout/commit/merge hoặc đưa diff chưa duyệt sang primary.
- Mỗi ticket: một người chịu trách nhiệm, một reviewer; hiện mới gán theo
  vai trò BE/FE/OPS/QA/RQ, **chưa có tên người được phân công**.
- Một đầu mối sở hữu migration/contract. Mọi bảng/field/index mới phải có
  delta thực sự thiếu; tái sử dụng directory/jobs/alerts/commands sẵn có.
- Trước mutation: xác minh host/project/DB/container/network/volume và ownership.
  Chỉ fixture disposable được tạo dữ liệu/fault; không dùng test script cũ nếu
  chưa kiểm target vì một số script local vẫn trỏ môi trường đang phục vụ.
- Không bật scheduler/provider/Internet email/public signup trong test local.
  API key/SSH/DSN/token/mật khẩu chỉ qua secret store/env riêng; báo cáo dùng ref.
- Source đổi thì kiểm lại phần liên quan và tích hợp candidate cuối. Không gắn
  kết quả source cũ cho candidate mới; HEAD đơn lẻ không mô tả dirty tree.
- Trạng thái ticket: planned → in_progress → review → scoped_local_verified →
  environment_verified → release_signed_off. Deferred external không là pass.
- Mọi lệnh async có đường đọc kết quả; HTTP 202 chỉ là đã nhận yêu cầu.
  Timeout không đồng nghĩa chưa commit; không tự gửi lại mutation mới.
- Giữ nguyên 70 case release trong ledger cho đến signoff đúng môi trường.
  Nhiều assertion hoặc nhiều run không làm tăng số case nghiệm thu.

## 4. Thứ tự và khối lượng tám đợt

Các đợt có cổng phụ thuộc. Có thể chuẩn bị contract/UX/bundle song hành khi không
sửa chồng file, nhưng không nghiệm thu đợt sau bằng mock thay đợt trước.
Bảng này là tổng khối lượng đã dự toán, không cộng thêm các checklist con.

| Đợt | Việc chính | Vai trò thực hiện / review | Ngày công dự toán | Điều kiện chuyển |
|---|---|---|---|---|
| 1 | Baseline → lifecycle/provider/current19-target → policy/FK → issuer/trust → atomic health/pipeline | BE+OPS / QA | 8–12 | Quyền/toàn vẹn trong scope không còn High; five-service proof trên candidate |
| 2 | Alert/outbox/dispatcher/ack/resolve | BE+OPS / QA | 3–5 | Fault/restart/retry/dedupe local đạt; external còn pending rõ |
| 3 | Command authority/result → admission/affinity/reservation → budget tổng | BE+OPS / QA+RQ | 2–3 | Tranh suất cuối/replay/close-race đúng; có budget trước signup |
| 4 | Owner signup/status/resume → receipt reconcile → abuse/callback/email | BE+FE+OPS / QA | 4–6 | D01–D14 local đúng; D15 giữ external gate riêng |
| 5 | Admin client/cache → Hạ tầng → Đăng ký mới → UX | FE+BE / QA+RQ | 4–6 | API thật, đủ E01–E08, mọi chức năng có đường click |
| 6 | Linux/TLS/upgrade → offsite restore → external alerts/on-call | OPS+BE / QA+RQ | 4–7 | B01/B09/F01–F09 đúng môi trường, đo RPO/RTO |
| 7 | A/B đồng thời → browser/Android E2E → load/soak → RC | QA+BE+FE+OPS / RQ | 4–6 | G01–G07 và audit đủ 70 case, capacity/rollback rõ |
| 8 | Pilot nội bộ → cohort nhỏ → tổng kết | OPS+RQ / QA | 1–2 và ≥7 ngày quan sát | G08; quyết định mở rộng dựa trên số liệu |

Tổng **30–47 ngày công**, dự phòng **36–57**, cộng ≥7 ngày quan sát pilot và thời
gian chờ external. Không phải thời gian chạy agent hay lịch cam kết. Ước lượng
lại sau disposition R4, sau pipeline và khi có cấu hình VPS staging.

## 5. Bảng điều phối đủ T01–T25

Phụ thuộc/case lấy nguyên từ ledger; nội dung chi tiết theo các mục 6–13 dưới đây.
T08 bao gồm khép R4 và trust/registry, không chỉ dựng cluster mới.

| Bước | Gói | Phụ thuộc | Vai trò / review | Case | Đầu ra chính |
|---|---|---|---|---|---|
| T01 — Baseline và fixture | P0-01, P0-03 | — | BE/OPS / QA | A01, A02, A03 | Source/dirty/image/schema/config manifest; read-only runtime inventory; exact-owned target và cleanup scope. |
| T02 — Directory migration và runtime bền vững | P1-01, P1-02 | T01 | BE/OPS / QA | A04, A05, A06, A07 | Empty/populated upgrade, checksum/rerun/two-migrator; runtime least privilege, volumes/restart/readiness/shutdown. |
| T03 — Live authority và command receipts | P1-03 | T01, T02 | BE / QA/OPS | A08, A09, A10, A11 | Operation/capability/AAL matrix; live/revoked/session/race proof; mutation+receipt+audit, replay/version conflict. |
| T04 — API contract và compatibility | P0-02, P1-03 | T01 | BE/FE / QA | A03, A08, A09, A10, A11 | OpenAPI/router/caller delta; DTO/error/message/requestId/cursor/version/idempotency; compatible rollout order. |
| T05 — Exporters và probes đúng target | P2-01 | T01, T04 | OPS/BE / QA | B01, B02, B03 | Host/mount/OS/DB inventory; private endpoints/fixed query/bounded probes; fault/permission/TLS/Linux comparison. |
| T06 — Atomic health và timed pipeline | P2-02 | T02, T05, T08 | BE/OPS / QA | B04, B05, B06, B07 | Credential/target/release/policy fencing; persisted windows/stale/race; timed five-service pipeline and safe shutdown. |
| T07 — Alert lifecycle và dispatch | P2-03 | T06 | BE/OPS / QA | B08, B09 | Event+outbox atomic; dedupe/ack/resolve/bounded retry; local sink and external host-loss received proof. |
| T08 — R4 closure, registry, issuer và trusted release | P3-01 | T02, T03, T04 | BE/OPS / QA | A06, B02, C01, C02, C03, C04 | Email/service/provider/current19-target (17 legacy +2 receipts) and policy/FK decisions; issuer/trust independent from runtime/live target; lifecycle/SSRF/tamper proof. |
| T09 — Admission, reservation và affinity | P3-02 | T06, T07, T08 | BE / QA/OPS | C05, C06, C07, C08, C09, C10 | 20 request/1 slot and 20 replay/1 intent; close/reserve/expiry/first-call races; preserve existing routes. |
| T10 — Pool, queue và noisy-neighbor budget | P3-03 | T09 | BE/OPS / QA | G05, G06 | Replicas×pool+vendor+backup/migration+reserve; bounded concurrency/deadlines; provisional budget before signup, final operating limit at T23. |
| T11 — Owner signup, setup-status và resume | P4-01 | T03, T04, T09, T10 | BE/FE / QA | D01, D02, D03, D04, D05, D06, A03 | Private setup-status/server nextAction; verified owner submit; affinity/refresh/two-tab/new device, no duplicate or trial reset. |
| T12 — Durable receipt reconciliation | P4-02 | T11 | BE / QA/OPS | D07, D08, D09, D10, D11, A07 | Binding+one job before remote; lease/fencing; missing/unavailable/conflict; kill/response-lost/backfill/replay proof; no tokens in queue. |
| T13 — Abuse, proxy, email và callbacks | P4-03 | T11, T12 | BE/OPS/FE / QA | D12, D13, D14, D15 | Persistent multi-instance limiter/proxy/NAT/direct Auth; signup-off preserves login/reset/invite; real inbox/domain proof separate from sink. |
| T14 — Admin routes/client/cache authority | P5-01 | T03, T04 | FE/BE / QA | A03, E08 | Two admin entries independent of hotel selection; typed API/scoped query keys; logout/authority-change abort stale responses. |
| T15 — Hạ tầng list/detail và command dialog | P5-02 | T06, T07, T09, T14 | FE/BE / QA/RQ | E03, E04, E05 | Real cluster health/backup/admission data; impact/reason/version/idempotency/result recovery; unknown not empty or healthy. |
| T16 — Đăng ký mới và hỗ trợ | P5-03 | T12, T14 | FE/BE / QA/RQ | E01, E02, E05, E08 | Server search/cursor/totals over 1,000 metadata; timeline/job/receipt/correct-cluster tenant-summary; recheck enqueue/result without recreate or impersonation. |
| T17 — Usability/accessibility/Back/scroll | P5-04 | T13, T15, T16 | FE/QA / RQ | E01, E02, E03, E04, E05, E06, E07, E08 | 390px/zoom/keyboard/focus/contrast; one reachable menu; route scroll/Back context; find stuck registration under 30 seconds. |
| T18 — Linux full vendor bundle và upgrade | P6-01 | T06, T08 | OPS/BE / QA | F01, F02, F03, F04, B01 | Pin full vendor release; preflight/dry-run/checkpoints; TLS/private ports/reboot/upgrade/cert; stop on wrong host or populated volume. |
| T19 — Consistent offsite backup và restore | P6-02 | T12, T18 | OPS / QA/RQ | F05, F06, F07, F08 | Directory+Auth/DB/queues+object bytes+manifest; encrypted offsite/readback and independent key; clean host-loss restore/reconcile, measured RPO/RTO. |
| T20 — Runbook/external alert/on-call | P6-03 | T07, T18, T19 | OPS / QA/RQ | B09, F09 | Named on-call/escalation/reopen policy; host/control/disk/DB/cert/credential/backup/stuck-signup drills; fault/detected/received/ack/recovery timeline. |
| T21 — Hai backend độc lập cùng chạy | P7-01 | T12, T13, T18 | QA/BE/OPS / QA | G01, G02, G03 | Independent Auth/JWT/DB/objects/channels/volumes; wrong-cluster deny plus positive; drain/down/affinity and same-UUID routing/cache proof. |
| T22 — Browser/Android E2E và fault windows | P7-02 | T17, T21 | QA/FE/BE / QA | A03, A08, A09, A10, A11, D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, E01, E02, E03, E04, E05, E06, E07, E08, G01, G02, G03, G07 | Signup→verify→hotel→rooms→invite→staff login; desktop/Android/deep-link/Back/logout/revoke; receipt/DB assertions and legacy cutover. |
| T23 — Load, soak, capacity và cost | P7-03 | T10, T21, T22 | QA/OPS / BE/RQ | G04, G05, G06 | Defined hardware/images/data/think-time; conditional 10→25→50→100 sessions and 60m soak; p95/p99/errors/pools/IO/locks/queue/event-lag/cost/max-tested/operating-limit. |
| T24 — RC, cutover và release gate packet | P7-04 | T19, T20, T22, T23 | QA/OPS / BE/FE/RQ | G07 | Consistent source/image/schema/config/contract; secret scan and full 70-case release audit; defects/limits/backup/rollback/approval, pilot gate separate. |
| T25 — Pilot và quyết định mở rộng | P8-01 | T24 | OPS/RQ / QA | G08 | One internal hotel; stable 24–48h before 5–10 cohort; ≥7 days observation with drills; SLO/defect/capacity/cost/support report; separate public/billing approval. |

## 6. Đợt 1: phiếu nhận ngay, không cần khóa VPS/provider thật

### 6.1. T01/T04 — khóa baseline và hợp đồng

1. Chụp branch/HEAD/dirty manifest/lockfiles và source hash sau khi nhận việc.
2. Kiểm runtime read-only: service identity, image, proxy/ports, schema directory,
   flags, volume ownership; không in env đầy đủ.
3. Lập allowlist exact-owned test targets và before-state cho vùng phải bảo vệ.
4. Đọc latest definitions của RPC begin/batch/finish, trigger grace, notification
   emitter, session guards và override migrations; không chỉ đọc file gốc.
5. Chốt caller → quyền → transaction → effect allowlist → expected HTTP/SQL.
6. Giữ contract public owner khác service worker; worker không cần owner JWT.
7. Đầu ra: baseline đã lọc + matrix + test inventory. Thiếu target/authority
   hoặc có overlap dữ liệu đang phục vụ thì dừng mutation.

### 6.2. T03/T08 — hoàn tất lifecycle proof đang dở

**Đã khép lát local:** các bước dưới giữ làm checklist hồi quy; proof A/B ở report
mới nhất. Điểm nhận việc theo mục 16 và handoff đầu trang; không giao lại sửa
fixture grace hoặc provider đã khép local.

File trực tiếp: scripts/control-backend-lifecycle-checks.mjs,
scripts/test-control-backend-sandbox.mjs, server/control/backend-lifecycle.test.mjs.
Product entry: supabase/functions/check-subscription-status/index.ts,
_shared/subscription-atomic-worker.ts, _shared/cronAuth.ts trong functions.

1. Sửa fixture grace đã nêu ở mục 2: end_date quá hạn đủ xa, ví dụ -10 ngày;
   để trigger thật tính grace. Thêm SELECT/assert ngay sau setup kiểm trạng thái,
   end_date, grace timestamp và eligibility của từng tenant đối chứng.
2. Kiểm lại mọi fixture full-schema trước rerun: tự sinh profile/staff, constraint,
   timezone CURRENT_DATE, số phòng và trigger phụ; không disable guard.
3. Với snapshot tài chính, thêm fixture có hàng hợp lệ nếu muốn kết luận
   “không đổi tiền”; snapshot bảng rỗng không đủ cho kết luận non-empty workload.
4. Chạy syntax/focused trước fresh backend, rồi source identity mới. Không lặp
   expensive run sau lỗi mà chưa giải thích được expected/actual.
5. Verify missing/wrong secret; anon/owner/staff gọi service RPC bị chặn;
   service hợp lệ có positive control. SQL error/timeout không tính là deny pass.
6. Verify scope/trial/active/grace/suspended/date-today/ngoài scope; cùng request
   replay, hai begin, 20 batch replays, stale/future cursor và payload/limit đổi.
7. Fault trước commit rollback transition+receipt+outbox. Mất response sau HTTP
   200 và durable commit phải retry đúng run/request/index, không nhân bản effect.
8. Dùng hàng/barrier/lock proof cho renewal/lease/deadline; không dựa vào sleep.
9. Thử worker cũ trả muộn và hai worker cùng cursor; actual Edge chạy >100
   transitions qua nhiều batch, delivery counts đối chiếu DB.
10. Phân biệt fixtureClose diagnostic với recovery sản phẩm. Recovery chỉ đạt
    khi gọi entry sản phẩm đúng quyền và thấy fencing/audit/receipt thực;
    không tính UPDATE SQL fixture là proof quyền/phục hồi sản phẩm.
11. Fresh A đạt rồi freeze source → fresh B tham chiếu ownership A completed/
    cleaned và cùng identity. Giữ cả lịch sử fail; cleanup 16 object/run hiện tại.
12. Khép khi toàn scenario đạt, không schema drift sau bỏ trigger fault,
    regression cuối đạt và report MD/JSON đã lọc. Đây vẫn chưa là T08 tổng.

### 6.3. T08 — hồi quy provider và 17-target disposition

Tên17-target giữ nhãn inventory lịch sử và anchor tương thích. Khi nhận việc
trên candidate hiện hành phải rà **19 target =17 legacy +2 receipts**, không
bỏ employee/password receipt hoặc coi direct-grant proof là indirect disposition.

Mục 1–5 là checklist hồi quy lát provider đã khép local A/B, không là việc cần
tái hiện lại từ đầu. Mục 6–7 và phần policy/FK còn cần proof theo handoff mới nhất.

File chính: process-email-queue/index.ts, email-provider-webhook/index.ts,
_shared/email/provider.ts, _shared/email/webhook.ts và latest SQL
record_email_provider_event trong supabase/migrations.

1. Dùng sink/signing key riêng fixture, chặn Internet và override Mailpit URL;
   không dùng mặc định trỏ inbox đang phục vụ.
2. Test raw-body signature, thiếu/sai key, timestamp ngoài cửa sổ, malformed,
   unsupported type và body limit; valid signed event có positive control.
3. Test duplicate exact; cùng event ID đổi provider/type định danh phải conflict.
   Field payload không dùng không được đổi định danh hoặc dữ liệu nghiệp vụ.
   Giữ hồi quy unknown provider ID đến trước finish và replay khi bind delivery.
4. Test delivered/delayed/bounced/complained/failed/suppressed theo precedence
   đã review; out-of-order, exact replay và lost-response sau provider accepted.
5. Chụp delivery/attempt/event/outbox; chứng minh callback không đổi owner,
   workspace, plan hoặc tạo provisioning. Accepted không đồng nghĩa tới inbox;
   không hứa exactly-once email ngoài provider.
6. Với mỗi19 target hiện hành: direct/column/inherited grant, RPC/Edge/view/definer/
   trigger, USING/WITH CHECK, implicit writes, actor/session/tenant predicate,
   positive/negative/race evidence, verdict/reviewer/residual risk.
7. Không gắn allSafe=true từ direct grants=0 hoặc chỉ vì catalog discovery xong.

### 6.4. T08 — policy/FK, R3/R5 và R6/R7

1. 135 permissive-policy WARN: group effective role × table × operation,
   phân tích OR/AND thật, allowed/denied rows và update owner/key; có tenant/hotel
   chéo và role/session revoked. Chỉ gộp policy sau regression semantics.
2. Đối chiếu8 FK inventory lịch sử với7 current advisor findings theo identity,
   không coi count giảm là đã xử lý. Dùng catalog candidate, dataset xác định,
   child lookup/parent update-delete,
   EXPLAIN/BUFFERS, lock/write cost và index size. Mỗi dòng có add/retain/
   no-change kèm lý do; unused-index fresh DB không là chỉ thị xóa.
3. R3 issuer: installer quyền hẹp, secret refs/revisions/lease/recovery/revoke,
   không runtime tự cấp lại authority cho mình khi mất credential.
4. R5 trust: approved manifest/digest/schema và source phê duyệt độc lập với
   runtime; endpoint live/tự khai manifest không chứng minh release đáng tin.
   Rà import/package chưa pin, chọn compatible release và ghi hash bundle thực;
   không âm thầm nâng Supabase lên latest.
5. R6 atomic health: check credential/target/release/policy revision **trong
   transaction ghi snapshot**, không chỉ trước probe; test đổi revision ngay
   giữa probe và commit để stale worker không ghi healthy.
6. R7 pipeline: registry → collector → năm service probes → DB health → admission;
   source timestamps/mount đúng; fault từng service, restart, stale và recovery
   theo thời gian thực; bounds pool/concurrency/deadline/graceful shutdown.
7. Đầu ra cuối: current-source local integrated report, A/B repeatability,
   advisors/dispositions, cleanup. Hai rebuild tuần tự không thay T21 đồng thời.

## 7. Đợt 2–3: cảnh báo, điều khiển và sức chứa trước mở đăng ký

### T07 — cảnh báo phải có đường xử lý

1. Tái sử dụng alerts/events/outbox; transition và outbox cùng transaction.
2. Fingerprint/dedupe/cooldown/severity; ack ghi người/lý do/time, không resolve
   hoặc reopen admission. Resolve chỉ từ điều kiện phục hồi đã định nghĩa.
3. Dispatcher claim/lease/bounded retry/dead-letter, crash trước/sau send/ack;
   kết quả không lưu secret/raw provider payload.
4. Local sink test trước; T20 mới chứng minh received ở ngoài host.
5. Runbook riêng cho stale, disk/inode, DB, credential/cert, backup, signup kẹt.
   Có owner/escalation, không chỉ hiện biểu đồ.
6. Bàn giao B08; B09 chưa pass nếu cả monitor và app vẫn cùng host.

### T03/T04/T09/T10 — lệnh an toàn và admission

1. Chốt operation × capability × AAL; platform authority không phụ thuộc
   khách sạn đang chọn. Kiểm live account/role/session tại thao tác nhạy cảm.
2. Reason + expectedVersion + idempotency key + payload hash; mutation/receipt/
   audit nguyên tử. Cùng key khác payload trả conflict.
3. Bổ sung đường đọc command result trong OpenAPI/router/client trước làm nút
   recovery UI; tên route/schema là delta cần chốt, chưa có endpoint sẵn.
4. 20 request khác tranh một slot, 20 replay một intent, hai admin cùng version,
   close-vs-reserve, expiry-vs-first-provision; không vượt hạn mức.
5. Giữ affinity sau Auth tạo ở A: B còn chỗ không phải lý do tạo lại danh tính
   hoặc đổi route sang B. Draining chặn khách mới nhưng giữ khách cũ.
6. Metric/admission đổi sau RPC bắt đầu: reconcile receipt, không expire/reassign.
7. Inventory tổng connections = replica × pool của từng API/worker/vendor/
   backup/migration + reserve. Chốt acquire/query/request timeout, queue depth,
   worker concurrency và per-tenant/report/upload budgets trước signup.
8. Bàn giao C05–C10/G05–G06 có phạm vi; operating limit cuối vẫn đo ở T23.

## 8. Đợt 4: đăng ký mới bền vững, không tạo trùng

### 8.1. Luồng khách và dữ liệu chuẩn

| Bước | Server phải làm | Khách nhìn thấy / khi lỗi |
|---|---|---|
| Bắt đầu | Validate slug/body, challenge/limiter, reserve và affinity nguyên tử | Hết chỗ: lý do dễ hiểu, không tự chuyển người đã có affinity |
| Đăng ký/xác thực | Auth tại cụm đã gán; email/callback đúng origin/workspace | Chưa verify: resend có cooldown; không tạo dữ liệu khách sạn |
| Owner submit | Live verified owner + binding + một live job trước remote call | Disable double submit; refresh đọc status server, không báo thành công sớm |
| Cluster commit | Tenant/hotel/profile/trial/receipt đúng một transaction | Response mất: “đang xác minh”, không nút tạo lại |
| Reconcile | Worker đọc receipt đúng cluster/binding/routingVersion | Missing → chờ owner; unavailable → retry có trần; conflict → needs_review |
| Active | Directory activation khớp receipt; replay giữ tenant/trial | Vào khách sạn, thêm phòng, mời nhân viên |
| Lỗi cần hỗ trợ | Error code/requestId/nextAction riêng tư | Hiện mã hỗ trợ, không lộ SQL/receipt/email của người khác |

Setup-status là read riêng tư của owner đã xác thực, không dùng public bootstrap
để tiết lộ job/receipt. Public bootstrap chỉ cấu hình routing tối thiểu được duyệt.
Mỗi DTO có version/state/step/nextAction/retryAfter/requestId theo contract.

### 8.2. Checklist T11/T12/T13

1. Thêm setup-status với live ownership và DTO riêng, no-store/timeout/error rõ.
2. Binding/job commit trước remote; unique live-job; request/receipt/version
   identity ổn định qua refresh/hai tab/new device.
3. Worker chỉ reconcile; không lưu JWT/password chủ trong queue hoặc tự provision.
4. Lease/fencing và recovery: kill sau claim/trước call/sau call/trước ack;
   stale worker trả muộn không activate. Backfill job cũ idempotent có giới hạn.
5. Tách missing/unavailable/conflict; retry có trần/dead-letter/recheck đúng quyền.
   Không “success thủ công”, sửa receipt hoặc đổi cụm để hết trạng thái kẹt.
6. In-memory limiter hiện có không đủ multi-instance: storage bền vững, shared
   limits, trusted proxy chain, forged forwarded IP/NAT và direct Auth paths.
7. Tắt public signup phải chặn đủ đường mới, vẫn giữ login/reset/invite khách cũ.
8. Callback/link state đúng origin và workspace, chống return URL tùy ý; expired/
   reused link có hướng quay lại đúng. Email truth tách queued/accepted/delivered.
9. Android: sửa allowlist hẹp trong src/lib/workspace.ts khi thêm setup-status;
   hiện chỉ bootstrap/provision/signup-intents, không mở wildcard.
10. Regression WorkspaceStart/Register/EmailVerification/Onboarding/AuthCallback,
    native auth-links/transport/abort/logout. Bàn giao D01–D14 local;
    D15 cần domain/sender/inbox thật được cấp riêng.

## 9. Đợt 5: hai màn quản trị đơn giản, dễ thao tác

File layout hiện có: src/components/super-admin/SuperAdminLayout.tsx.
Đăng ký route/client/hooks/pages mới sau khi chốt contract; tên file mới là
deliverable dự kiến, không khẳng định màn đã tồn tại.

### 9.1. Hạ tầng

- List ưu tiên: tên cụm, phục vụ khách cũ, nhận khách mới, lý do chặn,
  workspace/limit, lần cập nhật, backup verified và alert quan trọng.
- Detail: host/mount, CPU/RAM/disk/inode/DB, năm service, release/schema,
  timeline/policy/admission. Thiếu/cũ hiển thị unknown/stale, không 0 hoặc xanh.
- Lệnh validate/close/reopen/drain/limit có impact preview + reason + version,
  giữ command ID khi F5/mất response và đọc kết quả trước retry.
- Không có root shell/restore-production một click. Acknowledge alert không
  tự mở admission; reopen vẫn theo policy và phê duyệt.

### 9.2. Đăng ký mới

- Search slug/requestId; filter state/step/cluster/time/error; cursor/totals phía
  server trên 1.000 metadata. Không tải tất cả rồi lọc trong browser.
- Detail: timeline, binding/version, job/lease/retry/error, receipt summary,
  nextAction/runbook và tenant-summary metadata tối thiểu từ đúng cụm.
- Recheck chỉ enqueue một receipt-reconcile job có quyền/idempotency/audit;
  202 phải có đường xem completion. Không giả danh owner/tạo lại tenant.
- Có entry trong menu chính; bỏ menu phụ lặp nhưng giữ mọi route/action truy cập được.

### 9.3. UX và cache

Tối đa một primary action mỗi context. Màu thông dụng tương phản, nhãn chữ kèm
icon; không pastel và không chỉ phân biệt bằng màu. Test loading/empty/forbidden/
unavailable/stale/partial riêng; 390px/zoom/keyboard/focus/screen-reader cơ bản.

Back giữ filter/cursor/scroll đúng trang trước; chuyển route mới hiện nội dung
từ đầu kể cả sidebar đang cuộn thấp. Query keys gồm authority/workspace/cluster;
logout/revoke/chuyển context hủy request và bỏ response cũ. Admin global không
bị hotel selection/onboarding guard chặn. Người thử phải tìm đăng ký kẹt và
hướng xử lý trong <30 giây. Bàn giao E01–E08 bằng API thật.

## 10. Đợt 6: gói VPS, backup và vận hành

### T18 — bộ cài Linux có thể chạy lại an toàn

1. RoomQC chọn OS/architecture/profile mẫu, host inventory và public/private origins.
2. Pin full vendor release/digests/lockfiles tương thích; release manifest gồm
   frontend/Edge/control/native/schema/config/contract, không dùng tag latest.
3. Preflight → planned diff/dry-run → checkpoint → apply rõ target → verify.
   Host sai/port bận/volume có dữ liệu/secret thiếu/checksum drift phải dừng.
4. Network private cho DB/exporters/Prometheus/Studio; reverse proxy TLS/CSP/
   WebSocket/upload/callback; không mount Docker socket hoặc public admin tools.
5. Directory role migration khác API/worker; data volumes/log rotation/restart/
   reboot/upgrade/cert/credential rotation có smoke test và rollback tương thích.
6. Installer không format/xóa/init đè, không sửa migration history để qua lỗi.
   Bàn giao F01–F04/B01 trên Linux thật.

### T19 — backup phục hồi được khi mất host

1. Snapshot set nhất quán: directory + cluster DB/Auth/queues + object bytes +
   manifest/checksums/version/watermark; không chỉ dump nghiệp vụ.
2. Mã hóa, upload offsite khác host, readback/checksum; key recovery giữ độc lập.
3. Restore vào host/volume sạch với provider/dispatcher tắt, không ghi source.
4. Verify login/mapping/receipt/rooms/invites/object bytes, reconcile job in-flight;
   không route khách tới bản restore partial.
5. Fault thiếu object/dump/key/sai checksum/version phải fail rõ.
6. Diễn tập host gốc không còn; đo RPO ≤24h / RTO ≤4h theo mục tiêu đề xuất cần duyệt.
   Bàn giao F05–F08, chi phí/retention/đường export/delete được chốt.

### T20 — có người nhận và xử lý sự cố

Probe/heartbeat ngoài host; thử host/control/metric/disk/DB/cert/credential/
backup/signup kẹt. Lưu fault → detected → received → ack → recovery.
Đích nhận thử được cấp phép, người trực và người thay ca có tên; không chỉ
Mailpit hoặc log “send success”. Bàn giao B09/F09 và runbook đóng/mở nhận mới.

## 11. Đợt 7–8: kiểm thử tích hợp, đo tải và pilot

### T21/T22 — không thay E2E bằng unit test

1. Hai backend độc lập **cùng chạy**: Auth/JWT/DB/objects/channels/volume/keys.
   Có positive ở đúng cụm và deny token/data/storage/realtime chéo.
2. Cùng tenant UUID giả lập vẫn route theo workspace+cluster; A drain/down,
   người đã có affinity A không fallback B, khách mới chưa ràng buộc có thể chọn B.
3. Browser và Android thật/giả lập: signup → verify → hotel → rooms → invite →
   staff login; thêm F5/hai tab/mất mạng/deep link/reset/invite/Back/logout/revoke.
4. Mọi bước có assertion DB/receipt/số lượng effect, không chỉ toast/screenshot.
5. Legacy/directory flag cutover và rollback frontend không ép khách cũ onboarding.
6. G01–G03/G07 và A/D/E liên quan đạt ở đúng release/environment.

### T23 — capacity bằng số đo

- Chốt hardware/disk/IO/network, release, dataset/workspace-room-staff profile,
  think-time và workload đọc/ghi/report/upload; số sessions khác connections.
- Load 10 → 25 → 50 → 100 phiên, chỉ tăng khi mức trước đạt; soak ≥60 phút.
  Đo p50/p95/p99, 5xx, pool wait/exhaustion, locks, IO/WAL, memory, queue và event lag.
- Noisy-neighbor kèm tenant đối chứng và signup, 1.000 directory metadata.
  Dừng khi integrity/permission lỗi, cấp trùng, pool/disk critical hoặc backlog
  không hồi; không tiếp tục để có con số users lớn hơn.
- Kết quả: max-tested, **operating limit thấp hơn có headroom theo phép đo**,
  cluster slots theo workload, cost/khách/tháng và trigger thêm cụm.
- Mục tiêu 1.000 khách sạn là phân bổ tăng dần qua nhiều cụm; không suy từ tổng
  10–50 nhân sự/khách sạn hoặc từ một benchmark thành cam kết concurrent toàn hệ thống.

### T24/T25 — RC và pilot

RC packet: release manifest nhất quán, audit toàn 70 case, Critical/High quyền/
dữ liệu/cấp phát/restore đã khép, backup/rollback/on-call/killswitch/operating
limits/defects/deferred rõ và người duyệt. Không giấu fail bằng đổi định nghĩa case.

Pilot bắt đầu một khách sạn nội bộ; chỉ thêm 5–10 sau 24–48h ổn định, trong
capacity đã đo và có người trực. Quan sát ≥7 ngày, có drill backup/alert;
tổng kết availability/SLO/lỗi/support/chi phí. Public signup và billing xin
phê duyệt riêng, không tự bật khi pilot kết thúc.

## 12. Hợp đồng API cần chốt trước UI

Prefix proxy theo cấu hình; bảng này mô tả source hiện có, không khẳng định
endpoint đã deploy. Implement-foundation/partial không có nghĩa đủ production.

| Contract | Source hiện tại | Điều kiện hoàn tất |
|---|---|---|
| POST /signup-intents | Foundation | Durable abuse limit, challenge, admission/affinity race, body strict |
| GET /workspaces/{slug}/bootstrap | Foundation | Minimal public config/no-store, bỏ recovery-write chỉ sau worker/resume/backfill proof |
| POST /workspaces/{slug}/provision | Foundation | Live verified owner, stable binding/job/receipt, token chỉ trong request |
| GET /workspaces/{slug}/setup-status | OpenAPI đã có; app handler và native allowlist chưa có | Private live-owner read, state/step/nextAction/retryAfter/requestId; test actual API, không coi spec là endpoint chạy |
| GET /admin/clusters và /{id} | Implemented-local | Freshness/provenance/backup/admission reasons/cursor có proof |
| POST /admin/clusters/{id}/commands | Partial-local | Capability/AAL, reason/version/idempotency/audit/result recovery |
| GET /admin/clusters/{id}/command-result?operation=… | Handler/OpenAPI implemented-local trên755; full control237 đạt | Đã primary scoped read/lost-response/restart/negative DB proof; còn typed client và browser fault, chưa đóng toànT04 |
| GET /admin/workspaces và /{id} | Implemented-local | Search/cursor/server totals và timeline đúng authority |
| GET /admin/workspaces/{id}/tenant-summary | OpenAPI đã có; handler chưa có | Correct-cluster bounded gateway; metadata-only, không impersonate |
| POST /admin/workspaces/{id}/recheck | OpenAPI đã có; handler chưa có | Một job/receipt, 202 và completion read, reason/version/idempotency; không thay bằng support/reconcile đồng bộ hiện có |
| GET /admin/alerts, /admin/backups; POST /admin/alerts/{id}/acknowledge | OpenAPI đã có; handler chưa có | Grants/cursor/audit; ack không resolve; completed không đồng nghĩa restore-verified |

Đối chiếu source trong lượt chốt plan: app.mjs chỉ route workspace bootstrap/
provision; admin-read.mjs có overview/clusters/workspaces/audit, chưa có handlers
cho các path setup-status/tenant-summary/recheck/alerts/backups/ack nêu trên.
T04 command-result là delta đã có actual HTTP/DB proof ở
[reportT04](roomqc-t04-command-result-local-2026-10-22.md). Phần inventory còn lại
là kiểm tra tĩnh, không phải test HTTP hay khẳng định
runtime đang phục vụ có cùng source. Recovery hiện còn trong bootstrap GET và
support/reconcile đồng bộ; chưa thay worker receipt-reconcile bền vững T12.
Chỉ bỏ recovery cũ sau backfill/resume/fault proof để không bỏ rơi đăng ký đang kẹt.
Layout/App chưa có hai route Hạ tầng/Đăng ký mới; không tính layout hiện có là
T15/T16 hoàn tất. Mỗi delta phải qua OpenAPI → handler → permission → typed
client/native allowlist → test API/UI; không build UI gọi endpoint chỉ có trên giấy.

Lỗi an toàn: code/message/requestId; 401 thiếu xác thực, 403 thiếu quyền,
409 conflict/business refusal được phân loại, 429 retry-after bounded, 503 unavailable.
Hidden 404 chỉ theo read contract đã duyệt. Không trả raw SQL/token/secret/body.

### 12.1. Đề xuất cụ thể cho đọc kết quả lệnh và hai entry quản trị

Phần này ban đầu là thiết kế giao T04/T14; nay command-result đã có OpenAPI và
handler kiểm chứng local trên755/546, full control237 đạt. Giữ reviewer/release
acceptance mở; typed client, lưu context và browser faults chưa làm. Hai entry
quản trị vẫn là đề xuất. Không phát sinh task hoặc case mới.

**Đọc lại kết quả khi mất phản hồi:** đề xuất
`GET /admin/clusters/{id}/command-result?operation={operation}`, header
`Idempotency-Key` do client tạo và lưu **trước** POST. Prefix theo config hiện có.
Không chỉ tra bằng commandId do server sinh: nếu mất phản hồi đầu tiên, client
chưa biết commandId. Replay POST cùng key/payload vẫn là đường tương thích cần giữ.

- Lookup ràng buộc live platform actor/canonical authority cluster + target cụm +
  operation + idempotency key; không trả lệnh của người khác chỉ vì biết key.
  Quyền đọc dùng capability đã duyệt; không kế thừa quyền từ cache/JWT metadata.
- 200 chỉ khi đọc được kết quả durable đúng identity; DTO tái dùng CommandResult
  với commandId/status/targetVersion/result tối thiểu và requestId. Không trả raw
  SQL, secret ref resolved, request body hoặc thông tin tenant không liên quan.
- Chưa tìm thấy không chứng minh lệnh đã thất bại: transaction có thể chưa commit.
  UI hiện “Chưa xác định kết quả”, kiểm tiếp có deadline/backoff, hoặc replay cùng
  key và cùng payload. Không sinh key mới, tự đổi expectedVersion hay mở gate.
- Đọc receipt từ primary nhất quán, `Cache-Control: no-store`; không dùng replica
  đang lag để kết luận chưa có mutation. Status lỗi theo contract chung; không
  tự thêm enum vào schema. Nếu sau này có job async, phải có result-read riêng
  trước khi trả202; không coi started/accepted là succeeded.
- Client giữ operation/key/target/context/payload hợp lệ qua F5 trong vùng lưu
  theo actor, không lưu JWT/password. Logout hoặc đổi authority phải hủy request,
  không hiển thị kết quả muộn của actor cũ. Chưa rõ outcome thì giữ mã hỗ trợ
  trong audit/server, không phát lại bằng danh tính khác.
- Nghiệm thu A08–A11/E04–E05: mất response trước headers và sau durable commit;
  hai tab/20 replay; cùng key khác payload; wrong actor/target; revoke trước read;
  restart; không effect/audit/receipt lặp. Adapter proof không thay browser fault.

**Hai entry dự kiến:** `/super-admin/infrastructure` (list/detail cụm và lệnh)
và `/super-admin/registrations` (list/detail đăng ký và recheck). Đây là tên route
đề xuất, chưa khẳng định App.tsx đã có. T14 đăng ký cùng menu và guard platform;
T15/T16 chỉ tích hợp khi handler thật đủ. Không lồng menu kho/khách sạn, không
phụ thuộc selectedHotel hoặc ép operator đi qua onboarding khách hàng.
Mỗi detail giữ returnTo đã validate nội bộ, filter/cursor/scroll; mở link trực
tiếp có fallback list phù hợp, không back sang domain khác hoặc trang ngẫu nhiên.

## 13. Chính sách vận hành và tiêu chí đo

### 13.1. Không vượt quyền hoặc thay đổi dữ liệu giữa khách hàng

Live Auth/profile/session cho lệnh nhạy cảm; không dùng user_metadata để quyết
quyền, không coi JWT chưa hết hạn là session chưa bị thu hồi. Service_role chỉ
server; service workers có quyền service riêng, không giả phiên của owner.

Grants/RLS/USING/WITH CHECK/definer/view/trigger đều nằm trong review. Không
GRANT ALL, tắt RLS hoặc thêm SECURITY DEFINER để chữa permission error.
Tổng pool phải tính mọi replica/vendor/worker và connection mode tương thích
transaction/session semantics, không lấy công thức chung làm sizing thực tế.

### 13.2. Defaults hiện hành và mục tiêu đề xuất

| Chỉ số | Quy tắc/target | Cách nghiệm thu |
|---|---|---|
| CPU / RAM / DB connections | Default block CPU ≥85%/5m; RAM available <15%/2m; DB ≥85% budget/2m | Dùng policy DB/code thực; boundary/window/restart/revision races |
| Disk/inode | Default data free <15% hoặc <10GiB; inode free <10% chặn ngay | Đúng data mount, không overlay/tmpfs; fixture/thực đo |
| Freshness | Mục tiêu metric ≤60s; >120s đóng nhận mới | Timed loss/restart; khách active giữ route |
| Bootstrap/setup-status / reserve | Đề xuất p95 server ≤500ms / ≤1s | Trace dưới workload đã định nghĩa |
| Provision | Đề xuất p95 ≤10s sau submit hợp lệ, không tính chờ email | Tách queue/RPC/DB/activation |
| Admin list | Đề xuất p95 server ≤1s/1.000 metadata | Bounded payload/cursor/query plan |
| Soak | ≥60 phút; 5xx ngoài fault <1%; không backlog/leak vô hạn | Time series + baseline sau recovery |
| Pilot | Đề xuất availability ≥99,5% API quan trọng trong ≥7 ngày | Probe ngoài host, mẫu số/maintenance công bố |
| Backup | Đề xuất RPO ≤24h / RTO ≤4h | Host-loss offsite restore thực |
| Host alert | Đề xuất detect≤180s, received≤300s | External timeline; ack/recovery đo riêng |

Các target đề xuất chưa là SLA. Manual-close/reopen latch không bị xóa chỉ
vì CPU xanh; policy có version và thay đổi phải được duyệt/test lại.

### 13.3. Phiếu budget bắt buộc của T10, chốt lại bằng T23

Không chọn số user bằng công thức RAM hoặc đặt một connection cho một nhân viên.
OPS/BE lập hai bảng riêng trước mở signup; giá trị chưa đo giữ TBD, chưa duyệt
không áp vào runtime:

| Nhóm | Số liệu cần điền từ cấu hình thực | Điều kiện được nhận |
|---|---|---|
| Mỗi DB directory/cụm | max_connections thực, reserved/superuser/maintenance, headroom, phiên bản/pool mode | Tổng **upstream DB connections** cực đại không vượt usable budget, có đường vào xử lý sự cố |
| Control API và từng worker | Số replica × pool max; acquire/query/lock/request deadline; queue depth/concurrency | Worker/replica tăng không nhân vượt ngân sách; không giữ transaction khi gọi HTTP |
| Auth/REST/Storage/Realtime/Functions | Pool/connection theo đúng vendor config; replication/listener/session needs | Không mặc định mọi service dùng transaction pooling; thử tương thích driver/prepared/session state trước đổi mode |
| Metrics/exporter/backup/migrator | Role và pool riêng, lịch chồng nhau, max thời gian/IO; quota log/object | Kể cả overlap hoặc một nguồn treo vẫn còn budget và admission fail closed đúng policy |
| App sessions và workload | Phiên đăng nhập đồng thời, request mix/think-time, upload/report/Realtime, giới hạn mỗi tenant | Tách client socket khỏi DB pool; nếu có pooler không cộng hai lần cùng upstream connection |

Mỗi dòng có config/source ref, max đã cấu hình, max quan sát, owner và reviewer.
Đo tại T23 cả pool wait/exhaustion, timeout, locks, I/O/WAL, queue depth/age,
memory và tenant đối chứng. Hạn mức vận hành phải thấp hơn max-tested với
headroom được duyệt; thiếu phép đo giữ “chưa công bố sức chứa”.
Test burst signup kèm booking/report/upload, backup overlap và noisy-neighbor;
queue quá trần trả lỗi/retry rõ, không tích vô hạn hoặc tự tăng pool để chữa chậm.
Không đặt work_mem/max_connections theo một phép chia RAM đơn giản, không đổi
pool mode/vendor version trên hệ thống đang phục vụ trong lượt lập plan này.

## 14. Đầu vào cần RoomQC cung cấp và cổng phát hành

Không xin secret trong chat. Danh sách dưới đây gom để làm sau khi cần quyền;
không chặn phần local, nhưng không được bỏ qua lúc nghiệm thu môi trường thật.

| Đầu vào/quyết định | Cần trước | Cách bàn giao |
|---|---|---|
| Tên người BE/FE/OPS/QA/reviewer và người duyệt gate | Nhận ticket/mở gate | Tên/role/phạm vi trách nhiệm; không tự giả đã phân công |
| VPS Linux staging, profile/topology, SSH/CI scope | T18 apply | Host inventory + secret ref + quyền apply target cụ thể |
| roomqc.com: DNS/app/API/admin/callback origins | TLS/D15/staging E2E | Origin/allowlist và người quản DNS; chưa coi đã cấu hình |
| Resend/SMTP, sender verified, webhook và inbox thử | D15 | Secret refs + quyền gửi tới inbox được kiểm soát |
| Backup offsite khác host/retention/key custodian | T19/pilot | Bucket/storage ref, retention đã duyệt, người giữ khóa độc lập |
| External heartbeat/alert destination/on-call/escalation | B09/F09/pilot | Người/đích nhận thử và lịch trực |
| Trial/quota/expiry/export/delete/support/MFA policy | Tính năng/gate tương ứng | Quyết định bằng văn bản; giữ policy cũ khi chưa duyệt |
| Cohort pilot, data consent, quota, kill-switch owner | P | Danh sách được duyệt và điều kiện dừng |

| Cổng | Có thể quyết định khi | Không được suy từ |
|---|---|---|
| L — local integrated | Current-source integrated proof, quyền/receipt/recovery/cleanup đủ scope | Số lượng unit/control tests hoặc một local slice |
| S — staging | Reviewed release/host, Linux/TLS/private network/backup/rollback/authority | L đạt hoặc Docker local chạy |
| P — pilot | RC case phù hợp, no unresolved Critical/High đã nêu, offsite restore/on-call/cohort | Admin UI hiện được hoặc email sink đạt |
| U — public signup | Pilot, capacity/abuse/cost review và phê duyệt riêng | Hết 7 ngày hoặc một VPS còn RAM |
| B — billing thật | Provider/payment/security/business acceptance và phê duyệt riêng | Checkout draft/trial/sandbox pass |

Không cổng nào được mở bởi phiếu kế hoạch này.

## 15. Test, báo cáo, điều kiện dừng và rollback

Mỗi ticket bàn giao: scope/T/P/case; owner/reviewer; source+dirty manifest;
schema/image/config/contract; target/environment/run/time; expected/actual;
command thực chạy, exit/pass/fail/not-run; evidence đã lọc; defects/limitations;
advisors trước/sau nếu liên quan; cleanup và bước nhận tiếp.

Chuỗi kiểm tra: syntax/focused → liên quan frontend/native/backend →
full control DB → full-vendor A → freeze → B repeatability khi cần →
integration E2E đúng môi trường → release audit 70 case.
Không cộng subset/unit/race thành tổng acceptance; không ghi lệnh dự kiến là đã chạy.

Chỉ dùng runner sau --help và kiểm ownership. scripts/test-control-backend-sandbox.mjs
là runner disposable hiện hành; B dùng expected-build-state của A thành công/
cleaned. scripts/test-control-directory.mjs đứng sau test:control:db.
Không chạy test-email-local hoặc lifecycle script cũ vào business target để
lấy proof. Thay schema dùng forward migration đúng CLI, không sửa file lịch sử.

Dừng chuyển đợt/mở rộng nếu có: sai target/ownership, quyền chéo, mất dữ liệu,
tenant/trial/receipt trùng, unknown commit bị retry thành mutation mới, checksum/
schema drift, pool/disk critical, backup chưa restore được hoặc thiếu người trực.

Rollback an toàn: đóng **nhận mới** trước; giữ route và dữ liệu khách active;
dừng claim mới; đối soát việc in-flight/receipt; rollback binary/config tương
thích schema; forward fix nếu cần. Không down-migrate/reset/xóa tenant/chuyển
khách sang DB khác. Khôi phục backup chỉ theo runbook, target riêng và quyền đã duyệt.

## 16. Điểm bắt đầu khi được triển khai

Dispatch hiện hành ở plan16.2: candidate755/546, sourcee5c5deb… sau T04 read endpoint.
[ReportT04](roomqc-t04-command-result-local-2026-10-22.md) ghi full control237,
scope/limits; không giao lại handler đã đạt. Các bước dưới tiếp nền sourcef7,
không gán full-vendor A/B hoặc FE388 sang755.
[Report current19](roomqc-m06-current19-direct-local-2026-10-22.md) giữ source và
run riêng; authority/source472 cùng các checkpoint cũ là lịch sử.

1. T01/T08: review packet hiện hành; A d6d4cddd7fe4/B0678a65fb125 terminal0, cleaned23/run và independent leftovers0, source/build/schema khớp. Direct19 và parent23
   là hồi quy đã đạt, không chẩn đoán lại18-vs19 hoặc tăng expected mù.
2. T03/T08: current19 indirect/policy135 WARN/current7 FK workload; giữ invitation34/6
   và UI/context/pagination, bổ sung recipient/offboarding/EC10–EC15/workflow thiếu.
3. Sau delta source mới: focused→freeze→FE/TypeScript/lint/full control/full A→B
   đúng scope; không lặp source không đổi để thay reviewer hoặc release audit.
4. Tiếp issuer/trust/revision-atomic timed health→alert→admission/budget→signup/
   resume/reconcile→hai admin consoles→Linux/TLS/DR/on-call→simultaneous A/B/
   browser/Android/load/RC→pilot và quyết định mở rộng.

Current frontend388/388 và control233/233 đã rerun terminal0, không thay E2E.
122 releaseAcceptance/gate L/S/P/U/B/owner/reviewer/signoff không đổi.
Khóa/quyền external theo mục14; giữ not-run/deferred đúng phần.

