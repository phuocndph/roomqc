# Cách chủ RoomQC quản lý VPS và khách hàng

**Mốc mới — 31/10/2026:** Đã có CLI khởi tạo directory và bộ Compose quản trị
chung. Lượt `b98a421dc28f` chạy thật frontend/API/directory/alert worker tại
local; HTTP, quyền, TLS, chạy lại và dữ liệu sau restart đạt. Mạng web có cổng
loopback, database giữ riêng. Chưa khép gói SSH chung hoặc health/setup worker
với backend thật; Contabo và signup production giữ nguyên.
[Kết quả và giới hạn](roomqc-management-bundle-local-2026-10-31.md).

**Bổ sung mới — 31/10/2026:** Đã cài backend đầy đủ qua SSH trên Linux thử riêng
(8 dịch vụ nền + 10 dịch vụ kiểm thử), áp dụng591migration và đạt91/91kiểm tra
khách hàng. Đã kiểm cấu hình riêng, quyền/hash và rollback dữ liệu; dọn riêng
container/network/volume về0. Đường hàng đợi HTTP→executor→SSH→backend local đã
được kiểm tiếp ở lượt `57df223bfcab`; chưa triển khai VPS bên ngoài, chưa mở signup production.
[Biên nhận, cách chạy lại và giới hạn](roomqc-backend-ssh-and-signup-local-2026-10-31.md).
[Cấu hình riêng cho bản cài](roomqc-private-deployment-configuration.md).

**Bổ sung nghiệm thu tài khoản — 31/10/2026:** Hai khách sạn và nhân viên đã
hoàn tất đăng ký/nhận lời mời qua luồng native thật, sau đó đăng nhập trên UI.
91/91 kiểm tra native đạt; browser xác nhận phòng từng khách sạn, nhân viên bị
chặn quản lý tài khoản và không mở được doanh nghiệp khác. Đã sửa thông báo
đăng nhập nhầm doanh nghiệp và nhãn gói dùng thử; bản sửa chạy local8082.
[Kết quả, ảnh và giới hạn](roomqc-customer-browser-access-local-2026-10-31.md).
Điều này chưa nghiệm thu cài toàn stack lên VPS hoặc tiếp nhận khách thật.

**Trạng thái mới nhất 31/10/2026:** Mục **Hạ tầng → Máy chủ VPS** đã hiện
`contabo-trial-01` với số đo CPU/RAM/ổ trống/Docker thật qua SSH chỉ đọc. Số đo
cập nhật khoảng mỗi phút và hết hạn sau120giây. Máy chưa liên kết cụm dữ liệu;
signup toàn hệ thống vẫn đóng. Các ghi chú danh sách trống bên dưới là lịch sử
trước lần kết nối này. [Chi tiết](roomqc-host-monitor-local-2026-10-31.md).

Đã có gói giám sát chạy riêng trên máy quản trị Linux để bỏ phụ thuộc máy
Windows. Bài Compose với SSH thật/database TLS và các lỗi phục hồi đạt17/17;
chưa cài dịch vụ này trên VPS. Tệp cấu hình, tài khoản ít quyền và khóa SSH riêng
phải được chuẩn bị trước khi chạy. [Runbook](roomqc-host-observer-service.md).

**Bằng chứng ban đầu 31/10/2026 — luồng đăng ký đã kiểm bằng trình duyệt local:** Đăng ký, mã xác
minh, onboarding, tạo phòng trên desktop/điện thoại và đăng nhập lại đạt trên
backend cô lập. Đã sửa lỗi diện tích trống chặn lưu và menu điện thoại che nút
chuyển bước; bản sửa chạy tại 8082. Lời mời nhân viên trong lượt này mới gửi vào
hộp thư thử; bằng chứng nhận lời mời native và đăng nhập UI đã bổ sung ở đầu
tài liệu. Bộ thử đã dọn riêng; không gắn VPS, không mở signup production.
[Kết quả và giới hạn](roomqc-customer-browser-journey-local-2026-10-31.md).

**Kiểm tra trực tiếp local ngày 31/10/2026:** Hạ tầng và Đăng ký mới đã có
khung **Tiếp nhận khách hàng mới**, đọc từ API quản trị bằng phiên Super Admin
thật. Trạng thái toàn hệ thống hiện là **đóng đăng ký mới**; số liệu quá 30 giây
được thay bằng yêu cầu tải lại. Đã kiểm trên browser cả việc hết hạn và tải lại.
Danh sách Máy chủ VPS hiện chưa có máy được ghi nhận; Cụm dữ liệu chỉ có
`local-a`, 0/20, đóng nhận khách và chưa có số đo. Vì vậy chưa được coi là
giám sát hoặc quản lý trực tiếp VPS Contabo. Cần gắn máy, cụm và worker trước
khi có thể theo dõi tài nguyên VPS thật tại đây.
[Kết quả và giới hạn](roomqc-signup-status-local-2026-10-31.md).

**Cập nhật 31/10/2026 — kiểm điều kiện trước từng bước:** Mục Triển khai hiển
thị lý do bản cài bị chặn và hướng xử lý. Worker/CLI dùng cùng bản triển khai
bất biến và kiểm lại phê duyệt, đích kết nối, bộ phần mềm, cấu trúc dữ liệu,
backup và việc đóng nhận khách. Đã thử API → executor → SSH thật → nginx khỏe
trên máy Linux dùng riêng cho test local; chưa nghiệm thu toàn stack RoomQC
hoặc VPS khách hàng. SSH kể cả preflight yêu cầu host key được xác minh sẵn
trong `known_hosts`, không tự chấp nhận khóa máy lạ.
[Biên nhận và giới hạn](roomqc-deployment-readiness-local-2026-10-31.md).

**31/10/2026 — hàng đợi triển khai từ trang quản trị:** Đã nối yêu cầu → hàng đợi bền → executor riêng → journal/biên nhận. Không gửi SSH từ trình duyệt; lệnh bị ngắt cần đối soát, không tự chạy lại. [Cách dùng và giới hạn](roomqc-deployment-queue-local-2026-10-31.md). Production và VPS dùng chung chưa đổi.

**Đối soát triển khai bị gián đoạn đã bổ sung:** Công cụ vận hành có thể xác
nhận bản mới/bản trước/cụm rỗng, chặn tiến trình cũ rồi ghi biên nhận riêng.
Trang Hạ tầng → Triển khai hiển thị kết quả và thời điểm đối soát. Chỉ giải
phóng đúng khóa sau khi biên nhận được lưu; lệnh đang chạy vẫn được bảo vệ.
Đã có hàng đợi nhận yêu cầu từ trang Hạ tầng; executor riêng chỉ thực thi bản cài local/staging đã duyệt. [Cách dùng và giới hạn](roomqc-vps-reconciliation-local-2026-10-31.md).

**31/10/2026 — lịch sử triển khai đã nối vào trang Hạ tầng ở nguồn integration:**
Mục **Triển khai** đọc biên nhận từ database điều phối: cụm/máy chủ, bản cài,
bước gần nhất, thời gian và kết quả. CLI execute phải lưu ý định và tiến độ trước
khi chạy lệnh từ xa; tài khoản API chỉ được đọc lịch sử. Lượt đang chạy, commit
chưa rõ hoặc rollback lỗi sẽ chặn lượt mới trên cùng cụm. Đã bổ sung yêu cầu triển khai và worker hàng đợi riêng; xem runbook hàng đợi bên dưới. Đối soát hiện do công cụ vận hành nêu trên thực hiện, chưa tự
chạy hoặc có nút thao tác trong UI.

**Bộ triển khai đã được kiểm trên Docker thật tại local:**
[10 ca cài/nâng cấp/rollback/khóa](roomqc-vps-release-deploy-local-2026-10-31.md)
đạt trên workload nginx cô lập. Mỗi cụm có project và đường dẫn release riêng;
không dùng lệnh dừng toàn project dùng chung. Execute production vẫn chặn cho
đến khi nối các gate nhận khách/backup/schema có thẩm quyền. Chưa kiểm toàn stack
RoomQC qua SSH trong lượt này.

Cập nhật theo mã nguồn và kiểm tra ngày 30/10/2026. Giai đoạn hiện tại chỉ thử
nghiệm; người dùng không yêu cầu tăng dung lượng VPS hoặc mở đăng ký production.

## Mô hình vận hành

Bạn thuê và quản lý VPS. Khách sạn chỉ đăng ký RoomQC. Hệ thống giữ danh bạ
khách hàng và cấp không gian dữ liệu trên cụm đã chuẩn bị, đủ tài nguyên và
được phép nhận khách mới. Không tạo một VPS cho mỗi khách sạn.

VPS là máy chủ thuê từ Contabo hoặc nhà cung cấp khác. Cụm dữ liệu là bộ dịch vụ
RoomQC chạy trên máy chủ đó. Cần gắn cụm với máy chủ để biết tổng tài nguyên và
các ứng dụng đang dùng chung máy. Danh mục VPS đã có hồ sơ và liên kết cụm;
thanh toán, tăng cấu hình và vòng đời máy ở Contabo chưa được tự động hóa.

## Những mục quản trị đã có trong mã

| Mục | Dùng để làm gì | Giới hạn hiện tại |
|---|---|---|
| Hạ tầng `/super-admin/infrastructure` | Xem cụm, CPU, RAM, ổ dữ liệu, kết nối database, số không gian đã cấp; đóng/mở nhận khách, rút tải, đổi giới hạn | Cần control API, worker và số đo thật đang hoạt động; không tự mua hoặc nâng VPS |
| Hạ tầng → Cảnh báo | Theo dõi cảnh báo và trạng thái xử lý | Không thay chứng minh hệ thống cảnh báo ngoài máy đang hoạt động |
| Hạ tầng → Sao lưu | Xem lịch sử backup, trạng thái kiểm tra và lần thử phục hồi đã ghi nhận | Không có nghĩa mọi dữ liệu đã backup đủ; chưa phải nút phục hồi toàn máy |
| Hạ tầng → Triển khai | Chọn bản cài đã duyệt, gửi vào hàng đợi; xem tiến độ và biên nhận | Executor riêng; chỉ local/staging, cần chuẩn bị cấu hình trước; lượt chưa rõ cần đối soát |
| Đăng ký mới `/super-admin/registrations` | Theo dõi giữ chỗ, cấp dữ liệu, cụm được cấp, lỗi, lịch sử; đối soát lại kết quả | Không tự di chuyển khách sang cụm khác hoặc coi timeout là thất bại chắc chắn |
| Khách hàng / Gói dịch vụ | Quản lý doanh nghiệp, tình trạng và chính sách gói | Không thay kiểm tài nguyên, billing nhà cung cấp hay nghiệm thu signup thật |

Giao diện Hạ tầng hiện có mục **Máy chủ VPS**. Mục này hiển thị máy đã được ghi
nhận trong directory, cụm đang liên kết, môi trường, nhà cung cấp, khu vực và
trạng thái. Nút **Thêm cụm đã chuẩn bị** chỉ cho chọn một cấu hình đã được duyệt
trên server rồi ghi nhận cụm ở trạng thái chờ kiểm tra; không nhận IP, mật khẩu
SSH hoặc endpoint tự nhập từ trình duyệt. Vì vậy nó không tự cài Docker/RoomQC
và không được hiểu là VPS đã kết nối thành công.

Danh sách máy chủ cũng hiển thị bốn thông tin vận hành an toàn từ lần preflight
gần nhất: thời điểm kiểm tra, phần trăm ổ đĩa còn trống, phiên bản Docker và
việc máy có đủ điều kiện triển khai hay không. Máy staging/production thiếu
preflight, preflight đã quá 24 giờ hoặc bị chặn vì thiếu tài nguyên sẽ hiện rõ là
chưa đủ điều kiện; không có nút bỏ qua hàng rào này. Máy local được đánh dấu là
môi trường thử nghiệm và không yêu cầu SSH preflight.

Các nút đổi trạng thái cụm không phải lệnh reboot, SSH hoặc di chuyển dữ liệu.
Rút tải chỉ ngừng cấp khách mới và giữ nguyên khách đang dùng.

## Công việc hằng ngày

1. Mở **Hạ tầng → Máy chủ VPS** để xem máy nào đã liên kết cụm; lọc theo môi
 trường. Đọc ngay trạng thái preflight; nếu máy bị chặn, xử lý ở VPS rồi chạy
 lại preflight, sau đó khởi động lại control plane để nạp bản ghi mới. Mở **Cụm
 dữ liệu** khi cần xem số đo, sức chứa và quyết định nhận khách.
2. Mở Đăng ký mới để xử lý các đăng ký chưa sẵn sàng; đối soát trên đăng ký cũ,
   không tạo lại khách sạn khi chưa biết kết quả.
3. Xem khách hàng/gói sử dụng và các cảnh báo cần hỗ trợ.
4. Khi cụm gần đầy: giữ hoặc đóng nhận khách mới; chuẩn bị thêm VPS/cụm,
   kiểm tra xong mới cho cụm mới nhận khách. Khách cũ giữ nguyên cụm. Di chuyển
   khách cũ cần quy trình riêng có backup và đối soát dữ liệu.

## Phần cần hoàn thiện để quản lý nhiều VPS thuận tiện

### Bộ điều phối onboarding đã có ở local

Local đã có bộ điều phối an toàn để chuẩn hóa bước thêm máy mới:

```text
npm run vps:onboarding:plan -- --inventory-file ABSOLUTE_JSON \
  --cluster-id CLUSTER_ID --release-id RELEASE_ID \
  --image ROOMQC_IMAGE@sha256:DIGEST --compose-file ABSOLUTE_COMPOSE \
  --mode plan
```

Bộ điều phối chỉ đọc inventory server-owned, yêu cầu preflight còn hạn, kiểm
image/Compose dùng digest cố định và trả kế hoạch đã che thông tin nhạy cảm.
Fixture local đã kiểm đường thành công, máy không đủ điều kiện và rollback khi
health gate lỗi. Nó chưa SSH, chạy Docker, gọi Contabo hoặc mở signup; các bước
đó chỉ được nối sau khi có VPS staging đủ dung lượng và bộ cài thật được nghiệm
thu.

Sau khi có VPS staging, lệnh triển khai release sẽ dùng cùng inventory và bắt
buộc chạy preflight trước khi thay đổi máy:

```text
npm run vps:deploy -- --inventory-file ABSOLUTE_JSON \
  --cluster-id CLUSTER_ID --release-id RELEASE_ID \
  --image ROOMQC_IMAGE@sha256:DIGEST --compose-file ABSOLUTE_COMPOSE \
  --host PUBLIC_IP --user SSH_USER --identity-file ABSOLUTE_KEY \
  --mode execute
```

Lệnh stage/validate/start/health/commit theo từng bước. Health không đạt thì
phục hồi Compose release trước của đúng cụm, không xóa volume. Bộ cài không tự
đóng nhận khách: phải có lệnh quản trị được xác nhận riêng; kết quả ghi nhận
`admission: unchanged`. Execute production đang bị chặn cho tới khi nối đủ gate
nhận khách/backup/schema. Lệnh này chưa được chạy trên VPS dùng chung hiện tại.

- Danh mục VPS: tên dễ nhớ, IP, nhà cung cấp, khu vực, cấu hình, chi phí,
  trạng thái kết nối và các cụm chạy trên máy; tổng ngân sách toàn máy.
- Quy trình Thêm VPS: kết nối bảo mật một lần, kiểm tra máy, cài bộ RoomQC
  phiên bản cố định, xác minh TLS, worker, backup và cách ly trước khi nhận khách.
- Trang chi tiết VPS: số liệu và lịch sử, khách hàng theo từng cụm, cảnh báo,
  phiên bản đang chạy, backup, nhật ký thao tác và hướng xử lý dễ hiểu.
- Nâng cấp và khôi phục có kiểm tra trước/sau, khả năng quay lại, phân quyền,
  xác nhận tác động và lịch sử. Tự mua/nâng gói qua API nhà cung cấp là phạm vi
  riêng; hiện chưa có tích hợp Contabo tự động được nghiệm thu.

## Quy trình quản lý VPS sau khi phần cài đặt hoàn thiện

1. Chuẩn bị VPS ngoài hệ thống quản trị: cập nhật hệ điều hành, khóa SSH riêng,
   firewall, DNS/TLS, backup ngoài máy và một cấu hình inventory do server giữ.
2. Chạy preflight chỉ đọc từ máy vận hành:
   `npm run vps:preflight -- --host PUBLIC_IP --user SSH_USER --identity-file ABSOLUTE_KEY`.
   Khi đã có entry inventory tương ứng, ghi lại bằng chứng server quan sát được bằng:
   `npm run vps:preflight:record -- --host PUBLIC_IP --user SSH_USER --inventory-file ABSOLUTE_PRIVATE_JSON --cluster-id CLUSTER_ID --write`.
   Lệnh thứ hai chỉ cập nhật `capturedAt`, `deploymentAllowed`, dung lượng trống
   và phiên bản Docker; không nhận hoặc ghi SSH password, private key hay service key.
   Control plane đọc tài liệu này qua `ROOMQC_CONTROL_INVENTORY_FILE` khi khởi động;
   sau khi ghi preflight cần khởi động lại control service theo runbook để nạp
   revision mới. Không đặt biến tệp cùng lúc với inventory/credential inline.
3. Kiểm tra máy bằng bộ cài RoomQC có phiên bản cố định; xác minh endpoint,
   database, worker, health sample và backup restore test. Chỉ khi đủ bằng chứng
   mới đưa entry vào danh sách cụm có thể thêm.
4. Trong RoomQC, mở **Hạ tầng → Máy chủ VPS → Thêm cụm đã chuẩn bị**, chọn entry
   có sẵn và ghi lý do. Lệnh có mã chống gửi trùng; mất kết nối thì tải kết quả
   theo đúng mã cũ, không bấm tạo lệnh mới.
5. Theo dõi cụm mới ở **Cụm dữ liệu**. Cụm bắt đầu đóng nhận khách; chỉ sau khi
   có số đo mới, backup hợp lệ, release/schema/frontend đúng và kiểm tra thật
   mới mở nhận khách.
6. Khi máy gần đầy hoặc bảo trì, dùng **Đóng nhận khách / Rút tải**. Không xóa,
   reboot hay di chuyển khách cũ từ màn hình này. Mọi nâng cấp cần runbook riêng,
   snapshot trước, kiểm tra sau và phương án quay lại.

## Các thao tác trên trang quản trị

| Việc cần làm | Vị trí | Kết quả |
|---|---|---|
| Xem toàn bộ VPS đã ghi nhận | **Hạ tầng → Máy chủ VPS** | Lọc theo local/staging/production, xem trạng thái máy, preflight và cụm liên kết |
| Xem sức khỏe và sức chứa | **Hạ tầng → Cụm dữ liệu → Xem chi tiết** | CPU, RAM, ổ dữ liệu, database, số workspace và hạn nhận khách |
| Tạm dừng nhận khách mới | Chi tiết cụm → **Đóng nhận khách** hoặc **Rút tải** | Khách đang dùng giữ nguyên; đăng ký mới không được cấp vào cụm |
| Bảo trì một VPS | Chi tiết cụm → **Đưa máy chủ vào bảo trì** | Máy chuyển bảo trì, cụm rút tải và đóng nhận khách; thao tác được ghi audit |
| Cho VPS hoạt động lại | Chi tiết cụm → **Đưa máy chủ hoạt động lại** | Máy hoạt động lại nhưng cụm vẫn đóng nhận khách cho đến khi có số đo mới và mở riêng |
| Thêm cụm đã cài sẵn | Máy chủ VPS → **Thêm cụm đã chuẩn bị** | Chỉ chọn inventory đã duyệt; không cài phần mềm, không nhập SSH từ trình duyệt |

Các nút quản trị đều có lý do, phiên bản cấu hình và mã chống gửi trùng. Nếu mất
kết nối sau khi bấm, dùng **Kiểm tra kết quả lệnh** với cùng mã; không bấm tạo
lệnh mới. Trang quản trị hiện chưa điều khiển thanh toán, nâng/hạ gói hoặc mua
VPS của Contabo; các việc đó vẫn làm ở nhà cung cấp rồi chạy lại preflight.

Khi cần tạm dừng cả một VPS, mở chi tiết cụm liên kết và dùng **Đưa máy chủ vào
bảo trì**. Hệ thống tự đóng nhận khách và chuyển cụm sang rút tải; dữ liệu khách
đang dùng không bị xóa. Sau khi kiểm tra ngoài hệ thống xong, dùng **Đưa máy chủ
hoạt động lại**. Cụm vẫn đóng nhận khách; người vận hành phải xem số đo mới và
mở nhận khách bằng lệnh riêng. Hai thao tác này được ghi audit, kiểm tra phiên bản
và chống gửi trùng.

## Bằng chứng thử nghiệm hiện tại

- Đã cập nhật riêng frontend local ở `localhost:8082` từ nguồn integration.
  Browser với phiên Super Admin hiện có đã tải được Hạ tầng/chi tiết local-a,
  Cảnh báo, Sao lưu và Đăng ký mới qua menu. Lỗi 404 trước cập nhật đã hết.
  Local-a đang đóng nhận khách, 0/20, chưa có số đo; backup/đăng ký chưa có bản ghi.
  Đây là kiểm tra đọc trên local, chưa kiểm luồng đăng ký mới hoặc giám sát VPS thật.
- Đã khởi động bản xem thử nguồn mới tại `http://127.0.0.1:8093`. Trình duyệt
  chuyển đúng đến đăng nhập khi chưa xác thực. Chưa kiểm trang Hạ tầng với một
  phiên Super Admin đăng nhập trên bản xem thử này.
- 22 bài kiểm của `ControlConsoles.test.tsx` và `SuperAdminLayout.test.tsx` đạt,
  gồm điều hướng, lọc/trang, số đo hết hạn và wiring client. Đây là kiểm tra
  giao diện có fixture, không phải nghiệm thu nhiều VPS thật.
- Backend full và dựng lại độc lập cùng nguồn đã đạt; xem
  [biên nhận](../../../artifacts/roomqc-current-full-and-rebuild-2026-10-30.json).
  Chưa triển khai production, kiểm tải, email thật, offsite recovery toàn hệ thống
  hoặc nghiệm thu signup thật. Các mục này vẫn nằm trong mục tiêu tổng thể.
