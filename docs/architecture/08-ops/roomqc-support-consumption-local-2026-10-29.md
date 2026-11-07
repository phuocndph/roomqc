# RoomQC — kiểm tích hợp biên nhận quyền trong lệnh quản trị local

Ngày 29/10/2026. Run `331212d94761`, source331/hash `a700ff658818a1f0b8b43420cf120d93768f0fedc34b8b3de32f56a7d7a5ef1f`. Đây là diagnostic local; toàn bộ VPS + signup và R11/BG02 vẫn chưa nghiệm thu. Dữ liệu đang phục vụ không được dùng làm fixture.

| Phạm vi | Kết quả và giới hạn |
|---|---|
| Native canonical Auth/REST/HTTP/PostgreSQL | 104/104 controls, 28 barriers, 1 API SIGKILL; 14 revoke scenarios, 20 Auth acceptance checks và 9 nhóm consumption. Witness/barrier được tính trong 104; đây không phải 104 luồng kinh doanh độc lập |
| Directory DB thật | 160/160, 0 skip, exit0; gồm nâng cấp legacy, phân quyền, lease, audit/transaction/replay và fixture mới |
| Full control | 719 tổng, 527 pass/0 fail/192 skip, exit0. Skip không là pass; directory160/160 là lượt opt-in riêng, không cộng chồng để suy mức hoàn tất |
| Migrations | 587 business/20 directory; business chain `de3d799ea5742cfdcc91dae3abac6839c953758c539e1bcdc280a92d120819d5`. Full-body/history rollback586 và587 bằng SQLSTATE22012 giữ schema/grants/function; chưa là populated upgrade |
| Source và schema | Hash đầu–cuối native khớp; schema `5f71f1b67e698fc238a11bdcbdc4a6b8ac48fddc8c4eeb057f059a95ecc92951` giữ nguyên; directory role baseline phục hồi |
| Cleanup độc lập | Container/network/volume của failed run f2452e57283f và run 331212d94761 đều0; container của ba lượt directory cũng0, theo exact labels |

## 1. Điều đã được chứng minh

1. JWT operator thật đi qua canonical Auth RPC rồi ghi consumption gắn original command/effect/audit cùng transaction. Actor/session/attempt/audience/operation/target/exact key/hash được đối chiếu với Auth receipt; retry không tạo effect mới.
2. API LOGIN thực không sửa/xóa/truncate receipt hoặc đổi directory identity. Reuse/parent/scope/audience sai bị constraint/trigger/grant chặn. Runtime verified gateway là nguồn authority; DB không tự xác minh mật mã một JSON receipt tùy ý.
3. TCP drop sau Auth commit làm rollback directory; retry cùng key/body còn hạn dùng đúng original receipt ID/expiry. SQL fault lúc insert consumption làm rollback effect/command/audit; retry hợp lệ chỉ có một effect.
4. Pause tại INSERT consumption, Auth đã commit rồi mới revoke profile/role/session. Exact command đã nhận có thể hoàn tất trong cửa sổ gốc; lệnh mới và replay/read sau revoke bị chặn. Đây là semantics đang triển khai để review, chưa là cam kết mọi ghi dừng tức thì hoặc distributed transaction.
5. Đợi canonical session expiry trong khi directory đang block; nhả barrier trả SUPPORT_ACCEPTANCE_EXPIRED và rollback, không có command/effect/audit/consumption thành công.
6. Fixture directory dùng explicit provider double, được tách khỏi native Auth proof. Nâng cấp legacy giữ các field cũ, hai context field mới NULL và không tạo receipt giả.

## 2. Failure được giữ lại

- Directory r1: 158 pass/2 fail; legacy assertion chưa tính hai cột NULL mới và HTTP alert fixture thiếu provider. Sửa fixture, giữ nguyên kỳ vọng bảo toàn dữ liệu; focused2/2 rồi full160/160.
- Native f2452e57283f: exit1 tại bài SQL fault vì test chờ HTTP500, trong khi contract app trả503/CONTROL_UNAVAILABLE. Migration587 và SQL rollback checks đã đạt. Sửa kỳ vọng, bổ sung kiểm mã lỗi và zero effects; run 331212d94761 exit0. Giữ failure và proof của từng nguồn riêng.

## 3. Còn lại để khép R11 và toàn bộ plan

- Hết5giây sau Auth accepted nhưng directory rollback/unknown: cần durable same-key reconciliation và vòng quyền phục hồi được review; không tự renew hoặc đổi key/attempt.
- Legacy reconcile cần client stable intent/result lookup, restart/F5 và fault recovery đầy đủ.
- Worker owner/service authority: claim→RPC→business commit→settle, revoke/lease/late reply/two-worker windows.
- Populated business585/586→587, directory19→20, application rollback tương thích; security graph/advisor disposition. Advisors2.122.0 vẫn có809 findings/247WARN; chạy advisor không thay review rộng.
- Đủ scope cho mọi mutation family rồi review R11/BG02. Sau đó tiếp BG03–BG11: budget/admission/signup/console/full integration/Linux VPS/offsite DR/web+Android/load/cost/RC/pilot≥7ngày. Gate L/S/P/U/B và actual/reviewer/signoff chưa đổi.

[Plan nhận việc](roomqc-vps-signup-execution-dossier-2026-10-29.md#53-thứ-tự-triển-khai-bản-tích-hợp-source330). [Bài nghiệm thu](roomqc-vps-signup-master-acceptance-2026-10-28.md#124-thực-thi-bản-tích-hợp-source330). [Packet đã lọc](../../../artifacts/roomqc-support-consumption-331212d94761-local-2026-10-29.json). Log raw chỉ lưu private tại.local, không phát hành JWT/DSN/key.
