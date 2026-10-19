# RoomQC — E2E, khôi phục backup và sửa công cụ thử nghiệm

Ngày chốt: 19/10/2026, Asia/Bangkok. Phạm vi: kiểm chứng các workflow quản trị
vừa sửa và làm an toàn bộ công cụ thử riêng. Không thay đổi runtime ứng dụng,
không áp migration, bật lịch lifecycle, gửi email hoặc triển khai VPS.

## Kết quả review và sửa lỗi

1. **Không ghi đè lượt thử đang tồn tại.** `--keep-sandbox` giữ chỗ trước khi
   tạo tài nguyên bằng file độc quyền. Backup/setup/cleanup dùng chung khóa
   thao tác; cập nhật trạng thái qua file tạm và rename. Trạng thái vẫn được
   giữ nếu Docker ngừng hoạt động, và khóa của tiến trình đã kết thúc có thể
   được phục hồi. Kiểm tra thực tế: lượt mới bị chặn, file lượt cũ không đổi.
2. **Tiếp tục setup sau khi bị ngắt.** Lưu workspace ID trước RPC, tra lại user
   bằng email demo và dùng receipt cấp phát có sẵn. Khôi phục cấu hình dịch vụ
   từ khóa riêng của sandbox, dùng ID ổn định và transaction cho dữ liệu mẫu.
   Chạy lại setup kiểm tra toàn bộ các bước còn thiếu; `--resume-build` vẫn được
   chấp nhận nhưng không bỏ qua bước dữ liệu. Build lấy đúng source của script
   và dùng VAPID public key riêng, không đọc `.env` thật.
3. **Cleanup chạy lại an toàn.** Chấp nhận container hoặc network đã mất;
   kiểm tra tên/nhãn sở hữu và các kết nối network trước khi xóa. Docker mất
   kết nối hoặc tài nguyên sai nhãn sẽ giữ trạng thái để xử lý tiếp. Chỉ xóa
   file khóa/cấu hình tạm của sandbox, giữ nguyên backup trên máy.

Các file chính: `scripts/test-roomqc-backup-restore-isolated.mjs`,
`scripts/setup-roomqc-browser-sandbox.mjs`,
`scripts/cleanup-roomqc-browser-sandbox.mjs`,
`scripts/roomqc-sandbox-state.mjs`, `scripts/roomqc-sandbox-fixtures.mjs`.

## Bằng chứng kiểm thử ngày 19/10

| Kiểm tra | Kết quả |
|---|---|
| Node regression cho quyền sở hữu/khóa/retry/cleanup/provision | 12/12 đạt |
| Cú pháp, ESLint các script và diff whitespace | Đạt |
| Backup mới và restore trên PostgreSQL mới, network none, cron tắt | Đạt |
| Đối chiếu dữ liệu 203 bảng và cờ RLS/owner | Khớp snapshot |
| Policy, constraint và function definition/owner/ACL | 385 / 903 / 460 khớp |
| SHA256 dump, roles, bổ sung PGMQ và inventory | 4 file đạt trước restore |
| Chặn backup mới khi còn lượt thử | Đạt, trạng thái cũ giữ nguyên |
| Setup lại sau mô phỏng mất checkpoint của owner đã cấp phát | Đạt, không trùng |
| Database sau các lần setup | 36 tenant, 2 user demo, 2 receipt cấp phát, 1 hóa đơn và 1 payment demo |
| Frontend sandbox, Auth thật và RPC directory | HTTP 200; admin thấy 36 tenant/25 dòng trang đầu |
| Owner gọi directory của quản trị | Bị từ chối 42501 |
| Xóa tài nguyên thử trước, chạy cleanup khi network đã mất, chạy lại lần nữa | Đạt; file tạm được dọn |
| Đối chiếu các bảng nghiệp vụ chính với baseline | Khớp; không ghi test vào DB chính |

Regression command: `node --test scripts/roomqc-sandbox-state.test.mjs`.
Mô phỏng mất checkpoint trong kiểm tra DB thật: bỏ userId/tenantId owner khỏi
trạng thái tạm sau commit, giữ workspace ID, rồi chạy setup tiếp. Kiểm tra Node
cũng mô phỏng riêng mất phản hồi sau create-user, provision và gán admin.

Lượt restore mới: `f964aae92a99`, thời điểm snapshot
`2026-10-19T01:35:55.354Z`; restore và đối chiếu mất khoảng 4,3 giây trên máy
local hiện tại. Đây không phải RTO cam kết cho production.
Backup giữ tại `backups/roomqc-restore-f964aae92a99.local/` ở thư mục cha chung
của các checkout, gồm dump, roles, PGMQ SQL, inventory, checksums và result.
SHA256 dump: `a6dd9bfd16f0fd6f1b685cf738b742f47c311017a741b4fbf4e642953c93ab38`.

Đã dọn hai lượt thử `a181bda60719`, `f964aae92a99` và file tạm còn sót từ
`3597495d9dd6`. Giữ nguyên tất cả backup trên máy. Container/image ứng dụng
chính vẫn `roomqc-local:review-fixes-20261018`, image ID
`sha256:cac1a629507d67000c60d2eeb809fed2245dce3a3c1becd388bffcf1722a8d2b`.
Docker đã được khởi động lại; RoomQC 127.0.0.1:8082 healthy.

## Bằng chứng browser E2E ngày 18/10, được tổng hợp trong đợt này

Chạy trên bản sao đầy đủ của DB với Auth/PostgREST thật tại cổng 18082/18921.
Không dùng phiên đăng nhập hoặc ghi dữ liệu vào RoomQC 8082.

- Directory phân trang 25/11 trên tổng 36; tìm kiếm từ trang 2 trở về trang 1,
  đổi bộ lọc xóa lựa chọn.
- Cố tình làm mất phản hồi HTTP 200 **sau commit** khi tạo hồ sơ đối soát.
  Sau F5, lệnh gốc được phục hồi; retry vẫn chỉ 1 event và 1 receipt ở version 1.
  Thêm ghi chú đạt version 2, tổng 2 event/2 receipt. Focus mở/đóng hồ sơ đúng.
- Làm mất phản hồi sau commit phục hồi job atomic hết deadline, F5 rồi retry:
  đúng 1 audit, run chuyển failed, không chạy lại lifecycle hoặc đổi tiền.
- Chặn API directory đến khi hết retry: ẩn dữ liệu cũ, khóa export và lựa chọn;
  bỏ chặn rồi Thử lại khôi phục đúng danh sách.

Đây là 7 nhóm kiểm tra thủ công, không phải tuyên bố đã test hết mọi module.
Ảnh bằng chứng demo ở source chính: `artifacts/roomqc-e2e-case-20261018.jpg`.
Không chạy lại toàn bộ browser E2E ngày 19/10; kiểm tra mới dùng HTTP/DB thật
và Node regression. 42 test ứng dụng liên quan đã đạt trong lần review trước
bản sửa công cụ; không cộng vào 12 test Node hoặc gọi đó là full suite mới.

## Cách dùng và giới hạn

Chạy từ worktree integration trên máy hiện tại, Docker đang hoạt động:

```powershell
node scripts/test-roomqc-backup-restore-isolated.mjs --keep-sandbox
node scripts/setup-roomqc-browser-sandbox.mjs
# Nếu bị ngắt: chạy lại setup; không tạo một backup --keep-sandbox mới.
node scripts/cleanup-roomqc-browser-sandbox.mjs
```

`--prepare-only` chuẩn bị DB/Auth/REST/dữ liệu mẫu mà không build frontend.
Backup không có `--keep-sandbox` tự dọn container thử sau kiểm tra.
Backup mới mặc định vào thư mục `backups` cạnh checkout; có thể chỉ định
`ROOMQC_BACKUP_ROOT` để chọn vị trí khác. Không phụ thuộc độ sâu của worktree.
Các cổng sandbox là 18082/18921, bind loopback; không dùng 8082 của ứng dụng.

Backup đã khắc phục việc pg_dump không lưu bảng hàng đợi động thuộc extension
PGMQ: xuất metadata, queue/archive COPY cùng snapshot và giá trị sequence,
tạo lại queue rồi khôi phục dữ liệu. Chỉ hỗ trợ queue durable, không partition.
Sequence là trạng thái không giao dịch, được lấy riêng khi đang giữ snapshot.

**Chưa phải nghiệm thu phục hồi thảm họa hoặc production.** Backup vẫn trên
cùng máy vật lý, chưa mã hóa/offsite; chưa kiểm tra khôi phục file Storage,
khóa server/Vault, mật khẩu role hoặc toàn bộ index/trigger/table ACL. Dump
role cố ý không chứa mật khẩu DB gốc. Database sandbox không ra Internet;
gateway/frontend dùng bridge để phục vụ loopback, không tuyên bố toàn stack
network none. Các đường provider không có trong gateway và trả 503.

Việc tiếp theo vẫn là chốt chính sách expiry còn thiếu, actual Edge worker trên
staging với scope fixture, backup/offsite + Storage/Vault và giám sát/thử tải.
Không bật scheduler/provider trước khi có cấu hình và nghiệm thu tương ứng.
