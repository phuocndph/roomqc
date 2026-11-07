# Ngừng quyền ghi của API cũ trước nâng cấp directory

Công cụ `scripts/control-api-login-retire.mjs` dành cho người triển khai, dùng kết nối quản trị riêng. Mặc định chỉ xem trước. Khi áp dụng, công cụ tắt đăng nhập, gỡ membership `roomqc_control_api` và kết thúc những phiên còn lại của đúng tài khoản, đúng database. Không đổi mật khẩu, không xóa database/role/lịch sử và không có thao tác bật lại tài khoản cũ.

Healthcheck lỗi không tự dừng tiến trình hoặc thu hồi phiên database đã mở. Không dùng `readyz=503`, container unhealthy hoặc ngừng routing làm bằng chứng duy nhất rằng writer cũ đã bị chặn.

## Phạm vi và điều kiện

- Mỗi phiên bản API cần LOGIN riêng, chỉ kế thừa group `roomqc_control_api`. Tài khoản mới dùng cho phiên bản tương thích phải khác tài khoản cần ngừng.
- Công cụ từ chối tài khoản có quyền quản trị, nhiều membership, thành viên cấp dưới, quyền trực tiếp/quyền sở hữu, prepared transaction hoặc phiên hoạt động trên database khác. Khi bị từ chối phải rà soát mô hình quyền; không tự gỡ guard hoặc dùng công cụ này cho tài khoản dùng chung.
- Đối chiếu PostgreSQL system identifier, database OID/name và role OID. Công cụ từ chối business database có Auth/tenants hoặc target khác cấu hình.
- Credential quản trị chỉ đặt trong file riêng tư; không truyền DSN/password qua tham số CLI, không đưa vào `.env` frontend hoặc ảnh container API. Quyền đọc `pg_control_system`, quản lý đúng LOGIN và terminate phiên cần được cấp cho người triển khai.
- Đây là công cụ ngừng LOGIN API. Chưa thay quy trình drain/fence worker, proxy, các dịch vụ khác hoặc mọi đường rollback; các phần đó cần inventory và bằng chứng riêng.

## Chuẩn bị cấu hình

Trong thư mục chỉ chủ sở hữu có quyền truy cập, tạo file DSN quản trị và JSON cấu hình. Trên Linux dùng directory0700/file0600. Trên Windows ACL chỉ cho người thao tác, SYSTEM/Administrators; symlink/hardlink bị chặn. Staging/production yêu cầu `sslmode=verify-full`, phải cấu hình CA phù hợp.

```json
{
  "version": 1,
  "environment": "production",
  "dsnFile": "/etc/roomqc/deployment/directory-admin.dsn",
  "auditFile": "/var/lib/roomqc/deployment/api-retirement-unique-run.jsonl",
  "expected": {
    "databaseName": "REPLACE_WITH_REVIEWED_DIRECTORY_NAME",
    "databaseOid": "REPLACE_WITH_ACTUAL_NUMERIC_OID",
    "systemIdentifier": "REPLACE_WITH_ACTUAL_NUMERIC_SYSTEM_IDENTIFIER"
  },
  "login": "replace_with_dedicated_old_api_login"
}
```

Các giá trị `REPLACE_...` là placeholder, không thể áp dụng. Lấy identity bằng truy vấn chỉ đọc trên đích đã xác nhận:

```sql
SELECT current_database() AS database_name, oid::text AS database_oid,
       (pg_control_system()).system_identifier::text AS system_identifier
FROM pg_database WHERE datname=current_database();
```

## Thứ tự cutover

1. Xác nhận backup/restore point và phiên bản có thể quay lui; chuẩn bị API tương thích cùng LOGIN mới. Chốt inventory mọi replica, endpoint và dịch vụ dùng LOGIN cũ. Nếu có pooler phải nhận diện LOGIN backend thực, không suy từ tên tài khoản của frontend pooler.
2. Đóng nhận mới theo runbook của cụm, drain traffic API cũ và dừng replica/service cũ bằng deployment có đúng project/host. Giữ mapping/job/lịch sử để đối soát, không xóa volume. Ngừng các writer khác theo inventory riêng trước bước migration có liên quan.
3. Chạy xem trước từ checkout/bundle đã kiểm:

   ```text
   node scripts/control-api-login-retire.mjs --config-file /etc/roomqc/deployment/retire-old-api.json
   ```

   Đối chiếu `binding.database`, `binding.role`, số phiên và `planSha256` với đích. Chế độ này không tạo audit hoặc thay quyền. Nếu kế hoạch thay đổi, kiểm lại và lấy fingerprint mới; không bỏ qua xung đột.

4. Áp dụng fingerprint vừa đối chiếu:

   ```text
   node scripts/control-api-login-retire.mjs --config-file /etc/roomqc/deployment/retire-old-api.json --apply --expected-plan-sha256 REVIEWED_64_HEX_SHA256
   ```

   File audit được tạo độc quyền và fsync dòng kế hoạch trước thao tác. Sau khi `NOLOGIN`/revoke đã commit, công cụ terminate các phiên còn lại, chờ có giới hạn và ghi kết quả. File đã tồn tại bị từ chối, không ghi đè bằng chứng.

5. Chỉ coi LOGIN này đã ngừng khi kết quả có `verified=true`, `loginDisabled=true`, `apiMembershipRemoved=true`, `remainingSessions=0`, audit đủ dòng và kiểm thử kết nối bằng credential cũ bị từ chối. Không suy từ việc process đã tắt rằng transaction PostgreSQL đã hoàn tác xong.
6. Chạy migrator directory bằng credential triển khai riêng; không cấp quyền migration cho API. Khởi động API mới với LOGIN mới; kiểm readiness, tra kết quả lệnh cũ và chạy một lệnh mới có journal/acceptance/result, không tạo khách sạn/trial trùng.
7. Khi các gate còn lại đạt, mở routing/nhận mới trong phạm vi đã duyệt. Thu command/exit/source/schema, audit, kiểm session và đối soát database; không đưa token/DSN vào báo cáo công khai.

## Khi bị gián đoạn hoặc cần quay lui

- Nếu thất bại trước khi quyền bị đổi: giữ audit, kiểm lại target và mã lỗi. Không thử nhiều tài khoản hoặc database khác theo suy đoán.
- Nếu thao tác đã hoặc có thể đã commit nhưng mất phản hồi: kết quả không đủ để tự bật lại quyền. Xem trước cùng LOGIN, đối chiếu trạng thái thực và hoàn tất ngừng session với fingerprint mới cùng file audit mới. Giữ file cũ kể cả chỉ có dòng kế hoạch.
- Sau khi directory dùng durable journal, không khởi động binary cũ bằng credential mới để né readiness. Quay lui ứng dụng chỉ dùng binary hiểu protocol hiện hành; phương án read-only phải có routing và quyền database riêng đã kiểm.
- Không down-migrate hoặc sửa checksum migration đã công bố để làm binary cũ chạy được. Không tự khôi phục `LOGIN`/membership cũ. Mất VPS/DR là quy trình riêng, cần fence host cũ trước mở bản phục hồi.

## Bằng chứng

Native diagnostic `support-cutover` nhận `--legacy-build-state` trỏ tới snapshot nguồn cũ đã kiểm, chỉ mount các tệp public có hash và dependency lockfile khớp; không mount secret/log/.local của lần chạy cũ. Bài này dùng source lịch sử chạy bằng Node22 và LOGIN riêng trong database disposable; không phải ảnh container production hoặc triển khai VPS thực.

Kết quả thực tế được ghi trong báo cáo riêng sau khi lượt native đóng terminal. Việc có runbook/công cụ không tự đóng BG02, gate release hoặc toàn mục tiêu VPS + signup.
