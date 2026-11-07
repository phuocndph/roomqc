# RoomQC — phân việc song song bằng Git worktree

Ngày: 17/10/2026, Asia/Bangkok. Theo yêu cầu tăng tốc triển khai của chủ dự án.

## Cập nhật mới nhất: Edge worker HTTP local — 19/10/2026

Đã kiểm thử entrypoint thật với runtime riêng trên DB restore: 23/23 kiểm tra
HTTP/DB và 13 Node regression đạt. 58 tenant mẫu kiểm chứng scope, batch 50,
auth, lặp không trùng và retry outbox. Tài nguyên/khóa thử đã dọn, backup giữ.
Không đổi DB/image 8082 hoặc bật lịch/provider; không đóng A0–A4. Còn staging,
chính sách expiry, backup offsite/Storage/Vault và thử tải.
[Báo cáo đầy đủ](roomqc-edge-http-local-2026-10-19.md).

## Mốc E2E và khôi phục — 19/10/2026

Đã kiểm tra browser directory/hồ sơ/phục hồi job trên bản sao đầy đủ và thử
restore PostgreSQL độc lập. Bổ sung backup hàng đợi PGMQ; sửa giữ lượt thử,
setup tiếp sau ngắt và cleanup dở dang. 12 Node regression cùng Auth/HTTP/DB
thật đạt; tài nguyên thử và khóa tạm đã dọn. Không thay image/migration của
8082, không bật scheduler/provider. Bản gốc vẫn giữ dirty work và index riêng.

Chưa đóng A0–A4 hoặc nghiệm thu production; còn chính sách expiry, actual
Edge worker/staging, backup offsite/Storage/Vault và thử tải.
[Báo cáo đầy đủ](roomqc-e2e-restore-local-2026-10-19.md).

## Mốc sửa lỗi review — 18/10/2026

Đã cutover worker atomic theo scope, batch/cursor/receipt/outbox; phục hồi
interrupted có audit; bảo toàn lệnh đối soát qua tải lại tab; directory phân
trang/tìm kiếm/tổng hợp tại server. Đây là bản local 8082 healthy,
image review-fixes-20261018, history 520 migration. Dữ liệu nghiệp vụ không đổi.

Kiểm chứng: 823 Vitest đạt/16 skip; worker DB 131, recovery DB 54, directory DB
32 đạt; TypeScript/lint/Deno entrypoint/build/container đạt; DB lint và security
advisors sạch ở mức warning/error. Có 5 HTTP kiểm tra từ chối trái quyền.
Không gọi job được cấp quyền trên DB chính, không bật lịch hoặc triển khai VPS.

Các mốc foundation/giám sát phía dưới là lịch sử tại thời điểm ghi; không còn
mô tả runtime mới nhất. Không đóng toàn A0–A4 hoặc nghiệm thu production.
Tiếp theo: browser E2E workflow mới → chốt chính sách expiry chưa được điều
kiện cũ bao phủ → backup/restore độc lập và staging trước lịch/provider.
Chi tiết: [báo cáo sửa lỗi local](roomqc-review-fixes-local-2026-10-18.md).


## Mốc nền giao dịch và outbox — 18/10/2026

Đã áp migration `20261018010625` trên DB local: lệnh nội bộ theo một tenant,
transition/audit/outbox nguyên tử, retry in-app chống trùng và bỏ qua thông báo
cũ sau gia hạn. 70 kiểm tra DB riêng + 25 monitor đạt; lint/advisors warn/error
đạt, history 516 version khớp, dữ liệu nghiệp vụ không đổi và DB thử đã dọn.

**Đây là foundation private, worker Edge chưa chuyển sang dùng nó.** Hiệu lực
runtime mới trong đợt này chỉ là sửa monitor đếm ngày hết hạn hôm nay cho đúng
cột DATE/UTC. Image 8082 vẫn `a1-monitor-e237786`, healthy; lịch vẫn chưa bật.
Không đánh dấu race/outbox của worker hiện tại hoặc toàn A1 đã hoàn thành.

Bước kế: batch/receipt/cursor và fencing scope → nối worker/dispatcher cùng
monitor backlog outbox → test actual worker scoped fixture → cutover đường
legacy và phục hồi interrupted có audit. Không làm lại foundation hoặc mở
settlement để kiểm thử. Chi tiết:
[báo cáo nền lifecycle](roomqc-lifecycle-foundation-local-2026-10-18.md).


## Mốc giám sát tác vụ — 18/10/2026

Bản local 8082 hiện chạy image `roomqc-local:a1-monitor-e237786`, healthy.
Đã áp migration `20261017155727`: durable admission/history, busy/interrupted
và monitor super-admin chỉ đọc. Không có authorized global job hoặc lịch mới.
Kiểm chứng: 769 Vitest đạt/16 skip, 67 DB độc lập, 14 Auth HTTP/rollback-only,
11 Deno; TypeScript/lint/build/container đạt. Fixture/candidate đã dọn.

A1 vẫn còn transition/renewal locking, audit/outbox/retry, phục hồi interrupted
và harness worker chỉ chạy tenant fixture. A2 còn workflow hồ sơ; A3 còn
pagination/aggregation server; A4 còn E2E rộng. Không đóng toàn A0–A4.
Chi tiết, bằng chứng và thứ tự tiếp theo:
[báo cáo giám sát local](roomqc-job-monitor-local-release-2026-10-18.md).

Các trạng thái “chưa có durable history/monitor”, “chưa áp migration” hoặc
“chưa deploy” trong các phần ghi ngày 17/10 dưới đây là lịch sử tại mốc đó.
Cập nhật 18/10 này là nguồn hiện trạng mới nhất.


## Cập nhật triển khai local — 17/10/2026

Bản tích hợp ứng dụng 9886e86 đã triển khai healthy tại RoomQC 8082.
Migration A2 20261017145741 đã áp dụng lên DB local sau kiểm tra độc lập.
Kết quả cuối: 724 Vitest đạt/16 skip, 73 kiểm tra DB độc lập, 9 kiểm tra
Auth HTTP/transaction rollback và 8 Deno đạt; TypeScript/lint/container đạt.
Browser đã kiểm tra đăng nhập, menu, tìm khách, mở/đóng hồ sơ và focus;
chưa thực hiện committed browser-write E2E. Đã dọn fixture/candidate.

Đây là các lát cắt đầu A1/A2/A3, không đóng toàn A0–A4 hoặc phát hành VPS.
Các mô tả cũ về chưa áp DB/chưa deploy là trạng thái lịch sử, không còn
là trạng thái mới nhất. Chi tiết và backlog còn lại tại
[báo cáo bàn giao local](roomqc-parallel-local-release-2026-10-17.md).

## Nền chung và bảo toàn công việc

- Repo gốc vẫn ở main, HEAD 00eab56; giữ nguyên thay đổi chưa commit và index
  của người dùng, không reset/stash/checkout hoặc commit toàn bộ lên main.
- Source baseline local: d42427291fae73314a28c50ed1375bd08a467345, lưu ở
  refs/roomqc/baselines/20261017-parallel. Snapshot dùng index tạm riêng,
  gồm source hiện hành và các bản sửa trước; không chỉ lấy HEAD cũ.
- Không sao chép .env thật, Supabase .temp, node_modules, backup hay artifacts
  chứa dữ liệu thử. Các file .env.*.example vẫn là tài liệu cấu hình mẫu.
- Bốn worktree native Git được tạo trực tiếp vì công cụ managed worktree
  của ứng dụng không nhận repo trong thư mục con. Không push remote/PR.

Gốc worktree:
C:/Users/Lenovo/Desktop/Tổng hợp dự án/room-weave-pro-main (1)/roomqc-worktrees/

## Phân luồng và quyền sở hữu

| Luồng | Branch | Thư mục | Phạm vi lượt đầu |
|---|---|---|---|
| A1 | codex/roomqc-a1-jobs-monitoring | a1-jobs | Sửa worker báo thành công nhầm, tách kết quả staff/subscription, test orchestration |
| A2 | codex/roomqc-a2-reconciliation-cases | a2-cases | Foundation hồ sơ phi tài chính, lịch sử bất biến, tạo/xem/ghi chú, quyền/session/replay/version |
| A3 | codex/roomqc-a3-admin-console | a3-console | Nhãn trial, lọc gói, lỗi tải, hành vi export đúng phạm vi và menu mobile accessible |
| Rà soát/ghép | codex/roomqc-parallel-integration | integration | Review từng diff, ghép commit đã kiểm tra, hồi quy tổng hợp và ghi giới hạn |

Ba agent thực hiện ba luồng độc lập; agent chính phụ trách rà soát/ghép.
Đây là chia việc kỹ thuật đồng thời, không đổi các cổng nghiệm thu của plan.

## Quy tắc tránh xung đột

- Mỗi agent chỉ sửa file thuộc phạm vi được giao, có test và báo cáo riêng.
  Không cùng sửa App/router, package/lock, plan/report tổng hoặc DB types.
- A1 không sửa case/console. A2 không sửa worker, tenant list/layout hoặc
  TenantBillingDialog. A3 không sửa case/billing dialog, worker hoặc migration.
- Mọi migration chỉ là source đề xuất trong nhánh; chưa áp lên DB đang dùng.
  Agent chính kiểm tra tên/version, quyền và hợp đồng trước khi nghiệm thu.
- Không tự khởi động/reset Supabase, gọi lifecycle/expiry toàn cụm, nhận/gửi
  tiền, gọi SePay, gửi email Internet, mở signup, thay CRM hoặc triển khai VPS.
- Không tự redeploy RoomQC từ từng worktree. Chỉ một bước triển khai sau khi
  tích hợp/kiểm chứng; frontend mới không được đòi schema chưa có.
- Chỉ commit file của luồng mình. Không push, merge vào main hay ghi đè
  working copy đang chạy. Dependency cài riêng từ lockfile, không copy secrets.

## Cổng ghép và báo cáo

1. Agent gửi commit hash, danh sách file, test đã chạy/chưa chạy và phần còn lại.
2. Review diff từ baseline, kiểm tra quyền, lỗi partial success và tương thích.
3. Ghép từng commit riêng vào integration; giữ nhánh gốc để đối chiếu.
4. Chạy lại test phần sửa, TypeScript, lint và suite chung. SQL chưa áp/test DB
   không được tính là integration pass hoặc deploy-ready.
5. Ghi rõ thành quả lượt đầu khác với hoàn thành toàn bộ A1/A2/A3/A4.

## Trạng thái khởi tạo

- Đã tạo đủ bốn worktree/branch, cùng baseline; main/index gốc không đổi.
- Đã giao ba agent thực thi song song. Chưa tích hợp hoặc đưa code mới lên
  ứng dụng 8082 ở thời điểm lập file này.
- A1 xác nhận lượt đầu chưa có durable run history/monitor; A2 chưa làm
  phân công/kết luận; A3 chưa hoàn thành server pagination/thử tải.
- Các khóa/quyền/chính sách cần chủ dự án vẫn để riêng trong danh sách deferred.

## Kết quả lượt triển khai song song

Ba nhánh đã bàn giao commit và ghép không xung đột vào
`codex/roomqc-parallel-integration`; chưa merge vào main hoặc deploy 8082.

| Luồng | Commit nhánh | Commit trong integration | Kết quả có mã nguồn |
|---|---|---|---|
| A1 | a88538e3af485a603630cd86f0d5e897fff562fb | 7471d0f | Kiểm tra lỗi transition/owner/notification; HTTP không báo success giả; kết quả staff riêng; chỉ dẫn partial/unknown outcome |
| A2 | e3089982a09dfa334124df5233af2a665dc8dcb5 | 48cb745 | Nền tạo/xem/ghi chú hồ sơ phi tài chính; receipt/version; schema đề xuất; UI thiếu schema/quyền và retry rõ ràng |
| A3 | e55d634d703230728805a6cbdc93d14d629ba758 | 686c76e | Trial và bộ lọc đúng; email đúng schema; export kết quả lọc; lỗi/retry/cache; menu mobile/tablet có quản lý focus |
| Kiểm thử nền | a49eab0 (integration) | a49eab0 | Tách 4 bộ test khỏi khởi tạo client Supabase khi không có cấu hình; không thêm env/khóa giả hoặc gọi mạng |

Trong review đã phát hiện/fix pending note sau mất response: refetch thấy
version mới không được sinh request ID mới. UI giữ nguyên command đến khi có
receipt hoặc definitive rejection. Giới hạn qua reload/unmount vẫn còn.

### Kiểm chứng

- Bộ test nền không dùng .env: 643 đạt / 16 skip.
- Sau ghép: **97 file đạt, 723 test đạt / 16 skip** (99 file tổng, 2 file skip),
  chạy `npm test -- --reporter=dot` trên integration, ngày 17/10/2026.
- Ba nhánh: test focused A1 47/47, A2 37/37, A3 34/34; các số focused bao gồm
  regression cũ, không cộng chúng lần nữa vào 723. TypeScript/lint riêng từng
  nhánh đạt. TypeScript ứng dụng và ESLint toàn bộ file TS/TSX sửa trên bản
  ghép cuối đều đạt, không warning. Full Vitest đã chạy lại trên bản cuối.
- Khi ghép, TypeScript bắt lỗi mất generic inference của lazy test client.
  Đã sửa bằng factory có type suy luận tại commit 5d6f80c rồi kiểm tra lại;
  không sửa generated types hoặc bỏ qua lỗi compiler.
- `git diff --check d424272 HEAD` đạt; ba worktree tác vụ sạch sau commit.
- Main gốc vẫn HEAD 00eab56, index gốc không thay đổi. HTTP 8082 trả 200 trong
  kiểm tra cuối; đây chỉ là smoke bản cũ đang chạy, không phải E2E bản mới.
- Không áp migration, gọi DB/job global/provider, build/deploy container,
  bật signup/thu tiền hoặc sửa CRM trong lượt này.

### Giới hạn và thứ tự tiếp tục

1. A1 chưa có durable run history, monitor/backlog, interrupted/busy,
   transaction/locking/outbox hoặc retry thông báo an toàn. Run ID hiện chỉ
   request/log. Không bật lịch hoặc tự replay khi job trả 500.
2. A2 migration `20261017145741` chưa áp dụng. SQL/Auth/grants/RLS, race thật,
   advisors và DB lint **not-run**. Chưa phân công/kết luận/mở lại, danh sách
   tìm lại case cũ, diagnostic flags hoặc pending recovery qua reload.
3. A3 chưa có pagination/search/count/aggregation phía server, audit analytics,
   bundle optimization hoặc số đo hiệu năng. Nhãn “đã tải” không thay công việc đó.
4. Browser E2E, Deno runtime, build/container và triển khai bản ghép chưa chạy;
   16 integration skip không phải pass. Chưa đóng toàn A0/A1/A2/A3/A4.
5. Bước kế: kiểm chứng schema A2 trong môi trường DB độc lập có fixture, rồi
   hoàn thiện các phần còn lại và hồi quy browser. Chỉ đưa vào bản đang chạy
   sau cổng tương thích schema; không merge nguồn vào main dirty một cách mù.

Báo cáo riêng trong nhánh integration:
[a1-jobs-parallel-2026-10-17.md](a1-jobs-parallel-2026-10-17.md),
[a2-cases-parallel-2026-10-17.md](a2-cases-parallel-2026-10-17.md),
[a3-console-parallel-2026-10-17.md](a3-console-parallel-2026-10-17.md).
