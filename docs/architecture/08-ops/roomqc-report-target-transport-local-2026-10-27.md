# RoomQC — phục hồi mục tiêu báo cáo sau mất phản hồi TCP

Ngày 27/10/2026, Asia/Bangkok. Lát target transport của Q02/F2, T04/T22,
trong mục tiêu toàn bộ VPS + signup. Đây là kiểm thử native client/API có
phạm vi; chưa nghiệm thu toàn sản phẩm hoặc triển khai VPS.

## Kết quả đã kiểm

Client `src/lib/report-targets.ts` được bundle bằng esbuild 0.28.2, chạy trong
các tiến trình Node riêng với token từ Auth thật và API thật của backend Docker
sở hữu riêng. Không thay fetch của client bằng mock. Proxy HTTP chỉ chuyển
bốn RPC target đến địa chỉ API nội bộ cố định.

Proxy cắt socket trước khi chuyển request hoặc sau khi nhận response thành
công và đọc journal bằng một kết nối database khác để xác nhận kết quả đã
bền vững. Client kết thúc với unknown và pending còn trên thiết bị thử;
tiến trình mới đọc lại cùng command record để lookup/replay. Storage dùng
file fixture có API tương đương, không phải browser localStorage thực.

| Luồng | Kết quả thực tế |
|---|---|
| Save đã commit, mất response | Giữ pending; tiến trình mới không mở key khác; lookup completed theo key gốc, không thêm write/audit |
| Mất request trước dispatch | Chưa có journal hoặc effect; lookup not_found rồi phát lại đúng key, payload và revision; chỉ một kết quả/audit |
| Cancel đã commit, mất response | Giữ pending; tiến trình mới nhận cancelled; writer cùng key đến muộn vẫn cancelled, không đổi target hoặc revision |
| Hai tiến trình, cancel trước dispatch save | Writer còn sống và đang chờ TCP barrier; cancel thắng; cả hai nhận cùng cancelled, không thay giá trị |
| Hai tiến trình, save commit nhưng đang giữ response | Cancel trả completed gốc; writer nhận lại cùng kết quả, không tạo cancellation effect thứ hai |
| Native session hết hạn | Recovery/cancel bị từ chối và pending giữ nguyên; đăng nhập Auth mới cùng actor phục hồi command cũ một lần |
| Biên credential và cleanup | Child chỉ nhận runtime của caller, không có service key hoặc DB password; các tiến trình kết thúc, file/socket được đóng và Docker exact-label cleanup còn 0 |

Năm luồng đầu được kiểm ở cả financial theo khách sạn, financial toàn tenant
và monthly theo khách sạn. Sáu TCP barriers là điều phối hai tiến trình qua
network; phân biệt với 18 race qua khóa database của suite Auth/REST.

## Source và kiểm thử

Source SHA `6ed74544319865e2c7ebd2a8e855d25a468d0f97106b185fec7575588c27d2cc`,
992 file; backend binding 184 file, 572 business + 12 directory migrations.
Chỉ thêm `scripts/control-backend-report-target-transport-checks.mjs` và nối
stage trong `scripts/test-control-backend-sandbox.mjs`. Stage cũng nằm trong
default full path và được yêu cầu khi so sánh independent build reference;
chưa chạy toàn default full hoặc independent rebuild trên source này.

- Transport: 31/31; 6 TCP ordering barriers, cả 3 scope nêu trên.
- Auth/REST regression: 248/248, giữ toàn bộ 248 controls của 991; 18 race
  database vẫn đạt. Schema trước–sau cả hai stage giữ nguyên.
- Source binding: lần đầu 12 pass + 1 skip do chưa bật actual Compose render;
  lần bổ sung bật renderer đạt 13/13, không skip. Giữ cả hai bản ghi; renderer
  kiểm hai cấu hình sở hữu riêng, không tạo Docker resource.
- Direct ACL: 37 bảng, 444 browser/probe và 136 private-service denials đạt;
  đây không phải bằng chứng mọi indirect path.
- Advisors CLI 2.121.0: 721 finding: 37 no-policy, 7 unindexed FK, 494 unused
  index, 183 multiple permissive policies. Unused index ít hơn một ở run 991;
  số đo usage khác không phải disposition hoặc bằng chứng đã sửa một finding.
- Các tiến trình kết thúc exit 0. Source, app, migrations, primary/index,
  hai ledger và worksheet giữ nguyên trước–sau; exact fixture container,
  volume và network đều còn 0.

Đã dựng lại SHA source 991 bằng cách đảo riêng delta của test harness trong
bộ nhớ; khớp `4a84d794…`. Do đó toàn bộ src và migrations giữ nguyên 991.
Frontend 454/454, UTC 200/200, full control 440/440, TS/lint là bằng chứng ở
991, không ghi thành đã chạy lại ở 992.

## Giới hạn và việc nhận tiếp

Chưa kiểm browser/Android, lifecycle WebView, browser localStorage thật,
refresh token tự động, DB server restart, native offline queue hoặc đường
đăng ký/provisioning mất response. Không suy rộng bài target thành nghiệm thu
idempotency của mọi nghiệp vụ. Chưa populated upgrade, tải hoặc VPS cutover.

Nhận [mục 19.26](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1926-phiếu-nhận-sau-target-transport992)
cho upgrade có dữ liệu 566→572, sau đó advice/mobile/F3 và các phần Q02/Q03/Q04
còn lại trước đủ tám đợt VPS/signup. 70 ca vẫn not_run, 122 release entries
vẫn unverified; reviewer/signoff/gates chưa thay đổi. Chỉ mirror tài liệu và
artifact đã lọc; không đổi implementation primary hay database đang phục vụ.
