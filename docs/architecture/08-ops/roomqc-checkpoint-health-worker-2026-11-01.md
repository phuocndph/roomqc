# Khôi phục health/probe worker — 01/11/2026

**Đạt kiểm thử native cho health worker trên checkpoint phục hồi. Cả năm dịch
vụ đạt trước và sau restart. Chưa đạt khôi phục toàn hệ thống hoặc mở signup.**

Biên nhận công khai: [health worker acceptance](../../../artifacts/roomqc-checkpoint-health-worker-2026-11-01.json).
Kế thừa [setup worker](roomqc-checkpoint-setup-worker-2026-11-01.md) và
[dịch vụ lõi](roomqc-checkpoint-core-runtime-2026-11-01.md).

## Bằng chứng

Run `1cc89ec570bc` kiểm xong lúc `2026-11-01T05:10:06.001Z`, exit 0; SHA-256
biên nhận riêng `2a61e2afe833cc8008279e2a0123e0231e466ddb96b7a9c0dae427d5efaa1e38`.
Restore lại cả hai database từ checkpoint chung, kiểm inventory, cấp mật khẩu
LOGIN/JWT mới, chạy lại dịch vụ lõi và setup worker trước health worker.

| Hạng mục | Kết quả thực tế |
| --- | --- |
| Nguồn dung lượng | Đọc đúng writable layer chứa `data_directory` PostgreSQL của container phục hồi; so device number với mount ext4 thực tế |
| Phạm vi đo | Docker Desktop VM, `/mnt/docker-desktop-disk`, `/dev/sde`; không dùng số đo VPS Contabo |
| Stack đo | Prometheus, node exporter, PostgreSQL exporter thật; kiểm query templates không thiếu/NaN và hai scrape target đều `up` |
| Phê duyệt target | Operator đăng nhập Auth thật; lệnh `validate` và `bind_telemetry_target` qua `ControlStore`/`AdminDirectory` và giao thức nhận lệnh quản trị hiện hành |
| Probe catalog | Installer LOGIN riêng ghi bằng CAS revision 6 → 7, AES-GCM với keyring mới |
| Canary | Giữ user ID nguồn; tạo session Auth mới, không dùng lại session cũ hoặc đọc keyring mã hóa nguồn |
| Worker | Chạy entrypoint sản phẩm `workers/health-runtime.mjs`, budget thật, hai pool metrics/probe với LOGIN riêng |
| Năm dịch vụ | Auth, REST manifest, Storage object/hash, hai private Realtime socket và Functions challenge đều đạt |
| Restart | Worker ready trở lại; snapshot có timestamp mới hơn trước restart và vẫn đủ 5/5 probe |
| Phạm vi quyền | UID 1000, rootfs chỉ đọc, bỏ capabilities; worker chỉ mount `/health` chỉ đọc, không có operator/installer password hoặc service key |
| Hàng rào | `manual_closed` và `operator_reopen_required` vẫn true; không chạy reset latch hoặc lệnh mở nhận khách |
| Schema | Fingerprint vẫn `f05b3779…600f1` sau giám sát; không thêm role/grant vào business để làm probe thành công |
| Cleanup | Container, DB phục hồi, volume và cả hai mạng của run đã dọn |

Telemetry target đổi thật vì đây là máy phục hồi khác. Lệnh bind chuẩn làm
snapshot cũ thành `unknown`, tăng target version và bắt warmup lại theo trigger
sản phẩm. Đây không phải giữ nguyên evaluator state của máy Contabo; lịch sử
được phục hồi và không có thao tác reset latch để làm admission xanh. `ready`
của worker chỉ chứng minh pipeline thu thập/ghi được dữ liệu.

Directory thử nghiệm vẫn dùng tmpfs theo restorer offline; phần disk mapping
ở trên chứng minh ổ chứa business PostgreSQL. Chưa chứng minh dung lượng hoặc
khả năng chịu tải production từ các số đo VM local này.

## Kiểm tra và lỗi đã sửa

**38 tests đạt, 1 skip, 0 fail**: 34 kiểm tra health/probe/protocol, cộng 4 kiểm
tra mapping filesystem và cú pháp script được sinh. Một kiểm tra stack độc lập
cần opt-in không được tính là pass; run checkpoint ở trên đã chạy stack thật.
Ba script runtime/worker recovery qua syntax check.

Run `d6ed6bc1012f` dừng vì script metadata được sinh có newline trong chuỗi
JavaScript. Đã sửa escape, tách chương trình metadata thành hàm và thêm kiểm
compile trước Docker. Lịch sử lỗi giữ nguyên, không có success receipt; môi
trường của lần lỗi cũng đã dọn. Không hạ kiểm tra mount hoặc thay bằng mount giả.

Biên nhận ghi rõ một thay đổi mô tả `remaining` được thêm vào parent script sau
khi run đã khởi động; có hash bản đã thực thi và hash bản hiện tại riêng biệt.
Thay đổi đó chỉ nêu thêm host observer/rotation daemon còn thiếu, không thay
hành vi runtime đã nghiệm thu.

## Phần tiếp theo

Đối chiếu catalog cấu hình nguồn cho thấy còn `operator/host-observer/compose.json`
và daemon `credential-rotation` trong `operator/setup/compose.json`. Lượt này
đã kiểm **một tick rotation thật**, chưa khởi động/kiểm daemon liên tục hoặc host
observer sau phục hồi. Không ghi chung rằng mọi management worker đã phục hồi.

1. Khôi phục host observer và daemon rotation liên tục; kiểm budget, quyền,
   journal và restart trên directory đã phục hồi.
2. Build frontend với public key mới, nối đúng backend và kiểm browser login/admin.
3. Cấp approval đúng frontend mới, khôi phục TLS ingress và nghiệm thu toàn bộ
   runtime; chưa ghi backup `scope=bundle, verified` trước khi đủ bằng chứng.
4. Backup ngoài host theo lịch, retention và key escrow độc lập.
5. Capacity/latch live theo policy, gia hạn authority, email thật và public
   signup E2E/load/pilot.

Signup production không đổi. Không liên hệ VPS nguồn trong run này; số đo
capacity live gần nhất vẫn thuộc biên nhận riêng lúc `04:49:30Z`, không lấy số
đo VM local thay cho Contabo.
