# RoomQC — parent-boundary đã đạt trên backend riêng

Ngày 28/10/2026. Run `0146874c679e` kết thúc **exit 0** từ session 3134; [artifact](../../../artifacts/roomqc-parent-boundary-local-2026-10-28.json) ghi source và phạm vi.

Hai fixture thiếu đã được tạo qua RPC thật: owner hoàn tất room setup, platform admin tạo case đối soát từ checkout hợp lệ. Có kiểm parent/child trước khi thử; không sửa grant, constraint hoặc schema nghiệp vụ.

| Kiểm tra | Kết quả |
|---|---|
| Unit parent-boundary | 6/6, không skip |
| Source binding và Compose thật | 13/13, không skip |
| Native catalog / denial | 29 FK / 248 từ chối, đủ expected |
| Composite / deferred | 4 integrity, 32 parent denial, 2 staged-deferred refusals |
| Snapshot mỗi lần thử | 184 bảng, 3 observer positives |
| Rollback dữ liệu setup ngoài DO | 11 bảng khớp trước/sau |
| Missing fixture / findings | 0 / 0 |
| Source/schema | Khớp trước/sau |
| Cleanup độc lập | 0 container, 0 volume, 0 network của run |

Backend 199 file, SHA256 `0c692639baec58c54d5f6787a76f207098d410595300689de231cdc81767fed7`. Schema `e8a393b9496ff79dbe236dd0836ffa8f2de6fc69e66f372aafffe836b4b05150`; không thêm migration. Giữ [kết quả chưa đạt trước sửa](roomqc-parent-boundary-handoff-2026-10-28.md) làm lịch sử.

**Việc tiếp:** chạy default full cùng candidate; chỉ khi đạt mới dùng làm reference independent rebuild. Đây là diagnostic, không đóng 70 ca hoặc gate. SQL role với live Auth fixture không thay web/Android, VPS Linux, email thật, offsite restore, tải hoặc pilot.

Lượt 2aa9e0fb66e0 trước đó exit 1 tại positive composite sibling; đã sửa cách chọn tuple có sibling hợp lệ và giữ guard độc lập. Không xóa lịch sử fail.
