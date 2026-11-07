# RoomQC Realtime — cấu hình TLS

Phạm vi managed image từ nguồn được review; [bằng chứng local](roomqc-realtime-tls-local-2026-10-30.md). Không dùng chứng chỉ fixture hoặc secret từ log thử cho VPS.

1. Chuẩn bị CA tin cậy và server certificate hợp lệ cho đúng DB_HOST và mọi tenant db_host. Tên DNS/IP phải nằm trong SAN; không đổi tên xác minh sang một host khác để bỏ qua lỗi.
2. Dựng image RoomQC bằng node scripts/build-realtime.mjs. Khóa Compose vào imageID hoặc registry digest bất biến. Stock image cùng phiên bản không chứa bản sửa này.
3. Đặt DB_SSL=true, DB_SSL_CA_CERT=/run/roomqc-ca/ca.crt và mount thư mục CA vào /run/roomqc-ca chỉ đọc. Chỉ cần public CA ở mount client; private key thuộc phía database, không đưa vào Realtime.
4. Bật TLS phía database, kiểm quyền đọc CA của user trong image và quyền key phía server. Đối chiếu DB_HOST/tenant db_host/read-replica host riêng; không dùng tùy chọn bỏ verify hoặc fallback plaintext khi kết nối lỗi.
5. Dùng adapter realtime-managed và chạy consumer preflight với --verify-managed-builds từ đúng nguồn release. Thiếu mount/CA/config giữ admission đóng. Dù cấu hình TLS được nhận, PLAN còn unresolved thì không nhận sức chứa hoặc deployment ready.
6. Tại staging, kiểm kết nối thật, restart/reload/rotation, sai tên/sai CA/hết hạn và phục hồi. Chạy các fault trên fixture có ownership, không tráo chứng chỉ database đang phục vụ để thử. Luồng read-replica và nhiều node cần bằng chứng riêng.

Diagnostic local độc lập: node scripts/test-control-backend-sandbox.mjs --run --diagnostic realtime-tls. Lệnh tạo stack/PKI có ownership riêng, không port công khai hoặc provider thật; lưu bằng chứng nguồn, phiên TLS và cleanup. Không chạy scripts/test-control-local.mjs trên database đang phục vụ.

Khi đổi CA/chứng chỉ thực, lập thời gian overlap và rollback, theo dõi kết nối mới, xác nhận mọi process dùng CA mới rồi mới thu CA cũ. Proof reload/certificate switch trong fixture không tự nghiệm thu rotation sản phẩm nhiều node. Giữ old image/config và backup trước rollout; không downgrade verify để khôi phục dịch vụ.
