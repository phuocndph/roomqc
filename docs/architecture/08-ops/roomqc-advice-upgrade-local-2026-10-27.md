# RoomQC — nâng cấp advice trên database có dữ liệu572→573

27/10/2026. Thực hiện E4 của [phiếu19.30](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1930-phiếu-nhận-sau-advice-caller1006), thuộc toàn bộ VPS + signup. E4 đạt trong môi trường local cô lập; chưa nghiệm thu phát hành.

Source1007: `b671e7606b7f21b52891b6490f8372ecf154bcec3dffbe42de32e53ffad265eb`,1.007file có phạm vi;backend binding188file. Dựng572migration nghiệp vụ,seed rồi nâng573;12migration directory. Product TS/SQL/Edge giữ nguyên từ [caller1006](roomqc-operations-advice-caller-local-2026-10-27.md);chỉ thêm harness upgrade và nối runner/Edge harness. Chưa phải toàn repository hoặc bản phục vụ localhost/VPS.

## Dữ liệu và hành vi được kiểm

Seed572 có hai tenant,owner/nhân viên được gán khách sạn và reports.view,workspace provisioning receipt,thời hạn trial,cấu hình quyền,booking/phòng,payment,invoice/no-show receipts,notification event/outbox/receipt,chi phí bảo trì và ca/lương. Snapshot bảo vệ toàn dòng của các nguồn liên quan cùng user_roles/user_hotels/user_permissions;không dùng log hoặc token làm evidence công khai.

Doanh thu phòng200.000 + phí giữ cọc100.000 = doanh thu ghi nhận300.000;khoản cần hoàn100.000 tách riêng;chi phí bảo trì1.000,lương ước tính100,mục tiêu ADR123,45/GOP2.000. Mục tiêu tháng có receipt completed và hai pending được client thật lưu trước I/O:một save đã commit nhưng mất response,một save mất trước khi vào server. Storage của harness là Map serialize/rehydrate,chưa localStorage browser.

Runner áp toàn bộ body573 rồi insert migration history trong transaction,sau đó gây lỗiSQLSTATE22012 ngay trước COMMIT. Psql dừng và rollback;fingerprint schema trước/sau khớp,history vẫn đúng572,hai bảng advice và API mới không tồn tại. Money/trial/quyền/source/receipt,target/journal/audit giữ nguyên;API báo cáo cũ và checkout replay tiếp tục đúng.

Sau apply forward573,572history prefix không đổi,target/receipt cũ giữ nguyên. Không tenant nào tự có policy AI hoặc bị charge. Default deny không tạo journal. Owner vẫn xem số liệu,staff có reports.view xem được khách sạn được gán,foreign bị từ chối. Pending target đã commit lookup phục hồi không tạo hiệu ứng lần hai;pending chưa gửi cancel tạo tombstone,chặn save tới muộn với mã cũ. Checkout/no-show replay giữ invoice/resolution/notification receipt gốc,không đổi tiền hoặc trial.

Client mới sau upgrade chạy qua HTTP thật→Deno/Auth/REST/DB→sink nội bộ,trên chính tenant/booking/target đã có ở572. Projection tới sink giữ đúng doanh thu,cost,labor,target. Payload advice snapshot kiểu cũ bị400 và không tạo journal. Foreign lookup chưa có entitlement bị403;không nhận advice của owner. Lượt này không chạy toàn bộ matrix cross-tenant từ59ca1006.

## Kết quả source1007

| Bài kiểm | Kết quả | Phạm vi |
|---|---|---|
| Seed572/rollback573/forward573/sau Edge |29/29 native|Auth/REST/Postgres thật,source/data/history đối soát qua các process riêng |
| Edge trên dữ liệu đã nâng cấp |6/6|Default deny,projection tiền/cost/target,legacy payload,foreign denial,key separation |
| Production client qua HTTP |16/16|Mất request/response,pending/cancel/explicit resume/unknown,relogin,race,đổi context;Map và lock in-process |
| Backend binding + Compose renderer |13/13,không skip|188file backend;không phải full backend |
| Direct ACL |39bảng|468browser/probe+144private service denials;81positive;39snapshot giữ nguyên;indirect paths còn mở |
| Source/schema/cleanup |Đạt|Không drift;container/volume/network thuộc fixture còn0;primary implementation/index/ledgers/worksheet không đổi |

Có9lần gọi sink nội bộ,mỗi command tối đa1lần;không có provider ngoài. Không suy sức chứa VPS hoặc exactly-once của provider thật từ số này. E4 chứng minh rollback transaction upgrade và forward compatibility có phạm vi;**không phải rollback binary cũ sau khi schema573 đã phục vụ**,không chạy down migration phá dữ liệu.

Advisors724 với CLI2.121.0,khác730 ở1006 do workload;chưa disposition và không ghi là đã sửa6finding. Bộ182frontend,TypeScript/lint14warnings và59Edge+6restart thuộc1006;không rerun ở1007. Reconstruct manifest1006 bằng bản runner/harness trước thay đổi chứng minh product sources giữ nguyên. Hardguard report566→572 vẫn nguyên,không tái dùng bài cũ cho chuỗi573.

Attempt đầu đạt seed-history và durable target pending rồi dừng assertion số tiền:fixture đọc native operations report bằng tên trường của provider projection. Sửa đường dẫn về current.room.netRevenue/current.no_show,giữ nguyên expected200.000/100.000/100.000,cost1.000/labor100. Không đổi product hoặc migration. Fresh rerun29+6+16 đạt;hai attempt đều cleanup0. Failed history giữ trong artifact.

## Việc còn lại

E1 và E4 có local proof;E3a/E3b có unit/hook/HTTP proof,nhưng browser/Android chưa chạy. E2 còn kill Edge trong provider I/O,timeout/policy/session expiry bằng đồng hồ thực,UTC rollover,offboarding đủ matrix,freshness/retention/abuse và tích hợp policy control. Nối default-full/full/rebuild theo Q04 trước khi phát hành.

Không triển khai573/Edge riêng khi caller cũ còn gửi snapshot;caller/API/database cần cùng compatibility policy. Chưa web build/browser/Android/full-control1007/default-full/rebuild/deploy/VPS/DNS/email/offsite/load/pilot.70worksheet not_run,122release entries unverified,reviewer/signoff/gates không đổi. Chỉ mirror docs/artifact đã lọc,không mirror implementation.

[Artifact đã lọc](../../../artifacts/roomqc-advice-upgrade-local-2026-10-27.json) giữ manifest,controls,failure và cleanup. Nhận [phiếu19.31](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1931-phiếu-nhận-sau-advice-upgrade1007) để xử lý E2/browser/Android,rồi mobile money→F3→Q02→Q03→Q04 và các đợt VPS/signup. Goal toàn bộ plan tiếp tục active.
