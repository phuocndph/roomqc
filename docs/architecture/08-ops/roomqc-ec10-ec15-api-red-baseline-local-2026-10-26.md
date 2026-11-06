# RoomQC — baseline API quyền nhân viên: lỗi đã tái hiện trước sửa

Ngày 26/10/2026, Asia/Bangkok. Việc con của **T03/T04/T08**, theo
[plan toàn bộ VPS + signup](roomqc-vps-signup-plan-current-2026-10-26.md) và
[phiếu sửa EC10–EC15](roomqc-ec10-ec15-execution-and-acceptance-2026-10-26.md).
Kết quả: **baseline hoàn tất nhưng không đạt contract quyền**; native exit **1**.
[Artifact đã lọc](../../../artifacts/roomqc-ec10-ec15-api-red-baseline-local-2026-10-26.json)
giữ 26 kiểm tra, trong đó **17 đạt / 9 không đạt**, cùng 4 tình huống đọc lại và
1 tình huống hiển thị không khớp quyền hiệu lực. Không cộng các số này thành ca
release hoặc điểm ổn định; mức độ lỗi dưới đây là đề xuất để review.

## 1. Phạm vi và nguồn bằng chứng

- Source sản phẩm giữ nguyên `d4cea563…`, 790 file / 546 business + 12 directory
  migrations; runtime binding 159 file `09f74fb6…`. Chạy full 546 business migrations.
- Fixture `c01b52c7c397`, backend `527a92ead3d6`; actual Auth login/token và REST.
  Chỉ tài khoản tổng hợp, network Docker riêng không xuất cổng, không gửi email
  Internet và không ghi database đang phục vụ người dùng.
- Derived diagnostic đổi đường import và client kiểm tra trong `.local`, ép chế
  độ employee-profile; source sản phẩm và runner gốc không thay đổi. Đây không
  phải browser E2E hoặc full integrated backend run.
- Vòng runner dừng ở assertion contract nên chưa tới bước source verification
  cuối của chính runner. Outer driver xác minh source không đổi; publisher kiểm
  lại binding với checkpoint. Hai lớp này được ghi riêng trong artifact.

## 2. Lỗi đã tái hiện và tác động

| Ưu tiên / số control không đạt | Actual HTTP và effects | Tác động / hướng sửa |
|---|---|---|
| 1 — Critical đề xuất / 2 | Owner A INSERT quyền cho user thuộc B nhưng khai `tenant_id=A`: HTTP201, quyền thực của user B false→true; xóa grant fixture trả lại false. Owner A INSERT user B vào hotel A: HTTP201, có row mới | Ranh giới đơn vị có thể bị vượt qua các authority tables; kiểm target thật và hotel cùng tenant, kể cả đường REST trực tiếp |
| 2 — High đề xuất / 6 | Với actor lần lượt locked, inactive và đã xóa Auth session: INSERT custom grant vẫn201, PATCH cờ hotel vẫn200; cả sáu có effects | JWT còn hạn vẫn ghi được sau thu hồi quyền hiện thời; kiểm live actor/session và khóa theo thứ tự trong transaction, bao phủ mọi write path |
| 3 — High đề xuất / 1 | Custom grant đã lưu có1row; DELETE thật200; ngắt giữa hai request, INSERT không gửi; còn0row | Lưu dở làm mất cấu hình cũ; thay bằng một command atomic, version/key/receipt/audit và recovery khi mất response |
| 4 — Medium đề xuất / readback1 | Role grant + custom false: helper=true, summary=true nhưng detail=false; bốn HTTP requests đều200, không write effects | Người quản lý có thể hiểu nhầm đã thu hồi quyền kế thừa; đồng bộ effective/provenance/detail và active UI, giữ additive semantics |

Mỗi state locked/inactive/deleted-session đều có positive trước và sau recovery.
Foreign owner dùng đúng scope của target và staff tự cấp quyền bị từ chối trong
negative controls; giữ các kiểm tra này khi sửa. Snapshot đo bảy bảng:
users, user_roles, user_permissions, user_hotels, roles, role_permissions,
activity_logs. Không kết luận mọi bảng hoặc mọi endpoint đã được kiểm.

Thử ngắt replacement là ngắt giữa hai HTTP requests theo chuỗi lưu hiện có;
không phải một transaction API bị rollback lỗi và chưa phải thao tác browser
thực. Các cờ membership đã kiểm một PATCH; chưa chứng minh mọi field/combinations.

## 3. Đọc lại quyền và lịch sử thử không đạt

| Actual readback hiện hành | Helper / summary / detail | Custom bật |
|---|---|---|
| Chỉ tenant role grant | true / true / true | false |
| Role grant + custom false | true / true / false | false |
| Role grant + custom true | true / true / true | true |
| Xóa custom, còn role grant | true / true / true | false |

Đây là actual HTTP của bốn tổ hợp trên, không phải proof cho system-role/owner
readback. Summary tháng5 đã cộng quyền vai trò và alias; custom false không
phủ định role grant trong enforcement hiện tại. Không đổi sang deny-override
chỉ để làm giao diện khớp.

Giữ ba attempts: backend `0c61a86590ab` dừng trong readback fixture; `e39354687c3b`
dừng vì expected summary lấy theo definition tháng4 đã lỗi thời; cả hai chưa
chạy đầy đủ ma trận, không tính thành lỗi sản phẩm. Lượt `527a92ead3d6` dùng
expected hiện hành, giữ nguyên expected authorization-deny và hoàn tất với9lỗi.
Không gọi9lỗi này là5mismatch của SQL fixture tháng4.

## 4. Dọn fixture, nghiệm thu và bàn giao sửa

Ba attempts đều ghi cleaned=true. Publisher thực hiện **9 lệnh kiểm tra độc
lập** theo exact ownership label (container/network/volume cho từng run):
exit0, còn **0/0/0** đối tượng mỗi run. Không có cleanup diện rộng. Kiểm bảo vệ
index cây chính và hai delivery ledgers giữ nguyên; chỉ báo cáo/artifact đã lọc
được chuyển sang cây chính.

Thứ tự sửa: target scope và live authority → command lưu atomic → readback/UI
và cache → actual API negative/no-effects/positive/recovery/races → freeze
source mới, full control/full backend/independent rebuild phù hợp. Phiếu
EC10–EC15 ghi file, contract và tiêu chí từng bước. Source đổi thì proof790
trở thành lịch sử, không được gán cho candidate mới.

Baseline này bổ sung bằng chứng T03/T04/T08; không đủ ký A08–A11 hay E08 và
không thay scenario/environment của chúng. **122 release entries vẫn unverified,
70 worksheet rows vẫn not_run; reviewer/signoff và mọi gate giữ nguyên.** Các
lỗi trên cần khép trước đề nghị mở đăng ký public; chưa sửa trong packet này.
