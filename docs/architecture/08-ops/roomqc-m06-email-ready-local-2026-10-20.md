# RoomQC M06 — email workspace-ready và cập nhật hồ sơ: proof local

Ngày tổng hợp: 20/10/2026. **Hai lát đã local_verified; R4/T08 và các cổng phát hành vẫn mở.**
Đây là tổng hợp kết quả implementation đã chạy để làm baseline cho kế hoạch;
lượt lập kế hoạch không sửa code, migrate runtime hoặc bắt đầu deploy mới.

- [Artifact đã lọc](../../../artifacts/roomqc-m06-email-ready-local-2026-10-20.json)
- [Điểm nhận việc và kế hoạch triển khai](roomqc-vps-signup-deployment-plan-2026-10-20.md#dispatch-current)

## 1. Phạm vi và lỗi đã xác định

| Lát | Bằng chứng trước sửa | Thay đổi đã có trong integration |
|---|---|---|
| R4-EMAIL-READY | Fresh-event trên backend 527 migrations: diagnostic run 35825b7864fc nhận P4202, Auth banned vẫn tạo queue. Run 1ace98109163 chỉ có P0001, không đủ chỉ tên state | Forward migration 20261020085628; guard owner/Auth/profile/tenant/hotel/recipient, so sánh NULL-safe |
| R4-USERS-UPDATE-RECURSION | Run b876446c8e40 sau 528 migrations: browser PATCH protected tenant trả HTTP 500 / PostgreSQL 42P17, không được tính là permission denial | Forward migration 20261020090231; private boolean-only lookup cho WITH CHECK để tránh self-recursive RLS |

Không suy các state khác đều đã tái hiện lỗi ở bản cũ. Ma trận sau sửa xác nhận
hành vi trên candidate mới. Không kết luận đã có incident hoặc rò dữ liệu production.

Trigger giữ thứ tự provisioning thật: profile có thể được insert trước role/membership.
Ngoại lệ bootstrap chỉ chấp nhận marker transaction, đúng subject hoặc trusted service;
không bắt trigger có interactive session. Role/primary-owner và binding phải được kiểm
đúng mốc, không phá owner mới hoặc worker tin cậy. Recipient lấy từ Auth canonical.

Lookup RLS chỉ trả boolean, nằm trong private schema, search_path rỗng, ràng buộc
auth.uid(); không thêm schema USAGE. Chỉ thay WITH CHECK của users_update_self_or_managed,
giữ USING/column grants/protected-field trigger. Đây không phải cách dùng definer
để bỏ authorization, cũng không chứng minh toàn bộ users policies đã có live-session guard.

## 2. Source và kiểm thử đã hoàn tất

Implementation ở integration, branch codex/roomqc-parallel-integration; có diff/file
chưa commit. Scoped source **637 files / 529 migrations**, SHA256:

`4f33e1b04bfd351373704054af04b8e5aecfd26fa89b39de886c5921ad75cfe8`

Manifest bao gồm file chưa commit theo thuật toán/phạm vi trong artifact;
HEAD đơn lẻ không đại diện đủ candidate. 633/527 là baseline Auth-soft-delete lịch sử.

| Bài kiểm tra | Kết quả có phạm vi |
|---|---|
| Full control DB | 144/144, 0 fail/skip/cancel, exit 0; 129392.9974 ms |
| Focused email + registration | 4/4 là subset, không cộng thêm vào 144 |
| Build + verify local | Exit 0, 378 web assets; env synthetic loopback, không đổi .env |
| Backend A | 95d9560fba65; 529 migrations; permission_controls_verified; exit 0; cleaned |
| Backend B | 91373e6a5871; 529 migrations; expected state từ A đã completed/cleaned; exit 0; matched=true |
| Mỗi backend | 210 application checks/8 actors, 4 distribution orders; registration 106 HTTP/8 actors và 39 SQL/3 roots/13 invalid states |
| Actor/session regression | 44 SQL denials/4 roots/11 invalid states; positive trước/sau và rollback |
| Permission/service | 13 permission controls; năm service thật healthy/fault/recovery; Edge provider-disabled; Janitor controlled drill |

Email harness dùng **20 fresh events**, **18 invalid states**, **23 positive queue checks**,
trong đó ba queue từ HTTP registration commit thật. Kiểm delivery/PGMQ payload/count/
dedupe và positive sau phục hồi; rollback so full rows của **10 bảng**.
allRowMutationsRolledBack=true; sequence gaps được phép vì sequence không rollback.
Consumer/provider tắt; không gửi email Internet.

HTTP profile regression có self/managed-staff name update/read/restore hợp lệ,
staff escalation/protected primary-owner/platform/tenant/role bị chặn; cross-tenant
PATCH không sửa row và GET không lộ row. Snapshot kiểm cả full_name. Không chấp nhận
HTTP 500, timeout hoặc route không có như bằng chứng từ chối quyền.

## 3. Repeatability và advisors

A/B khớp cả bốn identity sau:

| Identity | SHA256 |
|---|---|
| Migration set | 73765c922beabd1f28fac4d260883951037b61833d08d550997ae5e5950db0c1 |
| Pre-initialization schema | 8357b5ab49d60a4ee2ce5d58c5ff57f10e8c1456aac5f4cbd7a2402febf955ff |
| Initialized schema | 6e6a86652c2c793a80c971bdaa3e5d2271eae1cb55483862ac47274714e25ba9 |
| Initialization specification | 66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae |

Cả A và B chạy native Supabase CLI 2.121.0 advisors trên initialized schema:
**645 = 17 no-policy INFO + 8 FK INFO + 485 unused-index INFO + 135 permissive WARN**.
485 thay 486 do workload/statistics; không có xóa index hoặc proof performance mới.

Catalog: 473 functions, 11 views, 358 policies, 149 triggers. Candidate graph:
1008 nodes/889 edges/25 entry paths; browser direct grant violations=0 nhưng
**allSafe=false/transitiveReachabilityProven=false**. Discovery không thay semantic/runtime proof.

## 4. Cleanup và bảo toàn

Mỗi run A/B/reproduction/intermediate đã cleanup 14 exact-owned objects. Inventory
chỉ đọc lúc 09:18:45–09:18:49 UTC ngày 20/10 theo exact compose-project labels cho
cả sáu run trong artifact cho 0 container/volume/network. Không cleanup bổ sung
hoặc xóa dữ liệu người dùng trong lượt tổng hợp này.

Primary chỉ nhận docs/artifacts đã lọc; index SHA256 giữ nguyên
`72cad3ba4118de5b36523b9c9f57fae0f7166feaae37a225c8481419e001f79f`.
Không migrate DB nghiệp vụ/CRM, không thay image/runtime/signup flag, không provider/DNS.

Các lần tái hiện fail và intermediate pass không bị xóa khỏi lịch sử. Run
2d52e8d21a9f đã pass 529 nhưng harness sau đó thêm full_name vào snapshot;
chỉ A/B cuối ở mục 2 là proof current source. Checksum log/ownership và release
image digests nằm trong artifact; raw .local không publish.

## 5. Giới hạn và nhận việc tiếp

- Chưa phủ hết caller/room-complete/checkout/admin hoặc revoke-before-commit trigger races.
- 17-table disposition, 135 policy semantics và 8 FK workload vẫn phải review.
- A/B tuần tự không thay hai backend chạy đồng thời/browser routing/cách ly.
- Janitor controlled drill không thay scheduled soak; build pass không khép performance gate.
- Chưa proof Linux/TLS/email thật/offsite restore/tải/pilot; không nâng gate L/S/P/U/B.
- Runtime quan sát cũ schema 0005/signup=false chỉ là lịch sử; lượt này không kiểm lại.

Tiếp R4-a caller → R4-b/c → R3 issuer/R5 approval → R6 atomic HealthStore.record +
gateway/runtime → R7 timed pipeline. Sau đó alert/authority/admission/budget,
signup/resume/reconcile/abuse, hai màn admin, Linux/offsite, A/B E2E/tải/cutover và
pilot ≥7 ngày. Không đóng toàn plan từ hai fix local này.
