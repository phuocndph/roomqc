# RoomQC: rà soát và kế hoạch quản lý khách hàng sau đăng ký

Ngày 17/10/2026; điều chỉnh thứ tự triển khai sau lần rà soát kế hoạch. Phạm vi bằng chứng: mã nguồn, tài liệu và dịch vụ local trên máy hiện tại. Đây là kế hoạch triển khai, **không phải xác nhận hệ thống production đã sẵn sàng**. Mục 2 là hiện trạng lúc rà soát ban đầu; kết quả triển khai sau phê duyệt được ghi ở mục 7. Không thay đổi dữ liệu khách hàng hay cấu hình VPS.

## 1. Mục tiêu vận hành

Khách tạo tài khoản, xác thực email, khai báo khách sạn rồi dùng ngay trên `roomqc.com/app/<slug>/`. RoomQC quản lý một hoặc nhiều cụm backend, gói sử dụng, thanh toán, hỗ trợ, cảnh báo, backup và nâng cấp. Mỗi lần đăng ký tạo workspace/tenant trên cụm đang có sức chứa; **không tạo một VPS riêng cho từng khách sạn**. Ban đầu mở một cụm production và một nhóm pilot; mở cụm tiếp theo khi số liệu tải và diễn tập hai cụm đã đạt.

RoomQC cần theo dõi cả việc khách **bắt đầu dùng được sản phẩm**: đã thêm phòng, mời nhân viên và tạo giao dịch đầu tiên chưa. Công cụ vận hành trước pilot chỉ cần trả lời: workspace/tenant ở cụm nào, ai là chủ sở hữu, cấp phát có kẹt không, gói còn hạn không, thanh toán đã khớp chưa và mã lỗi để hỗ trợ. Console phân tích toàn bộ sử dụng và chi phí được mở rộng sau khi pilot cho thấy nhu cầu thực. Khách chỉ thấy dữ liệu và gói của doanh nghiệp mình.

## 2. Hiện trạng có bằng chứng

| Mảng | Đã có trong repo/local | Khoảng trống hoặc rủi ro cần xử lý |
|---|---|---|
| Đăng ký | `/start`, reservation slug/email, xác thực Auth, `/app/<slug>`, `provision` và receipt/idempotency tại cụm. Migration workspace và phòng đã áp dụng local. | Directory chỉ là tính năng opt-in; `.env.vps.example` để flag false. Trên máy đang dùng, RoomQC `8082` trả 503 cho `/api/control/healthz`; cổng `8090` đang là Vite của dự án CRM khác. Chưa có đường đăng ký directory hoạt động trên địa chỉ người dùng hiện mở. |
| Dữ liệu khách | Cấp phát tenant/owner/hotel/trial trong transaction; phòng ban đầu có quota và retry; lời mời nhân viên qua Auth đã kiểm thử local. | Chưa có E2E đầy đủ từ email thật đến khách sạn hoạt động trên domain/VPS. Mẫu nghiệp vụ có phiên bản và khả năng cấu hình độc lập nhiều khách sạn còn trong backlog. |
| Directory | Có Node service, PostgreSQL riêng, registry cụm, capacity, reservation expiry, attempt log và bootstrap. `test:control:local` đã được ghi nhận trong runbook. | Không thấy console quản trị directory, đối soát định kỳ receipt, hàng đợi xử lý workspace kẹt provisioning, hay báo cáo sức chứa cụm. Hạn đăng ký hiện là giới hạn toàn hệ thống + email, limiter theo socket IP chưa đủ để mở công khai. |
| Gói/thanh toán | Có bảng plan/tenant usage/invoice/payment, màn hình gói và SePay webhook/RPC settle. | Directory và gói nằm ở hai nơi nhưng chưa có màn hình tổng hợp theo workspace. `check-subscription-status` có code, song cron local chỉ thấy `roomqc-email-worker`; chưa chứng minh job gói đang chạy. Một số luồng cập nhật gói trực tiếp từ browser cần kiểm tra quyền/RLS và giao dịch trước khi dùng thật. |
| Quản trị khách | Có danh sách tenant, chi tiết, billing, đổi gói, tạm ngưng/kích hoạt. | Nút “Thêm khách hàng” chưa có handler. `BulkActions` chỉ hiện toast thành công cho gửi thư/tạm ngưng/kích hoạt/xóa, không thực thi. `useDeleteTenant` ghi “soft delete” nhưng gọi `.delete()` thật; không đưa hành động này vào quy trình vận hành trước khi thiết kế lưu trữ/khôi phục. Danh sách `useTenants` tải mọi tenant và dữ liệu liên quan về client, cần phân trang/aggregate server cho mục tiêu 1.000 khách sạn. |
| Email | Auth OTP, lời mời, email nghiệp vụ, queue/worker và Mailpit local đã có; cron email local đang active. | Resend/DNS/gửi Internet vẫn cần nghiệm thu. Không dùng kết quả Mailpit để kết luận email production đã hoạt động. |
| Vận hành | Docker web `8082` healthy; Supabase local đang chạy. Có runbook triển khai và hướng dẫn backup. | Chưa có bằng chứng staging/production, monitoring và diễn tập restore của directory + cụm + Storage; chưa có số đo tải để hứa 1.000 khách sạn/100.000 người cùng lúc. |

Nguồn chính: `server/control/{app,store,schema}.mjs`, `src/pages/auth/{WorkspaceStart,Onboarding}.tsx`, `src/hooks/super-admin/useTenants.ts`, `src/components/super-admin/tenants/{AdvancedTenantsManagement,BulkActions,ChangePlanDialog}.tsx`, `src/hooks/useSubscription.ts`, `supabase/functions/check-subscription-status/index.ts`, `docs/architecture/08-ops/{workspace-directory-runbook,shared-domain-multi-cluster-plan,email-runbook}.md`. Kiểm tra live ngày 17/10: web `127.0.0.1:8082` trả 200, API control cùng origin trả 503; process nghe `127.0.0.1:8090` là CRM Vite, không phải RoomQC. Local migration `20261015022602`, `20261015133049`, `20261016072409`, `20261016080658` có trong lịch sử; cron liên quan email/gói chỉ thấy email worker.

## 3. Quy tắc nguồn dữ liệu và trạng thái

| Thông tin | Nguồn chuẩn | Ghi chú |
|---|---|---|
| Slug, workspace ID, cụm, tenant binding, phiên bản route, tình trạng cấp phát | Directory | Không để trình duyệt tự đặt cluster/tenant ID; không sửa mapping khi cụm mất kết nối. |
| Owner, hotel, nhân viên, quyền, phòng, usage và gói hiệu lực | Backend của cụm | Quota và trạng thái ghi được thực thi tại backend; directory không nằm trên đường ghi nghiệp vụ. |
| Invoice, giao dịch, đối soát và số tiền đã nhận | Backend thanh toán/RPC tại cụm | Một mã giao dịch chỉ settle một lần; sự kiện webhook phải định tuyến được về workspace/cụm đúng. |
| Tình trạng email gửi | Mail queue/provider tại cụm; Auth SMTP riêng | `accepted` không có nghĩa là đã tới hộp thư; admin cần thấy lỗi theo request ID. |
| Backup, health và sức chứa | Hệ thống vận hành | Chỉ lưu chỉ số tổng hợp trong console trung tâm; không đưa service-role key xuống browser. |

Tách các trạng thái: **cấp phát** dùng giá trị thật trong directory (`reserved/provisioning/active/expired`; trạng thái `suspended/migrating` có nghĩa định tuyến riêng), còn “cần xử lý” là nhãn **suy ra** từ `last_error_code`/tuổi provisioning, chưa phải giá trị mới trong database. **Gói** là trạng thái hiệu lực tại cụm (`trial/active/grace/suspended/cancelled`, đối chiếu enum/migration thực tế trước khi sửa). **Cụm** có trạng thái phân bổ (`active/draining/offline`) và health quan sát riêng (`healthy/degraded/unreachable`). Không dùng một cột “trạng thái khách” để suy diễn cả ba. Tạm ngưng gói không tự đổi mapping directory; cụm mất kết nối không làm khách mất entitlement.

## 4. Kế hoạch triển khai theo thứ tự

### Đợt 0 — Đóng các lỗ hổng quản trị và chốt nguồn dữ liệu (2–4 ngày)

- Ẩn/vô hiệu hóa nút bulk chỉ hiện toast và nút “Thêm khách hàng” chưa có luồng. Đổi nhãn hoặc chặn thao tác xóa cứng; không dùng `useDeleteTenant` như một “soft delete”. Kiểm tra trực tiếp REST/RPC với owner, nhân viên và super admin cho `tenants.update/delete`, đổi plan, quota và trạng thái chỉ đọc. Nếu có đường tự nâng gói hoặc xóa ngoài quyền, sửa ở DB/RPC trước khi mở staging signup.
- Chốt hợp đồng `workspace_id`, `cluster_id`, `tenant_id`, `owner_id`, `routing_version`, request ID và các nguồn trạng thái ở mục 3. Ghi rõ email chỉ có một workspace ở v1; một tenant có thể thêm hotel. Xác định luồng đăng ký cũ nào còn hợp lệ, không chuyển khách cũ sang directory bằng suy đoán.
- Viết runbook ngắn cho provisioning kẹt: tra attempt → đọc receipt trong cụm → xác nhận binding hoặc mở ticket. Không xóa reservation/tenant chỉ vì quá thời gian. Chốt quy trình khóa thao tác thay đổi gói/xóa khi đối soát chưa rõ.

**Cổng nghiệm thu:** 0 thao tác quản trị báo thành công giả; 0 cập nhật gói/xóa tenant trái quyền trong ma trận REST/RPC; mỗi nút còn hiển thị có backend và trạng thái lỗi thật. Không tiến sang pilot nếu còn đường tự kích hoạt gói từ client.

### Đợt 1 — Một luồng đăng ký hoàn chỉnh và công cụ hỗ trợ tối thiểu trên staging (4–6 ngày)

- Dựng database directory riêng và control service trên cổng đã kiểm tra không xung đột; cổng `8090` trên máy hiện tại thuộc CRM. Reverse proxy `/api/control/` qua cùng origin, kiểm tra health và bật feature flag chỉ cho tài khoản pilot. Cấu hình một cụm, CSP và allowlist đúng origin.
- Áp migration/function/template đúng phiên bản lên staging. Chạy từ `/start` → đăng ký Auth → xác thực email → khai báo hotel → tạo phòng → mời nhân viên → đăng nhập nhân viên. Kiểm tra mất phản hồi sau commit, retry, reload, hai tab, slug hết hạn và callback. Dùng email thật tới hộp thử được kiểm soát sau khi miền gửi được xác minh; Mailpit vẫn dùng cho local.
- Tạo trang hoặc công cụ nội bộ **tối thiểu**: tìm workspace theo slug/request ID, xem trạng thái/receipt/lỗi, đối soát và thử lại an toàn. Mọi thao tác ghi cần quyền super admin, lý do và audit; công cụ không cần biểu đồ, thống kê doanh thu hay danh sách 1.000 khách ở đợt này. Giữ khách cũ trên đường legacy cho đến khi có mapping/cutover được kiểm thử.

**Cổng nghiệm thu:** bộ kịch bản E2E staging gồm ít nhất 10 trường hợp chính/lỗi đều đạt; 20 yêu cầu cấp phát/retry đồng thời cho cùng đăng ký chỉ có 1 tenant, 1 trial; không đọc/ghi chéo tenant qua REST/RPC/Storage/Realtime; nhân viên hỗ trợ tìm được nguyên nhân bằng request ID mà không sửa SQL thủ công. Đăng ký vẫn giới hạn pilot, chưa mở công khai.

### Đợt 2 — Gói, thanh toán và kết thúc sử dụng (4–7 ngày)

- Một đường server duy nhất thay đổi entitlement: SePay đã đối soát hoặc điều chỉnh bởi super admin có lý do/audit. Không để browser ghi trực tiếp `subscription_status='active'` như trong `useUpdateTenantSubscription`/dialog nếu chưa được thay bằng RPC/endpoint có kiểm tra quyền và giao dịch. Giá/ưu đãi chụp vào invoice; webhook và sync cùng nhận sự kiện vẫn settle một lần.
- Cài và giám sát job chuyển trial/active/grace/suspended; kiểm tra lịch, lỗi, retry và thông báo một lần theo mốc. Chốt chính sách khi hết hạn: phần nào chỉ đọc, quyền xuất dữ liệu và các mutation bị chặn ở DB. Test thanh toán đến muộn, hoàn tiền/điều chỉnh, gói bị hạ khi usage đang vượt quota.
- Chốt hành trình hủy: yêu cầu hủy, ngày hiệu lực, dừng gia hạn/thu phí, quyền truy cập trong thời gian chuyển tiếp, xuất dữ liệu, thời hạn lưu và xóa sau đó. Thời hạn lưu/xóa phải được chủ sản phẩm/pháp lý duyệt trước khi mã hóa; không xóa tenant bằng nút admin hiện tại. Có audit và cách hủy yêu cầu trước ngày hiệu lực nếu hợp đồng cho phép.

**Cổng nghiệm thu:** ma trận trial → paid → grace → suspended → paid recovery và hủy đạt qua UI/API/webhook; phát lại cùng webhook 20 lần hoặc chạy đồng thời webhook + sync vẫn chỉ có 1 lần settle/kỳ gói; owner/nhân viên không thể tự cấp thêm quyền; khách có đường xuất dữ liệu trước khi bị xóa theo chính sách đã duyệt.

### Đợt 3 — Backup, giám sát và mở pilot production có kiểm soát (5–8 ngày)

- Backup directory, DB/Auth cụm, Storage object và cấu hình/secrets theo lịch riêng; diễn tập restore vào môi trường khác, đối chiếu binding, bản ghi và tệp. Mục tiêu ban đầu đề xuất RPO ≤24 giờ, RTO ≤4 giờ; chỉ công bố sau khi diễn tập đạt.
- Cảnh báo tối thiểu: API/Auth/DB/Storage/Edge/queue, 5xx/p95, workspace kẹt provisioning, email lỗi, thanh toán bất thường, backup thất bại và sức chứa. Mỗi cảnh báo có người nhận và runbook. Draining chỉ dừng nhận khách mới, không đổi route khách cũ.
- Bổ sung chống bot/giới hạn tại edge trước khi mở signup công khai. Canary 1 khách sạn nội bộ rồi 5–10 khách pilot; theo dõi tỷ lệ hoàn thành signup, thời gian đến phòng đầu tiên/nhân viên đầu tiên/giao dịch đầu tiên, lỗi hỗ trợ và chi phí cơ bản theo tenant. Tải thử các luồng booking, realtime, upload, báo cáo theo 10–50 nhân sự/khách sạn. Không mở cụm B production chỉ từ số lượng khách sạn; hai backend thật phải được thử ở staging trước.

**Cổng nghiệm thu:** email thật vào Gmail/Outlook, backup restore thành công và RPO/RTO đo được; cảnh báo thử nghiệm tới người trực. Mục tiêu pilot đề xuất: 7 ngày quan sát, ≥99,5% khả dụng của các API quan trọng, 5xx <1% ngoài lỗi cố ý, không có sự cố rò dữ liệu/nhân đôi thu phí. Ngưỡng p95 và tải nhận khách tiếp theo được chốt bằng số đo staging trước mở rộng; không hứa số người đồng thời từ unit test.

### Đợt 4 — Mở rộng console sau khi có dữ liệu pilot (4–7 ngày)

- Từ câu hỏi hỗ trợ và số liệu pilot, thiết kế danh sách khách có phân trang server, lọc theo cấp phát/gói/cụm/độ kích hoạt, tìm slug/email qua quyền hạn; chi tiết lịch sử đăng ký, thanh toán, email, usage, ticket và sức khỏe cụm. API quản trị tổng hợp server-to-server, không đưa service-role key của cụm xuống browser.
- Thao tác thật theo vai trò và lý do: xử lý provisioning, điều chỉnh gói, tạm ngưng/kích hoạt, gửi thông báo, hỗ trợ hủy/xuất dữ liệu. Mọi lệnh idempotent, có audit trước/sau và phản hồi server; không triển khai bulk delete. Theo dõi chi phí email/Storage/tải/hỗ trợ trên mỗi tenant để quyết định giá và lúc cần cụm mới.
- Giữ dashboard phân tích sâu, dự báo doanh thu và tự chuyển tenant ngoài phạm vi pilot nếu không có nhu cầu thực. Bổ sung quy trình import khách cũ, alias slug và hai cụm production ở dự án mở rộng riêng.

**Cổng nghiệm thu:** vận hành tìm được workspace và lịch sử của một khách trong một nơi; 1.000 tenant được phân trang/lọc tại server, không tải toàn bộ invoice/activity vào trình duyệt; 0 thông báo thành công khi backend lỗi; quyền truy cập và audit của các thao tác quản trị có test.

**Mốc pilot một cụm:** hết Đợt 3, sơ bộ **15–25 ngày công kỹ thuật còn lại**. **Console mở rộng:** thêm 4–7 ngày, tổng **19–32 ngày công** cho toàn kế hoạch này. Các khoảng này không cộng máy móc với 26–42 ngày của roadmap đa cụm cũ vì nhiều việc đã làm ở local và phạm vi trùng nhau. Chưa gồm thời gian chờ DNS/Resend/VPS/staging, thời gian quan sát pilot, chuyển tenant, SSO, nhiều cụm production hay mục tiêu 100.000 người đồng thời. Chốt lại ước lượng sau Đợt 0 và E2E staging.

## 5. Checklist nghiệm thu trước khách trả phí

1. Không còn hành động quản trị giả hoặc đường nâng gói/xóa tenant trái quyền. Chính sách hủy, xuất, lưu và xóa dữ liệu đã được duyệt.
2. Signup có chống bot; email xác thực/callback/quên mật khẩu/mời nhân viên dùng domain thật. E2E staging và test retry/đồng thời đạt; owner/nhân viên/khách khác không rò dữ liệu qua REST/RPC/Storage/Realtime/cache.
3. Quota thực thi tại server. Webhook/sync settle một lần; hết hạn, gia hạn, thanh toán đến chậm và hủy có kết quả đúng, có audit. Khách có đường xem/xuất dữ liệu theo chính sách.
4. Công cụ hỗ trợ tối thiểu tìm được workspace ↔ cụm ↔ tenant ↔ gói ↔ lỗi theo request ID; thao tác hỗ trợ có quyền và kết quả server. Console đầy đủ của Đợt 4 không phải điều kiện để bắt đầu pilot.
5. Backup directory/cụm/Storage đã restore thử; email thật và cảnh báo đã thử; theo dõi 7 ngày pilot với mục tiêu khả dụng/5xx ở Đợt 3 và ngưỡng tải được đo trước khi mở rộng.

## 6. Việc làm ngay sau tài liệu này

Thực hiện Đợt 0 theo thứ tự: rà quyền cập nhật gói/xóa tenant bằng API trực tiếp → sửa/ẩn thao tác quản trị giả → chốt trạng thái và runbook provisioning kẹt. Sau đó dành cổng riêng cho control service staging và làm luồng đăng ký Đợt 1. Không bật directory signup công khai trên `roomqc.com` hoặc chuyển khách cũ trước khi các cổng nghiệm thu liên quan đạt.

## 7. Nhật ký triển khai sau phê duyệt — 17/10/2026

**Đợt 0: đã triển khai và kiểm thử phạm vi local; chưa nghiệm thu staging/production.**

- Migration `20261017032842_tenant_entitlement_permissions.sql`: thu hồi quyền UPDATE toàn bảng và DELETE tenant từ browser; chỉ giữ danh sách cột hồ sơ/cấu hình được sửa, vẫn áp RLS. Kể cả super admin không ghi trực tiếp cột gói. RPC `admin_manage_tenant` kiểm tra admin active/không khóa, lý do, tenant tồn tại, số phòng/kỳ hạn và plan tại DB; khóa tenant và commit thay đổi/audit trước-sau cùng transaction. Tạm ngưng bật read-only; khôi phục không tự gia hạn gói hết hạn.
- Chặn khách tự settle payment, sửa completed hoặc gán gateway ID; giữ yêu cầu pending và xác nhận từ backend/super admin. Sửa helper nhận diện service role để tương thích JWT claims dạng JSON của PostgREST. Migration `20261017034307_tenant_readonly_admin_guards.sql` kiểm tra cả admin bị khóa trên RPC read-only cũ; server vẫn có thể xử lý expiry/recovery.
- Bỏ hook khách tự kích hoạt gói; mua thêm/gia hạn đi luồng thanh toán. Dùng thử không tự tăng quota: khách tạo phòng trong giới hạn server hoặc liên hệ hỗ trợ. Bỏ bulk toast giả và nút thêm khách chưa có handler; vô hiệu hóa xóa cứng. Thao tác admin chờ kết quả thật, giữ form khi lỗi, không báo thành công khi RPC trả rỗng. Auto-save cài đặt chung không còn bỏ qua lỗi DB.
- Chốt nguồn trạng thái và quy trình xử lý tại [runbook provisioning](customer-provisioning-triage-runbook.md). Không tự sửa mapping hoặc xóa reservation khi mất phản hồi.
- Phát hiện và sửa lỗi trong chính script kiểm thử: `test-control-local.mjs` từng chạy lại migration directory cũ, ghi đè guard lời mời/link email mới. Đã khôi phục định nghĩa hiện tại và chuyển script sang kiểm tra schema tiên quyết, không downgrade RPC. Test email chờ trạng thái fixture qua các batch worker có giới hạn thay vì giả định một lần gọi sẽ xả hết queue.
- Đã build lại Docker RoomQC và cập nhật dịch vụ local cổng 8082; không thay đổi CRM/cổng 8090. Không reset DB. Các tài khoản, tenant và container tạm do test tạo được dọn theo ID cụ thể; không xóa dữ liệu có sẵn.

| Kiểm chứng local | Kết quả |
|---|---|
| Vitest toàn bộ | 532 đạt; 16 bỏ qua trong 2 file integration cần cấu hình riêng, không tính là đã đạt |
| Ma trận quyền tenant/plan/payment/read-only | 55 kiểm tra đạt; gồm owner/staff/khác tenant/anon/admin/admin bị khóa và 20 retry settle chỉ áp dụng một lần |
| Thiết lập phòng | 36 kiểm tra đạt |
| Đăng ký legacy | 28 kiểm tra đạt |
| Directory HTTP → DB → Auth/RPC/RLS | 42 kiểm tra đạt; chạy lại sau sửa script, giữ guard email/invitation |
| Email/Auth/lời mời/queue | 58 kiểm tra đạt trên Mailpit; không gửi Internet |
| Control unit | 4 đạt |
| TypeScript, lint phạm vi sửa | TypeScript đạt; lint không có error, còn cảnh báo any trong mã hiện hữu |
| DB security advisors / DB lint public,private | Không báo lỗi ở lần kiểm tra local |
| Docker build / verify:build / verify:container | Đạt; ứng dụng phục vụ tại http://127.0.0.1:8082 |

**Việc tiếp theo:** cần xác định staging/VPS, quyền truy cập triển khai và origin/TLS để mở Đợt 1 trên môi trường thật. Local control integration dùng database/container tạm; chưa có control runtime thường trực, health cùng origin hiện vẫn 503 và directory flag chưa bật. Không coi 42 kiểm tra local là E2E staging, thử tải, Storage/Realtime audit đầy đủ hay pilot production.

Trước thanh toán thật cần tiếp tục Đợt 2: giá/ưu đãi chụp vào quote/invoice và xác thực tại server (hiện UI còn tính giá), lịch expiry có giám sát, vòng đời hủy/xuất/lưu/xóa có chính sách được duyệt. Resend/DNS, backup restore và cảnh báo vẫn theo Đợt 3. Chưa mở signup công khai, chưa chuyển khách cũ, chưa khẳng định khả năng phục vụ 1.000 khách sạn.

Backlog console hiện hữu chưa xử lý ở đợt này: bộ lọc plan trên danh sách tenant đang có lựa chọn basic/premium/enterprise cũ và chưa áp dụng planFilter; trường email tìm kiếm/xuất cần chuẩn hóa với email của tenant. Cần sửa cùng phân trang/lọc server ở Đợt 4, không coi console hiện tại là đã nghiệm thu đầy đủ.

### Tiếp nối Đợt 1 — công cụ hỗ trợ và kiểm chứng local (17/10/2026)

Đã hoàn thành phần mã/kiểm thử local của lượt này, **chưa đóng cổng nghiệm thu
Đợt 1 trên staging**. Báo cáo và ma trận 16 ca staging còn phải chạy tại
[báo cáo Đợt 1 local](customer-lifecycle-phase1-local-validation-2026-10-17.md).

- Có CLI/API nội bộ tra slug/request ID, trạng thái directory/receipt/lỗi và
  đối soát binding an toàn. Không tạo lại tenant hay thay đổi trial/gói; chưa
  xây trang console UI. Audit started/failure và mapping + audit thành công
  có transaction, actor/lý do/trước-sau; runtime không xóa hoặc sửa actor audit.
- Nguồn quyền hỗ trợ cố định tại cụm cấu hình, kiểm tra role thật, hồ sơ và
  session Auth còn hiệu lực. Chặn user_metadata tự gán admin và JWT đã logout.
  Migration `20261017035237_platform_support_actor.sql` đã áp dụng/lưu lịch sử local.
- Cổng control/Vite/Docker/mẫu Nginx mặc định 8091; không đụng 8090 của CRM.
  Cập nhật runbook và quyền runtime tối thiểu, không đổi mapping khách cũ.
- 87 kiểm tra directory/support local đạt; gồm 20 cấp phát ban đầu đồng thời
  chỉ một tenant/trial và 20 retry không gia hạn trial. 8 unit control đạt
  trên host/image; 532 Vitest đạt, 16 skip không tính đạt. Hồi quy quyền 55,
  phòng 36, legacy 28 và email Mailpit 58 đều đạt. TypeScript/lint phạm vi sửa,
  DB advisors/lint và Docker control build/container smoke đều đạt.
- Không có control thường trực hoặc `.env.control`; test tự dọn database và
  service tạm. RoomQC 8082 vẫn chạy, proxy control vẫn 503 và directory flag
  vẫn tắt. Cần VPS/origin staging đã xác định, DB riêng bền vững, TLS/proxy,
  email thật và nghiệm thu browser E2E/Storage/Realtime trước khi pilot.

### Tiếp nối Đợt 1 — hành trình khách hàng tích hợp local (17/10/2026)

- Một suite mới chạy xuyên suốt signup/OTP Mailpit → cùng tenant/hotel/phòng →
  mời/đăng nhập nhân viên và kiểm tra hai tenant qua REST/RPC/Storage/Realtime:
  **69 kiểm tra đạt**. Đã sửa lỗi upload Storage local 42P10 bằng chỉ mục tương
  thích, không reset DB, đổi quyền hay sửa object metadata.
- Chạy lại 87 kiểm tra directory/support, 8 control unit, 532 Vitest/16 skip,
  TypeScript/lint, DB security advisors/lint và frontend container smoke.
- [Báo cáo và giới hạn](customer-journey-local-validation-2026-10-17.md): chưa
  có browser E2E, staging/VPS, email Internet, audit mọi bucket/channel hoặc tải.
  Đợt 1 chưa được nghiệm thu staging; không tự mở public signup/cutover.

Sau review bộ kiểm thử: đã sửa 4 điểm báo đạt nhầm/thiếu bao phủ (mã lỗi,
Realtime disconnect, timeout và Storage INSERT chéo tenant). Lần chạy mới:
81 ca hành trình đạt, 16 regression guard đạt/thêm CI; control unit 8,
Vitest 532/16 skip và TypeScript đạt. Không sửa quyền/schema hay mở public signup.

### Bắt đầu Đợt 2a — nền tảng báo giá server, local (17/10/2026)

- Thêm snapshot báo giá private và RPC owner-scoped create/get; giá/ngày, kỳ
  tối thiểu/cap đọc từ paid plan server, chiết khấu giữ 0/5/10/15% hiện hữu.
  Tính ngày mua thêm/gia hạn tại DB, kiểm tra số phòng thực tế và session/role
  còn hiệu lực. 20 retry đồng thời lưu đúng một bản, không tự thay giá bản cũ.
- 55 kiểm tra quote local đạt, có tenant khác/anon/owner bị khóa/bỏ role/logout,
  config giá/cap/kỳ tối thiểu và không đổi entitlement/hóa đơn/giao dịch.
- **Chỉ là foundation:** snapshot trả checkout_enabled=false, chưa nối UI/
  hóa đơn/SePay. Client insert invoice/pending payment và trusted settlement
  metadata cũ vẫn là backlog cần đóng trong Đợt 2b trước thanh toán thật.
- [Báo cáo, giới hạn và kế hoạch Đợt 2b](subscription-quotes-local-validation-2026-10-17.md).
  Không coi Đợt 1 staging hoặc toàn bộ Đợt 2 đã hoàn thành; không mở public signup.

### Tiếp nối Đợt 2b1 — không chờ mã khóa/quyền bên ngoài (17/10/2026)

- Đã thêm RPC chuẩn bị đơn nháp từ quote server: invoice/payment/private
  binding commit cùng transaction, 20 retry một bản và hai tab chống trùng.
  Quote/gói/giá/cap thay đổi bị phát hiện, draft không có bank/reference và
  không thể settle/kích hoạt gói. Chưa cutover checkout/thu hồi legacy INSERT.
- Sửa worker expiry pending gọi RPC atomic, không overwrite completed, hủy
  đúng invoice draft/sent/overdue, không báo partial success; giữ cutoff24h.
  Không cài lịch/secret hoặc chạy global sweep dữ liệu có sẵn.
- Chặn QR cho draft, expired/refunded và dữ liệu thanh toán không hợp lệ.
  79 ca tích hợp mới; quote55/quyền55/journey81; Vitest570 đạt/16 skip;
  guard16/control8, TypeScript/lint/security advisors/DB lint đạt.
- [Báo cáo Đợt 2b1 và giới hạn](subscription-checkout-drafts-local-validation-2026-10-17.md).
  [Danh sách khóa/quyền/quyết định để làm sau](roomqc-deferred-access-and-decisions-2026-10-17.md)
  đã tách phần chờ dịch vụ ngoài khỏi việc kỹ thuật còn có thể làm local.

### Sửa sau review Đợt 2b1 — 17/10/2026

- UI gia hạn/mua thêm dùng báo giá server và tạo nháp tường minh; đóng quyền
  browser ghi invoice/payment, giữ pending legacy để đối soát, chặn cả hai
  entry point kích hoạt cũ. Chưa có payable settlement hoặc thu tiền thật.
- Hủy đơn không hủy invoice đã paid/có completed sibling; shared invoice
  chỉ đóng khi hết pending. QR dùng bank nền tảng, selection theo ID/query
  mới và ẩn/đóng khi cập nhật trạng thái. Nháp có chỗ xem/hủy.
- Hồi quy: checkout96, quote55, quyền56, journey81; Vitest606/16 skip;
  TypeScript app, lint phạm vi sửa, DB security advisors/lint đạt.
- [Báo cáo và giới hạn](subscription-checkout-review-fixes-2026-10-17.md).
  Chưa nghiệm thu browser E2E/staging, không tuyên bố hoàn thành toàn bộ Đợt 2.

### Tiếp nối Đợt 2 — hàng đợi đối soát chỉ đọc, 17/10/2026

- Có tab Đối soát trong Thanh toán của từng khách hàng: pending và completed
  lệch trạng thái, nháp không payable, legacy, quá 24h, liên kết/số tiền/sibling
  cần kiểm tra. Bộ lọc và phân trang keyset tại server, không auto-fix chứng từ.
- RPC chỉ cho quản trị nền tảng có profile/Auth/session còn hiệu lực; không
  trả raw metadata/ghi chú, không đưa service key xuống browser. Các tab
  lịch sử cũ chỉ fetch khi mở đúng tab; chưa cải tạo toàn bộ console cũ.
- 48 kiểm tra tích hợp và 22 test mới đạt; Vitest 628 đạt/16 skip. Không coi
  đây là browser E2E hoặc luồng xử lý đối soát/settlement đã hoàn thành.
- [Báo cáo, cách dùng và giới hạn](subscription-reconciliation-local-validation-2026-10-17.md).
  Không bật thu tiền thật, signup công khai hay thay đổi gói/chứng từ khách.

### Kế hoạch tiếp nối sau tab đối soát — đề xuất 17/10/2026

[Báo cáo hiện trạng và kế hoạch tiếp theo](roomqc-next-delivery-plan-2026-10-17.md)
đề xuất A0 baseline browser E2E/rà đường cũ → A1 độ tin cậy job/monitor → A2
hồ sơ đối soát có lịch sử → A3 console/phân trang → A4 hồi quy local. Khoảng
6–10 ngày công sơ bộ, chốt lại sau A0; không cộng máy móc vào roadmap cũ.
Thanh toán payable, vòng đời/hủy và staging/pilot có cổng duyệt riêng.
Đây là kế hoạch mới, không phải nhật ký các mục đã triển khai xong.
