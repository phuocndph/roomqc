# RoomQC — EC05: current-password policy và SDK, còn lỗi server completion

Ngày 21/10/2026. **Partial local, chưa hoàn tất EC05 hoặc nghiệm thu release.**
[Artifact đã lọc](../../../artifacts/roomqc-m06-password-policy-diagnostic-local-2026-10-21.json).
[Baseline bất biến](roomqc-m06-password-baseline-local-2026-10-21.md).
[Contract](roomqc-password-change-contract-2026-10-21.md).

## Kết quả thực chạy

Run 9fff40934250 / session 34020 đã tới terminal **exit 1**, stderr 0, cleaned 11
objects. Exact project label không còn container/network/volume. Complete=true,
setupError=null; **33 observations, 18 đạt / 15 fail**. Giữ đủ 33 actor/label/expected,
12 positives baseline và sửa được sáu tình huống sai/thiếu current password.
Đây là diagnostic riêng, không là passing full A/B reference.

| Nhóm (owner/manager/staff) | Đạt / tổng | Actual |
|---|---|---|
| Profile flag-only | 0/3 | PATCH bỏ cờ được dù Auth hash không đổi |
| User metadata không là authority | 3/3 | Không tự hoàn tất cờ |
| Sai current password | 3/3 | HTTP 400/current_password_invalid, không đổi hash/cờ |
| Thiếu current password | 3/3 | HTTP 400/current_password_required, không đổi hash/cờ |
| Current password hợp lệ + completion | 0/3 | Auth đổi hash thật, cờ server vẫn true |
| Login và phiên sau đổi | 3/3 | Mật khẩu mới dùng được/cũ bị từ chối; giữ phiên hiện tại, thu hồi phiên khác trong đối chứng |
| Admin reset | 3/3 | Không tự hoàn tất forced-change |
| Session đã xóa | 3/3 | Auth từ chối, hash/cờ không đổi |
| Profile locked | 0/3 | Auth vẫn đổi hash |
| Profile inactive | 0/3 | Auth vẫn đổi hash |
| Recovery thật + completion | 0/3 | Auth đổi hash, cờ server vẫn true |

## Policy, source và client

Actual SDK **2.80.0** gửi được current_password tới GoTrue **v2.197.0** khi candidate
disposable bật yêu cầu current password. Không nâng SDK/vendor. Server audit Postgres
được bật trong diagnostic; không coi audit action tự nó đủ làm completion authority.
Serving Auth/config không đổi.

Source đóng trước launch và sau terminal: **700 files / 538 migrations**,
SHA256 77cf613a9d9b8f08dd9caf2899d51a199c4fdd96d45db2115a0e2ecccb02a06a.
Manifest chỉ scoped candidate; không phải whole-release fingerprint. Schema hash
before/after khớp; không suy bằng schema của full self-profile run khác.

Client đã truyền current password, await kết quả, giữ input khi pending/error,
reset sau success và không sign-in thay global session chỉ để kiểm mật khẩu cũ.
Suppression của kết quả identity cũ chỉ là bảo vệ UI, chưa chứng minh Auth atomic
identity/session authority. Forced-change page/AuthContext và server acknowledgement
vẫn phải xử lý theo phiếu kế tiếp.

Full control DB session 79863 đã tới terminal **203/203, 0 fail/skip, exit 0**.
Frontend đã ghi nhận trước lượt cập nhật plan: **90/90 trong 10 files**, TypeScript
và touched ESLint exit 0; không chạy lại trong lượt cập nhật tài liệu này.
Các số này không phủ server completion, browser/Android hay capacity VPS.

## Phiếu cần hoàn tất tiếp theo

1. Server-owned completion không dựa browser PATCH/user_metadata, phân biệt user
   password change với admin reset; kiểm audit/config/ACL/failure assumptions.
2. Chốt boundary cho locked/inactive/revoked session ở actual endpoint. Không đổi
   expected để nhận GoTrue 5xx là permission denial, không âm thầm biến profile lock
   thành Auth ban hoặc nới recovery policy để làm test xanh.
3. Forced-change caller chỉ báo hoàn tất khi Auth và server state được xác nhận.
   Mất response có đường đọc/reconcile; không đổi mật khẩu lại một cách mù.
4. Thêm real concurrent revocation/captured-identity, fault/response-loss/refresh/
   hai-tab/invitation/recovery cases. Không suy từ 33 diagnostic controls.
5. Fresh full frozen-source A/B, control/FE/advisors/cleanup; giữ các hồi quy
   self-profile/avatar/employee/account-session/hotel-scope và reviewer đúng phạm vi.

Giữ self-profile source694 passing A/B làm lịch sử có phạm vi; không gán nó cho
candidate700. Không sửa baseline fail. Không deploy serving/CRM/VPS/DNS/provider,
không gửi email thật. Giữ **8 đợt / 27 gói / 25 bước / 70 case**, toàn bộ 122
releaseAcceptance unverified và gate L/S/P/U/B không đổi.
