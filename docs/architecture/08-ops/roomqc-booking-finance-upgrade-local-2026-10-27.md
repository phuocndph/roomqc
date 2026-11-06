# RoomQC — diễn tập nâng cấp dữ liệu booking và tiền cọc 564→566

Ngày 27/10/2026. Phạm vi: Q02/RW5.7 thuộc kế hoạch toàn bộ VPS + signup,
đầu ra plan + nghiệm thu. [Artifact đã lọc](../../../artifacts/roomqc-booking-finance-upgrade-local-2026-10-27.json)
gắn kết quả với source, migration, runtime, schema và fixture. Bước tiếp tại
[mục 19.15](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1915-điểm-nhận-sau-upgrade-có-dữ-liệu-913).

## Kết quả

Candidate **913**, SHA
`7f7aae564ef89bcb819494e339001c06d3418cd0178eaa1eb5ee749b63e6a7ac`:
913 file phạm vi, 566 business + 12 directory migrations/runtime 182 file.
So với 912B: thêm một native fixture và sửa harness để có diagnostic riêng;
không sửa migration 565/566 hoặc dùng lại diagnostic 563→564 cho chuỗi mới.

| Kiểm tra | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| Upgrade có dữ liệu | 48/48 native, exit 0 | Replay đến 564, seed và gọi API thật, fault/apply 565, tạo flag command tại 565, fault/apply 566, kiểm dữ liệu/API |
| Migration rollback | 2/2 | Fault SQLSTATE 22012 sau toàn DDL/function/grant/trigger/history insert, trước COMMIT; schema/history/data giữ nguyên; apply lại đạt |
| Tranh khóa sau upgrade | 1/1 | Barrier khóa booking thật, 20 no-show request một resolution; đã nằm trong 48 controls |
| Hồi quy writers | 536/536, exit 0; 37 race khóa thật | Giữ 441 controls cũ, 32 baseline, 27 flag commands và 36 no-show commands |
| Nguồn phòng | 77/77, exit 0 | Cùng candidate/runtime/schema |
| Full control | 440/440, exit 0; không fail/skip/cancel | Chạy tuần tự sau native fixtures, giữ threshold; không kế thừa 912B |

Frontend 122/122 và TypeScript ở report 912B giữ đúng source/phạm vi lịch sử;
không gắn thành kết quả frontend mới của 913. Không có thay đổi UI trong lượt này.
Runtime binding mới có 182 file; migration hashes trùng toàn bộ chuỗi 912B.

## Dữ liệu và đường kiểm thực tế

Fixture Docker cách ly có hai owner/tenant được tạo bằng Auth + provision RPC.
Seed qua native service REST cho các trạng thái lịch sử; không giả định mọi
trạng thái cũ có thể tạo bằng UI hiện hành. Có 14 booking trước upgrade:
confirmed có cọc, cần hoàn có trả trước khác cọc, zero, future, no-show legacy
có/không cọc, cancelled, checked_in, sleep_out, skipper, pending cash, checkout,
hai member group. Pending cash và group được tạo bằng RPC thật ở 564; group
300.000 có `is_group_payment=true` và cả hai booking trong metadata.

Một checkout thực ở 564 lưu phiếu thu, note, command/result và nguồn thông
báo/outbox. Snapshot kiểm booking, phòng, completed/pending payments, invoices,
commands, room sources, notification events/outbox/receipts, audit và policy
trial. Khi so sánh trước/sau chỉ bỏ cột booking_flag_room_status vừa được thêm
để đối chiếu cùng shape; giá trị cũ khác giữ nguyên. Không xuất row snapshot,
token, password hoặc dữ liệu cá nhân vào artifact.

Trình tự:

1. Khóa đúng 564 migrations, seed dữ liệu và snapshot.
2. Chạy toàn thân 565 + history insert trong transaction, chèn lỗi 22012 trước
   COMMIT. Kiểm fingerprint schema, history count 564, data hash và cột chưa tồn
   tại; sau đó apply lại 565 thật.
3. Tạo command `transition_booking_flag` bằng API ở 565 để có receipt thực giữa
   hai phiên bản. Nó phải lookup/replay được sau 566.
4. Chèn lỗi tương tự tại 566. Schema/functions/grants/triggers/history/data
   rollback về 565; ledger mới chưa xuất hiện. Apply lại 566 bằng migration thật.
5. Kiểm 20 replay checkout cũ giữ cùng invoice/source và hash dữ liệu; không
   auto-backfill legacy resolution hoặc tự thay trial/notes/receipts/outbox.
6. Kiểm retained/refund_due/zero, thay decision conflict, hai key cùng business
   resolution, future/legacy/cancelled denial và cross-tenant/service/anon.
7. Cho 20 no-show request chờ khóa thật: một resolution, một audit, completed
   cash receipt ban đầu 100.000 vẫn chỉ một dòng; không tăng tiền đã thu.
8. Kiểm khoản cọc cần hoàn 100.000 và khoản trả trước khác cọc 50.000 giữ nguyên,
   completed cash 150.000 không đổi; không khẳng định đã hoàn tiền.
9. Old sleep_out/skipper checkout qua API mới đạt. Pending cash/group cũ không
   được áp tiền vào no-show member; lỗi rollback cả transaction, group còn pending.
10. Sau ghi ledger mới, gọi lại row API/transition API cũ; no-show replay ổn
    định, receipt mới không mất, bypass checkout và sửa tiền bị chặn.

Các command/metadata/snapshot có định danh fixture được giữ riêng dưới ACL
trong `.local`; chỉ labels, bool, số lượng và HTTP/SQLSTATE cho phép được xuất.

## Rollback được chứng minh đến đâu

Đã chứng minh **transaction rollback của hai migration** và **API compatibility
sau ghi mới**. Không chạy binary ứng dụng/server phiên bản cũ, không thao tác
destructive down-migration và không restore trên DB có khách. Chưa có bằng
chứng old-binary rollout/rollback, production Linux hoặc thời gian nâng cấp
trên dataset thật. Giữ T18/T19 mở; không đổi schema/data về 564 bằng cách xóa
ledger mới. Khi triển khai cần giữ backend/schema tương thích và có runbook
đóng thao tác mới, đọc receipt và đối soát pending.

## Quyền, advisors và môi trường

35 direct ACL targets đạt, 10 bảng có dữ liệu trong upgrade fixture; kiểm này
không khép indirect authority. Supabase CLI được giữ **2.121.0**. Advisor scan
723: 35 INFO RLS no-policy, 7 INFO unindexed FK, 498 INFO unused index, 183 WARN
multiple permissive policies. Khác 728 ở 912B chỉ do workload dùng thêm 5 index;
không có migration/index fix, disposition chưa hoàn tất.

Harness kiểm source/migration/runtime trước-sau và schema không drift sau các
bài post-upgrade. Cleanup dùng exact run label, kiểm lại container/volume/
network độc lập. Không chạm DB đang phục vụ/CRM, VPS thật, DNS, email/provider.
Chỉ docs và artifact đã lọc được đồng bộ về dự án chính; implementation ở
integration. Index chính, hai delivery ledgers và 70 hàng nghiệm thu giữ nguyên.

## Việc tiếp theo của toàn kế hoạch

RW5.7 có local rehearsal; còn doanh thu giữ cọc trong báo cáo tổng, quyền đọc
tài chính, legacy reconciliation, hoàn tiền/cancellation, flagged transfer,
group/staged quote/payment/correction/retention và RW6–RW8. Sau Q02 tiếp Q03
configured workflow/dispatcher/indirect/advisors, Q04 freeze/default-full/
independent rebuild, rồi alerts/admission/budget/signup/jobs/abuse/console/
Linux/TLS/offsite restore/on-call/A-B/E2E/load/RC/pilot ≥7 ngày.

70 ca `not_run`, 122 entries `unverified`, gates/reviewers/signoff không đổi.
Chưa deploy, mở signup public, xác nhận sức chứa hoặc nghiệm thu toàn sản phẩm.
