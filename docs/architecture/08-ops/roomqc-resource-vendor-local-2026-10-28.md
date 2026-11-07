# T10.b — ngân sách kết nối Auth và PostgREST, kiểm local

Ngày 28/10/2026, Asia/Bangkok. Phạm vi toàn bộ VPS + signup; đầu ra plan + nghiệm thu. **Chưa khép T10 hoặc nghiệm thu VPS.** [Runbook](roomqc-resource-vendor-runbook.md) giữ cách chạy và giới hạn.

## 1. Đầu ra đã có

`resource-vendor-catalog.mjs` ghi phiên bản, commit và hash nguồn công khai đã review; `resource-vendor.mjs` ghép native plan với Auth/PostgREST theo image digest cụ thể. CLI chỉ resolve Compose và kiểm kế hoạch, không khởi động service, kết nối DB hay gọi provider.

Auth bắt buộc khai báo pool hữu hạn, idle cap hợp lệ và tắt percentage override. PostgREST bắt buộc pool tường minh, tắt cấu hình ghi đè từ DB, khai báo listener; khi listener bật phải cộng thêm một kết nối mỗi replica. Cộng replica qua nhiều project, so budget/hash và từ chối image/process/config sai.

Realtime, Storage, Meta, Functions, Supavisor và các đường chưa có adapter đầy đủ giữ `unresolved`; không tính phần chưa biết thành 0. `PG_META_DB_MAX_CONNECTIONS=1` chưa chứng minh giới hạn tổng vì có đường tạo pool theo request. Supavisor cần tách metadata pool, tenant/role/database/mode server pools, auth queries và overlap; client slots không phải server connections.

## 2. Bằng chứng đã chạy

Source backend **229 file**, SHA-256 `3db1ab2e339d17018ee6547a189e2b43b0e8414f88a1237a7c919948c08755b3`.

| Kiểm | Kết quả và phạm vi |
|---|---|
| `node --test server/control/resource-vendor.test.mjs` | 15/15 pass; exit 0, không skip/cancel. Đây là kiểm plan/CLI với resolver fixture |
| [Auth/PostgREST/PostgreSQL thật, Docker riêng](../../../artifacts/roomqc-resource-vendor-live-2d3fa2fbb446-local-2026-10-28.json) | 7/7 controls, exit 0; source trước/sau không đổi, `verified=true` |
| Auth: 20 yêu cầu chờ khóa bảng | Có đúng 3 kết nối bị chặn; mở khóa thì mọi yêu cầu trả lỗi đăng nhập hợp lệ, không tạo user hoặc gửi email; yêu cầu tiếp theo hoạt động |
| PostgREST: 20 yêu cầu chờ khóa bảng | 2 kết nối xử lý + 1 listener; 18 yêu cầu hết thời gian chờ trả HTTP 504/PGRST003, 2 yêu cầu thành công sau mở khóa; marker không đổi |
| Restart Auth/PostgREST | Health và truy vấn phục hồi, cap vẫn đúng; CLI vẫn báo kế hoạch partial |

Live fixture dùng image Auth `v2.197.0` và PostgREST `v14.18` theo digest trong catalog. Không suy ra tương thích với PostgREST `v16.4` của stack local thường trực. PostgreSQL là fixture riêng, endpoint chỉ publish loopback, tài khoản Auth/REST riêng và không có cấu hình SMTP/provider. Không đụng dữ liệu khách đang dùng.

## 3. Lịch sử kiểm chưa đạt

Giữ nguyên các artifact rehearsal: `350493e7a9de` dừng ở prepare; `821d0ed6f92c` dừng ở database_start; `f3d5a916ea57` dừng ở rest_saturation. Cả ba exit 1, không được ghi là pass. Fixture bridge sau đó xử lý vấn đề Docker Desktop không đi được published port của network internal; đây không phải proof egress isolation.

Lượt thứ ba kỳ vọng HTTP 503 cho pool timeout. Mã nguồn đúng commit PostgREST và log thực cùng xác nhận HTTP **504/PGRST003**; đã sửa assertion fixture, kiểm cả status lẫn error code. Không thay hành vi server hoặc nới giới hạn pool để làm test đạt.

## 4. Cleanup và giới hạn

Lượt đạt còn **0 container / 0 volume / 0 network** theo nhãn sở hữu chính xác. Fixture/log riêng được giữ lại; không đưa env/DSN/password vào báo cáo hoặc copy sang hồ sơ chung. Không xóa thư mục dự án, reset DB hay mở đăng ký công khai.

Đây là bằng chứng finite pool và phục hồi trong local. Chưa có consumer runtime/DSN binding tới [đích DB đã đo](roomqc-resource-database-local-2026-10-28.md), source-to-image provenance độc lập, all-worker proof, stack đầy đủ, ngân sách rolling upgrade, Linux VPS/TLS hay tải dài hạn. Hai mươi yêu cầu chờ không phải bằng chứng 20 người dùng, 1.000 khách sạn hoặc 100.000 phiên đồng thời.

70 ca sản phẩm vẫn `not_run`, 122 mục release vẫn `unverified`; reviewer, signoff và gate giữ nguyên. Test local không tự ký C05–C10 hoặc G04–G06.

## 5. Gói nhận tiếp, đầu vào và điều kiện nhận

| Thứ tự | File/đầu vào và thao tác | Đầu ra nghiệm thu |
|---|---|---|
| 1. Khép inventory vendor | Catalog, pinned Compose release thực tế và cấu hình process; review Realtime/Storage/Meta/Functions/Supavisor, exporter/tools/migration/backup | Mỗi đường đang dùng có cap, replica, fixed connections và DB/pooler đích; đường chưa chứng minh giữ unresolved; phiên bản khác phải review lại |
| 2. Bind consumer vào DB | `resource-vendor.mjs`, `resource-deployment-runtime.mjs`, `resource-database.mjs`, native secret references | Đối chiếu DSN process đã nạp với DB identity/settings thật; direct/pooler, credential rotation, restart/config drift có positive/denial/recovery; report không lộ secret |
| 3. Worker thực | Health/probe/alert/external booking entrypoints và runtime configs | Linux secret permissions, actual readiness, cached budget, role/replica mismatch, restart và phục hồi; không lấy proof API thay worker |
| 4. Ghép T10.b cùng candidate | Plan + runtime + DB + vendor/worker inventories; một source/config/image manifest | Phủ toàn bộ consumer và server budget; còn unresolved thì không gắn ready hoặc capacity verified |
| 5. T10.c–f và T23 | Host/headroom, queue/fairness, usage/quota, dataset/workload | Đo CPU/RAM/IO/disk/inode, counters atomic, noisy neighbor và soak; tách max-tested khỏi operating limit, rồi mới chọn số khách/cụm |

BE/OPS thực hiện, QA review bằng chứng; tên người nhận cần được điền khi giao việc. Trong lúc chờ VPS/key/quyết định thương mại, vẫn làm inventory, contract, fixture và bundle độc lập. Tiếp T11–T13 rồi các đợt còn lại theo dependency tại [bản bàn giao](roomqc-vps-signup-handoff-2026-10-28.md), không mở roadmap khác.
