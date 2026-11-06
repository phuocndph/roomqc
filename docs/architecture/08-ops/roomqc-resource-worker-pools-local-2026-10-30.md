# BG03/T10.b — pool giám sát, probe và cảnh báo trên database thật, 30/10/2026

Đã bổ sung kiểm tích hợp các pool worker trên đầy đủ cấu trúc directory hiện hành. Đây là bước tiếp theo sau [pool Control](roomqc-resource-loaded-pool-local-2026-10-30.md); [packet](../../../artifacts/roomqc-resource-worker-pools-63dc0e89a241-local-2026-10-30.json) lưu nguồn, log, image ID, bằng chứng và giới hạn. Chưa nghiệm thu toàn BG03 hoặc sản phẩm.

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Backend source |399 tệp; SHA256 bc2af45c1b3301c0e498a1ecc1589d5ae958ea6c516be41d48171601b284396c; snapshot và checkout khớp đầu–cuối|
| Control mặc định |630 đạt /0 lỗi /226 bỏ qua,856 tổng; exit0|
| Resource/runtime/source-binding Windows |150 đạt /0 lỗi /3 bỏ qua,153 tổng; hai resource Compose render đạt|
| Resource/runtime/source-binding Linux |150 đạt /0 lỗi /3 bỏ qua,153 tổng; UID1000,rootreadonly,networknone,dropALL|
| Database/container thật |26/26 đạt,0 bỏ qua; run 63dc0e89a241;21 ca catalog trước và5 ca worker mới|
| Image worker |sha256:f58fdd1b5e7e492886b69a6ad082e411e1d4cbefcfa3eb1f697520c62833dee5;241 file đã đọc lại và đối chiếu; Dockerfile/schema.sql trong source binding|
| Cleanup độc lập |0 container/volume/network của lượt thử, Compose Control và Linux; fixture credential đã xóa|

Không cộng các suite thành một số nghiệm thu. Hai bài riêng OS và một bài monitoring render có gate bị bỏ qua trên Windows; Linux bỏ hai Compose render và bài monitoring render. Các skip không tính đạt.21 ca catalog dùng schema tối thiểu;5 ca worker dùng toàn21 directory migration, không phải590 business migration hoặc full backend integration.

## Các điều đã chứng minh

1. Managed health khởi động bằng HealthStore và ProbeCredentialStore thực, hai pool riêng2/1 kết nối và LOGIN riêng. Readiness store xác minh schema/quyền. Listener lấy đúng pool của worker; hash LOGIN khác nhau và database identity giống nhau. Không có route nội bộ trên cổng status chính.
2. Chưa cấp canary: hai sample pool200, health live200 nhưng ready503/PROBE_CREDENTIAL_MISSING, không có số đo healthy được ghi. Catalog connection không tự cấp điều kiện nhận khách.
3. Thu hồi quyền pg_control_system của probe làm sample503 và loại client lỗi. Khôi phục đúng grant thì sample đạt trong cùng process, không đổi credential hoặc nâng quyền.
4. Cấp nhầm nhóm metrics cho probe hoặc SELECT workspaces cho alert làm readiness tương ứng bị từ chối. Sample catalog vẫn có thể200: công cụ này không thay kiểm đầy đủ graph quyền. Thu hồi grant dư thì kiểm quyền/alert readiness phục hồi.
5. Alert worker dùng pool thực max1, queue trống ready200. Dừng database thật: live200,ready503,sample503. Khởi động lại: cùng process nonce và database identity, server-start hash đổi,ready200. Không có delivery attempt hoặc provider request được tạo.
6. Build Dockerfile sản phẩm từ bản nguồn đã đóng băng. Đọc lại241 file đã copy vào image và so SHA256 chuẩn LF với manifest; lưu image content ID. Hai worker chạy UID1000,rootreadonly,dropALL,no-new-privileges, không publish app/status port; file config0400 thuộc UID1000 trên volume thử riêng; SIGTERM exit0.

Đã thêm Dockerfile và schema.sql vào tập nguồn bắt buộc của công cụ kiểm dựng lại; sửa các file này làm binding thay đổi. Không đổi byte SQL/migration hoặc ba hồ sơ nghiệm thu được bảo vệ. Các packet lịch sử giữ hash/phạm vi riêng.

## Lỗi môi trường thử đã sửa và giữ bằng chứng

Lượt dev1 dùng vùng dữ liệu tạm nên không giữ database qua stop/start; cổng publish ngẫu nhiên cũng đổi. Dev2 dùng named volume đã giữ đủ21 migration nhưng vẫn dùng cổng ngẫu nhiên. Bộ thử cuối dùng volume có nhãn ownership và cổng loopback cố định, kiểm port không đổi sau start. Hai log lỗi được giữ trong packet. Dev3 đạt5/5 thuộc nguồn trước;26/26 cuối mới là bằng chứng cho nguồn399. Không sửa worker runtime hoặc nới quyền để làm kiểm xanh.

## Giới hạn và phần nhận tiếp

Named-volume config là fixture Linux, chưa phải deployment Compose secret/bind thực hoặc CLI inventory cho hai worker. Không có TLS/custom CA, native Auth/REST/Storage/Realtime/Functions thành công hoặc cảnh báo tới người nhận thật. Image bytes khớp trên trusted local Docker; chưa là independent reproducible build/provenance toàn supply chain.

Hai sample không phủ mọi session/tương lai hoặc định tuyến proxy; lineage không là physical-host identity. Còn setup/booking native pools, summary ephemeral clients, vendor/maintenance inventory, đầy đủ budget, host capacity, quota/admission/fairness. BG02 review quyền/cutover/app rollback; BG04 signup→inbox→hotel→staff; BG05 console; BG06 candidate/rebuild; BG07–BG11 VPS/DR/web-Android E2E/tải/chi phí/pilot≥7ngày vẫn mở.122 mục release chưa xác nhận, không phải122 lỗi; không signoff hoặc cam kết1.000khách sạn/100.000người đồng thời.
