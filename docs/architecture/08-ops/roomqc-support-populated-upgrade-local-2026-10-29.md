# Nâng cấp database có dữ liệu — local, 29/10/2026

Đã kiểm business585 →586 →587 bằng dữ liệu tạo qua GoTrue và provision RPC thật; directory20 →21 bằng migrator thật trên database riêng có dữ liệu lịch sử. Đây là bằng chứng nâng cấp các đường đã chọn, không là nghiệm thu toàn sản phẩm.

Nguồn **344 tệp**, SHA256 d250a814bf874ca9dea1a8d1e1e55982d430aa0bd586371cf73984e8370a3129; run dabb7ca104aa. [Packet đã lọc](../../../artifacts/roomqc-support-populated-upgrade-dabb7ca104aa-local-2026-10-29.json).

| Kiểm | Actual |
|---|---|
| Nâng cấp có dữ liệu | **16/16 quan sát kiểm đạt**:3 phase business và7 kiểm directory;exit0 |
| Business |17 bảng nghiệp vụ/Auth/session/khóa được so sánh số dòng và SHA256;2 khách sạn provision thật; giữ mapping/trial/role và trạng thái thu hồi |
| Biên nhận586 | Giữ nguyên dòng/ID/hạn qua587; đợi expiry thật rồi replay bị55000,không gia hạn; request mới có observedAtMs đúng contract |
| Directory |32 bảng predecessor được so sánh toàn dòng; giữ command cũ,null context,recheck,consumption thật và lease đang sống;không tạo intent/receipt giả |
| Hai migrator | Hai pool độc lập: một áp dụng21,một không áp dụng lại;rerun không đổi;checksum sai bị từ chối và fixture khôi phục đúng |
| Lỗi trong migration | Full-body21 và history write rồi lỗi22012: rollback trở lại populated20,không còn đối tượng21 |
| Control cùng nguồn |534pass/0fail/205skip,739tổng,exit0 |
| Cleanup/hash |16role directory gỡ bỏ,baseline phục hồi;source/schema đầu–cuối khớp;Docker độc lập0 object đúng label cho cả3run |

Các bảng có cả dữ liệu trống và có dữ liệu;17 không có nghĩa mọi bảng đều đã có dòng. Trạng thái thu hồi owner gồm session bị xóa,role bị gỡ và profile khóa trong cùng fixture; đây không là3ca revoke độc lập. Khóa service đã thu hồi được kiểm giữ nguyên dòng; native worker source341 giữ proof RPC denial riêng.

Directory dùng bản20 cài từ đúng20SQL/checksum công bố,không tạo baseline bằng cách gỡ21 khỏi schema hiện tại. Có command cũ không consumption và command có canonical receipt thật; legacy support action vẫn null context. Sau nâng cấp,API LOGIN và coordinator hiện tại replay command cũ mà không chạy effect hoặc tạo intent/acceptance. Callback quyền của bài replay là fixture live-SQL,không thay test gateway HTTP.

**Lịch sử:** run a23ef8e27e2f exit1 ởseed585 vì fixture khóa có thời hạn hơn1giờ; sửa fixture thành30phút,giữ ràng buộc/migration. Run e8e72ff5c8a1 exit0 chứng minh nâng cấp nhưng bỏ qua cờ advisor ởnhánh mới. Đã sửa orchestrator và run cuối đạt với advisor thật. Không xóa hoặc đổi kết quả hai run trước.

Schema trước=sau **5f71f1b67e698fc238a11bdcbdc4a6b8ac48fddc8c4eeb057f059a95ecc92951**;delta4 tệp harness/orchestrator,không sửa runtime hoặc migration công bố. Advisor mới được lưu trong packet; WARN vẫn cần disposition bảo mật,không coi mọi INFO là lỗi.

## Giới hạn và nhận tiếp

- Fixture Auth được admin-confirm,không thay public signup/email. Một PostgreSQL host,chưa VPS/A-B/backup vật lý hoặc clean-host restore.
- Directory20→21 được kiểm ở đây;không suy sang mọi lịch sử nâng cấp,đặc biệt19→20 nếu hồ sơ yêu cầu. Không có old application binary rollback.
- Business được replay bằng orchestrator sở hữu fixture;hai migrator/checksum test ở đây là directory. Không suy thành test migration runner production của business.
- Worker56/56 source341,hai API173/173 source339 vàdirectory173/173 source338 giữ phạm vi/nguồn riêng;chưa full-default/rebuild trên344.
- Tiếp explicit generation-publication/old-writer windows và security review,đối chiếu các đường upgrade/rollback còn thiếu của R11/BG02;rồiBG03–BG11.
-122 release entries,actual/reviewer/signoff/gates không đổi.

[Hồ sơ toàn mục tiêu VPS + signup](roomqc-vps-signup-execution-dossier-2026-10-29.md).
