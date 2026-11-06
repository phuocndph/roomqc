# RoomQC — bằng chứng local của invitation authority và điểm dừng tích hợp

Ngày tổng hợp: 22/10/2026, Asia/Bangkok. Đây là bằng chứng có phạm vi từ công việc
triển khai trước lượt chốt **Toàn bộ VPS + signup / Plan + nghiệm thu**.
Lượt chốt plan chỉ nhận kết quả bài chạy đã có, đọc source và cập nhật tài liệu;
không bắt đầu bài kiểm thử mới, sửa product code hoặc deploy.

## 1. Kết luận

Đã có bản sửa pending invitation không được accept vào vị trí ngừng hoạt động.
Bộ kiểm tra authority đạt34/34 và6/6 race có quan sát lock. Tuy nhiên **default
full backend chưa đạt**: run b23d3bbad9c1 kết thúc exit1 ở no_policy_controls.
Không chạy B dựa trên A thất bại; chưa có full A/B hoặc chữ ký release.

[Artifact đã lọc](../../../artifacts/roomqc-m06-invitation-authority-local-2026-10-22.json)
lưu source riêng cho từng run, expected/actual, giới hạn và cleanup.

## 2. Source và bản sửa đã có

Candidate hiện hành:754 files/546 migrations, SHA256
`472b98ba8a968d8a27ddde556b937556109c8bcf2377854b6ab7b65f6e9e33ac`.
Manifest scoped không thay full release manifest.

Migration546:
`supabase/migrations/20261021225012_staff_invitation_acceptance_current_assignment.sql`.
Pending acceptance kiểm active position, approved tenant và current reports-to
account/profile/role/hotel assignment. Accepted replay không tái cấp quyền.
Chỉ inactive-position được tái hiện lỗi trên bản cũ; các guard bổ sung khác
được xác định bằng rà source rồi kiểm sau sửa, không nói tất cả đã tái hiện trước.

## 3. Các run, không trộn phạm vi

| Run | Source | Kết quả thực tế |
|---|---|---|
| bf53bb2060a0 |753/545,3946a9…| Lỗi sản phẩm: position inactive vẫn200 và tạo profile/role/membership. Exit1; giữ đối chứng |
| f91277714791 |754/546,377250…|34 checks đạt; race fixture bị ACL ở trigger test. Exit1; sửa harness sau đó, không mở production grants |
| d117dccf3ccc |754/546,c7d529…| Diagnostic exit0:15 admin +31 management +19 delivery +22 acceptance +7 caller +34 authority/6 races. Không phải full backend |
| 770afe0d587c |754/546,c7d529…| Full attempt exit1: invitation tạo2 welcome emails trước provider drill yêu cầu queue0. Đã đổi thứ tự harness; không xóa email hợp lệ hoặc hạ assertion |
| b23d3bbad9c1 |754/546,472b98…| Sau đổi thứ tự: provider44 checks/3 races và toàn invitation đạt; full run exit1 ở no_policy_controls, P0001. Không có final full recovery hoặc B |

Tất cả5 runs cleaned; kiểm độc lập exact-run label cho container/network/volume
đều0. Không dọn bằng wildcard hoặc tác động tài nguyên phục vụ.

Diagnostic d117: schema trước/sau/advisors đều
`381131c660bae26bd66e9f0f5ced5a275cb5ada56abc6a4f618aff818368e792`.
Run b23: schema invitation trước/sau cũng bằng hash trên; initializer Realtime
thêm publication có kiểm soát thành
`94118376df788dd7c69c3fd3311f1f39e14f11b15c7d7cb952121b4d89654758`.
Đây không phải tuyên bố toàn schema b23 trước/sau full suite bằng nhau.

## 4. Bằng chứng có thể giữ làm hồi quy

- Authority34 =12 create-role pairs +19 acceptance faults +3 positive accept roles.
  Fault có denial/no-effects rồi restored positive đúng1 profile/role/membership.
- 6 observed lock races: accept↔revoke, password↔revoke, accept↔password;
  kiểm status/effects/audit/receipt/readback theo thứ tự thực tế.
- 15 compiled admin,31 management,19 Auth/SMTP,22 acceptance,7 compiled caller;
 125 visible IDs/3 pages và successful compiled sends được giữ.2 send observations
  là subset19; SMTP6 captures/1 refusal nội bộ, không email Internet.
- Full control DB-opt-in231/231,0 fail/skip/cancel, exit0 trên freeze hiện hành.
  Monitoring của suite này chỉ Docker Desktop VM, không chứng minh VPS.
- Frontend388/388 trên source trước thay đổi ordering; không rerun current freeze
  trong lượt plan, không đổi nhãn thành browser/Android E2E.
- Riêng b23 đã chứng minh5 service probes, fault từng service và recovery local.
  Không đồng nghĩa timed health pipeline/admission production đã nghiệm thu.

## 5. Điểm cần xử lý trước fresh full A/B

Bài full dừng ở no_policy_controls với P0001; chưa xác định đủ thông báo nguyên
nhân, không tự kết luận chỉ lỗi harness. Rà tĩnh thấy expected inventory trong
harness là18, catalog thực là19. Cần đối chiếu từng table/grant/role/allowed
effect, fixture populated và private failure diagnostic trước sửa; không chỉ
đổi con số18→19 hoặc thêm policy để xóa cảnh báo.

Advisors b23:603 =19 no-policy INFO +7 FK INFO +442 unused-index INFO +
135 permissive WARN,0 ERROR. Diagnostic d117:652, khác49 unused-index findings
theo workload/stats; không chứng minh đã xóa49 index hoặc sửa49 lỗi.
Full current19-target indirect disposition và policy/FK review vẫn mở.

Sau sửa có đối chứng: freeze source mới → full A terminal thành công → B độc lập
cùng source có build/schema/recovery/cleanup đối chiếu. Hai lần tuần tự không
thay A/B độc lập đồng thời T21. Tiếp phần workflow/quyền còn lại và health;
không giao lại34/6 đã đạt như chưa làm hoặc dừng toàn roadmap ở invitation.

## 6. Không được suy rộng

Chưa full authority/recipient/offboarding inventory, browser/hai tab/Android,
mất mạng trước headers/ngoài adapter, email Internet, Linux VPS/TLS, offsite DR,
load/capacity/soak hoặc pilot. Chưa có reviewer/signoff.
8 đợt/27 gói/25 việc/70 cases và122 releaseAcceptance unverified giữ nguyên;
gate L/S/P/U/B không đổi. Không mirror implementation sang primary hoặc
thay serving DB/CRM/VPS/DNS/provider/email thật.

Bước giao việc theo [plan](roomqc-vps-signup-preparation-plan-2026-10-21.md),
[phiếu T01–T25](roomqc-vps-signup-launch-checklist-2026-10-21.md) và
[nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).

