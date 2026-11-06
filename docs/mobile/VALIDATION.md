# Kiểm chứng RoomQC mobile 0.1.0 — 15/10/2026

## Đã kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Vitest toàn dự án (chạy lại 22:35 ngày 15/10) | 302 đạt, 16 bỏ qua, 35 file đạt / 2 file bỏ qua |
| Nhóm mobile cuối cùng | 45/45 đạt: PKCE/deep link, kho phiên bảo mật, HTTP directory, lifecycle/Back, mất mạng, cấu hình release |
| TypeScript ứng dụng | Đạt, `tsc --noEmit -p tsconfig.app.json` |
| Build web production | Đạt; service worker web vẫn được tạo |
| Build giao diện mobile | Đạt, không đăng ký service worker |
| Đồng bộ Capacitor | Android và iOS SPM, 6 plugin |
| Chặn phát hành nhầm bản local | Đạt: `mobile:verify:release` từ chối artifact HTTP/emulator |
| Giao diện đăng nhập trên trình duyệt 390 × 844 | Hiển thị được; đây là kiểm tra responsive, không phải kiểm tra native |
| Logo / màn hình khởi động | Đã thay hình mặc định Capacitor bằng logo RoomQC |
| Android native build | Đạt: `assembleDebug`, 277 tác vụ; APK 31.861.557 byte |
| Chữ ký APK | `apksigner verify` đạt, APK Signature Scheme v2 |
| Manifest APK | `com.roomqc.app`, 0.1.0, min API 24, target API 36, debug; Internet/network/camera |
| Nội dung APK | Đã đọc marker/config trong ZIP: đúng backend emulator, localDevelopment=true |
| Cú pháp dự án Xcode | Parser đọc được pbxproj; chưa phải kết quả biên dịch iOS |
| Android Emulator | Đã cài emulator chính thức Google, Android 16/API 36 x86_64; WHPX hoạt động |
| Cài / mở native | `adb install -r` thành công; `com.roomqc.app/.MainActivity` là activity đang mở |
| Màn hình native | Đã nhìn thấy form đăng nhập, chụp `artifacts/mobile/android-login.png`; log lỗi process lúc kiểm tra không có lỗi |

Các test native dùng mock plugin. Kết quả này không chứng minh camera, kho khóa
hệ điều hành hoặc OAuth thực tế đã hoạt động trên điện thoại.

## APK đã tạo

File hiện tại: `artifacts/mobile/roomqc-debug.apk` (tính từ thư mục dự án), đã build lại ngày 16/10 sau bản sửa popup. Các dòng kiểm chứng ngày 15/10 ở trên là kết quả lịch sử; báo cáo bản mới ở `promo-popup-validation.md`.

SHA-256:

```text
89d01394e0119edbb75cbaafe81b1c63c7f7fa37ee24ba2b45fe157520c65dad
```

APK ký debug dùng cho Android emulator, không phải bản ký phát hành. Khi đã
mở emulator và `adb devices` hiển thị thiết bị, cài bằng `adb install -r`
với đường dẫn file APK. Supabase local trên máy tính phải đang chạy.

## Giới hạn bản nội bộ

Cấu hình hiện tại dành Android emulator: backend `http://10.0.2.2:54321`, web
`http://10.0.2.2:8082`, directory và demo seeding bị tắt. Không dùng địa chỉ này
trên điện thoại thật hoặc phát hành cho khách hàng.

Đã chạy trên máy ảo `RoomQC_API_36`, serial `emulator-5556`; chưa đăng nhập
để kiểm tra luồng nghiệp vụ hoặc xác nhận kho khóa/camera/OAuth thực tế.
Chưa kiểm thử điện thoại Android thật. iOS mới có mã nguồn;
chưa biên dịch, ký hay chạy vì máy hiện tại dùng Windows. Chưa chạy workflow
mobile trên GitHub, chưa upload TestFlight/Google Play.

Lần khởi động đầu mất khoảng 137 giây. Không cần thay đổi tính năng Windows,
không reset dữ liệu local và không thay đổi các container dự án khác.
Mở lại từ thư mục dự án bằng `npm run mobile:emulator`; launcher giữ dữ liệu
cài sẵn và từ chối dùng cổng 5556 nếu cổng thuộc máy ảo khác.

## Công việc trước khi phân phối

1. Chọn domain HTTPS/API thật và cấu hình redirect Auth, OAuth, CORS đúng cho
   native; build lại bằng `.env.mobile.local` và qua gate release.
2. Kiểm thử các luồng nghiệp vụ theo ma trận trong README trên Android/iPhone
   thật: phân quyền, đổi doanh nghiệp, camera, Back, bàn phím, hết hạn phiên,
   chuyển nền, mất mạng, upload và xuất file.
3. Triển khai FCM/APNs nếu cần thông báo lúc app đóng. Phiên bản này chỉ giữ
   thông báo trong ứng dụng; không giả lập Web Push trong WebView.
4. Rà soát bundle vendor lớn và dependency audit trước release. Build thành
   công không có nghĩa toàn bộ dependency đã sạch cảnh báo.
5. Chuẩn bị signing, tài khoản Apple/Google, tài khoản review, chính sách riêng
   tư, xóa tài khoản và khai báo dữ liệu thực tế rồi mới gửi xét duyệt.

Không có migration hoặc thay đổi dữ liệu khách sạn trong hạng mục mobile này.
