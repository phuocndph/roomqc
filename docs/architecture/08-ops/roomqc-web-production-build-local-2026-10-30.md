# RoomQC — kiểm build web production, 30/10/2026

Build exit 0; nguồn và cấu hình không đổi trước/sau: 1612 tệp, SHA256 f00b76be194b0b1cbac23d8d2785ca25d171017245646af9c9493a193397d7ad. Tạo 403 tệp output tại thư mục thử riêng, không thay bản đang phục vụ. [Biên nhận](../../../artifacts/roomqc-web-production-build-local-2026-10-30.json).

Phát hiện WEB-INITIAL-BUNDLE-01 còn mở: vendor 14158154 byte, gzip 4717811 byte, nằm trong modulepreload của index.html. Cấu hình hiện gom toàn bộ node_modules vào một chunk. Vite cũng báo chunk lớn; PWA precache được ghi trong log build. Có rủi ro tải và xử lý chậm lần đầu, đặc biệt trên điện thoại/mạng chậm; chưa đo thời gian thực trên thiết bị hoặc đường truyền.

Cần giảm thư viện nặng tải ngay và kiểm bản production bằng trình duyệt. Chú thích cấu hình ghi nhận rủi ro vòng phụ thuộc/TDZ khi chia chunk trước đây; không sửa bằng cách che cảnh báo hoặc chỉ đổi giới hạn kích thước. Khi thay cấu hình phải đo trước/sau, thử đăng nhập, onboarding và các trang có export/tài liệu.

Build thành công không thay typecheck, E2E, TLS nhiều cụm, staging hoặc nghiệm thu sản phẩm. Biên nhận web có hash riêng; checkpoint backend 423 tệp không đại diện toàn nguồn giao diện.

[Typecheck bổ sung](roomqc-web-typecheck-local-2026-10-30.md) sau đó đạt exit 0, không lỗi, trên cùng nguồn web 1.612 tệp/hash f00b76be194b0b1cbac23d8d2785ca25d171017245646af9c9493a193397d7ad và không đổi nguồn/cấu hình trước–sau. Giữ nguyên các tùy chọn hiện hành, gồm strict=false. Gói tải ban đầu và browser E2E vẫn mở.
