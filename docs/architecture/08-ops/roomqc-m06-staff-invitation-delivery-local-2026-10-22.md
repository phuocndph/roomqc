# M06 — lời mời nhân viên: native Auth và SMTP nội bộ

Ngày 22/10/2026, Asia/Bangkok. **Scoped local verified; chưa nghiệm thu phát hành.**

Phạm vi toàn bộ roadmap vẫn là quản lý VPS + signup, đầu ra plan + nghiệm thu.
Lát này thuộc T01/T03/T04/T08 và phần EC05/EC06–EC08 đang mở; không tạo thêm
task hoặc release case, không đóng toàn bộ luồng đăng ký khách hàng.

## 1. Kết quả và phạm vi bằng chứng

Run **bb06cde8536d** kết thúc exit0: **19/19 actual delivery**, **31/31 management**,
**22/22 invitation acceptance**, **7/7 compiled production caller**.
Focused frontend **277/277** (22 file), full control **223/223**, TypeScript và
targeted ESLint đạt. 13 structural/SMTP unit tests là tập con của223, không cộng
thêm. Không lấy tổng test làm phần trăm hoàn thiện hoặc số release case đạt.

Đã đi qua HTTP của compiled Edge thật, native Auth thật và SMTP capture nội bộ:
tạo/gửi lại lời mời, create-user alias, nhận invite token, xác minh token qua
native Auth, đổi mật khẩu có receipt và accept tạo đúng một role/membership.
Một lần SMTP từ chối được báo lỗi, không giả delivered; retry/recovery vẫn giữ
đúng invitation và native identity.

Đây **không** là browser/Android E2E hoặc lần click GET/deep-link từ hộp thư.
Kiểm token qua native Auth không chứng minh trình duyệt redirect hoặc deep-link.
Không có thư ra Internet, provider/DNS thật, serving DB hay VPS được thay đổi.

Artifact đã làm sạch:
[JSON](../../../artifacts/roomqc-m06-staff-invitation-delivery-local-2026-10-22.json).
Checkpoint [management741](roomqc-m06-staff-invitation-management-local-2026-10-22.md)
và [caller738](roomqc-m06-staff-invitation-caller-local-2026-10-22.md) giữ bất biến,
không gán các kết quả cũ cho source hiện tại.

## 2. Candidate đã khóa

- Source **744 file /543 migration**; trước/sau cùng SHA256:
  `8fe828ad49a7ed8427dfdf9c967d69fc9c85881c71fd41ecf886ddcd4ae76761`.
- Manifest kế thừa pathManifest management741 và thêm delivery harness,
  SMTP sink test, migration543. Resolve base/union đệ quy, distinct/sorted path;
  hash path+NUL+UTF8 nội dung chuẩn CRLF→LF+NUL. Tài liệu không nằm trong hash code.
- Schema trước/sau/sau advisors cùng fingerprint:
  `55ac2c7af283e207c62f8cc06464d45cb3f9b7dc604e61cb98ac234406e3d6db`.
-543 migrations đã replay trong disposable sandbox riêng. Đây là scoped
  diagnostic trên full schema, **không** default full backend A/B.
- Artifact ghi hash compiled caller/Edge/create-user bundle và exact native
  Auth image/binary/config. Không nâng vendor hoặc thay Auth serving.

Code chỉ ở integration worktree. Primary chỉ nhận sáu plan docs và report/
artifact đã làm sạch. Không commit, merge, reset hoặc stage thay người dùng.

## 3. Lỗi tái hiện và bản sửa

### 3.1. Lỗi fixture dotenv, không gán thành lỗi serving

Run e612a5688a18:31 management checks đạt, actual send đầu tiên đạt nhưng
assertion native link thất bại. Giá trị mailer path có balanced quotes bị đưa
nguyên vào URL dưới dạng encoded quotes.

Sửa parser fixtureEnv để bỏ một cặp quote bao ngoài cân bằng; giữ assertion
exact native `/auth/v1/verify` và callback origin/path. Chưa chứng minh config
serving có cùng lỗi. MIME quoted-printable được decode trước khi kiểm link.

### 3.2. Lỗi người nhận native Auth đã confirmed nhưng chưa có profile

Run6f1712dbfed6:31 management checks và3 delivery checks đầu đạt; mời tài khoản
confirmed/pre-profile trả503. Reserve chỉ tìm identity qua revoked invitation
cũ, nên invitation mới chưa bind người nhận; Edge chọn invite thay vì recovery.

Native CLI tạo forward migration:
`supabase/migrations/20261021213202_staff_invitation_native_recipient_binding.sql`.

Migration543 thay private management function, giữ public service-only INVOKER
adapter và migration542. Khi reserve:

1. Resolve unique native account bằng canonical email của invitation, không
   nhận caller UUID làm nguồn quyền; ambiguous identity từ chối.
2. Đưa identity đó vào lock order Auth→profile→invitation, rồi kiểm lại email/
   binding, audience, SSO/deleted/banned và tình trạng profile.
3. Bind đúng identity trước dispatch. Confirmed/pre-profile dùng recovery;
   không đổi mật khẩu, tạo profile, role hay hotel membership ở bước này.
4. Giữ live actor/exact session/role/capability, audit, CAS/cooldown và ACL
   service-only; không thêm broad grant.

Run cuối xác nhận recovery cùng identity, password unchanged, profile absent;
người bị banned không gửi được và sau restore cùng identity gửi được.
Đây là proof của các ca đã ghi, chưa phải mọi recipient hoặc offboarding path.

## 4. 19 ca actual delivery đã đạt

| Ca | Kết quả kiểm được |
|---|---|
| 1. Create người nhận mới |200; một thư, bind native identity |
| 2. Replay create trong cooldown |429; không thêm thư hoặc hiệu ứng nghiệp vụ |
| 3. Resend ngay |429; không thêm thư |
| 4. Confirmed/pre-profile |200; recovery tới cùng identity |
| 5. Password/profile trước accept |Mật khẩu giữ nguyên, chưa có profile |
| 6. Actual create-user alias |200; compiled alias ép mode create đúng contract |
| 7. Actor không có quyền |403; không thư, không hiệu ứng |
| 8. Native SMTP từ chối |503; một lần từ chối, không báo delivered |
| 9. Uncertain reservation |Giữ reservation; không profile |
| 10. Retry ngay sau từ chối |429; không gửi mù |
| 11. Resend sau cooldown thật |200; cùng identity; đã chờ62.744ms, không sửa timestamp |
| 12. Recovery sau SMTP refusal |200; cùng invitation |
| 13. Token invite nhận thực |Native Auth verify thành công, đúng identity |
| 14. Đặt mật khẩu |Native actor/session receipt, vẫn chưa có profile |
| 15. Accept |200; đúng một role và một hotel membership |
| 16. Accepted replay |200; chỉ đọc, hiệu ứng không đổi |
| 17. Revoked |409; không thư, hiệu ứng không đổi |
| 18. Banned recipient |403; không thư, hiệu ứng không đổi |
| 19. Restored recipient |200; recovery cùng identity |

Tổng capture **6 thư nhận /1 thư bị từ chối**. Số này không là exactly-once
guarantee cho provider bên ngoài. Reservation có thể uncertain; không tự release/
gửi lại khi chưa biết kết quả.

## 5. Cách cô lập và bảo vệ dữ liệu

SMTP capture nằm trong memory của process thuộc gateway namespace sandbox,
chỉ nghe nội bộ Docker network. Không published SMTP port, Internet egress,
forwarding hoặc API đọc hộp thư. Chỉ nhận exact run-owned `roomqc.invalid`
recipient; từ chối địa chỉ ngoài scope.

Raw MIME/body/link/token chỉ ở memory để assertion; close sink thì discard.
Không đưa nội dung thư, token, secret/env, ownership hoặc private log vào report.
Hai Edge instances bật local provider gate để native Auth dùng SMTP nội bộ;
instance provider-disabled và các no-send checks vẫn được giữ.

Tất cả ba runs đã cleanup **15 owned objects/run**; kiểm độc lập exact run label
không còn container/network/volume (**0/0/0**). Không cleanup theo prefix rộng
hoặc chạm runtime RoomQC/CRM đang phục vụ.

## 6. Hồi quy cuối, không dùng kết quả giữa chừng

| Kiểm tra | Kết quả terminal trên744/543 |
|---|---|
| Backend scoped diagnostic |19 delivery +31 management +22 acceptance +7 caller; exit0 |
| Focused frontend |277/277,22 files; exit0; synthetic save refusal stderr đúng expected |
| Full control |223/223;0 fail/skip/cancel;135.982,7075ms |
| Structural + SMTP unit |13/13; tập con của223 |
| TypeScript app |exit0 |
| ESLint5 MJS files |exit0,0 warning |
| Node syntax / whitespace |Đạt; diff check dùng semantics CRLF của repo |
| Source và schema trước/sau |Khớp, kể cả schema sau advisors |
| Cleanup |15 objects/run; leftovers0 trên cả3 runs |

Monitoring drill của full control chỉ đo **Docker Desktop VM**,
`fiveServiceProbesVerified=false`, `admissionOpened=false`. Không phải Linux host
hoặc timed full-service health proof.

Tái chạy diagnostic theo runner contract:
`node scripts/test-control-backend-sandbox.mjs --run --diagnostic staff-invitation --advisors-cli <absolute-native-cli>`.
Chỉ dùng exact-owned disposable sandbox sau preflight; không trỏ tới serving.
Full default A/B là nhiệm vụ nghiệm thu riêng, không dùng diagnostic này làm
passing full-build reference.

## 7. Failed history giữ nguyên

| Run/source | Đã chạy trước lỗi | Lỗi / sửa | Cleanup |
|---|---|---|---|
| e612a5688a18,743/542 |31 management +1 delivery |Quoted mailer path; sửa sandbox dotenv parser, không hạ expected |15, leftovers0 |
| 6f1712dbfed6,743/542 |31 management +3 delivery; ca confirmed thất bại |503 native recipient binding; forward migration543 |15, leftovers0 |
| bb06cde8536d,744/543 |19+31+22+7 đạt |Run cuối exit0 |15, leftovers0 |

SHA từng source và counts chi tiết nằm trong artifact. Không xóa failure hoặc
sửa expected để giữ report xanh; hai failure không được relabel thành full pass.

## 8. Advisors và việc chưa nghiệm thu

Native CLI2.121.0 thực chạy: **653 findings** =19 no-policy INFO +8 unindexed FK
INFO +491 unused-index INFO +135 multiple permissive WARN;0 ERROR.
Không gọi653 là653 lỗi, không gọi0 ERROR là an toàn, không nhận unused count
làm index fix. Disposition đủ19 targets, policy semantics/indirect paths và FK
vẫn mở trong T08; audit17 lịch sử không chứng minh hai receipt tables mới.

Chưa có proof cho full inviter-role/capability/hotel membership/report/position/
recipient/offboarding matrix; observed accept/password/revoke lock barriers;
management UI exact-session/runtime context/cache/abort/readback; browser
hai tab/network loss/Android; native GET/deep-link; default full frozen-source A/B;
Linux/TLS/email provider thật/offsite restore/on-call/load/pilot/reviewer.

Không gán33 password controls/config faults lịch sử thành rerun744: diagnostic
này không chạy lại toàn bộ các suite đó.

## 9. Bàn giao tiếp và rollout

1. Management UI: captured actor/exact native session/runtime/tenant/hotel,
   strict receipt, query key/invalidation, abort/stale response, single-flight
   và status readback; không áp kết quả cũ sau đổi identity.
2. Mở rộng role/capability/membership/report/position/recipient/offboarding
   matrix; positive→negative/no-effects→recovery, expected trước run.
3. Quan sát hai thứ tự lock accept/password/revoke; browser/network/Android
   kiểm riêng, không dùng mocked response-loss thay network E2E.
4. Freeze candidate cuối, fresh default full A/B/control/FE/advisors/recovery/
   cleanup và reviewer; A/B đồng thời còn thuộc T21.
5. Tiếp EC10–EC15/workflow/19-target/policy/FK →issuer/trust/timed health →
   alerts/admission/budget →signup/reconcile/abuse →console →Linux/DR/RC/pilot.

Trước apply môi trường thật phải review đúng migration542+543/shared Edge và
native Auth image/config, backup/rollout/rollback tương thích schema; không
rollback bằng broad grants, down-migrate, reset DB hoặc đổi cụm khách đang dùng.
Hiện chưa apply serving, VPS, DNS, provider hoặc gửi mail thật.

Bộ plan vẫn **8 đợt /27 gói /25 task /70 case /122 releaseAcceptance unverified**.
Gate L/S/P/U/B, owner/reviewer/signoff không đổi. Thiếu khóa/quyền chỉ hoãn đúng
bước external, không ngăn tiếp local và không được tính pass.

Đọc [bàn giao điều hành](roomqc-vps-signup-delivery-brief-2026-10-22.md),
[kế hoạch toàn bộ](roomqc-vps-signup-preparation-plan-2026-10-21.md) và
[quy trình nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md).
