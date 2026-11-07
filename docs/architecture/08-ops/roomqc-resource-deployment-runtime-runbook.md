# Đối chiếu ngân sách với container đang chạy

**Tiếp theo ngày30/10:** [kiểm mẫu từ pool đang chạy](roomqc-resource-loaded-pool-runbook.md) đã có proof container thật cho Control API. Đây là bước opt-in riêng, mượn pool hiện hành trong namespace ứng dụng; chưa phủ mọi session/vendor/topology hoặc thay các giới hạn của bước dưới đây.

Đây là kiểm runtime native của T10.a/phần T10.b, sau [preflight kế hoạch](roomqc-resource-deployment-preflight-runbook.md). [Bằng chứng local](roomqc-resource-deployment-runtime-local-2026-10-28.md) ghi phạm vi live API và giới hạn.

Adapter `summary-credential-rotation` đã có projection ngân sách đã nạp trong bộ nhớ trên loopback8097. CLI runtime kiểm đúng image/process/mount/network và so projection v2 cho cả hai DB; không đọc lại tệp mount để giả thành cấu hình đang dùng. Các checkpoint trước ghi adapter chưa hỗ trợ giữ đúng nguồn lịch sử. Live Compose bind profile, DB identity và toàn inventory vẫn cần nghiệm thu riêng.

### Tiến trình đổi khóa summary

- `GET /livez` trả200 khi daemon còn sống; `GET /readyz` trả200 chỉ khi chu kỳ gần nhất thành công và daemon chưa dừng. Lỗi dependency/cấu hình/khóa chưa sẵn sàng trả503 tại readyz, không tự biến liveness thành readiness.
- Chỉ nghe `127.0.0.1:8097`, không mở host port. Probe cố định qua `docker exec` đọc projection cho phép, không trả raw config, command, ID credential, DSN hoặc signer.
- `resources` có schemaVersion2, budgetSha256, environment, configurationSha256 và hai phần tử `databases`. Mỗi DB giữ consumer/pool/replicas; configurationSha256 là canonical hash của policy+installer metadata **trong container**, gồm paths nhưng không nội dung DSN/secret. Planner Windows giữ đúng POSIX spelling để hash trùng Linux.
- Snapshot được tạo sau loader kiểm private inputs/release signature và giữ trong bộ nhớ; endpoint không đọc lại file. File policy/config/budget được thay mà process chưa nạp phải khác projection mong muốn. Daemon đóng readiness ở chu kỳ kiểm tiếp khi phát hiện drift; fingerprint cũ vẫn được giữ để checker nhận ra.
- `--once` không mở endpoint. SIGTERM đóng readiness/endpoint rồi chờ tác vụ đang chạy theo cơ chế drain hiện có. Không thêm DB connection cho status HTTP.
- Runtime budget phải khớp environment của tiến trình. Chữ ký test authority hoặc liveness200 không phải phép mở VPS hoặc xác minh quyền hiện hành trong directory; các fence SQL/release vẫn được kiểm bởi daemon trước effect.

## 1. Chuẩn bị và chạy

Từ đợt 30/10, adapter `provisioning-worker` kiểm tiến trình `node workers/setup-runtime.mjs`, healthcheck/probe loopback8095, các bind/secret/network và pool projection v1 đã giữ trong bộ nhớ khi startup. Không mở thêm kết nối DB để đọc status. Hash budget/pool được so với PLAN; projection v1 không chứa hash toàn bộ setup metadata, đích DSN hoặc instanceId. Không dùng kết quả này làm bằng chứng mọi thay đổi target/approval đã nạp vào worker. Live Compose bind triển khai và browser→Control→cụm vẫn cần kiểm riêng.

Dùng cùng manifest, ngân sách, Compose và env file đã review. Staging/production vẫn yêu cầu `repository@sha256:...`; local bổ sung `sha256:...` là content ID bất biến của Docker engine để kiểm build chưa đưa lên registry. Tag mutable và Compose `build` vẫn bị từ chối. Image local không phải bằng chứng rollout registry/VPS.

```text
node scripts/control-backend-resource-runtime-check.mjs --manifest ABSOLUTE_MANIFEST_JSON
```

Docker context phải đúng host, người chạy có quyền list/inspect/image inspect và exec probe cố định. Bộ kiểm giả định daemon cùng image đã review là đáng tin; không chứng minh nội dung image chỉ bằng label. Không paste JSON inspect/Compose nguyên bản vào log/chat.

Lệnh chỉ đọc cấu hình/trạng thái. Ngoài compose config, container ls --all/inspect và image inspect, nó chạy Node cố định qua docker exec. Probe chỉ fetch HTTP loopback `/api/control/livez` hoặc `/livez`: timeout4s, response tối đa16KiB, không follow redirect và chỉ trả resource projection allowlist. Không gọi readiness/DB/provider, không tự start/stop/restart/build/pull hoặc sửa cấu hình.

Giới hạn256 container cho toàn manifest và tối đa256 trả về mỗi project; vượt giới hạn bị từ chối, không cắt danh sách rồi nhận đạt. Không nhận host/service/container network namespace sharing vì loopback có thể thuộc tiến trình khác.

## 2. Những gì được kiểm

| Bước | Kiểm và hành vi khi sai |
|---|---|
| Plan trước runtime | Đi qua validator manifest/native budget/mount/pool/replica hiện có |
| Inventory project | Đọc cả running/exited/paused/restarting; service ngoài danh sách hoặc one-off bị từ chối, kể cả đang dừng |
| Replica | Đúng số container từng project/service; ordinal hợp lệ, duy nhất, không vượt planned replicas; tổng xuyên project đã khớp budget |
| Image | Config.Image đúng reference; container.Image đúng content ID từ image inspect; registry digest có trong RepoDigests |
| Process | Entrypoint/cmd/argv, user, working directory, môi trường kế thừa image + Compose, rootfs/init/capabilities/security options và healthcheck khớp |
| Mount/network | Bind metadata/secret đúng source/target/readonly/propagation; không mount/network phụ; chỉ alias drive Docker Desktop Windows được nêu trong code |
| Projection đã nạp | Hash/environment/DB/consumer/pool/replica trong bộ nhớ đúng plan; file mount mới không thay bằng chứng process cũ |
| Snapshot cuối | List/inspect lại sau probe; replica xuất hiện/mất/thay/restart hoặc đổi cấu hình làm snapshot không hợp lệ |

Environment và inspect nguyên bản chỉ ở trong bộ nhớ. Lỗi chỉ in mã cho phép. Báo cáo thành công dùng projection manifest và ID/hash; consumer chưa phủ vẫn nằm trong unresolvedConsumers.

## 3. Đọc kết quả và xử lý

| Exit | Ý nghĩa |
|---|---|
| `0` | Native container và budget được cung cấp khớp snapshot này, không còn consumer đang bật chưa mapping trong budget đó |
| `2` | Native khớp nhưng còn consumer chưa phủ; chưa đạt toàn deployment |
| `1` | Inventory/probe/profile/image/process/env/mount/network/replica lệch hoặc thay trong lúc kiểm; sửa nguyên nhân và chạy lại |

`nativeRuntimeVerified:true` chỉ xác nhận native binding được kiểm. `runtimeVerified:false`, `databaseIdentityVerified:false`, `capacityProven:false`, `deploymentReady:false` và acceptance chưa ký vẫn giữ. Exit0 không xác nhận DB đúng endpoint, app sẵn sàng phục vụ, host đủ tải hoặc quyền phát hành.

`RESOURCE_RUNTIME_CONTAINER_UNAVAILABLE`: container không chạy ổn khi đọc. `RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH`: process chưa nạp đúng profile. `RESOURCE_RUNTIME_CHANGED_DURING_CHECK`: cần snapshot mới sau khi rollout/restart ổn định. Lệnh không tự chữa drift hoặc restart dịch vụ.

## 4. Giới hạn và bước tiếp

Chưa khám phá project/process ngoài manifest, chưa chứng thực build độc lập, đo tải hoặc khóa cấu hình sau kiểm. Đây không phải security scan toàn Docker/image/host. Cấu hình ngoài adapter cần bổ sung kiểm và ca xác minh trước khi dùng làm proof.

Live proof hiện dùng **hai API native**, network none và DSN không dùng được. Worker/vendor có secret/TLS/DB riêng vẫn cần proof đúng triển khai; không suy thành đã kiểm live mọi worker. T10.b tiếp inventory/cap Auth/REST/Realtime/Storage/functions/meta/Supavisor/process khác, remaining workers và DB identity/settings; T10.c–f/T23 tiếp host/fairness/usage/quota/tải theo [plan tổng](roomqc-vps-signup-handoff-2026-10-28.md).
