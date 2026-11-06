# RoomQC — giao diện mục tiêu báo cáo và phục hồi lệnh

Ngày27/10/2026, Asia/Bangkok. Lát Q02/F2 trong T03/T04/T08/T22, phục vụ mục
tiêu toàn bộ VPS + signup. Đây là bằng chứng frontend có phạm vi, chưa nghiệm
thu sản phẩm hoặc xác nhận website/VPS đang phục vụ bản mới.

## Thay đổi ở source990

Source SHA `edc7ea2140dec3fd3b91bac7391cd01547d0a26efd9c03328614d27724de07c4`,
990 file có phạm vi. Backend binding183file,571business+12directory migrations
giữ nguyên backend980. Native214/214 vàfull440/440 thuộc980; không chạy lại hay
gán các lần chạy đó cho frontend990.

| Phần | Hành vi đã triển khai |
|---|---|
| Client | `src/lib/report-targets.ts`: ba RPC, DTO/scope/revision/metric/range validation, thời hạn20giây, body≤32KiB, no-store và kiểm session/runtime trước/sau response |
| Reader | `useReportTargets`, financial adapter và monthly adapter: bỏ đọc bảng trực tiếp; cache theo actor/session/runtime/tenant/hotel/tháng/epoch; denial không hiện cache cũ, legacy review không giả0 |
| Form | Dùng chung `ReportTargetEditor` cho SetTargetsDialog và mục tiêu tháng tại FixedCostsSettingsPage; một batch cho cả bộ chỉ số, revision/can_manage từ server, controlled draft |
| Giá trị | `123.45`/`123,45` giữ số thập phân;0 là giá trị, blank là bỏ chỉ số; giữ chỉ số không sửa, âm GOP đúng contract. Không đoán dấu phân cách hàng nghìn hoặc làm123.45thành12345 |
| Pending | Ghi command/key/payload/revision vào localStorage trước network, không cótoken; scope từng actor/runtime/tenant/hotel/kind/month. Không ghi đè key khác; nhấp lại bị chặn |
| Recovery | Mở lại/cùng actor đăng nhập lại/hai tab có nút kiểm lần lưu trước. Lookup completed phải khớp ID/scope/values/revision; not_found chỉ replay cùng key/payload, không tạo key mới |
| Response muộn | Đổi actor/session/hotel/runtime, A→B→A hoặc unmount không nhận success/toast/cache invalidation cũ; pending còn để đối soát |
| Legacy | Hiện review_required, không chọn hàng trùng; xác nhận chủ động và bộ giá trị không rỗng mới gửi resolve. Authority và archive vẫn do backend980 quyết định |
| Draft | Save lỗi giữ bản nhập; refetch bị từ chối ẩn form/data nhưng giữ draft chưa gửi trong bộ nhớ đúng scope. Đổi scope khởi tạo draft mới |

Receipt là kết quả lịch sử. Sau recovery, hook tải lại cấu hình hiện thời;
không lấy các giá trị trong receipt cũ ghi đè cache mới. Các loại financial và
monthly chưa hợp nhất; luồng ghi chi phí cố định không thuộc thay đổi này.

## Kiểm thử và giới hạn

- 424/424 frontend trên28file, exit0; subsetUTC170/170 cũng đạt.
- TypeScript project ứng dụng exit0; lint13file:0lỗi/2cảnh báo no-explicit-any.
- 319/330test identities cũ được giữ;11test reader bảng cũ được thay bằng DTO/
  adapter/hook và form tests;105identities được đưa vào run mới. Không tuyên bố
  giữ nguyên toàn330test cũ.
- Lần chạy đầu:421/422 vàUTC167/168, exit1. Assertion đọc state ngay sau
  refetch trước notification của React Query; sửa chờ error được render rồi
  kiểm cached data bị ẩn. Giữ failed history; thêm ca draft sau denial và
  monthly legacy review trước lần chạy cuối.
- Có fixture HTTP/mocks cho response loss trước/sau commit, relogin/reload/hai
  tab, timeout, payload giới hạn, stale DTO, storage lỗi và UI. Chưa có TCP
  response bị cắt thật, browser/Android, download/render hoặc deployed caller.
- Source/backend binding/migration/protected primary/index/ledger/70worksheet
  rows giữ trước–sau. Chỉ mirror tài liệu/artifact, chưa mirror implementation.

Không dùng mock HTTP để khẳng định đã vượt qua bài remote commit mất response
ở môi trường thật. Bộ70ca vẫnnot_run,122releaseentriesunverified; reviewer/
signoff/gates không đổi.

## Phần phải khép kế tiếp: kết thúc an toàn lệnh bị từ chối

Hiện client giữ pending sau HTTP400/403/409/timeout cho tới khi đọc được một
completed receipt hợp lệ. Điều này tránh mất kết quả nhưng một key bị stale
revision có thể bị kẹt: retry đúng key vẫn409, không thể sửa payload trong key
đó và không được tạo key mới khi request cũ chưa được chặn ghi muộn.

Không tự xóa key khi lookupnot_found hoặc nhận409. Revision gồm counter và
fingerprint của hàng/notes; trusted notes có thể đổi rồi quay lại nên chỉ
thấy fingerprint khác không chứng minh một request cũ không thể commit sau đó.

**Nhận tiếp trong T03/T04/T08/T22, trước khi đóng F2target:**

1. Thêm forward migration và server cancellation/result contract dùng cùng
  actor/key mutex; cancellation thắng thì ghi kết quả bền vững chặn mọi save
  muộn cùng key. Save đã commit thắng thì trả completed receipt gốc.
2. Giữ scope/session/assigned hotel và authority hiện thời; audit/result atomic,
  không sửa giá trị hoặc revision khi chỉ hủy lệnh chưa áp dụng. Replay/lookup
  đọc cả completed/cancelled, payload khác key phải conflict.
3. Nối client/UI: nút hủy an toàn sau đối soát, giữ pending nếu cancel unknown;
  chỉ bỏ pending sau server terminal receipt khớp. Không hứa nút Đóng là hủy.
4. Native Auth/REST: cancel-first/save-first/race qua khóa thật, trusted notes
  đổi→trả lại, invalid/stale/denied, audit/receipt fault rollback và expiry/revoke;
  frontend replay/reload/two tabs. Upgrade có dữ liệu giữ receipt/pending cũ.

Đây là việc code/local có thể làm, không phải chờ khóa/quyền external. Chưa
deploy571hoặc990độc lập; bundle còn cần terminal recovery, populated upgrade,
native regression theo server delta và browser/E2E trước đề nghịcutover.

Sau khi khép target: advice/mobile → F3export và upgrade566→571→delta mới →
writerQ02 → workflow/indirect/advisorsQ03 → freeze/default-full/rebuildQ04 →
T07 →T09/T10 →T11–T13 →T14–T17 →T18–T20 →T21–T24 →T25pilot≥7ngày.
Toàn mục tiêu VPS/signup vẫnactive.
