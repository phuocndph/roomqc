# Nâng cấp563→564 có dữ liệu — kiểm chứng local 27/10/2026

Đã bổ sung diagnostic `booking-upgrade` để dừng ở schema563, tạo dữ liệu bằng
Auth/REST/RPC thật, rồi thử lỗi và nâng cấp564. Kết quả **27/27 đạt**. Chế độ
này khác với dựng database trống rồi replay564migrations; không thay nghiệm
thu nâng cấp toàn hệ thống hoặc runtime production.

[Artifact](../../../artifacts/roomqc-booking-notifications-upgrade-local-2026-10-27.json)
ghi nguồn, kết quả, lần thất bại, cleanup và giới hạn. Source901 có SHA256
`7d45b1fd2f00c66713e0f7f0ef9b59a97819667ddd56c45987b5ab9523191606`,
564business+12directory migrations và backend binding180file. Delta từ900
gồm fixture kiểm upgrade và nhánh điều phối trong sandbox; không thêm migration
nghiệp vụ hoặc triển khai vào hệ thống đang phục vụ.

## Dữ liệu và cách kiểm

1. Replay chính xác563migrations trên vendor backend riêng; Auth tạo/chứng thực
   owner và RPC cấp workspace/hotel. Tạo4booking trả phòng qua RPC thật, có
   room source, notes, invoice, audit và command receipt. Có subscription/group
   cũ đang active để hàng đợi lịch sử có đích thực trong snapshot nguồn.
2. Worker in_app hạn chế quyền tạo một ca delivered có receipt và một ca
   no_recipients. Hai ca còn lại pending và deferred; deferred được seed trạng
   thái hợp lệ với attempts2/DELIVERY_FAILED/available_at tương lai. Đây không
   phải bằng chứng tái hiện lỗi delivery lần mới. Push/Telegram có8job pending.
3. Lưu hash các hàng room/booking/invoice/command/room-source/event/outbox/
   receipt/in_app notification/audit thuộc4booking. Hash so sánh bỏ riêng hai
   cột mới của event; sau upgrade kiểm hai cột này bằng assertion riêng.
4. Chạy toàn thân migration564 và ghi migration ledger trong transaction, rồi
   cố ý gây SQLSTATE22012 trước COMMIT. Kết nối psql kết thúc, transaction
   rollback; fingerprint schema/hàng dữ liệu không đổi, ledger vẫn563, bảng/
   cột mới không tồn tại. Sau đó áp migration thật thành công và ledger lên564.
5. Nguồn cũ có external_plan_version0, payloadNULL; không có target/attempt mới.
   Đọc result/status qua Auth/REST và gửi lại20request cũ: cùng invoice/event,
   không thêm core effects, không tự chuyển nguồn cũ thành version1.
6. Bật đúng cấu hình bằng login operator hạn chế; worker external chạy hai
   vòng không claim hoặc gửi nguồn cũ. Outbox external cũ giữ tương đương byte.
   Worker in_app vẫn xử lý backlog, giữ backoff rồi phục hồi ca deferred khi
   tới hạn; chạy lại không thêm receipt cũ, no_recipients không bị đổi.
7. Sau các assertion bảo toàn, fixture chủ động ngừng hai đích thử cũ và thêm
   đích loopback mới. Một checkout mới có version1 và2target; sink độc lập thấy
   durable journal trước cả2HTTP requests. Restart không gửi thêm;8job external
   cũ không bị chạm hoặc backfill. Không gọi provider Internet.

Đây là bảo toàn dataset được nêu, không phải so sánh mọi bảng hoặc mọi dữ liệu
khách sạn. Chưa kiểm dump/restore Auth/Storage/files, production mounts, lịch sử
schema khác563, downtime hay thời gian khóa khi upgrade có tải. Các phần đó
vẫn thuộcT18/T19/T23 và nghiệm thu theo môi trường bắt buộc.

## Kết quả, lần đỏ và giới hạn

Run upgrade `131a5345c8bf` exit0/booking_upgrade_diagnostic_verified,27/27,
source/schema/runtime trước-sau khớp. Hồi quy room-writers `fbed89e49496` đạt
441/441 gồm29lock races; full-control `1ec3da343d58` đạt440/440, không fail/
skip/cancel, exit0 cùng source901; không kế thừa441/440 của900.
Frontend171/171 và room-source77/77 trong report900 là lịch sử của900; không
được gán thành đã chạy trên901 từ packet này.

Lượt đầu `9743bd7aa59a` dừng ở seed563, HTTP400 khi tạo rooms. Fixture mới thiếu
room_type/floor so với fixture đang chạy được; đã bổ sung dữ liệu, giữ assertion
HTTP201 và chạy lại từ backend mới. Không sửa schema/quota để làm test đạt.
Lượt đỏ giữ nguyên source/hash/terminal và đã cleanup độc lập; fault22012 ở
lượt đạt là lỗi cố ý để kiểm rollback, không phải lỗi production đã phát hiện.

Advisor upgrade ghi720findings:34no-policy INFO,7unindexed-FK INFO,
496unused-index INFO,183multiple-permissive-policy WARN. Đếm unused-index phụ
thuộc fixture/usage; không xem chênh lệch với727của run900 là đã sửa7vấn đề.
Disposition vẫn mở. Direct-ACL kiểm catalog34bảng, populate13bảng trong fixture
này; không thay kiểm tất cả đường gọi gián tiếp hoặc mọi bảng đều có dữ liệu.

Không thay70hàng worksheet not_run,122release entries unverified hoặc gates/
reviewer/signoff. Chưa deploy, provider/device, browser/Android, default full
backend hoặc independent rebuild901. Nguồn version0 không tự gửi đã có proof;
quyết định nghiệp vụ đối với backlog lịch sử vẫn cần người nhận và audit.

## Phần nhận tiếp của Q02

Inventory source xác nhận `transition_booking_status` vẫn được định nghĩa từ
migration cũ, có nhánh checked_out và trigger ghi rooms. Hook
`useBookingFlagTransition` tồn tại; tìm literal trong src chỉ thấy chính file
định nghĩa. Đây là thông tin định tuyến công việc, chưa chứng minh lỗi runtime,
không chứng minh consumer bên ngoài đã ngừng dùng.

Nhận baseline Auth/REST cho RW5: cờ sleep_out/skipper/clear, quyền cập nhật booking,
scopehotel/session sau lock, audit/source và đường trả phòng/tiền. Sau đó xử lý
RW6–RW8, quote/payment/legacy/correction/retention; Q03 workflow/recipient/
offboarding/advisors và Q04 freeze/full/rebuild. Toàn bộ VPS/signup vẫn theo
[mục19.11 kế hoạch](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1911-điểm-bàn-giao-sau-pushtelegram900).
