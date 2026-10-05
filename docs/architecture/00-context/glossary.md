# Glossary — Thuật ngữ VN/EN

| Tiếng Việt | English (code) | Ghi chú |
|---|---|---|
| Khách vãng lai | Walk-in (`walk_in`) | Khách không booking trước |
| Thuế GTGT | VAT | Mặc định 8-10% |
| Phí dịch vụ | Service fee | 5% phổ biến |
| Đặt cọc | Deposit | `deposit_amount` |
| Đã thanh toán | Amount paid | `amount_paid` |
| Còn nợ | Unpaid debt | `total_amount - (amount_paid + deposit_amount)` |
| Nhận phòng | Check-in | RPC `perform_checkin` |
| Trả phòng | Check-out | RPC `perform_checkout` |
| Trả nhóm | Group checkout | Manual sau khi pay xong |
| Phòng đang dọn | Cleaning | Auto sau checkout |
| Không làm phiền | DND (Do Not Disturb) | Auto lift bằng cron |
| Phòng ngừng dùng | OOS (Out of Service) | Auto lift bằng cron |
| Kiểm phòng nhanh | Quick room check | RPC `perform_quick_room_check` (1 tap "OK toàn bộ") |
| Kiểm phòng tinh gọn | Lean room check | RPC `submit_room_check_lean` (default-OK + báo issue) |
| Báo sự cố | Report issue | Bottom sheet 2 tầng (damaged/lost / missing/replace / consumed/chargeable) |
| Mở lại | Reopen | RPC `reopen_room_check` (manager only) |
| Đợt giặt | Laundry batch | FSM: delivered → ready → received → stocked |
| Yêu cầu phân phối | Distribution order | Manager approve → giao hàng → confirm |
| Đơn nhập kho | Purchase order (PO) | Vendor → warehouse |
| Khoản tiêu hao | Chargeable consumption | Minibar / amenity tính phí |
| Hết hạn ân hạn | Grace period expired | Khóa write, chỉ read |
| Chỉ đọc | Read-only | Flag `is_read_only` |
| Quy chuẩn phòng | Room standards | `room_type_standards` template |
| Vai trò | Role | super_admin / owner / hotel_manager / department_manager / staff |
| Cấp người dùng | User level | super_admin / tenant_owner / manager / staff (4-tier) |
| Phòng ban | Department | housekeeping / laundry / inventory / maintenance |
| Tất cả khách sạn | All Hotels mode | View tổng hợp đa hotel |
| Ca làm | Shift | `shift_history`, `staff_status` |
| Đang trực | On-shift | Filter để giao việc |

## Quy ước đặt tên

- Bảng: `snake_case` plural (`room_bookings`, không `roomBooking`).
- RPC: `snake_case` verb (`perform_checkin`, `transition_room_status`).
- Edge function: `kebab-case` verb (`sepay-webhook`, `send-invoice-email`).
- React component: `PascalCase`.
- Hook: `use*` camelCase.
- Query key: array `['domain', 'subdomain', tenantId, hotelId, ...filters]`.
