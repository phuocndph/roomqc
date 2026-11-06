# BG03/T10 — Realtime: kiểm kê và diagnostic local, 30/10/2026

Đã bổ sung kiểm kê theo đúng image Realtime v2.143.3, đọc cấu hình tenant đã lưu bằng RPC của node hiện hành và kiểm đường dữ liệu thực. **Realtime vẫn unresolved; chưa nhận tổng sức chứa hoặc triển khai VPS.** [Packet](../../../artifacts/roomqc-resource-realtime-local-2026-10-30.json).

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Source | 407 tệp; SHA256 be4ab72cc2692bd29be4a8c8528b95dbab90bd95f0a5a51a2a2a145bae7e788c; checkout/snapshot khớp đầu–cuối |
| Control | 640 đạt /0 lỗi /226 bỏ qua, 866 tổng; exit0 |
| Windows focused | 160 đạt /0 lỗi /3 bỏ qua; exit0 |
| Linux focused | 160 đạt /0 lỗi /3 bỏ qua; UID1000/read-only/networknone/dropALL; exit0 |
| Native Realtime | 50/50; đủ590migration; run f4764fbb2d9a; exit0 |
| Schema đầu/cuối | 6d8937bfc6b3d3639d98923860bfba0ef36d2e516ddd3631812f7a8217f7be27 |
| Cleanup độc lập | 0 container/network/volume của R1–R4; Linux R1/R3/R4 còn0 |

Không cộng các suite hoặc nguồn khác nhau thành số nghiệm thu sản phẩm. Skip không tính đạt: Windows bỏ hai bài Unix và monitoring render có gate; Linux bỏ hai Compose render và monitoring render. Đây là diagnostic scoped, chưa full-default hoặc independent rebuild.

## Đã thay đổi

- Catalog pin actual image và27 public source hashes. Inventory tách metadata/replica, discovery, Janitor, release/seed, tenant/process và phiên tạm; process/mount/loader ngoài recipe bị chặn.
- Helper tenant dùng đúng khóa `subcriber_pool_size` của SubscriptionManager, tách khỏi `subs_pool_size` của vendor readiness. Không lấy `DB_POOL_SIZE` làm tổng; không tính helper health chưa được gọi thành pool đang chạy.
- RPC chỉ dùng node đã chạy; snapshot có pool/boolean/hash, không xuất credential, host, DB hoặc tenant ID. Parser giới hạn256 tenant, từ chối extra/duplicate/invalid. Snapshot config tự nó không chứng minh pool đã nạp hoặc DB identity.
- PLAN vẫn exit2, `poolPlanVerified=false`, `plannedServerConnections=null`; consumer Control API bắt buộc và Realtime giữ unresolved. Không hạ replica hoặc tắt Janitor/discovery/seed để lấy xanh.

## Thực tế đã kiểm và hai vấn đề cần khép

1. Actual WebSocket join với Postgres changes và broadcast echo. Metadata đặt2 nhưng quan sát12sessions: metadata2, Connect1, manager1, subscriber4, RLS1, broadcast replication1, discovery2. Đây là mẫu runtime, không phải trần mọi tình huống. Observer max2 riêng, không tính vào Realtime.
2. Mười hai health calls đồng thời thành công và dùng lại Connect; không xuất hiện session `realtime_health_check`. Terminate replication thật, đợi PID cũ mất/PID mới xuất hiện và health phục hồi.
3. Đặt persisted `db_pool=3/subcriber_pool_size=2/subs_pool_size=99`: actual join bị từ chối đúng DatabaseLackOfConnections. Helper ước lượng110, requirement105 dù cấu hình cây dữ liệu là8sessions. Sửa riêng khóa readiness về2 trong fixture, invalidate cache/reload qua API: join/broadcast phục hồi, quan sát Connect3/subscriber2, metadata vẫn2. Không nới max_connections/quyền runtime.
4. Restart cùng container image với baseline `SEED_SELF_HOST=true`: persisted pool override bị mất, quay về Connect1/subscriber4; kênh dữ liệu hoạt động lại. PLAN gắn blocker reseed. Chưa có lifecycle bootstrap vận hành được nghiệm thu để bảo toàn tùy chỉnh này.

Trong phiên bản này tenant TLS khi bật đi qua `verify_none`; không thể suy peer verification từ CA metadata hoặc DB_SSL. Tenant Realtime là Supabase project, vẫn có thể chứa nhiều khách sạn RoomQC.

## Phạm vi còn mở

Cần khép lifecycle bootstrap và thống nhất readiness/actual tenant settings; inventory mọi target/role/process thực và dependency discovery, startup/Janitor/dashboard/teardown/maintenance concurrency, slots/WAL, old/new rollout và phiên đang đóng. Còn live Compose/TLS/DB identity, CPU/RAM/IO/disk/network, quota/admission/fairness và các vendor khác. Không chuyển mẫu12sessions thành operating limit hoặc hard ceiling.

Sau các ca thử, đã ghi delta catalog, dừng đúng container Realtime fixture và xóa duy nhất publication vendor được chứng minh chưa tồn tại lúc vào. Kiểm fingerprint đầy đủ vẫn bắt buộc khớp; không bỏ qua hoặc sửa hàm fingerprint để xanh. Đây chỉ là dọn fixture, không xóa publication của hệ thống đang phục vụ.

Không đổi migration/SQL sản phẩm hoặc runtime đang phục vụ. BG02–BG11, full-default/rebuild, VPS/DR, web–Android E2E/tải/chi phí/pilot≥7ngày và122mục release vẫn chưa hoàn tất. Không cam kết1.000khách sạn/100.000người đồng thời.

## Lịch sử giữ lại

- R1/4f79: fixture gọi UPDATE bằng role postgres không có quyền metadata; exit1, cleanup0. Sửa caller fixture sang owner sẵn có, không cấp quyền runtime.
- R2/59a6:17kiểm actual ban đầu đạt; fixture mong join thành công với hai khóa pool lệch nhau, bị vendor guard từ chối. R3/R4 giữ chính trường hợp đó làm negative control và kiểm recovery khi sửa khóa. Exit1/cleanup0; không chuyển proof nguồn cũ thành final.
- R3/5e3f:50ca actual đạt nhưng schema guard phát hiện publication broadcast mới của vendor; run vẫn exit1/cleanup0. R4 khép dọn fixture có ownership rồi kiểm lại toàn fingerprint, không nới guard.

[Runbook](roomqc-resource-vendor-runbook.md) · [Tiến độ](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ](roomqc-vps-signup-execution-dossier-2026-10-29.md).
