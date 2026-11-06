# RoomQC — Auth build repeatability và config fault diagnostic local

Ngày 22/10/2026 (Asia/Bangkok). Phạm vi toàn bộ VPS + signup; đây là tiến bộ
trong EC05/T01/T03/T04/T08, không thu hẹp mục tiêu thành password và không nghiệm thu release.

## 1. Kết luận và evidence

[Artifact đã lọc](../../../artifacts/roomqc-m06-password-build-config-local-2026-10-22.json).
Candidate **717 files / 540 migrations**, source trước/sau run không đổi:
`b25f3a9c98774c9faada4f3218b0177ab95c483a9f427f8e6a7f07157864cdb8`.
Hai build độc lập không cache c803d7e906d1 và actual Auth diagnostic c3048071d3e0
đã terminal exit 0; diagnostic stderr 0. Dọn 13 đối tượng; kiểm Docker theo exact
run label còn 0 container/network/volume. Không đổi serving/CRM/VPS/DNS/provider/email thật.

| Bộ chứng minh | Actual result | Giới hạn |
|---|---|---|
| Hai build từ hai checkout riêng, --no-cache | Cùng image ID, binary hash, config hash, thời gian, 7 layer identities | Chỉ builder/platform đã ghi; không là T21 hai backend đồng thời |
| Actual diagnostic dùng đúng image đó | 33/33 identities/expected gốc giữ nguyên | Không thay full integrated A/B |
| Fault/receipt/concurrency trước đó | 7/7 checks và 4/4 revocation races giữ đạt | Matrix cũ có phạm vi, không mọi role/workflow |
| Compiled application engine | 7/7 actual caller checks giữ đạt | Adapter503 không phải real loss-before-headers/browser/Android |
| Cấu hình/helper/grant/contract mới | 7/7 faults; cả 7 no-effect và restoration-positive | Wrong-image/version Linux deployment preflight còn mở |
| Full control/database | 209/209, 0 fail/skip/cancel, exit0/stderr0 | Không thay actual backend/E2E |
| Structural backend tests | 10/10, subset của209 | Không cộng thành219 hoặc coi source match là API proof |

FE128, TypeScript và targeted lint ở caller report là lịch sử; không rerun trong
lượt này và không gán cho full candidate717.

## 2. Build thay đổi gì và đã chứng minh gì

Chỉ thay quy trình đóng gói; Go extension logic và patched native UserUpdate
không đổi. Builder/runtime vẫn digest pin, upstream Auth vẫn exact commit
4eee58f296d9698a1c2c0ae14d7a0b379c7622d3. Không upgrade vendor để làm test xanh.

- Cố định linux/amd64 và SOURCE_DATE_EPOCH=1788964129 từ đúng commit, kiểm lại
  git timestamp trong mỗi checkout.
- Chuẩn hóa mtime binary; exporter rewrite-timestamp=true, unpack=false;
  provenance=false cho phép so sánh local reviewed image.
- Inspect image phải đúng source label/platform/created; checksum binary trong
  container read-only/network-none. Không fallback mutable tag khi invariant sai.
- Build A/B không cache và không chia checkout; so cả source/patch/config/layers/
  binary/image. Diagnostic rebuild kế tiếp cũng khớp exact image.
- Runner full vẫn yêu cầu A/B cùng exact immutable image ID, không nới assertion.

Image: `sha256:5501a98d4819812bca0acdf2a28677bf5779ae4e34ab2e11f021320b8e5da7c8`.
Binary: `9f6501e192deac775cebfd5ff2d1781ba11d95190bc428ea53bdc9b8c128f2d1`.
Actual binary của image715 cũ được kiểm read-only và có cùng hash; điều này không
chứng minh nguyên nhân khác image705/706 vì không còn hai image đó để so sánh.

Hai failed build attempts giữ trong artifact: epoch-only vẫn khác layer cuối;
rewrite lần đầu bị BuildKit từ chối vì unpack. Sau khi đọc đúng source BuildKit
v0.27.1, tách unpack và hai build mới đạt. Không sửa failed evidence thành pass.
Đây là repeatability trên builder hiện tại, chưa global hermetic/reproducible
release proof, registry digest, upstream full test hoặc supply-chain approval.

## 3. Config faults và effects thực

Hai Auth instance fault dùng cùng exact image với instance chính, cùng fixture
DB nhưng khác fixed internal aliases; không publish port, chỉ network nội bộ.
SQL faults chỉ trên disposable owned DB. Mỗi case set forced flag, chụp snapshot,
gây lỗi, gọi native Auth PUT, phục hồi trong finally và đối chiếu hash/session/
audit/flag/receipt; sau đó đổi password thật thành công với exact-session receipt.

| Fault | HTTP expected/actual | No effects | Phục hồi positive |
|---|---|---|---|
| Required-current-password tắt | 503/503, guard unavailable | Đạt | Đạt |
| Postgres audit tắt | 503/503, guard unavailable | Đạt | Đạt |
| begin helper thiếu | 500/500 | Đạt | Đạt |
| begin EXECUTE bị thu hồi | 500/500 | Đạt | Đạt |
| complete helper thiếu | 500/500 | Đạt | Đạt |
| complete EXECUTE bị thu hồi | 500/500 | Đạt | Đạt |
| complete trả JSON contract không hợp lệ | 500/500 | Đạt | Đạt |

500/503 là config/infrastructure failure, không gọi là permission-denial pass.
Helper/grants/definition phục hồi; schema fingerprint trước/sau diagnostic khớp.
Password/token/hash thật không nằm trong public evidence; snapshot chỉ xuất booleans.
New harness/default full và password-guard diagnostic cùng dùng suite này;
full reference phải có configuration.verified và source hash trùng.

## 4. File triển khai và kiểm chứng

- deploy/auth/password-guard/Dockerfile
- scripts/control-backend-password-auth.mjs
- scripts/test-control-password-auth-build.mjs
- scripts/control-backend-password-config-checks.mjs
- scripts/control-backend-password-checks.mjs
- scripts/test-control-backend-sandbox.mjs
- server/control/backend-password.test.mjs

Implementation chỉ ở integration. Primary chỉ nhận report/artifact/plan/ledger đã
lọc; không commit/reset/merge hoặc đưa code vào serving. Không có migration mới.

## 5. Nhận việc kế tiếp và gate

1. EmailAuthFlow invitation/recovery còn SDK-only; inventory expected, dùng exact
   actor/session + operation/receipt contract, không completion từ boolean client.
2. Full invitation/pre-profile/offboarding/recovery và hai thứ tự lock có observed
   barriers; khác thứ tự lock hiện chỉ source concern, chưa xác nhận deadlock.
3. Actual pre-header response-loss và browser durable/multi-tab/Android proof;
   config/helper faults của lượt này đã có scoped actual proof, không giao lại.
4. Fresh full frozen-source A/B/control/FE/advisors/final recovery/cleanup. Giữ
   280 scope/1.764 actor/20 races + employee30/4 + self66/4/Storage/parallel.
5. Effective permissions/membership → invitation/legacy Edge/full workflow →
   indirect/policy/FK → issuer/trust/timed health → alerts/admission/budget →
   signup/reconcile/abuse → consoles → Linux/DR/oncall → simultaneous A/B/E2E/load/RC →
   pilot ≥7 ngày. Giữ đủ tám đợt/27 packages/25 tasks/70 cases.

122 releaseAcceptance vẫn unverified; gate L/S/P/U/B, named reviewer và signoff
không đổi. Local image chưa là registry release. Không deploy hoặc mở signup từ
diagnostic này. Secret/quyền external defer đúng bước, không tính là pass.

## 6. Tài liệu tham chiếu

- [Caller diagnostic trước đó](roomqc-m06-password-caller-local-2026-10-22.md)
- [Plan điều hành](roomqc-vps-signup-preparation-plan-2026-10-21.md)
- [Phiếu nhận việc](roomqc-vps-signup-launch-checklist-2026-10-21.md)
- [Protocol nghiệm thu](roomqc-vps-signup-acceptance-protocol-2026-10-21.md)
- [ADR native transaction](../adr/roomqc-native-password-transaction-boundary.md)
- [Docker reproducible builds](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)
- [BuildKit v0.27.1 exporter](https://github.com/moby/buildkit/blob/v0.27.1/exporter/containerimage/export.go)
