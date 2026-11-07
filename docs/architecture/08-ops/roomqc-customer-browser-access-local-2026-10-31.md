# Kiểm tra tài khoản khách sạn và nhân viên trên giao diện local

Ngày: 31/10/2026. Phạm vi: bộ backend mới biệt lập trên máy local, không thay
VPS Contabo và không mở đăng ký production.

## Kết quả đã xác nhận

Lượt `39c70fe6194d` dựng đủ 591 migration, chạy 91/91 kiểm tra luồng native
đăng ký, xác nhận email qua SMTP thử, cấp workspace, tạo phòng, lời mời nhân
viên, nhận lời mời và đăng nhập mới. Các kiểm tra cũng bao gồm đáp ứng bị mất
sau commit, replay, quyền nhân viên và cô lập REST/RPC, Storage, Realtime giữa
hai khách sạn. Bộ gọi lời mời và đổi mật khẩu được biên dịch từ mã sản phẩm;
không dùng đường tắt tạo profile/quyền nhân viên để thay cho luồng nhận lời mời.

Sau đó đã thao tác trên giao diện thật bằng chính các tài khoản vừa tạo:

| Tình huống | Kết quả |
| --- | --- |
| Chủ khách sạn A đăng nhập | Đúng doanh nghiệp A, ba phòng 101/102/103 |
| Nhân viên buồng phòng A đăng nhập | Vào trang công việc buồng phòng; không có menu quản lý tài khoản |
| Nhân viên nhập trực tiếp đường dẫn quản lý tài khoản | Hiện Không có quyền truy cập |
| Chủ khách sạn B đăng nhập tại địa chỉ A | Chặn nội dung A; giải thích rõ tài khoản không thuộc doanh nghiệp này |
| Chọn doanh nghiệp khác từ thông báo | Mở form chọn doanh nghiệp, chọn B và đăng nhập thành công |
| Chủ khách sạn B sau đăng nhập đúng địa chỉ | Đúng doanh nghiệp B, chỉ phòng 201 |
| Nhãn gói ở sidebar | Dùng thử; không còn số 0 phòng dễ bị hiểu nhầm là phòng thực tế |

Không vào ca hoặc thay dữ liệu nghiệp vụ qua browser. Khi kết thúc, bộ thử
đối chiếu các phiên Auth mới cho cả ba tài khoản, cùng snapshot dữ liệu nghiệp
vụ và quyền nhân viên không đổi. Có một phiên chủ B tại địa chỉ A và một phiên
đăng nhập lại tại B; việc có phiên Auth không đồng nghĩa được phép vào A.

Parent runner thoát 0, kiểm lại source binding và schema, dọn 15 đối tượng
Docker sở hữu riêng. Kiểm độc lập sau dọn: container, network và volume của
lượt thử đều 0. Tài khoản/mật khẩu thử không được đưa vào artifact; mật khẩu
chỉ ở bộ nhớ tiến trình thử và phiên trình duyệt đã được đóng.

## Lỗi tìm được và đã sửa

Trước sửa, đăng nhập nhầm doanh nghiệp đã bị chặn dữ liệu nhưng giao diện báo
chung lỗi tải tài khoản/kết nối. Đã phân loại lỗi xác nhận workspace và truyền
nguyên nhân đến màn hình thông báo. Người dùng thấy **Tài khoản không thuộc
doanh nghiệp này**, nút chọn doanh nghiệp khác và đăng xuất. Không tự thử lại
lỗi xác định này; lỗi đường truyền vẫn có một lần thử lại có giới hạn.

Sidebar đổi mã `free_trial` sang nhãn Dùng thử và chỉ hiện số phòng đăng ký
dương với nhãn rõ nghĩa. Không thay quota hoặc chính sách gói.

21/21 bài kiểm tra hook/callback, 6/6 bài kiểm tra phạm vi bộ thử, TypeScript,
ESLint phần thay đổi và kiểm khoảng trắng đều đạt. Build frontend và
`verify:build` đạt; vẫn có cảnh báo chunk lớn sẵn có. Bản sửa đã thay riêng
frontend local 8082, giữ image quay lui; container khỏe, API sẵn sàng, truy cập
quản trị không đăng nhập bị từ chối và các container khác giữ nguyên.

## Cách chạy lại

`npm run test:customer-browser-access:local`

Mở origin loopback do runner in ra, lấy tài khoản có sẵn từ hộp thư thử, đăng
nhập cả ba tài khoản trên UI và bấm Kết thúc kiểm thử. Chỉ chạy lệnh hoặc chỉ
có ảnh chụp không thay cho xác nhận phiên và đối chiếu dữ liệu cuối lượt.

## Giới hạn nghiệm thu

- Lượt này kiểm browser đăng nhập/phân quyền/chọn doanh nghiệp; màn hình nhận
  lời mời và nhập mật khẩu không được thao tác bằng browser. Hai bước đó đã
  chạy qua bộ gọi sản phẩm và Auth thật trong phần native.
- Không phải kiểm toàn bộ module, toàn bộ vị trí nhân viên, Android hoặc tải.
- SMTP được giữ trong bộ thử; không có bằng chứng email đến nhà cung cấp ngoài.
- Số đo dùng để cho phép bộ thử là điều kiện tổng hợp, không phải dung lượng
  VPS. Không dùng kết quả này để mở signup production hoặc hạ ngưỡng ổ trống.
- Chưa nghiệm thu control plane hoạt động liên tục trên VPS, cài toàn stack
  RoomQC qua SSH, backup ngoài máy, phục hồi VPS, tải/soak hoặc pilot khách thật.

Biên nhận đã lọc: [browser access](../../../artifacts/roomqc-customer-browser-access-local-2026-10-31.json).
Bản local: [frontend deployment](../../../artifacts/roomqc-customer-access-web-local-deployment-2026-10-31.json).
Ảnh [thông báo sau sửa](../../../artifacts/roomqc-browser-access-workspace-mismatch-after-2026-10-31.jpg),
[nhân viên bị chặn](../../../artifacts/roomqc-browser-access-staff-denied-after-2026-10-31.jpg),
[khách sạn B](../../../artifacts/roomqc-browser-access-second-owner-after-2026-10-31.jpg).
