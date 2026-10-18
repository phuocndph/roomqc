# RoomQC — nền giao dịch vòng đời gói và outbox local

Ngày: 18/10/2026. Source commit `1e5a042`, nhánh
`codex/roomqc-parallel-integration`. Tiếp theo
[bản giám sát](roomqc-job-monitor-local-release-2026-10-18.md).

## Trạng thái bàn giao

Migration `20261018010625_subscription_lifecycle_atomic_outbox.sql` đã áp
nguyên tử lên DB local và ghi đúng migration history. Hai bảng và hai hàm
vòng đời mới chỉ ở schema private, không cấp quyền gọi/đọc/ghi trực tiếp cho
anon, authenticated hoặc service_role. **Worker Edge hiện tại chưa chuyển
sang dùng chúng.** Không được hiểu đợt này là đã sửa xong race/outbox trên
đường worker đang chạy hoặc hoàn tất A1.

Thay đổi có hiệu lực ngay trên monitor hiện tại: cách đếm gói hết hạn đã
thống nhất với cột DATE và bộ lọc REST cũ. Gói kết thúc hôm nay chưa được
đếm là đã hết hạn; múi giờ caller không đổi ranh giới UTC của phép kiểm tra.
Không đổi chính sách grace, thu tiền, trạng thái thật hay ngày gói của khách.

Frontend/container vẫn là image `roomqc-local:a1-monitor-e237786`, healthy,
bind 127.0.0.1:8082. Đợt này là schema + test; không rebuild hoặc đổi worker.
Các test của đợt này không phải toàn bộ browser E2E hay provider E2E.

## Đã xây dựng và kiểm chứng

- Lệnh đổi trạng thái bắt buộc có run ID đã được nhận, request ID, **một tenant
  ID rõ ràng** và target grace/suspended hợp lệ. Null scope không bao giờ trở
  thành sweep. Giữ predicate legacy; không tự bổ sung trial/grace mới.
- Khóa theo thứ tự admission → run → tenant → command/outbox. Sau khi chờ khóa
  tenant mới đọc lại trạng thái/ngày gói và kiểm tra deadline. Gia hạn trước thì
  không bị expiry ghi đè; expiry trước thì gia hạn sau vẫn có hiệu lực.
- Đổi trạng thái, receipt/audit và outbox cùng transaction. Bất kỳ lỗi tạo
  outbox nào cũng hủy toàn bộ thay đổi. Cùng request trả receipt đã commit;
  đổi tenant/run/target trên request cũ bị từ chối. Cùng run/tenant/target với
  request khác cũng không được áp hai lần.
- Outbox chỉ phục vụ **thông báo trong ứng dụng**. Insert thông báo và xác nhận
  delivered cùng transaction/subtransaction, dùng ID xác định từ command.
  Không gửi email/Resend, push hay gọi provider bên ngoài.
- Lỗi insert hoặc lỗi xác nhận sau insert đều giữ pending; không mất thông báo.
  Thiếu, trùng hoặc khóa owner không bị chọn bừa. Retry có backoff từ 30 giây,
  tăng dần tối đa 60 phút; chỉ ghi OWNER_UNAVAILABLE/DELIVERY_FAILED, không SQLERRM.
- Trước gửi, khóa và kiểm tra lại tenant. Nếu đã gia hạn, đổi ngày, đổi trạng
  thái, xóa tenant hoặc có transition mới hơn thì đánh dấu obsolete. Audit giữ
  tham chiếu UUID sau xóa tenant; không cascade xóa lịch sử.
- Chỉ bảo đảm insert in-app một lần theo command ở phạm vi giao dịch này;
  không bảo đảm người dùng đã đọc, email/push exactly-once hoặc toàn bộ hệ thống
  cũ không tạo thông báo khác.

## Kiểm thử mới trong lượt này

| Kiểm tra | Kết quả |
|---|---|
| DB PostgreSQL độc lập | **70/70 đạt** |
| Monitor DTO/component | **25/25 đạt** |
| Node syntax + ESLint script | Đạt |
| Local DB lint public/private | Không lỗi |
| Security advisors warn/error | Không có |
| Security advisors info | 14 RLS-enabled-no-policy; hai bảng private mới cố ý không có policy/grant trực tiếp |
| Migration history | 516/516 version khớp source và DB local |

Harness `scripts/test-subscription-lifecycle-db-isolated.mjs` tạo DB UUID
trắng từ template0, chỉ sao chép schema phụ thuộc và helper đã chỉ định,
không sao chép dữ liệu, env, lịch hay trigger gửi thư. Dùng grace trigger thật
cho trường ngày gia hạn. Mọi mutation dùng ID fixture, kiểm tra allowlist;
không gọi worker/lifecycle trên DB chính. Hai bộ test monitor chạy mock RPC.

Các ca quan trọng: 20 replay command và 20 delivery đồng thời, đúng một
command/outbox/notification; gia hạn trước/expiry trước có quan sát backend
thực sự chờ row lock; delivery chờ gia hạn; deadline hết trong khi chờ khóa;
lỗi outbox/insert/ack; response sau commit; owner thiếu/trùng/khóa; ID conflict;
ngày hôm nay/null/future, grace cũ không bao phủ; busy/interrupted/terminal;
quyền hàm/bảng/sequence. Hóa đơn, payment và tenant đối chứng không đổi.

Gia hạn trong race test là UPDATE fixture cùng hàng/cột như đường gia hạn
hiện có, với trigger thật. **Chưa phải chạy settlement/admin renewal HTTP
đầy đủ hoặc giao dịch provider.** Không lấy 70 kiểm tra này để suy ra sức chứa
hoặc toàn hệ thống hoàn toàn ổn định. Full Vitest 769 đạt/16 skip là mốc trước;
lượt này chỉ chạy focused 25 kiểm tra có liên quan, không báo đã chạy lại full.

## Bảo toàn dữ liệu và kiểm tra cuối

- Backup trước DDL: `/tmp/roomqc-before-lifecycle-foundation-20261018.dump`
  trong container DB local, 4.085.343 byte, đọc được 5.268 dòng catalog.
  Đây vẫn là snapshot trong container; chưa restore độc lập hoặc đạt RPO/RTO.
- DDL + history cùng transaction REPEATABLE READ, lock timeout 5 giây,
  statement timeout 30 giây. Fingerprint đầy đủ tenant/invoice/payment trước
  và sau trong transaction bằng nhau.
- Đã dọn DB UUID phát sinh của các lượt thử, gồm một DB còn lại khi harness
  ban đầu lỗi; xác nhận đúng fixture, không có session rồi drop đúng tên.
  Dữ liệu đó chỉ là fixture dùng một lần, có thể tạo lại bằng script.
- Kiểm tra cuối: không còn DB `roomqc_lifecycle_verify_*`; 0 command/outbox/run
  thử lưu trên DB chính; 0 lịch gọi check-subscription-status hoặc
  process_expired_subscriptions. Không gọi authorized global worker POST.
- Main giữ HEAD `00eab56`, index không đổi; source mới đồng bộ qua apply_patch,
  không reset/merge/stash, không push. Không chạm CRM, email Internet, VPS/keys.

## Cần tiếp tục trước khi đổi worker hoặc bật lịch

1. Thiết kế và triển khai bộ xử lý batch có giới hạn, receipt/cursor bền vững,
   fencing run và phạm vi rõ ràng. Retry/timeout không tự mở sweep. Không lấy
   thành công một batch hoặc fixture để ghi last-success toàn cluster.
2. Nối worker vào giao dịch mới và dispatcher outbox; số liệu confirmed,
   deferred/obsolete/pending phải rõ. Thêm backlog outbox vào monitor và test
   mất phản hồi RPC sau commit bằng harness worker chỉ chạy fixture/DB riêng.
3. Kiểm kê và loại trừ entry point cũ: public.process_expired_subscriptions()
   vẫn tồn tại, service-only, dùng subscription_current_period_end/past_due và
   queue email; worker Edge hiện dùng subscription_end_date/grace_period.
   DB local không có lịch gọi hai đường này. Chưa được bật song song hoặc
   tuyên bố một nguồn vòng đời duy nhất trước khi cutover có kiểm chứng.
4. Test phối hợp với đường admin/gia hạn/settlement thực tế theo policy đã duyệt.
   Settlement mới vẫn bị chặn cho nháp và đơn legacy; không mở để thử race.
5. Quy trình phục hồi interrupted có kiểm chứng worker cũ đã dừng, reason,
   actor/request/version/audit; alert và lịch staging sau nghiệm thu. Không
   dùng UPDATE fixture trong test để giải phóng run production.
6. Tiếp tục workflow hồ sơ A2, phân trang/thống kê server A3 và E2E A4.
   VPS/DNS/Resend/provider/restore độc lập giữ trong
   [danh sách deferred](roomqc-deferred-access-and-decisions-2026-10-17.md).
