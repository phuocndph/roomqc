# RoomQC — thu quyền ghi trực tiếp vào cấu hình nhân viên

Ngày cập nhật:27/10/2026,Asia/Bangkok. Đây là proof local có phạm vi, chưa là nghiệm thuVPS/signup.

## Kết quả và thay đổi

Candidate812, source `3f6f0ea71b1248e5e0e6e7862cf7146b0544d66e3d9749502e4577bd06bb13db`,551business+12directory migrations. Migration mới chỉ thu quyền ghi trực tiếp củaPUBLIC/anon/authenticated trên user_permissions và user_hotels, gồm cả quyền từng cột; giữ SELECT/RLS và quyền của các hàm tin cậy/service_role. Không viết lại dữ liệu lịch sử. Active editor tiếp tục dùng aggregate command với version, audit và receipt atomic.

Actual Auth/REST đạt **99checks+4races**, metadata regression **30checks+4races**, native exit0, source/runtime và final schema khớp. Matrix có POST/PATCH/DELETE choowner/manager/staff/anon ở cả hai bảng; denial không đổi profile/roles/grants/memberships/version/audit/receipt. Browser bị chặn trước revision lock; trusted service writer vẫn nhận409NOWAIT, không deadlock và không effects.

Verified-owner complete_registration vẫn tạo đúng owner+membership+hotel, replay giữ nguyên trial và dữ liệu; aggregate save còn chạy sau các denial. Native staff invitation diagnostic riêng cùng source exit0: checks=22, callerChecks=7, managementChecks=31, adminChecks=15; delivery và authority checks đạt. Native Auth/password setup, mời/nhận lời, replay không cấp lại quyền và compiled client/internal SMTP được kiểm theo coverage trongartifact. Không gửi emailInternet; chưa browser/Android hoặc network-lossE2E.

## Caller đã đối chiếu và giới hạn

| Đường dùng quan sát | Disposition |
|---|---|
| Active web/mobile authority editor | Đã dùng aggregate commands từ810; giữ hồi quyAPI |
| useUserPermissions/useUserHotels/HotelContext và các staff/chat/recipient queries | Các caller quan sát đọc bảng; SELECT/RLS giữ nguyên |
| First-owner registration | Trusted function; actual verified-owner signup/replay đạt sau revoke |
| edit_employee_profile | Trusted atomic function;30checks+4races đạt |
| Staff invitation management/acceptance | Trusted RPC/Edge; diagnostic riêng cùng candidate đạt |
| Legacy Edge update-user | Còn source service-role/multi-request; không thấy active src caller hoặc harness/deploy entry tương ứng. Chưa chứng minh deployed/reachable hoặc không có external consumer; chưa retirement/replacement |
| Workflow/notify-chargeable/dynamic caller và privileged helpers khác | Thuộc indirect inventoryT08, chưa khép từ bài kiểm direct ACL |

Chưa thu quyền service_role hay ký toàn bộ privileged-writer closure. Legacy Edge vẫn là việc nhận tiếp; browser DML revoke không chặn service-role endpoint nếu một deployment khác còn phục vụ nó.

## Bằng chứng, failed history và việc tiếp theo

API fixture04deb8689080/runf59e03ca3931; invitation fixture051eab2cf351/run7327513c59e5. Hai lượt trước giữ nguyên:21817e133d50exit1 do duplicate binding trong fixture mới;5922077c9f82exit1 vì test browser cũ mong409nay đúng403. Đã sửa test để tách browser denial và trusted-writer NOWAIT, không nới quyền hoặc timeout.

Native advisors:667findings, chưa disposition. Cleanup độc lập12checks cho4runs, container/volume/network đều còn0. Raw logs và ownership bundle ởprivate fixture, không sao sangprimary.

Full control358/358 thuộc811, chưa rerun trên812; chưa default full backend/rebuild812. Nhận tiếp privileged Edge disposition, terminal pending recovery, indirect/advisors; freeze candidate cuối rồi full pipeline. Giữ toàn bộ8đợt/27gói/25task/70ca của[kế hoạch](roomqc-vps-signup-plan-current-2026-10-26.md).

[Artifact đã lọc](../../../artifacts/roomqc-authority-command-only-local-2026-10-27.json) có source/run/counts/coverage/cleanup/giới hạn.70worksheet vẫnnot_run,122release entries unverified, gate/signoff không đổi. Implementation chỉ ởintegration; chưa deploy vàoDB đang phục vụ,VPS,DNS/provider hoặc gửi Internetemail.
