# ADR — fingerprint v2 cho partition Realtime do vendor quản lý

Ngày: 19/10/2026. Trạng thái: local_verified cho controlled vendor maintenance
và independent rebuild; chưa nghiệm thu scheduler soak/Linux staging/deployment.
Thuộc R2/T08/P3-01 và M06/P2; không thay phạm vi 27 gói/70 case.

## Vấn đề và bằng chứng

Realtime tạo partition `messages_YYYY_MM_DD` của `realtime.messages` hằng ngày,
đồng thời dọn partition cũ. Hash nguyên trạng mọi child gây drift giả dù vendor
hoạt động đúng. Bỏ cả schema `realtime` hoặc mọi bảng trùng prefix lại che được
thay đổi quyền, cấu trúc và publication, nên không chấp nhận.

Pin kiểm chứng: Supabase `self-hosted/v0.8.3`, commit
`bc27d2661edd09a5d0b8d76ce33da6d4071a756e`; Realtime v2.143.3, commit
`d46540b3a4a79113f40301d5e5cb690f41150b9b`. Chọn phiên bản mới phải review lại
spec và nghiệm thu, không mặc định các quy tắc dưới đây đúng cho mọi release.

Run `697008206be7` đã chụp catalog trước cleanup: normalized column shapes và
inherited flags parent/child khớp, nhưng child ACL có `dashboard_user` và
`postgres` trong khi default ACL của **chủ cuối** không có entry. Compose kết
nối Realtime bằng `DB_USER: supabase_admin`; vendor tạo child rồi `ALTER OWNER`
sang `supabase_realtime_admin`. Tính defaults theo chủ cuối là sai nguyên nhân.

Regression riêng cũng chứng minh parent có lịch sử DROP COLUMN có thể giữ
physical attnum gaps mà child mới không có; index key attnums cũng khác. Đây là
lỗi fixture/so sánh cần ngăn, không phải kết luận catalog run trên có gaps.

## Quyết định

### 1. Tách topology động được xác minh khỏi schema tĩnh

`private.roomqc_managed_realtime_partition_ids()` trả OID của các child **sau
khi** tất cả kiểm tra hợp lệ. Fingerprint v2 chỉ bỏ những relation đó khỏi phần
tĩnh. Không dùng OID/ngày/tên child làm expected hash; OID chỉ có phạm vi truy
vấn trong database hiện tại. Parent, function bodies, policies, global/schema
default ACL, roles, grants, publications và membership tĩnh vẫn được hash.

Parent phải đúng `realtime.messages`, owner `supabase_realtime_admin`, partition
key `RANGE (inserted_at)`. Child trực tiếp phải cùng schema/owner, tên ngày UTC
hợp lệ và bounds đúng một ngày. Chỉ nhận ngày UTC−4 đến UTC+3: vendor tạo −1..+3,
dọn cũ hơn −3, cộng một ngày grace để tránh phụ thuộc tức thời vào lịch cleanup.
Bắt buộc có coverage ngày hiện tại và ngày mai. Missing/ngoài cửa sổ là fail,
không thành healthy nhờ vẫn còn một vài partition đúng tên.

### 2. Cột và index đối chiếu theo cấu trúc logic

Live columns giữ thứ tự tương đối, tên, type/typmod, nullability, default,
identity/generated, storage/compression/statistics, collation và column ACL.
Helper dùng ordinal của live columns thay cho absolute attnum. Static parent
vẫn giữ attnum trong fingerprint; normalization không đổi expected của parent.

Index phải gắn vào parent index thật, cùng owner/schema/kind/persistence và đủ
số lượng. Mỗi key/include attnum được ánh xạ sang tên cột trên **relation của
chính index đó**. Expression slot dùng null và biểu thức được đối chiếu riêng.
Vẫn kiểm unique/primary/exclusion, valid/ready/live, order/options, operator
class, collation, expression, predicate, access method và relation options.
Không so raw indkey giữa hai bảng có physical layout khác nhau.

### 3. ACL mô phỏng đúng creator → owner của release đã pin

Creator cố định `supabase_admin`, owner cuối `supabase_realtime_admin` theo
Compose/vendor source đã pin; không cho caller tùy chọn role để nới expectation.

1. Lấy global table default ACL của creator; nếu không có dùng PostgreSQL
   `acldefault('r', creator)` của đúng engine đang chạy.
2. Cộng schema-scoped default ACL của creator trong `realtime`.
3. Áp semantics chuyển owner: grantor/grantee bằng creator trở thành owner cuối.
4. Gộp duplicate grantor/grantee/privilege, giữ grant option khi có; sắp xếp và
   đối chiếu với ACL thực đã explode, bao gồm defaults khi relacl null.

Không sao chép ACL parent: parent cố ý có quyền rộng hơn cho API. Không chấp nhận
ACL bất kỳ chỉ vì owner đúng. Default ACL là schema tĩnh được hash; đổi defaults
rồi tạo child tương ứng vẫn làm observed static hash khác approved expectation.
Vai trò probe chỉ đọc catalog, không được quyền DDL, grant hoặc business data.

### 4. Các bất biến khác vẫn bắt buộc

Child phải là permanent heap partition đơn-parent, không rules/reloptions/RLS
riêng, replica identity mặc định. Cột/constraints có inheritance đúng; constraint
definitions/deferral/validation và parent links phải khớp. CHECK từ parent NOT
VALID được phân biệt với child mới đã validate. Primary constraint child có
`connoinherit=false` và `conparentid`, không sao chép cờ parent máy móc.

Child không có policy/trigger/direct publication membership riêng. Publication
gốc, empty publication, owner/options/via-root và parent membership vẫn attested.
Bảng detached không còn thuộc managed set nên quay lại static fingerprint.

## Migration và compatibility

Migration CLI-generated `20261019142205_control_realtime_partition_attestation.sql`
thêm helpers và thay RPC/fingerprint v2, không sửa checksum migration manifest
gốc. Table cho phép lưu version 1/2 nhưng RPC yêu cầu newly approved v2; không
promote approval v1, tự lấy observed hash làm expected hoặc sửa drift lúc health
probe. Installer tin cậy phải duyệt v2 riêng sau independent build proof.

Gateway legacy dùng service key/body rỗng chưa tương thích. Không deploy riêng
migration này vào backend đang phục vụ trước khi rehearsal consumer/schema
compatibility, rollback config/binary và forward-fix path đã được nghiệm thu.

## Kiểm chứng và giới hạn

Hai regression đã chạy đỏ trước sửa: historical column positions và creator
default ACL/ownership transfer. Sau sửa có 9/9 focused DB, sau đó thêm default-ACL
static-drift regression. Full suite current tree **111/111**, 0 fail/skip, bao
gồm **10 DB tests**: REST role boundary, drift tĩnh, maintenance mô phỏng, 18
mutations âm và v1 approval không tự nâng cấp. Không cộng hai lượt/subset hoặc
quy đổi số test thành acceptance release.

Full backend phải kiểm: replay tất cả migrations → canary initialization →
freeze → tạo child cũ rỗng/bỏ child tương lai rỗng → gọi Janitor vendor thật →
xác nhận old dropped/future recreated → private round-trip → hash tĩnh không
đổi → năm faults/recovery → permissions/revoke/re-login. Hai backend fresh độc
lập phải cùng migration-set/init-spec/image hashes và static v2 hash.

Đã chạy đầy đủ chuỗi trên ở `1d2e7d793b84` và `7bbeec983dbf`, mỗi lượt exit 0,
replay 523 migrations, cleanup 13 owned objects. Lượt thứ hai dùng reference state
đã hoàn thành/cleaned của lượt đầu, khớp hash
`f3d48c3e1134a8fc142f84f21cfb45b9d556bec3f3c122c34a0236246b9a149d`.
Reference fail/phase chưa xong bị runner từ chối. Hai builds không là hai cluster
đã deploy hoặc E2E routing A/B: đây là reproducibility proof trong fixture.
Source/log/image/migration hashes và giới hạn tại
[manifest local](../../../artifacts/roomqc-m06-partition-local-2026-10-19.json).

Catalog diagnostic chỉ đọc metadata, lưu private artifact có ACL/hash; không
public raw env/token/log. Cleanup chỉ exact-owned resources. Controlled RPC
drill không thay soak qua chu kỳ Janitor tự chạy trên staging; giữ
`scheduledSoakVerified=false` cho tới khi có bằng chứng scheduler thật.

## Nguồn

- [Vendor tạo partition rồi đổi owner](https://github.com/supabase/realtime/blob/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants.ex).
- [Lịch sử thay cột id/uuid](https://github.com/supabase/realtime/blob/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/repo/migrations/20241108114728_messages_using_uuid.ex).
- [Janitor maintenance](https://github.com/supabase/realtime/blob/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/janitor/maintenance_task.ex).
- [Compose DB_USER của release](https://github.com/supabase/supabase/blob/bc27d2661edd09a5d0b8d76ce33da6d4071a756e/docker/docker-compose.yml).
- [Kế hoạch R2–R7](../08-ops/roomqc-vps-signup-execution-plan-2026-10-19.md#1932-phiếu-nhận-việc-ngay-từ-hiện-trạng--không-cần-khóa-external).
