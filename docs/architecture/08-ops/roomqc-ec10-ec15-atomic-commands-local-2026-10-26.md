# EC10–EC15 — kiểm chứng local cho command lưu quyền atomic

Ngày 26/10/2026. Thuộc T03/T04/T08; không thay phạm vi 8 đợt/27 gói/T01–T25/70 ca.

Đã thêm command backend để thay toàn bộ quyền bổ sung hoặc membership cùng năm
cờ quyền trong một transaction, có version, nhật ký và receipt. Actual Auth/REST
trên fixture Docker riêng đạt **43 kiểm tra + 3 phép kiểm đồng thời**, giữ hồi
quy hồ sơ nhân viên **30 kiểm tra + 4 races**. Lượt cuối native exit 0, kết thúc
đã xác minh source/schema và dọn hết tài nguyên đúng ownership.

**Chưa chuyển caller web/mobile.** UI đang phục vụ vẫn dùng save path cũ; lỗi
DELETE thành công rồi mất INSERT vẫn có thể xảy ra ở đường đó. Detail RPC cũ
còn mismatch; không ghi nhận đã sửa toàn EC10–EC15 hoặc hoàn tất phân quyền.

## 1. Source và thay đổi

Candidate có phạm vi **793 file / 548 business + 12 directory migrations**,
SHA `aa399401b2dbe8233059bc6a5266b141b8e101106e91b3f6ae15e3f95258286a`.
Manifest được capture trước chạy và so lại sau; không là hash toàn repository
hoặc bản deploy. Runtime binding và toàn bộ 548 migration file cũng khớp.

Migration mới được tạo bằng native CLI 2.121.0:
`supabase/migrations/20261026145640_employee_authority_atomic_commands.sql`.
Không sửa lịch sử migration, không thêm browser table grant hoặc permissive
policy, không đổi database đang phục vụ, VPS/DNS/provider hay email Internet.

[Contract cụ thể](roomqc-employee-authority-command-contract-2026-10-26.md)
chốt DTO, live authority, additive semantics, khóa/version, lỗi và recovery.
[Artifact đã lọc](../../../artifacts/roomqc-ec10-ec15-atomic-commands-local-2026-10-26.json)
giữ source refs, kết quả từng control, attempt history và giới hạn.

## 2. Kết quả actual API

Fixture cuối `67d890e9fd67`, backend `deef31efe55b`, native terminal 0.
Toàn bộ schema 548 migration được dựng mới, Auth cấp token thật, gọi REST thật;
không publish Docker ports hoặc dùng thông tin tài khoản thật.

| Nhóm kiểm | Kết quả được chứng minh |
|---|---|
| Boundary | Anon/staff tự sửa/owner khác tenant/protected target bị từ chối; read và result cũng được kiểm quyền |
| Atomic | Grant replacement và membership cùng đủ năm cờ commit với một audit/receipt; không đổi profile/roles/aggregate còn lại |
| Validation | Sai module/action/boolean, field tenant thừa, duplicate alias, thiếu cờ/hotel chính bị từ chối không effects |
| Replay/recovery server | 20 replay cùng key không ghi lần hai; lookup đọc đúng kết quả sau bỏ response ở client; key khác actor không thấy receipt |
| Concurrency | Hai editor cùng version chỉ một commit; hai tab cùng key nhận cùng kết quả; legacy write tăng version và làm editor cũ conflict |
| Delegation | Manager hợp lệ cấp được quyền đang có; không cấp được quyền hoặc cờ khách sạn mình không có |
| Rollback | Fault thực tại activity_logs và private receipt đều rollback grant/membership/version/audit/receipt; cùng key phục hồi được |
| Read model mới | Role grant + custom false trả effective=true, inherited=true, custom=false, khớp enforcement qua HTTP |

Ba phép kiểm bổ sung:

1. Transaction xóa session giữ lock; actual command chờ tại PostgreSQL barrier,
   sau revoke commit trả 403/42501 và không effects; phục hồi session lưu được.
2. Command chờ revision lock; session hết hạn theo wall clock khi đang chờ;
   sau thả lock trả 403/42501, không effects; khôi phục session lưu được.
3. Legacy PATCH đang giữ row cần revision của aggregate bị giữ: trả PT409 và
   không effects, không mắc chu kỳ chờ row/revision. Đây là bounded conflict,
   chưa thay compatibility proof cho mọi writer.

Inner runner đã tới verifySource và schema fingerprint sau diagnostic khớp.
Outer driver so toàn manifest 793/runtime/548 migration trước-sau. Không có
full control/default full backend/independent rebuild cho candidate này.

## 3. Failed history, advisors và cleanup

Attempt đầu `3c864f8eee92` / `f46a94583cae` native exit 1 sau 29 control đạt;
request đọc cấu hình bằng manager bị 403 vì fixture vừa được regression khôi
phục created_by về owner. Đây là boundary đúng; sửa fixture để staff do manager
tạo, giữ nguyên product boundary rồi chạy lại. Không đổi denial thành success.
Hai attempt có source hash riêng trong artifact, không gán pass của lần cuối
cho source/harness trước đó.

Cả hai cleaned=true. Kiểm tra Docker độc lập bằng exact run label: 6 kiểm tra
container/network/volume, tất cả exit 0 và số lượng còn lại 0. Không dọn container,
network hay volume của dự án khác.

Native advisors 2.121.0 scan schema hiện hành: **667 findings** — 21 INFO
rls_enabled_no_policy, 7 INFO unindexed_foreign_keys, 504 INFO unused_index,
135 WARN multiple_permissive_policies; không có ERROR được báo. Hai INFO mới
là bảng private version/receipt có RLS, không policy và đã revoke direct ACL
để mặc định từ chối. Không dùng scan exit 0 để coi mọi finding đã giải quyết;
policy/index/FK cũ vẫn cần disposition theo caller/workload.

## 4. Phần nhận tiếp và nghiệm thu

1. Chuyển active hooks/panels web/mobile sang command mới; pending key/payload
   theo actor/session/workspace/cluster/target, F5/result recovery và draft lifecycle.
2. Sửa detail RPC/readback/UI cùng additive enforcement; thêm system-role,
   owner và alias HTTP combinations, cảnh báo inherited rights rõ ràng.
3. Kiểm context switch/logout/revoke, actual network response loss và browser/
   Android; đóng direct-write compatibility sau caller migration, không trước.
4. Giữ hồi quy boundary791 và metadata; review indirect/current19/workflow/
   advisor, freeze candidate rồi full control/backend/rebuild đúng source.
5. Tiếp T07 và các đợt còn lại của [plan](roomqc-vps-signup-plan-current-2026-10-26.md).

Discard HTTP response ở client test không phải fault transport thật; chưa
chứng minh F5/hai tab trình duyệt hoặc pending storage. Chưa chạy lại toàn 55
boundary controls trong lượt này, không suy full authority matrix từ 43 checks.

122 release entries vẫn unverified, 70 worksheet rows vẫn not_run; gate,
reviewer và signoff không đổi. Local command proof không ký thay các ca release,
Linux/TLS/email Internet/offsite DR/on-call/A-B/E2E/load hoặc pilot ≥7 ngày.
