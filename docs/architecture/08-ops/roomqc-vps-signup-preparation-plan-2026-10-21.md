# RoomQC — kế hoạch chuẩn bị triển khai quản lý VPS và đăng ký tự phục vụ

> Checkpoint T08 local22/10: [report](roomqc-t08-release-validation-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t08-release-validation-local-2026-10-22.json).
> Source757/546,2495ee9… full control243/243,0 fail/skip,exit0; lint/syntax10 đạt.
> Đã tái hiện và sửa2 fail fixture thiếu exp của source6f3, giữ negative expiry
> và timeout assertions. Source trước/sau run không đổi, cleanup6 label families0.
> Đây là registry release validation có phạm vi; issuer/cross-replica trust,
> revision-atomic health/timed pipeline và indirect audit vẫn mở, không đóng toànT08.
> T04/sourcee5 và A/B/FE/sourcef7 giữ lịch sử, không thừa kế sang2495.
> Primary chỉ nhận docs/artifact; không deploy hoặc mở signup/gate/122 entries.

**Bản giao việc theo xác nhận “Toàn bộ VPS + signup / Plan + nghiệm thu”:**
đọc [bảng điều hành hiện hành](#16-bảng-điều-hành-hiện-hành--toàn-bộ-vps--signup)
để biết việc nhận ngay, cách xử lý mỗi đăng ký và lịch vận hành; dùng
[T01–T25](roomqc-vps-signup-launch-checklist-2026-10-21.md#5-bảng-điều-phối-đủ-t01t25)
để giao triển khai và [phiếu diễn tập](roomqc-vps-signup-acceptance-protocol-2026-10-21.md#20-phiếu-diễn-tập-vận-hành-đăng-ký-và-vps)
để nghiệm thu. Phần lập kế hoạch này không cấp quyền mở gate; implementation
sau đó được ghi riêng ở checkpoint hiện hành bên dưới.

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

**Cách đọc để giao việc:** mục 0 là thứ tự bàn giao toàn bộ tám đợt; mục 2.2
là các quyết định cần RoomQC chốt; mục 5 là việc cụ thể và điều kiện đóng từng đợt.
[Bảng T01–T25](roomqc-vps-signup-launch-checklist-2026-10-21.md#5-bảng-điều-phối-đủ-t01t25)
giữ file/input/dependency/role/case/deliverable; [protocol nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md#6-bộ-nghiệm-thu-theo-từng-đợt)
quy định bằng chứng và môi trường. Checkpoint đầu trang dưới đây là hiện hành;
các checkpoint cũ chỉ để truy vết, không phải phiếu nhận việc mới.

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

Ngày lập: 21/10/2026; cập nhật hiện hành: 22/10/2026 (Asia/Bangkok)
Phạm vi: toàn bộ control plane VPS + quy trình đăng ký workspace mới  
Trạng thái: **kế hoạch chuẩn bị triển khai, chưa phải phê duyệt staging/pilot/public**

**Phạm vi đã xác nhận:** toàn bộ VPS + signup. **Đầu ra:** plan chi tiết + bộ
nghiệm thu; không chỉ màn quản trị VPS hoặc form đăng ký.

**Mốc server 705/706 trước caller diagnostic — lịch sử, giữ hồi quy:**
[native Auth guard diagnostic705](roomqc-m06-password-guard-diagnostic-local-2026-10-22.md)
và [fault/concurrency diagnostic706](roomqc-m06-password-adversarial-local-2026-10-22.md).
Candidate **706/539**, cùng 33 controls/expected **33/33**, thêm **7/7 checks và
4/4 revocation races**; run 4ab8ebbe05c0 exit 0/cleaned 11, exact leftovers 0.
Control DB **206/206** handle 87371 đã terminal. Đây là diagnostic một backend,
**chưa fresh full A/B, chưa hoàn tất caller/EC05 hoặc nghiệm thu release**.
FE 90/90 là lịch sử, không phải rerun trên candidate 706.

Phiếu nhận tại thời điểm 706 là forced page/AuthContext, captured-session/receipt readback/durable
unknown-outcome; config faults, invitation/recovery và image reproducibility
trước full frozen-source regression theo mục 15.7. Extension source hashes khớp
705 nhưng image ID khác; chưa xác định nguyên nhân, không nới invariant exact
image. Sau đó tiếp permissions/membership, invitation/legacy Edge và đủ tám đợt.
Không deploy VPS/serving/provider; giữ 122 releaseAcceptance và gate chưa đổi.

**Mốc self-profile đã đạt local trên source cũ, giữ hồi quy:** [self-profile/avatar đã qua full A/B local](roomqc-m06-self-profile-fix-local-2026-10-21.md).
Candidate **694/538**, A a04e60eefc89 / B 9ff0e50deda8 exit 0, cleaned 18/run;
source trước/sau A/B khớp. Mỗi run giữ 280 scope + 1.764 actor + 20 scoped races
và 30 employee checks/4 races; thêm **66 self observations/4 races**, actual local
Storage/parallel writes, final recovery/schema freeze. Control **199/199**, FE
**79/79**. 18 self baseline failures đã đạt, 40 prior positives giữ nguyên.
Nhận EC05 password/forced-change acknowledgement → EC10–EC15 permissions/membership
→ invitation/legacy Edge trong 15.2.4, rồi toàn bộ tám đợt. EC05 exception vẫn mở,
không suy toàn bộ authority đã an toàn. Reviewer/browser/Android/VPS/load/pilot và
122 releaseAcceptance/gate giữ nguyên; [protocol mục 17](roomqc-vps-signup-acceptance-protocol-2026-10-21.md#17-nghiệm-thu-self-profileavatar-và-ngoại-lệ-password-còn-mở).

**Mốc employee trước đó, giữ hồi quy:** [employee atomic fix đã qua full A/B local](roomqc-m06-employee-atomic-fix-local-2026-10-21.md).
Candidate **682/537**: A 5b6633559ee1 / B dea1abeb5dfb đều exit 0, cleaned 18/run;
source trước/sau không đổi. Mỗi run giữ **280 scope + 1.764 actor + 20 scoped races**,
thêm **30 employee checks/4 races**, final permission recovery/schema freeze đạt.
Control **194/194**, frontend 51/51. Không dùng diagnostic thay full reference.
Reviewer/full matrix/browser/Android còn mở. Nhận [16 caller ban đầu](roomqc-m06-employee-caller-inventory-local-2026-10-21.md)
trong 15.2.4; không giao lại audit fix/15.2.5 như chưa làm. Failed evidence giữ
bất biến; tám đợt/27–25–70 và gate không đổi.

**A/B đạt gần nhất trong scope/source cũ:** [bản sửa account/session năm bảng — A/B local](roomqc-m06-business-actor-fix-local-2026-10-21.md).
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

Các mốc A/B trước giữ làm lịch sử/hồi quy. Account/session direct REST đã có
bằng chứng giới hạn theo handoff; nhận caller/capability/workflow/RPC/Edge và
other-table matrix rồi indirect/policy/FK và toàn bộ roadmap. Không giao lại
hai bản sửa đã kiểm như việc chưa triển khai.

**Nghiệm thu:** [protocol từng đợt và mẫu evidence](roomqc-vps-signup-acceptance-protocol-2026-10-21.md)
và [70 case gốc](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
[Authority inventory v3/direct controls](roomqc-m06-authority-inventory-local-2026-10-21.md)
giữ làm regression có phạm vi, không là kết luận quyền gián tiếp đã an toàn.
Chưa đóng R4/T08, releaseAcceptance hoặc gate L/S/P/U/B.

Tài liệu này là bản kế hoạch điều hành để biến thiết kế hiện có thành một bản phát
hành có thể kiểm chứng. Nó không thay thế các tài liệu gốc và không tạo thêm scope:

- [Kế hoạch thực thi 25 bước](roomqc-vps-signup-execution-plan-2026-10-19.md)
- [Phiếu nhận việc và 70 case](roomqc-vps-signup-launch-checklist-2026-10-21.md)
- [Sổ tiến độ](roomqc-vps-signup-progress.md)
- [Sổ giao việc 27 gói / 25 bước / 70 case](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json)

## 0. Tóm tắt giao việc sau xác nhận phạm vi

**Quyết định sản phẩm:** khách đăng ký là dùng được; RoomQC vận hành các cụm VPS
chuẩn bị sẵn, không tạo/thuê một VPS cho mỗi khách. Directory giữ mapping và
điều phối; dữ liệu nghiệp vụ ở đúng cụm, không dồn mọi request qua control plane.

**Bản kế hoạch này đủ để chia việc, chưa đủ để phát hành.** Đã có code và proof
local theo handoff đầu trang; chưa có nghiệm thu staging/pilot. Không báo phần
trăm hoàn thành từ số test. Người triển khai/reviewer/OPS cần được chỉ định tên
trước khi ký nhận; hiện vẫn null trong ledger.

| Thứ tự bàn giao | Phần cần hoàn tất | Dấu hiệu được chuyển bước |
|---|---|---|
| 1 — nền an toàn | T01–T04/T08: caller/capability/workflow còn thiếu, contract, indirect policy/FK và issuer/trust | Matrix có mẫu số/expected rõ, positive/negative/recovery; giữ hồi quy 280 scope + 1.764 account/session + 20 scoped races, không suy full permission từ các bộ này |
| 2 — biết máy có nhận khách được không | T05–T07: metric đúng host/mount, atomic health, timed pipeline, alert/outbox | Metric cũ/lỗi đóng nhận mới; phục hồi không tự bỏ manual gate; cảnh báo có đường nhận thật ở staging |
| 3 — phân bổ không quá tải | T09–T10: reservation, affinity, tranh suất cuối, pool/queue budget | Không cấp trùng/vượt limit; khách đã gắn cụm không bị chuyển DB; budget tạm có headroom |
| 4 — đăng ký dùng được và tự phục hồi | T11–T13: setup-status, owner submit, durable reconcile, abuse/email | Một workspace/tenant/hotel/trial/receipt qua refresh, retry, hai tab và mất response; email external nghiệm thu riêng |
| 5 — RoomQC quản lý được | T14–T17: Hạ tầng + Đăng ký mới, command result, recheck, UX | API thật, mọi thao tác có entry, không success giả từ 202; tìm đăng ký kẹt <30 giây |
| 6 — vận hành khi máy hỏng | T18–T20: Linux/TLS, upgrade, offsite restore, on-call | Cài lại/reboot an toàn, restore trên host sạch đo được RPO/RTO, người trực nhận cảnh báo |
| 7 — quyết định có thể dùng thật | T21–T24: A/B đồng thời, browser/Android E2E, tải/soak và RC | Audit đủ 70 case đúng môi trường, operating limit có số đo, rollback và người duyệt rõ |
| 8 — mở dần, không mở ồ ạt | T25: pilot ≥7 ngày rồi đánh giá mở rộng | Cohort được duyệt, số đo lỗi/khả dụng/chi phí/support; public signup cần quyết định riêng |

Đây là thứ tự bàn giao, không thay dependency từng T trong ledger. T14 có thể
chuẩn bị theo contract, T18 theo nền đã đủ đầu vào; không chờ nghiệm thu mọi
môi trường để viết source. Việc cần secret/quyền nằm ở mục 14 của phiếu nhận
việc; tiếp tục local được nhưng không đánh external là pass.

**Điểm bắt đầu hiện hành:** mục16.2/sourcee5c5deb… sau T04 read endpoint;
current19 indirect/policy/FK workload và workflow còn thiếu, rồi issuer/trust/
timed health và đủ tám đợt. T04 full control237 đạt trên755; direct19/parent23,
FE388 và fresh default full A/B sourcef7 giữ hồi quy lịch sử, không gán sang755.

Checkpoint752/751/744/741/738/725/build717 và employee/self-profile giữ report lịch sử riêng, không thay browser/Android/E2E hoặc reviewer. T01–T25/case A01–G08, dependency, estimate và điều kiện dừng nằm trong bộ tài liệu liên kết; không sinh roadmap hoặc task mới.

## 0.1. Cách nhận việc và báo cáo tiến độ từ bản này

Một nguồn điều phối duy nhất: T01–T25 và dependency trong ledger; bảng chi tiết
file/input/actions/test/case của từng T ở [phiếu giao việc mục5–13](roomqc-vps-signup-launch-checklist-2026-10-21.md).
Không tạo lại roadmap vì một diagnostic mới hoặc nhận toàn bộ test count là %.

| Mốc bàn giao | Nội dung phải có trước khi nhận | Được tuyên bố sau khi đạt |
|---|---|---|
| Giao việc | Named owner/reviewer, T/P/case, candidate, target, allowed effects, expected, rollback và đầu vào đủ | Ready for implementation, chưa là đã làm |
| Local scoped | Actual endpoint + DB/effects/receipt, positive/negative/recovery/fault/race theo scope, terminal và cleanup | Local verified đúng scope, không tự đóng releaseAcceptance |
| Local tích hợp | Fresh candidate freeze, regression đủ và reviewer, không gán proof source cũ cho source mới | Đề nghị gate L; không là staging hoặc T21 simultaneous |
| Linux staging | Target/release được duyệt, TLS/private network, restart/upgrade, real integrations/restore đúng case | Đề nghị gate S theo evidence, không tự mở pilot |
| RC/pilot | T24 packet, no unresolved Critical/High quyền/dữ liệu/cấp phát/restore, on-call và cohort được duyệt | Quyết định P để bắt đầu pilot; chưa phải kết quả G08 |
| Mở rộng | T25/G08 ≥7 ngày, capacity/cost/support report và quyết định RoomQC | Đề nghị U riêng; B/billing thật vẫn phê duyệt riêng |

Ngày công 30–47, dự phòng 36–57 là **ước lượng toàn bộ backlog tại lần dự toán**,
không cam kết số ngày lịch hoặc thời gian còn lại chính xác ở checkpoint hiện hành.
Re-estimate sau authority disposition, timed pipeline và inventory VPS; không
cộng các checklist con vào estimate lần nữa. Tên người nhận/reviewer hiện chưa
được chỉ định, không tự gán đã nhận việc.

**Thứ tự nhận ngay:** lấy mục16.2 làm dispatch duy nhất: current19 indirect/
policy/FK workload và recipient/offboarding/EC10–EC15/workflow còn thiếu;
giữ các bản sửa password, employee/self-profile và invitation đã có làm hồi quy.
Mục15.7/15.2.4 giữ chi tiết kỹ thuật và lịch sử, không giao lại phần đã đạt như
việc chưa làm. Tiếp issuer/trust →T05/T06 pipeline và các dependency trong ledger.
T04 có thể chốt contract sau T01; UI T14 chuẩn bị sau T03/T04, nhưng T15/T16
phải dùng API thật, không dùng fixtures để nghiệm thu API.

## 1. Kết quả cần đạt

### Cách giao và nghiệm thu ngay khi bắt đầu triển khai

1. RoomQC chốt tên người nhận BE/FE/OPS, reviewer và người duyệt gate; các vai
   trò có sẵn trong phiếu T01–T25, chưa có tên thì không tự ghi đã phân công.
2. Nhận từng phiếu theo dependency; ghi candidate/target/allowed effects trước
   chạy. Một phiếu phải có deliverable, expected/actual và rollback, không chỉ
   ghi “code xong”. Giữ hai mức: đủ input để code và đủ proof để nghiệm thu.
3. Đợt kế tiếp nhận phần còn mở đúng dispatch16.2 và checkpoint đầu trang;
   15.2.4 giữ inventory caller/capability/workflow, không ghi đè dispatch mới.
   A/B employee 15.2.5 và self-profile là hồi quy
   trên source cũ, không thay full proof trên candidate hiện hành. Mỗi đường gọi
   khóa expected rồi controlled baseline; fail thì lưu terminal/effects, phân loại
   trước sửa. Source đổi phải regression/rebuild theo tác động. Reviewer khép lát
   đúng scope, không đóng toàn T03/T08 hoặc các đợt còn lại từ một RPC đạt.
4. Mỗi cuối đợt bàn giao theo protocol: đã làm / test thực chạy / chưa kiểm /
   defect / external input / quyết định chuyển bước. 70 case giữ ID và mẫu số;
   blocked/deferred/not-run không được tính pass, unit count không là tiến độ %.
5. Trước staging cần inventory VPS/origins/secret refs; trước restore cần offsite
   và người giữ khóa; trước pilot cần cohort/on-call/killswitch. Thiếu chỉ defer
   đúng phần, vẫn triển khai local trong scope; không gửi khóa trong chat.

### 1.1. Trải nghiệm khách hàng

Khách hàng chỉ cần:

1. Mở `roomqc.com`.
2. Chọn đăng ký và khai báo tên doanh nghiệp/slug.
3. Xác thực email.
4. Nhập thông tin chủ sở hữu và khách sạn đầu tiên.
5. Chờ hệ thống cấp workspace trong cụm đã sẵn sàng.
6. Thêm phòng, mời nhân viên và bắt đầu sử dụng.

Khách hàng **không** phải biết VPS, Docker, Supabase, database, cluster, secret,
địa chỉ IP hoặc lệnh terminal. Khi mất mạng, refresh, mở tab mới hoặc đổi thiết bị,
trạng thái đăng ký phải đọc lại từ server và tiếp tục được.

### 1.2. Trải nghiệm vận hành RoomQC

Quản trị nền tảng phải trả lời được trong một màn hình:

- cụm nào đang phục vụ khách cũ;
- cụm nào được phép nhận khách mới;
- cụm bị chặn vì lý do gì (stale, thiếu dung lượng, lỗi probe, backup trễ,
  release không tương thích, draining, credential lỗi);
- signup nào đang kẹt ở bước nào và hành động tiếp theo là gì;
- một lệnh đã commit hay chỉ mới được nhận;
- backup gần nhất có thể restore được không;
- ai đã thực hiện thay đổi và có thể rollback ra sao.

Hai entry point dự kiến của operator là `/super-admin/infrastructure` và
`/super-admin/registrations` (route cuối phải chốt ở T14, chưa có proof đã tồn tại).
`/settings/audit-log` chỉ giữ vai trò nhật ký của
khách sạn, không biến thành console quản trị VPS.

### 1.3. Ranh giới V1

V1 dùng nhiều workspace trên các cụm Supabase/VPS đã được RoomQC chuẩn bị sẵn.
Không tạo một VPS riêng cho mỗi lần đăng ký. Một workspace có thể có nhiều khách
sạn. Không tự di chuyển tenant đang hoạt động, không tự thuê máy theo từng signup,
không HA đa vùng, không SSO xuyên cụm và chưa mở billing thật trong phạm vi này.

## 2. Hiện trạng và quyết định bắt buộc

### 2.1. Bằng chứng đã có

| Hạng mục | Trạng thái hiện tại | Cách sử dụng trong plan |
|---|---|---|
| Control DB/API/migration | Local đã có history, checksum, lock, restart và health proof | Giữ làm regression; chạy lại trên candidate mới |
| Lifecycle/recovery/email/authority | Parent candidate 662-file có A/B kết thúc; thêm hai file analyzer/test riêng, control 177/177 | Không thừa kế count frontend cũ hoặc nói backend A/B bao phủ analyzer mới; 17-target indirect còn mở |
| Hotel-delete / receipt / stale authority | Hai High có bản sửa/proof local A/B; positive/replay/10 concurrent refusals/hai actual lock races đạt | Giữ baseline lịch sử và regression; chưa có browser UI proof hoặc release signoff |
| Parent FK boundary | A/B: 22 FK có dữ liệu, bốn actor, DELETE/key UPDATE, 176 denials/run và 32-table rollback snapshots | Chỉ boundary SQL; mọi indirect path và offboarding production chưa nghiệm thu |
| Policy semantics inventory / hotel scope / live actor | Inventory matched 135 warnings trên 50 bảng/6 roles; candidate 668/535 có A/B 280 scope + 1.764 actor + 20 scoped races/run | Giữ scoped regressions; full caller/capability/workflow/other-table, remaining allowed-row/indirect review vẫn mở; không đánh toàn bộ policy safe |
| Password/email/invitation boundary | Pagination752/545:15 compiled admin +31 management +19 Auth/SMTP +22+7,388FE/228DB-opt-in control;125 IDs/3 pages và successful compiled create/resend (subset19); UI captured-context giữ hồi quy | Full authority/recipient/offboard matrix, observed locks/E2E/external delivery và fresh default full backend A/B/reviewer còn mở; không snapshot/load hoặc release claim |
| Monitoring/exporter | Có source và fixture local; chưa chứng minh host VPS thường trực | Chỉ ghi `local_verified`, chưa được mở admission production |
| Registry/admission | Có directory/reservation/affinity local | Chưa đóng E2E với signup và live Auth |
| Console | Có layout super-admin, chưa đủ màn Hạ tầng/Đăng ký mới | Xây sau khi contract API ổn định |
| VPS/TLS/offsite | Chưa có bằng chứng environment_verified | Cần staging Linux và quyền operator |
| Browser/Android/load/pilot | Chưa chạy | Giữ gate cuối, không suy ra từ unit test |

### 2.2. Quyết định không được tự suy đoán

Trước khi nhận các bước tương ứng, RoomQC phê duyệt các quyết định dưới đây.
Các con số là đề xuất chuẩn bị, **chưa là config đã áp hoặc SLA đã cam kết**.
Người duyệt sản phẩm là RoomQC; owner kỹ thuật/OPS/reviewer phải ghi tên khi nhận.

| Quyết định cần chốt | Nội dung phải bàn giao, không gửi secret trong chat | Chặn bước nào nếu chưa có |
|---|---|---|
| Trial và gói sử dụng | Số ngày; limit hotel/phòng/nhân viên/storage; grace/readonly/expiry; không reset trial bằng retry hoặc tạo lại slug | T03/T10/T11 và nghiệm thu quota |
| Dữ liệu signup bỏ dở | Thời hạn intent/binding/job; retention/PII; thao tác hủy/xóa có audit; trường hợp remote đã commit nhưng directory chưa biết | T11/T12/T19; không expiry rồi tái cấp khi outcome chưa rõ |
| Tên miền và callback | Roomqc.com đã được người dùng nêu; cần chốt exact HTTPS app/API/admin/callback/Android origins và bên quản DNS | T13/T18/T22; không wildcard redirect |
| VPS mẫu | Linux/CPU/RAM/disk/IOPS/mount/network, existing workloads, host IDs và ngân sách | T05/T10/T18/T23; không suy sức chứa từ RAM hoặc số tài khoản |
| Admission và quyền operator | Headroom/threshold/freshness; ai được close/reopen/drain; MFA/AAL/break-glass; manual close không tự mở sau recovery | T03/T06/T09/T20 |
| Mục tiêu phục hồi | Đề xuất RPO ≤24h / RTO ≤4h cần duyệt; scope directory + từng cụm + object bytes và failure domain | T19/T24; phải đo host-loss restore, không chỉ có file backup |
| Email thật | Sender domain/provider account/secret refs/webhook, DNS status, inbox được phép test | T13/D15/T22; chưa coi tài khoản/domain đã verify từ lịch sử trình duyệt |
| Backup offsite | Đích ngoài host, encryption/retention/versioning, key custodian độc lập và quyền restore tối thiểu | T19/T20; không mất cả backup và key khi mất VPS |
| Vendor và custom Auth | Commit/digest được duyệt, SBOM/vulnerability disposition, maintainer extension, exact image/schema/client rollout và rollback | T08/T18/T24; native password guard không phải migration-only |
| Người vận hành/pilot | Owner/reviewer/gate approver/on-call/escalation; cohort 1 nội bộ rồi 5–10 khách và quyền dừng signup | T20/T24/T25; không tự mở public từ local pass |

V1 khởi đầu bằng **cụm A trên VPS có sẵn do RoomQC quản lý**, mở thêm cụm B khi
capacity profile đã đo yêu cầu. Không tự thuê VPS theo mỗi signup, không tự
di chuyển tenant đã bind. Nếu control plane và cụm dữ liệu cùng một host ở pilot,
phải ghi nhận cùng failure domain; backup/alert vẫn phải ngoài host đó.

1.000 khách sạn ×10–50 nhân sự là 10.000–50.000 **tài khoản**, không đồng nghĩa
cùng lúc hoạt động. T23 đo workload/mức đồng thời và operating limit từng cụm;
mục tiêu 100.000 concurrent không được hứa trong V1. Đóng gói pooled multi-tenant
và quota/health gate trước, scale theo số đo, không bật public vượt tested limit.

Thiếu quyết định chỉ chặn gate liên quan; vẫn hoàn thiện contract, fixtures, local
tests và tài liệu. Secret/quyền external ghi reference + người giữ + hạn cần,
không nhét token/SSH key/provider password vào plan hoặc chat.

## 3. Mô hình trạng thái: bám schema hiện có, không thêm enum tùy ý

### 3.1. Cluster

Cluster status hiện là `active | draining | offline`; host status riêng là
`active | maintenance | retired`; validation là `pending | valid | invalid`.
Không gộp ba trục này thành chuỗi enum mới. Nhãn UI “đang kiểm tra”, “sẵn sàng”,
“bị chặn” là kết quả tổng hợp của validation/health/admission, không là giá trị
được ghi vào cluster.status. Mọi mutation phải có target ID, expected version,
reason, actor, command ID, audit và receipt. Draining không làm mất route khách cũ.

### 3.2. Signup/workspace

Workspace status hiện là `reserved | provisioning | active | suspended |
migrating | expired`. “Chờ email”, “đã xác minh chủ” là bước hành trình được DTO
setup-status tính từ bằng chứng Auth/binding, không tự thêm vào cột status.
`waiting_owner`, `retry`, `needs_review`, `cancelled` thuộc job state, không thuộc
workspace state. Reservation chỉ expired sau khi xác nhận chưa tạo workspace.

Không đổi `cluster_id` sau khi Auth/owner đã tạo dữ liệu ở cụm đó chỉ vì cụm
khác còn chỗ. Không activate lại UUID workspace cũ sau khi đã hủy.

### 3.3. Job/receipt

Job state hiện là `queued | leased | retry | waiting_owner | needs_review |
succeeded | cancelled`. Không thêm `running`, `retryable` hoặc `dead_letter`
vào schema chỉ để khớp sơ đồ. Cách hiển thị hết số lần thử phải chốt trong contract.
T12 phải đối chiếu field thực trước thêm binding/routing/lease/fencing/attempt/
receipt; các trường trong kế hoạch là yêu cầu về ý nghĩa, không khẳng định tên cột.
Queue không lưu JWT/password owner. Worker chỉ reconcile receipt; worker không giả
danh owner và không tự tạo tenant ngoài contract sản phẩm.

### 3.4. Health/admission

Health tách khỏi admission:

Metric status hiện là `healthy | degraded | unreachable | unknown`. Warmup,
freshness/stale và admission decision là trục riêng; không thêm enum `failed`
vào metric_status.

Admission chỉ mở khi health, release, credential, backup, policy, resource và
manual gate đều đạt. Thiếu số đo là `unknown/stale`, không phải giá trị 0 hoặc
healthy. Acknowledge alert không tự mở admission.

## 4. Kiến trúc triển khai cần khóa

```text
Browser/mobile
    │
    ├── /app/<slug> ──► frontend dùng chung
    ├── /api/control ─► Control API + worker
    │                       └── Directory DB riêng
    │                           ├── registry/health/admission
    │                           ├── signup intents/jobs/receipts
    │                           └── audit/alerts/backup metadata
    └── workspace API ─► cụm Supabase được resolve theo routing_version
                          Auth + PostgreSQL + Storage + Realtime + Functions

Ngoài failure domain: backup mã hóa + key/manifest + hệ thống cảnh báo/on-call
```

Nguyên tắc:

1. Browser không tự chọn `cluster_url`, `tenant_id` hoặc secret.
2. Directory không proxy mọi dữ liệu nghiệp vụ; nó chỉ resolve và điều phối.
3. Một tab chỉ giữ một client Supabase của một cụm tại một thời điểm.
4. JWT của cụm A không được gọi cụm B; cùng email ở hai cụm là hai danh tính khác
   nhau trong V1.
5. Service-role/secret chỉ ở server/secret store, không nằm trong bundle frontend,
   Android hoặc log.

## 5. Kế hoạch triển khai theo 8 đợt

### Đợt 1 — nền, quyền và health pipeline (T01–T06, T08 theo dependency)

**Mục tiêu:** có một candidate source/schema/config đáng tin, quyền quản trị thật,
API contract không để frontend tự đoán.

**Việc cụ thể:**

1. Tạo manifest source, branch, dirty diff, lockfile, image, schema, migration,
   compose, ports, volumes và feature flags. Không ghi secret thật.
2. Kiểm tra read-only runtime 8082/8091 và mọi container/network/volume; xác nhận
   không chạm ứng dụng đang phục vụ.
3. Cố định OpenAPI/DTO/error codes cho registry, health, admission, setup-status,
   receipt, job, command và pagination. Lệnh quản trị có `Idempotency-Key`,
   `expectedVersion`, `reason`, `requestId`; signup dùng contract owner/intent/
   binding/receipt riêng, không bắt khách tự điền lý do vận hành.
4. Hoàn thiện migration history/checksum/lock trên DB trống, DB có dữ liệu và hai
   migrator đồng thời. Nếu cần migration mới, tạo bằng `supabase migration new
   <descriptive-name>`, không tự đặt timestamp và không sửa migration đã áp.
5. Phân tách role migration/runtime/worker/metrics. RLS trên schema exposed; policy
   không dùng `user_metadata` cho authorization; kiểm tra cả `USING` và `WITH CHECK`.
6. Chốt actor authority `platform_support_actor`, capability matrix và MFA/revoke.
   Actor do server xác minh; request không được chọn role/cluster để tự nâng quyền.
7. Test replay cùng payload, conflict khác payload, stale version, audit failure,
   response mất sau commit, actor bị revoke giữa hai request.

**Đầu ra:** baseline manifest, OpenAPI diff, migration report, authority matrix,
artifact command/receipt/audit.  
**Điều kiện đóng:** A01–A11 đạt trong sandbox exact-owned; không mutation vào DB
đang phục vụ; source và artifact cùng fingerprint.

#### 1B — số đo và atomic health sau nền quyền (T05/T08 → T06)

T08 phải đủ contract registry/issuer/trust trước T06; không để số thứ tự nhỏ hơn
dẫn tới chạy health trước dependency. T05 chuẩn bị song hành sau T01/T04.
Đây là phần còn lại của đợt 1 trong phiếu giao việc/protocol, không thêm task.

1. Pin node_exporter, postgres_exporter, Prometheus, Alertmanager bằng version/digest.
   Không public exporter/Grafana và không mount Docker socket.
2. Registry host → cluster → DB/Storage mount; đo từng mount bắt buộc, inode và
   `MemAvailable`; không cộng sai filesystem.
3. Probe Auth/REST/Storage/Realtime/Functions bằng canary riêng, có cleanup; 401
   hoặc port mở không đủ làm positive control.
4. Snapshot có observed/received/valid-until, generation và credential/target/
   release/policy revisions. Reject NaN/Infinity/âm/sai range/timestamp tương lai.
   Thiếu mẫu là unknown; mẫu quá 120 giây không mở admission.
5. Health evaluator dùng cửa sổ/hysteresis đã chốt; kiểm các revision ngay trong
   transaction ghi snapshot. Kiểm race đổi credential/target giữa probe và commit.
6. Chạy registry → collector → năm probe → DB health → admission theo thời gian:
   fault từng service, stale, restart, recovery; không suy từ năm probe rời rạc.

**Đầu ra:** exporter/target manifest, registry/trust disposition, probe evidence,
atomic snapshot và timed pipeline report. B01–B07/C01–C04 ký đúng phần đã đo;
Linux/host thật còn phải xác minh tại T18, không được đóng bằng Docker Desktop.

### Đợt 2 — cảnh báo và điều phối xử lý (T07, P2)

**Mục tiêu:** lỗi có người biết và có đường xử lý; acknowledge không tự mở nhận mới.

1. Alert event và outbox ghi cùng transaction; dispatcher có lease, retry jitter,
   dead-letter, dedupe fingerprint, ack/resolve/reopen và audit.
2. Kiểm crash trước/sau dispatch/ack, hai dispatcher, destination lỗi, phục hồi
   và retry có trần; không làm mất event hoặc nhân bản hành động nghiệp vụ.
3. Lập runbook disk/inode, DB connections, stale metrics, credential/cert,
   backup trễ và signup kẹt. Có owner/escalation và chính sách reopen riêng.
4. Local dùng sink exact-owned; heartbeat/đích nhận ngoài failure domain được
   nghiệm thu ở T20. Không coi send accepted là người trực đã nhận cảnh báo.

**Đầu ra:** alert matrix, outbox/dispatch/fault evidence và runbook.
**Điều kiện chuyển:** B08 local đạt; B09 giữ pending external đến khi có timeline
fault → detected → received → ack → recovery trên staging thật.

### Đợt 3 — điều khiển admission, reservation và budget (T09–T10, P3)

**Mục tiêu:** chỉ cụm đủ điều kiện mới nhận khách; tranh suất không cấp trùng;
đặt giới hạn tài nguyên trước khi mở signup.

**Việc cụ thể:**

1. Registry lưu endpoint/region/release/schema/capability/status/limits/backup
   state; secret chỉ lưu reference. Endpoint phải thuộc allowlist, HTTPS và
   không redirect/SSRF tới metadata service.
2. Dùng đúng operation `validate`, `set_serving`, `set_draining`, `close_admission`,
   `open_admission`; mỗi lệnh có impact preview, version, reason, receipt.
3. Admission gate = manual flag + health freshness + five probes + credential
   revision + release/schema compatibility + backup freshness + disk/RAM/DB budget
   + reservation slots.
4. Reservation/affinity/expiry trong một transaction; khóa/version nhất quán.
   Chạy 20 request tranh 1 suất, 20 replay cùng intent, close-vs-reserve và
   expiry-vs-first-provision.
5. Ghi budget tổng: API replicas × pool, worker/vendor, backup/migration reserve,
   DB connections, queue depth, upload/report concurrency, per-tenant quota.
6. Cụm `draining` chặn khách mới nhưng giữ khách cũ. Cụm lỗi không tự ghi tenant
   sang cụm khác.

**Đầu ra:** registry migration/API, admission decision log, race report, capacity
budget v0, error-code/message map cho UI.  
**Điều kiện đóng:** C01–C10 đạt local; mọi reservation có affinity ổn định và
không có duplicate workspace/trial.

### Đợt 4 — đăng ký, resume, reconcile và email (T11–T13, P4)

**Mục tiêu:** chủ sở hữu tạo workspace đúng một lần, có thể tiếp tục sau timeout,
worker không tự giả danh và email không làm sai trạng thái.

**Luồng triển khai bắt buộc:**

1. `POST signup-intent`: normalize/validate slug, rate limit/challenge, reserve
   atomically, trả `intent_id`, `cluster_id`, `routing_version`, expiry.
2. Auth signup ở đúng cụm; callback/email origin lấy từ allowlist. Chưa xác thực
   thì chưa tạo tenant/hotel.
3. `GET setup-status`: chỉ owner đã xác thực hoặc capability riêng tư; DTO có
   `state`, `step`, `nextAction`, `retryAfter`, `requestId`, `version`; `no-store`.
4. Owner submit: live verified session + binding + unique job được ghi trước remote
   call. Double submit trả receipt cũ.
5. Cluster commit: tenant/hotel/profile/trial/receipt trong một transaction sản
   phẩm. Mất response sau commit hiển thị “đang xác minh”, không tạo lại.
6. Worker claim bằng lease/fencing; kill tại các điểm trước call, sau call, trước
   ack; stale worker không activate. Worker chỉ đọc receipt và cập nhật mapping.
7. Phân biệt job `waiting_owner | retry | needs_review` và workspace `expired`;
   `retryable` chỉ là phân loại lỗi/nhãn UI, không thêm job state. Retry có trần
   và disposition hết lượt; backfill job cũ phải allowlist và idempotent.
8. Limiter dùng storage bền vững, trusted proxy rõ ràng, chống forged forwarded IP
   và direct Auth path. Tắt public signup phải chặn cả đường trực tiếp nhưng vẫn
   giữ login/reset/invite nhân viên cũ.
9. Provider webhook/queue:
   - kiểm raw-body signature, timestamp, body limit, malformed/unsupported;
   - exact replay không đổi trạng thái; cùng event ID đổi provider/type trả 409;
     field payload không dùng không được thay đổi định danh hay dữ liệu nghiệp vụ;
   - unknown provider ID trước bind;
   - delivered/delayed/bounced/complained/failed/suppressed và precedence;
   - cả callback và finish dùng cùng thứ tự: provider-scoped advisory transaction
     lock → delivery row → event uniqueness; không giữ transaction qua HTTP;
   - callback không đổi workspace/tenant/role/plan/provisioning.

**Đầu ra:** state-machine tests, resume matrix, reconcile worker report, provider
matrix, email event ledger, abuse/rate-limit report.  
**Điều kiện đóng:** D01–D15 local; D15 chỉ đóng khi có domain/sender/inbox thật,
không dùng Mailpit để tuyên bố delivered production.

### Đợt 5 — console `/super-admin` (T14–T17, P5)

**Mục tiêu:** operator có đúng hai màn đơn giản, có thể tìm và xử lý lỗi trong dưới
30 giây, không cần vào DB hoặc shell.

#### Màn Hạ tầng

- Bảng: cluster, khách cũ, nhận mới, lý do chặn, health freshness, backup, alert,
  release/schema và lần cập nhật.
- Detail: host/mount, CPU/RAM/disk/inode/DB connections, năm probe, policy/admission,
  timeline và runbook.
- Command dialog: validate, close/open, drain, set limit; luôn hiển thị trước/sau,
  impact, reason, expected version và command ID.
- `unknown/stale/unavailable` hiển thị rõ; không biến thành 0 hoặc màu xanh.
- Không có root shell, service-role input hay restore production một click.

#### Màn Đăng ký mới

- Search/filter server-side theo slug, requestId, state, step, cluster, lỗi, thời gian.
- Cursor/totals thật trên tối thiểu 1.000 metadata; không tải tất cả vào browser.
- Detail: timeline, binding/routing version, job/lease/retry, receipt summary,
  nextAction, runbook và tenant-summary tối thiểu từ đúng cụm.
- Recheck chỉ enqueue một reconcile job; 202 có đường xem kết quả; không recreate,
  sửa receipt hoặc impersonate owner.

#### Tiêu chí UX chung

- Một primary action mỗi context; menu chính không trùng menu phụ.
- Back giữ filter/cursor/scroll; chuyển route mới cuộn lên đầu.
- Query key gồm authority/workspace/cluster; logout/revoke hủy request cũ.
- 390px, keyboard, zoom, focus dialog, screen-reader label, tương phản màu thông dụng.
- Loading/empty/forbidden/unavailable/stale/partial có trạng thái riêng.

**Đầu ra:** route/client/hooks/pages, API contract tests, screenshot/keyboard report,
E01–E08 evidence.  
**Điều kiện đóng:** quyền bị chặn ở API thật, không chỉ ẩn nút; mọi chức năng có
đường click và không bị hotel selection/onboarding guard chặn.

### Đợt 6 — bundle VPS, TLS, backup và on-call (T18–T20, P6)

**Mục tiêu:** cài được trên Linux staging, nâng cấp/reboot không mất dữ liệu và có
thể phục hồi sang host sạch.

**Việc cụ thể:**

1. Chuẩn hóa `deploy/vps`: compose profiles, image digests, env example, release
   manifest, preflight/prepare/apply/verify/rollback và service dependencies.
2. Preflight chỉ đọc trước; dừng nếu sai host, populated volume ngoài inventory,
   port conflict, thiếu disk/TLS/secret hoặc schema mismatch. Không format/xóa mount.
3. Phân quyền migration/runtime/worker/metrics; public port tối thiểu; DB/exporter
   chỉ mạng riêng; reverse proxy/WebSocket/upload/timeout/CSP đúng origin.
4. Restart/redeploy idempotent, log rotation, resource limits, image rollback,
   cert renewal, secret rotation không đổi workspace binding.
5. Backup directory + từng cụm gồm DB/Auth/queues/object bytes/manifest và config
   cần thiết; mã hóa ngoài host, key tách failure domain, readback checksum.
6. Restore host sạch: restore directory trước, cụm sau, reconcile mapping/job/receipt;
   không đánh dấu backup verified chỉ vì file tồn tại.
7. Runbook host loss, DB down, disk full, cert hết hạn, credential revoke, backup
   trễ, signup kẹt; alert phải được nhận bởi hệ thống ngoài host và có on-call.

**Đầu ra:** bundle Linux, preflight log, upgrade/reboot report, backup manifest,
restore report, RPO/RTO measurement, on-call runbook.  
**Điều kiện đóng:** F01–F09 và B09 trong staging thật; local Docker chỉ đóng phần
package/integration.

### Đợt 7 — A/B, E2E, tải và release candidate (T21–T24, P7)

**Mục tiêu:** chứng minh hai backend độc lập, routing/cách ly đúng và có operating
limit đo được trên cấu hình VPS cụ thể.

**Việc cụ thể:**

1. Chạy hai stack A/B đồng thời; Auth/JWT/DB/Storage/Realtime/Functions/queues/
   volumes độc lập; same UUID, wrong-cluster deny và positive controls.
2. Browser E2E: landing → signup → verify → onboarding → hotel → rooms → invite →
   staff login → logout/revoke/reset; refresh, two tabs, new device, deep link,
   Back và mất response.
3. Android E2E: callback/deep link, secure storage, token refresh, network loss,
   retry, workspace switch và notification permission.
4. Load profile ghi rõ hardware, image digest, dataset, think-time, session mix,
   ramp 10→25→50→100 (điều chỉnh theo số đo), soak ≥60 phút.
5. Đo p50/p95/p99, error rate, DB pool, locks, I/O, queue lag, alert lag, CPU/RAM/
   disk/inode và chi phí; xác định `max_tested`, `operating_limit`, `headroom`.
6. RC packet phải có source/image/schema/config/contract cùng revision, secret scan,
   full 70-case ledger, defect list, known limits, backup/rollback approval.

**Điều kiện đóng:** G01–G07, release audit đủ 70 case, không còn lỗi High về quyền,
dữ liệu, cấp phát hoặc restore. Hai rebuild tuần tự không thay thế A/B đồng thời.

### Đợt 8 — pilot và quyết định mở rộng (T25, P8)

1. Một khách nội bộ dùng trên môi trường pilot; giữ 24–48 giờ ổn định trước cohort.
2. Mở 5–10 khách được chọn, không mở public/billing tự động.
3. Quan sát ít nhất 7 ngày: SLO, lỗi signup, retry/dead-letter, alert, backup,
   restore drill, p95/p99, capacity headroom, chi phí và thời gian hỗ trợ.
4. Họp go/no-go: mở rộng, giữ pilot, rollback hoặc bổ sung cụm. Quyết định dựa
   trên số liệu và biên bản, không dựa trên số lượng test xanh.

## 6. Nhận việc kế tiếp và bộ hồi quy đã khép local

Các bước provider A–D dưới đây đã khép lát local theo report mới nhất; giữ làm
checklist regression, không nhận lại như việc chưa làm. Trước signup/UI/VPS còn
phải khép 17-target/policy/FK và R3/R5/R6/R7 theo mục 5 và report handoff.

### 6.1. Backlog nhận ngay: quyền gián tiếp → policy/FK → health pipeline

Catalog v3/direct controls và hai High hotel-delete đã có proof local theo handoff.
Mục 13.1–13.3 giữ làm thiết kế/checklist hồi quy: fixture/partial evidence, receipt
protection và live fencing/positive/races đã kiểm trong A/B mới. Receipt hotel FK
hiện NO ACTION, room-setup FK giữ CASCADE; client precheck không thay server guard.
Không nhận lại hai lỗi đã sửa như việc chưa triển khai. A/B parent-boundary đã
kiểm trusted service tenant cascade trong transaction rollback với năm nhóm
fixture có dữ liệu; không phê duyệt quy trình tenant offboarding production.
Mốc parent-boundary giữ lịch sử; handoff hiện hành đã có hotel scope và account/
session A/B. Nhận caller/capability/workflow matrix mục 15.2.4 rồi 13.4–13.5.
Advisors605/656 thuộc A/B/caller lịch sử. Diagnostic752/545 hiện có652 findings (19 no-policy/7 FK/491 unused/135 WARN);
unused count không phải proof tối ưu hoặc current reachability audit.

Không tạo thêm package/case: dùng T01/T03/T04/T08 và mã case gốc trong
[phiếu nhận việc](roomqc-vps-signup-launch-checklist-2026-10-21.md).

1. **17 target legacy + hai receipt targets mới:** diagnostic752/545 có19 bảng RLS
   chưa có policy. Giữ audit17 cũ; bổ sung private.employee_profile_edit_receipts
   và private.password_change_receipts trong cùngT08, không thêm task/case hoặc
   đổi counts lịch sử.19 đều cần current disposition. Mỗi bảng có phiếu schema/table,
   API exposure, direct/column/inherited grant, RPC/Edge/view/definer, trigger/FK
   có thể chạm bảng, effective role, tenant/session guard và allowed side effects.
   Phân loại từng đường là intended/blocked/defect/unresolved, có reviewer và
   artifact positive/negative; direct grants bằng 0 không đủ kết luận an toàn.
2. **135 cảnh báo permissive policy:** nhóm theo role/table/operation để kiểm
   semantics OR của policy. Analyzer đã match 135/135 trên 50 bảng/6 roles bằng
   typed PERMISSIVE/RESTRICTIVE, ALL/PUBLIC và actual USAGE membership; đây chưa
   là allowed-row proof. Ưu tiên rooms/items/inventory_transactions/laundry_batches/
   maintenance_requests có mixed scope, kể cả ALL policy và helper role allowance.
   Giữ allowed rows đúng nghiệp vụ, thử chéo tenant/hotel, UPDATE WITH CHECK và
   revoke. Chỉ gộp policy khi kết quả truy cập không bị đổi.
3. **8 FK thiếu index theo advisor:** dùng workload/dataset có dữ liệu, EXPLAIN
   ANALYZE/BUFFERS và lock/write cost để quyết định add/retain/no-change; không
   xóa index chỉ vì thống kê unused. Mọi thay đổi có forward migration và regression.
4. **R3/R5:** chốt issuer quyền hẹp, secret reference/revision, lease/revoke và
   recovery; release manifest phải được duyệt độc lập với runtime đang được đo,
   kiểm digest/schema/target, tamper và SSRF trước khi cho phép admission.
5. **R6/R7:** kiểm credential/target/release/policy revision ngay trong transaction
   ghi health; chạy registry → collector → năm probe → DB health → admission
   theo thời gian, có stale/restart/fault/recovery. Không suy ra pipeline đạt từ
   năm probe chạy rời rạc.

Mỗi lát kết thúc bằng focused tests, full control regression, fresh A/B trên source
đã khóa, advisors, cleanup và report đã lọc. Chỉ chuyển trạng thái local có phạm vi;
không nâng gate L/S/P/U/B hay sửa releaseAcceptance thay cho bằng chứng còn thiếu.

### 6.2. Provider — checklist hồi quy bắt buộc

#### Bước A — dựng harness provider an toàn

- Chỉ dùng sandbox exact-owned, internal Docker network và HTTP sink fixture theo
  contract Mailpit; không coi đây là Mailpit service hoặc provider thật.
- Tạo signing key fixture riêng; tắt Internet/provider thật/scheduler.
- Build actual Edge clone cho webhook và queue consumer; ghi source hash/eszip hash.
- Thêm stage check trước mọi email-admin/access/registration/mutation.

#### Bước B — tái hiện duplicate event ID

1. Gửi event `E1/P1/delivered` có chữ ký đúng.
2. Gửi lại `E1/P2/bounced` hoặc payload khác.
3. Đọc delivery, attempt, provider event, outbox và audit trong DB.
4. Xác định event thứ hai bị bỏ qua hoàn toàn hay vẫn làm đổi delivery.
5. Nếu sai: tạo migration bằng Supabase CLI, làm immutable event identity, trả lỗi
   conflict an toàn (`PT409` hoặc mã tương đương), thêm regression.
6. Nếu không sai: ghi evidence “no defect confirmed”, không thay code chỉ vì giả thuyết.

#### Bước C — giữ lock order

Cả `finish_email_delivery` và `record_email_provider_event` lấy provider-scoped
advisory transaction lock trước delivery row, rồi mới xử lý event uniqueness.
Callback chưa tìm thấy delivery vẫn phải lấy provider lock để phối hợp với lần
bind sau đó. Không lấy provider lock lần đầu khi đã giữ delivery row và không
khóa event trước delivery. Giữ regression hai thứ tự callback/finish bằng bằng
chứng lock wait thực, không chỉ sleep; migration hiện tại là chuẩn tham chiếu.

#### Bước D — chạy fresh A/B và cập nhật ledger

- Fresh A trên source/harness hiện tại.
- Freeze ownership state của A.
- Fresh B tham chiếu A thành công, kiểm source/image/schema/eszip khớp.
- Cleanup chính xác object theo run label.
- Cập nhật report MD/JSON, delivery ledger và tracker; không gắn lifecycle proof cũ
  cho source mới.

## 7. Ma trận nghiệm thu tối thiểu

| Nhóm | Điều phải chứng minh | Môi trường bắt buộc |
|---|---|---|
| A — foundation | schema/migration/authority/receipt/audit/replay | sandbox exact-owned |
| B — health/alert | metric đúng mount, stale, probe, alert lifecycle | sandbox → Linux staging |
| C — admission | registry, reservation, affinity, race, budget | sandbox exact-owned |
| D — signup | verify, owner submit, resume, reconcile, abuse, email | sandbox → staging domain |
| E — console | list/detail/search/command/UX/accessibility | browser + API staging |
| F — VPS/DR | install, TLS, reboot, backup, restore, on-call | Linux staging thật |
| G — release | A/B, E2E, load, rollback, pilot | staging/pilot thật |

Trường `releaseAcceptance` giữ đúng enum của ledger:
`unverified | in_progress | verified | failed | deferred_external`.
`scoped_local_verified`, `environment_verified` và `pilot_verified` chỉ là nhãn
phạm vi bằng chứng trong report, không phải enum thay thế hoặc giấy phép mở gate.
Không dùng “pass” chung cho nhiều môi trường. Artifact phải có command, exit code,
source/image/schema, thời gian, expected/actual, log đã lọc và cleanup result.

## 8. Phân công và quyền

| Vai trò | Trách nhiệm | Không được làm |
|---|---|---|
| Backend/control | schema, API, state machine, receipt, worker, policy | tự mở public signup hoặc tự chọn cluster từ request |
| Frontend/admin | route, cache key, command dialog, UX, accessibility | ẩn lỗi thành empty/healthy hoặc quyết định quyền bằng UI |
| OPS | VPS bundle, secrets, TLS, backup, restore, on-call | chạy script lên host chưa xác minh ownership |
| QA | fixture, race, E2E, load, evidence, release audit | biến mock/Mailpit thành proof external |
| RoomQC/release owner | duyệt policy, risk, gate, pilot/go-no-go | bỏ qua case quyền/dữ liệu vì tiến độ |

Mỗi ticket cần một owner và một reviewer. Migration directory, OpenAPI và state
enum chỉ có một người sở hữu thứ tự; nhánh khác gửi contract/delta trước khi sửa.

## 9. Gate và điều kiện dừng

- **L gate — local:** source/fixture/test/artifact reproducible, cleanup đúng.
- **S gate — staging:** Linux/VPS/domain/secrets/backup/alert thật đã kiểm chứng.
- **P gate — cho phép bắt đầu pilot:** sau RC/staging đạt điều kiện, có cohort,
  on-call, offsite restore và kill switch được duyệt. Kết quả pilot ≥7 ngày thuộc
  G08/T25 sau đó; không đòi G08 hoàn tất trước khi được bắt đầu đo G08.
- **U gate — public signup:** anti-abuse, proxy, Auth, monitoring, support đạt;
  có limit và kill switch, được RoomQC duyệt mở công khai.
- **B gate — paid:** payable order/settlement/provider E2E và chính sách dữ liệu/
  trial/expiry/hủy được duyệt; là backlog billing riêng, không tự mở theo gate U.

Email/domain/provider/offsite/DNS/TLS/alert ngoài host là các đầu vào external
của S/P/U, không phải một gate U khác với ma trận phát hành gốc.

Dừng ngay khi:

- target không xác minh được ownership;
- test có nguy cơ đụng DB/CRM/runtime đang phục vụ;
- schema/source/image không cùng fingerprint;
- mutation mất response nhưng chưa có receipt/reconcile;
- permission/RLS/tenant isolation chưa có positive và negative proof;
- backup chỉ tồn tại cùng host hoặc chưa restore được;
- external credential thiếu nhưng kết quả bị báo như đã pass.

## 10. Rollback và xử lý sự cố

1. **Code/config:** quay về release candidate trước, giữ migration tương thích; không
   `git reset --hard` và không xóa dữ liệu để “làm sạch”.
2. **Admission:** đóng nhận mới trước, giữ khách cũ; không đổi affinity đang active.
3. **Signup:** giữ intent/job/receipt ở trạng thái chờ hoặc needs_review; không tạo
   intent mới tự động.
4. **Worker:** stop claim mới, để lease hết hạn hoặc revoke fencing; worker mới
   reconcile receipt trước khi retry.
5. **VPS:** dừng rollout tại host lỗi, giữ image/volume, chuyển sang runbook restore;
   không format mount chưa xác nhận.
6. **Data:** khôi phục sang staging/host sạch, đối chiếu counts/IDs/object hashes
   trước khi mở ghi; giữ nguồn read-only để điều tra.

## 11. Lịch dự kiến và tiêu chí bàn giao

| Chặng tham chiếu | Nội dung | Bàn giao |
|---|---|---|
| 1 | Giữ employee A/B regression → caller → 17-target/FK/policy/workload | local report + migration/regression nếu có |
| 2 | Issuer/trust, atomic health, timed pipeline | candidate A/B + health/registry proof |
| 3 | Alert/outbox, admission, budget | C/B evidence + capacity budget v0 |
| 4 | Signup/resume/reconcile/abuse/email | D01–D15 local matrix |
| 5 | Console Hạ tầng/Đăng ký mới và UX | E01–E08 API/UI evidence |
| 6 | Linux bundle, TLS, backup/restore, on-call | F01–F09 staging evidence |
| 7 | A/B E2E, Android, load/soak, RC | G01–G07 + 70-case audit |
| 8+ | Pilot 1 → 5–10 khách, quan sát ≥7 ngày | G08 + go/no-go report |

Các chặng 1–8 là lịch minh họa, không phải cam kết hoàn thành theo tuần lịch;
chưa có tên người triển khai/reviewer, cấu hình VPS và thời gian chờ external.
Ước lượng kỹ thuật hiện tại: khoảng 30–47 ngày công, dự phòng 36–57 ngày công,
chưa tính thời gian chờ quyền/provider và ≥7 ngày quan sát pilot. Ước lượng phải
được cập nhật sau khi T08/R7 và cấu hình VPS staging có số đo thật.

## 12. Definition of Done

Chỉ coi phần VPS + signup sẵn sàng đưa khách thật khi đồng thời thỏa tất cả:

1. 27 gói/25 bước/70 case có trạng thái và artifact riêng theo môi trường.
2. Không còn lỗi High/Blocker về Auth, RLS, tenant isolation, provisioning,
   receipt/replay hoặc restore.
3. Cluster admission dựa trên số đo tươi, policy/version và backup verified.
4. Signup refresh/two-tab/new-device/timeout/worker-crash không tạo trùng.
5. Console API kiểm quyền thật; UI không che unknown/stale/error.
6. Bundle cài/nâng cấp/reboot/rollback được trên Linux staging; secrets và TLS
   đúng cách; exporter/database không public.
7. Backup ngoài failure domain đã restore trên host sạch, có RPO/RTO đo được.
8. Cảnh báo host/control/backup/signup kẹt được nhận bởi người/hệ thống ngoài host.
9. A/B routing, browser/Android E2E và load/soak có giới hạn vận hành rõ.
10. Pilot đạt ≥7 ngày và RoomQC phê duyệt mở cohort/public riêng biệt.

Không dùng số lượng test, số dòng code, số workspace mẫu hoặc việc trang login mở
được để thay cho các điều kiện trên.

## 13. Phiếu triển khai đợt đầu từ baseline mới — thứ tự không được đảo

Đây là checklist con của T01/T03/T04/T08/T05/T06, **không tạo gói/T/case mới**.
Chỉ nhận triển khai sau khi xác nhận candidate/target. Mục 13.1–13.3 đã có
bản sửa/proof local theo handoff đầu trang; giữ nguyên checklist để hồi quy.
Mục 13.4–13.5 còn mở. Case release theo ledger/protocol, không tự đóng.

### 13.1. Khóa target/source và làm harness báo lỗi đáng tin

**Owner-role:** BE/QA; **reviewer-role:** QA/OPS. **T:** T01/T04.

1. Lưu branch/HEAD + dirty source manifest, migration set, images/config/contract;
   xác nhận business runtime chỉ đọc, exact-owned sandbox mới được ghi.
2. Giữ run d178a0bedd10 làm pre-fix evidence, không overwrite hoặc gọi là pass.
3. Giữ postcondition quota fixture: P0001 đã xác nhận do trial max_hotels=2 bị
   cạn trong sandbox. Dùng plan fixture riêng hữu hạn, không sửa plan dùng chung,
   tắt trigger/drop FK, tăng quota thật hoặc đổi expected để làm test xanh.
4. Lưu partial findings theo structured failure path dù fixture throw; phân biệt
   product expected/actual với setup error và những bước chưa chạy.
5. Bảo đảm positive fixture/authority/binding hợp lệ trước khi test deny;
   actual Auth/REST không được thay bằng SQL giả role cho cùng kết luận.

**Đạt khi:** failure report giữ được observations có phạm vi; positive fixture
tạo đúng bằng API; cleanup chính xác kể cả bị ngắt. **Artifact:** source manifest,
fixture postconditions, sanitized pre-fix report và harness-focused tests.

### 13.2. Bảo vệ workspace receipt trước xóa hotel thông thường

**Owner-role:** BE; **reviewer-role:** QA/OPS. **T:** T03/T08.

1. Đọc latest FK/caller/trigger; phân biệt receipt hotel với hotel không gắn receipt.
2. Chọn forward migration bảo vệ receipt tại DB: ưu tiên từ chối xóa hotel còn
   binding cần đối soát, không chỉ thêm client confirm/ẩn nút. Không sửa migration cũ.
3. Không đổi chính sách tenant offboarding hoặc mọi CASCADE theo một finding.
4. Kiểm đúng constraint/guard phát sinh refusal; FK khác không được che defect.
5. Owner hợp lệ xóa bound hotel bị chặn, receipt/draft và allowed snapshot ổn
   định; replay dùng receipt cũ. Chạy mười concurrent attempts cùng target.
6. Hotel trống, không gắn receipt vẫn có positive theo policy; staff/anon/cross
   tenant bị chặn. Không coi tất cả DELETE bị lỗi là thành công.
7. Caller UI phân biệt refusal/not-found/unavailable; không toast/log audit xóa
   thành công nếu không có result thực. Giữ invalidation/back context đúng.

**Đạt khi:** direct REST và UI không làm mất receipt; positive/replay/negative/
concurrent controls có data effects rõ. **Artifact:** migration delta, FK decision,
before/after row/checksum report, API/caller tests và advisors.

### 13.3. Live authority/session fencing cho sensitive hotel DELETE

**Owner-role:** BE; **reviewer-role:** QA. **T:** T03/T08.

1. Review Auth confirmed/deleted/ban, profile active/deleted/locked, live owner
   role, tenant binding và JWT session_id khớp live Auth session còn hiệu lực.
2. Giữ quyền least privilege; không dùng user_metadata, không browser service
   key, không GRANT ALL/tắt RLS hoặc thêm definer để né permission error.
3. Nếu cần private helper, chỉ expose quyền thực sự cần, fixed/empty search_path,
   explicit caller checks; phải review grants và API exposure trước migration.
4. Chốt lock order thống nhất với revoke trước business mutation; recheck sau
   lock wait. Không coi snapshot EXISTS là bằng chứng chống TOCTOU.
5. Negative matrix: locked/inactive/Auth soft-delete/ban/unconfirmed/session
   expired/owner-role revoked và actual GoTrue logout với JWT cũ. Thêm các trạng
   thái liên quan theo source contract, không chỉ những nhánh baseline thất bại.
6. Race revoke-first: có lock wait thật, revoke commit trước thì DELETE denied.
   Mutation-first: chứng minh revoke chờ quyền đã khóa, mutation tuần tự commit,
   sau revoke request mới denied; không deadlock hoặc side effect ngoài contract.
7. Relogin/restore authority có positive; so side effects trên 29-table fixture,
   không suy từ bảng rỗng rằng tài chính/receipt không đổi.

**Đạt khi:** hai race có evidence blocking/wait, mọi invalid actor không mutation,
owner hợp lệ giữ đúng tập hành vi. **Artifact:** authority/lock graph, matrix,
actual Auth/REST results, private log refs và sanitized snapshots.

### 13.4. Đóng disposition gián tiếp và rủi ro policy/FK còn lại

**Owner-role:** BE; **reviewer-role:** QA/OPS. **T:** T08, liên quan T01/T03/T04.

1. Mỗi một trong 17 target có row-level phiếu: grants/exposure, callers/view/
   definer/trigger/FK, effective role, tenant/session guard, allowed effects,
   evidence và reviewer. Đường chưa chứng minh phải là unresolved, không safe.
2. Duyệt 135 policy warnings theo role/table/operation và OR semantics; giữ
   positive allowed set trước/sau. Không gộp hàng loạt để giảm advisor count.
3. Với 8 FK workload warnings, giữ dataset, EXPLAIN ANALYZE/BUFFERS, write/lock
   overhead, quyết định add/retain/no-change có lý do; không drop unused index
   dựa riêng một run hoặc chỉ để số warnings về 0.
4. Regression giữ lifecycle/email/admin/provider và receipt/session proof;
   source đổi cần kiểm lại đúng phần và candidate tích hợp cuối.

**Đạt khi:** không còn đường High chưa xử lý trong scope; mọi no-change đều có
chủ trương và bằng chứng, không đồng nhất inventory với authorization proof.

### 13.5. Issuer, release trust và revision-atomic health

**Owner-role:** BE/OPS; **reviewer-role:** QA. **T:** T08 → T05 → T06 theo dependency.

1. Issuer credential dành canary có quyền hẹp, secret ref/revision/expiry/revoke;
   kiểm issue/rotate/expire/revoke/restart, mismatch cluster và thiếu secret.
   Không ghi owner JWT/password vào worker/queue hoặc artifact.
2. Release manifest do authority ngoài runtime đo phê duyệt: exact target/image/
   schema/function/probe contract. Runtime tự báo healthy không tự chứng minh
   chính nó là candidate được duyệt. Tamper/missing/mismatch phải fail-closed.
3. Target allowlist/TLS/redirect/DNS và bounded payload/timeouts được test bằng
   fixture kiểm soát; không cho browser/probe URL tùy ý tới mạng nội bộ.
4. Health write kiểm credential/target/release/policy revision trong cùng
   transaction; mẫu cũ không overwrite generation mới hoặc reopen admission.
5. Nối registry → collector → năm service probe → persisted health → admission;
   đo theo thời gian với warmup/stale/fault/restart/recovery. Thiếu metric là
   unknown, không 0/healthy; >120s stale chặn nhận mới theo policy hiện hành.
6. Kiểm pool/deadline/cancellation/safe shutdown; không giữ DB transaction qua
   remote HTTP và không cho collector lỗi treo control API.

**Đạt khi:** pipeline thật trên source khóa, live revisions/race/window đúng;
không suy ra từ năm probe rời rạc. Linux exporter/OS comparison và alert external
vẫn chờ môi trường, không được thừa kế từ sandbox Windows/Docker.

### 13.6. Cổng tích hợp của đợt đầu

Focused/syntax → regression liên quan BE/FE → full control → fresh A → freeze →
fresh B cùng source/image/schema → advisors → ownership cleanup → report review.
Giữ thất bại trước/sau, không báo full suite mới đạt từ focused test. Full 70
case và gates vẫn chờ những đợt còn lại; hai rebuild tuần tự không thay T21.

Sau đó nhận đúng thứ tự: T07 alert/outbox → T09/T10 admission/budget →
T11–T13 signup/resume/reconcile/abuse → T14–T17 console → T18–T20 Linux/DR/on-call
→ T21–T24 A/B/E2E/load/RC → T25 pilot. Công việc chuẩn bị không đổi dependency
nghiệm thu hoặc tự cho phép deploy/public signup.

## 14. Checklist tương thích Supabase trước đóng candidate

Đã đọc changelog/docs ngày 21/10/2026 để lập plan; **chưa nâng vendor/runtime**.
Khi triển khai phải đối chiếu release pin thực tế và test trên clone:

- [Envoy default gateway](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b):
  kiểm api-gw/route/key/header/proxy/WebSocket; không giả định listener HTTPS
  của Kong còn có trong default mới. TLS qua proxy được duyệt, không mở port tùy ý.
- [API_EXTERNAL_URL/Auth prefix](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1):
  kiểm callback và issuer không thiếu hoặc lặp /auth/v1; origins allowlist và
  Android deep link nhất quán với release hiện dùng.
- [PostgreSQL minor changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes):
  kiểm extensions/collation/ltree/btree_gist/legacy pgcrypto và dump/restore
  tương thích nếu có dùng. Không reindex/upgrade production chỉ từ thông báo.
- [TLS cipher deprecation](https://supabase.com/changelog/cbc-tls-ciphers-deprecated):
  phân biệt managed HTTP API thông báo với self-host proxy; test browser/Android
  TLS 1.2/1.3 theo cấu hình được chọn, không tự coi thông báo đã áp cho VPS này.
- [Sessions](https://supabase.com/docs/guides/auth/sessions): logout xóa Auth
  session nhưng access JWT có thể còn hạn; sensitive operation cần live session
  guarantee theo contract, không chỉ kiểm JWT signature/expiry.
- [Self-host Docker](https://supabase.com/docs/guides/self-hosting/docker): pin
  vendor tag/digest/config/secret lifecycle, HTTPS và backup/upgrade runbook;
  vendor quick-start không thay preflight/ownership/DR acceptance của RoomQC.

Ghi quyết định applicable/not-applicable kèm version/evidence trong RC packet.
Không lấy tài liệu latest làm bằng chứng candidate đã tương thích.

## 15. Điều phối nhận việc và nghiệm thu sau khi xác nhận phạm vi

Phạm vi người dùng chốt là **toàn bộ VPS + signup**, đầu ra **Plan + nghiệm thu**.
Giữ nguyên mã T/P/case và dùng ledger làm nguồn phụ thuộc; không mở roadmap thứ hai.

### 15.1. Phân biệt đủ đầu vào với hoàn tất release

Mỗi dependency có hai câu hỏi riêng:

1. **Đủ đầu vào để triển khai?** Contract/revision/fixture và kết quả local liên
   quan đã được review đủ để code bước sau, mọi hạn chế vẫn ghi rõ.
2. **Đủ để nghiệm thu release?** Đủ requiredEnvironments, candidate tích hợp cuối,
   không còn defect chặn và có reviewer/signoff.

Không đòi mọi dependency được release-signed-off mới cho phép chuẩn bị source
bước sau: T10 có budget tạm trước T11, còn capacity cuối chỉ có sau T23; nếu đợi
T23 để bắt đầu T11 sẽ tạo vòng chờ giả. T18 có thể chuẩn bị bundle sau T06/T08,
không phải chờ mọi màn UI hoàn tất. T14 có thể chuẩn bị theo contract T03/T04;
T15/T16 vẫn chờ API/data dependency tương ứng. Đây là thứ tự công việc, không
phải ủy quyền tạo agent, deploy hoặc mở gate.

Không tính “đủ đầu vào” thành verified trong 122 releaseAcceptance entries.
Tên người owner/reviewer chưa được giao thì để null, không tự giả chữ ký.

### 15.2. Phiếu nhận việc tiếp theo có điểm dừng rõ

Cập nhật sau hai bản sửa: candidate 668/535 có A/B 280 scope + 1.764 account/
session + 20 scoped races/run. Giữ toàn bộ identity/expected và positives của
hai baseline; 45 scope failures và 588 actor failures đã đạt ở phạm vi đã đo.
Dòng 2 khép hai lát local, chưa là toàn ma trận quyền. Dòng 1 giữ lịch sử
662-file; các dòng sau và toàn bộ đợt 2–8 vẫn mở.

| Thứ tự | Việc trong task hiện có | Bàn giao bắt buộc trước khi chuyển lát |
|---|---|---|
| 1 / T01,T04,T08 | Đã kiểm A/B trên backend 662/533; giữ fingerprint và parent harness làm hồi quy, hai file analyzer/test là scope riêng | A/B terminal + source/schema/image/compiled Edge/harness match + advisors + cleanup; raw Compose hash riêng theo run không phải invariant equality |
| 2 / T03,T08 | Đã forward-fix scope và live actor năm bảng; A/B 280 + 1.764 + 20 scoped races; nhận caller/capability/workflow/RPC/Edge/other-table theo 15.2.4 | Giữ identity/expected/positives hai baseline; source 668/535 và report mới; service-mediated paths/full matrix/reviewer chưa đủ |
| 3 / T08 | Hoàn tất 17 phiếu target và phần còn lại của 135-policy review theo effective role/operation | intended/blocked/defect/unresolved, grants/callers/implicit effects, allowed rows, source/runtime refs và reviewer; structural match không được đánh safe |
| 4 / T08,T10,T23 | Phân tích 8 FK theo workload có dữ liệu; ghi EXPLAIN/BUFFERS, write/lock cost | Từng FK có add/retain/no-change + lý do; no-change không đồng nghĩa bỏ qua; capacity cuối chờ T23 |
| 5 / T08 | Chốt issuer/trust/secret revision/capability và release approval ngoài runtime đang đo | Issue/rotate/revoke/restart/mismatch/tamper positives/negatives; không dùng self-report để tự duyệt release |
| 6 / T05,T06 | Ghi health và revision trong cùng transaction; nối collector → năm probe → health → admission | Timed warmup/stale/fault/restart/recovery, mẫu cũ không reopen; Linux comparison vẫn pending nếu chỉ Docker local |
| 7 / T07,T09,T10 | Alert/outbox → reservation/affinity races → pool/queue budget | B08/B09 và C05–C10 đúng môi trường; có đường đọc receipt/command result, không success từ 202 |
| 8 / T11–T25 | Nhận signup, hai console, Linux/DR, simultaneous A/B, E2E/load/RC rồi pilot | Theo tám đợt mục 5, dependency từng T trong ledger và protocol; không dừng ở lát security |

Các dòng trên là checklist con của T hiện có, không thêm acceptance case.
Mọi lỗi sản phẩm phải có expected/actual riêng, không sửa expected để lấy pass.
Nếu source đổi sau A, chạy A/B mới hoặc nêu rõ B không còn hợp lệ; không gắn
kết quả cũ vào candidate mới bằng cách chỉ sửa link report.

#### 15.2.1. Phiếu đợt đầu — ma trận quyền năm bảng

**Trong T03/T08, không thêm task hoặc case release.** Owner-role BE, reviewer-role
QA; tên người vẫn chưa được giao. Target chỉ là backend disposable exact-owned,
không phải database đang phục vụ. Lượt lập plan gốc chưa chạy phiếu này; lượt
triển khai sau đã có baseline rồi bản sửa policy/A/B 280 observations theo handoff
đầu trang. Chưa nghiệm thu toàn ma trận. Giữ checklist để hồi quy, không giao lại
baseline hoặc fix đã hoàn tất lát local.

1. **Khóa hợp đồng trước test:** đối chiếu users-permissions, permission-matrix,
   latest migrations, grants và policy catalog của candidate. Ghi expected theo
   từng role/operation trước khi chạy. Nếu tài liệu và source mâu thuẫn, ghi
   unresolved để RoomQC/reviewer chốt; không lấy actual làm expected mới.
2. **Seed có đối chứng:** hai tenant A/B, mỗi tenant có hotel được gán và hotel
   không được gán; cả năm bảng rooms/items/inventory_transactions/laundry_batches/
   maintenance_requests có hàng hợp lệ. Quota fixture hữu hạn, không nâng gói
   trial dùng chung hoặc tắt trigger. Assert tenant/hotel/FK trước khi đo quyền.
3. **Actor:** owner A/B; manager/staff được gán và không được gán hotel; actor
   thiếu quyền, revoked/locked/inactive theo contract. Platform actor phải tách
   direct-table contract với RPC quản trị được cấp phép, không tự mở quyền chéo.
4. **Phạm vi dữ liệu:** cùng hotel, khác hotel cùng tenant và khác tenant.
   Chỉ thử hotel_id NULL nếu schema và nghiệp vụ cho phép tenant-shared rows;
   không ép NULL vào bảng bắt buộc hotel. Có positive đúng tenant/hotel trước
   mỗi nhóm negative để tránh deny do fixture hoặc session hỏng.
5. **Operation:** SELECT và INSERT/UPDATE/DELETE theo quyền nghiệp vụ của từng
   bảng/role; thử đổi tenant_id/hotel_id qua UPDATE và dữ liệu mới qua WITH CHECK.
   Không mặc định mọi staff được ghi. Kiểm policy ALL cùng permissive OR và
   restrictive AND; drop SELECT đơn lẻ không đủ chứng minh phạm vi đã được thu hẹp.
6. **Đường gọi và effect:** dùng actual Auth + REST/RPC entry tương ứng; SQL
   installer chỉ seed/đọc đối soát. Lưu table/actor-state/scope/operation, expected,
   actual HTTP/result count, allowed effects và before/after checksums. Không lưu
   password/JWT/PII vào report; SQL-role test riêng không được thay bằng chứng API.
7. **Khi có lỗi:** giữ baseline/partial observations dù setup hoặc assertion fail;
   phân biệt product defect với setup error và not-run. Chỉ forward-fix khi có
   runtime mismatch đã xác nhận và intended access đã chốt. Mọi fix phải giữ
   positive trước/sau, receipt/session/provider/lifecycle regressions và advisors.
8. **Đóng lát:** focused → full control → A/B mới nếu source/harness đổi, đúng
   fingerprint → cleanup → report MD/JSON đã lọc → reviewer. Kết quả chỉ đề nghị
   scoped local; 17-target/policy/FK còn lại và các gate không tự được nghiệm thu.

**Bàn giao bắt buộc:** ma trận đủ năm bảng và mọi tổ hợp applicable; các tổ hợp
N/A có lý do; findings/defects/unresolved riêng; evidence run/candidate; effect
assertions; cleanup; reviewer còn thiếu thì giữ pending. Không suy từ số denials
hoặc structural policy match thành toàn bộ quyền đã đúng.

#### 15.2.2. Phiếu sửa baseline đã xác nhận — điều kiện đối chứng cụ thể

Phiếu này nằm trong T03/T08, dùng case release đã map trong ledger, **không thêm
gói, task hoặc case**. Checklist trước sửa giữ làm hồi quy. Đã thực thi lát local
theo [report A/B](roomqc-m06-hotel-scope-fix-local-2026-10-21.md): 280/280/run,
nguyên 180 ca gốc và 47 positives. Account/session/task/workflow, review độc lập
và release acceptance vẫn mở.

| Nhóm baseline | Số tình huống fail | Kết quả phải đạt sau sửa |
|---|---:|---|
| Owner đọc items khác tenant | 4 | Không trả hàng tenant khác; owner vẫn đọc được đúng dữ liệu tenant mình |
| Manager/department/staff đọc hotel ngoài assignment | 25 | Không trả hàng hotel chưa gán; dữ liệu hotel được gán vẫn truy cập đúng |
| Manager ghi hoặc đổi hotel ngoài assignment | 16 | Mutation bị chặn và effect ngoài phạm vi bằng 0; tác vụ hợp lệ không mất quyền |

**Trước khi code:**

1. Giữ run ebc16a5e968a và artifact gốc bất biến. Gắn actor fixture label trực tiếp
   vào observation mới; dùng table/role/operation/scope làm khóa so sánh giữa hai
   run, không yêu cầu UUID tổng hợp phải giống nhau.
2. Khóa tập 180 tình huống gốc: 47 positive và 133 negative. Harness phải assert
   completeness, không được làm số fail giảm bằng cách bỏ operation/actor/context.
3. Review tất cả policy SELECT và ALL, permissive OR/restrictive AND, USING và
   WITH CHECK, cùng caller của helper. Không globally rewrite
   user_has_hotel_access khi chưa đánh giá mọi nơi gọi. Không mặc định thêm quyền
   ghi chỉ để tạo positive control.
4. Chốt riêng platform direct-table/RPC và hotel_id NULL/shared theo schema và
   nghiệp vụ. Điểm chưa có quyết định giữ unresolved, không blanket deny hoặc
   mở rộng quyền xuyên tenant. Không suy snapshot live-state thành concurrent
   revoke fencing.

**Triển khai và kiểm chứng:**

1. Forward migration hẹp cho năm bảng; migration mới tạo bằng CLI đã khám phá
   --help. Giữ least privilege, ưu tiên SECURITY INVOKER, không tắt RLS/constraint
   hoặc đổi expected theo kết quả thực tế.
2. Trên tập gốc: đủ 180 observations, 47 positive vẫn đạt, 133 negative đúng
   contract; 45 tình huống sai cũ không còn trả hàng hoặc gây effect trái phép.
   Lỗi fixture, 409 FK, timeout hoặc 5xx không được tính là permission-deny đạt.
3. Mở rộng đối chứng owner write hợp lệ, owner khác tenant, manager assigned/
   unassigned, đổi tenant_id/hotel_id, và từng operation applicable. Bổ sung
   account/session/revocation, platform, NULL/shared và RPC/workflow theo contract;
   tổ hợp N/A cần lý do và reviewer, không báo toàn ma trận chỉ từ 180 tình huống.
4. Giữ receipt, lifecycle, email-admin/provider, parent-boundary và live-session
   regressions. Chạy focused rồi full control DB; tiếp theo fresh A và B trên cùng
   source/image/schema/harness đã khóa. Failed baseline không là expected-build
   reference. Hai rebuild tuần tự không thay T21 A/B cùng chạy.
5. Bàn giao before/after observations, completeness/positive report, migration/
   privilege delta, advisor disposition, cleanup và defects/limitations. Reviewer
   chưa ký thì giữ pending; số test xanh không tự đóng T08 hoặc gate.

Sau phiếu này vẫn phải hoàn tất 17-target/policy/FK, issuer/trust/atomic health,
alerts/admission/budget, signup/resume/reconcile, hai console, Linux/TLS/offsite
restore, E2E/load/RC và pilot. Không thu nhỏ mục tiêu vào bản sửa phân quyền.

#### 15.2.3. Phiếu kế tiếp — account/session và đường gọi nghiệp vụ

**Phạm vi:** phần còn thiếu của T03/T08 trong mapping hiện có, không phải task mới.
Mục tiêu là xác định và sửa sai lệch đã tái hiện, không mặc định mọi actor bị lỗi.
Chỉ dùng backend tổng hợp exact-owned. Phiếu ban đầu chưa chạy lúc chốt plan;
đã thực thi lát direct REST theo [report mới](roomqc-m06-business-actor-fix-local-2026-10-21.md):
A/B 1.764/1.764, giữ 280 scope, 20 owner-POST races. Giữ checklist dưới đây để
hồi quy, không coi mọi role/action/RPC/Edge hoặc service-mediated paths đã đạt.

**Đầu vào/source cần đọc:**

- Migration hotel scope mới nhất và scripts/control-backend-hotel-scope-checks.mjs:
  giữ nguyên danh tính/expected của 280 observations đã đạt.
- scripts/control-backend-actor-session-checks.mjs và migration
  20261020093925_platform_mutation_live_session_fencing.sql: bằng chứng hiện có
  cho bốn privileged roots không thay actual REST của năm bảng.
- Callers, grants/RLS/trigger/RPC và tài liệu role/capability của candidate;
  platform direct-table khác privileged admin API. Chưa chốt thì ghi unresolved.

**Thứ tự thực hiện và nghiệm thu:**

1. Khóa manifest/harness/target; liệt kê từng đường direct REST và RPC/workflow
   đang được UI dùng. Với năm bảng, lập role × operation × actor-state × scope;
   đánh applicable/N/A kèm lý do trước khi chạy, không nhân tổ hợp để khoe count.
2. Dùng owner A/B, manager/department/staff có quyền tương ứng; platform actor
   tách riêng theo capability/AAL. Mỗi actor phải login qua Auth thật và có
   positive đúng tenant/hotel/action trước negative. Không dùng service-role
   thay positive của nhân viên.
3. Thử riêng các trạng thái unconfirmed, banned, Auth soft-deleted, profile
   deleted, locked, inactive, status NULL, session expired/deleted/wrong/missing.
   Chốt operation nào đòi live state; nếu khác contract hiện hành, đưa thành
   quyết định sản phẩm, không âm thầm đổi quyền để làm test xanh.
4. Mỗi trạng thái dùng positive → thay đúng một state tổng hợp → gọi API →
   đối soát dữ liệu/audit/receipt → restore state → positive lại. Installer chỉ
   thay fixture và đọc hậu kiểm; giữ failed/partial/not-run khi run bị ngắt.
5. Thêm logout qua GoTrue thật: giữ token cũ trong bộ nhớ test, xác minh session
   đã thu hồi rồi gọi lại đúng API; login mới phải phục hồi quyền hợp lệ.
   Không đưa token/password/session identifier có thể dùng lại vào artifact.
6. Tách rõ hai loại bảo đảm: kiểm state sau khi revoke đã commit và request
   cạnh tranh revoke. Với sensitive mutation cần fencing, chạy hai thứ tự lock
   có barrier/lock observation: revoke thắng thì deny/no effect; mutation lấy
   quyền trước thì hoàn tất theo thứ tự nhất quán, request sau bị từ chối.
   Snapshot trước/sau hoặc sleep không chứng minh race. GET chỉ ghi bảo đảm
   đã thực đo, không hứa hủy dữ liệu đã trả hoặc stream đang mở.
7. Nếu có mismatch: lưu baseline và intended contract; thêm forward fix hẹp.
   Không cấp browser quyền đọc Auth tables, không blanket grant helper đặc
   quyền, không tắt constraint/RLS, không suy user_metadata thành quyền.
   Helper private cần đặc quyền phải có caller guard/search_path/grants hẹp
   và review. Kiểm workload/latency vì live-session check có chi phí.
8. Hồi quy cả scope 280 ca, action positives, registration/receipt/hotel-delete,
   parent-boundary, lifecycle và email/provider. Chạy focused → full control DB
   → fresh A/B cùng candidate nếu source/harness đổi → advisors → exact cleanup.
   Hai rebuild tuần tự vẫn không thay T21 A/B đồng thời.
9. Bàn giao matrix có key trực tiếp table/path/role/state/operation/scope,
   expected/actual/result-count/allowed-effects, completeness denominator,
   known gaps, before/after delta, defect refs và reviewer. Không tính 5xx,
   timeout, fixture lỗi hoặc integrity guard là authorization-deny.
10. Reviewer chỉ ký lát local sau khi mọi tổ hợp applicable đã có kết quả,
    N/A/unresolved được giải thích, positive phục hồi đạt và không mất case cũ.
    Chưa đủ người review thì pending; không đóng toàn T03/T08 hoặc gate release.
    Tiếp caller matrix mục 15.2.4, rồi 17-target/policy/FK → issuer/trust → timed
    health theo mục 15.2; không lặp lại direct REST như lát chưa triển khai.

#### 15.2.4. Phiếu kế tiếp — caller, capability và luồng nghiệp vụ

**Mapping:** T03/T04/T08 và case hiện có; không thêm task/case release. BE nhận,
QA review; tên người vẫn pending. Chỉ đọc source và kiểm dữ liệu tổng hợp trên
exact-owned backend; không thử vào runtime phục vụ khách.

**Đầu ra phải bàn giao:** caller inventory + intended-access matrix đã khóa,
run/effect artifacts, confirmed defects và unresolved decisions tách riêng.

1. Truy từ entry UI/mobile → hook/client → REST/RPC/Edge/server → bảng/trigger/
   FK/definer. Mỗi dòng ghi path, operation, caller role, auth mode, target scope,
   action/capability/AAL nếu contract yêu cầu, state guard và source revision.
   Không chỉ liệt kê năm bảng; bao gồm users/profile/role/assignment authority
   và các đường gián tiếp có trong 17-target inventory.
2. Khóa expected từ permission contract và use case trước test. Với mỗi role,
   liệt kê action allowed/denied/N/A/unresolved có lý do; platform-support khác
   owner và khác service worker. Chưa có quyết định thì không suy actual là quyền
   đúng, không tự mở hoặc blanket deny chức năng cần dùng.
3. Ưu tiên ranh giới live-state ở đường service-mediated và profile self-update:
   update-user Edge đang dùng privileged client và profile/role writes riêng;
   đây là source-review candidate, chưa confirmed runtime defect. Kiểm caller
   guard/capability/target/column allowlist/atomic effects bằng controlled baseline
   trước khi quyết định fix. Không trả session/token hoặc cho actor tự sửa trạng
   thái khóa/quyền trái contract.
4. Actual Auth positive → thiếu capability/khác hotel/khác tenant/revoked hoặc
   locked theo contract → actual API → snapshot allowed effects → recovery
   positive. Service-role chỉ chạy bên server đúng contract, không thay token
   người dùng để làm test pass. Edge chưa được bundle thì báo not-run, không dùng
   SQL SET ROLE thay chứng cứ endpoint; thêm allowlist/bundle rõ ở runner riêng.
5. Với mutation nhạy cảm: yêu cầu atomic authorization + business effect + audit/
   receipt khi contract quy định; kiểm mất response, retry cùng key, stale version,
   revoke-before/revoke-during bằng lock barriers thực. Không suy 20 owner POST
   races thành PATCH/DELETE/RPC/Edge hoặc mọi role đã được fence.
6. Inventory completeness phải có mẫu số: mọi caller/path/action được phân loại,
   thiếu route/fixture/unresolved không tính pass. Baseline failures giữ bất biến;
   chỉ forward-fix defect đã xác nhận, không đổi historical migration/expected.
7. Hồi quy 280 scope + 1.764 actor + 20 scoped races, các suite liên quan, full
   control DB và fresh frozen-source A/B nếu source/harness đổi. Bằng chứng cũ
   chỉ là historical nếu không cùng candidate; cần advisors/cleanup/reviewer.

**Điều kiện chuyển lát:** không còn confirmed blocking defect trong phạm vi nhận;
caller nào chưa kiểm có disposition/owner/dependency rõ, không kết luận all-safe.
Sau đó lần lượt 17-target/policy/FK, issuer/trust, atomic timed health, rồi tất cả
alerts/admission/budget/signup/consoles/Linux/DR/E2E/load/RC/pilot theo mục 15.2.
Đủ input để code bước sau không tự đóng T03/T08 hoặc gate L/S/P/U/B.

**Cách nhận phần còn lại sau self-profile:** giữ nguyên EC01–EC16 của inventory
ban đầu, không sửa lại fingerprint lịch sử hoặc cộng thành release case mới.
Mỗi lát dưới thuộc T03/T04/T08; BE thực hiện, FE nối caller, QA review. Tên người
và thời hạn lịch chỉ được điền khi RoomQC phân công; chưa có thì vẫn pending.

| Thứ tự / caller | Việc cụ thể trước implementation | Đầu ra và điểm dừng nghiệm thu |
|---|---|---|
| EC05 — đổi mật khẩu | Truy ChangePasswordPage, current-password/reauth, GoTrue updateUser và acknowledgement trong users; khóa contract phiên cũ/phiên hiện tại/forced-change trước baseline | Bản contract + actual Auth before/after + fault/recovery; không cho một PATCH metadata thay chứng cứ đổi mật khẩu |
| EC10/EC11 — membership khách sạn | Khóa ai được thay assignment/primary/flags, quan hệ tenant/hotel và quyền hiệu lực; đối chiếu đủ trường schema thực | Replacement atomic hoặc operation theo contract; không mất assignment khi bước sau lỗi, stale edit có kết quả rõ; quyền API thực đổi đúng |
| EC12–EC15 — quyền hiệu lực | Ghi truth table role grant, custom grant, enabled=false, module/action và inherited permission; trạng thái chưa quyết định ghi unresolved | Positive/negative API trước–sau, fault/retry/concurrency; không suy xóa custom row là thu hồi role grant và không tự đổi deny-override |
| EC06–EC08/EC16 — invitation/legacy Edge | Inventory source/config/deploy allowlist; chốt endpoint giữ hay bỏ và đường gọi thật, không suy từ việc không thấy frontend reference | Controlled bundle riêng, recipient/capability/tenant/expiry/revoke/replay/response-loss; synthetic sink chỉ local, inbox thật nghiệm thu riêng |
| EC01/EC09 và full workflow | Hoàn thiện read/list, hierarchy/department, disable/offboard/delete, retention và durable retry qua remount/tab mới | Matrix có mẫu số; populated FK/receipt/tasks/session proof, không xóa dữ liệu khách để tạo fixture hoặc làm cleanup |

**EC05 — phiếu baseline ban đầu, kết quả mới nhất và việc tiếp theo ở mục 15.7:**

1. Chốt sản phẩm: đổi mật khẩu thông thường, bắt buộc đổi lần đầu và recovery là
   ba ngữ cảnh khác nhau. Quy định khi nào cần current password/reauth, tuổi phiên,
   trạng thái locked/inactive và phiên nào còn hợp lệ sau đổi. Quyết định chưa có
   thì đánh unresolved, không tự đăng xuất mọi người hoặc nới Auth config.
2. Ghi intended outcome cho Auth change và profile acknowledgement. Ngoại lệ
   must_change_password true→false hiện được giữ để tương thích caller, **không**
   chứng minh mật khẩu đã đổi và không đóng forced-change authority contract.
3. Chạy actual Auth baseline trên fixture exact-owned: hợp lệ, sai current password
   theo contract, revoked/expired/locked, thay identity khi form đang mở; ghi actual
   login trước/sau bằng kết quả boolean, không lưu plaintext/token vào artifact.
4. Kiểm riêng Auth success/profile acknowledgement failure, response loss, retry,
   hai tab và refresh. Auth và Postgres không tự trở thành một transaction; cần
   state/reconcile theo khả năng vendor đã xác minh, không báo UI hoàn tất giả hoặc
   retry đổi mật khẩu mù khi chưa rõ kết quả. Không dùng service credential để
   impersonate positive control của nhân viên.
5. Nếu baseline xác nhận defect: lưu failed evidence trước, sửa forward đúng
   contract, kiểm lại cả positive/negative/recovery và actual login. Giữ self-profile
   metadata/avatar + employee + account/session/hotel-scope regression; candidate
   đổi thì full A/B đóng nguồn lại. Chưa có browser/Android proof thì chỉ ký local.

**Cổng chuyển lát:** reviewer đối chiếu expected/actual và các effect có dữ liệu;
confirmed blocker trong lát phải được xử lý hoặc có quyết định rõ. Việc chưa
kiểm/ngoài bundle không được biến thành pass. Sau caller vẫn đi hết indirect
authority/policy/FK, issuer/trust và các đợt VPS/signup theo dependency hiện có.

#### 15.2.5. Phiếu ưu tiên — sửa hồ sơ nhân viên không lưu dở dang

**Vị trí:** một lát của 15.2.4/T03/T04/T08, không thêm gói/task/case.
**Input:** [baseline fail có effect proof](roomqc-m06-employee-workflow-baseline-local-2026-10-21.md).
BE nhận; QA review; FE thực hiện caller. Tên người và signoff còn pending.
Chỉ implementation ở integration; test trên backend tổng hợp exact-owned.

**Lỗi cần khép:** manager sửa staff hợp lệ, profile đã commit nhưng ghi lại role
hiện có bị 403. UI có thể báo lỗi dù dữ liệu đã thay đổi; retry không có transaction
chung cho profile/quyền/audit. Không nới quyền sửa role để chữa thao tác metadata.

**Trạng thái trước nhận tiếp:** [contract](roomqc-employee-profile-edit-contract-2026-10-21.md)
và [full local A/B](roomqc-m06-employee-atomic-fix-local-2026-10-21.md).
400/23514 đã phân loại và forward-fix audit action update, giữ constraint. A/B
candidate 682/537 đều exit 0/cleaned, 30 employee checks/4 races cùng 280/1.764/20
regression và final integrated recovery đạt. Owner/self entry có unit proof,
không thay actual self-profile/browser/Android. Phiếu dưới giữ contract hồi quy;
nhận caller 15.2.4 và remaining retry/full matrix/E2E, chờ reviewer độc lập.

**Thứ tự triển khai cụ thể:**

0. **Đã thực hiện diagnostic:** actual schema/fixture xác nhận constraint action;
   fix update cho positive hợp lệ, fault audit vẫn rollback. Giữ baseline và
   proof đã lọc; không sửa expected/constraint. Hai failed run và diagnostic
   không là passing full A reference. Fresh A/B phải dùng default full runner.
1. Đối chiếu contract của edit hiện tại: role/level là chỉ đọc; trường metadata nào
   được sửa, ai quản lý ai, hotel/position/supervisor hợp lệ và tác động membership.
   Đổi role, khóa tài khoản và offboarding là hành động riêng; không gộp quyền mới.
2. Đối chiếu schema thực: primary hotel ở users.hotel_id; user_hotels là membership.
   Không dùng is_active/is_default/departments trên user_hotels khi schema không có.
   Viết expected allowed/denied trước khi sửa migration, hook hoặc Edge.
3. Thiết kế một server operation cho edit hợp lệ: live actor/session, tenant/hotel,
   hierarchy/capability và column allowlist kiểm ở server; profile + membership
   nếu cần + audit cùng transaction. Role/level phải giữ nguyên; reject trường
   ngoài contract. Không tin user_metadata hoặc quyền client tự gửi.
4. Chốt stale/concurrency và retry: expected version/updated_at theo contract,
   khóa actor/target theo thứ tự nhất quán; lỗi audit/validation không để profile
   commit riêng. Không giữ DB transaction qua HTTP. Nếu cần RPC/definer nội bộ,
   có lý do đặc quyền rõ, schema riêng, search_path/ACL hẹp; không bỏ RLS đại trà.
5. Tạo forward migration bằng CLI theo quy trình; không sửa migration đã áp.
   Chuyển desktop/mobile useUpdateUser sang cùng operation, bỏ role write thừa
   và client audit như nguồn chứng cứ duy nhất. Giữ lỗi thật cho UI, invalidate
   đúng query; form hydrate supervisor/identity không mất text đang nhập.
6. Sửa disposition entry owner/self trước handoff UI: tự sửa hồ sơ dùng /profile,
   target owner/platform khác có đường thao tác đúng quyền hoặc lý do không cho sửa;
   không mở rộng employee RPC chỉ để nút hết lỗi. Kiểm retry qua close/remount/tab
   mới riêng, không suy từ request key trong một hook instance.
   Với update-user Edge và các caller thay quyền/membership còn lại: phân loại
   dùng thật/không dùng/chưa bundle. Chưa runtime-test thì giữ not-run/source
   concern; không coi fix hook là đã sửa endpoint đặc quyền hoặc mọi luồng nhân viên.
7. Chạy baseline→fix→regression theo protocol mục 16. Giữ failed run bất biến;
   source/harness freeze trước fresh A/B, không dùng run 682ee517c6c9 làm passing
   reference. Chỉ đóng lát này sau actual effect proof, terminal và cleanup.

**Bàn giao bắt buộc:** contract/column/role matrix, caller delta, migration nếu có,
focused unit/integration, actual API/effect/fault/race report, advisors disposition,
full control regression và fresh passing A/B; browser/Android edit→reload proof
gắn candidate ở đợt E2E, không thay bằng component mock.

**Điều kiện dừng/đóng:** nếu contract quản lý staff/hotel/role còn mâu thuẫn thì
để unresolved và xin quyết định, không tự mở quyền. Manager sửa metadata hợp lệ
phải thành công trọn vẹn; forbidden/stale/revoked/audit-failure không có effect
trái contract; authority giữ nguyên; retry không tạo audit/membership thừa.
Chưa đủ môi trường/reviewer thì releaseAcceptance/gate giữ nguyên. Sau lát này
tiếp caller/17-target/policy/FK → issuer/trust/health → toàn bộ các đợt còn lại.

### 15.3. Rủi ro đóng gói phải xác minh trước VPS

Hai quan sát source dưới đây **chưa được xác nhận bằng deploy Linux**; ghi vào
T18/F02–F03 và hồi quy Auth/callback liên quan, không tự kết luận đã gây lỗi runtime:

- supabase/functions/mcp/index.ts hiện có import npm chứa đường dẫn tuyệt đối
  Windows đến worktree. Bundle Linux không được phụ thuộc máy phát triển; cần
  reproducible build/resolve trong image sạch, không mount source laptop.
- src/lib/mcp/index.ts hiện đặt issuer theo projectRef.supabase.co/auth/v1.
  Phải đối chiếu MCP có nằm trong release bật dùng không và issuer self-host
  theo cấu hình cluster được duyệt. Nếu bật: kiểm token đúng issuer, sai issuer/
  audience/cluster và revoked session theo contract; nếu tắt: chứng minh route/
  capability bị tắt thật. Không mở issuer wildcard để “hết lỗi”.

Sandbox hiện tại chỉ có allowlisted Edge set; kết quả A không bao phủ hai điểm
này. Không coi chúng là defect runtime đã tái hiện hoặc fix đã hoàn thành.

### 15.4. Gói nghiệm thu một đợt

Người nhận bàn giao dùng cùng một bộ: manifest candidate → T/P/case → expected/
actual → terminal logs đã lọc → DB/receipt/effect assertions → advisor disposition
→ cleanup → defects/external gaps → reviewer → gate decision nếu có.

Đợt local đủ evidence chỉ được đề nghị scoped_local_verified. P là quyền bắt
đầu pilot sau staging/RC; G08 là kết quả quan sát pilot sau đó; U cần G08 và
quyết định mở public riêng. B là backlog thanh toán riêng, không được bật theo U.

Báo cáo cuối luôn tách: **đã làm**, **đã chạy test**, **chưa kiểm**, **cần đầu vào
external**, **việc kế tiếp**. Lượt lập plan gốc chỉ thu nhận terminal đã chạy và
sửa tài liệu; là lịch sử. Các mốc analyzer/control 177, scope/control 186 và actor/
control 189 giữ đúng source/report riêng. Handoff hiện hành có forward migration
và A/B local theo report đầu trang, không deploy runtime đang phục vụ. Không biến
structural match hoặc scoped proof thành full matrix/release signoff.

### 15.5. Lịch sử kiểm tra tính sẵn sàng của bộ kế hoạch trước bản sửa

Đối chiếu lại ngày 21/10/2026 theo phạm vi người dùng xác nhận: toàn bộ VPS +
signup, đầu ra plan + bộ nghiệm thu. Kiểm tra cấu trúc ledger ghi nhận đủ
27 gói/25 task/70 case, liên kết hai chiều hợp lệ và đồ thị dependency không có
vòng lặp. Source scope recompute vẫn là 666 files/533 migrations với fingerprint
98ffe3ac46731eab4e6ae9e99a12f0757eb82265432155bca017e65499be3dbc.

Lượt đối chiếu này chỉ cập nhật tài liệu/ledger và kiểm tra tính nhất quán;
**không chạy lại product test, không sửa policy, không deploy, không bật signup,
không ký nghiệm thu**. Kết quả 182/182 và baseline 180/45 là bằng chứng lịch sử
được dẫn lại đúng phạm vi. Cả 122 releaseAcceptance entries vẫn unverified;
điều đó không có nghĩa toàn bộ code chưa làm, mà chưa đủ proof/review release.
Nhân sự owner/reviewer chưa có tên; phần khóa/quyền external giữ trong checklist
mục 14 để xử lý đúng đợt, không tự coi deferred là pass.

### 15.6. Kết quả chốt bộ plan và nghiệm thu theo phạm vi đã trả lời

Phạm vi giữ **toàn bộ VPS + signup**, đầu ra **Plan + nghiệm thu**.
Bộ giao việc gồm tám đợt, 27 packages / 25 tasks / 70 release cases; mỗi T có
input/dependency/role thực hiện/review/case/deliverable, mỗi đợt có artifact,
điều kiện chuyển, rollback và phần external cần bàn giao.

Thứ tự tám đợt ở plan/phiếu/protocol thống nhất: nền quyền + T05/T08/T06 →
T07 cảnh báo → T09/T10 admission/budget → T11–T13 signup →
T14–T17 consoles → T18–T20 Linux/DR/on-call → T21–T24 E2E/load/RC →
T25 pilot. Đồ thị dependency của ledger vẫn là nguồn điều phối; không chạy T06
trước T08, không chờ T23 đo tải xong mới cấp budget tạm T10 cho signup.

Mốc nhận việc caller trước build/config, giữ lịch sử: EC05 candidate 715/540 có native Auth và compiled
application-engine diagnostic: 33/33 gốc, 7 fault checks/4 races và 7 actual
caller checks. Engine/caller và native recovery context đã triển khai có phạm vi;
browser/multi-tab/Android và full A/B chưa đóng. Nhận image provenance/freeze,
config fault/missing-helper, invitation/pre-profile/offboarding/recovery và
EmailAuthFlow riêng còn SDK-only theo 15.7, rồi fresh full regression.
Sau diagnostic chỉ thêm hai mobile tests; hash trước run và sau test bổ sung
tách riêng trong report. Self-profile candidate 694/538 full A/B và employee
15.2.5 giữ regression lịch sử, không tự chuyển proof sang candidate mới.
Sau EC05, tiếp
EC10–EC15 permission/membership và invitation/legacy Edge trong 15.2.4
theo inventory 16 đường ban đầu cùng caller delta mới; full matrix/E2E/reviewer
còn mở. Giữ baseline partial commit, failed
attempts/diagnostic bất biến. A/B cũ chỉ historical; A/B mới cũng không là release
acceptance hoặc T21 simultaneous proof. Tiếp toàn bộ các đợt, không thu hẹp mục tiêu.

Lượt chốt plan gốc chỉ sửa docs và nhận terminal cũ; đó là lịch sử, không là
test mới. Lượt employee đã có control 194/194, FE 51/51. Lượt self-profile có
forward implementation ở integration và full A/B/control 199/199, FE 79/79,
TypeScript/ESLint cùng caller delta theo report đầu trang. Chỉ test disposable,
không đổi serving runtime/DNS/provider, không
deploy VPS hay mở signup/billing. Static plan checks là nghiệm thu tính nhất quán
tài liệu, khác scoped product proof và khác staging/release acceptance.

Estimate còn là khoảng 30–47 ngày công, dự phòng 36–57, cộng thời gian chờ
external và pilot ≥7 ngày; phải ước lượng lại sau disposition quyền/pipeline
và cấu hình VPS staging. Không cam kết 100.000 concurrent users từ các số này.
Tất cả 122 releaseAcceptance vẫn unverified, gate L/S/P/U/B không đổi.
Tên owner/reviewer/signoff, policy/quota, VPS/domain/email/offsite/on-call
và cohort phải được bàn giao trước đúng bước; thiếu khóa/quyền không là pass.

### 15.7. Phiếu EC05 hiện hành — hoàn tất server sau policy/SDK diagnostic

**Dispatch sau pagination752/545:**15 compiled admin +31 management +19 Auth/
SMTP +22+7 đạt;388FE/228DB-opt-in control.125 IDs/3 pages đúng DB, compiled
successful create/resend là subset19; giữ UI fencing/pagination/send làm hồi quy.
Nhận full inviter/membership/report/position/recipient/offboarding matrix,
observed locks/browser/network/Android rồi8/9. Mục7 chưa đóng; diagnostic không
thay default full frozen-source backend A/B/reviewer.

**Mốc build/config717 — lịch sử:** mục1 đã có hai independent uncached builds và
diagnostic rebuild cùng exact image trên builder/platform ghi trong report.
Mục6 có7 actual config/helper/grant/invalid-contract faults với no-effects và
restoration positives; wrong-image/version deployment preflight còn mở.
Nhận EmailAuthFlow riêng, mục7, network/browser semantics còn thiếu và8/9.
Các mục2–4 đã có implementation và scoped
proof trong report đầu trang, giữ để hồi quy/bổ sung browser/multi-tab. Context
native ở mục5 đã có proof ordinary/recovery giới hạn. Nhận phần deployment/review
còn mở của1/6 cùng7/8/9 và EmailAuthFlow invitation/recovery riêng; không giao lại
build/config đã đạt hoặc bỏ toàn bộ requirement các mục này.

**Checkpoint cập nhật22/10; giữ tên mục để không gãy link cũ. Mapping không đổi:**
T01/T03/T04/T08 và release cases đã gắn; không thêm task/case. BE nhận server/config/
lock matrix, FE nhận caller, QA/reviewer kiểm actual endpoints/effects. Chưa có tên
hoặc cam kết ngày lịch. Phần cần khóa/quyền external tách riêng, không tính pass.

**Đã có, không giao lại như chưa làm:** giữ baseline017ef7649ae0 (33/12 đạt/21 fail),
policy diagnostic9fff40934250 (33/18 đạt/15 fail), native guard705 (33/33),
[adversarial706](roomqc-m06-password-adversarial-local-2026-10-22.md) (33/33 + 7 checks/
4 races) và failed harness attempt bất biến. Native guard chặn flag-only và
locked/inactive, hoàn tất genuine password change trong cùng Auth transaction;
metadata/admin reset không tự complete. Đây là scoped actual proof, không suy
đủ recovery/invitation, every mutation hoặc toàn bộ EC05.

| Thứ tự nhận | File/boundary và việc chính xác | Test/điều kiện chuyển |
|---|---|---|
| 1. Khóa provenance build | Scoped local đã đạt717: pinned epoch/platform, timestamp rewrite, hai checkout/build không cache cùng exact image/config/layers/binary và diagnostic rebuild khớp. Giữ invariant; còn registry/cross-builder/maintainer/rollout review | Record upstream/patch/source/builder/runtime/image identity; full A/B cùng exact image. Không suy ra nguyên nhân historical705/706 hoặc release reproducibility mọi builder |
| 2. Khép forced caller | src/pages/auth/ChangePasswordPage.tsx, src/contexts/AuthContext.tsx: bỏ browser PATCH/metadata cờ, sleep300ms và success/navigate trước readback; ordinary forced cần current password | Actual current-password errors, completion fault, pending giữ input và không navigate; không coi client flag đổi là completion |
| 3. Một contract client | src/hooks/useProfile.ts, các form ordinary/settings/forced/recovery, generated types: tạo operation UUID trước submit; captured actor/exact session và target client; gửi ID vào native Auth, đọc password_change_status với ID | Chỉ success khi actor/changeID/completedAt/flag khớp contract; RPC200/null/wrong receipt hoặc identity switch không success. Map current_password_invalid lẫn mismatch |
| 4. Durable unknown outcome | Lưu operation ID/context tối thiểu không password/token/hash; remount/new tab dùng server readback, không mutation retry mù; logout/switch không áp old result | Abort trước headers, sau headers/trước body, sau commit và trước local acknowledgement; readback pending/unavailable/same actor/session revoked; không đổi password lần2 chỉ vì timeout |
| 5. Recovery context | Native recovery/MFA/current-session authority, không query-string/user_metadata. Nếu cần mở status DTO/context thì forward migration CLI mới, không sửa539 đã áp | Ordinary/forced không giả recovery; genuine recovery đủ quyền; expired/replayed/reset/logout token có expected riêng; test old/new password và other-session revocation |
| 6. Config fail-closed | Scoped actual717 đã đạt7 faults: current-password/audit disabled, hai missing helpers, hai revoked grants, invalid completion contract; giữ hồi quy. Wrong version/image deployment preflight còn mở | 503/500 đúng expected, hash/session/audit/flag/receipt không mutation; cả7 restored actual positives. Không gọi5xx là permission-denial pass; chưa đóng Linux/preflight/release |
| 7. Invitation/pre-profile/offboarding | accept_staff_invitation và Auth guard có quan sát thứ tự lock khác nhau; lập graph và controlled concurrent baseline trước kết luận. Pending/expired/cancelled/email mismatch/pre-profile phải có expected | Hai thứ tự lock với observed barriers, bounded terminal/no unintended effects, restoration positives. Chưa tái hiện thì là source concern, không ghi defect đã xác nhận |
| 8. Freeze full regression | Default full runner trên candidate cuối: 280scope/1.764actor/20old races +employee30/4 +self66/4/Storage/parallel +password matrix, control/FE/advisors | Fresh full A/B cùng frozen source/schema/images/builds/policy, final recovery/cleanup. Failed/diagnostic không thay passing full reference; FE 90 cũ không là rerun706 |
| 9. Handoff và môi trường | ADR đã chọn custom GoTrue2.197; maintainer/update contract, compatible image/schema/client rollout và rollback; T18/T22 có test riêng | Reviewer ký đúng scope; browser/Android/Linux/registry digest/config thật chưa kiểm thì giữ not-run, không deploy serving để chứng minh local |

**Contract uncertainty:** completed operation ID reuse hiện trả409/no new effects,
không là replay-success hoặc payload equality. Readback cần exact live session;
mất/revoke session không được đọc qua actor khác hoặc cố đổi mật khẩu mù. UI cần
hướng dẫn đăng nhập/khôi phục lại theo tình trạng thật. Mọi thay contract phải
được review trước sửa expected tests.

**Điều kiện đóng lát local:** actual caller và server cùng contract, không success
giả/flag bypass/cross-actor receipt; đủ positives/negatives/recovery/fault/race,
full frozen-source regression và cleanup. Reviewer/gate riêng; không suy ra
release-ready từ33/33 hoặc206/206.

**Ngay sau EC05:** EC10–EC15 effective permission/membership →EC06–EC08/EC16
invitation/legacy Edge →full workflow/17-target/policy/FK →issuer/trust/atomic
timed health →alerts/admission/budget →signup/reconcile/abuse →consoles →
Linux/DR/on-call →simultaneous A/B/browser/Android/load/RC →pilot ≥7 ngày.
Giữ toàn bộ tám đợt, không thu nhỏ mục tiêu thành password.

## 16. Bảng điều hành hiện hành — toàn bộ VPS + signup

Ngày 22/10/2026; phạm vi và đầu ra theo xác nhận của RoomQC. Mục này là điểm vào
điều phối cho bộ plan hiện có, không tạo roadmap, task hay release case mới.
Mục 5 giữ chi tiết tám đợt; ledger giữ dependency và 27 gói/25 bước/70 case.
Mỗi kết quả có manifest/run riêng: checkpoint754/source472 lịch sử có scoped
pass nhưng default full A fail; candidate754/sourcef7 có fresh default
full A/B đạt local đúng scope. Candidate755/sourcee5 có T04 handler và full
control237; chưa rerun full-vendor/FE trên755. Số file giống nhau không phải cùng source.
752/751/744/741/738/725/717/730 giữ lịch sử; sửa tài liệu không là product acceptance.

### 16.1. Mô hình sản phẩm và phạm vi vận hành

- Khách chỉ đăng ký, xác minh email và khai báo khách sạn; RoomQC vận hành hạ tầng.
  Một đăng ký tạo workspace trên cụm đã chuẩn bị sẵn, không thuê VPS/Docker mới
  cho từng khách. Không hứa cách ly vật lý mỗi khách sạn: V1 dùng multi-tenant
  trong cụm với quyền/RLS, Auth và file được kiểm soát theo tenant.
- Control plane quản lý cụm, phân bổ, đăng ký, cảnh báo và audit; dữ liệu nghiệp vụ
  đi tới đúng cụm. Không biến control plane thành proxy mọi request.
- Một VPS pilot có thể cùng chứa control plane và cụm A nhưng vẫn là một điểm
  hỏng chung. Backup và cảnh báo phải ở ngoài host; chưa tuyên bố HA.
- Tài khoản đã gắn A không được chuyển sang B để chữa quá tải hoặc timeout.
  Bổ sung cụm cho khách mới sau capacity review; di chuyển khách cũ là quy trình
  có backup/cutover/rollback riêng, không nằm trong tự động signup V1.
- Gói/trial/quota/grace/retention/MFA và SLA chỉ là policy sau khi được duyệt;
  không tự áp con số đề xuất vào khách đang dùng. Billing thật có gate B riêng.

<a id="162-phiếu-nhận-việc-ngay-từ-checkpoint-717540"></a>

<a id="162-phiếu-nhận-việc-ngay--candidate754546-sourcef7da974"></a>

### 16.2. Phiếu nhận việc ngay — sau T04/sourcee5c5deb…

**Ưu tiên sau checkpoint T08/source2495:** nhận [packet local](roomqc-t08-release-validation-local-2026-10-22.md)
và [phiếu bước đầu cập nhật](roomqc-vps-signup-execution-ready-2026-10-22.md#12-phiếu-công-việc-đầu-tiên-khi-được-triển-khai-tiếp).
Hai fail fixture6f3 đã sửa,full control243/243 và lint/syntax10 đạt; không nhận
lại fix đã xong. Tiếp indirect/workflow/policy/FK và issuer→atomic health/timed
pipeline đúng phạm vi còn mở. Dispatch cũ dưới giữ lịch sử T04/current19,
không thay full-vendor A/B/FE mới hoặc đóng toànT08.

Phiếu này thay dispatch472/717/752 cũ, không thay dependency T01–T25.
T04 primary command-result handler đã có scoped local proof trên755/546;
full control237/237,0 skip. [ReportT04](roomqc-t04-command-result-local-2026-10-22.md).
Chưa typed client/UI/E2E hoặc đóng toànT04. Dòng1 dưới là nền sourcef7 lịch sử,
không phải fresh full-vendor proof của755; không nhận lại read handler như chưa làm.
Tên implementer/reviewer/signoff chưa được chỉ định. Vai trò dự kiến BE/OPS,
review QA; các bước dưới là checklist con T01/T03/T04/T08, không tạo task/case mới.

| Thứ tự / phụ trách dự kiến | Input/file cần rà | Việc phải bàn giao | Nghiệm thu và điểm dừng |
|---|---|---|---|
| 1 — BE/QA: nhận checkpoint, không làm lại baseline đã đạt | Report/artifact current19, sourcef7da974…, scripts/control-backend-no-policy-checks.mjs, control-backend-parent-boundary-checks.mjs và runner | Review red→green inventory19 và23 FK, actual full-run evidence, current control233/FE388; giữ failure b23/source472 riêng | A d6d4cddd7fe4/B0678a65fb125 terminal0, cleaned23/run và independent leftovers0, source/build/schema khớp. Không suy current19 indirect đã khép hoặc tự ký gate L từ bộ này |
| 2 — BE/QA: current19 indirect/policy/FK | Inventory17 legacy +employee/password receipts; access graph, latest RPC/Edge/view/trigger/definer/FK/dynamic entry;135 WARN/7 FK INFO và8 FK lịch sử | Mỗi target/entry có actor/session/tenant predicate, effective table/column/inherited grants, allowed effects, executed/not-run/reviewer/risk; phân tích policy OR và workload/index decision | Populated positive→negative no-effects→recovery qua actual caller/role đúng scope. Direct SQL19 và parent23 là hồi quy đã có, không thay indirect audit; không xóa index theo unused count |
| 3 — BE/QA: authority/workflow inventoried còn thiếu | Migration546, invitation authority, EC10–EC15/caller inventory15.2.4 | Giữ34 checks/6 observed races và15+31+19+22+7, captured-context/pagination/accepted replay; bổ sung đúng recipient/offboarding/legacy workflow còn thiếu | Ghi mẫu số đã chạy/chưa chạy và restored positives. Browser/two-tab/Android/network-before-headers không được thay bằng component/adapter proof |
| 4 — BE/QA: hồi quy sau delta, không tạo vòng lặp test | Manifest hiện hành; source/image/schema/config/contract của thay đổi tiếp theo | Mỗi delta có focused regression; freeze candidate mới trước gate, rerun FE/TypeScript/lint/full control/default full A rồi B cùng source/build | Không đổi source khi A/B đang chạy; A fail không là reference B. Giữ failed history/cleanup. Sequential rebuild không thay T21 đồng thời và không tự đóng releaseAcceptance |
| 5 — BE/OPS/QA: nối phần sản phẩm còn thiếu | T05/T08/T06; issuer/release/credential provenance, timed pipeline; contract vs handlers/callers | Khép trust/revision-atomic health→alert T07→admission/budget T09–T10→signup T11–T13→admin T14–T17 | OpenAPI không thay endpoint; làm private setup-status, durable job/resume/reconcile, command-result đọc bằng client key và hai entry admin; nghiệm thu bằng API/UI thật trước Linux/DR/E2E |

[Report current19](roomqc-m06-current19-direct-local-2026-10-22.md) ghi đúng
source/run/terminal/cleanup và giới hạn. Fresh default full A/B đã đạt local đúng scope, không thay T21 đồng thời hoặc release.
Không có production apply, reviewer hoặc release signoff. Gate và122 entries
không thay đổi. Không có khóa thật vẫn làm được source/contracts/local fixtures,
console và bộ cài preflight; external nghiệm thu riêng khi đủ input.

### 16.3. Mỗi khách đăng ký: hệ thống làm gì, RoomQC xử lý gì

Nhãn hành trình trong bảng không phải enum mới; workspace/job dùng mục3.
Mọi trạng thái phải có requestId và liên kết về workspace/cụm/job/receipt đúng quyền.

| Sự kiện | Hệ thống cần tự làm | Operator nhìn thấy / được làm | Kiểm chứng trước nghiệm thu |
|---|---|---|---|
| Gửi đăng ký | Validate/challenge/limiter → admission → reserve cùng một intent/affinity | Slug/requestId, cụm được gán, expiry và lý do chờ | C05–C10/D03/D12–D13: tranh suất cuối, retry và proxy không cấp trùng hoặc vượt limit |
| Chờ email | Gửi xác minh ở đúng cụm, giữ binding; chưa cấp dữ liệu nghiệp vụ | Bước chờ xác minh, gửi lại theo hạn mức; không xem token/mật khẩu | D02/D04/D15: sai email/cụm/code, hết hạn, gửi lại; inbox thật nghiệm thu riêng |
| Owner khai báo hợp lệ | Kiểm live verified owner, ghi unique job trước remote call; transaction tạo tenant/hotel/profile/trial/receipt | Timeline bước hiện tại, version và job; không giả danh owner | D01/D02/D07: một bộ dữ liệu, quota đúng policy đã duyệt, audit/receipt đầy đủ |
| F5/hai tab/mất phản hồi | Resume/setup-status và đối soát receipt, giữ cùng ID/cụm | “Đang xác minh kết quả”, retryAfter/nextAction, không báo “tạo lại” | D04/D07/D11: không tăng trial, tạo hotel hay chuyển DB lần hai |
| Worker lỗi/receipt chưa rõ | missing→waiting_owner; unavailable→retry bounded; conflict→needs_review; lease/fencing | Thấy nguyên nhân/lần thử/lần tới; recheck chỉ enqueue một job có completion read | D08–D10: kill/restart/stale worker không activate sai hoặc làm mất job |
| Workspace hoạt động | Route tới đúng cụm, áp entitlement/quota phía server; duy trì usage/audit | Link mở đúng workspace, tình trạng gói/usage/health và support metadata tối thiểu | A08–A11/E08/G01–G03: không đọc/sửa khách khác; revoke có effect; không dùng cache/token cũ |
| Hết trial/khóa/hủy | Chuyển trạng thái theo policy được duyệt; thông báo/audit idempotent | Lý do, thời điểm, hành động được phép; renewal/support theo quyền | Hồi quy lifecycle/entitlement tạiT03/T08 và journeyT22; không tự xóa dữ liệu, reset trial hoặc mở billing |
| Cụm đầy/mất số đo/hỏng | Đóng nhận mới, báo rõ lý do, giữ affinity khách cũ; alert ngoài host | Drain/close theo capability; mở lại có kiểm điều kiện, reason/version/receipt | B06–B09/C07–C10/G03: không fallback khách A sang B; ack không mở admission |
| Cần khôi phục | Dừng ghi/routing theo runbook, restore host sạch rồi xác minh/reconcile | Incident/restore packet, RPO/RTO, người cho phép mở lại | F05–F09: mapping/Auth/jobs/objects khớp; không route vào bản restore chưa đạt |

Một thao tác “hỗ trợ” không cho phép sửa receipt, đổi cluster tùy tiện, đọc toàn bộ
dữ liệu khách hoặc lấy mật khẩu. Export/delete/migration tenant cần policy và
quy trình riêng; không bổ sung nút phá dữ liệu để xử lý đăng ký kẹt.

### 16.4. Vận hành định kỳ sau khi triển khai

Đây là yêu cầu thiết kế/diễn tập cho T07/T10/T19/T20/T25, **chưa tạo automation
trong lượt này**. Chu kỳ và ngưỡng phải có policy/version; missing metric là lỗi.

| Tần suất / kích hoạt | Điều hệ thống theo dõi | Người chịu trách nhiệm và đầu ra |
|---|---|---|
| Liên tục, theo chu kỳ collector đã duyệt | Host/data mount/inode, DB pool/locks, năm dịch vụ, queue lag, credential/release revisions; fresh/stale/admission | BE/OPS: snapshot có provenance; fault và recovery có alert/outbox; không để monitor tự chứng minh toàn host còn sống |
| Mỗi đăng ký và mỗi lệnh admin | Dedupe, affinity, job/receipt/audit/lease, lỗi bước hiện tại, outcome chưa rõ | BE/QA: trace xuyên control và cụm, allowed effects; OPS có link recheck/result/runbook |
| Hàng ngày trong pilot | Signup success/stuck, retry/needs_review, quota, backup gần nhất, cert, cảnh báo chưa nhận; so khách đối chứng khi tải nặng | OPS: báo cáo ngoại lệ, tên người nhận và next action; không dọn/xóa job chỉ để dashboard xanh |
| Theo lịch backup đã duyệt | DB/Auth/queues/object bytes + directory/manifest, mã hóa offsite, readback checksum, độ tuổi backup và khóa khôi phục | OPS: verified upload không đồng nghĩa restore-verified; backup trễ chặn nhận mới theo policy |
| Hàng tuần và trước tăng cohort | p95/p99/errors, pool/I/O/storage growth, tenant top usage, cost/khách, headroom và incident trend | OPS+RoomQC: giữ limit/tăng cụm/giới hạn workload theo số đoT23; không tự tăng capacity từ số user đăng ký |
| Trước mỗi release/rotate và lịch DR được duyệt | Compatibility, rollback, missing/wrong secret, clean-host restore, quyền người trực | OPS+QA: release/restore/drill packet, reviewer độc lập; nếu không đạt giữ gate liên quan |

### 16.5. Đầu vào và điểm dừng, không để thiếu khóa làm mất việc

1. **Làm được ngay:** inventory/contract/fixture, source và local integration,
   UX dùng data synthetic, bundle/preflight thiết kế, runbook và bộ test.
   Mọi mutation test chỉ vào exact-owned disposable resources.
2. **Trước apply staging:** tên người chịu trách nhiệm, target host/Linux/mount/
   port/inventory, budget, secret refs, exact app/API/admin/callback origins.
   OPS xác minh trước mọi apply; không dùng CLI development stack làm production.
3. **Trước email/DR/on-call acceptance:** domain/sender/inbox cho phép, offsite
   store/retention/key custodian ngoài failure domain, đích alert và người trực.
4. **Trước pilot:** trial/quota/expiry policy đã duyệt, RC capacity/restore/rollback,
   cohort/consent và kill-switch owner. Thiếu input giữ deferred_external/not-run
   đúng phần, không hạ tiêu chí để tính pass.
5. Tên miền từng được nêu là roomqc.com, không chứng minh DNS/TLS/provider đã sẵn
   sàng. Chỉ nhận secret qua kho vận hành; plan ghi reference, không ghi giá trị.

Phần phải dùng quyền thật giữ bảng mục2.2/phiếu mục14 làm nguồn theo dõi.
Người cung cấp, deadline và người duyệt còn null thì không tự đánh dấu đã bàn giao.

### 16.6. Compatibility và gói bàn giao trước mở gate

T08/T18 phải pin và review release thực, không copy cấu hình docs “latest”.
Đối chiếu tài liệu Supabase22/10: self-host không có managed backup/Management
API; RoomQC phải tự vận hành các phần đó. Kiểm tương thích gateway
Kong/Envoy, TLS termination, external Auth URL/issuer/callback tránh nhân đôi
/auth/v1 và PostgreSQL/extensions/CVE disposition trên đúng bundle. Đây là yêu
cầu rà soát, chưa kết luận release đang dùng chịu tác động hoặc cần nâng ngay.

Nguồn đã đối chiếu:
[self-hosting](https://supabase.com/docs/guides/self-hosting),
[gateway transition](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b),
[Auth external URL](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1),
[PostgreSQL compatibility](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes),
[TLS cipher compatibility](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).
Thông báo managed/TLS không tự chứng minh self-host bundle bị ảnh hưởng; OPS
review endpoint/cipher/client thực tại staging, không âm thầm nâng vendor.
Connection budget tính tổng replica/vendor/worker/backup/migration và mode pool;
không dùng mỗi user một connection hoặc công thức RAM làm cam kết sức chứa.

Mỗi đợt bàn giao đúng một packet: T/P/case + candidate manifest + delta source/
contract/migration + expected/actual/positive/negative/recovery + fault/race
evidence + cleanup + defects/limits + rollback + external gaps + next action.
Reviewer kiểm packet trước thay releaseAcceptance; RoomQC ký gate riêng.
Phiếu diễn tập ở protocol 20 nối toàn hành trình khách và ca vận hành với 70 case
cũ, không dùng screenshot/toast hoặc số test làm bằng chứng dữ liệu.

### 16.7. Quyết định thiết kế cần khóa trong T04/T14

Phiếu giao việc [mục12.1](roomqc-vps-signup-launch-checklist-2026-10-21.md#121-đề-xuất-cụ-thể-cho-đọc-kết-quả-lệnh-và-hai-entry-quản-trị)
đề xuất đường đọc command result bằng **client idempotency key**, không chỉ
server commandId chưa nhận được khi mất response. Lookup có live authority,
target/operation/actor binding, no-store và unknown-outcome; giữ replay POST
cùng key/payload để tương thích. Handler/OpenAPI đã triển khai sau lượt lập plan,
có scoped local proof ở [reportT04](roomqc-t04-command-result-local-2026-10-22.md).
Typed client/command dialog/browser recovery còn ở T14–T17/T22; không đóng toànT04.

Hai entry quản trị dự kiến là `/super-admin/infrastructure` và
`/super-admin/registrations`. T14 phải làm đủ route/menu/guard/cache, sau đó
T15/T16 tích hợp API thật. Đây là đề xuất chi tiết để reviewer chốt, không
đánh dấu hai màn là đã tồn tại. Command-result handler đã có scoped proofT04;
typed client/UI/browser recovery vẫn chưa hoàn tất.

Lượt cập nhật kế hoạch trước checkpoint725 chỉ sửa tài liệu/artifact đã lọc,
không chạy lại product suites,
không deploy/SSH/DNS/provider/gửi mail thật, không thay policy/gate/signoff.
122 releaseAcceptance vẫn unverified; 30–47 ngày công/36–57 có dự phòng chỉ là
ước lượng cũ cần re-estimate, cộng chờ external và ≥7 ngày pilot, không cam kết lịch.
Kết quả kiểm tính nhất quán của plan được lưu riêng trong
[planning handoff artifact](../../../artifacts/roomqc-vps-signup-planning-handoff-2026-10-22.json).



