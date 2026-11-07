# RoomQC — full backend candidate 818 đã kết thúc

Ngày 27/10/2026, Asia/Bangkok. T01/T03/T06/T08. Đây là bằng chứng local có phạm vi,
không phải nghiệm thu toàn bộ VPS và đăng ký mới.

## Kết quả

Lượt default full backend `4d4c094b4076` kết thúc với **native exit 0**, phase
`permission_controls_verified`. Chạy đủ **554 migration nghiệp vụ**, dùng runtime
161 file và source có phạm vi 818 file, hash
`ea788e013096d699c6b7b0c30ee0bb23a6aea0dd9663d272bc1a91202dc87196`.
Driver xác nhận source, runtime và tập migration trước–sau không đổi.

Đủ **16 suite bắt buộc** có `verified=true`. Hotel-delete đạt 25 kiểm tra và
2 lock races; giữ bản sửa cascade do full817 phát hiện. Metadata nhân viên
30 kiểm tra và 4 race, Edge thực 37 kiểm tra và 5 expiry race nằm trong lượt này.
Full control 384/384 là lượt riêng trên cùng source, không chạy lại khi xuất báo cáo.

Managed health hoàn tất **33 mốc** trên năm dịch vụ thật, số đo thật và thời gian
thật: thay credential/policy/target/release khi phép đo đang chạy, deployment
Functions, restart, dừng và khôi phục từng dịch vụ, phục hồi liên tục ít nhất
10 phút, metrics stale/resume và làm ấm cuối ít nhất 5 phút. Worker shutdown
exit 0; cấu hình render được kiểm. Admission giữ đóng; chưa mở cho khách mới.

Schema initialization có hai round trip; fingerprint sau khởi tạo và runtime
binding được kiểm bởi harness và kiểm tra build-reference chuẩn. Raw ownership
bundle, token, DSN, dữ liệu fixture và logs không xuất vào báo cáo.

## Quyền và catalog

Current22 direct ACL đạt 264 browser/probe denials, 76 private service denials,
47 positive controls, 3 dynamic invoker denials và 22 snapshot không đổi. Trong
lượt full này **19/22 bảng có dữ liệu**; fixture full-control riêng đã populate
22/22. Không gán độ phủ dữ liệu của fixture riêng cho lượt full backend.

Catalog có 515 functions, 11 views, 375 policies, 166 triggers, 45 candidate
entry paths và 25 dependency chưa resolve. Graph là công cụ tìm đường gọi;
không chứng minh đã kiểm hết các đường quyền gián tiếp.

Native advisors CLI 2.121.0 ghi **620 findings**: 22 no-policy, 7 FK thiếu index,
440 unused-index và 151 multiple-permissive-policy. Số 646/668 ở các lượt scoped
khác vẫn giữ lịch sử; khác workload/role không được gọi là đã sửa tương ứng
26/48 vấn đề. Cần disposition theo object, quyền hiệu lực và workload.

Cleanup thuộc lượt này đã hoàn tất. Kiểm độc lập theo đúng ownership label
xác nhận container, volume và network còn **0**; không dọn Docker của dự án khác.

## Giới hạn và việc nhận tiếp

[Baseline workflow thực](roomqc-workflow-runtime-red-local-2026-10-27.md) vẫn có
4 lỗi mở; [contract inventory](roomqc-workflow-contract-inventory-local-2026-10-27.md)
vẫn có chênh lệch UI/schema/handler. Harness full818 không chứa các kiểm tra đó.
Kiểm chứng kernel giao hàng riêng còn phát hiện lệnh nguồn `deliver_stop` có thể
bị gọi từ token tenant khác với ID người giao được truyền vào; bản sửa nguồn và
event witness đang được kiểm riêng, chưa thuộc source818 này.

Không chạy independent rebuild818 như bản phát hành cuối trong khi các lỗi
workflow/source còn mở. Sửa đúng contract, live authority, canonical event,
atomicity và replay; sau đó freeze và chạy pipeline/rebuild trên candidate đã sửa.
Rebuild độc lập khác với T21 hai backend chạy đồng thời.

**70 ca nghiệm thu vẫn `not_run`, 122 mục release vẫn `unverified`; gate, reviewer
và signoff giữ nguyên.** Linux/TLS, provider thật, offsite restore, on-call,
browser/Android, A/B, tải và pilot vẫn cần bằng chứng đúng môi trường theo
[kế hoạch hiện hành](roomqc-vps-signup-plan-current-2026-10-26.md).
