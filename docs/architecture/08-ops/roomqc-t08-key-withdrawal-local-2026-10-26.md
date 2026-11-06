# T08 — thu hồi theo khóa ký: bằng chứng local 26/10/2026

Checkpoint source **3b1d37fb…**, manifest **784 file**, **546 business + 11 directory migrations**, runtime binding **153 file**. Đây là manifest có phạm vi; không chứng minh toàn repository hoặc runtime đang deploy. [Artifact](../../../artifacts/roomqc-t08-key-withdrawal-local-2026-10-26.json) lưu nguồn và giới hạn kiểm chứng.

## Thay đổi đã thực hiện

- Thêm migration0011, giữ nguyên0010 và history cũ. Thu hồi theo SHA256 của Ed25519 SPKI, không theo tên issuer/keyId. Tombstone bền vững không có đường update/delete/truncate; khóa chưa từng dùng và alias của khóa đã thu hồi cũng không cài được.
- Lệnh thu hồi nhiều cụm dùng cùng khóa chạy atomically dưới727001 trước row locks; tăng epoch/version của authority đang active, đóng manual admission và yêu cầu operator reopen. Cụm đang dùng khóa khác được giữ nguyên; không đổi routing hoặc nghiệp vụ của khách cũ.
- Mutation, audit từng cụm, command receipt và tombstone cùng transaction. Dùng chung namespace client key theo actual DB login với lệnh install/withdraw hiện có. Replay đọc kết quả lịch sử, không phục hồi quyền; payload khác conflict.
- Guard INSERT chặn cài mới bằng khóa đã thu hồi ngay trong commandv10. API/worker/metrics/probe không có quyền ghi tombstone; SECURITY DEFINER có owner NOLOGIN, fixed search_path, không PUBLIC execute hoặc runtime membership.
- Primary projections buộc có trạng thái khóa chưa thu hồi. Validate, health commit, snapshot/admission, reserve và provision retry từ chối approval cũ; dữ liệu thiếu cũng fail closed. Phục hồi bằng khóa khác giữ manual/backup gate và bắt đầu warmup lại.

## Kiểm chứng trên candidate

Full control **346/346**, run **fbbb195158e4**, native exit0; fail/skip/cancel0. Source quan sát trước full run và sau kiểm chứng khớp; runtime binding khớp. ESLint và syntax **12 file** đạt. Independent exact-label cleanup: container/network/volume **0/0/0**, ba lệnh exit0.

Đã kiểm upgrade9→11 và10→11/rerun giữ dữ liệu, checksum và receipt; nhiều cụm/alias/khóa khác; thu hồi khóa chưa dùng; cùng key replay/conflict; install/revoke và revoke/revoke thực sự chờ cùng lock; rollback tại audit đầu, audit cụm thứ hai và receipt cuối.

Hai worker Node process thật cùng giữ HTTP response trong fixture loopback: thu hồi khóa → response muộn bị từ chối trước generation/snapshot/event → cycle tiếp không gọi network → restart metadata cũ vẫn bị chặn → ký/cài bằng khóa khác và restart mới phục hồi/warmup. Cùng bài thử giữ hồi quy thu hồi từng approval. Metadata/DSN đi qua IPC riêng; collector trả boolean synthetic, không là full vendor pipeline hoặc bằng chứng readonly filesystem deployment.

Runtime integration kiểm held HTTP manifest sau key withdrawal không validate, lần sau không gửi request; reserve/open/provision retry bị chặn dù fixture cố xóa manual flags. Actual local HTTP API vẫn đọc receipt đã commit và activate đúng binding mà không gửi thêm provision write. Đây không khép durable dispatch/lease/reconciliation của T11/T12.

## Lịch sử thất bại và giới hạn

Run **1abb6146fd7f**, source4be39f70…:343/346, fail3, exit1. Ba lỗi PostgreSQL53100 xảy ra khi migration fixture cho ba ca cuối; bộ test giữ database từng ca và chạm giới hạn tmpfs1GiB. Tăng riêng fixture disposable lên2GiB; giữ toàn bộ ca/assertion. Lượt full trên candidate hiện tại đạt; cleanup lượt thất bại cũng0/0/0. Không xóa failed history.

Chưa chạy default full timed backend hoặc rebuild độc lập trên source này; diagnostic99b42 của checkpoint8db chỉ là lịch sử theo source cũ. Chưa có proof full vendor key-wide revocation/production issuer, installer CLI/readiness hoàn chỉnh, quyền gián tiếp, Linux/TLS/email Internet/offsite/on-call/A-B đồng thời/E2E/tải/pilot. Stability follow-up15eb vẫn mở. Đóng admission không hủy remote commit đã được cấp quyền; restore DB cần checkpoint thu hồi ngoài failure domain.

**122 release entries vẫn unverified; 70 worksheet cases vẫn not_run; gate/owner/reviewer/signoff giữ nguyên.** Chưa hoàn tất toàn T08 hoặc sản phẩm. Tiếp installer CLI/readiness và quyền gián tiếp, rồi candidate freeze/full regression/default full backend/rebuild; sau đó tiếp alert→admission/budget→signup→console→Linux/DR→E2E/load/RC/pilot theo [plan tổng thể](roomqc-vps-signup-plan-current-2026-10-26.md).
