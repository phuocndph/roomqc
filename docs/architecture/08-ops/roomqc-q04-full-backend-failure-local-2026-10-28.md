# RoomQC — kết quả full backend local chưa đạt

Ngày28/10/2026. Run75b23132abab đã kết thúc exit1 tại
`parent_boundary_controls`, SQLSTATE `P0001`. Đây là run default full,
không phải diagnostic; chưa được dùng làm reference independent rebuild.
[Artifact đã lọc](../../../artifacts/roomqc-q04-full-backend-failure-local-2026-10-28.json) giữ source, trạng thái
và giới hạn. Không xuất log riêng có thể chứa credential hoặc fixture.env.

Source backend198 file, SHA256
`34822182b2b5836d68ac65228a6aa62e28f2ea0e57b1022b9bb4d8e6d0236b46`; source-at-end đã xác nhận khớp.
Migration cuối577; schema manifest `d4cfbcb92c72dec33aa5d919c651bc5018cb0aa6a46c612327dba3821ddf8360`.
Ownership state báo `cleaned=true`; packet báo cáo này không chạy lại cleanup.

| Kết quả trước lỗi | Phạm vi được chứng minh | Chưa chứng minh |
|---|---|---|
| Managed-health đạt33 mốc | Năm dịch vụ thật, metrics thật, thời gian thật; fault/restart/config/credential/release, recovery10phút và stale/resume; worker shutdown0 | Offsite backup và toàn full run |
| ACL40 bảng đạt | Snapshot giữ nguyên, browser direct grant violations0 | Quyền gián tiếp và tác động FK đầy đủ |
| Parent-boundary fail | Có terminal lỗi P0001 | Chưa có tên assertion, không kết luận lỗ hổng sản phẩm hoặc phép thử đã sửa |

Review tĩnh thấy harness dừng khi `fk.arity<>1`, dùng tổng23 FK/184denial.
Catalog của chính run có29 FK, gồm2 FK ghép tới booking_room_commands; một
FK ở guest_invoices là DEFERRABLE INITIALLY DEFERRED. Đây là thiếu coverage
rõ trong harness, nhưng reason P0001 chưa đủ để khẳng định assertion nào gây
terminal. Phải tái hiện diagnostic có reason trước khi kết luận nguyên nhân.

Việc nhận ngay ở [19.40.B](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1940-điểm-nhận-và-nghiệm-thu-hiện-hành):
review toàn catalog, tuple composite/deferred, populated positive controls,
DELETE/key UPDATE của các vai trò, effect snapshot, cascade/rollback. Thêm
mode diagnostic sở hữu riêng và message allowlist; không đổi expected hoặc
bỏ constraint để xanh. Sau scoped proof mới freeze candidate cuối và chạy
default full; independent rebuild chỉ nhận reference default full hợp lệ.

Không cộng65/536 hay33mốc thành70ca release. 70ca worksheet vẫn not_run;
122release entries unverified. Không sửa DB đang phục vụ, mở signup, deploy
VPS, DNS/provider hoặc ký gate trong packet báo cáo này.
