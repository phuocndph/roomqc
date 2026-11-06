# Worker khởi tạo khách hàng — ngân sách triển khai và kiểm hồi quy, 30/10/2026

Đã nối provisioning-worker vào resource PLAN, inventory native/vendor và runtime inspector. [Packet nguồn/kiểm thử](../../../artifacts/roomqc-provisioning-resource-a31487d3ec15-local-2026-10-30.json). Đây là kiểm local theo phạm vi; chưa nhận toàn BG03 hoặc sản phẩm.

| Kiểm | Kết quả trên cùng nguồn |
|---|---|
| Nguồn | 387 tệp; SHA256 30747b1f0c20a23c02fa1296eeefb1e1f1b9a43cda7305a13b050dfae227fba3; đầu–cuối khớp |
| Control | 601 đạt, 0 lỗi, 211 bỏ qua trên812; exit0 |
| Resource/setup Windows | 102 đạt, 0 lỗi, 2 bỏ qua trên104; gồm hai Compose render thực; exit0 |
| Resource/setup Linux | 102 đạt, 0 lỗi, 2 Compose skip trên104; UID1000/read-only/network none/drop ALL; exit0 |
| Native worker | 56/56 kiểm đạt; run a31487d3ec15; đủ590 migration; Auth/PostgREST/PostgreSQL thật; exit0 |
| Schema | 6d8937bfc6b3d3639d98923860bfba0ef36d2e516ddd3631812f7a8217f7be27; đầu–cuối khớp; không đổi migration nguồn |
| Cleanup | Kiểm độc lập native mới, native lỗi cũ và Linux:0 container/network/volume thuộc lượt thử |

## Hành vi đã bổ sung

- Nhận đúng command setup-runtime, working directory /app, UID1000/root readonly, drop ALL/no-new-privileges, secret DSN riêng và credential directory readonly tách metadata/public trust. Mount lồng nhau, code overlay, healthcheck tùy ý và môi trường tiêm lệnh bị từ chối.
- Đối chiếu pool/instances/otherAllocatedConnections với đúng directory budget/hash; một replica mỗi service, instanceId khác nhau giữa các worker. Muốn hai worker phải khai báo hai service/config và ngân sách tổng đúng; không scale cùng mã worker. Các consumer chưa phủ vẫn giữ unresolved.
- Runtime inspector chọn loopback8095, so image/process/env/mount/network/healthcheck và pool projection v1 đã nạp. Closed child probe thật đọc HTTP của product runtime; thay file budget không giả thành pool startup mới.
- PLAN chỉ mở setup/budget/public trust, kiểm chữ ký target theo trust đầu vào; không đọc DSN hoặc recovery token, không xác nhận authority hiện hành trong directory.

## Lỗi bộ kiểm thử đã xử lý

Lượt native45f16412b056 dừng trước migration đầu vì danh sách suffix cũ thiếu ba migration summary. Đã cập nhật đúng danh sách được review, giữ guard từ chối migration lạ; không sửa SQL/checksum hoặc nâng quyền tài khoản runtime. Hai migration thông thường chạy dưới postgres; migration quản trị summary kiểm bị từ chối dưới postgres, diễn tập lỗi22012 sau toàn body/history dưới supabase_admin và xác nhận schema/role/history hoàn tác trước khi áp thật. Lượt native mới đạt; giữ log/lượt lỗi ban đầu.

## Giới hạn và việc tiếp theo

Mỗi môi trường có102 bài đạt và2 bài bỏ qua, không phải104/104. Hai Compose skip Linux được chạy Windows; hai skip Windows là quyền tạo symlink và kiểm mode Linux. Không cộng hai môi trường hoặc native thành một lượt nghiệm thu sản phẩm.

Runtime inspector mới dùng Docker inspect doubles; HTTP worker dùng store/credential-transport doubles. Native worker là lượt kiểm SQL/API thật riêng, không phải inspector chạy qua live Compose bind deployment. Projection v1 không có hash toàn setup config/instanceId/DSN; chưa chứng minh đích vật lý của dịch vụ từ pool/hash.

Còn BG02 quyền gián tiếp/old-service/upgrade rollback; BG03 toàn inventory/vendor/maintenance/DB binding/host/quota/fairness; BG04 signup→email→hotel→staff; BG05 console/browser→Control→cụm; BG06 full integrated candidate/rebuild; BG07–BG11 VPS/HTTPS, offsite clean-host recovery, web/Android E2E, tải/chi phí và pilot≥7 ngày.122release entries chưa xác nhận, không phải122lỗi; không có product/VPS signoff hoặc sức chứa1.000khách sạn/100.000người đồng thời.
