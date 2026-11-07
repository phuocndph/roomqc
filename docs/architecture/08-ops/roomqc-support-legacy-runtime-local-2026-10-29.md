# RF06 — đối soát legacy và thử lại cùng mã lệnh, local 29/10/2026

Bản mã 338 tệp, SHA256 `64591454b3fe8f19936342890786dcb3c6ab31d482bec93520f6fd3eb3c93b0a`. Native run `c476069f5cf9`; 587 migration nghiệp vụ/21 directory. [Packet đã lọc](../../../artifacts/roomqc-support-legacy-runtime-c476069f5cf9-local-2026-10-29.json) lưu source manifest và hash log; log thô giữ riêng trong .local.

Đã đồng bộ contract POST reconcile/GET result, key bắt buộc và DTO đã lọc; sửa caller fixture cũ; thêm kiểm kết quả bị thu hồi quyền trong khi chờ SQL. CLI lưu bền key/body trước gửi. Thử lại sau mất phản hồi hoặc API restart giữ cùng action; Auth hết hạn phải đối soát vòng cũ; quyền bị thu hồi chặn recovery/result. Result lịch sử không chứng minh quyền hiện tại.

| Bộ kiểm | Kết quả và giới hạn |
|---|---|
| Native Linux/Auth/HTTP thật | 126/126 kiểm cơ chế; 41 điểm chặn có witness; 5 API SIGKILL; exit0 |
| Directory PostgreSQL cô lập | 173/173,0 lỗi,0 skip; exit0 |
| Control từ thư mục gốc | 534 pass,0 lỗi,205 skip/739 tổng; exit0 |

Giữ lịch sử lần chạy npm --prefix: 532 pass,2 lỗi,205 skip; hai helper path không tìm thấy do cwd. Chạy lại từ gốc đạt, không sửa nguồn để né assertion. Cách gọi prefix còn hạn chế tính di động của test runner.

Source native đầu/cuối và source hiện tại khớp; schema trước/sau `5f71f1b67e698fc238a11bdcbdc4a6b8ac48fddc8c4eeb057f059a95ecc92951`. Role cleanup được kiểm; kiểm độc lập thấy0 container/volume/network thuộc native run và0 container thuộc hai directory run. Không suy từ đó toàn bộ Docker sạch.

Advisors: 809 findings, gồm247 WARN multiple_permissive_policies; đây không phải số lỗi sản phẩm đã xác nhận, vẫn cần review mức độ và disposition. Bộ control có skip và các suite có thể trùng phạm vi; không cộng thành tổng luồng nghiệp vụ.

Giới hạn: một API process mỗi thời điểm; CLI UID fixture; chưa hai API đồng thời/all-family recovery, worker claim→RPC→business commit→directory settle, populated upgrade/security, full-default/rebuild, VPS thật, DR, web/Android E2E hoặc pilot. Không ký nhận R11/BG02 hay sản phẩm từ lượt này.122 release entries, actual/reviewer/signoff/gates giữ nguyên.

Nhận tiếp: mọi họ lệnh và hai API process → worker race/recovery → populated upgrade và security review → BG03–BG11 theo [hồ sơ toàn phạm vi](roomqc-vps-signup-execution-dossier-2026-10-29.md).
