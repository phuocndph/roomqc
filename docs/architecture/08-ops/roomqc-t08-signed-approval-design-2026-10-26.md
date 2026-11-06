# RoomQC — thiết kế thực hiện phê duyệt bản phát hành T08

Ngày 26/10/2026. Checklist con T03/T08, hồi quy T06/T09/T11/T12.
Giữ nguyên 8 đợt, 27 gói, T01–T25 và 70 ca trong
[kế hoạch](roomqc-vps-signup-execution-ready-2026-10-22.md).
Đây là thiết kế để thực hiện, **chưa có tính năng hoặc nghiệm thu tương ứng**.
Thiết kế được soạn khi runtime đóng băng ở98b0713 trong rebuild380159ba6e22;
lượt này sau đó đã terminal0,source/schema/runtime khớp và cleanup độc lập0.
[Artifact thiết kế và giới hạn bằng chứng](../../../artifacts/roomqc-t08-signed-approval-design-2026-10-26.json).

## 1. Những khoảng trống xác nhận từ source hiện hành

| Đường thực tế | Hành vi hiện có | Delta bắt buộc |
|---|---|---|
| release-validation.mjs / ReleaseValidationCatalog | Catalog v1 do installer nạp; expected không có chữ ký hoặc expiry riêng | Catalog ký và public trust keyring; không nhận catalog v1 như approval hợp lệ sau chuyển đổi |
| cluster.mjs / validateCluster → admin.mjs / execute(validate) | Thu manifest ngoài transaction, kiểm lại fingerprint trong transaction | Gắn approval ID/digest/epoch và đọc authority bền vững ở cả hai phía collection |
| workers/health-probes.mjs / ManagedHealthCatalog | Expected metadata v1 được giữ trong worker | Worker xác minh cùng signed approval; cache không được thay authority trong directory |
| telemetry.mjs / HealthStore.record | Khóa 727001, kiểm credential/target/policy/release rồi ghi health | Kiểm thêm approval hiện thời theo clock DB ngay giao dịch ghi; proof cũ không được tăng generation |
| admin.mjs / clusterSelect, withCredential → health-policy.mjs / admissionDecision | Đọc probe revision/binding và health; chưa có approval authority | Đọc identity/expiry/epoch hiện thời từ primary; thiếu hoặc lỗi đọc thì chặn nhận mới |
| store.mjs / reserve | Quyết định và giữ suất trong transaction với khóa 727001 | Thêm approval vào điều kiện giữ suất và admission snapshot |
| store.mjs / beginProvision | Chỉ kiểm admission khi current.status=reserved | Kiểm approval cho mọi lần định gửi write mới, kể cả retry khi status=provisioning |
| app.mjs / provision → ClusterGateway.provision → store.activate | beginProvision commit trước remote call; activate sau response | Phân biệt write chưa bắt đầu, write đã được cho phép và outcome chưa rõ; không hứa thu hồi được một remote commit đã xảy ra |
| app.mjs / bootstrap → gateway.binding → store.activate | Có thể phục hồi bằng receipt đã tồn tại | Receipt read/reconciliation vẫn phải có đường chạy khi đã dừng cấp phát mới; không phát lại write để kiểm kết quả |

Đã kiểm source của các caller trên; danh sách file và tên hàm là inventory thực,
không khẳng định các delta đã được nối. Bằng chứng hiện hành ở
[source review](roomqc-t08-current-source-review-2026-10-26.md).

## 2. Envelope và nguồn tin cậy

Chọn Ed25519 từ node:crypto; runtime chỉ nhận public key. Issuer giữ private
signing key ngoài API, worker và frontend. Local dùng key tạo riêng cho fixture.
Không dùng canary JWT, hash nhận từ dịch vụ hoặc secret service_role làm issuer.

Envelope có version, thuật toán cố định, issuerId, keyId, payload và signature.
Payload chứa approvalId, approvalEpoch, inventoryRef, clusterId, hostId,
environment, endpoint binding, expected release identity, notBefore và expiresAt.
Expected identity giữ đủ cluster/release/artifact/frontend/migration/schema hashes
hiện hành; không giảm về chỉ releaseId. Endpoint binding so với inventory đã duyệt
và giữ nguyên URL/IP/redirect/SSRF guards, không cho payload tự thêm URL cần gọi.

Quy tắc bytes: canonical JSON với key order xác định, kiểu dữ liệu và exact keys
đã kiểm, không NaN/Infinity/undefined. Ký bytes UTF-8 sau tiền tố phân miền cố định
cho RoomQC release approval. Signature base64url phải canonical và đúng 64 bytes;
key phải đúng Ed25519 public material, từ chối private field và thuật toán khác.
Không ký JSON.stringify tùy theo thứ tự input hoặc hash do remote tự khai.

Đã kiểm khả năng crypto trên Node v24.11.1 của máy local bằng key chỉ giữ trong
memory: ký/xác minh đạt; sửa payload, sai key hoặc sai domain bị từ chối; public
JWK không chứa thành phần private. Không ghi/in private key. Kiểm này chưa phải
product validator, canonical parser, runtime image hoặc Linux compatibility proof.

Đã kiểm bổ sung cùng các phép crypto trong đúng image Node 22 Alpine pin digest
được managed worker sử dụng, báo Node v22.23.2. Container chạy network=none,
filesystem readonly, không mount dữ liệu hay khóa; các phép ký/negative đạt.
Kiểm độc lập exact label sau --rm: container/network/volume đều 0, ba lệnh exit 0.
Đây chỉ là khả năng crypto của image, chưa là approval flow hoặc Linux VPS proof.

Trust keyring có version, issuer/key ID duy nhất, public key fingerprint và phạm
vi môi trường được phép. Signature đúng vẫn phải qua binding, thời gian và
authority epoch trong directory. Keyring là cấu hình installer, không từ HTTP.
Đọc file bounded/absolute/regular/no-symlink, kiểm quyền Linux theo bộ loader
hiện hữu. Không đưa nội dung envelope hoặc lỗi crypto thô vào log/API receipt.

Hạn approval tách hẳn hạn canary/Auth. Không tự đặt thời hạn vận hành production
trong lượt local: validator yêu cầu thời gian hợp lệ và policy TTL đã cấu hình.
Đồng hồ directory là nguồn quyết định ở transaction; kiểm local trước network
chỉ là chặn sớm. Phải thử expiry khi response đang bị giữ và sau restart.

## 3. Authority bền vững và quyền database

Thêm directory migration mới theo cơ chế migrateDirectory; không sửa chín
migration cũ và không đưa schema directory vào Supabase business migrations.
Số thứ tự/tên migration chỉ chốt sau khi kiểm lại manifest lúc source được mở.

Authority hiện thời theo cluster phải có approval ID, envelope digest, issuer/key
fingerprint, expected/binding fingerprint, not-before/expiry, epoch, state và row
version. Lịch sử cài/thu hồi giữ durable receipt, client key, payload hash, reason,
actor authority, request ID và timestamp. Không lưu private signing key, canary
JWT, refresh token hoặc mật khẩu owner vào các bảng này.

| Role | Quyền tối thiểu |
|---|---|
| Release installer riêng | Cài approval đã xác minh, thay key/binding qua command có version và receipt; không dùng login API/metrics/probe runtime để cài |
| API | Đọc projection approval; thu hồi qua mutation giới hạn; không INSERT hoặc kích hoạt lại authority bằng SQL runtime |
| Metrics/probe/worker | Đọc metadata cần kiểm identity/epoch/expiry; không cài, hạ epoch hoặc tái kích hoạt approval |
| Browser/anon/authenticated | Không truy cập trực tiếp bảng directory, keyring hoặc installer command |

Các write authority phải lấy cùng lock 727001 trước row lock, kể cả write trực
tiếp của installer được phép. Guard DB không tin JWT claim hoặc biến session
do HTTP truyền vào để nhận installer role. Không bổ sung grant DDL cho runtime.

Mỗi lần thay approval hoặc thu hồi làm epoch tăng, không dùng lại approvalId đã
thu hồi. Cùng key/cùng payload trả receipt lịch sử và không tăng epoch; cùng key
khác payload bị conflict. Replay lệnh cũ sau khi có approval mới không được làm
thay đổi approval mới hoặc giả rằng snapshot lịch sử là trạng thái hiện tại.

Thu hồi đặt manual closed/operator reopen required và làm proof cũ không hợp lệ.
Phê duyệt mới không tự mở signup, bỏ latch, reset backup gate hoặc đổi routing.
Rotating canary không được biến thành đường cấp approval mới.

## 4. Thu hồi giữa nhiều process và giới hạn remote effects

Hai API/worker đọc cùng primary directory. Public keyring/cache có thể khác tuổi,
nhưng mọi transaction tạo health, reservation hoặc quyền write mới đều phải
đối chiếu durable authority. Notification chỉ giúp vô hiệu cache nhanh; mất
notification hoặc DB unavailable vẫn phải chặn nhận/cấp phát mới.

Collection chạy ngoài transaction. Khi commit, so lại approval ID/digest/epoch,
binding, hạn, credential/target/policy versions và clock DB dưới cùng lock. Response
đã lấy trước thu hồi không được tạo health mới, validate mới hoặc reservation mới
sau khi lệnh thu hồi thắng thứ tự transaction. Không giữ transaction qua HTTP.

Đối với provisioning, phải ghi rõ thứ tự được phép trước khi viết code:

1. Chưa có quyền write bền vững: thu hồi thắng trước thì không gửi provision RPC.
2. Một operation đã được cấp quyền bền vững trước thu hồi có thể đã gửi remote
   write. Không thể cam kết hủy commit đó bằng việc đóng admission ở directory.
   Giữ operation/receipt và đọc đối soát; không xóa tenant hoặc tạo lại tenant.
3. Mất response không là thất bại xác định. Receipt read/reconciliation được chạy
   để tìm kết quả cũ; retry không được ngầm cấp một quyền write mới bằng cờ
   provisioning đã lưu. Job cần phân biệt dispatch chưa rõ và dispatch mới.
4. Activation từ receipt đã commit trước đó phải được xử lý theo binding/receipt
   contract, audit và điều kiện phục hồi; không mở nhận mới hoặc chuyển cụm.

T08 phải thử first-call fence và giữ nguyên case unknown outcome. Phần durable
dispatch/lease/receipt reconciliation của T11/T12 vẫn phải khép trước nghiệm thu
signup. Không ghi rằng T08 đã giải quyết distributed commit hoặc mọi workflow.

## 5. Key rotation, restart và restore

Key rotation là cài trust material mới cùng approval/epoch mới qua installer.
Withdraw theo key phải vô hiệu toàn bộ approval chịu ảnh hưởng trong directory;
không chỉ xóa key khỏi một file của một process. API/worker cũ bị fence ngay ở
giao dịch tiếp theo; installer/public trust key và canary credential là ba vai trò.

Restart và rollback file cũ không được hạ epoch hoặc tái cài approval đã thu hồi.
Restore **database** có rủi ro lùi cả lịch sử thu hồi: không thể giải quyết bằng
epoch chỉ tồn tại trong chính backup đã phục hồi. Quy trình T19 phải cách ly host
restore, đóng admission/dispatch và yêu cầu authority mới đối chiếu checkpoint
thu hồi giữ ngoài failure domain trước khi mở. Chưa có proof checkpoint ngoài
host thì để acceptance DR tương ứng pending; không công bố anti-rollback DB đạt.

## 6. Kiểm thử và bằng chứng phải bàn giao

Các dòng dưới là checklist con của A06/B02/C01–C04 và hồi quy B04–B07/C05–C10/
D01/D07–D11, không tạo case mới hoặc đổi expected trong worksheet.

| Lớp | Bài thử bắt buộc / kiểm effects |
|---|---|
| Signature | Valid; tamper từng trường; key/issuer/algorithm/version lạ; signature sai encoding/length; private key trong public keyring; exact types/keys/bounds |
| Time/binding | Missing/wrong/not-yet-valid/expired approval; đúng release nhưng sai host/cụm/environment/endpoint/frontend/schema; canary còn hạn nhưng approval hết hạn và ngược lại |
| Database | Upgrade từ directory 9 có dữ liệu, rerun/checksum; runtime không thể install/reactivate/hạ epoch; audit fail rollback; migration không chạy nhầm business DB |
| Hai process | A thu hồi khi B giữ response thật; B commit bị từ chối, snapshot/generation/reservation không đổi; cycle tiếp và restart cũ cũng bị từ chối; notification bị mất |
| Command | Hai revoke cạnh tranh, same-key replay, changed-payload conflict; receipt/result read đúng actor/target; old replay không tác động approval mới |
| Recovery | New signed approval + installer command; proof và warmup mới; manual/latch/backup gate còn hiệu lực, routing khách cũ không đổi |
| Signup | Reserved và provisioning retry đều kiểm quyền write; kill/lost response giữ unknown; đọc receipt cũ không provision lại; đo allowed effects theo thứ tự transaction |
| Restore | Rollback config cũ bị fence local; restore DB/offsite có gate và checkpoint riêng trên Linux staging, không suy từ unit test |

Sau implement: focused signature/loader/authority/races → freeze candidate mới →
full control có directory DB → default full backend → independent rebuild đúng
source khi runtime thay đổi. Report ghi native exit, manifest đầu/cuối, cleanup
độc lập theo exact-owned labels, failed history, limitations và reviewer.

## 7. Điểm nhận việc

Native terminal0/cleanup0 của rebuild380159ba6e22 đã đạt. Tiếp thực hiện theo
thứ tự: signed validator/keyring → authority migration/store/
installer và withdrawal → nối validate/health/admission/reserve/first-call → kiểm
hai process/fault/recovery → packet tích hợp. Không tách validator thành tính năng
đã hoàn thành khi các đường có effects vẫn chấp nhận approval cache hoặc catalog v1.

Linux, issuer key thật, offsite và phê duyệt mở cho khách vẫn giữ gate riêng.
Thiết kế này không đổi 70 worksheet not_run, 122 entries unverified hoặc signoff.
