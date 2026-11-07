# RoomQC Realtime — kiểm image trong consumer PLAN

Phạm vi: kiểm riêng image Realtime RoomQC từ nguồn đã review; không thay inventory/runtime/TLS hoặc nghiệm thu VPS. [Bằng chứng local](roomqc-realtime-managed-image-local-2026-10-30.md).

## Chuẩn bị

Dùng đúng repository nguồn của bản phát hành và Docker hỗ trợ BuildKit/rewrite-timestamp. Dựng product image bằng `node scripts/build-realtime.mjs`, giữ image ID/sourceHash/baseImage. Trong manifest consumer PLAN, map đúng service sang adapter `realtime-managed`, dùng image ID `sha256:<64hex>` hoặc registry ref bất biến `repository@sha256:<64hex>`; Compose phải trỏ cùng image. Không dùng tag có thể đổi. Manifest giữ budget/hash và các project/service khác theo schema hiện hành.

## Kiểm

Mặc định, đọc cấu hình:

```sh
node scripts/control-backend-resource-consumer-preflight.mjs --manifest /absolute/path/resource-plan.json
```

Image managed giữ unresolved nếu chưa có dựng lại độc lập. Không chép proof hoặc source label vào manifest để vượt kiểm.

Khi chủ động cho phép dựng lại từ nguồn local:

```sh
node scripts/control-backend-resource-consumer-preflight.mjs --manifest /absolute/path/resource-plan.json --verify-managed-builds
```

Lệnh dựng lại không cache, có thể tải immutable base nếu thiếu; không khởi chạy ứng dụng/database/provider. Một container network-none/read-only/no-caps chỉ hash public sources trong image. Builder giữ timestamp và deterministic compiler cho cùng output ở các VM khác nhau.

## Đọc kết quả

- Exit1: cấu hình/image/nguồn không hợp lệ hoặc dựng lại thất bại; giữ admission đóng, sửa nguyên nhân. Không đổi tag/label hoặc tự nhận verified.
- Exit2: kiểm được phần đã khai báo nhưng còn unresolved. `services[].imageRebuildVerified=true` chỉ xác nhận image đó; không có nghĩa ngân sách hoặc VPS đã sẵn sàng.
- Exit0 chỉ có ý nghĩa PLAN khi mọi consumer được bao phủ; vẫn không chứng minh runtime/host capacity. Adapter Realtime hiện còn inventory/TLS unresolved nên chưa đạt điều kiện đó.

Giữ output đã che chi tiết, exact source binding, image ID và log build trong bằng chứng release. Các context/tag public tạm được giữ làm bằng chứng; quản lý vòng đời theo release, không chạy prune đại trà. Không sửa hoặc dọn metadata/trigger/publication trên database đang phục vụ từ runbook này.

## Còn phải nhận riêng

TLS tenant xác minh chứng chỉ/hostname, mọi pool/process/phiên tạm và rollout, các dịch vụ phụ thuộc, full-stack rebuild, tải và sức chứa VPS. Xem [runbook bootstrap](roomqc-realtime-bootstrap-runbook.md).
