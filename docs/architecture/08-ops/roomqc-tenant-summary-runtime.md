# Tổng quan doanh nghiệp từ cụm đã cấp

GET `/admin/workspaces/{id}/tenant-summary` và phần Tổng quan doanh nghiệp trong chi tiết Đăng ký mới đã có code. Đây là thành phần local; chưa được cấu hình hoặc nghiệm thu trên VPS phục vụ khách.

## Luồng và quyền

1. Control API xác minh phiên/quyền quản trị nền tảng hiện hành.
2. Đọc workspace và cụm từ directory primary. Client không được truyền tenant, owner, URL hoặc credential qua query.
3. Chỉ liên hệ đúng cụm/inventory đã gán bằng credential `roomqc_tenant_summary`. Không sử dụng service key hoặc phiên chủ khách sạn để đọc tổng quan.
4. RPC `roomqc_summary.tenant_summary` đối chiếu cả workspace, tenant, owner và khách sạn với biên nhận provisioning. Credential phải có trong database, đúng authority/cluster/binding, chưa bị thu hồi và chưa hết hạn.
5. Control đọc lại mapping và phiên bản cấu hình sau remote read. Nếu thay đổi thì bỏ dữ liệu, trả409; kiểm quyền quản trị lại trước khi trả body.

Kết nối HTTP có deadline5giây và giới hạn phản hồi16KiB. Không giữ transaction/connection directory khi chờ cụm. Credential tải lại từ tệp riêng tại mỗi lần đọc; thiếu/sai/hết hạn không chuyển sang khóa toàn quyền.

Role mới không đăng nhập SQL, không có USAGE public, không có quyền bảng nghiệp vụ; chỉ có EXECUTE một RPC ứng dụng. Không bổ sung quyền cho role probe hoặc setup recovery. Hai bảng authority/credential trong private bật RLS và không cấp quyền trực tiếp cho browser, service_role hoặc role tổng quan.

## Ý nghĩa dữ liệu

- Khách sạn: số bản ghi hotels của doanh nghiệp, ở mọi trạng thái.
- Nhân sự: tài khoản users thuộc doanh nghiệp chưa xóa, gồm chủ và tài khoản ở mọi trạng thái; không đồng nghĩa số người đang online.
- Phòng: bản ghi rooms qua hotels của doanh nghiệp; không dùng số phòng dự kiến trong hotels.total_rooms.
- Tenant và ba số lượng cùng một statement snapshot ở database cụm; observedAt là thời điểm quan sát, không phải một số liệu cập nhật liên tục.
- Chưa được cấp tenant, thiếu biên nhận, không kết nối hoặc lỗi credential đều không được đổi thành số0. Tenant và observedAt là null khi unavailable; errorCode cho biết nguyên nhân theo allowlist.
- UI/client đối chiếu workspace, cluster, tenant và routingVersion; lỗi hoặc đổi phạm vi không giữ lại số liệu cũ để hiển thị như hiện hành.

## Chuẩn bị triển khai — còn phải thực thi và nghiệm thu

- Replay migration `20261029135816_tenant_summary_scoped_read.sql` và `20261029140847_tenant_summary_attestation_scope.sql` bằng quy trình nâng cấp được duyệt. Không reset database đang phục vụ.
- Sau migration, giữ các schema PostgREST hiện có và thêm `roomqc_summary` vào `PGRST_DB_SCHEMAS`. Không đưa private vào schema công khai.
- Inventory server cho cụm có `tenantSummaryCredentialFile`, là đường dẫn tuyệt đối đến tệp riêng được mount chỉ đọc cho Control API. Không đưa tệp hoặc trường này vào cấu hình frontend.
- Đã thêm mã nguồn issuer/publisher/rotator riêng cho capability này; xem [vòng đời khóa tổng quan](roomqc-tenant-summary-credential-runtime.md). Không dùng nhầm credential setup/probe. Tích hợp native, cấu hình triển khai và nghiệm thu vận hành **chưa hoàn tất**.
- Credential có TTL tối đa1giờ. Cần kiểm publish an toàn, luân chuyển trước hết hạn, revoke, restart và lỗi tệp/quyền; hiện chưa đủ điều kiện bật production bằng thao tác chép token thủ công.
- Registry authority và credential phải do kênh quản trị cụm được phê duyệt thiết lập. Tệp version1 chứa clusterId, bindingSha256, publishableKey và token. Token có role `roomqc_tenant_summary`, issuer `roomqc-tenant-summary/v1`, audience `authenticated`, jti, cluster_id, binding_sha256, iat và exp; PostgREST kiểm chữ ký, database kiểm trạng thái hiện hành. Publishable key phải khớp cụm được duyệt.
- Migration mới mở rộng danh sách namespace được băm của catalog formatv3 để bao gồm roomqc_summary. Định nghĩa hàm, ACL, search_path, role graph và migration list vẫn được đối chiếu. Hash cũ không tự được chấp nhận; cần release artifact/phê duyệt mới theo quy trình hiện hành, không sao chép live hash để tự duyệt.

Đây là việc con của console BG05 và triển khai BG07, không thêm task/gate hoặc thay các lượt nghiệm thu đã chốt. E2E console→Control→cụm bằng cấu hình triển khai thực, VPS, Android, tải và pilot vẫn phải thực hiện.
