# Nghiệm thu hàng đợi HTTP đến backend qua SSH — 31/10/2026

Đã chạy đường API quản trị → specification riêng → hàng đợi directory →
executor đóng gói → SSH xác minh host key → Docker backend thật, trong mạng
Docker nội bộ cô lập. Lượt `57df223bfcab` kết thúc mã 0.

## Bằng chứng

- API nhận một lệnh và gửi lại cùng mã trả biên nhận cũ; chỉ có một job.
- Executor chạy bằng LOGIN riêng, giới hạn một kết nối; API không sửa được job.
- Spec được chuẩn bị và thực thi bằng CLI sản phẩm, không thay remote adapter.
- Năm gate/phase được ghi trong directory migration `0027`; job `succeeded`,
  deployment run `deployed`. Gate mang nhãn `local_test`.
- Khởi chạy 8 dịch vụ backend và 10 dịch vụ kiểm thử handler. Không có Docker
  socket trong executor; target thử dùng daemon local, mọi lệnh deploy đi SSH.
- Cấu hình riêng truyền qua stdin, quyền 0600, hash/owner/symlink/hardlink được
  kiểm tra. Sai host key bị từ chối; giá trị literal không bị shell thực thi.
- Sau rollout, bộ thử áp 591 migration và đạt 91/91 kiểm tra: hai chủ khách sạn,
  OTP/SMTP nội bộ, setup phòng, lời mời, mật khẩu, đăng nhập nhân viên, phân quyền
  và cách ly REST/RPC/Storage/Realtime giữa hai doanh nghiệp.
- Schema ổn định trước/sau nghiệp vụ. Source binding khớp lúc kết thúc và lúc
  lập biên nhận. Executor chạy lần hai không có công việc để thực thi lại.
- Kiểm độc lập sau dọn: container/network/volume của lượt thử đều 0; asset riêng
  được xóa; các container có trước lượt thử không đổi thời điểm khởi chạy.

[Biên nhận JSON](../../../artifacts/roomqc-http-queue-full-backend-ssh-local-2026-10-31.json).

## Hồi quy và sửa bộ thử

Control regression: 988 bài, 731 đạt, 0 lỗi, 257 bỏ qua do yêu cầu môi trường
riêng. Directory với cả Docker/SSH drill chạy 213 bài: 199 đạt, 14 lỗi do dọn
fixture bằng `DROP DATABASE ... FORCE` trong khi PostgreSQL chưa quan sát hết
gói ngắt kết nối của client. Đã bỏ FORCE, chờ server xác nhận kết nối bằng 0
rồi mới xóa database thử. Chạy lại cả 14 ca lỗi và ca liền kề: 19/19 đạt.
Không cộng hai lượt thành kết quả full-suite xanh; chưa chạy lại toàn bộ 213
bài sau thay đổi cleanup.

Hai test nâng cấp cũ còn buộc migration21/26 là migration cuối đã được sửa để
dựng đúng schema tiền nhiệm và kiểm bảo toàn history khi nâng lên hiện hành.
Nhóm nâng cấp/queue/API tập trung đạt 8/8 trước lượt đầy đủ.

Sau khi lập biên nhận SSH, chỉ `server/control/directory-db.test.mjs` thay đổi
ở bước cleanup trên. Biên nhận đã ghi `currentSourceMatches=false` cùng danh
sách diff và source hash hiện hành; mọi source executor/backend/runtime của
lượt SSH giữ nguyên. Đây không phải chứng nhận full release production.

## Phạm vi chưa đạt

Đây là nghiệm thu backend local qua SSH, chưa phải cài trọn hệ thống lên VPS.
Control API trong lượt thử vẫn dùng actor/acceptance double có nhãn fixture;
release/health approval của signup là dữ liệu tổng hợp. Đã chạy Auth và nghiệp
vụ khách thật trên backend cô lập nhưng chưa chạy browser E2E trong lượt này.

591 migration do acceptance runner áp sau rollout. Queue hiện triển khai dịch
vụ theo schema đã được kiểm tương thích, không tự nâng schema production.
Chưa chứng minh gói SSH chung chứa frontend, control, directory và toàn bộ
worker. Chưa kiểm DNS/TLS, email ngoài, backup offsite, tải hoặc pilot.

VPS Contabo không thay đổi; không tăng dung lượng, prune, reboot, xóa dữ liệu
hoặc mở signup production. Gate tài nguyên trên VPS thật tiếp tục có hiệu lực.

## Lệnh kiểm lại

```text
npm run test:customer-ssh:local
```

Lệnh này tạo fixture mới, dùng CLI executor hiện hành và tự dọn đối tượng có
nhãn sở hữu đúng lượt. Không dùng kết quả diagnostic làm full-release reference.

Bước tiếp theo: đóng gói frontend/control/directory/worker cùng backend cho
SSH; chạy nghiệm thu trọn bộ trước khi xét triển khai staging trên máy đủ điều
kiện. Giữ riêng các gate email/DNS/TLS/offsite/pilot trước mở production.
