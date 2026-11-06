# Khôi phục đăng ký local sau lỗi Failed to fetch

## Nguyên nhân và bản sửa

Demo `d33c1b6ff115` là bộ thử một giờ, đã hết hạn khoảng 15:49 ngày
01/11/2026 và tự dọn container/volume. Tab trình duyệt vẫn còn nên thao tác
đăng ký gặp connection refused, hiện `Failed to fetch`. Đây là lỗi cách bàn
giao demo. Dữ liệu của lượt thử tạm cũ đã bị dọn, không báo là đã phục hồi.

Đã cài bản demo riêng `c3ee8e485c0d` tại cùng địa chỉ
<http://127.0.0.1:59255/start>. Dịch vụ chạy detached trong Docker, không có
timer kết thúc sau một giờ và không cần giữ Terminal đang chạy. Dừng/mở lại
không xóa database/role/volume; các container có `unless-stopped`.

Các bài kiểm browser tạm thời vẫn giữ timeout và cleanup mặc định. Chế độ
bền vững chỉ được chọn bằng cờ `--persistent-local-demo`. Không đổi gate
signup production hay cấu hình VPS.

## Kiểm chứng đã thực hiện

- Chuẩn bị đủ 591 migration, nguồn backend khớp snapshot; runner cài đặt
  kết thúc **exit 0**, giữ 11 container riêng đúng ownership.
- Browser tạo doanh nghiệp `kiem-tra-khoi-phuc`, Auth signup public, nhận
  OTP SMTP nội bộ, xác minh email, đăng nhập và tự cấp khách sạn thành công.
- Tạo phòng 101, giá 450.000 đồng, diện tích NULL.
- Chạy `demo:signup:restart`: dừng và mở lại toàn bộ stack, lệnh exit 0;
  PostgreSQL vẫn có chủ sở hữu đã xác minh, một khách sạn và phòng đúng giá.
  Reload browser đọc được phòng, logout/login lại vào dashboard có một phòng.
- Kích hoạt cùng đường gia hạn admission bằng SIGUSR2: approval epoch 3,
  không mất workspace. Đăng ký doanh nghiệp thứ hai `sau-khoi-dong-lai`,
  tạo tài khoản Auth, nhận và xác minh OTP sau restart/gia hạn thành công.
  Doanh nghiệp thứ hai mới reserved, chưa hoàn tất onboarding.
- Đối chiếu cuối: 2 Auth owner đã xác minh, 1 workspace active, 1 reserved,
  1 khách sạn, phòng 101. Schema fingerprint nghiệp vụ không đổi.
- 11 container đang chạy; chỉ web publish `127.0.0.1:59255`, backend không
  mở cổng host. Console không có lỗi ở lần đọc cuối.
- Lượt dựng đầu `2f37623be8ad` lỗi HTTP internal URL/thứ tự khởi động đã
  được dọn và kiểm độc lập còn 0 container/network/volume; không tính đạt.

Đây là kiểm trực tiếp và đối chiếu runtime, không phải một bộ test tự động
mới hoặc kiểm tải. Chưa chờ đủ một giờ, chưa reboot Windows thật; đã kiểm
đường gia hạn bằng tín hiệu và dừng/mở lại toàn bộ dịch vụ.

## Cách dùng lại

Chạy trong thư mục checkout `roomqc-worktrees/integration`:

```powershell
npm run demo:signup:status
npm run demo:signup:stop
npm run demo:signup:start
npm run demo:signup:restart
```

Không chạy lại `demo:signup:install` để mở demo đã cài. Không dùng
`docker compose down -v`, `--cleanup-state` hoặc xóa thư mục `.local` nếu
cần giữ dữ liệu. Lifecycle chỉ thao tác container đã kiểm nhãn ownership.

Tab đăng ký đã điền sẵn **Khách sạn dùng thử**, slug **dung-thu-ne**,
email chưa dùng `invitation-c3ee8e485c0d-browser-staff@roomqc.invalid`.
Người dùng chọn mật khẩu của mình ở bước sau; lấy mã tại
<http://127.0.0.1:59255/__fixture/inbox>. Các nhãn demo01…demo13 cũng chưa
dùng. Không cần chia sẻ mật khẩu trong chat.

## Giới hạn của bản demo

- Cần Docker Desktop đang chạy. Backend chỉ ở local, không phải địa chỉ
  nhận khách thật; số liệu admission/backup/probe được tạo cho bộ thử và tự
  làm mới trong dịch vụ demo, không chứng minh tài nguyên VPS hay backup thật.
- Giới hạn 10 workspace; SMTP chỉ chấp nhận 16 email giả trong hộp thư,
  không gửi email thật hoặc kết nối Resend. Tối đa 32 thư trong mỗi lần chạy.
  Thư/OTP nằm trong RAM; sau restart cần gửi lại mã nếu chưa xác minh.
- Tài khoản và dữ liệu nằm trong Docker data riêng, chưa có backup offsite.
  Không nghiệm thu độ bền khi mất ổ đĩa hoặc máy hỏng.
- Chưa đổi nội dung quảng bá miễn phí 5 tháng so với trial khoảng một tháng.

[Biên nhận runtime](../../../artifacts/roomqc-signup-demo-recovery-2026-11-01.json)
và [ảnh sau restart](../../../artifacts/roomqc-signup-recovery-after-restart-2026-11-01.png).
