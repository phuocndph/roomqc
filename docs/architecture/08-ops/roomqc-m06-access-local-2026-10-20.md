# M06/R4 — kiểm chứng local quyền truy cập và direct-write

Ngày 20/10/2026, Asia/Bangkok. **Chỉ đạt từng phần local; R4/T08 vẫn mở.**
Đây là báo cáo các process đã hoàn tất ở đợt implementation trước, được đối chiếu
lại khi chuẩn bị kế hoạch; không phải vừa deploy hoặc test VPS. Source vẫn ở
integration, chưa commit/sync implementation vào checkout chính. Bản sao báo cáo
và artifact trong checkout chính không có nghĩa code đã đồng bộ.

Liên kết: [artifact đã lọc](../../../artifacts/roomqc-m06-access-local-2026-10-20.json),
[triage](roomqc-m06-advisor-triage-2026-10-19.md),
[điểm nhận việc](roomqc-vps-signup-execution-plan-2026-10-19.md#243-phiếu-đợt-đầu-khép-phần-r4-còn-dở-trước-khi-nối-runtime).

## 1. Phạm vi và source

- HEAD integration: 5cb583729ce055db64df8b192f10476db1fa99b8, nhánh
  codex/roomqc-parallel-integration; gồm nhiều diff/untracked chưa commit.
- Source có **525 application migrations**, directory source đến 0007.
- Scope manifest backend: 626 file / 525 migrations, SHA256
  3df54d7745d75a98bd3ccbaec65d568321c19213f288907b4c8ddb8925e85af0.
  Đã tính lại theo thuật toán trong artifact và khớp.
- Scope frontend: 11 file được liệt kê trong artifact, SHA256
  f21fd2796e452bb01017b91c65a683bfe1a2edfdf1248aaffb631dcd6d14ac63.
- Đây là **scope manifests**, chưa phải signed/approved release artifact hoặc
  chứng nhận toàn bộ source tree. Không đưa raw token, secret, DSN vào báo cáo.

## 2. Thay đổi đã có trong source

Migration actor/session 20261019161809_access_actor_and_distribution_guards.sql
và forward migration 20261020031717_distribution_direct_write_boundaries.sql;
không sửa checksum migration đã replay, không áp lên DB khách sạn đang phục vụ.

1. Bốn bảng distribution không cho browser ghi trực tiếp INSERT/DELETE/table
   UPDATE; revoke cả column grants. Chỉ authenticated UPDATE(notes) ở order,
   qua live actor/session/hotel membership guard. service_role giữ quyền vốn có.
2. Direct REST không được đổi tenant/hotel/assignment/creator/status/totals hoặc
   lách qua child rooms/items/batches. Aggregate và stock giữ nguyên khi deny.
3. RPC create lưu reverse link của **một** supplement trong cùng transaction.
   Hook tạo từ supplement và seed demo bỏ PATCH sau tạo; từ chối kết quả thiếu
   success/order_id. Không chạy seed vào DB nghiệp vụ.
4. Email admin có caller-JWT/live SQL session guard; list/count distribution và
   hook count có test. Không coi đây là phủ hết các legacy definer/workflow.

## 3. Kết quả đã hoàn tất

| Kiểm chứng | Kết quả và phạm vi |
|---|---|
| Fresh backend A | dd45e76bae82; 525 migrations; exit 0; permission_controls_verified |
| Fresh backend B độc lập | 0e3ec605323b; 525 migrations; exit 0; buildRepeatability.matched=true |
| Mỗi backend | 176 application checks, 8 real Auth actors, 4 orders; 20 SQL actor/session denials với positive trước/sau, rollback; Edge email thật/provider disabled |
| Service/permissions | Năm service có positive/fault/recovery; 13 permission controls; Janitor vendor controlled drill old-drop/future-create/roundtrip giữ static hash |
| Full control/DB | 128/128; fail/skip/cancel 0; exit 0; 134529.4329 ms |
| Focused frontend/email | 27/27 ở 5 file; exit 0; gồm 5 test hook create từ supplement |
| Build + verify:build | Config synthetic loopback local; exit 0; 378 assets; không phải production config/E2E |
| Cleanup | 14 exact-owned objects/lượt; cleaned=true; kiểm labels lại không còn container/network/volume của A hoặc B |

Không cộng các bộ/lượt thành số acceptance case. Hai fresh builds chạy tuần tự
không thay cho T21/G01–G03 có hai backend A/B hoạt động đồng thời qua ứng dụng.

## 4. Tái lập schema và giới hạn artifact

Cả A/B dùng self-hosted/v0.8.3 tại
bc27d2661edd09a5d0b8d76ce33da6d4071a756e, cùng tám image digests trong artifact:

| Nội dung so sánh | SHA256, giống nhau giữa A và B |
|---|---|
| Pre-initialization schema | 43532b7e7ec07d8764fae859fb77a50e9f03de0bdd7511ff4e9f7646fa615117 |
| Initialized schema | c61528eb4241fb0448cd304535bb101b758546f04a24671ebcd5e0a50b53a5cb |
| Migration set | 962030ea4b52db78f2001a22c531f258701c1836f80de23f3347c2a86e674095 |
| Init specification | 66b32e8b785352b778db3a6497b3ef51263bb1055a08f9fc6aaf8bb34c084bae |

Một assertion chẩn đoán bổ sung sau B ban đầu **fail** vì so bundleHash của
runtime.compose.json theo từng run. File đó có tên/path/credential tổng hợp riêng
nên không byte-identical. Đây không phải B fail, không sửa gate để bỏ drift.
Đã đối chiếu đúng schema/migration/image/init-spec và chạy assertion lại exit 0.
R5 vẫn phải tạo approved deployment artifact; không dùng bundleHash per-run làm
trust root hoặc tuyên bố đã có reproducible production bundle.

Lệnh backend dùng --run --advisors-cli với native CLI 2.121.0; B thêm
--expected-build-state tới ownership.json A completed/cleaned cùng source.
Private state/log paths và SHA256 nằm trong artifact, đều thuộc integration.

## 5. Advisors và quyền chưa đóng

Cả hai có **650 findings**, không đồng nghĩa 650 lỗ hổng: 17 no-policy,
8 unindexed FK, 490 unused-index INFO, 135 permissive-policy WARN.
Catalog có 17 no-policy tables, 469 functions, 11 views, 358 policies, 13 FK;
browserDirectGrantViolations=0 nhưng **allSafe=false** và
**transitiveReachabilityProven=false**.

Catalog direct-write A xác nhận anon không DML/writable columns; authenticated
chỉ notes ở orders, không writable columns ở ba bảng con; service_role giữ quyền.
Cần tiếp tục map caller/views/definers, rà policy operation/role, workflow RPC và
FK workload. Không thêm policy rộng hoặc xóa index để giảm số finding.
scheduledSoakVerified=false; controlled Janitor drill không thay soak staging.

## 6. Thất bại trung gian và giới hạn kiểm thử

- Build đầu tiên thành công nhưng verify:build fail vì thiếu VITE_SUPABASE_URL.
  Lượt cuối dùng config loopback/synthetic và build+verify đều exit 0.
- Cảnh báo vendor chunk lớn khoảng 14 MB còn tồn tại; cần đo tải trang/mobile ở
  T17/T22/T23. Không thay build pass bằng nhận định UI nhanh.
- Chưa browser E2E hook/seed demo/full signup; không gửi email thật, không DNS.
- SQL actor denials không thay mọi HTTP session/role case của các legacy RPC.
- Các process đã kết thúc; lượt lập plan chỉ đọc state/log/source và runtime,
  không chạy lại backend hoặc thực hiện mutation trên hệ thống phục vụ.

## 7. Runtime và bước tiếp theo

Snapshot read-only 10:34 +07 ngày 20/10: direct/proxy readyz HTTP 200, directory
0005-health-snapshot-guard.sql; control image
sha256:a65408e99b5cc9f012c582be7e0c46b211d089e605c44335e194e38dc73136e1;
signup=false. Primary index giữ
72CAD3BA4118DE5B36523B9C9F57FAE0F7166FEAAE37A225C8481419E001F79F.

Thứ tự còn lại: R4 reachability/policy/FK → R3 production issuer/R5 artifact →
R6 gateway + credential-revision guard **ngay transaction HealthStore.record**
và probe runtime → R7/pipeline/timed drill. health-runtime hiện fail-closed khi
chưa được cấp adapter; không đổi thành positive fallback. Sau đó alert,
admission/budgets, signup/resume/job/UI, Linux/offsite/A-B E2E/load và pilot.
Không mở signup, sync implementation hoặc deploy chỉ từ kết quả local này.
