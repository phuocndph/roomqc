# RoomQC — password adversarial attempt: barrier chưa đủ bằng chứng

Ngày 22/10/2026. Run23959c4b6436/session90329 **exit1**, stderr0/cleaned11.
[Artifact](../../../artifacts/roomqc-m06-password-adversarial-attempt-local-2026-10-22.json).
Source706/539 đã khóa trước launch và sau terminal khớp:
492989328bdb035616a6f1f7d7d3c07cddc1e33dec63c9a5cb18e2c5a5a89f6c.

Giữ33/33 expected cũ đạt. Sáu checks thực đã đạt: private ACL; completion fault
500 và audit fault500 rollback hash/session/audit/flag/receipt; actual abort phần
đọc body sau headers và receipt readback; receipt của actor khác bị ẩn; reuse ID
409/no effects. 500 ở hai fault là lỗi chủ động, **không** tính permission deny.

Dừng ở same-old-password-concurrency: OWNED_PASSWORD_BARRIER, chưa ghi stale
snapshot outcome, races0. Helper chỉ đếm waiter trực tiếp của một PID; cần xác
minh graph blocking (cả soft/transitive blockers) và observed response statuses,
không bỏ barrier/đổi expected chỉ để xanh. Chưa xác nhận đây là lỗi sản phẩm.

Coverage boolean stalePasswordSnapshot=true ở output cũ là unconditional dù
check chưa tới; không dùng flag này làm proof. New harness phải suy coverage từ
checks/races đã quan sát. Giữ artifact này bất biến, không dùng làm A reference.

Full control DB trên candidate này session87298:206/206,0 fail/skip,exit0.
Không thay Auth concurrency/E2E/full A/B. Final permission recovery/advisors chưa
chạy trong diagnostic; schema readback trong artifact chỉ scope này.
Giữ gate/122 releaseAcceptance và toàn bộ8 đợt không đổi.
