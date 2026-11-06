# RoomQC — bản sửa nhân viên đã có source, chưa qua tích hợp local

Ngày ghi nhận: 21/10/2026. Phạm vi: T03/T04/T08, phiếu 15.2.5.
Đây là báo cáo **failed attempt**, không phải passing A/B, nghiệm thu release
hoặc phê duyệt triển khai. Lượt chốt plan chỉ thu nhận terminal của run đã chạy;
không sửa sản phẩm, không chạy thêm backend hay tác động runtime đang phục vụ.

## 1. Baseline và candidate không được đánh đồng

[Baseline cũ](roomqc-m06-employee-workflow-baseline-local-2026-10-21.md)
682ee517c6c9 xác nhận profile PATCH 200 rồi role upsert 403, có partial commit.
Giữ bất biến. Candidate đã thêm atomic employee RPC, receipt, migration và caller
desktop/mobile; [contract](roomqc-employee-profile-edit-contract-2026-10-21.md)
mô tả ý định, không chứng minh operation chạy đúng.

Candidate hiện tại: **678 files / 536 migrations**; scoped source SHA256
`8cd409da6b6b7e5c60c181a256dbeee669a266c0cc9e0676cf3227960def6bff`.
Capture trước run 5e6f2fca306e và recompute sau terminal khớp; không phải manifest
toàn release. Không kế thừa A/B 668-file của bản sửa account/session.

## 2. Hai lần tích hợp đã kết thúc

| Run | Kết quả thực | Phạm vi chứng minh |
|---|---|---|
| e8f04fd4b95e | Exit 1 ở no_policy_controls; catalog là 18 nhưng harness cũ chờ 17 | Harness-count mismatch; chưa chạy employee, không dùng làm product proof |
| 5e6f2fca306e | Exit 1 ở hotel_scope_checks; employee verified=false/incomplete=true | Positive employee đầu tiên trả HTTP 400 / SQLSTATE 23514; chưa có passing A/B |

Cả hai run báo cleaned=true, đã dọn 18 Docker objects/run theo runner exact-owned.
Lần đầu dùng source fingerprint `0326aad842b1683da4d3f84550f4d84e0404ba0c60d8c2e5331174d4445c9914`,
không phải candidate của lần thứ hai.

Lần thứ hai đã giữ toàn bộ 17 target cũ và thêm receipt target mới:
216 browser/probe denials (204 cũ + 12 mới), 60 private service denials
(56 cũ + 4 mới), 39 installer/service-read positives; no-policy controls verified.
Đây là direct SQL actor checks, chưa chứng minh mọi indirect path.

## 3. Expected/actual của employee positive

- Label: manager-edits-created-staff.
- Expected: atomic_metadata_success, profile/audit/receipt cùng thành công,
  authority giữ nguyên.
- Actual: HTTP 400, SQLSTATE 23514; passed=false.
- Authority unchanged=true; requested name saved=false; audit delta=0; receipt delta=0.
- Chỉ một check đã ghi; employee races=0. Các negative/replay/fault/race/recovery
  phía sau chưa chạy. Không dùng count này để kết luận toàn bộ rollback đúng.
- setupErrorCode=ERR_ASSERTION là assertion dừng suite sau positive thất bại,
  không phải chứng cứ tự nó xác định nguyên nhân lỗi schema/fixture/sản phẩm.
- Chưa xác định constraint cụ thể hay root cause. Cần tái hiện hẹp trên fixture
  cùng full schema và phân loại trước khi sửa; không bỏ constraint/đổi expected.

Trong run này 280/280 hotel-scope observations, 1.764/1.764 account/session và
20 scoped owner-POST races hoàn tất; không thay full employee authority matrix.
Final permission recovery và kiểm schema freeze cuối runner chưa được đạt tới.
Advisors: 606 = 18 no-policy + 8 unindexed FK + 445 unused-index +
135 multiple-permissive-policy; count không là defect count hoặc chỉ thị xóa index.

## 4. Phiếu nhận tiếp — không mở rộng quyền để làm test xanh

1. Tái hiện positive 23514 hẹp, ghi tên constraint/trigger và effect snapshots
   đã lọc; đối chiếu fixture, audit enum, profile/membership contract. Chỉ forward
   fix phần được xác nhận; không mặc định product bug hay fixture bug.
2. Giữ role/level bất biến, cùng atomic edit cho desktop/mobile; actual
   owner/manager positive trước khi kiểm deny/replay/fault/races.
3. Đối chiếu entry owner/self: tự sửa hồ sơ đi đúng /profile; entry owner/platform
   khác cần disposition chính xác. Không nới employee RPC để che UI sai đích.
4. Direct users PATCH, legacy update-user Edge, department templates và durable
   retry qua remount/tab mới còn riêng. Chưa runtime test thì not-run/unresolved.
5. Focused/full regression → fresh frozen-source A terminal exit 0/cleaned →
   B tham chiếu A thành công → so identity/expected/effects/schema/advisors.
   Không dùng hai failed run làm expected-build-state thành công.
6. Sau lát này tiếp caller/17 legacy + receipt target/policy/FK → issuer/trust/
   timed health → alerts/admission/budgets/signup/consoles/Linux/DR/E2E/load/RC/pilot.

Giữ nguyên 27 packages / 25 tasks / 70 release cases, 122 releaseAcceptance
unverified và gate L/S/P/U/B. Owner/reviewer/signoff vẫn chưa có tên.
[Artifact đã lọc](../../../artifacts/roomqc-m06-employee-atomic-attempt-local-2026-10-21.json).
