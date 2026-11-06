# RoomQC — parent DELETE/key-update boundary: một vòng A local

Ngày 21/10/2026. **Đạt lát local trong một vòng A; chưa có vòng B trên source này.**
[Plan điều hành](roomqc-vps-signup-preparation-plan-2026-10-21.md) /
[protocol nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md) /
[artifact đã lọc](../../../artifacts/roomqc-m06-parent-boundary-local-2026-10-21.json).

## Kết quả quan sát

Vòng `a65154d44e98` (session 99176) kết thúc exit 0; runner báo cleanup 18
owned objects và ownership.cleaned=true. Áp 533 migrations. Source scoped 662
files, SHA256 `32917b3fc123ecf9fcbfd9aef722839b2001fa2442c83f793d1b755c3aa5dd35`.
Fingerprint được chụp sau khi A bắt đầu và tính lại không đổi tại handoff; không
phải immutable snapshot toàn repo tại lúc launch.

| Phép kiểm | Kết quả | Giới hạn |
|---|---|---|
| 22 FK có child fixture thật × 4 actor × DELETE/key UPDATE | 176 denials, findings=0, missingFixtures=0 | SQL actor assumption; không chứng minh mọi API path |
| DELETE | 84 permission-denied, 2 policy-filtered, 2 receipt-FK refusal | Không phải mọi DELETE hợp lệ đều bị cấm |
| Primary-key UPDATE | 82 permission-denied, 4 policy-filtered, 2 actual-parent-FK refusal | Không kiểm mọi column UPDATE |
| Snapshot | 32 bảng không đổi sau rollback | Sequence gaps được cho phép |
| Trusted service tenant cascade | 5 nhóm fixture đều không rỗng, cascade đúng rồi rollback | Không phê duyệt offboarding production |
| Actual REST hotel regression | 20 nhãn; owner xóa unbound hotel có room draft làm draft cascade; bound receipt giữ nguyên | Không có UI/browser E2E |
| Receipt/session races | Hai thứ tự khóa thật đạt | Trong contract/race fixture đã nêu |
| Full control DB session 27670 | Kết thúc exit 0 | Không giữ aggregate count ở handoff; không báo 171 dự kiến như số đo |
| Advisors | 604 = 17 no-policy + 8 FK + 444 unused-index + 135 permissive-policy | Chưa clean; unused giảm không phải proof tối ưu |

Source-hash riêng của parent harness:
`b0b4a8273277b0fb69e3c8ffbec78996c99c06f514c070d71d8b09ad814af9b0`.
B phải tham chiếu đúng ownership của A thành công/cleaned và cùng harness hash.
Run DELETE-only `5355645caa5e` và hotel-fix A/B trước đó là lịch sử trên source
khác, không thay B hiện tại.

## Không được suy rộng

- Chưa hoàn tất disposition gián tiếp cho cả 17 target hoặc mọi RPC/view/trigger.
- Chưa review xong OR semantics của 135 policy warnings và workload của 8 FK.
- Chưa có B hiện tại, reviewer độc lập, Linux/TLS/DR, browser/Android, tải hay pilot.
- Không sửa implementation, chạy suite mới hoặc deploy trong lượt cập nhật plan này;
  chỉ nhận terminal của hai run đã có và đối chiếu owned state/source.
- Không có business/CRM DB, provider thật, DNS/email/public signup/billing mutation.

## Việc kế tiếp

1. Khi nhận triển khai: freeze source, chạy B với expected-build-state của A;
   kiểm source/schema/image/bundle/harness hash, advisors và cleanup.
2. Đóng phiếu từng target cho direct lẫn indirect paths, positive/negative và
   side effects đúng contract; đường chưa chứng minh giữ unresolved.
3. Policy OR semantics → FK workload/EXPLAIN → issuer/release trust →
   revision-atomic health/timed pipeline; tiếp tục mọi đợt VPS/signup còn lại.

Giữ đủ 27 gói/25 bước/70 case; 122 releaseAcceptance và L/S/P/U/B không đổi.
Không coi việc lưu report/plan là release signoff.
