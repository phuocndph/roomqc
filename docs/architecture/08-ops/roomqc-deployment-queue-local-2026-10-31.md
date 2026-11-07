# Hàng đợi triển khai từ trang quản trị

Trang **Hạ tầng → Triển khai** đã gửi được yêu cầu triển khai một bản cài do
người vận hành chuẩn bị. API chỉ nhận mã bản cài và dấu kiểm toàn bộ cấu hình;
không nhận IP, SSH, Compose, đường dẫn hay mật khẩu từ trình duyệt.

## Vận hành

1. Chuẩn bị inventory, Compose ghim image digest, khóa SSH và `known_hosts`
   riêng trên máy vận hành. Chỉ dùng local/staging. Đóng nhận khách ở cụm đích.
2. Cấp tài khoản database riêng thuộc `roomqc_control_deployer`, tối đa một
   kết nối cho mỗi executor; lưu DSN ở tệp riêng có quyền chỉ chủ sở hữu đọc.
   Tài khoản API giữ `roomqc_control_api`; không cấp nhóm deployer cho API.
   Với TLS, DSN yêu cầu `sslmode=verify-full`. Không đưa DSN/khóa vào chat,
   Compose inline hoặc frontend. Cấp LOGIN thật và điều chỉnh ngân sách kết
   nối production vẫn do bước quản trị triển khai thực hiện.
3. Đặt biến `ROOMQC_DEPLOY_DATABASE_URL_FILE` trỏ đến tệp DSN riêng. Chuẩn bị
   bản cài bằng lệnh sau (mọi đường dẫn phải tuyệt đối):

   ```text
   npm run vps:executor -- prepare --spec-directory ABSOLUTE_PRIVATE_SPEC_DIR \
     --inventory-file ABSOLUTE_PRIVATE_INVENTORY --cluster-id CLUSTER_ID \
     --release-id RELEASE_ID --image IMAGE@sha256:DIGEST \
     --compose-file ABSOLUTE_COMPOSE --mode execute \
     --host APPROVED_PUBLIC_IP --user SSH_USER --identity-file ABSOLUTE_KEY
   ```

   Đây là bước chuẩn bị: kiểm cấu hình/Compose và inventory/preflight đã ghi,
   chưa sửa VPS. Một specification mới bất biến có hiệu lực 23 giờ được lưu
   trong directory. Tệp cấu hình riêng được ghi trước khi công bố specification;
   tệp không được sửa hoặc tái sử dụng cho nội dung khác. Muốn đổi nội dung phải
   chuẩn bị specification mới.
4. Mở **Hạ tầng → Triển khai**, chọn đúng cụm/bản cài, nhập lý do và bấm
   **Đưa triển khai vào hàng đợi**. Lệnh được xác nhận bằng quyền quản trị
   hiện hành, phiên bản cụm và cơ chế chấp nhận lệnh hiện có. Mất phản hồi:
   dùng **Kiểm tra kết quả nhận lệnh**, giữ nguyên mã yêu cầu. Chỉ gửi lại
   cùng yêu cầu sau khi tra kết quả chưa thấy; không tạo mã mới.
5. Chạy executor riêng, không chạy trong tiến trình API:

   ```text
   npm run vps:executor -- run --spec-directory ABSOLUTE_PRIVATE_SPEC_DIR
   ```

   Thêm `--once` để xử lý tối đa một công việc rồi thoát. Executor kiểm lại
   dấu kiểm của toàn bộ cấu hình, địa chỉ đã duyệt, Compose và preflight SSH
   mới trước khi thay đổi máy. Không có Docker socket trên executor.
6. Theo dõi hàng đợi và lịch sử trên cùng màn hình. **Đã nhận lệnh** chỉ xác
   nhận xếp hàng. **Đã hoàn tất** cần biên nhận triển khai thành công hoặc đối
   soát xác nhận bản cài mới khỏe. Giao diện tải lại mỗi 10 giây khi trang đầu
   có công việc chờ/đang chạy; danh sách và bản cài đều có phân trang.

## Bộ cài executor

`deploy/executor/Dockerfile` đóng gói Node, Docker Compose và SSH, chạy UID1000.
`deploy/executor/compose.yml` chạy container riêng, tệp chỉ đọc, bỏ capabilities,
giới hạn CPU/RAM và không mở cổng. Chỉ gắn thư mục cấu hình riêng cùng tệp
`known_hosts`; không gắn Docker socket, không chia sẻ khóa cho API. Build image,
đẩy registry rồi ghim digest trước khi dùng mẫu Compose trên staging.

Đường dẫn trong specification là đường dẫn **bên trong executor**. Chuẩn bị và
chạy bằng cùng cấu trúc mount; tệp private cần do UID1000 sở hữu và có quyền
0600. Inventory/Compose/khóa/CA phải nằm trong thư mục operator được gắn vào
container. Chưa tự cấp máy, mở firewall, cấu hình DNS/TLS hoặc kết nối Contabo.

## Quy tắc khi bị ngắt

- Claim công việc và tạo journal run diễn ra trong cùng giao dịch database.
  Hai worker không thể bắt đầu hai lượt cho cùng công việc/cụm.
- Không có cơ chế đưa công việc đã bắt đầu về `queued`. Lease hết hạn chuyển
  thành **Cần đối soát**, giữ run gốc và chặn triển khai mới trên cụm.
- Worker còn sống kiểm/đổi lease trước từng bước và gia hạn trong khi chờ SSH.
  Khi không giữ được lease, không bắt đầu bước mới. Adapter/reconciliation
  giữ hàng rào riêng ở VPS để ngăn tiến trình cũ chạy sau đối soát.
- Chạy `vps:reconcile` với run gốc theo runbook đối soát. Sau khi biên nhận đã
  lưu, executor đồng bộ kết quả vào job; không chạy lại Docker để đoán kết quả.
- Cụm vẫn đóng nhận khách sau triển khai. Chỉ mở lại bằng thao tác riêng sau
  kiểm tra sức khỏe, backup và khả năng phục vụ. Có job chưa giải quyết thì
  lệnh mở nhận khách bị chặn.

## Phạm vi bằng chứng

Bài kiểm DB/HTTP thật xác minh gửi trùng, quyền bị từ chối, claim cạnh tranh,
lease hết hạn, đối soát, bản cài bị sửa và giới hạn quyền. Bài kiểm giao diện
đi qua client/journal để gửi lệnh và khôi phục mất phản hồi bằng mã gốc.

Drill Docker riêng đi từ HTTP nhận lệnh, specification riêng, executor, adapter
Linux/Docker thật đến container nginx khỏe và biên nhận `deployed/succeeded`.
Preflight/SSH transport được thay bằng transport local trong drill; đây chưa
phải nghiệm thu SSH thật, toàn stack RoomQC, đăng ký khách hoặc production.
Container/network/volume của drill được dọn bằng nhãn sở hữu riêng và đối chiếu
sau dọn. Không thay đổi dữ liệu kinh doanh hoặc VPS dùng chung.

Production execute vẫn bị chặn. Còn cần nghiệm thu SSH/full stack, nối đầy đủ
gate backup/schema/admission, cấp LOGIN theo ngân sách, kiểm phục hồi ngoài máy,
signup thật, tải và pilot trước khi phục vụ khách thực tế.

## Kết quả cuối đợt

- Node tập trung26/26; DB/HTTP liên quan14/14; UI/client108/108; kiểm đường dẫn native cập nhật30/30.
- Hồi quy control948bài:706đạt,0lỗi,242bỏqua do cần môi trường riêng. TypeScript/ESLint đạt.
- Docker drill HTTP→spec→executor→container khỏe/receipt đạt; kiểm nhãn sau dọn không còn container/network/volume thử.
- Đã áp migration0024 vào directory local; API đọc job được, không cập nhật job hoặc tạo specification được. Hiện0spec/0job/0run trong runtime phục vụ.
- Đã cập nhật web local, container khỏe, các container khác không đổi. Browser bằng phiên Super Admin tải đúng hàng đợi và trạng thái trống; chưa gửi lệnh SSH từ runtime phục vụ.
- [Biên nhận cuối đợt](../../../artifacts/roomqc-deployment-queue-local-2026-10-31.json).

## Restore rehearsal hiện hành

`test-roomqc-backup-restore-isolated.mjs` kiểm tra snapshot logic nhất quán,
checksum bốn tệp, restore một transaction và đối chiếu inventory ứng dụng.
Schema GraphQL và ACL của nó được áp lại sau `pg_restore`. `pgmq` là extension
vendor-managed: bảng/sequence/default ACL do image đích tự tạo không dùng làm
mốc lệch schema, còn nội dung queue dùng tệp `pgmq-queues.sql` riêng. Không
được xem rehearsal này là backup offsite hoặc nghiệm thu VPS thật.

## Cập nhật 31/10/2026 — worker triển khai và local control đã chạy bản mới

Đã cấp riêng LOGIN cho executor theo từng replica, giới hạn đúng một kết nối,
kiểm tra marker/database/TLS/budget/permissions ngay lúc khởi động và chặn tài
khoản API hoặc quyền ACL dư. Migration `0026-deployment-function-privileges.sql`
đã áp dụng trên control local; livez/readyz/healthz đều 200, signup vẫn đóng.
Bản executor/control đã build theo digest local, SSH drill thật trên target cô
lập đạt và toàn bộ control regression hiện hành đạt 965 bài, 0 lỗi.

Biên nhận: `artifacts/roomqc-managed-vps-executor-local-2026-10-31.json`.
Đây chưa phải triển khai VPS thật: preflight máy Contabo còn thiếu headroom nên
không cài, không build và không thay đổi máy dùng chung.
