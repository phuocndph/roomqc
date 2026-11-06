# T10 — inventory container và ngân sách đã nạp

Ngày 28/10/2026, Asia/Bangkok. **T10 vẫn partial**, phạm vi toàn VPS + signup. [Artifact](../../../artifacts/roomqc-resource-deployment-runtime-local-2026-10-28.json) giữ source/build/kiểm thử/cleanup; [runbook runtime](roomqc-resource-deployment-runtime-runbook.md) giữ cách dùng. Tiếp sau [preflight plan](roomqc-resource-deployment-plan-local-2026-10-28.md), không nghiệm thu thay toàn VPS hoặc capacity.

## 1. Thay đổi đã triển khai

- CLI đọc tất cả container theo project label, cả stopped/restarting/paused/orphan/one-off; kiểm đúng service/replica/ordinal. Không cắt danh sách khi vượt giới hạn.
- Đối chiếu reference/content ID của image, entrypoint/cmd/argv, user/working directory, môi trường image + Compose, mount/secret/readonly/network và các trường process được adapter hỗ trợ. Inspect/env chứa secret chỉ ở bộ nhớ, lỗi chỉ có mã cho phép.
- Chạy probe Node cố định qua docker exec, chỉ fetch liveness loopback; timeout/size bound, không redirect và chỉ xuất resource projection allowlist. So hash/environment/DB/consumer/pool/replica đã nạp trong bộ nhớ.
- List/inspect lần hai sau probe; process restart, container xuất hiện/mất/thay hoặc cấu hình thay trong lúc kiểm làm snapshot bị từ chối. Không tự chữa drift hoặc restart dịch vụ.
- Manifest local nhận thêm exact Docker content ID để kiểm image build riêng; staging/production vẫn bắt buộc registry digest và image RepoDigests khớp. Exit0 native không tự biến thành deploymentReady hay runtimeVerified toàn stack.

## 2. Bằng chứng đúng source

Backend **221 file**, SHA-256 **7b34ecd2307918289bb6c4d893ac3cb3e027e4cd0a97246fc0efb3bc73862404**. Các proof dưới cùng source và không đổi trong lúc chạy.

| Proof | Kết quả/phạm vi |
|---|---|
| [Directory](../../../artifacts/roomqc-control-resource-directory-8879a7ff3cbb-local-2026-10-28.json) | 511 tổng / **509 pass / 0 fail / 2 skip**, exit0; owned PostgreSQL riêng |
| [Linux](../../../artifacts/roomqc-resource-runtime-linux-4c72cfcafd3e-local-2026-10-28.json) | **48/48**, không skip; non-root/readonly/network none; Docker dependencies là doubles, closed probe có HTTP thật |
| [Container thật](../../../artifacts/roomqc-resource-runtime-live-b7b1c5562cfd-local-2026-10-28.json) | **21/21** positive/negative/recovery; hai API native từ source này ở hai Compose project riêng |

Hai Windows skip về tạo symlink và Unix secret mode được phủ ở Linux. Không cộng các tổng này thành số ca release. Directory suite không thay full native business sandbox hoặc independent rebuild.

Live fixture không có host port, dùng network none và DSN không dùng được; không gọi DB/provider. Có dừng rồi start, dư replica, one-off, orphan đã dừng, thay file budget hợp lệ nhưng process chưa nạp, restart nạp profile mới, sai command/image/env, metadata writable, sửa từng lỗi và restart thật trong lúc probe. Liveness chỉ chứng minh tiến trình/projection, không chứng minh DB readiness.

Image được build từ context chỉ chứa native sources đã copy và Dockerfile/package lock; toàn bộ 83 file trong context đã so hash với checkout. Artifact giữ content ID, Dockerfile hash, source list và build-log hash. Không coi source label là chứng thực build độc lập; image chỉ là fixture local, không phải release VPS.

## 3. Cleanup và nghiệm thu

Owned directory, Linux và live fixture đều **0 container / 0 volume / 0 network**; kiểm độc lập live cũng0 và cả hai project đều0. Image fixture và các thư mục source/config thử giữ lại có chủ ý theo hạn chế cleanup file đã ghi ở packet trước; không thử lại lệnh xóa đệ quy bị duyệt tự động chặn. Đó là giới hạn cleanup file, không phải tài nguyên Docker còn chạy.

Không thay ledger/worksheet: **70not_run, 122unverified**, reviewer/signoff/gate giữ nguyên và hash hai file được bảo vệ vẫn khớp. Không có deploy VPS, thay dữ liệu primary/business hoặc gửi provider thật trong packet.

## 4. Giới hạn thực tế

Live proof mới chỉ là API native. Generic checker nhận các adapter native đã có, nhưng worker có secret/TLS/DB và deployment topology riêng vẫn cần proof live tương ứng. Chưa inventory vendor/pooler/process ngoài manifest, chưa bind DB ID tới endpoint/database thực, chưa xác minh max/reserve business hoặc server pool của vendor. Không dùng budget fixture tắt các consumer để nói stack production đã đủ.

Chưa khóa cấu hình sau thời điểm kiểm, không security scan toàn host/image, không suy capacity từ connections. Full native fail75b23132abab/independent rebuild, Linux VPS/TLS/DNS, email inbox, offsite clean-host restore, host-loss/on-call, browser/Android E2E, hai backend đồng thời, tải/soak và pilot vẫn theo [plan](roomqc-vps-signup-handoff-2026-10-28.md). Các proof cũ giữ đúng source lịch sử của chúng.

## 5. Việc nhận tiếp

**T10.b — ràng buộc inventory/cap toàn release với DB thực.** Giữ generic checker/21 ca live API đã đạt, không giao lại như chưa triển khai.

1. Remaining native workers: inventory command/image/env/secret mount theo triển khai thật; fixture owned có role/schema/TLS phù hợp, không provider/outbox thật, kiểm drift/restart và cleanup. Không sửa guard để làm fixture dễ đạt.
2. Vendor Auth/REST/Realtime/Storage/functions/meta/Supavisor: chốt từng release/image/setting và đường direct/pooler. Phân biệt client slots với server sessions; default chưa chứng minh hoặc process chưa inventory phải giữ fail/unknown. Tính exporter/operator/migration/backup/restore/maintenance/custom consumers đồng thời.
3. Bind từng DB ID tới endpoint/database thực, chống hai ID cùng trỏ một DB để cộng thiếu; đối chiếu max/reserve và cap bằng quyền ít nhất. Chỉ kiểm owned local trước, VPS/khóa thiếu giữ danh sách làm sau.
4. Khi các binding đầy đủ mới chuẩn bị preflight toàn release và T10.c–f: host/headroom → upload/report/Realtime/job/fairness → usage/quota → tải T23. T11/T12 signup/resume/recovery tiếp theo dependency, không mở public/signup hoặc ký gate từ kiểm local.
