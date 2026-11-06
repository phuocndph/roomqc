# RoomQC — account/session five-table fix: scoped local A/B

Ngày đối chiếu: 21/10/2026. Phạm vi T01/T03/T04/T08; **chưa nghiệm thu release**.

## Kết luận

Candidate scoped **668 files / 535 migrations** đã qua hai rebuild tuần tự:
A f1381bbb5dbe và B e2ab861d76b4, đều exit 0 và cleaned 18 objects/run.
Mỗi run đạt **1.764/1.764 account/session observations**, giữ **280/280 hotel-scope
observations**, cùng **20/20 race controls**. Full control DB **189/189**, không skip;
12 focused là subset, không cộng thành tổng nghiệm thu.

[Bản baseline bất biến](roomqc-m06-business-actor-baseline-local-2026-10-21.md)
ghi 588 negative failures: 240 unauthorized reads và 348 unauthorized writes trên
dữ liệu tổng hợp. Bản sửa làm cả 588 tình huống đó đạt, đồng thời giữ 1.176
before/restored positives. Đây không phải full role/action/workflow matrix,
không là chứng nhận phần mềm ổn định, deploy VPS hoặc cho phép public signup.

## Thay đổi đã có trên integration

Forward migration: supabase/migrations/20261021122115_business_live_actor_boundary.sql.

- Private caller-bound boolean helper kiểm Auth/profile/session còn hiệu lực;
  SECURITY DEFINER chỉ cho internal lookup cần thiết, search_path rỗng và
  EXECUTE hẹp. Browser không được cấp quyền đọc Auth tables.
- Năm restrictive ALL policies, cả USING/WITH CHECK, giao với quyền tenant/hotel/
  action hiện có; không thêm action authority.
- Năm BEFORE mutation statement triggers giữ lock order Auth → profile →
  existing roles → session → business rows. Trigger helper không cho gọi trực tiếp.
- 364 policy có trước không đổi/xóa; thêm đúng 5 actor policies (tổng 369).
  Trusted non-browser grants được giữ; chưa chứng minh mọi service-mediated
  endpoint kiểm đúng actor khởi tạo. Không suy direct REST guard thành Edge/API safe.

Đổi account state một mình có thể chưa đủ nếu caller có đường tự sửa state hoặc
service-role endpoint chưa kiểm live actor. Các đường này vẫn thuộc ma trận tiếp
theo, chưa được báo là defect đã tái hiện hoặc fix đã hoàn tất.

## Phạm vi bằng chứng

| Nhóm | Mẫu số mỗi run | Đối chứng |
|---|---:|---|
| Hotel scope | 280 | Giữ identity/expected của bộ scope hiện có |
| Account/session | 1.764 | 12 states × 49 known-positive actions × before/invalid/restored |
| Negative | 588 | Deny/no unauthorized effects; không tính timeout/5xx là đạt |
| Positive | 1.176 | Trước thay state và sau phục hồi vẫn thực hiện được |
| Revocation races | 20 | Owner POST, 5 bảng × 2 states × 2 thứ tự lock |

Bốn fixture: owner, hotel manager, department manager, staff; action counts
17/17/7/8. Không tự mở action để tạo positive. Actual GoTrue login/logout và
re-login recovery; wrong/missing session-claim variants ký bằng issuer của chính
sandbox sở hữu, không gọi đó là token GoTrue nguyên bản. Tập 1.764 identities và
expected không đổi so baseline; missing/extra/duplicate/contract mismatch đều 0.

Race chỉ bao phủ owner POST trên rooms/items/inventory_transactions/laundry_batches/
maintenance_requests, với profile lock và session deletion. Có pg_blocking_pids
barriers thực: revoke-first thì deny/no effect; mutation-first hoàn tất trước
revoke, request kế tiếp bị chặn; restore-positive đạt. Không chứng minh mọi
role/PATCH/DELETE/workflow hoặc hủy GET/stream đang trả dữ liệu.

Catalog kiểm helper privilege/search_path, đúng năm policies và năm statement
triggers đã qua trong harness. Receipt/hotel-delete, parent-boundary, lifecycle,
registration/access, email-admin/provider và final permission recovery đều qua.
11 service-probe rounds không thay timed collector→health→admission proof.

## Candidate và repeatability

Source SHA256:
408cfebe177458628759803d164f8239729f89212e90ab783d31c7b6b38d52bd.

Schema SHA256:
afa593152831d01707131d6427f03c0fc5d5a7a0b83239b71d92b730ffbc9eba.

Manifest là scoped source, không phải whole-release manifest. Đã recompute trước
A/sau A/trước B/sau terminal B không đổi. B dùng successful cleaned A làm
expected-build reference. Schema/migration/harness/image digests, compiled
email/lifecycle/provider/functions builds và initialization/partition invariants
khớp. Observation identity/expected/pass A/B cũng khớp. Raw generated Compose
bundle hash chứa identity/path theo run nên không là invariant equality; không
coi khác hash này là schema drift. Hai rebuild tuần tự **không thay T21 đồng thời**.

Advisors giữ 605: 17 no-policy, 8 unindexed FK, 445 unused-index, 135 permissive.
Không drop index theo count hoặc coi warning không tăng là policy đã an toàn.

## Cleanup, evidence và phần chưa đóng

Ba run baseline/A/B đều cleaned; truy vấn container/network/volume theo đúng
project label đều rỗng sau terminal. Không đụng runtime doanh nghiệp/CRM/8082,
không deploy, không đổi DNS/provider/email thật.

[Artifact đã lọc](../../../artifacts/roomqc-m06-business-actor-fix-local-2026-10-21.json)
giữ run/session/exit/ownership hashes và phạm vi. Raw observations/catalog chỉ ở
thư mục private .local của runner; không copy fixture.env/token/password/PII.

Chưa đóng: full role/task/capability/workflow/RPC/Edge paths, 17-target indirect,
135-policy allowed rows, 8-FK workload; issuer/trust/atomic timed health; alerts/
admission/budget; signup/status/resume/reconcile/abuse/email; hai console; Linux/
TLS/offsite restore/on-call; simultaneous A/B, browser/Android E2E, tải/RC và pilot
≥7 ngày. Hai quan sát MCP Linux/issuer vẫn chỉ là source-review candidates.

Reviewer độc lập chưa ký. Giữ 27 gói/25 task/70 case, **122 releaseAcceptance
unverified**, mọi gate L/S/P/U/B không đổi. Tiếp tục theo
[kế hoạch](roomqc-vps-signup-preparation-plan-2026-10-21.md#152-phiếu-nhận-việc-tiếp-theo-có-điểm-dừng-rõ);
không làm lại bản sửa đã có proof như một việc chưa triển khai.
