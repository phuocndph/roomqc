# RoomQC — upgrade và đọc đối soát đăng ký cũ, kiểm chứng local

Ngày28/10/2026. Đã có migration directory0016, role đọc riêng, scanner/classifier/config và CLI dry-run. **Chưa có backfill apply hoặc durable admin recheck; chưa triển khai VPS hay ký nghiệm thu sản phẩm.** [Runbook](roomqc-setup-backfill-runbook.md) giữ schema/cách chạy/giới hạn; [plan4.3–4.4](roomqc-vps-signup-next-delivery-2026-10-28.md#43-đóng-khoảng-hở-tiến-độ-và-backfill-dữ-liệu-cũ) giữ phần nhận tiếp.

## 1. Thay đổi và mục đích

- Directory0016 tạo roomqc_control_backfill_reader NOLOGIN; LOGIN riêng chỉ đọc projection identity/state/lease/release và migration history. Không đọc tên/email/publishable_key/audit, không table DML/DDL/sequence hoặc gọi worker/installer RPC. Readiness kiểm quyền hữu hiệu và đúng PostgreSQL system_identifier/database OID/name/role.
- setup-backfill.mjs đọc mỗi trang trong REPEATABLE READ READ ONLY, rollback/nhả DB trước gọi receipt. Bảy nhóm: active_valid,committed_pending,dispatch_pending,closed,legacy_unknown,conflict,unavailable. Active có job chưa xong/dispatch chưa terminal không được báo hợp lệ. Missing receipt không thành closed; receipt tổng quát không thay proof đúng dispatch/hash.
- Fingerprint gồm workspace/job/dispatch/cluster/current release/credential binding, giữ microseconds; report chỉ xuất hash. Không in owner input/owner ID/lease token/provider body hoặc secret. Cursor có scope/cutoff/UUID nhưng không là snapshot xuyên trang; apply sau này phải đọc lại/CAS.
- CLI scripts/control-setup-backfill.mjs mặc định dry-run, không có --apply; output exclusive create/mode0600. Kết nối directory tối đa1, batch100, receipt concurrency2/timeout5s. Report CLI thêm source/backend hash/file count và resource budget hash; source đổi trong run thì không xuất report thành công.
- Config dùng file-only DSN/trust/scoped credential, signed release/target và HTTPS/verify-full cho staging/production. Consumer setup-backfill-reader phải được review riêng với1 replica/pool1; không vay migration reserve. Template cố ý thiếu approval/identity, không dùng nguyên để chạy. Worker example replicas0/dispatch flagfalse giữ nguyên.

Role directory chỉ đọc; credential remote recovery hiện có cả receipt và close. Scanner adapter chỉ gọi receipt và native snapshot xác nhận không tạo tombstone. Chưa có issuer/Windows ACL/credential vận hành hoặc remote receipt-only role mới.

## 2. Bằng chứng đúng source

| Kiểm | Kết quả | Phạm vi |
|---|---|---|
| [Control regression c1cf9fc1e952](../../../artifacts/roomqc-setup-backfill-c1cf9fc1e952-local-2026-10-28.json) |620 tổng /618 pass /0 fail /0 cancelled /2 skip|4 ca PostgreSQL backfill/upgrade,7 unit mới,13 ca worker hồi quy; remote scanner observations là doubles|
| [Native 1a5529c86376](../../../artifacts/roomqc-setup-backfill-native-1a5529c86376-local-2026-10-28.json) |115/115 controls, gồm8 backfill và17 worker|Auth/PostgREST/PostgreSQL thật; directory reader và remote recovery role thật cùng run;580 business+16 directory migrations|
| Cleanup |0 container/volume/network theo exact label ở cả hai run|Cleanup của từng fixture, không cleanup stack đang phục vụ|

Backend **257 file**, SHA256:

    5f96d8a5c7be340e711d4f3578267e6b2cb626a3aa4d15d28ddfbc5ac83ea9e3

Business migration set580 không đổi:

    77b385945e7b223a44a6ea98bb42ff19204aa5dd687fbbf317601c570c3b3b1d

Business schema trước/sau:

    553e8e5f781edcb188df30a1cd8174e099d8251bce7892cab6c547216c6965b3

Hai packet cùng source;15 migration directory cũ giữ checksum,0016 chỉ thêm role/grants đọc. Hai skip là fixture symlink Windows và kiểm POSIX file mode notification cần Linux; không quy thành pass. Không có frontend thay đổi hoặc browser/Android run mới.

## 3. Các nhánh đã kiểm và giới hạn

Upgrade test dựng0014 từ file gốc, seed9 job queued/retry/leased/succeeded/waiting_owner/needs_review/cancelled với attempts0/2/8/10, lease còn/hết hạn và dispatch có/thiếu. Hai migrator cùng apply0015: đúng một migration được áp dụng; rerun no-op. Row baseline/history/lease/attempts/audit/approval giữ nguyên; max_attempts8, deadline=created_at+24h. Job cũ attempts10 và lease cũ quá deadline chuyển needs_review đúng lý do, không tạo attempt history giả hoặc kéo dài hạn.

Directory scanner cases chứng minh bảy nhóm đúng đáp án, report không owner input/provider lỗi gốc, không close và before/after bảng app không đổi. Reader thật bị từ chối đọc email/display/publishable key/audit, DELETE/UPDATE và claim RPC; dư SELECT column, role quản trị hoặc server identity sai bị readiness chặn. Cursor scope sai bị từ chối, đủ trang không lặp và fingerprint thay đổi khi state đổi. Unit thêm timeout/late reply, signed-target tamper/local opt-in, budget riêng và CLI mutation/ambiguous-option denial.

Native kiểm8 nhánh: role đọc tối thiểu; receipt thật missing vẫn pending; không đổi directory/business/private dispatch journal; remote committed receipt vẫn đòi proof dispatch; dry-run lặp giữ snapshot; active/closed sau worker recovery; report không lộ token/owner input; live revoked token thành unavailable. Native so11 bảng business và private dispatch journal, cùng snapshot5 bảng directory. Fixture roles được dọn trước advisors và baseline roles được phục hồi.

**Giới hạn:** directory seed bằng administrator SQL, approval có chữ ký là fixture; hai database trong cùng PostgreSQL sandbox. Native dùng scanner trực tiếp, chưa chạy toàn CLI file/config/output trên target thật. Chưa có public control signup API xuyên suốt, SIGKILL đầy đủD10, A/B host độc lập, browser/Android, full-native default/rebuild, VPS/TLS/offsite restore/tải/soak/pilot. Đủ local controls không khép70 ca gốc ở mọi môi trường.

## 4. Lịch sử và audit còn mở

[Focused bebf9a11e2fe](../../../artifacts/roomqc-setup-backfill-bebf9a11e2fe-local-2026-10-28.json) đạt24/24; [2fefbdfe20c1](../../../artifacts/roomqc-setup-backfill-2fefbdfe20c1-local-2026-10-28.json) và [3b5cdb07288a](../../../artifacts/roomqc-setup-backfill-3b5cdb07288a-local-2026-10-28.json) đạt618/0 fail/2 skip ở source trước. Sau đó đã siết active/job/dispatch và bổ sung source/budget hash CLI; không thừa kế count của chúng làm proof source cuối. Lượt cuối ở mục2 giữ source thực.

Advisors CLI2.122.0: **762 findings**. INFO:rls_enabled_no_policy=43; INFO:unindexed_foreign_keys=7; INFO:unused_index=513; WARN:multiple_permissive_policies=199. Không có ERROR trong packet nhưng recovery catalog **reviewedSafe=false** và disposition quyền nối tiếp/dynamic/aggregate/window cùng từng finding còn mở. Directory-role assertions không thay audit toàn sản phẩm.

## 5. Đầu việc nhận tiếp

1. **Backfill apply4.3:** receipt/terminal proof đủ an toàn, expected state fingerprint và exact report/target/ID batch đã review; lock order advisory727001→workspace→job→dispatch→cluster; audit/enqueue/no-op atomic, giữ lease/budget/history, rerun/crash-resume idempotent. Không activate chỉ từ receipt tổng quát, không tự provision hoặc reset trial. Reader0016 không có quyền apply; migration mới nếu cần bắt đầu0017, không sửa0001–0016.
2. **Durable recheck4.4:** contract riêng/live platform authority/key/reason/routing+snapshot CAS; command/job/audit và lookup scope đúng actor/workspace. UI giữ key qua F5/mất response; hai operator không tạo hai live job. Không dùng GET result của cluster command làm workspace result.
3. **Runtime/integration:** full CLI trên fixture và Linux permissions/Windows ACL; SIGKILL thật và public control API/session→directory→worker→remote→status; T10 consumer/vendor/DSN/rolling overlap trước bật replica. Full-default/rebuild sau candidate freeze và toàn VPS/restore/E2E/load/RC/pilot vẫn theo dependency.

**8 đợt/25 task/27 gói/70 ca not_run/122 mục release unverified**;124 lượt môi trường trong ma trận kế hoạch chưa đổi. Chưa cấp credential vận hành, migrate DB đang phục vụ hoặc bật dispatch/worker production. Reviewer/signoff/gates giữ nguyên; goal toàn plan active.
