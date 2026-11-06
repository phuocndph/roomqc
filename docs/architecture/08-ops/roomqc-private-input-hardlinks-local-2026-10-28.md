# RoomQC — bản sửa hardlink của tệp private và cập nhật plan

Ngày 28/10/2026. Phạm vi toàn VPS + signup; đây là kết quả sửa lỗi và kiểm local theo phạm vi, **chưa nghiệm thu sản phẩm**. Plan và hồ sơ nghiệm thu vẫn mở.

## Kết quả và nguyên nhân

Fixture Linux trước sửa đã chấp nhận private input có hardlink: [bằng chứng finding](../../../artifacts/roomqc-installer-nonroot-topology-379ecd9dfdc2-local-2026-10-28.json). Một inode có nhiều tên đường dẫn nên không đủ điều kiện tệp private của bộ cài. Không in nội dung credential hoặc dùng dữ liệu khách để thử lỗi.

Đã sửa [private operator access](../../../server/control/setup-backfill-files.mjs) để yêu cầu nlink=1 với file; không áp quy tắc đó cho directory. [Sensitive bounded reader](../../../server/control/workers/health-config.mjs) kiểm link count lúc lstat, sau open/fstat và sau read trước trả bytes; POSIX access được kiểm lại sau đọc, buffer vẫn được xóa trong finally. File public không sensitive giữ hành vi đọc cũ.

[Ba ca hồi quy](../../../server/control/private-input-hardlinks.test.mjs) dùng hardlink thật: chặn cả hai tên inode; public read vẫn hoạt động; link xuất hiện trong read thật cũng bị chặn; unlink phục hồi và giữ inode. Ca race wrap hàm open/read gốc rồi tạo link thật, không fabricate syscall result.

Native trên source 497 phát hiện thêm một hồi quy về hợp đồng mã lỗi: kiểm shared access mới chặn hardlink sớm, làm publisher trả SETUP_PUBLICATION_FAILED thay vì SETUP_PUBLICATION_OUTPUT_INVALID. [Publisher](../../../server/control/setup-credential-publication.mjs) đã giữ kiểm hardlink riêng cho intent/stage/output trước shared access để giữ nguyên mã lỗi của từng loại. Các kiểm quyền và sanitization còn nguyên; không nới test để nhận mã lỗi chung.

## Bằng chứng cùng source

Backend 294 file/SHA256 a4ed41c998065f6c8ade71a4c010a5e9276d6113de3bbff7df2bf2e82fa6c960. Các số dưới đây là những bộ kiểm riêng, không cộng thành tỷ lệ ổn định sản phẩm.

| Kiểm | Actual | Giới hạn |
|---|---|---|
|[Control regression](../../../artifacts/roomqc-workspace-recheck-037d01f02abe-local-2026-10-28.json)|676 tổng/674 pass/0 fail/2 skip; terminal 0/source unchanged/cleanup 0|Có cả3 ca hardlink trên Windows. Skip: OS không cho tạo owned symlink và production notification mode kiểm ở Linux; không tự coi skip là pass|
|[Linux topology/private input](../../../artifacts/roomqc-installer-nonroot-topology-83bc7694a807-local-2026-10-28.json)|UID/GID10001, capabilities0, source read-only/hash-checked;3/3 ca đạt, hardlink denied=true; terminal 0/cleanup 0|Networknone, CLI help và component probes; businessCliFlowVerified/IF14Verified/realVolumeFaultsVerified=false|
|[Native setup-dispatch diagnostic](../../../artifacts/roomqc-setup-installer-filesystem-native-3902198db24e-local-2026-10-28.json)|382/382, gồm 120 installer;584 business+19directory migrations; terminal 0/source/schema/cleanup 0|Actual PostgreSQL/REST/Auth/API/CLI theo packet, vẫn có release/authority fixtures; fullIntegratedCandidate=false|
|IF12 trong native trên|4 mốc syscall CLI thật,4SIGKILL có /proc witness,16cleanup session/mutex; same-key giữ credential ID/iat/exp|UID0 và tmpfs; không chứng minh IF14/IF15, rotation hoặc worker mount/reload|

Chạy đúng lệnh được ghi trong command của control packet; Linux topology dùng node scripts/test-control-installer-nonroot-topology.mjs --run; native dùng diagnostic setup-dispatch của scripts/test-control-backend-sandbox.mjs. Chỉ Docker fixture disposable có ownership, không phục vụ khách và không nhận operational credentials.

## Lịch sử lỗi và gián đoạn được giữ

- Run c8ff55ade9ba: [terminal gốc chưa biết, đã cleanup](../../../artifacts/roomqc-setup-installer-filesystem-interrupted-c8ff55ade9ba-local-2026-10-28.json). Exit0 của cleaner không thay terminal test.
- Run6a97fbdf34bc: [query harness sai c.operation](../../../artifacts/roomqc-setup-installer-filesystem-query-diagnostic-6a97fbdf34bc-local-2026-10-28.json), terminal 1; sửa về request->>'operation', không sửa product schema.
- Run26b321e3ca37: [chủ động hủy để sửa hardlink](../../../artifacts/roomqc-setup-installer-filesystem-native-cancelled-26b321e3ca37-local-2026-10-28.json), terminal 1/cleanup 0; không tính là pass/fail sản phẩm.
- Run332ff3bdd62b: [native thất bại ở contract hardlink output](../../../artifacts/roomqc-setup-installer-filesystem-native-332ff3bdd62b-local-2026-10-28.json), terminal 1/cleanup 0,224 kiểm đã hoàn tất trước assertion; [chẩn đoán mã lỗi](../../../artifacts/roomqc-private-input-publication-contract-diagnostic-332ff3bdd62b-local-2026-10-28.json). Packet verified=false; không tính lượt dở là382 pass. Lượt source hiện hành ở bảng trên chạy lại sau sửa mã lỗi publisher.
- [Preload PID diagnostic](../../../artifacts/roomqc-installer-preload-pid-diagnostic-local-2026-10-28.json): limit16 không đủ PID; limit32 chứng kiến real intent sync/SIGSTOP/SIGKILL. Không quy lỗi cho ESM interception hoặc OOM khi không có bằng chứng.
- IF11/source 291 và IF12 focused/source 293 giữ packet lịch sử riêng; không lấy các count đó xác nhận source 294. [Plan-handoff r2](../../../artifacts/roomqc-vps-signup-plan-handoff-audit-r2-2026-10-28.json) chỉ là audit plan tại source cde8, không là proof sản phẩm hiện hành.

## Việc tiếp theo và nghiệm thu

Nhận bảng bước1–5 trong [blueprint](roomqc-vps-signup-deployment-blueprint-2026-10-28.md#2-điểm-xuất-phát-thực-tế-và-việc-nhận-ngay): nonroot actual CLI FS05/FS06, real-volume FS07/FS08, reviewer nhận IF01–IF17 rồi rotation/overlap/expiry/mount/Auth→directory. Từ đó tiếp tài nguyên/quota/fairness, signup/email, hai console, full-default/rebuild, Linux staging/TLS, offsite restore/on-call, A/B/browser/Android E2E, tải/RC và pilot≥7 ngày.

Mẫu khóa/quyền/quyết định chờ tại Q01–Q10 của blueprint; không gửi secret trong chat. Chưa có đủ bằng chứng sức chứa100.000 user đồng thời hoặc 1.000 khách sạn vận hành. Hardlink checks không là bảo đảm chống mọi lịch interleaving hoặc quyền đặc quyền của host.

Giữ nguyên ledger/worksheet theo checksum:25 task/27 gói/70 ca not_run/122 mục unverified/124 lượt (54 local, 69 staging, 1 pilot); reviewer/signoff vẫn null; gate L/S/P/U/B chưa thay đổi; signup/dispatch/worker không được bật bởi báo cáo này.
