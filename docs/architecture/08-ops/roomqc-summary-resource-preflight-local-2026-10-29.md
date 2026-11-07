# BG03/T10 — ngân sách hai database của tiến trình đổi khóa tổng quan

Ngày 29/10/2026. Đã nối tiến trình đổi khóa summary vào bộ kiểm kế hoạch tài nguyên native và native/vendor. Mỗi tiến trình được tính một kết nối ở cả directory và business; thiếu khai báo không được coi là 0. [Packet nguồn và kết quả](../../../artifacts/roomqc-summary-resource-preflight-local-2026-10-29.json). Đây là PLAN, chưa phải kiểm tiến trình đang chạy, VPS hoặc sức chứa.

## Kết quả cùng nguồn

| Kiểm | Kết quả |
|---|---|
| Nguồn | 382 tệp, SHA256 `1b958ab2ea95b69b875d851f62524b63dad682bb2a6677a2d6e51dba39a4bfaa`; đầu–cuối khớp |
| Toàn control | 586 đạt, 0 lỗi, 211 bỏ qua trên 797; exit0. Skip chưa đạt |
| Tập trung Windows | 55/55 đạt, gồm native plan/runtime guards/vendor và Compose thực tế chỉ render |
| Linux riêng | 53 đạt, 0 lỗi, 2 Compose skip; UID1000, root read-only, cap_drop ALL, NoNewPrivs, network none; exit0 |
| Docker | Container Linux tự dọn; kiểm ownership label độc lập còn0; Compose chỉ config, không tạo stack |
| Hồ sơ bảo vệ | Ba checksum ledger/worksheet/execution plan giữ nguyên; không cấp actual/reviewer/signoff |

Hai bài Compose skip trong Linux đã chạy ở Windows; không đổi skip thành Linux pass. Lượt r3 của tập trung bị lỗi vì fixture mới thiếu vendorCatalogId bắt buộc. Đã sửa fixture, giữ guard và log lỗi; r4 đạt55/55.

## Hành vi đã bổ sung

1. Adapter `summary-credential-rotation` kiểm đúng command/image/environment, policy và budget hash; pool max1/fixed0/replicas khớp trên cả hai database. Projection v2 giữ hai DB trong `databases[]`.
2. Bộ tổng hợp native/vendor cũng tính cả hai DB, cùng pool Auth trong bài tích hợp. Đã sửa vòng tổng hợp cũ chỉ đọc một database/consumers, vốn không xử lý projection mới.
3. Chỉ một replica mỗi service; hai rotator thường trực cần hai service, instanceId và issuer/observer LOGIN riêng. Kiểm trùng LOGIN theo systemIdentifier+role, không theo database vì PostgreSQL role là cấp server.
4. Private/journal/output không trùng hoặc lồng nhau sau realpath; cả tên con bắt đầu bằng hai dấu chấm vẫn bị nhận diện là bên trong. Private/policy read-only, output/journal tách; không mở DSN, key, trust hoặc bearer để kiểm plan.
5. Các CLI installer/issuer đã khai báo giữ chỗ nhưng chưa có mapping vẫn unresolved. Không xóa hoặc tắt chúng để cho toàn stack đạt.
6. CLI runtime trả `RESOURCE_RUNTIME_ADAPTER_UNSUPPORTED` cho summary trước resolve/inventory/probe. Chưa có projection đã nạp trong bộ nhớ, không đọc lại file để giả chứng minh process hiện hành.

[Runbook PLAN](roomqc-resource-deployment-preflight-runbook.md) và [giới hạn runtime](roomqc-resource-deployment-runtime-runbook.md) đã cập nhật. Compose summary bổ sung `working_dir: /app` để khớp cấu hình tiến trình được review; không khởi chạy profile hoặc sửa database đang phục vụ.

## Phạm vi và việc nhận tiếp

So checkpoint [73/73 native](roomqc-summary-contention-mount-local-2026-10-29.md), đợt này đổi/thêm 7 tệp thuộc resource tooling/test/Compose; không đổi SQL hoặc installer/daemon runtime. Native73 thuộc nguồn380/76c8, không tuyên bố đã chạy lại native trên nguồn382 mới. Danh sách và hash delta có trong packet.

Tiếp tục projection ngân sách đã nạp của summary và live image/profile, inventory/cap của mọi consumer, binding server thực, RAM/IO/disk/quota/fairness. BG02 quyền gián tiếp/orchestration/rollback, BG04 signup/email/staff, BG05 console, BG06 full integration/rebuild vẫn mở; BG07–BG11 cần staging/backup ngoài host/E2E/tải/chi phí/pilot≥7ngày. Không có chứng minh1.000khách sạn hoặc100.000concurrent.

122 mục release vẫn chưa xác nhận; không phải 122 lỗi. Không chốt nghiệm thu sản phẩm từ kết quả plan này.
