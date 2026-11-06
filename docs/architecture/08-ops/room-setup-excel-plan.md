# Kế hoạch thiết lập phòng bằng Excel linh hoạt

Ngày: 2026-10-16. Trạng thái: phương án mở rộng để tham khảo; chưa triển khai.

## Quyết định mới của người dùng: tái sử dụng Quản lý phòng

Người dùng chọn cách đơn giản: liên kết “Thiết lập phòng ban đầu” mở `/rooms`,
dùng chức năng nhập hàng loạt bằng Excel đang có. Route `/setup/rooms` cũ chuyển
hướng về `/rooms`; bỏ nút mở wizard riêng trên trang phòng và dùng chung dialog
nhập Excel cho desktop/mobile. Khi nhập xong, cập nhật lại checklist thiết lập.
Sửa trạng thái mặc định của mẫu/import từ `vacant` sang `vacant_clean`; tương thích
giá trị `vacant` trong file mẫu cũ tại hook ghi phòng.

Quyết định này thay thế lộ trình xây importer/wizard mới bên dưới ở thời điểm này.
Các mở rộng hạng tùy biến, tầng chữ, migration và atomic import vẫn là đề xuất,
không phải tính năng đã được thực hiện bởi thay đổi liên kết. Bộ nhập hiện tại
vẫn dùng cấu trúc mẫu cũ và báo kết quả thành công/thất bại theo từng phòng.

### Cải thiện mẫu sau quyết định tái sử dụng

Mẫu tải từ Quản lý phòng được bổ sung tên/mã, địa chỉ, điện thoại và email của
khách sạn đang chọn. Hai sheet hiển thị: `Danh sách phòng` và `Hướng dẫn`; sheet
nhập để trống, ví dụ nằm riêng. Header dòng 7, dữ liệu từ dòng 8; bảy cột chính,
bảy cột bổ sung thu gọn bằng nhóm cột, dropdown tiếng Việt và định dạng mã văn bản.
Parser nhận diện header thay vì giả định dòng 1, hỗ trợ tên cột/mã của file cũ,
giữ dòng nguồn để báo lỗi đúng và từ chối dữ liệu sai/công thức/trùng mã trong file.
Hai khách sạn khác nhau tải đúng thông tin riêng; đổi khách sạn reset dialog.

Giá trong mẫu được gọi là `Giá tham khảo (đ)` để thể hiện đúng cơ chế hiện tại:
chỉ lưu `rooms.base_price`, không thiết lập `room_type_rates` hay lịch giá bán.
Trạng thái khách đang ở không được tạo bằng nhập danh mục phòng; cần tạo booking.
15 kiểm thử serializer/parser được bổ sung trong `src/lib/rooms/importWorkbook.test.ts`.
Lỗi Excel loại bỏ sheet dữ liệu đã xác định ở ExcelJS: `outlinePr` được xuất sau
`pageSetUpPr`, sai thứ tự OOXML. Mẫu dùng vị trí nhóm cột mặc định để tránh lỗi này;
kiểm thử kiểm tra trực tiếp thứ tự XML thay vì chỉ đọc lại bằng cùng thư viện.
Các giới hạn bốn hạng, tầng số và cách ghi từng phòng chưa được thay bằng mô hình
linh hoạt/atomic trong kế hoạch mở rộng bên dưới.

Thay hướng sinh phòng theo tầng trong bước thiết lập ban đầu bằng nhập danh sách
phòng từ Excel. Ưu tiên ít thao tác, hạng phòng tùy biến và dữ liệu dùng được ngay
trong sơ đồ, đặt phòng, tính giá và vận hành. Không thay đổi mã nguồn hay dữ liệu
vận hành trong đợt lập kế hoạch này.

## 1. Kết luận khảo sát hiện trạng

| Thành phần | Hiện tại | Hệ quả với yêu cầu mới |
|---|---|---|
| Wizard `src/lib/rooms/setup.ts`, `src/pages/setup/RoomSetupPage.tsx` | Sinh một lô theo tầng và một hạng; sửa hạng từng dòng được; tối đa 200 phòng; tầng số nguyên dương | Một tầng đã có thể chứa nhiều hạng, nhưng thiết lập hỗn hợp mất công; không phù hợp trệt/lửng/khu villa |
| Migration `20261015133049_hotel_setup_rooms.sql` | Chỉ nhận standard/deluxe/suite/vip; cùng hạng phải cùng giá; chỉ cho khách sạn chưa có phòng | Không thể mở rộng bằng cách sửa giao diện Excel đơn thuần |
| `BulkImportRoomsDialog.tsx` | Có mẫu Excel, nhận tiêu đề cứng, bắt buộc tầng, chưa tạo/ghép hạng tùy biến; mặc định trạng thái `vacant` | Trạng thái mặc định không còn hợp lệ với constraint DB; thiếu kiểm tra dữ liệu nghiệp vụ |
| `useBulkCreateRooms.ts` | Kiểm tra và chèn từng phòng tuần tự; lỗi có thể để lại phần đã nhập | Nhập lại dễ trùng; người dùng khó biết đã xong đến đâu |
| `excelUtils.ts` | Đọc sheet đầu tiên; bỏ dòng trống; đọc cả kết quả cache của công thức | Chọn sai sheet và báo sai dòng lỗi sau dòng trống; cần chính sách công thức rõ ràng |
| Schema local đã đối chiếu | `rooms.room_type` bị CHECK bốn mã, chưa có FK `room_type_id`; `floor` là số; mã phòng unique theo hotel; mã hạng unique theo tenant | Cần migration dữ liệu, khóa tham chiếu đúng hotel và vị trí linh hoạt |
| `useRoomTypes.ts`, `useRoomTypePricing.ts`, `usePricingDaily.ts` | Còn ghép hạng theo tên/mã và có truy vấn chỉ lọc tenant | Có nguy cơ nhầm hạng/giá giữa hai khách sạn; phải chuyển các luồng liên quan sang ID |

Giữ lại những bảo đảm tốt của wizard mới: nháp có phiên bản, kiểm tra quota phía
server, tạo trong transaction, request ID chống tạo lặp và khôi phục sau mất mạng.
Không giữ lại bộ nhập từng phòng làm đường ghi dữ liệu song song.

## 2. Nguyên tắc nghiệp vụ

1. Một dòng là một đơn vị lưu trú bán độc lập: phòng, căn hộ, villa, bungalow…
2. Vị trí và hạng là hai thông tin độc lập. Một tầng có nhiều hạng; một hạng có
   thể nằm ở nhiều tầng, nhiều khu.
3. Hạng do khách sạn tự đặt; không ép về bốn lựa chọn tiếng Anh hiện tại.
4. Chỉ bắt buộc mã/số phòng và hạng phòng. Tầng, khu, giá, sức chứa có thể bổ sung
   sau; thiếu cấu hình phải hiển thị đúng là thiếu, không sinh thông tin giả.
5. Không suy tầng từ số phòng, không tự đổi 001 thành 1, không mặc định mọi villa
   có sức chứa hai người.
6. Hạng giữ thông số chung; phòng chỉ điền ngoại lệ cần thiết. Không yêu cầu nhập
   giá giống nhau hàng trăm lần.
7. Một lần nhập thuộc một khách sạn được chọn trên giao diện. File không chứa
   tenant ID, hotel ID, cụm dữ liệu hay tài khoản nhân viên.
8. Một bản xem trước và một nút nhập là đủ; chỉ hỏi thêm khi có sự mơ hồ thực sự.

### Phạm vi đáp ứng theo loại hình

| Mô hình | Đợt này | Điều kiện |
|---|---|---|
| Khách sạn, nhà nghỉ, homestay cho thuê phòng | Có | Mỗi phòng là một dòng; hạng và tầng tùy ý |
| Nhiều tòa/khu, resort nhiều bungalow | Có | Mã phòng duy nhất trong khách sạn, có khu/tòa để lọc |
| Căn hộ, villa cho thuê nguyên căn | Có | Mỗi căn bán độc lập là một dòng; tầng không bắt buộc |
| Dorm bán từng giường | Đợt nghiệp vụ riêng | Cần quan hệ giường–phòng, sức chứa, vệ sinh và quota tương ứng |
| Vừa bán nguyên căn vừa bán phòng bên trong | Đợt nghiệp vụ riêng | Cần tồn phòng cha–con và khóa đặt chỗ chéo để chống bán trùng |

Không quảng bá hỗ trợ vận hành dorm/cha–con chỉ vì Excel nhập được tên giường hoặc
villa. Mẫu có thể phát triển theo phiên bản khi các nghiệp vụ này được triển khai.

## 3. Thiết kế file mẫu

Một file `.xlsx`, ba sheet. Không yêu cầu người dùng điền cả ba.

### Sheet `Danh sách phòng` — sheet chính

| Mã phòng* | Hạng phòng* | Khu/Tòa | Tầng | Tên hiển thị | Sức chứa | Ghi chú |
|---|---|---|---|---|---|---|
| A-101 | Tiêu chuẩn | A | 1 | 101 | | |
| A-102 | Gia đình | A | 1 | 102 | 4 | Giường phụ |
| B-101 | Đôi | B | Trệt | 101 | | |
| 001 | Đôi | | Lửng | | | |
| V-HOA | Villa sân vườn | Khu vườn | | Villa Hoa | 8 | Cho thuê nguyên căn |

Đây là ví dụ trong tài liệu/sheet hướng dẫn. Sheet nhập của file tải về phải trống,
không chứa phòng mẫu có thể bị nhập nhầm.

- Cột mã được định dạng văn bản; tên hiển thị mặc định bằng mã nếu bỏ trống.
- Hai tòa cùng có phòng hiển thị 101: dùng mã A-101/B-101. Nếu file cũ chỉ có 101
  và tên tòa, đề xuất ghép mã trong preview, cho người dùng thấy trước khi áp dụng.
- `Tầng` là nhãn: Trệt, Lửng, B1, 1, 1A… Có thứ tự hiển thị riêng; không sort
  bằng `parseInt` rồi làm mất tầng chữ. Không điền thì không hiện tầng giả.
- `Khu/Tòa` là vị trí, không phải hạng. Không bắt khách nhỏ tạo danh mục vị trí
  trước khi nhập; tạo/ghép theo các giá trị đã được xác nhận trong preview.
- Sức chứa tại dòng phòng ghi đè sức chứa chung của hạng. Nếu cả hai bỏ trống,
  đánh dấu chưa cấu hình; không tự công bố số khách tối đa không có căn cứ.
- Cột bổ sung đã hỗ trợ như giường, diện tích, tiện nghi được chọn trong “Cột
  bổ sung” khi tải mẫu; mặc định không bày hàng chục cột.

### Sheet `Hạng phòng` — tùy chọn, khai báo chung một lần

| Hạng phòng* | Sức chứa | Giá ngày | Giá qua đêm | Giá giờ | Giá tháng |
|---|---|---|---|---|---|
| Tiêu chuẩn | 2 | 500000 | | | |
| Đôi | 2 | 650000 | | | |
| Gia đình | 4 | 900000 | | | |
| Villa sân vườn | 8 | 2500000 | | | |

- Có thể bỏ qua sheet này: hệ thống gom hạng từ sheet phòng và cho điền thông số
  chung ngay ở preview, hoặc thiết lập sau.
- Mã hạng do hệ thống tạo ổn định nếu không có. Khách có mã sẵn có thể thêm cột
  mã hạng; không dùng tên làm khóa liên kết lâu dài.
- Có thể bật cột loại/số giường, diện tích; giờ đầu/số giờ đầu/giờ tiếp theo và
  khung giờ qua đêm chỉ bật khi dùng. Tên cột và đơn vị phải khớp đúng bộ tính giá.
- Giá ngày và qua đêm là hai chế độ khác nhau; không dùng lẫn nhãn “đêm” của hook
  hiển thị cũ. Đối chiếu giá thực sự trên tạo booking trước khi phát hành.
- Cột giá ghi rõ tiền tệ khách sạn. Đợt này không nhập nhiều tiền tệ trong một file.
- File chỉ khai báo giá cơ bản. Giá cuối tuần, theo mùa, ngày lễ và phụ thu tiếp tục
  thiết lập ở màn bảng giá, có liên kết sau khi nhập.
- Không sửa giá của hạng đang có chỉ vì file trùng tên. Preview tách “dùng hạng
  hiện có” và “thay đổi thông số/giá”; đường thiết lập ban đầu không âm thầm ghi đè.

### Sheet `Hướng dẫn & ví dụ`

Giải thích ngắn hai cột bắt buộc, cách giữ số 0 đầu, ví dụ khách sạn nhiều hạng
cùng tầng, resort không có tầng, căn hộ nhiều tòa và cách sửa lỗi thường gặp.
Ví dụ phải được đánh dấu rõ không phải dữ liệu để nhập.

### Mức linh hoạt khi dùng file có sẵn

- Nhận đổi thứ tự cột, khoảng trắng, chữ hoa/thường và tên tương đương đã khai báo
  như Số phòng/Mã phòng/Room number. Không phụ thuộc dấu `*` trong tiêu đề.
- Chọn sheet đúng theo cấu trúc; nhiều sheet khả dụng thì cho chọn, không âm thầm
  lấy sheet đầu tiên. Loại sheet hướng dẫn khỏi tập dữ liệu.
- Chỉ hiện bước ghép cột khi không nhận diện được; ghi nhớ cách ghép trong nháp.
- Danh sách gợi ý hạng trong mẫu không chặn gõ hạng mới. Không yêu cầu sửa validation
  của Excel để thêm “Phòng gia đình”.
- Cột lạ phải hiện rõ là chưa dùng, cho ghép hoặc bỏ qua trong preview. Không
  âm thầm ném vào ghi chú và coi như đã hỗ trợ nghiệp vụ đó.
- Tiếp tục dùng ExcelJS hiện có; không thêm thư viện đọc file chỉ để làm lại cùng việc.

## 4. Quy tắc dữ liệu cần thống nhất

| Tình huống | Xử lý đề xuất |
|---|---|
| Ô giá trống | Chưa thiết lập; hạng đã có thì giữ giá hiện tại |
| Giá bằng 0 | Giá 0 chủ ý, hiện cảnh báo rõ; không coi là ô trống hoặc tự đổi thành thiếu |
| Chưa có giá nhưng muốn nhập phòng trước | Cho tạo cấu hình; booking phải có giá được nhập/xác nhận theo quyền trước khi chốt |
| Không kinh doanh một chế độ thuê | Không bật chế độ đó; không suy từ ô trống thành giá 0 |
| Một hạng có nhiều dòng thông số mâu thuẫn | Báo lỗi tại đúng dòng, cho gộp/chọn; không lấy dòng cuối |
| Hạng giống nhau khác dấu/viết tắt | Gợi ý ghép, không tự gộp bằng bỏ dấu; tên khác có thể là hạng khác thật |
| Mã phòng trùng trong file/hotel | Lỗi rõ mã và dòng; không tự đổi tên hoặc ghi đè |
| Mã có khoảng trắng thừa/khác hoa thường | Chuẩn hóa quy tắc so trùng nhất quán UI/DB; preview hiện giá trị gốc và sau chuẩn hóa |
| Dòng hoàn toàn trống | Bỏ qua, nhưng giữ số dòng nguồn để báo lỗi đúng |
| Tiền dạng 500000 hoặc 500.000 | Đọc theo định dạng đã công bố/kiểu số Excel; giá trị mơ hồ thì báo sửa, không tự đoán locale |
| Công thức Excel | Mẫu dùng giá trị thuần; ô công thức ở trường nhập yêu cầu dán giá trị, không tin cache cũ |
| Mã 001 đã bị Excel chuyển thành số 1 | Cảnh báo/cho sửa; không thể tự khôi phục chắc chắn số 0 đã mất |
| Trạng thái vận hành/booking trong file | Không nhập qua bước khởi tạo; phòng mới dùng trạng thái hợp lệ `vacant_clean` |

Giá riêng từng phòng: hiện luồng tính giá chưa có cơ chế override thống nhất theo
phòng. Không đưa một cột giá riêng vào mẫu rồi để booking bỏ qua. Đợt đầu dùng
giá chung theo hạng; ngoại lệ giá riêng chỉ mở sau khi thống nhất ưu tiên với
giá mùa/ngày và kiểm thử đủ booking, lễ tân, sơ đồ, báo cáo. Sức chứa và ghi chú
riêng từng phòng có thể hỗ trợ ngay sau migration tương ứng.

## 5. Luồng giao diện đề xuất

1. Chọn **Nhập danh sách phòng** từ checklist hoặc trang quản lý phòng. Hiện rõ
   khách sạn đang thiết lập; có nút tải mẫu và vùng thả file.
2. Điền mẫu hoặc dùng file sẵn có; upload. Đọc/kiểm tra tự động; chỉ ghép cột khi cần.
3. Một màn xem trước: “120 phòng · 6 hạng · 2 khu · 5 tầng”; bảng lọc lỗi, sửa
   trực tiếp và điền hàng loạt. Hạng mới và giá kế thừa thể hiện rõ. Tầng/khu trống
   không bị báo lỗi chỉ vì mô hình không sử dụng chúng.
4. Nút **Nhập 120 phòng**. Lỗi chặn phải sửa trước; cảnh báo không tạo thêm chuỗi
   hộp thoại. Có thể tải file lỗi ghi đúng sheet/dòng/cột hoặc sửa ngay trên web.
5. Thành công: xem sơ đồ/danh sách phòng; liên kết hoàn thiện giá nếu còn thiếu.
   Reload/mất phản hồi rồi thử lại không tạo thêm phòng.

Bản nháp lưu trên server, có phiên bản; upload file khác không nhận nhầm kết quả
parse cũ đang chạy. Giữ đúng focus/cuộn khi chuyển màn, hỗ trợ preview ngang và
lọc lỗi trên mobile. Nhập tay nhanh vẫn có cho ít phòng, dùng cùng bộ validation.

Không tạo thêm menu chức năng trùng: bước thiết lập ban đầu và nút nhập Excel ở
quản lý phòng mở cùng một luồng. Khách sạn đã có phòng được thêm phòng mới;
không bị khóa chỉ vì đã tạo một phòng thử trước đó.

## 6. Thay đổi kỹ thuật và migration bắt buộc

### Mô hình dữ liệu

- Thêm tham chiếu `rooms.room_type_id`; hạng thuộc đúng hotel/tenant. Tham chiếu
  và RLS ngăn gán hạng của khách sạn khác; code unique trong phạm vi hotel.
- Bổ sung nhãn tầng/vị trí và thứ tự hiển thị. Chuyển các màn/RPC khỏi giả định
  tầng số nguyên dương; giai đoạn tương thích giữ số tầng legacy nơi cần, không
  dùng tầng giả để đại diện villa.
- Dùng UUID phòng hiện có làm danh tính bất biến; giữ `room_number` làm mã duy nhất
  theo hotel và thêm tên hiển thị. Mã mới không làm đổi UUID/QR/lịch sử phòng cũ.
- Phân biệt chưa có giá và 0 trong schema/resolver; không chỉ sửa parser Excel.
- Bảng nháp/import lưu phiên bản mẫu, mapping, dữ liệu chuẩn hóa, sheet/dòng nguồn,
  phiên bản nháp và request ID. Nhật ký ghi người nhập, hotel, số lượng và kết quả.

### Chuyển đổi dữ liệu cũ

1. Kiểm kê các bảng/RPC tham chiếu hạng, giá, lịch giá, định mức, availability và
   cache keys; lập bảng ánh xạ legacy → UUID theo hotel.
2. Thêm schema tương thích trước. Backfill hạng/phòng, tách hạng đang dùng chung
   giữa các hotel và sao chép đúng các cấu hình liên quan. Không chỉ sao chép giá cơ bản.
3. Kiểm tra không orphan, số phòng không đổi, số tiền booking cũ không đổi, lịch
   giá và định mức không gắn nhầm. Trường hợp không ánh xạ chắc chắn phải có báo cáo.
4. Chuyển đọc/ghi sang ID; chỉ duy trì lớp tương thích legacy trong thời gian chuyển
   tiếp. Khi còn consumer cũ thì chưa gỡ constraint/cột hay phát hành hạng tùy biến.
5. Diễn tập staging với bản dữ liệu đại diện, backup trước migration; ngưỡng dừng
   là có ánh xạ mơ hồ/sai giá. Nếu đã có dữ liệu mới thì không rollback bằng xóa
   cột hay restore đè vận hành; dùng sửa tiến hoặc bản ứng dụng tương thích.

Các consumer phải rà: room forms/list/filter/floor map, get_floor_plan, hạng phòng,
daily pricing/season/overrides, availability, booking/check-in/check-out/đổi phòng,
QR, housekeeping, maintenance, định mức và báo cáo có nhóm theo hạng/vị trí. Đổi
tên hoặc giá hạng không tính lại hóa đơn/booking đã chốt.

### Ghi dữ liệu và giới hạn

- Parse/validate file ngoài transaction; server kiểm tra lại nội dung và quyền,
  quota, version, trùng mã và tham chiếu trước khi commit.
- Tạo hạng, giá, vị trí, phòng và kết quả import cùng transaction ngắn. Lỗi thì
  không công bố nửa danh sách. Retry cùng request ID trả kết quả đã tạo.
- Khóa/check quota cùng cơ chế hiện có; kiểm tra hai request đồng thời và mọi
  đường insert cũ. Không coi phép kiểm tra quota trên frontend là bảo đảm.
- Mục tiêu thử nghiệm: 1.000 dòng/file, 5 MB file nén. Đây là mức cần benchmark,
  không phải hạn mức đã triển khai; quota gói vẫn là giới hạn độc lập của khách.
- Cần giới hạn số sheet/cột/ô và kích thước sau giải nén; file hỏng/quá giới hạn
  báo sớm. Chỉ nhận `.xlsx`, không chạy macro, link ngoài hay công thức.
- Đo trigger đếm quota/usage khi insert nhiều dòng để tránh quét lại N lần.
  Dùng ghi theo tập hợp; không nhân rộng vòng lặp “batch 10” đang ghi tuần tự.
- Nếu vượt khả năng transaction đã đo, dùng staging/background job và công bố
  nguyên đợt; chưa xây job thì từ chối rõ, không nhập nửa file.
- Sau commit cập nhật cache rooms, sơ đồ, hạng, giá, quota và checklist theo hotel.
- Chỉ nhập thêm ở đợt đầu. Cập nhật phòng đang hoạt động là chế độ riêng có diff;
  không tự thay mã/hạng, trạng thái, booking hoặc công nợ từ file trùng mã.

## 7. Thứ tự triển khai

| Đợt | Việc bàn giao | Điều kiện hoàn tất |
|---|---|---|
| 1. Chốt hợp đồng dữ liệu và UX | Mẫu 3 sheet, bộ ví dụ theo mô hình, quy tắc giá trống/0, sơ đồ màn preview | File đơn giản chỉ cần hai cột; mixed-category cùng tầng được mô tả rõ; không còn điểm nhập gây hiểu nhầm |
| 2. Hạng/vị trí và migration | Schema, backfill, RLS, cập nhật resolver/RPC/consumer theo ID | Hai hotel có hạng cùng tên mà giá riêng; dữ liệu cũ giữ nguyên; tầng chữ/không tầng hiển thị đúng |
| 3. Đọc file và preview | Tải mẫu, nhận sheet/cột, chuẩn hóa, sửa hàng loạt, xuất lỗi, nháp | Bộ file đa mô hình đọc đúng; lỗi đúng dòng; không nhập ví dụ; chưa ghi phòng khi chỉ preview |
| 4. Commit thống nhất | API atomic/idempotent, quota, audit, dùng chung wizard và import hiện có | Mất mạng/retry/nhập đồng thời không lặp hay nhập dở; quyền đúng theo hotel |
| 5. E2E và đo hiệu năng | Kiểm thử nghiệp vụ, import 50/200/1.000 dòng, desktop/mobile | Đúng phòng, hạng, vị trí, giá và availability xuyên suốt; chọn ngưỡng file từ số đo thực |
| 6. Phát hành theo đợt | Staging, hướng dẫn ngắn, theo dõi lỗi, mở dần trên production | Migration diễn tập đạt; đường cũ không bypass bảo đảm; production được kiểm tra lại |

Ước lượng sơ bộ cho đầy đủ đơn vị bán độc lập: khoảng 10–16 ngày công, cần hiệu
chỉnh sau kiểm kê toàn bộ tham chiếu hạng và diễn tập migration ở đợt 2. Không bao
gồm giường dorm, bán cha–con, giá riêng từng phòng hoặc hạ tầng queue quy mô lớn.
Không đưa bộ nhập mới lên production trước khi kiểm chứng bộ tính giá và migration.

## 8. Tiêu chí nghiệm thu

| Nhóm | Ca bắt buộc |
|---|---|
| Đa mô hình | Một tầng ba hạng; một hạng nhiều tầng; tầng Trệt/Lửng/B1; villa không tầng; hai tòa có tên phòng 101 |
| Nhận file | Đảo cột, sheet hướng dẫn đầu tiên, nhiều sheet, thêm cột, dòng trống xen kẽ, thiếu hai cột bắt buộc, file hỏng/quá lớn |
| Định dạng | 001/A-101/tên tiếng Việt; số tiền và ô trống/0; dữ liệu mơ hồ; công thức; boolean/sức chứa sai; số dòng lỗi đúng |
| Hạng và giá | Tạo hạng mới, ghép hạng cũ, tên gần giống, thông số mâu thuẫn; giá ngày/qua đêm/giờ/tháng; chưa có giá; 0 chủ ý |
| Nhiều khách sạn | Cùng tên/mã hạng khác giá; không đọc/ghi chéo hotel; đổi hotel lúc đang preview; nhân viên không có quyền import |
| Toàn vẹn | Trùng mã, hai tab, nháp cũ, vượt quota, request đồng thời, mất phản hồi, gửi lặp, nhập lại file đã nhập |
| Sau khi nhập | Sơ đồ/filter/tìm phòng, tạo booking, ngày mùa/ngày override, nhận/trả/đổi phòng, vệ sinh và báo cáo |
| Tương thích | Giữ UUID/QR, booking/hóa đơn/lịch sử cũ; định mức và lịch giá còn đúng; tên hiển thị không bị dùng thay khóa |
| Trải nghiệm | Ít phòng nhập tay được; file chỉ hai cột dùng được; sửa lỗi hàng loạt; mobile không tràn mất nút; refresh tiếp tục nháp |

Đo riêng thời gian parse, validation, preview, DB commit, số query, lock wait và
ảnh hưởng request vận hành đồng thời. Chỉ chốt cam kết hiệu năng sau số đo staging;
không đánh giá ổn định bằng việc upload thành công một file nhỏ.

## 9. Quyết định đề xuất

Chọn Excel làm đường thiết lập chính, nhập tay làm đường bổ sung. Làm nền hạng
theo hotel và vị trí linh hoạt trước; sau đó đưa một pipeline nhập có preview,
nháp và commit nguyên đợt vào cả onboarding lẫn quản lý phòng. Mẫu mặc định gọn,
không bắt nhập tầng, không giới hạn tên hạng, không buộc điền giá từng phòng.

Kế hoạch này điều chỉnh phần phòng của
[kế hoạch tự thiết lập khách sạn](./customer-auto-setup-plan.md). Những kết quả
kiểm thử wizard cũ không được dùng làm bằng chứng rằng importer đề xuất đã hoạt động.
