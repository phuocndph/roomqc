# RoomQC — baseline lỗi hết hạn gói khi chờ khóa dữ liệu

Ngày kiểm tra: 27/10/2026. Đây là bằng chứng lỗi trên fixture local riêng,
phục vụ kế hoạch toàn bộ VPS + signup và bộ nghiệm thu. Chưa sửa lỗi hoặc
triển khai thay đổi lên môi trường đang phục vụ.

[Artifact kết quả đã lọc](../../../artifacts/roomqc-advice-authority-baseline-local-2026-10-27.json).

## Kết luận

**Lỗi chặn phát hành còn mở:** đọc kết quả AI đã hoàn thành có thể thành công
sau khi gói dùng thử hết hạn trong lúc yêu cầu chờ khóa policy. Quyền gói cần
được kiểm lại sau các điểm chờ, ngay trước khi trả dữ liệu hoặc ghi nhận quota.

| Quan sát | Kết quả thực tế |
|---|---|
| Trước fault | Tạo và đọc được kết quả hoàn thành bằng Auth/REST/Postgres thật |
| Fault | Giữ khóa hàng policy; trial hết hạn sau 3 giây theo đồng hồ database |
| Đồng bộ | Quan sát 1 request chờ khóa bằng `pg_blocking_pids`; database xác nhận trial đã hết hạn trước khi nhả khóa |
| Thời gian | 3.614 ms theo đồng hồ thực |
| Mong đợi | HTTP 403, không trả advice |
| Thực tế | HTTP 200; assertion từ chối đọc thất bại |
| Tiến trình | Native exit 1; giữ nguyên lịch sử thất bại |

Nguyên nhân trong migration 573: `private.operations_advice_entitlement`
kiểm trial trước khi chờ khóa policy. Nhánh lookup trong
`private.request_operations_advice` kiểm lại session và thời hạn policy,
nhưng chưa kiểm lại thời hạn trial trước khi trả receipt có advice.

Giới hạn: runner dừng tại lỗi đầu tiên. Các race khóa command/audit và matrix
17 trường hợp thu hồi quyền, bốn đường prepare/read/dispatch/finish **chưa chạy**.
Không kết luận các đường này đã lỗi hoặc đã an toàn. Snapshot journal sau lỗi,
kiểm schema cuối run và advisors không chạy đến; không gán giá trị mặc định
`false` của collector thành bằng chứng schema đã đổi.

## Phạm vi nguồn và kiểm tra bảo vệ

Source 1009 file, SHA-256
`a17e5505ee54e99b10b38f4cb24f122a48bc6adae067c941bfc80cad86229e41`.
Chỉ thêm harness authority và nhánh diagnostic trong runner so với source1008;
SQL, Edge và mã sản phẩm giữ nguyên. Có 573 business + 12 directory migrations.

- Source binding/Compose renderer: 13/13 đạt, exit 0, không fail/skip/cancel.
- Manifest nguồn không đổi trong run. Bản delivery, Git index, hai ledger và
  70 hàng worksheet được bảo vệ trước/sau run.
- Container, volume, network có đúng nhãn sở hữu của run: còn lại 0/0/0.
- Không gọi provider, gửi email thật hoặc tác động VPS/DNS/database đang phục vụ.
- Không chạy browser, Android, full/default-full, rebuild, tải hoặc pilot.
- Bằng chứng private giữ dưới `.local`; báo cáo và artifact công bố đã lọc.

## Phiếu sửa và nghiệm thu kế tiếp

Nhận [mục 19.33 của kế hoạch chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1933-phiếu-nhận-sau-baseline-authority1009).

1. Giữ baseline đỏ; tạo migration tiến tới bằng CLI đã pin, không sửa migration573.
2. Kiểm quyền tenant theo đồng hồ thực sau chờ policy/command/hotel/audit và
   trước mọi nhánh trả dữ liệu nhạy cảm hoặc commit reservation/dispatch/result.
3. Giữ nguyên receipt, fence chống gửi lại, quota/audit và cơ chế recovery.
   Nhánh service ghi nhận unknown không được trả advice hoặc tự hoàn quota.
4. Chạy lại ba race expiry và matrix đầy đủ; bổ sung thời hạn session/policy
   trong các nhánh replay, quyền bị thu hồi trong I/O và ngay trước release.
5. Chạy hồi quy phù hợp và upgrade có dữ liệu 573 → migration mới, có fault
   sau body/history trước COMMIT. Giữ guard lịch sử 572→573 và 566→572.
6. Cập nhật expected/actual và source của kết quả xanh. Không chuyển 70 ca
   nghiệm thu tổng thể sang pass chỉ từ kiểm thử local này.

Kết quả local1008 vẫn có giá trị đúng phạm vi SIGKILL/timeout/policy/session
expiry đã báo cáo; không chứng minh trường hợp trial chờ policy lock này.
Tình trạng tổng thể giữ **70 ca not_run, 122 mục unverified**, chưa có chữ ký
review hoặc cho phép phát hành. Mục tiêu toàn bộ VPS + signup còn đang thực hiện.
