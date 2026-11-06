# RoomQC — metrics/credential overlap, checkpoint773

Ngày lập báo cáo: 23/10/2026, Asia/Bangkok. Lượt chạy ghi nhận ngày22/10.
Đây là **scoped local evidence, còn lỗi nghiệm thu**, không phải full backend
đạt hoặc quyết định phát hành. [Artifact đã lọc](../../../artifacts/roomqc-t06-metrics-credential-local-2026-10-23.json).

## 1. Kết luận có thể sử dụng

Candidate773 đã có relay giữ **response metrics thật** sau khi probe hoàn tất,
để installer thay credential trước giao dịch ghi health. Full control đạt
297/297 trên chính source này. Diagnostic thật quan sát được cả rotation và
disable làm old proof bị chặn bằng HEALTH_PROOF_CHANGED tại health commit.
Giữ admission manual_closed; không ghi đè generation/observedAt/evaluator/
collector audit/policy của sample cũ trong hai thao tác đó.

**Diagnostic cuối cùng exit1, chưa đạt**: sau disable, quá cửa sổ chờ150s chưa
quan sát được PROBE_CREDENTIAL_DISABLED ở chu kỳ tiếp theo. Snapshot cuối:
worker ready=false, lastErrorCode=HEALTH_PROOF_CHANGED, health unknown,
generation2 và admission manual_closed. Cùng-user/new-session recovery sau
disable chưa chạy tới; không có bằng chứng shutdown hai pool của nhánh thành
công. Không đồng nhất lỗi này với việc mở nhận khách trái phép: phần quan sát
vẫn fail-closed, nhưng recovery và kết quả chu kỳ cần điều tra/kiểm lại.

## 2. Ràng buộc nguồn và phạm vi

- Scoped source:773 files,546 business migrations,9 directory migrations.
- SHA256: `0f1c605d808a92d45a8ed19ddd2b5decbcf19ab8c409a8cc94e2f0b4d3686588`.
- Runtime/orchestrator source-set142:
  `b57f7d0542b51003b3d22da1ae562e2bea797e268bd1bcd24e3ebce9965ba32d`.
- Không phải hash toàn repository hoặc chứng minh bản đang deploy.
- Nguồn tính lại sau full control và sau khi đọc terminal diagnostic không đổi.
  Diagnostic xác nhận source binding đầu/cuối. Vendor pins không thay.
- Implementation chỉ trong integration; primary chỉ nhận docs/artifact đã lọc.
  Không DB đang phục vụ, CRM, VPS, DNS/provider hoặc email Internet mutation.

## 3. Delta đã hiện thực trước lúc lập báo cáo

| Thành phần | Nội dung | Giới hạn phải giữ |
|---|---|---|
| Relay thử nghiệm | Chỉ loopback, upstream Prometheus cố định; epoch/generation fence; giữ tối đa một response200 thật rồi trả nguyên bytes/status | Không sửa metric, không arbitrary URL/public port; bounded body/time; release trong finally |
| Credential instrumentation | Một installer role giới hạn và reader riêng; rotate/disable bằng expectedRevision, audit và revision tăng một lần | Không đưa password/key/installer input vào worker; instrumentation tính trong headroom |
| Worker fixture | UID1000, readonly, hai role/pool riêng; từ chối installer/drill env | Deadline collector12s và target25s không nới; không SQL transaction qua HTTP |
| Diagnostic | Chế độ managed-credential riêng để quan sát overlap | Bỏ chờ warmup đầu300s nên không thay default full timed run, không dùng làm rebuild reference |
| Build reference | Đòi fullTimedDrillExecuted và credentialMutation verified/overlap/commit fence | Không nhận diagnostic hoặc full backend770 cũ làm proof773 |

## 4. Kết quả đã xác nhận, không gộp với70 ca sản phẩm

| Kiểm tra | Actual | Phạm vi |
|---|---|---|
| Focused DB-enabled |27/27,0 fail/skip| Bao gồm renderer/Compose thật |
| Full control |297/297,0 fail/skip/cancel,exit0;129210.0399ms| Session76550 đã terminal; không chạy lại trong phần lập plan23/10 |
| Syntax |8 file đạt| Delta được ghi trong artifact |
| Lint cuối |8 file,0 error/warning| Recommended JS + cho phép empty catch; lệnh strict đầu từng gặp2 empty catch có sẵn, không báo mọi invocation đều đạt |
| Full backend773 mặc định |not_run| Không thừa kế terminal0 của770 |
| Independent full rebuild773 |not_run| Không dùng diagnostic làm reference |
| Worksheet70 / release entries122 |not_run / unverified| Không người review/ký hoặc mở gate |

## 5. Lịch sử diagnostic và actual timeline

Lệnh: `node scripts/test-control-backend-sandbox.mjs --run --diagnostic managed-credential`.

| Run/source | Actual | Disposition |
|---|---|---|
| e27aba08a517 /8816557… |exit1 tại invitation, chưa tới metrics; thiếu caller-build baseline cho managed diagnostic| Đã sửa điều kiện capture baseline và thêm regression, không nới source equality; cleanup owned21, independent0/0/0 |
|15eb29de822d /0f1c605…|exit1 tại managed_health; phase cuối credential_disabled_next_cycle| Còn mở, không relabel thành pass hoặc khởi động lại vô hạn |

Timeline của15eb29de822d qua allowlisted projection:

1. first_sample: worker ready, health degraded/warming, generation1,
   admission manual_closed.
2. credential_rotate_fenced: revision1→2, authentic metrics overlap,
   HEALTH_PROOF_CHANGED; persisted sample/audit guard không đổi.
3. credential_rotate_recovery: worker ready, health warming, generation2,
   dùng revision mới; không nhận là đã hoàn thành warmup300s.
4. credential_disable_fenced: revision2→3, authentic metrics overlap,
   HEALTH_PROOF_CHANGED; persisted sample/audit guard không đổi.
5. credential_disabled_next_cycle: không đạt trong150s. Snapshot cuối vẫn
   HEALTH_PROOF_CHANGED/unknown/manual_closed; credentialMutation.verified
   chưa được ghi, managedHealth.verified=false.
6. Recovery sau disable, successful-path shutdown và combined config drill:
   chưa chứng minh, không tự đánh dấu.

Directory disable chỉ chặn quyền dùng credential của control runtime; không
là remote Auth logout. Old vendor JWT còn hợp lệ là ranh giới cần kiểm riêng.
Fixture approval là synthetic, không thay issuer/provenance production.

## 6. Cleanup và bảo vệ dữ liệu

- Harness15eb29de822d báo cleaned=true, cleanupFailed=false.
- Kiểm độc lập đúng label run: container/network/volume đều0.
- Sáu label families của full control × ba loại tài nguyên:18checks đều0.
- Không prune Docker toàn máy, không xóa dữ liệu khách; private diagnostic
  root được giữ để điều tra, không xuất ownership/bundle/log/secret vào report.
- Primary index, cả hai delivery ledgers và gate decisions không đổi.
 122 releaseAcceptance entries vẫn unverified; reviewer/signoff chưa có.
- Cleanup thành công không chứng minh graceful worker shutdown hai pool;
  yêu cầu đó vẫn phải có trong rerun thành công.

## 7. Công việc tiếp theo để khép packet

1. Tái hiện có giới hạn trên fixture mới; quan sát cycle start/finish,
   credential state/revision và đường readiness→stale sweep→assertTarget→
   manager→collector→record. Chỉ xuất codes/counters/versions, không secret.
2. Phân biệt lỗi scheduling/runtime với assertion quan sát sai. Không xóa
   điều kiện disable/recovery hoặc chỉ tăng timeout để ép xanh. Nếu code
   terminal hợp lệ khác contract dự kiến, phải chứng minh disabled durable,
   không remote I/O/health write trái phép, rồi review contract/assertion.
3. Cùng user, session thật mới, installer-only recovery bằng expectedRevision;
   revision tăng một lần, worker có sample mới/warmup mới, admission còn đóng,
   graceful shutdown đóng cả hai pool. Giữ lịch sử fail.
4. Thêm đổi policy/target/approved release/catalog trong lúc collection và
   restart. Catalog là snapshot lúc startup: sửa file đơn thuần không phải
   withdrawal live. Dùng command/revision thật; không sửa version/timestamps
   bằng SQL để giả bằng chứng.
5. Freeze candidate kết hợp → focused → full control DB-enabled → default
   full backend giữ toàn bộ workflow/time windows → rebuild độc lập cùng
   source/image/schema/config. Diagnostic không thay hai lượt full này.
6. Sau packet: indirect/workflow/issuer→alert→admission/budget→signup/status/
   resume/reconcile→hai admin→Linux/TLS/DR/on-call→A/B đồng thời/E2E/load/RC→pilot
   theo [plan](roomqc-vps-signup-execution-ready-2026-10-22.md).

Báo cáo này không đóng toànT06/T08/B02/B04–B07/C01–C04, không đổi70case hoặc
122entries, không tự mở gate L/S/P/U/B.
