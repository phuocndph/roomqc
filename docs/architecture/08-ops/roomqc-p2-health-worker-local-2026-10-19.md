# RoomQC M05 — worker và target binding, kiểm chứng local

Ngày 19/10/2026. Nền `a34f3b6`; hash từng file ở
[manifest đợt này](../../../artifacts/roomqc-p2-health-worker-local-2026-10-19.json).
Mục tiêu vẫn toàn bộ 27 gói/25 bước/70 case. **Chưa hoàn tất M05/P2 hoặc plan tổng thể.**

## Kết quả đã kiểm chứng

Suite cuối chạy đủ mọi `server/control/*.test.mjs`, bật DB test: **87/87 đạt,
0 fail, 0 skip**, 128,588 giây. [Log đầy đủ](../../../artifacts/roomqc-p2-health-worker-local-2026-10-19.log)
được ghi trực tiếp bằng Node spec reporter, không phải excerpt hay log lượt lỗi.

Đồng bộ chọn lọc 28 file sang checkout chính, đối chiếu hash toàn bộ; index giữ
nguyên byte-for-byte. Tại checkout chính chạy lại 26/26 test contract/evaluator/
worker/config/runtime đạt. Kiểm tra 41 link local, đủ 25 bước và 27 gói trong plan.
`npm run test:control:db` cũng chạy cùng tập test qua runner hiện có. Không cộng số
test với 66/59/44 đợt trước, không quy đổi thành 87 acceptance case đã đạt.

Đã bổ sung:

- Directory migration `0006`: desired fingerprint/definition/version/boundAt;
  approve target nguyên tử với invalidation health, generation và close/reopen latch.
  Admin command có authority/version/idempotency/receipt/audit; audit hash trước–sau,
  không path/device/secret. Audit fail rollback mọi thay đổi.
- Kiểm scope/mount/budget theo definition thật, không chỉ tin hash trong sample.
  Mẫu v1/unbound/sai target hoặc trước boundAt không được ghi. API dùng inventory
  mới chưa khớp hiển thị unknown/chặn nhận mới, không giữ nhãn healthy gây hiểu nhầm.
- Hai HealthWorker thực trên PostgreSQL disposable: worker cũ đang collect lúc approve
  bị từ chối khi trả muộn; worker mới ghi đúng target và warmup lại. Active workspace
  không bị chuyển cụm hay sửa mapping.
- Role metrics bị từ chối sửa clusters/binding, gọi/tắt trigger hoặc gỡ latch;
  API không được ghi mẫu khỏe. Duyệt lại cùng target không giả được thời điểm/version.
- Giao dịch metrics có deadline tổng; test khóa DB thật xác nhận đóng socket hủy SQL,
  giải phóng khóa sau timeout không phát sinh commit muộn. Stale sweep vẫn chạy khi
  source treo; mất/recover LOGIN riêng của fixture làm worker fail-closed.
- Worker/config/entrypoint riêng, pool có acquire/statement/lock/transaction deadline,
  budget tổng theo số replica, giới hạn 4 target/process và vòng không overlap.
  File secret riêng và lỗi redacted; cấu hình metadata không chứa API/email/service key.
- Health loopback/heartbeat, shutdown và compose opt-in non-root/read-only/drop caps,
  không public port/Docker socket. Dockerfile đã đưa worker vào image.

Image kiểm thử riêng `sha256:966620a461b39e99f971e97302a0a1fc6ba3a9901eaecfc9241e654a3e3c2895`
đã so hash bảy file runtime/migration với source. Script `test-health-process.mjs`
chạy container **network none**, DSN fixture không sử dụng được: live200/ready503,
SIGTERM exit0, restart vẫn ready503. Cleanup kiểm ownership trước xóa container.
Đây là kiểm thử process thật, không phải positive control của năm service Supabase.

Suite cũng chạy lại exporter/Prometheus thật: CPU 8,241% so OS 7,655% trong dung sai;
RAM/volume/connection đối chiếu đạt; revoke quyền, DB outage và password rotation đạt.
Năm probes của exporter fixture vẫn false. Không nối fixture vào cụm local-a.

## Lỗi phát hiện trong lúc làm

Lượt mở rộng DB test đầu tiên làm fixture PostgreSQL chuyển recovery; tăng budget
tmpfs riêng của runner từ 256 lên 512 MiB rồi chạy lại toàn suite đạt. Không thay
memory/volume của DB nghiệp vụ. Một fixture stale ban đầu đặt validUntil trước
observedAt bị constraint chặn; sửa fixture thời gian, không nới constraint.
Review host binding còn phát hiện legacy fixture chưa gắn host; fixture được tạo
host rõ ràng, admin nay từ chối target khác host đã đăng ký. Không backfill host
cho dữ liệu thật bằng suy đoán.

## Giới hạn và trạng thái triển khai

Entrypoint **chưa có adapter M06**: thiếu probe trả `HEALTH_PROBES_UNCONFIGURED`,
không có fallback positive. Còn manifest RPC T08, năm probe Auth/REST/Storage/
Realtime/Functions theo release thật, pipeline đủ backend và restart/kill/DB down-up
cho worker, drill 10 phút M10. Test outage role không thay test dừng DB thật của worker.

Chưa có monitoring worker thường trực, chưa áp `0006` vào runtime. Control giữ image
`a65408e…`, frontend `cac1a629…`, directory `0005`; API/proxy ready200, signup=false,
DB directory không public. Không fault/ghi migration vào Supabase nghiệp vụ, không
gửi email thật hoặc thay CRM/hotel/scraper. Chưa có full fingerprint dữ liệu A02.

Đã kiểm tra sau suite: không còn container fixture directory/monitor/process, network
hoặc volume fixture monitor. Image thử giữ riêng để tái lập test, không thay tag/image
đang chạy. Checkout chính/index được bảo toàn khi đồng bộ chọn lọc file đợt này.

## Làm tiếp theo đúng plan

1. M06/T08: chốt full release sandbox và manifest server-only, đủ năm probe có nội
   dung/identity đúng; CLI/migration Supabase riêng, không dùng DB khách sạn hiện tại.
2. Khép M05/M10: Prometheus thật → worker → snapshot với probe thật; kill/restart,
   DB down/up, stale/recovery và observation đủ thời gian.
3. M07/M08: alert dedup/ack/resolve và notification outbox/cooldown/retry. M09 cần
   heartbeat/kênh ngoài host, ghi deferred external nếu chưa được cấp.
4. Tiếp P3–P8 như [tracker](roomqc-vps-signup-progress.md), không mở public/pilot
   từ kết quả local này. [Runbook worker](roomqc-health-worker-runbook.md) ghi cấu
   hình, thao tác duyệt, giới hạn và cổng bắt buộc trước bật service.
