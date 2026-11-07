# RoomQC — baseline actual self-profile, chưa sửa

Ngày 21/10/2026. Phạm vi 15.2.4 / T03 T04 T08; backend disposable exact-owned,
fixed origin nội bộ, Auth thật và REST thật; không chạm runtime phục vụ.

Run `51089654c247`, session 98706, exit 1; diagnosticOnly=true,
fullIntegratedRun=false, cleaned=true (11 objects). Source khóa trước launch:
683 files / 537 migrations, SHA256 `1c0a823cdf3fa4ef8f43fa657897500c1edebdb57283d6b07c658fea67e134f9`;
recompute sau terminal khớp. Schema trước/sau khớp; không phải passing A reference.

58 observations: 40 đạt, 18 sai expected. Ba actor owner/manager/staff đều có
positive lưu tên/điện thoại/avatar URL và xóa optional fields; no-row control và
recovery positives đạt. Mỗi actor có sáu negative fail HTTP 200 và profileChanged:
locked, inactive, deleted-session; self account_locked, status, hotel_id.
Không tính hai role-change refusals hoặc no-op owner role thành full role matrix.

Contract đang kiểm: self-profile UI chỉ được lưu full_name/phone/avatar_url;
khóa/ngưng hoạt động/thu hồi phiên đã commit phải chặn mutation. Role, cấp bậc,
khóa tài khoản và phân công khách sạn không thuộc thao tác tự sửa hồ sơ.
Receipt/audit/role administration/managed edit là contract riêng, không nới quyền.

Artifact [đã lọc](../../../artifacts/roomqc-m06-self-profile-baseline-local-2026-10-21.json)
chứa observation expected/actual/effect flags, ownership hash, source/schema scope.
Không có token, password, email fixture hoặc DSN. Baseline này giữ bất biến.

Chưa kiểm: Storage upload thật, concurrent revocation/self-edit, mọi actor state,
browser/Android, full caller/capability/offboarding matrix, VPS và release.
Reviewer pending; không đổi 122 releaseAcceptance hoặc gate L/S/P/U/B.

Tiếp theo: rà legitimate users-table callers/registration trước fix; forward
migration hẹp nếu đủ contract; FE phải xác nhận một saved row và không báo avatar
thành công khi profile save bị từ chối. Hồi quy employee edit/registration và
fresh candidate proof, không thừa kế A/B source 682 sau khi harness/source đổi.
