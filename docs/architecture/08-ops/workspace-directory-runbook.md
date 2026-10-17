# Directory doanh nghiệp: trạng thái và runbook

Ngày 2026-10-15. Phạm vi: nền shared-domain-multi-cluster và thiết lập phòng ban đầu.
Chưa có thay đổi production, chưa commit/push trong đợt triển khai này.

## Đã triển khai

- `/start` chọn doanh nghiệp hoặc đăng ký địa chỉ `/app/<slug>/`.
- Bootstrap cùng origin trả cụm được cấu hình trước; App và Supabase singleton
  chỉ import sau khi kiểm tra cấu hình. Frontend từ chối cụm ngoài allowlist.
- Directory Node + PostgreSQL riêng, Docker riêng. Registry cụm, sức chứa,
  khóa phân bổ ngắn, slug/email duy nhất, không giữ transaction lúc gọi cụm.
- Chỉ email đã xác thực và khớp đăng ký mới cấp phát được; tenant/hotel/owner,
  trial và receipt tạo trong cùng transaction tại cụm.
- Mất phản hồi sau commit: bootstrap đọc receipt và khôi phục mapping.
  Gửi lại không tạo tenant mới, không ghi đè dữ liệu hotel đã tạo.
- Session/preference theo workspace; lựa chọn khách sạn theo user. Checklist
  phòng/kho/nhân viên theo hotel, lỗi đọc có nút thử lại, mục tùy chọn ghi rõ.
- Callback, đổi mật khẩu, QR thanh toán/giấy tờ và các liên kết đã rà soát giữ
  tiền tố doanh nghiệp. API/Storage từ cụm không vào cache ảnh dùng chung của SW.
- Khóa service chỉ ở server; browser chỉ nhận publishable/anon key.
- Flag frontend mặc định tắt; đăng ký directory phía server cũng mặc định đóng.
  Không tự đổi kết nối hoặc chuyển tenant cũ sang cụm mới.
- Wizard `/setup/rooms`: lưu bản nháp theo hotel, phiên bản chống ghi đè,
  sinh phòng theo tầng và xác nhận bảng giá trước khi tạo thật. Phòng, bảng giá,
  usage và dấu hoàn tất commit cùng transaction; retry không tạo lại phòng.
- Chỉ owner đang hoạt động, email đã xác thực, đúng tenant/hotel được dùng RPC.
  Private draft không có quyền đọc/ghi trực tiếp cho anon/authenticated.
- Quota room ở trigger dùng số phòng thật sau khóa tenant; áp dụng cả REST,
  form/import và wizard. Giới hạn theo số mua và plan; trial có registered_rooms=0
  dùng hạn mức plan. Form cũ đã chờ kiểm tra quota, lỗi đọc không tự cho qua.
- Bỏ handler chết tạo tenant bằng thông tin giả ở CategoriesPage; thêm nhân viên
  từ wizard/checklist dẫn đúng `/settings/users`.
- Directory v2: giữ chỗ mới chưa dùng có hạn (mặc định 24 giờ); retry không gia
  hạn. Trước khi gọi cụm, chủ sở hữu đã xác thực được gắn bền vững và trạng thái
  chuyển sang provisioning. Từ lúc đó, không tự thu hồi theo thời gian.
- Hết hạn chỉ đổi trạng thái, giữ UUID cũ và audit. Địa chỉ/email được đăng ký
  lại bằng UUID mới; yêu cầu cũ không thể kích hoạt lại UUID hết hạn. Reservation
  cũ chưa có expires_at giữ nguyên vì có thể đã có commit ở cụm.
- Hạn mức đăng ký mới dùng chung PostgreSQL: mặc định 100/giờ toàn hệ thống và
  3/ngày/email, gồm cả đăng ký đã hết hạn. Khóa phân bổ bảo vệ khi chạy nhiều
  tiến trình; retry đăng ký đang tồn tại không bị chặn bởi hai hạn mức này.

## Kiểm thử đã thực hiện

- Vitest toàn bộ sau bổ sung: 282 đạt, 16 integration test bỏ qua vì không
  được kích hoạt trong lần chạy mặc định. Không cộng các lần chạy trùng nhau.
- 4 test Node: cấu hình, slug, gateway chọn cụm, HTTP boundary và đóng đăng ký.
- 42 kiểm tra tích hợp thật: HTTP → PostgreSQL directory tạm → Supabase local
  Auth/RPC/RLS. Gồm đồng thời, sai chủ, email chưa xác thực, chặn đăng ký trực
  tiếp khi cutover, rollback, mất xác nhận, khôi phục và trial; thêm hết hạn,
  tranh địa chỉ thu hồi, yêu cầu cũ, bảo vệ legacy, migrate lặp với lịch sử email,
  hạn mức bền vững và hai kết nối service tranh suất đăng ký cuối.
- Hai registry A/B dùng để kiểm tra phân bổ sức chứa; **không phải hai backend
  thật**, chưa chứng minh Auth/Storage/Realtime xuyên nhiều cụm.
- TypeScript đạt; lint các file của wizard/quota/CategoriesPage không lỗi chặn.
  Lượt lint toàn repo mới nhất: 0 lỗi, 1.538 warning hiện có. Lỗi native được thấy
  ở lượt trước đã hết trong mã đang được bổ sung đồng thời. Số test tổng bao gồm
  các test native đó; không coi chúng là kiểm chứng app mobile trên thiết bị thật.
- Security advisors local không phát hiện vấn đề. Production build đạt;
  vendor chunk khoảng 14 MB chưa nén / 4,7 MB gzip là nợ hiệu năng hiện có.
- Migration `20261015022602_workspace_directory_provisioning.sql` đã áp dụng
  và ghi vào migration history **local** sau khi test. Không reset database.
- Migration `20261015133049_hotel_setup_rooms.sql` cũng đã áp dụng **local**;
  gồm private draft, RPC và room quota triggers. Không chạy trên production.
- 36 kiểm tra Auth/RPC/RLS local cho thiết lập phòng: phân quyền/cách ly, dữ liệu
  sai, đồng thời lưu nháp, khôi phục phiên mới, yêu cầu xác nhận giá, retry 6 lần,
  quota/readonly/hết hạn, rollback cả giá, giá qua booking resolver, usage,
  REST tranh quota, khách sạn thứ hai và retry sau hết hạn. Test tự dọn fixture.
- Browser E2E local riêng cổng 18083: đăng nhập owner tạm → sinh phòng 101/102 →
  nhập 450.000/120.000/6.000.000 → lưu → reload giữ bản nháp → xác nhận →
  sơ đồ phòng hiển thị đủ 2 phòng trống với giá đêm 450.000. Không dùng tài khoản
  hay dữ liệu khách hàng thật. Chưa test email hoặc hai backend thật bằng browser.
- Kiểm tra giao diện kết quả trên viewport điện thoại 390×844: các liên kết
  danh sách phòng/nhân viên hiển thị đủ; chưa chạy lại toàn bộ bước nhập trên mobile.
  Fixture browser đã dọn đúng tenant/user vừa tạo, tab và dev server kiểm thử đã đóng.
- Dữ liệu test được định danh riêng và đã dọn; cờ cutover local khôi phục lại.
- Image control đã build; image frontend bật directory đã build và smoke-test
  tại cổng local tạm 18082 (deep link, header/cache, API chưa nối trả JSON 503).
  Đây là smoke test HTTP/container, không phải browser E2E.
- Image frontend có wizard đã build lại, verify:build và HTTP/container smoke
  cổng 18082 đạt. Các container phục vụ người dùng trên 8080/8081/8082 không đổi.
- Sau bổ sung lifecycle, production build/verify:build đạt; image control build
  đạt và cả 4 Node test cũng đạt trong chính image Node 22. Không chạy lại frontend
  container smoke vì Docker/Nginx không đổi trong đợt lifecycle.
- Browser local với directory PostgreSQL tạm: tạo intent → trang đăng ký có hạn
  cụ thể → mô phỏng hết hạn → bootstrap báo 410 và có liên kết đăng ký lại → cùng
  slug/email có thể tạo intent mới. Chưa tạo Auth account/tenant trong test UI này.
  Database/container fixture, helper tạm và tab đã dọn sau kiểm thử; ảnh minh họa
  giữ ở artifacts.local (Git/Docker bỏ qua). Không dùng backend directory đang
  phục vụ cổng 8090 cho test UI; fixture dùng cổng riêng 18090.

Chạy lại từ thư mục gốc repo (Node 22.16+ hoặc Node 24, Docker, Supabase local):

```sh
npm ci
npm ci --prefix server/control
npm test -- --run
npm run test:control
npm run test:control:local
npm run test:room-setup:local
npx tsc --noEmit
npm run lint
npm run build
npm run verify:build
npx supabase db advisors --local --type security --level warn --fail-on error
```

`control:expire` là lệnh bảo trì database directory đã cấu hình; không phải test.
Chỉ dùng sau bước nâng cấp v2 bên dưới. Không cần scheduler để giải phóng suất:
mỗi yêu cầu đăng ký mới cũng dọn reservation chưa dùng đã hết hạn trong transaction.

Test local từ chối backend không phải loopback, tạo PostgreSQL Docker tạm và
áp dụng migration vào Supabase local hiện tại. Nó tạm bật directory_required
trong thời gian test rồi khôi phục, nên chạy trên môi trường phát triển chuyên
dùng, không chạy song song đăng ký thủ công. Không dùng script này cho production.

## Điều kiện trước staging

1. Có database PostgreSQL directory riêng, TLS xác minh chứng chỉ. Backup
   tự động ngoài VPS; restore vào DB thử và kiểm tra mapping trước rollout.
2. Tạo `.env.control` từ `.env.control.example` trên server, quyền file 600.
   URL phải là origin API chính xác; giữ HMAC key ổn định và sao lưu bằng kho
   secret. Không gửi nội dung file/secret vào chat, Git hoặc biến `VITE_*`.
3. Dùng tài khoản migration riêng để tạo schema/registry; tài khoản runtime
   chỉ cần USAGE schema, SELECT clusters, SELECT/INSERT/UPDATE workspaces,
   SELECT/INSERT attempts và quyền sequence của attempts. Với công cụ hỗ trợ,
   thêm SELECT/INSERT support_actions và UPDATE các cột outcome, after_state,
   error_code, finished_at; không cấp UPDATE actor/reason/before_state hay DELETE.
   Không cấp DDL/superuser
   cho runtime. `control:migrate` chỉ chạy bằng tài khoản migration.
4. Áp dụng migration mới lên **staging đúng cluster** bằng quy trình migration
   hiện có, kiểm tra lịch sử trước/sau. Không dùng `db reset`, không đánh dấu
   migration đã áp dụng nếu chưa chạy SQL.
5. Supabase Auth: Site URL domain staging; allowlist redirect có đường scoped
   `/app/<slug>/auth/callback` và `/app/<slug>/auth/change-password` cho slug
   pilot. Kiểm chứng email và Google OAuth thực tế; wildcard chỉ dùng đúng
   cú pháp Supabase, không suy đoán `*` khớp nhiều đoạn đường dẫn.
6. Mỗi cụm phải có cùng phiên bản schema/Functions và SMTP, Storage policies,
   Realtime; cùng cặp VAPID nền tảng cho browser cùng origin. Khóa private VAPID
   vẫn chỉ ở server. Chưa có cross-cluster SSO.

## Khởi động pilot có kiểm soát

Các lệnh dưới đây là runbook, chưa được thực hiện trên VPS:

```sh
docker compose -f docker-compose.control.yml build
docker compose -f docker-compose.control.yml run --rm roomqc-control node server.mjs --migrate
docker compose -f docker-compose.control.yml up -d roomqc-control
curl --fail http://127.0.0.1:8091/api/control/healthz
```

Lệnh `--migrate` dùng credential migration; đổi env sang runtime ít quyền
trước khi `up`. Compose đọc `.env.control`, không nhúng file này vào image.
Mặc định mới là 8091, không dùng cổng 8090 của CRM trên máy phát triển.
Chỉ expose 8091 loopback. Nginx VPS chuyển `/api/control/` tới 8091, giữ nguyên
path, tắt cache. Mẫu ở `docker/nginx-vps.conf.example`; kiểm tra `nginx -t`
trước reload. Nếu chưa cấu hình proxy, frontend trả 503 JSON, không trả HTML.
Nếu dùng ROOMQC_CONTROL_HOST_PORT khác trong Compose, phải sửa upstream của
Nginx tương ứng. Cổng trong container luôn là 8091; Vite dùng 8091 hoặc biến
server-only ROOMQC_CONTROL_PROXY_TARGET. Không đưa giá trị này vào biến VITE_*.

Cho pilot, đặt `ROOMQC_CONTROL_SIGNUP_ENABLED=true` ở server, hạn chế người
truy cập ngoài bằng gateway. Frontend đặt `VITE_ROOMQC_DIRECTORY_ENABLED=true`
và `VITE_ROOMQC_CLUSTER_ORIGINS` là danh sách origin HTTPS **chính xác** khớp
registry; build lại image bằng `.env.vps`. Biến Vite là build-time, sửa env rồi
chỉ restart container không thay đổi bundle/CSP.

```sh
docker compose --env-file .env.vps -f docker-compose.roomqc.yml up -d --build roomqc
```

Sau khi pilot xác minh route + callback thành công, trên cụm dùng directory:

```sql
UPDATE private.roomqc_cluster_config
SET directory_required = true WHERE singleton;
```

Không bật cờ này trên cluster legacy trước khi có lộ trình cho khách cũ.
Kiểm thử lại tài khoản mới và nhân viên hiện có; kiểm tra signup cũ bị từ chối.
Chạy lại cùng yêu cầu cấp phát và xác nhận cùng tenant/hotel, trial không gia hạn.

## Chặn mở đăng ký công khai trước khi xử lý

- Đã có hạn giữ chỗ và hạn mức bền vững; chưa có bot challenge/limiter theo người
  dùng ở edge. Hạn mức toàn cục chỉ giới hạn thiệt hại, không nhận diện người dùng
  thật và có thể bị kẻ xấu làm cạn. Giữ signup đóng ngoài pilot cho đến khi có lớp này.
- Provisioning lỗi/mất phản hồi và reservation legacy không tự hết hạn. Cần giao
  diện hỗ trợ và quy trình kiểm tra receipt tại cụm trước khi quyết định xử lý;
  không gán expired/xóa thủ công chỉ theo tuổi bản ghi.
- Limiter server hiện là lớp cơ bản theo socket IP, không phải limiter phân tán.
  Sau reverse proxy nhiều khách dùng chung IP; phải có policy ở edge và thiết kế
  định danh proxy tin cậy trước khi tăng tải hoặc mở public signup.
- Email đăng ký hiện duy nhất trong directory; một email chỉ tạo một doanh
  nghiệp ở v1. Thêm hotel trong tenant, không đăng ký lại nhiều workspace.
- Chưa có import tenant cũ vào directory, đổi slug/alias, UI quản trị cụm,
  tự chuyển cụm, email-based workspace discovery hoặc tài khoản xuyên cụm.
- Wizard phòng hiện chỉ cho khách sạn trống, tối đa 200 phòng/lần. Schema cũ có
  unique tenant + mã loại phòng; wizard chặn thay đổi giá/loại thuộc hoặc đang dùng
  ở hotel khác. Cần thiết kế loại phòng theo hotel trước khi hứa cấu hình giá
  độc lập cho nhiều khách sạn. Chưa có chia lô wizard lớn hoặc loại tùy biến.
- Mẫu nghiệp vụ có phiên bản, quota tài nguyên khác, tiến độ mời nhân viên và
  UI quản trị vẫn là các đợt tiếp theo; checklist không thay thế chúng.
- Push/email sinh từ server hoặc job còn cần ánh xạ tenant → workspace ở cụm;
  sửa link phía trình duyệt chưa chứng minh toàn bộ notification/email hoạt động.
- Chưa chạy browser E2E đầy đủ email → onboarding → phòng → mời nhân viên,
  mobile, hai backend thật và tải dự kiến. Không kết luận hỗ trợ 100.000 đồng thời.

## Vận hành và khôi phục

Kiểm chứng xuyên suốt local: `npm run test:customer-journey:local` (dịch vụ thật,
không phải browser E2E). Chỉ chạy khi Auth/Edge email dùng Mailpit; suite tự kiểm
tra cấu hình và dọn fixture. Nếu preflight Storage báo 42P10, xem
[báo cáo/sửa tương thích Storage local](customer-journey-local-validation-2026-10-17.md).
Không sửa metadata hoặc chạy lại migration vendor; không dùng helper local
trên VPS có dữ liệu.

### Nâng cấp directory v2 (chưa chạy trên VPS)

1. Backup database directory; đóng signup ở gateway và dừng toàn bộ process/control
   cũ, đợi request cũ kết thúc. Không chạy lẫn binary cũ/mới: binary cũ không có
   bước gắn owner/provisioning trước gọi cụm nên không an toàn với thu hồi v2.
2. Chạy `control:migrate` bằng credential migration. Đây là schema của **database
   directory riêng**, không phải migration Supabase. Có ALTER/index bổ sung;
   không xóa tenant hoặc account. Kiểm tra index `workspaces_live_slug_idx`,
   `workspaces_live_email_idx` và cột expires_at. Row cũ phải giữ NULL.
3. Khởi động chỉ image control mới, dùng runtime credential hiện có; không cần
   thêm quyền DDL cho runtime. Smoke bootstrap/provision/retry trước khi mở pilot.
4. Cấu hình server: ROOMQC_CONTROL_RESERVATION_MINUTES=1440 (15–10080),
   ROOMQC_CONTROL_SIGNUP_HOUR_LIMIT=100 (1–10000), ROOMQC_CONTROL_EMAIL_DAY_LIMIT=3
   (1–20). Không sửa HMAC key để né hạn mức. Frontend thông báo thời hạn từ server;
   đồng hồ/giao diện không quyết định quyền cấp phát.
5. `npm run control:expire` hoặc trong image `node server.mjs --expire-reservations`
   chỉ đánh dấu reserved quá hạn chưa có owner/tenant và có audit. Không gọi cụm
   hoặc xóa Auth account. Chạy một lần hoặc bằng scheduler vận hành nếu muốn.

Không rollback control về binary v1 sau schema v2: truy vấn v1 không lọc lịch sử
expired và có thể chọn sai bản ghi. Nếu lỗi, đóng signup và sửa tiến; giữ nguyên
receipt/mapping. Rollback frontend là việc riêng và không thay đổi quy tắc này.

- Đóng đăng ký mới: `ROOMQC_CONTROL_SIGNUP_ENABLED=false`, tạo lại container
  control. Workspace đã active vẫn bootstrap/đăng nhập được; không xóa mapping.
- Directory lỗi: kiểm tra DB/TLS/kết nối, healthz và log theo request ID.
  Không tạo lại doanh nghiệp; sau phục hồi, bootstrap đối chiếu receipt.
- Cluster lỗi: đánh dấu offline để trả lỗi rõ; **không** trỏ slug sang DB trống.
  Đánh dấu draining chỉ dừng nhận khách mới, khách đang dùng vẫn kết nối cụm đó.
- Backup riêng DB directory và từng cụm (DB + file Storage). Kiểm tra receipt,
  owner/tenant/hotel và routing_version sau restore; không chỉ backup VPS frontend.
- Rollback frontend: dùng image trước, đóng signup; giữ metadata, receipts và
  dữ liệu tenant. Không tắt directory_required bừa bãi vì sẽ mở lại đăng ký bypass.
- Theo dõi 5xx, latency bootstrap/provision, số reservation, dung lượng cụm,
  retry và lệch receipt; dashboard/cảnh báo tự động chưa được cấu hình ở production.
