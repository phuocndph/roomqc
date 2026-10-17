# Khách hàng, Đặt phòng, Nhân sự và Hóa đơn — 17/10/2026

## Kết quả triển khai

Bản local chạy trên `http://localhost:8082`. Không triển khai lên VPS, không push GitHub, không thay schema/quyền database, không xóa hoặc nhập dữ liệu nghiệp vụ. Giữ nguyên các file Kho đang được chỉnh riêng.

- Khách hàng: báo lỗi và thử lại độc lập cho danh sách/thống kê; không diễn giải lỗi thành danh sách trống hoặc số 0. Nút xuất CSV lấy toàn bộ kết quả theo bộ lọc lúc bắt đầu, có tiến độ/hủy; không tải file dở dang khi một trang API thất bại. Hủy xuất khi đổi doanh nghiệp hoặc rời trang. CSV được escape và chống diễn giải chuỗi người dùng thành công thức.
- Khách hàng: bỏ giới hạn đọc 1.000 hồ sơ khi lọc sinh nhật và 5.000 hồ sơ khi thống kê. Sinh nhật phân trang theo đúng số kết quả, dùng lại cache khi đổi trang. Danh sách thường vẫn phân trang API 50 hồ sơ.
- Đặt phòng: thay giới hạn cắt 500/1.000 dòng bằng đọc API từng lô, có thứ tự ổn định. Bổ sung phạm vi doanh nghiệp trên mỗi truy vấn, giữ phạm vi khách sạn và logic ngày/trạng thái hiện có. Không mang danh sách cũ sang doanh nghiệp/khách sạn/bộ lọc mới trong lúc tải.
- Đặt phòng: hiển thị 50 dòng mỗi trang ở desktop/mobile; thống kê, tìm kiếm và sắp xếp ưu tiên vẫn dựa trên toàn bộ kết quả tải được. Đổi bộ lọc trả về trang đầu, dữ liệu giảm thì điều chỉnh trang hợp lệ. Các thao tác vẫn nhận đúng đối tượng booking.
- Nhân sự: báo lỗi/thử lại riêng cho danh sách và hoạt động, ẩn số liệu không xác nhận được. Giữ quyền truy cập Công việc/Ca làm việc. Mobile hiển thị bốn tab thành lưới hai hàng để không phải cuộn ngang tìm tab.
- Hóa đơn: báo lỗi/thử lại riêng cho phiếu thu và yêu cầu VAT, không hiển thị số 0 hoặc trạng thái trống gây hiểu nhầm khi lỗi. Khóa xuất Excel khi lỗi/đang tải. Đổi nhãn “Đã in” thành “Đã xuất”, “Còn nợ (nháp)” thành “Phiếu nháp” để phản ánh đúng trạng thái được đếm, không diễn giải nhầm là công nợ thực.

Hướng dẫn Supabase được áp dụng để giữ phạm vi tenant/hotel, RLS hiện có và thứ tự phân trang ổn định. Không đưa khóa đặc quyền vào frontend.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Bộ unit/component đầy đủ, chạy lại sau chỉnh sửa cuối | 526 đạt; 16 integration bỏ qua trong lệnh này |
| Regression bổ sung cho đợt này | 41 test trong 8 file mới; nằm trong 526 test trên |
| `npm run test:integration` | 16 đạt; kiểm tra hợp đồng/RPC local, không phải E2E nghiệp vụ đầy đủ |
| TypeScript app | Không có lỗi |
| ESLint các file thay đổi | 0 error; vẫn có warning `any` cũ, không tuyên bố toàn repo không warning |
| `git diff --check` phạm vi thay đổi | Không có lỗi whitespace |
| Docker build | Đạt; có validate môi trường, build và verify-build trong Dockerfile |
| Container local | Verify HTTP/cache/security headers đạt; health check đạt |

Regression bao gồm 1.207 booking/khách giả lập, thống kê 5.001 khách giả lập, máy chủ trả ít dòng hơn kích thước lô, lỗi ở lô sau, ID trùng, hủy yêu cầu, lọc sinh nhật ngoài 1.000 dòng đầu, thay tenant không hiển thị dữ liệu cũ, hủy export khi đổi tenant, quyền thao tác và booking chính xác trên trang mobile tiếp theo.

## Kiểm tra trình duyệt thật

- Reload bản Docker mới; truy vấn Khách hàng, Đặt phòng và Hóa đơn trả về giao diện thành công trong phiên chủ doanh nghiệp hiện có. Dữ liệu ở phạm vi đang mở hiện trống, không tự tạo dữ liệu để tô đẹp kết quả.
- Chặn tạm request `guests` chỉ trong tab kiểm thử: cả danh sách lẫn thống kê hiển thị lỗi, không còn tổng số gây hiểu nhầm; nút CSV bị khóa. Gỡ chặn rồi bấm hai nút Thử lại: tải lại thành công. Đã xóa quy tắc chặn sau kiểm tra.
- Nhân sự tải được một hồ sơ thực. Mobile xác nhận bốn tab đều nằm trong viewport, không bị giấu sau vùng cuộn ngang.
- Khách hàng/Đặt phòng kiểm tra ở viewport điện thoại: chiều rộng trang không vượt viewport. Viewport thử nghiệm đã trả về mặc định.
- Hóa đơn bản cuối xác nhận hai nhãn “Đã xuất” và “Phiếu nháp”. Không xuất/hủy/nhân bản hóa đơn, không thanh toán trong kiểm tra browser.

Ảnh bằng chứng ở `artifacts/ux-review/`: `guests-connection-retry.jpg` (lúc giả lập mất kết nối), `guests-desktop-2026-10-17.jpg`, `guests-mobile-2026-10-17.jpg`, `bookings-mobile-2026-10-17.jpg`, `staff-mobile-2026-10-17.jpg`.

## Giới hạn và bước nghiệm thu tiếp theo

1. Đặt phòng và thống kê/sinh nhật Khách hàng hiện đọc API theo lô rồi xử lý tập kết quả trong trình duyệt. Đây không phải phân trang/tổng hợp hoàn toàn phía server, không phải snapshot giao dịch và không phải bằng chứng đáp ứng 100.000 người dùng đồng thời. Với tập dữ liệu lớn cần server aggregate/search/cursor và đo tải thực.
2. Mới xử lý trạng thái lỗi của Hóa đơn trong đợt này; truy vấn hóa đơn hiện hữu chưa được chuyển thành tìm kiếm/phân trang/tổng hợp server cho dữ liệu lớn.
3. Cần E2E với dữ liệu nghiệp vụ được chuẩn bị riêng: đặt phòng → check-in → dịch vụ/phụ thu → thu tiền → check-out → phiếu thu; đổi phòng, đoàn, hủy/no-show/hoàn tiền. Đối soát số liệu báo cáo với các giao dịch đó, kiểm tra nhiều vai trò/khách sạn và các trường hợp gián đoạn.
4. Cần kiểm thử riêng dịch vụ ngoài production (email/AI/OCR/push), tải đồng thời, backup/restore và giám sát trên môi trường triển khai. Không suy ra các phần đó đã đạt chỉ từ bộ test local hiện tại.

Kết luận: hoàn tất nhóm sửa lỗi danh sách/trạng thái tải và khả năng thao tác được nêu trên; chưa nghiệm thu toàn bộ sản phẩm hoặc toàn bộ E2E.
