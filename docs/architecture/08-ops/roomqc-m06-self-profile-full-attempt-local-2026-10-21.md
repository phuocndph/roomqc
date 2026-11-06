# RoomQC — lần tích hợp self-profile đầu tiên chưa đạt

Ngày 21/10/2026. Run 18506679973b/session 41364, fullIntegratedRun=true nhưng
exit 1 ở hotel_delete_checks/fixtures; cleaned 18 objects. Không là passing A/B
reference. Candidate 694 files / 538 migrations khóa trước launch, recompute
sau terminal khớp `fa7cb09c6d7ee197aebcea4fb089de44a73d5d4f7dffcae0530ae50c990947e9`.

Provider đã tới verified; hotel-delete chỉ hoàn tất hai setup checks. Fixture
đang dùng token owner PATCH chính users.hotel_id và đòi 200. Self metadata
boundary mới từ chối thao tác quản trị này. Đây là setup/contract mismatch,
không phải receipt DELETE failure hoặc bằng chứng self controls full đã đạt.
Self-profile và final permission recovery chưa chạy. Không sửa failed artifact.

Đối chiếu source: HotelContext đổi khách sạn đang xem bằng user_preferences,
không PATCH users.hotel_id; employee self entry về /profile, chỉ có ba trường
metadata. Primary hotel/membership là contract quản trị riêng. Điều chỉnh dự kiến:
kiểm raw self-PATCH bị từ chối/no effect, sau đó service installer chỉ di chuyển
fixture tổng hợp đúng tenant để giữ nguyên dữ liệu receipt ban đầu và toàn bộ
DELETE/rollback/race assertions. Không mở lại self authority để làm setup xanh.
Thay đổi này phải ghi rõ, không gọi installer là user workflow positive.

Control DB riêng session 85139 đạt 199/199, 0 fail/skip/cancel/todo, exit 0.
Không thay integrated run. FE pre-fix 8 tests có 7 fail/1 pass; nhóm FE liên quan
sau sửa đạt 79/79 (unit/component, không browser/Android). Chưa đủ release proof.

[Artifact đã lọc](../../../artifacts/roomqc-m06-self-profile-full-attempt-local-2026-10-21.json).
Reviewer pending; 122 releaseAcceptance/gates không đổi, không deploy serving/VPS.
