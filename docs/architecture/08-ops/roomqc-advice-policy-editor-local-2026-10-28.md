# RoomQC — giao diện quản trị policy tư vấn vận hành

Ngày 28/10/2026. [Artifact kiểm thử có phạm vi](../../../artifacts/roomqc-advice-policy-editor-local-2026-10-28.json)
ghi65/65 và snapshot file tại lúc báo cáo; không thay bằng chứng native/E2E.
Phần triển khai tiếp của P7, thuộc T03/T04/T08/T10/T13;
browser/Android thuộc T22. Source ở nhánh tích hợp, chưa triển khai vào VPS thật.

Quản trị viên mở danh sách doanh nghiệp → chi tiết doanh nghiệp → **Tư vấn
vận hành** tại backend hiện tại. Editor này tách khỏi cấu hình OCR. Chưa phải
console trung tâm quản lý policy qua nhiều cụm; control mapping/remote integration
còn mở. Backend vẫn kiểm người dùng và quyền hiện hành cho mỗi RPC.

Đã bổ sung:

- Typed client dùng bốn RPC read/apply/lookup/cancel của migration577. Phiên,
  actor, tenant, runtime và epoch phải còn đúng trước gửi và sau nhận phản hồi.
- Lưu command phục hồi trước network; không lưu token. Khóa giữa các tab dùng
  Web Locks; thiếu hỗ trợ khóa thì chặn thao tác ghi và đưa hướng dẫn rõ.
- Mất phản hồi giữ nguyên key/payload. Lookup `not_found` không xóa pending và
  không tự gửi lại. Retry và cancel là hai hành động riêng của người dùng.
- Cancel sau commit trả kết quả thành công cũ; không báo đã hoàn tác. Chỉ bỏ
  pending sau receipt hợp lệ; receipt cũ không ghi đè cấu hình mới đang sử dụng.
- Editor mặc định chưa bật, không tự điền quota thương mại; có lý do thay đổi,
  phiên bản và cảnh báo xung đột. Tắt policy đã hết hạn giữ được thời hạn cũ.
- Đóng hộp thoại, logout, thu quyền, khóa tài khoản hoặc A→B→A không khôi phục
  callback cũ. Không render thông báo thành công thuộc phiên đã rời đi.

Kiểm thử đã kết thúc:

| Kiểm tra | Kết quả |
|---|---|
| Client/validation/journal/transport | 44/44 |
| Hook identity/cache/receipt/recovery | 12/12 |
| Editor component | 5/5 |
| Hồi quy danh sách/quản trị doanh nghiệp | 4/4 |
| Tổng lượt cuối | 65/65 trên 5 file, exit0 |
| TypeScript `tsconfig.app.json` | exit0 |
| ESLint các file thay đổi | exit0, không lỗi; một cảnh báo `any` có sẵn ở TenantDetailsDialog |

Giữ lịch sử lượt đầu 57/59: hai assertion của hook cần sửa cách chờ React Query
notify và xử lý notice null. Sau sửa, 59/59, mở rộng consumer 63/63, rồi thêm
lost-cancel/historical-receipt đạt 65/65. Không sửa expected để bỏ hành vi lỗi.

Đây là pure-client, hook và component với server/lock fixture. Chưa có actual
browser Web Locks, Android/WebView, test production client trực tiếp trên
Auth/REST thật hoặc tương thích binary cũ. Packet backend policy577 native đã
có bằng chứng riêng; không chuyển bằng chứng đó thành E2E cho editor mới.

Backend source binding vẫn giữ `34822182b2b5836d68ac65228a6aa62e28f2ea0e57b1022b9bb4d8e6d0236b46`
với198 file. Không sửa backend/migration/config trong lúc full run75b23132abab.
Thay đổi frontend được ghi riêng; full backend không nghiệm thu editor này.

Nhận tiếp: nối client vào phép thử Auth/REST thật có ownership/cleanup; kiểm
browser hai tab, reload, mất phản hồi và Android. Sau đó tiếp delta control
mapping/freshness/retention/abuse theo19.40; không tự mở dịch vụ hoặc đặt TTL,
quota thương mại hay xóa fence. 70 ca phát hành và122release entries chưa đổi.
