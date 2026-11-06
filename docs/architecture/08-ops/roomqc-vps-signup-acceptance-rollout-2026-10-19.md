# RoomQC — nghiệm thu, triển khai và khôi phục VPS/signup

**Điểm nhận việc mới nhất — EC05 partial, không thay toàn bộ roadmap:**
[Policy/SDK diagnostic](roomqc-m06-password-policy-diagnostic-local-2026-10-21.md)
có 33 controls/18 đạt/15 fail trên candidate 700/538, terminal exit 1/cleaned 11.
Server completion/live-state/forced caller/fault/races nhận tiếp tại
[plan mục 15.7](roomqc-vps-signup-preparation-plan-2026-10-21.md#157-phiếu-ec05-hiện-hành--hoàn-tất-server-sau-policysdk-diagnostic).
Control 203/203 và client tests không thay full A/B/Auth/E2E. Giữ các handoff
bên dưới làm lịch sử; tám đợt/27 gói/25 bước/70 case, 122 releaseAcceptance và
gate L/S/P/U/B không đổi. Bản cập nhật kế hoạch này không deploy serving/VPS/provider.

**Nhận tiếp:** [employee fix full A/B local đã đạt](roomqc-m06-employee-atomic-fix-local-2026-10-21.md)
→ [caller inventory ban đầu](roomqc-m06-employee-caller-inventory-local-2026-10-21.md), phiếu 15.2.4.
Candidate 682/537: A/B exit 0/cleaned, 280/1.764/20 + employee 30/4, final recovery;
control 194/194. Reviewer/full matrix/E2E và đủ tám đợt vẫn mở; gate không đổi.

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

**Proof trước mutation slice:** [email-ready/profile RLS local](roomqc-m06-email-ready-local-2026-10-20.md):
637 files/529 migrations, control 144/144, fresh A/B 95d9560fba65/91373e6a5871
exit 0/cleaned; advisors cả hai 645. 20 fresh email events/18 invalid/23 positive
queues và HTTP profile scope đã có proof. **Không đóng A/D/T08 hoặc gate tổng thể
từ lát này; giữ 70 case.** Hai builds tuần tự không thay G01/G02 đồng thời,
browser E2E, Linux/provider/offsite hoặc pilot.
[Kế hoạch nhận việc mục 21–22](roomqc-vps-signup-deployment-plan-2026-10-20.md#launch-runbook).

**Snapshot lịch sử Auth xóa mềm 633/527 ngày 20/10:** [Auth xóa mềm local](roomqc-m06-auth-soft-delete-local-2026-10-20.md)
qua A 0d7e8d8f07ca / B 850b5d52cc1d, 527 migrations, 210 API/44 SQL actor
denials mỗi lượt; control 142/142, registration regression 94 HTTP/39 SQL,
build và cleanup đạt. High đã local_verified, **không đóng A09/D02/T08 tổng thể**
hoặc case release nào chỉ từ lát này. B advisors 646 còn review; A không chạy
advisors. Hai builds tuần tự vẫn không thay G01/G02, Linux/E2E/pilot và 70 case.

**Snapshot trước Auth xóa mềm:** [registration local report/artifact](roomqc-m06-registration-local-2026-10-20.md)
A 4317f0ce9c62 / B 0fe112b0e675: 526 migrations, 94 HTTP/Auth checks + 39 SQL
denials/lượt, two actual lock races, exit 0/cleaned; control 142/142, focused 7/7
là subset. Có proof cho một phần D02/A09 nhưng **không đóng case tổng thể**:
R4-AUTH-SOFT-DELETE High ở room setup/quote đã tái hiện và cần sửa. 70 case A–G,
gate L/S/P/U/B giữ nguyên; hai builds tuần tự không thay G01/G02 hoặc browser E2E.

Ngày 19/10/2026. Đây là tiêu chí kiểm tra **chưa chạy** cho phần sẽ triển khai.
Không tính các ô trong tài liệu là pass. Các bằng chứng local đã có ngày 15–19/10
được giữ trong báo cáo riêng, không thay cho acceptance của release mới.

Liên kết: [kế hoạch](roomqc-vps-signup-implementation-plan-2026-10-19.md) ·
[work packages](roomqc-vps-signup-work-packages-2026-10-19.md).

## 1. Môi trường và bằng chứng bắt buộc

| Môi trường | Mục đích | Điều kiện |
|---|---|---|
| Unit/contract | Policy, state, validation, idempotency input | Không cần credential ngoài, test có hành vi cần bảo vệ |
| Local integration riêng | Directory + Auth/DB/Storage/Realtime/Functions thật | Container/volume riêng, loopback, email inbox thử, allowlist fixture |
| Local hai backend | Routing/cách ly/cấp phát/failure | Hai bộ Auth/key/DB/storage thực sự tách biệt; không alias cùng backend |
| VPS staging | Linux host metric, proxy/TLS, email/provider, backup/restore | Domain và dữ liệu mẫu riêng, không người dùng thật |
| Pilot | Đo trải nghiệm và vận hành | Người dùng được chọn, quota thấp, cấu hình đã nghiệm thu, có người trực |

Mỗi kết quả lưu: case ID, commit/image/digest, schema versions, môi trường,
fixture/run IDs, thời gian bắt đầu/kết thúc, expected/actual, pass/fail/not-run và
artifact đã redaction. Với race phải chứng minh có chồng lấn/tranh khóa thực sự;
với mất response phải chứng minh server đã commit trước khi chặn phản hồi.

R3 local lifecycle mới có [báo cáo](roomqc-m06-session-local-2026-10-19.md) và
[ADR](../adr/roomqc-probe-credential-lifecycle.md): directory encrypted store/
grants/race/rotation/fencing/restart, Auth thật và mất phản hồi sau HTTP 200.
Không thay full backend/Snapshot runtime/production key recovery; A06/A07/B02/C01
chỉ được bổ sung evidence theo phạm vi, chưa đóng acceptance release tổng thể.
Ma trận vẫn giữ 70 case; không quy đổi số unit/integration tests thành 70 case.

R4 ngày 20/10 có [report/artifact local](roomqc-m06-access-local-2026-10-20.md):
525 migrations qua A dd45e76bae82 / B 0e3ec605323b; mỗi lượt 176 API checks và
20 SQL session denials; full control 128/128, focused 27/27, build+verify local
đạt. Direct-write distribution có proof, advisors/reachability/legacy workflow
vẫn mở. Hai fresh builds tuần tự không thay G01/G02 đồng thời; không đóng 70
case, A06/A09/B02/C01 hoặc gate release chỉ từ kết quả này.

Caller audit tiếp theo ngày 20/10:
[báo cáo và ledger](roomqc-m06-callers-local-2026-10-20.md) ghi A 55a4b60c80b1 /
B 0dbf25756725 exit 0/cleaned, 525 migrations; control 139/139, audit+graph
14/14 là subset. 149 triggers/25 candidate paths là discovery, không đóng
reachability. Guard đăng ký legacy/service/gateway, trigger email, checkout/
admin/session còn phải có proof; không nâng A09/D02/C01 hoặc bất kỳ case nào
từ graph/source review. Hai sequential builds không thay G01/G02; đủ 70 case
vẫn cần expected/actual đúng môi trường, không cộng số test qua các lượt.

## 2. Ma trận kiểm tra

### A — baseline, runtime, dữ liệu và quyền

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| A01 | Kiểm kê runtime/port/flag/volume | Chỉ ra runtime thật, không nhầm container test là service thường trực |
| A02 | DB local/CRM/source khác ngoài phạm vi | Fingerprint/số liệu cần bảo vệ không đổi; không trùng cổng 8090/8082 |
| A03 | Directory bật/tắt, legacy/global admin/mobile/deep link | Route đúng, không đưa admin sang workspace ngẫu nhiên hoặc ép khách cũ onboarding |
| A04 | Migrate DB trống và DB cũ có workspace/receipt | Lên cùng version, giữ binding/limit/audit cũ |
| A05 | Hai process migrate, rerun, checksum thay đổi | Một process apply; rerun no-op; mismatch dừng, không tự sửa history |
| A06 | API runtime thử DDL/DELETE audit/đọc secret ngoài quyền | Bị DB từ chối; migrate chỉ dùng credential riêng |
| A07 | Kill/restart API/worker/directory | Volume và trạng thái giữ nguyên; readyz false khi DB/schema lỗi, livez phản ánh process |
| A08 | Anon/owner/staff gọi từng admin endpoint | 401/403 phù hợp, không đổi registry/job/policy/entitlement |
| A09 | Admin bị khóa/logout/thu hồi role khi đang mở dialog | Server từ chối lệnh tiếp theo; không chỉ dựa vào JWT claim cũ |
| A10 | Replay 20 lần cùng command, kể cả sau reload | Một mutation/audit result; cùng key khác payload trả 409 |
| A11 | Hai admin cùng expected version; mất response sau commit | Một phiên bản thắng, bên kia đọc lại; retry không thực hiện lần hai |

### B — telemetry và cảnh báo

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| B01 | So metric với OS/DB trên Linux staging | Sai số trong dung sai công bố; đúng host/mount/cluster, không đo container limit thay host |
| B02 | Exporter thiếu quyền/DB down/TLS lỗi | Unknown/unreachable rõ ràng, không 0% hoặc healthy |
| B03 | Truy cập exporter/Prometheus/Grafana từ public; input PromQL | Bị chặn; API chỉ query template cố định, không secret/read-any-query |
| B04 | NaN, âm, vượt range, sai unit, future timestamp | Reject sample; snapshot cuối không được cập nhật giả |
| B05 | Hai worker ghi sample mới rồi cũ | Mẫu cũ bị từ chối theo generation/thời điểm, freshness không lùi |
| B06 | Metrics mất >120s; restart collector | Gate nhận mới đóng, khách active vẫn bootstrap; mở lại theo hysteresis/policy |
| B07 | Metric chạm/ngay dưới ngưỡng, dao động liên tục | Đúng khoảng thời gian duy trì, không đóng/mở liên tục do một spike |
| B08 | Cùng lỗi lặp, acknowledge, lỗi hết | Một alert mở, ack không tự resolve/gỡ gate; lỗi hết tạo resolution có audit |
| B09 | Cả host control/monitor mất kết nối | Probe ngoài host phát hiện và thông báo tới đích thử được cấp phép |

Chi tiết B02/C01 và A06 trên M06: healthy/fault/recovery đủ năm service không
thay negative-permission/session. Denied Realtime topic phải có phản hồi protocol
xác định cùng positive control; timeout không là pass. Lazy publication init
và Janitor partition maintenance phải được kiểm chứng theo release đã pin:
maintenance hợp lệ không làm drift giả; ACL/policy/structure/publication sai
vẫn bị reject. Hai initialized builds/hash khớp chỉ là bằng chứng fixture,
không tự đóng acceptance release hoặc thay artifact production tin cậy.

Implementation R2 ngày 19/10: hai full vendor builds `1d2e7d793b84`/
`7bbeec983dbf`, 523 migrations, exit 0, cùng initialized hash v2. Janitor thật,
năm fault/recovery, denial protocol và revoke/re-login đều đạt; full suite current
tree 111/111, 0 fail/skip. [Báo cáo](roomqc-m06-partition-local-2026-10-19.md)
giới hạn proof local/controlled drill; scheduled soak staging chưa có. R1/R2
không còn là lỗi đang mở, nhưng coordinated credential refresh/rotation,
advisors triage toàn bộ, trusted artifact/installer và gateway/runtime còn thiếu.
Vì vậy **không đóng A06/B02/C01 tổng thể hoặc nâng gate** từ proof một phần.
Trình tự sửa và nghiệm thu ở [R2–R7](roomqc-vps-signup-execution-plan-2026-10-19.md#1932-phiếu-nhận-việc-ngay-từ-hiện-trạng--không-cần-khóa-external).

### C — registry, admission và phân bổ

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| C01 | Thêm cluster thiếu credential/release/CSP/backup | Draft không nhận khách; liệt kê thiếu điều kiện |
| C02 | Đổi endpoint cluster có workspace; trùng cluster ID | Bị chặn hoặc idempotent đúng payload, không đổi mapping âm thầm |
| C03 | Admin sửa limit rồi migrate/restart control | Giữ giá trị DB đã duyệt, env cũ không ghi đè |
| C04 | Endpoint ngoài allowlist, metadata IP, redirect, DNS bất thường | Validation/probe không truy cập đích ngoài inventory được duyệt; không làm SSRF |
| C05 | 20 request khác nhau tranh một suất còn lại | Chỉ một reservation mới; không vượt limit; các request còn lại lỗi rõ |
| C06 | 20 retry cùng slug/email và client ID | Một workspace/affinity, expiry không được kéo dài, không trừ thêm suất |
| C07 | Active/draining/offline/manual_closed/stale/full | Chỉ cụm đủ điều kiện nhận mới; draining giữ route khách cũ |
| C08 | Admin đóng nhận khi reservation đang commit | Kết quả theo thứ tự transaction, có audit; không nhận lén sau mốc đóng đã commit |
| C09 | Đăng ký lại sau expiry, Auth cũ đã được tạo ở A, B còn chỗ | Giữ affinity A; nếu A không nhận thì chờ/hỗ trợ, không tạo danh tính mới ở B |
| C10 | Gate đổi giữa reserve và first provision; RPC đã chạy rồi metric xấu | Chưa bắt đầu thì chờ; đã bắt đầu thì đối soát receipt, không reassign/xóa tenant |

### D — signup, email, worker và phục hồi

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| D01 | Start → Auth → email → onboarding | Đúng một owner/workspace/tenant/hotel/trial ở cụm được gán |
| D02 | Email chưa xác thực, email khác, token sai cụm | Từ chối đúng quyền; không tạo một phần dữ liệu nghiệp vụ |
| D03 | Slug không hợp lệ/bận, body thừa ID/gói/quyền, số phòng sai | Server validate; browser không chọn tenant_id, role, subscription hoặc cluster |
| D04 | Refresh/hai tab/new device/callback hết hạn hoặc dùng lại | Tiếp tục đúng đăng ký; không tự tăng trial, giữ form hợp lý khi outcome chưa rõ |
| D05 | Intent hết hạn/UUID cũ/đổi chủ; provisioning quá hạn lâu | UUID cũ không activate; provisioning có owner không tự expire theo tuổi |
| D06 | Setup-status/lookup bị gọi bởi người khác hoặc không đăng nhập | Không lộ email, trạng thái riêng tư, job detail hoặc receipt |
| D07 | Mất response sau cluster commit, trước directory activate | Worker đọc receipt và hoàn tất cùng binding; không thêm tenant/hotel |
| D08 | Receipt missing / unavailable / conflict | Ba nhánh khác nhau: waiting_owner / retry / needs_review; không báo success giả |
| D09 | Hai worker, lease hết, worker cũ trả muộn | Fencing bảo vệ result; chỉ một activation hợp lệ, job không mất |
| D10 | Kill worker sau claim/trước call/sau call/trước ack | Có retry/đối soát, audit còn; thử lại không phát sinh tenant/trial/tiền mới |
| D11 | Retry/recheck khi workspace đã active hoặc routing version lệch | Replay đúng kết quả hoặc 409 cần đối soát; không đổi mapping |
| D12 | Forged X-Forwarded-For, nhiều khách sau proxy/NAT, gọi thẳng backend | Không giả IP để bỏ limiter; không áp nhầm một bucket toàn bộ người dùng |
| D13 | Spam intent/Auth/resend, challenge sai/hết hạn/dùng lại | Không giữ suất khi challenge fail; hạn mức bền vững qua restart/nhiều API instance |
| D14 | Tắt public signup, login/reset/invitation khách cũ | Đăng ký mới bị chặn đúng các đường; luồng khách cũ được giữ |
| D15 | Gmail/Outlook kiểm soát, link callback/reset/invite từ domain thật | Tới đúng hộp thư/cụm/workspace, bounce/retry quan sát được; không thay bằng Mailpit pass |

### E — giao diện và thao tác vận hành

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| E01 | Tìm workspace theo slug/request ID và mở cụm | Người thử xác định nguyên nhân/hành động trong 30 giây với bộ dữ liệu mẫu đã biết |
| E02 | Tìm/lọc/phân trang trên 1.000 workspace metadata | Tổng server đúng, URL/back giữ ngữ cảnh; không tải toàn bộ để lọc trong browser |
| E03 | CPU/RAM/disk thiếu hoặc stale; API 503 | Hiển thị thiếu/cũ, không 0 hay khỏe; mutation bị khóa phù hợp |
| E04 | Đóng/mở admission, đổi policy, stale version | Hiển thị ảnh hưởng/lý do và kết quả thật; lỗi không toast thành công |
| E05 | F5/mất response sau command admin commit | Giữ cùng command ID và lấy receipt; không thao tác hai lần |
| E06 | Sidebar dưới màn hình → trang mới → Back | Nội dung hiện từ đầu khi chuyển trang, Back trả đúng ngữ cảnh, không trang trắng do scroll |
| E07 | Mobile 390px, zoom, bàn phím/screen reader cơ bản | Đọc được trạng thái và thao tác chính, focus đúng, không chỉ phân biệt bằng màu |
| E08 | Chuyển workspace/authority, logout, hai tab | Không dùng cache/token/cụm cũ để hiển thị hoặc sửa khách khác |

### F — triển khai, backup và vận hành

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| F01 | Preflight host sai, port bận, volume đã có dữ liệu, secret thiếu | Dừng trước thay đổi; không format/xóa/init đè dữ liệu |
| F02 | Cài mới, deploy lại và restart VPS | Service/volume đúng, data bền vững, health và schema đúng release |
| F03 | Proxy TLS/CSP/WebSocket/upload/callback | Đủ chức năng Auth/REST/Storage/Realtime/Functions; browser không CSP-block cụm mới |
| F04 | Credential rotate, mất ref, hết cert | Không lộ secret/log; không đổi tenant mapping; lỗi và rollback cấu hình rõ |
| F05 | Backup directory+cluster+PGMQ+objects+manifest | Có checksum, khóa khôi phục, cửa sổ nhất quán, upload offsite verified |
| F06 | Restore vào máy/volume khác | Login được, mapping/receipt đúng, sample rooms/invites và file bytes khớp; không ghi vào source |
| F07 | Dump/object thiếu, checksum sai, sai key hoặc version | Restore fail rõ, không công bố thành công hoặc mở route tới DB chưa đúng |
| F08 | Mất host gốc, khôi phục từ offsite + secret store | Đo RPO/RTO thực tế; backup nằm cùng máy không được tính là pass |
| F09 | Alert drill theo runbook, gồm control/metrics mất | Người trực nhận, xác nhận và phục hồi đúng; lưu bằng chứng thời gian |

### G — đa cụm, tải và phát hành

| ID | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| G01 | A/B backend độc lập, tenant cùng UUID giả lập nếu cần | Route theo workspace+cluster, không dùng tenant ID đơn lẻ làm định danh toàn nền tảng |
| G02 | Token/data/storage/realtime A sang B | Bị từ chối, đồng thời positive control ở đúng cụm vẫn hoạt động |
| G03 | Cụm A draining rồi down, khách cũ A và khách mới | Khách mới sang B khi chưa có affinity; khách A giữ mapping, không fallback DB B |
| G04 | Load tăng 10→25→50→100 phiên có think time | Báo cáo đầy đủ, dừng khi quá ngưỡng; không tính request loop là số người dùng thật |
| G05 | Một tenant report/upload nặng + tenant đối chứng + signup | Đo noisy-neighbor và pool/gate; giới hạn hoạt động đúng, không mất dữ liệu |
| G06 | 1.000 workspace directory + dữ liệu nghiệp vụ theo profile | Server pagination/query plan được đo; UI không tăng payload tuyến tính theo toàn bộ dữ liệu |
| G07 | Cutover directory có khách legacy; rollback frontend | Login khách cũ không bị khóa bởi flag, chưa có mapping thì không ép đổi route |
| G08 | Pilot 7 ngày + backup/alert drill | Báo cáo lỗi/SLO/capacity/chi phí; quyết định mở rộng dựa trên dữ liệu |

Tổng ma trận: **70 tình huống nghiệm thu dự kiến** (A11+B9+C10+D15+E8+F9+G8).
Một tình huống có thể cần nhiều assertion; không đổi số assertion thành phần trăm
hoàn thiện. Case security/financial/data-loss không được thay bằng manual demo UI.

## 3. Tiêu chí tải và độ tin cậy đề xuất

Các ngưỡng dưới đây dùng để đặt mục tiêu staging; phải ghi cả kết quả không đạt.

- Bootstrap/tra cứu trạng thái: p95 ≤500ms ở phần server dưới profile pilot.
- Reserve intent: p95 ≤1s; provisioning từ submit hợp lệ đến active p95 ≤10s, không
  tính thời gian người dùng chờ email. Nếu chậm phải ghi latency theo từng bước.
- Đọc màn quản trị với 1.000 workspace: p95 server ≤1s, payload theo page limit.
- Trong soak 60 phút tại mức tải được chọn: 5xx không do fault injection <1%, không
  tăng memory liên tục, không connection leak hoặc queue backlog tăng vô hạn.
- Pilot 7 ngày: mục tiêu đề xuất ≥99,5% khả dụng API quan trọng, không sự cố mất/rò
  dữ liệu/cấp phát trùng; báo riêng lỗi provider/email và thao tác người dùng.
- Freshness: metric thường đến trong 60s; stale >120s đóng admission, UI thể hiện rõ.
- B09/F09: mục tiêu đề xuất phát hiện mất host ≤180s và nhận thông báo ≤300s,
  đều tính từ mốc fault UTC; ghi riêng thời gian người trực ack và phục hồi.
  Phải duyệt cấu hình trước drill; provider accepted không thay received. Đây
  chưa phải SLA hoặc kết quả đã đạt; không thay ngưỡng admission stale >120s.
- Không có pool exhaustion kéo dài, filesystem chạm ngưỡng critical hoặc worker hết
  lease liên tục ở profile được đề nghị cho pilot.

Tốc độ UI phụ thuộc mạng/thiết bị: ghi browser, viewport, RTT và asset size. Không
gộp p95 API server với thời gian tải trang hoặc lấy một lần chạy nhanh làm cam kết.
Capacity profile cuối ghi rõ maximum tested và operating limit thấp hơn có headroom.
Tenant limit được chọn từ dữ liệu này; số nhân sự đăng ký không bằng phiên đồng thời.

## 4. Các cổng cho phép mở tính năng

| Gate | Điều kiện | Được mở |
|---|---|---|
| L — local | P1 bền vững, fixtures riêng, contract/auth/migration đạt | Control local và signup chỉ trong môi trường phát triển |
| S — staging | P2–P6 đạt trên staging; A–F liên quan pass; khóa/domain đã cấu hình | Đăng ký các tài khoản thử kiểm soát qua domain |
| P — pilot | Staging E2E, backup offsite/restore, alert và capacity profile đạt; người trực | Một khách nội bộ rồi 5–10 khách có giới hạn |
| U — public signup | Anti-bot/Auth abuse/proxy/monitoring/support đạt; không còn P0/P1 liên quan | Đăng ký công khai với limit và kill switch |
| B — paid | Payable order/settlement/provider E2E, chính sách trial/expiry/hủy/quyền dữ liệu đã duyệt | Thu phí và cấp gói thật theo backlog billing riêng |

Đóng gate signup không tự đình chỉ khách đang hoạt động. Gate U không kéo theo gate B.
Không bỏ qua S/P vì local đã có nhiều test pass hoặc vì backup dump đọc được.

## 5. Quy trình đưa một cụm mới vào phục vụ

1. Ghi inventory host, môi trường, owner, mount dữ liệu và resource budget; preflight pass.
2. Deploy backend version được pin, secret riêng, TLS/private network; chạy migration
   đã kiểm tra trên staging, không reset DB có dữ liệu.
3. Kiểm tra Auth/Storage/Realtime/Functions, SMTP, callback/VAPID, schema/release manifest.
4. Đăng ký cluster draft vào directory, credential_ref hợp lệ; chưa nhận khách.
5. Nối exporter/probe, đối chiếu host metric, có snapshot healthy/fresh đủ cửa sổ.
6. Tạo và verify backup đầu; restore thử theo gate của môi trường.
7. Cập nhật CSP/cluster origin allowlist, Auth redirect và frontend build. Deploy
   frontend tương thích trước khi mở cluster; kiểm tra tab cũ có hướng dẫn refresh.
8. Canary signup ở cluster mới bằng fixture được allowlist, xác nhận một binding,
   file/realtime/invitation/callback đều đúng cụm; lưu và dọn fixture theo ID.
9. Admin mở admission với command/lý do/version, limit ban đầu từ profile đã đo.
10. Theo dõi log/alert/gate 24h đầu. Nếu có lỗi, đóng nhận mới, giữ mapping đã cấp;
    không chuyển khách mới đã tạo Auth/tenant về cụm cũ để che lỗi.

Không cần expose Prometheus/exporter/DB publicly để thực hiện quy trình này.
Endpoint registry mới không được dùng làm URL tùy ý để server probe mạng nội bộ.

## 6. Cutover từ bản local/legacy

1. Inventory khách hiện có, đường đăng nhập và các flag frontend/server/cluster;
   backup trước cutover. Chọn staging mới để thử directory trước.
2. Triển khai control/worker/DB directory và proxy; signup đóng, readiness pass.
3. Deploy frontend hỗ trợ cả legacy và workspace, với route admin rõ ràng. Phải test
   `directoryEnabled=true` hiện chuyển `/auth/login` sang `/start`, nên chưa được
   bật toàn cục trên host có khách legacy nếu chưa có đường legacy riêng đã kiểm chứng.
4. Pilot dùng host/domain staging hoặc cấu hình tách rõ. Khách legacy giữ host cũ;
   nếu bắt buộc cùng host, cần migration mapping được đối soát từ tenant/owner có thật,
   bảng chuyển hướng và phương án quay lại trước khi bật flag.
5. `directory_required=true` chỉ ở cụm đã sẵn sàng với toàn bộ luồng đăng ký/nhân viên.
   Không dùng việc tắt cờ này như rollback nhanh nếu mở lại bypass cấp phát.
6. Từng bước ghi release IDs, flags trước/sau, backup ID và kết quả smoke.

Import tenant legacy tự động hàng loạt ngoài phạm vi v1. Việc cần giữ đường đăng
nhập legacy trong cutover vẫn bắt buộc, không được bỏ vì import nằm ngoài phạm vi.

## 7. Rollback và xử lý lỗi

| Lỗi | Hành động trước | Khôi phục |
|---|---|---|
| Frontend mới lỗi | Đóng signup mới nếu cần, lưu request IDs | Trở image tương thích trước; giữ DB/mapping/receipt |
| Control API mới lỗi | Ngừng nhận mới/claim mới, để request trong hạn kết thúc | Trở binary tương thích schema; nếu không tương thích thì forward-fix, không drop schema |
| Migration lỗi | Dừng rollout, giữ lịch sử/error và backup | Sửa tiến sau kiểm tra; không đánh dấu applied giả hoặc reset DB |
| Metrics/collector lỗi | Admission unknown/blocked, cảnh báo | Sửa collector/credentials; khách active tiếp tục theo mapping hiện có |
| Provisioning outcome chưa rõ | Giữ workspace/owner/cluster, hiển thị đang kiểm tra | Đọc receipt và xử lý đúng missing/unavailable/conflict |
| Backend down/disk critical | Dừng nhận mới, bảo vệ volume, theo runbook | Phục hồi đúng backend/backup; chỉ đổi endpoint sau quy trình dữ liệu riêng |
| Directory mất | Dừng signup, giữ data clusters | Restore directory + đối soát receipt/routing version trước mở |
| Secret bị mất/lộ | Giới hạn đường bị ảnh hưởng, rotate theo runbook | Phối hợp version/ref; không thay HMAC email tùy tiện hoặc ghi key vào log |

Các thao tác xóa tài nguyên chỉ trên target đã xác minh và có backup phù hợp.
Cleanup sandbox có nhãn sở hữu không áp dụng cho volume production.

## 8. Trình tự pilot và báo cáo bàn giao

Ngày 0: một khách nội bộ, thử signup/owner/staff/rooms/booking theo checklist;
xác nhận backup và alert tới người trực. Ngày 1–2: sửa lỗi hoặc thêm từng khách
pilot nếu đạt. Tiếp tục quan sát tối thiểu 7 ngày; không tăng limit theo lịch nếu
chưa đủ bằng chứng. Theo dõi thêm thời gian từ đăng ký đến phòng và nhân viên đầu tiên.

Báo cáo bàn giao gồm:

1. Phiên bản code/image/schema/cấu hình policy đã triển khai và nơi đang chạy.
2. Ma trận 70 case với pass/fail/not-run, artifact và giới hạn môi trường.
3. Số khách/phiên/profile đã đo; capacity limit và ngưỡng đề xuất có căn cứ.
4. Backup/restore IDs, RPO/RTO thực đo, vị trí kho và cách lấy key bằng quyền vận hành.
5. Runbook/cảnh báo/người trực, lỗi còn lại và quyết định cần chủ sản phẩm.
6. Gate nào được mở; gate nào còn đóng và vì sao. Mở công khai/thu tiền là quyết định
   riêng dựa trên bằng chứng, không suy ra từ việc hoàn thành source code.
