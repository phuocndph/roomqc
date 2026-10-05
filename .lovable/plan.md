## Mục tiêu
Mở tuần tự 19 trang trong nhóm **Cài đặt** trên preview (desktop, đã đăng nhập), với mỗi trang:
- Chụp 1 screenshot.
- Đọc console errors + network 4xx/5xx phát sinh trong lúc tải.
- Thử click nút chính (Lưu / Tạo mới / Thêm…) ở mức quan sát được để phát hiện handler chết, mutation lỗi, dialog không mở.
- Ghi nhận: "OK" / "Trang trắng" / "Lỗi runtime" / "Permission chặn" / "Nút không phản hồi" / "RPC 4xx-5xx".

Không sửa code trong vòng này — chỉ kiểm tra và báo cáo. Sau khi có danh sách lỗi, sẽ hỏi bạn ưu tiên fix mục nào trước.

## Danh sách trang sẽ test (theo nhóm sidebar)

**Tài khoản**
1. `/settings/users` — Người dùng & Phân quyền
2. `/settings/change-password` — Đổi mật khẩu

**Khách sạn & Pháp lý**
3. `/settings/hotels` — Thông tin khách sạn
4. `/settings/hotel-policy` — Chính sách khách sạn
5. `/settings/legal/stay-registration` — Khai báo lưu trú (BCA)

**Thiết lập hệ thống**
6. `/settings/categories` — Danh mục & Đơn vị
7. `/settings/fixed-costs` — Chi phí & Mục tiêu
8. `/settings/business` — Cài đặt module
9. `/settings/room-check` — Kiểm tra phòng
10. `/settings/workflows` — Tự động hóa

**Bảng giá & Phụ thu**
11. `/settings/pricing` — Bảng giá (kiểm cả 3 tab: daily / default / seasonal)

**Thông báo**
12. `/settings/notifications` — Thông báo
13. `/settings/telegram` — Telegram

**Thanh toán & Gói**
14. `/settings/subscription` — Đăng ký & Thanh toán
15. `/settings/usage` — Mức sử dụng
16. `/finance/reconciliation` — Đối soát giao dịch

**Hệ thống**
17. `/settings/general` — Cài đặt chung
18. `/settings/ai` — Cài đặt AI
19. `/settings/audit-log` — Nhật ký thay đổi

## Quy trình mỗi trang
1. `browser--view_preview path=…`
2. `browser--read_console_logs level=error` + `browser--list_network_requests`
3. `browser--screenshot`
4. Nếu thấy CTA chính, `browser--observe` → `browser--act` 1 lần để xác nhận handler chạy.

## Đầu ra
Bảng kết quả: STT | Đường dẫn | Tên | Trạng thái | Chi tiết lỗi (nếu có) | Đề xuất xử lý sơ bộ.

## Giả định
- User hiện tại có role đủ cao (đang ở `/settings/room-check` không bị chặn) để mở các trang Owner-only như `/settings/ai`, `/settings/subscription`. Nếu một trang bị `AccessDenied` thay vì lỗi thật, sẽ ghi "Bị chặn quyền — không thể test bằng tài khoản hiện tại".
- Không kích các action phá hủy (xóa, gửi email thật, tạo payment). Chỉ click mở dialog / nút "Tạo mới" và đóng lại.

## Bước tiếp theo
Sau khi có báo cáo, bạn chọn mục nào cần fix → tôi chuyển sang build mode để sửa.
