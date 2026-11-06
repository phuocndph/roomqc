# Vòng đời khóa Tổng quan doanh nghiệp — kết quả tích hợp local

Ngày 29/10/2026. Đã triển khai và kiểm tích hợp local cơ chế cấp/công bố/luân chuyển khóa riêng cho Tổng quan doanh nghiệp. Chưa nghiệm thu BG05, VPS hoặc sản phẩm. [Packet nguồn và kiểm thử](../../../artifacts/roomqc-summary-credential-lifecycle-115cc104deb5-local-2026-10-29.json).

## Kết quả xác nhận

| Phần | Kết quả |
|---|---|
| Nguồn | 374 tệp backend; SHA256 `311a518f60bc684cee7530770d7fb285cf5fa549d1488bc83688aac4b24425c3`; đầu–cuối khớp |
| Database | 590 migration nghiệp vụ; namespace quản trị khóa chỉ cài qua maintenance role; tài khoản nghiệp vụ bị từ chối, không nâng quyền runtime |
| Tích hợp | 62/62 kiểm tra; actual Auth/provision fixture, Kong/PostgREST, SQL command, signer và công bố tệp; exit0 |
| Công cụ thực tế | Installer/issuer và daemon chạy Linux UID10001, CapEff0, NoNewPrivs, nguồn snapshot chỉ đọc; release approval dùng test authority |
| Phục hồi | Mất phản hồi sau issue commit được replay cùng caller/key/body; daemon bị SIGKILL sau rotate commit tiếp tục pending và không tạo hiệu ứng thứ hai |
| Quyền hiện hành | Chặn khác release trước rebind, withdrawal tại directory, khóa cũ sau cutoff; không tự hồi sinh khóa revoked/expired |
| Hồi quy | 575 đạt, 0 lỗi, 209 bỏ qua trên 784; exit0, cùng nguồn. Bỏ qua không tính là đạt |
| ACL riêng | 44 bảng, 44 snapshot không đổi, 528 browser/probe denials, 164 private-service denials, 91 positive reads; chưa chứng minh mọi đường quyền gián tiếp |
| Dữ liệu và cleanup | Tenant/staff/room/provision receipt không đổi; temporary roles được dọn, schema hash phục hồi; kiểm Docker độc lập: 0 container/network/volume đúng label |

HS256 được kiểm qua RPC thật; RSA/P-256 được ký và xác minh cục bộ, chưa chứng minh cấu hình JWKS triển khai. Công cụ không nhận service-role/signing key qua command line. Runtime chỉ nhận scoped bearer; signer và maintenance DSN ở đầu vào riêng.

Native dùng database directory độc lập với đủ chuỗi migration hiện hành, kiểm chữ ký release, quyền đang còn hiệu lực, mapping cụm và physical identity trước/sau thao tác. Approval được tạo bởi fixture; không phải quyền nhà cung cấp hoặc phê duyệt production.

## Lỗi và sửa trong đợt

- Thêm tmpfs 16MB riêng cho diagnostic, giữ root và source chỉ đọc; khắc phục EROFS của lượt trước.
- Tách kiểm ACL tài khoản nghiệp vụ khỏi kiểm immutable trigger bằng maintenance role; không nới quyền để làm bài kiểm qua.
- Thêm hai CLI và policy luân chuyển vào source binding, để thay đổi công cụ/cấu hình cũng làm đổi bản nguồn.
- Giữ kiểm từ chối state từ release cũ; fixture phải explicit rebind trước khi cấp khóa cho release mới.
- Lượt control-r3 chạy sai thư mục bị lỗi tìm renderer; đã chạy lại control-r4 từ gốc dự án. Giữ lịch sử lỗi, không lấy lượt lỗi làm bằng chứng đạt.

Advisor có 874 findings: 42 INFO:rls_enabled_no_policy; 9 INFO:unindexed_foreign_keys; 512 INFO:unused_index; 311 WARN:multiple_permissive_policies. Cần review bảo mật/hiệu năng theo scope; không phải số lỗ hổng đã xác nhận và không xóa index theo fixture.

## Phần còn lại

- Tranh chấp hai tiến trình luân chuyển, giới hạn budget theo replica, mount/UID trên đúng profile triển khai và runtime đọc output sau atomic rename.
- Config/inventory/release artifact cho từng cụm; browser → Control → cụm. Chưa bật trên database đang phục vụ.
- BG02 security/rollback/orchestration; BG03 inventory/quota; BG04 signup→email→staff; BG05 phần console khác; BG06 full integrated/rebuild cùng nguồn.
- BG07–BG11: staging Linux/HTTPS, offsite clean-host restore, web/Android E2E, tải/chi phí và pilot tối thiểu 7 ngày. Không cam kết 1.000 khách sạn hoặc 100.000 concurrent users từ bài kiểm này.

Giữ 25 task/70 ca/124 lượt và 122 release entries chưa xác nhận. Không thay actual/reviewer/signoff trong hồ sơ nghiệm thu gốc. [Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md).
