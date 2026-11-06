# RoomQC — kiểm thử 20 đăng ký tranh suất cuối và hàng chờ kết nối

Kết quả local bổ sung T01/T06/T09, giữ nguyên phạm vi kế hoạch VPS + signup.
Source có phạm vi 810 file, SHA256
`c8dd891dd27e5053f74fd8691f359b96a904de73018c54558077bccfd6fa537c`.
Chỉ `server/control/admin-cases.mjs` đổi so với candidate810 trước. Binding160
file có chứa test này nên hash cũng đổi; 549 business + 12 directory migrations
giữ nguyên. Timestamp UTC,
hashes và kết quả đã lọc ở [artifact](../../../artifacts/roomqc-admission-concurrency-local-2026-10-26.json).

**Kết luận:** bài thử allocator đã kiểm 20 giao dịch DB cạnh tranh thật, không
trộn với 16 yêu cầu đang chờ lấy kết nối. Full control trên source này đạt
358/358, native exit0, không skip/cancel. Lỗi357/358 của run810 vẫn giữ lịch sử;
nguyên nhân chính xác của run đó chưa thu được trực tiếp.

## Bằng chứng và giới hạn chẩn đoán

1. Run810 `2e4605a848b8` có đúng1reservation được cấp nhưng assertion tất cả
   rejection codes là `NO_CAPACITY` thất bại; lúc ấy chưa ghi codes.
2. Bổ sung assertion diagnostics chỉ chứa code/count. Source trung gian
   `05fb9672…` chạy focused `0dee7cde4515` đạt1/1 và full `1e1536b6d50a` đạt358/358.
   Rerun xanh không chứng minh run810 đã được sửa hoặc có nguyên nhân xác định.
3. Phép thử có lỗi chủ động `f604283c9a37` giữ allocation lock3.300ms sau barrier:
   pool4 nhận20request; kết quả1accepted,3`NO_CAPACITY`,16`POOL_ACQUIRE_TIMEOUT`.
   Native test exit1 như dự kiến. Điều này chứng minh pool queue có thể làm
   assertion cũ thất bại dù allocator không cấp quá suất; không chứng minh trực
   tiếp đó là mã lỗi của run810. Diagnostic đầu `854e63c293d2` lỗi import `pg`
   trước khi chạy test đã được giữ; không dùng làm proof về allocator.
4. Giữ timeout production3.000ms và statement timeout8.000ms; chỉ fixture race
   chuẩn bị20connection trước khi bắt đầu, dùng barrier xác nhận **20waiters**.
   Không giảm số request hoặc đổi expected rejection code.
5. Source cuối chạy focused `2ea5851c08c9` đạt1/1; cùng phép giữ khóa3.300ms,
   run `0ccf2c582bea` đạt native0,1accepted và19`NO_CAPACITY`,barrier20waiters.
6. Full control `a18d4a8612b4` đạt358/358,fail0,cancel0,skip0,native0.
   Source/runtime trước–sau giữ nguyên; các exact-owned fixtures đã được kiểm
   container/volume/network còn0 bằng truy vấn Docker độc lập sau run.

## Thay đổi bài thử

- Fixture hỗ trợ poolMax riêng cho race, giữ mặc định4 cho các ca khác.
- Warm20clients trước tranh khóa; assert đủ20giao dịch thực sự chờ khóa.
- Giữ đúng1workspace/affinity,19`NO_CAPACITY`,20replay cùng ID/expiry.
- Assertion thất bại ghi safe code/count, không raw error/URL/credential.

Đây là kiểm allocator dưới 20 transaction và sửa cách chuẩn bị fixture.
Không tăng pool hoặc deadline production, không sửa serving DB. Test này chưa
thay kiểm overload/queue budget T10 hoặc số đo tải T23.

## Nhận tiếp

T03/T04: sửa legacy detail readback cho self-read và actor được phép, khớp system
roles/owner/edit-update/additive semantics; kiểm caller/direct-write compatibility
và terminal pending recovery. Sau đó T08 indirect/workflow/advisors, freeze và
default full backend/independent rebuild trên candidate cuối, rồi tiếp T07 và
các đợt signup/console/ops/E2E theo [kế hoạch](roomqc-vps-signup-detailed-delivery-2026-10-26.md).

API47+3 và metadata30+4 ở báo cáo810 vẫn là evidence có scope thuộc source của
lượt đó; packet này không chạy lại API hoặc browser/Android. Chưa ký70case,
122release entries hoặc gate nào; full control xanh không là nghiệm thu phát hành.
