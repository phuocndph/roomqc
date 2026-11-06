# RoomQC — native password transaction guard: diagnostic33 đạt

Ngày 22/10/2026. **Scoped local diagnostic, chưa full A/B hoặc release.**
[Artifact](../../../artifacts/roomqc-m06-password-guard-diagnostic-local-2026-10-22.json).
[ADR/custom Auth build](../adr/roomqc-native-password-transaction-boundary.md).
[Baseline và partial policy trước](roomqc-m06-password-policy-diagnostic-local-2026-10-21.md).

## Kết quả thực chạy

Run c556d9288cb0/session85793 đã terminal **exit0**, stderr0, cleaned11; exact run
label còn0 container/network/volume. Actual installed SDK2.80/Auth/REST: **33/33
đạt**, đủ cùng33 actor/label/expected; giữ18 positives và sửa đủ15 failures của
policy diagnostic. Không sửa expected hoặc historical artifacts.

Profile-flag-only PATCH bị chặn, metadata không complete. Wrong/missing current
password bị Auth từ chối/no effects. Ordinary/recovery hợp lệ đổi hash và server
flag false. Locked/inactive/session-deleted bị từ chối/no password effect.
Admin reset giữ required flag; login mới/cũ và current/other-session đối chứng đạt.

## Candidate và bản build

Source **705 files/539 migrations** đóng trước launch và sau terminal khớp:
b1503e6c669df6abb142a4fa0a906805fa95cd8453a2a69e3c8271dda12852a4.
Schema diagnostic trước/sau khớp; không so với full initialization schema cũ.

Đây là **custom RoomQC GoTrue2.197.0** từ source commit
4eee58f296d9698a1c2c0ae14d7a0b379c7622d3, không nâng vendor/SDK.
Image ID sha256:f39b2f63eda3934f8acbc9199c293eb32d4139d78749f943408c3780523553b3;
extension sourceHash00782a18fdb1ebc00f4dd062bc418c48c38ed2757de707ae18230a612cf61264.
Builder/runtime base digest và source file hashes ở artifact. Docker build đã
chạy hai targeted Go tests; không là upstream full Go test suite.
Sáu structural backend tests đạt trước launch, không thay actual Auth proof.

Native UserUpdate truyền actor/exact session từ trusted context vào private
begin helper trước lưu hash; completion/receipt sau password và Auth audit vẫn
trong cùng transaction. Current-password snapshot đã stale bị conflict.
Private helper không exposed cho browser/service_role; browser không tự đổi cờ.
Policy/audit disabled hoặc helper thiếu phải fail-closed theo implementation;
**fault proof cho các giả định này chưa chạy trong diagnostic33**.

## Nhận tiếp và giới hạn

Tiếp actual completion/audit fault, response loss/receipt privacy/reused ID,
revocation race hai thứ tự, stale-password snapshot, invitation/pre-profile và
policy-disabled/missing-function. Tiếp caller forced page/AuthContext, captured
session/identity, durable readback; rồi fresh full A/B/control/FE/advisors/final
recovery/cleanup. SQL/code structure không thay các test chưa chạy.

Invitation accept đang có lock order cần disposition concurrency; no-profile
compatibility không chứng minh toàn bộ offboarding an toàn. Chưa browser/Android/
Linux/external/provider/load/pilot hoặc reviewer. Pristine vendor Auth không có
extension này; T18 phải sử dụng reviewed custom image, không chỉ áp migration.

Không deploy serving/CRM/VPS/DNS/provider hay gửi email thật. Giữ toàn bộ plan
8 đợt/27 gói/25 bước/70 case, 122 releaseAcceptance unverified và gate không đổi.
