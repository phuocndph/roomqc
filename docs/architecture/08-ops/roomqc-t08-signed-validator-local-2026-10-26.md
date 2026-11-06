# RoomQC — T08: bộ xác minh chữ ký, bước triển khai đầu tiên

Ngày 26/10/2026. Checklist con T03/T08 của
[kế hoạch toàn bộ VPS + signup](roomqc-vps-signup-execution-ready-2026-10-22.md),
theo [thiết kế phê duyệt](roomqc-t08-signed-approval-design-2026-10-26.md).
[Artifact và phạm vi kiểm thử](../../../artifacts/roomqc-t08-signed-validator-local-2026-10-26.json).

## 1. Thay đổi thực tế

Thêm release-approval.mjs và release-approval.test.mjs trong integration sau khi
full backend343 và independent rebuild380 trên baseline98b đã native terminal0,
khớp source/schema/runtime và cleanup độc lập0. Primary chỉ nhận tài liệu/artifact.

Bộ xác minh dùng Ed25519, ký cả issuer/key header và payload qua bytes canonical
có domain separation. Payload gắn approvalId/epoch, inventory/host/cụm/môi trường,
endpoint fingerprint và đủ release/artifact/frontend/migration/schema hashes.
Hạn approval và maximum validity theo cấu hình tách khỏi canary/Auth credential.

Keyring chỉ chấp nhận public JWK Ed25519 exact fields, có scope môi trường;
không nhận private component, key trùng hoặc thuật toán khác. Loader yêu cầu
file absolute/regular/bounded/private và từ chối symlink. Lỗi không đưa parse
body hoặc crypto internals ra API. Kết quả không trả signature hoặc credential.

Đây là module có mã và test thật, **chưa được gọi từ runtime sản phẩm**.
ReleaseValidationCatalog/ManagedHealthCatalog v1 còn hiện hành; không coi chúng
là thiết kế cuối được chấp nhận. Chưa có durable authority/withdrawal hoặc fence
ở validate/health/admission/reserve/provision. Không đóng T08 từ module này.

## 2. Kết quả đã chạy

| Môi trường / phạm vi | Kết quả |
|---|---|
| Windows Node24, verifier/loader |10/10,0fail/skip/cancel,exit0 |
| Windows, thêm hồi quy manifest/catalog hiện hữu |16/16,0fail/skip/cancel,exit0 |
| Đúng Node22 Alpine image pin của worker, cùng verifier tests |10/10,0fail/skip/cancel,exit0 |

Kiểm signature thật và tamper từng trường, sai key/domain/issuer/algorithm,
scope/binding, not-before/expiry/max validity, exact types/bounds, signature
encoding, private JWK, immutable keyring, input accessor/toJSON, file lỗi/quá
lớn/symlink. Các ca trên hai hệ điều hành là cùng scenario, không cộng thành20ca.

Container Linux chạy không network, source mount readonly, tmpfs dùng riêng cho
file fixture; không dùng credential thật. Dọn bằng --rm, kiểm độc lập exact label
sau lượt chạy: container/network/volume0, ba lệnh exit0. Không broad prune.
Không coi Docker Desktop VM là VPS Linux staging acceptance.

## 3. Candidate và giới hạn

Candidate775files /546business+9directory migrations:
`ad9782079dd7af739ba704088e03faf172305a07f3ff201a1b9b1806bbeecd0a`.
Runtime144files:
`6cb213097b58ce92a164511def7abe0bd129581832b52df7a3b7dda92090e678`.
Manifest kế thừa baseline98b cộng hai file mới; không sửa dependency hoặc migration.

Full control307/307,full343/rebuild380 là proof của **baseline98b/773files**,
không thừa kế sang775. Chưa chạy full control/full backend/rebuild cho775, vì
runtime integration và authority delta còn phải triển khai trước packet kết hợp.
Không đổi DB phục vụ, CRM, VPS/DNS/provider/email Internet hoặc gate phát hành.

## 4. Việc tiếp theo trong toàn bộ kế hoạch

1. Directory approval authority, installer/withdrawal, role guards, epoch và
   audit/receipt/replay theo lock727001; upgrade từ9 có dữ liệu/checksum.
2. Nối signed catalog và managed metadata, kiểm authority ở validate và health
   commit, admission/reserve và quyền write mới kể cả provisioning retry.
3. Hai process thật: response cũ bị giữ qua thu hồi, restart/cache/notification
   lỗi, expiry và recovery bằng approval mới; no-effects theo thứ tự transaction.
4. Freeze candidate kết hợp, focused/full DB control/full backend/independent
   rebuild; sau đó khép indirect/workflow/policy/FK và các đợt còn lại.

Giữ nguyên70worksheet not_run,122release entries unverified,reviewer/signoff null.
Thiếu đầu vào external hoãn đúng case; không thay tiêu chí hoặc dừng phần local.
