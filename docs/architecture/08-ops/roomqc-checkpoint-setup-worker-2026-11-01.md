# Khôi phục setup worker từ checkpoint — 01/11/2026

**Đã đạt kiểm thử native cho setup worker phục hồi, cấp lại quyền, xoay khóa và
restart. Chưa đạt khôi phục toàn hệ thống; signup production vẫn đóng.**

Biên nhận: [setup worker acceptance](../../../artifacts/roomqc-checkpoint-setup-worker-2026-11-01.json).
Kế thừa [kiểm dịch vụ lõi](roomqc-checkpoint-core-runtime-2026-11-01.md) và
[đối chiếu schema độc lập](roomqc-recovery-schema-review-2026-11-01.md).

## Đã kiểm chứng

Run `c7e072e7e0bc` hoàn tất kiểm lúc `2026-11-01T04:52:01.056Z`, exit 0.
SHA-256 biên nhận riêng:
`933c1bca85089cd57482d19c0fd7f668c804f7224b3941a324b61645bc3e58d2`.
Mỗi run restore lại cả business và directory từ checkpoint chung
`24dc36fb-5b67-4204-997d-51fed1536de8`, kiểm inventory trước khi khởi động runtime.

| Hạng mục | Kết quả thực tế |
| --- | --- |
| Schema | So đủ 6.928 parts với baseline độc lập; source `84c57395…f4`, target `f05b3779…600f1` khớp |
| Approval phục hồi | Installer thật cài epoch 5, chỉ môi trường local, khóa Ed25519 mới sinh trong bộ nhớ |
| Quyền setup | Bind lại đúng target, thu hồi các scoped credential cũ, cấp credential mới bằng issuer thật |
| Phạm vi credential | RPC `roomqc_setup.receipt` trả 200/null cho workspace chưa tồn tại; đọc `public.hotels` bị 403 |
| Xoay khóa | Runtime rotation thật cấp khóa kế tiếp và thay file atomically; không ép clock/expiry |
| Khóa tiền nhiệm | Đợi database clock qua `retire_after` của cửa sổ chuyển tiếp thật; RPC bị 403, khóa mới vẫn 200/null |
| Worker | Ready trước/sau rotation và sau Docker restart; không dùng store/probe giả |
| Cách ly | UID 1000, rootfs/mount chỉ đọc, bỏ capabilities, `no-new-privileges`, không publish cổng |
| Bí mật vận hành | Worker chỉ nhận `/worker` và `/run/roomqc/setup`; không mount signer, DSN installer hoặc journal |
| Signup | Sau cài approval/rotate/restart vẫn 503 `SIGNUP_CLOSED`, gửi đúng Origin đã cấu hình |
| Dịch vụ lõi | Auth, REST, Storage, Functions, private Realtime và API admin tiếp tục đạt trong cùng run |
| Dọn môi trường | Container, hai DB phục hồi, các volume và mạng của run đã dọn |

Hai mươi hai mật khẩu database LOGIN và JWT/API keys được cấp lại trên bản
phục hồi. Khóa JWT dùng để phát scoped token được giữ ở operator volume; worker
chỉ nhận token đã ký. Không đọc/mount khóa ký release production, không sửa
admission production và không kết nối VPS nguồn trong diễn tập.

Approval local chỉ xác nhận component worker với frontend digest nguồn giữ
nguyên. Nó **không** thay thế nghiệm thu frontend được build lại với public key
mới. Snapshot `management.admission` trong biên nhận được đọc **trước** khi cài
approval local; kiểm signup cuối run nằm ở `setupWorker.signupClosedAfterRecovery`.

## Sửa lỗi trong bộ diễn tập

- Run `104fb5ea7950`: container chuẩn bị volume kế thừa USER non-root của image
  nên không đổi được owner. Chỉ container bootstrap mạng `none` dùng root để
  đặt owner/mode trên các volume do run sở hữu; worker vẫn UID 1000.
- Run `6bb27422d96f`: probe bổ sung kiểm signup quên Origin bắt buộc, nên bị
  chặn ở hàng rào Origin trước khi đến signup guard. Đã thêm đúng Origin, giữ
  nguyên yêu cầu 503 và `SIGNUP_CLOSED`. Không diễn giải lần lỗi này là signup mở.
- Log cleanup nay lưu cả stdout/stderr vào tệp riêng để lỗi runtime không bị
  mất dấu. Không công khai log có thể chứa bí mật.

Các lần lỗi không xuất receipt thành công và được giữ nguyên lịch sử. Run
`8bb01700c80d` đã đạt trước khi bổ sung kiểm phạm vi/khóa tiền nhiệm/signup cuối
run; nghiệm thu hiện tại dùng run `c7e072e7e0bc` với đầy đủ các kiểm đó.

**47 focused Node tests đạt, 0 fail/skip** cho approval, installer, scoped
credential, gateway, worker và rotation. Hai script recovery qua syntax check.
Đây là kiểm nguồn bổ sung; bảng trên dựa vào Docker/PostgreSQL/PostgREST thật.

## Chạy lại và giới hạn

Giữ các packet, checkpoint, baseline và log trong thư mục riêng. Thêm cờ
`--frozen-baseline-file` vào lệnh trong [runbook runtime](roomqc-checkpoint-core-runtime-2026-11-01.md):

```powershell
node scripts/roomqc-checkpoint-runtime-drill.mjs `
  --checkpoint-file <private-checkpoint.json> --sha256 <reviewed-sha256> `
  --business-dir <opened-business> --control-dir <opened-control> `
  --output-dir <private-output-root> `
  --frozen-baseline-file <reviewed-frozen-baseline.json>
```

Công cụ này ghim đúng checkpoint và digest đã review; không dùng như công cụ
khôi phục tùy ý hoặc chạy trực tiếp lên database production.

Phần còn lại, theo thứ tự phụ thuộc:

1. Cấp lại canary/probe catalog và keyring; chạy health worker với hai LOGIN ít
   quyền và metrics từ đúng máy/ổ đĩa phục hồi. Không tái sử dụng số liệu VPS nguồn
   hoặc tạo metrics giả để có health xanh.
2. Build frontend với public key mới, nối đúng backend phục hồi và kiểm browser
   login/admin. Image frontend nguồn chứa key cũ; thay biến container không đủ.
3. Gắn approval đúng artifact frontend mới, khôi phục TLS ingress và kiểm lại
   service boundaries. Chỉ khi đủ bằng chứng mới xét `scope=bundle, verified`.
4. Lịch backup mã hóa ngoài host, retention và key escrow độc lập; bản copy trên
   máy Windows hiện tại chưa thay lịch vận hành bền vững.
5. Khôi phục capacity/latch live theo policy, gia hạn authority, cấu hình email
   thật rồi kiểm public signup E2E, load và pilot khách hàng.

Kiểm VPS riêng lúc `2026-11-01T04:49:30Z`: đúng đường dẫn được duyệt
`/root/backups/joliefam/joliefam.zip` không tồn tại; không xóa tệp nào. Disk còn
24,42% trống. Recovery capacity yêu cầu trên 25% cùng các điều kiện khác liên tục
10 phút; không hạ ngưỡng hoặc reset latch để mở signup.
