# Tiến độ thực hiện VPS/signup

**Phạm vi đã chốt ngày 27/10/2026: toàn bộ VPS + signup. Đầu ra: plan + nghiệm thu.**
Giữ 8 đợt, 25 task, 27 gói và 70 ca gốc. Khách chỉ đăng ký; RoomQC quản lý
cụm VPS, cấp không gian sử dụng, gói/quota, sao lưu và vận hành.

**Điểm nhận đã đối chiếu: có bản nháp sửa policy, chưa kiểm chứng.** Cây tích hợp
hiện có 1.022 file trong manifest có phạm vi, backend 198 file; 577 file migration
nghiệp vụ và 12 directory. Migration `20261027153807` cùng fixture/diagnostic mới
đã được viết; runner chưa nối hai chế độ kiểm mới. Chưa chạy native policy,
upgrade 576→577 hoặc hồi quy trên bản nháp; số file không phải tỷ lệ hoàn thành.

**Bằng chứng hoàn tất gần nhất của nhánh policy** vẫn là [baseline1019](roomqc-advice-policy-baseline-local-2026-10-27.md):
14 kiểm tra, 7 đạt/7 chưa đạt, exit 1. Giữ nguyên kết quả đỏ để đối chiếu sau sửa;
không chuyển thành pass từ việc đã viết code. Edge1018, UTC/upgrade1017 và các
proof khác chỉ có giá trị theo đúng source trong báo cáo gốc.

**Đọc và giao việc:** [bản điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md)
giữ tám đợt và đầu ra demo; [phiếu T01–T25](roomqc-vps-signup-detailed-delivery-2026-10-26.md)
giữ file, bước làm, dependency, kiểm nhận và rollback.
[Bộ 70 ca](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md) giữ nguyên
`not_run`; 122 mục release vẫn `unverified`. Chưa thay reviewer, signoff hay gate.
Lịch sử checkpoint giữ tại [tiến độ](roomqc-vps-signup-progress.md) và báo cáo gốc.

**Việc nhận tiếp:** [phiếu 19.38 — kiểm bản nháp và chuyển sang VPS/signup](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1938-phiếu-bắt-đầu-và-bàn-giao-plan--nghiệm-thu).
Giữ [contract policy](roomqc-advice-policy-command-contract-2026-10-27.md), đối chiếu 7 finding baseline rồi client/UI/freshness/retention/abuse và thiết bị
→ mobile money → generic exports → writer Q02 → Q03 → Q04 → T07 → T09/T10
→ T11–T13 → T14–T17 → T18–T20 → T21–T24 → T25. Giữ dependency trong ledger;
T14/T18 được chuẩn bị khi đủ đầu vào. Chỉ mirror tài liệu/artifact đã lọc;
implementation ở integration. Chỉ ghi kết quả kiểm thử đúng phạm vi báo cáo.

## Lịch sử checkpoint và bằng chứng có phạm vi

Các đoạn dưới giữ nguyên theo thời điểm đã ghi; điểm nhận hiện hành ở đầu trang.

**Bàn giao kế hoạch toàn phạm vi, inventory1022:** đã đối chiếu source có phạm vi
1022file/backend198,577file migration nghiệp vụ+12directory. Nhận bản nháp577
chưa có proof sau sửa; runner chưa nối diagnostic mới, receipt barrier trong
phép thử phải sửa để quan sát đúng INSERT. [Phiếu19.38](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1938-phiếu-bắt-đầu-và-bàn-giao-plan--nghiệm-thu)
ghi9bước đầu,8mốc bàn giao đến pilot và tiêu chí nhận/dừng/rollback.
[Biên bản kiểm kế hoạch](../../../artifacts/roomqc-vps-signup-plan-readiness-1022-2026-10-27.json)
chỉ xác nhận inventory/cú pháp/mapping/link và bảo vệ source; không là native
policy,upgrade,full,E2E,VPS hay nghiệm thu sản phẩm. Giữ70not_run/122unverified,
reviewers/signoff/gates; không mirror implementation hoặc gọi provider thật.

**Baseline1019 đang đỏ:** [policy API](roomqc-advice-policy-baseline-local-2026-10-27.md)
chạy đủ14test,7đạt/7chưađạt; nativeexit1,driver xác nhận expected red. Có2barrier
thật,schema/source giữ,ACL39,binding13,cleanup3checks0 và advisors737 chưa
disposition. Sourcea02a941a…/1.019file,backend196,576+12migrations. Chưa sửa
sản phẩm; nhận19.37 P3/P4/P8 theo contract,không gọi baseline là bản đạt.

**Checkpoint1018:** [Edge authority](roomqc-advice-edge-authority-local-2026-10-27.md)
đạt54 quan sát/274 assertions ở ba cửa sổ; native119/11 clock races và hồi quy
76/59/28,restart8+2,interruption13,binding13 cùng source c41b0e96…/1.018 file.
Không đổi code sản phẩm/migration/frontend. Schema/source giữ,9 kiểm cleanup0;
advisors703/704/730 chưa disposition. Nhận19.37 policy control/thiết bị rồi
mobilemoney/F3/Q02/Q03/Q04 và tám đợt. Chưa browser/Android/fullVPS;70ca,
122entries/reviewer/signoff/gates không đổi. UTC/upgrade1017 và frontend1014
giữ đúng proof gốc, không gán sang1018.

**Điểm nhận hiện hành 993:** [nâng cấp có dữ liệu 566→572](roomqc-report-upgrade-local-2026-10-27.md)
đạt 47/47 ca native và 13/13 source binding/Compose renderer; sáu migration
đều có fault rollback thật, giữ money/trial/source/notes/receipts và phục hồi
pending từ 571 sang 572. SHA `2280e040…`, 993 file, backend binding 185 file,
572 + 12 migrations. App/migrations giữ nguyên 992; native248/transport31
thuộc 992, frontend454/UTC200/full-control440 thuộc 991, không rerun.
Nhận [19.27](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1927-phiếu-nhận-sau-populated-upgrade993)
cho advice → mobile money → F3 → Q02/Q03/Q04 và đủ tám đợt. Chưa old-binary
rollback/browser/Android/default-full/rebuild/deploy; advisors726 chưa
disposition. 70 ca/122 entries/reviewer/signoff/gates giữ nguyên; chỉ mirror
docs/artifact.

**Checkpoint frontend lịch sử990:** [giao diện mục tiêu và phục hồi lệnh](roomqc-report-target-callers-local-2026-10-27.md)
đã chuyển reader/form khỏi hai bảng target sang3RPC; batch có revision,
controlled draft, decimal/zero/delete và explicit legacy review. Pending lưu
trước network, lookup/replay giữ key qua reload/relogin/hai tab; scope đổi
không nhận kết quả cũ.424/424frontend/28file, UTC170/170, TS0 và lint0lỗi/2cảnhbáo;
SHA `edc7ea21…`,990file. Backend183file/571+12migrations giữ nguyên980,
không rerun native/full. **Chưa khép terminal conflict recovery:** nhận19.24
của [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md) cho
server cancellation có fencing + caller/UI/tests, rồi advice/mobile/F3/upgrade/
Q02/Q03/Q04 và đủ tám đợt. Chưa browser/Android/TCP-loss/upgrade/deploy990;
70ca/122entries/reviewer/signoff/gates giữ nguyên. Không deploy571/990độc lập.

**Checkpoint backend lịch sử980:** [quyền và lệnh lưu mục tiêu báo cáo](roomqc-report-targets-core-local-2026-10-27.md)
đã chặn6bypass/trùng dữ liệu được tái hiện; có scoped read, batch command,
revision/audit/result atomic và lookup/replay. Native214/214gồm14race thật,
full control440/440 exit0không skip; ACL37bảng vàdrill độc lập4/4đạt.
SHA `4e9fc77f…`;571business+12directory/backend binding183file.
**Caller chưa chuyển RPC; không áp migration571 riêng lẻ.** Nhận19.23 của
[phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md), rồi F2advice/
mobile→F3/upgrade→Q02/Q03/Q04→đủ tám đợt. Chưa frontend/E2E/default-full/
rebuild/deploy980;70ca/122entries/reviewer/gates giữ nguyên.

**Checkpoint frontend lịch sử979:** [overview và insights nối nguồn server](roomqc-operations-consumers-local-2026-10-27.md)
đã triển khai DTO/query scoped, một nguồn cho KPI/chart, current/previous/YoY,
recognized revenue và room-only ADR/RevPAR; occupancy dùng occupied days và
mẫu số từng kỳ, so sánh ghi điểm %. Target tháng chỉ áp đúng kỳ; lỗi nguồn
không giả thành 0. 330/330 frontend trên 25 file; UTC subset76/76, TypeScript0,
lint0lỗi/44cảnh báo. SHA `3ff92cd3…`; backend183file/570+12 migrations giữ nguyên961.
Nhận **19.22** của [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md):
target/advice/mobile còn lại → F3/upgrade → Q02/Q03/Q04 → đủ tám đợt.
Chưa native/full/browser/Android/download/deploy mới;70ca/122entries/gates giữ nguyên.

**Checkpoint backend lịch sử 961:** [server aggregate vận hành](roomqc-operations-aggregate-local-2026-10-27.md)
đạt 153/153 native Auth/REST, 9 race khóa thật; đầy đủ trên dataset >10.000
lượt và chi phí; current/explicit previous/YoY/daily cùng nguồn tài chính.
ADR nights tách occupied days, có nhãn estimate/legacy cần đối soát.
SHA `974514cb…`; 570 business+12 directory/runtime183. Caller chưa nối;
nhận19.21 [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md),
rồi F3/upgrade/Q02→Q03→Q04→tám đợt. Chưa frontend/full/E2E/deploy mới;
70ca/122entries/reviewer/gates giữ nguyên, toàn mục tiêu active.

**Checkpoint frontend 960:** [dashboard cost/so sánh tài chính và lỗi nguồn](roomqc-dashboard-cost-consumers-local-2026-10-27.md)
có 247/247 frontend, UTC subset 41/41, TS exit 0; lint 0 lỗi/14 cảnh báo.
Monthly/labor scoped, exact cost range, Finance Hub đúng current/previous và
owner recognized revenue đã nối; source failure không giả 0. SHA `e22d9a45…`;
runtime 183 và 569 business+12 directory giữ nguyên 952. F2 server aggregates,
caps/YoY/overview còn mở; rồi F3/upgrade/Q02→Q03→Q04→tám đợt. Không chạy lại
native/full hoặc browser/Android; primary implementation/70ca/122entries/gates
giữ nguyên. Nhận mục 19.20 [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md).

**Checkpoint backend 952:** [quyền đọc chi phí tháng và nhân sự](roomqc-monthly-labor-scope-local-2026-10-27.md)
đạt 109/109 native Auth/REST, gồm 7 race có khóa thật, exit 0 và exact-owned
cleanup còn 0. Ba bypass monthly đã có red→green; labor có scope/session,
aggregate-only và nhãn ước tính. SHA `139a23d3…`; 569 business + 12 directory,
runtime 183 file. F2/frontend/insights/export khác và populated upgrade tới 569
còn mở; sau đó graph Q02→Q03→Q04→tám đợt. Không chạy lại frontend/full/writer
ở 952. Chưa deploy, ký 70 ca/122 entries hoặc mở gate. Nhận mục 19.19 của
[phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md).

**Checkpoint lịch sử 944:** [giao diện tài chính và xuất báo cáo](roomqc-financial-consumers-local-2026-10-27.md)
đã nối scoped RPC, cache theo phiên/khách sạn/kỳ và nguồn xuất mới có kiểm quyền
server trước dựng file và trước lưu. Desktop/mobile dùng recognized revenue,
lợi nhuận và fixed-cost allocation từ cùng DTO. 195/195 frontend mocks,
TypeScript đạt; lint0lỗi/14cảnh báo. SHA38602811…/944file; backend183file và
568business+12directory migrations giữ nguyên930, không chạy lại native/full.
Nhận mục19.18 cho insights/consumer tài chính còn lại và upgrade566→567→568,
rồi Q02/Q03/Q04 cùng tám đợt. Chưa browser/Android/render file/deploy;
70ca/122entries/gates giữ nguyên, chưa nghiệm thu toàn sản phẩm.

**Checkpoint lịch sử930:** [quyền đọc tài chính và nguồn xuất tại server](roomqc-financial-scope-export-local-2026-10-27.md)
đạt75/75 Auth/REST gồm5race khóa thật; đã chặn hai bypass tenant/hotel của
get_financial_report cũ. Hồi quy cùng SHA64aef734…: writer536/536,
nguồn phòng77/77, full control440/440 exit0 không fail/skip/cancel.
568business+12directory/runtime183file. API xuất đã có proof; frontend còn
nối nguồn mới, cache và số liệu. Nhận mục19.17 rồi Q02/Q03/Q04 và tám đợt.
Chưa populated upgrade567/568, browser/Android/default-full/rebuild/deploy;
70ca/122entries/gates giữ nguyên.

> **Checkpoint lịch sử929:** [báo cáo no-show và quyền đọc tài chính](roomqc-revenue-no-show-local-2026-10-27.md)
> đạt34/34Auth/REST gồm2race khóa thật; đủ10.021lượt trả phòng; writer536/536,
> nguồn phòng77/77, frontend157/157, TypeScript và full control440/440exit0,
> không fail/skip/cancel. SHAc57281e3…,567business+12directory/runtime183file.
> Nhận mục19.16 cho consumer tài chính/export/hoàn tiền, writerQ02 rồi Q03/Q04
> và tám đợt VPS/signup. Chưa upgrade567có dữ liệu/default-full/rebuild/E2E/
> deploy; advisors726và70ca/122entries/gates/signoff giữ nguyên.

> **Checkpoint lịch sử913:** [upgrade có dữ liệu 564→566](roomqc-booking-finance-upgrade-local-2026-10-27.md)
> đạt 48/48 native, hai migration fault rollback và một race khóa thật; giữ tiền/
> phiếu thu/lịch sử/trial, API cũ tương thích sau ghi mới. Hồi quy cùng candidate
> đạt writer 536/536, nguồn phòng 77/77, full control 440/440, exit 0, không fail/
> skip/cancel. SHA `7f7aae56…`, 566 business + 12 directory,
> runtime 182 file. Nhận mục 19.15 doanh thu/đối soát/hoàn tiền và writer Q02,
> rồi Q03/Q04 và tám đợt. Chưa binary rollback/VPS/E2E; 70 ca/122 entries/gates giữ nguyên.

> **Checkpoint 912B:** [no-show, tiền cọc và caller](roomqc-no-show-finance-local-2026-10-27.md)
> đạt 536/536 native, 37 race khóa thật; frontend liên quan 122/122, room-source
> 77/77 và TypeScript đạt; lint 0 lỗi/28 cảnh báo/16 file. Full control 440/440,
> exit 0, không fail/skip/cancel. SHA `bfaf2b8e…`, 566 business + 12 directory,
> runtime 181 file. Giữ cọc không thu hai lần; refund_due là khoản cần hoàn.
> Nhận mục 19.14 upgrade 564→566 có dữ liệu/legacy/báo cáo, rồi Q02/Q03/Q04 và
> tám đợt VPS/signup. Advisors 728 chưa disposition; chưa E2E/default-full/
> rebuild/deploy 912B. 70 ca/122 entries/gates/signoff chưa đổi.

> **Checkpoint lịch sử 903B:** [backend RW5 đầu tiên](roomqc-booking-flags-core-local-2026-10-27.md)
> sửa quyền/nguồn phòng/checkout có phạm vi; 497/500 native, giữ 441 hồi quy,
> baseline 29/32 và 27 command/guard mới đạt. Còn 3 assertions no-show cọc/retry.
> Full control 440/440, room-source 77/77 và TS app đạt cùng SHA `afd1413c…`;
> 565 business + 12 directory/runtime 181 file. Nhận 19.13 ledger/caller/upgrade,
> rồi writer Q02/Q03/Q04 và các đợt VPS/signup. Advisors 727 còn cần disposition;
> chưa frontend/E2E/default-full/rebuild/deploy 903B. 70 ca/122 entries/gates giữ nguyên.

> **Source901:** [upgrade563→564 có dữ liệu](roomqc-booking-notifications-upgrade-local-2026-10-27.md)
>27/27,441native/29races và440control cùng901 đạt; runtime180file. Rollback,
>receipt/source cũ,8legacy jobs không tự gửi và2target mới đã kiểm. Baseline
>RW5 đã có902; chưa upgradeproduction, E2E hoặc release.

> **Điểm nhận27/10 — source900:** [Push/Telegram và vận hành local](roomqc-booking-notifications-external-local-2026-10-27.md)
> có441/441native,29races,77/77room-source,440/440control và171/171frontend;
> TS đạt, lint0lỗi/59cảnh báo/33file.564business+12directory/runtime179file.
> Còn upgrade có dữ liệu/UID1000/mount thật/provider/device, Q02writer graph,
> Q03workflow/advisors và Q04full/rebuild trước các đợt VPS/signup. Xem
> [mục19.11 kế hoạch](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1911-điểm-bàn-giao-sau-pushtelegram900)
> và [runbook](roomqc-booking-notifications-operations-2026-10-27.md).
>70ca/122entries/gates/signoff không đổi; chưa deploy hoặc nghiệm thu sản phẩm.
> Các checkpoint có chữ hiện hành/ưu tiên bên dưới giữ theo lịch sử của source đó.

> **Tiến độ793:** đã thêm [backend lưu quyền atomic](roomqc-ec10-ec15-atomic-commands-local-2026-10-26.md), sourceaa399401…/548business+12directory. Actual Auth/REST43checks+3concurrency checks và metadata30+4 đạt, terminal0, pre/post source/schema và cleanup0. Nhận chuyển caller/readback/pending recovery; UI chưa dùng command và legacy save vẫn có thể lưu dở. Advisor667findings, indirect và full pipeline793 còn mở. 122entries/70worksheet/gates không đổi; các checkpoint bên dưới giữ lịch sử.

> **Tiến độ hiện hành791:** đã triển khai [scope/live authority guards](roomqc-ec10-ec15-authority-boundary-local-2026-10-26.md);8fail cũ nay bị chặn,55controls/54pass/1atomic fail,1readback mismatch còn mở.30metadata controls/4races đạt; advisor mới665findings cần disposition. Code integration chưa deploy; tiếp atomic grants/membership + read model/callers theo mục17 plan, rồi toàn roadmap. Source790 và chỉ dẫn bên dưới giữ lịch sử,122entries/70worksheet/gates không đổi.

> **Ưu tiên hiện hành:** [baseline actual API quyền nhân viên](roomqc-ec10-ec15-api-red-baseline-local-2026-10-26.md) hoàn tất native exit1:26controls/9fail,4readbacks/1mismatch. Đã tái hiện quyền/gán hotel chéo tenant, ghi sau khóa/inactive/thu hồi session, và lưu quyền dở. Nhận mục17 của plan hiện hành trước indirect closure và pipeline candidate cuối; chưa sửa trong packet tài liệu này. Source790 và122entries/70worksheet/gates giữ nguyên.

> **Checkpoint mới T06/T08 26/10:** source `d4cea563…`/790 file/546business+12directory có [control358/358 và installer](roomqc-t08-release-installer-local-2026-10-26.md), cùng [default full timed backend](roomqc-installer790-full-backend-local-2026-10-26.md) `ce2e6829dae8`, terminal0. Source/runtime159 trước-sau khớp,16suite/33mốc managed verified, cleanup độc lập0. Còn quyền gián tiếp/EC10–EC15, independent rebuild và toàn roadmap. Tiếp mục6/14 của [plan hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md); checkpoint784/346 và phần dưới giữ lịch sử.

> **Trạng thái nhận việc 26/10:** [plan hiện hành + nghiệm thu](roomqc-vps-signup-plan-current-2026-10-26.md), mục 6/14. Tiếp quyền gián tiếp/workflow/advisor disposition; giữ hồi quy installer/key-wide/signed v2/harness đã có proof790. Sau đó freeze/full control/default full backend/rebuild trước alert/admission/signup/console/Linux/DR/E2E/tải/pilot. 8 đợt/27 gói/25 task/70 ca giữ nguyên, 122 release entries chưa nghiệm thu; không tự mở gate.

> Checkpoint lịch sử781/1261ed46: [signed validate/admission/receipt](roomqc-t08-signed-runtime-local-2026-10-26.md).
> Catalog v2 bắt buộc chữ ký; validate/reserve/open/provision retry đã kiểm primary authority; full control330/330,exit0.
> Health worker/commit và backend harness còn cutover; chưa full backend/rebuild781. Proof cũ dưới đây thuộc baseline98b.
>
> Baseline tích hợp26/10: [release/catalog và năm dịch vụ](roomqc-t06-release-catalog-local-2026-10-26.md).
> Candidate 98b0713…/773 file, 546 business + 9 directory migrations.
> Full control **307/307**, không fail/cancel/skip, terminal exit 0.
> Diagnostic061d6cd02b87 **terminal exit 0**: actual release mutation/fence,
> next-cycle rejection, actual Functions deployment, installer/restart và đủ
> năm probes phục hồi. Independent cleanup21checks0. Lượt009b **exit 1** giữ lịch sử.
> Default full343bb7abed65 đã native terminal0,source/render khớp;cleanup độc lập3checks0.
> Independent full rebuild380159ba6e22 đã native terminal0,source/schema/runtime khớp;
> cleanup độc lập3checks0. Đây là local proof, chưa đóng toànT06/T08.
> 70 worksheet `not_run`, 122 release entries `unverified`, gate và signoff giữ nguyên.
>
> Rà soát source hiện hành: [quyền gián tiếp và approval authority](roomqc-t08-current-source-review-2026-10-26.md).
> 19targets/28candidate paths;19path-function bodies và8authority helpers khớp
> current DB.162HTTPdenials đã có mapping18thao tác/9trạng thái;25graph edges
> ngoài target scope đã được giải thích. Chưa full authority matrix/issuer hoặc E2E.
> [Thiết kế thực hiện T08](roomqc-t08-signed-approval-design-2026-10-26.md) chốt
> signature/authority/transaction boundary; đã nối validate/admission/provision retry/receipt,
> còn managed health/health commit/harness và kiểm đa process cho toàn sản phẩm.
>
> Checkpoint lịch sử policy/target26-10: [policy/target/restart](roomqc-t06-policy-target-local-2026-10-26.md) /
> [artifact](../../../artifacts/roomqc-t06-policy-target-local-2026-10-26.json).
> Source65a8128…/773files,546business+9directory migrations; full control301/301,
> 0fail/skip/cancel,terminal0. Diagnosticc9cc2797dc73 cùng source terminal0:
> actual metrics overlap, policy/target fence, replay đúng một lần, old next-cycle
> reject và readonly-config restart recovery; independent cleanup21checks0.
> Synthetic approval/actor; không physical exporter/release/catalog change.
> Nhận tiếp mục16 của plan: release/catalog, rồi combined full backend/rebuild.
> Chưa đóng toànT06/T08/70case hoặc mở gate. Các checkpoint dưới đây là lịch sử.

> Checkpoint26-10: [report](roomqc-t06-credential-cycle-local-2026-10-26.md) /
> [artifact](../../../artifacts/roomqc-t06-credential-cycle-local-2026-10-26.json).
> Source cuối9518716…/773file,546business+9directory migrations; full control298/298,
> 0fail/skip/cancel,exit0. Actual backend974dba47562a trên85c9ebe… terminal0:
> rotate→disable→chu kỳ disabled→same-user/new-session recovery, hai pool đóng,
> source/render khớp, cleanup độc lập0. Sau đó chỉ sửa isolated timeout test.
> Diagnostic không là full timed/rebuild proof951; timeout15eb cũ chưa rõ nguyên
> nhân, giữ stability follow-up. Config/restart và toàn roadmap còn mở; gates không đổi.

> Checkpoint773/23-10 — lịch sử: [report](roomqc-t06-metrics-credential-local-2026-10-23.md) /
> [artifact](../../../artifacts/roomqc-t06-metrics-credential-local-2026-10-23.json).
> Source0f1c605…/773file,546business+9directory migrations; full control297/297,
> 0fail/skip/cancel,exit0. Metrics thật overlap: rotation1→2 và disable2→3
> đều bị fence tại health commit, admission manual_closed. Diagnostic15eb29de822d
> terminal1 ở credential_disabled_next_cycle; recovery sau disable chưa chứng minh.
> Không full-backend/rebuild773; cleanup độc lập0. Đây là lỗi nghiệm thu còn mở,
> không là chứng nhận hoàn tất;122entries/70worksheet/gates/signoff không đổi.

> Checkpoint disable771/22-10: [report](roomqc-t08-probe-disable-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t08-probe-disable-local-2026-10-22.json).
> Source01ac08e…/771file,546business+9directory migrations; full control288/288,
> 0fail/skip,exit0; migration8→9 giữ dữ liệu/checksum, Auth thật late-response
> bị fence và installer-only disable không bị runtime bật lại; cleanup18checks0.
> Chưa combined full-vendor metrics/config drill hoặc independent rebuild771.
> Backend770 bên dưới giữ lịch sử, không thừa kế pass;122entries/gates không đổi.

> Checkpoint source-binding770/22-10: [report](roomqc-t06-source-binding-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-source-binding-local-2026-10-22.json).
> Full control283/283; default full backend d4feca68d43b terminal0,17mốc thật,
> source139/render-set khớp đầu/cuối và independent cleanup container/network/volume0.
> Đây là scoped Docker Desktop VM proof, chưa independent rebuild hoặc đóng toànT06/T08.
> Tiếp installer-only disable/live rotation/config drill rồi freeze candidate kết hợp.
> Chưa issuer/cross-replica/Linux/offsite/E2E/load/RC/pilot;122 entries/gates không đổi.

> Checkpoint T06 managed-runtime22/10: [report](roomqc-t06-managed-runtime-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-managed-runtime-local-2026-10-22.json).
> Source765/546 +8 directory migrations,10e89a2…; CLI đã nối managed probes,
> hai role/pool riêng, configv2 có tổng budget và bounded cleanup.
> Full control265/265,0 fail/skip; lint/syntax8 đạt, compose merge đạt; cleanup0.
> Real-directory proof dùng collector/metrics fixture, chưa thay timed five-vendor
> pipeline hoặc đóng T06/T08. Không deploy, không mở gate/đổi122 entries.


> Checkpoint T06 local22/10: [health proof](roomqc-t06-health-proof-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t06-health-proof-local-2026-10-22.json).
> Source762/546 +8 directory migrations,8dc491f…; bằng chứng health được kiểm
> ngay giao dịch ghi, admission chặn snapshot cũ sau rotation/expiry/recovery.
> Full control254/254,0 fail/skip,lint/syntax19 đạt; independent cleanup0.
> Đây là scoped local delta, chưa đóng toànT06/T08 hoặc timed full-vendor pipeline.
> Không deploy, không đổi mapping khách cũ hoặc gate/122 entries.

> Checkpoint T08 local22/10: [report](roomqc-t08-release-validation-local-2026-10-22.md) /
> [artifact](../../../artifacts/roomqc-t08-release-validation-local-2026-10-22.json).
> Source757/546,2495ee9… full control243/243,0 fail/skip,exit0; lint/syntax10 đạt.
> Đã tái hiện và sửa2 fail fixture thiếu exp của source6f3, giữ negative expiry
> và timeout assertions. Source trước/sau run không đổi, cleanup6 label families0.
> Đây là registry release validation có phạm vi; issuer/cross-replica trust,
> revision-atomic health/timed pipeline và indirect audit vẫn mở, không đóng toànT08.
> T04/sourcee5 và A/B/FE/sourcef7 giữ lịch sử, không thừa kế sang2495.
> Primary chỉ nhận docs/artifact; không deploy hoặc mở signup/gate/122 entries.

**Bàn giao theo xác nhận phạm vi22/10:** toàn bộ VPS +signup; plan +nghiệm thu.
Dispatch theo plan16.2/T01–T25; nghiệm thu theo70 case/phiếu diễn tập20.
Checkpoint local có cập nhật harness/tests và kiểm chứng riêng bên dưới; primary
chỉ nhận docs/artifacts, không source/deploy/gate hoặc thay runtime đang phục vụ.

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

**Mốc server 705/706 trước caller diagnostic — lịch sử, giữ hồi quy:**
[native Auth705](roomqc-m06-password-guard-diagnostic-local-2026-10-22.md) và
[fault/concurrency706](roomqc-m06-password-adversarial-local-2026-10-22.md).
706 files/539 migrations, cùng 33 controls/expected 33/33 + 7/7 checks + 4/4 races;
run 4ab8ebbe05c0 exit 0/cleaned 11, schema/source khớp và exact leftovers 0.
Full control 206/206 handle 87371 exit 0, không thay Auth/E2E. FE 90 là history.

Phiếu nhận tại mốc 706 trong [plan 15.7](roomqc-vps-signup-preparation-plan-2026-10-21.md#157-phiếu-ec05-hiện-hành--hoàn-tất-server-sau-policysdk-diagnostic):
forced page/AuthContext, captured-session/receipt readback/durable unknown-outcome,
config fault/invitation/recovery, image reproducibility rồi fresh full A/B.
Response-body abort đã kiểm sau headers; loss trước headers chưa kiểm.
705/706 extension hashes khớp nhưng imageID khác, chưa rõ nguyên nhân.
Giữ failed attempts bất biến; không nhận server boundary như chưa làm hoặc
đồng nhất diagnostic với toàn EC05. Tiếp permission/membership/invitation và đủ
tám đợt. Không serving/VPS/provider mutation;122 releaseAcceptance/gate chưa đổi.

**Mốc self-profile trước đó, giữ hồi quy:** [self-profile/avatar full A/B local](roomqc-m06-self-profile-fix-local-2026-10-21.md).
Candidate 694/538; A a04e60eefc89 / B 9ff0e50deda8 exit 0/cleaned 18/run,
source/schema/images/compiled builds/harness khớp. Mỗi run 66 self observations/
4 races, actual Storage/parallel; 18 failures cũ đã đạt/40 prior positives giữ.
Giữ 280 scope/1.764 actor/20 old races + 30 employee checks/4 races; final recovery
và schema freeze đạt. Control 199/199, FE 79/79, tsc/ESLint/diff-check exit 0.
Implementation ở integration, primary chỉ docs/artifacts. Nhận EC05 password
và forced-change acknowledgement (exception còn mở), rồi permissions/membership,
invitation/legacy Edge và đủ tám đợt VPS/signup. Chưa reviewer/browser/Android/
VPS/load/pilot; không đổi 122 releaseAcceptance hoặc gate. Failed history giữ nguyên.

**Mốc employee trước đó, giữ hồi quy:** [employee atomic fix đã qua full A/B local](roomqc-m06-employee-atomic-fix-local-2026-10-21.md).
Source 682/537, A 5b6633559ee1 / B dea1abeb5dfb exit 0/cleaned 18/run; source,
schema/image/compiled builds/harness khớp. Mỗi run 280 scope/1.764 actor/20 scoped
races + 30 employee checks/4 races và final recovery/schema freeze. Control mới
194/194, frontend 51/51, TypeScript/ESLint/diff-check exit 0. Không sửa source
implementation hoặc serving runtime trong lượt verification; chỉ test disposable.
Nhận [16 caller ban đầu](roomqc-m06-employee-caller-inventory-local-2026-10-21.md)
ở 15.2.4 rồi indirect/policy/FK và toàn roadmap; actual self-profile/full employee
matrix/durable remount retry/browser/Android/reviewer còn mở. Không đổi 122
releaseAcceptance/gate. Failed baselines và diagnostic vẫn giữ nguyên đúng scope.

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

**Điểm nhận việc mới nhất:** [phiếu triển khai 16 mục / 8 đợt / đủ T01–T25](roomqc-vps-signup-launch-checklist-2026-10-21.md).
**Lát vừa khép local:** [lifecycle service + recovery sản phẩm](roomqc-m06-lifecycle-local-2026-10-21.md).
Source **647 files/531 migrations**, SHA256 0f14369a…; control **154/154**,
Vitest riêng **27/27**. A **41f2b3011bc6** / B **9b6a13ced16e** exit 0/cleaned
16 objects/run, fingerprints/eszip khớp. Mỗi run 89 recorded checks/82 nhãn,
105 transitions/thông báo in-app và bốn bảng tài chính có hàng thật không đổi.
Fixture grace đã sửa; không nhận lại như lỗi chưa xử lý. Nhận tiếp
**provider queue/webhook → 17-target/policy/FK → issuer/trust/atomic health/pipeline**,
rồi signup/UI/Linux/offsite/E2E/tải/pilot. R4-a tổng/R4/T08 chưa khép; chưa mở gate.
Lượt tiếp tục này sửa harness và kiểm sandbox riêng, không sửa product/migration,
deploy runtime, gửi email thật hoặc mở signup/billing. Hai rebuild tuần tự không
thay hai backend đồng thời. Giữ nguyên 27 gói/25 bước/70 case nghiệm thu.

**Phiếu thiết kế trước snapshot lifecycle — 21/10:**
[mục 24: đầu việc, hợp đồng, phiếu nhận và tiêu chí bàn giao](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-2026-10-21),
[checklist triển khai chi tiết 24.7–24.12](roomqc-vps-signup-deployment-plan-2026-10-20.md#execution-checklist-2026-10-21),
[sổ 27 gói/25 bước/70 case](../../../artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json).
Lát nhận tiếp: service lifecycle/provider/17 targets → policy/FK → issuer/trust →
atomic health/pipeline. Email-admin đã có local proof, giữ hồi quy, không làm lại
như lỗi chưa sửa. Toàn bộ signup/UI/VPS/offsite/E2E/tải/pilot vẫn giữ scope.
Lượt cập nhật kế hoạch này chỉ sửa tài liệu/artifact và kiểm cấu trúc tài liệu;
không chạy lại suite sản phẩm, thay runtime/DNS/provider hay mở signup/billing.

**Mốc implementation trước lifecycle:** [email-admin — local proof có phạm vi](roomqc-m06-email-admin-local-2026-10-21.md).
Scoped backend **643 files/531 migrations**, SHA256
4334aef4f09c6f867346f8e4ca7c4a8a2408efdcf410f6536989b97538d7c493;
full control **152/152**, Vitest riêng **7/7**. A dbbf929824ec / B 36a0835d1dc3
exit 0/cleaned, identity khớp; 114 named checks/7 race mỗi run, advisors cả hai 640.
Đây là bằng chứng đã lưu, không suite vừa chạy lại khi lập plan. Không đóng
R4-a tổng/R4/T08 hoặc gate release; hai rebuild tuần tự không thay A/B đồng thời.
[Handoff 29](roomqc-vps-signup-execution-plan-2026-10-19.md#email-admin-handoff).

**Baseline trước email-admin:** [live actor tại chín lệnh ghi — local proof](roomqc-m06-mutation-local-2026-10-20.md).
Source 640 files/530 migrations, control 148/148; A 6eade27a974f / B f2025aa52f13
exit 0/cleaned, canonical hashes/images khớp, advisors cả hai 640. Mỗi run có
162 matrix denials/29-table snapshots/15 race và recovery positive/replay.
Scope này local_verified; R4-a tổng/R4/T08 còn mở. Tiếp service/provider/17-target
disposition → policy/FK → pipeline theo [phiếu hiện hành](roomqc-vps-signup-deployment-plan-2026-10-20.md#pre-implementation-current).
Không deploy hoặc nâng gate; 637/529 phía dưới là baseline lịch sử trước mutation proof.

**Kế hoạch triển khai hiện hành — 20/10:**
[Điểm nhận việc mục 21](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-current)
và [phiếu điều phối chi tiết mục 22](roomqc-vps-signup-deployment-plan-2026-10-20.md#launch-runbook):
sáu bàn giao đợt đầu, file/actions/test/đạt/rollback, đầu vào VPS/domain/email/offsite,
hành vi signup khi lỗi, trách nhiệm và gate L/S/P/U/B. Giữ 27 gói/25 bước/70 case.
Dự toán 30–47 ngày công, dự phòng 36–57, cộng ≥7 ngày pilot; chưa là lịch cam kết.

**Baseline trước mutation proof — email-ready/profile RLS local:**
[Report/artifact](roomqc-m06-email-ready-local-2026-10-20.md), source **637 files/
529 migrations**, hash 4f33e1b0…; full control **144/144**, build+verify 378 assets.
A 95d9560fba65 / B 91373e6a5871 exit 0/cleaned, cùng canonical/migration/init-spec;
mỗi lượt 106 registration HTTP/8 actors +39 SQL, email 20 fresh/18 invalid/23 positive
queue checks/10-table rollback. Advisors cả hai **645=17+8+485+135**, không index fix.
Email eligibility và users UPDATE recursion đã local_verified, **R4/T08 vẫn mở**.
Tiếp caller/room-complete/checkout/admin → policy/FK → R3/R5/R6/R7.
Lượt lập plan chỉ tổng hợp proof có sẵn/nhận B hoàn tất/đối chiếu hash và cleanup,
không sửa code, khởi chạy suite mới, deploy hoặc nâng gate. Runtime 15:24 +07
0005/signup=false là lịch sử chưa kiểm lại; primary chỉ docs/artifacts, index giữ nguyên.

**Snapshot lịch sử — Auth xóa mềm, 633 files/527 migrations:**
[Report/artifact](roomqc-m06-auth-soft-delete-local-2026-10-20.md) giữ nguyên proof
A 0d7e8d8f07ca / B 850b5d52cc1d, control 142/142 và guard regression. Trigger email/
profile RLS đã được xử lý sau snapshot; caller/policy/FK/issuer/health/pipeline
và các chặng còn lại chưa hoàn tất.

**Cập nhật kế hoạch chuẩn bị triển khai ngày 20/10:**
[Run sheet chi tiết mục 12–20](roomqc-vps-signup-deployment-plan-2026-10-20.md#implementation-ready)
đã đối chiếu source/router/OpenAPI và bằng chứng hiện hành; có phiếu nhận việc,
mapping đủ T01–T25/70 case, UX, budget/threshold đề xuất, external inputs và
checklist guard R4-AUTH-SOFT-DELETE (đã đạt local sau đó); phần nhận việc tiếp
theo nằm ở mục 21 liên kết phía trên. Lượt lập run sheet đó chỉ sửa tài liệu, không chạy
test triển khai mới hoặc nâng trạng thái gói/gate; runtime chưa được kiểm tra lại.

**Snapshot trước Auth xóa mềm — guard đăng ký local 20/10:**
[Report/artifact](roomqc-m06-registration-local-2026-10-20.md) ghi A 4317f0ce9c62 /
B 0fe112b0e675 exit 0/cleaned, 526 migrations; current scoped backend 632 files.
Mỗi lượt 94 registration HTTP/Auth checks, 39 SQL denials/3 roots/13 states và
hai concurrent lock races; control 142/142 (focused 7/7 là subset), local build+
verify 378 assets đạt. Fixture pending đã sửa bằng profile có binding hợp lệ,
không nới trigger. 649 advisors là 17+8+489+135; unused-index giảm theo workload,
không phải index fix. R4/T08 vẫn mở: **R4-AUTH-SOFT-DELETE / High** tái hiện trên
sandbox rollback — room setup/quote chưa deny Auth deleted_at. Phải sửa tiếp,
không nâng gate. Xem [handoff](roomqc-vps-signup-execution-plan-2026-10-19.md#registration-handoff).
Các con số/source/đầu việc 139/525 phía dưới là snapshot trước guard đăng ký,
không phải bằng chứng current tree. Runtime read-only 14:56 +07 schema 0005,
signup=false, chưa nâng image/áp migration nghiệp vụ hoặc sync implementation.

Cập nhật 20/10/2026. Mục tiêu giữ nguyên toàn bộ [27 gói](roomqc-vps-signup-work-packages-2026-10-19.md)
và [70 kịch bản nghiệm thu](roomqc-vps-signup-acceptance-rollout-2026-10-19.md).
Không coi đợt nền tảng local là hoàn tất plan hoặc sẵn sàng mở cho khách thật.

Kế hoạch thực thi đã cụ thể hóa tại [25 bước / 8 đợt](roomqc-vps-signup-execution-plan-2026-10-19.md).
Đọc [checklist nhận việc tám đợt](roomqc-vps-signup-execution-plan-2026-10-19.md#2411-checklist-nhận-việc-và-bàn-giao-từng-đợt):
có input/file/actions/test/đạt/rollback, bảng quyết định từng gate, state machine,
evidence/commands và đầu vào external. Không tạo scope mới hoặc nâng gate.
Dự toán hiện hành 30–47 ngày công, dự phòng khoảng 36–57, cộng ≥7 ngày pilot.

**Snapshot trước guard đăng ký — caller audit ngày 20/10:**
[Báo cáo/ledger 17 bảng](roomqc-m06-callers-local-2026-10-20.md) và artifact đã lọc
ghi fresh A 55a4b60c80b1 / B 0dbf25756725 đều exit 0, 525 migrations, canonical
hashes/images/init-spec khớp, cleaned=true/14 owned objects mỗi lượt; Docker
read-only theo run label không còn container/volume/network. Full control
**139/139**, 0 fail/skip/cancel; audit+graph focused **14/14 là subset**.
Scoped backend source 628 files, không dùng 626-file manifest cũ cho graph mới.

Catalog v2 đã ghi 149 triggers, graph có 1004 nodes/880 edges/25 candidate entry
paths. Đây là discovery, không chứng minh quyền: allSafe=false và transitive
reachability vẫn chưa khép. 25 dependency ngoài tập 17 target không là 25 object
bị mất; một candidate do comment đã có dismissal nguồn rõ. Advisors vẫn 650.

**Đầu việc kế tiếp đã cụ thể hóa:** guard đăng ký legacy/service/gateway chưa
đồng nhất về live session/ban/lock/delete/profile eligibility; là gap source,
chưa tái hiện khai thác. Phải sửa có test giữ pending_setup, invitations, directory
gate và idempotency; service worker không bị ép giữ phiên của khách.
Rà tiếp trigger tạo email, checkout/admin/session rồi policy/FK.
[Phiếu R4-a chi tiết](roomqc-vps-signup-execution-plan-2026-10-19.md#phiếu-r4-a--quyền-gián-tiếp-và-các-lệnh-nghiệp-vụ-chưa-được-phủ)
có actor contract, file, từng thao tác, ma trận test, before/after và điều kiện đóng.

Đây là chuẩn bị triển khai trên toàn bộ plan 27 gói/25 bước/70 case, không tăng
acceptance hoặc nâng gate từ số test. Sau R4 vẫn phải R3/R5/R6/R7/pipeline,
alert, admission/budget, signup/reconcile, UI, Linux/offsite, A/B E2E/load và
pilot ≥7 ngày. Runtime read-only 11:03 +07 readyz direct/proxy 200/schema 0005;
không suy source 0007 đã deploy hoặc readyz chứng minh lại signup flag.

**Bằng chứng direct-write trước caller audit, ngày 20/10 (lịch sử có phạm vi):** hai fresh backend A
dd45e76bae82 / B 0e3ec605323b đều exit 0, 525 migrations, cùng canonical schema/
migration-set/image/init-spec, cleanup 14 owned objects/lượt. Mỗi lượt 176 API
checks/8 real Auth actors/4 orders, 20 SQL session denials, Edge provider-disabled,
năm service/fault/recovery/permission và Janitor controlled drill đạt.
Full control **128/128**, 0 fail/skip/cancel; focused **27/27**; build+verify local
exit 0/378 assets. [Báo cáo R4 và artifact đã lọc](roomqc-m06-access-local-2026-10-20.md)
có source/log hashes, lỗi verify ban đầu và giới hạn per-run compose bundleHash.
Không cộng các bộ test hoặc hai lượt thành acceptance case.

**R4/T08 vẫn mở:** direct-write distribution/root+child/protected columns đã có
proof có phạm vi; còn 17 table callers/views/definers và quyền gián tiếp, 135
permissive-policy WARN semantics, legacy workflow/session, tám FK/workload.
Advisors còn 650 findings, allSafe=false/transitiveReachabilityProven=false;
490 unused-index INFO trên fresh DB không là lý do xóa index. Source mới vẫn
ở integration, chưa sync implementation/deploy. R3 issuer/R5 artifact, **R6
credential-revision check ngay transaction HealthStore.record**, gateway/runtime,
R7/pipeline và các phần signup/UI/VPS/offsite/E2E/load/pilot vẫn phải hoàn thiện.

Kế hoạch hiện hành có
[phiếu nhận việc cụ thể](roomqc-vps-signup-execution-plan-2026-10-19.md#2416-phiếu-nhỏ-sẵn-sàng-nhận-việc--bắt-đầu-từ-đúng-phần-chưa-khép):
R4-a reachability → R4-b semantics → R4-c FK → R3/R5 → R6-a atomic commit →
R6-b/R7 gateway/runtime/pipeline. Đây là checklist con, giữ nguyên 27/25/70.
Run sheet tám đợt bao gồm đủ API/UI/job/backup/load/rollback/đầu vào external,
không dừng toàn plan khi khép M06 local.

Read-only **10:34 +07 ngày 20/10**: direct/proxy /api/control/readyz 200,
runtime directory 0005, image control không đổi, signup false. Lượt chuẩn bị plan
chỉ đọc source/state/log/runtime và cập nhật docs/artifact; không chạy lại backend
tests, mutate DB nghiệp vụ/CRM, đồng bộ implementation, deploy, email hoặc DNS.
Thứ tự tiếp: R4 → R3/R5 → R6/R7/pipeline → alert → admission/signup/UI →
Linux/offsite/A-B E2E/load/pilot. Không coi source 0007 đã là runtime 0007.

Lượt cập nhật plan ban đầu quan sát runtime `0003`. Đợt tiếp theo đã triển khai
control local `0005`, kiểm tra 44/44 test, lệnh admin/allocation và health snapshot;
xem [báo cáo đợt admin/health](roomqc-control-admin-health-local-2026-10-19.md).
Kế hoạch P2 đã chia nhỏ thành [M01–M10](roomqc-p2-monitoring-delivery-plan-2026-10-19.md),
gắn file/test/phụ thuộc và gate; các mã M không thêm scope hoặc acceptance case.
Collector thường trực, probe/manifest backend và các gate release còn thiếu; không tính
hoàn tất P1-03/P2/P3 chỉ vì các phần nền này đã được kiểm chứng local.

Lượt chuẩn bị triển khai tiếp theo đã bổ sung [phiếu giao việc mục 18–23](roomqc-vps-signup-execution-plan-2026-10-19.md#18-điểm-bắt-đầu-đã-đối-chiếu-và-thứ-tự-giao-việc):
manifest/schema fingerprint và quyền probe; đủ năm service; pipeline/fault thực;
alert/outbox; signup/resume/lease; hai màn admin; VPS/offsite/E2E/tải/pilot.
Mỗi bước có dependency, file/đầu ra, negative control và acceptance liên quan;
đầu vào external gom tại mục 22. Không tạo thêm roadmap hoặc tăng 27/25/70.
Kiểm tra read-only lúc 18:24 +07:00 ngày 19/10 xác nhận readyz direct/proxy 200,
runtime `0005`, image control/frontend không đổi và signup false. Lượt này chỉ
cập nhật tài liệu; không nâng trạng thái implementation/acceptance của gói nào.

Cập nhật R3 ngày 19/10: đã có encrypted credential store/directory `0007`,
lease/CAS, key/revision/target fencing, quarantine sau mất phản hồi/crash và
explicit recovery cùng canary. Auth GoTrue thật đã kiểm refresh/revoke/recovery,
kể cả server đã trả 200 nhưng response xuống coordinator bị hủy. Xem
[báo cáo R3](roomqc-m06-session-local-2026-10-19.md),
[ADR lifecycle](../adr/roomqc-probe-credential-lifecycle.md) và
[artifact](../../../artifacts/roomqc-m06-session-local-2026-10-19.json).
Suite current tree **123/123, 0 fail/skip**, exit 0; không cộng với 111 của R2.
R3 local lifecycle được kiểm chứng, chưa đóng tổng thể: installer/TTL/rotation
production và R6 snapshot/runtime/full vendor integration còn thiếu. Source mới
`0007` không phải runtime đang chạy `0005`; signup false, không deploy code.

Cập nhật implementation R2 ngày 19/10, source base `5cb5837`: M06 vẫn ở
integration, chưa commit/sync implementation/deploy. **R1/R2 local_verified theo
controlled fixture; M06/T08 tổng thể in_progress_unverified.**

[Báo cáo local R2](roomqc-m06-partition-local-2026-10-19.md) và
[artifact current tree](../../../artifacts/roomqc-m06-partition-local-2026-10-19.json)
ghi **111/111 full-suite tests**, 0 fail/skip. Bao gồm 10 manifest DB tests và
protocol/worker/exporter/race; không cộng subsets hay dùng 101-test history.

Hai full upstream runs `1d2e7d793b84` và `7bbeec983dbf` mỗi lượt replay đủ
523 migrations, exit 0/permission_controls_verified; cùng initialized v2 hash,
migration-set/init-spec/images. Janitor vendor thật dọn child cũ/tạo child tương
lai, private round-trip và static hash không đổi; năm service stop/recovery,
negative permissions và revoked Auth/re-login cùng identity đều đạt. Mỗi lượt
cleanup 13 owned objects; kiểm labels không còn container/network/volume.
`scheduledSoakVerified=false`: chưa thay scheduler soak staging hoặc E2E hai
backend routing A/B. Synthetic fixture manifest không phải production artifact.

Root cause R2 đã rõ qua catalog: Realtime tạo partition bằng supabase_admin rồi
chuyển owner sang supabase_realtime_admin; default ACL phải tính theo creator và
transform grantor/grantee. Regression physical attnum/index keys khác sau DROP
COLUMN cũng đã thêm. [ADR v2](../adr/roomqc-realtime-partition-fingerprint-v2.md)
giữ các bất biến static schema/ACL/RLS/publication; không exclude cả realtime.
Log 66415db07a48/697008206be7 thất bại giữ làm lịch sử, không còn blocker chưa rõ.

Advisors 679 findings/0 ERROR còn mở R4: direct-grants audit 17 RLS-no-policy
tables xác nhận anon/authenticated không quyền bảng/cột (14 private/3 public).
[Triage](roomqc-m06-advisor-triage-2026-10-19.md) liệt kê 51 bảng permissive-policy,
tám FK và việc cần review; không xóa 501 unused-index từ fresh fixture. Server
callers/views/definers và performance còn phải xác minh, không coi toàn schema sạch.

Nhận việc R3–R7 theo
[phiếu chi tiết](roomqc-vps-signup-execution-plan-2026-10-19.md#1932-phiếu-nhận-việc-ngay-từ-hiện-trạng--không-cần-khóa-external):
giữ lifecycle R3 local làm regression → hoàn thiện triage → trusted artifact/installer →
gateway/health runtime → integration/drill/current-tree handoff. R1/R2 giữ regression,
không làm lại nền. Các mục T03/T09–T25 và external gates vẫn giữ nguyên 27/25/70.

Đợt này chỉ chạy exact-owned fixtures; không migrate/fault business Supabase/CRM,
đổi runtime image/schema/signup flag hoặc deploy worker. Snapshot đang phục vụ
directory 0005/signup false khác source 0007; không coi source đã là runtime mới.

[Manifest kết quả](../../../artifacts/roomqc-control-foundation-2026-10-19.json)
ghi source base/hash, image, schema, command và trạng thái riêng từng acceptance ID.

## Trạng thái từng gói

| Gói | Trạng thái | Bằng chứng / phần tiếp theo |
|---|---|---|
| P0-01 | Đã lập baseline local | [Inventory và ma trận route](roomqc-vps-signup-baseline.md); browser cutover vẫn thuộc P7 |
| P0-02 | Đã chốt thiết kế pilot | [ADR D01–D08](../adr/roomqc-control-v3.md); OpenAPI 3.1 có schema/enum/quyền và đánh dấu endpoint planned |
| P0-03 | Một phần | Sandbox DB directory có ownership/cleanup và race thật; fixture Auth/staff/email/hai backend còn phải mở rộng |
| P1-01 | Đã triển khai và kiểm chứng nền tảng local | Migration history/checksum/lock; 15 bảng nghiệp vụ directory; baseline cũ được bảo vệ; grant ba group role; chưa phải nghiệm thu release |
| P1-02 | API + DB local đã chạy | Volume/restart/proxy/health/shutdown đạt; worker được nối ở P4, chưa tính worker runtime đã triển khai |
| P1-03 | Một phần đã kiểm chứng local | Command/version/receipt/audit và HTTP authority boundary đạt; còn Auth thật/revoke/MFA và support/recheck identity |
| P2-01 | Một phần đã kiểm chứng local | Exporter/Prometheus, R1/R2 hai full vendor builds v2/năm faults/quyền/Janitor controlled drill đạt; scheduled soak và Linux staging proof chưa có |
| P2-02 | Một phần đã kiểm chứng local | Worker/config/entrypoint/target binding và timeout/race/stale đã test; chưa bật thường trực, thiếu M06/T08/full backend pipeline và metric VPS |
| P2-03 | Chưa triển khai | Deduplicate/ack/resolve/heartbeat ngoài máy |
| P3-01 | Một phần đã kiểm chứng local | Registry/resolver/pinned DNS và R1/R2 local đạt: hai builds 523 migrations/cùng hash v2/Janitor/quyền. Gateway/worker/trusted artifact/coordinated rotation/TLS và R4 còn thiếu |
| P3-02 | Một phần đã kiểm chứng local | Gate/reservation race/close/version/expiry/affinity đạt trên fixture directory; chưa E2E backend, signup vẫn đóng |
| P3-03 | Chưa triển khai | Pool/job/report budget và noisy-neighbor có số đo |
| P4-01 | Một phần | Affinity đã nối reserve/expiry và có test; private setup-status/resume/UI chưa nối |
| P4-02 | Chưa triển khai | Job table đã có; enqueue/claim/fencing/reconcile worker chưa nối |
| P4-03 | Chưa triển khai | Trusted proxy/anti-abuse/direct Auth/email callback |
| P5-01 | Chưa triển khai | Entry admin authority, client/query key/routes |
| P5-02 | Chưa triển khai | Màn hình hạ tầng và command dialog |
| P5-03 | Một phần API đọc | Workspace list/detail + timeline cursor đã test 1.005 metadata; chưa console/recheck/tenant-summary |
| P5-04 | Chưa triển khai | Keyboard/mobile/contrast/Back/scroll và thao tác admin |
| P6-01 | Chưa hoàn tất | Có local directory/control compose; chưa có bộ cài full Supabase VPS/TLS/manifest |
| P6-02 | Chưa triển khai | Backup ngoài máy và restore directory+cluster+objects+secret |
| P6-03 | Chưa hoàn tất | [Runbook local](roomqc-control-local-runbook.md); ứng cứu staging/production còn thiếu |
| P7-01 | Chưa triển khai | Hai backend thật, mỗi cụm Auth/DB/key riêng |
| P7-02 | Chưa triển khai | Browser E2E/signup/invite/mobile/cutover/fault |
| P7-03 | Chưa triển khai | Capacity profile trên cấu hình VPS có tên/digest |
| P7-04 | Chưa triển khai | Full release candidate và đối chiếu tất cả gate |
| P8-01 | Chưa triển khai | Pilot có người dùng được chọn và ít nhất 7 ngày quan sát |

## Bằng chứng kiểm chứng mới

Đợt M05 worker/target binding: suite cuối **87/87 test đạt, 0 fail, 0 skip**, có
log đầy đủ và manifest/hash riêng tại [báo cáo M05](roomqc-p2-health-worker-local-2026-10-19.md).
Hai worker trên DB fixture đã kiểm tra đổi target khi collect, mẫu cũ bị reject;
definition scope/mount/budget, audit rollback, role boundary và DB transaction
timeout thật. Process container offline đã test SIGTERM/restart và fail-closed.
M05 vẫn partial: entrypoint thiếu adapter M06 không được ready hoặc tạo mẫu khỏe;
còn full service pipeline và fault/10-phút drill. Source có migration `0006`,
runtime vẫn `0005`, image thường trực không đổi/signup đóng. [Runbook worker](roomqc-health-worker-runbook.md).

Đợt M04 exporter/config: suite control **66/66 test đạt, 0 skip**, gồm stack
Prometheus/node_exporter/postgres_exporter và PostgreSQL disposable thực. Nguồn đo
kiểm tra exporter up/collector success/permission/scrape error; mất quyền thống kê,
DB down và mật khẩu cũ đều không được tạo mẫu khỏe. File secret Unix được kiểm tra
quyền đọc của UID/GID container. [Báo cáo](roomqc-p2-exporter-local-2026-10-19.md)
và [runbook](roomqc-monitoring-operator-runbook.md) ghi giới hạn. Không cộng 66 với
59/44 đợt cũ; không quy đổi thành 66/70 acceptance. Chưa deploy monitoring thường
trực hoặc đổi image control. Năm probes fixture vẫn false, không gán fixture cho
local-a hoặc mở signup. M05/M06/T08/M07–M10 còn phải triển khai/nghiệm thu.

Plan đã bổ sung [phiếu chuẩn bị mục 17](roomqc-vps-signup-execution-plan-2026-10-19.md#17-phiếu-chuẩn-bị-triển-khai-tiếp-theo--chốt-ngày-19102026),
gồm đầu vào/đầu ra từng bước, ranh giới dữ liệu, điều kiện dừng, checklist signup/UI
và phần external giữ riêng. Các cổng staging/pilot/public chưa được mở bằng plan này.

Đợt P2 multi-mount/source: **59/59 test đạt, 0 skip**, gồm PostgreSQL disposable và
Prometheus `promtool` chạy biểu thức thực với 14 nguồn timestamp lần lượt bị cũ.
Đây là suite mới chứa test hồi quy cũ, không cộng 59 với 44 và không đổi thành
59/70 acceptance release. [Báo cáo và giới hạn](roomqc-p2-source-local-2026-10-19.md).
Code đợt này chưa deploy vào control image thường trực; source adapter chưa phải
health worker chạy nền, nguồn fixture không được gán cho cụm local-a.

### Đợt admin/health trước đó

Đợt admin/health mới: **44/44 test đạt, 0 skip** với directory sandbox độc lập;
runtime local `0005`, signup đóng. [Báo cáo](roomqc-control-admin-health-local-2026-10-19.md)
ghi phạm vi, giới hạn và việc còn lại; [artifact](../../../artifacts/roomqc-control-admin-health-2026-10-19.json)
giữ bằng chứng cho source/image mới. Không cộng 44 với 17 của bản nền.

### Bằng chứng lịch sử của đợt nền tảng

Lệnh `npm run test:control:db`: **17 test đạt, 0 fail, 0 skip**. Trong đó 6 test
Postgres container độc lập bao phủ:

- DB trống; hai migrator thực sự cùng chờ advisory lock; tổng apply một lần;
  rerun no-op, history không đổi và import không ghi đè hạn mức/policy.
- DB directory v2 có tenant/hotel/owner binding, audit và lịch sử expired;
  nâng cấp giữ dữ liệu; email từng xuất hiện ở hai cụm tạo conflict, không tự chọn.
- Schema lạ, sai type/default và backend có Auth bị từ chối trước history.
- Checksum khác bị chặn; migration thử lỗi rollback cả DDL và history.
- API login thật được reserve nhưng bị DB từ chối DDL, sửa history, xóa audit,
  đọc pg_authid; metrics không đọc workspace và worker/metrics không DDL.
  Login superuser không được readiness; bảng thiếu làm readiness lỗi.
- HTTP livez còn hoạt động khi schema chưa migrate; explicit migration/grant xong
  readyz thành 200. Healthz giữ payload compatibility `status=ok`.

Ba runtime test kiểm tra phân biệt live/ready, drain chờ request đã nhận, request
bị treo không vượt deadline shutdown. Các test config/gateway/support cũ chạy lại
trong cùng suite; không cộng lặp kết quả qua nhiều lượt để tăng số test.

`npm run control:local -- restart-check` trên stack thường trực đã đạt:

- Dừng DB điều phối: livez=200, readyz=503.
- Khởi động DB/API lại: sẵn sàng, hash history/registry/workspace/attempts không đổi.
- API dùng runtime role, database không public, signup vẫn đóng.
- HTTP qua proxy 8082 trả JSON/no-store; gateway tới Auth local qua internal URL
  được kiểm tra bằng health read-only, không tạo tài khoản/tenant/email.

OpenAPI đã kiểm tra parse, local references, operation IDs và admin security;
đây là kiểm tra tài liệu, không thay thế API integration của 14 operation planned.
Các kiểm tra trên không chứng minh Linux host metric, email thật, backup ngoài
máy, hiệu năng VPS, browser E2E hoặc hành vi pilot.

## Đối chiếu một số acceptance ID

| Case | Kết luận hiện tại |
|---|---|
| A01 | Có bằng chứng runtime/inventory local |
| A02 | Một phần: chỉ kiểm kê counts/port và phạm vi lệnh; chưa fingerprint đủ dữ liệu hệ thống khác |
| A03 | Chưa chạy browser/cutover đầy đủ |
| A04 | Đạt cho migration directory trống/v2 trong sandbox; production chưa chạy |
| A05 | Đạt local cho lock/rerun/checksum/rollback |
| A06 | Đạt các kiểm tra grants local nêu trên; role/secrets trên VPS phải kiểm tra lại |
| A07 | Đạt API/DB/shutdown local; worker chưa triển khai nên case tổng thể chưa đóng |
| A08–A11 | Command/version/replay/race/audit boundary có bằng chứng local ở `d0f9b7b`; còn Auth/revoke thật và browser reload, không đóng tổng thể |
| B01–G08 | Chưa đóng theo release mới; các assertion nền tảng không thay nghiệm thu riêng |

## Thứ tự làm tiếp

1. P2: exporter + collector/multi-mount + cảnh báo, đối chiếu metric với nguồn thật.
   M04 local và phần source/runtime M05 đã test; M06/T08 giữ R1/R2 v2 đã đạt
   làm regression; R3 local lifecycle đã có proof riêng, tiếp theo R4/R5 và R6/R7
   khép installer/session policy/advisors/artifact/runtime,
   rồi khép pipeline và fault/drill M05/M10,
   rồi M07/M08/M09 (alert/delivery/external heartbeat), theo run sheet P2.
2. P1-03/P3: Auth thật, manifest RPC/full validation và credential/TLS rotation.
3. P3: nghiệm thu gate đã nối DB qua backend thật; mới xét mở signup trong sandbox.
4. P4/P5: recovery worker/resume và UI admin; P6/P7 trước triển khai staging/pilot.

VPS/domain/DNS/TLS, email delivery thực và đích backup ngoài máy chưa được cung
cấp/kiểm chứng trong đợt này. Chúng chặn gate external tương ứng, không chặn các
gói code/local ở trên. Không yêu cầu người dùng gửi credential trong chat.
