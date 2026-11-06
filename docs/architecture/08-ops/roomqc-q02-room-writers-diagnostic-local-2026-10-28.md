# RoomQC — kiểm thử local các đường ghi phòng Q02

Ngày đối chiếu: 28/10/2026. Phạm vi: Docker fixture riêng, có kiểm ownership và cleanup; không tác động DB đang phục vụ, CRM, VPS, DNS hoặc provider thật.

Run `8d40b94276ed` đã kết thúc với phase `room_writer_diagnostic_verified`, cleanup hoàn tất. Replay 577 migrations; 536/536 kiểm tra đạt. Trong số đó, 31 kiểm tra application client của 6 operation là tập con, không cộng thêm vào tổng.

Đã kiểm Auth/REST và application client: replay, idempotency, cancellation, tranh khóa, expiry, lỗi audit/receipt và rollback; các đường phòng, booking, check-in/out, chuyển phòng và tài chính nhóm trong fixture. Snapshot ACL của 40/40 bảng giữ nguyên.

Schema trước và sau cùng SHA256:
`e8a393b9496ff79dbe236dd0836ffa8f2de6fc69e66f372aafffe836b4b05150`.

Đây là diagnostic có phạm vi. `q02Complete=false`, `allWriterPathsClosed=false`, `indirectPathsProven=false`. RW5–RW8 còn delta; cần inventory các caller đang triển khai, quyền gián tiếp, correction/retention và abuse. Chưa là nghiệm thu toàn bộ Q02, browser/Android, VPS hoặc phát hành.

[Bằng chứng JSON](../../../artifacts/roomqc-q02-room-writers-diagnostic-local-2026-10-28.json).
