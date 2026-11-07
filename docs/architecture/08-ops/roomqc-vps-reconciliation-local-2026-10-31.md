# Đối soát triển khai bị gián đoạn — 31/10/2026

## Đã triển khai

Migration directory0023 thêm biên nhận đối soát riêng, giữ nguyên kết quả gốc.
CLI `vps:reconcile` đối chiếu đúng máy/cụm trong inventory đã duyệt. Nó chặn
lượt cũ bằng dấu kết thúc theo UUID, kiểm bản đang được trỏ tới, hash cấu hình,
image/container và health rồi mới lưu kết quả. Khóa remote chỉ được giải phóng
sau khi biên nhận đã commit. Không chạy start/stop/rollback, xóa volume/image,
sửa dữ liệu nghiệp vụ hoặc mở đăng ký.

Trang **Hạ tầng → Triển khai** hiển thị biên nhận, bản chạy lúc đối soát và
thời điểm quan sát. Kết quả gốc vẫn nằm trong phần đối chiếu. Đây là lịch sử
quan sát; sức khỏe hiện tại vẫn đọc ở Cụm dữ liệu.

## Dùng cho người vận hành

Đặt `ROOMQC_DEPLOY_DATABASE_URL_FILE` bằng đường dẫn tệp riêng chứa URL
directory của LOGIN chỉ thuộc group `roomqc_control_deployer`. Không đưa URL,
mật khẩu hay khóa SSH lên giao diện/chat. Runtime API chỉ SELECT, không INSERT
biên nhận hoặc UPDATE trạng thái đã đối soát.

```text
npm run vps:reconcile -- --run-id UUID --inventory-file ABSOLUTE_JSON \
  --host APPROVED_PUBLIC_IP --user SSH_USER --identity-file ABSOLUTE_KEY \
  --mode plan --output ABSOLUTE_NEW_JSON
```

Plan chỉ đọc directory và inventory, chưa SSH. Execute dùng cùng tham số và
`--mode execute`; chọn đường dẫn output mới. SSH giữ kiểm tra host key nghiêm
ngặt, giới hạn thời gian và kích thước phản hồi. Không nhập shell/path từ UI.

Ba kết quả có thể ghi: `candidate_healthy` (bản mới đã chạy), `previous_healthy`
(bản trước đã chạy) và `empty` (không có container của cụm). Container phải khớp
project/cụm/release/service/image và health. Không có `current` nhưng còn
container, hash sai, dịch vụ thiếu/thừa hoặc không healthy sẽ bị chặn.

Lượt bị ngắt trong bước stage, chưa ghi manifest, chỉ được xác nhận bản trước
hoặc cụm rỗng sau khi kiểm container thực. Không coi thư mục cài dở là bản cài
thành công. Lượt chưa ghi manifest mà đã qua stage không được bỏ qua kiểm tra.

Biên nhận có toàn bộ bằng chứng đã lọc và hash chuẩn hóa. DB so phiên bản quan
sát với phiên bản của lượt chạy, từ chối quan sát quá5phút hoặc lượt đã thay đổi.
Hai người đối soát đồng thời chỉ có một biên nhận thắng. Kết quả cuối không
được sửa/xóa; tiến trình cũ không ghi thêm phase/finish sau khi đã đối soát.

Nếu mất phản hồi sau commit, chạy lại cùng UUID: đọc biên nhận đã có rồi chỉ
thử dọn đúng khóa đối soát của UUID đó. Không xóa khóa của lượt khác. Nếu dọn
khóa chưa xác nhận, CLI trả exit2 và `lockReleased:false`; không báo đã dọn.

## Kiểm chứng và giới hạn

Docker/Linux thật, trong runner riêng, đạt16quan sát: cài/nâng cấp/rollback,
dữ liệu volume được giữ, cụm rỗng, bản trước/bản mới, mất reply, stage dở,
đường dẫn current lồng sai, lệnh đang chạy, lượt cũ bị chặn và triển khai tiếp
sau đối soát. Container ứng dụng đối chứng không đổi; container/network/volume
thử nghiệm đều đã dọn. Đây là workload nginx, không phải full stack RoomQC/SSH.

Năm ca PostgreSQL/HTTP thật kiểm quyền riêng, lịch sử bất biến, bằng chứng lưu
lại/đọc lại, phiên bản thay đổi, race biên nhận và việc mở lại hàng rào cấp lượt.
Các ca client/component kiểm hiển thị biên nhận lịch sử và loại bỏ cảnh báo
chưa đối soát. Xem kết quả cuối tại
`artifacts/roomqc-vps-reconciliation-local-2026-10-31.json`.

Lệnh remote còn giữ `operation.lock` sẽ bị từ chối; không tự đoán tiến trình
đã chết hoặc xóa khóa dựa vào tuổi tệp. Khóa cũ thiếu UUID từ trước khi có
journal cũng bị từ chối. Cần điều tra trên máy với trường hợp đó.
Chưa có nút khởi chạy trên UI, hàng đợi/executor đóng gói, tài khoản operator
production được cấp tự động hoặc nghiệm thu SSH/full stack. Không thay thế
gate admission/backup/schema production. Không truy cập hay đổi VPS Contabo
trong đợt này; signup thật vẫn đóng.
