# RoomQC — candidate810: editor quyền, catalog và lỗi hồi quy còn mở

Ngày lập theo phiên làm việc 26/10/2026, Asia/Bangkok. Timestamp chạy và rà soát
thực tế lưu UTC trong [artifact](../../../artifacts/roomqc-authority-editor-candidate810-local-2026-10-26.json).
Các kết quả dưới đây thuộc tập source 810 file có phạm vi, SHA256
`f85cd0210e1936df02c3c8c1f0f4115f6e1ca88184d98e79f5fa839edf1ea14b`,
runtime 160 file, 549 business + 12 directory migrations. Đây không phải hash
toàn repository hoặc bằng chứng bản đang phục vụ đã được triển khai.

**Kết luận:** editor và catalog mới có scoped proof. Full control hiện không
đạt; chưa đủ tích hợp để phát hành. Đầu việc tiếp theo là chẩn đoán reservation
race, khép legacy/indirect compatibility và chạy full pipeline trên candidate cuối.

## 1. Thay đổi đã có

- `UserPermissionPanel.tsx` và `HotelAssignmentSection.tsx` đã khôi phục. Panel
  dùng read model/catalog server, tách inherited/custom/effective; custom false
  không phủ định role grant. Draft dirty không bị refetch ghi đè; version đổi
  chặn save và cho người dùng chủ động tải lại.
- Mỗi save dùng một aggregate command có base version và stable request key.
  Hotels giữ đủ năm cờ, bảo vệ primary hotel; membership cũ thiếu/inactive vẫn
  hiển thị. Catalog cho biết quyền nào được ủy quyền, hạn chế mới đúng khả năng actor.
- Client lưu pending trước network, lookup trước retry; cùng actor có thể phục
  hồi sau relogin. Key/payload gốc được giữ khi chưa rõ kết quả. Hook có scope và
  epoch để bỏ response muộn, không kẹt busy khi đổi target rồi quay lại.
- Dialog tái sử dụng Panel; web/mobile refresh theo employee-authority.
  Mutation hooks nhiều request đã loại khỏi save path. Quyền DB direct write
  vẫn cần kiểm compatibility và forward migration riêng.
- Migration `20261026153321_employee_authority_editor_catalog.sql` bổ sung
  delegation metadata và hotel catalog; đã áp trong fixture với đủ549 migrations.

## 2. Bằng chứng chạy có phạm vi

| Lượt kiểm | Kết quả thực | Giới hạn |
|---|---|---|
| Actual Auth/REST, run 4ab9129f1552 | 47 checks + 3 concurrency đạt; metadata regression 30 checks + 4 races đạt; native exit 0 | Diagnostic employee-profile/authority, không phải default full backend hoặc active UI E2E |
| Native advisors trên schema 549 | 667 findings | Chưa phân loại/xử lý toàn bộ; số findings không đồng nghĩa 667 lỗ hổng |
| Source/schema cuối diagnostic | Source/runtime/migrations giữ nguyên; source binding cuối được kiểm; schema fingerprint khớp | Source có phạm vi; không xác nhận serving DB |
| Full control DB-opt-in, run 2e4605a848b8 | 358 tests, 357 pass, 1 fail, 0 cancel/skip; native exit 1 | Lỗi dưới đây chưa có root cause; driver dừng trước TS/lint/frontend |
| Rerun riêng TypeScript | `tsc --noEmit -p tsconfig.app.json`, exit 0 | Không phải production build |
| Scoped ESLint | 12 file mới/editor/client/hooks liên quan, exit 0 | Không phải toàn repository; legacy lint debt chưa được kiểm hết |
| Client/hook/component Vitest | 41/41, 3 test files, exit 0 | Không phải browser/Android/hai tab thật |
| Cleanup kiểm độc lập | Hai run nói trên: container/volume/network theo exact ownership labels đều 0 | Chỉ xác nhận các target sở hữu của hai run, không cleanup rộng |

Rerun TS/lint/frontend được lưu riêng vì full-control driver đã dừng ở failure;
không gán chúng thành các bước tiếp theo thành công trong run thất bại. Mọi
rerun kiểm source trước/sau trùng 810. Raw logs, fixture.env và ownership bundles
giữ private; artifact public chỉ có trường đã lọc.

## 3. Failure phải xử lý trước khi freeze

Test `admission: 20 competing new registrations can reserve only the final slot; retry does not extend expiry`
thất bại ở `server/control/admin-cases.mjs:118`.
Assertion đúng một yêu cầu được chấp nhận đã qua; assertion mọi rejected reason
có code `NO_CAPACITY` thất bại. Lượt này chưa ghi danh sách rejection codes,
vì vậy chưa kết luận pool timeout, contention, lỗi SQL hay fixture timing.

Chẩn đoán tiếp trong T09, phối hợp T01/T06:

1. Thu số fulfilled/rejected và tập safe code/count; bảo vệ raw error/DSN/token.
2. Đo pool acquisition/statement/lock timing phù hợp; giữ barrier chứng minh
   request thực sự overlap. So focused và full suite bằng đúng candidate.
3. Sửa nguyên nhân được chứng minh ở product hoặc fixture; giữ 20 request, 1 suất,
   19 `NO_CAPACITY` và replay không kéo dài expiry. Không rerun bỏ qua fail hoặc
   tăng timeout không có căn cứ chỉ để đổi màu kết quả.
4. Chụp source mới khi sửa, chạy focused rồi full control; giữ failure 810 lịch sử.
   Trước gate cần default full backend và independent rebuild cùng candidate cuối.

## 4. Phần còn mở và liên kết kế hoạch

Legacy `get_user_permissions` cần self-read compatibility, foreign-read scope,
system-role/owner/alias truth table và additive semantics. DB direct writes,
current19 indirect/workflow/offboarding, 667 advisors và issuer/Linux authority
còn phải khép. Definite terminal 400 có thể để pending kéo dài; cần contract
recovery/cancellation có proof trước khi cho bỏ record, tránh xóa outcome chưa rõ.

Browser/Android, mất response trước headers thật, hai tab đồng thời thật,
default full backend/rebuild 810, Linux/TLS, email Internet, offsite restore,
A/B đồng thời, tải và pilot chưa được chứng minh bởi packet này. Component test
tạo hai pending records không thay cross-tab E2E. Lookup sau discard response
không thay fault transport thật.

Theo [phiếu toàn VPS + signup](roomqc-vps-signup-detailed-delivery-2026-10-26.md),
giữ 8 đợt/27 gói/T01–T25/70 ca. 122 release entries vẫn `unverified`, 70 worksheet rows
vẫn `not_run`, gates và signoff giữ nguyên. Báo cáo này bổ sung evidence, không ký
nghiệm thu sản phẩm hoặc mở đăng ký public.
