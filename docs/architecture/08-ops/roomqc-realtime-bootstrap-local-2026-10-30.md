# BG03/T10 — Realtime: bootstrap bền vững và đồng nhất pool, 30/10/2026

Đã sửa hai vấn đề của image được kiểm: seed xóa/tạo lại tenant khi restart và lệch hai trường subscriber pool. Bản tích hợp mặc định dùng image dẫn xuất mới; overlay triển khai và builder được lưu trong repository. **Đạt kiểm thành phần local; chưa nghiệm thu toàn bộ VPS/signup.** [Packet](../../../artifacts/roomqc-realtime-bootstrap-local-2026-10-30.json).

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Nguồn | 415 tệp; SHA256 9bcca583f579b3b984af4b26cbb5c20ff2c37fc34d6bbb8eb8f18114e37846c0 |
| Control | 640 đạt / 0 lỗi / 226 bỏ qua; exit0 |
| Windows | 160 đạt / 0 lỗi / 3 bỏ qua; exit0 |
| Linux | 160 đạt / 0 lỗi / 3 bỏ qua; UID1000/read-only/networknone/dropALL; exit0 |
| Tiếp nhận cấu hình upstream | 80/80; run f8113408a9d6; 590 migration; exit0 |
| Cài mới | 97/97; run 1e088c071945; 590 migration; exit0 |
| Nguồn/fingerprint | Checkout/snapshot khớp cuối; business schema và catalog guard metadata khớp đầu–cuối trong từng lượt |
| Cleanup | Kiểm độc lập 0 container/network/volume cho mọi lượt native và các container Linux |

Skip không tính đạt. Hai lượt native dùng fixture/database độc lập; không cộng thành một lần nghiệm thu sản phẩm. Đây không phải full-default hoặc independent rebuild toàn hệ thống.

## Cơ chế đã đưa vào code sản phẩm

- Dẫn xuất đúng image Realtime v2.143.3; giữ entrypoint, metadata/tenant migration, Janitor/discovery và các đường dữ liệu. Thay seed hủy bản ghi bằng create-if-missing/preserve-existing.
- Giữ ID, JWT, credential database, giới hạn người dùng, cờ rollout và cấu hình không liên quan. Sai target/JWT/TLS hoặc pool không hợp lệ làm startup dừng; không tự sửa credential để vượt kiểm tra.
- Đồng bộ subscriber thực và readiness trong changeset API trước khi trả struct/cập nhật cache, đồng thời dùng invoker trigger cho SQL writers. Không thêm quyền runtime hoặc SECURITY DEFINER.
- Session advisory lock tại database giữ qua bootstrap và migration/Janitor. Build context không chứa secrets; mỗi lượt build có tag tạm riêng, tránh hai exporter cùng ghi một tag.
- Có builder, Compose overlay và [runbook](roomqc-realtime-bootstrap-runbook.md). Source binding bao phủ Dockerfile, Elixir, SQL, Compose và builder; toàn bộ code mới nằm trong snapshot kiểm.

## Thực tế đã kiểm

1. Cài mới tạo một project; tiếp nhận bản upstream đang có tùy chỉnh 3/2 và readiness sai99 sửa về2, giữ nguyên dữ liệu cấu hình được bảo vệ.
2. WebSocket/Postgres changes và broadcast hoạt động; health đồng thời và actual replication reconnect được kiểm ở cài mới. API resize trả struct và cache có hai khóa bằng2, invalid0 trả422 và không đổi row; join/broadcast vẫn hoạt động không cần sửa cache thủ công.
3. Restart cùng product image vẫn giữ pool3/2, tenant ID, credential, giới hạn và flag. Bootstrap không đặt lại chúng về mặc định.
4. Sai target, sai JWT, env pool0 và guard bị vô hiệu hóa đều dừng. Sau khôi phục guard, bootstrap chạy lại được và không đổi protected state.
5. Hai seed process độc lập đều được quan sát chờ sau session lock thật; hoàn thành không tạo trùng. Một seed được quan sát commit rồi kẹt tại Janitor do lock fixture; SIGKILL exit137, retry thành công và giữ dữ liệu/identity.
6. SQL không lưu được hai khóa lệch nhau; sai kiểu pool bị từ chối. Function/trigger definition, quyền và trạng thái trong metadata được hash riêng, không mượn business fingerprint làm bằng chứng bao phủ metadata.

Chỉ dọn publication/guard do fixture chứng minh tạo ra; cài mới giữ guard đã có lúc vào, adoption dọn guard được thêm trong lượt. Không đổi migration nghiệp vụ hoặc hệ thống đang phục vụ.

## Các lượt trước giữ làm lịch sử

R1 gặp xung đột tên hàm với macro Ecto. R2/R3 phát hiện dùng toán tử boolean strict với bản ghi feature flag; transaction rollback và đã sửa. R4 adoption đạt79 nhưng cài mới bị hai build tranh chấp tag; R5 dùng tag tạm riêng và kiểm lại cả hai. Một lượt Linux R1 lỗi thiếu mountpoint trong snapshot fixture; R1b đã kiểm lại. Các log/packet gốc được giữ; không chuyển số test nguồn cũ sang nguồn cuối.

## Còn mở

Catalog resource PLAN vẫn chỉ nhận recipe vendor đã review; image dẫn xuất chưa được đưa vào một recipe PLAN đầy đủ. Không bỏ qua kiểm image hoặc tự cấp trạng thái verified. Còn inventory mọi target/process và session tạm/đang đóng/rollout, TLS tenant peer verification (đường vendor hiện dùng verify_none), CPU/RAM/IO/disk/WAL, admission/quota/fairness và các vendor khác.

Còn BG02 review/retire/upgrade-rollback, BG04 signup→inbox→hotel→staff, BG05 console, BG06 full-default + rebuild cùng nguồn, BG07–BG11 VPS/HTTPS/DR/E2E web–Android/tải/chi phí/pilot≥7ngày. 122 mục release và các gate/signoff giữ mở; không cam kết sức chứa 1000 khách sạn/100000 người đồng thời.

[Tiến độ](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md).
