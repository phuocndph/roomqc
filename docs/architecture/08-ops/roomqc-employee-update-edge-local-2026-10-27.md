# RoomQC — Edge cập nhật hồ sơ và thời hạn phiên: bằng chứng local 27/10

Candidate có phạm vi **817 file**, source `4c3dd83cbef43cbf0ae85e40aa62d20a432eb3beed4193ecb7087e853a06b335`, **553 migration nghiệp vụ + 12 directory**. Report này ghi phần T01/T03/T04; không ký thay toàn bộ VPS/signup, T08 hoặc 70 ca nghiệm thu. Các checkpoint 811–813 giữ bằng chứng theo source riêng.

## Thay đổi và hành vi

`update-user` trước đây sử dụng service-role và nhiều request ghi profile, membership, role, audit riêng, có nguy cơ cập nhật dở dang. Source được thay bằng adapter có version gọi một lần `edit_employee_profile` qua REST bằng JWT của người gọi và khóa công khai. Fixture chạy bundle Edge thực; môi trường của adapter chỉ có `SUPABASE_URL`, `SUPABASE_ANON_KEY`, không có service-role, mật khẩu DB hoặc khóa ký. Service chỉ ở mạng Docker nội bộ và không mở cổng host.

Contract mới yêu cầu đúng tám trường: `protocolVersion:1`, `userId`, `fullName`, `hotelId`, `positionId`, `reportsTo`, `expectedUpdatedAt`, `requestId`. Client phải giữ request key và phiên bản hồ sơ gốc. Adapter không tự tạo key/version, chọn tenant theo client hoặc thực hiện một phần payload cũ. Payload không version hoặc yêu cầu `userLevelCode`, `role`, `status`, `phone`, `departments` trả **409 CLIENT_UPDATE_REQUIRED**, không đổi dữ liệu. Thay đổi quyền/trạng thái/số điện thoại phải dùng luồng quản trị tương ứng; endpoint này chỉ sửa metadata được cho phép.

Adapter giới hạn body yêu cầu 16 KiB, phản hồi upstream 64 KiB, thời hạn toàn request 15 giây; chỉ POST/OPTIONS. Lỗi được chuyển sang thông báo an toàn, không trả lỗi SQL hoặc dữ liệu nội bộ. Timeout/response không xác thực được giữ nghĩa chưa rõ kết quả; thử lại cùng key/payload, không tạo yêu cầu mới chỉ vì mất phản hồi. Kết quả thành công chỉ có tám trường hồ sơ đã kiểm tra.

Forward migration `20261026175715_employee_profile_wall_clock_session_fences.sql` giữ command/receipt/ACL hiện hành và dùng thời gian thực của DB khi kiểm thời hạn phiên, trial và ngày hoạt động. Kiểm lại sau khi chờ khóa key/target/scope, sau khóa hotel/position/supervisor trước ghi, và trước trả kết quả sau audit/receipt. Phiên hết hạn không được replay receipt qua phiên đó; khi quyền hợp lệ được khôi phục, cùng key vẫn phục hồi đúng kết quả. Không sửa migration lịch sử.

## Kết quả có phạm vi

| Bộ kiểm | Kết quả native | Phạm vi thực sự được kiểm |
|---|---|---|
| Authority | 125 checks + 7 races đạt | Auth/REST, command quyền, direct-write closure, terminal cancellation và recovery |
| Metadata | 30 checks + 4 races đạt | API atomic sửa hồ sơ, quyền và khóa DB thật |
| Edge adapter | 37 checks + 5 expiry races đạt | HTTP tới bundle Edge thực → REST → DB; JWT caller/public apikey |
| Full control | 384/384, exit 0; không fail/skip/cancel | Toàn bộ `server/control/*.test.mjs`, có DB directory disposable, source/runtime không đổi |
| Native advisors | 668 findings, CLI 2.121.0 | Scan schema hiện hành; chưa disposition, không tương đương 668 lỗi đã xác minh |

Native fixture `95f61802fe70`, backend run `c293c1a7100b`: **exit 0**, source/runtime trước–sau không đổi, schema fingerprint cuối khớp. Tất cả migration nghiệp vụ được replay trên DB dùng một lần. Mỗi phép từ chối/fault đối chiếu snapshot cả hai tenant tổng hợp: profile, role, membership, permission, audit, receipt, authority version.

Edge kiểm owner/manager hợp lệ; 20 lần replay và bỏ phản hồi ứng dụng sau khi commit; cùng key khác nội dung; stale version; anonymous/service/staff/foreign owner/protected target/unassigned hotel; payload cũ, thiếu key, tenant do client gửi, position ngoài phạm vi, malformed/oversize/method sai. Hai request Edge+REST cùng key chỉ commit một lần; hai editor dùng cùng version chỉ một người thành công. Lỗi insert audit hoặc receipt rollback toàn bộ; retry cùng key phục hồi được. Session native bị thu hồi bị từ chối.

Năm expiry races giữ khóa DB thật tại **key, target, position, replay-key và trial-position**. Fixture quan sát `pg_blocking_pids`, chờ DB clock xác nhận đã hết hạn rồi mới thả khóa. Cả năm trả 403, không đổi snapshot. Khôi phục điều kiện hợp lệ rồi gửi cùng key đều đạt; replay success không tạo audit mới. Đây là bằng chứng runtime mới cho guard, không phải bằng chứng đã chạy baseline lỗi trước sửa.

## Lịch sử thất bại và kiểm lại

Fixture đầu `eb319a75b398`, backend `2e1746a110c2`, source `0a5a2a3ba4300d1b885c75013a91605f1132f03eea250233a51e6549e08b5995` kết thúc **exit 1** ở kỳ vọng anonymous token: thực tế 401, test chờ 403; snapshot không đổi. Authority 125+7 và metadata gốc 30+4 đạt trong lượt đó. Chỉ sửa kỳ vọng thành 401, không nới quyền. Migration guard thời hạn được bổ sung sau lượt này dựa trên review source; không gọi lượt fail đó là baseline expiry.

Hai run backend và run full control `b6b6d1e27fcf` được kiểm độc lập container/volume/network theo đúng ownership label sau cleanup: chín phép kiểm, còn 0 tài nguyên. Full control hiện hành đạt 384/384 trên đúng source817; kết quả358/358 của811 giữ trong lịch sử.

## Giới hạn và bàn giao tiếp

- Chưa kiểm kê đầy đủ bản triển khai/consumer bên ngoài của `update-user`. Source mới và fixture không chứng minh mọi endpoint production đã đổi. Không tuyên bố endpoint đã retirement; payload cũ nhận yêu cầu nâng cấp 409.
- Chưa khép workflow/recipient/offboarding, current19, dynamic SQL, các writer đặc quyền khác hoặc 668 advisor findings. Adapter không có service-role không làm các đường khác tự an toàn.
- Chưa chạy default full vendor backend, rebuild độc lập, invitation diagnostic, browser/Android E2E hoặc Linux/provider trên candidate 817. Client/hook/panel 58/58, TS/lint thuộc 813; report này không gán chúng thành lượt chạy mới.
- Bỏ phản hồi ở ứng dụng không phải cắt gói tin mạng thật. Chưa chứng minh proxy/CORS/TLS production, SSRF ở cấu hình vận hành, tải/soak hoặc sự cố host.
- Tombstone của authority command chưa có TTL/GC; retention/kích thước/abuse nhận tại T08/T10/T19. Guard thời hạn tại các điểm trong transaction không hứa hủy được mọi remote effect đã được cấp phép trước đó.

Nhận tiếp: inventory triển khai/caller còn thiếu → T08 quyền gián tiếp và disposition advisors → freeze candidate cuối → full control/default backend/rebuild → T07 và các đợt tài nguyên/signup/console/VPS/E2E/tải/pilot theo plan. **70 dòng worksheet vẫn `not_run`; 122 release entries `unverified`; gate/reviewer/signoff chưa đổi.** Chỉ report/artifact sạch được mirror sang primary; không stage/commit/merge, không sửa DB đang phục vụ/CRM/VPS/DNS/provider hoặc gửi email Internet.

[Kế hoạch hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md) · [Phiếu triển khai và nghiệm thu](roomqc-vps-signup-detailed-delivery-2026-10-26.md)
