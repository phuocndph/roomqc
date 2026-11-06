# RoomQC — baseline account/session trên năm bảng (21/10/2026)

**Kết luận: High đã tái hiện local, chưa sửa/chưa nghiệm thu release.**

Run e848d32c6a5b / session 88354 kết thúc exit 1 và đã dọn đúng 18 objects.
Backend internal không public port, provider tắt, chỉ dữ liệu tổng hợp.
Source scoped 667 files/534 migrations: f517f624d80561d434cfddaed68016c0a78f1f0448df810e26fdc55dff090434.
Đây không phải full release manifest hoặc runtime đang phục vụ.

## Kết quả thực chạy

- Hotel scope: 280/280 đạt, giữ nguyên danh tính/expected.
- Account/session: đủ 1.764 quan sát, 1.176 positive trước/sau phục hồi đạt.
- **588/588 negative không đạt**: 240 đọc trả dữ liệu, 348 ghi thay đổi dữ liệu thử.
- 12 trạng thái, mỗi trạng thái 49 thao tác: unconfirmed, banned, Auth/profile
  soft-deleted, locked, inactive, status NULL, expired/deleted/wrong/missing session,
  logout thật. Wrong/missing claim dùng khóa issuer của chính sandbox; không phải
  token GoTrue gốc. Các token khác là login Auth thật.
- Bốn nhóm actor owner/hotel manager/department/staff. Chỉ 49 direct-action
  positives đã có proof, không chốt lại task/workflow/capability từ kết quả này.
- Completeness: missing/extra/duplicate/expected-mismatch đều 0.
- Full control DB: 188/188, không skip; 11 focused là subset, không cộng tổng.
- Advisors 605: 17 no-policy, 8 FK, 445 unused-index, 135 permissive-policy.

## Nguyên nhân và hướng sửa

Predicate scope hiện kiểm tenant/hotel/assignment nhưng không xét Auth/profile/
session còn hiệu lực. JWT còn chữ ký hợp lệ vẫn đi qua REST sau khóa/logout.
Đây là baseline quan sát, không chỉ suy từ source. Cần private caller-bound
live-actor lookup, restrictive intersection trên năm bảng, và statement-level
mutation fencing giữ lock order Auth → profile → roles → session → business.
Không cấp browser quyền đọc bảng Auth hoặc mở thêm quyền action.

Giữ artifact baseline bất biến; forward migration mới, đối chiếu đủ 1.764
identities/expected và 280 scope observations, positive/recovery, actual race,
regressions/full control/fresh A/B/advisors/cleanup trước khi đề nghị đóng lát.
Lượt này chưa chứng minh concurrent revoke, full permission/workflow, Linux,
E2E, tải hoặc pilot. Run fail không được dùng làm reference B.

## Bằng chứng

[Artifact đã lọc](../../../artifacts/roomqc-m06-business-actor-baseline-local-2026-10-21.json).
Full observations trong ownership file riêng của run, checksum ghi ở artifact;
không sao chép env/token/password/PII sang tài liệu. Final permission recovery
chưa chạy vì mandatory account-state assertion fail. Các gate L/S/P/U/B và
122 releaseAcceptance không đổi; reviewer còn pending.

