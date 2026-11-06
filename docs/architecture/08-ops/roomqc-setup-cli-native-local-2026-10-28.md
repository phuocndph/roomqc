# RoomQC — đối soát CLI với biên nhận và quyền native

Ngày28/10/2026. Checkpoint T02/T03/T10/T12 của [plan tổng thể](roomqc-vps-signup-master-plan-2026-10-28.md). Đây là diagnostic local; chưa nghiệm thu VPS, browser/Android hoặc toàn sản phẩm.

## 1. Kết quả trên cùng mã nguồn

[Native d26120b08994](../../../artifacts/roomqc-setup-cli-native-d26120b08994-local-2026-10-28.json) đạt **184/184 controls**:123 protocol/worker/reader/writer nền,45 API/Auth/process và16 CLI mới. 16 controls CLI gồm3 barrier quan sát được, không phải16 ca release. Nhánh API giữ10 SIGKILL; CLI thêm1 SIGKILL writer. Các nhánh có hai lần mất phản hồi HTTP sau commit và một lần mất phản hồi PG sau ReadyForQuery/commit.

[Hồi quy ddbd6ee77e35](../../../artifacts/roomqc-workspace-recheck-ddbd6ee77e35-local-2026-10-28.json) đạt656 tổng/**654 pass/0 fail/2 skip**,16 ca recheck, exit0. Hai skip là quyền symlink Windows và POSIX file modes; CLI native kiểm mode0600 trong Linux nhưng không tự đóng các test notification/symlink khác.

Cả hai packet khớp **276 file backend**, SHA256 `592e36737b8f89b8e7b905716f00210569c855b75b32534c68324518c60f4d39`; source không đổi trước–sau. Sandbox replay580 migration nghiệp vụ và18 directory migrations; schema fingerprint không đổi. Các directory phục hồi role catalog về baseline; file riêng của CLI đã xóa. Kiểm Docker theo nhãn run độc lập:0 container/volume/network còn lại. Không có migration sản phẩm mới trong lần bổ sung harness này.

## 2. Đã kiểm

| Bài kiểm | Kết quả quan sát |
|---|---|
| Reader CLI thật | Tiến trình đọc private config/DSN/trust/budget/credential, dùng LOGIN reader riêng và receipt qua PostgREST thật; đúng5 nhóm closed,committed_pending,dispatch_pending,active_valid,conflict |
| Chỉ đọc | Directory/business/private dispatch journal trước–sau scan không đổi; report gắn đúng source snapshot |
| Writer và lô được ký | Private writer config, LOGIN riêng/pool1/session cố định, Ed25519 manifest bind source/DB/report/scope/target/budget và5 dòng |
| File đầu ra đã tồn tại | Từ chối, giữ nội dung cũ,0 command |
| Report bị sửa | Từ chối chữ ký/binding trước ghi,0 command |
| Mất phản hồi PG sau commit | Wire proxy giữ response qua ReadyForQuery rồi cắt hai đầu;1 command/audit đã ghi, CLI chưa có result line |
| SIGKILL khi đọc receipt thật | Sau command thứ2 commit, giữ khóa bảng receipt trên business DB; pg_stat_activity chứng minh PostgREST thật đợi khóa rồi SIGKILL writer; chưa có command thứ3 |
| Tiếp tục cùng lô | Cùng manifest/key và output mới hoàn tất5 dòng:waiting_owner,activated,reused_job,no_op,conflict |
| Replay | Đúng5 command bất biến và5 audit; không thêm tenant/hotel/trial/outbox, không thay remote terminal journal |
| Missing receipt | Job cũ vẫn queued/attempts0; không suy ra closed hoặc activate |
| Quyền file và dữ liệu nhạy cảm | Report/result thực mode0600 trên Linux; stdout/report/results không có token/password/owner-input |

Directory rows là fixture SQL có nhãn; user là GoTrue confirmed fixture. Native provision/close tạo bằng chứng nghiệp vụ thật trước scan. Nhánh API trong cùng packet tạo workspace/job/dispatch qua HTTP; không ghép cách chuẩn bị dataset của hai nhánh thành một public signup journey.

## 3. Thay đổi và lịch sử

[Harness CLI](../../../server/control/testing/setup-cli-native.mjs) gọi nguyên CLI reader/writer bằng child processes và file cấu hình riêng; không thay bằng gọi module nội bộ. Dùng database riêng, LOGIN riêng và recovery credential scoped mới của fixture. Batch signer chỉ ở bộ nhớ; đây không là reviewer hoặc credential vận hành.

[Runner](../../../scripts/test-control-backend-sandbox.mjs) dựng bản sao **chỉ những file source đã bind checksum**. Một process network-none copy sang volume Linux exact-owned, kiểm lại checksum rồi kết thúc; process chạy test gắn volume này read-only tại /repository cùng thư viện read-only. Không mount cả checkout hoặc .local/env/git/operational files. Vùng ghi của test chỉ là tmpfs16MiB/0700 riêng; container vẫn read-only/cap-drop/no-new-privileges/internal network. Tạo sẵn thư mục đích trước nested mounts. [Source binder](../../../scripts/control-backend-source-binding.mjs) bổ sung bind budget example dùng trong fixture; snapshot phải khớp đúng source host. Deadline diagnostic900s và từng CLI120s có giới hạn; processTimings trong packet ghi thời lượng thực. Không đổi runtime serving.

Bốn run đỏ giữ lại: [a21734a78b2a](../../../artifacts/roomqc-setup-cli-native-a21734a78b2a-local-2026-10-28.json) dừng trước client vì thiếu mount target trong source read-only; [eb538ed420b0](../../../artifacts/roomqc-setup-cli-native-eb538ed420b0-local-2026-10-28.json) đã qua API controls nhưng dataset cụm CLI thiếu vapidPublicKey bắt buộc; [9b7d038d48b9](../../../artifacts/roomqc-setup-cli-native-9b7d038d48b9-local-2026-10-28.json) qua10 CLI controls rồi vượt hạn quan sát30s ở resume; [7c0b2f120320](../../../artifacts/roomqc-setup-cli-native-7c0b2f120320-local-2026-10-28.json) dừng ở copy vì volume root đã tồn tại. Đã sửa fixture/mount, kiểm riêng thao tác copy từng entry/checksum/read-only trên Docker thành công rồi chạy lại native; public source dùng volume Linux và có process timings. Không chỉ tăng timeout hoặc thay expected. Cả bốn cleanup độc lập0; packet đỏ không được tính là thành công.

Thời lượng thực trên volume Linux: reader3,632s; resume12,841s; replay12,483s. Resume và replay đều hoàn tất dưới hạn30s cũ ở lần chạy này. Đây là thời lượng fixture, chưa là benchmark hoặc SLA; không suy ra sức chứa người dùng từ các con số này.

## 4. Giới hạn và việc tiếp theo

Đã có tích hợp native CLI theo phạm vi trên. Vẫn thiếu installer phát/rotate/revoke credential thật, maintenance DSN/ACL/runtime/resource budget và quy trình chạy lô trên target vận hành được review. Không dùng credential fixture hoặc signed batch fixture cho dữ liệu khách hàng.

Auth được xác minh sẵn; health/signed release/reviewer là fixtures. Cùng host PG chưa là A/B độc lập. Revoke giữa Auth và directory chưa có cam kết atomic xuyên hệ thống. Advisor không chạy lại ở packet này;761 findings/199WARN của [packet API trước](roomqc-setup-api-native-local-2026-10-28.md) vẫn là lịch sử chưa disposition, không phải số đo mới hoặc lỗi đã sửa.

Tiếp theo:installer/rotation/maintenance và chốt hiệu lực revoke;T10 vendor/consumer DSN/rolling overlap/quota/fairness;public signup/email/limiter và console delta;đưa diagnostic vào default suite,freeze candidate/full-default/independent rebuild;rồi Linux VPS/TLS/offsite restore/on-call,A/B,web/Android,tải/soak,RC,pilot≥7ngày. Phần cần khóa/quyền vẫn tổng hợp ở [mục7 của plan](roomqc-vps-signup-master-plan-2026-10-28.md#7-đầu-vào-chờ-quyền-hoặc-quyết-định).

## 5. Chạy lại và nghiệm thu

```powershell
node scripts/test-control-backend-sandbox.mjs --help
node scripts/test-control-backend-sandbox.mjs --run --diagnostic setup-dispatch
node .local/test-workspace-recheck-20261028.mjs --all
node scripts/verify-vps-signup-plan.mjs
```

Verifier cuối chỉ đối chiếu source/packet/tài liệu/cleanup, không chạy lại sản phẩm. [Frontend66 tests/TS/lint](../../../artifacts/roomqc-workspace-recheck-frontend-53e4109dfa35-local-2026-10-28.json) vẫn đúng14 file không đổi, chưa browser/Android E2E.

Ledger/worksheet giữ nguyên: **70ca not_run,122mục unverified,124cặp môi trường**, chưa reviewer/signoff/gate mới. Không deploy, cấp credential vận hành, apply serving DB, bật signup/dispatch hoặc đổi worker replicas. Goal toàn plan tiếp tục active.
