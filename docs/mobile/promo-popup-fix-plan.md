# Kế hoạch chặn popup chương trình chuyển đổi số lặp lại

Trạng thái: đã triển khai bản sửa và kiểm tra tự động/server local. Kết quả Android được ghi riêng trong `promo-popup-validation.md`.
Ngày lập: 16/10/2026. Phạm vi: web và ứng dụng Android RoomQC.

## 1. Kết quả rà soát

Các điểm sau được xác nhận từ mã nguồn, chưa phải kết quả tái hiện E2E trên tài khoản người dùng:

| Điểm | Bằng chứng | Hậu quả |
| --- | --- | --- |
| Hai nguồn popup cùng được gắn vào layout | `MainLayout.tsx` gắn cả `AnnouncementHost` và `FreeTrialPopup` | Chưa có bộ điều phối để ngăn hai dialog chồng lên nhau hoặc xuất hiện nối tiếp |
| Đóng popup chỉ nhớ trong component | `AnnouncementHost.tsx`: `closedPopups` là React state | Việc remount, tải lại trang hoặc mở lại ứng dụng làm mất lịch sử đóng |
| Popup dự phòng không nhớ nút Đã hiểu | `FreeTrialPopup.tsx`: chỉ lưu khi tích Không hiển thị lại | Điều kiện hiển thị chạy lại có thể lên lịch mở cùng chương trình tiếp |
| Nhầm giữa không có chương trình và đã ẩn chương trình | `useActiveAnnouncements` loại các ID đã dismiss; `FreeTrialPopup` dùng danh sách đã lọc để tính `hasDbPromo` | Dismiss thông báo từ DB có thể kích hoạt lại popup dự phòng có cùng nội dung |
| Chưa chờ dữ liệu thông báo tải xong | `FreeTrialPopup` coi dữ liệu chưa có là danh sách rỗng | Mạng chậm có thể cho popup dự phòng mở trước thông báo thật; điều kiện đổi sang có DB promo cũng chưa đóng popup đang mở |
| Lựa chọn ẩn dự phòng dùng khóa chung | `free_trial_popup_dismissed`, không chứa user/workspace | Người dùng khác trên cùng trình duyệt có thể bị ảnh hưởng |
| Lỗi đọc lịch sử ẩn bị bỏ qua | Hook chỉ kiểm tra lỗi truy vấn thông báo, không kiểm tra lỗi truy vấn dismissals | API lỗi có thể khiến thông báo đã ẩn bị xem là chưa ẩn |
| Kiểm thử cũ chưa bao phủ vòng đời thật | Test hiện tại mock hook và chỉ rerender cùng component | Chưa kiểm tra remount, hai nguồn popup, ghi DB lỗi, đóng/mở Android |

## 2. Quy tắc sản phẩm đề xuất

1. Popup chương trình là thông tin chào mừng: cùng một chương trình chỉ tự mở một lần cho một tài khoản trong một workspace. Không tự nhắc lại hằng ngày.
2. Nhấn **Đã hiểu, bắt đầu sử dụng** hoặc nút đóng hợp lệ ghi nhận đã đọc chương trình. Không bắt người dùng tích thêm một ô mới được ngừng nhắc.
3. Không mở lại khi chuyển trang, refetch, đổi khách sạn trong cùng workspace, đăng nhập lại cùng tài khoản, tải lại web hoặc khởi động lại app.
4. Giữ điều kiện đối tượng và thời gian của thông báo quản trị. Không thay đổi quyền truy cập hay gói sử dụng trong bản sửa này.
5. Thông báo hệ thống và cập nhật phiên bản giữ quy tắc riêng; không bị ẩn theo chương trình quảng bá.
6. Chỉnh chính tả hoặc ngày cập nhật không làm hiện lại chương trình cũ. Một chương trình mới cần ID mới do quản trị chủ động tạo.
7. Không nối một chuỗi popup quảng bá sau khi người dùng vừa đóng. Thông tin chương trình cần có chỗ xem lại trong trang gói sử dụng.

Giới hạn: trước khi lần ghi nhận đầu tiên được đồng bộ lên server, một thiết bị khác chưa thể biết việc đóng ở thiết bị đang mất mạng. Bản sửa phải giữ trạng thái trên thiết bị hiện tại và thử đồng bộ lại khi có mạng.

## 3. Thứ tự triển khai

### Bước 1 — Bỏ nguyên nhân hiển thị trùng (P0)

- Dùng `AnnouncementHost` làm nguồn điều phối popup duy nhất.
- Bỏ `FreeTrialPopup` khỏi `MainLayout`. Xác nhận chương trình cần dùng đã có trong cấu hình quản trị; nếu không có thì không tự bật nội dung hardcode.
- Không dùng danh sách đã lọc dismiss để suy luận hệ thống có chương trình hay không.
- Chỉ chọn popup sau khi user, workspace, subscription và thông báo/lịch sử ẩn đã tải thành công. Khi tải lỗi: không bật popup quảng bá.
- Hủy timer khi mất điều kiện hiển thị, đổi tài khoản, chuyển workspace hoặc thông báo bị tắt/hết hạn.
- Tách rõ xử lý promo khỏi system notice/version update; mỗi thời điểm chỉ một popup của bộ điều phối này.

Tệp chính: `MainLayout.tsx`, `AnnouncementHost.tsx`, `FreeTrialPopup.tsx`.

### Bước 2 — Ghi nhận bền vững và đồng bộ (P0)

- Đóng promo ghi nhận ngay tại máy trước khi chờ mạng; lọc ngay khỏi cache hiển thị.
- Lưu khóa theo backend/workspace + user ID + announcement ID; không dùng tên popup hay `updated_at` làm định danh.
- Dùng bảng `announcement_dismissals` hiện có để lưu theo tài khoản trên server. Trước mắt không cần bảng mới nếu xác nhận schema/RLS thực tế phù hợp.
- Thao tác ghi phải idempotent: bấm nhiều lần không tạo lỗi, không gửi nhiều yêu cầu không cần thiết. Kiểm tra mã lỗi thay vì so chuỗi chữ `duplicate`.
- Kiểm tra cả lỗi đọc dismissals. Không xem lỗi đọc là người dùng chưa đọc chương trình.
- Ghi lỗi: giữ ẩn tại máy, lưu trạng thái chờ đồng bộ theo đúng tài khoản/workspace; chỉ thử lại có giới hạn khi mạng phục hồi hoặc lần đăng nhập phù hợp tiếp theo.
- Đồng bộ cache/tab bằng cơ chế storage/subscription phù hợp; không giữ trạng thái React cũ của tài khoản trước sau khi đổi user.
- Giá trị `free_trial_popup_dismissed` cũ không có danh tính: không chuyển thành ghi nhận server cho mọi tài khoản. Loại bỏ đường đọc khóa chung khi bỏ fallback; đối chiếu dữ liệu dismiss hiện có để tránh nhắc lại ngoài ý muốn.

Tệp chính: `useActiveAnnouncements.ts`, `AnnouncementHost.tsx`, `AnnouncementPopup.tsx`; thêm tiện ích lưu trạng thái promo và test tương ứng.

### Bước 3 — Đơn giản hóa thao tác (P1)

- Promo chỉ cần nút Đã hiểu rõ ràng; bỏ checkbox Không hiển thị lại ở loại popup này vì thao tác đóng đã có ý nghĩa đó.
- Giữ lựa chọn ẩn theo quy tắc riêng cho các loại thông báo khác.
- Reset state của popup khi ID thay đổi; không để lựa chọn của thông báo A áp vào B.
- CTA phải ghi nhận đóng trước khi điều hướng, tránh tải trang mới trước khi lưu.
- Kiểm tra trang Gói sử dụng có thông tin chương trình để người dùng xem lại; bổ sung điểm truy cập nếu còn thiếu.

Tệp chính: `AnnouncementPopup.tsx`, trang subscription nếu cần.

### Bước 4 — Kiểm thử và đưa bản sửa vào máy ảo (P0 trước bàn giao)

| Tình huống | Kết quả bắt buộc |
| --- | --- |
| Tài khoản phù hợp chưa đọc | Chỉ một popup, đúng nội dung từ cấu hình |
| Nhấn Đã hiểu, chuyển nhiều trang, Back/Forward | Không mở lại |
| Unmount/remount layout, refresh, đăng nhập lại | Cùng tài khoản/workspace không mở lại cùng chương trình |
| Đóng app Android hoàn toàn rồi mở lại, đưa nền rồi mở lại | Không mở lại |
| Thông báo và subscription về chậm/khác thứ tự | Không có popup hardcode xuất hiện trước hoặc sau |
| Refetch hoặc Realtime cập nhật cùng ID | Không mở lại; không bật chuỗi quảng bá ngay sau khi đóng |
| Chọn Không hiển thị lại ở dữ liệu cũ | Không có fallback thay thế |
| API đọc/ghi lỗi, offline rồi online | Không lặp tại máy; chỉ đồng bộ lại cho đúng user/workspace |
| Tài khoản B hoặc workspace khác trên cùng thiết bị | Không thừa hưởng trạng thái của A |
| Một user có hai thiết bị online | Sau khi ghi server thành công và thiết bị kia đọc lại trạng thái, không hiện lại |
| Promo mới có ID mới | Được xét theo điều kiện và quy tắc hiển thị mới; chương trình cũ vẫn ẩn |
| Thông báo hệ thống, phiên bản, banner | Không mất chức năng và không bị quy tắc promo ẩn nhầm |
| Tắt chiến dịch hoặc logout trong lúc timer chờ | Không mở popup trễ |

- Thêm test hồi quy thật cho component, hook và lưu trạng thái; test cũ chỉ là baseline.
- Chạy test liên quan, TypeScript và build web/mobile.
- Kiểm tra tích hợp local: đọc/ghi dismiss bằng quyền user, không dùng service role để kết luận RLS của user đã đúng.
- Build lại APK local, cài đè giữ dữ liệu, xác nhận bằng máy ảo RoomQC. APK hiện tại chứa bundle riêng nên reload trang web không cập nhật app Android.
- Ghi kết quả thực tế theo từng tình huống; mục chưa chạy phải đánh dấu chưa kiểm tra, không tuyên bố đã hết lỗi chỉ vì unit test xanh.

## 4. Điều kiện hoàn thành

- Chỉ còn một nguồn popup chương trình trong layout.
- Nhấn Đã hiểu một lần là đủ; cùng chương trình không lặp ở các vòng đời đã kiểm tra.
- Không làm ẩn nhầm thông báo của tài khoản/workspace khác và không mất thông báo hệ thống.
- Có bằng chứng test tự động, kiểm tra local server và kiểm tra APK mới trên máy ảo.

Không nằm trong đợt này: xây lại toàn bộ hệ thống marketing, thay đổi gói subscription, phát hành Play Store hoặc deploy VPS.
