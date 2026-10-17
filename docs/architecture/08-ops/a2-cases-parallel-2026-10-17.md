# A2 — nền tảng hồ sơ kiểm tra, nhánh song song

**Bổ sung kiểm chứng sau bàn giao:** đã có PostgreSQL focused dependency-schema
integration độc lập; xem [kết quả 73 kiểm tra](a2-cases-db-isolated-validation-2026-10-17.md).
Các dòng `Not-run` DB bên dưới là trạng thái lúc bàn giao source ban đầu và đã
được thay thế trong đúng phạm vi SQL ở báo cáo mới. Auth HTTP/full-stack/browser
và deployment vẫn chưa được kiểm chứng; migration chưa áp DB chính bởi nhánh này.

Ngày: 17/10/2026. Nhánh `codex/roomqc-a2-reconciliation-cases`.
Baseline: `d42427291fae73314a28c50ed1375bd08a467345`.

## Trạng thái bàn giao

**Chỉ hoàn thành mã nguồn first slice create/view/note; chưa nghiệm thu A2.**
Migration `20261017145741_subscription_reconciliation_cases_foundation.sql`
được tạo qua Supabase CLI, **chưa áp dụng trên bất kỳ DB nào trong đợt này**.
Không thay dữ liệu khách, lịch cron, provider, SePay, email, cấu hình VPS,
Docker runtime, package hoặc lockfile.

Đã đọc skill Supabase và Postgres best practices; đối chiếu changelog hiện hành
và tài liệu sessions. Thiết kế dùng kiểm tra phiên trực tiếp, khóa transaction,
index khóa nguồn và keyset lịch sử. Breaking change TLS hosted và PostgreSQL
minor update không làm thay đổi API được dùng ở slice này; không nâng runtime.

## Phạm vi có mã nguồn

- Nút “Mở hồ sơ kiểm tra” trong tab đối soát tenant hiện có; không thêm menu phụ.
- Máy chủ quyết định tenant, invoice cùng tenant và snapshot từ payment nguồn.
  Client chỉ gửi payment ID, action, request ID, ghi chú và expected version;
  không nhận số tiền/tenant/invoice do client lựa chọn làm bằng chứng.
- Một hồ sơ được giữ lại cho mỗi payment (`UNIQUE(payment_id)`), kể cả retry
  hoặc hai admin tạo cạnh tranh. Chưa có trạng thái kết luận nên không tạo
  hồ sơ mới thay hồ sơ cũ. `created:false` mở hồ sơ sẵn có, **không lưu lý do
  mới**; UI giữ nội dung và nói rõ cần lưu thành ghi chú riêng nếu muốn.
- RPC đọc/ghi yêu cầu `public.platform_support_actor()` hiện có, cộng xác nhận
  email và không bị ban trong Auth. Helper cũ kiểm tra role DB, active/unlocked,
  `auth.sessions.session_id` và `not_after`; không dùng user metadata để cấp quyền.
- Case/event/receipt ở schema `private`, bật RLS và không có Data API/table DML
  grants cho public/anon/authenticated/service_role. Public RPC definer có
  search_path rỗng, kiểm tra actor trước khi đọc/kiểm tra tham số và chỉ grant
  execute authenticated. Không có RPC cho service credential bypass ở slice này.
- Event ghi actor, thời gian máy chủ, lý do/note, before/after và request ID
  trong cùng transaction. Trigger từ chối UPDATE/DELETE/TRUNCATE event/receipt.
  Đây không phải lưu trữ WORM: DB owner vẫn có thể ALTER/DROP object.
- Receipt theo actor + request ID khóa transaction; retry chính xác trả kết quả
  đã commit. Cùng ID nhưng khác command bị PT409. Note dùng version + row lock;
  stale writer bị PT409 thay vì ghi đè. Không sửa payment/invoice/entitlement.
- Lịch sử phân trang máy chủ, tối đa 50 event; cursor theo version giảm dần.
  Snapshot và lịch sử không bị cascade xóa theo nguồn, nguồn mất vẫn có thể
  tra bằng payment ID đã biết. Nếu nguồn bị đổi tenant, từ chối chéo phạm vi.
- UI xác thực JSON nguồn/tenant/event, ẩn evidence cũ khi refresh hoặc lỗi quyền,
  không hiện lỗi thành empty success, thiếu RPC/schema báo chưa cài đặt và không
  có nút ghi. Hủy thao tác ở đây chỉ “Ẩn chi tiết”, không phải kết luận case.
- Khi ghi bị mất phản hồi, giữ exact request và khóa nội dung đến khi nhận
  receipt/definitive rejection. Refetch/focus thấy version mới không tạo ID mới.

## Kiểm thử đã chạy

- `npm ci --no-audit --no-fund` trong worktree riêng; không thay lockfile.
- Focused Vitest: 37/37 đạt trong 4 file (18 test case mới + 19 regression).
  Có create, create cạnh tranh trả `created:false`, exact retry, mất phản hồi
  rồi refresh thấy version mới, conflict, schema chưa có, khóa quyền, không
  session, source ineligible, chuyển tenant, double-submit, cursor/audit parser.
- TypeScript app và ESLint các file sửa: đạt; chạy lại trước commit.
- Các test trên là unit/component dùng mock; **không phải browser E2E hoặc DB
  integration**. Không tính chúng là bằng chứng SQL permissions/race đã chạy.

## Cổng tích hợp chưa chạy — không được bỏ qua

Chưa chạy SQL trên DB, advisors, DB lint, migration history, concurrency thật,
browser, build/container hoặc deploy. Root cần review, tích hợp và kiểm thử
trên DB độc lập/fixture được duyệt; không apply vô điều kiện vào DB đang dùng.

Ma trận bắt buộc trước khi bật cho vận hành:

| Kịch bản DB/Auth thật | Kết quả cần đạt | Đợt này |
|---|---|---|
| Anonymous, owner, staff; admin bị lock/ban/bỏ role/logout | Không đọc/ghi, không trả receipt cũ khi đã mất quyền | Not-run |
| 20 retry cùng request; request ID khác nội dung | Một case/event; exact receipt; khác nội dung PT409 | Not-run |
| Hai admin tạo đồng thời cùng payment | Một case/create event; loser mở case có sẵn, note chưa lưu | Not-run |
| Hai note cùng expected version | Một ghi thành công, một PT409, không mất lịch sử | Not-run |
| Mất phản hồi sau commit, refetch và retry note | Receipt cũ, không thêm note thứ hai | Not-run |
| Invoice khác tenant, source mất/đổi tenant | Không lộ nội dung invoice khác; giữ audit; chặn đổi tenant | Not-run |
| Ghi/truncate event hoặc receipt trực tiếp | Bị chặn qua grants/RLS/trigger | Not-run |
| So sánh payment/invoice/tenant entitlement trước/sau mọi case command | Không thay đổi dữ liệu tài chính/gói | Not-run |
| Hơn 50 event và nhiều trang | Không trùng/mất event, cursor đúng | Not-run |

## Còn lại của A2 / giới hạn

1. Chưa phân công, workflow trạng thái, kết luận/mở lại hoặc chính sách người
   nhận hợp lệ; chưa có upload/chứng từ hay bất kỳ quyết định tài chính nào.
2. Snapshot hiện chỉ là trạng thái/số tiền/loại tiền và invoice cùng tenant tại
   lúc mở, chưa chứa bộ diagnostic flags và chưa so sánh thay đổi nguồn hiện tại.
3. Chưa có danh sách case riêng có filter/phân trang theo tenant/người nhận/
   trạng thái. UI hiện đi vào từ source trong hàng đợi đối soát; source hết
   dấu hiệu và biến khỏi hàng đợi thì chưa có điểm vào UI để tìm lại case cũ.
   **Phải bổ sung index case trong cùng tab trước khi coi A2 đầy đủ.**
4. Pending request hiện chỉ giữ trong component đang mở. Tab bị đóng, đổi source,
   đóng dialog cha, reload toàn trang hoặc app unmount làm mất receipt handle.
   Cần persistent safe pending-command recovery trước nghiệm thu retry E2E đầy đủ.
   Không lưu token/secrets; receipt recovery phải tiếp tục kiểm tra live actor.
5. Chưa có cơ chế retention/export dành riêng audit; không tự xóa lịch sử.
6. UI chưa có tên người thực hiện (hiện actor UUID) và chưa nghiệm thu mobile/
   accessibility bằng browser. Không gọi slice này production-ready.

## Hợp đồng tích hợp

File sở hữu: migration nêu trên; `src/lib/subscription-reconciliation-cases*`;
`SubscriptionReconciliationCase*`; thêm đúng nút/selected panel tại
`SubscriptionReconciliationPanel.tsx`; báo cáo này. Không cần đổi App/router,
tenant table, billing dialog, worker, cấu hình hay dependency.

API đọc: `admin_subscription_reconciliation_case(payment_id,before_version)`.
API ghi: `admin_mutate_subscription_reconciliation_case(payment_id,request_id,
action,note,expected_version)`, action chỉ `create` hoặc `note`.
Chưa regenerate Supabase types; UI dùng cast RPC có giới hạn và parse Zod output.
