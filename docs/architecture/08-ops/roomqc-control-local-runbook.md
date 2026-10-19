# Chạy nền tảng control v3 local

Đây là stack điều phối riêng; không phải bộ cài Supabase/VPS production.
Runtime đang đặt tại worktree `roomqc-worktrees/integration`. Chạy các lệnh bên
dưới từ thư mục đó; không khởi tạo bộ secret khác trong checkout chính để dùng
chung cùng Docker project/volume.

## Chuẩn bị và chạy

Yêu cầu Docker đang chạy, Node >=22 và dependency control (`npm ci --prefix
server/control --omit=dev --ignore-scripts`). Supabase local đã chạy tại 54321,
source chính có CLI và VAPID public key hợp lệ. Port 8091 phải trống hoặc do đúng
stack control này sở hữu.

```powershell
npm run control:local -- preflight
npm run control:local -- prepare --source "../../room-weave-pro-main"
npm run control:local -- up
npm run control:local -- verify
```

Prepare sinh secret một lần, ghi `.local/control/state.local`, `db.env.local`,
`api.env.local`. Rerun giữ HMAC/password; không sinh mới để tránh mất email affinity
hoặc DB không đăng nhập được. `up` build API, chờ DB, chạy migration bằng job có
credential riêng, tạo login runtime, rồi khởi động API. Mọi kiểm tra phải đạt;
diagnostic subprocess không được in nguyên văn vì có thể chứa credential.

Database directory chỉ nằm network nội bộ và volume riêng. Stack có restart
unless-stopped, healthcheck và log rotation. Worker/metrics runtime được bổ sung
ở các gói sau, chưa coi các role sẵn có là worker đang chạy.

## Proxy vào ứng dụng chính

Từ checkout chính đang chạy 8082:

```powershell
docker compose --env-file .env -f docker-compose.roomqc.yml -f docker-compose.roomqc-control.local.yml up -d --no-build --wait roomqc
```

Override chỉ mount nginx config và nối network access. Không rebuild JS hoặc bật
frontend directory/signup. Proxy trỏ Docker DNS, nên API được recreate vẫn resolve
lại; không cố định IP container. Các route `/api/` khác tiếp tục trả 503 rõ ràng.

Kiểm tra `http://127.0.0.1:8082/api/control/readyz`: 200 JSON và no-store.
Đăng ký mới trả SIGNUP_CLOSED. Dùng đúng origin 127.0.0.1:8082 cho local control;
origin localhost là origin khác. Không thêm CORS wildcard để chữa nhầm origin.

## Kiểm thử và khởi động lại

```powershell
npm run test:control:db
npm run control:local -- restart-check
```

Lệnh test tạo container DB riêng, cổng ngẫu nhiên loopback và tmpfs; kiểm tra label
trước dọn đúng container. Không dùng `test:control:local` cho đợt này vì script cũ
có thao tác đổi `directory_required` trong DB nghiệp vụ.

Restart-check chỉ nhắm stack có ownership label: chụp hash history/registry/
workspace/attempts, dừng directory, xác minh livez=200/readyz=503, khởi động DB và
API lại, đối chiếu hash và signup closed. Nó có thời gian gián đoạn control ngắn,
chỉ dùng khi local đang đóng signup; không đem lệnh này chạy production.

## Khóa và sự cố

- `.local/control/operation.lock.local` ghi PID operation. Khi bị ngắt, kiểm tra
  `Get-Process -Id <PID>` trước. Nếu process còn sống, chờ/đọc status; không tạo
  lượt chạy khác. PID chết thì xóa đúng lock file này và chạy lại `up`.
- Checksum khác: dừng, đối chiếu source/release đã áp dụng. Không sửa history để
  làm xanh health, không chạy schema.sql cũ. Migration mới sửa lỗi bằng số tiếp theo.
- Schema/registry/grants thiếu: livez có thể vẫn xanh nhưng readyz=503; không mở signup.
- DB lỗi: giữ volume, xem log giới hạn của service. Không dump env/config/secret vào chat.
- Secret file thất lạc: khôi phục bản sao được bảo vệ; không tự tạo password/HMAC
  khác để thử với volume cũ. Chưa có backup ngoài máy, nên chưa đủ gate production.

## Dừng và rollback

```powershell
npm run control:local -- stop
```

Giữ nguyên volume và secret; không có lệnh xóa volume trong helper. Muốn bỏ proxy,
recreate frontend bằng compose cơ sở `docker-compose.roomqc.yml` với `--no-build`.
Không rollback database bằng binary cũ hoặc xóa mapping. Sau rollback kiểm tra
8082 login/health và các dịch vụ ngoài RoomQC vẫn chạy.
