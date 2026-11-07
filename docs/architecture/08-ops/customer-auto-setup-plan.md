# Kế hoạch RoomQC: khách đăng ký và tự thiết lập khách sạn

Ngày: 2026-10-15. Trạng thái: đã triển khai nền cấp phát qua directory, checklist
theo khách sạn và wizard phòng ban đầu trên local. Chưa phát hành production;
các đợt mẫu nghiệp vụ, quản trị và vận hành vẫn còn việc cần làm.

Xem [runbook và kết quả triển khai](./workspace-directory-runbook.md).

Cập nhật 2026-10-16 theo lựa chọn của người dùng: “Thiết lập phòng ban đầu” mở
Quản lý phòng (`/rooms`) để dùng chức năng nhập Excel có sẵn; route cũ chuyển hướng
về cùng trang. Không còn mở wizard theo tầng từ giao diện. Xem
[quyết định tái sử dụng luồng nhập phòng](./room-setup-excel-plan.md).

Cập nhật tiếp: directory đã bổ sung hạn giữ chỗ cho intent chưa dùng, bước gắn
owner/provisioning trước gọi cụm và hạn mức tạo intent dùng chung PostgreSQL.
Đã kiểm chứng local; reservation legacy và yêu cầu đã bắt đầu cấp phát không tự
thu hồi. Chống bot tại edge, mẫu nghiệp vụ và kiểm thử staging vẫn còn việc.

Điều chỉnh kiến trúc cùng ngày: triển khai dưới `/app/<slug>/`, có directory
điều phối và khả năng nhiều cụm. Thứ tự và tổng thời gian mới theo
[kế hoạch một tên miền, nhiều cụm](./shared-domain-multi-cluster-plan.md).
Nội dung bên dưới là kế hoạch gốc; đối chiếu tiến độ thực hiện ở runbook.

### Điều chỉnh trải nghiệm: ít bước, dễ bắt đầu (local)

- Màn thiết lập chỉ yêu cầu tên khách sạn, số phòng dự kiến, địa chỉ và số điện
  thoại liên hệ. Mặc định tên đơn vị quản lý dùng tên khách sạn, điện thoại dùng
  số liên hệ, email dùng email tài khoản; có thể nhập riêng trong “Thông tin bổ
  sung”. Không điền dữ liệu giả để vượt kiểm tra phía server.
- Thông tin bổ sung đóng mặc định; khi nhập sai thì mở lại để thấy lỗi. Lỗi kết
  nối giữ nội dung đã nhập và cho phép gửi lại, không chuyển sang cách cấp phát khác.
- Phòng: “Lưu và xem trước” → “Tạo N phòng”. Bỏ checkbox xác nhận thừa, giữ màn
  xem trước đúng bản đã lưu. Nút tạo là hành động xác nhận dùng danh sách/bảng giá;
  giá đêm 0 đ có nhắc nhở, không thêm hộp thoại. Sửa danh sách phải lưu lại trước
  khi tạo. Retry giữ nguyên request ID; không nới quyền hay hạn mức database.
- Checklist ưu tiên thêm phòng. Kho, vật tư và nhân viên nằm trong nhóm tùy chọn,
  vẫn có liên kết; không dùng phần trăm khiến người dùng tưởng phải làm hết.
- Chuyển bước phòng đưa tiêu đề/nội dung mới vào vùng nhìn thấy, tránh màn trắng
  do giữ vị trí cuộn cũ. Thông báo popup đã đóng không tự bật lại sau 800ms trong
  cùng lần mở giao diện; tùy chọn ẩn vĩnh viễn vẫn dùng cơ chế hiện có.
- Đây là thay đổi giao diện local, không cần migration mới và chưa triển khai lên
  production. Chưa thay thế các hạng mục staging, email, nhiều cụm và vận hành.

### Bàn giao tiếp theo: phòng ban đầu (local)

- Chủ sở hữu mở `/setup/rooms` từ checklist, menu cài đặt hoặc danh sách phòng.
- Sinh số phòng theo tầng, bỏ qua số, sửa từng phòng và nhập giá theo loại.
  Thêm tầng tiếp theo giữ giá đã nhập; sinh lặp bị chặn ngay trên giao diện.
- Bản nháp lưu ở database theo khách sạn, có phiên bản để ngăn ghi đè từ tab cũ;
  reload hoặc đăng nhập phiên khác tiếp tục được. Thay đổi chưa nhấn lưu vẫn chỉ
  nằm trong giao diện và có hướng dẫn rõ.
- Xem trước và xác nhận cả giá bằng 0 trước khi tạo thật. Tạo phòng, cập nhật giá
  và đánh dấu hoàn tất cùng transaction; retry cùng yêu cầu không nhân đôi phòng.
- Quota phòng kiểm tra tại database cho wizard, REST và các form hiện có; khóa
  theo tenant để tránh vượt hạn mức khi gửi đồng thời. Form cũ đã chờ kết quả
  kiểm tra quota và không cho qua khi thiếu dữ liệu/lỗi đọc.
- Đã bỏ handler chết trong CategoriesPage từng khởi tạo bằng thông tin giả.
  Liên kết thêm nhân viên dùng route thật `/settings/users`.

Giới hạn cố ý: chỉ khởi tạo khách sạn chưa có phòng, 1–200 phòng, bốn mã phòng
hiện có (standard/deluxe/suite/vip), cùng loại dùng chung giá. Schema cũ dùng mã
loại phòng duy nhất theo tenant; wizard từ chối đổi loại/giá đang gắn hoặc dùng
ở khách sạn khác. Chưa hỗ trợ loại phòng tùy biến theo từng hotel hay chia lô
wizard trên 200 phòng. Các màn hình quản lý hiện có vẫn dùng cho khách đã có phòng;
điều đó không chứng minh vấn đề giá đa khách sạn của schema cũ đã được giải quyết.

Kiểm chứng: 36 kiểm tra Auth/RPC/RLS local; browser desktop qua đăng nhập → lập
hai phòng → nhập giá → lưu → reload → xác nhận → phòng có trên sơ đồ với giá đúng.
Đây không phải E2E email đăng ký hoặc toàn bộ vận hành nhiều cụm. Xem runbook
để biết lệnh chạy lại, migration và các điều kiện phát hành còn thiếu.

## 1. Mục tiêu và kiến trúc

Khách tạo tài khoản, xác thực email, khai báo khách sạn, thiết lập phòng và bắt đầu
vận hành mà không cần RoomQC thao tác database bằng tay. Một người có thể dừng
giữa chừng rồi tiếp tục từ máy tính hoặc điện thoại khác.

Môi trường khách hàng là tenant và dữ liệu khách sạn trên cụm dùng chung. Tiếp tục
kiến trúc đang phục vụ roomqc.com: frontend trên VPS, backend Supabase managed.
Không cấp VPS, container hoặc project Supabase mới cho từng lần đăng ký. Bổ sung
directory và nhận diện cụm theo doanh nghiệp ngay trong kiến trúc mới; ban đầu
vận hành một cụm. Chuyển backend self-host là dự án hạ tầng riêng.

Chủ sở hữu đăng ký mới được tạo tenant. Nhân viên được mời/tạo trong khách sạn đã
có, đăng nhập theo phân quyền và không đi qua luồng cấp phát tenant.

## 2. Hiện trạng đã đọc từ mã nguồn

| Thành phần | Đã có | Cần tiếp tục |
|---|---|---|
| Đăng ký/xác thực | AuthContext, AuthCallback, OnboardingGuard xử lý tài khoản mới và hồ sơ lỗi | Kiểm tra cấu hình email/redirect và xác thực phía server trên môi trường phát hành |
| Cấp phát | complete_registration tạo tenant, hotel, owner, assignment, usage và trial 30 ngày trong transaction | Bổ sung trạng thái thiết lập nghiệp vụ và phiên bản bộ dữ liệu mặc định |
| Gửi lặp | Wrapper khóa auth.users; implementation trả thiết lập đã tạo | Giữ nguyên bảo đảm khi bổ sung các bước mới |
| Danh mục | Vật tư, giặt là, bảo trì, 4 loại phòng và giá mẫu | Chọn mẫu có xem trước; tránh coi giá mẫu là giá vận hành |
| Phòng thực tế | totalRooms lưu quy mô; đã có import phòng | Sinh phòng theo tầng, xem trước, lưu theo lô an toàn và kiểm tra quota ở server |
| Nhân viên | useUsers gọi Edge Function create-user | Tận dụng luồng hiện có; kiểm tra cấp vai trò, gán khách sạn, lỗi tạo dở và gửi lại |
| Hướng dẫn | SetupChecklist trên dashboard desktop/mobile | Trạng thái theo hotel; xử lý lỗi; phân biệt bắt buộc và tùy chọn |
| Quản trị | Trang tenants, billing và approval đã có | Hiển thị tiến độ/lỗi thiết lập, lịch sử và thao tác thử lại an toàn |

Các điểm cụ thể:

- SetupChecklist đếm theo tenant nên dữ liệu khách sạn A có thể làm bước của B
  trông như đã xong; khóa ẩn localStorage chưa có tenant/user/hotel.
- Checklist hiện không kiểm tra lỗi từng truy vấn; lỗi không nên biến thành số 0.
- Có ít nhất 1 phòng đang được coi là hoàn tất bước phòng; chưa phản ánh danh
  sách dự kiến. Có đủ 5 vật tư không chứng minh đã cấu hình nghiệp vụ đúng.
- Giá phòng mẫu 500.000–1.500.000 và giá giặt mẫu đang được cấp tự động. Cần yêu
  cầu xác nhận giá trước khi dùng tính tiền, hoặc tạo loại phòng thật theo lựa chọn.
- useBulkCreateRooms ghi từng phòng, có thể thành công một phần. Luồng onboarding
  mới cần biên giao dịch và retry rõ ràng, không chỉ dùng nguyên hook hiện tại.
- useQuotaCheck cho qua khi thiếu dữ liệu/loading. Phải kiểm chứng bảo vệ server;
  không xem kiểm tra frontend là đủ để bảo vệ gói.
- CategoriesPage còn handler gọi complete_registration bằng thông tin mẫu. Cần
  loại bỏ đường khởi tạo phụ này và dùng cùng một luồng thiết lập chính thức.

Nhận định trên dựa vào repo ở commit 00eab56, không xác nhận trạng thái production.

## 3. Luồng dành cho khách

1. **Tạo tài khoản:** tên, email, mật khẩu; xác thực email và gửi lại có giới hạn.
2. **Khai báo khách sạn:** tên, địa chỉ, liên hệ, quy mô; mặc định thông tin liên
   hệ từ chủ sở hữu để giảm nhập lại. Chỉ bổ sung công ty/pháp nhân khi cần.
3. **Tạo không gian làm việc:** server tạo tenant/hotel/owner/trial/quyền và dữ
   liệu nền. Hiển thị trạng thái thật từ phản hồi, không dùng phần trăm giả.
4. **Thiết lập phòng:** chọn/tạo loại phòng và giá; nhập danh sách, import hoặc
   sinh số phòng theo tầng. Xem trước, sửa số phòng, xác nhận rồi lưu.
5. **Mời nhân viên:** chọn vị trí và khách sạn, xem quyền trước khi gửi. Có thể
   bỏ qua và làm sau; không tự tạo tài khoản nhân viên/mật khẩu dùng chung.
6. **Bắt đầu sử dụng:** mở đúng màn hình phòng/công việc; các bước kho, đồ vải,
   tiêu chuẩn phòng và thông báo xuất hiện theo module được cấp và nhu cầu.

Thiết lập phòng có thể để sau và quay lại từ mục cố định “Thiết lập ban đầu”.
Khi thiếu dữ liệu cần thiết, màn hình liên quan hướng dẫn thêm dữ liệu; ví dụ
không nhận booking khi chưa có phòng và giá đã xác nhận. Không khóa toàn ứng
dụng chỉ vì khách chưa khai kho hoặc chưa mời nhân viên.

## 4. Hạng mục kỹ thuật và thứ tự

### Đợt 1 — Nền cấp phát và trạng thái (ước lượng 2–3 ngày)

- Đối chiếu migrations, Auth, trial và Edge Functions trên staging với repo.
- Giữ complete_registration là điểm cấp phát duy nhất, giữ transaction và khóa
  theo auth user. Không thay luồng ổn định bằng hàng đợi cho tác vụ database ngắn.
- Bổ sung trạng thái cấp phát tách khỏi tiến độ nghiệp vụ: chưa thiết lập,
  đang thiết lập, đã cấp phát, lỗi có thể thử lại. Trial tách khỏi trạng thái này.
- Đề xuất bảng hotel_setup_progress: hotel/tenant, phiên bản thiết lập, bước hiện
  tại, các mốc hoàn tất/bỏ qua, updated_at. Tiến độ tính từ dữ liệu thật; client
  không được tự gán “hoàn tất” cho bước bắt buộc.
- Nhật ký lần cấp phát phải ghi được cả khi transaction nghiệp vụ rollback:
  ghi phía server sau khi RPC trả lỗi, kèm request ID; không ghi chung rồi mong
  nhật ký sống sót sau rollback. Bảo vệ quyền đọc và giới hạn dữ liệu lưu.
- Loại bỏ handler khởi tạo bằng dữ liệu mẫu; trường hợp hồ sơ lỗi dùng retry
  đọc hồ sơ hoặc hỗ trợ quản trị, không tạo tenant mới để chữa lỗi đọc.
- Chốt trial: 30 ngày tính từ cấp phát tenant thành công lần đầu, không làm mới
  khi retry, đăng nhập lại hoặc thêm khách sạn. Giới hạn lấy từ cấu hình server.

**Đạt khi:** tạo một lần, retry trả đúng tenant/hotel, lỗi không để lại tenant
nửa vời, nhân viên không được tự cấp phát, tiến độ lấy lại được sau đăng nhập.

### Đợt 2 — Wizard và phòng thực tế (ước lượng 3–5 ngày)

- Tách Onboarding thành các bước ngắn; dùng phong cách hiện tại, màu tương phản
  rõ, mỗi màn hình một hành động chính, nút quay lại giữ đúng bước đã đi qua.
- Lưu nháp sau khi xác thực, gắn user trước cấp phát và hotel sau cấp phát;
  không lưu mật khẩu/token trong bản nháp.
- Mẫu loại phòng là gợi ý; xem trước và xác nhận giá. Không tự sinh booking,
  khách, doanh thu, tồn kho hoặc số dư giả trong tenant vận hành.
- Tạo phòng theo tầng có loại trừ số, số phòng tùy chỉnh và kiểm tra trùng trong
  khách sạn. Cho xem toàn bộ danh sách và chênh lệch với quy mô đã khai báo.
- RPC ghi lô phòng trong một transaction với giới hạn kích thước lô. Khóa/kiểm
  tra quota đồng thời ở server; xác minh hotel thuộc tenant, loại phòng hợp lệ.
  Với danh sách lớn, chia lô và lưu tiến độ rõ; lỗi lô không làm mất lô đã xong.
- Mỗi yêu cầu lô có mã định danh và dấu vết nội dung: retry cùng nội dung trả
  kết quả cũ, dùng lại mã với nội dung khác báo xung đột. Ràng buộc duy nhất
  hotel + số phòng là lớp bảo vệ cuối, sau khi kiểm tra dữ liệu cũ trước migration.

**Đạt khi:** khách tạo được danh sách phòng thật, giá đúng, không nhân đôi phòng
khi mất phản hồi, có thể thoát/đăng nhập máy khác rồi tiếp tục.

### Đợt 3 — Mẫu nghiệp vụ và phân quyền (ước lượng 2–4 ngày)

- Tách dữ liệu nền tối thiểu khỏi cấu hình tùy chọn: kho, danh mục vật tư,
  checklist dọn/kiểm phòng, tiêu chuẩn đồ vải và nhóm bảo trì theo module.
- Bộ mẫu có phiên bản và định danh ổn định. Áp dụng lặp không trùng; không ghi đè
  dữ liệu khách đã chỉnh. Nâng mẫu phải có bản xem trước và xác nhận riêng.
- Tận dụng create-user; vai trò/quyền/gán hotel kiểm tra ở server. Email/thông
  báo gửi sau khi dữ liệu chính commit, có ghi nhận và retry riêng.
- Quota phòng/nhân viên/khách sạn và module kiểm tra tại server, gồm RPC/REST;
  thử gọi trực tiếp để chắc việc ẩn nút không phải lớp bảo vệ duy nhất.
- Checklist thay đổi theo hotel/module, có liên kết đúng quyền và có chỗ mở lại.
  Kho và nhân viên là bước tùy chọn; không ép thêm dữ liệu chỉ để đạt phần trăm.

**Đạt khi:** một khách sạn nhỏ có thể dùng ngay các module chọn; thêm khách sạn
thứ hai không kế thừa nhầm tiến độ hoặc dữ liệu vận hành của khách sạn đầu.

### Đợt 4 — Vận hành, kiểm thử và phát hành (ước lượng 3–5 ngày)

- Mở rộng trang quản trị tenants: thời điểm đăng ký, tenant/hotel, tiến độ, lỗi
  gần nhất, mã hỗ trợ, trial, phiên bản mẫu và thao tác thử lại có audit log.
- Tác vụ email/thông báo bất đồng bộ cần trạng thái bền vững, retry có backoff,
  giới hạn lần thử và không gửi trùng. Lỗi gửi email không rollback tenant đã tạo.
- Theo dõi tỷ lệ hoàn thành đăng ký, lỗi cấp phát, thời gian cấp phát và bước
  khách thường dừng. Cảnh báo chỉ chứa mã định danh phục vụ xử lý lỗi.
- Chạy test trên local rồi staging, rollout cho tài khoản mới; giữ tenant đang
  hoạt động nguyên trạng. Khách cũ chỉ nhận checklist nếu có yêu cầu phù hợp.
- Backup trước migration production; migration ưu tiên bổ sung tương thích.
  Nếu lỗi frontend, tắt luồng mới/quay image trước; không xóa tenant để rollback.

**Đạt khi:** bộ kiểm thử bên dưới đạt, hỗ trợ truy ra lỗi theo mã, đăng ký qua
domain thật hoạt động, có người chịu trách nhiệm giám sát sau phát hành.

## 5. Kiểm thử bắt buộc

| Nhóm | Tình huống và kết quả mong đợi |
|---|---|
| Happy path | Đăng ký → email → tạo hotel → phòng → nhân viên → nghiệp vụ thật; E2E desktop và viewport mobile |
| Email | Chưa xác thực, link hết hạn, link gửi lại, email trùng; không tạo môi trường trùng |
| Khôi phục | Reload, đóng tab, mất phản hồi sau commit, đăng nhập máy khác; tiếp tục đúng trạng thái |
| Đồng thời | Nhiều tab cùng user, nhiều user khác nhau, hai lô tranh quota; không trùng/không vượt hạn mức |
| Cách ly | Hai tenant và hai hotel trong một tenant; chặn đọc/ghi/phòng/file/realtime trái quyền |
| Vai trò | Owner, quản lý, nhân viên, lời mời; không nâng quyền hoặc tạo tenant ngoài luồng |
| Dữ liệu | Phòng trùng, giá sai, thiếu loại phòng, import lỗi, retry/nâng mẫu; giữ dữ liệu đã chỉnh |
| Gói | Trial lần đầu, hết hạn, quota, module chưa mua; server từ chối đúng và UI chỉ cách xử lý |
| Lỗi phụ trợ | Email/storage/notification lỗi; trạng thái chính đúng, có retry và truy vết |
| Hồi quy | Khách cũ, dashboard, tạo phòng/nhân viên hiện tại, booking/check-in/check-out không hỏng |

Các test 28 kiểm tra provisioning và test component đã có là nền để mở rộng;
chưa chạy lại trong lần lập kế hoạch này và không coi là E2E toàn bộ sản phẩm.
Đo p95 cấp phát trên staging với tải thử xác định; mục tiêu ban đầu ≤5 giây
cho transaction dữ liệu nền, không tính thời gian gửi/xác thực email.

## 6. Điều kiện và giới hạn phát hành

- Ước lượng 10–17 ngày trước đây chỉ dành cho phạm vi một cụm cố định. Phạm vi
  mới gồm directory, routing đa cụm và wizard: xem tổng 26–42 ngày làm việc ở
  shared-domain-multi-cluster-plan.md; không cộng hai ước lượng với nhau.
- Lần trước SSH VPS và quyền Supabase production còn thiếu. Phải kiểm tra lại
  trước phát hành; không suy đoán đã được cấp hay vẫn bị chặn ở ngày lập plan.
- Cần staging riêng, SMTP hoạt động và tài khoản kiểm thử đã định danh; không
  dùng production để chạy kiểm thử phá hủy hoặc tạo dữ liệu hàng loạt.
- Backup ngoài máy chủ, restore và kiểm chứng nhiều cụm theo kế hoạch kiến trúc
  mới. Không hiển thị “đã sao lưu” hoặc “môi trường sẵn sàng” nếu chưa kiểm chứng.
- App desktop/mobile sau này dùng lại API/trạng thái thiết lập này; không nhân
  bản nghiệp vụ cấp phát cho từng nền tảng.

Thứ tự đề nghị: đợt 1 → đợt 2 → đợt 3 → đợt 4. Mỗi đợt bàn giao mã, migration,
kết quả kiểm thử và giới hạn còn lại; chỉ phát hành khi tiêu chí tương ứng đạt.
