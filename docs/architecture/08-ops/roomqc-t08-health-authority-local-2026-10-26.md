# RoomQC — health authority: kiểm chứng local ngày 26/10/2026

Đây là delta T06/T08 trong [plan hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md), không phải nghiệm thu toàn bộ VPS/signup. Không đổi 8 đợt, 27 gói, T01–T25 hoặc 70 ca; không mở gate.

## Thay đổi sản phẩm

- Managed health chỉ nhận metadata v2 có signed approval gắn đúng release, endpoint, inventory, host và môi trường; worker nhận public trust cùng giới hạn thời hạn, không nhận khóa ký.
- Trước remote collection, probe runtime đối chiếu approval với primary directory. Kết quả mang public identity gồm approval ID, epoch và envelope digest trong health proof v2.
- Trong cùng transaction/lock với health write, HealthStore đối chiếu approval còn hiệu lực bằng DB clock và binding bền vững, trước khi cấp generation. Thu hồi hoặc hết hạn khiến kết quả cũ bị từ chối.
- Admission đối chiếu snapshot với approval hiện hành. Approval mới không kế thừa warmup/recovery window của snapshot cũ và không xóa critical latch/manual close/backup gate.

## Phạm vi kiểm thử đã quan sát

Unit/config: **25/25**, không fail/skip/cancel, exit 0; gồm signed v2, metadata cũ, tamper/expiry, sai endpoint/environment, private file/trust loader, budget và pool/shutdown.

Directory run `70ea4e8e4376`: **13/13**, không fail/skip/cancel, native exit 0. Docker disposable theo exact owner label; kiểm độc lập container/network/volume đều 0, ba lệnh kiểm exit 0.

Các kịch bản mới có real directory roles/transactions:

1. Withdrawal xếp trước health commit dưới lock: proof cũ không thay snapshot/policy/generation/collector event; next collection và manager restart bị chặn trước callback.
2. Approval mới khiến snapshot/proof cũ hết giá trị; proof mới bắt đầu warmup và giữ critical latch/manual/backup gate.
3. Approval hết hạn trong lúc health transaction chờ lock: DB clock sau lock từ chối, sequence không đổi.
4. Hai process Node worker riêng thực hiện HTTP thật tới fixture loopback. Cả hai response đang giữ được thả sau withdrawal: cả hai bị chặn ghi. Chu kỳ sau và process restart với cùng metadata cũ không gửi request mới. Process cấu hình mới được ký hợp lệ phục hồi, warmup lại và giữ manual gate. Fixture này truyền đầu vào qua IPC, không chứng minh việc thay file cấu hình trên đĩa hoặc mount readonly; phần đó cần backend harness thật.

Kịch bản HTTP ở mục 4 dùng collector synthetic trả đủ năm boolean, không phải năm dịch vụ Supabase vendor. Không thay full backend hoặc T21 A/B cùng chạy.

## Hồi quy và kết quả full control

Source trước sửa test WebSocket `63b08d7c…` có full control `f285c3aa5c9b`: **334/335**, fail 1, native exit 1. Ca fail là `WebSocket does not follow redirects and abort destroys a pending handshake`, expected 2 request nhưng actual 1. Bài thử dùng timeout 30ms trước khi biết server đã nhận handshake; dưới full-suite load timeout có thể đến sớm. Giữ run thất bại làm lịch sử.

Đã thay timer cố định bằng đồng bộ server nhận upgrade, sau đó abort và kiểm server nhận EOF; giữ kiểm không follow redirect. Focused WebSocket **2/2**, exit 0. Không thay code WebSocket sản phẩm để làm test xanh.

Candidate sau sửa: manifest **782 file**, 546 business + 10 directory migrations, source SHA256 `2bba78e3d4d68bec5d725e41abe009350a07aebd27124e40c4aa7ed64677ddea`; runtime binding 151 file SHA256 `f3fadce91f743903e23018d7427bbcf34f8c2439d0a34bfba56f9255f06dfd51`.

Full control trên source `2bba78e3…`, run `b0e724a9094b`: **335/335**, không fail/skip/cancel, native exit 0. Hash source/runtime trước và sau lượt chạy khớp; container/network/volume theo exact owner label đều 0, ba lệnh kiểm độc lập exit 0. Đây là checkpoint trước khi sửa tiếp backend harness, không gán kết quả cho source sau đó. Không suy source này là toàn repository hoặc runtime đang deploy.

## Triển khai và phần còn thiếu

Metadata v1/proof v1 không còn được chấp nhận cho health mới; khi cutover cần chuẩn bị signed metadata/public trust/expiry policy và durable installer approval đúng binding trước khi chạy worker mới. Snapshot cũ không được dùng để tự mở nhận khách; phải có fresh proof, đủ warmup và operator reopen theo policy. Điều này không tự đổi mapping của khách đã hoạt động.

Sau checkpoint 335/335 đã chuyển managed full-backend harness sang catalog/metadata v2: signer fixture chỉ ở orchestrator, phê duyệt ban đầu và thay release qua installer role riêng, public trust/expiry policy ở runtime, gateway dùng ControlStore để kiểm primary authority. Observer đọc chữ ký và binding, không dùng expected-hash callback làm quyền. Worker cũ được kỳ vọng bị từ chối trước network sau approval replacement.

Focused harness **17/17**, exit 0; actual container import/link run `9bc1ffd28a37` đạt, network none, readonly, không còn owned container sau kiểm độc lập. Một test signer ban đầu truyền thừa field vào exact endpoint fingerprint đã fail; đã sửa test thành endpoint DTO đúng, không nới validator. Lượt source-binding đi cùng khi chưa bật DB test có một Compose renderer test skipped, không trình bày nó là full pass.

Candidate sau harness cutover: source manifest 782 file SHA256 `8dbaf5a0570feffe8f3af485a1fdf9cb619f9bef23f13ede68b1e170382ce5c7`, runtime binding 151 file SHA256 `62dce19e5111e93fa77093af8fb92e96dcace70e436cb8a3fd31bc0439d5409c`.

Full control run `ac640b658a32`: **336/336**, không fail/skip/cancel, native exit 0. Source/runtime quan sát trước spawn và sau terminal khớp; independent cleanup container/network/volume 0, ba exit 0. Signed runtime regression riêng `7c13a189c0c8` đạt 3/3 trên cùng source.

Actual full-vendor managed-release diagnostic **`99b42b346a8c`**, runner `evidence-release-signed-health-20261026-01`, đã có **native terminal exit 0**, signal/spawn error null. Source/runtime khớp trước/sau; independent cleanup container/network/volume đều **0**, ba lệnh kiểm exit 0. Xem [artifact hiện hành](../../../artifacts/roomqc-t08-health-authority-local-2026-10-26.json).

Timeline thật: first sample → held metrics response và signed approval replacement/actual gateway validation → health commit reject, generation giữ nguyên, command replay không thêm effect → worker cũ next-cycle bị chặn → Functions deployment đúng release → installer rebind → restart với metadata mới readonly → đủ năm probe Auth/REST/Storage/Realtime/Functions phục hồi. Snapshot phục hồi đang **warming/degraded**, manual admission vẫn đóng; không báo đã đủ window healthy.

Đây là diagnostic có issuer/actor fixture, không phải issuer production, default full backend hoặc independent rebuild. Nó không chạy đủ timed fault/recovery/stale/warmup/shutdown của default full mode; `managedHealth.verified=false`, `fullTimedDrillExecuted=false` giữ nguyên. Phê duyệt ký số của fixture đã đi qua installer/runtime thật nhưng không chứng minh key-wide withdrawal hoặc cross-replica production rollout. Full pipeline và independent rebuild còn phải chạy sau các delta T08 còn lại.

Key-wide withdrawal, installer CLI/readiness, issuer production, quyền gián tiếp/workflow/advisor disposition và toàn bộ alert/admission/signup/admin/Linux/DR/E2E/load/RC/pilot còn mở theo plan. Full local proof không thay VPS Linux/email Internet/offsite/on-call. Stability follow-up `15eb` chưa được kết luận bởi delta này.

Không thay DB đang phục vụ, CRM, VPS/DNS/provider hoặc gửi email Internet. 122 release entries vẫn unverified, 70 worksheet not_run; owner/reviewer/signoff chưa được gán. Goal toàn bộ plan vẫn đang thực hiện.
