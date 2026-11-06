# RoomQC — advice policy live command và upgrade: biên bản local

Ngày 28/10/2026 (Asia/Bangkok). Đây là bằng chứng scoped trên Docker fixture exact-owned; không truy cập DB/CRM/VPS/DNS/email provider thật và chưa phải nghiệm thu phát hành.

## Kết quả

Hai run mới đã đạt terminal và cleanup:

- **Policy current 577:** 106/106 native checks, 8 lock/expiry barriers, no-policy/ACL 40/40 snapshots.
- **Current 577:** native 76/76, Edge 59/59, production caller 28/28, restart 8/8 + caller 2/2, interruption 13/13; process kill `SIGKILL` và timeout theo đồng hồ thật đều giữ journal/charge, không redispatch.
- **Populated upgrade 576→577:** seed 576 đạt 3/3; fault rollback và forward/post đạt 25/25. Schema fingerprint trước/sau rollback khớp; receipt completed/unknown/closed/reserved/cancelled, tenant/trial/tiền và policy journal được giữ; legacy service execute bị thu hồi sau 577.
- **No-policy/ACL:** 40 bảng được kiểm, snapshot không đổi; các đường advice trực tiếp và service/probe bị từ chối đúng boundary.
- **Advisors:** Supabase CLI pin **2.121.0**, 732 findings: 40 `rls_enabled_no_policy` (INFO), 7 `unindexed_foreign_keys` (INFO), 502 `unused_index` (INFO), 183 `multiple_permissive_policies` (WARN). Đây là backlog cần disposition theo workload, không tự coi là lỗi đã sửa.

Bằng chứng đã lọc:

- [current regression artifact](../../../artifacts/roomqc-advice-policy-live-regression-local-2026-10-28.json)
- [policy current artifact](../../../artifacts/roomqc-advice-policy-current-local-2026-10-28.json)
- [populated upgrade artifact](../../../artifacts/roomqc-advice-policy-upgrade-final-local-2026-10-28.json)

## Sửa trong lượt này

- `finish_operations_advice` giữ fence của dispatch gốc, cho phép hoàn tất sau chu kỳ disable → enable policy; không redispatch và không hoàn lại charge.
- Receipt barrier dùng advisory lock + trigger `BEFORE INSERT`, nên kiểm được waiter tại điểm ghi receipt thay vì chặn SELECT sớm.
- Fixture upgrade tạo nhân viên có `created_by` bắt buộc; failed history được giữ, sau đó rerun đạt.

## Ý nghĩa đối với plan VPS + signup

Mốc này đóng phần local backend policy/upgrade/regression của T01/T03/T04/T08/T10/T13. Nó chưa mở signup, chưa chứng minh capacity, và chưa thay đổi reviewer/signoff/gate. Các phần còn phải nghiệm thu là VPS/Linux thật, DNS/TLS, email provider, offsite backup/restore, browser/Android E2E, A/B simultaneous, load/soak, pilot tối thiểu 7 ngày và disposition advisors.

`productAccepted=false` được giữ nguyên cho đến khi các môi trường bắt buộc và người review ký nghiệm thu.
