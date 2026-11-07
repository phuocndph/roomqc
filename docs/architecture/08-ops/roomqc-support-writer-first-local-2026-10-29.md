# Writer vào trước và khởi tạo cùng mã lệnh — local, 29/10/2026

Đã kiểm thêm 20 tình huống trên năm họ lệnh execute/register/alert/recheck/legacy. Hai API Linux độc lập dùng poolMax1, Auth/HTTP/PostgreSQL thật trong sandbox riêng. Nguồn 352 tệp, SHA256 a39f941709470000e5f77c15aea33a8595f965896467eea33628c5d9b990c9c6; run dfc95190f515. Không thay runtime hoặc migration sản phẩm trong lượt này.

| Phần kiểm | Actual |
|---|---|
| Writer vào trước, commit — 5 tình huống | API đã thực hiện mutation và consumption, dừng sau guard result thực trong cùng giao dịch. SQL closure bằng API role, không giữ namespace fence, phải chờ intent row. Sau commit, closure bị từ chối SUPPORT_INTENT_EFFECT_ALREADY_COMMITTED; API thứ hai trả đúng command cũ, không tạo vòng Auth mới |
| Writer vào trước, rollback — 5 tình huống | SQL exception trong giao dịch writer hoàn tác effect/consumption/result. Closure probe sau đó được phép, nhưng chính probe rollback; quan sát hết hạn Auth thật rồi hai API phục hồi cùng key thành đúng một effect/generation kế tiếp |
| Khởi tạo original intent — 5 tình huống | Dừng trước INSERT intent; API thứ hai cùng key/body chờ namespace. Chưa có intent/Auth hiển thị trước publication; sau release chỉ một intent, generation0, Auth receipt và effect |
| Cùng key, đổi nội dung — 5 tình huống | Bốn họ chờ original publication rồi trả409; legacy từ chối409 sớm qua payload binding đã có. Legacy primary vẫn bị giữ trước original intent, chưa có Auth/intent; không ép luồng đúng phải đợi khóa muộn hơn |
| Ranh giới hai nhóm kiểm | Kết thúc matrix bằng graceful restart API, kiểm kết quả/replay giữ nguyên rồi mới sang nhóm thu hồi quyền độc lập. Giữ nguyên limiter120 request/phút của sản phẩm |
| Hồi quy native | 335/335 điểm kiểm đạt, 192 barrier observations và 20 SIGKILL toàn diagnostic; matrix publication20/20 cũng chạy lại; exit0 |
| Hồi quy control cùng nguồn | 534 đạt, 0 lỗi, 205 bỏ qua trong739; exit0 |
| Bảo toàn | Snapshot11 bảng business không đổi do các lệnh; source/schema đầu–cuối khớp, directory role fixture phục hồi baseline, Docker đúng label của cả bốn lượt còn0 |

Lượt đầu e06fda0bb5e1 dừng vì assertion giả định mọi contender chờ advisory lock. Luồng legacy có khóa workspace trước coordinator; đã sửa điểm quan sát theo production code, đồng thời kiểm rõ đường từ chối payload sớm. Lượt hai 52b172bd11c8 dừng vì assertion dùng mã xung đột chung cho recheck; đã đối chiếu implementation/test cũ và giữ đúng WORKSPACE_RECHECK_KEY_CONFLICT. Lượt ba 16d66d90aa86 đã đi qua matrix nhưng dừng ở assertion quyền phía sau, không lưu status cụ thể. Nghi ngờ traffic cộng dồn chạm limiter; chưa gọi429 là actual của lượt đó. Lượt cuối có graceful restart giữa nhóm và thông báo assertion ghi status/code rõ. Cả ba lượt lỗi và nguồn riêng được giữ; không đổi runtime/migration hoặc chấp nhận429/503 thay cho401/403.

## Giới hạn và phần nhận tiếp

- Writer đầu tiên là API hiện tại; closure contender là SQL probe API role không giữ coordinator fence. Đây là proof thứ tự row fence/guard với consumer thực, không là mọi binary cũ hoặc container đã phát hành.
- Nhánh rollback dùng trigger exception trong giao dịch thật, không phải SIGKILL writer hoặc mất host. SIGKILL ở các bài publication khác giữ phạm vi riêng.
- 20 tình huống mới gồm9 initial-contention witnesses và1 early-denial witness, không phải20 hành trình khách hàng. Không suy mọi race hay khả năng chịu tải từ số điểm kiểm.
- Còn orchestration ngừng mọi service cũ, các đường upgrade/rollback lịch sử, privilege/RLS/advisor disposition và review BG02. BG03–BG11, full-default/rebuild, staging, E2E web/Android, offsite DR, đo tải/chi phí và pilot7ngày vẫn mở.247 WARN policy cần phân loại;122 mục release/actual/reviewer/signoff/gates không đổi.

[Packet đã lọc](../../../artifacts/roomqc-support-writer-first-dfc95190f515-local-2026-10-29.json) · [Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md) · [Hồ sơ triển khai](roomqc-vps-signup-execution-dossier-2026-10-29.md).
