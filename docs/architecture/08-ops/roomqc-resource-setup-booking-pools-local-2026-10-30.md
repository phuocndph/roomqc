# BG03/T10.c — pool khởi tạo và thông báo trên đầy đủ schema, 30/10/2026

Đã nối kiểm pool thực vào hai bộ thử native hiện hành, không tạo store/schema giả mới. [Packet](../../../artifacts/roomqc-resource-setup-booking-pools-local-2026-10-30.json) lưu nguồn, log, run và phạm vi. Đây là kiểm tích hợp local; chưa nhận toàn BG03 hoặc mục tiêu VPS/signup.

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Backend source | 399 tệp; SHA256 4cb8da68c8b8105f43534fefb85084d8eb31d8197a1bcf0b446b14f9475626c7; snapshot/checkout khớp đầu-cuối |
| Control | 630 đạt /0 lỗi /226 bỏ qua, 856 tổng; exit0 |
| Resource/runtime/source-binding Windows | 150 đạt /0 lỗi /3 bỏ qua; hai resource Compose render đạt |
| Resource/runtime/source-binding Linux | 150 đạt /0 lỗi /3 bỏ qua; UID1000, root chỉ đọc, networknone, dropALL |
| Native setup-worker | 60/60 đạt; run 9cf8798223be; 590 business +21 directory migration; exit0 |
| Native room-writers | 544/544 đạt, gồm 109 ca external notification; run 014dbd62587b; 590 business migration; exit0 |
| Cleanup độc lập | 0 container/volume/network của cả hai native và Linux; baseline role setup đã phục hồi |

Không cộng các suite hoặc checkpoint khác nguồn thành một số nghiệm thu. Skip không tính đạt. Hai bài riêng OS và một monitoring render có gate bị bỏ qua trên Windows; Linux bỏ hai Compose render và monitoring render. Bằng chứng health/probe/alert trước đó giữ nguồn và phạm vi [riêng](roomqc-resource-worker-pools-local-2026-10-30.md).

## Khởi tạo khách sạn

1. HTTP runtime sản phẩm dùng SetupWorkerStore và pool thật, giới hạn2, nối directory riêng qua proxy PostgreSQL thật. Profile/hash budget, database identity và LOGIN khớp quan sát catalog độc lập.
2. Thiếu quyền catalog: sample503 hữu hạn, không đổi directory, nghiệp vụ hoặc journal. Grant EXECUTE chỉ cho LOGIN fixture khôi phục sample200, không tạo thêm pool.
3. Khóa recovery bị thu hồi: pool sample vẫn200 nhưng ready503, không claim/ghi attempt. Catalog thành công không bỏ qua quyền nghiệp vụ.
4. Atomic rename khóa hợp lệ: tiến trình tiếp tục, đóng đúng dispatch; pool/hash database/process nonce giữ nguyên. Thu hồi khóa mới lại chặn readiness. Có kiểm snapshots không phát sinh effects do sample.

## Thông báo đặt phòng

1. Daemon Node thực đọc file config và budget local đã review, dùng BookingExternalWorker pool2. Chữ ký profile/hash, database identity và LOGIN khớp fixture admin độc lập.
2. Thiếu quyền catalog trả503; grant fixture cho sample200. Không thay dữ liệu nghiệp vụ hoặc gửi thêm HTTP. Endpoint sample không xuất hiện trên cổng readiness chính, không lộ DSN/token/tên LOGIN.
3. Kênh bị tắt: ready503 dù pool sample200. Check-only có thể chạy đồng thời daemon khi bật sampler nhờ listener cổng tạm riêng.
4. Thu hồi/khôi phục catalog: sample503→200 trong cùng daemon, không gửi lại. Hai thông báo tới receiver local có durable journal; SIGTERM exit0.

## Lượt phát triển giữ lại

Lượt r1 đạt setup60/60 trên nguồn 413231183cdf01233111d4ba77bd25bff1b9d401fd38b21f0f326e4f8bbfdf91, nhưng room-writers exit1 vì giả định thu hồi grant riêng là mất quyền catalog. Lượt r2 thêm PUBLIC REVOKE vẫn exit1: caller postgres chỉ có quyền đọc, không có EXECUTE WITH GRANT OPTION trên function catalog do supabase_admin sở hữu. Lượt cuối tách pool admin fixture max1 cho chuẩn bị/đối chiếu catalog; daemon vẫn chỉ nhận DSN worker hạn quyền. Có assertion quyền hiệu lực sau REVOKE và đối chiếu toàn bộ ACL với baseline sau restore. Hai log lỗi/source/ownership cleanup được giữ trong packet; không chuyển proof nguồn cũ sang nguồn cuối hoặc đổi runtime để ép test đạt. Snapshot r3 là bản nháp chưa chạy native, không dùng làm proof.

## Giới hạn và phần nhận tiếp

Chỉ sửa hai fixture native và tài liệu; không sửa worker runtime, SQL/migration hoặc ba hồ sơ nghiệm thu được bảo vệ. Không dùng database đang phục vụ, provider hoặc người nhận thật.

Quyền catalog là grant tường minh trên fixture, không phải quyền production được cấp sẵn. Budget chỉ mô tả allocation đang kiểm, chưa bao gồm toàn bộ overhead/consumer của sandbox. Setup runtime nằm trong runner; booking là process con thực. Chưa live Compose secret/bind inventory, TLS/custom CA, mọi session trong pool, proxy topology hoặc chứng thực nguồn→image độc lập.

Còn vendor/maintenance/summary ephemeral-client inventory, live deployment/network và tổng server; CPU/RAM/disk/inode/WAL/IO/network; quota/admission/fairness. BG02 review quyền/cutover/app rollback, BG04 signup→inbox→hotel→staff, BG05 console, BG06 full-default/rebuild và BG07-BG11 VPS/DR/web-Android E2E/tải/chi phí/pilot≥7ngày giữ mở.122 mục release chưa xác nhận không phải122 lỗi; chưa cam kết1.000khách sạn/100.000người đồng thời.
