# Console sao lưu — API và giao diện local,29/10/2026

Đã triển khai GET /admin/backups và mục **Hạ tầng → Sao lưu**,thay trạng thái planned bằng implemented-local.Phần này hiển thị metadata đã ghi nhận;chưa xác minh tệp backup hiện còn truy cập được hoặc khôi phục thành công.

Backend352 tệp,SHA256 431a2bd51f36c5f8967bbeba00e9e04cd7614b183e008575d3ba4cee25d90e33;10 tệp frontend/dependency được ràng buộc hash.[Packet đã lọc](../../../artifacts/roomqc-control-backups-05519daa90c9-local-2026-10-29.json).

| Nội dung | Kết quả |
|---|---|
| API |Platform-read,kiểm quyền trước vàsau đọc;lọc cụm/loại/tình trạng;limit1–100;cursor giữ microsecond vàràng buộc route/bộ lọc |
| Tổng số vàthời điểm |Tổng toàn bộ theo bộ lọc,trang dữ liệu vàasOf cùng một SQL statement snapshot;không lấy số dòng trang làm tổng |
| Trạng thái |Giữ pending/failed/null;không có bản ghi khác với503 đọc lỗi;chưa thử khôi phục có nhãn riêng,không tự hiện an toàn |
| Dữ liệu hiển thị |Projection tường minh;URL/path không được dùng làm mã hiển thị;manifest chỉ nhận SHA256 hợp lệ;không có signed URL/download |
| Giao diện |Có đường click từ Hạ tầng,bộ lọc URL/cursor,tải lại,tổng máy chủ,thông tin đối chiếu thu gọn;Back giữ bộ lọc trước đó |
| Contract/unit |9/9 đạt |
| PostgreSQL/HTTP riêng |2/2 đạt;1.005 bản ghi đúng thứ tự,không lặp;total đúng cả trang sau;API không DELETE được;SQL read→revoke trả403,không body metadata;permission lỗi trả503 |
| Client/giao diện |59/59 đạt trên3 tệp;kiểm state null/failed,phản hồi sai cụm/bộ lọc,total thiếu/sai,refresh lỗi ẩn dữ liệu cũ rồi retry;URL/Back |
| Hồi quy control |536pass,0fail,207skip/743;exit0.Skip không được tính đạt |
| Build/lint |Build production vàlint7 tệp frontend đạt.Còn cảnh báo chunk lớn hơn1000kB,không nhận hiệu năng từ build |
| Visual fixture |Đã xem ảnh desktop1280px vàmobile390px;không tràn ngang,panel0px,bộ lọc vàfocus bàn phím hoạt động;0page/console error |
| Bảo toàn |Source backend và10 tệp frontend đầu–cuối khớp;container directory đúng label còn0;3 hồ sơ nghiệm thu gốc giữ SHA256.Không tạo migration/nâng schema trong lượt này |

Ảnh kiểm component:[desktop](../../../artifacts/control-backups-desktop-fixture-local-2026-10-29.png) · [mobile](../../../artifacts/control-backups-mobile-fixture-local-2026-10-29.png).

## Phạm vi chưa nhận

- PostgreSQL/HTTP dùng gateway quyền của fixture;không thay proof Auth thật/E2E.Trình duyệt dùng actual panel/CSS nhưng query hook giả lập,không ghi là console nối backend đã triển khai.
- Lần visual đầu được dừng đúng helper vì startup quét rộng,chưa mở browser;lần hai timeout heading,chưa xác định root cause.Lần ba chuyển sang static fixture vàđạt;giữ source/log lỗi,không sửa code chức năng để làm xanh ảnh.
- Chưa chạy job tạo backup/offsite,thử mất host hoặc clean-host restore.Không có bằng chứng ra VPS thật trong lượt này.
- D8ac giữ native nâng cấp22/ACL42 riêng;a39f giữ writer-first335 riêng.Không chuyển các kết quả này sang candidate431a.Chưa full-default/rebuild cùng candidate.
- Còn GET /admin/workspaces/{id}/tenant-summary,totals/cấu hình console còn thiếu;BG02 bảo mật/app rollback/orchestration,BG03 tài nguyên vàBG06–BG11 vẫn mở.Giữ122 release entries unverified,không ký nhận BG05 hoặc sản phẩm.

[Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md).
