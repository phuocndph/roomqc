# T10 — preflight kế hoạch deployment và cấu hình đã nạp

Ngày 28/10/2026, Asia/Bangkok. Phạm vi VPS + signup; T10.a và phần T10.b vẫn **partial**. Tiếp sau [shared native startup](roomqc-control-shared-resource-runtime-local-2026-10-28.md). [Artifact](../../../artifacts/roomqc-resource-deployment-plan-local-2026-10-28.json) giữ source, kiểm thử, lịch sử và cleanup; [runbook](roomqc-resource-deployment-preflight-runbook.md) giữ cách dùng.

## 1. Thay đổi đã triển khai

- CLI chỉ đọc Compose đã resolve theo manifest project/files/envFiles/profiles cụ thể. Cộng replica xuyên project theo DB/consumer; health v2 tính riêng metrics và probe catalog. Pool/replica/max/reserve giao nhau vẫn đi qua guard native.
- Mọi native project dùng đúng hash của bytes ngân sách được review. Khác file nhưng cùng bytes được nhận; hai file hợp lệ riêng lẻ nhưng khác hash bị chặn. Các service đang được chọn phải có mapping; scale/global/command/image/mount/environment sai bị từ chối.
- Chỉ nhận digest image trong manifest, command native xác định, working directory rõ ràng và metadata readonly. Chặn các đường injection được liệt kê trong runbook. So khớp digest cấu hình chưa chứng minh nội dung image hay container thực.
- Consumer đang bật chưa có adapter/inventory hiện trong unresolvedConsumers. Exit2 là native plan hợp lệ nhưng chưa phủ đủ; exit0 chỉ có nghĩa plan trong budget đã cho đủ mapping. deploymentReady luôn false.
- Native process lưu fingerprint bất biến khi load; liveness trả projection allowlist, không có DSN/token/path/provider metadata. Thay file sau startup không làm tiến trình tự nhận fingerprint mới. Live OpenAPI đã bổ sung schema cho projection.
- Docker output chứa env chỉ ở trong bộ nhớ; lỗi CLI chỉ trả mã cho phép. Terminal ROOMQC/COMPOSE/NODE_OPTIONS và .env mặc định không tự thay input. Explicit env file và secret redaction đã được kiểm bằng Compose thật.

Không có migration, thay dữ liệu nghiệp vụ, gọi provider hoặc deploy trong packet này. Bộ native guard trước đó được giữ. Đây không phải security scan toàn Docker/image/host.

## 2. Kiểm thử trên source hiện hành

Backend binding: **218 file**, SHA-256 **d31efab104dccc138e3c48f21479ebdfb54ed2cdf941c68a2cfc0eb6c7a863fc**. Ba nhóm dưới dùng đúng binding này, source không đổi trong lúc chạy.

| Bằng chứng | Kết quả và giới hạn |
|---|---|
| [Directory](../../../artifacts/roomqc-control-resource-directory-5a2ee96fa4e8-local-2026-10-28.json) | 497 tổng / **495 pass / 0 fail / 2 skip**, exit0; owned PostgreSQL riêng, không phải full native business sandbox |
| [Linux](../../../artifacts/roomqc-resource-plan-linux-837fe86d6f8c-local-2026-10-28.json) | **34/34**, không skip; non-root, readonly, không network; phủ hai skip Windows và HTTP loopback qua dependency doubles |
| [Docker Compose thật](../../../artifacts/roomqc-resource-plan-compose-30aa9949af10-local-2026-10-28.json) | **8/8** positive/negative/recovery; hai project native, chỉ config, không pull/build/start/exec |

Ca chính: cộng replica hai project, dư/thiếu replica, khác ngân sách, lệch metadata pool, profile chưa chọn, service chưa inventory, writable/code/secret mount, command/image/loader injection, explicit env, lỗi được lọc, file thay sau startup và liveness không đổi fingerprint. API/health/alert/external booking HTTP đều có ca projection; việc so container thực với projection chưa triển khai.

Windows không cho tạo symlink ở ca owned fixture và bỏ kiểm Unix secret mode; Linux 34/34 phủ cả hai. Các tổng kiểm có thể chồng nhau, không cộng thành số ca nghiệm thu sản phẩm. Các proof HTTP client17/17+13/13 của packet trước giữ đúng source lịch sử, không tự rebind sang packet này.

## 3. Lịch sử và cleanup

Lượt Compose fixture ban đầu chưa đạt vì whitelist môi trường Windows thiếu đường tìm plugin Docker và Compose normalize entrypoint mặc định thành null. Đã sửa cả hai và kiểm lại. Artifact thất bại vẫn giữ trong historicalFailures; không xóa hoặc sửa lịch sử để chỉ còn lượt xanh. Run directory46e4295915fb/Linux5ea25564b739/Compose d5196e33c87c là checkpoint trước khi cập nhật contract; kết quả hiện hành lấy bảng ở mục2.

Independent Docker cleanup: owned directory và Linux đều **0 container / 0 volume / 0 network**; hai project Compose không tạo tài nguyên. **Cleanup file chưa hoàn tất:** 7 thư mục fixture cấu hình giả còn giữ trong .local. Cơ chế duyệt tự động từ chối lệnh xóa đệ quy với lý do chỉ là blocked by policy; không thử xóa qua API khác. Fixture chỉ có metadata giả và DSN/token sentinel không dùng được, không phải dữ liệu khách. Helper đã được cập nhật sau lượt kiểm để giữ fixture rõ ràng khi chạy lại. Ledger và worksheet vẫn đúng hash được bảo vệ. **70 ca not_run, 122 mục unverified; reviewer/signoff/gate không đổi.**

## 4. Những gì chưa được chứng minh

Chưa có inventory container đang chạy, orphan/one-off/stopped/restarting, project ngoài manifest, image nội dung thực hoặc so projection live với candidate. Chưa ràng buộc DB ID tới endpoint/database thực, topology pooler/direct, vendor server pools hoặc max/reserve business. Auth/REST/Realtime/Storage/functions/meta/Supavisor và process operator/exporter/backup/restore/provisioner/in-app khác vẫn cần adapter/cap đúng release.

Plan check là snapshot lúc đọc, chưa khóa config giữa preflight và start. Không suy sức chứa từ phép cộng connections. Host RAM/CPU/IO/disk/inode/egress, fairness/upload/report/Realtime/jobs, usage/quota và tải/soak vẫn thuộc T10.c–f/T23. Full native fail75b23132abab, independent rebuild, Linux VPS/TLS/DNS, email thật, offsite restore, host-loss/on-call, web/Android E2E, hai backend đồng thời và pilot vẫn theo [plan tổng](roomqc-vps-signup-handoff-2026-10-28.md).

## 5. Việc nhận tiếp

**T10.a/phần T10.b: inventory runtime readonly.** Không giao lại CLI plan hoặc shared startup như chưa làm.

1. Manifest ràng buộc candidate/source/image và toàn project được quản lý. Đếm mọi container theo project label, gồm orphan/one-off/stopped/restarting; phát hiện thiếu/thừa replica và drift image/command/env/mount.
2. Probe loopback native bằng chương trình cố định có timeout/size bound, chỉ nhận projection allowlist. So hash/environment/DB/consumer/pool/replica **đã nạp**; file mount mới không thay bằng chứng của process cũ.
3. Dùng fixture có ownership riêng, không provider/outbox; tạo surplus replica, one-off/orphan, restart/stale-profile và sửa drift rồi kiểm phục hồi. Cleanup độc lập không để lại container/network/volume.
4. Chỉ sau khi phần này có proof: chốt adapter/cap vendor và pooler đúng release pin, process chưa nối và DB identity/settings; rồi T10.c–f. Không tự gắn runtimeVerified cho toàn stack khi còn consumer chưa phủ.

Đây là đầu việc tiếp theo duy nhất của packet; không thay thứ tự dependency T11/T12 hoặc mở public signup/admission. [Runbook](roomqc-resource-deployment-preflight-runbook.md) và [phiếu T01–T25](roomqc-vps-signup-detailed-delivery-2026-10-26.md) giữ điều kiện nhận chi tiết.
