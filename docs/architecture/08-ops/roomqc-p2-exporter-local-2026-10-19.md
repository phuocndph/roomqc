# RoomQC M04 — kiểm chứng nguồn exporter local

Ngày 19/10/2026. Nguồn nền dec5fdf; phần mới đối chiếu bằng SHA-256 từng file ở
[manifest](../../../artifacts/roomqc-p2-exporter-local-2026-10-19.json).
Không triển khai image mới hoặc monitoring thường trực. Signup hiện vẫn đóng.

## Kết quả

Lệnh `npm run test:control:db`: **66/66 test đạt, 0 fail, 0 skip**, thời gian
122,312 giây. Có PostgreSQL disposable, Prometheus/exporter chạy thật và promtool
kiểm tra biểu thức. [Log đoạn kết của suite](../../../artifacts/roomqc-p2-exporter-local-2026-10-19.log)
được ghi rõ là excerpt, không phải toàn bộ stdout. Không cộng 66 với 59/44/17 của
đợt trước hoặc suy ra đã đạt 66/70 acceptance release.

| Kiểm tra | Kết quả thực tế |
|---|---|
| CPU exporter / quan sát OS cùng cửa sổ | 3,836% / 3,983%; dung sai 5 điểm phần trăm |
| RAM total exporter / OS | Cùng 16.131.489.792 byte |
| RAM available exporter / OS | 12.802.359.296 / 12.812.283.904 byte; trong 5% total |
| Filesystem total exporter / statfs | Cùng 1.081.101.176.832 byte |
| Filesystem available exporter / statfs | Cùng 918.465.409.024 byte |
| DB connections, loại observer tạm | 1 / 1; dung sai 1 theo thời điểm scrape |
| Thu hồi pg_read_all_stats | Permission proof về 0; source reject sample |
| Dừng DB, sau đó khởi động | pg_up về 0, source reject; khôi phục có mẫu mới |
| Đổi password, terminate phiên cũ | Old credential bị từ chối; ghi secret mới/recreate exporter thì phục hồi |
| Quyền role monitor | Đọc thống kê; bị từ chối business SELECT/INSERT, CREATE bảng và tự tăng superuser |
| Container/network | UID 65534, read-only, drop caps, không privileged/host PID/network; exporter/DB không publish |
| Docker socket | Không truy cập được qua /host/run, /host/var/run hoặc /var/run |
| Cleanup | Không còn container/volume/network nhãn test; cleanup kiểm ownership từng target |

Filesystem được chọn theo mount thực chứa Docker volume PostgreSQL fixture, không
chọn tùy ý ổ còn nhiều chỗ. Scope là **docker-desktop-vm**; dung lượng/CPU/RAM trên
không phải cấu hình hay sức chứa của một VPS RoomQC đã triển khai.

## Thay đổi đã kiểm chứng

- Compose pin digest, mạng private, resource/log limits; node exporter chỉ bật
  cpu/meminfo/filesystem. Host bind read-only dùng cú pháp không ép propagation:
  thử rslave bị Docker Desktop từ chối; rprivate bị daemon-root guard từ chối;
  cấu hình cuối đã chạy thật. Không sửa propagation host hoặc nới privileged.
- Role thống kê mới NOLOGIN mặc định, không tự takeover role có sẵn; custom query
  trả số client và proof quyền. Exporter tắt tường minh 20 modern collectors.
- Renderer đọc target/secret file, bắt TLS verify-full ở môi trường thật,
  connect_timeout 1–3s; không overwrite output, không chạy SQL/Docker. Secret Unix
  phải đọc được bởi UID/GID container và không lộ cho all users/nhóm không liên quan.
- Source bắt buộc exporter/collector/permission khỏe, scrape error bằng 0, timestamp
  đủ mọi nguồn. Template hai mount có 23 query / 22 timestamp sources; promtool
  thử từng nguồn bị cũ. Không sửa artifact 14-source lịch sử của đợt trước.
- Kiểm thử stack đăng ký ownership trước create để cleanup được cả create dở;
  polling/quan sát tuân thủ test cancellation. Password không in trên command line,
  report hoặc exporter log được kiểm tra.

## Phạm vi chưa hoàn tất

M04 đạt phần cấu hình/runtime fixture local; P2-01 tổng thể vẫn **partial**.
Năm service probe cố ý false: fixture này không có full Supabase. Không đưa mẫu
fixture vào HealthStore local-a, không mở admission và không đo capacity sản phẩm.

Còn M05 collector thường trực/pool/heartbeat/expected-target binding; M06 đủ năm
probe và T08 manifest server-only; M07/M08 alert/notification; M09 external heartbeat;
M10 tích hợp và B01 Linux staging. TLS thật, offsite backup/restore, tải và pilot
vẫn chưa được nghiệm thu. Pin digest không thay kiểm tra lỗ hổng release ở P6/P7.

Control đang chạy image a65408e…, schema 0005; frontend cac1a629… giữ nguyên.
Kiểm tra sau test: proxy readyz 200, signup false, directory không publish DB.
Không áp role/migration vào Supabase nghiệp vụ, không gửi email thật hoặc fault
inject vào CRM/hotel/scraper. Việc không ghi vào DB nguồn không thay full data
fingerprint A02; case này vẫn cần scope kiểm chứng tương ứng trước release.

## Tiếp theo

Theo [run sheet P2](roomqc-p2-monitoring-delivery-plan-2026-10-19.md): M05 trước,
M06 phối hợp T08, rồi M07/M08/M10. [Runbook operator](roomqc-monitoring-operator-runbook.md)
ghi cấu hình/kiểm tra/rotation; [plan mục 17](roomqc-vps-signup-execution-plan-2026-10-19.md)
có phiếu chuẩn bị chi tiết. 27 gói và 70 case giữ nguyên, mục tiêu chưa hoàn thành.
