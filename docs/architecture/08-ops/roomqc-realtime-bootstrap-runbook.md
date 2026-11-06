# RoomQC Realtime — cấu hình bền vững khi khởi động

Phạm vi: image dẫn xuất từ Realtime v2.143.3, commit `d46540b3a4a79113f40301d5e5cb690f41150b9b`. Đây là một phần của BG03; không tự xác nhận sức chứa toàn cụm, TLS hoặc đủ điều kiện mở khách thật.

## Hành vi

- Giữ entrypoint upstream và `SEED_SELF_HOST=true`, chạy metadata migration, tenant migration và Janitor. Thay seed xóa/tạo lại bằng bootstrap tạo khi chưa có và giữ bản ghi khi đã có.
- Giữ ID, JWT, thông tin database, giới hạn người dùng, cờ tính năng và cấu hình ngoài ba trường pool. Môi trường trỏ sai database hoặc JWT khác bản ghi hiện có khiến startup thất bại. Đổi database/JWT cần quy trình luân chuyển riêng, không coi khởi động lại là lệnh thay khóa.
- `ROOMQC_REALTIME_CONNECT_POOL` (mặc định 1) và `ROOMQC_REALTIME_SUBSCRIBER_POOL` (mặc định 4) chỉ áp dụng lúc tạo mới. Không ghi đè giới hạn đã lưu khi restart. Giá trị phải là số nguyên 1–10000; đây là kiểm hợp lệ, không phải khuyến nghị cấp 10000 kết nối.
- Chuẩn hóa `db_pool`, `subcriber_pool_size` (tên upstream có lỗi chính tả) và `subs_pool_size`. Khóa subscriber thực quyết định khóa readiness; không lấy trường readiness cũ làm cấu hình thực.
- API changeset đồng bộ cả kết quả trả về và cache. Trigger trên bảng metadata bảo vệ ghi SQL sau startup. Trigger chạy quyền người gọi, không thêm SECURITY DEFINER hoặc quyền runtime.
- Advisory lock ở database tuần tự hóa bootstrap độc lập, được giữ đến hết migration/Janitor. Chờ khóa tối đa 60 giây, quá hạn dừng và có thể khởi động lại. Lock tự nhả nếu session chết. Các kết nối tạm này vẫn phải đưa vào inventory toàn cụm.

## Dựng image và cấu hình triển khai

Tại repository đã kiểm:

```sh
node scripts/build-realtime.mjs
```

Lưu kết quả `imageId`, `sourceHash`, `baseImage`, các hash nguồn. Build context chỉ gồm Dockerfile và mã public; không đưa `.env`, khóa hoặc database vào build. Builder kiểm user `nobody`, entrypoint/CMD và nội dung seed được cài trong image.

Dùng `deploy/realtime/compose.yml` sau Compose upstream `self-hosted/v0.8.3`, đặt `ROOMQC_REALTIME_IMAGE` thành image ID vừa kiểm hoặc digest trong registry của bản phát hành. Không dùng tag thay đổi tùy ý. File overlay không chứa mật khẩu và không phải toàn bộ bộ cài VPS.

Trước áp dụng staging: sao lưu database và `_realtime` metadata; xác nhận image/dataset/target, ngân sách connection và rollback. Khi nhận adoption, phải dừng/recreate đúng dịch vụ Realtime cũ; không chạy seed upstream cũ sau bootstrap mới. Giữ image cũ làm bằng chứng nhưng không rollback về seed xóa tenant trên database đã nâng cấp.

## Kiểm sau cài/nâng cấp

1. Startup có `ROOMQC_REALTIME_BOOTSTRAP_READY`; readiness, WebSocket/Postgres changes và broadcast hoạt động.
2. Ghi lại ID/hashes cấu hình (không xuất JWT/password), đặt giới hạn tùy chỉnh, restart đúng image và kiểm các giá trị giữ nguyên.
3. Resize qua API bằng `postgres_changes_pool`, kiểm cache và stored keys khớp; sai kiểu/0 phải bị từ chối.
4. Kiểm database/JWT sai bị dừng mà không đổi dữ liệu. Không sửa credentials tự động để vượt qua kiểm tra.
5. Kiểm hai bootstrap đồng thời, dừng đột ngột rồi retry, nâng cấp bản ghi upstream cũ; kiểm fingerprint và dữ liệu trước/sau theo phạm vi release.

Không dọn trigger/function/publication trên database đang phục vụ. Dọn các đối tượng này trong diagnostic chỉ được phép khi đã chứng minh chúng do fixture của lượt thử tạo ra và chưa tồn tại lúc vào.

## Giới hạn còn mở

Tenant của Realtime là Supabase project, không phải từng khách sạn RoomQC. Nhiều khách sạn có thể dùng chung project theo quyền dữ liệu.

Đường TLS tenant upstream đang kiểm dùng `verify_none`; bản sửa này không nâng thành kiểm chứng chứng chỉ máy chủ. Số pool cấu hình không phải trần số session toàn hệ thống: còn discovery, migration, Janitor, dashboard, replication, rollout và session đang đóng. Không từ bản sửa này suy ra sức chứa VPS hoặc khả năng phục vụ 100000 người đồng thời.

Kiểm native cài mới/adoption và kết quả cuối phải lấy từ checkpoint đã hoàn tất trên đúng nguồn; việc dựng được image không thay cho nghiệm thu runtime.

### Kiểm image dẫn xuất trong PLAN

[Managed image đã kiểm local](roomqc-realtime-managed-image-local-2026-10-30.md) nhận riêng image bằng no-cache rebuild/immutable ID, từ chối label giả. [Runbook](roomqc-realtime-managed-image-runbook.md) giữ opt-in, mã kết quả và giới hạn. Các đoạn trước mô tả checkpoint lịch sử; toàn inventory/TLS/host capacity vẫn mở.
