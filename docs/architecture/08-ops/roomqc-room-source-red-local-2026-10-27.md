# RoomQC — baseline lỗi nguồn đổi trạng thái phòng, local 27/10/2026

Phạm vi: đầu vào cho T01/T03/T04/T08, bước W2 của [kế hoạch chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md). Đây là kiểm thử trước sửa, **không phải bản sửa hoặc nghiệm thu phát hành**.

## Kết quả đã chạy

Native diagnostic kết thúc exit **1**, hoàn tất **8 kiểm tra: 3 đạt, 5 không đạt**. Gọi Auth và REST thật trên fixture Docker riêng, áp đủ **555 business + 12 directory migrations** thuộc candidate823, source `c38e9c08c94bb39f4d1c459318db6339347390607c507b31993eefbf545286c4`. Đây là scoped source manifest 823 file, không phải hash toàn repository hay bản đang phục vụ.

| Tình huống | Expected | Actual | Kết quả |
|---|---|---|---|
| Chủ khách sạn đổi trạng thái hợp lệ | HTTP 200, chuyển đúng trạng thái | HTTP 200, trạng thái đúng | Đạt |
| Nhân viên tại khách sạn được giao | HTTP 200 | HTTP 200 | Đạt |
| Nhân viên đổi phòng ở khách sạn chưa được giao | 401/403, không thay phòng/audit | HTTP 200, dữ liệu đã thay đổi | Không đạt — lỗi quyền cần sửa trước phát hành |
| Tài khoản tenant khác | 401/403, không thay dữ liệu | HTTP 400, dữ liệu giữ nguyên | Không đạt — hợp đồng lỗi; ca này không chứng minh ghi chéo tenant |
| Chủ khách sạn bị khóa | 403, không thay dữ liệu | HTTP 403, dữ liệu giữ nguyên | Đạt |
| 20 yêu cầu cùng đích trạng thái | Một lần chuyển, một audit đổi trạng thái | Cả 20 trả 200, có **21** audit `state_change` | Không đạt — audit trùng |
| Kết quả lệnh nguồn | Có định danh sự kiện nguồn do server cấp | Không có `workflow_event_id` | Không đạt — thiếu nền cho dispatch và chống chạy trùng |
| Phiên hết hạn trong khi chờ khóa phòng | 403, không thay dữ liệu sau khi hết hạn | Đã quan sát chờ khóa thật; HTTP 200 và dữ liệu thay đổi | Không đạt — lỗi quyền cần sửa trước phát hành |

Thời gian chạy: **27/10/2026 03:05:49–03:07:11, Asia/Bangkok**. Run `c13b648c1eff`; fixture `92409a123b38`. Một race chờ khóa thật nằm trong 8 kiểm tra, không cộng thêm thành kiểm tra thứ chín. Bộ này không chạy qua Edge hoặc giao diện.

## Phạm vi bằng chứng và dọn fixture

Mã nguồn trong manifest823, runtime binding162 file và client diagnostic không đổi trong lần chạy. Schema sau thử khớp fingerprint đã ghi; instrumentation không để lại thay đổi schema. Harness báo đã dọn fixture; kiểm độc lập theo **đúng ownership label của run** xác nhận container, volume và network đều còn **0**. Không truy cập database đang phục vụ, CRM hoặc VPS thật.

Xem [artifact đã lọc](../../../artifacts/roomqc-room-source-red-local-2026-10-27.json) để đối chiếu native terminal, từng expected/actual và ba kiểm tra cleanup. Không công bố ownership bundle, thông tin đăng nhập hoặc raw log.

## Việc cần sửa và kiểm lại

1. Kiểm quyền sống theo actor, tenant, khách sạn, assignment và capability trong giao dịch đổi phòng; kiểm lại hạn phiên sau các cửa sổ chờ khóa. Thu hồi quyền phải chặn yêu cầu mới và replay không còn quyền.
2. Thêm định danh lệnh ổn định và kết quả bền vững. Cùng lệnh/cùng payload trả cùng kết quả; khác payload báo conflict. Không phát sinh audit hoặc event mới khi trạng thái thực tế không đổi; giữ nghiệp vụ cập nhật thời hạn DND/OOS hợp lệ.
3. Ghi chuyển trạng thái, audit, nguồn sự kiện và kết quả lệnh nguyên tử. Fault ở nguồn/kết quả phải rollback cả dữ liệu phòng và audit. Giữ lịch sử audit cũ; không xóa để giảm số đếm.
4. Chuyển caller và kiểu API, bỏ phát sự kiện từ `data.status` do client cung cấp khi server chưa đổi trạng thái. Kiểm trước/sau trên Auth/REST thật, rồi UI tại T22.
5. Khép các writer khác của trạng thái phòng theo inventory, configured engine, dispatcher và recovery trước freeze/full/rebuild. Bản sửa một RPC không đủ đóng toàn workflow.

Chi tiết triển khai và các cửa sổ lỗi ở **mục 16** của [phiếu chi tiết](roomqc-vps-signup-detailed-delivery-2026-10-26.md). Không bật bộ lọc workflow tổng quát trước khi quyền nguồn và xử lý nguyên tử được kiểm chứng.

## Trạng thái chuẩn bị

File `supabase/migrations/20261026200830_room_workflow_source_commands.sql` đã được tạo sau baseline bằng native CLI nhưng **đang rỗng, chưa có bản sửa**. Inventory hiện thấy 556 file business migration; bằng chứng baseline chỉ thuộc 555 migration đã áp lúc chạy. Không gán proof candidate823 hoặc full control384/384 cho migration mới hay bản sửa tương lai.

70 dòng nghiệm thu vẫn `not_run`; 122 release entries vẫn `unverified`; reviewer/signoff/gate giữ nguyên. Các lỗi quyền trên chặn đề nghị phát hành; bài kiểm tra tài liệu hoặc proof delivery823 không giải quyết chúng. Công việc VPS, signup, console, Linux/restore, E2E/tải và pilot tiếp tục theo 8 đợt đã chốt.
