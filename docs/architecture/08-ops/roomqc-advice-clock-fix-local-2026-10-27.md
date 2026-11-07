# RoomQC — sửa quyền gói sau khi chờ khóa và nghiệm thu local

Ngày 27/10/2026. Phạm vi: phần quyền và độ bền của advice trong kế hoạch toàn
bộ VPS + signup. Bản sửa ở worktree integration; chưa triển khai lên database
đang phục vụ hoặc VPS thật.

## Kết quả và thay đổi

[Baseline1009](roomqc-advice-authority-baseline-local-2026-10-27.md) đã xác nhận
lookup trả HTTP200 sau khi trial hết hạn trong lúc chờ khóa. Migration574
`20261027131041_operations_advice_release_entitlement_clock_fences.sql` tạo
bằng CLI pin2.121.0 bổ sung kiểm thời hạn tenant sau các điểm chờ và trước
release/commit. Các nhánh service đọc lại receipt cũng kiểm lại actor/session
và policy trước khi trả kết quả đã hoàn thành.

Helper mới ở schema private, SECURITY INVOKER, search_path rỗng và thu hồi
EXECUTE khỏi PUBLIC/anon/authenticated/service_role. Bốn hàm hiện có được sửa
bằng CREATE OR REPLACE, giữ contract và quyền gọi. Không sửa migration573,
thêm bảng, xóa dữ liệu hoặc mở lại command đã dispatch. Nhánh machine ghi
nhận unknown giữ nguyên, không trả advice hoặc tự hoàn quota.

## Bằng chứng cùng source1011

| Bộ kiểm tra | Kết quả / phạm vi |
|---|---|
| Authority native | 119/119 đạt qua Auth/REST/Postgres thật |
| Clock race | 11/11: 7 trial, 2 session, 2 policy; quan sát waiter thật, clock database hết hạn; HTTP403 và journal/advice/quota/audit không đổi |
| Cửa sổ clock | Policy/command lock, audit wait ở reserve/dispatch/finish và completed replay; 3.550–3.933ms |
| Matrix quyền | 17 trường hợp ×4 đường prepare/read/dispatch/finish; 68 denial, snapshot giữ, đọc lại sau phục hồi đạt |
| Hotel hard delete | Bốn đường bị chặn; phục hồi hotel/assignment và hoàn tất dispatch gốc đạt |
| Upgrade573→574 | 35/35 native, có fault SQLSTATE22012 sau toàn body/history trước COMMIT, rollback schema/history/data và forward đạt |
| Edge trên dữ liệu upgrade | 6/6; tiền200.000 đồng tới sink nội bộ, receipt cũ đọc được; unknown giữ fence giữa hai Edge, không resend; một provider call nội bộ cho command mới |
| Hồi quy | 39 native, 59 Edge, 16 production client HTTP; restart6 + client recovery2, interruption13 đạt |
| Binding/render | 13/13 đạt, exit0, không fail/skip/cancel |
| Direct ACL | 39 bảng ở từng run: 468 browser/probe denial, 144 service denial, 81 positive, 39 snapshot không đổi |

Các clock test dùng đồng hồ thực, không sửa clock host. Matrix active subscription
hết hạn dùng ngày quá khứ trong fixture; **không phải proof UTC hoặc calendar
rollover thực**. Full matrix thu hồi quyền trong provider I/O và ngay trước
release ở Edge còn phải mở rộng; 68 denial native không thay thế proof đó.

Seed upgrade gồm hai tenant, owner/staff, checkout200.000 đồng và invoice/receipt,
mapping/trial/quyền, policy, advice completed/unknown và reservation của staff.
Rollback và forward giữ chúng, các thao tác đọc/replay không đổi tiền hoặc quota.
Đây là rollback transaction, chưa phải chạy binary cũ sau khi bản mới phục vụ.

Hồi quy giữ bài SIGKILL Edge khi provider đã nhận, exit137 và restart cùng image;
timeout provider thực45.557ms, policy3.574ms và session4.227ms hết hạn trong I/O.
Mỗi command gọi sink tối đa
một lần; không gọi provider thật. Storage/lock của client HTTP là Map/in-process,
chưa chứng minh localStorage/Web Locks trên browser hoặc Android WebView.

## Nguồn, lịch sử và bảo vệ

Source1011 file, SHA-256
`f9d933bcaef799d572775c1a833d32a5139a1effbbffd25b31bdeb5c9ddae377`;
backend binding191 file; 574 business +12 directory migrations.
[Artifact đã lọc](../../../artifacts/roomqc-advice-clock-fix-local-2026-10-27.json)
giữ kết quả, clock, advisors theo từng run và các giới hạn.

Ba run authority/upgrade/regression đều kiểm source binding và schema cuối run
không đổi, exit0, cleanup container/volume/network đúng ownership còn0. Bản
delivery, Git index, hai ledger và 70 hàng worksheet giữ nguyên ngoài tài liệu
được mirror có kiểm hash. Không mirror implementation.

Giữ lịch sử lần đầu sửa1010: ba trial race và 17 matrix đã đạt nhưng run dừng
khi khôi phục hotel mẫu với SQLSTATEP0001. Quota trigger đọc tenant_usage cũ sau
synthetic delete; fixture hiện refresh bằng update_tenant_usage trước reinsert,
không đổi quota sản phẩm hoặc bypass trigger. Phần quản lý usage/quota ở T10
vẫn cần audit luồng xóa/cập nhật và concurrency riêng; không ký từ sửa fixture.

Advisors theo workload: authority703, upgrade725, regression730. Khác số730
ở1008 không chứng minh đã sửa các finding. Chưa disposition
các advisor/đường quyền gián tiếp. Frontend182/TypeScript/lint14warnings thuộc
1006, không rerun tại1011; không gán chúng là kết quả nguồn mới.

## Việc nhận tiếp và trạng thái phát hành

Nhận [phiếu19.34](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1934-phiếu-nhận-sau-clock-fix1011):
UTC quota sau lock; full Edge offboarding; policy control/freshness/retention/abuse;
đối soát và đóng unknown lâu ngày; browser/Android. Sau đó mobile money →F3
exports →writerQ02 còn lại →Q03 →Q04 full/default-full/rebuild, rồi tám đợt VPS/
signup theo dependency. Không giao lại phần đã đạt như việc chưa triển khai.

**70 ca not_run, 122 mục unverified**, reviewer/signoff/gates không đổi.
Chưa full/default-full/rebuild/web build/browser/Android/VPS/TLS/offsite/load/
pilot hoặc nghiệm thu toàn sản phẩm. Mục tiêu toàn bộ plan vẫn đang thực hiện.
