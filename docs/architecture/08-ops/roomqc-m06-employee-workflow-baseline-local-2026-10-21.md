# RoomQC — baseline luồng sửa hồ sơ nhân viên, local

Ngày ghi nhận: 21/10/2026. Mapping T03/T04/T08 trong roadmap VPS + signup;
không thêm task hoặc case release. Đây là **baseline fail**, chưa phải bản sửa,
nghiệm thu quyền đầy đủ hoặc bằng chứng phát hành.

## Kết quả thực quan sát

Run `682ee517c6c9`, session 56689 đã kết thúc **exit 1**. Lượt lập plan này
chỉ thu nhận terminal của tiến trình có sẵn, không khởi chạy product test mới.

| Bước bình thường của manager với staff do mình tạo | Expected | Actual |
|---|---|---|
| Sửa tên hồ sơ, giữ nguyên role/level/hotel | Lưu thành công, không đổi quyền | PATCH users trả 200; tên đã đổi |
| Upsert lại role staff hiện có theo hook hiện tại | Không làm thao tác metadata bị lỗi hoặc đổi quyền | POST user_roles trả 403 / SQLSTATE 42501 |
| Toàn bộ thao tác | Thành công trọn vẹn hoặc không có effect khi thất bại | Partial commit: profileSaved=true; authorityUnchanged=true |

Runner xác minh manager quản lý được staff tổng hợp trước ca thử; dùng actual
Auth/REST và snapshot dữ liệu, rồi restore fixture trong finally. Đây là lỗi
chức năng/nhất quán của luồng hợp lệ, **không phải bằng chứng nâng quyền**.

Caller được truy từ `src/components/users/UserFormDialog.tsx` tới
`src/hooks/useUsers.ts` / `useUpdateUser`: profile và role được ghi riêng,
client audit thực hiện phía sau. Edge `update-user` là đường gọi khác; các
nghi vấn source/schema của endpoint đó chưa được runtime-confirm trong run này.

## Phạm vi bằng chứng và giới hạn

- Trước điểm dừng: 280/280 hotel-scope, 1.764/1.764 account/session và 20/20
  scoped races vẫn verified trong ownership. Không gọi toàn run là pass.
- Runner dừng tại assertion employee; final permission recovery **chưa chạy**.
  Không dùng run fail này làm A/B reference thành công.
- Scoped source: 670 files / 535 migrations, SHA256
  `5dc0668f05e1d93b94e06ad749145601f43b52a01505e34ca4e8604ab0e1b7c6`.
  Capture sau launch, trước employee case; recompute sau terminal không đổi.
  **Không phải source freeze trước launch hoặc full release manifest.**
- Harness hai file có SHA256
  `45815c9eface6127d09e377da854e3344579d01800a85d82ced743066901ac36`,
  cũng chỉ capture sau launch.
- Ownership hash:
  `ea974454bfd2c1175bb97ec620d128965cdebd91a620355d57d9db0179370cc6`.
- Cleanup runner xác minh đúng ownership và zero owned Docker objects rồi ghi
  cleaned=true. Private evidence directory giữ lại; số objects removed không
  thu nhận riêng nên để null. Không xóa dữ liệu khách hoặc runtime đang phục vụ.
- Không có browser/Android E2E, full employee authority matrix, môi trường VPS,
  provider/DNS/email thật, fresh passing A/B hoặc reviewer signoff trong record này.

## Phiếu sửa và nghiệm thu

Dùng [plan mục 15.2.5](roomqc-vps-signup-preparation-plan-2026-10-21.md#1525-phiếu-ưu-tiên--sửa-hồ-sơ-nhân-viên-không-lưu-dở-dang)
và [protocol mục 16](roomqc-vps-signup-acceptance-protocol-2026-10-21.md#16-nghiệm-thu-luồng-sửa-hồ-sơ-nhân-viên).
Bản sửa phải bảo toàn quyền hiện có, có server authorization và atomic effects
đúng contract; không mở rộng GRANT hoặc dùng service-role từ browser để làm test xanh.

[Artifact đã lọc](../../../artifacts/roomqc-m06-employee-workflow-baseline-local-2026-10-21.json).
Giữ 27/25/70, 122 releaseAcceptance và gate L/S/P/U/B không đổi. Prior scoped actor
A/B vẫn là hồi quy lịch sử đúng source cũ, không bao phủ thay đổi caller mới.
