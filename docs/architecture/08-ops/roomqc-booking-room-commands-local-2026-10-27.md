# RoomQC — chuyển phòng và nhận/trả phòng: bản sửa có kiểm chứng local

**27/10/2026, Asia/Bangkok.** Phần backend RW3/RW4 của Q02 đã có bằng chứng
có phạm vi: **119/119 native Auth/REST, hồi quy phòng 77/77, full control
384/384 và TypeScript exit 0** trên cùng candidate. Năm control đỏ của
[source851](roomqc-room-writers-quick-check-partial-local-2026-10-27.md) đều đạt.
**Chưa khép Q02 hoặc nghiệm thu toàn bộ VPS/signup; chưa triển khai vào hệ đang phục vụ.**

[Artifact kết quả và kiểm tra bàn giao](../../../artifacts/roomqc-booking-room-commands-local-2026-10-27.json)
giữ từng control, source binding, thất bại trước sửa, cleanup và giới hạn.

## 1. Candidate và phạm vi thay đổi

- Source có phạm vi: **852 file**, SHA-256
  `82f270f9482116a2d20aea59cdc89969e20128dca2fadb52f5f8ae39f6e6d643`.
- **559 business + 12 directory migrations**; runtime binding 164 file.
- Forward migration tạo bằng native CLI:
  `supabase/migrations/20261026220605_booking_room_live_commands.sql`.
- Đồng bộ optional `p_command_id` và result lookup trong
  `src/integrations/supabase/types.ts`; mở rộng native writer/ACL harness và
  fixture độc lập. Không nâng vendor hoặc sửa migration đã triển khai.
- Source/runtime/migration và schema fingerprint trước–sau các lượt native
  cuối khớp. Full control là bộ control có DB opt-in, không phải default full
  backend hoặc independent rebuild.

## 2. Năm lỗi đã có đối chiếu trước/sau

| Control từ source851 | Trước sửa | Bản cuối |
|---|---|---|
| Quản lý hợp lệ chuyển booking đang ở | 403 `FORCE_REQUIRES_OWNER` | Chuyển được bằng transition thông thường; giữ owner-only force |
| Nhân viên chuyển booking ở hotel chưa được gán | 200 và có effects | 403, snapshot nghiệp vụ không đổi |
| Chuyển sang phòng `out_of_service` | 200 và có effects | 409, snapshot nghiệp vụ không đổi |
| Nhận phòng có canonical room source event | Booking/phòng đổi nhưng không có event | Một source event và một room state audit |
| Trả phòng có canonical room source event | Booking/phòng đổi nhưng không có event | Thêm một source event và một room state audit |

Fixture cuối dùng manager có role/level coherent và `bookings.update`; lễ tân
là staff được gán hotel và có capability này; buồng phòng được gán cùng hotel
nhưng không có capability. Không lấy nhãn manager/staff thay quyền thực tế.
Các tenant thử có bản sao gói riêng cho 200 phòng; quota trigger và policy gói
mặc định không bị nới để làm test xanh.

## 3. Hành vi backend sau sửa

`transfer_booking_room`, `perform_checkin`, `perform_checkout` và
`perform_group_checkout` kiểm Auth/profile/role/session hiện thời, capability
`bookings.update` hoặc `bookings.manage`, tenant, hotel active và assignment.
Kiểm hạn phiên theo clock sau chờ khóa và sau ghi kết quả. Khóa actor/command
trước booking; booking, room và hotel được khóa có thứ tự. Group khóa toàn bộ
booking/room trước khi thực hiện từng checkout.

Chuyển phòng đang ở dùng hai canonical room transitions với `force=false`.
Chuyển booking confirmed không làm đổi trạng thái vật lý phòng. Phòng đích
OOS/OOO bị chặn; booking đang ở cần đích sạch/đã kiểm. Kiểm overlap có cả daily
và hourly; không tự sửa trigger overlap legacy hoặc mọi writer khác.

Booking, các cột tiền do RPC tác động, room source, audit và receipt cùng giao
dịch. Lỗi audit/source/result không bị nuốt. Checkout đọc lại giá trị sau
trigger; lệnh cập nhật có cột kích hoạt pricing trigger cũ. Phụ phí check-in
thay phần phí cũ trong báo giá hiện có; retry không cộng lại phí.

Receipt riêng `private.booking_room_commands` lưu actor/key/operation/request,
scope và result. Key giống + request giống đọc lại kết quả; request/operation
khác dùng cùng key trả conflict. `get_booking_room_command_result` yêu cầu
quyền và assignment hiện thời; actor khác không đọc được receipt. Group giữ
một kết quả cha cùng các kết quả checkout con trong một giao dịch; đảo thứ tự
cùng mảng checkout không tạo lượt trả phòng mới.

Các signature cũ được chuyển vào private, revoke và thay bằng forwarding có
guard. Public API vẫn nhận tham số cũ nhờ key optional; browser callers hiện
**chưa được chuyển sang stable key/recovery**. Service key không được tự gọi
những lệnh nghiệp vụ này; consumers service/legacy và staged quote/payment
vẫn cần inventory/compatibility riêng trước khi khép graph.

## 4. Bằng chứng trên candidate cuối

| Lượt | Kết quả | Phạm vi |
|---|---|---|
| Writer fixture `a8127770c783`, backend `3029fecb9c09` | **119/119, exit 0** | Auth/REST thật; giữ 39 quick/undo controls; 6 race với lock barrier thật |
| Source regression `5b484b38b6d5`, backend `fab81bf204a6` | **77/77, exit 0** | Source/cancellation/recovery; 6 lock races; có client ứng dụng thật |
| Full control `366de75a1366` | **384/384, exit 0** | 0 fail/cancel/skip; có fixture ACL độc lập đủ 27 bảng |
| TypeScript | **exit 0** | `tsc --noEmit -p tsconfig.app.json`, hash cùng candidate cuối |

Writer kiểm 20 request cùng key cho mỗi luồng chuyển/nhận/trả phòng; không
lặp trạng thái, audit hoặc source event. Thử hai actor thật cùng chờ khóa phòng
cuối: đúng một thành công, một conflict. Có race thu hồi capability khi request
chờ profile lock và ba race phiên hết hạn khi chờ room lock; tất cả bị chặn
không effects. Đây là kiểm concurrency có phạm vi, không phải capacity test.

Fault được chèn tại booking audit, room source và receipt cho cả ba thao tác;
có witness không rollback để xác nhận đã chạm fault. Lỗi hoặc expiry sau insert
rollback toàn effects; gỡ fault rồi cùng key thực hiện được. Fault tại source
của phòng thứ hai trong group rollback cả hai booking, tiền, audit và source;
sau gỡ fault, recovery/replay không ghi thêm.

Kiểm tiền cụ thể bằng dữ liệu tổng hợp: subtotal 1.500, bồi thường 500, VAT 8%,
phí dịch vụ 5% → VAT 80, phí 50, tổng 1.630; tiền đã trả/đặt cọc giữ nguyên.
Subtotal 0 đọc lại số trigger suy ra từ giá phòng. Booking đã có giá phòng
1.000 và phí nhận sớm 100, thay phí thành 200 → subtotal 1.200, tổng 1.356;
replay không đổi số tiền hoặc snapshot.

## 5. Quyền, advisors và cleanup

Direct ACL trên **27 bảng**: **324 browser/probe denials, 96 private-service
denials, 57 positives**, 27 snapshots không đổi. Writer fixture có dữ liệu ở
7/27 bảng, source fixture 5/27; fixture ACL độc lập trong full control populate
27/27 và kiểm grant sai, column grant, service delete, target lạ rồi phục hồi.
Đây là SQL role assumption/direct grants; không thay kiểm đường gọi gián tiếp.

Native advisors CLI 2.121.0: **665 findings** — 27 INFO RLS không policy,
7 INFO FK chưa index, 496 INFO unused index, 135 WARN permissive policies.
Disposition theo từng đối tượng chưa khép; không tạo policy mở chỉ để bỏ INFO.

Tám run của đợt này đều đã terminal và cleanup. Publisher kiểm độc lập
**24 lần container/volume/network theo exact ownership label**, đều còn 0.
Không khẳng định đây là kiểm mọi tài nguyên Docker trên máy. Primary index và
hai delivery ledgers giữ nguyên; không stage/commit/reset/merge.

## 6. Lịch sử thất bại được giữ

- `eb08f1ef5e95` / `ff9f026cf9a2`: exit 1 tại fixture INSERT room HTTP 400;
  chưa thu bộ controls hoàn chỉnh. Response code/message chi tiết của INSERT
  không được lưu trong assertion cũ. Sau đó dùng gói fixture riêng 200 phòng;
  không gọi lần này là lỗi sản phẩm đã được xác nhận hoặc proof đã đạt.
- `75d7447d9d6b` / `7ce11b2f0fe7`: **109 controls, 107 đạt/2 không đạt, exit 1**;
  hai ca tiền checkout phát hiện thiếu kích hoạt pricing trigger. Năm lỗi gốc
  đã qua trong lượt này, nhưng toàn diagnostic vẫn đỏ.
- Candidate trung gian `3108d8fb…`: writer 118/118, source 77/77 và full
  control 384/384 đạt. Sau audit thêm phụ phí check-in, source đổi; kết quả
  cuối được chạy lại toàn bộ như mục 4, không kế thừa số xanh sang source mới.

## 7. Phần việc nhận tiếp

1. Nối caller quick/undo và booking/group checkout vào stable key, result lookup,
   trạng thái outcome chưa rõ và recovery; kiểm browser/Android thực.
2. Khép RW5–RW8 và inventory staged quote/payment, legacy/service/deployed
   consumers. Các writer khác chưa cùng lock order vẫn có thể race. Trigger
   overlap legacy và ngữ nghĩa ngày/giờ/timezone chưa được gọi là hoàn tất.
3. Q03 configured workflow/dispatcher, recipient/offboarding/indirect;
   receipt retention/abuse và advisor disposition; Q04 final full/rebuild.
4. Tiếp toàn bộ roadmap: alerts, admission/budget, signup/jobs, hai console,
   Linux/TLS/offsite/on-call, A/B/E2E/tải và pilot.

**70 ca vẫn `not_run`, 122 release entries `unverified`, gates và signoff giữ
nguyên.** Primary chỉ nhận tài liệu/artifact đã lọc; implementation nằm trong
integration. Không apply lên DB đang phục vụ, CRM, VPS, DNS/provider hoặc gửi
email Internet. [Plan hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md)
và [phiếu chi tiết mục 18](roomqc-vps-signup-detailed-delivery-2026-10-26.md#18-phiếu-điều-phối-chốt-27102026)
được cập nhật đúng phần còn mở; không giao làm lại backend như chưa có proof.
