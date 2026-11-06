# RoomQC — advice: quyền, journal và adapter local

27/10/2026. Lát A1–A4/A5 trong T03/T04/T08/T13 của kế hoạch toàn bộ VPS + signup.
Đây là bằng chứng local có phạm vi; chưa hoàn tất advice, Q02 hoặc sản phẩm.

Native1000: SHA3369e212bf3b9447c5c03699370d446dfaabf3bac4dc7a40e22e5925465c998c;
1000file có phạm vi,573business +12directory,backend binding186file. Adapter999:
SHA841bdc59…, cùng TS/SQL/index; chỉ runner và native harness đổi sau adapter.
Manifest không phải toàn repository hoặc bản đang phục vụ localhost/VPS.

## Thay đổi thực tế

Migration573 thêm policy AI riêng phía server, không bật tenant nào mặc định.
tenant.settings do khách sửa không cấp quyền. UserRPC kiểm Auth/session sống,
profile/role/reports.view/assigned hotel/tenant và entitlement hiện thời.

Prepare lấy operations/labor/target từ nguồn scoped server, trả receipt/hash.
Journal, reservation, quota UTC và dispatch nonce bền vững; claim trước external
I/O. Cancel/tombstone chặn prepare muộn; expiry/policyversion đổi hủy reservation.
Dispatch chỉ dành serviceRPC, kiểm lại quyền/scope/session/policy/deadline. Finish
lưu advice+audit+receipt atomic. Unknown giữ charge, không tự gửi lại; cùng key
khác payload/output conflict. Quota units là giới hạn nội bộ, chưa là tiền thực
thu bởi provider. Nhánh UTC midnight có code, chưa có native proof.

Edge index dùng handler/config/adapter mới. Provider mặc định disabled kể cả còn
LOVABLE_API_KEY. Auth verify bearer trước khi bind sub/session; userRPC chỉ dùng
anonkey +bearer, servicekey chỉ dùng workerRPC. Response/error/JSON có giới hạn,
timeout/redirect/error an toàn; không log raw diagnostics hoặc credentials.

Projection sang provider chỉ lấy aggregates trong allowlist; loại UUID, tên
khách, contact, tên bộ phận, lương từng người và key. Prompt phân biệt revenue,
cash, refund due, room-only KPI, estimate và target applicability. Sink URL cố
định, chỉ mode fixture có owner ID. Chưa chạy sink trên Deno thật. Production
endpoint không nhận URL từ user.

ACL inventory và drift tests mở37→39, tách24browser/probe +8service denials cho
hai bảng advice; giữ legacy216/60 và unknown-target failure. Diagnostic advice
chạy riêng; default full chưa nối/chạy advice như bài tích hợp.

## Bằng chứng đã chạy

| Bài | Kết quả | Giới hạn |
|---|---|---|
| Adapter/contracts/provider/handler dependency tests |79/79|Input/output/privacy/deadline/Authkey/replay/revoke; không thay API hoặc Deno |
| TypeScript app, focused lint, esbuild0.28.2 Edge bundle |exit0,exit0,build đạt|Build chưa là thực thi Deno/Internet |
| Independent PostgreSQL direct ACL drill |4/4,0skip|39bảng;468browser/probe +144service denials; drift SELECT/column UPDATE/service DELETE/unknown object và restored positives |
| Native Auth/REST fresh573 |39/39|OwnerA/B/quota; nguồn report fixture chưa có nghiệp vụ tiền, so đúng scoped operations/labor RPC; chưa đủ role matrix |
| Quota race có barrier |4requests,1accepted/3denied|Quan sát≥2 real transactions chờ policy lock; không đo user capacity |
| Backend source binding và actual Compose renderer |13/13,0skip|Cùng runner1000; không full backend hoặc deploy |
| Schema/source/cleanup |Không drift, fixture còn0|Owned container/volume/network0; primary implementation/index/ledger/worksheet giữ nguyên |

39ca native kiểm default deny; service policy/browser denial/foreign/machine;
prepare/replay/conflict/scoped source; nonce/replay/unknown/cancel; malformed
output/completed/replay/output conflict; một journal/5units; cancel-before-prepare;
expiry/policy change/profile lock/session expiry/restored positive/late finish;
quota race/replay/exact usage/cancel release và audit. Chưa đủ mọi actor, fault
window hoặc transport; không gán chúng thành70ca nghiệm thu.

Advisors732 tại workload1000,CLI2.121.0; chưa disposition từng object/đường dùng.
Số finding thay đổi theo workload, không coi chênh count là tất cả regression
hoặc các lỗi đã sửa.

## Lịch sử lần thất bại

Adapter đầu:0ca, setup chung truy cập window trong node environment. Sửa test
dùng jsdom hiện có. TS/lint/build/ACL4 đã đạt, toàn attempt vẫn exit1.

Native đầu:18ca đạt rồi assertion so advice bằng JSON.stringify sai thứ tự key
của JSONB. Đổi harness sang structural equality, giữ expected/schema/product.
Fresh rerun39/39 đạt; cả hai lần native đều cleanup0. Không bỏ failed history.

## Phần chưa làm

Nhận [19.28](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1928-phiếu-nhận-sau-advice-core1000):
thực thi Deno +sink; seed money; đủ roles/fault/race/TCP/process restart;
caller pending/lookup/cancel/UI; populated upgrade572→573 với fault rollback.
Snapshot staleness, budget rollover, policy revocation, retention/abuse và tích
hợp cấu hình service policy cần proof/decision riêng. Không áp573/Edge riêng
lẻ với caller cũ còn gửi snapshot.

Provider thật/key/policy hoãn mục9; local code/proof tiếp tục, rồi mobile money,
F3, writerQ02→Q03→Q04 và tám đợt. Chưa browser/Android/full-control1000/default
full/rebuild/VPS/DNS/email/offsite/load/pilot.70ca/122entries/gates chưa ký.

[Artifact đã lọc](../../../artifacts/roomqc-operations-advice-core-local-2026-10-27.json)
giữ manifest/controls/exits/failed history/cleanup.
