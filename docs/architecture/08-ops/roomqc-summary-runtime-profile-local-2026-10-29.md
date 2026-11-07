# BG03/T10 — cấu hình đã nạp của tiến trình đổi khóa tổng quan

Ngày 29/10/2026. Đã triển khai snapshot ngân sách hai DB/hash cấu hình trong bộ nhớ daemon, status loopback và nối native runtime inspector. [Packet nguồn và kiểm thử](../../../artifacts/roomqc-summary-runtime-profile-8b5e5a2ebc8c-local-2026-10-29.json). Chưa nghiệm thu VPS, toàn BG03/BG05 hoặc sản phẩm.

## Kết quả trên cùng nguồn

| Phần | Kết quả và phạm vi |
|---|---|
| Nguồn | 385 tệp; SHA256 `717b863fd806c47b27aa8aa450be443f57a77cf760b116be44efda2488c821ff`; snapshot và đầu–cuối khớp |
| Database | 590 migration; schema `6d8937bfc6b3d3639d98923860bfba0ef36d2e516ddd3631812f7a8217f7be27` phục hồi; migration bảo trì không cấp cho login nghiệp vụ |
| Native tích hợp | 76/76 đạt, exit0: SQL/CLI/daemon/Kong/PostgREST, reader mount và tranh chấp shared/separate caller |
| Daemon thường trực | ready200 sau native authority check; đổi policy→ready503/live200, snapshot không đổi, DB không có effect; restore policy→ready200 không restart; SIGTERM đóng endpoint và exit0 |
| Control | 590 đạt, 0 lỗi, 211 bỏ qua trên 801; exit0, cùng nguồn; skip chưa được tính là đạt |
| Tập trung Windows | 64/64 đạt, gồm Compose render thật, inspector doubles, HTTP và closed probe |
| Linux riêng | 62 đạt, 0 lỗi, 2 Compose skip trên 64; UID1000, root/source read-only, cap_drop ALL, network none; exit0 |
| Image/daemon thật | 9/9 đạt, image `sha256:9dd4be7b94e9b9c04cfde4347e289be59cd338d9cec110c2a78b614991c5af0f`, packaged production entrypoint và loader; signed fixture, unusable DB, network none, named volumes |
| ACL và dữ liệu | 44 bảng/snapshot giữ nguyên; 528 browser/probe denials, 164 private-service denials, 91 positive reads; tenant/staff/room/receipt không đổi |
| Cleanup | Kiểm độc lập ownership: native/image/Linux đều 0 container/network/volume; giữ image và source/log fixture có chủ ý |

Hai bài Compose skip trên Linux đã được kiểm ở Windows, không chuyển thành Linux pass. Bằng chứng76 và9 cùng source nhưng là hai môi trường/phạm vi khác nhau, không cộng thành một lượt nghiệm thu sản phẩm. Image9 dùng named volumes để giữ ACL Linux; không phải Compose bind profile deployment hoặc kết nối DB thật. Native76 dùng DB/PostgREST thật và test approval authority; không phải quyền production.

## Hành vi mới

- Endpoint chỉ bind `127.0.0.1:8097`; không mở host port. `/livez` kiểm process còn sống; `/readyz` kiểm chu kỳ gần nhất đã thành công và chưa drain.
- Snapshot v2 có hash budget, môi trường, hai DB/consumer/pool/replica và canonical hash policy+installer metadata. Tạo từ cấu hình đã được loader kiểm khi startup; endpoint không đọc lại tệp để giả thành cấu hình đang chạy. Hash không chứa nội dung DSN hoặc signer.
- Planner giữ POSIX paths khi tính fingerprint trên Windows; inspector so đúng image/command/mount/network, snapshot process và danh sách container trước–sau. Policy mới nhưng process cũ bị từ chối; test recovery phải đưa snapshot khớp mới qua.
- Closed Docker probe chỉ trả projection allowlist, chặn dữ liệu dư, DB trùng, hash lỗi và pool vượt1; không trả policy, command, ID credential, raw error, DSN/path/signer/token.
- `--once` không mở cổng. Signal đóng readiness/server và drain theo deadline hiện có; không tăng kết nối database cho status HTTP.

[Runtime runbook](roomqc-resource-deployment-runtime-runbook.md), [PLAN](roomqc-resource-deployment-preflight-runbook.md) và [credential lifecycle](roomqc-tenant-summary-credential-runtime.md) đã cập nhật. Checkpoint PLAN nguồn382 ghi runtime chưa hỗ trợ giữ làm lịch sử; bản này đã thay guard đó bằng projection và kiểm tương ứng.

## Lỗi fixture đã xử lý

Lượt image đầu `06e8e62c27b9` dừng sau2 kiểm vì Docker trả PortBindings là object rỗng thay vì null. Đã sửa assertion kiểm không có key/port; giữ packet lỗi và cleanup0. Lượt focused đầu thiếu replicas trong fixture projection; đã bổ sung đúng khai báo, không nới validator. Lượt cuối đạt như bảng.

Advisor 874 findings (42 INFO:rls_enabled_no_policy; 9 INFO:unindexed_foreign_keys; 512 INFO:unused_index; 311 WARN:multiple_permissive_policies): đầu vào review bảo mật/hiệu năng, không phải số lỗi hoặc lỗ hổng đã xác nhận. Chưa chứng minh mọi đường quyền gián tiếp.

## Việc còn lại theo toàn mục tiêu

Giữ checkpoint này, không lặp lại biến thể đã đủ proof trước khi chuyển nhóm việc: còn live bind Compose/profile và registry/VPS, inventory/cap mọi native/vendor/maintenance consumer, binding server thực, RAM/IO/disk/quota/fairness; BG02 indirect rights/orchestration/app rollback; BG04 signup→email→staff; BG05 console và browser→Control→cụm; BG06 full integration/rebuild cùng candidate. BG07–BG11 cần staging/HTTPS, offsite clean-host restore, web/Android E2E, tải/chi phí và pilot tối thiểu7 ngày.

Không thay dữ liệu đang phục vụ, không gửi provider hoặc triển khai VPS. 122 mục release vẫn chưa xác nhận; không phải 122 lỗi. Chưa chứng minh sức chứa 1.000 khách sạn hoặc 100.000 người dùng đồng thời; actual/reviewer/signoff/gates gốc giữ nguyên.
