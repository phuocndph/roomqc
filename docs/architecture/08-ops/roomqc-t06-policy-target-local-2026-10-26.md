# RoomQC — policy/target và restart: checkpoint26-10

Phạm vi: checklist con T01/T05/T06/T08; không thêm task/case hoặc đổi gate.
[JSON đã lọc](../../../artifacts/roomqc-t06-policy-target-local-2026-10-26.json).
Đây là scoped local proof, không phải nghiệm thu toàn VPS/signup.

## 1. Kết luận

Run `c9cc2797dc73` terminal **exit0**: đổi policy và target trong lúc response
metrics thật đang được giữ; mẫu cũ bị chặn tại ghi. Worker cũ tiếp tục bị chặn
ở cycle kế tiếp; worker thay thế nạp readonly config mới và nhận sample mới.
Replay command không tăng mutation/audit lần hai. Admission luôn manual_closed.

Full control trên cùng scoped source đạt **301/301**,0fail/skip/cancel,exit0.
Đã kiểm độc lập container/network/volume: backend3checks0 và sáu họ control18checks0.
Không dọn thêm hoặc chạm stack đang phục vụ trong lượt tài liệu này.

## 2. Source và thay đổi đã kiểm chứng

| Thành phần | Binding |
|---|---|
| Scoped source |773files;546business+9directory migrations; SHA256 `65a8128890e7b19c9c0cb298ea2554762ee665e1d61c00e74ebb2c15f67a72f2` |
| Runtime/orchestrator |142files; SHA256 `2c41bd6e5e245b813b46d3e50ff73a00a93db851947a114c06dea073006f4a6b` |
| Backend |managed-configuration diagnostic; source/render khớp đầu/cuối; shutdown0/hai pool đóng |
| Full control |301/301;127607.2846ms; Node child close event ghi exit0/signalnull |
| Terminal backend |Native process handle mở trước khi process kết thúc, ghi exit0; không suy từ progress hoặc launcher exitnull |

Manifest kế thừa trong artifact, chuẩn hóa CRLF→LF; không fingerprint toàn repo.
Vendor pins và migration/grant sản phẩm không thay trong packet này.

Sáu file delta:
`scripts/control-backend-managed-client.mjs`,
`scripts/control-backend-managed-health.mjs`,
`scripts/test-control-backend-sandbox.mjs`,
`scripts/control-backend-source-binding.mjs`,
`server/control/backend-source-binding.test.mjs`,
`server/control/managed-backend-harness.test.mjs`.

Installer cấp operator chỉ có control API capability và reader riêng; worker
không nhận operator/installer input. Policy/target đi qua AdminDirectory,
expected version, receipt và audit thật; không SQL bump revision trực tiếp.
Alternate target thay approved dbConnectionBudget100→99, giữ đúng host/mount/
actual queries. Đây **không phải** di chuyển exporter hoặc chứng minh catalog/
release đã thay. Fixture platform actor và approval vẫn synthetic.

## 3. Timeline actual

Timestamp trong JSON là epoch milliseconds; không backdate/fake clock.

| Mốc | Actual / đối chứng |
|---|---|
| first_sample |1792994260308;generation1,policy1,target1,credential1,budget100;ready/warming |
| policy_change_fenced |Held1792994279597→mutated1792994279695→released1792994279706→rejected1792994279805;policy1→2;HEALTH_PROOF_CHANGED;generation1 không đổi |
| policy_change_recovery |1792994350511;generation2,policy2,target1;sample mới ready/warming |
| target_change_fenced |Held1792994367389→mutated1792994367478→released1792994367487→rejected1792994367537;target1→2;TELEMETRY_TARGET_MISMATCH |
| target guard baseline |generation2 trước lệnh→3 do invalidation hợp lệ→3 sau late sample; phải so với committed baseline, không nhầm invalidation là stale write |
| old_target_next_cycle |Cycle1792994431658→1792994431704;sau lần reject trước;alive/readyfalse,0success/1fail,TELEMETRY_TARGET_MISMATCH |
| target_restart_recovery |Cycle1792994441707→1792994442669;readonly alternate config;generation4,target2,policy2,budget99;ready/warming |
| command/replay |Mỗi lệnh1mutation/audit;command-result/replay giữ kết quả;cuối2commands/2admin events |
| shutdown/cleanup |Worker0/hai pool đóng;render/source khớp;owned containers/networks/volumes0 |

Recovery trong diagnostic chỉ chứng minh sample bắt đầu warming đúng policy,
không chứng minh đủ warmup300s/recovery600s hoặc admission mở. Không giữ DB
transaction/advisory lock qua HTTP; kiểm lock727001 sẵn trong held response.

## 4. Lịch sử không được relabel

- Lượt `f7f0f2378fc2` trên sourcec3f344… bị gián đoạn ở email_admin_action_checks.
  Không thu được terminal exit, chưa chạy policy/target; không là backend pass.
  Đã cleanup đúng ownership,exit0 và independent leftovers0.
- Launcher PowerShell của diagnostic ghi exitCode:null. Observer native độc lập
  thu exit0 thật. Không đổi null thành0. Full control cũng được chạy lại với Node
  evidence runner, ghi terminal exit0 thật, không tính bản exitnull là pass.
- Sourcec3f344… từng control301/301/exit0; sau đó chỉ sửa JSON canonical comparison
  của replay result (Date/string). Current65a có control terminal riêng.
- Timeout15eb cũ chưa rõ root cause; giữ stability follow-up trong default full
  run và rebuild, không gọi diagnostic này là production scheduler fix.

## 5. Giới hạn và việc nhận tiếp

`managedHealth.verified=false`,`fullTimedDrillExecuted=false`,
`diagnosticOnly=true`,`fullIntegratedRun=false`.
Chỉ `policyTargetCheckpointVerified=true`. Không nghiệm thu issuer, live approval
withdrawal/cross-replica, physical exporter move, Linux/TLS, offsite restore,
Internet email, browser/Android, load/RC/pilot hoặc đủ70case.

Nhận tiếp **release/catalog authority mutation + readonly restart** theo
[plan mục16](roomqc-vps-signup-execution-ready-2026-10-22.md#16-phiếu-nhận-việc-hiện-hành2610--releasecatalog-và-nghiệm-thu-kết-hợp).
Chỉnh file catalog không thu hồi snapshot đã nạp. Phải có directory authority
thay thật, actual manifest transport và installer canary binding tương ứng.
Sau delta kết hợp mới freeze→full control DB-enabled→default full backend→
independent full rebuild cùng nguồn; không dùng diagnostic hoặc backend770 làm
reference mới. Giữ mọi mandatory business checks và deadline hiện hữu.

70 worksheet rows vẫn not_run;122release entries vẫn unverified; gateL/S/P/U/B
không được cấp; reviewer/signoffnull. Primary chỉ nhận docs/artifacts đã lọc.

