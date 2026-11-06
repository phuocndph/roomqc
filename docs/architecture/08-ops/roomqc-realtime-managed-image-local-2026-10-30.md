# BG03/T10 — kiểm image Realtime dựng lại từ nguồn, 30/10/2026

Đã nối image Realtime RoomQC vào kiểm tra cấu hình tài nguyên bằng adapter `realtime-managed`. Chỉ nhận image bất biến khớp bản dựng lại không dùng cache từ nguồn hiện hành. Không tin nhãn nguồn hoặc biên nhận do người gọi tự viết. **Đạt kiểm thành phần local; chưa nghiệm thu ngân sách toàn VPS hoặc toàn bộ signup.** [Packet](../../../artifacts/roomqc-realtime-managed-image-local-2026-10-30.json).

| Kiểm cùng nguồn | Kết quả |
|---|---|
| Nguồn | 419 tệp; SHA256 e956d6a3d48a74c5406d770fa03f6c4a0339925f950c91182c34c3dd0a5654af |
| Control | 645 đạt / 0 lỗi / 226 bỏ qua; exit0 |
| Windows | 165 đạt / 0 lỗi / 3 bỏ qua; exit0 |
| Linux | 165 đạt / 0 lỗi / 3 bỏ qua; UID1000/read-only/networknone/dropALL; exit0 |
| Tiếp nhận cấu hình có sẵn | 89/89; run ca5f6e9eef83; 590 migration; exit0 |
| Cài mới | 106/106; run 3156c35c0e90; 590 migration; exit0 |
| Kiểm PLAN mới | Mỗi lượt native có9 kiểm thực qua Compose config, image inspect, rebuild, từ chối counterfeit và phục hồi |
| Dựng lại độc lập image | Hai lần không cache và một lần có cache cho cùng image ID; các lượt native và rebuild trong PLAN cũng khớp |
| Cleanup | Kiểm độc lập không còn container/network/volume/counterfeit image của4 lượt native R1/R2; không còn container kiểm image/Linux |

Image cuối: `sha256:cb8debda6b2be9a1285b78be4939f5efd17615cff032c00ca5d517e686021933`; source image `4e019e19a9ab0c44e45108f4c23f8041bf8064e869315f340e5c607ae4e6e68c`. Business schema và metadata guard catalog được so riêng, đều khớp đầu/cuối các lượt R2. Checkout và snapshot khớp nguồn cuối. Skip không tính đạt; các suite/nguồn khác nhau không cộng thành nghiệm thu sản phẩm.

## Hành vi sản phẩm đã nối

- CLI mặc định chỉ đọc cấu hình Compose, không build/start/exec/kết nối database; image managed chưa kiểm giữ unresolved.
- Chỉ khi có `--verify-managed-builds`, dựng image từ base cố định, platform linux/amd64, timestamp cố định và compiler deterministic; không cache. Container xác minh chỉ đọc public source, network none, không capability.
- Đối chiếu ID actual image với image dựng lại và hash nguồn trước/sau. Không dùng label để cấp verified. Sai image trả lỗi đã che chi tiết riêng.
- Chỉ `services[].imageRebuildVerified` được xác nhận. PLAN tổng vẫn exit2, tổng kết nối null; runtime, DB identity, capacity và deployment đều false khi chưa đủ inventory.
- Giữ bootstrap bảo toàn cấu hình, migration/Janitor/discovery, seed lock và đường dữ liệu đã kiểm trước. Không tắt dịch vụ hoặc hạ số replica để lấy kết quả đạt.

## Negative control và lỗi đã sửa

Mỗi lượt R2 tạo một image mới từ product image, giữ nguyên source label và các public source files, chỉ thêm một label vào runtime config làm ID thay đổi. CLI thật từ chối với `RESOURCE_MANAGED_REALTIME_IMAGE_MISMATCH`; trở lại image đúng thì kiểm thành công ở phạm vi image và giữ PLAN unresolved. Không khởi chạy image counterfeit; dọn đúng tag sau khi kiểm ownership.

R1 adoption thất bại vì image cached và no-cache khác nhau; R1 cài mới đạt trên nguồn lịch sử riêng. Phân tích BEAM cho thấy chỉ serialization của chunk ExCk khác: mã chạy và metadata kiểm kiểu sau giải mã giống nhau. Base image thực dùng Elixir1.19.5; nguồn compiler phiên bản đó dùng encoding deterministic khi nhận compiler option. Dockerfile đã bật `ERL_COMPILER_OPTIONS=[deterministic]` riêng lúc build, giữ type metadata và mã chạy. R2 kiểm lại tất cả cùng nguồn; không đổi điều kiện từ chối image để bỏ qua sai khác. Log/packet R1 được giữ.

## Phạm vi còn mở

Diagnostic PLAN là projection của dịch vụ Realtime thực, bỏ `depends_on` vì không khai báo các dịch vụ phụ thuộc; không phải kiểm toàn topology. Còn TLS tenant peer verification (vendor path hiện dùng verify_none), inventory mọi target/process/phiên tạm/đang đóng/discovery/slot/WAL/rolling overlap, các vendor khác, CPU/RAM/IO/disk và admission/quota/fairness.

Chưa chạy full-default hoặc dựng lại độc lập toàn sản phẩm cho nguồn này; chưa VPS/HTTPS/offsite clean-host restore/web–Android E2E/tải/chi phí/pilot≥7ngày. BG02–BG11,122 mục release và signoff giữ mở. Không đổi database hoặc dịch vụ đang phục vụ; không cam kết1000khách sạn/100000người đồng thời.

[Runbook](roomqc-realtime-managed-image-runbook.md) · [Bootstrap trước đó](roomqc-realtime-bootstrap-local-2026-10-30.md) · [Trạng thái tổng](roomqc-vps-signup-status-2026-10-29.md).
