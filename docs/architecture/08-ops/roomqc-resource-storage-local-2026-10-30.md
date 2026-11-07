# BG03/T10 — Storage: allocation và kiểm tích hợp local, 30/10/2026

Đã bổ sung recipe kiểm cấu hình Storage theo đúng image v1.81.0 đã pin, giữ rõ đây là allocation cấu hình, chưa phải trần session tuyệt đối hoặc nghiệm thu VPS. [Packet](../../../artifacts/roomqc-resource-storage-local-2026-10-30.json) lưu nguồn, log, phạm vi và lịch sử.

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Source | 402 tệp; SHA256 a95c99fb2d54cd5ecb39ff1b2ddfd6b356d297a1ba19a1eda91e2bf1ed65c067; snapshot/checkout khớp đầu–cuối |
| Control | 633 đạt /0 lỗi /226 bỏ qua, 859 tổng; exit0 |
| Windows focused | 153 đạt /0 lỗi /3 bỏ qua, 156 tổng; exit0; setup/summary Compose render đạt |
| Linux focused | 153 đạt /0 lỗi /3 bỏ qua, 156 tổng; exit0; UID1000, root read-only, networknone, dropALL |
| Storage HTTP/database thực | 27/27; 590 migration; run b85b20a916f0; exit0 |
| Schema đầu/cuối | 6d8937bfc6b3d3639d98923860bfba0ef36d2e516ddd3631812f7a8217f7be27 |
| Cleanup độc lập | 0 container/volume/network của native cuối và các lượt lịch sử; Linux/audit container còn 0 |

Không cộng các suite hoặc nguồn khác nhau thành số nghiệm thu sản phẩm. Skip không tính đạt: Windows bỏ hai bài riêng Unix và monitoring render có gate; Linux bỏ hai Compose render và monitoring render. Native là diagnostic scoped, không phải full-default hoặc independent rebuild.

## Thay đổi sản phẩm

1. Catalog mới supabase-selfhosted-v0-8-3-resource-review-20261030 bổ sung image Storage và 19 public source hashes. Source commit f31599e188d7c9c854b1daa76a11b41c6d179462; actual image chứa pg8.23.0/pg-listen1.7.0, không có /app/.env. Đây không là independent source-to-image provenance.
2. Chỉ nhận Node entry point đã review, một worker, một project/database cố định và đúng một data mount. Single-tenant của Storage là một Supabase project, vẫn phục vụ nhiều khách sạn RoomQC. Không đổi cấu hình Storage đang phục vụ.
3. Main pool max M cộng một listener và dự phòng một migration khởi động: allocation M+2 mỗi replica. Main pool không được dùng làm tổng. Alias multi-tenant/queue, vector/analytics, DSN phụ, loader, query-cancellation hoặc mount khác recipe bị chặn; image ngoài recipe vẫn unresolved.

## Kiểm chứng thực

- Actual Storage tạo bucket riêng, upload/read tệp private, từ chối request không ký; sau restart container thật vẫn đọc đúng byte, rồi xóa dữ liệu fixture qua HTTP.
- Giữ lock bảng bucket và gửi 12 request đồng thời với header tenant/host giả: quan sát hai main sessions bị chặn, một pubsub; request còn lại chờ và cả12 trả thành công sau nhả lock. Không mở thêm tenant pool trong cửa sổ được lấy mẫu.
- Terminate listener thật, đợi PID cũ biến mất và PID mới xuất hiện; HTTP phục hồi và allocation steady state trở lại. Không chỉ suy reconnect từ số lượng session bằng1.
- PLAN dùng service từ Compose vendor thật đã render; projection chỉ Storage. API quản trị bắt buộc vẫn có allocation và giữ unresolved vì diagnostic không launch/attest nó. Không xóa consumer hoặc nới budget validator để xanh. Fixture observer riêng max2 không tính vào Storage.

## Giới hạn và việc nhận tiếp

pg-listen gọi end() mà không await khi reconnect. Vì vậy M+2 là allocation cấu hình, **không chứng minh trần session server trong mọi lỗi mạng, phiên đang đóng hoặc rollout chồng nhau**. Native chỉ quan sát saturation và một lần forced reconnect; startup migration được tính từ source, chưa đo toàn bộ cửa sổ startup/network-fault. Live Compose/TLS/DB identity binding và mọi consumer trên host còn thiếu.

Không đổi SQL/migration, dữ liệu đang phục vụ hoặc quyền production. Realtime/Meta/Supavisor/Functions/Studio/gateway/imgproxy/database/maintenance, CPU/RAM/disk/inode/WAL/IO/network và quota/admission/fairness còn mở. BG02, BG04–BG11, full-default/rebuild, VPS/DR/web–Android E2E/tải/chi phí/pilot≥7ngày và122release entries chưa hoàn tất; không cam kết sức chứa1.000khách sạn/100.000người đồng thời.

## Lịch sử giữ lại

- R1 b1615be017d57c69b6efa97e583752d7d112bd10ab8e8adb72d0bfa4d94d813f: fixture bỏ allocation Control bắt buộc; bị chặn trước DB, exit1, cleanup0.
- R2 4e5022f4997ed299d06cf8648b4c302651b94fddb4a554d1dd445a343ffab7fb: đủ590migration nhưng import thư viện fixture sai đường dẫn; exit1, cleanup0.
- R3 38a2bbf679c2e3bd155d12142d3f86f82f105268d990dbceacb044b3056b334f:26checks đạt; được thay bằng R4 có proof listener PID thay thế rõ ràng. Không chuyển kết quả nguồn cũ thành proof nguồn cuối.

[Runbook](roomqc-resource-vendor-runbook.md) · [Tiến độ](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md).
