# RoomQC — kiểm tra ràng buộc dữ liệu liên quan

Ngày28/10/2026. Run82280c5d5c78 exit1, phase `parent_boundary_controls`.
[Artifact đã lọc](../../../artifacts/roomqc-parent-boundary-attempt-82280c5d5c78-2026-10-28.json) ghi nguồn và kết quả native.

Đây là diagnostic sở hữu riêng, không phải full acceptance hoặc reference rebuild.
Backend 199 file, SHA256 `906b6055f60da36812882dc1fcea96568b1f7bc5266b2849cca3025dd186e94b`; không thêm migration.

| Kiểm tra | Kết quả |
|---|---|
| Unit parent-boundary | 5/5 |
| Binding và hai lần render/Compose thật | 13/13, không skip |
| Native parent-boundary | Chưa đạt; — FK, — denial |
| Tuple composite | — kiểm toàn vẹn; — parent denial |
| Deferred | — lần insert thành công rồi bị FK từ chối khi ép kiểm |
| Snapshot | — bảng; rollback kiểm sau mỗi thử |
| Cleanup độc lập | 0 container, 0 volume, 0 network của run |

Giữ nguyên failure packet; chưa chuyển thành pass. Missing fixtures: `[]`.
Reason allowlist: `42601`.

Parent tests giả lập SQL role bằng fixture Auth thật; không thay E2E browser/Android hoặc kiểm quyền gián tiếp.
Managed-health không chạy trong diagnostic này; full75 lỗi trước đó giữ riêng.
70 ca not_run và122release entries unverified, reviewer/gate giữ nguyên.
