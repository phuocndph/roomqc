# BG03/T10.b — kiểm database từ credential cấu hình của dịch vụ, 30/10/2026

Đã bổ sung công cụ chỉ đọc lấy DSN từ đúng service Compose/secret đã qua PLAN, kiểm dưới LOGIN ứng dụng dự kiến rồi so với attestor độc lập. [Packet](../../../artifacts/roomqc-resource-consumer-targets-ac65ff19e9d8-local-2026-10-30.json) giữ source, log và giới hạn; [runbook](roomqc-resource-consumer-target-runbook.md) hướng dẫn chuẩn bị/chạy/xử lý lỗi. **BG03 và mục tiêu toàn VPS + signup vẫn chưa hoàn tất.**

## Kết quả trên cùng nguồn

| Kiểm | Kết quả |
|---|---|
| Nguồn backend | 391 tệp; SHA256 220d4f610155d9b3b8482ac93a066f97b8cd815515746a3b3f99d09c58e90b3e; frozen snapshot và checkout đầu–cuối khớp |
| Delta | 4 tệp mới, 2 tệp sửa; không đổi SQL/migration hoặc ba hồ sơ nghiệm thu được bảo vệ |
| Control mặc định | 617 đạt / 0 lỗi / 217 bỏ qua; 834 tổng; exit0, terminal handle28169 |
| Resource/setup Windows | 118 đạt / 0 lỗi / 2 bỏ qua; 120 tổng; hai Compose render đều chạy; exit0 |
| Resource/setup Linux | 118 đạt / 0 lỗi / 2 Compose skip; 120 tổng; UID1000, read-only, network none, drop ALL; exit0, handle63817 |
| PostgreSQL thật | 17/17 đạt; run ac65ff19e9d8; hai instance PostgreSQL16 pin digest; exit0, handle67304 |
| Cleanup độc lập | 0 container/network/volume thuộc cả native và ba lượt Linux; tệp credential database fixture đã xóa |

Không cộng các tổng khác môi trường thành số case sản phẩm được nghiệm thu. 217 bài Control bị gate và các bài skip không được coi là đạt. Checkpoint native worker56 trên590migration ngày30/10 trước đó vẫn thuộc nguồn387 riêng; suite PostgreSQL17 ở đây không dựng schema nghiệp vụ hoặc chạy Auth/REST server.

## Hành vi đã kiểm

- Chuẩn bị/kiểm toàn bộ DSN, readonly bind/Compose secret, role và suất kiểm trước kết nối đầu tiên. Không nhận DSN ứng dụng thứ hai tùy ý; không dùng attestor/service-role khi app credential thiếu quyền.
- Đọc hai lượt tuần tự, tối đa1 session. So lineage/database OID/tên, current/session role, recovery, read-only, cờ quản trị, giới hạn/max/reserve và restart; cộng mọi database cùng lineage để chặn ngân sách vượt server.
- Đọc lại hash file/metadata/budget và resolve lại Compose để phát hiện thay credential hoặc cấu hình giữa lượt kiểm. Report không chứa DSN/password/tên database vật lý/LOGIN.
- API, alert, Auth và REST có LOGIN PostgreSQL thật; cùng tên database/LOGIN trên một server độc lập khác vẫn bị từ chối. Thiếu quyền catalog hoặc CREATEDB ngoài dự kiến bị từ chối; khôi phục đúng cấu hình kiểm đạt. Marker dữ liệu giữ nguyên, các session kiểm đóng hết.
- CLI thật resolve hai Compose JSON qua Docker Compose rồi query PostgreSQL thật. Các PGHOST/PGUSER/PGDATABASE/PGPASSWORD/PGOPTIONS giả ở tiến trình gọi không đổi được target hoặc session.
- Health/probe có hai secret riêng; provisioning chỉ mở DSN, không đọc recovery credential; summary theo policy tới hai DSN riêng; booking không mở provider token và custom CA giữ unresolved. Các recipe bổ sung này dùng observation doubles, không phải tích hợp DB thật cho tất cả worker.

## Lỗi kiểm thử và phạm vi

Đã sửa fixture summary đặt sai tên file so với installer template; không nới kiểm mount hoặc quyền để lấy kết quả xanh. Linux lượt1 không khởi động được vì mountpoint con chưa tồn tại trên nguồn chỉ đọc; lượt2 thiếu mount dependency riêng của Control nên không import pg. Đã xác định đúng hai nguyên nhân, sửa runner/mountpoint, giữ log cũ; lượt3 đạt cùng nguồn sản phẩm391. Nguồn runtime không bị sửa giữa các lượt này.

## Phần vẫn phải làm

Công cụ kiểm credential trong **cấu hình**, chưa chứng minh pool đang chạy đã nạp credential đó hoặc checker ở cùng namespace mạng. Query đặt read-only cho phiên kiểm, không khẳng định runtime ứng dụng luôn chỉ đọc. Matching lineage không chứng minh host duy nhất hoặc endpoint trực tiếp; proxy theo LOGIN/transaction chưa được loại trừ. Cross-process concurrency của checker chưa có mutex; chỉ được chạy tuần tự bằng suất riêng. Quyền gián tiếp, TLS production/custom CA, vendor/maintenance inventory và source→image→pool binding vẫn mở.

Tiếp theo BG03: nối identity với pool/config đã nạp và namespace ứng dụng; khép đủ consumer/vendor/maintenance và tổng server; sau đó RAM/CPU/disk/inode/WAL/IO/network, quota/admission/fairness. BG02 review quyền/old-service/app rollback, BG04 signup→inbox→hotel→staff, BG05 console, BG06 final candidate/rebuild, BG07–BG11 VPS/DR/web-Android E2E/tải/chi phí/pilot≥7 ngày tiếp tục theo dependency. Không có product/VPS signoff hoặc cơ sở cam kết1.000khách sạn/100.000người đồng thời.

122 mục release vẫn chưa xác nhận; không phải122 lỗi. Reviewer/signoff/gates và hồ sơ nghiệm thu gốc giữ nguyên.
