# RoomQC — cảnh báo hạ tầng và phục hồi kết quả lệnh local

Ngày 28/10/2026. [Artifact](../../../artifacts/roomqc-control-alert-ui-local-2026-10-28.json) lưu source, kết quả và giới hạn. Đây là phần client/UI cảnh báo của T04/T07/T15/T17, nối vào [backend T07 đã kiểm local](roomqc-control-alerts-local-2026-10-28.md); chưa nghiệm thu trọn task hoặc VPS.

## Đầu ra sử dụng

Hạ tầng → Cảnh báo hiển thị lỗi cần theo dõi, tài nguyên, mức độ và thời điểm. Mặc định xem cảnh báo chưa có người nhận; có lọc tất cả/đã nhận/đã phục hồi, mức độ và phân trang phía server. URL giữ bộ lọc; Back phục hồi vị trí sau khi danh sách tải xong.

Người quản trị bấm Nhận xử lý, nhập ghi chú 5–1.000 ký tự và xác nhận. Client lưu mã yêu cầu, phiên bản và nội dung vào localStorage rồi đọc lại trước khi POST. Bản ghi riêng cho từng lệnh và được tách theo tài khoản cùng runtime; không lưu bearer token hoặc mật khẩu. Nhận xử lý không kết thúc cảnh báo hoặc mở lại nhận khách mới.

Khi chưa rõ kết quả, giao diện giữ yêu cầu qua F5/đăng nhập lại. Kiểm tra kết quả chỉ gửi GET. Nếu máy chủ chưa tìm thấy kết quả, người dùng có thể Gửi lại cùng yêu cầu; client tra lại lần nữa rồi dùng nguyên mã và nội dung. Không tạo mã mới từ timeout/404. Chỉ receipt đúng tài khoản/cảnh báo/phiên bản được xác nhận mới xóa yêu cầu chờ. Từ chối đã được database tuần tự hóa cho phép đóng yêu cầu và tải lại; 403/429/conflict hoặc response sai không cho phép tự xóa.

Đổi tài khoản, phiên, profile hoặc runtime hủy khả năng áp dụng callback cũ, kể cả A→B→A. Ngân sách 30 giây bao gồm tra phiên và transport không thực hiện abort. Native chỉ mở đúng POST nhận xử lý và GET cần thiết; web/native từ chối redirect.

## Bằng chứng local

| Phạm vi | Kết quả |
|---|---|
| Client/journal/hook/UI/guard/transport và hồi quy workspace | 116/116, 11 file, 0 skip, exit 0 |
| Client/journal production biên dịch → web transport mặc định → HTTP → PostgreSQL riêng | 13/13, exit 0 |
| Mất phản hồi | Relay đóng socket sau khi upstream hoàn tất; DB đã ack, journal còn giữ; restart API và đổi phiên tra đúng receipt |
| Replay và lifecycle | Một ack event/outbox/command; receipt cũ giữ nguyên sau phục hồi; không đổi admission hoặc tạo workspace/job |
| Quyền và dữ liệu lỗi | Role API không superuser; origin sai bị từ chối; khác actor không đọc receipt; version/key conflict không báo thành công |
| TypeScript, lint file sửa, production/PWA build | Exit 0; còn cảnh báo shared vendor chunk lớn |
| Cleanup độc lập | Không còn container/volume/network thuộc run `fb03ce0d7789` |

Chi tiết HTTP: [artifact run](../../../artifacts/roomqc-control-alert-client-fb03ce0d7789-local-2026-10-28.json). Database, server và lỗi socket là thật; adapter quyền và đầu vào incident là giả lập. Journal của bài HTTP dùng Storage adapter bộ nhớ, bài component dùng localStorage của jsdom. Các số trên là kiểm thử local, không cộng thành ca nghiệm thu sản phẩm.

Đã sửa thêm lỗi chọn Tất cả nhưng URL xóa state rồi trở về mặc định open, và tra phiên có thể chờ vô hạn. Lượt 105 ca trước khi thêm hồi quy workspace là tập con; chỉ lấy lượt tổng hợp 116 ca làm kết quả cuối. Các lỗi fixture async/reset và kiểu UUID trong test đã được sửa trước lượt cuối.

## Phần còn mở và việc nhận tiếp

T07 còn bundle Linux, cấu hình kênh thật và cảnh báo từ ngoài host khi mất VPS. Live Supabase authority, browser/Android, bàn phím/390px/zoom và hình học cuộn vẫn cần kiểm E2E. Hướng dẫn vận hành kênh ở [runbook](roomqc-control-alert-worker-runbook.md).

Nhận tiếp T09/T15: đối chiếu các lệnh cụm đang có, khép contract/handler/quyền/version/receipt, rồi client journal và UI đóng/drain/mở/đổi giới hạn. T15 còn backup proof; T16 còn totals, tenant-summary và durable recheck. Không giao lại lifecycle/outbox hoặc UI cảnh báo như chưa triển khai.

Backend binding 208 file vẫn `33a58bbbb3df1891ea1ff70753b2b23d57cb206d9cada205261d8010fc9857e3`. Full native backend và independent rebuild phải chạy trên candidate cuối. Giữ nguyên 70 ca `not_run`, 122 mục `unverified`, reviewer/signoff/gate. Chưa triển khai VPS hoặc thay database chính.
