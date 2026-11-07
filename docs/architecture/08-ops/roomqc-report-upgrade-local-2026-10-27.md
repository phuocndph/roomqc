# RoomQC — nâng cấp database có dữ liệu từ 566 lên 572

Ngày 27/10/2026, Asia/Bangkok. Đã hoàn tất bài diễn tập local U1–U6 của
[phiếu 19.26](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1926-phiếu-nhận-sau-target-transport992).
Phạm vi là chuỗi báo cáo và mục tiêu tài chính trong toàn bộ VPS + signup;
chưa nghiệm thu sản phẩm hoặc triển khai lên VPS.

## Kết quả thực tế

**47/47 ca native đạt**, cùng **13/13 ca source binding/Compose renderer**,
không skip. Backend Supabase chính thức chạy trên network Docker nội bộ sở
hữu riêng, không mở cổng. Tạo hai owner bằng Auth và provisioning thật, seed
ở đúng migration 566, rồi nâng tới 572; không dùng database đang phục vụ.

| Nội dung | Expected và actual đã kiểm |
|---|---|
| Tiền và nguồn gốc | Thu cash 450.000: checkout 200.000, cọc giữ lại 100.000, cọc cần hoàn 100.000 và trả trước 50.000. Snapshot bookings/rooms/payments/invoice/source/receipt/audit/trial giữ nguyên qua nâng cấp và replay |
| Ghi nhận doanh thu | Phòng 200.000 + phí no-show giữ cọc 100.000 = 300.000. Refund due 100.000 là nghĩa vụ chưa hoàn; không tạo thêm cash hoặc ghi nhận thành đã hoàn |
| Chi phí | Maintenance 1.000; phân bổ rent cả tháng 31.000; labor ước tính từ ca một giờ và mức 100/giờ là 100. Financial/operations/legacy monthly và export khớp nguồn |
| Dữ liệu target cũ | Hai occupancy NULL-hotel 75/85, GOP 2.000, ADR 123,45, occupancy 105 và monthly occupancy 105 đều được giữ. ID/tenant/hotel/kỳ/creator/created_at/notes/value không mất; riêng hai hàng trùng nhận review flag và timestamp UPDATE bình thường |
| Legacy review | Reader phân biệt dữ liệu hợp lệ, trùng và sai miền; không tùy chọn một hàng, không đổi giá trị sai thành 0. Owner phải xác nhận giải quyết; journal giữ đủ ba previous_rows và cả ba notes. Unique index chặn trùng canonical sau đó |
| Completed từ 571 | Cắt TCP sau khi journal đã commit qua kết nối DB độc lập; pending tồn tại. Sau nâng 572, tiến trình mới lookup đúng key, nhận receipt gốc và không lặp target/audit/revision |
| Pending chưa tới server ở 571 | Cắt TCP trước dispatch cho financial và monthly. Tiến trình mới sau 572 cancel financial cùng key, chặn writer đến muộn; recover monthly đúng key/payload/revision, kiểm revenue 400.000; payload gốc có occupancy 80 |
| Tương thích và quyền | Checkout invoice/event và hai no-show resolution receipts cũ replay đúng ID, không đổi money/source. Legacy financial/monthly vẫn gọi được; foreign target/report và machine export bị từ chối, không có effects. Giao diện bảng target trực tiếp đã đóng |

Seed có snapshot/hash trước nâng cấp. Sau 571 đã kiểm riêng metadata/review
và ACL trước khi tạo một durable command cùng hai unknown command. Record
phục hồi được serialize vào fixture riêng và đưa cho tiến trình/container
mới ở bước post572; không chứa access token, service key hoặc DB password.
Client ứng dụng thực được bundle bằng esbuild 0.28.2 ở cả hai bước, dùng
Auth/REST thật. Storage trong client thử là Map serialize qua fixture, chưa
phải browser localStorage hoặc Android WebView.

## Sáu lần rollback có fault

Mỗi migration chạy hết body và INSERT lịch sử trong transaction, sau đó cố
tình chia cho 0 trước COMMIT. Cả sáu lần đều chạm SQLSTATE `22012`; schema
fingerprint, grants/functions/index/triggers, history count và dữ liệu khớp
trước transaction. Sau mỗi lần, áp lại nguyên bản migration thật.

| Migration | Nội dung | Kết quả |
|---|---|---|
| 567 | Booking finance report live read | Fault rollback đạt; forward apply đạt |
| 568 | Financial report scope và export | Fault rollback đạt; forward apply đạt |
| 569 | Monthly/labor report scope | Fault rollback đạt; forward apply đạt |
| 570 | Operations aggregate | Fault rollback đạt; forward apply đạt |
| 571 | Targets live scope và atomic commands | Fault rollback đạt; dữ liệu legacy giữ nguyên theo delta đã định nghĩa |
| 572 | Target terminal cancellation | Fault rollback đạt; journal completed và pending từ 571 được phục hồi đúng |

Tên và SHA đầy đủ của sáu migration nằm trong
[artifact](../../../artifacts/roomqc-report-upgrade-local-2026-10-27.json).
Diagnostic mới có guard đúng 566→572; không nới guard 564→566 hoặc 563→564
của các bài nâng cấp trước và không sửa lịch sử migration.

## Source, kiểm tra và lịch sử chạy

Source SHA `2280e0406e2cd35927c8920654b5cc199f92cc7e81525ea6f69898d1399ae495`,
993 file; backend binding 185 file; 572 business + 12 directory migrations.
Thêm `scripts/control-backend-report-upgrade-checks.mjs` và nối diagnostic
trong `scripts/test-control-backend-sandbox.mjs`. Dùng runner baseline 992
và các file cũ hiện thời dựng lại đúng SHA `6ed74544…`: các file trong
manifest ngoài hai file harness, gồm src và migrations, không đổi so với992.

Lần đầu đạt sáu rollback và preservation/recovery nhưng dừng ở phép đối soát
report: harness dùng `p_start_date/p_end_date` cho API revenue vốn nhận
`p_custom_start/p_custom_end`. Sửa đúng contract của harness, thêm kiểm
checkpoint571 và không lưu credential trong pending, rồi chạy lại toàn bài.
Giữ cả attempt thất bại và attempt đạt; không đổi expected doanh thu hoặc
migration để làm xanh kết quả. Cả hai attempt dọn exact-label container,
volume và network còn 0.

Direct ACL: 37 bảng, 444 browser/probe và 136 private-service denials đạt,
37 snapshot không đổi; đây chưa phải closure mọi indirect path. Advisors
CLI 2.121.0 có 726 finding: 37 no-policy, 7 unindexed FK, 499 unused index,
183 multiple permissive policies. Khác 992 ở số unused index theo workload;
chưa disposition, không suy ra đã sửa hoặc phát sinh schema regression.

Schema sau toàn bài giữ nguyên. Source, app, migrations, implementation
primary, index, hai ledger và 70 worksheet rows giữ nguyên. Chỉ mirror
tài liệu và artifact đã lọc. Không chạy lại frontend/full control/native
248/transport31 trong mốc này; các số đó thuộc báo cáo 991/992 tương ứng.

## Giới hạn và nhận tiếp

Bài này chứng minh forward upgrade có dữ liệu và compatibility của các API
đã gọi, với bundle client hiện tại chạy ở 571 rồi 572. Chưa chạy binary cũ,
rollback binary, destructive down migration, DB server restart, production
upgrade, browser/Android E2E, default full hoặc independent rebuild 993.
Không xác nhận tải hoặc sức chứa từ số lượng ca kiểm thử.

Nhận [phiếu 19.27](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1927-phiếu-nhận-sau-populated-upgrade993):
advice server/caller → mobile money → F3 generic export → Q02 writers còn
lại → Q03 workflow/indirect/advisors → Q04 freeze/full/rebuild, rồi đủ tám
đợt VPS/signup. 70 ca vẫn not_run, 122 release entries vẫn unverified;
reviewer/signoff/gates giữ nguyên. Mục tiêu toàn VPS + signup vẫn active.
