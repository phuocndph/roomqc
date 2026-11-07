# Phân loại advisor — local, 29/10/2026

Đã phân loại 809 findings từ CLI2.122.0 trên database sandbox của run dfc95190f515, cùng nguồn352/a39f941709470000e5f77c15aea33a8595f965896467eea33628c5d9b990c9c6. Đây là phân loại để giao việc tiếp, chưa phải review bảo mật đạt. Không sửa policy, privilege hoặc chỉ mục trong lượt này.

| Nhóm | Actual | Cách xử lý tiếp |
|---|---|---|
| Nhiều permissive policy | 247 WARN, PERFORMANCE;50 bảng public | Đối chiếu role/action/USING/WITH CHECK và semantics OR trước gộp; chạy denial matrix và EXPLAIN trên dữ liệu đại diện. Không gọi247 cảnh báo là247 lỗ hổng |
| Foreign key chưa có index phủ | 8 INFO, PERFORMANCE;5 bảng,4 private+4 public findings | Kiểm index hiện hành, thứ tự cột và đường update/delete bảng cha; chỉ thêm index có lý do qua migration mới |
| Index chưa ghi nhận lượt dùng | 512 INFO, PERFORMANCE;143 bảng | Database mới không có workload đủ để kết luận dư thừa. Không xóa chỉ mục dựa vào số0 của fixture; cần workload và thời điểm reset statistics |
| RLS bật nhưng không có policy | 42 INFO, SECURITY;39 private+3 public | Giữ RLS; kiểm ACL hiệu lực, quyền column/function và denial anon/authenticated/service role đúng boundary. Không thêm allow-all chỉ để hết cảnh báo |

Ba bảng public không có policy là email_admin_actions, email_deliveries và email_provider_events. Migration nguồn có bật RLS và REVOKE ALL từ PUBLIC/anon/authenticated. **Đó mới là source evidence**; vẫn phải kiểm ACL cuối cùng và hành vi truy cập thật trước disposition bảo mật.39 bảng private cần đối chiếu service/RPC authority theo từng nhóm.

Các FK cụ thể và50 bảng policy được lưu trong [packet đã lọc](../../../artifacts/roomqc-advisor-triage-dfc95190f515-local-2026-10-29.json). Raw advisor/log private không được xuất vào báo cáo. Raw SHA256 được lưu để đối chiếu.

Chưa đóng finding bằng cách sửa nhãn hoặc giảm expected. BG02 security review, full-default/rebuild, VPS và nghiệm thu toàn sản phẩm vẫn mở;122 mục release/actual/reviewer/signoff/gates giữ nguyên.

[Tiến độ toàn mục tiêu](roomqc-vps-signup-status-2026-10-29.md).
