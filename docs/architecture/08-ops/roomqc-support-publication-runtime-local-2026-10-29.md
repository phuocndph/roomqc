# Công bố lượt phục hồi và chặn biên nhận cũ — local, 29/10/2026

Đã kiểm hai tiến trình API Linux thật, Auth/HTTP thật và PostgreSQL trên cùng một môi trường Docker riêng. Hai API dùng poolMax1. Bộ kiểm dừng sau guard SQL thực, trước khi ghi closure hoặc generation mới; không dùng hook sửa runtime.

Nguồn **345 tệp**, SHA256 b633a994a0c9af930d69c0e7db697270c1cd577b52bb492038771dbc0a8c7a1c; run c2633f4c8ec1. [Packet đã lọc](../../../artifacts/roomqc-support-publication-runtime-c2633f4c8ec1-local-2026-10-29.json).

| Kiểm | Kết quả |
|---|---|
| Matrix mới | **20/20 tình huống** = 5 nhóm lệnh × 2 điểm công bố × commit/SIGKILL |
| Nhóm lệnh | execute, register, alert acknowledgement, workspace recheck, legacy reconcile |
| Hai điểm dừng | Sau no-effect guard/trước closure; sau generation guard/trước attempt INSERT |
| Tranh chấp hai API | Hai backend khác nhau được chứng kiến chờ đúng leader; chỉ một successor, result, parent, consumption và effect/audit |
| SQL writer muộn | 10 tình huống commit có kết nối API-role thứ ba, dùng receipt Auth thật đã bắt được và parent fixture chưa commit; chờ row fence rồi bị 42501/SUPPORT_INTENT_ATTEMPT_FENCED, rollback parent |
| SIGKILL | 10 tình huống tắt primary trước publication; secondary kiểm lại, không thấy closure/successor dở dang; phục hồi cùng original key |
| Replay/result | Cả hai API trả cùng command ID; result no-store; receipt/attempt gốc và toàn journal sau replay không đổi |
| Toàn bộ diagnostic scoped | **283/283 điểm kiểm đạt**, 161 witness, 20 SIGKILL; exit0 |
| Control cùng nguồn | **534 đạt, 0 lỗi, 205 bỏ qua** trong 739 test; exit0 |
| Bảo toàn và cleanup | 11 bảng business không đổi do lệnh; role baseline phục hồi; source/schema đầu–cuối khớp; kiểm độc lập không còn container/volume/network đúng label |

Thời hạn canonical hết thật trước phục hồi; không sửa timestamp để ép hết hạn. Trigger zz_ được kiểm đứng sau guard thực trong thứ tự thực thi của PostgreSQL. Observer thấy journal gốc cho tới transaction công bố commit. SQL writer dùng biên nhận thật nhưng bỏ qua namespace fence có chủ đích để kiểm lớp bảo vệ SQL; đây không là bằng chứng binary cũ hoặc gateway cũ chạy đúng.

Delta chỉ 6 tệp harness/orchestrator, không sửa runtime/migration đã công bố. Giới hạn thời gian support-authority được tăng từ 180 lên 420 giây cho 20 lượt expiry thực và 10 lần restart; từng transaction vẫn giữ deadline 5 giây. Advisor vẫn cần review/disposition; không tự cấp nghiệm thu.

Lượt đầu 59fba8da7d89 exit1 ở kiểm witness sau SIGKILL: phiên PostgreSQL của API bị tắt vẫn có thể đang chờ câu lệnh. Đã sửa fixture dùng hai gate riêng, cho câu lệnh cũ kết thúc, chứng kiến backend cũ biến mất và secondary chờ ở gate mới. Không sửa runtime hoặc tăng deadline từng transaction để làm bài đạt; giữ nguyên log thất bại, control cùng nguồn lượt đầu đạt534/0/205. Cả hai môi trường đều được dọn và kiểm độc lập.

## Phần còn mở

- Writer cũ vào trước và đang giữ transaction khi recovery bắt đầu: commit/rollback và binary cũ/readiness/fence vận hành cần bằng chứng riêng. Khởi tạo original intent đồng thời cũng là cửa sổ riêng.
- Các đường nâng cấp lịch sử còn thiếu, old-binary rollback và review bảo mật/quyền còn lại của BG02.
- Worker source341 và populated upgrade source344 giữ bằng chứng riêng, chưa chạy lại toàn bộ trên source hiện tại.
- Chưa full-default/rebuild, VPS thật, hai cụm A/B, E2E web/Android, load/soak, DR ngoài host hoặc pilot 7 ngày. BG03–BG11 còn mở.
- 122 mục release và actual/reviewer/signoff/gates không đổi. 20 tình huống mới không phải 20 hành trình khách hàng độc lập.

[Hồ sơ toàn mục tiêu](roomqc-vps-signup-execution-dossier-2026-10-29.md).
