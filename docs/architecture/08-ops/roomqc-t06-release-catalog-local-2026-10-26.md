# RoomQC — đồng bộ release/catalog và năm dịch vụ: 26/10

Phạm vi T01/T05/T06/T08 của [plan toàn bộ VPS + signup](roomqc-vps-signup-execution-ready-2026-10-22.md).
Đầu ra là sửa lỗi cùng bằng chứng local có giới hạn; không thêm task/case.
[Artifact JSON đã lọc](../../../artifacts/roomqc-t06-release-catalog-local-2026-10-26.json).
Phiếu [70 ca nghiệm thu](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md)
giữ kết quả riêng theo candidate và môi trường.

## 1. Kết luận và lỗi đã sửa

Run mới `061d6cd02b87` trên candidate98b kết thúc **exit 0**: actual release
mutation, late-sample fence, old-worker next-cycle rejection, actual Functions
deployment, installer rebind và readonly restart đạt; cả năm probes phục hồi.
Mandatory five-service/schema check sau drill cũng đạt; source đầu/cuối khớp,
worker shutdown 0 và hai pool đóng. Riêng061d là diagnostic có phạm vi.
Default full backend343bb7abed65 sau đó đã terminal0 ở mục6; hai hồ sơ giữ riêng,
chưa là nghiệm thu toàn VPS/signup.

Diagnostic `009b61abdcb5` trên source `e291cb5…` kết thúc **exit 1**.
Manifest, directory và metadata đã chuyển sang `sandbox-v1-managed-v2`,
nhưng Functions vẫn được triển khai với `ROOMQC_CONTROL_RELEASE_ID=sandbox-v1`.
Kiểm tra bắt buộc cuối cùng cho kết quả Auth/REST/Storage/Realtime đạt,
Functions `SERVICE_PROBE_INVALID_RESPONSE`.

Predicate recovery cũ chỉ yêu cầu worker hoàn thành collection, warming và
revision mới. `ready` không chứng minh cả năm service probe đều đạt; vì vậy
checkpoint bên trong đã báo đạt trước khi bước kiểm tra cuối bắt được lỗi.
Không dùng checkpoint đó để đổi terminal 1 thành đạt.

Bản sửa thực hiện deployment thật trên fixture đúng ownership:

1. Giữ nguyên file bundle ban đầu và SHA của nó. Tạo Compose override chỉ đổi
   release environment của Functions; so sánh toàn bộ rendered config trước/sau.
2. Recreate riêng Functions bằng cùng image; kiểm tra actual environment,
   ownership, internal network và không public port. Ghi digest của cấu hình
   ban đầu, override và rendered config; không ghi secret vào báo cáo.
3. Giữ override trong danh sách Compose dùng chung để các lần fault/recovery
   sau không khôi phục nhầm cấu hình cũ.
4. Cài binding/session mới qua installer, restart worker với readonly metadata
   mới. Recovery chỉ đạt nếu **đủ đúng năm probe cùng true**, warming và revision
   mới; bước kiểm năm dịch vụ bắt buộc sau drill vẫn được giữ.
5. Reference cho independent rebuild từ chối hồ sơ thiếu deployment proof hoặc
   thiếu all-five recovery. Không hạ deadline, sửa production canary hay bỏ probe.

Đây là synthetic release identity và synthetic platform actor. Không giả rằng
đổi manifest DATA là một lần triển khai frontend/binary production hoặc thay
schema. Không thay pin vendor, schema migration hoặc cấp thêm quyền runtime.

## 2. Candidate và kiểm chứng

| Thành phần | Candidate |
|---|---|
| Scoped source | 773 file; 546 business + 9 directory migrations |
| SHA256 source | `98b07138b7777afd3cb2daf7ff1d01d21e607d7abbb322e8aed0b21b7273958e` |
| Runtime/orchestrator | 142 file; `b57144a54c5fdd478099f47247a3bac9dfc6a8546f55c7617d0cf5c7c3d9d366` |
| Focused regression | 29 tests: 28 pass, 0 fail/cancel, 1 Docker opt-in skip |
| Lint/diff/syntax | Sáu file ESLint và diff-check đạt; syntax orchestrator đạt |
| Full control | 307/307; 0 fail/cancel/skip; 130128.6419ms; child close event exit 0/signal null |
| Actual backend diagnostic | Run `061d6cd02b87`; terminal exit 0/signal null; 584693ms; child close event |

Source manifest kế thừa [artifact policy/target](../../../artifacts/roomqc-t06-policy-target-local-2026-10-26.json)
và chuẩn hóa CRLF→LF. Đây không phải fingerprint toàn repository hoặc runtime
đang phục vụ khách. Mã chỉ sửa trong integration; primary nhận tài liệu đã lọc.

## 3. Nghiệm thu bắt buộc của packet

Các dòng dưới đã đạt trong scoped diagnostic061d; riêng cleanup độc lập ghi
ở artifact. Các tiêu chí không thay đầy đủ required environments của 70 ca.

| Kiểm tra | Kết quả được yêu cầu |
|---|---|
| Trước mutation | Actual manifest cũ được gateway chấp nhận; đủ năm dịch vụ |
| Overlap | Giữ response metrics HTTP 200 thật; advisory lock vẫn khả dụng |
| Mutation | Manifest DATA CAS + actual gateway validation + versioned admin command; receipt/audit đúng một lần |
| Late sample | `HEALTH_PROOF_CHANGED`; không ghi đè committed guard; replay không thêm effects |
| Worker cũ | Cycle kế tiếp `PROBE_TARGET_CHANGED`, không mở admission |
| Deployment | Functions actual release mới, image không đổi, config delta giới hạn, override còn dùng khi restart |
| Recovery | Installer-only new-session/rebind; readonly metadata mới; đủ năm service probes cùng đạt |
| Kết thúc | Mandatory business/schema checks, terminal exit 0 thật, source đầu/cuối khớp, worker shutdown 0/hai pool đóng |
| Dọn fixture | Kiểm độc lập containers/networks/volumes theo exact run label; không prune máy |

Timeline thực (epoch milliseconds): response metrics được giữ1793001701301,
mutation1793001702205, release1793001702215, reject1793001702311;
generation1→1→1 và đúng1command/audit. Cycle cũ1793001755813→1793001755910
bị `PROBE_TARGET_CHANGED`. Functions triển khai1793001768457,
credential revision1→2 tại1793001770873; sample mới có đủ năm probes tại
1793001793727. Admission giữ manual_closed. JSON lưu timestamp đầy đủ.

## 4. Lịch sử và giới hạn

Lượt `009b61abdcb5` giữ terminal 1 và đã kiểm độc lập ba nhóm resources đều 0.
Full control trên source `e291cb5…` đạt 304/304, exit 0; đây là source trước
bản sửa deployment, không thừa kế sang candidate mới.
Timeout `15eb29de822d` cũ vẫn chưa rõ root cause; giữ stability follow-up trong
default full backend và independent rebuild.

Diagnostic release không thực thi đầy đủ warmup 300s/recovery 600s, không thay
default full backend/rebuild trên cùng source. Chưa nghiệm thu issuer/cross-replica,
indirect/workflow/FK, Linux/TLS, backup offsite, email Internet, hai console,
browser/Android, tải/RC/pilot. Xem [thứ tự toàn bộ roadmap](roomqc-vps-signup-execution-ready-2026-10-22.md#164-sau-packet-này-nhận-việc-đến-hết-toàn-bộ-vps--signup).

Giữ 70 worksheet cases `not_run`, 122 release entries `unverified`, reviewer và
signoff null. Các gate L/S/P/U/B không được mở từ packet này.

## 5. Nhận việc tiếp

Diagnostic, full control, default full backend và independent full rebuild đã
đạt trên98b. Rebuild380 có native terminal0 và cleanup độc lập0, đúng reference
full343/source/config/images/schema. Tiếp khép issuer/cross-replica và
quyền gián tiếp theo dependency, rồi alerts → admission/budget → durable signup/
resume → hai console → Linux/DR/on-call → A/B/E2E/tải/RC → pilot.

Mỗi bước nghiệm thu cần positive, negative không có effects, fault/race phù hợp,
recovery, exit và cleanup. Target VPS/DNS/email/offsite/on-call còn thiếu được
tổng hợp theo gate cần chúng; code/local tiếp tục mà không đòi khóa trong chat.

## 6. Lượt kết hợp đang thực thi

Run `343bb7abed65` chạy lệnh default `--run`, không diagnostic, trên đúng
candidate98b. Đã áp đủ546 migrations và hoàn tất11bản ghi kiểm năm dịch vụ
(positive ban đầu + từng fault/recovery). Lời mời nhân viên, email provider local,
lifecycle và hotel-delete controls đã có kết quả đạt trong lượt này.

Trong managed health, warmup đã đủ309952ms, status healthy và đủ năm probes.
Đổi credential revision1→2 và vô hiệu hóa2→3 trong authentic metrics response
đều bị chặn tại health commit. Cycle kế tiếp ghi `PROBE_CREDENTIAL_DISABLED`;
installer tạo phiên mới revision4, worker phục hồi đủ năm probes tại1793003249414
và bắt đầu warming mới. Admission luôn manual_closed. Đây là kết quả trong
default full run, không suy rằng root cause timeout15eb lịch sử đã được sửa.

Policy1→2, target1→2 và release mutation đã đạt trong cùng run: late samples
không thêm effects; command/audit đúng một lần, replay không thêm lần hai;
worker cũ bị từ chối ở cycle mới, readonly restart phục hồi đủ năm probes.
Functions actual deployment giữ cùng image và override cho các lần restart sau;
credential sau rebind là revision5. Approval/actor vẫn synthetic.

Timed faultAuth đã có4mẫu lỗi, status unreachable; restart worker giữ nguyên
firstValidAt1793003552457 và latch BACKEND_UNREACHABLE. Sau phục hồi Auth,
năm probes đều đạt nhưng latch vẫn giữ để chờ đủ600s continuity, đúng policy.
REST/Storage/Realtime/Functions sau đó đều đạt timed fault/recovery: mỗi lỗi
có ít nhất3mẫu, đúng dịch vụ false, status unreachable và latch giữ sau probe
recovery. Kiểm độc lập actual Functions container sau fault: release vẫn
sandbox-v1-managed-v2, image không đổi và không public port; cấu hình không bị
revert về v1 khi recreate. JSON lưu timestamp từng dịch vụ.

Continuous recovery1793004195859→1793004800794 đủ604935ms; health healthy,
latch được gỡ, đủ năm probes và worker ready. Quan sát trước ngưỡng tại cycle
finish1793004772580 (576721ms tính từ recovery) vẫn unreachable và giữ latch.
Admission sau healthy vẫn manual_closed, cùng OPERATOR_REOPEN_REQUIRED và
BACKUP_UNVERIFIED. Không mở nhận khách chỉ vì số đo đã khỏe.

Metrics stale tại1793004935354: sample cuối1793004800794, worker ready=false,
health unknown, admission manual_closed có METRICS_STALE và HEALTH_PROOF_EXPIRED.
Nguồn đo trở lại tại1793004956596: đủ năm probes, ready=true, health degraded/
warming; firstValidAt mới1793004951051 thay cho1793003552457. Không dùng lại cửa
sổ khỏe trước khi mất continuity. Warmup cuối tại1793005284188 đã đạt: sample
1793005276018 trừ firstValidAt1793004951051 bằng324967ms, health healthy,
đủ năm probes và admission manual_closed. Managed timed pipeline đã verified,
worker shutdown exit0,hai pool đóng và rendered monitoring vẫn khớp. Sau đó
mandatory service/schema check, access catalog,current19 và parent-boundary
đã đi qua; hotel-scope/account/profile/password và13permission checks sau đó đều
đạt. Run343bb7abed65 đã kết thúc **native child close exit0/signal null**, từ
1793002194219 đến1793005672370, tổng3478151ms. Final phase
permission_controls_verified; source binding đầu/cuối và schema giữ nguyên,
cleaned=true.16nhóm controls trong JSON có verified=true. Kiểm độc lập tại
1793005693432 theo exact run label: containers0/networks0/volumes0, ba lệnh exit0.

Independent full rebuild380159ba6e22 bắt đầu1793005675325, kết thúc1793009262471:
native child-close exit0/signalnull/spawnCodenull, 3587146ms. Áp546migrations,
final phase permission_controls_verified; đủ16control families,11service checks,
source binding đầu/cuối, schema/specification và managed runtime khớp full343.

Timed drill đạt warmup329974ms, liên tục phục hồi624949ms, metrics stale→unknown/
notready, metrics resumed và warmup mới304975ms. Từng service fault/recovery,
credential/policy/target/release fencing, actual Functions deployment và readonly
restart đều có proof; worker shutdown0/rendered config không đổi. Admission luôn
manual_closed, không mở khách mới. Cleanup độc lập theo exact run label có
containers0/networks0/volumes0, ba lệnh exit0; timestamp nằm trong JSON.
Đây là lượt mới dùng full reference343, không retry thất bại009b và không dùng
diagnostic061d làm reference. Candidate98b đã kết thúc freeze đo rebuild; delta
runtime kế tiếp phải có source mới và không thừa kế pass này.
T08 issuer/cross-replica, Linux/DR và toàn bộ70case vẫn mở; gate/signoff không đổi.
