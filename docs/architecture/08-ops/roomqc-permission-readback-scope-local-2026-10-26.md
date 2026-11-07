# RoomQC — quyền chi tiết/tổng hợp: thống nhất thực thi và giới hạn người được đọc

Bổ sung local T03/T04/T08; kết quả thuộc source 811 file có phạm vi, SHA256
`0cc91cbe5343aaadeb48d6f25a8e45c459b2e7e51b86a913a213d8a776994a5d`,
550 business + 12 directory migrations. Runtime binding 160 file bao gồm harness;
không phải hash toàn repository hoặc bằng chứng serving DB đã nâng cấp.
Timestamp UTC và kết quả đã lọc trong [artifact](../../../artifacts/roomqc-permission-readback-scope-local-2026-10-26.json).

## Vấn đề và thay đổi

Legacy `get_user_permissions` trước đây bỏ sót SYSTEM roles và để custom false
che quyền từ vai trò; kết quả có thể khác `has_user_permission` và editor mới.
Hai API đọc detail/summary cũng chưa kiểm live caller và target scope trong
định nghĩa hiện hành. Frontend dùng summary cho menu, dashboard và route đầu tiên.

Forward migration `20261026163926_employee_permission_readback_scope.sql`:

- Giữ tên tham số và DTO của hai RPC công khai. Public wrappers chuyển sang
  security invoker, logic đọc đặc quyền nằm ở private với search_path rỗng,
  auth.uid/live Auth/profile/roles/session checks và ACL authenticated riêng.
- Nhân viên, owner và platform có thể đọc quyền của chính mình khi tài khoản/
  phiên hợp lệ. Đọc người khác yêu cầu cùng capability, hierarchy và hotel scope
  như editor mới; owner tenant khác, staff đọc người khác và target không hợp lệ
  bị từ chối. Không cấp thêm quyền từ user_metadata hoặc ID do client gửi.
- Detail trả một hàng cho mỗi module/action hiệu lực trong catalog; `edit`
  gộp thành `update`, ưu tiên code catalog update khi có cả hai. Nguồn user/role
  được giữ. Custom false không phủ quyền role, SYSTEM roles và owner bypass
  thống nhất với enforcement. Summary giữ đủ tám cờ hiện có, owner vẫn có tất cả.
- Auth/profile/roles/session locks kiểm committed revocation trước đọc; foreign
  target dùng lock/authority guard đã có. Không ghi lại dữ liệu hoặc thay quyền thực thi.

## Bằng chứng trên backend thật

| Phần kiểm | Kết quả | Phạm vi |
|---|---|---|
| Actual Auth/REST, run 9fb92dfc7060 | 67 checks + 4 concurrency, tất cả đạt; native 0 | Gồm 47 checks + 3 concurrency cũ và 20 checks + 1 race readback mới |
| Metadata employee regression | 30 checks + 4 races đạt | Giữ workflow sửa hồ sơ đã có |
| Native advisors | 667 findings trên 550 migrations | Đã scan, chưa phân loại/xử lý toàn bộ |
| Source/schema | Source/migration/runtime trước–sau khớp, final binding được kiểm; schema fingerprint khớp | Không tác động serving DB |
| Full control 811, run 17f816a4a711 | 358/358, native exit 0, không skip/cancel; source/runtime trước–sau khớp | Không phải default full backend/rebuild hoặc ký nghiệm thu phát hành |
| Cleanup độc lập | Container/volume/network của backend9fb92 và directory17f816 còn 0 theo exact ownership labels | Chỉ kiểm target của hai run, không cleanup rộng |

Ma trận readback mới kiểm bằng HTTP và SQL đối soát: SYSTEM role, tenant role
hồi quy, custom false, custom export true, edit/update cả role và custom, owner A/B
self-read, owner/manager foreign-read hợp lệ, staff self-read, foreign tenant,
staff-other-user, anonymous, missing target, invoker/private ACL, inactive/locked
account và session revoke đang chờ DB lock. Khôi phục session đọc lại được.
Các assertion denial kiểm response và không đổi effects trong phần tương ứng.

## Caller và compatibility

`useUserModulePermissions()` đang gọi summary theo chính user hiện tại; các caller
menu/dashboard/mobile/first-route giữ DTO cũ. Legacy `usePermissions` cũng self-read.
Các exports detail/summary nhận userId trong `useUserPermissions.ts` không còn
active component caller qua inventory source hiện tại. Không sửa query keys,
frontend hoặc giả định mọi session/cache E2E đã được kiểm từ API fixture này.

Đây là sửa RPC readback, **chưa khóa DB direct write**. Save path editor đã dùng
atomic command; compatibility writers/privileged functions và legacy Edge
`update-user` còn cần audit và xử lý cùng proof thực thi. Tìm được source chưa
chứng minh endpoint đó được deploy/reachable; cũng không đủ để kết luận an toàn.

## Nhận tiếp theo toàn kế hoạch

1. T03/T04: closure direct-write/privileged compatibility sau inventory; terminal
   pending recovery có cơ chế an toàn khi lỗi đã rõ, không xóa outcome chưa rõ.
2. T08: indirect/current19/workflow/offboarding, 667 advisors theo từng object/risk.
3. Freeze candidate cuối, default full backend và independent rebuild cùng source;
   browser/Android/transport fault thật vẫn theo T22.
4. Tiếp T07 alerts → T09/T10 admission/budget → signup/jobs/abuse → hai console
   → Linux/offsite/on-call → A/B/E2E/load/RC → pilot theo
   [phiếu toàn phạm vi](roomqc-vps-signup-detailed-delivery-2026-10-26.md).

Giữ 70 worksheet rows `not_run`, 122 release entries `unverified`, gate/signoff như cũ.
Packet này không mở signup public hoặc xác nhận sức chứa production.
