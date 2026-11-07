# RoomQC — caller phòng, phục hồi và hủy lệnh: kiểm local 27/10/2026

**Kết quả:** native Auth/REST **77/77**, gồm **6 race chờ khóa thật** và **8 kiểm tra client ứng dụng thật**; frontend **61/61**; TypeScript/ESLint exit0; full control **384/384**. Source có phạm vi **843 file**, SHA `3a89e0bcfece9907c8b99127c8169669c50b44407905fcd5864c4dba8d16503e`, **557 business + 12 directory migrations**. Đây là kiểm có phạm vi, chưa nghiệm thu toàn bộ VPS/signup.

## 1. Thay đổi đã kiểm

- Client dùng một key cho một ý định, giữ pending khi chưa biết kết quả, đọc receipt trước retry và kiểm tương quan actor/tenant/runtime/room/key.
- Cancellation RPC dùng cùng actor/command lock với source. Lệnh chưa ghi có terminal cancellation; lệnh đã ghi trả kết quả đã lưu. HTTP400 đơn lẻ không được dùng để xóa pending rồi cấp key mới.
- MainLayout có vùng phục hồi: kiểm tra/tiếp tục hoặc dừng lệnh chưa ghi. Request có abort và scope guard; đổi phiên/tenant/runtime, quay đi rồi về hoặc unmount không nhận phản hồi UI cũ.
- Context Auth/profile có deadline 10 giây; RPC có deadline 20 giây. Pending nằm trong sessionStorage của tab, không chứa token; đóng tab không phải hủy lệnh và chưa hứa recovery xuyên thiết bị.
- Metadata room update bỏ status và không phát workflow/check-in/out giả. Mark-ready đi qua source, có thể tiếp tục khi phòng đã sạch; task pending đi qua in_progress rồi completed bằng tham số _reason.
- Lỗi tải lại phòng, task lookup hoặc task follow-up sau source commit được báo riêng. Replay thấy phòng đã đổi trạng thái không tự hoàn tất task; đổi scope dừng bước tiếp theo.
- Bulk bỏ ID trùng, từ chối chọn rỗng, đếm kết quả đã xác nhận, báo phần chưa rõ. Thông báo trình duyệt chỉ theo transition mới đã xác nhận và đúng hotel; không gửi cho no-op/replay/failure.

## 2. Bằng chứng và giới hạn từng lớp

| Lớp | Đã kiểm | Giới hạn |
|---|---|---|
| Native source/cancellation | 77/77; actual Auth/REST; 6 lock races; no late commit sau cancel; replay/conflict; quyền/expiry/fault/rollback | Không phải browser/Android; main source không phủ toàn writer graph |
| Client ứng dụng thật | 8 controls trong 77; bundle từ source ứng dụng bằng esbuild 0.28.2; mất response sau commit/relogin, lookup missing→same-key resend, 400→fence, late request, cancel sau commit | Mất response được chèn ở transport wrapper quanh API thật; chưa browser/network emulator |
| Unit/hook/component | 61/61 trên 6 file; pending/isolation/lifecycle/ABA/storage/timeout/caller task/bulk | Có mocks, không thay E2E. Context/API thật đã kiểm riêng ở hàng trên |
| TypeScript/lint | Hai lệnh độc lập exit 0; ESLint 17 file/0 error/33 any warnings | Chưa xử lý toàn bộ warning trong repository |
| Full control | 384/384, 0 fail/skip/cancel, exit 0; cùng source/runtime | Chưa default full backend hoặc independent rebuild bản 843 |
| Direct ACL | 25 bảng, 300 browser/probe denials, 88 private-service denials, 53 positives, 25 snapshots | SQL role assumptions; diagnostic này populate 5/25. Không chứng minh indirect closure |
| Advisors | 663 findings, có grouped counts trong artifact | Chưa disposition theo từng object; count không tương đương số lỗi sản phẩm |
| Cleanup | 6 kiểm độc lập cho container/volume/network của native và control, tất cả 0 | Chỉ exact-owned fixtures của hai run |

Native fixture **c31c992f6b4a**, backend **ba180f1d2ea0**; control run **ff6ec61ae5fe**. Source/schema/runtime khớp trước–sau, temporary faults được gỡ. Bản842/SHA55ee059f… trước bổ sung guard follow-up cũng đạt77native/384control; giữ terminal riêng, không kế thừa sang843. Bản cuối đã chạy lại độc lập.

## 3. Chưa hoàn tất và việc nhận tiếp

Room/task follow-ups vẫn là các transaction riêng. Đóng browser sau khi room commit có thể để task chưa hoàn tất; direct browser notifications chưa thay durable dispatcher/outbox. Không gọi phần này là end-to-end exactly-once. Recovery sessionStorage không áp sang signup provisioning.

Nhận **Q02**: check-in/out, quick/undo checks, change-booking-room, timer và safe-update; chốt live authority, alias/force, source và compound atomicity trên từng writer. Quick-check legacy còn gọi available; room swap còn force=true, cần kiểm backend thực thay vì suy tương thích từ main RPC. Sau đó Q03/W3–W8 về engine/config/action/dispatcher/legacy/recipients; Q04/W9 mới freeze/default full/rebuild sau toàn delta.

Browser/Android, command retention/abuse, advisor disposition, Linux/VPS/DNS/email/offsite/load/pilot giữ mở đúng plan. **70 worksheet rows vẫn not_run; 122 release entries vẫn unverified; gates/signoff không đổi.** Phần cần khóa/quyền tiếp tục gom riêng, không chặn công việc local.

Artifact: [kết quả có phạm vi](../../../artifacts/roomqc-room-caller-recovery-local-2026-10-27.json). Đối chiếu [phiếu triển khai](roomqc-vps-signup-detailed-delivery-2026-10-26.md) và [70 ca nghiệm thu](roomqc-vps-signup-acceptance-worksheet-2026-10-22.md).
