# Phục hồi qua hai API — native local, 29/10/2026

Đã bổ sung kiểm thật cho5 nhóm execute/register/alert/recheck/legacy qua **hai tiến trình API Linux riêng**, cùng directory, poolMax1 mỗi API. Mỗi nhóm có expired recovery, mất phản hồi sau commit, result/replay qua API còn lại và thu hồi canonical role. Không dùng Auth/receipt double cho các bài mới.

Nguồn 339 tệp, SHA256 `6b0df534157d10b9c1720ee6d7a631659a2fe4176402f64af36debb339d881ad`; run `421371f40655`; 587 business/21 directory migrations. [Packet đã lọc](../../../artifacts/roomqc-support-replicas-runtime-421371f40655-local-2026-10-29.json).

| Kiểm | Actual |
|---|---|
| Toàn native support diagnostic | 173/173 kiểm cơ chế đạt; 71 barrier witnesses; 10 API SIGKILL; exit0 |
| Riêng matrix hai API | 17 logical checks;5 nhóm ×3 tình huống; PID riêng, PostgreSQL backend PID riêng và blocker/waiter thực |
| Control cùng nguồn | 534 pass,0 fail,205 skip/739 tổng; exit0 |
| Directory regression trước |173/173 trên source338; không nhận là run mới trên339. Delta hiện tại chỉ5 tệp native harness, không thay runtime/migration/test directory |

Expired: giữ HTTP sau canonical Auth commit đến khi request gốc rollback bởi deadline; quan sát hết hạn bằng DB time; SIGKILL/restart API chính; giữ leader trước INSERT consumption, gửi cùng key/body qua API thứ hai và quan sát backend đó thực sự chờ leader. Nhả barrier: một intent,2 attempt có predecessor,1 closure,1 result,1 parent,1 consumption; receipt cũ bất biến. Nhả phản hồi cũ sau generation1 rồi tra/replay không đổi lịch sử.

Commit loss: drop response sau directory commit; API thứ hai tra result, cả hai API retry cùng key. Không thêm acceptance/generation/audit/effect. Alert còn kiểm đúng1 event và1 outbox; register/recheck kiểm parent và audit tương ứng; legacy giữ cùng action. Snapshot đầy đủ11 bảng nghiệp vụ trước/sau không đổi.

Revoke: sau Auth orphan, xóa đúng canonical super_admin role fixture; cả hai API recovery và result đều bị từ chối; journal không đổi. Khôi phục nguyên dòng fixture với cùng UUID/thời gian, không cấp quyền từ JWT metadata.

Lịch sử thất bại giữ nguyên: run `a973c305cc9f`,exit1 đã đi qua các subchecks nhưng trượt snapshot cuối vì fixture khôi phục role bằng defaults. Sửa fixture lưu/khôi phục đúng dòng; không bỏ bảng hoặc nới assertion. Run thay thế trên nguồn mới đạt. Hai run đều có kiểm cleanup độc lập:0 container/volume/network thuộc đúng label. Directory role baseline khôi phục; source/schema đầu–cuối khớp.

## Giới hạn và nhận tiếp

- Đây là diagnostic fresh schema trên một PostgreSQL host, release/health fixture; chưa VPS, A/B, full-default/rebuild hoặc nghiệm thu sản phẩm.
- Hai API đang dùng protocol hiện tại. Barriers được chứng kiến ở consumption sau khi generation1 được ghi bền vững; chưa thay bài chặn ngay no-effect/generation publication hoặc writer app cũ không hiểu journal. Không nhận toàn RX03–RX11 từ matrix này.
- Chưa worker claim→RPC→business commit→directory settle, populated business585/586→587 và directory20→21, security disposition. Advisors vẫn có247 WARN multiple_permissive_policies cần review; không coi tổng findings là số lỗi đã xác nhận.
- 205 skip không thành pass. Không cộng cơ chế/test suite thành số hành trình khách hàng.

Nhận tiếp worker/fault windows và populated upgrade/security để khép BG02; BG03–BG11 còn giữ nguyên.122 release entries, actual/reviewer/signoff/gates không đổi. [Hồ sơ toàn mục tiêu](roomqc-vps-signup-execution-dossier-2026-10-29.md).
