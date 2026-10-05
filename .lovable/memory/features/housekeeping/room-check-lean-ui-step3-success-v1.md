---
name: RoomCheck Lean UI Step 3 + Success v1
description: Trang /rooms/:id/check-lean/review (Step 3) và /success — summary card 3 cell, issue cards "Sửa lại", LeanStates shared (loading/error/save/upload/empty), success countdown undo cho quick path
type: feature
---

# Step 3 Review & Success (Lean)

## Routes
- `/rooms/:id/check-lean/review?type=...&started=...` → `LeanReviewPage`
- `/rooms/:id/check-lean/success?type=...&issues=N&checkId=...&quick=1` → `LeanSuccessPage`

Đăng ký trong `src/App.tsx` (PermissionRoute rooms.update).

## Files
- `src/pages/rooms/LeanReviewPage.tsx` — Step 3
- `src/pages/rooms/LeanSuccessPage.tsx` — Success
- `src/components/rooms/lean/LeanStates.tsx` — shared:
  - `LEAN_TEXT` constants tiếng Việt
  - `LeanLoadingText`, `LeanInlineError`, `LeanFullScreenError`
  - `LeanSaveStatusLine`, `LeanUploadStatusBadge`, `LeanEmpty`

## Review logic
- Đọc draft từ `localStorage` qua `readLeanDraft<DraftShape>(roomId)`.
- Tính counters client-side: `okCount = totalItems - issueCount`, `minibarCount = sum(qty)`.
- Group issues theo `kind` → `itemsDamaged/itemsLost/itemsMissing/itemsConsumed` cho `submit_room_check_lean` RPC.
- Minibar nhập vào `itemsConsumed` với `source: 'minibar'`, `charge_to_guest: true`.
- `notes` chung optional.
- Submit success → `clearLeanDraft(id)` + redirect Success (replace).

## Issue card
- Tên item (16px bold), label tiếng Việt L1, SL, "Tính phí khách" nếu có.
- Thumbnail max 4, badge `+N` nếu nhiều hơn.
- Nút "Sửa lại" 44px → `/inspection?resume=true&edit={itemId}`.

## Lean rules cố ý KHÔNG làm
- Không liệt kê toàn bộ item OK (chỉ count).
- Không có cleaning request block.
- Không signature.
- Không multi-issue/item.

## Success screen
- Title: "Đã gửi kết quả kiểm tra phòng."
- Quick message: "Phòng đã được xác nhận ổn." (issues=0)
- Standard: "{N} vấn đề đã được ghi nhận."
- CTA: Quay về danh sách việc / Xem kết quả vừa gửi.
- Undo countdown 10s **chỉ** khi `?quick=1`. v1: undo redirect về Step 1 (chưa rollback DB) để tránh ghi đè im lặng.

## Shared text (LEAN_TEXT)
Loading/Error/Empty đều tiếng Việt thân thiện cho buồng phòng 50–55 tuổi.

## Cố ý KHÔNG làm
- Toast không phải kênh duy nhất báo lỗi → dùng `LeanInlineError` ngay trên trang.
- Không silent retry.
