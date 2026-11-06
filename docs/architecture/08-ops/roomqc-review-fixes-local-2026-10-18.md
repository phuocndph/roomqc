# RoomQC — sửa lỗi sau review, bản local 18/10/2026

## Kết quả

Đã cập nhật riêng RoomQC local tại http://127.0.0.1:8082.
Frontend và Edge worker đã chuyển sang source mới; container healthy.
Không bật lịch, không gọi job lifecycle được cấp quyền trên DB chính,
không triển khai VPS hoặc gọi email/thanh toán bên ngoài.

## Các lỗi đã sửa

1. **Worker atomic và notification outbox:** chuyển worker sang batch RPC
   có transaction, cursor, receipt chống trùng và scope bắt buộc. Batch tối đa
   50 mục; kiểm tra run/deadline sau khi chờ khóa. Chỉ công nhận thành công
   sau khi xử lý hết các phase và không còn pending trong scope.
   Lượt sau có thể gửi bù outbox cũ mà không cần đổi gói lần nữa.
   Đóng quyền gọi các đường legacy bỏ qua cơ chế mới.
2. **Phục hồi lượt gián đoạn:** quản trị có phiên còn hiệu lực được giải phóng
   lượt atomic đã hết deadline, với lý do, mã yêu cầu và audit bất biến trong
   cùng transaction. Không thay đổi tenant, tiền, outbox hoặc chạy lại job.
   Summary dùng progress bền vững nên vẫn ghi đúng thông báo gửi từ outbox
   của lượt trước và trạng thái staff. Lượt legacy không được tự giải phóng.
3. **Lệnh đối soát khi F5/remount:** lưu và đọc kiểm chứng request ID, nội dung,
   version trong sessionStorage trước RPC; restore theo actor/tenant/payment.
   Kết quả mơ hồ giữ nguyên lệnh để retry, lỗi storage chặn gửi thêm.
   Lệnh phục hồi job cũng dùng cơ chế bảo toàn tương tự.
4. **Danh sách khách hàng:** RPC có phân trang giới hạn 100 dòng, tìm kiếm,
   bộ lọc, sort và tổng số tại server. SUM hóa đơn đã trả và hoạt động mới nhất
   không còn phụ thuộc giới hạn 1.000 dòng REST. Export/chọn chỉ trang hiện tại;
   đổi bộ lọc xóa lựa chọn, lỗi API ẩn dữ liệu cũ và khóa thao tác.
   Ngày hết hạn DATE còn hiệu lực hết ngày UTC.

DB lint phát hiện validator scope khai báo IMMUTABLE trong khi helper JSON
là STABLE. Đã sửa bằng migration tiếp nối, giữ nguyên history đã áp.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ Vitest | 823 đạt, 16 bỏ qua; 103 file đạt, 2 file bỏ qua |
| DB foundation + actual atomic worker | 131/131 đạt, chạy lại với migration volatility |
| DB phục hồi job | 54/54 đạt, chạy lại với migration volatility |
| DB directory | 32/32 đạt, dữ liệu thử vượt 1.000 dòng |
| Deno entrypoint check | Đạt |
| Deno legacy auth/helper | 11 đạt; không gọi đây là test Deno worker atomic mới |
| TypeScript và ESLint phần thay đổi | Đạt |
| DB lint public/private | Không lỗi hoặc warning sau migration tiếp nối |
| Security advisors mức warn/error | Không vấn đề |
| Docker build + verify:build | Đạt |
| Container candidate và 8082 | Smoke/security headers/deep-link/cache đạt |
| HTTP từ chối truy cập trái quyền | 5/5: directory, monitor, recovery, worker GET và POST |
| Source gốc và integration | 31 file code/test/migration khớp sau chuẩn hóa CRLF |

Các số focused Vitest nằm trong tổng 823, không cộng lần nữa.
Các harness SQL dùng DB template0 riêng với dependency chọn lọc, không clone
toàn trigger graph. Actual handler atomic chạy qua adapter SQL trong DB cô lập,
bao gồm mất phản hồi sau commit, rollback giữa batch, chờ khóa quá deadline,
gửi outbox cũ và cluster fixture 105 tenant.

## Triển khai và bảo toàn

- Image: roomqc-local:review-fixes-20261018.
- Image ID: sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b.
- Container: room-weave-pro-main-roomqc-1, chỉ bind 127.0.0.1:8082.
- Restart riêng supabase_edge_runtime_ehjtoajnlnuvuiwkpmbp sau đồng bộ source.
- Migration: 20261018012844, 20261018012852, 20261018012924,
  20261018014615. History local 520 version; source bốn migration khớp.
- Đối chiếu full-row fingerprint trước/sau: tenants 3, invoices 0,
  payment_transactions 0, staff_status 9, in_app_notifications 2, không đổi.
- Main lifecycle runs/commands/outbox/recoveries vẫn 0; không có cron lifecycle.
- Backup trước áp dụng: /tmp/roomqc-before-review-fixes-20261018.dump trong
  container DB. Archive có nội dung và đọc được danh mục; chưa kiểm thử restore
  độc lập hoặc sao lưu ra máy khác.
- Đã xóa container candidate và DB fixture của các harness.
- Giữ nguyên thay đổi có sẵn/index của source gốc; không push hoặc đổi main.
  Source sửa được lưu ở worktree integration và đồng bộ có kiểm tra baseline.

## Giới hạn và việc tiếp theo

- Chưa nghiệm thu production hoặc committed browser E2E của workflow mới.
  Test component/SQL/HTTP-denial không thay cho luồng người dùng thật.
  16 test bỏ qua không được tính là đã kiểm tra đạt.
- Journal chỉ tồn tại trong phiên tab. Đóng tab, xóa dữ liệu hoặc đổi thiết bị
  phải tra lịch sử/receipt trước khi tạo lệnh mới.
- Worker yêu cầu POST với scope tường minh: {"scope":{"kind":"cluster"}}
  hoặc kind tenants với tenant_ids không rỗng. Caller cũ gửi body rỗng bị từ chối.
  Chưa bật scheduler; cần cấu hình caller và nghiệm thu staging trước khi bật.
- Giữ nguyên điều kiện nghiệp vụ expiry cũ; các active/trial hết hạn không
  được predicate cũ bao phủ được monitor hiển thị riêng, không tự đoán chính sách.
- Mỗi invocation có giới hạn 80 batch/50 giây; chưa có orchestration tự động
  để chạy tiếp hoặc xử lý lỗi theo lịch.
- Offset pagination không tạo snapshot xuyên nhiều trang khi có ghi đồng thời.
- Bundle vendor lớn vẫn là backlog hiệu năng; build đạt không chứng minh
  khả năng phục vụ 100.000 người đồng thời.
- VPS/domain/TLS, provider email, thanh toán thật, backup/restore ngoài máy,
  giám sát vận hành và thử tải vẫn là các bước chưa nghiệm thu.
