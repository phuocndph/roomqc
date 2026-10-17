# Kế hoạch cải thiện trải nghiệm mẫu nhập phòng

Ngày đánh giá: 2026-10-16. Trạng thái: đã triển khai trong mã nguồn, chờ thử
nghiệm thực tế với 3–5 người dùng mới trước khi kết luận ai cũng sử dụng dễ dàng.

## Căn cứ và kết luận

Đánh giá hai sheet của file tải từ ứng dụng sau sửa tương thích Excel, đối chiếu
bộ tạo mẫu, parser và dialog nhập. File đã mở bằng Microsoft Excel ở lượt trước;
lượt này chỉ đọc và dựng ảnh xem lại, không thay đổi workbook hay dữ liệu phòng.
Chưa thử với người dùng mới nên chưa thể kết luận ai cũng dùng được.

Ưu điểm: chữ đậm tương phản rõ; ba trường bắt buộc; danh sách chọn; thông tin
khách sạn đúng ngữ cảnh; sheet dữ liệu trống và ví dụ tách riêng; giữ mã 001.

Vấn đề đã phát hiện ở bản thu gọn trước:

- Bảy dòng đầu được cố định, gồm nhiều dòng cao, khiến cửa sổ Excel thấp chỉ còn
  rất ít dòng nhập. Thông tin liên hệ đang dài hơn nhu cầu của thao tác nhập phòng.
- Bảy cột hiển thị rộng; diện tích và ghi chú ít cần lúc thiết lập vẫn chiếm chỗ.
- Các cột bổ sung bị thu gọn; dấu + khó phát hiện. Người ít dùng Excel hiểu nhầm
  file thiếu giá, tiện nghi và các đặc điểm phòng.
- Hướng dẫn kéo dài đến dòng 33, chứa mã standard/deluxe, wifi;tv;minibar và từ
  booking/dorm. Câu “các dòng trống không được nhập” dễ bị hiểu là cấm để dòng trống.
- Một số loại giường chưa giải nghĩa rõ cho người không quen Queen/King/Twin.
- Chỉ có cảnh báo thiếu trường bắt buộc trong file; trùng mã trong file và nhập
  bằng cách dán có thể chỉ được phát hiện khi tải lên.
- Tầng 1–999 và bốn hạng cố định là giới hạn nghiệp vụ thật, không giải quyết bằng
  đổi tiêu đề hoặc thêm lựa chọn vào Excel.

## Thiết kế đề xuất

Giữ một file, hai sheet. Không tạo thêm wizard hoặc nhiều mẫu để người dùng lựa chọn.

### Sheet Danh sách phòng

- Thu gọn phần đầu xuống năm dòng: tên mẫu và khách sạn; mã/điện thoại; ba bước
  sử dụng ngắn; chú thích bắt buộc; tiêu đề bảng.
- Bắt đầu nhập từ dòng 6. Giữ tiêu đề và ba cột nhận diện Số phòng, Tầng, Hạng
  phòng khi cuộn để người dùng luôn biết đang sửa phòng nào.
- Hiển thị đủ 14 cột ngay khi mở file: số phòng, tầng, hạng, sức chứa, giường,
  diện tích, ghi chú, giá cơ bản/đêm, tiện nghi, ban công, cửa sổ, hút thuốc,
  hướng nhìn và trạng thái. Không dùng nhóm cột ẩn.
- Chia màu tiêu đề theo nhóm thông tin: nhận diện, sức chứa, giá, tiện nghi/đặc
  điểm và vận hành. Người dùng cuộn ngang để điền nhưng không phải tìm nút mở cột.
- Nền trắng, chữ đen/xám đậm; tiêu đề xanh dương đậm và trắng. Không dùng pastel
  làm tín hiệu bắt buộc. Viền ngang mảnh; màu đỏ chỉ dành cho lỗi.
- Cỡ chữ 11–12; không gộp ô trong dữ liệu; độ rộng đủ đọc tên cột ở mức zoom 100%.
- Giữ 200 dòng có định dạng và danh sách chọn. Khi thêm dòng, phải kiểm tra vùng
  validation/định dạng được mở rộng hoặc viết lại hướng dẫn theo hành vi thực tế.

### Sheet Hướng dẫn

- Đặt ba bước và ba phòng ví dụ đầy đủ 14 cột lên đầu.
- Ví dụ phải có mã 001 và hai hạng khác nhau trên cùng một tầng; chỉ tồn tại ở
  sheet hướng dẫn, không trở thành phòng thật khi tải lên.
- Đổi câu về dòng trống thành “Có thể để dòng trống; hệ thống sẽ tự bỏ qua”.
- Giữ tiếng Việt, bỏ mã nội bộ khỏi phần hướng dẫn phổ thông; giải thích Twin là
  hai giường đơn. Giữ các giá trị cũ tương thích trong parser.
- Phần tra cứu phía dưới nêu rõ trường nào được bỏ trống và mặc định được áp dụng.
- Thông tin khách sạn đầy đủ nằm ở cuối sheet; sheet nhập chỉ giữ thông tin nhận diện.
- Giá ghi rõ là giá cơ bản mỗi đêm được lưu trong hồ sơ phòng; Bảng giá có thể
  điều chỉnh theo ngày.
- Các giới hạn tầng và hạng đặt gần ví dụ, ngắn gọn, không hứa hỗ trợ chưa tồn tại.

## Thứ tự triển khai

1. Chỉnh bố cục và nội dung theo thiết kế trên, giữ đủ dữ liệu và trường nhập.
   Parser tiếp tục tìm tiêu đề theo tên để nhận cả mẫu cũ dòng 7 và mẫu mới dòng 5.
2. Đồng bộ danh sách chọn, nhãn loại giường và hướng dẫn giữa Excel và giao diện.
   Thêm đánh dấu trùng mã và thiếu trường ngay trong file bằng định dạng có điều kiện
   đơn giản. Kiểm tra dữ liệu khi tải lên vẫn là bước quyết định, vì dán có thể bỏ qua
   validation của Excel. Không tự suy tầng hoặc tự điền hạng chưa xác nhận.
3. Hoàn thiện phản hồi tải file: nêu số phòng đọc được, dòng/cột lỗi và cách sửa;
   phân biệt rõ lỗi đọc file với lỗi nhập từng phòng. Hiển thị mặc định quan trọng
   trước khi nhập để tránh người dùng tưởng ô trống có nghĩa là chưa thiết lập.
4. Kiểm chứng bằng Excel thực tế, bộ parser, bản Docker đang chạy, rồi thử với
   người mới sử dụng trước khi kết luận đạt mục tiêu dễ hiểu.

Ước lượng đợt UX này: 1–2 ngày công, tùy kết quả kiểm thử tương thích và người dùng.
Không bao gồm thiết kế lại hạng phòng/tầng hoặc chuyển nhập phòng sang transaction.

## Tiêu chí nghiệm thu

- Ở 1366×768, zoom 100%, các cột nhận diện và tối thiểu 10 dòng nhập hiển thị
  được; cuộn ngang xem được mọi thông tin mà ba cột nhận diện vẫn đứng yên.
- Người mới nhận ra nơi bắt đầu nhập, ba cột bắt buộc, giá và tiện nghi mà không
  cần biết tính năng nhóm cột của Excel. Thử với 3–5 người dùng đại diện; mục tiêu
  mỗi người hoàn thành 10 phòng trong 5 phút mà không có người hướng dẫn.
- File mở/lưu/mở lại bằng Excel không có thông báo sửa chữa; dropdown, filter và
  vùng cố định còn đúng.
- Nhập thử trên dữ liệu kiểm thử: mã 001, mã chữ, hai hạng cùng tầng, dòng trống,
  cột tùy chọn trống, giá 0, trùng mã, dán giá trị không hợp lệ và thêm dòng.
- Đọc đúng mẫu cũ và mới, mẫu đảo cột; không nhập ví dụ; lỗi chỉ đúng dòng Excel.
- Kiểm tra cả mẫu có địa chỉ/tên khách sạn dài và thông tin liên hệ thiếu.
- Không đổi cách tính giá, không làm mất trường, không ghi dữ liệu khách sạn thật
  chỉ để chứng minh giao diện Excel đã được cải thiện.

## Phần nghiệp vụ cần tách riêng

Nếu muốn hỗ trợ tầng Trệt/B1/Lửng, nhiều tòa có cùng số phòng, hạng riêng theo
khách sạn hoặc villa/dorm, phải triển khai hợp đồng dữ liệu và các màn sử dụng
liên quan. Không thêm lựa chọn vào mẫu trước khi luồng tạo phòng, lọc, đặt phòng
và tính giá hiểu đúng các giá trị đó. Đây là đợt mở rộng riêng theo
[kế hoạch nghiệp vụ hiện có](./room-setup-excel-plan.md), không gộp vào đợt làm gọn mẫu.
