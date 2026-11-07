# RoomQC mobile — Android và iOS

Kết quả kiểm chứng thực tế: [VALIDATION.md](./VALIDATION.md).

## Phạm vi bản 0.1.0

Ứng dụng Capacitor 8 đóng gói giao diện React vào máy, dùng chung backend và
phân quyền RoomQC. Không phải một website từ xa được mở bằng `server.url`.
Các màn hình mobile sẵn có tiếp tục dùng cho công việc, phòng, kiểm phòng,
bảo trì, đặt phòng và các module được cấp quyền; không tự cấp thêm quyền.

Đã tích hợp:

- Mở vào đăng nhập / chọn doanh nghiệp, nhớ doanh nghiệp lần trước.
- Giữ phiên đăng nhập trong iOS Keychain / Android Keystore mã hóa; không lưu
  mật khẩu. Lỗi kho bảo mật không chuyển sang lưu token dạng rõ.
- OAuth bằng trình duyệt hệ thống và liên kết quay lại qua PKCE. Nhận liên kết
  xác thực email, đổi mật khẩu; chặn scheme lạ và chuyển nhầm doanh nghiệp.
- Nút Back Android ưu tiên đóng dialog rồi quay lại lịch sử, thu nhỏ ở trang gốc.
- Camera native cho kiểm phòng, báo sự cố và thành phần tải ảnh dùng chung.
  Không tự ghi ảnh vào thư viện. Nếu Android hủy tiến trình lúc chụp ảnh, app yêu
  cầu mở đúng công việc và chụp lại, không tự gắn ảnh vào một phòng khác.
- Vùng an toàn, bàn phím iOS, trạng thái mất mạng, đọc lại dữ liệu khi mở app.
- Bản native không đăng ký service worker / mời cài PWA / tải bản vá JS từ xa.
- Chặn thao tác ghi mới qua React Query khi biết thiết bị mất mạng; không tạo
  hàng đợi offline để tự gửi nghiệp vụ khi có mạng lại. Mất phản hồi giữa chừng
  vẫn cần kiểm tra trạng thái trên máy chủ trước khi gửi lại.

## Những phần chưa hoàn tất

Đây là bản nền tảng mobile để kiểm thử, chưa phải bản đã phát hành trên store.

- Push khi đóng app: chưa tích hợp FCM/APNs; Web Push được tắt trên native,
  thông báo trong app vẫn theo cơ chế hiện có. Cần Firebase project, APNs key,
  lưu token thiết bị theo tenant/user và xử lý thu hồi khi đăng xuất.
- Chưa có cơ chế làm việc offline / đồng bộ nghiệp vụ.
- Chưa xác minh E2E trên máy Android và iPhone thật; unit test không thay thế
  kiểm tra camera, Keychain/Keystore, bàn phím, OAuth và hệ điều hành thu hồi app.
- Chưa xuất bản APK/AAB ký release, IPA/TestFlight hoặc đăng store.
- Backend/domain VPS production chưa được cung cấp. `127.0.0.1` trên điện thoại
  là điện thoại, không phải máy tính đang chạy Docker.
- Các chức năng in, xuất file, thanh toán/gói sử dụng và liên kết ra ngoài cần
  kiểm tra riêng trên native trước khi đưa vào bản phát hành công khai.
- Còn cảnh báo bundle vendor lớn và dependency audit trong dự án gốc; cần xử
  lý trước phát hành. Không dùng `npm audit fix --force` tự động để tránh phá app.

## Chạy và build

Từ thư mục chứa `package.json`:

```powershell
npm ci
npm run mobile:doctor
```

Sao chép `.env.mobile.example` thành `.env.mobile.local`, điền các endpoint thật.
Chỉ dùng publishable/anon key, không đặt service_role hay signing key trong VITE_*.
App ID hiện tại là `com.roomqc.app`; xác nhận quyền sở hữu định danh này trước
khi tạo ứng dụng trong Apple/Google console. Đổi ID sau khi phát hành sẽ thành
một ứng dụng khác.

```powershell
npm run mobile:build
npm run mobile:sync
npm run mobile:verify:release
npm run mobile:android
```

Build release bắt buộc HTTPS công khai, không chấp nhận domain ví dụ, IP hay
secret key. Verify release kiểm tra cả asset đã copy và cấu hình native để tránh
đóng gói nhầm bản test HTTP. Android Gradle gọi gate này trước `preReleaseBuild`.

### Android local

#### Giả lập trên Windows (không cần Android Studio hoặc Mac)

Bộ công cụ portable đặt tại `%LOCALAPPDATA%/RoomQCBuild`. Máy cần bật ảo hóa
và có tăng tốc WHPX; script chỉ kiểm tra, không tự thay đổi tính năng Windows.
Lần đầu tải emulator khoảng 434 MB và ảnh Android 16 khoảng 1,8 GB.

```powershell
./scripts/setup-mobile-emulator.ps1
npm run mobile:emulator
```

Lệnh mở sẽ dùng máy ảo riêng `RoomQC_API_36`, cổng 5556, RAM 3 GB / 4 lõi,
cài APK debug rồi mở RoomQC. Không xóa app/data hoặc thay máy ảo của dự án khác.
Đóng cửa sổ giả lập khi không dùng; chạy lại cùng lệnh để mở lần sau.
Nếu cổng 5556 đã thuộc máy ảo khác, lệnh dừng và giữ nguyên máy ảo đó.

Setup bật `hw.keyboard=yes` để nhập từ bàn phím máy tính. Click vào ô cần nhập
trong màn hình điện thoại trước khi gõ. Nếu sửa cấu hình này khi máy ảo đang
chạy, cần đóng máy ảo và mở lại bằng `npm run mobile:emulator -- --cold`
để không nạp cấu hình bàn phím cũ từ snapshot. Không cần xóa dữ liệu app.

Máy tính phải chạy Docker/Supabase local. Đăng nhập bằng tài khoản local của
RoomQC; không cần tài khoản Google để dùng máy ảo. Dữ liệu được ghi vào backend
local đang có, không phải cơ sở dữ liệu riêng của giả lập. Không dùng tài khoản
hoặc dữ liệu production để thử các thao tác phá hủy.

Lệnh này dành APK emulator (`10.0.2.2`), không cài lên điện thoại USB và không
tự build lại APK nếu mã nguồn đã thay đổi. Muốn lấy thay đổi mới, chạy lại chuỗi
build/sync/apk bên dưới trước. Log boot nằm tại `artifacts/mobile/emulator-*.log`.

Cần JDK 21 và Android SDK 36, build-tools 36.0.0. Có thể dùng Android Studio,
hoặc script `scripts/setup-mobile-toolchain.ps1` tải công cụ portable từ Microsoft
và Google, kiểm checksum, đặt riêng trong `%LOCALAPPDATA%/RoomQCBuild`.
Script build tự nhận công cụ portable, không sửa PATH hệ thống.

```powershell
# Dùng cấu hình Supabase local hiện có; chuyển loopback thành 10.0.2.2.
# Artifact này chỉ dành Android emulator, tắt directory để truy cập trực tiếp DB.
npm run mobile:build:local -- --emulator
npm run mobile:sync
npm run mobile:apk
```

APK nội bộ đã build và kiểm chữ ký: `artifacts/mobile/roomqc-debug.apk`.
Artifact hiện tại chỉ kết nối backend local từ Android emulator; xem báo cáo
VALIDATION để biết đúng cấu hình và giới hạn kiểm thử.
`mobile:apk` tạo bản debug ký bằng debug key, không dùng để phát hành.

Thiết bị thật cần `.env.mobile.local` trỏ LAN IP máy tính, ví dụ
`http://192.168.1.20:54321` và `http://192.168.1.20:8082`, rồi chạy
`npm run mobile:build:local` (không dùng `--emulator`). Máy và điện thoại cùng
mạng, firewall chỉ mở các cổng cần thiết. Không tự mở Supabase/DB ra Internet.
Directory trong bản LAN cần cluster bootstrap trả đúng địa chỉ mà điện thoại
truy cập được; nếu registry vẫn trả loopback thì dùng mode trực tiếp để test.

### iOS

Đã tạo dự án Xcode và danh sách plugin bằng Swift Package Manager, không cần
CocoaPods. Windows có thể build/copy web assets và cập nhật danh sách plugin,
nhưng biên dịch và ký iOS cần macOS + Xcode phù hợp Capacitor 8.

Trên Mac: cấu hình endpoint HTTPS, `npm ci`, `mobile:build`, `mobile:sync`,
`mobile:verify:release`, `mobile:ios`. Chọn team trong Xcode, chạy simulator /
iPhone, rồi Archive và upload TestFlight. Bản HTTP dành emulator Android không
được dùng trên iOS; không bật ATS arbitrary loads cho release.

## Đăng nhập và máy chủ

Supabase Auth cần cho phép các redirect sau ở máy chủ đích (bao gồm query
workspace/next theo cấu hình redirect allowlist của Supabase):

```text
com.roomqc.app://auth/callback**
com.roomqc.app://auth/change-password**
```

Nên giới hạn đúng scheme, host và hai route; không dùng `**` cho toàn bộ scheme
không liên quan. Các callback dùng PKCE nên email/OAuth phải bắt đầu trên chính
điện thoại tạo verifier. Mở email ở máy khác có thể cần đăng nhập lại.
Google OAuth cần cấu hình provider trên backend; bản store có Google sign-in
cần rà soát yêu cầu Sign in with Apple theo hình thức phân phối thực tế.
Universal/App Links theo domain có thể làm ở giai đoạn sau khi có domain thật.

Control directory đi qua native HTTP có timeout, không theo redirect và gửi
Origin của web server đã cấu hình. Web vẫn giữ kiểm tra Origin hiện có, không
mở CORS `*`. Supabase Data API/Realtime dùng kết nối bình thường qua HTTPS/WSS;
VPS phải cho phép origin của WebView ở endpoint cần kiểm soát CORS.

Session, profile, tenant, phân quyền và RLS vẫn do backend kiểm tra. Native
storage chỉ bảo vệ token lưu trên máy; không thay thế chống XSS và không biến
thiết bị đã root/jailbreak thành môi trường tin cậy.

## Kiểm thử trước phát hành

```powershell
npm run test:mobile
npm test
npx tsc --noEmit -p tsconfig.app.json
```

Ma trận thiết bị tối thiểu: Android API 24 và API 36 / WebView cũ và mới;
iPhone iOS 15+ và phiên bản hiện hành, iPad; màn hình nhỏ/landscape, font lớn.

1. Đăng nhập từng vai trò, mở lại app, hết hạn token, logout, đổi tài khoản và
   đổi doanh nghiệp; không lộ dữ liệu/notification của người trước.
2. Bắt đầu OAuth/email-confirm/reset trên điện thoại, chuyển qua ứng dụng mail,
   mở link khi app đang chạy và khi đã tắt. Link sai doanh nghiệp bị từ chối.
3. Nhân viên chỉ xem/sửa việc được phép; kiểm phòng → ảnh → gửi → người quản lý
   nhìn thấy; báo hỏng → phân công → hoàn tất → cập nhật liên quan.
4. Từ chối camera, hủy camera, chọn ảnh, mạng mất khi upload, app bị hủy lúc chụp.
5. Back khi có sheet/dialog, từ màn chi tiết, từ trang gốc, khi bàn phím mở.
6. Mất mạng và mở lại mạng giữa một lần ghi: không báo thành công giả, không
   tự gửi lại check-in, thanh toán, xuất kho hoặc tạo yêu cầu.
7. Link QR cho khách dùng public domain và đúng workspace, không sinh link
   `capacitor://localhost`, `https://localhost` hoặc `10.0.2.2` cho production.
8. Tài khoản review store, chính sách riêng tư, xóa tài khoản/dữ liệu, khai báo
   Data Safety / App Privacy theo đúng dữ liệu app thực sự thu thập.

CI mobile có workflow chạy thủ công để build Android debug và iOS simulator
không ký. Cần cấu hình repository variables cho endpoint/public key; workflow
không tự upload store hay ký bằng tài khoản cá nhân.
