# Nghiệm thu bộ quản trị chung tại local — 31/10/2026

Lượt `b98a421dc28f` kết thúc exit0; bốn dịch vụ thật chạy từ Compose do CLI sản
phẩm tạo: directory PostgreSQL16, control API, frontend và alert worker. Không
truy cập VPS Contabo, không sửa container đang phục vụ, không mở đăng ký thật.

Đã khép hai thiếu sót trong đường cài mới: đồng bộ danh sách cụm ban đầu để
API không lỗi `CONTROL_REGISTRY_MISMATCH`, và chuẩn bị bridge web có gateway
để frontend thực sự truy cập được qua cổng loopback. Container healthy chưa
được dùng thay cho phép kiểm HTTP từ ngoài project.

| Điều kiện | Bằng chứng của lượt chạy |
|---|---|
| Đúng database/owner trước khởi tạo | Sai OID, owner còn thiếu và DB có function riêng đều bị từ chối; không ghi marker khi bị từ chối |
| Directory schema và runtime roles | 27migration;2LOGIN độc lập; resume áp0migration; verify đạt |
| Giao diện/API cùng địa chỉ | `/healthz`, app shell trang quản trị và `/api/control/readyz` trả200 |
| Giữ giới hạn truy cập | Admin thiếu phiên trả401; signup trả503 `SIGNUP_CLOSED` |
| Quyền và TLS | API dùng TLS; không đọc được password hash hoặc tạo bảng |
| Khởi động lại | Bản ghi sentinel còn nguyên; directory verify vẫn đạt |
| Đóng gói đúng nguồn | Image control đã kiểm file/import; source hash đầu/cuối và hiện tại cùng khớp |
| Dọn môi trường thử | Container/network/volume đúng nhãn đều0; container khác không đổi thời điểm khởi động |

Kiểm tra tập trung:20bài,19pass/0fail/1skip. Hồi quy nguồn/ngân sách/triển khai:
62bài,59pass/0fail/3skip. Không cộng skip thành pass và không nhận là toàn bộ
database suite đã xanh. Các lượt lỗi trước đều được dọn riêng trước khi chạy lại.

Phạm vi chưa đạt: nhận khách qua browser trên bộ ghép này; health/setup worker
được nối backend thật; bộ cài chung qua SSH; cập nhật schema production; DNS/TLS
và renewal thật; email/alert delivery ngoài máy; backup offsite/restore; tải và
pilot. Alert worker hiện chỉ nghiệm thu idle readiness. Quản lý mua/gia hạn VPS
ở Contabo chưa được tự động hóa.

Chi tiết sử dụng: [Bộ cài quản trị](roomqc-management-bundle.md).
Biên nhận máy đọc: `artifacts/roomqc-management-bundle-local-2026-10-31.json`.
Mục tiêu VPS+signup tổng thể vẫn đang tiếp tục; `deploymentReady:false`.
