# Tổng quan doanh nghiệp — API và UI local,29/10/2026

Đã thêm GET /admin/workspaces/{id}/tenant-summary và phần **Tổng quan doanh nghiệp** trong chi tiết Đăng ký mới. Dữ liệu đi từ đúng cụm đã cấp bằng credential chỉ đọc tổng hợp; chưa bật trên VPS hoặc database đang phục vụ khách.

[Packet đã lọc](../../../artifacts/roomqc-tenant-summary-06cab06cc926-local-2026-10-29.json) · [Cấu hình và phần còn thiếu](roomqc-tenant-summary-runtime.md).

| Nội dung | Actual |
|---|---|
| Số liệu |Tên doanh nghiệp,trạng thái gói/hạn dùng thử,số khách sạn,tài khoản chưa xóa gồm chủ ở mọi trạng thái,vàphòng thực tế đã tạo |
| Mapping |Workspace/tenant/owner/hotel kiểm ở biên nhận cụm;directory đọc lại mapping/routingVersion/phiên bản credential sau remote;đổi đích trả409 |
| Quyền |Role riêng không public USAGE,không quyền bảng nghiệp vụ;chỉ1RPC ứng dụng.Credential≤1giờ,live authority/revoke/expiry;không khóa service_role hoặc phiên owner trong request đọc |
| Trạng thái |Unbound/missing/offline/credential lỗi làunavailable,null;không đổi thành0.UI ẩn số liệu cũ khi lỗi;client/native giữ exact target vàkhông query can thiệp tenant |
| Unit/contract |13/13,exit0 |
| HTTP directory |1/1,API LOGIN riêng,poolMax1;query can thiệp bị400,mapping đổi409,revoke sau read403 trước body,outage không thành0;gateway operator làfixture |
| PostgreSQL/PostgREST A/B |1/1 riêng,JWT ký thật,UUID nghiệp vụ trùng nhưng tên/số liệu khác đúng cụm;cross binding/tamper/revoke/expiry bịdeny;không đổi business rows |
| Backend dựng mới đầy đủ |589migration;canonical Auth→provision fixture→Kong/PostgREST→gateway thật;19/19 kiểm,exit0 |
| ACL schema thật |44bảng,528browser/probe denial,164private service denial,91positive;44snapshot không đổi,7bảng có dữ liệu;không chứng minh mọi đường gián tiếp |
| ACL drift fixture |4/4 riêng;44bảng được điền dữ liệu;kiểm grant bảng/cột/service cho hai bảng mới cùng nhóm hiện có,unknown target vàphục hồi |
| Control regression |540pass/0fail/209skip trên749,exit0.Skip không làpass |
| Frontend |66/66 trên4tệp;typecheck toàn tsconfig.app.json vàlint8tệp đạt;build production đạt trước delta type-only,JavaScript phát ra được xác nhận giống hệt.Còn cảnh báo chunk>1000kB |
| Visual |Đã xem ảnh1280/390px;không tràn ngang,panel0px;bàn phím,tải lại,unknown vàphục hồi đạt;hook query giả lập,không E2E |

## Nguồn và giới hạn kiểm thử

Full schema19 vàcontrol540 gắn source356/abb4ff3f3eeba04a3afaeb855b539f90ae47c17b6373217e046fdc3340fde83b. Bản cuối356/903f47222bf09e31f8d0b1652527db548a7d98a78b8229d1dfdd0f766ee0d1ae chỉ đổi server/control/backend-no-policy.test.mjs để sửa số snapshot44 vàthêm drift của hai bảng credential;runtime,SQL vàcontract giữ nguyên. Fixture cuối đạt4/4;không ghi toàn bộ control đã chạy lại trên hash cuối. Frontend cuối có một thay đổi kiểu tham số;đã kiểm typecheck,66bài vàJavaScript tương đương trước/sau.

Catalog vẫn formatv3,namespace roomqc_summary được thêm bằng migration mới;drift schema ACL,function ACL/search_path vàrole attributes đều làm đổi hash,rollback phục hồi hash;runtime credential rows không đổi hash. Không sửa checksum migration đã công bố hoặc tự phê duyệt live hash.

Advisor lượt này ghi827findings:44 INFO:rls_enabled_no_policy; 8 INFO:unindexed_foreign_keys; 512 INFO:unused_index; 263 WARN:multiple_permissive_policies. Các WARN performance cần review/đo;không đồng nghĩa số lỗ hổng đã xác nhận hoặc căn cứ xóa index theo fixture.

Giữ log các lượt lỗi:helper native r1 không nhận được mapping port;r2 expiry expectation401 nhận403;full-schema r1 dừng vìchecker còn42;fixture r5 còn hai assertion42;visual r1 thiếu resolveDir;typecheck r1 phát hiện kiểu tham số quá rộng. Đã sửa theo phạm vi,giữ nguyên log vàcác proof lịch sử,không đổi expected quyền để bỏ kiểm tra.

## Còn phải làm

- Cấp/publish/rotate credential riêng tự động,kiểm revoke/restart/lỗi tệp/quyền vàmount trong bộ triển khai;chưa dùng issuer setup cho role này.
- Cấu hình PostgREST/inventory thật vàkiểm browser→Control→cụm toàn luồng;chưa có thay đổi serving hoặc VPS.
- BG05 còn totals/cấu hình/nghiệm thu console;BG02 security/rollback/orchestration,BG03 tài nguyên vàBG06–BG11 giữ mở.
- Full-default/fresh rebuild,staging HTTPS,offsite restore,web/Android,công suất/chi phí vàpilot≥7ngày chưa được nhận. **122mục release vẫn unverified;không signoff sản phẩm.**

Độc lập Docker cuối lượt:0container/network/volume đúng label backend;source/runtime đầu–cuối của lượt fullschema khớp. Ba hồ sơ nghiệm thu gốc giữ hash. [Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md).
