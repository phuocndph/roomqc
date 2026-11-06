# RoomQC — backend cảnh báo VPS T07 đã kiểm local

Ngày 28/10/2026, Asia/Bangkok. Phạm vi toàn bộ VPS + signup giữ theo [bản bàn giao](roomqc-vps-signup-handoff-2026-10-28.md). Packet này triển khai backend T07, bổ sung ba API cho T15. [Artifact](../../../artifacts/roomqc-control-alerts-local-2026-10-28.json) ghi source, kết quả, cleanup và giới hạn; [runbook](roomqc-control-alert-worker-runbook.md) giữ cấu hình thực thi.

## Kết quả dùng được trong code integration

- Health snapshot, latch, incident, transition và outbox được ghi cùng transaction. Lỗi cùng cụm/loại còn mở không tạo thêm incident hoặc thông báo mở; recovery đủ cửa sổ ghi resolved. Lỗi lại tạo episode mới liên kết episode trước.
- Nhận xử lý lưu live actor, version, reason, command receipt, event và outbox atomically. Không sửa health/admission, không resolve cảnh báo hoặc bỏ latch. Lost response tra lại bằng original key; UUID hoa/thường được chuẩn hóa. Receipt cũ không đổi khi incident sau đó resolve.
- Dispatcher dùng login riêng ít quyền, transaction ngắn, SKIP LOCKED, lease token và attempt history. Worker hết lease không settle được. Retry/backoff bị giới hạn, cuối cùng vào dead-letter; không tự reset attempt hoặc gửi vô hạn.
- Sender dùng endpoint/file secret do operator cấu hình. Chỉ HTTPS ở production, không redirect, kiểm/ghim DNS và chặn metadata; HTTP local chỉ loopback opt-in. Không ghi raw exception, provider response hoặc token vào lịch sử lỗi.
- Worker có loop không chồng, concurrency/pool/budget có giới hạn, deadline, heartbeat/readiness loopback và shutdown. Không có HTTP trong transaction database. Chưa mount hoặc chạy service này trên stack chính/VPS.
- Migration directory0013 nâng từ0012 có dữ liệu, giữ legacy alert; không tự phát lại toàn bộ incident cũ. Alert legacy có resource khác cluster vẫn ack/audit được rõ ràng với cluster nullable; không suy FK không hợp lệ thành lỗi mạng.

## API và quyền

| Route, base `/api/control` | Quyền và hành vi |
|---|---|
| GET `/admin/alerts` | Live platform-read; strict state/severity/limit/cursor; thứ tự openedAt/id. Open, acknowledged và resolved tách nhau; không lọc trả mọi episode |
| POST `/admin/alerts/{id}/acknowledge` | Live infra-operate, exact origin, JSON; key/version/reason; replay cùng nội dung trả cùng receipt, khác nội dung409 |
| GET `/admin/alerts/{id}/acknowledgement-result` | Live platform-read; original key, đúng actor/authority/target/operation; không nhận query bổ sung, unknown404, kết quả chưa xác nhận409 |

Contract hiện có24 operation: 8 foundation, 11 implemented-local, 4 planned, 1 partial-local. Nhãn này là trạng thái handler/backend, không thay nghiệm thu client/UI hoặc toàn task. Test HTTP dùng adapter canonical actor tổng hợp; production vẫn gọi gateway live authority hiện hữu. Chưa chứng minh live Supabase Auth trong packet này.

## Bằng chứng local

Lệnh `node scripts/test-control-directory.mjs`, run directory `d5e3a791c804`, session5281, terminal exit0: **455/455, fail0, skip0, cancel0**, khoảng130,66giây. Có database Docker riêng, role runtime thật, HTTP sink thật ở loopback, kiểm health/registry/release/installer/probe và monitoring stack hiện hữu. Bộ này là full control tests; không phải default full vendor backend hoặc independent rebuild.

13 ca mới nằm trong tổng455, không cộng thành ca nghiệm thu sản phẩm: 7 nhóm DB/API/worker/upgrade và 6 nhóm config/receipt/sender/runtime. Đã kiểm:

1. Health lỗi lặp→ack12 request→recovery đủ cửa sổ→lỗi lại; latch nhận khách vẫn giữ. Stale transition chỉ mở một lần.
2. Inject lỗi outbox: health/latch/incident/event hoặc ack/command receipt rollback toàn bộ. Retry sau khi bỏ fault thành công.
3. HTTP pagination không lặp, strict filters/authority/origin/version/key, receipt đúng người và tra lại sau lost response. UUID uppercase command→lowercase lookup vẫn đúng receipt.
4. Tám claim cạnh tranh có một lease; restart/lease expiry tạo token mới, token cũ không settle. Backoff không được claim sớm, attempt cuối hết lease vào dead-letter.
5. HTTP sink503→restart→204 giữ nguyên body/ID;401 vào dead-letter. Sink đã nhận body rồi đóng socket trước response→retry cùng ID/body. Receiver có thể nhận trùng ID, không hứa delivery exactly-once.
6. Role dispatcher không sửa payload/lifecycle/history schema, không đọc workspace hoặc tạo DDL; metrics không được ack. Config sai, metadata, redirect, response quá lớn và shutdown/timeout được kiểm.
7. Populated0012→0013 giữ legacy row và history, chạy lại migration không thay trạng thái; noncluster resource được ghi event rõ ràng.

Lượt đầu `c34e8197a205`:453/455, fail2 được giữ lịch sử. Một kỳ vọng chỉ có migration0012 chưa tính0013; một source-contract test chưa tính parent-boundary cũng freeze invitation caller. Đã cập nhật đúng kỳ vọng, không bỏ assertion hoặc giảm kiểm quyền. Lượt giữa `b27a49d80e61`:455/455; sau đó bổ sung chuẩn hóa UUID và lost-response sink nên chạy lại final candidate nêu trên. Không cộng các lượt thành thêm số ca.

Backend source binding trước/sau final khớp,208file; digest trong artifact. Hai file acceptance được giữ byte-identical. Kiểm độc lập theo directory label của ba full-control run còn0container/volume/network. Monitoring fixture có ownership cleanup trong test đã đạt; không dùng nó làm bằng chứng mất host production.

## Phần còn mở và đầu việc tiếp

**Nhận tiếp T15:** typed client/DTO, journal lưu original key theo actor/session/runtime/target, tra receipt trước retry, UI danh sách/nhận xử lý có version/reason/unknown state. Nối vào Hạ tầng, giữ Back/filter/cursor/scroll; kiểm403/409/429/503, đổi phiên, reload, bàn phím390px và browser/Android. Sau đó thao tác cụm T09/T15 và tenant-summary/recheck T12/T16 theo dependency.

**T07 chưa được nghiệm thu toàn bộ:** kênh/receiver thật ngoài host, người trực/escalation, B09 mất control/monitor host trên staging; Linux bundle/service/reboot và shutdown/process crash thực; dashboard queue-age/dead-letter/heartbeat và quy trình redrive; retention/backup directory. Runtime module local chưa thay các đầu ra này.

Source mới thay backend binding. Diagnostic parent-boundary `0146874c679e` và packet console trước đó giữ giá trị lịch sử có phạm vi, không đại diện candidate mới. Default full backend, independent rebuild, staging Linux/TLS/provider/offsite restore, A/B, E2E/tải/pilot vẫn mở. Chưa đo sức chứa100.000user hoặc1.000khách sạn.

**Nghiệm thu và triển khai:**70ca vẫn `not_run`,122mục release `unverified`; reviewer/signoff/gate không đổi. Chưa deploy, chưa nâng database nghiệp vụ chính, chưa gửi thông báo tới người thật, chưa mở admission/signup và chưa commit. Goal toàn plan vẫn active.
