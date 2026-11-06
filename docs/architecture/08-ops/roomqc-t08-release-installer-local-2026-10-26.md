# T08 — công cụ cài phê duyệt và readiness: bằng chứng local 26/10/2026

Candidate **d4cea563…**, manifest **790 file**, **546 business + 12 directory migrations**, runtime binding **159 file**. [Artifact](../../../artifacts/roomqc-t08-release-installer-local-2026-10-26.json) lưu hash và phạm vi. Đây không là bằng chứng runtime đang deploy hoặc toàn repository.

## Đã thực hiện

CLI nhận hai đường dẫn file tuyệt đối cho config và command; DSN/trust/inventory/approval đọc từ file giới hạn kích thước, không nhận secret qua raw argument. Chặn symlink/junction và đường dẫn không an toàn. Production từ chối Windows; POSIX có kiểm owner/mode nhưng chưa chạy nghiệm thu Linux. Local Windows dùng cờ test riêng, không tuyên bố đã kiểm ACL production.

Installer dùng login riêng, từ chối runtime/mixed/elevated role, quyền DDL/ghi trực tiếp và sai database/primary. Migration0012 chỉ thêm quyền đọc URL và credential reference cho installer, không thêm bảng hoặc sửa migration cũ. Shared lock727000 cùng connection chống đua migrator; schema history/checksum/definer owner/fixed search_path/no PUBLIC execute phải đúng.

Install xác minh chữ ký theo public trust và inventory độc lập; dưới lock727001 đối chiếu lại URL/credential/host/inventory/environment trên primary ngay trước effects. Check chỉ đọc readiness, phân biệt installer sẵn sàng với authority sẵn sàng. Withdrawal và receipt vẫn dùng được khi trust/inventory file mất. Receipt là kết quả lịch sử, không chứng minh authority còn hiệu lực; retry giữ nguyên client key.

## Kiểm chứng

Full control **358/358**, run **19c5787a2fba**, native exit0, fail/skip/cancel0. Source/runtime binding trước và sau khớp; ESLint/syntax **8 module** đạt. Cleanup độc lập exact-owned container/network/volume **0/0/0**, ba lệnh exit0. Native installer focused **7/7**; năm unit case cùng được chạy lại trong full control.

Đã thử install/check/receipt/replay không lặp effects; sai role/database/chữ ký/target; pending migration/checksum drift/live migrator; key withdrawal và khóa mới recovery; thiếu trust/inventory; readiness khi trust bị bỏ hoặc approval hết hạn.

Relay PostgreSQL loopback giữ COMMIT acknowledgement sau khi primary thực sự commit, rồi ngắt transport. Native CLI trả unknown outcome với stable receipt key; đọc receipt và replay trực tiếp giữ nguyên command/audit/authority. Đã thử primary target đổi trong lúc native CLI thực sự chờ lock727001: từ chối trước install, sửa binding rồi cùng command retry thành công. Đây không thay full vendor pipeline hoặc chứng minh T11/T12 durable dispatch.

## Lịch sử lỗi và việc còn lại

Run **e856ec86c0ae** đạt4/7, fail3, exit1; source của failed run chưa được capture. Hai lỗi là biến snapshot trong fixture; lỗi còn lại là checked-out PG client không bắt transport error, khiến process kết thúc thiếu JSON recovery. Đã sửa biến và thêm listener để pending query reject qua error path an toàn; giữ bài thử mất COMMIT thật. Native7/7 và full358/358 sau sửa đều đạt; cleanup failed run0/0/0.

Chưa khép quyền gián tiếp/workflow/advisor disposition, default full timed backend/rebuild trên source này hoặc stability follow-up15eb. Chưa nghiệm thu Linux/TLS/issuer production, email Internet, offsite restore, on-call, A/B đồng thời, browser/Android E2E, tải hoặc pilot. Các checkpoint784/346 và diagnostic99b42 thuộc source cũ, giữ làm lịch sử.

**122 release entries unverified; 70 worksheet not_run; mọi gate/signoff giữ nguyên.** Tiếp quyền gián tiếp rồi packet full backend/rebuild; sau đó alert → admission/budget → signup/recovery → hai console → Linux/DR → E2E/tải/RC/pilot theo [plan toàn bộ](roomqc-vps-signup-plan-current-2026-10-26.md).
