# BG03/T10.b — lấy mẫu đích database từ pool ứng dụng, 30/10/2026

Đã thêm listener riêng opt-in và công cụ đối chiếu pool đang được native runtime sử dụng với database identity được review. [Packet](../../../artifacts/roomqc-resource-loaded-pool-524e0cb53c3a-local-2026-10-30.json) giữ source/log/giới hạn; [runbook](roomqc-resource-loaded-pool-runbook.md) giữ schema, cách bật/chạy và xử lý lỗi. Đây là tiến triển tiếp sau nguồn391 kiểm credential cấu hình; **chưa hoàn thành toànBG03 hoặc mục tiêu VPS/signup.**

## Kết quả cùng nguồn

| Kiểm | Kết quả |
|---|---|
| Nguồn backend | 396 tệp; SHA256 69486280b0d23c034f480d755d0597e718402ecc771df4dc5474d71f31b4f5bc; checkout và snapshot đầu–cuối khớp |
| Delta | 5 tệp mới,10 tệp sửa; không đổi SQL/migration hoặc ba hồ sơ nghiệm thu được bảo vệ |
| Control mặc định | 630 đạt / 0 lỗi / 221 bỏ qua;851 tổng; exit0,handle14947 |
| Resource/runtime Windows | 138 đạt / 0 lỗi / 2 bỏ qua;140 tổng; hai Compose render chạy; exit0 |
| Resource/runtime Linux | 138 đạt / 0 lỗi / 2 Compose skip;140 tổng; UID1000/read-only/networknone/dropALL;exit0,handle75564 |
| PostgreSQL + container thật | 21/21 đạt;run524e0cb53c3a;hai PostgreSQL16 độc lập, build Control image và CLI/exec/container thật;exit0,handle74372 |
| Cleanup độc lập | 0container/network/volume theo nhãn native DB, app Compose và hai lượt Linux; tệp fixture credential đã xóa |

221 bài gated và các skip không phải bài đạt. Không cộng các tổng khác môi trường hoặc chuyển native worker56/590migration từ nguồn387 thành proof nguồn396. Suite21 dùng database catalog/marker tối thiểu, không dựng đầy đủ schema nghiệp vụ/Auth/REST. Dockerfile phục vụ build/health test được ghi SHA256 riêng 33626c696beec22eea3e1918127c1aaad5cb2db0b6e8bd1ce313ecd5da6e092e; bộ binding396 chưa bao gồm Dockerfile. Image ID được assert trong bài thử nhưng không lưu lại; chưa chứng thực toàn nguồn→image.

## Thay đổi vận hành

- Mặc định tắt. Khi đặt ROOMQC_RESOURCE_POOL_OBSERVATIONS=true, listener riêng chỉ nghe127.0.0.1:8098 trong container. Không có route trên main Control API, không publish cổng hoặc proxy.
- Sampler mượn client từ đối tượng pool đang dùng của Control, health/probe, alert, setup hoặc booking. Không đọc lại DSN, không tạo pool kiểm khác. Một mẫu lần lượt tối đa một client; max pool phải khớp profile startup.
- Transaction READ ONLY và truy vấn catalog cố định, sau đó ROLLBACK. Thành công trả client về pool; timeout/lỗi/quyền bất thường/pool thay giữa lượt thì loại client. Deadline4giây, một sample đang chờ; timeout acquire vẫn giữ busy latch tới khi client muộn được hủy, không tăng hàng chờ vô hạn.
- Report đóng chỉ chứa process nonce, thời gian, profile startup và hash LOGIN/lineage/database identity/server settings. CLI kiểm native inventory, reference attestor, hai sample/pool, reference lại và inventory lại. Sai identity/quyền/profile/restart/process/container bị chặn.

## Bằng chứng mới trên PostgreSQL/container thật

1. Khởi động ControlStore/Control API thực, mở listener riêng và đọc đúng pool đang dùng. Thay databaseUrl trên config sau startup không làm pool cũ tự đổi; mẫu giữ đích cũ. Main API không có route nội bộ.
2. Mượn hết5slot của pool thực: sampler timeout, request sau báo busy và chỉ có1waiter; trả slot thì acquire muộn bị hủy, sau đó mẫu mới đạt.
3. Thu hồi quyền catalog tại đúng database làm mẫu503/an toàn; cấp lại đúng quyền trên fixture thì đạt, không chuyển sang attestor/service-role.
4. Build image bằng Dockerfile sản phẩm; Control container UID1000/rootreadonly/dropALL/no-new-privileges, không publishedport. CLI thật dùng compose config + inspect + closed Dockerexec để lấy mẫu bên trong tiến trình/namespace. Đổi DSN rồi recreate sang server thứ2 có cùng tên DB/LOGIN nhưng giữ budget: bị RESOURCE_POOL_TARGET_MISMATCH; khôi phục DSN/recreate kiểm đạt cùng identity ban đầu.

17 bài native trước đó vẫn chạy trong cùng lượt21, gồm cấu hình native/vendor/secret, marker giữ nguyên, quyền/overcommit/stop/restart và CLI thật. Các worker ngoài Control chưa có proof opt-in native; phần wiring mới được unit/regression kiểm theo phạm vi. Lượt Linux đầu thiếu Dockerfile phụ trợ trong snapshot, đã bổ sung đúng file không đổi runtime và giữ log lỗi; lượt2 đạt. Không nới quyền/mode hoặc bỏ bài health để lấy xanh.

## Phần còn lại

Hai mẫu có thể mượn cùng một session; không chứng minh mọi client hiện có/tương lai hoặc endpoint direct/proxy theo LOGIN/transaction. Lineage không là host identity duy nhất. Docker/image được tin cậy theo quy trình, chưa có provenance đầy đủ. Attestor và ứng dụng có thể khác namespace; phần đã chứng minh là sample thực hiện **trong namespace ứng dụng**, không là kết luận topology toàn stack.

Còn kiểm opt-in native health/probe/alert/setup/booking với schema/role/TLS thật; summary ephemeral clients; vendor/maintenance inventory; tổng server và source→image→pool provenance. Sau đó host RAM/CPU/disk/inode/WAL/IO/network, quota/admission/fairness và tải. BG02 quyền gián tiếp/old-service/app rollback; BG04 signup→email→hotel→staff; BG05 console; BG06 final candidate/rebuild; BG07–BG11 VPS/DR/web-Android E2E/tải/chi phí/pilot≥7ngày vẫn tiếp tục theo dependency.

122 mục release chưa xác nhận; không phải122lỗi. Không product/VPS signoff, không cơ sở cam kết1.000khách sạn/100.000người đồng thời. Ledger/worksheet/execution-plan/reviewer/gates giữ nguyên.
