# RoomQC — xóa khách sạn và ranh giới quyền trực tiếp của 22 bảng

Ngày ghi nhận: 27/10/2026, Asia/Bangkok. Đây là bằng chứng local có phạm vi của
candidate **818**, source `ea788e013096d699c6b7b0c30ee0bb23a6aea0dd9663d272bc1a91202dc87196`,
**554 migration nghiệp vụ + 12 directory**. Không phải nghiệm thu toàn bộ VPS/signup.

## Kết quả và lỗi đã sửa

Default full backend817 đã kết thúc **exit 1** tại `hotel_delete_checks`, trước
managed health, advisors và catalog. Khi owner xóa khách sạn đang được receipt
bảo vệ, hệ thống trả **403/42501**, trong khi contract yêu cầu **409/23503** từ
FK bảo vệ receipt. Dữ liệu chưa mất, nhưng guard membership nhận thấy parent
hotel đã biến mất trong cùng câu lệnh và từ chối cả cascade hợp lệ. Trường hợp
xóa khách sạn không bị receipt ràng buộc nhưng có phân công nhân viên cũng bị ảnh hưởng.

Migration mới chỉ cho phép nhánh DELETE membership phát sinh từ FK hotel
được xác nhận: owner còn hiệu lực, cùng tenant, parent đã bị xóa trong câu lệnh,
trigger depth bằng hai và đúng FK immediate/validated/nondeferrable CASCADE.
Không dùng cờ do client truyền. Helper private dùng SECURITY INVOKER, search_path
rỗng và không cấp EXECUTE cho các role ngoài. Quyền ghi trực tiếp vẫn bị thu hồi.

Version trigger vẫn chạy. Nếu receipt chặn parent delete, hotel, membership và
version phải rollback cùng nhau. Không đổi kỳ vọng test thành403 để che lỗi.

## Bằng chứng trên đúng candidate818

| Bộ kiểm | Kết quả | Giới hạn |
|---|---|---|
| Native hotel qua Auth/REST thật | **25 kiểm tra + 2 lock races**, đạt, exit0 | Dữ liệu tổng hợp trong Docker riêng |
| Xóa hotel không có receipt với owner và staff membership | Xóa đúng hai membership; mỗi version hotel tăng một lần; profile, membership khác và outcomes giữ nguyên | Không thử xóa dữ liệu khách thật |
| Hotel bị receipt bảo vệ | **409/23503**; replay10lần không làm mất receipt, room draft, membership hoặc đổi version | Không thay quy trình offboarding toàn hệ thống |
| Gọi helper hoặc DELETE membership trực tiếp | Bị từ chối; kiểm own/staff và các role liên quan | Không suy ra mọi đường RPC/Edge đều đã khép |
| Revoke trước / delete trước | Hai thứ tự dùng lock barrier thật; revoke thắng thì delete bị từ chối; delete đã commit trước revoke thì lệnh sau bị từ chối | Không tuyên bố có thể hủy giao dịch đã commit |
| Hồi quy authority | **125 kiểm tra + 7 races**, đạt | Scoped diagnostic |
| Hồi quy metadata | **30 kiểm tra + 4 races**, đạt | Scoped diagnostic |
| Edge update-user thực | **37 kiểm tra + 5 expiry races**, đạt | Không xác nhận mọi deployment/consumer bên ngoài đã cutover |
| Full control có DB disposable | **384/384**, exit0; 0fail/skip/cancel | Không phải full vendor backend |

Source, runtime binding và migration checksum trước/sau của các lượt tương ứng
phải khớp; artifact đi kèm giữ native terminal và kiểm cleanup độc lập. Schema
fingerprint cuối diagnostic khớp. Lịch sử fail817 được giữ riêng theo source817.

## Inventory trực tiếp mở rộng từ 19 lên 22 bảng

Ba bảng thêm vào inventory độc lập là `private.employee_authority_cancellations`,
`private.employee_authority_receipts` và `private.employee_authority_versions`.
Không chỉ tăng số đếm: bài thử độc lập có dữ liệu trong đủ22bảng, cố tình cấp
SELECT, UPDATE theo cột và service DELETE trên từng bảng mới, phải phát hiện sai
quyền; thu hồi grant thì kiểm lại đạt. Bảng lạ cũng phải làm inventory fail closed.

Native diagnostic xác nhận **264 lần từ chối cho role browser/probe**, **76 lần
từ chối service trên private tables**, **47 positive read/snapshot controls**,
**3 dynamic-invoker denials**, và22snapshot không đổi. Đây là SQL role assumption,
không gọi264request HTTP. Chỉ **5/22bảng có dữ liệu** trong diagnostic native này;
fixture PostgreSQL độc lập trong full control mới có đủ22bảng được populate.

Snapshot parent-boundary mở rộng34→37bảng;23target FK giữ nguyên. Chưa suy toàn bộ
implicit trigger/FK hoặc đường gọi gián tiếp an toàn từ direct grants.

## Catalog và advisors phải tiếp tục disposition

Catalog native ghi22no-policy targets,515functions,11views,375policies,166triggers,
45candidate entry paths và25unresolved dependencies. Graph1089nodes/1006edges
chỉ phục vụ phát hiện ứng viên. Có17candidate paths tới ba authority tables mới;
phải nối kết semantic/runtime proof, không gọi chúng là17lỗ hổng hoặc17đường đã đóng.

Graph giữ nguyên **2dynamic candidates**. Kiểm source helper mới cho thấy từ
`execute` chỉ ở comment, không có từ này sau khi bỏ SQL comments và không có
EXECUTE grant. Candidate còn lại `generate_unique_code(text,text,text)` thực sự
dùng dynamic SQL; ba denial checks không thay review các target/caller khác.

Native hotel/catalog scan có **646findings**:22INFO no-policy,7INFO FK chưa có
index,466INFO unused index,151WARN multiple permissive policies. Scoped
authority/Edge scan cùng source có **668findings**:22/7/504/135 theo cùng thứ tự.
Khác biệt workload và runtime role phải được giữ rõ.16WARN bổ sung của scan646
liên quan `roomqc_monitor`; không trình bày chênh lệch tổng count như số lỗi đã sửa.
Diagnostic hotel chưa đi tới probePrivilegeAudit nên chưa chứng minh monitor/probe
closure. Không xóa index hoặc policy chỉ để giảm số findings.

## File thay đổi và việc tiếp theo

- Migration: `supabase/migrations/20261026181954_employee_hotel_delete_cascade_boundary.sql`.
- Native regression: `scripts/control-backend-hotel-delete-checks.mjs`.
- Inventory/checks: `scripts/control-backend-no-policy-checks.mjs`,
  `scripts/control-backend-parent-boundary-checks.mjs`,
  `server/control/backend-no-policy.test.mjs`, `scripts/test-control-backend-sandbox.mjs`.

Syntax và targeted lint đã đạt trước khi freeze. Frontend58/58, TypeScript và
frontend lint thuộc813; không gán sang818. Giữ hồi quy hiện có, chạy lại khi delta tác động.

Nhận tiếp default full backend818, rồi rebuild độc lập nếu lượt default đạt;
đối chiếu nguồn/schema/runtime/render và cleanup. Hai lượt tuần tự không thay
hai backend A/B cùng chạy tạiT21. Sau đó khép current22 indirect/workflow/recipient/
offboarding, monitor-role disposition và external deployment inventory theoT08,
rồi tiếpT07→T09/T10→signup/consoles/Linux/restore/E2E/tải/pilot. Source đổi sau
freeze phải ghi candidate mới và kiểm phần bị ảnh hưởng.

**Trạng thái phát hành:**70ca worksheet vẫn `not_run`,122release entries vẫn
`unverified`, gate/reviewer/signoff giữ nguyên. Không dùng kết quả local để tự
mở signup public hoặc xác nhận sức chứa production. Chỉ mirror tài liệu và
artifact đã lược dữ liệu nhạy cảm; implementation tiếp tục nằm trong integration.
