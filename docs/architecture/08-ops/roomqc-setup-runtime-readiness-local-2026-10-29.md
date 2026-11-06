# RoomQC — kiểm khóa live trước khi worker nhận việc

Ngày 29/10/2026. Đây là phần triển khai BG02/T08/T12; chưa nhận toàn bộ BG02 hoặc release. [Packet native và regression](../../../artifacts/roomqc-setup-runtime-readiness-39f0f08155b0-local-2026-10-29.json) ghi run đã có terminal0/cleanup0. Backend301 tệp/hash `2ec50f6dd1e473a45a54636594d6fd59451c452eb1f5d0f1a375bd1795b371d0`.

## 0. Kết quả kiểm thực tế

| Phần | Actual | Giới hạn |
|---|---|---|
| Tái hiện trước sửa | Regression mới thất bại: startup không gọi native credential probe (0 thay vì1) | Kiểm HTTP fixture có kiểm soát |
| Runtime/recovery/worker | 18/18 kiểm tập trung đạt sau sửa | Có fixture/doubles; không thay native REST |
| Toàn bộ unit control trên source mới | 679 tổng,495 pass,0 fail,184 skip | Các ca opt-in DB/engine chưa được bật, không ghi679 pass |
| Native setup-worker | 38/38:22 worker,8 backfill,8 apply;19 directory migrations trên DB riêng | Auth/PostgreSQL/PostgREST thật, signed release và credential được chuẩn bị bởi fixture rõ ràng |
| Schema và source | 584 migration nghiệp vụ; schema trước/sau cùng45d51a4b…; source đầu/cuối cùng2ec50f6d… | Diagnostic không phải full-default rebuild |
| Cleanup | Containers/volumes/networks0;17 role fixture đã gỡ,39 role nền khôi phục đúng hash | Chỉ tài nguyên theo ownership; DB phục vụ không nằm trong run |

Native chạy **product HTTP runtime và pool/store mặc định** qua loopback PostgreSQL relay tới DB directory riêng. Sau khi khóa cũ bị revoke, readiness503 và snapshot directory/attempt/job/business/journal không đổi. Thay file bằng atomic rename có inode mới, runtime nhận khóa mới không restart và đóng đúng dispatch; revoke khóa mới làm readiness503 trở lại mà không nhận thêm job.

[Run33d493597d53 đã hủy](../../../artifacts/roomqc-setup-runtime-readiness-cancelled-33d493597d53-local-2026-10-29.json) giữ bằng chứng riêng: agent dừng đúng probe-client thuộc run để sửa fixture DSN trước khi chạy lát runtime mới, terminal1/cleanup0. Không tính run hủy là pass hoặc lỗi sản phẩm. Diagnostic setup-worker được tách rõ; setup-dispatch đầy đủ giữ nguyên nhánh và yêu cầu cũ.

## 1. Lỗi được tái hiện và sửa

Runtime trước đây chỉ kiểm hình dạng/binding/hạn JWT trong file trước mỗi batch. File còn hạn nhưng credential đã bị revoke trong database vẫn vượt bước readiness, khiến worker nhận job và tiêu tốn một attempt trước khi RPC nghiệp vụ từ chối.

Runtime hiện gửi RPC receipt read-only với workspace UUID mới tới từng target đã duyệt. PostgREST kiểm chữ ký; database kiểm live authority/revocation/expiry trước và sau đọc. Kết quả probe phải là null. Denial, unavailable, malformed hoặc response không đúng dự kiến đều chặn batch, giữ job/attempt ở directory.

Credential được đọc lại từ đường dẫn khi probe và khi dispatch. Atomic rename file mới được nhận ở lượt kế tiếp, không cache bearer cũ trong gateway. Native probe không xuất dữ liệu trả về, token, DSN hoặc đường dẫn private vào readiness HTTP.

## 2. Giới hạn của bảo đảm

- Readiness là quan sát **trước batch**, không là transaction nguyên tử giữa business database và directory. Revoke xảy ra sau probe nhưng trước claim vẫn thuộc cửa sổ phải chốt trong protocol BG02; RPC dispatch tiếp tục kiểm quyền live.
- Toàn bộ target của instance phải vượt readiness trước batch; budget thời gian của remote checks dùng chung requestTimeoutMs và nhận tín hiệu shutdown. Không coi endpoint không truy cập được là credential hợp lệ.
- BG03 phải tính thêm số native readiness RPC theo số target, worker replica và interval; không thêm pool DB có quyền rộng cho probe. Target lỗi sẽ chặn batch của instance theo policy hiện tại.
- Bài reload file trong cùng filesystem/process không thay bài worker UID riêng, bind mount thư mục read-only, tách signer/DSN và daemon hai process.
- Không nâng quyền runtime, đổi schema, đổi ngày hết hạn credential hoặc mở đăng ký production để xử lý lỗi này.

## 3. Đầu việc BG02 còn lại

1. Scheduler và journal bền vững cho rotate: lưu nguyên key/body trước dispatch, phục hồi receipt sau timeout/kill; chỉ một writer cho target, hai process tranh chấp có CAS/lock thật.
2. TTL/overlap/backoff/deadline có policy; key cũ hết hiệu lực dù daemon chết, không có credential thứ ba vượt policy.
3. Container worker UID không đặc quyền chỉ mount output directory read-only; issuer giữ signer/DSN/config ở mount riêng. Kiểm inode mới sau rename, file thiếu/không đọc được/hết hạn/revoke và shutdown.
4. Chốt điểm hiệu lực user/session revoke giữa Auth và directory: tuyên bố rõ ranh giới, đối chiếu claim/dispatch/settle và đo các cửa sổ bằng barrier. Không dùng pre-batch probe làm proof atomic xuyên hệ thống.
5. Freeze candidate sau delta, chạy regression chịu ảnh hưởng và giao reviewer theo ca gốc. Các gate L/S/P/U/B và actual/reviewer/signoff vẫn giữ nguyên.

## 4. Chạy lại khi có thay đổi liên quan

```powershell
node --test server/control/setup-runtime.test.mjs server/control/setup-recovery.test.mjs server/control/setup-worker.test.mjs
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-worker
```

Diagnostic dựng full schema trong Docker network nội bộ, không publish port/provider; chỉ kiểm lát worker/backfill. Không dùng nó thay setup-dispatch toàn tuyến, full product candidate, read-only mount, daemon rotation hoặc VPS staging. Các artifact và verifier r4 giữ nguồn kế hoạch cũ/ede96e, không được đổi pin để nhận2ec50f6d.
