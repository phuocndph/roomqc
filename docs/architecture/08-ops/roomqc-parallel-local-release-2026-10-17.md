# RoomQC — bàn giao bản local sau tích hợp song song

Ngày: 17/10/2026, Asia/Bangkok. Phạm vi: RoomQC local 8082; không phải VPS,
production, nghiệm thu thu phí hoặc hoàn thành toàn bộ A0–A4.

## Kết quả triển khai

- Ba luồng A1/A2/A3 đã ghép vào nhánh codex/roomqc-parallel-integration.
  Mã ứng dụng được phát hành từ commit 9886e86.
- Container room-weave-pro-main-roomqc-1 chạy healthy, chỉ bind
  127.0.0.1:8082:80. URL: http://127.0.0.1:8082/auth/login.
- Image roomqc-local:parallel-9886e86, đồng thời được gắn tag
  room-weave-pro-main-roomqc:latest.
- Image ID: sha256:3a145fb8a65e447471d0116b2db433c84a8a60073387ea99b3c59b2fcbfdabd5.
- 32 file thay đổi so với baseline đã đồng bộ có kiểm tra vào working copy
  gốc, không gồm tài liệu điều phối có liên kết riêng. Sau đó bổ sung báo cáo
  bàn giao và cập nhật trạng thái kế hoạch.
- Repo gốc vẫn main HEAD 00eab56, index không đổi; không reset/stash, commit
  toàn bộ thay đổi người dùng, push remote hoặc sửa CRM.

## Tính năng trong lượt này

1. A1: kiểm tra lỗi chuyển trạng thái/owner/thông báo; không báo thành công
   khi bước quan trọng lỗi; tách kết quả staff; run ID trong request/log,
   phân biệt partial/unknown outcome. Không tự replay kết quả chưa rõ.
2. A2: tạo/xem/ghi chú hồ sơ kiểm tra phi tài chính, lịch sử bất biến,
   receipt chống trùng và version chống ghi đè. Server kiểm tra admin/phiên
   hiện hành trước cả replay. Không thay payment, invoice hay quyền gói.
3. A3: nhãn trial và lọc gói đúng dữ liệu, tìm email, xuất đúng kết quả lọc
   đã tải; lỗi/retry rõ ràng; menu mobile/tablet quản lý focus.
4. Hồ sơ mở ngay trong khung hiện tại, không nằm dưới 25 dòng hàng đợi.
   Đóng hồ sơ quay về hàng đợi giữ bộ lọc/trang và focus đúng nút mở.

## Migration local và an toàn dữ liệu

Migration 20261017145741_subscription_reconciliation_cases_foundation.sql đã
áp dụng lên Supabase local project ehjtoajnlnuvuiwkpmbp trong một transaction,
cùng bản ghi schema_migrations chứa đúng SQL đã review. Không reset DB.

- Fingerprint đầy đủ hàng tenant/tài chính không đổi sau DDL.
- Ba bảng private của hồ sơ bật RLS; DB lint không có schema error;
  security advisors không có issue tại lần kiểm tra này.
- Sau các thử nghiệm rollback và dọn fixture: không để lại case/event thử.
- Không còn DB kiểm thử tạm roomqc_a2_verify_*; không bật lịch subscription.
- Backup trước migration: /tmp/roomqc-before-a2-20261017.dump bên trong
  supabase_db_ehjtoajnlnuvuiwkpmbp. pg_restore --list đọc được.
  Đây là snapshot local trong container, chưa phải backup độc lập/restore
  acceptance; chứa fixture tại thời điểm chụp, không phục hồi tùy tiện.

## Bằng chứng kiểm thử

| Lớp kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| Vitest tổng hợp | 97 file đạt, 2 file skip; 724 test đạt, 16 skip | Skip không tính pass; không phải tất cả browser E2E |
| TypeScript ứng dụng / ESLint file sửa | Đạt, không warning | Không khẳng định đã lint toàn bộ backlog |
| Deno worker | 8/8, entrypoint typecheck đạt | Harness không mạng/env/ghi file/chạy tiến trình |
| PostgreSQL DB độc lập | 73/73 | Schema phụ thuộc tối thiểu, không sao chép dữ liệu thật |
| Auth HTTP + local full schema | 9 kiểm tra đạt | Write SQL dùng claims từ phiên Auth thật, luôn ROLLBACK |
| Edge Function thật | OPTIONS 204; GET 405; POST không quyền 403 | Không gọi POST có quyền chạy job toàn cụm |
| Docker build và container smoke | Đạt trên candidate và 8082 | Không phải thử tải hay chứng minh khả năng mở rộng |
| Browser trên 8082 | Login, menu, tìm email, trial, mở/đóng hồ sơ và focus đạt | Không tạo/ghi chú case commit bằng browser |

73 kiểm tra DB bao gồm 20 request đồng thời, hai admin, version race, replay,
phân trang lịch sử 58 event, grants/RLS/immutability, khóa/bỏ role/ban/phiên
hết hạn hoặc thu hồi và tính bất biến dữ liệu tài chính. Script tự tạo DB tên
UUID rồi xóa đúng DB đó; đã xác minh không còn DB thử.

9 kiểm tra HTTP xác nhận admin đọc được; owner/staff không đọc/ghi được;
anon không đọc được; tạo/replay/ghi chú trong transaction full schema local
được rollback; PostgREST xác nhận không có case/event tồn dư. Không gọi đây
là committed browser-write E2E.

Script:
- scripts/test-subscription-reconciliation-cases-db-isolated.mjs
- scripts/test-subscription-cases-http-local.mjs
- supabase/functions/check-subscription-status/handler.deno-test.ts

Ảnh giao diện tại repo gốc: artifacts/roomqc-local-release-20261017.jpg.
Ảnh chỉ chứa tài khoản và giao dịch fixture, không phải dữ liệu khách thật.

## Dọn thử nghiệm

Đã đăng xuất fixture, xóa đúng 4 tài khoản/tenant fixture do manifest A0
quản lý cùng mail liên quan, xác minh không còn; manifest đã gỡ. Dữ liệu thử
này có thể tạo lại bằng script, không xóa tài khoản/tenant có sẵn của người dùng.
Container candidate roomqc-parallel-candidate-20261017 trên 18082 đã xóa,
không có volume dữ liệu. Image mới và image trước triển khai vẫn giữ.

## Quay lại frontend khi cần

Image trước triển khai: roomqc-local:before-parallel-becdb53
(sha256:3a6b0c4a7958b1d6a479da90b6d4c029d18adf122dccd46d06ee12c29d3e519a).

Chạy tại repo gốc, chỉ khi quyết định quay lại frontend:

```powershell
docker tag roomqc-local:before-parallel-becdb53 room-weave-pro-main-roomqc:latest
docker compose --project-name room-weave-pro-main --env-file .env -f docker-compose.roomqc.yml up -d --no-build --no-deps roomqc
node scripts/verify-container.mjs
```

Không reset hoặc tự xóa schema để rollback. Migration additive được giữ;
backup không thay cho quyết định phục hồi DB có kiểm soát. Source worker
được mount từ repo gốc nên rollback image frontend không rollback worker.

## Chưa hoàn tất / thứ tự tiếp tục

1. A1: durable job history, monitor/backlog, interrupted/busy, locking/outbox
   và retry thông báo an toàn. Chưa bật lịch production.
2. A2: phân công/kết luận/mở lại; danh sách tìm lại case khi nguồn biến mất;
   flags/chứng từ; pending recovery qua reload hoặc unmount. Lượt này mới là
   foundation, không phải toàn bộ workflow đối soát.
3. A3: server pagination/search/count/aggregation, audit analytics, thử tải
   và tối ưu bundle. Vendor còn ~14,16 MB minified / 4,72 MB gzip.
4. A4: committed browser-write E2E và ma trận hồi quy đầy đủ còn thiếu.
   Restore độc lập, email/provider thật, staging/VPS/TLS/domain, policies và
   quyết định cần quyền/khóa vẫn ở danh sách deferred.

Không mở signup công khai, checkout/thu tiền, gọi SePay, gửi email Internet
hoặc sweep lifecycle toàn cụm trong lượt này. Không cam kết số user đồng thời.
Các báo cáo trước ghi "chưa áp migration/chưa deploy" là mốc lịch sử; trạng
thái mới nhất được cập nhật tại tài liệu này.
