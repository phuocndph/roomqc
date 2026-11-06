# RoomQC — baseline xóa khách sạn: lỗi local đã tái hiện, chưa sửa

Ngày đối chiếu: 21/10/2026, Asia/Bangkok. Đây là evidence đầu vào cho kế hoạch
VPS + signup, **không phải báo cáo test đạt hoặc phê duyệt triển khai**.

## 1. Nguồn và giới hạn bằng chứng

Run `d178a0bedd10`, project `roomqc-probe-d178a0bedd10`, sandbox disposable,
Docker network internal, không public port/provider. Đã áp 532 migrations.
Terminal session 80485 kết thúc exit 1 tại `hotel_delete_checks`; ownership ghi
`cleaned=true`, terminal ghi đã dọn 13 owned objects. Đối chiếu Docker read-only
sau run: không còn container/network/volume theo đúng compose project này.

Runner dùng actual GoTrue/Auth và REST; installer SQL chỉ tạo fixture, mô phỏng
trạng thái và quan sát. Không chạy vào dữ liệu khách đang phục vụ/CRM, không
deploy migration, không bật signup/email/billing thật.

Findings được lấy từ event `hotel_delete_check_failed` trong private failure log,
không phải `state.hotelDeleteControls`: run throw trước khi trả JSON cuối nên
field này chưa được ghi. Log/env/catalog đầy đủ giữ private, không mirror.
[Artifact đã lọc](../../../artifacts/roomqc-m06-hotel-delete-baseline-local-2026-10-21.json)
ghi hash để truy vết; không chứa credential, ID/email của fixture hoặc response đầy đủ.

## 2. Hai nhóm lỗi High còn mở

| Mã finding, không phải case release mới | Quan sát sandbox | Ảnh hưởng | Việc cần sửa/kiểm |
|---|---|---|---|
| R4-a-FK-parent-delete | Owner xóa hotel đã gắn workspace receipt: HTTP 200; receipt và room draft mất; replay provisioning trả success=false | Mất chứng từ idempotency/recovery; directory có nguy cơ không đối soát được dữ liệu đã tạo | Bảo vệ receipt tại database; giữ xóa hotel trống không gắn receipt khi hợp lệ; kiểm FK thực sự gây từ chối |
| R4-a-hotel-delete-live-authority | JWT cũ vẫn xóa được hotel không gắn receipt sau locked/inactive/Auth soft-delete/ban/unconfirmed/expired-session và actual GoTrue global logout: mỗi nhánh HTTP 200, deletedRows=1 | Thu hồi/khóa tài khoản chưa ngăn được mutation nhạy cảm qua đường DELETE này | Live authority/session fencing tại server/DB; kiểm cả revoke-before và delete-before bằng lock evidence |

Fixture receipt và room draft đã có dữ liệu; owner đã chuyển profile sang một
hotel khác trong cùng tenant. Vì vậy không được coi client precheck assigned
users hoặc FK profile là cơ chế bảo vệ receipt.

Source liên quan: `private.workspace_provisioning.hotel_id` trong migration
20261015022602 dùng ON DELETE CASCADE; `private.hotel_room_setup.hotel_id` trong
20261015133049 cũng CASCADE. Hook `src/hooks/useHotels.ts` precheck phía client rồi
direct DELETE. Đây là các điểm rà soát, **chưa có forward migration sửa lỗi**.
Không tự đổi toàn bộ CASCADE hoặc quy trình tenant offboarding theo finding này.

## 3. Phần đã chạy và phần chưa được chứng minh

Năm nhãn hoàn thành trước lỗi fixture cuối:

- receipt/room-draft không rỗng, owner chuyển hotel hợp lệ trong cùng tenant;
- staff, cross-tenant và anon bị từ chối xóa hotel bảo vệ, không có effect theo snapshot;
- owner đã bị gỡ role owner bị từ chối xóa hotel không gắn receipt.

Event ghi **8 finding observations**, gom thành hai defect groups ở trên. Không
coi 8 observations là 8 case release hoặc cộng vào 70 case A–G.

Sau các nhánh stale authority, bước tạo hotel cho positive control trả HTTP 400 /
P0001 thay vì 201. Chưa xác định nguyên nhân fixture này; không gán nó thành lỗi
product hoặc khẳng định do quota. Những phần sau **chưa đạt/chưa chạy đủ**:

- positive control owner đang hợp lệ xóa hotel trống sau relogin;
- mười concurrent DELETE hotel gắn receipt đều bị chặn và receipt/replay ổn định;
- hai thứ tự race mutation/revoke có lock wait thực;
- toàn bộ stages phía sau hotel-delete của candidate này;
- fresh A/B đạt trên source sửa lỗi, advisors và integrated release proof.

Hash source quan sát sau run gồm 657 files/532 migrations:
`f34d1a5702a719fb6be39d939485bcb97b6bc11b315692a020e3931beb5398a9`.
Đây **không phải immutable source manifest được capture tại đầu run** và không
thừa kế full control 162/162 của snapshot 655-file trước đó. Chưa chạy lại full
suite mới; không báo 164/164 đạt từ hai structural tests đã có.

Lượt lập plan chạy lại `node --test server/control/backend-hotel-delete.test.mjs`:
2/2, exit 0. Đây là source-structure checks, không gọi backend hoặc chứng minh
hai defect đã sửa; không cộng thành số case nghiệm thu.

## 4. Phiếu triển khai kế tiếp, sau khi nhận việc sửa

1. T01/T04: đóng source/dirty manifest và xác nhận exact-owned target; giữ nguyên
   findings baseline, sửa fixture positive và cách lưu partial failure evidence.
2. T03/T08: forward migration bảo vệ receipt trước hotel deletion; xác minh đúng
   receipt constraint, không để FK khác che lỗi. Không sửa migration đã áp.
3. T03/T08: live Auth/profile/role/session guard cho sensitive hotel deletion,
   least privilege; thiết kế cùng lock order với đường revoke, recheck sau wait.
4. Kiểm bound/unbound, owner/staff/khác tenant/anon/revoked, positive/replay,
   29-table side effects, hai race và các entry point liên quan. Không chạy
   destructive mutation vào runtime đang phục vụ.
5. Focused + full control + relevant frontend tests, fresh A rồi B trên cùng
   frozen source, advisors, cleanup, report trước/sau. Sau đó mới nối lại
   17-target disposition/policy/FK → issuer/trust/atomic health/pipeline.

Xem [plan chi tiết](roomqc-vps-signup-preparation-plan-2026-10-21.md) và
[quy trình nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).
Giữ 27 gói/25 bước/70 case; chưa nâng gate L/S/P/U/B hoặc releaseAcceptance.
