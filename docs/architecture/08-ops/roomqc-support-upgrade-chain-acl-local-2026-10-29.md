# Nâng cấp19 →20 →21 và quyền trực tiếp42 bảng — local,29/10/2026

Đã khép phần thiếu của đường nâng cấp directory19 →20 →21 có dữ liệu, đồng thời kiểm ACL cuối cùng trên42 bảng bật RLS không có policy. Đây là bằng chứng local theo phạm vi, chưa nhận toàn BG02 hoặc sản phẩm.

Nguồn352 tệp, SHA256 d8ace9734e4d6f09a92d597a5488432f3b41e20e7e37a9a0f994e93f10b3212d;run a73baf0246e1. [Packet đã lọc](../../../artifacts/roomqc-support-upgrade-chain-acl-a73baf0246e1-local-2026-10-29.json).

| Phần kiểm | Actual |
|---|---|
| Nâng cấp native |22/22 quan sát đạt:9 business và13 directory;exit0 |
| Directory19 →20 |Cài đúng19 SQL công bố;so sánh toàn dòng30 bảng predecessor và history;command,legacy action,recheck và lease sống tồn tại trước cột mới |
| Lỗi và quyền migrator20 |Full SQL+history rồi22012 rollback:giữ rows/catalog/ACL/functions/triggers;API LOGIN bị42501;hai migrator chỉ một apply |
| Dữ liệu20 |Legacy nhận hai cột context null;identity mới đúng1;không dựng consumption giả;rerun/checksum denial giữ identity/history/lease |
| Directory20 →21 |32 bảng predecessor giữ toàn dòng,receipt,legacy null context và lease;rollback/rerun/checksum denial;coordinator hiện tại replay command cũ |
| Business585 →586 →587 |17 bảng business/Auth được đối chiếu;giữ receipt cũ và trạng thái thu hồi;expiry thật không tự gia hạn |
| Catalog cuối |42 bảng no-policy,0 browser direct-grant violation;637 function,11 view,381 policy.Candidate graph còn25 unresolved dependencies;allSafe=false |
| ACL trên schema thật |504 browser/probe direct denial,156 private service denial,87 positive reads;42 snapshot không đổi;7 bảng có dữ liệu.Bảng acceptance mới có12+4 denial |
| Tự kiểm khả năng phát hiện drift |4/4,không skip;fixture PostgreSQL42 bảng độc lập.Phát hiện SELECT/table,UPDATE/column,DELETE/service cấp sai,bảng chưa rà soát;thu hồi rồi kiểm lại |
| Hồi quy control |534pass,0fail,205skip/739;exit0.Skip không là pass |
| Bảo toàn |Source/schema đầu–cuối khớp;16 role fixture directory gỡ và baseline phục hồi;kiểm độc lập0 container/volume/network đúng label;3 hồ sơ nghiệm thu gốc giữ SHA256 |

Delta4 tệp đều thuộc harness/orchestrator/test,không đổi runtime hoặc migration đã công bố.Bộ kiểm cũ41 bảng đã được mở rộng thêm private.platform_support_acceptances;repeatability reference vẫn bắt buộc source equality và đủ42 bảng/denial mới,không cấp đạt cho evidence lịch sử.

Advisor run này có810 findings:247 WARN multiple_permissive_policies,8 INFO unindexed_foreign_keys,513 INFO unused_index,42 INFO rls_enabled_no_policy.So với [phân loại trước](roomqc-advisor-triage-local-2026-10-29.md),một unused_index khác do workload fixture;không tự đóng finding hoặc xóa index vì thống kê fixture.

## Giới hạn và nhận tiếp

- Direct ACL dùng SET ROLE trong SQL,không thay browser/PostgREST E2E;đường RPC/trigger/FK và policy semantics còn cần review.Catalog không chứng minh mọi đường truy cập an toàn.
- 30/32 bảng predecessor được snapshot gồm cả bảng trống;không suy mọi bảng đều có dữ liệu.Replay dùng API LOGIN/coordinator thật với callback live-SQL của fixture,không thay HTTP legacy hoặc app rollback.
- Writer-first335/335 source352/a39f,cutover15/15 source351,worker56/56 source341,directory173/173 source338 giữ nguồn lịch sử riêng;không chuyển thành kết quả của bản d8ac.
- Còn review bảo mật/indirect paths,app rollback và orchestration ngừng mọi service cũ trong BG02.BG03 tài nguyên/quota và BG05 backup/tenant-summary chuẩn bị độc lập theo dependency;BG06 full integration/rebuild đếnBG11 pilot còn mở.
- Giữ nguyên122 release entries unverified,actual/reviewer/signoff/gates;không nhận mục tiêu1.000 khách sạn/100.000 user từ số test.

[Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md).
