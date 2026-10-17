# RoomQC — kiểm chứng hành trình khách hàng trên local

Ngày 17/10/2026. Hoàn thành đợt kiểm thử tích hợp dịch vụ local; **chưa nghiệm
thu browser E2E, staging/VPS hay production**. Không mở signup công khai,
không bật directory trên frontend và không cấu hình gửi email Internet.

## Phần đã bổ sung và kết quả

`npm run test:customer-journey:local`: **81 kiểm tra đạt** trong lần chạy cuối
sau lượt sửa bộ kiểm thử (bản ban đầu là 69). Không cộng các lần chạy lặp.
Đây là một hành trình dùng cùng owner/workspace/tenant/hotel từ đầu đến cuối,
thay vì ghép kết quả các suite độc lập:

1. Giữ slug, mở lại reservation không gia hạn; signup Auth thật, email xác
   minh tiếng Việt qua Mailpit; chưa xác minh không login, OTP sai/reuse bị chặn.
2. OTP trên client mới, login bằng mật khẩu, provisioning qua HTTP control
   thật và DB directory riêng. Mất xác nhận sau commit được bootstrap phục hồi;
   retry vẫn một tenant/hotel/trial; một welcome event có đường dẫn workspace.
3. Lưu nháp ba phòng, đăng nhập từ client mới để đọc lại, xác nhận giá rồi
   commit/replay; số phòng, trạng thái và giá đúng.
4. Owner mời nhân viên bằng Edge Function thật, đọc email lời mời, xác minh OTP,
   đặt mật khẩu, chấp nhận và login mới. Đúng tenant/hotel/vị trí/bộ phận/role;
   không có profile hoạt động trước accept và không tự nâng quyền/gói.
5. Khách thứ hai có tenant/hotel riêng; owner và nhân viên không đọc chéo phòng
   qua REST hay nháp setup qua RPC.
6. Hai owner upload/download đúng bytes PNG tổng hợp trong bucket riêng tư
   `guest-documents`; nhân viên cùng tenant đọc được theo chính sách hiện tại.
   Tenant khác/anonymous không download, tạo signed URL hoặc ghi đè; tenant khác
   cũng không tạo được tệp mới vào thư mục owner. Kiểm tra path trống trước/sau
   từ chối, rồi owner tạo/đọc đúng path đó làm đối chứng thành công. Public URL
   không truy cập được, listing không lộ file; xóa chéo trả rỗng và file còn nguyên.
   Ca chặn kiểm tra HTTP 4xx và mã Storage 403/404 đúng tình huống,
   không tính network failure/5xx hay lỗi dữ liệu đầu vào chung là đạt.
7. Hai owner và nhân viên subscribe Realtime `rooms UPDATE` không có filter
   tenant phía client; đều nhận sự kiện hợp lệ trước khi kiểm tra không có sự
   kiện chéo trong cửa sổ quan sát 2 giây. Kênh phải còn live xuyên suốt,
   CHANNEL_ERROR/TIMED_OUT/CLOSED làm hỏng lượt test dù tự reconnect; cả ba
   observer phải nhận thêm sự kiện hợp lệ sau cửa sổ âm tính.
8. Tenant trial/receipt giữ đúng và cờ directory_required không bị đổi bởi suite.

## Lỗi thật đã xử lý: Storage upload HTTP 500 / 42P10

Storage API local `v1.82.1` dùng conflict target
`(bucket_id, name COLLATE "C") WHERE archived_at IS NULL`, trong khi chỉ mục
unique current-version hiện có dùng collation mặc định. PostgreSQL không chọn
được chỉ mục cho ON CONFLICT, kể cả owner có quyền upload đúng.

Đã thêm **một custom unique partial index** `roomqc_storage_current_name_c_idx`
trên local. Không đổi/xóa chỉ mục vendor, owner/grants/policies, metadata hay
lịch sử migration của Storage. Upload và đọc lại bytes đã được kiểm chứng sau sửa.

Theo hướng dẫn Supabase, dữ liệu object luôn được thao tác bằng Storage API;
custom index dùng để tương thích truy vấn. Đây là bảo trì local, **không phải
migration ứng dụng**: tài khoản postgres ứng dụng không sở hữu storage.objects.
Không cấp thêm quyền để vượt qua giới hạn này.

Lệnh kiểm tra không ghi: `npm run supabase:storage:repair`.
Chỉ khi đúng lỗi/phiên bản local và bảng object trống mới dùng
`npm run supabase:storage:repair -- --apply`.
Helper lấy kết nối chủ Storage có sẵn từ đúng container local, kết nối qua
127.0.0.1, không in credential; khóa ngắn và từ chối sửa bảng đã có object.
Chạy lại sau sửa báo tương thích và không thay đổi gì. Không chạy helper này
trên VPS/hosted; môi trường có dữ liệu cần quy trình DBA riêng đã backup và
đánh giá khóa/chỉ mục cùng phiên bản Storage. Không tự xóa index khi nâng cấp.

Bucket giấy tờ hiện không có UPDATE policy: ngay owner cũng không được ghi đè
tệp cũ. Scanner dùng đường dẫn mới cho mỗi lần upload; kiểm thử giữ nguyên
chính sách, không tự mở thêm quyền. Đọc/xóa hiện theo **tenant**, chưa tách
hotel/vị trí nhân viên; cần duyệt chính sách riêng trước dùng giấy tờ thật.

Tài liệu tham chiếu:
[Storage schema](https://supabase.com/docs/guides/storage/schema/design),
[Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

## Hồi quy chạy lại trong đợt này

| Bộ | Kết quả | Lần chạy |
|---|---|---|
| Customer journey local | 81 đạt | Sau sửa 4 điểm review |
| Guard/timeout/Realtime regression | 16 đạt, không cần Supabase | Sau sửa; thêm vào CI |
| Directory/support HTTP → DB/Auth/RPC/RLS | 87 đạt | Lượt tích hợp trước; không chạy lại trong lượt sửa guard |
| Control unit | 8 đạt | Sau sửa guard |
| Vitest toàn repo | 532 đạt, 16 skip; skip không tính đạt | Sau sửa guard |
| TypeScript, syntax/lint script sửa | Đạt | Sau sửa guard |
| DB security advisors local (warn), DB lint public/private | Không báo issue/schema error | Lượt trước; không thay schema trong lượt sửa guard |
| verify:container | Đạt tại 127.0.0.1:8082 | Lượt trước; không thay frontend/container |
| Storage repair lặp lại | Tương thích; không thay đổi thêm | Lượt trước/review; không chạy --apply trong lượt sửa guard |

### Bốn điểm review đã sửa

1. Auth yêu cầu đúng code `email_not_confirmed`/`otp_expired` và không cấp
   session; RPC/REST yêu cầu đúng SQLSTATE và HTTP 4xx. Function yêu cầu đúng
   HTTP, loại lỗi và nội dung từ chối. Riêng accept chưa đặt mật khẩu, function
   dùng 409 chung nên kiểm tra thêm RPC underlying với đúng lý do. Kiểm tra
   identity chưa confirmed, draft chưa commit, lời mời vẫn pending/chưa có
   profile, gói/quota/trial/read-only không đổi sau các lệnh bị từ chối.
2. Realtime giữ lỗi kênh xuyên suốt lượt test; kiểm tra cả trạng thái socket,
   positive control trước/sau và quan sát âm tính. Không để Promise đã resolve
   làm mất lỗi disconnect về sau; dừng giám sát chủ đích trước cleanup.
3. Fetch dùng chung cho HTTP thủ công và SDK có deadline 15 giây, kết hợp signal
   của SDK và deadline tác vụ; bao gồm đọc response body. Polling có race timeout
   thật, hủy signal khi hết hạn; toàn hành trình tối đa 180 giây, từng cleanup
   20 giây, Docker command 15 giây và status CLI 30 giây. Query DB dùng timeout
   pool sẵn có. Cleanup lỗi vẫn thử phần tiếp theo và trả exit code khác 0;
   không được coi client abort là bằng chứng giao dịch server đã rollback.
4. Tách ca Storage INSERT mới khỏi UPDATE bị chặn toàn bucket. Kiểm tra object
   không xuất hiện sau từ chối và owner upload/đọc cùng path thành công; kiểm
   tra bytes ban đầu không đổi sau ghi đè chéo tenant.

`npm run test:customer-journey` chạy 16 regression không cần database: network,
5xx/sai mã/sai lý do không được pass; disconnect rồi reconnect vẫn fail;
predicate treo vẫn timeout; deadline cha truyền xuống SDK fetch; HTTP body
đã có headers nhưng treo cũng bị abort. CI chỉ chạy suite guard này; **không**
tự gọi bài tích hợp tạo tenant khi CI chưa có Supabase/Mailpit local an toàn.

Suite giới hạn API/DB/SMTP ở loopback, xác nhận Auth và email nghiệp vụ dùng
Mailpit trước tạo fixture. Dọn theo ID/email/path chính xác của lần test, gồm
hai tenant, ba Auth identity, file qua Storage API, queue/mail và container
directory tạm. Các lần thử thất bại cũng đã dọn; một identity synthetic từng
còn do FK inviter đã được xác minh và dọn riêng, rồi sửa thứ tự cleanup.
Không reset DB hay xóa dữ liệu người dùng có sẵn. Không để control service
thường trực; 8090 CRM không bị thay đổi, frontend vẫn ở 8082.
Cleanup hiện kiểm tra lỗi trả về từ signout, xác minh file qua Storage API,
kiểm tra không còn identity/tenant/session của lượt test và email qua Mailpit,
đồng thời kiểm tra cờ directory không đổi. Sau lượt 81 ca: không còn fixture
user, tenant, object hoặc container directory tạm.

## Giới hạn và bước kế tiếp

- Không phải thao tác trình duyệt: chưa chứng minh callback/reload/tab/mobile
  trên UI. “Client mới” ở đây là Supabase client/session mới trong test.
- Chỉ guest-documents và sự kiện rooms UPDATE; chưa audit toàn bộ buckets,
  Broadcast/Presence/DELETE, cache hay mọi luồng nghiệp vụ. Cửa sổ âm tính
  Realtime hữu hạn không chứng minh cách ly tuyệt đối mọi thời điểm.
- Không phải thử tải, backup/restore, gửi Internet hay kiểm chứng nhiều backend.
- Không tạo staging thay thế bằng cách mở public local. Cần VPS/SSH alias hoặc
  IP đã xác định và domain staging/TLS; hiện chưa có thông tin mục tiêu này.
- Tiếp theo là dựng directory bền vững, control/proxy same-origin, cấu hình
  Auth/email staging và chạy ma trận browser E2E trong báo cáo Đợt 1. Thanh
  toán/expiry (Đợt 2) và backup/monitoring/pilot vẫn chưa nghiệm thu.
