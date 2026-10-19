# Monitoring RoomQC — cấu hình và kiểm chứng exporter

Phạm vi phiên bản đầu: Prometheus và hai exporter riêng tư. Đây là bộ nguồn số đo,
chưa bao gồm health worker, đủ năm service probe, alert dispatcher hoặc bộ cài full VPS.
Theo [M04/M05/M06](roomqc-p2-monitoring-delivery-plan-2026-10-19.md) và
[plan thực thi](roomqc-vps-signup-execution-plan-2026-10-19.md).

## 1. Điều kiện trước cấu hình

1. Operator nhận inventory đã duyệt: host/cluster/environment, filesystem/device/mount
   thực chứa DB/Storage và budget kết nối. Hai thư mục cùng ổ chỉ khai một mount.
2. Exporter không có Docker socket, privileged, PID hoặc network host. Root filesystem
   host được bind read-only; `/host/run` bị che bằng tmpfs read-only mode 000.
   Chỉ bật cpu/meminfo/filesystem. Inventory đổi hoặc mount mới cần restart exporter,
   đối chiếu lại và warmup; không tự dùng metric của ổ cũ.
3. Docker Desktop chỉ dùng scope `docker-desktop-vm`. Staging/production yêu cầu
   `linux-host`; ext4/xfs/btrfs. Không hỗ trợ thì dừng, không thay ổ hoặc đổi scope giả.
4. Network backend phải là network riêng đã duyệt, không tạo/join một project khác.
   Bộ compose không publish cổng. Health worker tương lai cần kênh metrics riêng;
   không mở Prometheus ra Internet để giải quyết việc chưa nối worker.

## 2. Tài khoản DB và secret

`deploy/monitoring/exporter-roles.sql` chỉ do operator/migrator áp vào target được duyệt.
Tạo role mới `roomqc_monitor` ở trạng thái NOLOGIN, giới hạn 3 kết nối, read-only,
statement timeout 3s, lock timeout 1s, idle transaction timeout 5s; chỉ grant
`pg_read_all_stats`. Role tồn tại làm transaction fail, không được tự chiếm quyền.

Operator cấp LOGIN/password qua secret channel trên server, không dán trong chat,
tham số shell hoặc commit. Audit quyền PUBLIC/default grants của target: không cho
role này đọc/ghi business tables, CREATE ở business schema hoặc tự tăng quyền.
Default read-only không thay thế kiểm tra quyền; user có thể đổi session setting.
Không thu hồi PUBLIC toàn hệ thống một cách mù quáng làm hỏng dịch vụ khác.

Chuẩn bị ba file trong thư mục secret riêng:

| File | Nội dung |
|---|---|
| postgres-uri | host:port/database, không username/password; tham số allowlist |
| postgres-user | roomqc_monitor |
| postgres-password | Mật khẩu ngẫu nhiên 32–256 ký tự, không control characters |

Local có thể dùng `sslmode=disable`; staging/production bắt buộc `sslmode=verify-full`
và `sslrootcert=/etc/roomqc/tls/ca.pem` (hoặc tên `.pem` hợp lệ cùng thư mục).
`connect_timeout` bắt buộc 1–3 giây. Không nhận options tùy ý, tham số trùng,
embedded credential hoặc metadata IP. DNS/network vẫn phải thuộc inventory được duyệt.

Unix: secret file đọc được bởi UID/GID 65534, không world access, không group write
hoặc group read cho nhóm khác. Ví dụ root:65534 mode 0640 hoặc 65534:65534 mode 0600.
CA phải đọc được với UID exporter; không đưa private key không cần thiết vào thư mục TLS.
Windows dùng ACL user hiện hành/SYSTEM; mode Unix không thay thế kiểm tra ACL Windows.

## 3. Render trước, deploy sau

Từ root repository, xem giao diện có sẵn:

```powershell
node scripts/render-monitoring-config.mjs --help
```

Truyền `--target` file inventory JSON, `--output` thư mục mới chưa tồn tại,
`--secrets`/`--tls` thư mục đã chuẩn bị, `--network` đã duyệt và `--project`
dạng `roomqc-monitor-...`. Đường dẫn file/thư mục là absolute. Script chỉ render,
không chạy Docker hoặc SQL. Nếu lỗi ghi giữa chừng, kiểm tra thư mục kết quả trước
khi chọn output mới; không tự xóa thư mục có dữ liệu.

Target có đúng các trường: `clusterId`, `hostId`, `environment`,
`dbConnectionBudget`, `measurementScope`, `dataMounts`; mỗi mount có `id`,
`mountpoint`, `device`, `fstype`. Không nhập metric hoặc password trong target.

Bundle gồm prometheus.yml (cấu hình không bí mật, container đọc được), target.json
và monitor.env (quyền hạn chế). Không công bố `docker compose config` toàn bộ trong
báo cáo vì đường dẫn/inventory có thể nhạy cảm. Dùng monitor.env với đúng file
`deploy/monitoring/compose.yml`; chỉ sau review target/network mới chạy compose up.

Pin hiện tại:

| Service | Version | Digest |
|---|---|---|
| Prometheus | v3.2.1 | 6927e0919a144aa7616fd0137d4816816d42f6b816de3af269ab065250859a62 |
| node_exporter | v1.9.1 | d00a542e409ee618a4edc67da14dd48c5da66726bbd5537ab2af9c1dfc442c8a |
| postgres_exporter | v0.17.1 | 38606faa38c54787525fb0ff2fd6b41b4cfb75d455c1df294927c5f611699b17 |

Tổng memory limits 768 MiB, CPU limits 1,25 core; đây là trần cấu hình, chưa phải
overhead thực tế. Prometheus retention 15 ngày/512 MB cho TSDB; WAL/head/log cần
dung lượng dự phòng riêng. Query timeout 3s, concurrency 8; exporter scrape 15s
mặc định, sample_limit 5.000/body 2 MB. Mỗi service log 10 MB × 3. Không suy ra sức
chứa VPS hoặc số khách sạn từ các giới hạn container này.

## 4. Nghiệm thu trước khi dùng nguồn

1. Inspect user 65534, read-only rootfs, cap_drop ALL, no-new-privileges, no ports.
2. Kiểm tra không truy cập socket qua `/host/run/docker.sock`, symlink
   `/host/var/run/docker.sock` hoặc socket của container. Không sửa propagation toàn host.
3. Đối chiếu CPU idle-rate cửa sổ 1 phút với /proc/stat trong cùng khoảng thời gian
   (dung sai 5 điểm phần trăm), MemTotal chính xác/MemAvailable trong 5% tổng RAM,
   filesystem total chính xác/free trong 128 MiB/inode trong 0,1 điểm phần trăm ở fixture.
   Sai số do tải lớn phải điều tra và đo lại, không dùng dung sai che sai mount.
4. So count client backends trong pg_stat_activity, trừ kết nối observer tạm thời;
   exporter tự chiếm kết nối. Dung sai fixture 1 kết nối do khác thời điểm scrape.
5. Thu hồi pg_read_all_stats: monitor_permission phải về 0 và source reject.
   Dừng DB: pg_up không còn healthy. Password cũ sau terminate/reconnect phải fail.
6. Đổi password DB và secret file qua secret channel, recreate exporter có chủ đích,
   kiểm tra mẫu mới. Không chỉ đổi secret file rồi mặc định process đã reload.
7. Source yêu cầu up/pg_up/collector success/permission =1, scrape_error=0 và đủ
   timestamps cho mọi series; metric cũ hoặc lỗi không được biến thành số 0 khỏe.

Query custom bị deprecated ở exporter đã pin nhưng vẫn được hỗ trợ phiên bản này.
Hai cờ disable-default-metrics/disable-settings-metrics chưa đủ tắt modern collectors;
compose tắt tường minh 20 collector khác. Nâng exporter phải là đợt compatibility test
riêng, không đổi tag/digest mà giữ giả định extension query hoạt động.

## 5. Kiểm thử local và phạm vi bằng chứng

`npm run test:control:db` gồm owned monitoring stack test khi Docker có sẵn.
Test tạo PostgreSQL riêng, volume/network/container có run ID, random loopback port
chỉ cho Prometheus qua override test. Base compose không publish. Cleanup validate
label/owner trước xóa đúng fixture; không dùng down -v cho stack đang phục vụ.

Năm probes trong fixture để false: không có full Auth/REST/Storage/Realtime/Functions.
Test không ghi HealthStore của cụm đang dùng, không mở admission hoặc chạy collector
thường trực. B01 Linux, TLS/rotation staging, overhead, external alert và capacity
vẫn phải nghiệm thu riêng. Backup ngoài máy/restore proof không được tạo từ test này.
