# BG03/T10 — Realtime TLS, 30/10/2026

Đã sửa đường kết nối tenant, cấu hình metadata/discovery và URL dashboard pgdelta để xác minh CA và tên máy đích. **Đạt kiểm thành phần local trên fixture độc lập; chưa nghiệm thu TLS toàn hệ thống hoặc triển khai VPS.** [Packet](../../../artifacts/roomqc-realtime-tls-local-2026-10-30.json).

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Nguồn | 423 tệp; SHA256 dc9200efda1e0a44e81c0a379b06b6f5010a2e66b8f549b5045d0f2475ac3060 |
| Control | 647 đạt / 0 lỗi / 226 bỏ qua; exit0 |
| Windows | 167 đạt / 0 lỗi / 3 bỏ qua; exit0 |
| Linux | 167 đạt / 0 lỗi / 3 bỏ qua; UID1000/read-only/networknone/dropALL; exit0 |
| TLS database và Realtime thật | 60/60; run d9cfc6339568; 590 migration; exit0 |
| Tiếp nhận cấu hình có sẵn | 89/89; run c4450f6ac597; 590 migration; exit0 |
| Cài mới | 106/106; run c69aa0d37d02; 590 migration; exit0 |
| Dựng lại image | Hai lần không cache và một lần có cache cùng imageID; actual image/PLAN ở ba lượt native khớp |
| Cleanup | Kiểm độc lập không còn container/network/volume/counterfeit của ba lượt cuối và hai lượt TLS thất bại trước đó |

Image: `sha256:1cc3a36c18fd5081aaf70f6c8b7010d060ece9304bb12f717abdc2cfea903ca9`; image sourceHash `f4638f0fc8ad5672e9f1ac993b9f3594fc9f8bf606be987b00dc983d09971902`. Nguồn checkout và snapshot khớp trước/sau; business schema giữ nguyên sau dọn publication fixture. Các skip không tính đạt. Các lượt trên kiểm phạm vi riêng, không cộng thành nghiệm thu toàn sản phẩm.

## Thay đổi đã kiểm

- Tenant dùng verify_peer, CA file, SNI và kiểm tên máy đích từ đúng db_host; thiếu CA thì lỗi có mã, không tự chuyển plaintext. Cờ DB_SSL dùng cùng parser của runtime cho true/1 và giá trị có khoảng trắng/chữ hoa.
- Metadata và discovery nhận cấu hình verify_peer giống nhau; replica giữ tên máy đích riêng trong cấu hình. Đã kiểm metadata/discovery có phiên TLS thật và kiểm cấu hình đã nạp; chưa dựng topology read-replica nhiều node trong lượt này.
- Dashboard giữ nguyên chức năng pgdelta, chuyển URL sang sslmode=verify-full với sslrootcert rõ ràng. Công cụ pgdelta thực trong image chạy snapshot đọc catalog với CA/tên đúng; từ chối sai tên, sai CA, hết hạn và máy chủ không tin cậy; phục hồi sau trả chứng chỉ hợp lệ. Không chạy schema apply hoặc dry-run tạo shadow database để chứng minh TLS.
- Giữ bootstrap, migration, Janitor, broadcast/Postgres changes và replication reconnect. Toàn bộ phiên data path được quan sát dùng TLS; 12 health request đồng thời vẫn dùng pool có sẵn.
- CA mount của Realtime chỉ đọc, không chứa private key. Metadata startup thiếu CA bị từ chối với đúng ROOMQC_REALTIME_TLS_CA_REQUIRED và không có marker READY. Native PLAN kiểm actual Compose, image, rebuild, counterfeit denial/recovery; cấu hình TLS không tự cấp runtime/capacity proof.
- Bổ sung pool tạm dashboard-pgdelta vào inventory: max5 mỗi pool, tổng số pool/concurrency vẫn chưa được chứng minh. Không lấy max5 làm giới hạn toàn công cụ hoặc toàn dịch vụ.

## Lỗi bộ thử và cách xác nhận

R1 vướng thứ tự chmod/chown trong volume fixture; R2 đổi ssl_cert_file bằng ALTER SYSTEM nhưng tham số khởi động có độ ưu tiên cao hơn. R3 giữ đường active.crt cố định, thay byte nguyên tử bằng helper UID100/GID101 không capabilities/network và reload DB. Trước từng ca lỗi, openssl handshake từ container Realtime phải khớp fingerprint chứng chỉ mới; ba fingerprint khác nhau đã được lưu. Probe Postgrex mở kết nối mới với session reuse tắt. Không kết luận chứng chỉ bị từ chối từ lỗi kết nối chung của một công cụ chưa từng kết nối thành công.

## Giới hạn và bước tiếp theo

Chỉ managed image/pinned upstream Realtime v2.143.3 commit d46540b3a4a79113f40301d5e5cb690f41150b9b được kiểm; stock vendor image không được nhận TLS bằng proof này. CA/test certificate chỉ dùng fixture, không dùng triển khai thật. Mix export task cho môi trường phát triển không nằm trong runtime dashboard đã kiểm.

Còn topology nhiều node/read-replica, mọi pool/phiên tạm/đang đóng, discovery concurrency, slots/WAL/rolling overlap, mọi dịch vụ trong cụm, CPU/RAM/IO/disk, quota/admission/fairness và BG02. Chưa full-default/dựng lại toàn sản phẩm, VPS/DNS/HTTPS/email thật, offsite clean-host restore, E2E web/Android/hai cụm, tải/chi phí/pilot≥7ngày. 122 mục release/signoff giữ mở; không cam kết 1.000 khách sạn hoặc 100.000 người đồng thời.

[Runbook](roomqc-realtime-tls-runbook.md) · [Image trước đó](roomqc-realtime-managed-image-local-2026-10-30.md) · [Trạng thái tổng](roomqc-vps-signup-status-2026-10-29.md).
