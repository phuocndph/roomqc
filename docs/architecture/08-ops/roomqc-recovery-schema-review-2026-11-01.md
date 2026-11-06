# Review fingerprint của database phục hồi — 01/11/2026

**Đạt đối chiếu độc lập toàn bộ 6.928 thành phần schema.** Chưa cài approval
mới hoặc khởi động lại worker trên bản phục hồi. Signup production vẫn đóng.
Biên nhận: [schema review](../../../artifacts/roomqc-recovery-schema-review-2026-11-01.json).

## Bản chuẩn và kết quả

Đọc bản schema đã đóng băng trước khi thêm LOGIN setup, cùng đúng bốn phần role
đã được review cho epoch 4. Không dùng parts quan sát trên target để tạo expected.
PostgreSQL thực hiện canonical JSONB trên cùng migration history đã được kiểm
với backup trước callback; Node chỉ hash byte canonical sau đọc lại.

- Baseline trước setup: `f358523d9c7c1a5e2b1bfe92ac0472439a22fad8ea4f1d6c88407835635f9652`.
- Baseline cộng bốn phần role: khớp chính xác source epoch 4 đã duyệt,
  `84c57395ec7900953a5830e86cd50dd295989abdfb964ef72a821f7f0b1673f4`.
- Expected target được dựng độc lập: một CHECK đã review và compaction ordinal
  xác định từ các cột còn tồn tại trong baseline nguồn.
- Sau materialize hai owner ACL đúng bản nguồn, toàn bộ 6.928 parts khớp expected;
  fingerprint thật khớp `f05b3779e987f7d41ecdaf9881aaa0fb4972508f042374c89bfd71bb3dc600f1`.
- Thay một định nghĩa ngoài danh sách review bị từ chối. Database thử đã dọn.

Proof gắn với business descriptor
`57b8adb35847907f398200526d84cc53453f8575358e4a2cba957be05f150d3b`, thuộc
checkpoint `24dc36fb-5b67-4204-997d-51fed1536de8`. Không đem hash này áp vào
database khác, migration set mới hoặc bản frontend build lại mà không review.

## Những sai lệch đã xác định

1. **Giá trị int64:** `9223372036854775807` bị `JSON.parse` thông thường đổi
   thành `9223372036854776000`. Bộ review dùng source lexeme của JSON và BigInt,
   serialize lại bằng `JSON.rawJSON`; không chuyển int64 qua Number. Đầu vào
   Number đã mất độ chính xác hoặc số thập phân ngoài contract bị từ chối.
2. **Ordinal vật lý sau pg_dump/restore:** PostgreSQL bỏ các cột đã DROP và đánh
   lại `attnum` của cột còn lại. Có 54 thay đổi tại bốn bảng: `auth.oauth_clients`
   (12), `auth.saml_relay_states` (3), `public.items` (19),
   `public.maintenance_requests` (20). Chỉ nhận đúng vector ordinal nguồn đã
   review, giữ nguyên thứ tự logic, kiểu, default, ACL và mọi field khác. Cột bị
   đổi chỗ, thiếu/thêm, kiểu khác hoặc gap ở bảng khác đều thất bại.
3. **Hai biểu diễn owner ACL sequence:** `private.checkout_invoice_numbers`
   và `private.subscription_lifecycle_commands_ordinal_seq` có source ACL
   `postgres=rwU/postgres`. pg_dump có thể bỏ ACL tường minh bằng quyền mặc định.
   Fingerprint v3 đang dùng `acldefault('S',...)`, mã của foreign server, thay vì
   `'s'` của sequence, nên khi ACL NULL nó tạo biểu diễn `postgres=U/postgres`.
   Logical-backup catalog dùng đúng `'s'`, vì thế catalog vẫn khớp trong khi
   release fingerprint khác. Không kết luận dữ liệu hoặc quyền hiệu lực bị mất
   từ sự khác nhau này. Bước phục hồi materialize đúng ACL nguồn trên hai
   sequence; từ chối owner, grantee hoặc quyền ngoài hai trạng thái đã review.

Không sửa hàm fingerprint v3 của release đã ký trong diễn tập. Sửa mã type cho
release kế tiếp cần migration, migration-set hash và approval rollout riêng;
không thay file migration cũ hoặc tự cập nhật hash đã ký.

Nhận định lịch sử quy toàn bộ lệch hash cho CHECK là chưa đầy đủ và đã được
đính chính trong runbook backup/checkpoint. Giữ nguyên các receipt lịch sử để
phân biệt proof catalog lúc đó với review đầy đủ hiện tại.

## Công cụ và kiểm chứng

- `roomqc-recovery-schema-review.mjs`: xây expected từ frozen input, so chính xác
  parts, giữ int64 và tạo SQL materialize ACL có guard/transaction.
- `test-roomqc-recovery-schema-native.mjs`: restore từ backup đã ghim hash,
  so baseline/source digest, so toàn bộ target parts và fingerprint bằng
  PostgreSQL thật; sửa ACL chạy lại không đổi kết quả.
- `test-roomqc-recovery-acl-native.mjs`: Docker PostgreSQL 17 cách ly, kiểm cả
  ACL NULL và ACL USAGE tường minh; materialize đúng quyền nguồn, idempotent,
  chặn grantee mới và giữ nguyên trạng thái khi từ chối; dọn container.
- **6 unit tests đạt**: source role/grant lạ, int64 lệch một đơn vị, ordinal,
  định nghĩa/ACL thay đổi hoặc target thiếu/thừa đều bị chặn. Hai kiểm native
  phía trên đạt; không cộng chúng vào unit-test count.

Ví dụ chạy với input private đã xác thực:

```powershell
node --test scripts/roomqc-recovery-schema-review.test.mjs
node scripts/test-roomqc-recovery-acl-native.mjs
node scripts/test-roomqc-recovery-schema-native.mjs `
  --backup-dir <opened-business> --descriptor-sha256 <pinned-descriptor-sha256> `
  --baseline-file <private-frozen-baseline.json> --output-dir <private-output-root>
```

Giữ diagnostic private của các lượt lỗi: ban đầu baseline digest không khớp do
Number làm tròn int64; sau khi sửa, strict comparison phát hiện ordinal/ACL;
guard ACL đầu tiên từ chối NULL và đã được sửa theo đúng `acldefault` contract.
Không đổi các lượt lỗi thành pass. Receipt native được nghiệm thu có SHA-256
`5e91f05a8ccdb88c9ede71a6107363d1cccd0f70a380512b86d3211f6e1eca14`.

## Phần tiếp theo

Cấp signing identity chỉ dùng môi trường local cho target phục hồi, cài bằng
release installer quyền hẹp và CAS; cấp lại credential setup/probe, sau đó chạy
worker/rotation thật. Giao diện phải build lại với public key mới, cần digest và
approval tương ứng trước nghiệm thu full-service. Chưa ghi backup bundle verified.

Kiểm capacity trên VPS: chỉ có một image RoomQC không dùng, khoảng 29 MB,
không đủ đưa disk free 24,42% qua ngưỡng 25%. Không xóa image, file backup, log
hoặc tài nguyên dự án khác. Vấn đề dung lượng vẫn chưa được giải quyết.
