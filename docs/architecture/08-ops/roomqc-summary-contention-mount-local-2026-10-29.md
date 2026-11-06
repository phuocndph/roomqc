# Tổng quan doanh nghiệp — tranh chấp luân chuyển và đọc khóa qua mount

Ngày 29/10/2026. Đã kiểm tích hợp local hai tiến trình luân chuyển và consumer riêng đọc thư mục output chỉ đọc, cùng UID1000 với profile triển khai. [Packet nguồn và bằng chứng](../../../artifacts/roomqc-summary-contention-mount-41bc4c64f31d-local-2026-10-29.json). Không nghiệm thu VPS, toàn bộ BG05 hoặc sản phẩm.

| Phần | Kết quả |
|---|---|
| Nguồn | 380 tệp, SHA256 `76c8badbdce241443a01e961a7a430bc51432c276929a8d12b91ed61308e3d45`; snapshot và đầu–cuối khớp |
| Database | 590 migration; schema `6d8937bfc6b3d3639d98923860bfba0ef36d2e516ddd3631812f7a8217f7be27` được phục hồi; login nghiệp vụ không được cài namespace bảo trì |
| Tích hợp | 73/73 đạt; native exit0, gồm SQL, CLI/daemon, signer, tệp và Kong/PostgREST thật |
| Reader riêng | UID/GID1000, CapEff0, NoNewPrivs; output/source chỉ đọc, ghi bị từ chối, không có DSN/signer/journal của issuer; exit0, restartCount0 |
| Nạp tệp mới | Cùng tiến trình thấy atomic rename; mất/không đọc được/hỏng/sai cụm thì ẩn credential cũ; phục hồi tệp hoặc cấp lại sau revoke không cần restart |
| Tranh chấp | Hai daemon shared journal và hai caller/journal riêng; giữ pending khi connection-limit/mutex từ chối; kill/replay trả một kết quả DB, key thua CAS không tạo hiệu ứng |
| Giới hạn | 1–2 live credential trong overlap; pending được dọn sau quyết định xác định, phiên/mutex được giải phóng |
| Hồi quy | 576 đạt, 0 lỗi, 210 bỏ qua trên 786; exit0, cùng nguồn; không tính skip là đạt |
| Cấu hình | Compose render 2/2 đạt: UID1000, private/journal/output tách biệt, consumer chỉ đọc output; không tạo tài nguyên hoặc khởi chạy profile |
| ACL và dữ liệu | 44 snapshot không đổi; 528 browser/probe denials, 164 private-service denials, 91 positive reads; tenant/staff/room/receipt không đổi |
| Cleanup | Kiểm riêng đúng ownership label: 0 container/network/volume |

Shared-journal test chủ động cho hai daemon chuẩn bị key cạnh tranh trước publication; giữ phản hồi PostgreSQL sau commit và SIGSTOP để quan sát pending/connection-limit. Separate-login test quan sát mutex727013 thật. Không giả kết quả SQL hoặc nới quyền để bài kiểm qua. Approval và tài khoản là test authority trên database độc lập, không phải phê duyệt production.

## Cấu hình đã bổ sung

- Overlay `deploy/monitoring/summary-consumer.compose.yml` gắn cả thư mục output vào Control read-only để thấy atomic rename.
- Mẫu `summary-installer.template.json` cố ý không hợp lệ khi chưa điền identity, hash và approval được duyệt; không tự suy phê duyệt từ giá trị quan sát.
- [Runbook](roomqc-tenant-summary-credential-runtime.md) hướng dẫn UID1000, mode0700/0600, budget cho cả business/directory, CLI host so với daemon image và bootstrap thủ công trước rotation.

UID1000 phù hợp USER node của Control image và profile rotator hiện hành. Packet62/62 UID10001 và run73/73 UID10001 trước đó giữ làm lịch sử riêng; checkpoint này không cộng kết quả nhiều nguồn.

Advisor có 874 findings (42 INFO:rls_enabled_no_policy; 9 INFO:unindexed_foreign_keys; 512 INFO:unused_index; 311 WARN:multiple_permissive_policies). Đây là đầu vào review, không phải số lỗ hổng được xác nhận hoặc lý do tự xóa index.

## Phần chưa chứng minh

Reader là fixture gọi hàm sản phẩm readTenantSummary với REST thật; chưa phải browser → Control API → cụm. Compose render chỉ kiểm cấu hình, chưa chạy production image/profile. Còn inventory/release theo cụm, BG02 quyền gián tiếp/orchestration/rollback, BG03 ngân sách/quota, BG04 toàn hành trình signup/email/staff, BG05 console, BG06 full integration/rebuild; BG07–BG11 staging/offsite/E2E/tải/chi phí/pilot ≥7 ngày.

Không sửa dữ liệu Supabase đang phục vụ, VPS hoặc hồ sơ actual/reviewer/signoff gốc. 122 release entries vẫn chưa xác nhận, không phải 122 lỗi; không có chứng minh sức chứa 1.000 khách sạn hoặc 100.000 người dùng đồng thời.
