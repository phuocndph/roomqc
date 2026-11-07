# RoomQC — ký biên nhận và xuất file khóa phục hồi, kiểm thử local

Ngày 28/10/2026. Đây là phần triển khai tiếp theo của T08/T12 trong [kế hoạch tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md), chưa phải bộ cài vận hành hoặc nghiệm thu VPS.

## 1. Kết quả bàn giao

Đã triển khai hai thành phần nội bộ:

- [Ký khóa từ biên nhận](../../../server/control/setup-credential-signing.mjs): dùng `jose` ghim phiên bản6.2.13; hỗ trợ HS256, RS256 và ES256. Không tự tạo ID hoặc gia hạn claims. Receipt phải khớp target, release fingerprint, credential ID, affected ID, DB iat/exp và signer algorithm/fingerprint. TTL từ120–3.600 giây; không ký receipt đã hết hạn hoặc còn quá ít thời gian.
- [Xuất file có phục hồi](../../../server/control/setup-credential-publication.mjs): dùng session advisory lock727012 cùng mutex với giao thức DB; đọc lại receipt theo đúng caller và live status trước ký và ở các fence. Giữ intent riêng, stage file private/exclusive, fsync, atomic rename, fsync thư mục trên Linux và kiểm receipt RPC thật bằng file đã xuất.

Thành phần này chưa có đường HTTP hoặc CLI cấp khóa độc lập. Hàm `assertAuthority` bắt buộc do bộ cài bao ngoài cung cấp; phải ném lỗi khi release/authority không còn hợp lệ. Trong native test hiện tại callback này là fixture, không chứng minh live directory authority hoặc DB identity đã được nối.

## 2. Bất biến dữ liệu và filesystem

1. Receipt là lịch sử đã commit. Chỉ trạng thái hiện hành khớp đúng head, version, target, release và hạn mới cho phép xuất file. Receipt bị giả hoặc head khác bị chặn trước khi tạo output.
2. DB commit và file publish là hai bước. Chạy lại cùng receipt giữ nguyên credential ID/iat/exp; publisher không gọi issue/bind/revoke hoặc ghi bảng nghiệp vụ.
3. Intent không chứa bearer/private key. Intent ghi dở chỉ được sửa nếu là prefix chính xác của nội dung deterministic cho cùng command/receipt/target/output/key fingerprint. Intent khác bị giữ nguyên và báo conflict.
4. Stage file ghi dở chỉ được dựng lại ở đúng đường đã có intent bền vững. Symlink/hardlink hoặc file không private không được dùng. Không quét/xóa thư mục người vận hành.
5. Chỉ thay output đang trống, cùng credential hoặc predecessor của receipt. Output khác bị conflict. Nếu file đúng credential đã xuất, kiểm chữ ký và dùng lại, không ký lại hoặc thay inode không cần thiết.
6. HS256 pin SHA256 của bytes secret, tối thiểu32 bytes; không trim signing secret. RS256 pin SHA256(SPKI DER), RSA tối thiểu2048 bit. ES256 dùng P-256 và cùng cách pin public key. File private PEM dùng PKCS8. Kiểm lại file ký trước các fence; không ghi key/token ra stdout, argv, receipt hoặc báo cáo.
7. Sau publish, loader đọc file và native `roomqc_setup.receipt` phải thành công, rồi fence lần cuối. Một boolean hoặc chữ ký hợp lệ riêng lẻ không được dùng làm chứng minh runtime sẵn sàng lâu dài.
8. Lỗi native filesystem/crypto/PG/transport được đổi thành mã đã lọc. Mutex được thả cả khi có denial; caller phải bỏ session nếu unlock thất bại. Bộ cài bao ngoài vẫn phải có deadline và hủy/discard session hữu hạn.

## 3. Bằng chứng cùng mã nguồn

Backend snapshot: **281 files**, SHA256 `33d8482f5c9e784d8d54cfce29ebf33a0f0d47ab66e6df9f993c074a7afcf7d9`.

| Bằng chứng | Actual | Giới hạn |
|---|---|---|
| [Native DB/REST/process](../../../artifacts/roomqc-setup-publication-native-148610a4b66c-local-2026-10-28.json) | 262/262 controls,583 business+18 directory migrations, terminal0, schema trước/sau không đổi, end-source verified, cleanup containers/volumes/networks0 | Diagnostic tách riêng; release/health/confirmed Auth vẫn fixtures; chưa full candidate/default/rebuild hoặc VPS |
| Publication bên trong native packet | 18/18 mới,4 SIGKILL có barrier và resume; PostgreSQL/PostgREST thật; Linux private files | Thử internal publisher bằng tiến trình thật; không gọi đó là operational installer CLI hoặc daemon thay khóa |
| [Control regression](../../../artifacts/roomqc-workspace-recheck-b3bfc8f11661-local-2026-10-28.json) | 663 tổng,661 pass,0 fail,2 skip; terminal0, cùng source và cleanup0 | Hai skip giữ nguyên: quyền tạo symlink trên Windows; POSIX notification modes chỉ kiểm trên Linux |
| [Kiểm signer](../../../server/control/setup-credential-signing.test.mjs) | 5/5: target/expiry/claim injection, HS256/RS256/ES256 với đúng/sai key, token tamper và key file đổi | Asymmetric là unit crypto proof; native PostgREST của run này dùng HS256 fixture |

262 controls gồm184 API/worker/CLI nền và78 credential/status/attestation/publication. Bên trong78 có18 publication mới,60 trước đó giữ hồi quy. Bốn publisher SIGKILL tách khỏi hai SQL-writer SIGKILL, mười API/worker SIGKILL và một CLI SIGKILL nền; không cộng thành số ca nghiệm thu phát hành.

Các điểm kill mới: sau intent fsync; sau stage fsync; trước rename; sau rename. Mỗi điểm chạy lại và replay lần nữa bằng tiến trình thật; ID/iat/exp giữ nguyên và native RPC thành công. Thêm cạnh tranh hai process, stage bị cắt dở, receipt giả, authority fixture từ chối, symlink/hardlink output, intent conflict và mutex release kiểm từ session khác. Live DB state trước/sau giữ nguyên ngoài observedAt.

Advisors đo lại bằng CLI2.122.0:808 findings =561 INFO +247 WARN (`multiple_permissive_policies`). Chưa có disposition/reviewer nên không coi đây là security acceptance.

## 4. Phần còn phải nối trước vận hành

- Strict CLI/config/command files; approved inventory/target và release v3, DB system identifier/OID/name/login, owner/ACL/surface preflight và live directory authority. Không lấy observed hash làm approval.
- Tách capability issuer với bind/revoke, khai báo consumer/pool1 và rolling overlap cho business/directory; không dùng migration reserve. Bộ cài giữ timeout/deadline hữu hạn và discard connection khi mất lock/unknown.
- Nối issue→receipt→publisher bằng cùng key/journal, kiểm mất response trước/sau DB commit và file ở toàn tuyến. Publisher hiện tại nhận receipt đã commit; proof này không tự đóng phần issue/config/target của installer.
- Một rotator mỗi target, refresh margin/backoff, overlap10–60 giây, verify rồi retire/revoke bằng capability riêng; lỗi quá overlap phải ngừng phục hồi và cảnh báo, không hồi sinh khóa cũ.
- **Mount thư mục output riêng theo chế độ read-only cho runtime.** Bind-mount một file đơn có thể giữ inode cũ sau atomic rename. Signing material, DSN và config/journal vận hành không được nằm trong thư mục runtime có thể đọc. Cần test reload qua mount thật, restart, expiry và quyền của UID runtime; test filesystem hiện tại chưa thay phần đó.
- Tích hợp default full/rebuild, freeze candidate, Linux VPS/TLS và reviewer theo [hồ sơ nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md). Windows local có thể kiểm chức năng nhưng không có proof directory fsync tương đương Linux để dùng vận hành.

Hiệu lực thu hồi actor giữa Auth và directory vẫn là protocol riêng, chưa được giải quyết bởi mutex hoặc revoke credential trong một business DB.

## 5. Nghiệm thu và thay đổi môi trường

Không migrate database phục vụ, không cấp credential vận hành, không đổi DNS/secret/flags, không bật worker/signup/dispatch. Ledger và worksheet gốc giữ nguyên:70ca not_run,122mục release unverified,124lượt môi trường chưa có actual nghiệm thu, reviewer/signoff/gates không đổi. Goal toàn bộ VPS+signup vẫn còn mở.
