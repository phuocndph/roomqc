# RoomQC — thành phần nhận lệnh quản trị tại Auth, kiểm chứng local

Ngày29/10/2026. Phạm vi T02/T03/T08/T12,BG02/R11: sửa điểm chặn harness và kiểm chứng thành phần Auth acceptance đã viết. [Packet kết quả](../../../artifacts/roomqc-support-acceptance-component-4661134f0654-local-2026-10-29.json). Đây là proof thành phần và hồi quy quyền quản trị local; **chưa đóng R11/BG02 hoặc nghiệm thu VPS/signup toàn tuyến**.

## 1. Kết quả và nguồn được kiểm

| Mục | Actual |
|---|---|
| Source backend |327 tệp,`sha256-path-lf-v1`,SHA256 `e45b9fb53499c81fc65e8fd9af426307cf8c312dd698d10ef68f0051a87aa189` |
| Business/directory migrations |586/19; business migration set hash `b08fbd077b14dba8d3e97786b3388d2bc34a7cd6e24638f9f97f0316882854c5` |
| Unit liên quan |8/8 pass,exit0; gồm4 acceptance mới và4 support hồi quy, là tập con của full control |
| Full control |712 tổng,520 pass,0 fail,192 skip,0 cancel; exit0. Skip không nhận đạt |
| Native sandbox |Run `4661134f0654`,90/90 checks,23 barriers quan sát,1 API SIGKILL; exit0 |
| Thành phần Auth acceptance |20 checks,6 interleaving revoke-first/accept-first của profile/role/session; Auth,PostgREST,HTTP,row locks và DB clock thật |
| Hồi quy native quyền đã có |14 kịch bản thu hồi quyền với JWT còn hạn; mutator/read/replay theo checkpoint324 được chạy lại trong cùng run |
| Schema trước/sau native |Cùng `3a826a4ac884a832889b7cc97d0c029833db6db7102cf480abcd0cee4ce23135` |
| Nguồn trước/sau |Runner xác minh không drift; đối chiếu độc lập manifest cuối run khớp snapshot |
| Cleanup |Role baseline phục hồi,16 role fixture được gỡ; runner dọn12 Docker objects. Kiểm label độc lập:0 container,0 network,0 volume cho run mới và run lỗi cũ |

90 checks đã bao gồm20 checks thành phần; không cộng hai số. 23 barriers/1kill thuộc toàn run, không phải23 race hoặc1kill riêng cho Auth acceptance. Hai database trong sandbox dùng cùng PostgreSQL host; chưa chứng minh partition giữa hai host thật.

## 2. Lỗi harness và sửa đổi

Run cũ `c42898431345` dừng tại `sql_replay`,applied0,exit1 vì chuỗi migration kỳ vọng của setup diagnostic chưa có migration acceptance. Chưa có SQL acceptance/native test nào được chạy trong run đó. Giữ nguyên log và lịch sử thất bại.

[Harness](../../../scripts/test-control-backend-sandbox.mjs) nay giữ danh sách suffix chính xác và thêm migration `20261029055817_platform_support_command_acceptance.sql`; không nới assertion để bỏ qua mọi migration mới. Sau585 migration, runner:

1. Lưu fingerprint/schema surface/public privilege matrix.
2. Chạy toàn migration mới và history insert trong transaction, chủ động gây SQLSTATE22012 rồi kiểm rollback.
3. Xác minh schema/table/functions mới và history đều không tồn tại; fingerprint và public privileges giữ nguyên.
4. Áp migration bằng role `postgres`, sau đó chạy native RPC/ACL/lock tests.

Đây là rehearsal rollback từ migration chain585 sang586. **Chưa có fixture nghiệp vụ populated585→586**, chưa kiểm upgrade trên database đang phục vụ. Không sửa migration SQL trong lượt sửa harness này.

## 3. Những invariant đã được kiểm thật

- Ba RPC cùng actor/session/attempt nhận đúng một row/ID/thời hạn; exact key giữ cả chữ hoa/thường. Cùng attempt đổi audience/op/target/key/hash bị từ chối.
- Anon/service JWT không lấy được acceptance; owner giả metadata hoặc profile flag không có canonical super_admin role bị chặn. Account locked/profile inactive/Auth ban/role removed không ghi thêm receipt.
- Private table có RLS,không cấp quyền user/service; public wrapper là invoker,narrow definer nằm trong schema không expose. UPDATE/DELETE receipt bị chặn; receipt giữ lịch sử sau xóa session/gỡ role/khóa profile.
- Revoke-first: giữ row lock khi thay profile/gỡ role/xóa session; RPC acceptance chờ thật, sau revoke commit thì bị từ chối và không có receipt.
- Accept-first: acceptance giữ Auth/profile/role/session locks; revoker thực sự chờ. Auth acceptance commit trước rồi revoke; chỉ receipt cũ còn, acquisition/replay sau revoke bị chặn.
- TCP drop sau Auth commit: cùng attempt đọc lại đúng receipt/ID/accepted/expiry. DB clock tới expiry thì attempt cũ không được renew.
- Trigger audit lỗi rollback receipt; gỡ fault rồi cùng attempt có thể nhận thành công. Không active/idle-in-transaction RPC fixture bị bỏ lại.

Các luồng quản trị hiện hành vẫn dùng live observations; native cũng chạy lại14 kịch bản delayed mutator/read/replay và kiểm invariants. **Chưa có command directory nào tiêu thụ acceptance mới.** Receipt Auth chưa là quyền ghi directory,receipt kết quả hoặc bằng chứng tenant đã tạo.

## 4. Advisor và quyền

CLI2.122.0 trả809 findings:42 INFO RLS-no-policy,8 INFO unindexed-FK,512 INFO unused-index,247 WARN multiple-permissive-policies. Chưa ký an toàn toàn bộ809 finding.

Finding mới xác định được là `INFO:rls_enabled_no_policy` cho `private.platform_support_acceptances`. Thiết kế cố ý không có policy/grant để user/service truy cập table; native xác minh actual denial và chỉ authenticated operator qua RPC hẹp được insert sau canonical checks. Không tạo policy rộng chỉ để xóa INFO. Disposition này chỉ áp object mới; vẫn cần reviewer nhận security graph/upgrade/consumption của protocol tích hợp. Các247 WARN lịch sử chưa được đóng từ kết quả thành phần này.

## 5. Giới hạn và công việc nhận tiếp

1. R11-04: directory identity/audience do server quản lý,unique consumption cùng command/audit/result và binding đầy đủ actor/session/attempt/op/target/exact key/hash. Không nhận receipt tùy ý từ client.
2. Nối mọi mutator bắt buộc,giữ quyền đọc kết quả hiện hành; chốt protocol/version cho lệnh đã nhận trước revoke được hoàn tất. Không báo zero effects sau khi directory đã commit.
3. R11-05/06: claim→RPC→remote commit→settle,late reply/lease/restart/partition/orphan receipt; service chỉ hoàn tất dispatch cũ,không cấp mới hoặc tạo trial lại.
4. R11-07: populated585→586 và directory delta nếu có; graph quyền/fingerprint/resource/lock budget theo nguồn mới. Thời hạn5giây không chứng minh bound cho mọi CPU/IO/deferred COMMIT hoặc toàn bộ job.
5. Review các [subcheck RA01–RA18](roomqc-vps-signup-master-acceptance-2026-10-28.md#12-nghiệm-thu-protocol-r11-và-thành-phần-acceptance-mới) theo phạm vi actual; không nhận cả dòng chỉ từ component. BG06 full-default/rebuild,staging/offsiteDR,E2E web/Android,tải/chi phí và pilot≥7ngày vẫn theo plan.

Chưa chạy lại full directory160-case riêng trong checkpoint này; native đã dùng directory role thật và19 migrations. Không chuyển proof160/160 của source324 sang source hiện tại. Không áp migration vào serving DB,bật public signup hoặc deploy VPS từ run local này.70 ca/124 lượt chính thức,122 release entries,actual/reviewer/signoff/gates giữ nguyên; goal toàn bộ plan còn mở.
