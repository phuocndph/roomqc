# Diễn tập chạy dịch vụ từ checkpoint — 01/11/2026

**Đạt phục hồi dịch vụ lõi và API quản trị; chưa đạt full-service recovery.**
Signup production vẫn đóng, không ghi backup `scope=bundle, verified`.
Biên nhận công khai: [runtime acceptance](../../../artifacts/roomqc-checkpoint-core-runtime-2026-11-01.json).
Checkpoint nguồn và quy tắc restart live vẫn theo [runbook checkpoint](roomqc-contabo-checkpoint-live-2026-11-01.md).

## Bằng chứng đã chạy

Run `cf96f0236450`, hoàn tất kiểm dịch vụ lúc `2026-11-01T04:14:08.028Z`,
dùng checkpoint `24dc36fb-5b67-4204-997d-51fed1536de8`, SHA-256
`626d1494c2187ba5683a3acc4bd1cca03c6a18fc0bbdc5c3212265f462de0a37`.
Hai packet đã mở và xác thực từ giai đoạn trước; mỗi lần chạy đối chiếu lại
descriptor/hash checkpoint và restore đầy đủ inventory trước khi cấp callback.

- Database business/directory được phục hồi từ bản sao đã kiểm, ban đầu mạng
  `none`. Sau đối chiếu mới gắn vào mạng Docker `--internal` riêng, không host
  port, không liên hệ VPS nguồn. Quy tắc HBA mới chỉ áp subnet mạng thử, SCRAM.
- Cấp mật khẩu SCRAM mới cho **13 LOGIN business và 9 LOGIN directory**. Thu
  hồi session/refresh/one-time/flow state trong bản phục hồi, thay JWT signing
  secret và hai API key. Không đổi mật khẩu người dùng thật trên VPS.
- Canary đăng nhập đúng user ID nguồn, đọc business chỉ bị từ chối hoặc rỗng;
  API key cũ bị chặn. Auth signup đóng.
- Storage đọc được 256 byte từ object đã khôi phục, SHA-256 khớp bản nguồn.
  Edge Function `control-probe` trả HTTP 200 và đúng challenge/cluster/contract;
  token người dùng canary không có quyền gọi probe.
- Realtime 2.143.3 khởi động healthy sau cấp lại khóa mã hóa, JWT và mật khẩu
  kết nối được lưu trong tenant. Giữ UUID tenant/extension, giới hạn và pool
  settings; không xóa/reseed tenant. Hai socket vào đúng private topic, truyền
  được broadcast; private topic khác bị chặn.
- API quản trị dùng LOGIN có quyền cũ với mật khẩu mới. Operator được cấp mật
  khẩu mới **chỉ trên bản phục hồi**, đăng nhập và đọc được cluster đã khôi phục.
  Canary bị chặn HTTP 403 ở API admin; signup control bị chặn 503 `SIGNUP_CLOSED`.
  Approval nguồn không được đem sang cấp quyền cho target: admission có
  `RELEASE_APPROVAL_NOT_CURRENT`, `MANUAL_CLOSED`, `BACKUP_UNVERIFIED`.
- Container dịch vụ thử, hai database, object volume và mạng thử đã dọn.

`scripts/roomqc-realtime-recovery.mjs` chỉ xử lý đúng legacy AES-128-ECB của
vendor version này. Nó giải mã và so với cấu hình nguồn đã xác thực trước khi
mã hóa lại, so nguyên hàng nguồn trong transaction có advisory lock. Định dạng
`g1:`/GCM hoặc danh tính/extension lạ bị từ chối để review riêng. Đây là thao tác
trước khởi động trên database phục hồi cách ly, không phải công cụ rotate live.

## Regression và lỗi đã xử lý

**34 Node tests + 4 Python checkpoint tests đạt, không fail/skip**. Bốn file
runtime/restorer/lifecycle mới hoặc chỉnh sửa đều qua syntax check.

Kiểm native `test-roomqc-checkpoint-callback-cleanup.mjs` đạt: callback chỉ được
gọi sau inventory verification; chủ động gây lỗi ở cả callback directory lẫn
business thì hai database đều bị dọn và không xuất `result.json` thành công.
Callback sai kiểu bị từ chối trước khi restore. Đây là kiểm riêng với Docker
thật, không cộng thành unit-test count ở trên.

Run `d818eb721e38` đã thất bại và giữ nguyên dấu vết: cấu hình production dùng
DSN file, còn biến inline được để trống có chủ ý. Bộ diễn tập nay đọc danh tính
API từ runtime credential đã xác thực, yêu cầu duy nhất một LOGIN, so login với
username DSN rồi dùng mật khẩu mới. Đã sửa cả endpoint readiness thành
`/api/control/readyz`. Run `cf96f0236450` chứng minh hai sửa đổi hoạt động.
Lịch sử các lần lỗi cold-start/network ở giai đoạn trước không bị sửa thành pass.

## Chạy lại

Hai công cụ chỉ nhận packet đã mở, checkpoint và digest được ghim. Đặt biến
`ROOMQC_BACKUP_PYTHON` tới Python phù hợp nếu `python` không có trong PATH.
Không đưa khóa giải mã, DSN hoặc JWT vào tham số hay log công khai.

```powershell
node scripts/roomqc-checkpoint-runtime-drill.mjs `
  --checkpoint-file <private-checkpoint.json> --sha256 <reviewed-sha256> `
  --business-dir <opened-business> --control-dir <opened-control> `
  --output-dir <private-output-root>

node scripts/test-roomqc-checkpoint-callback-cleanup.mjs `
  --checkpoint-file <private-checkpoint.json> --sha256 <reviewed-sha256> `
  --business-dir <opened-business> --control-dir <opened-control> `
  --output-dir <private-output-root>
```

Theo dõi đúng handle tiến trình tới kết thúc. Nếu có lỗi, đọc diagnostic trong
thư mục private và chỉ trích mã lỗi đã lọc. Không khởi động lượt thứ hai chỉ vì
thời gian chờ quan sát hết. Không chạy `docker system prune` hay dọn tài nguyên
không có nhãn của lượt thử.

## Giới hạn nghiệm thu và bước tiếp

Chưa chạy lại toàn bộ worker bằng credential mới, chưa build frontend với key
mới hoặc kiểm login/admin bằng trình duyệt. Bằng chứng API không thay E2E web.
Chưa có target approval độc lập, ingress/TLS mới hoặc lịch backup/offsite/key
escrow bền vững. SMTP được vô hiệu hóa trong mạng thử, không gửi email thật.
Không dùng kết quả này để bỏ qua các điều kiện mở signup.

Thứ tự tiếp theo:

1. Review fingerprint target với baseline độc lập; cấp approval chỉ cho target
   phục hồi, không ký hash quan sát hoặc sao chép production approval.
2. Cấp lại credential quyền hẹp cho setup/health/probe, chạy worker trên
   directory phục hồi; kiểm predecessor bị chặn và quyền tenant giữ nguyên.
3. Build frontend với public key mới từ source đã ràng buộc; kiểm trình duyệt
   qua ingress/TLS mới. Khi đủ toàn bộ mới xét nghiệm thu backup bundle.
4. Lập lịch backup mã hóa, retention ngoài VPS, cảnh báo lỗi và key escrow độc
   lập. Xử lý capacity/approval renewal trước khi chạy public signup E2E/load/pilot.

## Kiểm tra VPS riêng sau diễn tập

Đây là kiểm live riêng, không phải truy cập nguồn từ sandbox phục hồi.
Lúc `04:16:59Z`: frontend health, Auth health kèm public key và control readiness
đều HTTP 200. Auth không kèm API key trả 401 đúng gateway contract. Disk còn
24,42% trống, dưới ngưỡng phục hồi 25%; không reset latch hoặc hạ ngưỡng.
File `/root/backups/joliefam/joliefam.zip` không tồn tại khi kiểm, **không xóa
file nào** dù đã được duyệt xóa đúng đường dẫn đó.
