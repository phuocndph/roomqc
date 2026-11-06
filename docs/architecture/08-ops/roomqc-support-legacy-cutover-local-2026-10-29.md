# Binary cũ và ngừng quyền API trước cutover — local, 29/10/2026

Đã chạy ứng dụng source331 không sửa nội dung trên directory20, nâng directory lên21 rồi kiểm trạng thái và khả năng ghi của tiến trình cũ. Đã bổ sung CLI sản phẩm để ngừng LOGIN API cũ, kèm kế hoạch đối chiếu, audit riêng và kiểm kết thúc phiên. Chỉ áp dụng công cụ trong sandbox của lượt kiểm này; chưa triển khai vào database đang phục vụ.

Nguồn hiện tại **351 tệp**, SHA256 691b4c5e7e74e2b5fa42efa050caedbe7e46102a0fa063bc380f67225aab2af1; nguồn lịch sử **331 tệp**, SHA256 a700ff658818a1f0b8b43420cf120d93768f0fedc34b8b3de32f56a7d7a5ef1f. Run 3a14f62f83e5. [Packet đã lọc](../../../artifacts/roomqc-support-legacy-cutover-3a14f62f83e5-local-2026-10-29.json); [runbook triển khai](roomqc-control-api-cutover-runbook.md).

| Kiểm | Kết quả thực tế |
|---|---|
| Native | **15/15 điểm kiểm đạt**, Auth/HTTP/PostgreSQL và các API Linux thực; exit0 |
| Binary cũ trên20 | Readiness200, lệnh close_admission thành công qua Auth/HTTP; chưa có journal21 |
| Rủi ro lịch sử được chứng kiến | Sau20→21, tiến trình cũ readyz503 vẫn ghi được nếu LOGIN cũ còn quyền. Healthcheck không là fence |
| Restart binary cũ trên21 | Readiness từ chối MIGRATION_CHECKSUM_MISMATCH; adapter tắt process, không coi đây là bằng chứng mọi traffic của process cũ tự bị chặn |
| CLI sản phẩm | Mặc định inspect, đối chiếu database/system identifier/role OID/membership và fingerprint; file private, audit tạo độc quyền và fsync trước ghi |
| Từ chối sai phạm vi | Sai database, administrator/self, fingerprint cũ, membership dùng chung, ACL trực tiếp, phiên trên database khác; giữ LOGIN trước apply |
| Ngừng phiên đang ghi | CLI NOLOGIN + revoke commit, terminate 1 phiên cũ đang bị giữ trước audit/receipt; tất cả effect/command/audit/consumption chưa commit hoàn tác |
| Sau retirement |0phiên còn lại; credential cũ không reconnect/ghi; LOGIN mới còn dùng được; chạy lại không bật quyền cũ |
| Mất response của COMMIT quản trị | COMMIT SQL thực đã hoàn tất, adapter thử lỗi làm mất response; công cụ trả may-have-committed, inspect trạng thái thực rồi kế hoạch mới hoàn tất ngừng phiên; không tự restore LOGIN |
| Audit và lịch sử | Giữ nguyên file kế hoạch/kết quả, chặn ghi đè; API mới replay command cũ, lệnh mới có một Auth receipt/intent/result và replay cùng ID |
| Bảo toàn |11 bảng business không đổi do các lệnh; source/schema đầu–cuối khớp;2role fixture cutover và16role harness ngoài được gỡ về baseline |
| Hồi quy cùng nguồn | **534 đạt,0lỗi,205bỏ qua** trong739test; exit0 |
| Cleanup | Kiểm độc lập0container/volume/network đúng label cho cả2lượt |

Lượt đầu 447e8a716108 đã đạt14/14 trên nguồn351/457e1b169106716cb037bae8d489532837e96d651a51c7bc2e2889b95bd8cb62. Sau review, đã bổ sung trường hợp response của COMMIT mất, giữ trạng thái unknown, chuẩn hóa thứ tự identity và chặn database không có directory. Lượt cuối đạt15/15; không chuyển kết quả của lượt đầu sang nguồn mới. Không sửa migration công bố hoặc runtime API cũ để làm bài đạt.

## Cách dùng và giới hạn

Công cụ mới là phần deployment-side; không có credential quản trị trong API. Trình tự đúng: đóng nhận mới/drain → dừng và retire mọi LOGIN cũ → kiểm0phiên → migrate → chạy API tương thích với LOGIN mới → kiểm gate trước mở lại. Bài native cố ý nâng trước retirement để chứng kiến nguy cơ và kiểm hàng rào khẩn cấp, không khuyến nghị thứ tự sai đó khi vận hành.

- Source331 được interpreter Node22 của fixture chạy với lockfile dependency khớp; không phải ảnh container đã phát hành trước đây. Snapshot chỉ có tệp public được hash, không mount secret/log của lượt cũ.
- Mất COMMIT response dùng adapter sau SQL thật, không là fault TCP hoặc kill CLI. Audit durability qua fsync/exclusive create được kiểm ở phạm vi này; chưa có native CLI SIGKILL tại mọi cửa sổ.
- CLI chỉ ngừng LOGIN API dành riêng. Chưa là orchestrator tự động cho mọi replica, pooler, worker, proxy, mọi đường rollout/rollback hoặc VPS thật. API cũ không được dùng credential mới sau journal21; rollback cần binary tương thích hoặc kế hoạch read-only riêng đã kiểm.
- Writer cũ vào trước/recovery commit/rollback, khởi tạo original intent đồng thời, các đường upgrade lịch sử còn thiếu và review bảo mật vẫn mở trong BG02. Source345 publication283/283, source344 nâng cấp16/16, source341 worker56/56 giữ bằng chứng riêng.
- Chưa full-default/rebuild, BG03–BG11, E2E web/Android, đo tải/chi phí, offsite DR hoặc pilot7ngày.247WARN policy cần disposition;122 release entries/actual/reviewer/signoff/gates không đổi.

[Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md).
