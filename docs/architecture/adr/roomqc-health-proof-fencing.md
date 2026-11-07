# ADR — bằng chứng health được kiểm lại cùng giao dịch ghi và admission

Ngày: 22/10/2026. Phạm vi: directory control-plane; checklist con T06/T08,
không thêm task/case hoặc phê duyệt gate. Source chỉ ở worktree integration.

## Vấn đề

ProbeSessionManager kiểm credential sau khi gọi dịch vụ nhưng kết thúc giao
dịch đó trước khi HealthStore ghi snapshot. Installer có thể rotate giữa hai
điểm này. Kết quả cũ từng được ghi, tăng generation và có thể tiếp tục được dùng
để xét nhận khách mới. Một assertion trước write không bảo vệ transaction sau.

## Quyết định

HealthStore bắt buộc nhận probeEvidence version1, không có fallback từ năm
boolean hoặc snapshot legacy. Contract gồm binding đầy đủ được tính lại hash,
credentialRevision, policyVersion, targetFingerprint, targetVersion và checkedAt.
Binding chứa định danh endpoint/inventory/credential và approved release,
không chứa token, user/session ID, mật khẩu hoặc ciphertext.

HealthWorker đọc context policy/target trước network, nhận probes + evidence
từ adapter manager, ghép evidence sau collection. managedHealthProbe bắt buộc
server-owned storage digest và gọi serviceProbeConfiguration; không lấy
settings từ body client. Default CLI chưa cấu hình manager vẫn fail-closed.

Trong cùng giao dịch HealthStore, sau advisory lock727001:

1. Kiểm lại sample/target/scope/disks/budget và thời điểm binding.
2. Đọc live credential metadata + cluster + policy; dùng clock_timestamp sau
   khi lấy lock để kiểm proof và credential, không dùng clock trước khi chờ.
3. Kiểm ready/revision/binding/expiry, endpoint/inventory/credential/release/schema,
   policy version và target version. Proof tối đa30s, future skew tối đa5s;
   Auth/probe credential phải còn hơn30s.
4. Sai thì rollback trước sequence/snapshot/latch/event. Đúng mới evaluate và
   ghi snapshot cùng health event và operator latch như contract hiện hữu.

Admission so snapshot proof với live metadata và binding tính lại từ inventory
và immutable catalog approval. Catalog.expectation chỉ trả approved identity,
không trả/refresh credential; get dùng validation vẫn kiểm expiry của catalog
token như trước. Catalog thiếu, endpoint/approval đổi, credential rotate/
refreshing/recovery/hết hạn đều chặn mới, kể cả snapshot vẫn còn120s freshness.
Public health chuyển unknown nhưng giữ số đo lịch sử để chẩn đoán.

Không giữ database transaction trong lúc gọi Auth/REST/Storage/Realtime/Functions.
Transaction/socket deadline, worker cancellation/concurrency/stale sweep được giữ.

## Quyền và khóa

Migration directory0008 là forward migration theo manifest riêng của repository,
không phải migration Supabase nghiệp vụ. Không sửa checksum0007.

API/worker/metrics chỉ được SELECT bảy cột metadata của probe_credentials:
cluster_id, credential_ref, binding_hash, revision, state, auth_expires_at,
probe_expires_at. SELECT toàn bảng, envelope, Auth user/session và mọi write vẫn
bị từ chối. Runtime probe/installer giữ phân quyền riêng từ0007.

Trigger BEFORE STATEMENT INSERT/UPDATE/DELETE lấy cùng transaction advisory
lock trước row locks. Trigger SECURITY INVOKER/private, không là callable RPC;
không cần cấp UPDATE cho metadata readers hoặc dùng SECURITY DEFINER để đọc key.
Thứ tự statement-level tránh deadlock khi direct installer update gặp một
HealthStore đang giữ advisory lock và cần đọc credential row.

Không thêm monotonic-revision guard tùy tiện: trusted installer có quyền reseed/
quarantine; các fault drills cố ý sửa/khôi phục metadata. Hệ thống không hứa
chống table owner/superuser cố tình vô hiệu hóa trigger hoặc thay approval.

## Warmup, rollout và rollback

Binding/revision/policy/target thay đổi thì bắt đầu lại warmup/recovery windows;
không kế thừa trạng thái healthy cũ. Latched critical resource reasons vẫn giữ,
chỉ bỏ sau recovery đã quy định. Đây là lựa chọn fail-closed: refresh credential
cũng có thể tạm chặn nhận khách trong thời gian warmup; khách đang dùng giữ route.
Tối ưu continuity cho cùng session, nếu cần, phải có thiết kế/proof riêng.

Không backfill proof cho snapshot cũ từ boolean. Sau nâng cấp, snapshot thiếu
proof bị coi chưa xác minh, cần collection mới + warmup/operator approval.
Migration trước, restart candidate API/worker tương thích sau, giữ nhận mới đóng
trong rollout. Không deploy ở lượt local này. Runtime cũ không được coi là đã
nâng cấp vì source mới hoặc migration file mới xuất hiện trong worktree.

Rollback binary/config tương thích có review; không down-migrate hoặc xóa
credential/health/audit để dashboard xanh. Đóng nhận mới nếu cần; không đổi
mapping/database khách đang hoạt động. Restore và upgrade thực cần staging.

## Phạm vi bằng chứng còn phải hoàn tất

Directory tests dùng credential bundle synthetic và callback dịch vụ có kiểm
soát để chứng minh transaction boundary, không chứng minh chữ ký của năm dịch
vụ trong cùng pipeline. Test GoTrue/manifest/monitoring riêng không tự hợp thành
full-vendor timed pipeline. Issuer automation/cross-replica approval revision,
real five-service timed health, Linux/TLS, simultaneous A/B, E2E/load/pilot vẫn
theo plan. Không đóng toàn T06/T08 từ ADR này.
