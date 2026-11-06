# T11/T12 — closure proof và giới hạn quyền recovery, local 28/10/2026

## 1. Kết quả bàn giao

Đã sửa hai vấn đề trong đường phục hồi đăng ký:

- Tiến độ chỉ cho owner nhập lại khi có dispatch `closed` khớp workspace, owner, job, cluster và routing version. Nhãn job `waiting_owner` riêng lẻ không còn đủ để trả `continue_setup`. Job cũ thiếu bằng chứng hoặc sai liên kết trả `needs_review/contact_support`.
- Role `roomqc_setup_recovery` không còn quyền schema/function/table/column/sequence trên `net`. Extension `pg_net` trước đây cấp quyền qua `PUBLIC`; `NOINHERIT` không loại bỏ quyền đó. Quyền hiệu lực của mọi role hiện có khác được giữ nguyên trong migration.

Đây là checkpoint local của một phần T11/T12. Chưa hoàn tất rà quyền gọi nối tiếp, phát credential, worker, backfill/recheck hoặc nghiệm thu VPS/signup. Giữ flag tạo dispatch false và provisioning-worker example replicas=0. Database đang phục vụ không bị migrate bởi lượt này.

Nguồn kế hoạch nhận tiếp: [toàn bộ VPS + signup](roomqc-vps-signup-next-delivery-2026-10-28.md). [Artifact native mới](../../../artifacts/roomqc-setup-recovery-net-fa013390f689-local-2026-10-28.json) và [artifact closure proof](../../../artifacts/roomqc-setup-status-closure-2127028d47a2-local-2026-10-28.json) là hai run có phạm vi khác nhau, không gộp thành E2E toàn tuyến.

## 2. Thay đổi và yêu cầu khi cài đặt

`server/control/store.mjs` đưa `closureVerified` vào read model từ join dispatch/job với đầy đủ identity. `setup-status.mjs` yêu cầu boolean `true`; false/missing/string/number không mở bước tiếp tục. GET vẫn chỉ đọc, no-store, không provision/close/activate hoặc tạo audit. Unit và native directory/HTTP có negative cho job legacy và sai owner/cluster/routing, positive cho dispatch đã đóng, snapshot trước/sau và race trong lúc đọc receipt.

Migration mới `supabase/migrations/20261028010321_setup_recovery_net_privilege_boundary.sql` được tạo bằng CLI thật, không đổi tên hoặc sửa 578 migration trước. Nó chụp quyền hiệu lực của 36 role trên 30 object net, thu hồi PUBLIC/direct recovery grants, phục hồi riêng những quyền các role khác bị mất rồi so lại toàn bộ matrix. Bao gồm column-only grants và role NOINHERIT. Bất kỳ sai khác nào rollback transaction. Không đổi default privileges hoặc ACL schema khác.

**Migration này cần phiên bảo trì của owner extension**, là `supabase_admin` trong bundle self-hosted đã pin. Tài khoản migration nghiệp vụ `postgres` của bundle này không phải superuser và không sở hữu net; migration chủ động từ chối bằng `SETUP_RECOVERY_NET_ADMIN_REQUIRED` trước khi sửa quyền. Không cấp thêm quyền cho tài khoản runtime để chạy được bước bảo trì.

Harness replay các migration nghiệp vụ bằng `postgres`, chỉ mở phiên `supabase_admin` cho đúng migration net; các probe/runtime sau đó tiếp tục dùng role cũ. Nhánh default replay cũng đã nhận cách chọn phiên này nhưng **default full chưa chạy ở source mới**. Installer/deploy/VPS phải nối phiên bảo trì riêng và kiểm role/owner trước cutover; `supabase db push` bằng role thông thường chưa đủ. Đóng thay đổi role/extension/ACL đồng thời trong cửa sổ bảo trì; không thao tác thử trên database đang phục vụ.

Role tạo sau migration cần cấp quyền net rõ ràng theo nhu cầu. Cập nhật/reinstall pg_net hoặc thay default ACL có thể đưa PUBLIC grants trở lại; preflight phải kiểm lại. Các yêu cầu HTTP thử dùng loopback port 9, nằm trong transaction rollback nên không có request đã commit để worker gửi đi. Sequence có thể tăng dù rollback; không tuyên bố giá trị sequence được hoàn tác.

Mã kiểm mới: `scripts/control-backend-setup-net-boundary.mjs`; inventory và runtime denials ở `control-backend-setup-dispatch-checks.mjs`; orchestration ở `test-control-backend-sandbox.mjs`. Lỗi inventory được ghi hết stdout trước khi ném lại, tránh mất catalog do bộ đệm 64 KiB. Advisor helper giữ phiên bản chính xác 2.121.0/2.122.0, đã chạy thật với 2.122.0.

## 3. Bằng chứng đã quan sát

| Nhóm | Kết quả và phạm vi |
|---|---|
| Native run `fa013390f689` | Terminal exit 0, diagnostic riêng, Auth/PostgREST/PostgreSQL thật; replay 579 migration nghiệp vụ; 69/69 controls, 4/4 barrier thật, đối soát 11 bảng business/trial/email/receipt |
| Nâng cấp quyền | 86 quyền hiệu lực recovery trên net trước nâng cấp, 0 sau; 3.045 mục kiểm quyền của role khác có cùng hash trước/sau. Kiểm direct recovery grant, column-only, NOINHERIT và injected fault 22012 rollback ACL/object/role/queue |
| Quyền và tương thích | anon/authenticated/service_role vẫn gọi net.http_get được trong transaction rollback; recovery bị từ chối ở PostgreSQL thật. Chọn net qua Content-Profile bị gateway/REST từ chối; bảy public business invoker RPC bị từ chối và không đổi snapshot |
| Protocol còn giữ | 20 replay không cấp trùng; identity/routing conflict, close trước request muộn, busy khi chưa kết luận, mất HTTP result, terminate transaction, phiên hết hạn khi đang ghi và fault receipt đều có proof |
| Unit tại source mới | `node --test --test-reporter=tap server/control/setup-status.test.mjs server/control/backend-advisors.test.mjs`: 12/12 pass, exit 0, không skip |
| Directory closure `2127028d47a2` | Run trước, exit 0; 579 test tổng / 577 pass / 0 fail / 2 skip, T11/T12 14/14. Real directory/HTTP, Auth/remote adapters là doubles. Năm file closure liên quan đã đối chiếu không đổi; toàn bộ source backend cũ không được nhận là source hiện tại |
| Cleanup | Kiểm độc lập label riêng từng native run: 0 container/volume/network; không xóa stack khác. Hai protected artifacts giữ nguyên hash |

Hai skip directory còn mở: tạo symlink fixture trên Windows và kiểm POSIX mode notification trên Linux. Các stage frontend/TypeScript/lint cũ có proof riêng trong packet closure, không được nhận là đã chạy lại ở native source này.

Backend binding native gồm 238 file, SHA256 `a20b5c5a28e00a55df46d3f31baa76146c7d6fac51a12fbcb1d65923597fcbff`. Migration-set hash `9e78e84ebbabdafb9f32b3ede14aeb40bc41f9dd1a1a6cb59b9ddd9ad0802cb7`; schema trước/sau fault cùng `f83205ede94df2b07c9546182080ed4148ac9f933ea1f5ce4a79367c3748458f`. Source được kiểm không đổi trước khi terminal và khi finalize; không kế thừa full-green proof từ source trước.

## 4. Inventory còn phải review

Catalog ghi 3.149 ordinary functions/procedures callable: 3.085 pg_catalog, 11 information_schema, 53 public; không còn net callable. Có đúng hai SECURITY DEFINER trong phần này: close dispatch và đọc receipt. Không có effective table/column/sequence grants ở tất cả application schemas mà role được USAGE. Metadata gồm signature/owner/security mode/search_path/definition hash, role membership/default ACL/extension version; không xuất body, JWT, DSN hoặc dữ liệu khách sạn vào báo cáo chung.

**`reviewedSafe=false` được giữ nguyên.** Inventory không chứng minh mọi đường gọi nối tiếp, dynamic SQL, aggregate/window hoặc đường REST bất kỳ đều an toàn. Bảy native denials là regression cụ thể, không đại diện cho toàn bộ 53 function public hoặc mọi function pg_catalog. Credential/adapter phải có allowlist, TTL/rotation và khả năng thu hồi thật, không chỉ JWT hết hạn. Chưa được bật worker từ kết quả này.

Advisors CLI 2.122.0: 760 findings, gồm 41 RLS-no-policy INFO, 7 unindexed-FK INFO, 513 unused-index INFO, 199 permissive-policy WARN; không ERROR. Còn disposition theo object, gồm policy overlap nhắc recovery role. Native denial/grant evidence không đổi WARN thành đã xử lý và không chứng minh index thừa trên workload thực.

## 5. Lịch sử lỗi được giữ

- `ebc2a9b086ac`: inventory trước khi thêm all-schema relation/sequence assertion; không là bằng chứng quyền đã khép.
- `ca2ee48aa3b4`: query privilege sequence chạm object không phải sequence; sửa bằng CASE, giữ assertion.
- `3f9d61afb44b`: audit mới bắt đúng PUBLIC-derived net table/sequence rights; không đổi run lỗi thành pass.
- `a0102aeb4338`: rehearsal chưa đến fault chủ động; assertion che mất nguyên nhân SQL. Đã giữ lỗi gốc trong lần sau.
- `cc2fd71d9632`: SQLSTATE 42501 tại tạo fixture trong schema net của vendor; dẫn đến tách phiên bảo trì đúng owner.
- Directory `74dce98b49da` trước closure run: fixture legacy còn mong continue_setup khi không có closed dispatch; đã sửa expected theo contract và giữ positive closed-dispatch riêng.

Các run lỗi native đều cleanup; raw logs giữ riêng. Chỉ `fa013390f689` chứng minh native source của checkpoint này. Không cộng số control giữa các run.

## 6. Phần nhận tiếp và nghiệm thu

1. Review/disposition callable surface nối tiếp và advisor theo object; chốt allowlist. Nối installer phiên bảo trì riêng trước target/VPS migration; thử fail/rollback/upgrade trên target đã duyệt.
2. Xây recovery credential/adapter riêng có cluster/version/hash cố định, timeout hữu hạn, không redirect, không fallback service-role hoặc JWT owner; expiry/rotation/reload/revocation thật.
3. Worker DB-clock claim/lease/token fencing, retry/deadline/concurrency hữu hạn; lock order workspace → job → dispatch; settle/audit atomic. Không provision thay owner.
4. Backfill dry-run/apply có version và audit, legacy unknown fail closed; durable admin recheck và UI đọc kết quả sau mất response/F5.
5. T10 vendor/DSN/budget/rolling overlap trước tăng replica. Một run Auth → control → directory → business → receipt thật; nối vào default full, freeze rồi full/rebuild độc lập.
6. Linux/TLS/provider/offsite restore/on-call, A/B web/Android, tải/soak/RC và pilot ít nhất 7 ngày theo kế hoạch gốc.

**70 ca vẫn not_run, 122 mục release unverified; reviewer/signoff/gates không đổi.** Chưa deploy VPS, bật signup production hoặc cam kết số người dùng đồng thời. Goal hoàn tất toàn bộ plan vẫn mở; packet local này chỉ đóng các kiểm tra cụ thể nêu trên.
