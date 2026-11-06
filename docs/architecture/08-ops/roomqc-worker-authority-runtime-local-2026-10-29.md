# Worker: quyền, lease và phục hồi — native local, 29/10/2026

Đã bổ sung kiểm core worker trong các tiến trình Linux riêng, dùng scoped HTTP RPC và PostgreSQL thật. Các bài mới không truyền JWT owner cho worker và không gọi provision từ worker.

Nguồn **341 tệp**, SHA256 5e81ca30746fa9791bb78af6b384f899759e0f7ff55b11ff7fdcab2ed35284a8; run 2f2fddea5a4e; **587 business/21 directory migrations**. [Packet đã lọc](../../../artifacts/roomqc-worker-authority-runtime-2f2fddea5a4e-local-2026-10-29.json).

| Kiểm | Actual |
|---|---|
| Toàn diagnostic setup-worker | **56/56** kiểm cơ chế đạt, exit0; gồm worker/backfill hiện có và matrix mới |
| Matrix quyền và phục hồi mới | **18 quan sát kiểm đạt**, gồm 4 lần chờ hết lease bằng DB clock thật; 7 witness và 1 SIGKILL; không phải 18 hành trình sản phẩm độc lập |
| Hai worker | Hai PID khác nhau; cả proof closed và committed; worker mới tiếp quản lease đã hết, worker cũ settle=false và snapshot directory không đổi |
| Control cùng nguồn | **534 pass/0 fail/205 skip**,739 tổng,exit0 |
| Nguồn/schema | Manifest đầu–cuối khớp; schema trước=sau 5f71f1b67e698fc238a11bdcbdc4a6b8ac48fddc8c4eeb057f059a95ecc92951; delta chỉ3 tệp harness, không sửa runtime hoặc migration |
| Cleanup |17 role fixture gỡ bỏ, baseline39→39; kiểm Docker độc lập0 container/volume/network đúng label |

## Các cửa sổ đã chứng minh

1. Sau claim/trước RPC: thu hồi scoped credential thật; worker chuyển needs_review, không business write hoặc terminal dispatch. Không fallback sang service-role.
2. Owner session bị xóa trước claim: service chỉ đóng dispatch có sẵn, không tạo khách sạn; owner provision RPC tiếp theo bị quyền hiện hành từ chối. Khi business đã commit, xóa session sau claim vẫn đối soát đúng tenant/hotel cũ.
3. RPC đang in-flight: trigger fixture giữ trước INSERT terminal; pg_locks chứng kiến remote backend chờ advisory. Revoker UPDATE credential chờ đúng remote PID qua pg_blocking_pids. Nhả: RPC đã được chấp thuận commit một proof; lần RPC kế tiếp bằng khóa vừa thu hồi bị từ chối.
4. Remote đã commit/trước directory settle: withdrawal của release fixture khiến settle=false, snapshot directory/business không đổi. Phục hồi release rồi chờ lease thật hết; claim mới dùng nguyên proof và một activation.
5. Hai worker: giữ kết quả terminal cũ trước settle, chờ lease thật hết, worker thứ hai tiếp quản. Kiểm cả closed và committed; đúng1 job/1 dispatch/1 audit terminal,2 attempt có lease_expired, result cũ không ghi đè.
6. SIGKILL sau remote proof/trước settle, xóa owner session, chờ lease hết rồi restart. Giữ tenant/hotel/trial/email deliveries và toàn snapshot11 bảng; lần restart kế tiếp idle.

**Ranh giới quyền:** thu hồi trước RPC thì bị từ chối. Một RPC đã giữ credential SHARE lock được hoàn tất trước revoker; directory chỉ đối soát proof của dispatch cũ khi lease/release còn hợp lệ. Đây là protocol được kiểm, không phải cam kết revoke atomic xuyên hai database.

## Giới hạn và phần tiếp theo

- Database fresh trên cùng một PostgreSQL host; dispatch/job/release được seed bằng SQL quản trị fixture. Không thay hành trình public signup/email hoặc E2E web/Android.
- Child chạy core worker; chưa nhận cấu hình daemon/non-root/mount ở VPS từ run này. Owner revoke và release withdrawal là fault SQL có ownership; không là test UI của các thao tác đó.
- Chỉ nhận các cửa sổ RA13/RA14 nêu trên. Matrix hai API173/173 và directory173/173 giữ nguồn lịch sử riêng, chưa chạy lại trên341.
- Advisors có247 WARN multiple_permissive_policies cần review; tổng810 findings gồm cả INFO, không đồng nghĩa810 lỗi bảo mật.
- Tiếp explicit generation-publication/old-writer windows, nâng cấp dữ liệu cũ và security disposition để khép BG02. BG03–BG11, full candidate/rebuild, VPS/DR/E2E/tải/pilot vẫn mở.
-122 mục release chưa ký nhận; actual/reviewer/signoff/gates không đổi.

[Hồ sơ toàn mục tiêu VPS + signup](roomqc-vps-signup-execution-dossier-2026-10-29.md).
