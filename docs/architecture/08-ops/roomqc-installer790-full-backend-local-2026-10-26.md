# RoomQC — full timed backend trên checkpoint installer790

Ngày 26/10/2026, Asia/Bangkok. **Một lượt default full backend đã hoàn tất,
native exit 0**, run `ce2e6829dae8`. Đây là bằng chứng local có phạm vi cho
T01/T03/T06/T08, chưa nghiệm thu toàn bộ VPS + signup hoặc mở gate.

## 1. Source và kết quả cuối

Candidate giữ nguyên **790 file, 546 business + 12 directory migrations**,
SHA `d4cea5631bf173e308c186fe088534f2700ccc53c49f5e934a58a262adf160cf`.
Runtime binding159 file:
`09f74fb6c7ff714adc3dda1db859b55c75c7b08094759f2d478ac9d5aa5611f2`.
Manifest có phạm vi, không là hash mọi file repo hoặc release đang phục vụ.

Lệnh thực chạy: `node scripts/test-control-backend-sandbox.mjs --run`.
Không dùng diagnostic hoặc clock giả thay full timed drill. Terminal bắt đầu
`1793018927352`, kết thúc `1793022387811`, native exit0/signal null/spawn error null.
Phase cuối `permission_controls_verified`; source binding được kiểm lại cuối,
schema/services phục hồi và cleanup hoàn tất. Source được hash độc lập sau run
khớp trước run. Lượt này không sửa product hoặc serving data.

[Artifact đã lọc](../../../artifacts/roomqc-installer790-full-backend-local-2026-10-26.json)
giữ terminal, source/image/schema/config hashes, timeline và counters có phạm vi.
Raw ownership/env/credentials/logs ở thư mục riêng, không mirror vào primary.
[Full control358/358](roomqc-t08-release-installer-local-2026-10-26.md) là kết quả
trên cùng source đã có; không coi lượt backend này là một lần chạy lại control.

## 2. Managed health đã thử thực tế

| Nhánh | Bằng chứng thực chạy |
|---|---|
| Nền dịch vụ | Auth, REST, Storage, Realtime, Functions; worker managed CLI và Prometheus/exporters thật, directory instance riêng |
| Credential | Rotate/disable khi metrics response đang giữ, old next-cycle bị chặn, session mới và recovery; sample muộn không ghi đè |
| Policy/target | Command có version/reason/receipt/replay, old worker/target bị chặn, restart với cấu hình mới |
| Release | Approval/catalog thay đổi, old cycle bị chặn; actual Functions redeploy, installer rebind và worker restart đủ5probe |
| Năm fault | Lần lượt dừng Auth/REST/Storage/Realtime/Functions, giữ ít nhất60giây và3mẫu lỗi; restart worker giữa fault vẫn giữ latch |
| Phục hồi liên tục | `610765ms` từ recoverySince đến lastObservedAt mới đạt healthy và hết latch |
| Metrics stale | Dừng Prometheus; worker not-ready, health unknown và reason METRICS_STALE, admission vẫn đóng |
| Metrics trở lại | firstValidAt mới và warmup lại; final warmup `324970ms`, đủ5probe tốt và healthy |
| Shutdown | Worker exit0, hai pool đóng, rendered monitoring binding không đổi |

Admission luôn `manual_closed` cùng manual/operator/backup gate; health tốt không
tự mở nhận khách. Fixture không tạo backup proof giả hoặc triển khai vào VPS.
Scope số đo là Docker Desktop VM, chưa là metric Linux host production. Approval
issuer là synthetic, không thay provenance/rotation production hoặc offsite DR.

## 3. Các hồi quy nghiệp vụ vẫn được giữ

Lượt default không bỏ các stage trước/sau managed health. Provider44, lifecycle89,
email-admin114, mutation-caller294 và final permission13 checks đạt theo contract
của từng stage. Invitation/delivery/recipient và schema initialization giữ các
assertion có trong runner; sink nội bộ không thay kiểm hộp thư Internet.

Direct no-policy inventory19 và populated parent-FK23 đạt; đây không là proof
mọi RPC/Edge/trigger gián tiếp an toàn. Hotel scope280, account/session1764 với
20 scoped races, employee edit30/4races và các suite self-profile/password đều
verified ở phase cuối. Các counters là các phép kiểm có thể lồng nhau; không
cộng thành một tổng E2E hoặc70release cases.

Catalog quyền mới đã được [đối chiếu riêng](../../../artifacts/roomqc-current19-indirect-caller-disposition-2026-10-26.json):
business migration set, function authority, no-policy grants, policies, triggers
và graph counts khớp catalog lịch sử cùng546migrations. Graph là discovery; vẫn
còn semantic/runtime disposition và các đường workflow chưa khép.

## 4. Cleanup và kiểm độc lập

Runner xác nhận cleaned=true. Kiểm Docker độc lập sau terminal, theo đúng label
của run: container0/network0/volume0, cả3lệnh exit0. Không prune toàn hệ thống,
không dọn tài nguyên serving/CRM hoặc fixture của lượt khác. Thư mục private
bằng chứng được giữ, không phải runtime đang phục vụ.

Primary index và hai delivery ledgers được giữ nguyên.122release entries vẫn
unverified,70dòng worksheet vẫn not_run; owner/reviewer/signoff và gate không đổi.

## 5. Phần còn mở và lần triển khai kế tiếp

1. [EC10–EC15](roomqc-ec10-ec15-execution-and-acceptance-2026-10-26.md): baseline
   actual Auth/API, effective permission/readback và lưu atomic. SQL fixture
   đã có mismatch có điều kiện; chưa dùng nó thay kết quả API hoặc giao diện.
2. Current19 indirect/workflow/offboarding, policy/FK workload và advisors cần
   disposition. Lượt full này **không có native advisor scan mới**.
3. Independent rebuild trên candidate cuối còn thiếu. Nếu API baseline dẫn tới
   delta sản phẩm, source790 là lịch sử; candidate mới cần full control/backend/
   independent rebuild phù hợp. Không gán proof790 cho source đã đổi.
4. Lịch sử stability follow-up `15eb` vẫn mở; một lượt thành công không chứng
   minh root cause cũ đã được xử lý.
5. Tiếp đủ T07alerts, T09/T10admission/budget, T11–T13signup, consoles, Linux/TLS,
   offsite backup/restore/on-call, simultaneous A/B, browser/Android E2E, tải/soak,
   RC và pilot. Không tuyên bố production ổn định hoặc100.000user đồng thời.

Đây là packet bằng chứng local, chưa đóng toàn T06/T08 hoặc gateL/S/P/U/B. Chỉ
mirror report/artifact đã lọc; không có deploy, DNS/provider/Internet email mutation.
