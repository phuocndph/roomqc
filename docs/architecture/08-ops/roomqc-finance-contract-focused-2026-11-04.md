# RoomQC — kiểm tra tập trung tiền, doanh thu và báo cáo

Ngày 04/11/2026. Lượt kiểm tra chạy trên sandbox local cô lập, dùng đủ 591 migration hiện tại. Không ghi vào `localhost:8082`, RoomQC production hoặc nhà cung cấp bên ngoài.

## Kết quả

| Hạng mục | Kết quả |
|---|---|
| Native checks | 248/248 PASS, 0 FAIL |
| Tranh chấp đồng thời | 18 ca có barrier khóa thật, đều PASS |
| Mất phản hồi TCP/restart tiến trình | PASS |
| Schema trước/sau | Không đổi; fingerprint `b9911a65…3d2822` |
| Migration | 591/591 đã áp dụng trong sandbox |
| Cleanup | 11 Docker object đã dọn, không còn tài nguyên của run |

Đã kiểm quyền kế toán chỉ đọc, cách ly tenant/khách sạn, ngày theo múi giờ, khoảng ngày sai, phân trang vượt 10.000 booking/chi phí, báo cáo doanh thu–chi phí–lợi nhuận, export, replay cùng khóa, rollback khi lỗi audit/receipt và thu hồi quyền trong lúc đang chờ khóa.

## Đối chiếu ba nguyên tắc đã duyệt

- Cọc/đã thu được đối chiếu qua ledger payment và không bị báo cáo tạo thêm receipt, invoice, command hoặc audit ngoài ý muốn.
- Doanh thu được tính theo nhóm đêm lưu trú/checkout; booking đang ở, hoàn tiền và no-show không tự biến thành doanh thu đêm.
- Dòng tiền được tách theo ngày của ledger/receipt, không lấy ngày checkout làm ngày thu.
- Thuế/phí được tách khỏi room revenue và cash trong report. Ca khẳng định riêng rằng checkout dùng đúng `vat_rate`/`service_fee_rate` đã chốt trên booking cần chạy thêm bằng chứng checkout receipt; lượt này chưa tự nâng lên PASS cho điểm đó.

## Còn lại

1. Chạy một ca checkout độc lập: booking có rate riêng, thay default hotel sau khi tạo booking, checkout và đối chiếu `vat_amount`, `service_fee_amount`, `total_amount` với rate snapshot của booking.
2. Sửa/định danh lại probe Realtime: quyền `UPDATE` cấp bảng đang bị đọc như một quyền tổng, trong khi migration chủ ý revoke `status` và buộc chuyển trạng thái qua RPC. Không nới quyền để làm probe xanh giả; cần kiểm lại bằng `has_column_privilege` và command RPC.
3. Tiếp tục các nhóm còn `NOT RUN`, browser/mobile E2E và quyết định nghiệp vụ còn mở. Lượt này không phải sign-off phát hành.

[Biên nhận JSON](../../../artifacts/roomqc-finance-contract-20261104.json)

