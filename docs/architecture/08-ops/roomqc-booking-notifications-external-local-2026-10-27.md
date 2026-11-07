# Push/Telegram và vận hành thông báo booking — kiểm chứng local 27/10/2026

Đã triển khai adapter Push/Telegram, worker có journal bền vững trước khi gửi,
công cụ operator và launcher/Compose. Bản source900 có **441/441 native**,
**440/440 full control** và **171/171 frontend** đạt. Đây là kiểm chứng local
có phạm vi; **Q02 và toàn bộ VPS/signup chưa nghiệm thu**, chưa triển khai vào
database/runtime đang phục vụ hoặc VPS và chưa gọi provider thật.

[Artifact kết quả](../../../artifacts/roomqc-booking-notifications-external-local-2026-10-27.json)
ghi source, runs, failed history, checks, advisors, cleanup và guard.
[Runbook vận hành](roomqc-booking-notifications-operations-2026-10-27.md)
ghi đầu vào, file permissions, CLI, readiness, disable/retry/suppress và recovery.

## 1. Bản được kiểm và kết quả

Source scoped900file, SHA256
`4933bf90c1abfc3859468e4b4440cde11848b07226735a989cf3794f0b115dcb`;
564business+12directory migrations; backend runtime binding179file.
Migration mới là `20261027013052_booking_external_notification_targets.sql`.
Không gán kết quả source879 hoặc891 cho bản900.

| Kiểm tra | Kết quả cùng source900 | Giới hạn |
|---|---|---|
| Native Auth/REST/Postgres, workers và HTTP sink |441/441; giữ340controls879 và thêm101external/ops | Diagnostic room-writers, chưa default full backend |
| Race với barrier khóa thật |29/29; giữ25cũ và thêm4external | Chứng minh correctness của các tình huống được kiểm, chưa benchmark lock/load |
| Hồi quy nguồn phòng |77/77, native exit0 | Phạm vi room-source |
| Full control với opt-in DB |440/440; không fail/skip/cancel; exit0 | Không thay full vendor backend hoặc browser E2E |
| Frontend |171/171 qua13file; TS app exit0 | Pure client/component có mocks, chưa browser/Android |
| ESLint |0lỗi,59cảnh báo trên33file | Cảnh báo chưa được coi đã sửa |
| Docker Compose config |Push-only/Telegram-only/cả hai render đạt | Chưa chạy mount thật dưới UID1000 |
| Source/schema/runtime và guards |Trước-sau khớp; cleanup độc lập0 | Không chứng minh runtime đang phục vụ dùng source này |

Native run `9fe5b19a4fd5` terminal exit0 tại room_writer_diagnostic_verified;
source run `10dd27af9a84` terminal exit0 tại room_source_diagnostic_verified.
Full-control fixture `5ce001a0e0a7` exit0. Snapshot schema không đổi sau các
fault/temporary grants. Mọi tài nguyên Docker trong các run được kiểm lại
bằng exact ownership labels; không dùng lệnh dọn rộng.

## 2. Hành vi đã triển khai

- Snapshot target nằm trong giao dịch booking/phòng/invoice/notes/audit/receipt;
  check-in Telegram, checkout Push/Telegram theo nguồn hiện hành. Fault ở
  target/group hoàn tác toàn core; replay20lần không thêm nguồn/target/effects.
- Worker dùng login chỉ có role chuyên dụng; operator dùng login khác. Browser,
  service_role và operator không gọi được dispatcher; worker không configure,
  resolve hoặc reset budget. Cấp thêm table/column/schema/role bị phát hiện.
- ConnectionA giữ scope/config/target locks qua HTTP hữu hạn. ConnectionB
  commit attempt journal trước HTTP; sink đọc qua connection độc lập thấy
  marker started cho mọi request thật. FK/NO KEY UPDATE không gây deadlock
  trong tình huống đã kiểm. Chưa đo tác động các locks lên tải sản phẩm.
- Outcome theo từng đích; không đánh dấu cả kênh thành công khi còn đích lỗi.
  Push201 là provider accepted. Telegram cần200/ok, messageID dương và chat
  đúng. Database từ chối receipt giả, messageID0, retry5xx và rejection408/429.
- 429 có retry hữu hạn và Retry-After; preparation/DNS có budget riêng. Push410
  chỉ vô hiệu subscription chưa đổi. Invalid crypto không journal hoặc HTTP.
- Drop/5xx/oversize/wrong-chat/malformed/timeout thành unknown, không tự resend
  qua restart. Ba child process thực sự bị SIGKILL trước journal, sau journal
  và sau HTTP; chỉ trước journal được reclaim, còn lại đối soát unknown.
- Lỗi trả kết quả COMMIT được chèn **sau COMMIT database thật**; accepted receipt
  vẫn tồn tại và không gửi lại. Đây không phải thử TCP packet-drop thật.
- Membership bị thu hồi, user bị khóa, hotel inactive, destination/config đổi
  được kiểm trước I/O. Bốn race thật: revoke/prepare, hai workers tranh đích,
  config+user thay đổi trong HTTP và key rotation chờ Push410 cũ.
- Resolve unknown cần chấp nhận duplicate risk; command key/reason/audit/receipt
  có replay/conflict. Suppress giữ resolved, không giả accepted. Enable không
  tự retry toàn bộ blocked. Nguồn version0 không tự backfill.

## 3. Đường vận hành đã có và đã chạy process thật

`server/control/booking-notification-operator.mjs` nhận config/command files:
channels, list có keyset pages≤50, receipt theo login, configure và resolve.
Không cần người trực sửa SQL. Reply loss sau mutation đã commit được phục hồi
bằng cùng commandId và receipt; replay không tạo mutation thứ hai.

`server/control/workers/booking-external-runtime.mjs` có `--check` không gửi,
daemon và health private. Kiểm bằng subprocess thật: read config, Linux file
permissions/symlink denial, hai kênh tới sink, GET/no-store, metadata disable
làm readiness503, check cùng daemon không tranh cổng, SIGTERM sạch không gửi
thêm. Loader chỉ nhận secret từ file, TLS verify-full ngoài explicit local,
không DSN options injection; pool2 và budget tổng. Linux fixture chạy UID0;
không suy ra quyền mount production UID1000 đã đạt.

Compose tách base/Push/Telegram nên kênh chưa dùng không đòi khóa giả. Template
readonly, cap-drop, no host ports và giới hạn tài nguyên. Render thật bằng
Docker Compose xác nhận ba tổ hợp; file-secret uid/mode không chứng minh host
bind permission đã được remap. Đầu vào production phải kiểm riêng tạiT18.

## 4. Lượt trung gian, lỗi và advisors

Source891/SHA8a5d8ba8… đã có419/419native,29races; đây là mốc trước tooling ops,
không dùng làm proof900. Lượt source900/SHA60a536e7… dừng exit1 ở barrier
readiness. Runtime Telegram trong fixture chưa nhận apiOrigin loopback, nên
không đi tới sink của fixture. Đã bổ sung override **chỉ trong explicit local**,
buộc loopback phải có trong developmentOrigins; production từ chối. Giữ
assertion hai kênh accepted và không tăng timeout để bỏ qua lỗi; run900 cuối
441/441 đạt. Failed run được giữ, Docker cleanup0.

Review Compose ban đầu so mode số256 với output Compose đã chuẩn hóa thành
chuỗi0400, khiến assertion của review thất bại; kiểm lại cấu hình gốc rồi
sửa parser review. Template không cần nới quyền. Một patch tài liệu ban đầu
không khớp context và không sửa file; đã áp lại với context đầy đủ.

Native advisor CLI2.121.0 ghi727findings:34no-policy INFO,7unindexed-FK INFO,
503unused-index INFO,183multiple-permissive-policy WARN. **Disposition còn mở**,
không tự xóa index/policy hoặc coi findings vô hại. Catalog direct-ACL gồm34bảng;
native fixture populate14bảng, kiểm408browser/probe denials,124private-service
denials và71read positives. Không suy direct ACL đã phủ mọi đường gọi gián tiếp.

## 5. Việc tiếp theo và điều kiện chưa được vượt

1. Trong Q02, inventory staged quote/payment, legacy/manual receipt,
   correction/retention và RW5–RW8; từng writer có caller/quyền/effects và
   kết luận đã kiểm, đã chặn tương thích hoặc defect có owner.
2. Kiểm upgrade563→564 có dữ liệu thật của fixture trước migration; đối soát
   event/outbox/receipt/source version0. Fresh replay564 và synthetic version0
   test chưa chứng minh upgrade này. Không backfill tự động nguồn lịch sử.
3. Q03: workflow config/action/dispatcher tổng quát, recipient/offboarding,
   legacy reconciliation và advisor disposition. Q04 mới freeze/default full
   và independent rebuild candidate cuối.
4. Theo tám đợt hiện hành: alerts, admission/budget, signup/status/resume/jobs/
   anti-abuse/email, hai console, Linux/offsite/on-call, A/B đồng thời, web/
   Android E2E, tải/soak/RC và pilot≥7ngày. Input cần khóa/quyền được gom làm sau;
   không chạm VPS/DNS/provider/DB đang phục vụ trong packet này.

Giữ70ca worksheet not_run,122release entries unverified, gates/reviewer/signoff.
Kế hoạch, dependencies và mappings tiếp tục dùng
[25phiếu chi tiết, mục19.11](roomqc-vps-signup-detailed-delivery-2026-10-26.md#1911-điểm-bàn-giao-sau-pushtelegram900).
Số test đạt không phải phần trăm hoàn tất hoặc bằng chứng100.000user đồng thời.
